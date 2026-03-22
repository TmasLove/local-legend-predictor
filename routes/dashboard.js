const express = require('express');
const {
  ensureValidToken,
  getRecentActivities,
  aggregateSegmentEfforts,
  getSegmentLegend,
  getSegmentDetails
} = require('../utils/strava');
const { generateShareCard } = require('../utils/imageGen');

const router = express.Router();

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get('/dashboard', ensureValidToken, async (req, res) => {
  try {
    const token = req.user.accessToken;

    // 1. Fetch all activities in the last 90 days (paginated)
    let activities;
    try {
      activities = await getRecentActivities(token, 90);
    } catch (err) {
      if (err.isRateLimit) {
        return res.render('dashboard', {
          user: req.user,
          segments: [],
          error: 'Strava is busy right now. Please try again in a few minutes.'
        });
      }
      throw err;
    }

    if (!activities || activities.length === 0) {
      return res.render('dashboard', {
        user: req.user,
        segments: [],
        error: 'No activities found in the last 90 days. Go ride something! 🚴'
      });
    }

    // 2. Aggregate effort counts per segment
    const allSegments = aggregateSegmentEfforts(activities);
    const top10 = allSegments.slice(0, 10);

    if (top10.length === 0) {
      return res.render('dashboard', {
        user: req.user,
        segments: [],
        error: 'No segment efforts found in your recent activities. Make sure your activities include segment data.'
      });
    }

    // 3. For each top segment, find the Local Legend
    const userId = String(req.user.id);
    const segmentResults = [];

    for (const seg of top10) {
      try {
        // Fetch ranked efforts for this segment (last 90 days)
        const ranked = await getSegmentLegend(token, seg.id, 90);

        let legendName = 'Unknown';
        let legendCount = 0;
        let userCount = 0;

        if (ranked.length > 0) {
          const legend = ranked[0];
          legendName = legend.name || 'Unknown';
          legendCount = legend.count;
        }

        // Find user's own count in the ranked list (more accurate than activity parsing)
        const userEntry = ranked.find(e => String(e.id) === userId);
        userCount = userEntry ? userEntry.count : seg.count; // fall back to aggregated count

        // If legendCount is 0 (API couldn't fetch efforts), fall back to user's own count
        if (legendCount === 0) {
          legendCount = userCount;
          legendName = req.user.name;
        }

        const effortsNeeded = Math.max(0, legendCount - userCount + 1);
        const isLegend = userCount >= legendCount;
        const progress = legendCount > 0
          ? Math.min(100, Math.round((userCount / legendCount) * 100))
          : 100;

        segmentResults.push({
          id: seg.id,
          name: seg.name,
          userCount,
          legendName,
          legendCount,
          effortsNeeded: isLegend ? 0 : effortsNeeded,
          isLegend,
          progress
        });
      } catch (err) {
        if (err.isRateLimit) {
          // Rate limited mid-loop: return what we have so far
          segmentResults.push({
            id: seg.id,
            name: seg.name,
            userCount: seg.count,
            legendName: '—',
            legendCount: '—',
            effortsNeeded: null,
            isLegend: false,
            progress: 0,
            rateLimited: true
          });
        } else {
          // Skip this segment on other errors (e.g. private segment)
          console.warn(`[Segment ${seg.id}] Skipped: ${err.message}`);
        }
      }
    }

    res.render('dashboard', {
      user: req.user,
      segments: segmentResults,
      error: null
    });
  } catch (err) {
    console.error('[Dashboard Error]', err.message);
    if (err.isRateLimit) {
      return res.render('dashboard', {
        user: req.user,
        segments: [],
        error: 'Strava is busy right now. Please try again in a few minutes.'
      });
    }
    res.render('error', {
      user: req.user,
      message: 'Failed to load your segment data. Please try again.'
    });
  }
});

// ── Generate shareable card PNG ───────────────────────────────────────────────
router.get('/card/:segmentId', ensureValidToken, async (req, res) => {
  const segmentId = req.params.segmentId;
  const token = req.user.accessToken;

  try {
    // Re-fetch segment legend data
    const ranked = await getSegmentLegend(token, segmentId, 90);

    let legendName = 'Unknown';
    let legendCount = 0;
    let userCount = 0;

    if (ranked.length > 0) {
      legendName = ranked[0].name || 'Unknown';
      legendCount = ranked[0].count;
    }

    const userId = String(req.user.id);
    const userEntry = ranked.find(e => String(e.id) === userId);
    userCount = userEntry ? userEntry.count : 0;

    if (legendCount === 0) {
      legendCount = userCount;
      legendName = req.user.name;
    }

    const effortsNeeded = Math.max(0, legendCount - userCount + 1);
    const isLegend = userCount >= legendCount;

    // Get segment name
    let segmentName = `Segment #${segmentId}`;
    try {
      const details = await getSegmentDetails(token, segmentId);
      segmentName = details.name || segmentName;
    } catch (_) {}

    const buffer = await generateShareCard({
      segmentName,
      userName: req.user.name || req.user.firstName || 'You',
      userCount,
      legendName,
      legendCount,
      effortsNeeded: isLegend ? 0 : effortsNeeded
    });

    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="local-legend-${segmentId}.png"`
    });
    res.send(buffer);
  } catch (err) {
    console.error('[Card Error]', err.message);
    if (err.isRateLimit) {
      return res.status(429).send('Strava is busy. Please try again in a few minutes.');
    }
    res.status(500).send('Could not generate card. Please try again.');
  }
});

// ── Preview card inline (for the page) ───────────────────────────────────────
router.get('/card-preview/:segmentId', ensureValidToken, async (req, res) => {
  const segmentId = req.params.segmentId;
  const token = req.user.accessToken;

  try {
    const ranked = await getSegmentLegend(token, segmentId, 90);
    let legendName = 'Unknown';
    let legendCount = 0;
    let userCount = 0;

    if (ranked.length > 0) {
      legendName = ranked[0].name || 'Unknown';
      legendCount = ranked[0].count;
    }

    const userId = String(req.user.id);
    const userEntry = ranked.find(e => String(e.id) === userId);
    userCount = userEntry ? userEntry.count : 0;

    if (legendCount === 0) {
      legendCount = userCount;
      legendName = req.user.name;
    }

    const effortsNeeded = Math.max(0, legendCount - userCount + 1);
    const isLegend = userCount >= legendCount;

    let segmentName = `Segment #${segmentId}`;
    try {
      const details = await getSegmentDetails(token, segmentId);
      segmentName = details.name || segmentName;
    } catch (_) {}

    const buffer = await generateShareCard({
      segmentName,
      userName: req.user.name || req.user.firstName || 'You',
      userCount,
      legendName,
      legendCount,
      effortsNeeded: isLegend ? 0 : effortsNeeded
    });

    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    console.error('[Card Preview Error]', err.message);
    res.status(500).send('Could not generate preview.');
  }
});

module.exports = router;

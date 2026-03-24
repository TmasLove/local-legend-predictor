const express = require('express');
const {
  ensureValidToken,
  getRecentActivities,
  getLastYearActivities,
  aggregateSegmentEfforts
} = require('../utils/strava');
const { generateShareCard } = require('../utils/imageGen');

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Pick a motivational message based solely on the user's own data. */
function buildMotivation(current, lastYear, goal) {
  const diff = current - lastYear;

  if (goal > 0) {
    const needed = goal - current;
    if (needed <= 0) return `Goal crushed! You hit ${goal} efforts 🏆`;
    if (needed === 1) return `Just 1 more effort to hit your goal of ${goal}!`;
    return `${needed} more efforts to reach your goal of ${goal}`;
  }

  if (lastYear === 0) {
    if (current >= 10) return `${current} efforts and counting — keep it up! 🔥`;
    return `Great start — ${current} effort${current !== 1 ? 's' : ''} so far!`;
  }

  if (diff > 0) return `${diff} ahead of last year's pace 🔥`;
  if (diff === 0) return `Exactly matching last year's pace — push further!`;
  return `${Math.abs(diff)} more to match last year's ${lastYear} efforts`;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get('/dashboard', ensureValidToken, async (req, res) => {
  try {
    const token = req.user.accessToken;

    // Fetch current 90-day activities and same window last year in parallel
    let currentActivities, lastYearActivities;
    try {
      [currentActivities, lastYearActivities] = await Promise.all([
        getRecentActivities(token, 90),
        getLastYearActivities(token, 90)
      ]);
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

    if (!currentActivities || currentActivities.length === 0) {
      return res.render('dashboard', {
        user: req.user,
        segments: [],
        error: 'No activities found in the last 90 days. Go ride something! 🚴'
      });
    }

    // Aggregate effort counts per segment (user's own data only)
    const currentMap  = new Map(
      aggregateSegmentEfforts(currentActivities).map(s => [s.id, s])
    );
    const lastYearMap = new Map(
      aggregateSegmentEfforts(lastYearActivities).map(s => [s.id, s])
    );

    const top10 = [...currentMap.values()].slice(0, 10);

    if (top10.length === 0) {
      return res.render('dashboard', {
        user: req.user,
        segments: [],
        error: 'No segment efforts found in your recent activities. Make sure your activities include segment data.'
      });
    }

    // Retrieve any saved goals from session
    const goals = req.session.goals || {};

    const segments = top10.map(seg => {
      const lastYear = lastYearMap.get(seg.id)?.count || 0;
      const goal     = goals[seg.id] || 0;
      const progress = goal > 0
        ? Math.min(100, Math.round((seg.count / goal) * 100))
        : 0;

      return {
        id:         seg.id,
        name:       seg.name,
        count:      seg.count,      // current period (last 90 days)
        lastYear,                   // same window last year
        goal,                       // user-defined target (0 = not set)
        progress,
        motivation: buildMotivation(seg.count, lastYear, goal)
      };
    });

    res.render('dashboard', { user: req.user, segments, error: null });
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

// ─── Save / update goal for a segment ────────────────────────────────────────

router.post('/goals/:segmentId', ensureValidToken, (req, res) => {
  const { segmentId } = req.params;
  const target = parseInt(req.body.target, 10);

  if (!req.session.goals) req.session.goals = {};

  if (!isNaN(target) && target > 0) {
    req.session.goals[segmentId] = target;
  } else {
    delete req.session.goals[segmentId]; // clear goal if 0 or invalid
  }

  req.session.save(() => res.redirect('/dashboard'));
});

// ─── Shareable PNG card ───────────────────────────────────────────────────────

router.get('/card/:segmentId', ensureValidToken, async (req, res) => {
  const { segmentId } = req.params;
  const token = req.user.accessToken;

  try {
    const [currentActivities, lastYearActivities] = await Promise.all([
      getRecentActivities(token, 90),
      getLastYearActivities(token, 90)
    ]);

    const currentMap  = new Map(aggregateSegmentEfforts(currentActivities).map(s => [s.id, s]));
    const lastYearMap = new Map(aggregateSegmentEfforts(lastYearActivities).map(s => [s.id, s]));

    const segId    = parseInt(segmentId, 10);
    const current  = currentMap.get(segId);
    const lastYear = lastYearMap.get(segId)?.count || 0;
    const goal     = (req.session.goals || {})[segmentId] || 0;

    if (!current) {
      return res.status(404).send('Segment not found in your recent activities.');
    }

    const buffer = await generateShareCard({
      segmentName: current.name,
      userName:    req.user.firstName || req.user.name || 'You',
      count:       current.count,
      lastYear,
      goal,
      motivation:  buildMotivation(current.count, lastYear, goal)
    });

    res.set({
      'Content-Type':        'image/png',
      'Content-Disposition': `attachment; filename="effort-tracker-${segmentId}.png"`
    });
    res.send(buffer);
  } catch (err) {
    console.error('[Card Error]', err.message);
    if (err.isRateLimit) return res.status(429).send('Strava is busy. Try again in a minute.');
    res.status(500).send('Could not generate card. Please try again.');
  }
});

// ─── Preview card inline ──────────────────────────────────────────────────────

router.get('/card-preview/:segmentId', ensureValidToken, async (req, res) => {
  const { segmentId } = req.params;
  const token = req.user.accessToken;

  try {
    const [currentActivities, lastYearActivities] = await Promise.all([
      getRecentActivities(token, 90),
      getLastYearActivities(token, 90)
    ]);

    const currentMap  = new Map(aggregateSegmentEfforts(currentActivities).map(s => [s.id, s]));
    const lastYearMap = new Map(aggregateSegmentEfforts(lastYearActivities).map(s => [s.id, s]));

    const segId    = parseInt(segmentId, 10);
    const current  = currentMap.get(segId);
    const lastYear = lastYearMap.get(segId)?.count || 0;
    const goal     = (req.session.goals || {})[segmentId] || 0;

    if (!current) return res.status(404).send('Segment not found.');

    const buffer = await generateShareCard({
      segmentName: current.name,
      userName:    req.user.firstName || req.user.name || 'You',
      count:       current.count,
      lastYear,
      goal,
      motivation:  buildMotivation(current.count, lastYear, goal)
    });

    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    console.error('[Card Preview Error]', err.message);
    res.status(500).send('Could not generate preview.');
  }
});

module.exports = router;

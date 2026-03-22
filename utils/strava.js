const axios = require('axios');

const STRAVA_API = 'https://www.strava.com/api/v3';
const TOKEN_URL = 'https://www.strava.com/oauth/token';

// ─── Token Management ────────────────────────────────────────────────────────

async function refreshAccessToken(refreshToken) {
  const response = await axios.post(TOKEN_URL, {
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });
  return response.data; // { access_token, refresh_token, expires_at, expires_in }
}

/**
 * Express middleware: ensures the user has a valid, non-expired token.
 * Tries to refresh if expired. Redirects to login on failure.
 */
async function ensureValidToken(req, res, next) {
  if (!req.user || !req.user.accessToken) {
    return res.redirect('/login?msg=Please+log+in+to+continue.');
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = req.user.expiresAt || 0;

  // Refresh if token expires within the next 5 minutes
  if (expiresAt < now + 300) {
    try {
      const newTokens = await refreshAccessToken(req.user.refreshToken);
      req.user.accessToken = newTokens.access_token;
      req.user.refreshToken = newTokens.refresh_token;
      req.user.expiresAt = newTokens.expires_at;
      // Persist updated tokens back into the session
      if (req.session && req.session.passport) {
        req.session.passport.user = req.user;
        await new Promise((resolve, reject) =>
          req.session.save(err => (err ? reject(err) : resolve()))
        );
      }
    } catch (err) {
      console.error('[Token Refresh Failed]', err.message);
      req.session.destroy(() => {});
      return res.redirect(
        '/login?msg=Your+Strava+session+has+expired.+Please+log+in+again+to+continue.'
      );
    }
  }

  next();
}

// ─── API Helpers ─────────────────────────────────────────────────────────────

function stravaClient(token) {
  return axios.create({
    baseURL: STRAVA_API,
    headers: { Authorization: `Bearer ${token}` }
  });
}

function checkRateLimit(headers) {
  const usage = headers['x-ratelimit-usage'];
  const limit = headers['x-ratelimit-limit'];
  if (usage && limit) {
    const [short] = usage.split(',').map(Number);
    const [shortLimit] = limit.split(',').map(Number);
    if (short >= shortLimit * 0.9) {
      throw Object.assign(new Error('RATE_LIMIT'), { isRateLimit: true });
    }
  }
}

// ─── Activities ──────────────────────────────────────────────────────────────

/**
 * Fetch all activities in the last `days` days, paginated.
 * Returns raw activity objects (with segment_efforts).
 */
async function getRecentActivities(token, days = 90) {
  const client = stravaClient(token);
  const after = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  const activities = [];
  let page = 1;

  while (true) {
    const res = await client.get('/athlete/activities', {
      params: { after, per_page: 200, page }
    });
    checkRateLimit(res.headers);

    const batch = res.data;
    if (!batch || batch.length === 0) break;

    activities.push(...batch);
    if (batch.length < 200) break;
    page++;
  }

  return activities;
}

/**
 * Aggregate effort counts per segment from a list of activities.
 * Activities from /athlete/activities don't include segment_efforts details,
 * so we only get segment names from individual activity fetches.
 * Instead we accumulate from the segment_efforts array included in
 * detailed activity objects (fetched separately when needed).
 *
 * For MVP: we use the activity list to get segment IDs and names from
 * the included segment_efforts (available when fetching with include_all_efforts).
 */
function aggregateSegmentEfforts(activities) {
  const segmentMap = new Map(); // segmentId -> { id, name, count }

  for (const activity of activities) {
    const efforts = activity.segment_efforts || [];
    for (const effort of efforts) {
      const seg = effort.segment;
      if (!seg || seg.hazardous) continue;
      const id = seg.id;
      if (!segmentMap.has(id)) {
        segmentMap.set(id, { id, name: seg.name, count: 0 });
      }
      segmentMap.get(id).count++;
    }
  }

  return Array.from(segmentMap.values()).sort((a, b) => b.count - a.count);
}

// ─── Individual Activity Detail ──────────────────────────────────────────────

async function getActivityDetail(token, activityId) {
  const client = stravaClient(token);
  const res = await client.get(`/activities/${activityId}`, {
    params: { include_all_efforts: true }
  });
  checkRateLimit(res.headers);
  return res.data;
}

// ─── Segment Efforts (for finding Local Legend) ───────────────────────────────

/**
 * Fetch all efforts on a segment within the last `days` days.
 * Groups by athlete and returns sorted list: [{ athleteId, athleteName, count }]
 */
async function getSegmentLegend(token, segmentId, days = 90) {
  const client = stravaClient(token);
  const endDate = new Date();
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const fmt = d => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

  const athleteMap = new Map(); // athleteId -> { name, count }
  let page = 1;
  const MAX_PAGES = 5; // cap to avoid hammering the API (1000 efforts max)

  while (page <= MAX_PAGES) {
    let res;
    try {
      res = await client.get(`/segments/${segmentId}/efforts`, {
        params: {
          start_date_local: fmt(startDate),
          end_date_local: fmt(endDate),
          per_page: 200,
          page
        }
      });
    } catch (err) {
      // If the segment efforts endpoint fails (e.g. private segment), break gracefully
      if (err.response && err.response.status === 404) break;
      throw err;
    }

    checkRateLimit(res.headers);
    const efforts = res.data;
    if (!efforts || efforts.length === 0) break;

    for (const effort of efforts) {
      const ath = effort.athlete;
      if (!ath) continue;
      const key = ath.id;
      if (!athleteMap.has(key)) {
        athleteMap.set(key, {
          id: key,
          name: `${ath.firstname || ''} ${ath.lastname || ''}`.trim(),
          count: 0
        });
      }
      athleteMap.get(key).count++;
    }

    if (efforts.length < 200) break;
    page++;
  }

  const ranked = Array.from(athleteMap.values()).sort((a, b) => b.count - a.count);
  return ranked; // first entry is the current local legend
}

// ─── Segment Details ──────────────────────────────────────────────────────────

async function getSegmentDetails(token, segmentId) {
  const client = stravaClient(token);
  const res = await client.get(`/segments/${segmentId}`);
  checkRateLimit(res.headers);
  return res.data;
}

module.exports = {
  refreshAccessToken,
  ensureValidToken,
  getRecentActivities,
  aggregateSegmentEfforts,
  getActivityDetail,
  getSegmentLegend,
  getSegmentDetails
};

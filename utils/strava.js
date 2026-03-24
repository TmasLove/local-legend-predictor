const axios = require('axios');

const STRAVA_API = 'https://www.strava.com/api/v3';
const TOKEN_URL  = 'https://www.strava.com/oauth/token';

// ─── Token Management ─────────────────────────────────────────────────────────

async function refreshAccessToken(refreshToken) {
  const response = await axios.post(TOKEN_URL, {
    client_id:     process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
    grant_type:    'refresh_token',
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

  const now       = Math.floor(Date.now() / 1000);
  const expiresAt = req.user.expiresAt || 0;

  // Refresh if token expires within the next 5 minutes
  if (expiresAt < now + 300) {
    try {
      const newTokens = await refreshAccessToken(req.user.refreshToken);
      req.user.accessToken  = newTokens.access_token;
      req.user.refreshToken = newTokens.refresh_token;
      req.user.expiresAt    = newTokens.expires_at;
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
        '/login?msg=Your+Strava+session+has+expired.+Please+log+in+again.'
      );
    }
  }

  next();
}

// ─── API Helpers ──────────────────────────────────────────────────────────────

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
    const [short]      = usage.split(',').map(Number);
    const [shortLimit] = limit.split(',').map(Number);
    if (short >= shortLimit * 0.9) {
      throw Object.assign(new Error('RATE_LIMIT'), { isRateLimit: true });
    }
  }
}

// ─── Activities ───────────────────────────────────────────────────────────────

/**
 * Fetch all of the authenticated athlete's activities between two Unix timestamps.
 * Paginated, returns raw activity objects (which include segment_efforts).
 *
 * @param {string} token
 * @param {number} after  – Unix timestamp (seconds)
 * @param {number} before – Unix timestamp (seconds), omit for "now"
 */
async function getActivitiesInPeriod(token, after, before = null) {
  const client     = stravaClient(token);
  const activities = [];
  let page = 1;

  while (true) {
    const params = { after, per_page: 200, page };
    if (before) params.before = before;

    const res = await client.get('/athlete/activities', { params });
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
 * Convenience: fetch activities from the last `days` days (current window).
 */
function getRecentActivities(token, days = 90) {
  const after = Math.floor(Date.now() / 1000) - days * 86400;
  return getActivitiesInPeriod(token, after);
}

/**
 * Convenience: fetch activities from the same `days`-day window, one year ago.
 * e.g. if today is March 23 2026 and days=90, this returns Dec 23 2024–March 23 2025.
 */
function getLastYearActivities(token, days = 90) {
  const yearInSeconds = 365 * 86400;
  const now    = Math.floor(Date.now() / 1000);
  const before = now - yearInSeconds;
  const after  = before - days * 86400;
  return getActivitiesInPeriod(token, after, before);
}

// ─── Segment Aggregation ──────────────────────────────────────────────────────

/**
 * Count how many times the authenticated user rode each segment.
 * Only reads segment_efforts from the athlete's own activities — no other athletes.
 *
 * @param {Array} activities – raw Strava activity objects
 * @returns {Array<{id, name, count}>} sorted descending by count
 */
function aggregateSegmentEfforts(activities) {
  const map = new Map(); // segmentId -> { id, name, count }

  for (const activity of activities) {
    const efforts = activity.segment_efforts || [];
    for (const effort of efforts) {
      const seg = effort.segment;
      if (!seg || seg.hazardous) continue;
      const id = seg.id;
      if (!map.has(id)) {
        map.set(id, { id, name: seg.name, count: 0 });
      }
      map.get(id).count++;
    }
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

module.exports = {
  refreshAccessToken,
  ensureValidToken,
  getRecentActivities,
  getLastYearActivities,
  aggregateSegmentEfforts
};

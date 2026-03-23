const express = require('express');
const passport = require('passport');
const axios = require('axios');

const router = express.Router();

// ── Login page ──────────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  const msg = req.query.msg || null;
  res.render('login', { message: msg });
});

// Alias: root redirects to login or dashboard
router.get('/', (req, res) => {
  res.redirect(req.user ? '/dashboard' : '/login');
});

// ── Strava OAuth initiation ──────────────────────────────────────────────────
router.get(
  '/auth/strava',
  passport.authenticate('strava', { approval_prompt: 'auto' })
);

// ── Strava OAuth callback ────────────────────────────────────────────────────
router.get(
  '/auth/strava/callback',
  passport.authenticate('strava', {
    failureRedirect: '/login?msg=Authentication+failed.+Please+try+again.'
  }),
  (req, res) => {
    res.redirect('/dashboard');
  }
);

// ── Logout ───────────────────────────────────────────────────────────────────
// Also deauthorizes the app from Strava so the connected-athlete slot is freed.
// This is the only way to recycle the 10-athlete sandbox limit without
// going through Strava's production review process.
router.get('/logout', async (req, res, next) => {
  const accessToken = req.user?.accessToken;

  // Fire-and-forget Strava deauthorize — don't block logout if it fails
  if (accessToken) {
    axios.post(
      'https://www.strava.com/oauth/deauthorize',
      null,
      { params: { access_token: accessToken } }
    ).catch(err => {
      console.warn('[Logout] Strava deauthorize failed (slot not freed):', err.message);
    });
  }

  req.logout(err => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.redirect('/login?msg=You+have+been+logged+out.');
    });
  });
});

module.exports = router;

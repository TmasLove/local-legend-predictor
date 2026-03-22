const express = require('express');
const passport = require('passport');

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
  passport.authenticate('strava', {
    scope: 'read,activity:read_all',
    approval_prompt: 'auto'
  })
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
router.get('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.redirect('/login?msg=You+have+been+logged+out.');
    });
  });
});

module.exports = router;

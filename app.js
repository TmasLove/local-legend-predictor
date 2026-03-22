require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2');
const axios = require('axios');
const path = require('path');

// Fail fast if required env vars are missing
const REQUIRED_ENV = ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`[Startup Error] Missing required environment variables: ${missing.join(', ')}`);
  console.error('Set them in your Render dashboard under Environment > Environment Variables.');
  process.exit(1);
}

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parser
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'local-legend-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Passport init
app.use(passport.initialize());
app.use(passport.session());

// Strava OAuth Strategy (using passport-oauth2 directly for full params support)
const stravaStrategy = new OAuth2Strategy(
  {
    authorizationURL: 'https://www.strava.com/oauth/authorize',
    tokenURL: 'https://www.strava.com/oauth/token',
    clientID: process.env.STRAVA_CLIENT_ID,
    clientSecret: process.env.STRAVA_CLIENT_SECRET,
    callbackURL: process.env.STRAVA_CALLBACK_URL || 'http://localhost:3000/auth/strava/callback',
    scope: 'read,activity:read_all',
    state: true
  },
  async (accessToken, refreshToken, params, done) => {
    try {
      // Fetch athlete profile from Strava
      const { data: athlete } = await axios.get('https://www.strava.com/api/v3/athlete', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const user = {
        id: athlete.id,
        name: `${athlete.firstname} ${athlete.lastname}`.trim(),
        firstName: athlete.firstname,
        lastName: athlete.lastname,
        photo: athlete.profile_medium || athlete.profile,
        accessToken,
        refreshToken,
        expiresAt: params.expires_at
      };
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
);
stravaStrategy.name = 'strava';
passport.use(stravaStrategy);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Routes
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/dashboard'));

// 404
app.use((req, res) => {
  res.status(404).render('error', {
    message: 'Page not found.',
    user: req.user || null
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(500).render('error', {
    message: err.message || 'Something went wrong. Please try again.',
    user: req.user || null
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Local Legend Predictor running at http://localhost:${PORT}`);
});

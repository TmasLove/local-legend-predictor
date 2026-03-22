require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const StravaStrategy = require('passport-strava-oauth2').Strategy;
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

// Strava OAuth Strategy
passport.use(new StravaStrategy(
  {
    clientID: process.env.STRAVA_CLIENT_ID,
    clientSecret: process.env.STRAVA_CLIENT_SECRET,
    callbackURL: process.env.STRAVA_CALLBACK_URL || 'http://localhost:3000/auth/strava/callback'
  },
  (accessToken, refreshToken, params, profile, done) => {
    const user = {
      id: profile.id,
      name: profile.displayName || `${profile._json.firstname} ${profile._json.lastname}`,
      firstName: profile._json.firstname,
      lastName: profile._json.lastname,
      photo: profile._json.profile_medium || profile._json.profile,
      accessToken,
      refreshToken,
      expiresAt: params.expires_at // Unix timestamp (seconds)
    };
    return done(null, user);
  }
));

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

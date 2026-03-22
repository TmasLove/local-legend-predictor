# Local Legend Predictor 🚴

See exactly how many more Strava efforts you need to claim (or defend) the Local Legend title on your favourite segments — and share a beautiful card to Instagram.

---

## Features

- **Strava OAuth login** with automatic token refresh
- **Top 10 segments** from the last 90 days, ranked by your effort count
- **Local Legend comparison** — see the current leader's count vs yours
- **Progress bar** per segment
- **Shareable PNG card** generated server-side with `node-canvas`

---

## Prerequisites

- Node.js ≥ 18
- A Strava API application ([create one here](https://www.strava.com/settings/api))
- `canvas` requires system libraries on Linux:
  ```bash
  # Ubuntu / Debian
  sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
  # macOS (via Homebrew)
  brew install pkg-config cairo pango libpng jpeg giflib librsvg
  ```

---

## Setup

### 1. Clone & install

```bash
git clone <repo-url>
cd local-legend-predictor
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```
STRAVA_CLIENT_ID=<your Strava app client ID>
STRAVA_CLIENT_SECRET=<your Strava app client secret>
STRAVA_CALLBACK_URL=http://localhost:3000/auth/strava/callback
SESSION_SECRET=<any long random string>
PORT=3000
```

### 3. Configure your Strava app

In your [Strava API settings](https://www.strava.com/settings/api):

- **Authorization Callback Domain**: `localhost`
- **Website**: `http://localhost:3000`

### 4. (Optional) Add branding logo

Drop your `tomcat.png` file into `public/images/tomcat.png`. It will appear on the generated share cards.

### 5. Run

```bash
# Production
node app.js

# Development (auto-restart)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment (e.g. Render / Railway / Fly.io)

1. Set all environment variables from `.env.example` in your hosting dashboard.
2. Update `STRAVA_CALLBACK_URL` to your public URL, e.g.:
   ```
   STRAVA_CALLBACK_URL=https://your-app.onrender.com/auth/strava/callback
   ```
3. Update the **Authorization Callback Domain** in your Strava app settings to match.
4. On Linux hosts, ensure the `canvas` native dependencies are available (see Prerequisites).

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `STRAVA_CLIENT_ID` | Strava app Client ID | *required* |
| `STRAVA_CLIENT_SECRET` | Strava app Client Secret | *required* |
| `STRAVA_CALLBACK_URL` | OAuth callback URL | `http://localhost:3000/auth/strava/callback` |
| `SESSION_SECRET` | Session signing secret (keep private) | *required in prod* |
| `PORT` | Port to listen on | `3000` |

---

## Strava API Notes

- Activities are fetched from `/athlete/activities` (paginated, 200/page, last 90 days).
- Segment effort counts come from parsing `segment_efforts` inside each activity.
- The Local Legend ranking uses `/segments/{id}/efforts` filtered by the 90-day window, grouped by athlete.
- Rate limits are respected: if the `X-RateLimit-Usage` header approaches 90% of the short-term limit, a friendly message is shown.

---

## Project Structure

```
├── app.js              # Express app, Passport config
├── routes/
│   ├── auth.js         # /login, /logout, /auth/strava, /auth/strava/callback
│   └── dashboard.js    # /dashboard, /card/:id, /card-preview/:id
├── utils/
│   ├── strava.js       # API helpers, token refresh middleware
│   └── imageGen.js     # node-canvas share card generator
├── views/
│   ├── login.ejs
│   ├── dashboard.ejs
│   └── error.ejs
└── public/
    ├── css/style.css
    └── images/         # Drop tomcat.png here
```

---

Made with 🚴 by tomcat.png

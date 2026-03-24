const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const fs   = require('fs');

const WIDTH  = 1080;
const HEIGHT = 1080;

const ORANGE      = '#FC4C02';
const ORANGE_DARK = '#C93D00';
const WHITE       = '#FFFFFF';
const DARK        = '#1A1A2E';
const LIGHT_GREY  = '#F5F5F5';
const MID_GREY    = '#888888';
const GREEN       = '#2ECC71';
const BLUE        = '#3498DB';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  while (text.length > 0 && ctx.measureText(text + '…').width > maxWidth) {
    text = text.slice(0, -1);
  }
  return text + '…';
}

function drawProgressBar(ctx, x, y, w, h, progress, radius = 10) {
  // Track
  roundRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();

  // Fill
  const fillW = Math.max(radius * 2, Math.min(w, w * Math.min(1, progress)));
  roundRect(ctx, x, y, fillW, h, radius);
  const grad = ctx.createLinearGradient(x, 0, x + fillW, 0);
  grad.addColorStop(0, ORANGE_DARK);
  grad.addColorStop(1, ORANGE);
  ctx.fillStyle = grad;
  ctx.fill();
}

/**
 * Generate a shareable PNG card showing the user's own segment stats.
 * No other athletes' data is included.
 *
 * @param {Object} p
 * @param {string} p.segmentName
 * @param {string} p.userName
 * @param {number} p.count       – efforts in the last 90 days
 * @param {number} p.lastYear    – efforts in same 90-day window last year
 * @param {number} p.goal        – user-defined target (0 = not set)
 * @param {string} p.motivation  – pre-built motivational message
 */
async function generateShareCard({ segmentName, userName, count, lastYear, goal, motivation }) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx    = canvas.getContext('2d');

  // ── Background ───────────────────────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bgGrad.addColorStop(0, '#1A1A2E');
  bgGrad.addColorStop(1, '#16213E');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.globalAlpha = 0.07;
  ctx.fillStyle = ORANGE;
  ctx.beginPath(); ctx.arc(WIDTH * 0.85, HEIGHT * 0.15, 300, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(WIDTH * 0.1,  HEIGHT * 0.85, 220, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  // ── Card ─────────────────────────────────────────────────────────────────────
  const cardX = 60, cardY = 60, cardW = WIDTH - 120, cardH = HEIGHT - 120;
  roundRect(ctx, cardX, cardY, cardW, cardH, 32);
  ctx.fillStyle = '#1E1E30';
  ctx.fill();

  roundRect(ctx, cardX, cardY, cardW, cardH, 32);
  ctx.strokeStyle = 'rgba(252, 76, 2, 0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // ── Header ───────────────────────────────────────────────────────────────────
  const hdrH = 110;
  roundRect(ctx, cardX, cardY, cardW, hdrH, 32);
  const hdrGrad = ctx.createLinearGradient(cardX, 0, cardX + cardW, 0);
  hdrGrad.addColorStop(0, ORANGE_DARK);
  hdrGrad.addColorStop(1, ORANGE);
  ctx.fillStyle = hdrGrad;
  ctx.fill();
  ctx.fillRect(cardX, cardY + hdrH - 32, cardW, 32);

  ctx.fillStyle = WHITE;
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🚴  PERSONAL EFFORT TRACKER', WIDTH / 2, cardY + hdrH / 2);

  // ── Segment name ─────────────────────────────────────────────────────────────
  ctx.font = 'bold 52px sans-serif';
  ctx.fillStyle = WHITE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(fitText(ctx, segmentName, cardW - 80), WIDTH / 2, cardY + hdrH + 80);

  ctx.strokeStyle = 'rgba(252, 76, 2, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 60, cardY + hdrH + 105);
  ctx.lineTo(cardX + cardW - 60, cardY + hdrH + 105);
  ctx.stroke();

  // ── Stats row: current vs last year ──────────────────────────────────────────
  const statsY = cardY + hdrH + 145;
  const colW   = cardW / 2 - 30;

  // Left: current period
  const leftX = cardX + 40;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, leftX, statsY, colW, 160, 16);
  ctx.fill();

  ctx.font = '22px sans-serif';
  ctx.fillStyle = MID_GREY;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('LAST 90 DAYS', leftX + colW / 2, statsY + 38);

  ctx.font = 'bold 72px sans-serif';
  ctx.fillStyle = ORANGE;
  ctx.fillText(count, leftX + colW / 2, statsY + 120);

  ctx.font = '20px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('efforts', leftX + colW / 2, statsY + 150);

  // Right: same window last year
  const rightX = cardX + cardW / 2 + 10;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, rightX, statsY, colW, 160, 16);
  ctx.fill();

  ctx.font = '22px sans-serif';
  ctx.fillStyle = MID_GREY;
  ctx.textAlign = 'center';
  ctx.fillText('SAME PERIOD LAST YEAR', rightX + colW / 2, statsY + 38);

  ctx.font = 'bold 72px sans-serif';
  const ahead = count >= lastYear;
  ctx.fillStyle = lastYear === 0 ? 'rgba(255,255,255,0.3)' : (ahead ? GREEN : BLUE);
  ctx.fillText(lastYear === 0 ? '—' : lastYear, rightX + colW / 2, statsY + 120);

  ctx.font = '20px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('efforts', rightX + colW / 2, statsY + 150);

  // ── Goal progress bar (only if goal is set) ───────────────────────────────────
  const pbY = statsY + 185;
  const pbX = cardX + 60;
  const pbW = cardW - 120;
  const pbH = 36;

  if (goal > 0) {
    const progress = count / goal;
    drawProgressBar(ctx, pbX, pbY, pbW, pbH, progress);

    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const pct = Math.min(100, Math.round(progress * 100));
    ctx.fillText(
      `${count} / ${goal} efforts  ·  ${pct}% of goal`,
      WIDTH / 2,
      pbY + pbH + 34
    );
  } else {
    // No goal set: draw a faint placeholder bar
    roundRect(ctx, pbX, pbY, pbW, pbH, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.font = '20px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Set a goal in the app to track progress', WIDTH / 2, pbY + pbH / 2);
  }

  // ── Motivational message ──────────────────────────────────────────────────────
  const msgY = pbY + pbH + 80;

  const isGoalDone = goal > 0 && count >= goal;
  ctx.fillStyle = isGoalDone
    ? 'rgba(46, 204, 113, 0.15)'
    : 'rgba(252, 76, 2, 0.12)';
  roundRect(ctx, cardX + 60, msgY - 12, cardW - 120, 72, 16);
  ctx.fill();

  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = isGoalDone ? GREEN : ORANGE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitText(ctx, motivation, cardW - 160), WIDTH / 2, msgY + 24);

  // ── Rider name ────────────────────────────────────────────────────────────────
  ctx.font = '22px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${userName}  ·  last 90 days`, WIDTH / 2, msgY + 90);

  // ── Footer ────────────────────────────────────────────────────────────────────
  const footerY = cardY + cardH - 70;

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 60, footerY - 20);
  ctx.lineTo(cardX + cardW - 60, footerY - 20);
  ctx.stroke();

  // Branding: try tomcat.png logo, fall back to text
  const logoPath   = path.join(__dirname, '..', 'public', 'images', 'tomcat.png');
  let logoLoaded   = false;

  if (fs.existsSync(logoPath)) {
    try {
      const logo   = await loadImage(logoPath);
      const logoH  = 40;
      const logoW  = (logo.width / logo.height) * logoH;
      // Centre the logo to the left of the "Powered by Strava" text
      ctx.drawImage(logo, WIDTH / 2 - logoW / 2 - 10, footerY + 5, logoW, logoH);
      logoLoaded = true;
    } catch (_) {}
  }

  if (!logoLoaded) {
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🚴 Made with tomcat.png', WIDTH / 2 - 120, footerY + 26);
  }

  // "Powered by Strava" — required by Strava API Terms
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = ORANGE;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('Powered by Strava', cardX + cardW - 60, footerY + 26);

  return canvas.encode('png');
}

module.exports = { generateShareCard };

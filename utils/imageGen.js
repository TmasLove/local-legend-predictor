const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

const WIDTH = 1080;
const HEIGHT = 1080;

// Strava-inspired colour palette
const ORANGE = '#FC4C02';
const ORANGE_DARK = '#C93D00';
const WHITE = '#FFFFFF';
const DARK = '#1A1A2E';
const LIGHT_GREY = '#F5F5F5';
const MID_GREY = '#888888';
const GREEN = '#2ECC71';

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
  ctx.fillStyle = LIGHT_GREY;
  ctx.fill();

  // Fill
  const fillW = Math.max(radius * 2, Math.min(w, w * progress));
  roundRect(ctx, x, y, fillW, h, radius);

  const grad = ctx.createLinearGradient(x, 0, x + fillW, 0);
  grad.addColorStop(0, ORANGE_DARK);
  grad.addColorStop(1, ORANGE);
  ctx.fillStyle = grad;
  ctx.fill();
}

/**
 * Generate a shareable PNG card for a segment.
 *
 * @param {Object} p
 * @param {string}  p.segmentName
 * @param {string}  p.userName
 * @param {number}  p.userCount   – user's effort count (last 90 days)
 * @param {string}  p.legendName
 * @param {number}  p.legendCount – legend's effort count (last 90 days)
 * @param {number}  p.effortsNeeded – 0 means user IS the legend
 * @returns {Buffer} PNG buffer
 */
async function generateShareCard({
  segmentName,
  userName,
  userCount,
  legendName,
  legendCount,
  effortsNeeded
}) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // ── Background ──────────────────────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bgGrad.addColorStop(0, '#1A1A2E');
  bgGrad.addColorStop(1, '#16213E');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Decorative circles
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = ORANGE;
  ctx.beginPath();
  ctx.arc(WIDTH * 0.85, HEIGHT * 0.15, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(WIDTH * 0.1, HEIGHT * 0.85, 220, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // ── Card ────────────────────────────────────────────────────────────────────
  const cardX = 60, cardY = 60;
  const cardW = WIDTH - 120, cardH = HEIGHT - 120;

  roundRect(ctx, cardX, cardY, cardW, cardH, 32);
  ctx.fillStyle = '#1E1E30';
  ctx.fill();

  // Subtle border
  roundRect(ctx, cardX, cardY, cardW, cardH, 32);
  ctx.strokeStyle = 'rgba(252, 76, 2, 0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // ── Header bar ──────────────────────────────────────────────────────────────
  const hdrH = 110;
  roundRect(ctx, cardX, cardY, cardW, hdrH, 32);
  const hdrGrad = ctx.createLinearGradient(cardX, 0, cardX + cardW, 0);
  hdrGrad.addColorStop(0, ORANGE_DARK);
  hdrGrad.addColorStop(1, ORANGE);
  ctx.fillStyle = hdrGrad;
  ctx.fill();

  // Fix bottom corners of header (overlap with card)
  ctx.fillStyle = hdrGrad;
  ctx.fillRect(cardX, cardY + hdrH - 32, cardW, 32);

  // Header text
  ctx.fillStyle = WHITE;
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🏆  LOCAL LEGEND PREDICTOR', WIDTH / 2, cardY + hdrH / 2);

  // ── Segment name ────────────────────────────────────────────────────────────
  ctx.font = 'bold 52px sans-serif';
  ctx.fillStyle = WHITE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const fittedName = fitText(ctx, segmentName, cardW - 80);
  ctx.fillText(fittedName, WIDTH / 2, cardY + hdrH + 80);

  // Divider
  ctx.strokeStyle = 'rgba(252, 76, 2, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 60, cardY + hdrH + 105);
  ctx.lineTo(cardX + cardW - 60, cardY + hdrH + 105);
  ctx.stroke();

  // ── Stats area ──────────────────────────────────────────────────────────────
  const statsY = cardY + hdrH + 140;
  const colW = cardW / 2 - 30;

  // Left stat – Legend
  const leftX = cardX + 40;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, leftX, statsY, colW, 160, 16);
  ctx.fill();

  ctx.font = '22px sans-serif';
  ctx.fillStyle = MID_GREY;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('👑  CURRENT LEGEND', leftX + colW / 2, statsY + 40);

  ctx.font = 'bold 62px sans-serif';
  ctx.fillStyle = ORANGE;
  ctx.fillText(legendCount, leftX + colW / 2, statsY + 115);

  ctx.font = '22px sans-serif';
  ctx.fillStyle = WHITE;
  ctx.fillText(
    fitText(ctx, legendName, colW - 20),
    leftX + colW / 2,
    statsY + 148
  );

  // Right stat – You
  const rightX = cardX + cardW / 2 + 10;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, rightX, statsY, colW, 160, 16);
  ctx.fill();

  ctx.font = '22px sans-serif';
  ctx.fillStyle = MID_GREY;
  ctx.textAlign = 'center';
  ctx.fillText('🚴  YOUR EFFORTS', rightX + colW / 2, statsY + 40);

  ctx.font = 'bold 62px sans-serif';
  ctx.fillStyle = effortsNeeded === 0 ? GREEN : WHITE;
  ctx.fillText(userCount, rightX + colW / 2, statsY + 115);

  ctx.font = '22px sans-serif';
  ctx.fillStyle = WHITE;
  ctx.fillText(
    fitText(ctx, userName, colW - 20),
    rightX + colW / 2,
    statsY + 148
  );

  // ── Progress bar ────────────────────────────────────────────────────────────
  const pbY = statsY + 190;
  const pbX = cardX + 60;
  const pbW = cardW - 120;
  const pbH = 36;

  const progress = legendCount > 0
    ? Math.min(1, userCount / (legendCount + (effortsNeeded > 0 ? effortsNeeded : 0)))
    : 1;

  drawProgressBar(ctx, pbX, pbY, pbW, pbH, progress);

  // Progress label
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = WHITE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const pct = Math.round(progress * 100);
  ctx.fillText(`${pct}% of the way there`, WIDTH / 2, pbY + pbH + 34);

  // ── Motivational message ─────────────────────────────────────────────────────
  const msgY = pbY + pbH + 80;

  let msg;
  if (effortsNeeded === 0) {
    msg = `👑 You ARE the Local Legend on this segment!`;
  } else if (effortsNeeded === 1) {
    msg = `Just 1 more ride to dethrone ${legendName}!`;
  } else {
    msg = `Just ${effortsNeeded} more rides to dethrone ${legendName}!`;
  }

  // Message box
  ctx.fillStyle = effortsNeeded === 0
    ? 'rgba(46, 204, 113, 0.15)'
    : 'rgba(252, 76, 2, 0.12)';
  roundRect(ctx, cardX + 60, msgY - 12, cardW - 120, 72, 16);
  ctx.fill();

  ctx.font = 'bold 30px sans-serif';
  ctx.fillStyle = effortsNeeded === 0 ? GREEN : ORANGE;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitText(ctx, msg, cardW - 160), WIDTH / 2, msgY + 24);

  // ── 90-day note ──────────────────────────────────────────────────────────────
  ctx.font = '20px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Based on efforts in the last 90 days', WIDTH / 2, msgY + 100);

  // ── Branding footer ──────────────────────────────────────────────────────────
  const footerY = cardY + cardH - 70;

  // Footer divider
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 60, footerY - 20);
  ctx.lineTo(cardX + cardW - 60, footerY - 20);
  ctx.stroke();

  // Try to load tomcat.png branding logo
  const logoPath = path.join(__dirname, '..', 'public', 'images', 'tomcat.png');
  let logoLoaded = false;
  if (fs.existsSync(logoPath)) {
    try {
      const logo = await loadImage(logoPath);
      const logoH = 40;
      const logoW = (logo.width / logo.height) * logoH;
      ctx.drawImage(logo, WIDTH / 2 - logoW / 2 - 10, footerY + 5, logoW, logoH);
      logoLoaded = true;
    } catch (_) {}
  }

  if (!logoLoaded) {
    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🚴 Made with tomcat.png', WIDTH / 2, footerY + 26);
  }

  return canvas.encode('png');
}

module.exports = { generateShareCard };

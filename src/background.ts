// Environment rendering: a layered, theme-aware sky (atmospheric haze, sun /
// blood-moon, a coiling Zhulong silhouette), parallax pagodas / torii / pines /
// lantern strings / drifting fog, tiles, wind, and an additive lighting pass.
import { clamp, mixHex } from './math.js';
import { LOGICAL_W, LOGICAL_H, TILE } from './types.js';
import type { Game } from './game.js';

type Theme = { day: string[]; night: string[]; haze: string; hazeNight: string; ridge: string; ridgeNight: string; accent: string; soilTop: string; soilBot: string; grass: string; grassLo: string; decor: string };
const THEMES: Record<string, Theme> = {
  mountain: { day: ['#ffbf7a', '#e07048', '#7a2b47', '#1a0a17'], night: ['#0b234f', '#152048', '#171233', '#08050d'], haze: '#e08a5a', hazeNight: '#33477a', ridge: '#5a2740', ridgeNight: '#141b3a', accent: '#ff5c38', soilTop: '#8a5a34', soilBot: '#39220f', grass: '#7ca23f', grassLo: '#517028', decor: '#2c1418' },
  bridge: { day: ['#ffc38f', '#e8785f', '#7a2f52', '#180a17'], night: ['#0b2c48', '#123a4c', '#181c3e', '#08060f'], haze: '#e89a72', hazeNight: '#2f5266', ridge: '#5e2a49', ridgeNight: '#132638', accent: '#ff7a52', soilTop: '#875841', soilBot: '#331b15', grass: '#729a49', grassLo: '#4a6a2c', decor: '#26121e' },
  cavern: { day: ['#8a4a30', '#5a2a24', '#2f171b', '#0d0608'], night: ['#0c1c38', '#121e34', '#141122', '#070509'], haze: '#7a4436', hazeNight: '#243444', ridge: '#3a2020', ridgeNight: '#101826', accent: '#ff8b44', soilTop: '#6e4d38', soilBot: '#2a1a18', grass: '#4f9068', grassLo: '#356048', decor: '#2c2020' },
  arena: { day: ['#8a2420', '#54141c', '#2c0a12', '#0d0407'], night: ['#150720', '#1e0b26', '#16091a', '#070409'], haze: '#7a2e2c', hazeNight: '#3e1c34', ridge: '#3a1220', ridgeNight: '#1a0c1f', accent: '#ff3b2a', soilTop: '#7a4238', soilBot: '#2a1216', grass: '#96543a', grassLo: '#623428', decor: '#2a0e16' },
};
function theme(game: Game): Theme { return THEMES[game.level.theme] || THEMES.mountain; }

// deterministic hash → [0,1) for stable per-column decoration placement
function hash(n: number): number {
  n = (n << 13) ^ n;
  return ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 0x7fffffff;
}

export function drawSky(game: Game, c: CanvasRenderingContext2D) {
  const th = theme(game), day = game.dayAmount;
  c.fillStyle = '#08060d'; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  const grad = (stops: string[]) => {
    const g = c.createLinearGradient(0, 0, 0, LOGICAL_H);
    g.addColorStop(0, stops[0]); g.addColorStop(0.38, stops[1]); g.addColorStop(0.68, stops[2]); g.addColorStop(1, stops[3]);
    return g;
  };
  c.globalAlpha = day; c.fillStyle = grad(th.day); c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  c.globalAlpha = 1 - day; c.fillStyle = grad(th.night); c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  c.globalAlpha = 1;

  // celestial body: golden sun (day) crossfading to a blood-moon (night)
  const cx = 772 - game.camera.x * 0.04, cy = 96;
  // atmospheric bloom
  c.save(); c.globalCompositeOperation = 'lighter';
  const bloom = c.createRadialGradient(cx, cy, 0, cx, cy, 260);
  bloom.addColorStop(0, `rgba(255,190,120,${0.22 * day + 0.05})`);
  bloom.addColorStop(0.5, `rgba(255,90,60,${0.10 * (1 - day)})`);
  bloom.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = bloom; c.beginPath(); c.arc(cx, cy, 260, 0, Math.PI * 2); c.fill();
  c.restore();
  // sun
  c.globalAlpha = day; c.fillStyle = '#ffd583'; c.shadowColor = '#ffbe57'; c.shadowBlur = 46;
  c.beginPath(); c.arc(cx, cy, 46, 0, Math.PI * 2); c.fill();
  // blood-moon
  c.globalAlpha = 1 - day; c.shadowColor = '#c53a2a'; c.shadowBlur = 44;
  const moon = c.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, 40);
  moon.addColorStop(0, '#ffd9b0'); moon.addColorStop(0.6, '#e0653f'); moon.addColorStop(1, '#7a2320');
  c.fillStyle = moon; c.beginPath(); c.arc(cx, cy, 40, 0, Math.PI * 2); c.fill();
  c.shadowBlur = 0; c.fillStyle = 'rgba(90,25,20,.5)';
  c.beginPath(); c.arc(cx - 12, cy - 6, 6, 0, Math.PI * 2); c.arc(cx + 10, cy + 10, 4, 0, Math.PI * 2); c.arc(cx + 4, cy - 14, 3, 0, Math.PI * 2); c.fill();
  c.globalAlpha = 1; c.shadowBlur = 0;

  drawClouds(game, c, day);
  drawCoilingDragon(game, c, day);
  drawDragonEye(game, c, day);
  drawGodRays(game, c, day, cx, cy);
}

// Stylised Chinese auspicious cloud (祥云): rounded billows with a ruyi curl.
function drawCloud(c: CanvasRenderingContext2D, x: number, y: number, s: number, col: string) {
  c.fillStyle = col;
  c.beginPath();
  c.arc(x, y, 11 * s, 0, Math.PI * 2); c.arc(x + 15 * s, y - 4 * s, 14 * s, 0, Math.PI * 2);
  c.arc(x + 32 * s, y, 11 * s, 0, Math.PI * 2); c.arc(x + 17 * s, y + 6 * s, 13 * s, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = col; c.lineWidth = 3.5 * s; c.lineCap = 'round';
  c.beginPath(); c.arc(x - 7 * s, y + 3 * s, 5.5 * s, -0.3, Math.PI * 1.7); c.stroke();
  c.beginPath(); c.arc(x + 40 * s, y + 1 * s, 5 * s, Math.PI * 0.4, Math.PI * 2.1); c.stroke();
}
function drawClouds(game: Game, c: CanvasRenderingContext2D, day: number) {
  const col = day > 0.5 ? 'rgba(255,214,168,0.13)' : 'rgba(150,178,224,0.11)';
  c.save();
  for (let i = 0; i < 6; i++) {
    const par = 0.05 + i * 0.008;
    const x = (((i * 250 + game.time * 7) - game.camera.x * par) % (LOGICAL_W + 320)) - 160;
    const y = 54 + (i % 3) * 44 + Math.sin(game.time * 0.3 + i) * 4;
    drawCloud(c, x, y, 1.25 - i * 0.08, col);
  }
  c.restore();
}

// A colossal Zhulong coiling through the high clouds — subtle, slow parallax.
function drawCoilingDragon(game: Game, c: CanvasRenderingContext2D, day: number) {
  const t = game.time * 0.06;
  const ox = 470 - game.camera.x * 0.05;
  const col = mixHex('#7fb0ff', '#ff6a48', day);
  c.save();
  c.globalAlpha = 0.16 + 0.06 * Math.sin(game.time * 0.4);
  c.strokeStyle = col; c.lineCap = 'round'; c.lineJoin = 'round';
  // body: a tapering sinuous ribbon
  for (let seg = 0; seg < 3; seg++) {
    c.beginPath();
    c.lineWidth = 26 - seg * 8;
    for (let i = 0; i <= 40; i++) {
      const p = i / 40;
      const x = ox + p * 620;
      const y = 120 + Math.sin(p * 7 + t + seg * 0.3) * 46 - p * 20;
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
  }
  // head glow
  c.globalAlpha = 0.22; c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 24;
  const hx = ox + 620, hy = 120 + Math.sin(7 + t) * 46 - 20;
  c.beginPath(); c.ellipse(hx, hy, 22, 13, 0.2, 0, Math.PI * 2); c.fill();
  c.restore(); c.globalAlpha = 1; c.shadowBlur = 0;
}

function drawGodRays(game: Game, c: CanvasRenderingContext2D, day: number, cx: number, cy: number) {
  if (day < 0.15) return;
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = day * 0.12;
  c.fillStyle = '#ffd9a0';
  for (let i = 0; i < 6; i++) {
    const a = -1.2 + i * 0.32 + Math.sin(game.time * 0.2 + i) * 0.04;
    c.save(); c.translate(cx, cy); c.rotate(a);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(700, -26); c.lineTo(700, 26); c.closePath(); c.fill();
    c.restore();
  }
  c.restore(); c.globalAlpha = 1;
}

export function drawDragonEye(game: Game, c: CanvasRenderingContext2D, day: number) {
  c.save();
  const x = 214 - game.camera.x * 0.03, y = 84;
  const openness = clamp(day * game.eyeBlink, 0, 1);
  // outer socket haze
  c.globalAlpha = 0.45; c.fillStyle = 'rgba(255,120,80,.05)';
  c.beginPath(); c.ellipse(x, y, 112, 40, 0, 0, Math.PI * 2); c.fill();
  // lid outline
  c.globalAlpha = 0.72; c.lineWidth = 3.5;
  c.strokeStyle = day > 0.5 ? 'rgba(255,210,120,.65)' : 'rgba(141,202,255,.38)';
  c.beginPath(); c.ellipse(x, y, 84, 27 * (0.16 + openness * 0.84), 0, 0, Math.PI * 2); c.stroke();
  if (openness > 0.05) {
    c.globalAlpha = openness;
    c.shadowColor = '#ff4a28'; c.shadowBlur = 30;
    c.fillStyle = '#1a0509'; c.beginPath(); c.ellipse(x, y, 23, 24 * openness, 0, 0, Math.PI * 2); c.fill();
    const iris = c.createRadialGradient(x, y, 1, x, y, 24);
    iris.addColorStop(0, '#ffd08a'); iris.addColorStop(0.4, '#f0452c'); iris.addColorStop(1, '#8a1810');
    c.fillStyle = iris; c.beginPath(); c.ellipse(x, y, 9, 24 * openness, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff0d0'; c.beginPath(); c.arc(x - 4, y - 6 * openness, 2.4, 0, Math.PI * 2); c.fill();
  }
  c.restore(); c.globalAlpha = 1; c.shadowBlur = 0;
}

// haze-tinted layered ridges + pagodas + torii + lantern strings + pines + fog.
export function drawParallax(game: Game, c: CanvasRenderingContext2D) {
  const th = theme(game), day = game.dayAmount;
  const haze = mixHex(th.hazeNight, th.haze, day);
  const ridge = mixHex(th.ridgeNight, th.ridge, day);

  // far ridges, fading toward the haze colour with distance
  for (let layer = 0; layer < 4; layer++) {
    const par = [0.06, 0.13, 0.22, 0.34][layer];
    const baseY = [318, 356, 398, 452][layer];
    const depth = 1 - layer / 4;
    c.fillStyle = mixHex(ridge, haze, depth * 0.7);
    c.globalAlpha = 0.72 + layer * 0.07;
    c.beginPath(); c.moveTo(0, LOGICAL_H);
    for (let x = -140; x <= LOGICAL_W + 200; x += 100) {
      const wx = x - ((game.camera.x * par) % 100);
      const peak = baseY - 80 - Math.sin((x + layer * 60) * 0.035) * (34 - layer * 5);
      c.lineTo(wx, baseY); c.lineTo(wx + 50, peak); c.lineTo(wx + 100, baseY);
    }
    c.lineTo(LOGICAL_W, LOGICAL_H); c.closePath(); c.fill();
  }
  c.globalAlpha = 1;

  // fog band across the ridges
  c.save(); c.globalCompositeOperation = 'screen';
  for (let i = 0; i < 3; i++) {
    const fy = 360 + i * 40 + Math.sin(game.time * 0.2 + i) * 6;
    const fg = c.createLinearGradient(0, fy - 30, 0, fy + 30);
    fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.5, `rgba(${day > 0.5 ? '230,180,150' : '150,175,215'},0.10)`); fg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = fg; c.fillRect(0, fy - 30, LOGICAL_W, 60);
  }
  c.restore();

  // mid-ground pagoda skyline
  const pagCol = mixHex('#0f0a16', ridge, 0.35);
  for (let i = -1; i < 8; i++) {
    const x = i * 260 - ((game.camera.x * 0.42) % 260);
    drawPagoda(c, x + 40, 372, 0.9, pagCol, (i % 2) as number);
  }
  // a paifang archway landmark
  drawPaifang(c, 300 - ((game.camera.x * 0.5) % (LOGICAL_W + 400)) + 200, 436, mixHex('#160812', th.ridge, 0.3), mixHex(th.accent, '#2a0a0c', 0.35));

  // lantern string swagging across the mid-ground
  drawLanternString(game, c, day);

  // sparse foreground pines for framing (surface decor carries the rest)
  const pine = mixHex('#0a070e', th.ridge, 0.14);
  for (let i = -1; i < 5; i++) {
    const x = i * 480 - ((game.camera.x * 0.6) % 480);
    drawPine(c, x + 120, 458, 0.58, pine);
  }
  // foreground fog near the floor
  c.save(); c.globalCompositeOperation = 'screen'; c.globalAlpha = 0.5;
  const gg = c.createLinearGradient(0, LOGICAL_H - 90, 0, LOGICAL_H);
  gg.addColorStop(0, 'rgba(0,0,0,0)'); gg.addColorStop(1, `rgba(${day > 0.5 ? '210,150,120' : '120,150,200'},0.14)`);
  c.fillStyle = gg; c.fillRect(0, LOGICAL_H - 90, LOGICAL_W, 90);
  c.restore(); c.globalAlpha = 1;
}

function drawPagoda(c: CanvasRenderingContext2D, x: number, baseY: number, s: number, col: string, tiers: number) {
  const n = 3 + tiers;
  c.fillStyle = col;
  c.fillRect(x - 10 * s, baseY - n * 22 * s, 20 * s, n * 22 * s);
  for (let t = 0; t < n; t++) {
    const y = baseY - t * 22 * s - 14 * s;
    const w = (34 - t * 3) * s;
    c.beginPath();
    c.moveTo(x - w, y); c.quadraticCurveTo(x - w * 0.6, y - 10 * s, x - w * 0.3, y - 8 * s);
    c.lineTo(x + w * 0.3, y - 8 * s); c.quadraticCurveTo(x + w * 0.6, y - 10 * s, x + w, y);
    c.quadraticCurveTo(x, y - 4 * s, x - w, y); c.closePath(); c.fill();
  }
  // finial
  c.fillRect(x - 1.5 * s, baseY - n * 22 * s - 12 * s, 3 * s, 12 * s);
}

// East-Asian curved roof silhouette: eaves sweep upward at the ends
function curvedRoof(c: CanvasRenderingContext2D, cx: number, y: number, w: number, h: number) {
  c.beginPath();
  c.moveTo(cx - w / 2 - 16, y - 13);
  c.quadraticCurveTo(cx - w * 0.28, y + 3, cx, y - 3);
  c.quadraticCurveTo(cx + w * 0.28, y + 3, cx + w / 2 + 16, y - 13);
  c.lineTo(cx + w / 2, y + h); c.lineTo(cx - w / 2, y + h); c.closePath(); c.fill();
}
// Chinese paifang / pailou memorial archway (replaces the Japanese torii)
function drawPaifang(c: CanvasRenderingContext2D, x: number, baseY: number, col: string, accent: string) {
  const w = 100, h = 104;
  c.fillStyle = col;
  for (const px of [-w / 2, -w / 6, w / 6, w / 2]) c.fillRect(x + px - 3, baseY - h, 7, h);   // four pillars
  c.fillRect(x - w / 2 - 8, baseY - h + 26, w + 16, 10);                                       // lower lintel
  curvedRoof(c, x, baseY - h + 6, w + 30, 15);                                                 // main roof
  curvedRoof(c, x, baseY - h - 20, w * 0.46, 12);                                              // raised central roof
  c.fillRect(x - 2, baseY - h - 32, 4, 10);                                                    // ridge finial
  c.fillStyle = accent; c.fillRect(x - 15, baseY - h + 9, 30, 13);                             // name plaque
}

function drawPine(c: CanvasRenderingContext2D, x: number, baseY: number, s: number, col: string) {
  c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 6 * s; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x, baseY + 70); c.quadraticCurveTo(x - 6, baseY, x + 10, baseY - 40); c.stroke();
  // gnarled branches with flat canopies
  const branch = (bx: number, by: number, dir: number, len: number) => {
    c.lineWidth = 3 * s; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + dir * len, by - 8); c.stroke();
    c.beginPath(); c.ellipse(bx + dir * len, by - 12, 22 * s, 7 * s, 0, 0, Math.PI * 2); c.fill();
  };
  branch(x + 4, baseY - 6, -1, 26 * s); branch(x + 8, baseY - 28, 1, 30 * s); branch(x + 10, baseY - 44, -1, 20 * s);
  c.beginPath(); c.ellipse(x + 12, baseY - 52, 30 * s, 9 * s, 0, 0, Math.PI * 2); c.fill();
}

function drawLanternString(game: Game, c: CanvasRenderingContext2D, day: number) {
  const par = 0.5, span = LOGICAL_W + 200;
  const ox = -((game.camera.x * par) % 300);
  const sag = 40, y0 = 150;
  const cordY = (x: number, p: number) => y0 + Math.sin(p * Math.PI) * sag;
  c.save();
  for (let i = 0; i < 6; i++) {
    const x = ox + i * 300;
    // sagging cord
    c.globalAlpha = (1 - day) * 0.45 + 0.2; c.strokeStyle = 'rgba(30,16,10,.6)'; c.lineWidth = 1.4;
    c.beginPath(); for (let p = 0; p <= 1.001; p += 0.1) { const px = x + p * 260, py = cordY(x, p); p === 0 ? c.moveTo(px, py) : c.lineTo(px, py); } c.stroke();
    // round red lanterns with gold caps + tassels
    for (let k = 0; k < 3; k++) {
      const p = 0.2 + k * 0.3;
      const lx = x + p * 260;
      const ly = cordY(x, p) + 12 + Math.sin(game.time * 1.5 + i + k) * 1.5;
      c.globalAlpha = (1 - day) * 0.9 + day * 0.55;
      c.shadowColor = '#ff4a22'; c.shadowBlur = (1 - day) * 18 + 5;
      c.fillStyle = day > 0.5 ? '#cf432b' : '#e85236';
      c.beginPath(); c.ellipse(lx, ly, 6, 8, 0, 0, Math.PI * 2); c.fill();
      c.shadowBlur = 0;
      c.fillStyle = 'rgba(255,224,150,.5)'; c.beginPath(); c.arc(lx, ly, 2.6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#e8b24a'; c.fillRect(lx - 3, ly - 10, 6, 2.5); c.fillRect(lx - 3, ly + 7, 6, 2.5);
      c.strokeStyle = '#e8b24a'; c.lineWidth = 1; c.beginPath(); c.moveTo(lx, ly + 9); c.lineTo(lx, ly + 16); c.stroke();
      c.fillStyle = '#cf432b'; c.beginPath(); c.moveTo(lx - 2.5, ly + 15); c.lineTo(lx + 2.5, ly + 15); c.lineTo(lx, ly + 20); c.closePath(); c.fill();
    }
  }
  c.restore(); c.globalAlpha = 1;
}

// ---- tiles -----------------------------------------------------------------
// topmost solid terrain row of a column ('#' or 'g'), or null for a pit.
// Columns outside the level are treated as empty (not the solid '#' that
// tileAt() returns for out-of-bounds), so the ground ends cleanly at the edges.
function surfaceRow(game: Game, x: number): number | null {
  if (x < 0 || x >= game.level.width) return null;
  const h = game.level.height;
  for (let y = 0; y < h; y++) { const ch = game.tileAt(x, y); if (ch === '#' || ch === 'g') return y; }
  return null;
}
// organic wobble so even flat spans read as gently rolling hills
function surfaceBump(wx: number) { return Math.sin(wx * 0.011) * 6 + Math.sin(wx * 0.037) * 3 + Math.sin(wx * 0.091) * 1.5; }

export function drawTiles(game: Game, c: CanvasRenderingContext2D) {
  drawGround(game, c);
  const x0 = Math.floor(game.camera.x / TILE) - 1, x1 = Math.ceil((game.camera.x + LOGICAL_W) / TILE) + 1;
  const y0 = Math.floor(game.camera.y / TILE) - 1, y1 = Math.ceil((game.camera.y + LOGICAL_H) / TILE) + 1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const ch = game.tileAt(x, y); if (ch === '.' || ch === '#' || ch === 'g') continue;
    const sx = x * TILE - game.camera.x, sy = y * TILE - game.camera.y;
    if (ch === 'o') { c.save(); c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 6; c.fillStyle = '#6b533a'; c.fillRect(sx, sy, TILE, 9); c.restore(); c.fillStyle = '#8a6b45'; c.fillRect(sx, sy, TILE, 3); c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(sx, sy + 7, TILE, 2); for (let i = 0; i < 3; i++) { c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(sx + 4 + i * 9, sy + 1, 1, 7); } }
    else if (ch === 'D') drawStatePlatform(game, c, sx, sy, 'day');
    else if (ch === 'N') drawStatePlatform(game, c, sx, sy, 'night');
    else if (ch === '^' || ch === 'F' || ch === 'S') drawHazard(game, c, sx, sy, ch);
  }
}

// Organic rolling terrain: smooth soil mounds with a grassy rim, cliff faces at
// pits, and scattered surface detail (tombstones, dead trees, rocks, grass).
function drawGround(game: Game, c: CanvasRenderingContext2D) {
  const th = theme(game), camX = game.camera.x, camY = game.camera.y;
  const x0 = Math.floor(camX / TILE) - 2, x1 = Math.ceil((camX + LOGICAL_W) / TILE) + 2;
  const bottom = LOGICAL_H + 60;
  const topY = (x: number) => { const sr = surfaceRow(game, x); return sr === null ? null : sr * TILE - camY + surfaceBump(x * TILE); };

  let a: number | null = null;
  const flush = (b: number) => { if (a !== null) drawSpan(game, c, th, a, b, camX, camY, bottom, topY); a = null; };
  for (let x = x0; x <= x1; x++) {
    if (surfaceRow(game, x) !== null) { if (a === null) a = x; }
    else flush(x - 1);
  }
  flush(x1);
}

function drawSpan(game: Game, c: CanvasRenderingContext2D, th: Theme, a: number, b: number, camX: number, camY: number, bottom: number, topY: (x: number) => number | null) {
  const leftX = a * TILE - camX, rightX = (b + 1) * TILE - camX;
  const pts: { x: number; y: number }[] = [{ x: leftX, y: topY(a)! }];
  for (let x = a; x <= b; x++) pts.push({ x: x * TILE + TILE / 2 - camX, y: topY(x)! });
  pts.push({ x: rightX, y: topY(b)! });
  const minY = Math.min(...pts.map(p => p.y));

  const traceTop = () => { c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) { const m = { x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2 }; c.quadraticCurveTo(pts[i - 1].x, pts[i - 1].y, m.x, m.y); } c.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y); };
  const surfY = (x: number) => topY(x)!;

  // ---- DIRT body: soil gradient, speckle texture, visible rocks, roots ----
  c.save();
  c.beginPath(); traceTop(); c.lineTo(rightX, bottom); c.lineTo(leftX, bottom); c.closePath();
  const g = c.createLinearGradient(0, minY, 0, minY + 300);
  g.addColorStop(0, th.soilTop); g.addColorStop(0.5, mixHex(th.soilTop, th.soilBot, 0.55)); g.addColorStop(1, th.soilBot);
  c.fillStyle = g; c.fill();
  c.clip();
  // dirt speckle
  for (let x = a; x <= b; x++) for (let s = 0; s < 4; s++) {
    const r = hash(x * 31 + s * 7 + 2);
    const px = x * TILE + r * TILE - camX, py = surfY(x) + 12 + hash(x * 5 + s * 19) * 150;
    c.fillStyle = r < 0.5 ? 'rgba(0,0,0,.16)' : 'rgba(255,225,190,.05)';
    c.fillRect(px, py, 2, 2);
  }
  // rocks embedded in dirt (2-tone, rounded)
  for (let x = a; x <= b; x++) for (let s = 0; s < 2; s++) {
    const r = hash(x * 17 + s * 101 + 5); if (r > 0.5) continue;
    const rx = x * TILE + 3 + hash(x * 5 + s) * 26 - camX, ry = surfY(x) + 16 + hash(x * 9 + s * 13) * 140, rw = 4 + r * 9;
    drawStone(c, rx, ry, rw, th);
  }
  // roots hanging from the grass into the dirt
  c.strokeStyle = mixHex(th.grassLo, th.soilBot, 0.5); c.lineWidth = 1.4; c.lineCap = 'round';
  for (let x = a; x <= b; x++) { if (hash(x * 23 + 9) > 0.28) continue; const rx = x * TILE + 16 - camX, ry = surfY(x) + 12; c.beginPath(); c.moveTo(rx, ry); c.quadraticCurveTo(rx + 3, ry + 8, rx - 2, ry + 16); c.stroke(); }
  c.restore();

  // ---- GRASS turf band with a scalloped underside + blades ----
  const gt = 12;
  c.save();
  c.beginPath();
  traceTop();
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; const wob = Math.sin((p.x + camX) * 0.4) * 3 + Math.sin((p.x + camX) * 0.13) * 2; c.lineTo(p.x, p.y + gt + wob); }
  c.closePath();
  const gg = c.createLinearGradient(0, minY - 2, 0, minY + gt + 6);
  gg.addColorStop(0, mixHex(th.grass, '#e8ffb0', 0.35)); gg.addColorStop(0.5, th.grass); gg.addColorStop(1, th.grassLo);
  c.fillStyle = gg; c.fill();
  c.restore();
  // bright top highlight + blades
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  c.strokeStyle = mixHex(th.grass, '#f0ffc0', 0.5); c.lineWidth = 1.4; c.beginPath(); traceTop(); c.stroke();
  c.strokeStyle = th.grassLo;
  for (let x = a; x <= b; x++) { const wx = x * TILE, sy = surfY(x); for (let k = 0; k < 3; k++) { const bx = wx + 6 + k * 9 - camX, sway = Math.sin(game.time * 1.4 + x + k) * 1.2; c.lineWidth = 1.3; c.beginPath(); c.moveTo(bx, sy + 2); c.quadraticCurveTo(bx + sway, sy - 4, bx + sway * 1.6, sy - 8); c.stroke(); } }
  c.restore();

  // cliff shading at the two edges (pit walls)
  for (const ex of [leftX, rightX]) {
    const grd = c.createLinearGradient(ex - 8, 0, ex + 8, 0);
    const dir = ex === leftX ? 1 : -1;
    grd.addColorStop(0, dir > 0 ? 'rgba(0,0,0,.32)' : 'rgba(0,0,0,0)');
    grd.addColorStop(1, dir > 0 ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,.32)');
    c.fillStyle = grd; c.fillRect(ex - 8, topY(ex === leftX ? a : b)!, 16, bottom);
  }

  // surface decorations
  for (let x = a; x <= b; x++) drawDecor(game, c, th, x, topY(x)!, camX);
}

function drawStone(c: CanvasRenderingContext2D, x: number, y: number, w: number, th: Theme) {
  c.fillStyle = mixHex(th.soilBot, '#9a8a78', 0.5);
  c.beginPath(); c.ellipse(x, y, w, w * 0.72, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(255,240,220,.14)';
  c.beginPath(); c.ellipse(x - w * 0.28, y - w * 0.3, w * 0.5, w * 0.28, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(0,0,0,.3)';
  c.beginPath(); c.ellipse(x, y + w * 0.36, w * 0.92, w * 0.3, 0, 0, Math.PI * 2); c.fill();
}

function drawDecor(game: Game, c: CanvasRenderingContext2D, th: Theme, x: number, sy: number, camX: number) {
  // skip columns that carry a platform/hazard just above the ground
  const above = game.tileAt(x, surfaceRow(game, x)! - 1);
  if (above === 'o' || above === 'D' || above === 'N' || above === 'F' || above === 'S' || above === '^') return;
  const wx = x * TILE + TILE / 2 - camX;
  const r = hash(x * 7 + 3), r2 = hash(x * 13 + 5);
  const sway = Math.sin(game.time * 1.6 + x) * 1.5;
  c.save();
  if (r < 0.09) { // tombstone / cairn
    c.fillStyle = th.decor; c.beginPath(); c.moveTo(wx - 7, sy); c.lineTo(wx - 7, sy - 14); c.arc(wx, sy - 14, 7, Math.PI, 0); c.lineTo(wx + 7, sy); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 1; c.beginPath(); c.moveTo(wx, sy - 3); c.lineTo(wx, sy - 16); c.stroke();
  } else if (r < 0.14) { // dead tree
    c.strokeStyle = th.decor; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(wx, sy); c.lineTo(wx + sway, sy - 34);
    c.moveTo(wx + sway * 0.6, sy - 20); c.lineTo(wx + sway - 12, sy - 30);
    c.moveTo(wx + sway * 0.8, sy - 26); c.lineTo(wx + sway + 12, sy - 38); c.stroke();
  } else if (r < 0.20 && (game.level.theme === 'cavern' || game.level.theme === 'arena')) { // bones
    c.strokeStyle = mixHex(th.decor, '#d8cfc0', 0.6); c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(wx - 6, sy - 2); c.lineTo(wx + 6, sy - 5); c.stroke();
    c.beginPath(); c.arc(wx - 7, sy - 2, 2, 0, Math.PI * 2); c.arc(wx + 7, sy - 5, 2, 0, Math.PI * 2); c.stroke();
  } else if (r < 0.30) { // rock cluster
    c.fillStyle = mixHex(th.soilBot, '#000', 0.2);
    c.beginPath(); c.ellipse(wx - 4, sy - 3, 6, 4, 0, 0, Math.PI * 2); c.ellipse(wx + 5, sy - 2, 4, 3, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(wx - 7, sy - 6, 5, 1);
  } else if (r < 0.72) { // grass tufts
    c.strokeStyle = r2 < 0.5 ? th.grass : th.grassLo; c.lineWidth = 1.6; c.lineCap = 'round';
    for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(wx + i * 3, sy); c.quadraticCurveTo(wx + i * 3 + sway, sy - 6, wx + i * 3 + sway * 1.5 + i, sy - 11 - Math.abs(i)); c.stroke(); }
  }
  c.restore();
}

function drawStatePlatform(game: Game, c: CanvasRenderingContext2D, x: number, y: number, state: 'day' | 'night') {
  const active = game.world === state;
  c.globalAlpha = active ? 1 : 0.22;
  c.save();
  if (active) { c.shadowColor = state === 'day' ? '#ffcf7a' : '#a9d6ff'; c.shadowBlur = 14; }
  const g = c.createLinearGradient(0, y, 0, y + TILE);
  if (state === 'day') { g.addColorStop(0, '#f0b45a'); g.addColorStop(1, '#a9662a'); }
  else { g.addColorStop(0, '#7fa8d6'); g.addColorStop(1, '#3e5f8a'); }
  c.fillStyle = g; c.fillRect(x, y + 4, TILE, TILE - 8);
  c.fillStyle = state === 'day' ? '#ffe6a4' : '#d3f0ff'; c.fillRect(x + 2, y + 6, TILE - 4, 3);
  c.restore(); c.globalAlpha = 1;
}

function drawHazard(game: Game, c: CanvasRenderingContext2D, x: number, y: number, ch: string) {
  const active = game.isHazardChar(ch);
  c.globalAlpha = active ? 1 : 0.2;
  c.save();
  if (active && ch !== '^') { c.shadowColor = ch === 'F' ? '#ff7840' : '#8ed7ff'; c.shadowBlur = 16; }
  c.fillStyle = ch === 'F' ? '#ff7840' : ch === 'S' ? '#8ed7ff' : '#b8a6a6';
  const wob = active ? Math.sin(game.time * 8 + x) * 1.5 : 0;
  for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(x + i * 8, y + TILE); c.lineTo(x + i * 8 + 4, y + 6 + wob); c.lineTo(x + i * 8 + 8, y + TILE); c.fill(); }
  c.restore(); c.globalAlpha = 1;
}

export function drawWind(game: Game, c: CanvasRenderingContext2D) {
  for (const z of game.level.windZones || []) {
    const sx = z.x - game.camera.x, sy = z.y - game.camera.y;
    c.save(); c.globalAlpha = game.world === 'day' ? 0.18 : 0.28;
    c.strokeStyle = game.world === 'day' ? '#ffe19a' : '#bfeeff'; c.lineWidth = 2; c.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      // updraft: streams rise upward (y decreases over time)
      const y = sy + z.h - ((i * 40 + game.time * 150) % z.h);
      const wob = Math.sin(game.time * 2 + i) * 10;
      c.beginPath();
      c.moveTo(sx + 20 + wob, y);
      c.bezierCurveTo(sx + z.w * 0.35, y - 18, sx + z.w * 0.65, y - 34, sx + z.w - 18 + wob, y - 46);
      c.stroke();
      // little upward chevron at the head of each stream
      c.beginPath(); c.moveTo(sx + z.w - 24 + wob, y - 40); c.lineTo(sx + z.w - 18 + wob, y - 48); c.lineTo(sx + z.w - 12 + wob, y - 40); c.stroke();
    }
    c.restore();
  }
}

export function drawLighting(game: Game, c: CanvasRenderingContext2D) {
  const night = 1 - game.dayAmount;
  if (night > 0.02) {
    c.save();
    c.fillStyle = `rgba(6,8,20,${0.55 * night})`; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    c.globalCompositeOperation = 'lighter';
    const glow = (x: number, y: number, r: number, col: string, a: number) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = a * night; c.fillStyle = g;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    };
    const p = game.player;
    glow(p.x - game.camera.x + p.w / 2, p.y - game.camera.y + p.h / 2, 150, 'rgba(150,200,255,.6)', 0.9);
    for (const s of game.level.shrines) glow(s.x - game.camera.x + 13, s.y - game.camera.y + 24, 120, 'rgba(255,200,120,.7)', 0.9);
    for (const cp of game.level.checkpoints) glow(cp.x - game.camera.x + 12, cp.y - game.camera.y + 16, 90, 'rgba(255,150,120,.6)', 0.7);
    for (const r of game.level.relics) if (!game.save.relics.includes(r.id)) glow(r.x - game.camera.x + 11, r.y - game.camera.y + 11, 90, 'rgba(255,220,120,.8)', 0.9);
    for (const e of game.enemies) if (e.kind === 'wisp') glow(e.x - game.camera.x + e.w / 2, e.y - game.camera.y + e.h / 2, 80, 'rgba(150,220,255,.7)', 0.8);
    if (game.boss && game.boss.alive) glow(game.boss.x - game.camera.x + game.boss.w / 2, game.boss.y - game.camera.y + 30, 200, 'rgba(255,140,90,.5)', 0.8);
    for (const pr of game.projectiles) glow(pr.x - game.camera.x, pr.y - game.camera.y, pr.kind === 'blast' ? 70 : 46, pr.hostile ? 'rgba(255,120,80,.7)' : 'rgba(255,200,120,.7)', 0.7);
    c.restore(); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  } else {
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(772 - game.camera.x * 0.04, 92, 0, 772 - game.camera.x * 0.04, 92, 440);
    g.addColorStop(0, 'rgba(255,200,120,.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = game.dayAmount; c.fillStyle = g; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    c.restore(); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
}

export function drawVignette(c: CanvasRenderingContext2D) {
  const g = c.createRadialGradient(LOGICAL_W / 2, LOGICAL_H / 2, LOGICAL_H * 0.42, LOGICAL_W / 2, LOGICAL_H / 2, LOGICAL_H * 0.9);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.36)');
  c.fillStyle = g; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
}

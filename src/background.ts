// Environment rendering: a layered, theme-aware sky (atmospheric haze, sun /
// blood-moon, a coiling Zhulong silhouette), parallax pagodas / torii / pines /
// lantern strings / drifting fog, tiles, wind, and an additive lighting pass.
import { clamp, mixHex } from './math.js';
import { LOGICAL_W, LOGICAL_H, TILE } from './types.js';
import { stills } from './sprites.js';
import type { Game } from './game.js';

type Theme = { day: string[]; night: string[]; haze: string; hazeNight: string; ridge: string; ridgeNight: string; accent: string; sun: string; soilTop: string; soilBot: string; grass: string; grassLo: string; decor: string };
// Each act gets a distinct time-of-day mood so the journey reads as progression:
// Act I warm golden dawn → Act II teal twilight → Act III violet deep →
// Act IV the cold sunless night. (Both the day and night palettes shift.)
const THEMES: Record<string, Theme> = {
  mountain: { day: ['#ffd08a', '#ef8f56', '#9c4457', '#26121f'], night: ['#132a56', '#172246', '#151a38', '#08060f'], haze: '#efa06a', hazeNight: '#324a7c', ridge: '#6a3350', ridgeNight: '#151d3c', accent: '#ff6a44', sun: '#ffd583', soilTop: '#8a5a34', soilBot: '#39220f', grass: '#7ca23f', grassLo: '#517028', decor: '#2c1418' },
  bridge: { day: ['#a6dcda', '#5f9bb0', '#4a5680', '#191631'], night: ['#0a2e3e', '#0d2a3a', '#0f1a30', '#060810'], haze: '#77b4b6', hazeNight: '#2a5162', ridge: '#2f4a62', ridgeNight: '#122834', accent: '#57d0c4', sun: '#f0f4d4', soilTop: '#5f6a55', soilBot: '#20281f', grass: '#5aa07a', grassLo: '#3a7056', decor: '#182028' },
  cavern: { day: ['#7f4a90', '#502a64', '#301644', '#0e0714'], night: ['#1c0f34', '#190c2c', '#120820', '#06040c'], haze: '#864f98', hazeNight: '#301a4a', ridge: '#3c2052', ridgeNight: '#160c28', accent: '#c265ff', sun: '#e2a6ff', soilTop: '#5a3a62', soilBot: '#241428', grass: '#5a9a86', grassLo: '#3a6a5c', decor: '#241830' },
  sunless: { day: ['#33445e', '#243349', '#181f32', '#080c15'], night: ['#0a1526', '#0a1120', '#080b18', '#04050a'], haze: '#3e4e68', hazeNight: '#1c2a40', ridge: '#1c2740', ridgeNight: '#0e1626', accent: '#6f92da', sun: '#9fb6de', soilTop: '#454f5e', soilBot: '#181e28', grass: '#5a6f66', grassLo: '#3a4a44', decor: '#141c26' },
  arena: { day: ['#8a2420', '#54141c', '#2c0a12', '#0d0407'], night: ['#150720', '#1e0b26', '#16091a', '#070409'], haze: '#7a2e2c', hazeNight: '#3e1c34', ridge: '#3a1220', ridgeNight: '#1a0c1f', accent: '#ff3b2a', sun: '#ff9a6a', soilTop: '#7a4238', soilBot: '#2a1216', grass: '#96543a', grassLo: '#623428', decor: '#2a0e16' },
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
  // sun (tinted per act — golden dawn, pale twilight, violet, cold sunless)
  c.globalAlpha = day; c.fillStyle = th.sun; c.shadowColor = mixHex(th.sun, '#ff8b3a', 0.4); c.shadowBlur = 46;
  c.beginPath(); c.arc(cx, cy, 46, 0, Math.PI * 2); c.fill();
  // blood-moon
  c.globalAlpha = 1 - day; c.shadowColor = '#c53a2a'; c.shadowBlur = 44;
  const moon = c.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, 40);
  moon.addColorStop(0, '#ffd9b0'); moon.addColorStop(0.6, '#e0653f'); moon.addColorStop(1, '#7a2320');
  c.fillStyle = moon; c.beginPath(); c.arc(cx, cy, 40, 0, Math.PI * 2); c.fill();
  c.shadowBlur = 0; c.fillStyle = 'rgba(90,25,20,.5)';
  c.beginPath(); c.arc(cx - 12, cy - 6, 6, 0, Math.PI * 2); c.arc(cx + 10, cy + 10, 4, 0, Math.PI * 2); c.arc(cx + 4, cy - 14, 3, 0, Math.PI * 2); c.fill();
  c.globalAlpha = 1; c.shadowBlur = 0;

  const storm = !!game.level.isBoss;
  drawClouds(game, c, day, storm);
  drawDragonEye(game, c, day);
  drawGodRays(game, c, day, cx, cy);
  if (storm) drawStorm(game, c);
}

// Boss-arena storm: a gloom wash over the sky and periodic lightning bolts
// (timed by Game.lightningT / lightningX, synced with the screen flash + thunder).
function drawStorm(game: Game, c: CanvasRenderingContext2D) {
  c.save(); c.fillStyle = 'rgba(8,12,26,0.4)'; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H); c.restore();
  const lt = game.lightningT;
  if (lt > 0) {
    const a = Math.min(1, lt / 0.3), lx = game.lightningX;
    c.save();
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = a * 0.4; c.fillStyle = '#bcd2ff'; c.fillRect(0, 0, LOGICAL_W, 310); c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = a;
    c.strokeStyle = '#eef4ff'; c.shadowColor = '#9fc0ff'; c.shadowBlur = 18; c.lineWidth = 2.4; c.lineCap = 'round'; c.lineJoin = 'round';
    const endY = game.lightningY || 300;
    let x = lx, y = -8; c.beginPath(); c.moveTo(x, y);
    for (let s = 1; s <= 9; s++) {
      const hn = hash(Math.floor(lx) * 7 + s);
      x = lx + (hn - 0.5) * 90 * (s / 9); y = (s / 9) * endY; c.lineTo(x, y);
      if (hn > 0.72) { c.moveTo(x, y); c.lineTo(x + (hn - 0.5) * 60, y + 34); c.moveTo(x, y); }   // fork
    }
    c.stroke(); c.restore(); c.globalAlpha = 1; c.shadowBlur = 0;
  }
}

// Wind-driven rain, drawn over the whole scene during boss storms (cheap lines).
export function drawRain(game: Game, c: CanvasRenderingContext2D) {
  const rage = game.boss && game.boss.alive && game.boss.phase >= 3;
  const n = rage ? 150 : 100, fall = game.time * (rage ? 1050 : 850);
  c.save(); c.strokeStyle = 'rgba(184,200,232,0.5)'; c.globalAlpha = rage ? 0.6 : 0.42; c.lineWidth = 1.1; c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const bx = hash(i * 2.7) * (LOGICAL_W + 80) - 40;
    const spd = 0.7 + hash(i) * 0.7, len = 12 + hash(i * 7) * 12;
    const y = ((hash(i * 5) * (LOGICAL_H + 60)) + fall * spd) % (LOGICAL_H + 60) - 30;
    c.beginPath(); c.moveTo(bx, y); c.lineTo(bx - 6, y + len); c.stroke();
  }
  c.restore(); c.globalAlpha = 1;
}

// Stylised Chinese auspicious cloud (祥云): rounded billows with a ruyi curl.
// `t` gently billows the puffs (cheap animation — a few sines per cloud).
function drawCloud(c: CanvasRenderingContext2D, x: number, y: number, s: number, col: string, t = 0) {
  const b = (k: number) => 1 + Math.sin(t + k) * 0.1;   // per-puff billow
  c.fillStyle = col;
  c.beginPath();
  c.arc(x, y, 11 * s * b(0), 0, Math.PI * 2); c.arc(x + 15 * s, y - 4 * s + Math.sin(t) * 2, 14 * s * b(1.7), 0, Math.PI * 2);
  c.arc(x + 32 * s, y, 11 * s * b(3.4), 0, Math.PI * 2); c.arc(x + 17 * s, y + 6 * s + Math.sin(t + 1) * 1.5, 13 * s * b(5.1), 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = col; c.lineWidth = 3.5 * s; c.lineCap = 'round';
  c.beginPath(); c.arc(x - 7 * s, y + 3 * s, 5.5 * s, -0.3, Math.PI * 1.7); c.stroke();
  c.beginPath(); c.arc(x + 40 * s, y + 1 * s, 5 * s, Math.PI * 0.4, Math.PI * 2.1); c.stroke();
}
function drawClouds(game: Game, c: CanvasRenderingContext2D, day: number, storm = false) {
  const col = storm ? 'rgba(26,30,48,0.46)' : (day > 0.5 ? 'rgba(255,206,158,0.17)' : 'rgba(140,168,220,0.15)');
  c.save();
  const n = storm ? 10 : 7;
  for (let i = 0; i < n; i++) {
    const par = 0.05 + i * 0.008;
    const speed = storm ? 15 + i * 1.4 : 6 + i * 0.6;
    const x = (((i * 220 + game.time * speed) - game.camera.x * par) % (LOGICAL_W + 340)) - 170;
    const y = (storm ? 38 : 50) + (i % 3) * (storm ? 40 : 46) + Math.sin(game.time * (storm ? 0.5 : 0.28) + i) * (storm ? 11 : 7);
    drawCloud(c, x, y, (storm ? 1.6 : 1.35) - i * 0.07, col, game.time * (storm ? 1.1 : 0.6) + i * 1.3);
  }
  c.restore();
}

// Zhulong himself — a colossal red serpent coiling across the high heavens of
// every scene. Slow parallax; body, spine ridge, whiskers, horned head + eye.
function drawCoilingDragon(game: Game, c: CanvasRenderingContext2D, day: number) {
  const t = game.time * 0.06;
  const ox = 430 - game.camera.x * 0.05;
  const react = game.eyeReact;
  const col = mixHex('#6aa4ff', '#ff5a38', day);
  const path = (p: number) => ({ x: ox + p * 660, y: 118 + Math.sin(p * 6.6 + t) * 52 - p * 16 });
  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  // soft body aura
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = 0.10 + 0.05 * Math.sin(game.time * 0.4) + react * 0.12;
  c.strokeStyle = col; c.lineWidth = 40;
  c.beginPath(); for (let i = 0; i <= 48; i++) { const q = path(i / 48); i === 0 ? c.moveTo(q.x, q.y) : c.lineTo(q.x, q.y); } c.stroke();
  c.globalCompositeOperation = 'source-over';
  // main tapering body
  c.globalAlpha = 0.26 + react * 0.14;
  c.strokeStyle = col; c.lineWidth = 22;
  c.beginPath(); for (let i = 0; i <= 48; i++) { const q = path(i / 48); const w = 22 * (1 - i / 48 * 0.8); c.lineWidth = Math.max(4, w); i === 0 ? c.moveTo(q.x, q.y) : c.lineTo(q.x, q.y); } c.stroke();
  // dorsal spine ridge
  c.globalAlpha = 0.2 + react * 0.1; c.strokeStyle = mixHex(col, '#ffe6a0', 0.5); c.lineWidth = 2;
  for (let i = 2; i < 46; i += 2) { const q = path(i / 48), q2 = path((i + 0.5) / 48); const nx = -(q2.y - q.y), ny = q2.x - q.x; const L = Math.hypot(nx, ny) || 1; const s = 10 * (1 - i / 48 * 0.7); c.beginPath(); c.moveTo(q.x, q.y); c.lineTo(q.x + nx / L * s, q.y + ny / L * s); c.stroke(); }
  // head (at p=0), horns, whiskers, eye
  const h = path(0), h2 = path(0.03), ang = Math.atan2(h.y - h2.y, h.x - h2.x);
  c.save(); c.translate(h.x, h.y); c.rotate(ang);
  c.globalAlpha = 0.34 + react * 0.16; c.fillStyle = col;
  c.beginPath(); c.ellipse(6, 0, 26, 15, 0, 0, Math.PI * 2); c.fill();            // skull
  c.beginPath(); c.moveTo(24, -6); c.quadraticCurveTo(40, -2, 30, 8); c.quadraticCurveTo(20, 6, 24, -6); c.fill();  // snout
  c.strokeStyle = col; c.lineWidth = 3; c.lineCap = 'round';                       // horns
  c.beginPath(); c.moveTo(-6, -10); c.quadraticCurveTo(-26, -26, -14, -34); c.stroke();
  c.beginPath(); c.moveTo(-12, -6); c.quadraticCurveTo(-34, -14, -30, -26); c.stroke();
  c.globalAlpha = 0.24; c.lineWidth = 1.6;                                          // whiskers
  c.beginPath(); c.moveTo(30, 4); c.bezierCurveTo(60, 10, 80, -10 + Math.sin(t * 4) * 6, 108, 6); c.stroke();
  c.beginPath(); c.moveTo(28, 8); c.bezierCurveTo(56, 20, 78, 30 + Math.sin(t * 4 + 1) * 6, 104, 26); c.stroke();
  // eye — flares with combat
  c.globalAlpha = 0.7 + react * 0.3; c.shadowColor = '#ff4a28'; c.shadowBlur = 10 + react * 26;
  c.fillStyle = mixHex('#ffd08a', '#ff5230', 0.3 + react * 0.5);
  c.beginPath(); c.arc(2, -3, 3.4 + react * 1.6, 0, Math.PI * 2); c.fill();
  c.restore();
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
  const x = 210 - game.camera.x * 0.05, y = 76;
  const openness = clamp(day * game.eyeBlink, 0, 1);
  // outer socket haze (smaller, subtler — moves with the eye on one plane)
  c.globalAlpha = 0.4; c.fillStyle = 'rgba(255,120,80,.05)';
  c.beginPath(); c.ellipse(x, y, 60, 22, 0, 0, Math.PI * 2); c.fill();
  // lid outline
  c.globalAlpha = 0.62; c.lineWidth = 2.2;
  c.strokeStyle = day > 0.5 ? 'rgba(255,210,120,.6)' : 'rgba(141,202,255,.34)';
  c.beginPath(); c.ellipse(x, y, 45, 15 * (0.16 + openness * 0.84), 0, 0, Math.PI * 2); c.stroke();
  if (openness > 0.05) {
    const react = game.eyeReact;
    c.globalAlpha = openness;
    c.shadowColor = '#ff4a28'; c.shadowBlur = 18 + react * 22;
    c.fillStyle = '#1a0509'; c.beginPath(); c.ellipse(x, y, 12.5, 13 * openness, 0, 0, Math.PI * 2); c.fill();
    const iris = c.createRadialGradient(x, y, 1, x, y, 13);
    iris.addColorStop(0, react > 0.02 ? '#fff1c8' : '#ffd08a'); iris.addColorStop(0.4, '#f0452c'); iris.addColorStop(1, '#8a1810');
    c.fillStyle = iris; c.beginPath(); c.ellipse(x, y, 5 + react * 3, 13 * openness, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff0d0'; c.beginPath(); c.arc(x - 2.5, y - 3.5 * openness, 1.5, 0, Math.PI * 2); c.fill();
  }
  c.restore(); c.globalAlpha = 1; c.shadowBlur = 0;
}

// AutoSprite parallax props (loaded lazily; transparent PNGs)
const propImgs: Record<string, HTMLImageElement> = {};
const propReady: Record<string, boolean> = {};
let propsInit = false;
function ensureProps() {
  if (propsInit) return; propsInit = true;
  for (const n of ['pagoda', 'shishi', 'pine', 'stele', 'palace', 'crystal', 'spikes_rock', 'spikes_ice', 'terrain_top', 'terrain_fill']) {
    const im = new Image(); im.onload = () => (propReady[n] = true); im.src = 'assets/sprites/props/' + n + '.png'; propImgs[n] = im;
  }
}
// reusable offscreen buffer for tinting a prop toward the haze (atmospheric
// perspective) so it reads as part of its depth plane, not a bright sticker.
let _tintCv: HTMLCanvasElement | null = null, _tintCtx: CanvasRenderingContext2D | null = null;
function drawPropImg(c: CanvasRenderingContext2D, name: string, cx: number, baseY: number, targetH: number, alpha: number, tint?: string, tintAmt = 0) {
  const img = propImgs[name]; if (!img || !propReady[name]) return;
  const scale = targetH / img.height, w = img.width * scale;
  const src = tint && tintAmt > 0 ? tintedSprite(img, name, tint, tintAmt) : img;   // cached — no per-frame re-tint
  c.globalAlpha = alpha; c.drawImage(src, cx - w / 2, baseY - targetH, w, targetH); c.globalAlpha = 1;
}

// Three-slice: end caps render at native aspect, the middle TILES a clean strip
// — any width renders without stretching (a mini sprite-kit from one image).
export function drawThreeSlice(
  c: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number },
  x: number, y: number, w: number, h: number, capFrac = 0.26, mid: [number, number] = [0.4, 0.6],
) {
  const iw = img.width, ih = img.height, s = h / ih;
  const srcCap = iw * capFrac;
  let capW = srcCap * s;
  if (capW * 2 > w) capW = w / 2;
  c.drawImage(img, 0, 0, srcCap, ih, x, y, capW, h);                              // left cap
  c.drawImage(img, iw - srcCap, 0, srcCap, ih, x + w - capW, y, capW, h);         // right cap
  // the strips' mid regions are pre-processed tile-seamless (roll + crossfade
  // in the asset), so plain repetition is join-free
  const m0 = iw * mid[0], mw = iw * (mid[1] - mid[0]), dstMw = Math.max(4, mw * s);
  for (let dx2 = x + capW; dx2 < x + w - capW - 0.5; dx2 += dstMw) {              // tiled middle
    const dw2 = Math.min(dstMw, x + w - capW - dx2);
    c.drawImage(img, m0, 0, mw * (dw2 / dstMw), ih, dx2, y, dw2, h);
  }
}

// PERF: tinted-sprite cache. Re-tinting a full image per draw call was the #1
// frame cost — now each (image, tint, amount) renders ONCE to its own canvas.
const _tintCache = new Map<string, HTMLCanvasElement>();
function tintedSprite(img: CanvasImageSource & { width: number; height: number }, name: string, tint: string, tintAmt: number): HTMLCanvasElement {
  const key = name + '|' + tint + '|' + tintAmt.toFixed(2);
  let cvs = _tintCache.get(key);
  if (cvs) return cvs;
  cvs = document.createElement('canvas');
  cvs.width = img.width; cvs.height = img.height;
  const tc = cvs.getContext('2d')!;
  tc.drawImage(img, 0, 0);
  tc.globalCompositeOperation = 'source-atop'; tc.globalAlpha = tintAmt; tc.fillStyle = tint; tc.fillRect(0, 0, cvs.width, cvs.height);
  if (_tintCache.size > 220) _tintCache.clear();          // safety valve
  _tintCache.set(key, cvs);
  return cvs;
}
// draw an arbitrary image tinted toward a colour (atmospheric), at dw×dh
function drawTintedStill(c: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, dx: number, dy: number, dw: number, dh: number, tint: string, tintAmt: number, alpha: number, name = 'img') {
  c.globalAlpha = alpha; c.drawImage(tintedSprite(img, name, tint, tintAmt), dx, dy, dw, dh); c.globalAlpha = 1;
}

// PERF: cached radial glow sprites (one 96px canvas per colour) — replaces the
// per-frame createRadialGradient calls that peppered the lighting/pickup paths.
const _glowCache = new Map<string, HTMLCanvasElement>();
export function glowSprite(color: string): HTMLCanvasElement {
  let g = _glowCache.get(color);
  if (g) return g;
  g = document.createElement('canvas'); g.width = g.height = 96;
  const gc = g.getContext('2d')!;
  const grad = gc.createRadialGradient(48, 48, 0, 48, 48, 48);
  grad.addColorStop(0, color); grad.addColorStop(1, 'rgba(0,0,0,0)');
  gc.fillStyle = grad; gc.fillRect(0, 0, 96, 96);
  _glowCache.set(color, g);
  return g;
}
/** Additive glow at (x,y) radius r — cheap cached-sprite replacement for radial gradients. */
export function drawGlow(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = alpha;
  c.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  c.restore();
}
// smooth multi-octave ridgeline height at world-x
function ridgeH(wx: number, layer: number) {
  return Math.sin(wx * 0.006 + layer) * 0.6 + Math.sin(wx * 0.017 + layer * 2) * 0.28 + Math.sin(wx * 0.043 + layer) * 0.12;
}

// Layered rolling mountains (vertical + horizontal parallax) + sprite props + fog.
export function drawParallax(game: Game, c: CanvasRenderingContext2D) {
  const th = theme(game), day = game.dayAmount;
  const haze = mixHex(th.hazeNight, th.haze, day);
  const ridge = mixHex(th.ridgeNight, th.ridge, day);
  // PERF: tint colours for cached sprites use a QUANTIZED day (9 steps) so the
  // cache stays small and stable through the day/night blink transition
  const qday = Math.round(day * 8) / 8;
  const hazeQ = mixHex(th.hazeNight, th.haze, qday);
  const ridgeQ = mixHex(th.ridgeNight, th.ridge, qday);

  // Layer 4: distant MOUNTAINS — an AutoSprite ink-wash range (monochrome with
  // detail), tinted to the haze and tiled across, drifting slowly behind.
  const mtn = stills.mountains;
  if (mtn?.ready) {
    const img = mtn.img, par = 0.07, sc = game.camera.x * par, voff = game.camera.y * par;
    const H = 216, W = img.width * (H / img.height), y0 = 300 - H - voff;
    const start = -(((sc % W) + W) % W);
    for (let x = start; x < LOGICAL_W + W; x += W) drawTintedStill(c, img, x, y0, W, H, mixHex(ridgeQ, hazeQ, 0.72), 0.55, 1, 'mtn');
  }

  // Layer 3: nearer HILLS — a single darker procedural ridge in front of the range.
  const PARS = [0.15];
  const BASE = [360];
  const AMP = [78];
  const N = PARS.length;
  const skyLight = day > 0.5 ? '#ffdcae' : '#bcd2ff';    // colour the crest catches from the sky
  const nearDark = mixHex(ridge, '#050308', 0.5);        // deep silhouette for the closest ridges
  for (let layer = 0; layer < N; layer++) {
    const par = PARS[layer], sc = game.camera.x * par, voff = game.camera.y * par;
    const y0 = BASE[layer] - voff, amp = AMP[layer];
    const far = N > 1 ? 1 - layer / (N - 1) : 0.28;        // hills sit near-ish (darker), just ahead of the range
    // collect the ridgeline, tracking the highest crest for the fill gradient
    const pts: { x: number; y: number }[] = []; let crest = LOGICAL_H;
    for (let x = -20; x <= LOGICAL_W + 20; x += 10) { const y = y0 - amp * (0.5 + 0.5 * ridgeH(x + sc, layer)); pts.push({ x, y }); if (y < crest) crest = y; }
    // strong depth value-ramp: nearest ridge is near-black, farthest melts into haze
    const base = mixHex(nearDark, haze, far);
    const grad = c.createLinearGradient(0, crest - 6, 0, LOGICAL_H);
    grad.addColorStop(0, mixHex(base, skyLight, 0.16 + far * 0.12));   // lit crest
    grad.addColorStop(0.45, base);
    grad.addColorStop(1, mixHex(base, '#000', 0.32 - far * 0.24));     // shadowed foot
    c.globalAlpha = 1; c.fillStyle = grad;                            // opaque → clean occlusion between planes
    c.beginPath(); c.moveTo(-20, LOGICAL_H + 4);
    for (const p of pts) c.lineTo(p.x, p.y);
    c.lineTo(LOGICAL_W + 20, LOGICAL_H + 4); c.closePath(); c.fill();
    // a soft haze wash pooling just under each crest — separates it from the plane behind
    c.save(); c.globalCompositeOperation = 'screen'; c.globalAlpha = 0.10 + far * 0.16;
    const hz = c.createLinearGradient(0, crest - 4, 0, crest + 46);
    hz.addColorStop(0, mixHex(haze, skyLight, far * 0.4)); hz.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = hz; c.beginPath(); c.moveTo(-20, crest + 60); for (const p of pts) c.lineTo(p.x, p.y); c.lineTo(LOGICAL_W + 20, crest + 60); c.closePath(); c.fill();
    c.restore();
    // bright rim-light along every crest so each silhouette pops
    c.globalAlpha = 0.5 + far * 0.35;
    c.strokeStyle = mixHex(base, skyLight, 0.6); c.lineWidth = 1.5;
    c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke();
  }
  c.globalAlpha = 1;

  // drifting mist banks weaving between the distant ridges (mystery + depth)
  c.save(); c.globalCompositeOperation = 'screen';
  const tint = day > 0.5 ? '236,192,162' : '150,178,222';
  for (let i = 0; i < 7; i++) {
    const bx = ((i * 250 + game.time * (7 + i * 2.2)) % (LOGICAL_W + 460)) - 230;
    const by = 296 + (i % 3) * 42 + Math.sin(game.time * 0.2 + i) * 10 - game.camera.y * 0.08;
    const r = 130 + (i % 3) * 64;
    const g = c.createRadialGradient(bx, by, 0, bx, by, r);
    g.addColorStop(0, `rgba(${tint},${0.07 + (i % 3) * 0.015})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(bx, by, r, r * 0.42, 0, 0, Math.PI * 2); c.fill();
  }
  c.restore();

  // Prop layers, drawn back-to-front over the hills:
  //  Layer 2 — distant BUILDINGS (pagoda / dwelling / lantern / stele) on the hills
  //  Layer 1 — nearer, LARGER TREES in front of everything
  // Each band tints toward its depth's ridge/haze so it blends into the plane.
  ensureProps();
  const hillCol = mixHex(nearDark, haze, 0.24);            // matches the hills plane
  // trees thin out or cluster depending on the level (stable per level)
  const treeSkip = 0.28 + hash(Math.floor(game.level.width * 0.17) + 5) * 0.34;
  const propBands = [
    // layer 2 — distant buildings: heavily washed toward the haze so they read as far away
    { par: 0.24, baseY: 346, h: 88, alpha: 0.82, step: 500, seed: 7, tintMix: 0.72, tintAmt: 0.68, sizeVar: 0.36, skip: 0.55, mound: true, set: ['pagoda', 'palace', 'shishi', 'stele'] },
    // layer 1 — nearer trees: more of their own detail, a touch bigger, sparser
    { par: 0.52, baseY: 426, h: 196, alpha: 0.98, step: 360, seed: 23, tintMix: 0.22, tintAmt: 0.13, sizeVar: 0.6, skip: treeSkip, mound: false, set: ['pine'] },
  ];
  for (const b of propBands) {
    const sc = game.camera.x * b.par, voff = game.camera.y * b.par;
    const tintCol = mixHex(ridgeQ, hazeQ, b.tintMix);
    const first = Math.floor((sc - 340) / b.step), last = Math.ceil((sc + LOGICAL_W + 340) / b.step);
    for (let i = first; i <= last; i++) {
      if (hash(i * 13 + b.seed) > b.skip) continue;
      const name = b.set[Math.floor(hash(i * 7 + b.seed) * b.set.length)];
      const sx = i * b.step + hash(i * 3 + b.seed) * 150 - sc;
      const th2 = b.h * (0.82 + hash(i * 5 + b.seed) * b.sizeVar);
      const by = b.baseY - voff;
      // buildings sit on a hill spur so they read as part of the landscape
      if (b.mound) {
        const hw = th2 * (0.9 + hash(i * 9 + b.seed) * 0.5), lift = 6 + hash(i * 4 + b.seed) * 10;
        c.fillStyle = hillCol;
        c.beginPath();
        c.moveTo(sx - hw, by + 70);
        c.bezierCurveTo(sx - hw * 0.5, by - lift, sx - hw * 0.18, by - lift - 4, sx, by - lift - 2);
        c.bezierCurveTo(sx + hw * 0.22, by - lift - 4, sx + hw * 0.55, by - lift, sx + hw, by + 70);
        c.closePath(); c.fill();
      }
      const alpha = name === 'pine' ? Math.max(b.alpha, 0.95) : b.alpha;
      drawPropImg(c, name, sx, by + (b.mound ? 4 : 0), th2, alpha, tintCol, b.tintAmt);
    }
  }

  // hanging lantern string (the SVG paifang building is retired — sprites now)
  drawLanternString(game, c, day);

  // foreground floor fog
  c.save(); c.globalCompositeOperation = 'screen'; c.globalAlpha = 0.5;
  const gg = c.createLinearGradient(0, LOGICAL_H - 90, 0, LOGICAL_H);
  gg.addColorStop(0, 'rgba(0,0,0,0)'); gg.addColorStop(1, `rgba(${day > 0.5 ? '210,150,120' : '120,150,200'},0.14)`);
  c.fillStyle = gg; c.fillRect(0, LOGICAL_H - 90, LOGICAL_W, 90);
  c.restore(); c.globalAlpha = 1;
}

// Fast foreground parallax (Shadow of the Beast): bold dark silhouettes that
// rush past IN FRONT of the action — swaying reed clumps rising from the bottom
// and leafy vines hanging from the top. Drawn over the world, under the HUD.
export function drawForeground(game: Game, c: CanvasRenderingContext2D) {
  const grass = stills.fgrass, hang = stills.fhang;
  if (!grass?.ready || !hang?.ready) return;
  const t = game.time, par = 1.5, sc = game.camera.x * par;   // >1 → rushes past faster than the play plane
  c.save();
  c.filter = 'brightness(0.32) saturate(0.8)';               // dark silhouette
  // sparse framing only — mostly top vine curtains; a rare low grass tuft at the
  // very bottom edge. Never fills the play area.
  const step = 560, first = Math.floor((sc - 360) / step), last = Math.ceil((sc + LOGICAL_W + 360) / step);
  for (let i = first; i <= last; i++) {
    if (hash(i * 17) > 0.7) continue;                         // big gaps between clumps
    const x = i * step - sc + hash(i * 7) * 260, pick = hash(i * 3), sway = Math.sin(t + i) * 0.04;
    if (pick < 0.7) {
      // vine curtain hanging from the very top — only the top ~90px shows
      const w = 150 + hash(i * 5) * 110, h = hang.img.height * (w / hang.img.width);
      c.globalAlpha = 0.85; c.save(); c.translate(x, -h * 0.6); c.rotate(sway * 0.5); c.drawImage(hang.img, -w / 2, 0, w, h); c.restore();
    } else {
      // low grass tuft peeking up from the bottom edge (mostly off-screen)
      const w = 130 + hash(i * 5) * 90, h = grass.img.height * (w / grass.img.width);
      c.globalAlpha = 0.6; c.save(); c.translate(x, LOGICAL_H + h * 0.74); c.rotate(sway); c.drawImage(grass.img, -w / 2, -h, w, h); c.restore();
    }
  }
  c.filter = 'none'; c.globalAlpha = 1;
  c.restore();
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
  const tt = theme(game);
  const x0 = Math.floor(game.camera.x / TILE) - 1, x1 = Math.ceil((game.camera.x + LOGICAL_W) / TILE) + 1;
  const y0 = Math.floor(game.camera.y / TILE) - 1, y1 = Math.ceil((game.camera.y + LOGICAL_H) / TILE) + 1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const ch = game.tileAt(x, y); if (ch === '.' || ch === '#' || ch === 'g') continue;
    const sx = x * TILE - game.camera.x, sy = y * TILE - game.camera.y;
    if (ch === 'o') {
      // one-way platform → grassy terrain island sprite spanning the whole run
      if (game.tileAt(x - 1, y) === 'o') continue;              // draw once per run, at its left end
      let run = 1; while (game.tileAt(x + run, y) === 'o') run++;
      const runW = run * TILE, spr = stills.platform;
      if (spr?.ready) {
        // three-slice strip: caps keep shape, middle tiles — no stretching at any width
        c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 8;
        drawThreeSlice(c, spr.img, sx - 6, sy - 2, runW + 12, 44, 0.15, [0.3, 0.7]); c.restore();
      } else {
        c.fillStyle = mixHex(tt.soilTop, tt.soilBot, 0.4); c.fillRect(sx, sy + 4, runW, 8);
        c.fillStyle = tt.grass; c.fillRect(sx, sy, runW, 5);
      }
    }
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

  // ---- ROCK body: seamless AutoSprite fill texture, world-anchored + tinted
  // to the act's palette (replaces the old gradient/speckle/strata) ----
  c.save();
  c.beginPath(); traceTop(); c.lineTo(rightX, bottom); c.lineTo(leftX, bottom); c.closePath();
  const fillImg = propImgs['terrain_fill'];
  if (fillImg && propReady['terrain_fill']) {
    c.clip();
    const pat = c.createPattern(fillImg, 'repeat')!;
    const ox = -(((camX % 256) + 256) % 256), oy = -(((camY % 256) + 256) % 256);
    c.save(); c.translate(ox, oy);
    c.fillStyle = pat; c.fillRect(leftX - ox - 8, minY - 24 - oy, rightX - leftX + 16, bottom - minY + 60);
    c.restore();
    // theme wash so each act keeps its palette over the neutral rock
    c.globalAlpha = 0.42; c.fillStyle = mixHex(th.soilTop, th.soilBot, 0.45);
    c.fillRect(leftX - 8, minY - 24, rightX - leftX + 16, bottom - minY + 60);
    c.globalAlpha = 1;
    // darken with depth
    const dg = c.createLinearGradient(0, minY, 0, minY + 320);
    dg.addColorStop(0, 'rgba(0,0,0,0)'); dg.addColorStop(1, 'rgba(0,0,0,.5)');
    c.fillStyle = dg; c.fillRect(leftX - 8, minY - 24, rightX - leftX + 16, bottom - minY + 60);
  } else {
    const g = c.createLinearGradient(0, minY, 0, minY + 300);
    g.addColorStop(0, th.soilTop); g.addColorStop(1, th.soilBot);
    c.fillStyle = g; c.fill();
    c.clip();
  }
  // glowing mineral veins in the act's accent colour, faintly shimmering
  c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = th.accent; c.lineWidth = 1.6; c.lineCap = 'round';
  for (let x = a; x <= b; x++) {
    if (hash(x * 29 + 3) > 0.16) continue;
    c.globalAlpha = 0.22 + 0.18 * Math.sin(game.time * 1.6 + x);
    let vx = x * TILE + 10 - camX, vy = surfY(x) + 34;
    c.beginPath(); c.moveTo(vx, vy);
    for (let seg = 0; seg < 4; seg++) { vx += (hash(x * 7 + seg) - 0.5) * 22; vy += 24; c.lineTo(vx, vy); }
    c.stroke();
    c.fillStyle = th.accent; c.globalAlpha *= 1.3; c.beginPath(); c.arc(vx, vy, 1.8, 0, Math.PI * 2); c.fill();   // crystal node
  }
  c.restore(); c.globalAlpha = 1;
  // buried glowing crystal clusters (AutoSprite) with a soft aura
  for (let x = a; x <= b; x++) {
    if (hash(x * 41 + 17) > 0.055) continue;
    const cxp = x * TILE + 16 - camX, cyp = surfY(x) + 54 + hash(x * 13) * 80;
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.28 + 0.16 * Math.sin(game.time * 2 + x);
    const gl = c.createRadialGradient(cxp, cyp - 14, 0, cxp, cyp - 14, 42); gl.addColorStop(0, mixHex(th.accent, '#ffd88a', 0.4)); gl.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gl; c.beginPath(); c.arc(cxp, cyp - 14, 42, 0, Math.PI * 2); c.fill(); c.restore(); c.globalAlpha = 1;
    drawPropImg(c, 'crystal', cxp, cyp, 32 + hash(x * 3) * 16, 0.92);
  }
  c.restore();

  // ---- GRASS ribbon: the seamless AutoSprite strip drawn ALONG the smooth
  // undulating surface — narrow slices, each rotated to the local slope, with a
  // world-anchored texture coordinate so it never pops as the camera moves ----
  const topImg = propImgs['terrain_top'];
  if (topImg && propReady['terrain_top']) {
    // PERF: 12px slices, rotation only on real slopes, no save/restore per slice
    const dstH = 34, scale = dstH / topImg.height, step = 12, TW = topImg.width, TH = topImg.height;
    const surfAt = (sx: number) => {                      // interpolate the surface polyline at screen-x
      if (sx <= pts[0].x) return pts[0].y;
      for (let i = 1; i < pts.length; i++) if (sx <= pts[i].x) { const p0 = pts[i - 1], p1 = pts[i]; const t = (sx - p0.x) / Math.max(1e-6, p1.x - p0.x); return p0.y + (p1.y - p0.y) * t; }
      return pts[pts.length - 1].y;
    };
    c.save();
    for (let sx = leftX; sx < rightX; sx += step) {
      const w2 = Math.min(step, rightX - sx);
      const y0 = surfAt(sx), y1 = surfAt(sx + w2);
      const ang = Math.atan2(y1 - y0, w2);
      let su = ((sx + camX) / scale) % TW; if (su < 0) su += TW;
      const srcW = (w2 + 1.5) / scale;                    // slight overlap hides slice joins
      const flat = Math.abs(ang) < 0.03;                  // flats draw direct — no transform churn
      if (!flat) { c.save(); c.translate(sx, y0); c.rotate(ang); }
      const dx0 = flat ? sx : 0, dy0 = flat ? y0 - 7 : -7;
      if (su + srcW <= TW) c.drawImage(topImg, su, 0, srcW, TH, dx0, dy0, w2 + 1.5, dstH);
      else {                                              // texture wrap: split the slice
        const w1s = (TW - su) * scale;
        c.drawImage(topImg, su, 0, TW - su, TH, dx0, dy0, w1s, dstH);
        c.drawImage(topImg, 0, 0, srcW - (TW - su), TH, dx0 + w1s, dy0, w2 + 1.5 - w1s, dstH);
      }
      if (!flat) c.restore();
    }
    // theme wash so the green strip follows each act's palette
    c.save(); c.beginPath(); traceTop();
    for (let i = pts.length - 1; i >= 0; i--) c.lineTo(pts[i].x, pts[i].y + dstH - 7);
    c.closePath(); c.clip();
    c.globalAlpha = 0.44; c.fillStyle = th.grass; c.fillRect(leftX, minY - 10, rightX - leftX, 200);
    c.restore(); c.globalAlpha = 1;
  } else {
    const gt = 12;
    c.save(); c.beginPath(); traceTop();
    for (let i = pts.length - 1; i >= 0; i--) c.lineTo(pts[i].x, pts[i].y + gt);
    c.closePath();
    const gg = c.createLinearGradient(0, minY - 2, 0, minY + gt + 6);
    gg.addColorStop(0, mixHex(th.grass, '#e8ffb0', 0.35)); gg.addColorStop(1, th.grassLo);
    c.fillStyle = gg; c.fill(); c.restore();
  }
  // bright top highlight + blades
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  c.strokeStyle = mixHex(th.grass, '#f0ffc0', 0.5); c.lineWidth = 1.4; c.beginPath(); traceTop(); c.stroke();
  // lush wind-blown blades: varied height/tint, plus a gust wave rippling across
  for (let x = a; x <= b; x++) {
    const wx = x * TILE, sy = surfY(x);
    for (let k = 0; k < 5; k++) {
      const bx = wx + 3 + k * 6 - camX;
      const gust = Math.sin(game.time * 1.7 + (wx + k * 6) * 0.028) * 1.0 + Math.sin(game.time * 0.7 + wx * 0.012) * 1.6;
      const hgt = 7 + hash(x * 7 + k * 3) * 7, sway = gust * (hgt / 9);
      c.lineWidth = 1.1 + hash(x * 3 + k) * 0.6;
      c.strokeStyle = mixHex(th.grassLo, mixHex(th.grass, '#eaffb4', 0.3), hash(x * 11 + k));
      c.beginPath(); c.moveTo(bx, sy + 2); c.quadraticCurveTo(bx + sway * 0.6, sy - hgt * 0.5, bx + sway * 1.5, sy - hgt); c.stroke();
    }
  }
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

// Legend-true hazards: '^' Mount-Zhong rock crags, 'S' frost shards (the dragon's
// winter breath), 'F' torch-fire (the Torch Dragon's flame).
function drawHazard(game: Game, c: CanvasRenderingContext2D, x: number, y: number, ch: string) {
  const active = game.isHazardChar(ch);
  c.save();
  c.globalAlpha = active ? 1 : 0.22;
  if (ch === 'F') {
    // torch-fire — layered animated flame tongues
    const n = 3;
    for (let i = 0; i < n; i++) {
      const fx = x + 6 + i * ((TILE - 12) / (n - 1));
      const flick = active ? Math.sin(game.time * 12 + i * 2 + x) * 3 : 0;
      const hgt = (active ? 24 : 12) + (active ? Math.sin(game.time * 16 + i) * 4 : 0);
      const g = c.createLinearGradient(0, y + TILE, 0, y + TILE - hgt);
      g.addColorStop(0, 'rgba(255,120,40,.15)'); g.addColorStop(0.5, active ? '#ff7a2a' : '#7a4020'); g.addColorStop(1, active ? '#ffe08a' : '#caa');
      c.fillStyle = g;
      if (active) { c.shadowColor = '#ff7a2a'; c.shadowBlur = 12; }
      c.beginPath(); c.moveTo(fx - 5, y + TILE); c.quadraticCurveTo(fx - 4 + flick, y + TILE - hgt * 0.5, fx + flick, y + TILE - hgt);
      c.quadraticCurveTo(fx + 4 + flick, y + TILE - hgt * 0.5, fx + 5, y + TILE); c.closePath(); c.fill();
    }
    c.restore(); c.globalAlpha = 1; return;
  }
  // rock crags ('^') / frost shards ('S') — 2D side-view sprites, tiled across the run
  const key = ch === 'S' ? 'spikes_ice' : 'spikes_rock';
  const img = propImgs[key];
  if (img && propReady[key]) {
    const ti = Math.round((x + game.camera.x) / TILE);
    const per = 6, sw = img.width / per, si = ((ti % per) + per) % per;
    const dh = 30, wob = active && ch === 'S' ? Math.sin(game.time * 4 + x) * 1 : 0;
    if (active && ch === 'S') { c.shadowColor = '#8ed7ff'; c.shadowBlur = 8; }
    c.drawImage(img, si * sw, 0, sw, img.height, x - 2, y + TILE - dh + wob, TILE + 4, dh);
  } else {
    c.fillStyle = ch === 'S' ? '#8ed7ff' : '#8a7c7c';
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(x + i * 8, y + TILE); c.lineTo(x + i * 8 + 4, y + 6); c.lineTo(x + i * 8 + 8, y + TILE); c.fill(); }
  }
  c.restore(); c.globalAlpha = 1;
}

export function drawWind(game: Game, c: CanvasRenderingContext2D) {
  const col = game.world === 'day' ? '255,225,150' : '190,235,255';
  for (const z of game.level.windZones || []) {
    const sx = z.x - game.camera.x, sy = z.y - game.camera.y;
    if (sx > LOGICAL_W || sx + z.w < 0) continue;
    c.save();
    c.beginPath(); c.rect(sx, sy, z.w, z.h); c.clip();          // keep the effect inside the shaft
    // faint upward wash — the updraft reads as a soft column of light
    const wash = c.createLinearGradient(0, sy + z.h, 0, sy);
    wash.addColorStop(0, `rgba(${col},0)`); wash.addColorStop(1, `rgba(${col},${game.world === 'day' ? 0.05 : 0.09})`);
    c.fillStyle = wash; c.fillRect(sx, sy, z.w, z.h);
    // smooth thin streaks rising and fading (no jitter, gentle sway)
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    const N = Math.max(5, Math.round(z.w / 26));
    for (let i = 0; i < N; i++) {
      const lane = sx + (i + 0.5) * (z.w / N) + Math.sin(game.time * 0.8 + i) * 6;
      const len = 46 + (i % 3) * 22;
      const yv = sy + z.h - (((i * 90 + game.time * 130) % (z.h + len)));   // travels up, loops
      const a = game.world === 'day' ? 0.16 : 0.26;
      const g = c.createLinearGradient(0, yv + len, 0, yv);
      g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(0.5, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
      c.strokeStyle = g; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(lane, yv + len); c.lineTo(lane + Math.sin(game.time + i) * 3, yv); c.stroke();
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
    // PERF: cached glow sprites — zero gradient allocation per frame
    const glow = (x: number, y: number, r: number, col: string, a: number) => {
      c.globalAlpha = a * night;
      c.drawImage(glowSprite(col), x - r, y - r, r * 2, r * 2);
    };
    const p = game.player;
    glow(p.x - game.camera.x + p.w / 2, p.y - game.camera.y + p.h / 2, 150, 'rgba(150,200,255,.6)', 0.9);
    for (const s of game.level.shrines) glow(s.x - game.camera.x + 13, s.y - game.camera.y + 24, 120, 'rgba(255,200,120,.7)', 0.9);
    for (const cp of game.level.checkpoints) glow(cp.x - game.camera.x + 12, cp.y - game.camera.y + 16, 90, 'rgba(255,150,120,.6)', 0.7);
    for (const r of game.level.relics) if (!game.save.relics.includes(r.id)) glow(r.x - game.camera.x + 11, r.y - game.camera.y + 11, 90, 'rgba(255,220,120,.8)', 0.9);
    for (const e of game.enemies) glow(e.x - game.camera.x + e.w / 2, e.y - game.camera.y + e.h / 2, 84, e.glowColor(game), 0.8);
    if (game.boss && game.boss.alive) glow(game.boss.x - game.camera.x + game.boss.w / 2, game.boss.y - game.camera.y + 30, 200, 'rgba(255,140,90,.5)', 0.8);
    for (const pr of game.projectiles) glow(pr.x - game.camera.x, pr.y - game.camera.y, pr.kind === 'blast' ? 70 : 46, pr.hostile ? 'rgba(255,120,80,.7)' : 'rgba(255,200,120,.7)', 0.7);
    c.restore(); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  } else {
    c.save(); c.globalCompositeOperation = 'lighter';
    const sx = 772 - game.camera.x * 0.04;
    c.globalAlpha = game.dayAmount;
    c.drawImage(glowSprite('rgba(255,200,120,.18)'), sx - 440, 92 - 440, 880, 880);
    c.restore(); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
}

export function drawVignette(c: CanvasRenderingContext2D) {
  const g = c.createRadialGradient(LOGICAL_W / 2, LOGICAL_H / 2, LOGICAL_H * 0.42, LOGICAL_W / 2, LOGICAL_H / 2, LOGICAL_H * 0.9);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.36)');
  c.fillStyle = g; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
}

// Bootstrap: fixed-timestep loop, canvas sizing for device pixel ratio,
// and portrait-orientation handling for mobile.
import { LOGICAL_W, LOGICAL_H } from './types.js';
import { Game } from './game.js';
import { loadSprites } from './spritedata.js';
import { levels, loadCustomLevels } from './content.js';

loadSprites();

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', { alpha: false })!;   // opaque backbuffer — cheaper compositing

// The logical resolution is fixed; we scale the backing buffer for crisp text
// on high-DPI screens and let CSS `object-fit: contain` handle letterboxing.
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(LOGICAL_W * dpr);
  canvas.height = Math.round(LOGICAL_H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
}
window.addEventListener('resize', resize);
resize();

// Mobile: kill double-tap-to-zoom and pinch-zoom. iOS Safari ignores both
// user-scalable=no and touch-action for these gestures, so guard them in JS.
let _lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  const now = performance.now();
  if (now - _lastTouchEnd < 350) e.preventDefault();
  _lastTouchEnd = now;
}, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());

// Force fullscreen / immersive on mobile + tablets. The Fullscreen API needs a
// user gesture and works on Android and iPadOS 16.4+; iPhone Safari (which lacks
// element fullscreen) falls back to the web-app meta tags + address-bar hiding.
const _coarse = !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
if (_coarse) {
  const goFullscreen = () => {
    const el = document.documentElement as any;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen || el.msRequestFullscreen;
    try {
      if (req && !(document as any).fullscreenElement && !(document as any).webkitFullscreenElement) {
        const p = req.call(el); if (p && p.catch) p.catch(() => {});
      }
    } catch {}
    try { (screen.orientation as any)?.lock?.('landscape')?.catch?.(() => {}); } catch {}
    window.scrollTo(0, 1);   // nudge older mobile browsers to hide the URL bar
  };
  const arm = () => goFullscreen();
  window.addEventListener('pointerdown', arm, { passive: true });
  window.addEventListener('touchend', arm, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(goFullscreen, 250));
}

const game = new Game(ctx);

// Optional deep-link for testing/sharing: index.html?level=0..3 jumps straight in.
const _q = new URLSearchParams(location.search);
// Shrine Forge playtest: the editor stores a draft level in localStorage
if (_q.has('playtest')) {
  try {
    const d = JSON.parse(localStorage.getItem('wtdb-draft') || '');
    if (d && Array.isArray(d.tiles) && d.spawn) { d.custom = true; levels.push(d); game.startLevel(levels.length - 1, false); }
  } catch { /* no draft */ }
}
// published Custom Trails (assets/levels/) appear in Level Select once loaded
loadCustomLevels().catch(() => {});
if (_q.has('level')) {
  const n = Math.max(0, Math.min(25, parseInt(_q.get('level') || '0') || 0));
  game.startLevel(n, false);
  if (_q.has('night')) game.tryToggleWorld(true);
  if (_q.has('dragon')) game.player.dragonTime = 12;
  if (_q.has('transform')) game.transformT = 1.05;
  if (_q.has('clear')) game.completeLevel();
  if (_q.has('bossdeath')) game.onBossDefeated();
  if (_q.has('bdp')) {   // hold the boss-death cinematic at a given progress for screenshots
    const pv = Math.max(0, Math.min(0.99, parseFloat(_q.get('bdp') || '0.75')));
    const hold = () => { game.bossDeathT = 3.2 * (1 - pv); if (pv > 0.62) game.bossClimax = true; requestAnimationFrame(hold); };
    hold();
  }
}
// dev aid: force-show the touch controls on non-touch devices for layout testing
if (_q.has('touch')) document.body.classList.add('force-touch');
if (_q.has('levelselect')) { game.save.highestUnlocked = 25; game.save.foundHidden = [24, 25]; (game as any).state = 'levelSelect'; }
if (_q.has('lightning')) { const h = () => { (game as any).lightningT = 0.3; (game as any).lightningX = 400; requestAnimationFrame(h); }; h(); }
if (_q.has('nova')) { const h = () => { (game as any).novaT = 0.42; const p = game.player; (game as any).novaX = p.x + p.w / 2; (game as any).novaY = p.y + p.h / 2; requestAnimationFrame(h); }; h(); }
if (_q.has('death')) { const h = () => { (game as any).deathT = 0.65; const p = game.player; (game as any).deathX = p.x + p.w / 2; (game as any).deathY = p.y + p.h / 2; requestAnimationFrame(h); }; h(); }
if (_q.has('bridge')) { setTimeout(() => { const b = (game as any).bridges[0]; if (b) { game.player.x = b.x + b.w / 2; game.player.y = b.y - game.player.h; } }, 150); }
if (_q.has('guqin')) { (game as any).startGuqin(1); }
if (_q.has('dawn')) { (game as any).startDawn(1); }
if (_q.has('lantern')) { (game as any).startLantern(1); }
if (_q.has('fps')) game.showFps = true;
// dev aid: hold an aim pose for screenshots — ?pose=up|updiag|down|downdiag
if (_q.has('pose')) {
  const m: Record<string, [number, number]> = { up: [0, -1], updiag: [0.7, -0.7], down: [0, 1], downdiag: [0.7, 0.7] };
  const v = m[_q.get('pose') || 'up'] || [0, -1];
  const hook = () => { game.input.stickX = v[0]; game.input.stickY = v[1]; game.player.attackTimer = 1; if (v[1] > 0) game.player.grounded = false; requestAnimationFrame(hook); };
  hook();
}

const STEP = 1 / 60;
let last = performance.now();
let accumulator = 0;

function loop(now: number) {
  let dt = (now - last) / 1000;
  last = now;
  // avoid spiral-of-death after a tab is backgrounded
  if (dt > 0.25) dt = STEP;
  accumulator += dt;
  let guard = 0;
  while (accumulator >= STEP && guard++ < 5) { game.update(STEP); accumulator -= STEP; }
  game.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// expose for quick console debugging
(window as any).__dragon = game;

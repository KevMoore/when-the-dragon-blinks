// Bootstrap: fixed-timestep loop, canvas sizing for device pixel ratio,
// and portrait-orientation handling for mobile.
import { LOGICAL_W, LOGICAL_H } from './types.js';
import { Game } from './game.js';
import { loadSprites } from './spritedata.js';

loadSprites();

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

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

const game = new Game(ctx);

// Optional deep-link for testing/sharing: index.html?level=0..3 jumps straight in.
const _q = new URLSearchParams(location.search);
if (_q.has('level')) {
  const n = Math.max(0, Math.min(3, parseInt(_q.get('level') || '0') || 0));
  game.startLevel(n, false);
  if (_q.has('night')) game.tryToggleWorld(true);
  if (_q.has('dragon')) game.player.dragonTime = 12;
  if (_q.has('transform')) game.transformT = 1.05;
}
// dev aid: force-show the touch controls on non-touch devices for layout testing
if (_q.has('touch')) document.body.classList.add('force-touch');

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

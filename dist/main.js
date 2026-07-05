// Bootstrap: fixed-timestep loop, canvas sizing for device pixel ratio,
// and portrait-orientation handling for mobile.
import { LOGICAL_W, LOGICAL_H } from './types.js';
import { Game } from './game.js';
import { loadSprites } from './spritedata.js';
loadSprites();
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
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
    if (now - _lastTouchEnd < 350)
        e.preventDefault();
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
    if (_q.has('night'))
        game.tryToggleWorld(true);
    if (_q.has('dragon'))
        game.player.dragonTime = 12;
    if (_q.has('transform'))
        game.transformT = 1.05;
    if (_q.has('clear'))
        game.completeLevel();
    if (_q.has('bossdeath'))
        game.onBossDefeated();
}
// dev aid: force-show the touch controls on non-touch devices for layout testing
if (_q.has('touch'))
    document.body.classList.add('force-touch');
// dev aid: hold an aim pose for screenshots — ?pose=up|updiag|down|downdiag
if (_q.has('pose')) {
    const m = { up: [0, -1], updiag: [0.7, -0.7], down: [0, 1], downdiag: [0.7, 0.7] };
    const v = m[_q.get('pose') || 'up'] || [0, -1];
    const hook = () => { game.input.stickX = v[0]; game.input.stickY = v[1]; game.player.attackTimer = 1; if (v[1] > 0)
        game.player.grounded = false; requestAnimationFrame(hook); };
    hook();
}
const STEP = 1 / 60;
let last = performance.now();
let accumulator = 0;
function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    // avoid spiral-of-death after a tab is backgrounded
    if (dt > 0.25)
        dt = STEP;
    accumulator += dt;
    let guard = 0;
    while (accumulator >= STEP && guard++ < 5) {
        game.update(STEP);
        accumulator -= STEP;
    }
    game.render();
    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
// expose for quick console debugging
window.__dragon = game;
//# sourceMappingURL=main.js.map
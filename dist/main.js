// Bootstrap: fixed-timestep loop, canvas sizing for device pixel ratio,
// and portrait-orientation handling for mobile.
import { LOGICAL_W, LOGICAL_H } from './types.js';
import { Game } from './game.js';
import { loadSprites } from './spritedata.js';
import { levels, loadCustomLevels } from './content.js';
loadSprites();
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false }); // opaque backbuffer — cheaper compositing
// PERF (Chrome): shadowBlur rasterizes on the CPU per draw call and we had ~70
// call sites — Chrome tanked while Safari coped. Kill it globally; the additive
// cached glow sprites carry the soft-light look instead.
try {
    Object.defineProperty(ctx, 'shadowBlur', { get: () => 0, set: () => { } });
}
catch { /* stubbed ctx */ }
// The logical resolution is fixed; we scale the backing buffer for crisp text
// on high-DPI screens and let CSS `object-fit: contain` handle letterboxing.
// PERF: `dprScale` is the adaptive-quality knob — canvas fill rate is the
// bottleneck on Chrome (Safari's canvas has ~3× the effective fill rate), so
// when frame times can't hold 60fps we shrink the backing buffer instead of
// dropping frames. CSS scaling keeps the on-screen size identical.
let dprScale = 1;
function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1) * dprScale;
    canvas.width = Math.round(LOGICAL_W * dpr);
    canvas.height = Math.round(LOGICAL_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    // Integer-snapped display geometry: `object-fit: contain` alone leaves the
    // canvas at a fractional scale/offset, and Chrome's compositor shows hairline
    // seams and edge artifacts on fractionally-placed canvas layers (Safari
    // doesn't). Size and position the element to whole CSS pixels ourselves.
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.min(vw / LOGICAL_W, vh / LOGICAL_H);
    const w = Math.round(LOGICAL_W * s), h = Math.round(LOGICAL_H * s);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.style.position = 'absolute';
    canvas.style.left = Math.round((vw - w) / 2) + 'px';
    canvas.style.top = Math.round((vh - h) / 2) + 'px';
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
// Force fullscreen / immersive on mobile + tablets. The Fullscreen API needs a
// user gesture and works on Android and iPadOS 16.4+; iPhone Safari (which lacks
// element fullscreen) falls back to the web-app meta tags + address-bar hiding.
const _coarse = !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
if (_coarse) {
    const goFullscreen = () => {
        const el = document.documentElement;
        const req = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen || el.msRequestFullscreen;
        try {
            if (req && !document.fullscreenElement && !document.webkitFullscreenElement) {
                const p = req.call(el);
                if (p && p.catch)
                    p.catch(() => { });
            }
        }
        catch { }
        try {
            screen.orientation?.lock?.('landscape')?.catch?.(() => { });
        }
        catch { }
        window.scrollTo(0, 1); // nudge older mobile browsers to hide the URL bar
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
        if (d && Array.isArray(d.tiles) && d.spawn) {
            d.custom = true;
            levels.push(d);
            game.startLevel(levels.length - 1, false);
        }
    }
    catch { /* no draft */ }
}
// published Custom Trails (assets/levels/) appear in Level Select once loaded
loadCustomLevels().catch(() => { });
if (_q.has('level')) {
    const n = Math.max(0, Math.min(25, parseInt(_q.get('level') || '0') || 0));
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
    if (_q.has('bdp')) { // hold the boss-death cinematic at a given progress for screenshots
        const pv = Math.max(0, Math.min(0.99, parseFloat(_q.get('bdp') || '0.75')));
        const hold = () => { game.bossDeathT = 3.2 * (1 - pv); if (pv > 0.62)
            game.bossClimax = true; requestAnimationFrame(hold); };
        hold();
    }
}
// dev aid: force-show the touch controls on non-touch devices for layout testing
if (_q.has('touch'))
    document.body.classList.add('force-touch');
if (_q.has('levelselect')) {
    game.save.highestUnlocked = 25;
    game.save.foundHidden = [24, 25];
    game.state = 'levelSelect';
}
if (_q.has('lightning')) {
    const h = () => { game.lightningT = 0.3; game.lightningX = 400; requestAnimationFrame(h); };
    h();
}
if (_q.has('nova')) {
    const h = () => { game.novaT = 0.42; const p = game.player; game.novaX = p.x + p.w / 2; game.novaY = p.y + p.h / 2; requestAnimationFrame(h); };
    h();
}
if (_q.has('death')) {
    const h = () => { game.deathT = 0.65; const p = game.player; game.deathX = p.x + p.w / 2; game.deathY = p.y + p.h / 2; requestAnimationFrame(h); };
    h();
}
if (_q.has('bridge')) {
    setTimeout(() => { const b = game.bridges[0]; if (b) {
        game.player.x = b.x + b.w / 2;
        game.player.y = b.y - game.player.h;
    } }, 150);
}
if (_q.has('guqin')) {
    game.startGuqin(1);
}
if (_q.has('dawn')) {
    game.startDawn(1);
}
if (_q.has('lantern')) {
    game.startLantern(1);
}
if (_q.has('fps'))
    game.showFps = true;
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
// Adaptive quality: watch real frame spacing and shrink the backing buffer
// while the browser can't hold ~60fps (recovering back up when it clearly can).
// Stepping up is deliberately sticky (3 consecutive fast windows + 30s apart):
// an oscillating resolution reads as the whole scene "re-rendering".
let frameCount = 0, slowFrames = 0, fastFrames = 0, lastQualityChange = 0, fastWindows = 0;
function tuneQuality(dt, now) {
    frameCount++;
    if (dt > 0.021)
        slowFrames++; // missed the 60fps budget
    if (dt < 0.0175)
        fastFrames++;
    if (frameCount < 90)
        return false; // judge over ~1.5s windows
    const slow = slowFrames / frameCount, fast = fastFrames / frameCount;
    frameCount = slowFrames = fastFrames = 0;
    fastWindows = fast > 0.95 ? fastWindows + 1 : 0;
    if (slow > 0.2 && dprScale > 0.5 && now - lastQualityChange > 5000) {
        dprScale = Math.max(0.5, dprScale - 0.25); // struggling → drop resolution a notch
        lastQualityChange = now;
        resize();
        return true;
    }
    if (fastWindows >= 3 && dprScale < 1 && now - lastQualityChange > 30000) {
        dprScale = Math.min(1, dprScale + 0.25); // comfortably fast → try stepping back up
        lastQualityChange = now;
        fastWindows = 0;
        resize();
        return true;
    }
    return false;
}
function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    // avoid spiral-of-death after a tab is backgrounded
    if (dt > 0.25)
        dt = STEP;
    const resized = tuneQuality(dt, now);
    accumulator += dt;
    let guard = 0, stepped = false;
    while (accumulator >= STEP && guard++ < 5) {
        game.update(STEP);
        accumulator -= STEP;
        stepped = true;
    }
    // Only paint when the simulation advanced: on 120Hz displays (where Chrome
    // runs rAF at full rate but Safari caps at 60) re-rendering an unchanged
    // world would double the fill cost for nothing. A resize is the exception —
    // it wipes the backing buffer, and the wiped canvas must NEVER reach the
    // compositor, so repaint in the same task.
    if (stepped || resized)
        game.render();
    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
// window resizes also reallocate (and wipe) the buffer — repaint immediately
window.addEventListener('resize', () => game.render());
// expose for quick console debugging
window.__dragon = game;
//# sourceMappingURL=main.js.map
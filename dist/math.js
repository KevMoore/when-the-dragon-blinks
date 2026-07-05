// Small math + geometry helpers shared across the game.
export function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}
export function lerp(a, b, t) {
    return a + (b - a) * t;
}
/** Framerate-independent exponential smoothing. `rate` ~ how fast (higher = snappier). */
export function damp(a, b, rate, dt) {
    return lerp(a, b, 1 - Math.exp(-rate * dt));
}
/** Move `a` toward `b` by at most `step`. */
export function approach(a, b, step) {
    if (a < b)
        return Math.min(a + step, b);
    if (a > b)
        return Math.max(a - step, b);
    return b;
}
export function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
export function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
export function easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
export function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
export function centerX(r) { return r.x + r.w / 2; }
export function centerY(r) { return r.y + r.h / 2; }
export function rand(min, max) { return min + Math.random() * (max - min); }
export function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
export function oneOf(items) { return items[Math.floor(Math.random() * items.length)]; }
export function sign(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; }
/** Mix two "#rrggbb" colors by t in [0,1]. */
export function mixHex(a, b, t) {
    const pa = parseHex(a), pb = parseHex(b);
    const r = Math.round(lerp(pa[0], pb[0], t));
    const g = Math.round(lerp(pa[1], pb[1], t));
    const bl = Math.round(lerp(pa[2], pb[2], t));
    return `rgb(${r},${g},${bl})`;
}
function parseHex(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
//# sourceMappingURL=math.js.map
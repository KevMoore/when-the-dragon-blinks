// Small math + geometry helpers shared across the game.

export type Rect = { x: number; y: number; w: number; h: number };

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
/** Framerate-independent exponential smoothing. `rate` ~ how fast (higher = snappier). */
export function damp(a: number, b: number, rate: number, dt: number) {
  return lerp(a, b, 1 - Math.exp(-rate * dt));
}
/** Move `a` toward `b` by at most `step`. */
export function approach(a: number, b: number, step: number) {
  if (a < b) return Math.min(a + step, b);
  if (a > b) return Math.max(a - step, b);
  return b;
}
export function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }
export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
export function easeOutBack(t: number) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
export function overlap(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
export function centerX(r: Rect) { return r.x + r.w / 2; }
export function centerY(r: Rect) { return r.y + r.h / 2; }
export function rand(min: number, max: number) { return min + Math.random() * (max - min); }
export function randInt(min: number, max: number) { return Math.floor(rand(min, max + 1)); }
export function oneOf<T>(items: T[]): T { return items[Math.floor(Math.random() * items.length)]; }
export function sign(v: number) { return v < 0 ? -1 : v > 0 ? 1 : 0; }

/** Mix two "#rrggbb" colors by t in [0,1]. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a), pb = parseHex(b);
  const r = Math.round(lerp(pa[0], pb[0], t));
  const g = Math.round(lerp(pa[1], pb[1], t));
  const bl = Math.round(lerp(pa[2], pb[2], t));
  return `rgb(${r},${g},${bl})`;
}
function parseHex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

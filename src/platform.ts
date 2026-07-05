// Runtime moving / crumbling platforms. Positions are in pixels.
import { TILE } from './types.js';
import type { MovingPlatform, WorldState } from './types.js';

export class Platform {
  x: number; y: number; w: number; h = TILE;
  private ox: number; private oy: number;
  ax: number; ay: number; speed: number; phase: number;
  state?: WorldState;
  crumble: boolean;
  // per-frame delta so the game can carry riders
  dx = 0; dy = 0;
  // crumble state machine
  touched = false; fallTimer = 0; vy = 0; gone = false; respawn = 0; shakeT = 0;

  constructor(d: MovingPlatform) {
    this.x = d.x; this.y = d.y; this.w = d.w;
    this.ox = d.x; this.oy = d.y;
    this.ax = d.ax; this.ay = d.ay; this.speed = d.speed; this.phase = d.phase;
    this.state = d.state; this.crumble = !!d.crumble;
  }

  solidNow(world: WorldState) {
    if (this.gone) return false;
    if (this.state && this.state !== world) return false;
    return true;
  }
  rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  update(dt: number, time: number) {
    const px = this.x, py = this.y;
    if (this.crumble) {
      if (this.gone) {
        this.respawn -= dt;
        if (this.respawn <= 0) { this.gone = false; this.touched = false; this.y = this.oy; this.vy = 0; }
      } else if (this.touched) {
        this.shakeT += dt;
        this.fallTimer -= dt;
        if (this.fallTimer <= 0) {
          this.vy += 1400 * dt;
          this.y += this.vy * dt;
          if (this.y > this.oy + 640) { this.gone = true; this.respawn = 2.4; }
        }
      }
    } else {
      // sinusoidal travel (slightly quicker for more timing pressure)
      const t = time * this.speed * 1.3 + this.phase;
      this.x = this.ox + Math.sin(t) * this.ax;
      this.y = this.oy + Math.sin(t) * this.ay;
    }
    this.dx = this.x - px; this.dy = this.y - py;
  }

  touch() {
    if (this.crumble && !this.touched) { this.touched = true; this.fallTimer = 0.3; }
  }
}

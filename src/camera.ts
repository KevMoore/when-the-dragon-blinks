// Smoothed follow camera with lookahead and trauma-based shake.
import { clamp, damp, lerp, rand } from './math.js';
import { LOGICAL_W, LOGICAL_H, TILE } from './types.js';

export class Camera {
  x = 0; y = 0;
  private lookX = 0;          // smoothed horizontal lookahead
  private trauma = 0;         // 0..1; shake = trauma^2
  shakeX = 0; shakeY = 0;
  enabled = true;             // respects reduced-motion / shake setting

  snap(x: number, y: number) { this.x = x; this.y = y; this.lookX = 0; }

  addTrauma(amount: number) { this.trauma = clamp(this.trauma + amount, 0, 1); }

  follow(px: number, py: number, facing: number, vx: number, levelW: number, levelH: number, dt: number) {
    const maxX = Math.max(0, levelW * TILE - LOGICAL_W);
    const maxY = Math.max(0, levelH * TILE - LOGICAL_H);
    // Lookahead blends facing + velocity so the camera leads the runner.
    const desiredLook = facing * 70 + clamp(vx, -260, 260) * 0.28;
    this.lookX = damp(this.lookX, desiredLook, 6, dt);
    const targetX = clamp(px - LOGICAL_W * 0.42 + this.lookX, 0, maxX);
    const targetY = clamp(py - LOGICAL_H * 0.56, 0, maxY);
    this.x = damp(this.x, targetX, 9, dt);
    this.y = damp(this.y, targetY, 7, dt);
  }

  update(dt: number) {
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    if (this.enabled) {
      const s = this.trauma * this.trauma;
      const mag = 14 * s;
      this.shakeX = rand(-mag, mag);
      this.shakeY = rand(-mag, mag);
    } else { this.shakeX = 0; this.shakeY = 0; }
  }
}

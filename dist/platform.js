// Runtime moving / crumbling platforms. Positions are in pixels.
import { TILE } from './types.js';
export class Platform {
    constructor(d) {
        this.h = TILE;
        // per-frame delta so the game can carry riders
        this.dx = 0;
        this.dy = 0;
        // crumble state machine
        this.touched = false;
        this.fallTimer = 0;
        this.vy = 0;
        this.gone = false;
        this.respawn = 0;
        this.shakeT = 0;
        this.x = d.x;
        this.y = d.y;
        this.w = d.w;
        this.ox = d.x;
        this.oy = d.y;
        this.ax = d.ax;
        this.ay = d.ay;
        this.speed = d.speed;
        this.phase = d.phase;
        this.state = d.state;
        this.crumble = !!d.crumble;
    }
    solidNow(world) {
        if (this.gone)
            return false;
        if (this.state && this.state !== world)
            return false;
        return true;
    }
    rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
    update(dt, time) {
        const px = this.x, py = this.y;
        if (this.crumble) {
            if (this.gone) {
                this.respawn -= dt;
                if (this.respawn <= 0) {
                    this.gone = false;
                    this.touched = false;
                    this.y = this.oy;
                    this.vy = 0;
                }
            }
            else if (this.touched) {
                this.shakeT += dt;
                this.fallTimer -= dt;
                if (this.fallTimer <= 0) {
                    this.vy += 1400 * dt;
                    this.y += this.vy * dt;
                    if (this.y > this.oy + 640) {
                        this.gone = true;
                        this.respawn = 2.4;
                    }
                }
            }
        }
        else {
            // sinusoidal travel
            const t = time * this.speed + this.phase;
            this.x = this.ox + Math.sin(t) * this.ax;
            this.y = this.oy + Math.sin(t) * this.ay;
        }
        this.dx = this.x - px;
        this.dy = this.y - py;
    }
    touch() {
        if (this.crumble && !this.touched) {
            this.touched = true;
            this.fallTimer = 0.45;
        }
    }
}
//# sourceMappingURL=platform.js.map
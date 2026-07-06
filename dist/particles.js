// Lightweight particle system with a soft cap and typed emitters.
import { clamp, rand } from './math.js';
import { LOGICAL_W, LOGICAL_H } from './types.js';
const MAX_PARTICLES = 620;
export class Particles {
    constructor() {
        this.list = [];
    }
    push(p) {
        if (this.list.length >= MAX_PARTICLES)
            this.list.shift();
        this.list.push(p);
    }
    update(dt) {
        const l = this.list;
        for (let i = 0; i < l.length; i++) {
            const p = l[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            const g = p.grav !== undefined ? p.grav
                : p.kind === 'dust' ? 150 : p.kind === 'mist' ? -12 : p.kind === 'ember' ? -30 : p.kind === 'petal' ? 40 : 70;
            p.vy += g * dt;
            if (p.spin)
                p.rot = (p.rot || 0) + p.spin * dt;
            p.life -= dt;
        }
        // compact in place
        let w = 0;
        for (let i = 0; i < l.length; i++)
            if (l[i].life > 0)
                l[w++] = l[i];
        l.length = w;
    }
    dust(x, y, n) {
        for (let i = 0; i < n; i++)
            this.push({ x, y, vx: rand(-95, 95), vy: rand(-80, -10), life: rand(.25, .6), maxLife: .6, size: rand(2, 5), kind: 'dust' });
    }
    sparks(x, y, n, color) {
        for (let i = 0; i < n; i++) {
            const a = rand(0, Math.PI * 2), s = rand(60, 240);
            this.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(.25, .8), maxLife: .8, size: rand(2, 4), kind: 'spark', color });
        }
    }
    hit(x, y, n, color = '#ff5c49') {
        for (let i = 0; i < n; i++) {
            const a = rand(0, Math.PI * 2), s = rand(90, 360);
            this.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(.18, .6), maxLife: .6, size: rand(2, 6), kind: 'hit', color });
        }
    }
    ring(x, y, n, speed, color) {
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            this.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .55, maxLife: .55, size: rand(3, 5), kind: 'spark', color, grav: 0 });
        }
    }
    embers(x, y, n) {
        for (let i = 0; i < n; i++)
            this.push({ x: x + rand(-4, 4), y, vx: rand(-14, 14), vy: rand(-40, -14), life: rand(.8, 1.6), maxLife: 1.6, size: rand(1.5, 3), kind: 'ember' });
    }
    mist(x, y, n) {
        for (let i = 0; i < n; i++)
            this.push({ x, y, vx: rand(-18, 18), vy: rand(-120, -50), life: rand(.6, 1.1), maxLife: 1.1, size: rand(3, 7), kind: 'mist' });
    }
    stars(w) {
        if (Math.random() < 0.7)
            this.push({ x: rand(0, w), y: rand(80, 460), vx: rand(-8, 8), vy: rand(-6, -1), life: rand(2, 5), maxLife: 5, size: rand(1, 2.5), kind: 'star' });
    }
    petal(w, world) {
        if (Math.random() < 0.5) {
            const ember = world === 'day';
            this.push({ x: rand(0, w), y: -10, vx: rand(-30, 10), vy: rand(20, 55), life: rand(4, 7), maxLife: 7, size: rand(2, 4), kind: ember ? 'petal' : 'glow', spin: rand(-2, 2), rot: rand(0, 6.28), color: ember ? '#ffcf7a' : '#a9d6ff' });
        }
    }
    // Per-act ambient weather, emitted in world space around the camera view.
    ambient(type, camX, camY) {
        const R = rand, sx = () => camX + R(-40, LOGICAL_W + 40), topY = camY - 24, botY = camY + LOGICAL_H + 24;
        if (type === 'snow') {
            if (Math.random() < 0.95)
                this.push({ x: sx(), y: topY, vx: R(-16, 16), vy: R(24, 58), grav: 3, life: R(7, 13), maxLife: 13, size: R(1.6, 3.4), kind: 'petal', color: '#eef4ff', spin: R(-1, 1), rot: R(0, 6.28) });
        }
        else if (type === 'petal') {
            if (Math.random() < 0.5)
                this.push({ x: sx(), y: topY, vx: R(-34, 6), vy: R(20, 44), grav: 7, life: R(6, 10), maxLife: 10, size: R(2.4, 4.2), kind: 'petal', color: Math.random() < 0.5 ? '#ffc7d8' : '#ffd9a8', spin: R(-2.5, 2.5), rot: R(0, 6.28) });
        }
        else if (type === 'ash') {
            if (Math.random() < 0.75)
                this.push({ x: sx(), y: topY, vx: R(-10, 10), vy: R(12, 30), grav: 2, life: R(7, 12), maxLife: 12, size: R(1.4, 3), kind: 'petal', color: '#7a7480', spin: R(-1, 1), rot: R(0, 6.28) });
        }
        else if (type === 'ember') {
            if (Math.random() < 0.7)
                this.push({ x: sx(), y: botY, vx: R(-14, 14), vy: R(-54, -22), grav: -12, life: R(3, 6), maxLife: 6, size: R(1.6, 3.4), kind: 'ember', color: '#ff9d4d' });
        }
        else if (type === 'spore') {
            if (Math.random() < 0.5)
                this.push({ x: sx(), y: camY + R(0, LOGICAL_H), vx: R(-7, 7), vy: R(-12, -3), grav: -4, life: R(4, 8), maxLife: 8, size: R(1.4, 2.8), kind: 'glow', color: '#c2a6ff' });
        }
        else if (type === 'firefly') {
            if (Math.random() < 0.4)
                this.push({ x: sx(), y: camY + R(30, LOGICAL_H - 60), vx: R(-12, 12), vy: R(-8, 8), grav: 0, life: R(3, 6), maxLife: 6, size: R(1.6, 3), kind: 'glow', color: '#ffe08a' });
        }
    }
    draw(c, camX, camY, world) {
        for (const p of this.list) {
            const a = clamp(p.life / p.maxLife, 0, 1);
            c.globalAlpha = p.kind === 'glow' || p.kind === 'mist' ? a * 0.6 : a;
            c.fillStyle = p.color
                ?? (p.kind === 'spark' ? (world === 'day' ? '#ffd777' : '#a9d6ff')
                    : p.kind === 'hit' ? '#ff5c49'
                        : p.kind === 'mist' ? '#c8ecff'
                            : p.kind === 'star' ? '#ffe9b1'
                                : p.kind === 'ember' ? '#ff9d4d'
                                    : '#c29b76');
            const x = p.x - camX, y = p.y - camY;
            if (p.kind === 'petal') {
                c.save();
                c.translate(x, y);
                c.rotate(p.rot || 0);
                c.beginPath();
                c.ellipse(0, 0, p.size * 1.6, p.size * 0.7, 0, 0, Math.PI * 2);
                c.fill();
                c.restore();
            }
            else {
                c.beginPath();
                c.arc(x, y, p.size, 0, Math.PI * 2);
                c.fill();
            }
        }
        c.globalAlpha = 1;
    }
    clear() { this.list.length = 0; }
}
//# sourceMappingURL=particles.js.map
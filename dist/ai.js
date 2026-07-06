// A compact Goal-Oriented Action Planner (GOAP) for enemies.
// Each enemy has a Brain: a set of Actions (with symbolic pre/post-conditions),
// a goal, and a fact-reader. Every ~0.5s (or when the current action is
// invalidated) the planner searches action-space for the cheapest sequence that
// reaches the goal, then executes the first action's steering each frame.
// Because attack/approach actions require `threatened:false`, a threatened enemy
// automatically plans a Retreat first — smarter, emergent behaviour.
import { GRAVITY, TILE } from './types.js';
import { centerX, centerY, lerp, rand } from './math.js';
function met(state, req) { for (const k in req)
    if (!!state[k] !== req[k])
        return false; return true; }
function key(f) { return Object.keys(f).sort().map(k => k + (f[k] ? '1' : '0')).join(''); }
/** Dijkstra over symbolic fact-states → cheapest action sequence to the goal. */
export function plan(actions, start, goal) {
    if (met(start, goal))
        return [];
    const open = [{ state: start, path: [], cost: 0 }];
    const seen = new Map();
    let iter = 0;
    while (open.length && iter++ < 300) {
        open.sort((a, b) => a.cost - b.cost);
        const n = open.shift();
        if (met(n.state, goal))
            return n.path;
        const k = key(n.state);
        if (seen.has(k) && seen.get(k) <= n.cost)
            continue;
        seen.set(k, n.cost);
        for (const a of actions) {
            if (!met(n.state, a.pre))
                continue;
            open.push({ state: { ...n.state, ...a.post }, path: [...n.path, a], cost: n.cost + a.cost });
        }
    }
    return [];
}
export class Brain {
    constructor(actions, goal, readFacts) {
        this.actions = actions;
        this.goal = goal;
        this.readFacts = readFacts;
        this.queue = [];
        this.t = 0;
    }
    update(c, dt) {
        this.t -= dt;
        if (this.queue.length === 0 || this.t <= 0) {
            this.queue = plan(this.actions, this.readFacts(c), this.goal);
            this.t = 0.5;
        }
        const a = this.queue[0];
        if (!a)
            return;
        if (a.valid && !a.valid(c)) {
            this.queue = plan(this.actions, this.readFacts(c), this.goal);
            return;
        }
        if (a.run(c, dt))
            this.queue.shift();
    }
}
/** Bresenham-ish sight check: any solid tile between the two points blocks LOS. */
export function lineOfSight(game, x0, y0, x1, y1) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (TILE * 0.5)));
    for (let i = 1; i < steps; i++) {
        const x = x0 + (x1 - x0) * i / steps, y = y0 + (y1 - y0) * i / steps;
        const ch = game.tileAt(Math.floor(x / TILE), Math.floor(y / TILE));
        if (ch === '#' || ch === 'g')
            return false;
    }
    return true;
}
function threatened(c) {
    const p = c.game.player;
    // NOTE: no fear of the dragon — in Zhulong mode every enemy charges in (below)
    return c.e.hp <= 1 || (p.charging && c.dist < 180);
}
// gravity + edge-aware horizontal step for walkers, with auto step-up over low
// ledges, tolerance for small drops, and a stuck-escape hop.
function groundStep(c, desiredVx, dt) {
    const e = c.e, game = c.game, bb = c.bb;
    const dir = Math.sign(desiredVx);
    if (dir !== 0 && e.grounded) {
        const foot = e.y + e.h;
        const frontX = dir > 0 ? e.x + e.w - 2 : e.x - 4;
        // ground within ~1.3 tiles ahead (so small step-downs are fine, only real pits stop us)
        const groundAhead = game.overlapsSolid({ x: frontX, y: foot + 2, w: 6, h: 44 });
        // a low wall/step blocking the body just ahead
        const stepBlocked = game.overlapsSolid({ x: frontX, y: foot - 18, w: 6, h: 16 });
        // is there headroom to hop up onto it?
        const headClear = !game.overlapsSolid({ x: e.x - 2, y: foot - 50, w: e.w + 4, h: 26 });
        if (stepBlocked && headClear)
            e.vy = Math.min(e.vy, -280); // auto-step over a low ledge
        else if (!groundAhead && !stepBlocked)
            desiredVx = 0; // pit with no wall to climb — stop
    }
    e.vx = desiredVx;
    e.vy += GRAVITY * dt;
    const x0 = e.x;
    game.moveEntity(e, e.vx * dt, e.vy * dt);
    // stuck-escape: trying to move but pinned against terrain → hop free
    if (desiredVx !== 0 && Math.abs(e.x - x0) < 0.4) {
        bb.stuckT = (bb.stuckT || 0) + dt;
        if (bb.stuckT > 0.35) {
            if (e.grounded)
                e.vy = -330;
            bb.stuckT = 0;
        }
    }
    else
        bb.stuckT = 0;
}
// ---- brain factories -------------------------------------------------------
export function groundBrain() {
    const NEAR = 48;
    const speed = (c) => (c.e.kind === 'crawler' ? 145 : c.e.kind === 'ghoul' ? (c.game.world === 'night' ? 84 : 56) : 74) * c.game.difficulty;
    const actions = [
        { name: 'retreat', cost: 1, pre: { threatened: true }, post: { threatened: false },
            run(c, dt) { groundStep(c, -Math.sign(c.dx) * 95, dt); c.bb.rt = (c.bb.rt || 0) + dt; if (c.bb.rt > 0.9 || c.dist > 340) {
                c.bb.rt = 0;
                return true;
            } return false; } },
        { name: 'approach', cost: 2, pre: { near: false, threatened: false }, post: { near: true },
            run(c, dt) { groundStep(c, Math.sign(c.dx) * speed(c), dt); return c.dist < NEAR; } },
        { name: 'strike', cost: 1, pre: { near: true, threatened: false }, post: { attacked: true },
            run(c, dt) { groundStep(c, Math.sign(c.dx) * 130, dt); c.bb.st = (c.bb.st || 0) + dt; if (c.bb.st > 0.4) {
                c.bb.st = 0;
                return true;
            } return false; } },
    ];
    return new Brain(actions, { attacked: true }, c => ({ near: c.dist < NEAR, threatened: threatened(c) }));
}
export function rangedBrain() {
    const TOO_CLOSE = 140;
    const fly = (c, vx, dt) => { c.e.x += vx * dt; }; // floating turret, no gravity
    const actions = [
        { name: 'backpedal', cost: 1, pre: { tooClose: true }, post: { tooClose: false },
            run(c, dt) { fly(c, -Math.sign(c.dx) * 90, dt); return c.dist > TOO_CLOSE + 50; } },
        { name: 'seekLOS', cost: 2, pre: { hasLOS: false, tooClose: false }, post: { hasLOS: true },
            run(c, dt) { fly(c, Math.sign(c.dx) * 80, dt); c.e.y += Math.sin(c.game.time * 2) * 20 * dt; return c.los; } },
        { name: 'fire', cost: 1, pre: { hasLOS: true, tooClose: false }, post: { attacked: true },
            run(c, dt) {
                const e = c.e, g = c.game;
                e.fireTimer -= dt;
                if (e.fireTimer <= 0) {
                    e.fireTimer = rand(1.1, 1.8) / c.game.difficulty;
                    const ang = Math.atan2(c.dy, c.dx);
                    g.projectiles.push({ x: centerX(e.rect()), y: centerY(e.rect()), vx: Math.cos(ang) * 250, vy: Math.sin(ang) * 250, r: 7, life: 3, kind: 'shard', hostile: true });
                    g.audio.sfx('attack');
                }
                c.bb.ft = (c.bb.ft || 0) + dt;
                if (c.bb.ft > 1.5) {
                    c.bb.ft = 0;
                    return true;
                }
                return false;
            } },
    ];
    return new Brain(actions, { attacked: true }, c => ({ hasLOS: c.los, tooClose: c.dist < TOO_CLOSE }));
}
export function flyerBrain() {
    const NEAR = 42;
    const actions = [
        { name: 'retreat', cost: 1, pre: { threatened: true }, post: { threatened: false },
            run(c, dt) { const p = c.game.player; const d = c.dist || 1; c.e.x -= (c.dx / d) * 150 * dt; c.e.y -= (c.dy / d) * 150 * dt + 40 * dt; c.bb.rt = (c.bb.rt || 0) + dt; if (c.bb.rt > 0.9 || c.dist > 340) {
                c.bb.rt = 0;
                return true;
            } return false; } },
        { name: 'reposition', cost: 2, pre: { positioned: false, threatened: false }, post: { positioned: true },
            run(c, dt) {
                const p = c.game.player;
                if (c.bb.side === undefined)
                    c.bb.side = Math.random() < 0.5 ? -1 : 1;
                const tx = p.x + p.w / 2 + c.bb.side * 135, ty = p.y + p.h / 2 - 74;
                c.e.x = lerp(c.e.x, tx - c.e.w / 2, 0.05);
                c.e.y = lerp(c.e.y, ty - c.e.h / 2, 0.05);
                if (Math.hypot(tx - centerX(c.e.rect()), ty - centerY(c.e.rect())) < 44) {
                    c.bb.positioned = true;
                    return true;
                }
                return false;
            } },
        { name: 'dive', cost: 1, pre: { positioned: true, threatened: false }, post: { attacked: true, positioned: false },
            run(c, dt) {
                const p = c.game.player;
                const tx = p.x + p.w / 2, ty = p.y + p.h / 2;
                const d = Math.hypot(tx - centerX(c.e.rect()), ty - centerY(c.e.rect())) || 1;
                const ds = 300 * c.game.difficulty;
                c.e.x += (tx - centerX(c.e.rect())) / d * ds * dt;
                c.e.y += (ty - centerY(c.e.rect())) / d * ds * dt;
                c.bb.dt = (c.bb.dt || 0) + dt;
                if (c.bb.dt > 0.6 || d < NEAR) {
                    c.bb.dt = 0;
                    c.bb.side = undefined;
                    c.bb.positioned = false;
                    return true;
                }
                return false;
            } },
    ];
    return new Brain(actions, { attacked: true }, c => ({ positioned: !!c.bb.positioned, threatened: threatened(c) }));
}
//# sourceMappingURL=ai.js.map
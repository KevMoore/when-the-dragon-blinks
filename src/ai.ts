// A compact Goal-Oriented Action Planner (GOAP) for enemies.
// Each enemy has a Brain: a set of Actions (with symbolic pre/post-conditions),
// a goal, and a fact-reader. Every ~0.5s (or when the current action is
// invalidated) the planner searches action-space for the cheapest sequence that
// reaches the goal, then executes the first action's steering each frame.
// Because attack/approach actions require `threatened:false`, a threatened enemy
// automatically plans a Retreat first — smarter, emergent behaviour.
import { GRAVITY, TILE } from './types.js';
import { centerX, centerY, lerp, rand } from './math.js';
import type { Enemy } from './enemy.js';
import type { Game } from './game.js';

export type Facts = Record<string, boolean>;
export type Ctx = { e: Enemy; game: Game; dx: number; dy: number; dist: number; los: boolean; bb: Record<string, any> };

export interface Action {
  name: string; cost: number; pre: Facts; post: Facts;
  valid?(c: Ctx): boolean;             // dynamic guard checked at execution time
  run(c: Ctx, dt: number): boolean;    // steer for one frame; return true when complete
}

function met(state: Facts, req: Facts) { for (const k in req) if (!!state[k] !== req[k]) return false; return true; }
function key(f: Facts) { return Object.keys(f).sort().map(k => k + (f[k] ? '1' : '0')).join(''); }

/** Dijkstra over symbolic fact-states → cheapest action sequence to the goal. */
export function plan(actions: Action[], start: Facts, goal: Facts): Action[] {
  if (met(start, goal)) return [];
  type Node = { state: Facts; path: Action[]; cost: number };
  const open: Node[] = [{ state: start, path: [], cost: 0 }];
  const seen = new Map<string, number>();
  let iter = 0;
  while (open.length && iter++ < 300) {
    open.sort((a, b) => a.cost - b.cost);
    const n = open.shift()!;
    if (met(n.state, goal)) return n.path;
    const k = key(n.state);
    if (seen.has(k) && seen.get(k)! <= n.cost) continue;
    seen.set(k, n.cost);
    for (const a of actions) {
      if (!met(n.state, a.pre)) continue;
      open.push({ state: { ...n.state, ...a.post }, path: [...n.path, a], cost: n.cost + a.cost });
    }
  }
  return [];
}

export class Brain {
  private queue: Action[] = [];
  private t = 0;
  constructor(private actions: Action[], private goal: Facts, private readFacts: (c: Ctx) => Facts) {}
  update(c: Ctx, dt: number) {
    this.t -= dt;
    if (this.queue.length === 0 || this.t <= 0) { this.queue = plan(this.actions, this.readFacts(c), this.goal); this.t = 0.5; }
    const a = this.queue[0];
    if (!a) return;
    if (a.valid && !a.valid(c)) { this.queue = plan(this.actions, this.readFacts(c), this.goal); return; }
    if (a.run(c, dt)) this.queue.shift();
  }
}

/** Bresenham-ish sight check: any solid tile between the two points blocks LOS. */
export function lineOfSight(game: Game, x0: number, y0: number, x1: number, y1: number): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (TILE * 0.5)));
  for (let i = 1; i < steps; i++) {
    const x = x0 + (x1 - x0) * i / steps, y = y0 + (y1 - y0) * i / steps;
    const ch = game.tileAt(Math.floor(x / TILE), Math.floor(y / TILE));
    if (ch === '#' || ch === 'g') return false;
  }
  return true;
}

function threatened(c: Ctx) {
  const p = c.game.player;
  return p.dragonTime > 0 || c.e.hp <= 1 || (p.charging && c.dist < 180);
}

// gravity + edge-aware horizontal step for walkers
function groundStep(c: Ctx, desiredVx: number, dt: number) {
  const e = c.e, game = c.game;
  const dir = Math.sign(desiredVx);
  if (dir !== 0 && e.grounded) {
    const ax = e.x + e.w / 2 + dir * (e.w / 2 + 5);
    const ch = game.tileAt(Math.floor(ax / TILE), Math.floor((e.y + e.h + 4) / TILE));
    if (!(ch === '#' || ch === 'g' || ch === 'D' || ch === 'N' || ch === 'o')) desiredVx = 0;
  }
  e.vx = desiredVx; e.vy += GRAVITY * dt;
  game.moveEntity(e, e.vx * dt, e.vy * dt);
}

// ---- brain factories -------------------------------------------------------
export function groundBrain(): Brain {
  const NEAR = 48;
  const speed = (c: Ctx) => c.e.kind === 'crawler' ? 145 : c.e.kind === 'ghoul' ? (c.game.world === 'night' ? 84 : 56) : 74;
  const actions: Action[] = [
    { name: 'retreat', cost: 1, pre: { threatened: true }, post: { threatened: false },
      run(c, dt) { groundStep(c, -Math.sign(c.dx) * 95, dt); c.bb.rt = (c.bb.rt || 0) + dt; if (c.bb.rt > 0.9 || c.dist > 340) { c.bb.rt = 0; return true; } return false; } },
    { name: 'approach', cost: 2, pre: { near: false, threatened: false }, post: { near: true },
      run(c, dt) { groundStep(c, Math.sign(c.dx) * speed(c), dt); return c.dist < NEAR; } },
    { name: 'strike', cost: 1, pre: { near: true, threatened: false }, post: { attacked: true },
      run(c, dt) { groundStep(c, Math.sign(c.dx) * 130, dt); c.bb.st = (c.bb.st || 0) + dt; if (c.bb.st > 0.4) { c.bb.st = 0; return true; } return false; } },
  ];
  return new Brain(actions, { attacked: true }, c => ({ near: c.dist < NEAR, threatened: threatened(c) }));
}

export function rangedBrain(): Brain {
  const TOO_CLOSE = 140;
  const fly = (c: Ctx, vx: number, dt: number) => { c.e.x += vx * dt; };   // floating turret, no gravity
  const actions: Action[] = [
    { name: 'backpedal', cost: 1, pre: { tooClose: true }, post: { tooClose: false },
      run(c, dt) { fly(c, -Math.sign(c.dx) * 90, dt); return c.dist > TOO_CLOSE + 50; } },
    { name: 'seekLOS', cost: 2, pre: { hasLOS: false, tooClose: false }, post: { hasLOS: true },
      run(c, dt) { fly(c, Math.sign(c.dx) * 80, dt); c.e.y += Math.sin(c.game.time * 2) * 20 * dt; return c.los; } },
    { name: 'fire', cost: 1, pre: { hasLOS: true, tooClose: false }, post: { attacked: true },
      run(c, dt) {
        const e = c.e, g = c.game; e.fireTimer -= dt;
        if (e.fireTimer <= 0) {
          e.fireTimer = rand(1.1, 1.8);
          const ang = Math.atan2(c.dy, c.dx);
          g.projectiles.push({ x: centerX(e.rect()), y: centerY(e.rect()), vx: Math.cos(ang) * 250, vy: Math.sin(ang) * 250, r: 7, life: 3, kind: 'shard', hostile: true });
          g.audio.sfx('attack');
        }
        c.bb.ft = (c.bb.ft || 0) + dt; if (c.bb.ft > 1.5) { c.bb.ft = 0; return true; } return false;
      } },
  ];
  return new Brain(actions, { attacked: true }, c => ({ hasLOS: c.los, tooClose: c.dist < TOO_CLOSE }));
}

export function flyerBrain(): Brain {
  const NEAR = 42;
  const actions: Action[] = [
    { name: 'retreat', cost: 1, pre: { threatened: true }, post: { threatened: false },
      run(c, dt) { const p = c.game.player; const d = c.dist || 1; c.e.x -= (c.dx / d) * 150 * dt; c.e.y -= (c.dy / d) * 150 * dt + 40 * dt; c.bb.rt = (c.bb.rt || 0) + dt; if (c.bb.rt > 0.9 || c.dist > 340) { c.bb.rt = 0; return true; } return false; } },
    { name: 'reposition', cost: 2, pre: { positioned: false, threatened: false }, post: { positioned: true },
      run(c, dt) {
        const p = c.game.player; if (c.bb.side === undefined) c.bb.side = Math.random() < 0.5 ? -1 : 1;
        const tx = p.x + p.w / 2 + c.bb.side * 135, ty = p.y + p.h / 2 - 74;
        c.e.x = lerp(c.e.x, tx - c.e.w / 2, 0.05); c.e.y = lerp(c.e.y, ty - c.e.h / 2, 0.05);
        if (Math.hypot(tx - centerX(c.e.rect()), ty - centerY(c.e.rect())) < 44) { c.bb.positioned = true; return true; } return false;
      } },
    { name: 'dive', cost: 1, pre: { positioned: true, threatened: false }, post: { attacked: true, positioned: false },
      run(c, dt) {
        const p = c.game.player; const tx = p.x + p.w / 2, ty = p.y + p.h / 2;
        const d = Math.hypot(tx - centerX(c.e.rect()), ty - centerY(c.e.rect())) || 1;
        c.e.x += (tx - centerX(c.e.rect())) / d * 300 * dt; c.e.y += (ty - centerY(c.e.rect())) / d * 300 * dt;
        c.bb.dt = (c.bb.dt || 0) + dt;
        if (c.bb.dt > 0.6 || d < NEAR) { c.bb.dt = 0; c.bb.side = undefined; c.bb.positioned = false; return true; } return false;
      } },
  ];
  return new Brain(actions, { attacked: true }, c => ({ positioned: !!c.bb.positioned, threatened: threatened(c) }));
}

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
  // NOTE: no fear of the dragon — in Zhulong mode every enemy charges in (below)
  return c.e.hp <= 1 || (p.charging && c.dist < 180);
}

// gravity + edge-aware horizontal step for walkers, with auto step-up over low
// ledges, tolerance for small drops, and a stuck-escape hop.
function groundStep(c: Ctx, desiredVx: number, dt: number, commit = false) {
  const e = c.e, game = c.game, bb = c.bb;
  if (e.dropThrough) e.dropThrough = Math.max(0, e.dropThrough - dt);
  const dir = Math.sign(desiredVx);
  if (dir !== 0 && e.grounded && !commit) {
    const foot = e.y + e.h;
    const frontX = dir > 0 ? e.x + e.w - 2 : e.x - 4;
    // ground within ~1.3 tiles ahead (so small step-downs are fine, only real pits stop us)
    const groundAhead = game.overlapsSolid({ x: frontX, y: foot + 2, w: 6, h: 44 });
    // a low wall/step blocking the body just ahead — and is it a TALL one?
    const stepBlocked = game.overlapsSolid({ x: frontX, y: foot - 18, w: 6, h: 16 });
    const tallBlocked = game.overlapsSolid({ x: frontX, y: foot - 52, w: 6, h: 30 });
    const headClear = !game.overlapsSolid({ x: e.x - 2, y: foot - 50, w: e.w + 4, h: 26 });
    if (stepBlocked && !tallBlocked && headClear) e.vy = Math.min(e.vy, -300);   // hop a low ledge
    else if (stepBlocked && tallBlocked) e.vy = Math.min(e.vy, -470);            // full jump over a tall obstacle
    else if (!groundAhead && !stepBlocked) {
      // a gap: look for a landing within ~4 tiles and LEAP it instead of stopping
      let landing = false;
      for (let k = 2; k <= 4; k++) if (game.overlapsSolid({ x: frontX + dir * k * TILE, y: foot - 6, w: TILE * 0.8, h: 60 })) { landing = true; break; }
      if (landing) e.vy = Math.min(e.vy, -400);
      else if (c.dy > 40) { /* prey is below — drop off the ledge after it */ }
      else desiredVx = 0;                                                        // bottomless & nothing below — hold the edge
    }
  }
  e.vx = desiredVx; e.vy += GRAVITY * dt;
  const x0 = e.x;
  game.moveEntity(e, e.vx * dt, e.vy * dt);
  // stuck-escape: trying to move but pinned against terrain → hop free
  if (desiredVx !== 0 && Math.abs(e.x - x0) < 0.4) {
    bb.stuckT = (bb.stuckT || 0) + dt;
    if (bb.stuckT > 0.35) { if (e.grounded) e.vy = -330; bb.stuckT = 0; }
  } else bb.stuckT = 0;
}

// ---- surface-graph pathfinding for walkers ----------------------------------
// Nodes are "standable" cells (air with head-room and solid/one-way support
// beneath). Edges: walk (±1 col, small rise/fall), jump up (≤3 rows, with a
// clear vertical corridor), drop off an edge (≤6 rows), and leap a 2–4 tile
// gap. A* over this graph gives walkers real routes to a player on another
// ledge instead of pacing into the wall below him.
function standable(game: Game, x: number, y: number): boolean {
  if (x < 0 || y < 1 || x >= game.level.width || y >= game.level.height - 1) return false;
  const open = (ch: string) => ch !== '#' && ch !== 'g';
  const t = game.tileAt(x, y), a = game.tileAt(x, y - 1), b = game.tileAt(x, y + 1);
  const sup = b === '#' || b === 'g' || b === 'o' || (b === 'D' && game.world === 'day') || (b === 'N' && game.world === 'night');
  return open(t) && open(a) && sup;
}
function corridorOpen(game: Game, x: number, yTop: number, yBot: number): boolean {
  const open = (ch: string) => ch !== '#' && ch !== 'g';
  for (let y = yTop; y <= yBot; y++) if (!open(game.tileAt(x, y))) return false;
  return true;
}
export type NavStep = { x: number; y: number; kind: 'walk' | 'jump' | 'drop' | 'leap' };
export function findGroundPath(game: Game, sx: number, sy: number, tx: number, ty: number, maxNodes = 600): NavStep[] | null {
  if (!standable(game, sx, sy) || !standable(game, tx, ty)) return null;
  const W = game.level.width;
  const id = (x: number, y: number) => y * W + x;
  const h = (x: number, y: number) => Math.abs(tx - x) + Math.abs(ty - y);
  type N = { x: number; y: number; g: number; f: number; from: number; kind: NavStep['kind'] };
  const nodes = new Map<number, N>();
  const open: N[] = [{ x: sx, y: sy, g: 0, f: h(sx, sy), from: -1, kind: 'walk' }];
  nodes.set(id(sx, sy), open[0]);
  let expanded = 0;
  const push = (x: number, y: number, g: number, from: number, kind: NavStep['kind']) => {
    const k = id(x, y), prev = nodes.get(k);
    if (prev && prev.g <= g) return;
    const n = { x, y, g, f: g + h(x, y), from, kind };
    nodes.set(k, n); open.push(n);
  };
  while (open.length && expanded++ < maxNodes) {
    open.sort((a, b) => a.f - b.f);
    const n = open.shift()!;
    if (n.x === tx && n.y === ty) {
      const path: NavStep[] = [];
      let cur: N | undefined = n;
      while (cur && cur.from !== -1) { path.unshift({ x: cur.x, y: cur.y, kind: cur.kind }); cur = nodes.get(cur.from); }
      return path;
    }
    const from = id(n.x, n.y);
    for (const dir of [-1, 1]) {
      const nx = n.x + dir;
      // walk / small step
      for (let k = -1; k <= 1; k++) if (standable(game, nx, n.y + k)) { push(nx, n.y + k, n.g + 1 + Math.abs(k) * 0.3, from, 'walk'); break; }
      // drop off an edge (2..6 rows down)
      for (let d = 2; d <= 6; d++) {
        if (!corridorOpen(game, nx, n.y, n.y + d - 1)) break;
        if (standable(game, nx, n.y + d)) { push(nx, n.y + d, n.g + 1.4 + d * 0.25, from, 'drop'); break; }
      }
      // leap a gap (2..4 columns, near-level landing)
      for (let g2 = 2; g2 <= 4; g2++) {
        const lx = n.x + dir * g2;
        for (let k = -1; k <= 1; k++) if (standable(game, lx, n.y + k)) { push(lx, n.y + k, n.g + 1.6 + g2 * 0.6, from, 'leap'); break; }
      }
      // up-leap: a parabolic hop 1-3 rows up AND 2-4 columns across (ramp →
      // floating platform); requires launch headroom
      for (let u = 1; u <= 3; u++) {
        if (!corridorOpen(game, n.x, n.y - u, n.y - 1)) break;
        for (let g2 = 2; g2 <= 4; g2++) {
          const lx = n.x + dir * g2;
          if (standable(game, lx, n.y - u)) push(lx, n.y - u, n.g + 1.9 + u * 0.7 + g2 * 0.5, from, 'leap');
        }
      }
      // jump up (2..3 rows, onto this or a neighbouring column)
      for (let u = 2; u <= 3; u++) {
        if (!corridorOpen(game, n.x, n.y - u, n.y - 1)) break;
        for (const jx of [n.x, nx]) if (standable(game, jx, n.y - u)) push(jx, n.y - u, n.g + 1.8 + u * 0.8, from, 'jump');
      }
    }
    // climb straight up through a one-way platform overhead
    for (let u = 2; u <= 3; u++) {
      if (!corridorOpen(game, n.x, n.y - u, n.y - 1)) break;
      if (standable(game, n.x, n.y - u)) push(n.x, n.y - u, n.g + 1.6 + u * 0.8, from, 'jump');
    }
  }
  return null;
}
/** The cell an entity is standing in (support may be a row or two below its feet). */
export function cellUnder(game: Game, ex: number, ey: number, w: number, h2: number): { x: number; y: number } | null {
  const cx = Math.floor((ex + w / 2) / TILE);
  const cy = Math.floor((ey + h2 - 4) / TILE);
  for (let d = 0; d <= 3; d++) if (standable(game, cx, cy + d)) return { x: cx, y: cy + d };
  return null;
}

// ---- brain factories -------------------------------------------------------
export function groundBrain(): Brain {
  const NEAR = 48;
  const speed = (c: Ctx) => (c.e.kind === 'crawler' ? 145 : c.e.kind === 'ghoul' ? (c.game.world === 'night' ? 84 : 56) : 74) * c.game.difficulty;
  const actions: Action[] = [
    { name: 'retreat', cost: 1, pre: { threatened: true }, post: { threatened: false },
      run(c, dt) { groundStep(c, -Math.sign(c.dx) * 95, dt); c.bb.rt = (c.bb.rt || 0) + dt; if (c.bb.rt > 0.9 || c.dist > 340) { c.bb.rt = 0; return true; } return false; } },
    { name: 'approach', cost: 2, pre: { near: false, threatened: false }, post: { near: true },
      run(c, dt) {
        const e = c.e, game = c.game, bb = c.bb;
        // (re)plan a route to the player's ledge about once a second
        bb.pathT = (bb.pathT ?? 0) - dt;
        const goal = cellUnder(game, game.player.x, game.player.y, game.player.w, game.player.h);
        if (goal && (bb.pathT <= 0 || !bb.path || bb.pathI >= bb.path.length ||
            !bb.goal || Math.abs(goal.x - bb.goal.x) + Math.abs(goal.y - bb.goal.y) > 2)) {
          const start = cellUnder(game, e.x, e.y, e.w, e.h);
          bb.path = start ? findGroundPath(game, start.x, start.y, goal.x, goal.y) : null;
          bb.pathI = 0; bb.goal = goal; bb.pathT = 0.9;
        }
        const wp: NavStep | undefined = bb.path?.[bb.pathI];
        if (!wp) { groundStep(c, Math.sign(c.dx) * speed(c), dt); return c.dist < NEAR; }   // no route — old heuristics
        const wx = (wp.x + 0.5) * TILE, ex = e.x + e.w / 2;
        const erow = Math.floor((e.y + e.h - 4) / TILE);
        const dxw = wx - ex;
        if (Math.abs(dxw) < 12 && Math.abs(erow - wp.y) <= 1) { bb.pathI++; return c.dist < NEAR; }
        // vertical intent: jump when the waypoint is above and lined up
        // (up-leaps launch from further out), drop through one-way footing
        // when it is below
        const above = wp.y < erow;
        if (above && e.grounded && Math.abs(dxw) < TILE * (wp.kind === 'leap' ? 3.4 : 1.4)) {
          e.vy = -Math.min(680, Math.sqrt(2 * GRAVITY * ((erow - wp.y) * TILE + 24)));
        }
        if (wp.y > erow + 1 && e.grounded) {
          const below = game.tileAt(Math.floor(ex / TILE), erow + 1);
          if (below === 'o' || below === 'D' || below === 'N') e.dropThrough = 0.18;
        }
        // airborne pursuit gets a horizontal boost so slow walkers can carry
        // an up-leap across the gap they planned
        const vmag = e.grounded ? speed(c) : Math.max(speed(c), 165);
        groundStep(c, Math.sign(dxw) * vmag, dt, wp.kind === 'drop' || wp.y > erow);
        return c.dist < NEAR;
      } },
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
          e.fireTimer = rand(1.1, 1.8) / c.game.difficulty;
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
        // rest between dives — circle the perch instead of instantly striking again
        if (c.bb.cool > 0) { c.bb.cool -= dt; return false; }
        if (Math.hypot(tx - centerX(c.e.rect()), ty - centerY(c.e.rect())) < 44) { c.bb.positioned = true; return true; } return false;
      } },
    { name: 'dive', cost: 1, pre: { positioned: true, threatened: false }, post: { attacked: true, positioned: false },
      run(c, dt) {
        const p = c.game.player; const tx = p.x + p.w / 2, ty = p.y + p.h / 2;
        c.bb.dt = (c.bb.dt || 0) + dt;
        // brief hover-telegraph before the lunge (readable, dodgeable)
        if (c.bb.dt < 0.28) { c.e.y += Math.sin(c.bb.dt * 40) * 14 * dt; return false; }
        const d = Math.hypot(tx - centerX(c.e.rect()), ty - centerY(c.e.rect())) || 1;
        const ds = 265 * c.game.difficulty;
        c.e.x += (tx - centerX(c.e.rect())) / d * ds * dt; c.e.y += (ty - centerY(c.e.rect())) / d * ds * dt;
        if (c.bb.dt > 0.85 || d < NEAR) { c.bb.dt = 0; c.bb.side = undefined; c.bb.positioned = false; c.bb.cool = 0.9 + Math.random() * 0.7; return true; } return false;
      } },
  ];
  return new Brain(actions, { attacked: true }, c => ({ positioned: !!c.bb.positioned, threatened: threatened(c) }));
}

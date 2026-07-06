// Level layouts (built with a compact tile grid), plus lore panels and codex.
import { TILE } from './types.js';
import { clamp } from './math.js';
import type { Rect } from './math.js';
import type { LevelData, CodexEntry, LorePanel, MovingPlatform, EntityKind } from './types.js';

// ---- tile grid helpers -----------------------------------------------------
function emptyMap(w: number, h: number): string[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
}
function setTile(map: string[][], x: number, y: number, c: string) {
  if (y >= 0 && y < map.length && x >= 0 && x < map[0].length) map[y][x] = c;
}
function rect(map: string[][], x: number, y: number, w: number, h: number, c: string) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) setTile(map, xx, yy, c);
}
function row(map: string[][], x: number, y: number, w: number, c: string) { rect(map, x, y, w, 1, c); }
function toStrings(map: string[][]): string[] { return map.map(r => r.join('')); }

/** Build continuous rolling ground from stepped segments.
 *  segs: sorted {x, top}; `top` is the grass row for columns >= x until the next
 *  segment. top === null leaves a pit. Grass caps the surface, stone fills below. */
function ground(m: string[][], w: number, h: number, segs: { x: number; top: number | null }[]) {
  let si = 0;
  for (let x = 0; x < w; x++) {
    while (si + 1 < segs.length && segs[si + 1].x <= x) si++;
    const top = segs[si].top;
    if (top === null) continue;
    setTile(m, x, top, 'g');
    for (let y = top + 1; y < h; y++) setTile(m, x, y, '#');
  }
}
function mp(x: number, y: number, w: number, o: Partial<MovingPlatform> = {}): MovingPlatform {
  return { x: x * TILE, y: y * TILE, w: w * TILE, ax: 0, ay: 0, speed: 1, phase: 0, ...o };
}
// torch-gem placed on tile coords (fills the dragon meter when collected)
function gem(tx: number, ty: number) { return { x: tx * TILE, y: ty * TILE }; }

// ============================================================================
// Procedural level arc — 24 levels across 4 acts climbing north to Mount Zhong,
// plus 2 hidden levels. Deterministic (seeded) so a level is identical each run.
// ============================================================================
function rngFor(seed: number) {
  let s = (seed ^ 0x9e3779b9) >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

type Theme = 'mountain' | 'bridge' | 'cavern' | 'sunless';
// Level archetypes — each level in an act plays structurally differently:
//   plains: classic rolling run • ascent: climb-focused, terrain rises
//   chasms: gap/bridge-focused  • ruins: platform maze • wilds: combat gauntlet
type Arch = 'plains' | 'ascent' | 'chasms' | 'ruins' | 'wilds';
interface Spec {
  id: string; name: string; sub: string; act: 1 | 2 | 3 | 4; theme: Theme;
  len: number; diff: number; pal: EntityKind[]; density: number; hazard: number;
  arch?: Arch;
  windy?: boolean; moving?: boolean; crumble?: boolean; miniBoss?: boolean; boss?: boolean;
  hidden?: boolean; secretTo?: number; intro?: string; outro?: string; unlock?: string[]; shrine?: string;
}

function renderTheme(t: Theme): 'mountain' | 'bridge' | 'cavern' | 'sunless' | 'arena' {
  return t;   // each act keeps its own distinct theme/palette
}
// solid ground row at a tile-x (so platforms/gems/hazards sit on the LOCAL
// surface, not the flat base row — otherwise rolling terrain buries them)
function topAt(segs: { x: number; top: number | null }[], tx: number): number {
  let t = 14;
  for (const s of segs) { if (s.x <= tx) { if (s.top !== null) t = s.top; } else break; }
  return t;
}
function isFlyer(k: EntityKind) {
  return k === 'moth' || k === 'wisp' || k === 'skull' || k === 'crow' || k === 'wraith' || k === 'sentry';
}

function buildLevel(spec: Spec, index: number): LevelData {
  if (spec.boss) return buildBoss(spec);
  const r = rngFor(1000 + index * 97);
  const cavern = spec.theme === 'cavern' || spec.theme === 'sunless';
  const h = cavern ? 18 : 17;
  const w = spec.len;
  const gr = h - 3;                                    // base ground row — shallow terrain below (more sky)
  const m = emptyMap(w, h);

  // rolling ground with small (always jumpable) pits — shaped by the archetype
  const arch: Arch = spec.arch ?? 'plains';
  const pitChance = arch === 'chasms' ? 0.42 : arch === 'ascent' ? 0.06 : arch === 'ruins' ? 0.1 : 0.2 + spec.hazard * 0.2;
  const upBias = arch === 'ascent' ? 0.68 : 0.5;       // ascent trends uphill across the level
  const hiTop = arch === 'ascent' ? h - 9 : h - 7;
  const segs: { x: number; top: number | null }[] = [{ x: 0, top: gr }];
  const pits: { x0: number; x1: number }[] = [];
  let top = gr, x = 7;                                 // flat spawn area first
  while (x < w - 10) {
    x += 6 + Math.floor(r() * 7);
    if (x >= w - 10) break;
    if (x > 12 && r() < pitChance) {
      const pw = 3 + Math.floor(r() * 2);              // 3-4 wide, jumpable
      segs.push({ x, top: null }); pits.push({ x0: x, x1: x + pw }); x += pw;
      top = clamp(top + (r() < 0.5 ? -1 : 1), hiTop, h - 3); segs.push({ x, top });
    } else {
      // mostly 1-tile steps (walkable via step-up); occasional 2-tile for a hop
      top = clamp(top + (r() < upBias ? -1 : 1) * (r() < 0.78 ? 1 : 2), hiTop, h - 3);
      segs.push({ x, top });
    }
  }
  ground(m, w, h, segs);
  rect(m, w - 2, 0, 2, h, '#');

  // pit spikes + day/night crossings (blink to make the path)
  for (const p of pits) {
    row(m, p.x0, h - 2, p.x1 - p.x0, '^');
    const t0 = topAt(segs, p.x0 - 1);
    row(m, p.x0, t0 - 2, 2, r() < 0.5 ? 'D' : 'N');
    row(m, p.x1 - 2, t0 - 3, 2, r() < 0.5 ? 'N' : 'D');
  }
  // one-way vantage platforms (above the LOCAL ground) — ruins become a maze
  const vantN = arch === 'ruins' ? 3 + Math.floor(w / 15) : 2 + Math.floor(w / 40);
  for (let i = 0; i < vantN; i++) {
    const px = 12 + Math.floor(r() * (w - 26));
    const py = topAt(segs, px) - 3 - Math.floor(r() * (arch === 'ruins' ? 6 : 3));
    if (py > 3) row(m, px, py, 3 + Math.floor(r() * 2), arch === 'ruins' && r() < 0.3 ? (r() < 0.5 ? 'D' : 'N') : 'o');
  }
  // stateful (day/night) ground hazards (just above the LOCAL surface)
  for (let i = 0, n = Math.floor(spec.hazard * w / 30); i < n; i++) {
    const px = 14 + Math.floor(r() * (w - 26));
    row(m, px, topAt(segs, px) - 1, 3, r() < 0.5 ? 'F' : 'S');
  }

  // gems along the route (fewer, less cluttered)
  const gems: { x: number; y: number }[] = [];
  const gN = 3 + Math.floor(w / 105);
  for (let i = 0; i < gN; i++) { const gx = Math.floor((i + 0.5) / gN * (w - 14)) + 6; gems.push(gem(gx, topAt(segs, gx) - 2 - Math.floor(r() * 2))); }

  // checkpoints (on the LOCAL ground)
  const checkpoints = [];
  for (let cx = 34; cx < w - 12; cx += 44) checkpoints.push({ x: cx * TILE, y: topAt(segs, cx) * TILE - 40, w: 28, h: 56 });

  // moving / crumbling platforms — kept above the LOCAL ground so they never bury
  const platforms: MovingPlatform[] = [];
  if (spec.moving) { const px = Math.floor(w * 0.4); platforms.push(mp(px, topAt(segs, px) - 3, 3, { ax: 4 * TILE, speed: 0.8 + spec.diff * 0.12 })); }
  if (spec.crumble) { const p1 = Math.floor(w * 0.55), p2 = Math.floor(w * 0.72); platforms.push(mp(p1, topAt(segs, p1) - 3, 3, { crumble: true })); platforms.push(mp(p2, topAt(segs, p2) - 4, 3, { crumble: true })); }

  const windZones = spec.windy
    ? [{ x: Math.floor(w * 0.35) * TILE, y: 2 * TILE, w: 8 * TILE, h: (h - 2) * TILE }, { x: Math.floor(w * 0.66) * TILE, y: 2 * TILE, w: 8 * TILE, h: (h - 2) * TILE }]
    : undefined;

  // enemies — day/night hosts drawn from the act palette
  const entities: { kind: EntityKind; x: number; y: number; elite?: boolean }[] = [];
  const eN = Math.round(spec.density * w / 20);
  if (arch === 'wilds') {
    // combat gauntlet: packs of 3-4 at strongpoints, with calm stretches between
    const packs = Math.max(3, Math.round(eN / 3.2));
    for (let pk = 0; pk < packs; pk++) {
      const px = 18 + Math.floor((pk + 0.5) / packs * (w - 40));
      const size = 3 + (r() < 0.4 ? 1 : 0);
      for (let n = 0; n < size; n++) {
        const kind = spec.pal[Math.floor(r() * spec.pal.length)];
        const ex = px + n * 3 + Math.floor(r() * 2);
        entities.push({ kind, x: ex * TILE, y: (isFlyer(kind) ? topAt(segs, ex) - 5 - Math.floor(r() * 3) : topAt(segs, ex) - 2) * TILE });
      }
    }
  } else {
    for (let i = 0; i < eN; i++) {
      const kind = spec.pal[Math.floor(r() * spec.pal.length)];
      const ex = 12 + Math.floor((i + 0.5) / eN * (w - 26)) + Math.floor(r() * 6);
      entities.push({ kind, x: ex * TILE, y: (isFlyer(kind) ? gr - 6 - Math.floor(r() * 3) : gr - 2) * TILE });
    }
  }
  if (spec.miniBoss) entities.push({ kind: 'sentinel', x: Math.floor(w * 0.84) * TILE, y: (gr - 3) * TILE, elite: true });
  else if (arch === 'wilds') entities.push({ kind: spec.act >= 3 ? 'ghoul' : 'guardian', x: Math.floor(w * 0.55) * TILE, y: (topAt(segs, Math.floor(w * 0.55)) - 3) * TILE, elite: true });

  // vertical climb towers: zig-zag stacks of one-way + day/night platforms to
  // ascend, with a gem reward up top and enemies perched along the way
  const climbs = arch === 'ascent' ? 3 + Math.floor(w / 60) : arch === 'chasms' ? 1 : 1 + Math.floor(w / 68);
  for (let ci = 0; ci < climbs; ci++) {
    const ccx = 22 + Math.floor((ci + 0.4) / climbs * (w - 44));
    const base = topAt(segs, ccx), tall = 4 + Math.floor(r() * 3);
    for (let k = 0; k < tall; k++) {
      const py = base - 3 - k * 2; if (py < 2) break;
      const px = ccx + (k % 2 === 0 ? 0 : 4);
      row(m, px, py, 3, k % 3 === 0 ? 'o' : (r() < 0.5 ? 'D' : 'N'));   // blink to climb some rungs
      if (k === tall - 1) gems.push(gem(px + 1, py - 2));
      else if (r() < 0.42) entities.push({ kind: spec.pal[Math.floor(r() * spec.pal.length)], x: (px + 1) * TILE, y: (py - 2) * TILE });
    }
  }

  const bridges: { x: number; y: number; w: number }[] = [];
  // (1) railed plank bridges over real carved chasms (Act II onward; chasm levels get two)
  const chasmSpots = arch === 'chasms' ? [0.32, 0.62] : [0.5];
  if (spec.act >= 2 && w > 112 && !spec.boss) for (const spot of chasmSpots) {
    const gx = Math.floor(w * spot), gw = 6 + Math.floor(r() * 3), gt = topAt(segs, gx - 1);
    for (let cx = gx - 2; cx < gx; cx++) { setTile(m, cx, gt, 'g'); for (let cy = gt + 1; cy < h; cy++) setTile(m, cx, cy, '#'); }
    for (let cx = gx + gw; cx < gx + gw + 2; cx++) { setTile(m, cx, gt, 'g'); for (let cy = gt + 1; cy < h; cy++) setTile(m, cx, cy, '#'); }
    for (let cx = gx; cx < gx + gw; cx++) for (let cy = gt; cy < h; cy++) setTile(m, cx, cy, '.');
    row(m, gx, h - 2, gw, '^');
    bridges.push({ x: gx * TILE - 12, y: gt * TILE, w: gw * TILE + 24 });   // overlap the banks so no edge-gap
  }
  // (2) an aerial run of floating platforms linked by plank bridges (ground stays
  // below, so a fall is survivable). A stepped ramp leads up to it. (Act II onward)
  if (spec.act >= 2 && w > 120 && !spec.boss) {
    const gTop = topAt(segs, Math.floor(w * 0.24)), H = gTop - 4;
    let px = Math.floor(w * 0.20);
    row(m, px - 5, gTop - 2, 3, 'o');                                  // ramp up
    for (let seg = 0; seg < 3; seg++) {
      const platW = 4 + Math.floor(r() * 2);
      row(m, px, H, platW, 'o');                                       // floating platform
      gems.push(gem(px + Math.floor(platW / 2), H - 2));
      if (r() < 0.5) entities.push({ kind: spec.pal[Math.floor(r() * spec.pal.length)], x: (px + 1) * TILE, y: (H - 2) * TILE });
      if (seg < 2) { const gap = 3 + Math.floor(r() * 2); bridges.push({ x: (px + platW) * TILE - 12, y: H * TILE, w: gap * TILE + 24 }); px += platW + gap; }
    }
  }

  // secret exit → a hidden level (a high night-ledge to find)
  let secretExit: Rect | undefined, secretExitTo: number | undefined;
  if (spec.secretTo !== undefined) {
    const sx = Math.floor(w * 0.5), st = topAt(segs, sx);
    row(m, sx, st - 5, 3, 'N'); row(m, sx + 2, st - 8, 3, 'N');
    secretExit = { x: (sx + 2) * TILE, y: (st - 11) * TILE, w: 44, h: 3 * TILE };
    secretExitTo = spec.secretTo;
  }

  // lift any gem that ended up inside/under a solid or platform tile so all are grabbable
  for (const g of gems) {
    let tx = Math.round(g.x / TILE), ty = Math.round(g.y / TILE), guard = 0;
    while (guard++ < 14) {
      const t = m[ty] && m[ty][tx];
      if (t === '#' || t === 'g' || t === 'o' || t === 'D' || t === 'N' || t === '^') { ty -= 1; g.y = ty * TILE; } else break;
    }
  }

  const endTop = segs[segs.length - 1].top ?? gr;
  return {
    id: spec.id, title: spec.name, subtitle: spec.sub, act: spec.act, hidden: spec.hidden, difficulty: spec.diff,
    theme: renderTheme(spec.theme), width: w, height: h, tiles: toStrings(m),
    spawn: { x: 3 * TILE, y: (gr - 3) * TILE }, exit: { x: (w - 4) * TILE, y: (endTop - 6) * TILE, w: 44, h: 6 * TILE },
    checkpoints, relics: [], shrines: spec.shrine ? [{ x: 8 * TILE, y: (gr - 2) * TILE, textId: spec.shrine }] : [],
    entities, gems, bridges, platforms, windZones, secretExit, secretExitTo,
    introLore: spec.intro || '', outroLore: spec.outro || '', unlockCodexOnComplete: spec.unlock || [],
  };
}

function buildBoss(spec: Spec): LevelData {
  const w = 40, h = 18, m = emptyMap(w, h);
  row(m, 0, 16, w, '#'); row(m, 0, 17, w, '#');
  rect(m, 0, 0, 2, 18, '#'); rect(m, w - 2, 0, 2, 18, '#');
  row(m, 6, 12, 4, 'D'); row(m, 30, 12, 4, 'N'); row(m, 17, 10, 6, 'o');
  return {
    id: spec.id, title: spec.name, subtitle: spec.sub, act: spec.act, theme: 'arena', difficulty: spec.diff,
    width: w, height: h, tiles: toStrings(m),
    spawn: { x: 150, y: 430 }, exit: { x: 1120, y: 356, w: 40, h: 92 },
    checkpoints: [{ x: 130, y: 12 * TILE - 24, w: 28, h: 56 }], relics: [],
    shrines: spec.shrine ? [{ x: 250, y: 14 * TILE, textId: spec.shrine }] : [], entities: [],
    gems: [gem(7, 13), gem(33, 13), gem(20, 8), gem(13, 11), gem(27, 11)],
    introLore: spec.intro || '', outroLore: spec.outro || '', unlockCodexOnComplete: spec.unlock || [], isBoss: true,
  };
}

// ---- the 24-level arc + 2 hidden levels ------------------------------------
const PAL: Record<number, EntityKind[]> = {
  1: ['moth', 'crawler', 'guardian', 'skull', 'crow'],
  2: ['moth', 'sentry', 'skull', 'ghoul', 'crow', 'wraith', 'wisp'],
  3: ['crawler', 'skull', 'ghoul', 'sentry', 'wisp', 'sentinel', 'crow', 'wraith'],
  4: ['ghoul', 'skull', 'wraith', 'sentinel', 'crow', 'sentry', 'wisp', 'crawler', 'guardian'],
};
const ACT_THEME: Record<number, Theme> = { 1: 'mountain', 2: 'bridge', 3: 'cavern', 4: 'sunless' };
const ACT_SHRINE: Record<number, string> = { 1: 'shrine-who-is-zhulong', 2: 'shrine-eye-day-night', 3: 'shrine-breath', 4: 'shrine-sunless' };
const NAMES = [
  'The Waking Fragment', 'Terraced Slopes', 'The Broken Stair', 'Vermilion Pass', 'The Watchtower Line', 'Herald of the Foothills',
  'First Span', 'The Lantern Rope', 'Chasm of Two Skies', 'The Swaying Planks', 'Moonwake Crossing', 'The Bridge-Warden',
  'Mouth of the Deep', 'Updraft Halls', 'The Whispering Vents', 'Crumbling Galleries', 'The Cold Below', 'Keeper of the Breath',
  'Where the Sun Was Stolen', 'The Ashen Road', 'Field of Dead Lanterns', 'The Long Dark', 'Gates of Mount Zhong', 'The Lantern Eater',
];
const SUBS = [
  'The eye-shard wakes as you climb', 'Blink between terraces', 'Hop the fallen steps', 'A vermilion secret hides here', 'Turrets watch the ridge', 'A herald bars the pass',
  'Cross on the blinking span', 'Swing past the lanterns', 'Two skies, one path', 'The planks fall away', 'Only moonlight bridges this', 'The warden holds the span',
  'Ride the dragon’s breath', 'Updrafts carry you up', 'Something whispers below', 'The galleries crumble', 'Cold gnaws the deep', 'The keeper guards the breath',
  'Here the dawn was stolen', 'March the ashen road', 'Lanterns lie dead and dark', 'Endure the long dark', 'The northern gates open', 'Break the mask, free the dawn',
];

function makeSpecs(): Spec[] {
  const specs: Spec[] = [];
  for (let i = 0; i < 24; i++) {
    const act = (Math.floor(i / 6) + 1) as 1 | 2 | 3 | 4;
    const j = i % 6;
    const finale = j === 5;
    const isFinalBoss = i === 23;
    specs.push({
      id: 'lvl-' + (i + 1), name: `Level ${i + 1}: ${NAMES[i]}`, sub: SUBS[i], act, theme: ACT_THEME[act],
      len: 150 + act * 8 + j * 6,
      diff: 0.95 + (act - 1) * 0.2 + j * 0.05,
      pal: PAL[act], density: 0.85 + (act - 1) * 0.12 + j * 0.06, hazard: 0.18 + (act - 1) * 0.1 + j * 0.05,
      arch: (['plains', 'ascent', 'chasms', 'ruins', 'wilds', 'wilds'] as Arch[])[j],
      windy: act === 3, moving: j >= 2, crumble: act >= 3 && j >= 3,
      miniBoss: finale && !isFinalBoss, boss: isFinalBoss,
      intro: j === 0 ? `act${act}-intro` : (isFinalBoss ? 'intro-boss' : ''),
      outro: finale ? (isFinalBoss ? 'outro-boss' : `act${act}-outro`) : '',
      shrine: j === 0 ? ACT_SHRINE[act] : (isFinalBoss ? 'shrine-boss-invention' : undefined),
      unlock: finale ? [['texts-vary'], ['blinking-image'], ['breath-seasons'], ['game-inventions', 'myth-vs-adaptation']][act - 1] : undefined,
      secretTo: i === 3 ? 24 : i === 14 ? 25 : undefined,
    });
  }
  // hidden levels (indices 24, 25)
  specs.push({ id: 'hidden-ember', name: 'Hidden: The Ember Vault', sub: 'A vault of torch-fire, off the path', act: 1, theme: 'mountain', len: 140, diff: 1.2, pal: PAL[1], density: 1.1, hazard: 0.3, moving: true, hidden: true, intro: 'hidden-ember', shrine: 'shrine-who-is-zhulong' });
  specs.push({ id: 'hidden-moon', name: 'Hidden: The Moonlit Shrine', sub: 'A shrine that shows only at night', act: 3, theme: 'cavern', len: 150, diff: 1.5, pal: PAL[3], density: 1.15, hazard: 0.35, windy: true, hidden: true, intro: 'hidden-moon', shrine: 'shrine-breath' });
  return specs;
}

const SPECS = makeSpecs();

// legacy 3-level makers kept below are unused; the arc is generated from SPECS.
function makeLevel1(): LevelData {
  const w = 156, h = 18;
  const m = emptyMap(w, h);
  ground(m, w, h, [
    { x: 0, top: 14 }, { x: 16, top: 13 }, { x: 26, top: 14 }, { x: 34, top: null }, { x: 38, top: 14 },
    { x: 50, top: 12 }, { x: 62, top: 14 }, { x: 70, top: 13 }, { x: 78, top: null }, { x: 82, top: 14 },
    { x: 94, top: 12 }, { x: 106, top: 14 }, { x: 116, top: 11 }, { x: 128, top: 11 }, { x: 138, top: 12 }, { x: 150, top: 12 },
  ]);
  rect(m, 154, 7, 2, 11, '#');                       // end wall
  // Mario-style jump-through platforms (cover & vantage points)
  row(m, 20, 10, 5, 'o'); row(m, 52, 9, 6, 'o'); row(m, 96, 9, 5, 'o'); row(m, 120, 8, 6, 'o');
  row(m, 42, 11, 4, 'D');                            // day-only cover
  // night spirit bridge across the 2nd pit + a night ladder up to the relic
  row(m, 77, 13, 6, 'N'); row(m, 84, 10, 4, 'N'); row(m, 80, 7, 6, 'N');
  row(m, 40, 13, 4, 'F'); row(m, 108, 13, 4, 'S');   // stateful hazards on the ground
  return {
    id: 'mountain-gate', title: 'Level 1: Mountain Gate', subtitle: 'March, shoot, and blink toward the eye',
    theme: 'mountain', width: w, height: h, tiles: toStrings(m),
    spawn: { x: 64, y: 400 }, exit: { x: 150 * TILE, y: 7 * TILE, w: 44, h: 6 * TILE },
    checkpoints: [{ x: 36 * TILE, y: 14 * TILE - 40, w: 28, h: 56 }, { x: 106 * TILE, y: 14 * TILE - 40, w: 28, h: 56 }],
    relics: [{ id: 'l1-hidden-night-path', x: 82 * TILE, y: 7 * TILE - 26, noteId: 'relic-eye-fragment' }],
    shrines: [{ x: 10 * TILE, y: 12 * TILE, textId: 'shrine-who-is-zhulong' }],
    entities: [
      { kind: 'moth', x: 30 * TILE, y: 300 }, { kind: 'crawler', x: 52 * TILE, y: 380 }, { kind: 'guardian', x: 64 * TILE, y: 340 },
      { kind: 'skull', x: 44 * TILE, y: 300 }, { kind: 'ghoul', x: 72 * TILE, y: 360 },
      { kind: 'sentry', x: 92 * TILE, y: 260 }, { kind: 'moth', x: 100 * TILE, y: 280 }, { kind: 'ghoul', x: 110 * TILE, y: 340 },
      { kind: 'crawler', x: 124 * TILE, y: 360 }, { kind: 'skull', x: 132 * TILE, y: 280 },
    ],
    gems: [gem(20, 9), gem(35, 11), gem(53, 8), gem(81, 8), gem(118, 7)],
    platforms: [mp(34, 13, 3, { ax: 4 * TILE, speed: 0.85 })],
    introLore: 'intro-l1', outroLore: 'outro-l1', unlockCodexOnComplete: ['texts-vary'],
  };
}

// ---- Level 2: The Blinking Bridge -----------------------------------------
function makeLevel2(): LevelData {
  const w = 170, h = 18;
  const m = emptyMap(w, h);
  ground(m, w, h, [
    { x: 0, top: 14 }, { x: 14, top: 13 }, { x: 22, top: null }, { x: 32, top: 14 },
    { x: 44, top: 12 }, { x: 54, top: null }, { x: 64, top: 14 }, { x: 76, top: 13 },
    { x: 86, top: null }, { x: 96, top: 14 }, { x: 108, top: 12 }, { x: 120, top: 14 },
    { x: 130, top: null }, { x: 140, top: 14 }, { x: 152, top: 12 }, { x: 164, top: 12 },
  ]);
  rect(m, 168, 7, 2, 11, '#');
  // chasm crossings — alternate day/night platforms to pass
  row(m, 24, 13, 3, 'D'); row(m, 28, 11, 3, 'N');
  row(m, 55, 12, 3, 'N'); row(m, 59, 13, 3, 'D');
  row(m, 87, 12, 3, 'D'); row(m, 91, 11, 3, 'N');
  row(m, 22, 16, 10, '^'); row(m, 54, 16, 10, '^'); row(m, 86, 16, 10, '^'); row(m, 130, 16, 10, '^');
  // jump-through vantage + long moon-bridge relic route
  row(m, 44, 9, 5, 'o'); row(m, 108, 9, 5, 'o');
  row(m, 104, 10, 3, 'N'); row(m, 106, 8, 3, 'N'); row(m, 100, 6, 16, 'N');
  row(m, 36, 13, 4, 'F'); row(m, 116, 11, 4, 'S');
  return {
    id: 'blinking-bridge', title: 'Level 2: The Blinking Bridge', subtitle: 'Blink the world to make the path',
    theme: 'bridge', width: w, height: h, tiles: toStrings(m),
    spawn: { x: 64, y: 400 }, exit: { x: 164 * TILE, y: 7 * TILE, w: 44, h: 6 * TILE },
    checkpoints: [{ x: 40 * TILE, y: 12 * TILE - 40, w: 28, h: 56 }, { x: 96 * TILE, y: 14 * TILE - 40, w: 28, h: 56 }, { x: 140 * TILE, y: 14 * TILE - 40, w: 28, h: 56 }],
    relics: [{ id: 'l2-moon-bridge', x: 108 * TILE, y: 6 * TILE - 26, noteId: 'relic-blinking-image' }],
    shrines: [{ x: 8 * TILE, y: 12 * TILE, textId: 'shrine-eye-day-night' }],
    entities: [
      { kind: 'moth', x: 18 * TILE, y: 300 }, { kind: 'sentry', x: 46 * TILE, y: 340 }, { kind: 'skull', x: 58 * TILE, y: 290 },
      { kind: 'ghoul', x: 72 * TILE, y: 340 }, { kind: 'sentry', x: 108 * TILE, y: 260 }, { kind: 'skull', x: 134 * TILE, y: 290 }, { kind: 'ghoul', x: 156 * TILE, y: 330 },
      { kind: 'crawler', x: 40 * TILE, y: 340 }, { kind: 'wisp', x: 100 * TILE, y: 300 }, { kind: 'ghoul', x: 120 * TILE, y: 340 }, { kind: 'skull', x: 148 * TILE, y: 280 },
      { kind: 'guardian', x: 66 * TILE, y: 360 }, { kind: 'moth', x: 90 * TILE, y: 280 }, { kind: 'wisp', x: 128 * TILE, y: 300 },
    ],
    gems: [gem(14, 11), gem(28, 9), gem(56, 10), gem(104, 6), gem(150, 10)],
    platforms: [
      mp(56, 12, 3, { ax: 3 * TILE, speed: 0.8 }),
      mp(132, 13, 3, { ay: 3 * TILE, speed: 0.9 }), mp(135, 13, 3, { ay: 3 * TILE, speed: 0.9, phase: Math.PI }),
    ],
    introLore: 'intro-l2', outroLore: 'outro-l2', unlockCodexOnComplete: ['blinking-image'],
  };
}

// ---- Level 3: Breath Cavern -----------------------------------------------
function makeLevel3(): LevelData {
  const w = 172, h = 20;
  const m = emptyMap(w, h);
  ground(m, w, h, [
    { x: 0, top: 16 }, { x: 14, top: 15 }, { x: 24, top: 16 }, { x: 32, top: 14 }, { x: 42, top: 16 },
    { x: 50, top: null }, { x: 60, top: 15 }, { x: 72, top: 16 }, { x: 82, top: 14 }, { x: 92, top: 16 },
    { x: 100, top: null }, { x: 110, top: 16 }, { x: 122, top: 14 }, { x: 134, top: 16 },
    { x: 146, top: 13 }, { x: 158, top: 13 }, { x: 168, top: 13 },
  ]);
  rect(m, 170, 8, 2, 12, '#');
  // updraft shafts (ride the dragon's breath up and across the pits)
  row(m, 52, 5, 3, 'o'); rect(m, 55, 3, 4, 2, '#');         // relic ledge atop shaft 1
  // jump-through vantage + day/night cover
  row(m, 34, 11, 4, 'o'); row(m, 122, 10, 4, 'o');
  row(m, 72, 13, 4, 'D'); row(m, 110, 13, 4, 'N');
  row(m, 26, 15, 4, 'F'); row(m, 134, 15, 4, 'S');
  return {
    id: 'breath-cavern', title: 'Level 3: Breath Cavern', subtitle: 'The cavern moves with dragon breath',
    theme: 'cavern', width: w, height: h, tiles: toStrings(m),
    spawn: { x: 64, y: 470 }, exit: { x: 166 * TILE, y: 8 * TILE, w: 44, h: 6 * TILE },
    checkpoints: [{ x: 44 * TILE, y: 16 * TILE - 40, w: 28, h: 56 }, { x: 92 * TILE, y: 16 * TILE - 40, w: 28, h: 56 }, { x: 134 * TILE, y: 16 * TILE - 40, w: 28, h: 56 }],
    relics: [{ id: 'l3-breath-current', x: 53 * TILE, y: 5 * TILE - 26, noteId: 'relic-breath-seasons' }],
    shrines: [{ x: 8 * TILE, y: 14 * TILE, textId: 'shrine-breath' }],
    entities: [
      { kind: 'crawler', x: 30 * TILE, y: 440 }, { kind: 'moth', x: 44 * TILE, y: 300 }, { kind: 'ghoul', x: 74 * TILE, y: 420 },
      { kind: 'skull', x: 92 * TILE, y: 340 }, { kind: 'crawler', x: 116 * TILE, y: 440 }, { kind: 'sentry', x: 146 * TILE, y: 382 }, { kind: 'ghoul', x: 158 * TILE, y: 400 },
      { kind: 'skull', x: 60 * TILE, y: 320 }, { kind: 'wisp', x: 88 * TILE, y: 320 }, { kind: 'crawler', x: 128 * TILE, y: 420 }, { kind: 'ghoul', x: 110 * TILE, y: 400 },
      { kind: 'guardian', x: 34 * TILE, y: 300 }, { kind: 'sentry', x: 82 * TILE, y: 300 }, { kind: 'skull', x: 122 * TILE, y: 300 },
    ],
    platforms: [
      mp(84, 13, 3, { ax: 5 * TILE, speed: 0.8 }),
      mp(64, 14, 3, { crumble: true }), mp(114, 14, 3, { crumble: true }),
      mp(124, 11, 3, { ay: 3 * TILE, speed: 1.1 }),
    ],
    gems: [gem(20, 13), gem(53, 4), gem(82, 11), gem(110, 13), gem(146, 10)],
    windZones: [{ x: 50 * TILE, y: 2 * TILE, w: 10 * TILE, h: 16 * TILE }, { x: 100 * TILE, y: 2 * TILE, w: 10 * TILE, h: 16 * TILE }],
    introLore: 'intro-l3', outroLore: 'outro-l3', unlockCodexOnComplete: ['breath-seasons'],
  };
}

// ---- Boss: The Lantern Eater ----------------------------------------------
function makeBossLevel(): LevelData {
  const w = 40, h = 18;
  const m = emptyMap(w, h);
  row(m, 0, 16, w, '#'); row(m, 0, 17, w, '#');
  rect(m, 0, 0, 2, 18, '#'); rect(m, w - 2, 0, 2, 18, '#');
  row(m, 6, 12, 4, 'D'); row(m, 30, 12, 4, 'N');   // side ledges to dodge/climb
  row(m, 17, 10, 6, 'o');                           // center perch (one-way)
  return {
    id: 'lantern-eater', title: 'Boss: The Lantern Eater', subtitle: 'An invented creature that hoards the dawn',
    theme: 'arena', width: w, height: h, tiles: toStrings(m),
    spawn: { x: 150, y: 430 }, exit: { x: 1120, y: 356, w: 40, h: 92 },
    checkpoints: [{ x: 130, y: 12 * TILE - 24, w: 28, h: 56 }], relics: [],
    shrines: [{ x: 250, y: 14 * TILE, textId: 'shrine-boss-invention' }], entities: [],
    // torch-gems in the arena (respawn) so you can build the meter and become the dragon mid-fight
    gems: [gem(7, 13), gem(33, 13), gem(20, 8), gem(13, 11), gem(27, 11)],
    introLore: 'intro-boss', outroLore: 'outro-boss', unlockCodexOnComplete: ['game-inventions', 'myth-vs-adaptation'], isBoss: true,
  };
}

export const levels: LevelData[] = SPECS.map((s, i) => buildLevel(s, i));

// ---- Lore panels -----------------------------------------------------------
export const loreTexts: Record<string, LorePanel> = {
  // ---- the 24-level arc (per-act openers/finales) ----
  'act1-intro': { title: 'Act I — The Foothills of Zhong', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'Zhulong, the Torch Dragon, is imagined dwelling far north at Mount Zhong, lighting a land the sun does not reach. When his eye opens there is day; when it closes, night.' },
    { label: 'Game Inspiration', text: 'You carry a fragment of that eye. Climb the foothills, blink the sky, and lull whichever host — sun-things by day, shadow-things by night — bars your way.' }] },
  'act1-outro': { title: 'The Foothills Fall Quiet', nextMode: 'levelComplete', sections: [
    { label: 'Historical Note', text: 'Descriptions of Zhulong vary across ancient texts, translations, and retellings; some give a red serpentine body and a human face.' },
    { label: 'Game Inspiration', text: 'The heralds and wardens that bar each act are original inventions — dramatizations of the Lantern Eater’s grip on the light.' }] },
  'act2-intro': { title: 'Act II — The Blinking Bridges', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'In some accounts the opening and closing of Zhulong’s eyes brings the very alternation of day and night.' },
    { label: 'Game Inspiration', text: 'Here that image becomes the path itself: day-only and night-only spans. Blink the world to make the way across.' }] },
  'act2-outro': { title: 'Beyond the Bridges', nextMode: 'levelComplete', sections: [
    { label: 'Historical Note', text: 'Myths often give natural cycles a memorable shape; a blinking eye gives day and night a living body.' },
    { label: 'Game Inspiration', text: 'The blinking bridges are a playable adaptation, not a literal detail from the old sources.' }] },
  'act3-intro': { title: 'Act III — The Breath Caverns', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'Zhulong’s breath is sometimes tied to wind, weather, and the turn of the seasons — winter and summer in a single exhalation.' },
    { label: 'Game Inspiration', text: 'The caverns beneath the mountain still move with that breath. Ride the rising currents.' }] },
  'act3-outro': { title: 'Out of the Deep', nextMode: 'levelComplete', sections: [
    { label: 'History', text: 'Many myths connect cosmic beings to natural forces. Here, updrafts stand in for the dragon’s breath.' },
    { label: 'Game Inspiration', text: 'Ahead lies the sunless march — and the creature that stole the dawn.' }] },
  'act4-intro': { title: 'Act IV — The Sunless March', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'The land Zhulong lights is imagined as sunless without him. Take that away, and only the two hosts remain to roam the dark.' },
    { label: 'Game Inspiration', text: 'The Lantern Eater has trapped the dawn. March north to Mount Zhong and break its mask.' }] },
  'shrine-sunless': { title: 'Lore Shrine: The Sunless Land', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'Some tellings place Zhulong where the sun never shines, his light standing in for the day itself.' },
    { label: 'Game Inspiration', text: 'The sunless realm is this game’s way of showing what a world without the dragon’s eye might feel like.' }] },
  'hidden-ember': { title: 'Hidden: The Ember Vault', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'Fire and light are central to the Torch Dragon’s image.' },
    { label: 'Game Inspiration', text: 'A secret vault of torch-embers, hidden off the marked path. Optional — and dangerous.' }] },
  'hidden-moon': { title: 'Hidden: The Moonlit Shrine', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'When the eye is closed, the world belongs to the night and its spirits.' },
    { label: 'Game Inspiration', text: 'A shrine that reveals itself only under moonlight — a secret for the curious.' }] },
  'intro-l1': { title: 'Before the Mountain Gate', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'Zhulong, the Torch Dragon or Candle Dragon, is imagined in some traditions as a cosmic being of light, darkness, and turning cycles — day when his eye opens, night when it closes.' },
    { label: 'Game Inspiration', text: 'The Lantern Eater has trapped the dawn, and the eye no longer turns on its own. You carry a fragment of it. With it you can blink the sky — and the two hosts answer: sun-things wake by day, shadow-things by night. Wake the eye, climb to the gate.' }] },
  'outro-l1': { title: 'After Level 1', nextMode: 'levelComplete', sections: [
    { label: 'Historical Note', text: 'Descriptions of Zhulong vary across ancient texts, translations, and later retellings. Some emphasize a red serpentine body and a human-like face.' },
    { label: 'Game Inspiration', text: 'The shrine runner, relics, and gate trials are original inventions that help introduce the myth.' }] },
  'intro-l2': { title: 'Before the Blinking Bridge', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'In some accounts, when Zhulong opens his eyes there is day; when he closes them there is night.' },
    { label: 'Game Inspiration', text: 'This level turns the eye-opening motif into a platforming rule. Blink the world to find the path.' }] },
  'outro-l2': { title: 'After Level 2', nextMode: 'levelComplete', sections: [
    { label: 'Historical Note', text: 'Myths often give natural cycles a memorable story-shape. Zhulong’s blinking eye gives day and night a living image.' },
    { label: 'Game Inspiration', text: 'Day-only and night-only platforms are a playable adaptation, not a literal detail from the old sources.' }] },
  'intro-l3': { title: 'Before Breath Cavern', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'Zhulong’s breath is sometimes connected with wind, weather, cold, heat, or seasonal change.' },
    { label: 'Game Inspiration', text: 'The caverns below the mountain still move with the dragon’s breath. Ride the currents carefully.' }] },
  'outro-l3': { title: 'After Level 3', nextMode: 'levelComplete', sections: [
    { label: 'Historical Note', text: 'Many ancient myths connect divine or cosmic beings with natural forces. Here, wind currents are inspired by Zhulong’s breath.' },
    { label: 'Game Inspiration', text: 'The boss ahead is original: a symbol of imbalance between light and darkness.' }] },
  'intro-boss': { title: 'Before the Lantern Eater', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'Zhulong’s power is tied here to balance: day and night, light and darkness, breath and stillness.' },
    { label: 'Game Inspiration', text: 'The Lantern Eater is an original creature. It represents light hoarded instead of shared — strike its eye while the world is dark.' }] },
  'outro-boss': { title: 'The Dragon Blinks Again', nextMode: 'gameComplete', sections: [
    { label: 'Myth', text: 'Zhulong is remembered as a vast dragon associated with cosmic light, darkness, and natural cycles.' },
    { label: 'History', text: 'Accounts appear in old Chinese mythological and geographical traditions; details vary between texts, regions, translations, and retellings.' },
    { label: 'Game Inspiration', text: 'This game adapts the eye motif into a Day/Night mechanic. The shrine runner, Lantern Eater, and level trials are original inventions.' }] },
  'shrine-who-is-zhulong': { title: 'Lore Shrine: Who is Zhulong?', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'Zhulong is also called Torch Dragon or Candle Dragon. Some descriptions give him a human face and a serpentine red body.' },
    { label: 'Game Inspiration', text: 'The distant eye in the sky is this game’s way of making that cosmic scale visible while you play.' }] },
  'shrine-eye-day-night': { title: 'Lore Shrine: The Eye', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'The opening and closing of Zhulong’s eyes is linked in some accounts with the arrival of day and night.' },
    { label: 'Game Inspiration', text: 'Blink to shift between sunlight and spirit-shadow — and use it in a fight. Sun-things fall asleep in the dark; shadow-things fall asleep in the light. Blink to disarm whichever host hunts you, then strike them while they dream.' }] },
  'shrine-breath': { title: 'Lore Shrine: The Breath', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'Zhulong’s breath is sometimes described as a force of wind or seasonal change.' },
    { label: 'Game Inspiration', text: 'The rising gusts in this cavern are a playable metaphor for dragon breath, not a literal history.' }] },
  'shrine-boss-invention': { title: 'Lore Shrine: Invention', nextMode: 'playing', sections: [
    { label: 'Historical Note', text: 'The Lantern Eater is not part of the Zhulong legend.' },
    { label: 'Game Inspiration', text: 'It was invented to dramatize imbalance: light trapped, night starved, and the world unable to blink.' }] },
  'relic-eye-fragment': { title: 'Relic: Eye Fragment', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'A single eye can be a powerful mythic image: vision, light, time, and cosmic awareness.' },
    { label: 'Game Inspiration', text: 'Relics unlock optional notes in Myth & History.' }] },
  'relic-blinking-image': { title: 'Relic: Moon Bridge', nextMode: 'playing', sections: [
    { label: 'Historical Note', text: 'Ancient mythic images are often compact: one gesture, such as an eye closing, can explain a whole natural rhythm.' },
    { label: 'Game Inspiration', text: 'The bridge exists only under moonlight to make the myth readable through play.' }] },
  'relic-breath-seasons': { title: 'Relic: Breath Bell', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'Some tellings connect Zhulong’s breath or voice with winter, summer, wind, or rain.' },
    { label: 'Game Inspiration', text: 'A future full game could expand this into seasonal puzzles.' }] },
};

// ---- Codex -----------------------------------------------------------------
export const codexEntries: CodexEntry[] = [
  { id: 'who-is-zhulong', title: 'Who is Zhulong?', unlockHint: 'Unlocked from the start', body: 'Zhulong, also known as Torch Dragon or Candle Dragon, is a figure from Chinese mythology. Some accounts describe a vast red, serpentine being with a human-like face and cosmic powers.' },
  { id: 'eye-day-night', title: 'The Eye of Day and Night', unlockHint: 'Unlocked from the start', body: 'In some accounts, Zhulong opens his eyes and there is day; he closes his eyes and there is night. This game adapts that image into the blink mechanic.' },
  { id: 'two-hosts', title: 'The Two Hosts', unlockHint: 'Unlocked from the start', body: 'With the eye unbalanced, the world holds two hosts of creatures. Solar and stone things — moths, lantern sentries, stone guardians — wake and hunt by day. Shadow, spirit, and restless dead — wisps, spirit skulls, jiangshi, and crawlers — wake and hunt by night. Each is only dangerous in its own world; blink to the other and it falls dormant, harmless, easy to strike. Holding the right eye is a weapon. (An original game system built on the day/night eye motif.)' },
  { id: 'texts-vary', title: 'Details Vary', unlockHint: 'Complete Level 1', body: 'Myths change across texts, regions, translations, and retellings. The game uses careful wording because it is inspired by tradition rather than claiming to be a literal reconstruction.' },
  { id: 'blinking-image', title: 'Blinking as a Mythic Image', unlockHint: 'Complete Level 2', body: 'A mythic image can turn a natural cycle into something memorable. Zhulong’s eye gives day and night a body, a rhythm, and a story.' },
  { id: 'breath-seasons', title: 'Breath, Wind, and Seasons', unlockHint: 'Complete Level 3', body: 'Some descriptions associate Zhulong’s breath with wind, weather, winter, summer, or seasonal change. Breath Cavern turns this into rising currents and shifting danger.' },
  { id: 'game-inventions', title: 'What the Game Invented', unlockHint: 'Defeat the boss', body: 'The shrine runner, relic shards, Lantern Eater, spirit platforms, and boss arena are original creations designed to make the myth interactive.' },
  { id: 'myth-vs-adaptation', title: 'Myth vs. Adaptation', unlockHint: 'Defeat the boss', body: 'This game respects the legend while adapting it. Myth panels describe source-inspired ideas; Game Inspiration panels explain invented mechanics and story elements.' },
];

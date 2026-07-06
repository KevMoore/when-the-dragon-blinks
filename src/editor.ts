// ⛩ Shrine Forge — the visual level editor. Paint tiles, drop objects, playtest
// instantly in the real game (localStorage handoff), export JSON, publish via
// assets/levels/. Deliberately self-contained: no dependency on Game.
import { TILE } from './types.js';
import type { EntityKind } from './types.js';

const H = 17;                                   // canonical level height (matches the generator)
const DRAFT_KEY = 'wtdb-draft';                 // playtest handoff
const STATE_KEY = 'wtdb-editor-state';          // editor autosave

type Obj = { kind: string; x: number; y: number };            // tile coords (objects)
type Bridge = { x: number; y: number; w: number };            // tile coords

interface EdState {
  name: string; theme: string; w: number;
  tiles: string[];                              // H strings of length w
  spawn: { x: number; y: number };              // tile coords
  exit: { x: number; y: number };
  checkpoints: { x: number; y: number }[];
  gems: { x: number; y: number }[];
  enemies: { kind: EntityKind; x: number; y: number; elite?: boolean }[];
  bridges: Bridge[];
}

const cv = document.getElementById('ed') as HTMLCanvasElement;
const c = cv.getContext('2d')!;
const toolsEl = document.getElementById('tools')!;

const TILE_TOOLS: [string, string, string][] = [
  ['#', 'Stone', '#5a4a66'], ['g', 'Grass cap', '#7ca23f'], ['o', 'Platform', '#8a6b45'],
  ['D', 'Day block', '#f0b45a'], ['N', 'Night block', '#7fa8d6'],
  ['^', 'Crags', '#8a7c7c'], ['F', 'Fire', '#ff7840'], ['S', 'Frost', '#8ed7ff'], ['.', 'Erase', '#241a30'],
];
const OBJ_TOOLS = ['Spawn', 'Exit', 'Checkpoint', 'Gem', 'Enemy', 'Bridge', 'Delete', 'Pan'];
const ENEMY_KINDS: EntityKind[] = ['moth', 'guardian', 'wisp', 'sentry', 'ghoul', 'skull', 'crawler', 'crow', 'sentinel', 'wraith'];

let st: EdState = freshState(120);
let tool = '#';
let enemyKind: EntityKind = 'guardian';
let elite = false;
let camX = 0, camY = 0, zoom = 1;
let painting = false, panning = false, panStart = { x: 0, y: 0, cx: 0, cy: 0 };
let bridgeStart: { x: number; y: number } | null = null;

function freshState(w: number): EdState {
  const rows: string[] = [];
  for (let y = 0; y < H; y++) {
    if (y < H - 3) rows.push('.'.repeat(w));
    else if (y === H - 3) rows.push('g'.repeat(w));
    else rows.push('#'.repeat(w));
  }
  return { name: 'My Shrine Path', theme: 'mountain', w, tiles: rows, spawn: { x: 3, y: H - 5 }, exit: { x: w - 4, y: H - 6 }, checkpoints: [], gems: [], enemies: [], bridges: [] };
}

function setTile(x: number, y: number, ch: string) {
  if (x < 0 || x >= st.w || y < 0 || y >= H) return;
  const row = st.tiles[y];
  st.tiles[y] = row.slice(0, x) + ch + row.slice(x + 1);
}
function tileAt(x: number, y: number) { return (x < 0 || x >= st.w || y < 0 || y >= H) ? '.' : st.tiles[y][x]; }

// ---- UI wiring --------------------------------------------------------------
function buildTools() {
  toolsEl.innerHTML = '';
  for (const [ch, label, col] of TILE_TOOLS) {
    const b = document.createElement('button');
    b.textContent = label; b.style.borderLeft = `10px solid ${col}`;
    b.className = tool === ch ? 'on' : '';
    b.onclick = () => { tool = ch; buildTools(); };
    toolsEl.appendChild(b);
  }
  for (const t of OBJ_TOOLS) {
    const b = document.createElement('button');
    b.textContent = t; b.className = tool === t ? 'on' : '';
    b.onclick = () => { tool = t; bridgeStart = null; buildTools(); };
    toolsEl.appendChild(b);
  }
  const sel = document.createElement('select');
  for (const k of ENEMY_KINDS) { const o = document.createElement('option'); o.value = k; o.textContent = k; if (k === enemyKind) o.selected = true; sel.appendChild(o); }
  sel.onchange = () => { enemyKind = sel.value as EntityKind; tool = 'Enemy'; buildTools(); };
  toolsEl.appendChild(sel);
  const el = document.createElement('button');
  el.textContent = elite ? '★ elite' : '☆ elite'; el.className = elite ? 'on' : '';
  el.onclick = () => { elite = !elite; buildTools(); };
  toolsEl.appendChild(el);
  const zb = document.createElement('button');
  zb.textContent = zoom === 1 ? '🔍 50%' : '🔍 100%';
  zb.onclick = () => { zoom = zoom === 1 ? 0.5 : 1; buildTools(); };
  toolsEl.appendChild(zb);
}

(document.getElementById('new') as HTMLButtonElement).onclick = () => {
  if (!confirm('Start a new level? (current draft is kept in autosave until you paint)')) return;
  st = freshState(parseInt((document.getElementById('wtiles') as HTMLInputElement).value) || 120);
  syncBar(); save();
};
(document.getElementById('export') as HTMLButtonElement).onclick = () => {
  const data = toLevelData();
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = st.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
  a.click();
};
(document.getElementById('playtest') as HTMLButtonElement).onclick = () => {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(toLevelData()));
  window.open('index.html?playtest=1', 'wtdb-playtest');
};
(document.getElementById('publish') as HTMLButtonElement).onclick = () => { (document.getElementById('modal') as HTMLElement).style.display = 'grid'; };
(document.getElementById('import') as HTMLButtonElement).onclick = () => (document.getElementById('file') as HTMLInputElement).click();
(document.getElementById('file') as HTMLInputElement).onchange = e => {
  const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
  f.text().then(t => { try { fromLevelData(JSON.parse(t)); syncBar(); save(); } catch { alert('Not a valid level JSON'); } });
};
(document.getElementById('name') as HTMLInputElement).oninput = e => { st.name = (e.target as HTMLInputElement).value; save(); };
(document.getElementById('theme') as HTMLSelectElement).onchange = e => { st.theme = (e.target as HTMLSelectElement).value; save(); };
(document.getElementById('wtiles') as HTMLInputElement).onchange = e => {
  const w = Math.max(40, Math.min(300, parseInt((e.target as HTMLInputElement).value) || 120));
  st.tiles = st.tiles.map(r => (r + '.'.repeat(Math.max(0, w - r.length))).slice(0, w));
  st.w = w; save();
};
function syncBar() {
  (document.getElementById('name') as HTMLInputElement).value = st.name;
  (document.getElementById('theme') as HTMLSelectElement).value = st.theme;
  (document.getElementById('wtiles') as HTMLInputElement).value = String(st.w);
}

// ---- pointer / keys ----------------------------------------------------------
function cellAt(e: PointerEvent) {
  const r = cv.getBoundingClientRect();
  const px = (e.clientX - r.left) * (cv.width / r.width) / zoom + camX;
  const py = (e.clientY - r.top) * (cv.height / r.height) / zoom + camY;
  return { x: Math.floor(px / TILE), y: Math.floor(py / TILE), px, py };
}
cv.addEventListener('pointerdown', e => {
  const p = cellAt(e);
  if (tool === 'Pan' || e.button === 1) { panning = true; panStart = { x: e.clientX, y: e.clientY, cx: camX, cy: camY }; return; }
  painting = true; apply(p);
});
cv.addEventListener('pointermove', e => {
  if (panning) { camX = panStart.cx - (e.clientX - panStart.x) / zoom; camY = panStart.cy - (e.clientY - panStart.y) / zoom; clampCam(); return; }
  if (painting && tool.length === 1) apply(cellAt(e));
});
window.addEventListener('pointerup', () => { painting = false; panning = false; save(); });
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase(); const sp = 26;
  if (k === 'arrowleft' || k === 'a') camX -= sp; if (k === 'arrowright' || k === 'd') camX += sp;
  if (k === 'arrowup' || k === 'w') camY -= sp; if (k === 'arrowdown' || k === 's') camY += sp;
  clampCam();
});
function clampCam() {
  camX = Math.max(0, Math.min(st.w * TILE - cv.width / zoom, camX));
  camY = Math.max(-40, Math.min(H * TILE - cv.height / zoom + 60, camY));
}

function apply(p: { x: number; y: number }) {
  if (p.x < 0 || p.x >= st.w || p.y < 0 || p.y >= H) return;
  if (tool.length === 1) { setTile(p.x, p.y, tool); return; }
  if (tool === 'Spawn') st.spawn = { x: p.x, y: p.y };
  else if (tool === 'Exit') st.exit = { x: p.x, y: p.y };
  else if (tool === 'Checkpoint') st.checkpoints.push({ x: p.x, y: p.y });
  else if (tool === 'Gem') st.gems.push({ x: p.x, y: p.y });
  else if (tool === 'Enemy') st.enemies.push({ kind: enemyKind, x: p.x, y: p.y, elite: elite || undefined });
  else if (tool === 'Bridge') {
    if (!bridgeStart) bridgeStart = { x: p.x, y: p.y };
    else { const x0 = Math.min(bridgeStart.x, p.x), x1 = Math.max(bridgeStart.x, p.x); st.bridges.push({ x: x0, y: bridgeStart.y, w: Math.max(2, x1 - x0) }); bridgeStart = null; }
  } else if (tool === 'Delete') {
    const near = (o: { x: number; y: number }) => Math.hypot(o.x - p.x, o.y - p.y) < 1.6;
    st.checkpoints = st.checkpoints.filter(o => !near(o));
    st.gems = st.gems.filter(o => !near(o));
    st.enemies = st.enemies.filter(o => !near(o));
    st.bridges = st.bridges.filter(b => !(p.y >= b.y - 1 && p.y <= b.y + 1 && p.x >= b.x - 1 && p.x <= b.x + b.w + 1));
  }
  save();
}

// ---- convert to/from the game's LevelData shape ------------------------------
function toLevelData(): Record<string, unknown> {
  return {
    id: 'custom-' + st.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    title: st.name, subtitle: 'A custom shrine path', custom: true,
    width: st.w, height: H, tiles: st.tiles.slice(),
    spawn: { x: st.spawn.x * TILE, y: st.spawn.y * TILE },
    exit: { x: st.exit.x * TILE, y: st.exit.y * TILE - 40, w: 30, h: 96 },
    checkpoints: st.checkpoints.map(o => ({ x: o.x * TILE, y: o.y * TILE - 24, w: 28, h: 56 })),
    relics: [], shrines: [],
    entities: st.enemies.map(o => ({ kind: o.kind, x: o.x * TILE, y: o.y * TILE, elite: o.elite })),
    gems: st.gems.map(o => ({ x: o.x * TILE, y: o.y * TILE })),
    bridges: st.bridges.map(b => ({ x: b.x * TILE - 12, y: b.y * TILE, w: b.w * TILE + 24 })),
    platforms: [], windZones: undefined,
    introLore: '', outroLore: '', unlockCodexOnComplete: [],
    theme: st.theme, act: ({ mountain: 1, bridge: 2, cavern: 3, sunless: 4 } as Record<string, number>)[st.theme] || 1,
    difficulty: 1,
  };
}
function fromLevelData(d: any) {
  st = {
    name: d.title || 'Imported', theme: d.theme || 'mountain', w: d.width || (d.tiles?.[0]?.length ?? 120),
    tiles: d.tiles.slice(0, H),
    spawn: { x: Math.round((d.spawn?.x ?? 96) / TILE), y: Math.round((d.spawn?.y ?? 300) / TILE) },
    exit: { x: Math.round((d.exit?.x ?? 300) / TILE), y: Math.round(((d.exit?.y ?? 300) + 40) / TILE) },
    checkpoints: (d.checkpoints || []).map((o: any) => ({ x: Math.round(o.x / TILE), y: Math.round((o.y + 24) / TILE) })),
    gems: (d.gems || []).map((o: any) => ({ x: Math.round(o.x / TILE), y: Math.round(o.y / TILE) })),
    enemies: (d.entities || []).map((o: any) => ({ kind: o.kind, x: Math.round(o.x / TILE), y: Math.round(o.y / TILE), elite: o.elite })),
    bridges: (d.bridges || []).map((b: any) => ({ x: Math.round((b.x + 12) / TILE), y: Math.round(b.y / TILE), w: Math.round((b.w - 24) / TILE) })),
  };
  while (st.tiles.length < H) st.tiles.push('.'.repeat(st.w));
}

// ---- persistence --------------------------------------------------------------
function save() { localStorage.setItem(STATE_KEY, JSON.stringify(st)); }
function load() { try { const s = localStorage.getItem(STATE_KEY); if (s) { st = JSON.parse(s); } } catch { /* fresh */ } }

// ---- render loop ----------------------------------------------------------------
const TILE_COL: Record<string, string> = { '#': '#5a4a66', g: '#7ca23f', o: '#8a6b45', D: '#f0b45a', N: '#7fa8d6', '^': '#8a7c7c', F: '#ff7840', S: '#8ed7ff' };
function draw() {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#160f1e'; c.fillRect(0, 0, cv.width, cv.height);
  c.setTransform(zoom, 0, 0, zoom, -camX * zoom, -camY * zoom);
  // sky band + ground guide
  c.fillStyle = '#241a30'; c.fillRect(0, 0, st.w * TILE, H * TILE);
  // tiles
  for (let y = 0; y < H; y++) for (let x = Math.floor(camX / TILE); x <= Math.floor((camX + cv.width / zoom) / TILE) && x < st.w; x++) {
    const ch = tileAt(x, y); if (ch === '.') continue;
    c.fillStyle = TILE_COL[ch] || '#666';
    c.fillRect(x * TILE, y * TILE, TILE, TILE);
    if (ch === 'g') { c.fillStyle = '#a8d05f'; c.fillRect(x * TILE, y * TILE, TILE, 6); }
    if (ch === 'o') { c.fillStyle = '#5a4630'; c.fillRect(x * TILE, y * TILE + 10, TILE, 6); }
    if (ch === '^' || ch === 'F' || ch === 'S') { c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); for (let i = 0; i < 3; i++) { c.moveTo(x * TILE + i * 11, y * TILE + TILE); c.lineTo(x * TILE + i * 11 + 5, y * TILE + 8); c.lineTo(x * TILE + i * 11 + 10, y * TILE + TILE); } c.fill(); }
  }
  // grid
  c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 1; c.beginPath();
  for (let x = 0; x <= st.w; x++) { c.moveTo(x * TILE, 0); c.lineTo(x * TILE, H * TILE); }
  for (let y = 0; y <= H; y++) { c.moveTo(0, y * TILE); c.lineTo(st.w * TILE, y * TILE); }
  c.stroke();
  // bridges
  for (const b of st.bridges) {
    c.fillStyle = '#8a6b45'; c.fillRect(b.x * TILE, b.y * TILE, b.w * TILE, 8);
    c.fillStyle = '#5a3c22'; c.fillRect(b.x * TILE - 3, b.y * TILE - 10, 5, 18); c.fillRect((b.x + b.w) * TILE - 2, b.y * TILE - 10, 5, 18);
  }
  if (bridgeStart) { c.fillStyle = '#ffd777'; c.fillRect(bridgeStart.x * TILE, bridgeStart.y * TILE, TILE, 8); }
  // objects
  const glyph = (x: number, y: number, txt: string, col: string) => {
    c.fillStyle = col; c.font = 'bold 20px Georgia'; c.textAlign = 'center';
    c.fillText(txt, x * TILE + TILE / 2, y * TILE + TILE * 0.78);
  };
  for (const o of st.gems) glyph(o.x, o.y, '◆', '#ffcf6a');
  for (const o of st.checkpoints) glyph(o.x, o.y, '🏮', '#ffb24a');
  for (const o of st.enemies) { glyph(o.x, o.y, o.elite ? '👹' : '●', '#ff5c49'); c.font = '9px Georgia'; c.fillStyle = '#ffb0a0'; c.fillText(o.kind, o.x * TILE + TILE / 2, o.y * TILE + TILE + 10); }
  glyph(st.spawn.x, st.spawn.y, '▲', '#8fd9a8');
  glyph(st.exit.x, st.exit.y, '⛩', '#ffd777');
  requestAnimationFrame(draw);
}

load(); syncBar(); buildTools(); clampCam(); draw();

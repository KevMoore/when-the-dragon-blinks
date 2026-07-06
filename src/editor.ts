// ⛩ Shrine Forge — the visual level editor. High-level authoring tools (terrain
// brush, island builder, tower/prefab stamps, spawners, move, undo) so levels
// are swept out, not clicked block by block. Playtest via localStorage handoff;
// publish commits straight to the game repo. Self-contained: no Game dependency.
import { TILE } from './types.js';
import type { EntityKind } from './types.js';

let H = 17;                                     // level height (17, or 18 for cavern acts) — tracks st.h
const DRAFT_KEY = 'wtdb-draft';
const STATE_KEY = 'wtdb-editor-state';

type Obj = { x: number; y: number };
type Spawner = { kind: EntityKind; x: number; y: number; every: number; max: number };

interface EdState {
  name: string; theme: string; w: number;
  h?: number;
  replaces?: number;                            // campaign index this level replaces on publish
  carry?: Record<string, unknown>;              // untouched fields carried through on publish
  tiles: string[];
  spawn: Obj; exit: Obj;
  checkpoints: Obj[]; gems: Obj[];
  enemies: { kind: EntityKind; x: number; y: number; elite?: boolean }[];
  spawners: Spawner[];
  bridges: { x: number; y: number; w: number }[];
}

const cv = document.getElementById('ed') as HTMLCanvasElement;
const c = cv.getContext('2d')!;
const toolsEl = document.getElementById('tools')!;

const TILE_TOOLS: [string, string, string][] = [
  ['terrain', '✏️ Terrain', '#7ca23f'], ['pit', '⛏ Pit', '#241a30'],
  ['island', '🏝 Island', '#8a6b45'], ['tower', '🧗 Tower', '#b08a5a'],
  ['#', 'Stone', '#5a4a66'], ['o', 'Plat-tile', '#8a6b45'],
  ['D', 'Day', '#f0b45a'], ['N', 'Night', '#7fa8d6'],
  ['^', 'Crags', '#8a7c7c'], ['F', 'Fire', '#ff7840'], ['S', 'Frost', '#8ed7ff'], ['.', 'Erase', '#241a30'],
];
const OBJ_TOOLS = ['✂ Select', 'Spawn', 'Exit', 'Checkpoint', 'Gem', 'Enemy', 'Spawner', 'Bridge', 'Move', 'Delete', 'Pan'];
const STAMPS: [string, string][] = [['pack', '👥 Enemy pack'], ['gemarc', '💎 Gem arc'], ['hazrun', '⚠️ Hazard strip'], ['aerial', '🌉 Aerial run']];
const ENEMY_KINDS: EntityKind[] = ['moth', 'guardian', 'wisp', 'sentry', 'ghoul', 'skull', 'crawler', 'crow', 'sentinel', 'wraith'];

let st: EdState = freshState(120);
let tool = 'terrain';
let enemyKind: EntityKind = 'guardian';
let elite = false;
let camX = 0, camY = 0, zoom = 1;
let painting = false, panning = false, rightErase = false;
let panStart = { x: 0, y: 0, cx: 0, cy: 0 };
let lastCell: { x: number; y: number } | null = null;
let bridgeStart: { x: number; y: number } | null = null;
let islandRow: number | null = null;
let dragObj: { list: 'checkpoints' | 'gems' | 'enemies' | 'spawners' | 'spawn' | 'exit'; i: number } | null = null;
// ✂ marquee selection: drag a box, then drag INSIDE it to move tiles + objects
let sel: { x0: number; y0: number; x1: number; y1: number } | null = null;
let selecting = false, movingSel = false;
let selAnchor = { x: 0, y: 0 }, moveFrom = { x: 0, y: 0 }, moveDelta = { x: 0, y: 0 };

// ---- undo / redo -------------------------------------------------------------
const undoStack: string[] = [];
const redoStack: string[] = [];
function pushUndo() { undoStack.push(JSON.stringify(st)); if (undoStack.length > 60) undoStack.shift(); redoStack.length = 0; }
function undo() { const s = undoStack.pop(); if (!s) return; redoStack.push(JSON.stringify(st)); st = JSON.parse(s); H = st.h || 17; syncBar(); save(false); }
function redo() { const s = redoStack.pop(); if (!s) return; undoStack.push(JSON.stringify(st)); st = JSON.parse(s); H = st.h || 17; syncBar(); save(false); }

function freshState(w: number): EdState {
  const rows: string[] = [];
  for (let y = 0; y < H; y++) {
    if (y < H - 3) rows.push('.'.repeat(w));
    else if (y === H - 3) rows.push('g'.repeat(w));
    else rows.push('#'.repeat(w));
  }
  return { name: 'My Shrine Path', theme: 'mountain', w, h: H, tiles: rows, spawn: { x: 3, y: H - 5 }, exit: { x: w - 4, y: H - 6 }, checkpoints: [], gems: [], enemies: [], spawners: [], bridges: [] };
}

function setTile(x: number, y: number, ch: string) {
  if (x < 0 || x >= st.w || y < 0 || y >= H) return;
  const row = st.tiles[y];
  st.tiles[y] = row.slice(0, x) + ch + row.slice(x + 1);
}
function tileAt(x: number, y: number) { return (x < 0 || x >= st.w || y < 0 || y >= H) ? '.' : st.tiles[y][x]; }
const isTerrainCh = (ch: string) => ch === '#' || ch === 'g';

/** Terrain brush: drag a heightline; each column fills itself (grass over stone). */
function setSurface(x: number, y: number) {
  if (x < 0 || x >= st.w) return;
  const sy = Math.max(1, Math.min(H - 2, y));
  for (let cy = 0; cy < H; cy++) {
    const cur = tileAt(x, cy);
    if (cy < sy) { if (isTerrainCh(cur)) setTile(x, cy, '.'); }
    else setTile(x, cy, cy === sy ? 'g' : '#');
  }
}
function clearColumn(x: number) { for (let cy = 0; cy < H; cy++) if (isTerrainCh(tileAt(x, cy))) setTile(x, cy, '.'); }
/** Auto-join: terrain with air above → grass cap; the rest stone. */
function normalize() {
  for (let x = 0; x < st.w; x++) for (let y = 0; y < H; y++) {
    if (!isTerrainCh(tileAt(x, y))) continue;
    setTile(x, y, isTerrainCh(tileAt(x, y - 1)) ? '#' : 'g');
  }
}
/** Ground surface row at column x (for stamps that sit on the ground). */
function surfaceAt(x: number): number {
  for (let y = 0; y < H; y++) if (isTerrainCh(tileAt(x, y)) || tileAt(x, y) === 'o') return y;
  return H - 3;
}

// ---- stamps: whole structures in one click -----------------------------------
function stamp(name: string, p: { x: number; y: number }) {
  if (name === 'pack') {                        // 3-4 enemies clustered on the ground
    const n = 3 + (Math.random() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) { const ex = p.x + i * 3; st.enemies.push({ kind: enemyKind, x: ex, y: surfaceAt(ex) - 2 }); }
  } else if (name === 'gemarc') {               // an arc of 3 gems over the click point
    st.gems.push({ x: p.x, y: p.y }, { x: p.x + 2, y: p.y - 1 }, { x: p.x + 4, y: p.y });
  } else if (name === 'hazrun') {               // 4-wide crag strip on the surface
    for (let i = 0; i < 4; i++) { const hx = p.x + i; setTile(hx, surfaceAt(hx) - 1, '^'); }
  } else if (name === 'aerial') {               // islands + bridges + gems, one click
    let px = p.x;
    for (let seg = 0; seg < 3; seg++) {
      for (let i = 0; i < 6; i++) setTile(px + i, p.y, 'o');
      st.gems.push({ x: px + 3, y: p.y - 2 });
      if (seg < 2) { st.bridges.push({ x: px + 6, y: p.y, w: 4 }); px += 10; }
    }
  }
}

/** 🧗 Tower: one click plants a zig-zag climb from the ground up to the click. */
function stampTower(p: { x: number; y: number }) {
  const base = surfaceAt(p.x);
  let k = 0;
  for (let py = base - 3; py > Math.max(2, p.y); py -= 2, k++) {
    const px = p.x + (k % 2 === 0 ? 0 : 4);
    const ch = k % 3 === 2 ? (Math.random() < 0.5 ? 'D' : 'N') : 'o';
    for (let i = 0; i < 3; i++) setTile(px + i, py, ch);
  }
  st.gems.push({ x: p.x + 1, y: Math.max(2, p.y) - 1 });
}

// ---- UI ----------------------------------------------------------------------
function buildTools() {
  toolsEl.innerHTML = '';
  const mk = (id: string, label: string, col?: string, group?: string) => {
    const b = document.createElement('button');
    b.textContent = label; if (col) b.style.borderLeft = `10px solid ${col}`;
    if (group) b.title = group;
    b.className = tool === id ? 'on' : '';
    b.onclick = () => { tool = id; bridgeStart = null; buildTools(); };
    toolsEl.appendChild(b);
  };
  const ub = document.createElement('button'); ub.textContent = '↩︎'; ub.title = 'Undo (Ctrl+Z)'; ub.onclick = undo; toolsEl.appendChild(ub);
  const rb = document.createElement('button'); rb.textContent = '↪︎'; rb.title = 'Redo (Ctrl+Y)'; rb.onclick = redo; toolsEl.appendChild(rb);
  for (const [ch, label, col] of TILE_TOOLS) mk(ch, label, col);
  for (const t of OBJ_TOOLS) mk(t, t);
  for (const [id, label] of STAMPS) mk(id, label);
  const sel = document.createElement('select');
  for (const k of ENEMY_KINDS) { const o = document.createElement('option'); o.value = k; o.textContent = k; if (k === enemyKind) o.selected = true; sel.appendChild(o); }
  sel.onchange = () => { enemyKind = sel.value as EntityKind; if (tool !== 'Spawner' && tool !== 'pack') tool = 'Enemy'; buildTools(); };
  toolsEl.appendChild(sel);
  const el = document.createElement('button');
  el.textContent = elite ? '★ elite' : '☆ elite'; el.className = elite ? 'on' : '';
  el.onclick = () => { elite = !elite; buildTools(); };
  toolsEl.appendChild(el);
  const zo = document.createElement('button'); zo.textContent = '−'; zo.title = 'Zoom out'; zo.onclick = () => setZoom(zoom / 1.25); toolsEl.appendChild(zo);
  const zl = document.createElement('button'); zl.textContent = Math.round(zoom * 100) + '%'; zl.title = 'Reset zoom'; zl.onclick = () => setZoom(1); toolsEl.appendChild(zl);
  const zi = document.createElement('button'); zi.textContent = '+'; zi.title = 'Zoom in'; zi.onclick = () => setZoom(zoom * 1.25); toolsEl.appendChild(zi);
  const zf = document.createElement('button'); zf.textContent = '⤢ Fit'; zf.title = 'Fit the whole level'; zf.onclick = fitZoom; toolsEl.appendChild(zf);
}

function setZoom(z: number, cx = cv.width / 2, cy = cv.height / 2) {
  const nz = Math.max(0.1, Math.min(3, z));
  // keep the point under (cx,cy) fixed while zooming
  camX = camX + cx / zoom - cx / nz;
  camY = camY + cy / zoom - cy / nz;
  zoom = nz; clampCam(); buildTools();
}
function fitZoom() {
  zoom = Math.max(0.1, Math.min(2, Math.min(cv.width / (st.w * TILE), cv.height / ((H + 2) * TILE))));
  camX = 0; camY = -TILE; clampCam(); buildTools();
}

(document.getElementById('new') as HTMLButtonElement).onclick = () => {
  if (!confirm('Start a new level? (current draft is kept in autosave until you paint)')) return;
  pushUndo(); H = 17;
  st = freshState(parseInt((document.getElementById('wtiles') as HTMLInputElement).value) || 120);
  syncBar(); save();
};

// Load any campaign level straight from the game's generator — edit + Publish REPLACES it.
const campSel = document.getElementById('campaign') as HTMLSelectElement;
import('./content.js').then((m: any) => {
  m.levels.slice(0, 24).forEach((lv: any, i: number) => {
    const o = document.createElement('option'); o.value = String(i); o.textContent = lv.title; campSel.appendChild(o);
  });
}).catch(() => { campSel.disabled = true; });
campSel.onchange = async () => {
  const i = parseInt(campSel.value); campSel.selectedIndex = 0;
  if (isNaN(i)) return;
  if (!confirm(`Load "L${i + 1}" for editing? Publishing will REPLACE it in the game.`)) return;
  const m: any = await import('./content.js');
  pushUndo();
  fromLevelData(JSON.parse(JSON.stringify(m.levels[i])), i);
  syncBar(); save();
};

(document.getElementById('export') as HTMLButtonElement).onclick = () => {
  const blob = new Blob([JSON.stringify(toLevelData(), null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = st.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
  a.click();
};
(document.getElementById('playtest') as HTMLButtonElement).onclick = () => {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(toLevelData()));
  window.open('play.html?playtest=1', 'wtdb-playtest');
};
(document.getElementById('publish') as HTMLButtonElement).onclick = () => {
  const t = document.getElementById('gh-token') as HTMLInputElement;
  t.value = localStorage.getItem('wtdb-gh-token') || '';
  document.getElementById('gh-status')!.textContent =
    st.replaces !== undefined ? `⚠ This will REPLACE campaign level L${st.replaces + 1} in the live game.` : 'This will publish as a new Custom Trail.';
  (document.getElementById('modal') as HTMLElement).style.display = 'grid';
};

// One-click publish via the GitHub contents API — Render redeploys, level goes live.
(document.getElementById('gh-publish') as HTMLButtonElement).onclick = async () => {
  const status = document.getElementById('gh-status')!;
  const token = (document.getElementById('gh-token') as HTMLInputElement).value.trim();
  const repo = (document.getElementById('gh-repo') as HTMLInputElement).value.trim();
  const branch = (document.getElementById('gh-branch') as HTMLInputElement).value.trim() || 'main';
  if (!token) { status.textContent = 'Paste a GitHub token first.'; return; }
  localStorage.setItem('wtdb-gh-token', token);
  const hdr = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
  const api = (p: string) => `https://api.github.com/repos/${repo}/contents/${p}`;
  const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
  const fname = st.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
  const put = (path: string, content: string, sha?: string) =>
    fetch(api(path), { method: 'PUT', headers: hdr, body: JSON.stringify({ message: '⛩ Publish level: ' + st.name, content: b64(content), branch, ...(sha ? { sha } : {}) }) });
  try {
    status.textContent = 'Publishing…';
    const ex = await fetch(api('assets/levels/' + fname) + '?ref=' + branch, { headers: hdr });
    const sha1 = ex.ok ? (await ex.json()).sha : undefined;
    const r1 = await put('assets/levels/' + fname, JSON.stringify(toLevelData(), null, 1), sha1);
    if (!r1.ok) throw new Error('level upload: ' + r1.status);
    const ir = await fetch(api('assets/levels/index.json') + '?ref=' + branch, { headers: hdr });
    if (!ir.ok) throw new Error('manifest read: ' + ir.status);
    const ij = await ir.json();
    const manifest = JSON.parse(decodeURIComponent(escape(atob(ij.content.replace(/\n/g, '')))));
    if (!manifest.files.includes(fname)) {
      manifest.files.push(fname);
      const r2 = await put('assets/levels/index.json', JSON.stringify(manifest, null, 1), ij.sha);
      if (!r2.ok) throw new Error('manifest update: ' + r2.status);
    }
    status.textContent = `✓ Published! “${st.name}” deploys in ~2 min → Level Select.`;
  } catch (e) {
    status.textContent = '✗ ' + (e as Error).message + ' — check the token scope (Contents: read/write).';
  }
};
(document.getElementById('import') as HTMLButtonElement).onclick = () => (document.getElementById('file') as HTMLInputElement).click();
(document.getElementById('file') as HTMLInputElement).onchange = e => {
  const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
  f.text().then(t => { try { pushUndo(); fromLevelData(JSON.parse(t)); syncBar(); save(); } catch { alert('Not a valid level JSON'); } });
};
(document.getElementById('name') as HTMLInputElement).oninput = e => { st.name = (e.target as HTMLInputElement).value; save(false); };
(document.getElementById('theme') as HTMLSelectElement).onchange = e => { st.theme = (e.target as HTMLSelectElement).value; save(false); };
(document.getElementById('wtiles') as HTMLInputElement).onchange = e => {
  const w = Math.max(40, Math.min(300, parseInt((e.target as HTMLInputElement).value) || 120));
  pushUndo();
  st.tiles = st.tiles.map(r => (r + '.'.repeat(Math.max(0, w - r.length))).slice(0, w));
  st.w = w; save();
};
function syncBar() {
  (document.getElementById('name') as HTMLInputElement).value = st.name;
  (document.getElementById('theme') as HTMLSelectElement).value = st.theme;
  (document.getElementById('wtiles') as HTMLInputElement).value = String(st.w);
}

// ---- pointer / keys -----------------------------------------------------------
function cellAt(e: PointerEvent) {
  const r = cv.getBoundingClientRect();
  const px = (e.clientX - r.left) * (cv.width / r.width) / zoom + camX;
  const py = (e.clientY - r.top) * (cv.height / r.height) / zoom + camY;
  return { x: Math.floor(px / TILE), y: Math.floor(py / TILE) };
}
const isBrush = () => tool.length === 1 || tool === 'terrain' || tool === 'pit' || tool === 'island';
cv.addEventListener('contextmenu', e => e.preventDefault());
// wheel / trackpad-pinch zoom, centred on the cursor
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const r = cv.getBoundingClientRect();
  const cx = (e.clientX - r.left) * (cv.width / r.width), cy = (e.clientY - r.top) * (cv.height / r.height);
  setZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), cx, cy);
}, { passive: false });
cv.addEventListener('pointerdown', e => {
  const p = cellAt(e);
  if (tool === 'Pan' || e.button === 1) { panning = true; panStart = { x: e.clientX, y: e.clientY, cx: camX, cy: camY }; return; }
  if (tool === '✂ Select') {
    if (sel && inSel(p)) { pushUndo(); movingSel = true; moveFrom = p; moveDelta = { x: 0, y: 0 }; }   // drag inside → move it
    else { selecting = true; selAnchor = p; sel = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; }            // drag outside → new marquee
    return;
  }
  pushUndo();
  if (e.button === 2) { rightErase = true; painting = true; lastCell = p; setTile(p.x, p.y, '.'); return; }   // right-click always erases tiles
  painting = true; lastCell = p;
  if (tool === 'island') { islandRow = p.y; setTile(p.x, p.y, 'o'); return; }
  if (tool === 'tower') { stampTower(p); painting = false; return; }
  if (STAMPS.some(s => s[0] === tool)) { stamp(tool, p); painting = false; return; }
  if (tool === 'Move') { dragObj = findObj(p); return; }
  apply(p);
});
cv.addEventListener('pointermove', e => {
  if (panning) { camX = panStart.cx - (e.clientX - panStart.x) / zoom; camY = panStart.cy - (e.clientY - panStart.y) / zoom; clampCam(); return; }
  if (selecting) { const p = cellAt(e); sel = { x0: Math.min(selAnchor.x, p.x), y0: Math.min(selAnchor.y, p.y), x1: Math.max(selAnchor.x, p.x), y1: Math.max(selAnchor.y, p.y) }; return; }
  if (movingSel) { const p = cellAt(e); moveDelta = { x: p.x - moveFrom.x, y: p.y - moveFrom.y }; return; }
  if (!painting) return;
  const p = cellAt(e), prev = lastCell ?? p;
  if (tool === 'Move' && dragObj) { moveObj(dragObj, p); lastCell = p; return; }
  if (rightErase || isBrush()) {
    const steps = Math.max(1, Math.abs(p.x - prev.x));
    for (let i = 1; i <= steps; i++) {
      const q = { x: Math.round(prev.x + (p.x - prev.x) * i / steps), y: Math.round(prev.y + (p.y - prev.y) * i / steps) };
      if (rightErase) setTile(q.x, q.y, '.');
      else if (tool === 'island') setTile(q.x, islandRow ?? q.y, 'o');
      else apply(q);
    }
    lastCell = p;
  }
});
window.addEventListener('pointerup', () => {
  if (movingSel) { commitSelMove(moveDelta.x, moveDelta.y); movingSel = false; moveDelta = { x: 0, y: 0 }; save(false); return; }
  if (selecting) { selecting = false; return; }
  if (painting && !rightErase && tool !== 'island') normalize();
  painting = false; panning = false; rightErase = false; lastCell = null; islandRow = null; dragObj = null; save(false);
});
window.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (e.key === 'Escape') { sel = null; return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel && (document.activeElement as HTMLElement)?.tagName !== 'INPUT') { e.preventDefault(); deleteSel(); return; }
  const k = e.key.toLowerCase(); const sp = 26;
  if (k === 'arrowleft' || k === 'a') camX -= sp; if (k === 'arrowright' || k === 'd') camX += sp;
  if (k === 'arrowup' || k === 'w') camY -= sp; if (k === 'arrowdown' || k === 's') camY += sp;
  clampCam();
});
function clampCam() {
  const maxX = Math.max(0, st.w * TILE - cv.width / zoom);
  const maxY = Math.max(-60, H * TILE - cv.height / zoom + 60);
  camX = Math.max(0, Math.min(maxX, camX));
  camY = Math.max(-60, Math.min(maxY, camY));
}

// ---- ✂ Select: area move/delete ---------------------------------------------
const inSel = (p: Obj) => !!sel && p.x >= sel.x0 && p.x <= sel.x1 && p.y >= sel.y0 && p.y <= sel.y1;
function commitSelMove(dx: number, dy: number) {
  if (!sel || (dx === 0 && dy === 0)) return;
  // lift the tile region, clear it, stamp at the offset (clipped to bounds)
  const buf: string[][] = [];
  for (let y = sel.y0; y <= sel.y1; y++) { const row: string[] = []; for (let x = sel.x0; x <= sel.x1; x++) { row.push(tileAt(x, y)); setTile(x, y, '.'); } buf.push(row); }
  for (let y = 0; y < buf.length; y++) for (let x = 0; x < buf[y].length; x++) {
    if (buf[y][x] !== '.') setTile(sel.x0 + x + dx, sel.y0 + y + dy, buf[y][x]);
  }
  // objects inside ride along
  const shift = (o: Obj) => { if (inSel(o)) { o.x += dx; o.y += dy; } };
  st.enemies.forEach(shift); st.gems.forEach(shift); st.checkpoints.forEach(shift); st.spawners.forEach(shift);
  shift(st.spawn); shift(st.exit);
  for (const b of st.bridges) if (inSel({ x: b.x, y: b.y })) { b.x += dx; b.y += dy; }
  sel = { x0: sel.x0 + dx, y0: sel.y0 + dy, x1: sel.x1 + dx, y1: sel.y1 + dy };
  normalize();
}
function deleteSel() {
  if (!sel) return;
  pushUndo();
  for (let y = sel.y0; y <= sel.y1; y++) for (let x = sel.x0; x <= sel.x1; x++) setTile(x, y, '.');
  st.enemies = st.enemies.filter(o => !inSel(o)); st.gems = st.gems.filter(o => !inSel(o));
  st.checkpoints = st.checkpoints.filter(o => !inSel(o)); st.spawners = st.spawners.filter(o => !inSel(o));
  st.bridges = st.bridges.filter(b => !inSel({ x: b.x, y: b.y }));
  normalize(); save(false);
}

// ---- Move tool ------------------------------------------------------------------
function findObj(p: Obj): typeof dragObj {
  const near = (o: Obj) => Math.hypot(o.x - p.x, o.y - p.y) < 1.8;
  if (near(st.spawn)) return { list: 'spawn', i: 0 };
  if (near(st.exit)) return { list: 'exit', i: 0 };
  for (const [list, arr] of [['enemies', st.enemies], ['spawners', st.spawners], ['gems', st.gems], ['checkpoints', st.checkpoints]] as const) {
    const i = (arr as Obj[]).findIndex(near);
    if (i >= 0) return { list: list as any, i };
  }
  return null;
}
function moveObj(d: NonNullable<typeof dragObj>, p: Obj) {
  const t = d.list === 'spawn' ? st.spawn : d.list === 'exit' ? st.exit : (st as any)[d.list][d.i];
  if (t) { t.x = p.x; t.y = p.y; }
}

function apply(p: Obj) {
  if (p.x < 0 || p.x >= st.w || p.y < 0 || p.y >= H) return;
  if (tool === 'terrain') { setSurface(p.x, p.y); return; }
  if (tool === 'pit') { clearColumn(p.x); return; }
  if (tool.length === 1) { setTile(p.x, p.y, tool); return; }
  if (tool === 'Spawn') st.spawn = { ...p };
  else if (tool === 'Exit') st.exit = { ...p };
  else if (tool === 'Checkpoint') st.checkpoints.push({ ...p });
  else if (tool === 'Gem') st.gems.push({ ...p });
  else if (tool === 'Enemy') st.enemies.push({ kind: enemyKind, ...p, elite: elite || undefined });
  else if (tool === 'Spawner') st.spawners.push({ kind: enemyKind, ...p, every: 4, max: 3 });
  else if (tool === 'Bridge') {
    if (!bridgeStart) bridgeStart = { ...p };
    else { const x0 = Math.min(bridgeStart.x, p.x), x1 = Math.max(bridgeStart.x, p.x); st.bridges.push({ x: x0, y: bridgeStart.y, w: Math.max(2, x1 - x0) }); bridgeStart = null; }
  } else if (tool === 'Delete') {
    const near = (o: Obj) => Math.hypot(o.x - p.x, o.y - p.y) < 1.6;
    st.checkpoints = st.checkpoints.filter(o => !near(o));
    st.gems = st.gems.filter(o => !near(o));
    st.enemies = st.enemies.filter(o => !near(o));
    st.spawners = st.spawners.filter(o => !near(o));
    st.bridges = st.bridges.filter(b => !(p.y >= b.y - 1 && p.y <= b.y + 1 && p.x >= b.x - 1 && p.x <= b.x + b.w + 1));
  }
  save(false);
}

// ---- convert to/from LevelData ----------------------------------------------------
function toLevelData(): Record<string, unknown> {
  const acts: Record<string, number> = { mountain: 1, bridge: 2, cavern: 3, sunless: 4 };
  return {
    relics: [], shrines: [], platforms: [], introLore: '', outroLore: '', unlockCodexOnComplete: [],
    act: acts[st.theme] || 1, difficulty: 1,
    ...(st.carry || {}),
    id: (st.carry as any)?.id ?? ('custom-' + st.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
    title: st.name, subtitle: (st.carry as any)?.subtitle ?? 'A custom shrine path',
    ...(st.replaces !== undefined ? { replaces: st.replaces } : { custom: true }),
    width: st.w, height: H, tiles: st.tiles.slice(),
    spawn: { x: st.spawn.x * TILE, y: st.spawn.y * TILE },
    exit: { x: st.exit.x * TILE, y: st.exit.y * TILE - 40, w: 30, h: 96 },
    checkpoints: st.checkpoints.map(o => ({ x: o.x * TILE, y: o.y * TILE - 24, w: 28, h: 56 })),
    entities: st.enemies.map(o => ({ kind: o.kind, x: o.x * TILE, y: o.y * TILE, elite: o.elite })),
    gems: st.gems.map(o => ({ x: o.x * TILE, y: o.y * TILE })),
    spawners: st.spawners.map(s => ({ kind: s.kind, x: s.x * TILE, y: s.y * TILE, every: s.every, max: s.max })),
    bridges: st.bridges.map(b => ({ x: b.x * TILE - 12, y: b.y * TILE, w: b.w * TILE + 24 })),
    theme: st.theme,
  };
}
function fromLevelData(d: any, replaces?: number) {
  const h = Math.max(12, Math.min(24, d.height || d.tiles.length || 17));
  const carry: Record<string, unknown> = {};
  for (const k of ['id', 'subtitle', 'platforms', 'windZones', 'relics', 'shrines', 'secretExit', 'secretExitTo', 'introLore', 'outroLore', 'unlockCodexOnComplete', 'act', 'difficulty', 'isBoss', 'hidden']) {
    if (d[k] !== undefined) carry[k] = d[k];
  }
  st = {
    name: d.title || 'Imported', theme: d.theme || 'mountain', w: d.width || (d.tiles?.[0]?.length ?? 120),
    h, replaces: replaces ?? d.replaces, carry,
    tiles: d.tiles.slice(0, h),
    spawn: { x: Math.round((d.spawn?.x ?? 96) / TILE), y: Math.round((d.spawn?.y ?? 300) / TILE) },
    exit: { x: Math.round((d.exit?.x ?? 300) / TILE), y: Math.round(((d.exit?.y ?? 300) + 40) / TILE) },
    checkpoints: (d.checkpoints || []).map((o: any) => ({ x: Math.round(o.x / TILE), y: Math.round((o.y + 24) / TILE) })),
    gems: (d.gems || []).map((o: any) => ({ x: Math.round(o.x / TILE), y: Math.round(o.y / TILE) })),
    enemies: (d.entities || []).map((o: any) => ({ kind: o.kind, x: Math.round(o.x / TILE), y: Math.round(o.y / TILE), elite: o.elite })),
    spawners: (d.spawners || []).map((s: any) => ({ kind: s.kind, x: Math.round(s.x / TILE), y: Math.round(s.y / TILE), every: s.every || 4, max: s.max || 3 })),
    bridges: (d.bridges || []).map((b: any) => ({ x: Math.round((b.x + 12) / TILE), y: Math.round(b.y / TILE), w: Math.round((b.w - 24) / TILE) })),
  };
  H = h;
  while (st.tiles.length < H) st.tiles.push('.'.repeat(st.w));
}

// ---- persistence ------------------------------------------------------------------
function save(_snapshot = true) { st.h = H; localStorage.setItem(STATE_KEY, JSON.stringify(st)); }
function load() { try { const s = localStorage.getItem(STATE_KEY); if (s) { st = JSON.parse(s); st.spawners = st.spawners || []; H = st.h || st.tiles.length || 17; } } catch { /* fresh */ } }

// ---- render -------------------------------------------------------------------------
const TILE_COL: Record<string, string> = { '#': '#5a4a66', g: '#7ca23f', o: '#8a6b45', D: '#f0b45a', N: '#7fa8d6', '^': '#8a7c7c', F: '#ff7840', S: '#8ed7ff' };
function draw() {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#160f1e'; c.fillRect(0, 0, cv.width, cv.height);
  c.setTransform(zoom, 0, 0, zoom, -camX * zoom, -camY * zoom);
  c.fillStyle = '#241a30'; c.fillRect(0, 0, st.w * TILE, H * TILE);
  for (let y = 0; y < H; y++) for (let x = Math.floor(camX / TILE); x <= Math.floor((camX + cv.width / zoom) / TILE) && x < st.w; x++) {
    const ch = tileAt(x, y); if (ch === '.') continue;
    c.fillStyle = TILE_COL[ch] || '#666';
    c.fillRect(x * TILE, y * TILE, TILE, TILE);
    if (ch === 'g') { c.fillStyle = '#a8d05f'; c.fillRect(x * TILE, y * TILE, TILE, 6); }
    if (ch === 'o') { c.fillStyle = '#5a4630'; c.fillRect(x * TILE, y * TILE + 10, TILE, 6); }
    if (ch === '^' || ch === 'F' || ch === 'S') { c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); for (let i = 0; i < 3; i++) { c.moveTo(x * TILE + i * 11, y * TILE + TILE); c.lineTo(x * TILE + i * 11 + 5, y * TILE + 8); c.lineTo(x * TILE + i * 11 + 10, y * TILE + TILE); } c.fill(); }
  }
  c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 1; c.beginPath();
  for (let x = 0; x <= st.w; x++) { c.moveTo(x * TILE, 0); c.lineTo(x * TILE, H * TILE); }
  for (let y = 0; y <= H; y++) { c.moveTo(0, y * TILE); c.lineTo(st.w * TILE, y * TILE); }
  c.stroke();
  for (const b of st.bridges) {
    c.fillStyle = '#8a6b45'; c.fillRect(b.x * TILE, b.y * TILE, b.w * TILE, 8);
    c.fillStyle = '#5a3c22'; c.fillRect(b.x * TILE - 3, b.y * TILE - 10, 5, 18); c.fillRect((b.x + b.w) * TILE - 2, b.y * TILE - 10, 5, 18);
  }
  if (bridgeStart) { c.fillStyle = '#ffd777'; c.fillRect(bridgeStart.x * TILE, bridgeStart.y * TILE, TILE, 8); }
  const glyph = (x: number, y: number, txt: string, col: string) => {
    c.fillStyle = col; c.font = 'bold 20px Georgia'; c.textAlign = 'center';
    c.fillText(txt, x * TILE + TILE / 2, y * TILE + TILE * 0.78);
  };
  for (const o of st.gems) glyph(o.x, o.y, '◆', '#ffcf6a');
  for (const o of st.checkpoints) glyph(o.x, o.y, '🏮', '#ffb24a');
  for (const o of st.enemies) { glyph(o.x, o.y, o.elite ? '👹' : '●', '#ff5c49'); c.font = '9px Georgia'; c.fillStyle = '#ffb0a0'; c.fillText(o.kind, o.x * TILE + TILE / 2, o.y * TILE + TILE + 10); }
  for (const s of st.spawners) { glyph(s.x, s.y, '⟳', '#c2a6ff'); c.font = '9px Georgia'; c.fillStyle = '#d0baff'; c.fillText(`${s.kind} ×${s.max}/${s.every}s`, s.x * TILE + TILE / 2, s.y * TILE + TILE + 10); }
  glyph(st.spawn.x, st.spawn.y, '▲', '#8fd9a8');
  glyph(st.exit.x, st.exit.y, '⛩', '#ffd777');
  // marquee selection (and its ghost while dragging to a new spot)
  if (sel) {
    const rect = (dx: number, dy: number, a: number) => {
      c.save(); c.strokeStyle = `rgba(255,215,119,${a})`; c.lineWidth = 2; c.setLineDash([8, 6]);
      c.strokeRect((sel!.x0 + dx) * TILE, (sel!.y0 + dy) * TILE, (sel!.x1 - sel!.x0 + 1) * TILE, (sel!.y1 - sel!.y0 + 1) * TILE);
      c.fillStyle = `rgba(255,215,119,${a * 0.12})`;
      c.fillRect((sel!.x0 + dx) * TILE, (sel!.y0 + dy) * TILE, (sel!.x1 - sel!.x0 + 1) * TILE, (sel!.y1 - sel!.y0 + 1) * TILE);
      c.restore();
    };
    rect(0, 0, movingSel ? 0.35 : 0.9);
    if (movingSel && (moveDelta.x || moveDelta.y)) rect(moveDelta.x, moveDelta.y, 0.9);
  }
  requestAnimationFrame(draw);
}

load(); syncBar(); buildTools(); clampCam(); draw();

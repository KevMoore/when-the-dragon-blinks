// ⛩ Shrine Forge — Photoshop-lite level editor.
// Full-viewport stage, icon tool-rail, contextual inspector, pan-by-default
// navigation (drag / trackpad scroll), styled confirms + toasts. Playtest via
// localStorage handoff; publish commits straight to the game repo.
import { TILE } from './types.js';
import type { EntityKind } from './types.js';

let H = 17;
const DRAFT_KEY = 'wtdb-draft';
const STATE_KEY = 'wtdb-editor-state';

type Obj = { x: number; y: number };
type Spawner = { kind: EntityKind; x: number; y: number; every: number; max: number };

interface EdState {
  name: string; theme: string; w: number;
  h?: number; replaces?: number; carry?: Record<string, unknown>;
  tiles: string[];
  spawn: Obj; exit: Obj;
  checkpoints: Obj[]; gems: Obj[];
  enemies: { kind: EntityKind; x: number; y: number; elite?: boolean }[];
  spawners: Spawner[];
  bridges: { x: number; y: number; w: number }[];
}

const $ = (id: string) => document.getElementById(id)!;
const cv = $('ed') as HTMLCanvasElement;
const c = cv.getContext('2d')!;
const stage = $('stage');

// ---- tool definitions ---------------------------------------------------------
type ToolDef = { id: string; icon: string; label: string; hint: string };
const SEP = null;
const TOOLS: (ToolDef | null)[] = [
  { id: 'Pan', icon: '🖐', label: 'Navigate', hint: 'Drag or scroll to move around the board' },
  { id: 'Select', icon: '⛶', label: 'Select area', hint: 'Drag a box · drag inside it to move everything · Del deletes · Esc clears' },
  { id: 'Move', icon: '↔️', label: 'Move object', hint: 'Drag any placed object to reposition it' },
  SEP,
  { id: 'terrain', icon: '⛰', label: 'Terrain brush', hint: 'Drag the ground heightline — columns fill themselves' },
  { id: 'pit', icon: '🕳', label: 'Pit', hint: 'Drag to carve gaps down to nothing' },
  { id: 'island', icon: '🏝', label: 'Island', hint: 'Drag horizontally to lay a floating platform' },
  { id: 'tower', icon: '🧗', label: 'Climb tower', hint: 'One click plants a zig-zag climb up to that height' },
  SEP,
  { id: '#', icon: '🧱', label: 'Stone', hint: 'Paint solid stone' },
  { id: 'o', icon: '▭', label: 'Platform tile', hint: 'Paint one-way platform tiles' },
  { id: 'D', icon: '☀️', label: 'Day block', hint: 'Solid only while the world is DAY' },
  { id: 'N', icon: '🌙', label: 'Night block', hint: 'Solid only while the world is NIGHT' },
  { id: '^', icon: '⚠️', label: 'Crags', hint: 'Paint spike hazards' },
  { id: 'F', icon: '🔥', label: 'Fire', hint: 'Torch-fire hazard (day)' },
  { id: 'S', icon: '❄️', label: 'Frost', hint: 'Frost shards hazard (night)' },
  { id: '.', icon: '⌫', label: 'Erase', hint: 'Erase tiles (right-click also erases with any tool)' },
  SEP,
  { id: 'Spawn', icon: '▲', label: 'Player spawn', hint: 'Click to set where the player starts' },
  { id: 'Exit', icon: '⛩', label: 'Exit shrine', hint: 'Click to place the level exit' },
  { id: 'Checkpoint', icon: '🏮', label: 'Checkpoint', hint: 'Click to place a checkpoint lantern' },
  { id: 'Gem', icon: '💠', label: 'Torch-gem', hint: 'Click to place a dragon-meter gem' },
  { id: 'Enemy', icon: '👹', label: 'Enemy', hint: 'Click to place the selected enemy kind' },
  { id: 'Spawner', icon: '♻️', label: 'Spawner', hint: 'Click to place a wave-spawn point (kind ×max / every s)' },
  { id: 'Bridge', icon: '🌉', label: 'Bridge', hint: 'Click the start, then the end' },
  { id: 'Delete', icon: '🗑', label: 'Delete object', hint: 'Click near an object to remove it' },
];
const STAMPS: [string, string, string][] = [
  ['pack', '👥', 'Enemy pack — 3-4 of the selected kind on the ground'],
  ['gemarc', '💎', 'Gem arc — a collectible arc of three'],
  ['hazrun', '⚠️', 'Hazard strip — a run of crags on the surface'],
  ['aerial', '🌉', 'Aerial run — islands + bridges + gems in one click'],
];
const ENEMY_KINDS: EntityKind[] = ['moth', 'guardian', 'wisp', 'sentry', 'ghoul', 'skull', 'crawler', 'crow', 'sentinel', 'wraith'];
const toolDef = (id: string) => TOOLS.find(t => t && t.id === id) as ToolDef | undefined;

// ---- state ---------------------------------------------------------------------
let st: EdState = freshState(120);
let tool = 'Pan';
let enemyKind: EntityKind = 'guardian';
let elite = false;
let spEvery = 4, spMax = 3;
let camX = 0, camY = -40, zoom = 1;
let painting = false, panning = false, rightErase = false, spaceHeld = false;
let panStart = { x: 0, y: 0, cx: 0, cy: 0 };
let lastCell: Obj | null = null;
let bridgeStart: Obj | null = null;
let islandRow: number | null = null;
let dragObj: { list: 'checkpoints' | 'gems' | 'enemies' | 'spawners' | 'spawn' | 'exit'; i: number } | null = null;
let sel: { x0: number; y0: number; x1: number; y1: number } | null = null;
let selecting = false, movingSel = false;
let selAnchor = { x: 0, y: 0 }, moveFrom = { x: 0, y: 0 }, moveDelta = { x: 0, y: 0 };

// ---- undo / redo ----------------------------------------------------------------
const undoStack: string[] = [];
const redoStack: string[] = [];
function pushUndo() { undoStack.push(JSON.stringify(st)); if (undoStack.length > 60) undoStack.shift(); redoStack.length = 0; }
function undo() { const s = undoStack.pop(); if (!s) return; redoStack.push(JSON.stringify(st)); st = JSON.parse(s); H = st.h || 17; syncInspector(); save(); }
function redo() { const s = redoStack.pop(); if (!s) return; undoStack.push(JSON.stringify(st)); st = JSON.parse(s); H = st.h || 17; syncInspector(); save(); }

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
function normalize() {
  // smooth hairline defects first: fill 1-wide cracks, shave 1-wide spikes
  const surfT = (x: number) => { for (let y = 0; y < H; y++) if (isTerrainCh(tileAt(x, y))) return y; return -1; };
  for (let pass = 0; pass < 2; pass++) {
    for (let x = 1; x < st.w - 1; x++) {
      const s = surfT(x), l = surfT(x - 1), r = surfT(x + 1);
      if (s < 0 || l < 0 || r < 0) continue;
      if (s > l && s > r) { for (let y = Math.max(l, r); y < s; y++) setTile(x, y, '#'); }
      else if (s < l && s < r) { for (let y = s; y < Math.min(l, r); y++) setTile(x, y, '.'); }
    }
  }
  for (let x = 0; x < st.w; x++) for (let y = 0; y < H; y++) {
    if (!isTerrainCh(tileAt(x, y))) continue;
    setTile(x, y, isTerrainCh(tileAt(x, y - 1)) ? '#' : 'g');
  }
}
function surfaceAt(x: number): number {
  for (let y = 0; y < H; y++) if (isTerrainCh(tileAt(x, y)) || tileAt(x, y) === 'o') return y;
  return H - 3;
}

function stamp(name: string, p: Obj) {
  if (name === 'pack') {
    const n = 3 + (Math.random() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) { const ex = p.x + i * 3; st.enemies.push({ kind: enemyKind, x: ex, y: surfaceAt(ex) - 2 }); }
  } else if (name === 'gemarc') {
    st.gems.push({ x: p.x, y: p.y }, { x: p.x + 2, y: p.y - 1 }, { x: p.x + 4, y: p.y });
  } else if (name === 'hazrun') {
    for (let i = 0; i < 4; i++) { const hx = p.x + i; setTile(hx, surfaceAt(hx) - 1, '^'); }
  } else if (name === 'aerial') {
    let px = p.x;
    for (let seg = 0; seg < 3; seg++) {
      for (let i = 0; i < 6; i++) setTile(px + i, p.y, 'o');
      st.gems.push({ x: px + 3, y: p.y - 2 });
      if (seg < 2) { st.bridges.push({ x: px + 6, y: p.y, w: 4 }); px += 10; }
    }
  }
  toast(`${toolLabel(name)} stamped`);
}
function stampTower(p: Obj) {
  const base = surfaceAt(p.x);
  let k = 0;
  for (let py = base - 3; py > Math.max(2, p.y); py -= 2, k++) {
    const px = p.x + (k % 2 === 0 ? 0 : 4);
    const ch = k % 3 === 2 ? (Math.random() < 0.5 ? 'D' : 'N') : 'o';
    for (let i = 0; i < 3; i++) setTile(px + i, py, ch);
  }
  st.gems.push({ x: p.x + 1, y: Math.max(2, p.y) - 1 });
}
function toolLabel(id: string) { return STAMPS.find(s => s[0] === id)?.[2]?.split(' — ')[0] ?? toolDef(id)?.label ?? id; }

// ---- confirm modal + toasts ------------------------------------------------------
function ask(title: string, body: string, yes = 'Confirm'): Promise<boolean> {
  return new Promise(res => {
    $('confirm-title').textContent = title;
    $('confirm-body').textContent = body;
    ($('confirm-yes') as HTMLButtonElement).textContent = yes;
    const ov = $('confirm-overlay'); ov.classList.add('show');
    const done = (v: boolean) => { ov.classList.remove('show'); ($('confirm-yes') as HTMLButtonElement).onclick = null; ($('confirm-no') as HTMLButtonElement).onclick = null; res(v); };
    ($('confirm-yes') as HTMLButtonElement).onclick = () => done(true);
    ($('confirm-no') as HTMLButtonElement).onclick = () => done(false);
  });
}
function toast(msg: string) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  $('toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 450); }, 2200);
}
let saveDotT: ReturnType<typeof setTimeout> | undefined;
function blinkSaved() { const d = $('savedot'); d.classList.add('on'); clearTimeout(saveDotT); saveDotT = setTimeout(() => d.classList.remove('on'), 1200); }

// ---- rail + inspector -------------------------------------------------------------
function buildRail() {
  const rail = $('rail'); rail.innerHTML = '';
  for (const t of TOOLS) {
    if (!t) { const s = document.createElement('div'); s.className = 'rsep'; rail.appendChild(s); continue; }
    const b = document.createElement('button');
    b.className = 'rbtn' + (tool === t.id ? ' on' : '');
    b.innerHTML = `${t.icon}<span class="tip">${t.label}</span>`;
    b.onclick = () => { tool = t.id; bridgeStart = null; buildRail(); syncInspector(); updateHint(); };
    rail.appendChild(b);
  }
  cv.classList.toggle('tooling', tool !== 'Pan');
}

function syncInspector() {
  const insp = $('insp'); insp.innerHTML = '';
  const sec = (title: string) => { const d = document.createElement('div'); d.className = 'sec'; d.innerHTML = `<h3>${title}</h3>`; insp.appendChild(d); return d; };

  // LEVEL
  const lv = sec('Level');
  lv.insertAdjacentHTML('beforeend', `
    <div class="row"><input id="name" class="full" type="text" value="" /></div>
    <div class="row"><select id="theme">
      <option value="mountain">Act I · Mountain</option><option value="bridge">Act II · Bridge</option>
      <option value="cavern">Act III · Cavern</option><option value="sunless">Act IV · Sunless</option>
    </select></div>
    <div class="row"><label>Width</label><input id="wtiles" type="number" min="40" max="300" /><label>tiles · ${H} high</label></div>
    <div class="row"><select id="campaign" class="full"><option value="">Load campaign level…</option></select></div>
    <div class="row" id="replrow"></div>`);
  ($('name') as HTMLInputElement).value = st.name;
  ($('theme') as HTMLSelectElement).value = st.theme;
  ($('wtiles') as HTMLInputElement).value = String(st.w);
  ($('name') as HTMLInputElement).oninput = e => { st.name = (e.target as HTMLInputElement).value; save(); };
  ($('theme') as HTMLSelectElement).onchange = e => { st.theme = (e.target as HTMLSelectElement).value; save(); };
  ($('wtiles') as HTMLInputElement).onchange = e => {
    const w = Math.max(40, Math.min(300, parseInt((e.target as HTMLInputElement).value) || 120));
    pushUndo();
    st.tiles = st.tiles.map(r => (r + '.'.repeat(Math.max(0, w - r.length))).slice(0, w));
    st.w = w; save(); updateInfo();
  };
  populateCampaign();
  if (st.replaces !== undefined) {
    $('replrow').innerHTML = `<span class="badge">Editing campaign L${st.replaces + 1} — publish replaces it</span> <button class="tbtn" id="detach">Detach</button>`;
    ($('detach') as HTMLButtonElement).onclick = () => { st.replaces = undefined; delete (st.carry as any)?.id; syncInspector(); save(); toast('Detached — will publish as a new Custom Trail'); };
  }

  // TOOL OPTIONS (contextual)
  if (['Enemy', 'Spawner', 'pack'].includes(tool)) {
    const to = sec('Tool · ' + toolLabel(tool));
    const selE = document.createElement('select');
    for (const k of ENEMY_KINDS) { const o = document.createElement('option'); o.value = k; o.textContent = k; if (k === enemyKind) o.selected = true; selE.appendChild(o); }
    selE.onchange = () => { enemyKind = selE.value as EntityKind; };
    const row = document.createElement('div'); row.className = 'row'; row.appendChild(selE); to.appendChild(row);
    if (tool !== 'Spawner') {
      const tg = document.createElement('span'); tg.className = 'toggle' + (elite ? ' on' : ''); tg.textContent = elite ? '★ elite' : '☆ elite';
      tg.onclick = () => { elite = !elite; syncInspector(); };
      const r2 = document.createElement('div'); r2.className = 'row'; r2.appendChild(tg); to.appendChild(r2);
    } else {
      to.insertAdjacentHTML('beforeend', `<div class="row"><label>Every</label><input id="spevery" type="number" min="1" max="30" value="${spEvery}" /><label>s · keep</label><input id="spmax" type="number" min="1" max="10" value="${spMax}" /><label>alive</label></div>`);
      ($('spevery') as HTMLInputElement).onchange = e => { spEvery = Math.max(1, parseInt((e.target as HTMLInputElement).value) || 4); };
      ($('spmax') as HTMLInputElement).onchange = e => { spMax = Math.max(1, parseInt((e.target as HTMLInputElement).value) || 3); };
    }
  }

  // STAMPS
  const sm = sec('Stamps — one click');
  for (const [id, icon, desc] of STAMPS) {
    const b = document.createElement('button');
    b.className = 'stampbtn' + (tool === id ? ' on' : '');
    b.innerHTML = `<span style="font-size:17px">${icon}</span><span>${desc.split(' — ')[0]}<br><small style="color:var(--dim)">${desc.split(' — ')[1]}</small></span>`;
    b.onclick = () => { tool = id; buildRail(); syncInspector(); updateHint(); };
    sm.appendChild(b);
  }

  // FILE
  const ac = sec('File'); ac.classList.add('actions');
  const mkBtn = (label: string, fn: () => void, cls = 'tbtn') => { const b = document.createElement('button'); b.className = cls; b.textContent = label; b.onclick = fn; ac.appendChild(b); };
  mkBtn('🗒 New level', async () => {
    if (!(await ask('Start a new level?', 'Your current draft stays in autosave until you paint over it.', 'New level'))) return;
    pushUndo(); H = 17;
    st = freshState(parseInt(($('wtiles') as HTMLInputElement).value) || 120);
    syncInspector(); save(); toast('Fresh canvas ready');
  });
  mkBtn('⬆️ Import JSON', () => ($('file') as HTMLInputElement).click());
  mkBtn('⬇️ Export JSON', () => {
    const blob = new Blob([JSON.stringify(toLevelData(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = st.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
    a.click(); toast('Level exported');
  });
  updateInfo();
}

let campaignLevels: any[] | null = null;
async function populateCampaign() {
  const campSel = $('campaign') as HTMLSelectElement;
  try {
    if (!campaignLevels) { const m: any = await import('./content.js'); campaignLevels = m.levels; }
    campaignLevels!.slice(0, 24).forEach((lv: any, i: number) => {
      const o = document.createElement('option'); o.value = String(i); o.textContent = lv.title; campSel.appendChild(o);
    });
    campSel.onchange = async () => {
      const i = parseInt(campSel.value); campSel.selectedIndex = 0;
      if (isNaN(i)) return;
      if (!(await ask(`Load L${i + 1} for editing?`, 'Publishing this level will REPLACE it in the live game (you can Detach to publish as a new level instead).', 'Load it'))) return;
      pushUndo();
      fromLevelData(JSON.parse(JSON.stringify(campaignLevels![i])), i);
      syncInspector(); save(); fitZoom(); toast(`L${i + 1} loaded — ⤢ centred`);
    };
  } catch { campSel.disabled = true; }
}

// ---- top bar -------------------------------------------------------------------
($('undo') as HTMLButtonElement).onclick = undo;
($('redo') as HTMLButtonElement).onclick = redo;
($('zout') as HTMLButtonElement).onclick = () => setZoom(zoom / 1.25);
($('zin') as HTMLButtonElement).onclick = () => setZoom(zoom * 1.25);
($('zlvl') as HTMLButtonElement).onclick = () => setZoom(1);
($('zfit') as HTMLButtonElement).onclick = fitZoom;
($('playtest') as HTMLButtonElement).onclick = () => {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(toLevelData()));
  window.open('play.html?playtest=1', 'wtdb-playtest');
  toast('Playtest opened in a new tab');
};
($('publish') as HTMLButtonElement).onclick = () => {
  ($('gh-token') as HTMLInputElement).value = localStorage.getItem('wtdb-gh-token') || '';
  $('gh-status').textContent =
    st.replaces !== undefined ? `⚠ This will REPLACE campaign level L${st.replaces + 1} in the live game.` : 'This will publish as a new Custom Trail.';
  $('modal').classList.add('show');
};
($('gh-publish') as HTMLButtonElement).onclick = async () => {
  const status = $('gh-status');
  const token = ($('gh-token') as HTMLInputElement).value.trim();
  const repo = ($('gh-repo') as HTMLInputElement).value.trim();
  const branch = ($('gh-branch') as HTMLInputElement).value.trim() || 'main';
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
    status.textContent = `✓ Published! “${st.name}” deploys in ~2 min.`;
    toast('🚀 Published — live in ~2 min');
  } catch (e) {
    status.textContent = '✗ ' + (e as Error).message + ' — check the token scope (Contents: read/write).';
  }
};
($('file') as HTMLInputElement).onchange = e => {
  const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
  f.text().then(t => { try { pushUndo(); fromLevelData(JSON.parse(t)); syncInspector(); save(); fitZoom(); toast('Level imported'); } catch { toast('✗ Not a valid level JSON'); } });
};

// ---- zoom / pan ------------------------------------------------------------------
function setZoom(z: number, cx = cv.width / 2, cy = cv.height / 2) {
  const nz = Math.max(0.1, Math.min(3, z));
  camX = camX + cx / zoom - cx / nz;
  camY = camY + cy / zoom - cy / nz;
  zoom = nz; clampCam();
  ($('zlvl') as HTMLButtonElement).textContent = Math.round(zoom * 100) + '%';
  updateInfo();
}
function fitZoom() {
  zoom = Math.max(0.1, Math.min(2, Math.min(cv.width / (st.w * TILE), cv.height / ((H + 3) * TILE))));
  camX = -(cv.width / zoom - st.w * TILE) / 2;
  camY = -(cv.height / zoom - H * TILE) / 2;
  ($('zlvl') as HTMLButtonElement).textContent = Math.round(zoom * 100) + '%';
  updateInfo();
}
function clampCam() {
  const mX = st.w * TILE, mY = H * TILE, slop = 220 / zoom;
  camX = Math.max(-slop, Math.min(mX - cv.width / zoom + slop, camX));
  camY = Math.max(-slop, Math.min(mY - cv.height / zoom + slop, camY));
}

// canvas fills the stage — resize with the window
function resizeCanvas() {
  cv.width = stage.clientWidth; cv.height = stage.clientHeight;
  clampCam();
}
new ResizeObserver(resizeCanvas).observe(stage);
resizeCanvas();

// ---- pointer / keys ----------------------------------------------------------------
function cellAt(e: PointerEvent) {
  const r = cv.getBoundingClientRect();
  const px = (e.clientX - r.left) / zoom + camX;
  const py = (e.clientY - r.top) / zoom + camY;
  return { x: Math.floor(px / TILE), y: Math.floor(py / TILE) };
}
const isBrush = () => tool.length === 1 || tool === 'terrain' || tool === 'pit' || tool === 'island';
const isStamp = (id: string) => STAMPS.some(s => s[0] === id);
const inSel = (p: Obj) => !!sel && p.x >= sel.x0 && p.x <= sel.x1 && p.y >= sel.y0 && p.y <= sel.y1;

cv.addEventListener('contextmenu', e => e.preventDefault());
// trackpad / wheel = PAN (the default navigation); pinch (ctrl+wheel) still zooms
cv.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const r = cv.getBoundingClientRect();
    setZoom(zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06), e.clientX - r.left, e.clientY - r.top);
  } else {
    camX += e.deltaX / zoom; camY += e.deltaY / zoom; clampCam();
  }
}, { passive: false });

cv.addEventListener('pointerdown', e => {
  (document.activeElement as HTMLElement)?.blur?.();   // inspector inputs must not swallow Del/Esc/keys
  const p = cellAt(e);
  if (tool === 'Pan' || spaceHeld || e.button === 1) {
    panning = true; panStart = { x: e.clientX, y: e.clientY, cx: camX, cy: camY };
    cv.classList.add('grabbing'); return;
  }
  if (tool === 'Select') {
    if (sel && inSel(p)) { pushUndo(); movingSel = true; moveFrom = p; moveDelta = { x: 0, y: 0 }; }
    else { selecting = true; selAnchor = p; sel = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; }
    return;
  }
  pushUndo();
  if (e.button === 2) { rightErase = true; painting = true; lastCell = p; setTile(p.x, p.y, '.'); return; }
  painting = true; lastCell = p;
  if (tool === 'island') { islandRow = p.y; setTile(p.x, p.y, 'o'); return; }
  if (tool === 'tower') { stampTower(p); painting = false; normalize(); save(); return; }
  if (isStamp(tool)) { stamp(tool, p); painting = false; normalize(); save(); return; }
  if (tool === 'Move') { dragObj = findObj(p); return; }
  apply(p);
});
// hover tooltips: name whatever is under the cursor
const TILE_NAME: Record<string, string> = { '#': 'Stone', g: 'Grass-top stone', o: 'One-way platform', D: 'Day block (solid in DAY)', N: 'Night block (solid in NIGHT)', '^': 'Crags hazard', F: 'Fire hazard', S: 'Frost hazard' };
function hoverInfo(p: Obj): string | null {
  const near = (o: Obj) => Math.hypot(o.x - p.x, o.y - p.y) < 1.4;
  if (near(st.spawn)) return '▲ Player spawn';
  if (near(st.exit)) return '⛩ Exit shrine';
  const en = st.enemies.find(near);
  if (en) return `👹 ${en.kind}${en.elite ? ' (ELITE mini-boss)' : ''}`;
  const sp = st.spawners.find(near);
  if (sp) return `♻️ Spawner — ${sp.kind}, keeps ${sp.max} alive, every ${sp.every}s`;
  if (st.gems.find(near)) return '💠 Torch-gem (fills the dragon meter)';
  if (st.checkpoints.find(near)) return '🏮 Checkpoint';
  const br = st.bridges.find(b => p.y >= b.y - 1 && p.y <= b.y + 1 && p.x >= b.x && p.x <= b.x + b.w);
  if (br) return `🌉 Bridge — ${br.w} tiles`;
  const t = tileAt(p.x, p.y);
  return TILE_NAME[t] ?? null;
}
cv.addEventListener('pointermove', e => {
  const p = cellAt(e);
  $('coords').textContent = `${p.x}, ${p.y}`;
  // floating hover tip (hidden while actively painting/panning/selecting)
  const tip = $('hovertip');
  if (!painting && !panning && !selecting && !movingSel) {
    const info = hoverInfo(p);
    if (info) {
      tip.textContent = info; tip.style.display = 'block';
      const sr = stage.getBoundingClientRect();
      tip.style.left = Math.min(e.clientX - sr.left + 16, sr.width - 220) + 'px';
      tip.style.top = (e.clientY - sr.top + 18) + 'px';
    } else tip.style.display = 'none';
  } else tip.style.display = 'none';
  if (panning) { camX = panStart.cx - (e.clientX - panStart.x) / zoom; camY = panStart.cy - (e.clientY - panStart.y) / zoom; clampCam(); return; }
  if (selecting) { sel = { x0: Math.min(selAnchor.x, p.x), y0: Math.min(selAnchor.y, p.y), x1: Math.max(selAnchor.x, p.x), y1: Math.max(selAnchor.y, p.y) }; return; }
  if (movingSel) { moveDelta = { x: p.x - moveFrom.x, y: p.y - moveFrom.y }; return; }
  if (!painting) return;
  const prev = lastCell ?? p;
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
  cv.classList.remove('grabbing');
  if (movingSel) { commitSelMove(moveDelta.x, moveDelta.y); movingSel = false; moveDelta = { x: 0, y: 0 }; save(); return; }
  if (selecting) { selecting = false; return; }
  if (painting && !rightErase && tool !== 'island') normalize();
  painting = false; panning = false; rightErase = false; lastCell = null; islandRow = null; dragObj = null; save();
});
window.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (e.key === ' ') { if ((document.activeElement as HTMLElement)?.tagName !== 'INPUT') { spaceHeld = true; e.preventDefault(); } return; }
  if (e.key === 'Escape') { sel = null; return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel && (document.activeElement as HTMLElement)?.tagName !== 'INPUT') { e.preventDefault(); deleteSel(); return; }
  const k = e.key.toLowerCase(); const sp = 30 / zoom;
  if ((document.activeElement as HTMLElement)?.tagName === 'INPUT') return;
  if (k === 'arrowleft' || k === 'a') camX -= sp; if (k === 'arrowright' || k === 'd') camX += sp;
  if (k === 'arrowup' || k === 'w') camY -= sp; if (k === 'arrowdown' || k === 's') camY += sp;
  clampCam();
});
window.addEventListener('keyup', e => { if (e.key === ' ') spaceHeld = false; });

// ---- select area move/delete --------------------------------------------------------
function commitSelMove(dx: number, dy: number) {
  if (!sel || (dx === 0 && dy === 0)) return;
  const buf: string[][] = [];
  for (let y = sel.y0; y <= sel.y1; y++) { const row: string[] = []; for (let x = sel.x0; x <= sel.x1; x++) { row.push(tileAt(x, y)); setTile(x, y, '.'); } buf.push(row); }
  for (let y = 0; y < buf.length; y++) for (let x = 0; x < buf[y].length; x++) {
    if (buf[y][x] !== '.') setTile(sel.x0 + x + dx, sel.y0 + y + dy, buf[y][x]);
  }
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
  normalize(); save(); toast('Selection deleted');
}

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
  else if (tool === 'Spawner') st.spawners.push({ kind: enemyKind, ...p, every: spEvery, max: spMax });
  else if (tool === 'Bridge') {
    if (!bridgeStart) { bridgeStart = { ...p }; updateHint('Now click the bridge END'); }
    else { const x0 = Math.min(bridgeStart.x, p.x), x1 = Math.max(bridgeStart.x, p.x); st.bridges.push({ x: x0, y: bridgeStart.y, w: Math.max(2, x1 - x0) }); bridgeStart = null; updateHint(); }
  } else if (tool === 'Delete') {
    if (sel && inSel(p)) { deleteSel(); return; }            // delete the whole selection
    const near = (o: Obj) => Math.hypot(o.x - p.x, o.y - p.y) < 1.6;
    const n0 = st.checkpoints.length + st.gems.length + st.enemies.length + st.spawners.length + st.bridges.length;
    st.checkpoints = st.checkpoints.filter(o => !near(o));
    st.gems = st.gems.filter(o => !near(o));
    st.enemies = st.enemies.filter(o => !near(o));
    st.spawners = st.spawners.filter(o => !near(o));
    st.bridges = st.bridges.filter(b => !(p.y >= b.y - 1 && p.y <= b.y + 1 && p.x >= b.x - 1 && p.x <= b.x + b.w + 1));
    const n1 = st.checkpoints.length + st.gems.length + st.enemies.length + st.spawners.length + st.bridges.length;
    if (n0 === n1) setTile(p.x, p.y, '.');                   // nothing nearby → erase the tile itself
  }
  save();
}

// ---- to/from LevelData --------------------------------------------------------------
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

// ---- persistence ---------------------------------------------------------------------
function save() { st.h = H; localStorage.setItem(STATE_KEY, JSON.stringify(st)); blinkSaved(); updateInfo(); }
function load() { try { const s = localStorage.getItem(STATE_KEY); if (s) { st = JSON.parse(s); st.spawners = st.spawners || []; H = st.h || st.tiles.length || 17; } } catch { /* fresh */ } }

function updateInfo() {
  $('lvlinfo').textContent = `${st.name} · ${st.w}×${H} tiles · ${Math.round(zoom * 100)}%`;
}
function updateHint(msg?: string) {
  $('toolhint').textContent = msg ?? (toolDef(tool)?.hint ?? STAMPS.find(s => s[0] === tool)?.[2] ?? '');
}

// ---- render ----------------------------------------------------------------------------
const TILE_COL: Record<string, string> = { '#': '#5a4a66', g: '#7ca23f', o: '#8a6b45', D: '#f0b45a', N: '#7fa8d6', '^': '#8a7c7c', F: '#ff7840', S: '#8ed7ff' };
function draw() {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#100c16'; c.fillRect(0, 0, cv.width, cv.height);
  c.setTransform(zoom, 0, 0, zoom, -camX * zoom, -camY * zoom);
  c.fillStyle = '#241a30'; c.fillRect(0, 0, st.w * TILE, H * TILE);
  const vx0 = Math.max(0, Math.floor(camX / TILE)), vx1 = Math.min(st.w - 1, Math.floor((camX + cv.width / zoom) / TILE));
  for (let y = 0; y < H; y++) for (let x = vx0; x <= vx1; x++) {
    const ch = tileAt(x, y); if (ch === '.') continue;
    c.fillStyle = TILE_COL[ch] || '#666';
    c.fillRect(x * TILE, y * TILE, TILE, TILE);
    if (ch === 'g') { c.fillStyle = '#a8d05f'; c.fillRect(x * TILE, y * TILE, TILE, 6); }
    if (ch === 'o') { c.fillStyle = '#5a4630'; c.fillRect(x * TILE, y * TILE + 10, TILE, 6); }
    if (ch === '^' || ch === 'F' || ch === 'S') { c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); for (let i = 0; i < 3; i++) { c.moveTo(x * TILE + i * 11, y * TILE + TILE); c.lineTo(x * TILE + i * 11 + 5, y * TILE + 8); c.lineTo(x * TILE + i * 11 + 10, y * TILE + TILE); } c.fill(); }
  }
  if (zoom > 0.4) {
    c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 1 / zoom; c.beginPath();
    for (let x = vx0; x <= vx1 + 1; x++) { c.moveTo(x * TILE, 0); c.lineTo(x * TILE, H * TILE); }
    for (let y = 0; y <= H; y++) { c.moveTo(vx0 * TILE, y * TILE); c.lineTo((vx1 + 1) * TILE, y * TILE); }
    c.stroke();
  }
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
  if (sel) {
    const rect = (dx: number, dy: number, a: number) => {
      c.save(); c.strokeStyle = `rgba(255,215,119,${a})`; c.lineWidth = 2 / zoom; c.setLineDash([8 / zoom, 6 / zoom]);
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

load(); buildRail(); syncInspector(); updateHint(); fitZoom(); draw();

// dev/test hook: lets automated checks (and the console) drive the editor
(window as any).__forge = {
  get st() { return st; },
  setTool(t: string) { tool = t; buildRail(); syncInspector(); },
  apply, deleteSel, normalize,
  setSel(s: { x0: number; y0: number; x1: number; y1: number } | null) { sel = s; },
};

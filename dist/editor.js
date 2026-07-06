// ⛩ Shrine Forge — the visual level editor. High-level authoring tools (terrain
// brush, island builder, tower/prefab stamps, spawners, move, undo) so levels
// are swept out, not clicked block by block. Playtest via localStorage handoff;
// publish commits straight to the game repo. Self-contained: no Game dependency.
import { TILE } from './types.js';
let H = 17; // level height (17, or 18 for cavern acts) — tracks st.h
const DRAFT_KEY = 'wtdb-draft';
const STATE_KEY = 'wtdb-editor-state';
const cv = document.getElementById('ed');
const c = cv.getContext('2d');
const toolsEl = document.getElementById('tools');
const TILE_TOOLS = [
    ['terrain', '✏️ Terrain', '#7ca23f'], ['pit', '⛏ Pit', '#241a30'],
    ['island', '🏝 Island', '#8a6b45'], ['tower', '🧗 Tower', '#b08a5a'],
    ['#', 'Stone', '#5a4a66'], ['o', 'Plat-tile', '#8a6b45'],
    ['D', 'Day', '#f0b45a'], ['N', 'Night', '#7fa8d6'],
    ['^', 'Crags', '#8a7c7c'], ['F', 'Fire', '#ff7840'], ['S', 'Frost', '#8ed7ff'], ['.', 'Erase', '#241a30'],
];
const OBJ_TOOLS = ['✂ Select', 'Spawn', 'Exit', 'Checkpoint', 'Gem', 'Enemy', 'Spawner', 'Bridge', 'Move', 'Delete', 'Pan'];
const STAMPS = [['pack', '👥 Enemy pack'], ['gemarc', '💎 Gem arc'], ['hazrun', '⚠️ Hazard strip'], ['aerial', '🌉 Aerial run']];
const ENEMY_KINDS = ['moth', 'guardian', 'wisp', 'sentry', 'ghoul', 'skull', 'crawler', 'crow', 'sentinel', 'wraith'];
let st = freshState(120);
let tool = 'terrain';
let enemyKind = 'guardian';
let elite = false;
let camX = 0, camY = 0, zoom = 1;
let painting = false, panning = false, rightErase = false;
let panStart = { x: 0, y: 0, cx: 0, cy: 0 };
let lastCell = null;
let bridgeStart = null;
let islandRow = null;
let dragObj = null;
// ✂ marquee selection: drag a box, then drag INSIDE it to move tiles + objects
let sel = null;
let selecting = false, movingSel = false;
let selAnchor = { x: 0, y: 0 }, moveFrom = { x: 0, y: 0 }, moveDelta = { x: 0, y: 0 };
// ---- undo / redo -------------------------------------------------------------
const undoStack = [];
const redoStack = [];
function pushUndo() { undoStack.push(JSON.stringify(st)); if (undoStack.length > 60)
    undoStack.shift(); redoStack.length = 0; }
function undo() { const s = undoStack.pop(); if (!s)
    return; redoStack.push(JSON.stringify(st)); st = JSON.parse(s); H = st.h || 17; syncBar(); save(false); }
function redo() { const s = redoStack.pop(); if (!s)
    return; undoStack.push(JSON.stringify(st)); st = JSON.parse(s); H = st.h || 17; syncBar(); save(false); }
function freshState(w) {
    const rows = [];
    for (let y = 0; y < H; y++) {
        if (y < H - 3)
            rows.push('.'.repeat(w));
        else if (y === H - 3)
            rows.push('g'.repeat(w));
        else
            rows.push('#'.repeat(w));
    }
    return { name: 'My Shrine Path', theme: 'mountain', w, h: H, tiles: rows, spawn: { x: 3, y: H - 5 }, exit: { x: w - 4, y: H - 6 }, checkpoints: [], gems: [], enemies: [], spawners: [], bridges: [] };
}
function setTile(x, y, ch) {
    if (x < 0 || x >= st.w || y < 0 || y >= H)
        return;
    const row = st.tiles[y];
    st.tiles[y] = row.slice(0, x) + ch + row.slice(x + 1);
}
function tileAt(x, y) { return (x < 0 || x >= st.w || y < 0 || y >= H) ? '.' : st.tiles[y][x]; }
const isTerrainCh = (ch) => ch === '#' || ch === 'g';
/** Terrain brush: drag a heightline; each column fills itself (grass over stone). */
function setSurface(x, y) {
    if (x < 0 || x >= st.w)
        return;
    const sy = Math.max(1, Math.min(H - 2, y));
    for (let cy = 0; cy < H; cy++) {
        const cur = tileAt(x, cy);
        if (cy < sy) {
            if (isTerrainCh(cur))
                setTile(x, cy, '.');
        }
        else
            setTile(x, cy, cy === sy ? 'g' : '#');
    }
}
function clearColumn(x) { for (let cy = 0; cy < H; cy++)
    if (isTerrainCh(tileAt(x, cy)))
        setTile(x, cy, '.'); }
/** Auto-join: terrain with air above → grass cap; the rest stone. */
function normalize() {
    for (let x = 0; x < st.w; x++)
        for (let y = 0; y < H; y++) {
            if (!isTerrainCh(tileAt(x, y)))
                continue;
            setTile(x, y, isTerrainCh(tileAt(x, y - 1)) ? '#' : 'g');
        }
}
/** Ground surface row at column x (for stamps that sit on the ground). */
function surfaceAt(x) {
    for (let y = 0; y < H; y++)
        if (isTerrainCh(tileAt(x, y)) || tileAt(x, y) === 'o')
            return y;
    return H - 3;
}
// ---- stamps: whole structures in one click -----------------------------------
function stamp(name, p) {
    if (name === 'pack') { // 3-4 enemies clustered on the ground
        const n = 3 + (Math.random() < 0.4 ? 1 : 0);
        for (let i = 0; i < n; i++) {
            const ex = p.x + i * 3;
            st.enemies.push({ kind: enemyKind, x: ex, y: surfaceAt(ex) - 2 });
        }
    }
    else if (name === 'gemarc') { // an arc of 3 gems over the click point
        st.gems.push({ x: p.x, y: p.y }, { x: p.x + 2, y: p.y - 1 }, { x: p.x + 4, y: p.y });
    }
    else if (name === 'hazrun') { // 4-wide crag strip on the surface
        for (let i = 0; i < 4; i++) {
            const hx = p.x + i;
            setTile(hx, surfaceAt(hx) - 1, '^');
        }
    }
    else if (name === 'aerial') { // islands + bridges + gems, one click
        let px = p.x;
        for (let seg = 0; seg < 3; seg++) {
            for (let i = 0; i < 6; i++)
                setTile(px + i, p.y, 'o');
            st.gems.push({ x: px + 3, y: p.y - 2 });
            if (seg < 2) {
                st.bridges.push({ x: px + 6, y: p.y, w: 4 });
                px += 10;
            }
        }
    }
}
/** 🧗 Tower: one click plants a zig-zag climb from the ground up to the click. */
function stampTower(p) {
    const base = surfaceAt(p.x);
    let k = 0;
    for (let py = base - 3; py > Math.max(2, p.y); py -= 2, k++) {
        const px = p.x + (k % 2 === 0 ? 0 : 4);
        const ch = k % 3 === 2 ? (Math.random() < 0.5 ? 'D' : 'N') : 'o';
        for (let i = 0; i < 3; i++)
            setTile(px + i, py, ch);
    }
    st.gems.push({ x: p.x + 1, y: Math.max(2, p.y) - 1 });
}
// ---- UI ----------------------------------------------------------------------
function buildTools() {
    toolsEl.innerHTML = '';
    const mk = (id, label, col, group) => {
        const b = document.createElement('button');
        b.textContent = label;
        if (col)
            b.style.borderLeft = `10px solid ${col}`;
        if (group)
            b.title = group;
        b.className = tool === id ? 'on' : '';
        b.onclick = () => { tool = id; bridgeStart = null; buildTools(); };
        toolsEl.appendChild(b);
    };
    const ub = document.createElement('button');
    ub.textContent = '↩︎';
    ub.title = 'Undo (Ctrl+Z)';
    ub.onclick = undo;
    toolsEl.appendChild(ub);
    const rb = document.createElement('button');
    rb.textContent = '↪︎';
    rb.title = 'Redo (Ctrl+Y)';
    rb.onclick = redo;
    toolsEl.appendChild(rb);
    for (const [ch, label, col] of TILE_TOOLS)
        mk(ch, label, col);
    for (const t of OBJ_TOOLS)
        mk(t, t);
    for (const [id, label] of STAMPS)
        mk(id, label);
    const sel = document.createElement('select');
    for (const k of ENEMY_KINDS) {
        const o = document.createElement('option');
        o.value = k;
        o.textContent = k;
        if (k === enemyKind)
            o.selected = true;
        sel.appendChild(o);
    }
    sel.onchange = () => { enemyKind = sel.value; if (tool !== 'Spawner' && tool !== 'pack')
        tool = 'Enemy'; buildTools(); };
    toolsEl.appendChild(sel);
    const el = document.createElement('button');
    el.textContent = elite ? '★ elite' : '☆ elite';
    el.className = elite ? 'on' : '';
    el.onclick = () => { elite = !elite; buildTools(); };
    toolsEl.appendChild(el);
    const zb = document.createElement('button');
    zb.textContent = zoom === 1 ? '🔍 50%' : '🔍 100%';
    zb.onclick = () => { zoom = zoom === 1 ? 0.5 : 1; buildTools(); };
    toolsEl.appendChild(zb);
}
document.getElementById('new').onclick = () => {
    if (!confirm('Start a new level? (current draft is kept in autosave until you paint)'))
        return;
    pushUndo();
    H = 17;
    st = freshState(parseInt(document.getElementById('wtiles').value) || 120);
    syncBar();
    save();
};
// Load any campaign level straight from the game's generator — edit + Publish REPLACES it.
const campSel = document.getElementById('campaign');
import('./content.js').then((m) => {
    m.levels.slice(0, 24).forEach((lv, i) => {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = lv.title;
        campSel.appendChild(o);
    });
}).catch(() => { campSel.disabled = true; });
campSel.onchange = async () => {
    const i = parseInt(campSel.value);
    campSel.selectedIndex = 0;
    if (isNaN(i))
        return;
    if (!confirm(`Load "L${i + 1}" for editing? Publishing will REPLACE it in the game.`))
        return;
    const m = await import('./content.js');
    pushUndo();
    fromLevelData(JSON.parse(JSON.stringify(m.levels[i])), i);
    syncBar();
    save();
};
document.getElementById('export').onclick = () => {
    const blob = new Blob([JSON.stringify(toLevelData(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = st.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
    a.click();
};
document.getElementById('playtest').onclick = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(toLevelData()));
    window.open('play.html?playtest=1', 'wtdb-playtest');
};
document.getElementById('publish').onclick = () => {
    const t = document.getElementById('gh-token');
    t.value = localStorage.getItem('wtdb-gh-token') || '';
    document.getElementById('gh-status').textContent =
        st.replaces !== undefined ? `⚠ This will REPLACE campaign level L${st.replaces + 1} in the live game.` : 'This will publish as a new Custom Trail.';
    document.getElementById('modal').style.display = 'grid';
};
// One-click publish via the GitHub contents API — Render redeploys, level goes live.
document.getElementById('gh-publish').onclick = async () => {
    const status = document.getElementById('gh-status');
    const token = document.getElementById('gh-token').value.trim();
    const repo = document.getElementById('gh-repo').value.trim();
    const branch = document.getElementById('gh-branch').value.trim() || 'main';
    if (!token) {
        status.textContent = 'Paste a GitHub token first.';
        return;
    }
    localStorage.setItem('wtdb-gh-token', token);
    const hdr = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
    const api = (p) => `https://api.github.com/repos/${repo}/contents/${p}`;
    const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
    const fname = st.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
    const put = (path, content, sha) => fetch(api(path), { method: 'PUT', headers: hdr, body: JSON.stringify({ message: '⛩ Publish level: ' + st.name, content: b64(content), branch, ...(sha ? { sha } : {}) }) });
    try {
        status.textContent = 'Publishing…';
        const ex = await fetch(api('assets/levels/' + fname) + '?ref=' + branch, { headers: hdr });
        const sha1 = ex.ok ? (await ex.json()).sha : undefined;
        const r1 = await put('assets/levels/' + fname, JSON.stringify(toLevelData(), null, 1), sha1);
        if (!r1.ok)
            throw new Error('level upload: ' + r1.status);
        const ir = await fetch(api('assets/levels/index.json') + '?ref=' + branch, { headers: hdr });
        if (!ir.ok)
            throw new Error('manifest read: ' + ir.status);
        const ij = await ir.json();
        const manifest = JSON.parse(decodeURIComponent(escape(atob(ij.content.replace(/\n/g, '')))));
        if (!manifest.files.includes(fname)) {
            manifest.files.push(fname);
            const r2 = await put('assets/levels/index.json', JSON.stringify(manifest, null, 1), ij.sha);
            if (!r2.ok)
                throw new Error('manifest update: ' + r2.status);
        }
        status.textContent = `✓ Published! “${st.name}” deploys in ~2 min → Level Select.`;
    }
    catch (e) {
        status.textContent = '✗ ' + e.message + ' — check the token scope (Contents: read/write).';
    }
};
document.getElementById('import').onclick = () => document.getElementById('file').click();
document.getElementById('file').onchange = e => {
    const f = e.target.files?.[0];
    if (!f)
        return;
    f.text().then(t => { try {
        pushUndo();
        fromLevelData(JSON.parse(t));
        syncBar();
        save();
    }
    catch {
        alert('Not a valid level JSON');
    } });
};
document.getElementById('name').oninput = e => { st.name = e.target.value; save(false); };
document.getElementById('theme').onchange = e => { st.theme = e.target.value; save(false); };
document.getElementById('wtiles').onchange = e => {
    const w = Math.max(40, Math.min(300, parseInt(e.target.value) || 120));
    pushUndo();
    st.tiles = st.tiles.map(r => (r + '.'.repeat(Math.max(0, w - r.length))).slice(0, w));
    st.w = w;
    save();
};
function syncBar() {
    document.getElementById('name').value = st.name;
    document.getElementById('theme').value = st.theme;
    document.getElementById('wtiles').value = String(st.w);
}
// ---- pointer / keys -----------------------------------------------------------
function cellAt(e) {
    const r = cv.getBoundingClientRect();
    const px = (e.clientX - r.left) * (cv.width / r.width) / zoom + camX;
    const py = (e.clientY - r.top) * (cv.height / r.height) / zoom + camY;
    return { x: Math.floor(px / TILE), y: Math.floor(py / TILE) };
}
const isBrush = () => tool.length === 1 || tool === 'terrain' || tool === 'pit' || tool === 'island';
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
    const p = cellAt(e);
    if (tool === 'Pan' || e.button === 1) {
        panning = true;
        panStart = { x: e.clientX, y: e.clientY, cx: camX, cy: camY };
        return;
    }
    if (tool === '✂ Select') {
        if (sel && inSel(p)) {
            pushUndo();
            movingSel = true;
            moveFrom = p;
            moveDelta = { x: 0, y: 0 };
        } // drag inside → move it
        else {
            selecting = true;
            selAnchor = p;
            sel = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        } // drag outside → new marquee
        return;
    }
    pushUndo();
    if (e.button === 2) {
        rightErase = true;
        painting = true;
        lastCell = p;
        setTile(p.x, p.y, '.');
        return;
    } // right-click always erases tiles
    painting = true;
    lastCell = p;
    if (tool === 'island') {
        islandRow = p.y;
        setTile(p.x, p.y, 'o');
        return;
    }
    if (tool === 'tower') {
        stampTower(p);
        painting = false;
        return;
    }
    if (STAMPS.some(s => s[0] === tool)) {
        stamp(tool, p);
        painting = false;
        return;
    }
    if (tool === 'Move') {
        dragObj = findObj(p);
        return;
    }
    apply(p);
});
cv.addEventListener('pointermove', e => {
    if (panning) {
        camX = panStart.cx - (e.clientX - panStart.x) / zoom;
        camY = panStart.cy - (e.clientY - panStart.y) / zoom;
        clampCam();
        return;
    }
    if (selecting) {
        const p = cellAt(e);
        sel = { x0: Math.min(selAnchor.x, p.x), y0: Math.min(selAnchor.y, p.y), x1: Math.max(selAnchor.x, p.x), y1: Math.max(selAnchor.y, p.y) };
        return;
    }
    if (movingSel) {
        const p = cellAt(e);
        moveDelta = { x: p.x - moveFrom.x, y: p.y - moveFrom.y };
        return;
    }
    if (!painting)
        return;
    const p = cellAt(e), prev = lastCell ?? p;
    if (tool === 'Move' && dragObj) {
        moveObj(dragObj, p);
        lastCell = p;
        return;
    }
    if (rightErase || isBrush()) {
        const steps = Math.max(1, Math.abs(p.x - prev.x));
        for (let i = 1; i <= steps; i++) {
            const q = { x: Math.round(prev.x + (p.x - prev.x) * i / steps), y: Math.round(prev.y + (p.y - prev.y) * i / steps) };
            if (rightErase)
                setTile(q.x, q.y, '.');
            else if (tool === 'island')
                setTile(q.x, islandRow ?? q.y, 'o');
            else
                apply(q);
        }
        lastCell = p;
    }
});
window.addEventListener('pointerup', () => {
    if (movingSel) {
        commitSelMove(moveDelta.x, moveDelta.y);
        movingSel = false;
        moveDelta = { x: 0, y: 0 };
        save(false);
        return;
    }
    if (selecting) {
        selecting = false;
        return;
    }
    if (painting && !rightErase && tool !== 'island')
        normalize();
    painting = false;
    panning = false;
    rightErase = false;
    lastCell = null;
    islandRow = null;
    dragObj = null;
    save(false);
});
window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
    }
    if (e.key === 'Escape') {
        sel = null;
        return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        deleteSel();
        return;
    }
    const k = e.key.toLowerCase();
    const sp = 26;
    if (k === 'arrowleft' || k === 'a')
        camX -= sp;
    if (k === 'arrowright' || k === 'd')
        camX += sp;
    if (k === 'arrowup' || k === 'w')
        camY -= sp;
    if (k === 'arrowdown' || k === 's')
        camY += sp;
    clampCam();
});
function clampCam() {
    camX = Math.max(0, Math.min(st.w * TILE - cv.width / zoom, camX));
    camY = Math.max(-40, Math.min(H * TILE - cv.height / zoom + 60, camY));
}
// ---- ✂ Select: area move/delete ---------------------------------------------
const inSel = (p) => !!sel && p.x >= sel.x0 && p.x <= sel.x1 && p.y >= sel.y0 && p.y <= sel.y1;
function commitSelMove(dx, dy) {
    if (!sel || (dx === 0 && dy === 0))
        return;
    // lift the tile region, clear it, stamp at the offset (clipped to bounds)
    const buf = [];
    for (let y = sel.y0; y <= sel.y1; y++) {
        const row = [];
        for (let x = sel.x0; x <= sel.x1; x++) {
            row.push(tileAt(x, y));
            setTile(x, y, '.');
        }
        buf.push(row);
    }
    for (let y = 0; y < buf.length; y++)
        for (let x = 0; x < buf[y].length; x++) {
            if (buf[y][x] !== '.')
                setTile(sel.x0 + x + dx, sel.y0 + y + dy, buf[y][x]);
        }
    // objects inside ride along
    const shift = (o) => { if (inSel(o)) {
        o.x += dx;
        o.y += dy;
    } };
    st.enemies.forEach(shift);
    st.gems.forEach(shift);
    st.checkpoints.forEach(shift);
    st.spawners.forEach(shift);
    shift(st.spawn);
    shift(st.exit);
    for (const b of st.bridges)
        if (inSel({ x: b.x, y: b.y })) {
            b.x += dx;
            b.y += dy;
        }
    sel = { x0: sel.x0 + dx, y0: sel.y0 + dy, x1: sel.x1 + dx, y1: sel.y1 + dy };
    normalize();
}
function deleteSel() {
    if (!sel)
        return;
    pushUndo();
    for (let y = sel.y0; y <= sel.y1; y++)
        for (let x = sel.x0; x <= sel.x1; x++)
            setTile(x, y, '.');
    st.enemies = st.enemies.filter(o => !inSel(o));
    st.gems = st.gems.filter(o => !inSel(o));
    st.checkpoints = st.checkpoints.filter(o => !inSel(o));
    st.spawners = st.spawners.filter(o => !inSel(o));
    st.bridges = st.bridges.filter(b => !inSel({ x: b.x, y: b.y }));
    normalize();
    save(false);
}
// ---- Move tool ------------------------------------------------------------------
function findObj(p) {
    const near = (o) => Math.hypot(o.x - p.x, o.y - p.y) < 1.8;
    if (near(st.spawn))
        return { list: 'spawn', i: 0 };
    if (near(st.exit))
        return { list: 'exit', i: 0 };
    for (const [list, arr] of [['enemies', st.enemies], ['spawners', st.spawners], ['gems', st.gems], ['checkpoints', st.checkpoints]]) {
        const i = arr.findIndex(near);
        if (i >= 0)
            return { list: list, i };
    }
    return null;
}
function moveObj(d, p) {
    const t = d.list === 'spawn' ? st.spawn : d.list === 'exit' ? st.exit : st[d.list][d.i];
    if (t) {
        t.x = p.x;
        t.y = p.y;
    }
}
function apply(p) {
    if (p.x < 0 || p.x >= st.w || p.y < 0 || p.y >= H)
        return;
    if (tool === 'terrain') {
        setSurface(p.x, p.y);
        return;
    }
    if (tool === 'pit') {
        clearColumn(p.x);
        return;
    }
    if (tool.length === 1) {
        setTile(p.x, p.y, tool);
        return;
    }
    if (tool === 'Spawn')
        st.spawn = { ...p };
    else if (tool === 'Exit')
        st.exit = { ...p };
    else if (tool === 'Checkpoint')
        st.checkpoints.push({ ...p });
    else if (tool === 'Gem')
        st.gems.push({ ...p });
    else if (tool === 'Enemy')
        st.enemies.push({ kind: enemyKind, ...p, elite: elite || undefined });
    else if (tool === 'Spawner')
        st.spawners.push({ kind: enemyKind, ...p, every: 4, max: 3 });
    else if (tool === 'Bridge') {
        if (!bridgeStart)
            bridgeStart = { ...p };
        else {
            const x0 = Math.min(bridgeStart.x, p.x), x1 = Math.max(bridgeStart.x, p.x);
            st.bridges.push({ x: x0, y: bridgeStart.y, w: Math.max(2, x1 - x0) });
            bridgeStart = null;
        }
    }
    else if (tool === 'Delete') {
        const near = (o) => Math.hypot(o.x - p.x, o.y - p.y) < 1.6;
        st.checkpoints = st.checkpoints.filter(o => !near(o));
        st.gems = st.gems.filter(o => !near(o));
        st.enemies = st.enemies.filter(o => !near(o));
        st.spawners = st.spawners.filter(o => !near(o));
        st.bridges = st.bridges.filter(b => !(p.y >= b.y - 1 && p.y <= b.y + 1 && p.x >= b.x - 1 && p.x <= b.x + b.w + 1));
    }
    save(false);
}
// ---- convert to/from LevelData ----------------------------------------------------
function toLevelData() {
    const acts = { mountain: 1, bridge: 2, cavern: 3, sunless: 4 };
    return {
        relics: [], shrines: [], platforms: [], introLore: '', outroLore: '', unlockCodexOnComplete: [],
        act: acts[st.theme] || 1, difficulty: 1,
        ...(st.carry || {}),
        id: st.carry?.id ?? ('custom-' + st.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
        title: st.name, subtitle: st.carry?.subtitle ?? 'A custom shrine path',
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
function fromLevelData(d, replaces) {
    const h = Math.max(12, Math.min(24, d.height || d.tiles.length || 17));
    const carry = {};
    for (const k of ['id', 'subtitle', 'platforms', 'windZones', 'relics', 'shrines', 'secretExit', 'secretExitTo', 'introLore', 'outroLore', 'unlockCodexOnComplete', 'act', 'difficulty', 'isBoss', 'hidden']) {
        if (d[k] !== undefined)
            carry[k] = d[k];
    }
    st = {
        name: d.title || 'Imported', theme: d.theme || 'mountain', w: d.width || (d.tiles?.[0]?.length ?? 120),
        h, replaces: replaces ?? d.replaces, carry,
        tiles: d.tiles.slice(0, h),
        spawn: { x: Math.round((d.spawn?.x ?? 96) / TILE), y: Math.round((d.spawn?.y ?? 300) / TILE) },
        exit: { x: Math.round((d.exit?.x ?? 300) / TILE), y: Math.round(((d.exit?.y ?? 300) + 40) / TILE) },
        checkpoints: (d.checkpoints || []).map((o) => ({ x: Math.round(o.x / TILE), y: Math.round((o.y + 24) / TILE) })),
        gems: (d.gems || []).map((o) => ({ x: Math.round(o.x / TILE), y: Math.round(o.y / TILE) })),
        enemies: (d.entities || []).map((o) => ({ kind: o.kind, x: Math.round(o.x / TILE), y: Math.round(o.y / TILE), elite: o.elite })),
        spawners: (d.spawners || []).map((s) => ({ kind: s.kind, x: Math.round(s.x / TILE), y: Math.round(s.y / TILE), every: s.every || 4, max: s.max || 3 })),
        bridges: (d.bridges || []).map((b) => ({ x: Math.round((b.x + 12) / TILE), y: Math.round(b.y / TILE), w: Math.round((b.w - 24) / TILE) })),
    };
    H = h;
    while (st.tiles.length < H)
        st.tiles.push('.'.repeat(st.w));
}
// ---- persistence ------------------------------------------------------------------
function save(_snapshot = true) { st.h = H; localStorage.setItem(STATE_KEY, JSON.stringify(st)); }
function load() { try {
    const s = localStorage.getItem(STATE_KEY);
    if (s) {
        st = JSON.parse(s);
        st.spawners = st.spawners || [];
        H = st.h || st.tiles.length || 17;
    }
}
catch { /* fresh */ } }
// ---- render -------------------------------------------------------------------------
const TILE_COL = { '#': '#5a4a66', g: '#7ca23f', o: '#8a6b45', D: '#f0b45a', N: '#7fa8d6', '^': '#8a7c7c', F: '#ff7840', S: '#8ed7ff' };
function draw() {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#160f1e';
    c.fillRect(0, 0, cv.width, cv.height);
    c.setTransform(zoom, 0, 0, zoom, -camX * zoom, -camY * zoom);
    c.fillStyle = '#241a30';
    c.fillRect(0, 0, st.w * TILE, H * TILE);
    for (let y = 0; y < H; y++)
        for (let x = Math.floor(camX / TILE); x <= Math.floor((camX + cv.width / zoom) / TILE) && x < st.w; x++) {
            const ch = tileAt(x, y);
            if (ch === '.')
                continue;
            c.fillStyle = TILE_COL[ch] || '#666';
            c.fillRect(x * TILE, y * TILE, TILE, TILE);
            if (ch === 'g') {
                c.fillStyle = '#a8d05f';
                c.fillRect(x * TILE, y * TILE, TILE, 6);
            }
            if (ch === 'o') {
                c.fillStyle = '#5a4630';
                c.fillRect(x * TILE, y * TILE + 10, TILE, 6);
            }
            if (ch === '^' || ch === 'F' || ch === 'S') {
                c.fillStyle = 'rgba(0,0,0,.4)';
                c.beginPath();
                for (let i = 0; i < 3; i++) {
                    c.moveTo(x * TILE + i * 11, y * TILE + TILE);
                    c.lineTo(x * TILE + i * 11 + 5, y * TILE + 8);
                    c.lineTo(x * TILE + i * 11 + 10, y * TILE + TILE);
                }
                c.fill();
            }
        }
    c.strokeStyle = 'rgba(255,255,255,.05)';
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 0; x <= st.w; x++) {
        c.moveTo(x * TILE, 0);
        c.lineTo(x * TILE, H * TILE);
    }
    for (let y = 0; y <= H; y++) {
        c.moveTo(0, y * TILE);
        c.lineTo(st.w * TILE, y * TILE);
    }
    c.stroke();
    for (const b of st.bridges) {
        c.fillStyle = '#8a6b45';
        c.fillRect(b.x * TILE, b.y * TILE, b.w * TILE, 8);
        c.fillStyle = '#5a3c22';
        c.fillRect(b.x * TILE - 3, b.y * TILE - 10, 5, 18);
        c.fillRect((b.x + b.w) * TILE - 2, b.y * TILE - 10, 5, 18);
    }
    if (bridgeStart) {
        c.fillStyle = '#ffd777';
        c.fillRect(bridgeStart.x * TILE, bridgeStart.y * TILE, TILE, 8);
    }
    const glyph = (x, y, txt, col) => {
        c.fillStyle = col;
        c.font = 'bold 20px Georgia';
        c.textAlign = 'center';
        c.fillText(txt, x * TILE + TILE / 2, y * TILE + TILE * 0.78);
    };
    for (const o of st.gems)
        glyph(o.x, o.y, '◆', '#ffcf6a');
    for (const o of st.checkpoints)
        glyph(o.x, o.y, '🏮', '#ffb24a');
    for (const o of st.enemies) {
        glyph(o.x, o.y, o.elite ? '👹' : '●', '#ff5c49');
        c.font = '9px Georgia';
        c.fillStyle = '#ffb0a0';
        c.fillText(o.kind, o.x * TILE + TILE / 2, o.y * TILE + TILE + 10);
    }
    for (const s of st.spawners) {
        glyph(s.x, s.y, '⟳', '#c2a6ff');
        c.font = '9px Georgia';
        c.fillStyle = '#d0baff';
        c.fillText(`${s.kind} ×${s.max}/${s.every}s`, s.x * TILE + TILE / 2, s.y * TILE + TILE + 10);
    }
    glyph(st.spawn.x, st.spawn.y, '▲', '#8fd9a8');
    glyph(st.exit.x, st.exit.y, '⛩', '#ffd777');
    // marquee selection (and its ghost while dragging to a new spot)
    if (sel) {
        const rect = (dx, dy, a) => {
            c.save();
            c.strokeStyle = `rgba(255,215,119,${a})`;
            c.lineWidth = 2;
            c.setLineDash([8, 6]);
            c.strokeRect((sel.x0 + dx) * TILE, (sel.y0 + dy) * TILE, (sel.x1 - sel.x0 + 1) * TILE, (sel.y1 - sel.y0 + 1) * TILE);
            c.fillStyle = `rgba(255,215,119,${a * 0.12})`;
            c.fillRect((sel.x0 + dx) * TILE, (sel.y0 + dy) * TILE, (sel.x1 - sel.x0 + 1) * TILE, (sel.y1 - sel.y0 + 1) * TILE);
            c.restore();
        };
        rect(0, 0, movingSel ? 0.35 : 0.9);
        if (movingSel && (moveDelta.x || moveDelta.y))
            rect(moveDelta.x, moveDelta.y, 0.9);
    }
    requestAnimationFrame(draw);
}
load();
syncBar();
buildTools();
clampCam();
draw();
//# sourceMappingURL=editor.js.map
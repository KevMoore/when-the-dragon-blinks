// Environment rendering: a layered, theme-aware sky (atmospheric haze, sun /
// blood-moon, a coiling Zhulong silhouette), parallax pagodas / torii / pines /
// lantern strings / drifting fog, tiles, wind, and an additive lighting pass.
import { clamp, mixHex } from './math.js';
import { LOGICAL_W, LOGICAL_H, TILE } from './types.js';
const THEMES = {
    mountain: { day: ['#ffbf7a', '#e07048', '#7a2b47', '#1a0a17'], night: ['#0b234f', '#152048', '#171233', '#08050d'], haze: '#e08a5a', hazeNight: '#33477a', ridge: '#5a2740', ridgeNight: '#141b3a', accent: '#ff5c38' },
    bridge: { day: ['#ffc38f', '#e8785f', '#7a2f52', '#180a17'], night: ['#0b2c48', '#123a4c', '#181c3e', '#08060f'], haze: '#e89a72', hazeNight: '#2f5266', ridge: '#5e2a49', ridgeNight: '#132638', accent: '#ff7a52' },
    cavern: { day: ['#8a4a30', '#5a2a24', '#2f171b', '#0d0608'], night: ['#0c1c38', '#121e34', '#141122', '#070509'], haze: '#7a4436', hazeNight: '#243444', ridge: '#3a2020', ridgeNight: '#101826', accent: '#ff8b44' },
    arena: { day: ['#8a2420', '#54141c', '#2c0a12', '#0d0407'], night: ['#150720', '#1e0b26', '#16091a', '#070409'], haze: '#7a2e2c', hazeNight: '#3e1c34', ridge: '#3a1220', ridgeNight: '#1a0c1f', accent: '#ff3b2a' },
};
function theme(game) { return THEMES[game.level.theme] || THEMES.mountain; }
export function drawSky(game, c) {
    const th = theme(game), day = game.dayAmount;
    c.fillStyle = '#08060d';
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    const grad = (stops) => {
        const g = c.createLinearGradient(0, 0, 0, LOGICAL_H);
        g.addColorStop(0, stops[0]);
        g.addColorStop(0.38, stops[1]);
        g.addColorStop(0.68, stops[2]);
        g.addColorStop(1, stops[3]);
        return g;
    };
    c.globalAlpha = day;
    c.fillStyle = grad(th.day);
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    c.globalAlpha = 1 - day;
    c.fillStyle = grad(th.night);
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    c.globalAlpha = 1;
    // celestial body: golden sun (day) crossfading to a blood-moon (night)
    const cx = 772 - game.camera.x * 0.04, cy = 96;
    // atmospheric bloom
    c.save();
    c.globalCompositeOperation = 'lighter';
    const bloom = c.createRadialGradient(cx, cy, 0, cx, cy, 260);
    bloom.addColorStop(0, `rgba(255,190,120,${0.22 * day + 0.05})`);
    bloom.addColorStop(0.5, `rgba(255,90,60,${0.10 * (1 - day)})`);
    bloom.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = bloom;
    c.beginPath();
    c.arc(cx, cy, 260, 0, Math.PI * 2);
    c.fill();
    c.restore();
    // sun
    c.globalAlpha = day;
    c.fillStyle = '#ffd583';
    c.shadowColor = '#ffbe57';
    c.shadowBlur = 46;
    c.beginPath();
    c.arc(cx, cy, 46, 0, Math.PI * 2);
    c.fill();
    // blood-moon
    c.globalAlpha = 1 - day;
    c.shadowColor = '#c53a2a';
    c.shadowBlur = 44;
    const moon = c.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, 40);
    moon.addColorStop(0, '#ffd9b0');
    moon.addColorStop(0.6, '#e0653f');
    moon.addColorStop(1, '#7a2320');
    c.fillStyle = moon;
    c.beginPath();
    c.arc(cx, cy, 40, 0, Math.PI * 2);
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(90,25,20,.5)';
    c.beginPath();
    c.arc(cx - 12, cy - 6, 6, 0, Math.PI * 2);
    c.arc(cx + 10, cy + 10, 4, 0, Math.PI * 2);
    c.arc(cx + 4, cy - 14, 3, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
    c.shadowBlur = 0;
    drawCoilingDragon(game, c, day);
    drawDragonEye(game, c, day);
    drawGodRays(game, c, day, cx, cy);
}
// A colossal Zhulong coiling through the high clouds — subtle, slow parallax.
function drawCoilingDragon(game, c, day) {
    const t = game.time * 0.06;
    const ox = 470 - game.camera.x * 0.05;
    const col = mixHex('#7fb0ff', '#ff6a48', day);
    c.save();
    c.globalAlpha = 0.16 + 0.06 * Math.sin(game.time * 0.4);
    c.strokeStyle = col;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    // body: a tapering sinuous ribbon
    for (let seg = 0; seg < 3; seg++) {
        c.beginPath();
        c.lineWidth = 26 - seg * 8;
        for (let i = 0; i <= 40; i++) {
            const p = i / 40;
            const x = ox + p * 620;
            const y = 120 + Math.sin(p * 7 + t + seg * 0.3) * 46 - p * 20;
            i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        c.stroke();
    }
    // head glow
    c.globalAlpha = 0.22;
    c.fillStyle = col;
    c.shadowColor = col;
    c.shadowBlur = 24;
    const hx = ox + 620, hy = 120 + Math.sin(7 + t) * 46 - 20;
    c.beginPath();
    c.ellipse(hx, hy, 22, 13, 0.2, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.globalAlpha = 1;
    c.shadowBlur = 0;
}
function drawGodRays(game, c, day, cx, cy) {
    if (day < 0.15)
        return;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = day * 0.12;
    c.fillStyle = '#ffd9a0';
    for (let i = 0; i < 6; i++) {
        const a = -1.2 + i * 0.32 + Math.sin(game.time * 0.2 + i) * 0.04;
        c.save();
        c.translate(cx, cy);
        c.rotate(a);
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(700, -26);
        c.lineTo(700, 26);
        c.closePath();
        c.fill();
        c.restore();
    }
    c.restore();
    c.globalAlpha = 1;
}
export function drawDragonEye(game, c, day) {
    c.save();
    const x = 240 - game.camera.x * 0.03, y = 92;
    const openness = clamp(day * game.eyeBlink, 0, 1);
    // outer socket haze
    c.globalAlpha = 0.5;
    c.fillStyle = 'rgba(255,120,80,.05)';
    c.beginPath();
    c.ellipse(x, y, 190, 66, 0, 0, Math.PI * 2);
    c.fill();
    // lid outline
    c.globalAlpha = 0.75;
    c.lineWidth = 5;
    c.strokeStyle = day > 0.5 ? 'rgba(255,210,120,.7)' : 'rgba(141,202,255,.4)';
    c.beginPath();
    c.ellipse(x, y, 146, 46 * (0.16 + openness * 0.84), 0, 0, Math.PI * 2);
    c.stroke();
    if (openness > 0.05) {
        c.globalAlpha = openness;
        c.shadowColor = '#ff4a28';
        c.shadowBlur = 46;
        c.fillStyle = '#1a0509';
        c.beginPath();
        c.ellipse(x, y, 40, 42 * openness, 0, 0, Math.PI * 2);
        c.fill();
        const iris = c.createRadialGradient(x, y, 2, x, y, 40);
        iris.addColorStop(0, '#ffd08a');
        iris.addColorStop(0.4, '#f0452c');
        iris.addColorStop(1, '#8a1810');
        c.fillStyle = iris;
        c.beginPath();
        c.ellipse(x, y, 16, 42 * openness, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#fff0d0';
        c.beginPath();
        c.arc(x - 6, y - 10 * openness, 4, 0, Math.PI * 2);
        c.fill();
    }
    c.restore();
    c.globalAlpha = 1;
    c.shadowBlur = 0;
}
// haze-tinted layered ridges + pagodas + torii + lantern strings + pines + fog.
export function drawParallax(game, c) {
    const th = theme(game), day = game.dayAmount;
    const haze = mixHex(th.hazeNight, th.haze, day);
    const ridge = mixHex(th.ridgeNight, th.ridge, day);
    // far ridges, fading toward the haze colour with distance
    for (let layer = 0; layer < 4; layer++) {
        const par = [0.06, 0.13, 0.22, 0.34][layer];
        const baseY = [318, 356, 398, 452][layer];
        const depth = 1 - layer / 4;
        c.fillStyle = mixHex(ridge, haze, depth * 0.7);
        c.globalAlpha = 0.72 + layer * 0.07;
        c.beginPath();
        c.moveTo(0, LOGICAL_H);
        for (let x = -140; x <= LOGICAL_W + 200; x += 100) {
            const wx = x - ((game.camera.x * par) % 100);
            const peak = baseY - 80 - Math.sin((x + layer * 60) * 0.035) * (34 - layer * 5);
            c.lineTo(wx, baseY);
            c.lineTo(wx + 50, peak);
            c.lineTo(wx + 100, baseY);
        }
        c.lineTo(LOGICAL_W, LOGICAL_H);
        c.closePath();
        c.fill();
    }
    c.globalAlpha = 1;
    // fog band across the ridges
    c.save();
    c.globalCompositeOperation = 'screen';
    for (let i = 0; i < 3; i++) {
        const fy = 360 + i * 40 + Math.sin(game.time * 0.2 + i) * 6;
        const fg = c.createLinearGradient(0, fy - 30, 0, fy + 30);
        fg.addColorStop(0, 'rgba(0,0,0,0)');
        fg.addColorStop(0.5, `rgba(${day > 0.5 ? '230,180,150' : '150,175,215'},0.10)`);
        fg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = fg;
        c.fillRect(0, fy - 30, LOGICAL_W, 60);
    }
    c.restore();
    // mid-ground pagoda skyline
    const pagCol = mixHex('#0f0a16', ridge, 0.35);
    for (let i = -1; i < 8; i++) {
        const x = i * 260 - ((game.camera.x * 0.42) % 260);
        drawPagoda(c, x + 40, 372, 0.9, pagCol, (i % 2));
    }
    // a torii gate landmark
    drawTorii(c, 300 - ((game.camera.x * 0.5) % (LOGICAL_W + 400)) + 200, 430, mixHex('#180a12', th.accent, 0.25));
    // lantern string swagging across the mid-ground
    drawLanternString(game, c, day);
    // foreground twisted pines + ground haze
    const pine = '#0a070e';
    for (let i = -1; i < 7; i++) {
        const x = i * 320 - ((game.camera.x * 0.62) % 320);
        drawPine(c, x + 80, 470, 1, pine);
    }
    // foreground fog near the floor
    c.save();
    c.globalCompositeOperation = 'screen';
    c.globalAlpha = 0.5;
    const gg = c.createLinearGradient(0, LOGICAL_H - 90, 0, LOGICAL_H);
    gg.addColorStop(0, 'rgba(0,0,0,0)');
    gg.addColorStop(1, `rgba(${day > 0.5 ? '210,150,120' : '120,150,200'},0.14)`);
    c.fillStyle = gg;
    c.fillRect(0, LOGICAL_H - 90, LOGICAL_W, 90);
    c.restore();
    c.globalAlpha = 1;
}
function drawPagoda(c, x, baseY, s, col, tiers) {
    const n = 3 + tiers;
    c.fillStyle = col;
    c.fillRect(x - 10 * s, baseY - n * 22 * s, 20 * s, n * 22 * s);
    for (let t = 0; t < n; t++) {
        const y = baseY - t * 22 * s - 14 * s;
        const w = (34 - t * 3) * s;
        c.beginPath();
        c.moveTo(x - w, y);
        c.quadraticCurveTo(x - w * 0.6, y - 10 * s, x - w * 0.3, y - 8 * s);
        c.lineTo(x + w * 0.3, y - 8 * s);
        c.quadraticCurveTo(x + w * 0.6, y - 10 * s, x + w, y);
        c.quadraticCurveTo(x, y - 4 * s, x - w, y);
        c.closePath();
        c.fill();
    }
    // finial
    c.fillRect(x - 1.5 * s, baseY - n * 22 * s - 12 * s, 3 * s, 12 * s);
}
function drawTorii(c, x, baseY, col) {
    c.fillStyle = col;
    const h = 96, w = 84;
    c.fillRect(x - w / 2, baseY - h, 8, h);
    c.fillRect(x + w / 2 - 8, baseY - h, 8, h);
    c.beginPath();
    c.moveTo(x - w / 2 - 16, baseY - h);
    c.lineTo(x + w / 2 + 16, baseY - h);
    c.lineTo(x + w / 2 + 10, baseY - h + 12);
    c.lineTo(x - w / 2 - 10, baseY - h + 12);
    c.closePath();
    c.fill();
    c.fillRect(x - w / 2 - 4, baseY - h + 22, w + 8, 8);
}
function drawPine(c, x, baseY, s, col) {
    c.strokeStyle = col;
    c.fillStyle = col;
    c.lineWidth = 6 * s;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x, baseY + 70);
    c.quadraticCurveTo(x - 6, baseY, x + 10, baseY - 40);
    c.stroke();
    // gnarled branches with flat canopies
    const branch = (bx, by, dir, len) => {
        c.lineWidth = 3 * s;
        c.beginPath();
        c.moveTo(bx, by);
        c.lineTo(bx + dir * len, by - 8);
        c.stroke();
        c.beginPath();
        c.ellipse(bx + dir * len, by - 12, 22 * s, 7 * s, 0, 0, Math.PI * 2);
        c.fill();
    };
    branch(x + 4, baseY - 6, -1, 26 * s);
    branch(x + 8, baseY - 28, 1, 30 * s);
    branch(x + 10, baseY - 44, -1, 20 * s);
    c.beginPath();
    c.ellipse(x + 12, baseY - 52, 30 * s, 9 * s, 0, 0, Math.PI * 2);
    c.fill();
}
function drawLanternString(game, c, day) {
    const par = 0.5, span = LOGICAL_W + 200;
    const ox = -((game.camera.x * par) % 300);
    c.save();
    for (let i = 0; i < 6; i++) {
        const x = ox + i * 300;
        const sag = 40, y0 = 150;
        // hang 3 lanterns along a catenary
        for (let k = 0; k < 3; k++) {
            const p = 0.2 + k * 0.3;
            const lx = x + p * 260;
            const ly = y0 + Math.sin(p * Math.PI) * sag + Math.sin(game.time * 1.5 + i + k) * 2;
            c.globalAlpha = (1 - day) * 0.85 + day * 0.4;
            c.shadowColor = '#ff7a3a';
            c.shadowBlur = (1 - day) * 16 + 4;
            c.fillStyle = day > 0.5 ? '#e8894a' : '#ff9a54';
            c.beginPath();
            c.ellipse(lx, ly, 5, 7, 0, 0, Math.PI * 2);
            c.fill();
            c.shadowBlur = 0;
            c.fillStyle = '#2a1008';
            c.fillRect(lx - 1, ly - 9, 2, 3);
        }
    }
    c.restore();
    c.globalAlpha = 1;
}
// ---- tiles -----------------------------------------------------------------
function tileSolidTop(c, x, y, top, body, bodyDark) {
    const g = c.createLinearGradient(0, y, 0, y + TILE);
    g.addColorStop(0, body);
    g.addColorStop(1, bodyDark);
    c.fillStyle = g;
    c.fillRect(x, y, TILE, TILE);
    c.fillStyle = top;
    c.fillRect(x, y, TILE, 6);
    c.fillStyle = 'rgba(255,255,255,.06)';
    c.fillRect(x, y + 6, TILE, 2);
    c.fillStyle = 'rgba(0,0,0,.22)';
    c.fillRect(x, y + TILE - 4, TILE, 4);
    c.strokeStyle = 'rgba(0,0,0,.18)';
    c.strokeRect(x + .5, y + .5, TILE - 1, TILE - 1);
}
export function drawTiles(game, c) {
    const th = theme(game);
    const stoneBody = mixHex('#231d29', th.ridge, 0.18), stoneDark = '#140f1a';
    const grassTop = game.level.theme === 'cavern' ? '#3a7a5a' : '#6a9a3e';
    const x0 = Math.floor(game.camera.x / TILE) - 1, x1 = Math.ceil((game.camera.x + LOGICAL_W) / TILE) + 1;
    const y0 = Math.floor(game.camera.y / TILE) - 1, y1 = Math.ceil((game.camera.y + LOGICAL_H) / TILE) + 1;
    for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
            const ch = game.tileAt(x, y);
            if (ch === '.')
                continue;
            const sx = x * TILE - game.camera.x, sy = y * TILE - game.camera.y;
            const cap = game.tileAt(x, y - 1) === '.'; // exposed top edge
            if (ch === '#')
                tileSolidTop(c, sx, sy, cap ? '#463c50' : stoneBody, stoneBody, stoneDark);
            else if (ch === 'g') {
                tileSolidTop(c, sx, sy, cap ? grassTop : stoneBody, stoneBody, stoneDark);
                if (cap) {
                    c.fillStyle = mixHex(grassTop, '#c8f08a', 0.4);
                    for (let i = 0; i < 5; i++)
                        c.fillRect(sx + i * 7 + 2, sy - 3 - (i % 2), 2, 5);
                }
            }
            else if (ch === 'o') {
                c.save();
                c.shadowColor = 'rgba(0,0,0,.4)';
                c.shadowBlur = 6;
                c.fillStyle = '#6b533a';
                c.fillRect(sx, sy, TILE, 9);
                c.restore();
                c.fillStyle = '#8a6b45';
                c.fillRect(sx, sy, TILE, 3);
                c.fillStyle = 'rgba(0,0,0,.3)';
                c.fillRect(sx, sy + 7, TILE, 2);
            }
            else if (ch === 'D')
                drawStatePlatform(game, c, sx, sy, 'day');
            else if (ch === 'N')
                drawStatePlatform(game, c, sx, sy, 'night');
            else if (ch === '^' || ch === 'F' || ch === 'S')
                drawHazard(game, c, sx, sy, ch);
        }
}
function drawStatePlatform(game, c, x, y, state) {
    const active = game.world === state;
    c.globalAlpha = active ? 1 : 0.22;
    c.save();
    if (active) {
        c.shadowColor = state === 'day' ? '#ffcf7a' : '#a9d6ff';
        c.shadowBlur = 14;
    }
    const g = c.createLinearGradient(0, y, 0, y + TILE);
    if (state === 'day') {
        g.addColorStop(0, '#f0b45a');
        g.addColorStop(1, '#a9662a');
    }
    else {
        g.addColorStop(0, '#7fa8d6');
        g.addColorStop(1, '#3e5f8a');
    }
    c.fillStyle = g;
    c.fillRect(x, y + 4, TILE, TILE - 8);
    c.fillStyle = state === 'day' ? '#ffe6a4' : '#d3f0ff';
    c.fillRect(x + 2, y + 6, TILE - 4, 3);
    c.restore();
    c.globalAlpha = 1;
}
function drawHazard(game, c, x, y, ch) {
    const active = game.isHazardChar(ch);
    c.globalAlpha = active ? 1 : 0.2;
    c.save();
    if (active && ch !== '^') {
        c.shadowColor = ch === 'F' ? '#ff7840' : '#8ed7ff';
        c.shadowBlur = 16;
    }
    c.fillStyle = ch === 'F' ? '#ff7840' : ch === 'S' ? '#8ed7ff' : '#b8a6a6';
    const wob = active ? Math.sin(game.time * 8 + x) * 1.5 : 0;
    for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.moveTo(x + i * 8, y + TILE);
        c.lineTo(x + i * 8 + 4, y + 6 + wob);
        c.lineTo(x + i * 8 + 8, y + TILE);
        c.fill();
    }
    c.restore();
    c.globalAlpha = 1;
}
export function drawWind(game, c) {
    for (const z of game.level.windZones || []) {
        const sx = z.x - game.camera.x, sy = z.y - game.camera.y;
        c.save();
        c.globalAlpha = game.world === 'day' ? 0.16 : 0.26;
        c.strokeStyle = game.world === 'day' ? '#ffe19a' : '#bfeeff';
        c.lineWidth = 2;
        for (let i = 0; i < 7; i++) {
            const y = sy + ((i * 42 + game.time * 90) % z.h);
            c.beginPath();
            c.moveTo(sx + 18 + Math.sin(game.time * 2 + i) * 12, y);
            c.bezierCurveTo(sx + z.w / 2, y - 28, sx + z.w - 22, y + 22, sx + z.w - 8, y - 14);
            c.stroke();
        }
        c.restore();
    }
}
export function drawLighting(game, c) {
    const night = 1 - game.dayAmount;
    if (night > 0.02) {
        c.save();
        c.fillStyle = `rgba(6,8,20,${0.55 * night})`;
        c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
        c.globalCompositeOperation = 'lighter';
        const glow = (x, y, r, col, a) => {
            const g = c.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, col);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            c.globalAlpha = a * night;
            c.fillStyle = g;
            c.beginPath();
            c.arc(x, y, r, 0, Math.PI * 2);
            c.fill();
        };
        const p = game.player;
        glow(p.x - game.camera.x + p.w / 2, p.y - game.camera.y + p.h / 2, 150, 'rgba(150,200,255,.6)', 0.9);
        for (const s of game.level.shrines)
            glow(s.x - game.camera.x + 13, s.y - game.camera.y + 24, 120, 'rgba(255,200,120,.7)', 0.9);
        for (const cp of game.level.checkpoints)
            glow(cp.x - game.camera.x + 12, cp.y - game.camera.y + 16, 90, 'rgba(255,150,120,.6)', 0.7);
        for (const r of game.level.relics)
            if (!game.save.relics.includes(r.id))
                glow(r.x - game.camera.x + 11, r.y - game.camera.y + 11, 90, 'rgba(255,220,120,.8)', 0.9);
        for (const e of game.enemies)
            if (e.kind === 'wisp')
                glow(e.x - game.camera.x + e.w / 2, e.y - game.camera.y + e.h / 2, 80, 'rgba(150,220,255,.7)', 0.8);
        if (game.boss && game.boss.alive)
            glow(game.boss.x - game.camera.x + game.boss.w / 2, game.boss.y - game.camera.y + 30, 200, 'rgba(255,140,90,.5)', 0.8);
        for (const pr of game.projectiles)
            glow(pr.x - game.camera.x, pr.y - game.camera.y, pr.kind === 'blast' ? 70 : 46, pr.hostile ? 'rgba(255,120,80,.7)' : 'rgba(255,200,120,.7)', 0.7);
        c.restore();
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
    }
    else {
        c.save();
        c.globalCompositeOperation = 'lighter';
        const g = c.createRadialGradient(772 - game.camera.x * 0.04, 92, 0, 772 - game.camera.x * 0.04, 92, 440);
        g.addColorStop(0, 'rgba(255,200,120,.18)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalAlpha = game.dayAmount;
        c.fillStyle = g;
        c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
        c.restore();
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
    }
}
export function drawVignette(c) {
    const g = c.createRadialGradient(LOGICAL_W / 2, LOGICAL_H / 2, LOGICAL_H * 0.42, LOGICAL_W / 2, LOGICAL_H / 2, LOGICAL_H * 0.9);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.46)');
    c.fillStyle = g;
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
}
//# sourceMappingURL=background.js.map
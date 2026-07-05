// Environment rendering: layered sky, parallax mountains/temples/lanterns,
// the distant Zhulong eye, tiles, wind, and an additive night-lighting pass.
import { clamp } from './math.js';
import { LOGICAL_W, LOGICAL_H, TILE } from './types.js';
export function drawSky(game, c) {
    const day = game.dayAmount;
    c.fillStyle = '#0a0611';
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    // day gradient
    const dg = c.createLinearGradient(0, 0, 0, LOGICAL_H);
    dg.addColorStop(0, '#f0954f');
    dg.addColorStop(.42, '#7a2b47');
    dg.addColorStop(1, '#180a17');
    c.globalAlpha = day;
    c.fillStyle = dg;
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    // night gradient
    const ng = c.createLinearGradient(0, 0, 0, LOGICAL_H);
    ng.addColorStop(0, '#081633');
    ng.addColorStop(.48, '#17132e');
    ng.addColorStop(1, '#08050d');
    c.globalAlpha = 1 - day;
    c.fillStyle = ng;
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    c.globalAlpha = 1;
    // sun / moon
    c.save();
    c.translate(-game.camera.x * 0.04, 0);
    c.globalAlpha = day;
    c.fillStyle = '#ffd17c';
    c.shadowColor = '#ffbd54';
    c.shadowBlur = 54;
    c.beginPath();
    c.arc(772, 92, 44, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1 - day;
    c.fillStyle = '#dff0ff';
    c.shadowColor = '#a9d6ff';
    c.shadowBlur = 40;
    c.beginPath();
    c.arc(760, 96, 33, 0, Math.PI * 2);
    c.fill();
    // moon craters
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(150,180,220,.5)';
    c.beginPath();
    c.arc(752, 90, 6, 0, Math.PI * 2);
    c.arc(770, 104, 4, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.shadowBlur = 0;
    c.globalAlpha = 1;
    drawDragonEye(game, c, day);
}
export function drawDragonEye(game, c, day) {
    c.save();
    const x = 240 - game.camera.x * 0.03, y = 96;
    // eyelid openness follows day amount, plus a slow cosmic blink handled by game.eyeBlink
    const openness = clamp(day * game.eyeBlink, 0, 1);
    c.globalAlpha = 0.5;
    c.fillStyle = 'rgba(255,210,120,.06)';
    c.beginPath();
    c.ellipse(x, y, 180, 62, 0, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 0.7;
    c.strokeStyle = day > 0.5 ? 'rgba(255,210,120,.7)' : 'rgba(141,202,255,.4)';
    c.lineWidth = 5;
    c.beginPath();
    c.ellipse(x, y, 140, 44 * (0.18 + openness * 0.82), 0, 0, Math.PI * 2);
    c.stroke();
    if (openness > 0.06) {
        c.globalAlpha = openness;
        c.shadowColor = '#ff5c38';
        c.shadowBlur = 40;
        c.fillStyle = '#18060b';
        c.beginPath();
        c.ellipse(x, y, 36, 40 * openness, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#f04d34';
        c.beginPath();
        c.ellipse(x, y, 14, 40 * openness, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#ffd9a0';
        c.beginPath();
        c.arc(x - 5, y - 8 * openness, 4, 0, Math.PI * 2);
        c.fill();
    }
    c.restore();
    c.globalAlpha = 1;
    c.shadowBlur = 0;
}
export function drawParallax(game, c) {
    const day = game.dayAmount;
    // distant mountain ridges
    for (let layer = 0; layer < 4; layer++) {
        const par = [0.08, 0.16, 0.28, 0.42][layer];
        const baseY = [340, 372, 424, 474][layer];
        c.fillStyle = ['rgba(33,21,41,.6)', 'rgba(27,17,33,.72)', 'rgba(19,12,25,.85)', 'rgba(10,7,15,.96)'][layer];
        c.beginPath();
        c.moveTo(0, LOGICAL_H);
        for (let x = -120; x <= LOGICAL_W + 180; x += 90) {
            const wx = x - ((game.camera.x * par) % 90);
            const peak = baseY - 72 - Math.sin((x + layer * 70) * 0.04) * 32;
            c.lineTo(wx, baseY);
            c.lineTo(wx + 45, peak);
            c.lineTo(wx + 90, baseY);
        }
        c.lineTo(LOGICAL_W, LOGICAL_H);
        c.closePath();
        c.fill();
    }
    // floating lanterns (glow at night) / drifting motes (day)
    for (let i = 0; i < 9; i++) {
        const par = 0.5;
        const lx = ((i * 150 + game.time * 12) - game.camera.x * par) % (LOGICAL_W + 200) - 100;
        const ly = 150 + Math.sin(game.time * 0.6 + i) * 22 + (i % 3) * 40;
        c.save();
        c.globalAlpha = (1 - day) * 0.9 + day * 0.15;
        c.shadowColor = day > 0.5 ? '#ffcf7a' : '#ffb066';
        c.shadowBlur = 16;
        c.fillStyle = day > 0.5 ? '#ffe0a0' : '#ff9d5a';
        c.fillRect(lx, ly, 7, 10);
        c.restore();
    }
    // temple silhouettes (foreground parallax)
    c.fillStyle = 'rgba(9,6,13,.88)';
    for (let i = -2; i < 10; i++) {
        const x = i * 200 - ((game.camera.x * 0.55) % 200);
        c.fillRect(x + 60, 424, 68, 130);
        c.beginPath();
        c.moveTo(x + 40, 424);
        c.lineTo(x + 94, 384);
        c.lineTo(x + 148, 424);
        c.closePath();
        c.fill();
    }
}
function tileSolidTop(c, x, y, top, body) {
    c.fillStyle = body;
    c.fillRect(x, y, TILE, TILE);
    c.fillStyle = top;
    c.fillRect(x, y, TILE, 6);
    c.fillStyle = 'rgba(0,0,0,.18)';
    c.fillRect(x, y + TILE - 4, TILE, 4);
    c.strokeStyle = 'rgba(255,255,255,.05)';
    c.strokeRect(x + .5, y + .5, TILE - 1, TILE - 1);
}
export function drawTiles(game, c) {
    const x0 = Math.floor(game.camera.x / TILE) - 1, x1 = Math.ceil((game.camera.x + LOGICAL_W) / TILE) + 1;
    const y0 = Math.floor(game.camera.y / TILE) - 1, y1 = Math.ceil((game.camera.y + LOGICAL_H) / TILE) + 1;
    for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
            const ch = game.tileAt(x, y);
            if (ch === '.')
                continue;
            const sx = x * TILE - game.camera.x, sy = y * TILE - game.camera.y;
            if (ch === '#')
                tileSolidTop(c, sx, sy, '#3e3742', '#2a242f');
            else if (ch === 'g') {
                tileSolidTop(c, sx, sy, '#5c8a3a', '#2a242f');
                c.fillStyle = '#79ad4c';
                for (let i = 0; i < 5; i++)
                    c.fillRect(sx + i * 7 + 2, sy - 2 - (i % 2), 2, 4);
            }
            else if (ch === 'o') {
                c.fillStyle = '#6b533a';
                c.fillRect(sx, sy, TILE, 8);
                c.fillStyle = '#8a6b45';
                c.fillRect(sx, sy, TILE, 3);
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
        c.shadowBlur = 12;
    }
    c.fillStyle = state === 'day' ? '#d49338' : '#5b83aa';
    c.fillRect(x, y + 5, TILE, TILE - 10);
    c.fillStyle = state === 'day' ? '#ffe19a' : '#c7f0ff';
    c.fillRect(x + 3, y + 7, TILE - 6, 4);
    c.restore();
    c.globalAlpha = 1;
}
function drawHazard(game, c, x, y, ch) {
    const active = game.isHazardChar(ch);
    c.globalAlpha = active ? 1 : 0.2;
    c.save();
    if (active && ch !== '^') {
        c.shadowColor = ch === 'F' ? '#ff7840' : '#8ed7ff';
        c.shadowBlur = 14;
    }
    c.fillStyle = ch === 'F' ? '#ff7840' : ch === 'S' ? '#8ed7ff' : '#b8a6a6';
    const wob = active ? Math.sin(game.time * 8 + x) * 1.5 : 0;
    for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.moveTo(x + i * 8, y + TILE);
        c.lineTo(x + i * 8 + 4, y + 7 + wob);
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
// Additive lighting pass — dark at night with glowing light sources.
export function drawLighting(game, c) {
    const night = 1 - game.dayAmount;
    if (night > 0.02) {
        c.save();
        c.globalCompositeOperation = 'source-over';
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
            glow(pr.x - game.camera.x, pr.y - game.camera.y, 46, 'rgba(255,170,90,.7)', 0.7);
        c.restore();
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
    }
    else {
        // gentle daytime warm bloom from the sun
        c.save();
        c.globalCompositeOperation = 'lighter';
        const g = c.createRadialGradient(772 - game.camera.x * 0.04, 92, 0, 772 - game.camera.x * 0.04, 92, 420);
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
// Vignette + subtle color grade to frame the scene.
export function drawVignette(c) {
    const g = c.createRadialGradient(LOGICAL_W / 2, LOGICAL_H / 2, LOGICAL_H * 0.4, LOGICAL_W / 2, LOGICAL_H / 2, LOGICAL_H * 0.85);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.42)');
    c.fillStyle = g;
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
}
//# sourceMappingURL=background.js.map
// Environment rendering: a layered, theme-aware sky (atmospheric haze, sun /
// blood-moon, a coiling Zhulong silhouette), parallax pagodas / torii / pines /
// lantern strings / drifting fog, tiles, wind, and an additive lighting pass.
import { clamp, mixHex } from './math.js';
import { LOGICAL_W, LOGICAL_H, TILE } from './types.js';
const THEMES = {
    mountain: { day: ['#ffbf7a', '#e07048', '#7a2b47', '#1a0a17'], night: ['#0b234f', '#152048', '#171233', '#08050d'], haze: '#e08a5a', hazeNight: '#33477a', ridge: '#5a2740', ridgeNight: '#141b3a', accent: '#ff5c38', soilTop: '#8a5a34', soilBot: '#39220f', grass: '#7ca23f', grassLo: '#517028', decor: '#2c1418' },
    bridge: { day: ['#ffc38f', '#e8785f', '#7a2f52', '#180a17'], night: ['#0b2c48', '#123a4c', '#181c3e', '#08060f'], haze: '#e89a72', hazeNight: '#2f5266', ridge: '#5e2a49', ridgeNight: '#132638', accent: '#ff7a52', soilTop: '#875841', soilBot: '#331b15', grass: '#729a49', grassLo: '#4a6a2c', decor: '#26121e' },
    cavern: { day: ['#8a4a30', '#5a2a24', '#2f171b', '#0d0608'], night: ['#0c1c38', '#121e34', '#141122', '#070509'], haze: '#7a4436', hazeNight: '#243444', ridge: '#3a2020', ridgeNight: '#101826', accent: '#ff8b44', soilTop: '#6e4d38', soilBot: '#2a1a18', grass: '#4f9068', grassLo: '#356048', decor: '#2c2020' },
    arena: { day: ['#8a2420', '#54141c', '#2c0a12', '#0d0407'], night: ['#150720', '#1e0b26', '#16091a', '#070409'], haze: '#7a2e2c', hazeNight: '#3e1c34', ridge: '#3a1220', ridgeNight: '#1a0c1f', accent: '#ff3b2a', soilTop: '#7a4238', soilBot: '#2a1216', grass: '#96543a', grassLo: '#623428', decor: '#2a0e16' },
};
function theme(game) { return THEMES[game.level.theme] || THEMES.mountain; }
// deterministic hash → [0,1) for stable per-column decoration placement
function hash(n) {
    n = (n << 13) ^ n;
    return ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 0x7fffffff;
}
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
    drawClouds(game, c, day);
    drawCoilingDragon(game, c, day);
    drawDragonEye(game, c, day);
    drawGodRays(game, c, day, cx, cy);
}
// Stylised Chinese auspicious cloud (祥云): rounded billows with a ruyi curl.
function drawCloud(c, x, y, s, col) {
    c.fillStyle = col;
    c.beginPath();
    c.arc(x, y, 11 * s, 0, Math.PI * 2);
    c.arc(x + 15 * s, y - 4 * s, 14 * s, 0, Math.PI * 2);
    c.arc(x + 32 * s, y, 11 * s, 0, Math.PI * 2);
    c.arc(x + 17 * s, y + 6 * s, 13 * s, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = col;
    c.lineWidth = 3.5 * s;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(x - 7 * s, y + 3 * s, 5.5 * s, -0.3, Math.PI * 1.7);
    c.stroke();
    c.beginPath();
    c.arc(x + 40 * s, y + 1 * s, 5 * s, Math.PI * 0.4, Math.PI * 2.1);
    c.stroke();
}
function drawClouds(game, c, day) {
    const col = day > 0.5 ? 'rgba(255,214,168,0.13)' : 'rgba(150,178,224,0.11)';
    c.save();
    for (let i = 0; i < 6; i++) {
        const par = 0.05 + i * 0.008;
        const x = (((i * 250 + game.time * 7) - game.camera.x * par) % (LOGICAL_W + 320)) - 160;
        const y = 54 + (i % 3) * 44 + Math.sin(game.time * 0.3 + i) * 4;
        drawCloud(c, x, y, 1.25 - i * 0.08, col);
    }
    c.restore();
}
// Zhulong himself — a colossal red serpent coiling across the high heavens of
// every scene. Slow parallax; body, spine ridge, whiskers, horned head + eye.
function drawCoilingDragon(game, c, day) {
    const t = game.time * 0.06;
    const ox = 430 - game.camera.x * 0.05;
    const react = game.eyeReact;
    const col = mixHex('#6aa4ff', '#ff5a38', day);
    const path = (p) => ({ x: ox + p * 660, y: 118 + Math.sin(p * 6.6 + t) * 52 - p * 16 });
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    // soft body aura
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.10 + 0.05 * Math.sin(game.time * 0.4) + react * 0.12;
    c.strokeStyle = col;
    c.lineWidth = 40;
    c.beginPath();
    for (let i = 0; i <= 48; i++) {
        const q = path(i / 48);
        i === 0 ? c.moveTo(q.x, q.y) : c.lineTo(q.x, q.y);
    }
    c.stroke();
    c.globalCompositeOperation = 'source-over';
    // main tapering body
    c.globalAlpha = 0.26 + react * 0.14;
    c.strokeStyle = col;
    c.lineWidth = 22;
    c.beginPath();
    for (let i = 0; i <= 48; i++) {
        const q = path(i / 48);
        const w = 22 * (1 - i / 48 * 0.8);
        c.lineWidth = Math.max(4, w);
        i === 0 ? c.moveTo(q.x, q.y) : c.lineTo(q.x, q.y);
    }
    c.stroke();
    // dorsal spine ridge
    c.globalAlpha = 0.2 + react * 0.1;
    c.strokeStyle = mixHex(col, '#ffe6a0', 0.5);
    c.lineWidth = 2;
    for (let i = 2; i < 46; i += 2) {
        const q = path(i / 48), q2 = path((i + 0.5) / 48);
        const nx = -(q2.y - q.y), ny = q2.x - q.x;
        const L = Math.hypot(nx, ny) || 1;
        const s = 10 * (1 - i / 48 * 0.7);
        c.beginPath();
        c.moveTo(q.x, q.y);
        c.lineTo(q.x + nx / L * s, q.y + ny / L * s);
        c.stroke();
    }
    // head (at p=0), horns, whiskers, eye
    const h = path(0), h2 = path(0.03), ang = Math.atan2(h.y - h2.y, h.x - h2.x);
    c.save();
    c.translate(h.x, h.y);
    c.rotate(ang);
    c.globalAlpha = 0.34 + react * 0.16;
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(6, 0, 26, 15, 0, 0, Math.PI * 2);
    c.fill(); // skull
    c.beginPath();
    c.moveTo(24, -6);
    c.quadraticCurveTo(40, -2, 30, 8);
    c.quadraticCurveTo(20, 6, 24, -6);
    c.fill(); // snout
    c.strokeStyle = col;
    c.lineWidth = 3;
    c.lineCap = 'round'; // horns
    c.beginPath();
    c.moveTo(-6, -10);
    c.quadraticCurveTo(-26, -26, -14, -34);
    c.stroke();
    c.beginPath();
    c.moveTo(-12, -6);
    c.quadraticCurveTo(-34, -14, -30, -26);
    c.stroke();
    c.globalAlpha = 0.24;
    c.lineWidth = 1.6; // whiskers
    c.beginPath();
    c.moveTo(30, 4);
    c.bezierCurveTo(60, 10, 80, -10 + Math.sin(t * 4) * 6, 108, 6);
    c.stroke();
    c.beginPath();
    c.moveTo(28, 8);
    c.bezierCurveTo(56, 20, 78, 30 + Math.sin(t * 4 + 1) * 6, 104, 26);
    c.stroke();
    // eye — flares with combat
    c.globalAlpha = 0.7 + react * 0.3;
    c.shadowColor = '#ff4a28';
    c.shadowBlur = 10 + react * 26;
    c.fillStyle = mixHex('#ffd08a', '#ff5230', 0.3 + react * 0.5);
    c.beginPath();
    c.arc(2, -3, 3.4 + react * 1.6, 0, Math.PI * 2);
    c.fill();
    c.restore();
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
    const x = 214 - game.camera.x * 0.03, y = 84;
    const openness = clamp(day * game.eyeBlink, 0, 1);
    // outer socket haze
    c.globalAlpha = 0.45;
    c.fillStyle = 'rgba(255,120,80,.05)';
    c.beginPath();
    c.ellipse(x, y, 112, 40, 0, 0, Math.PI * 2);
    c.fill();
    // lid outline
    c.globalAlpha = 0.72;
    c.lineWidth = 3.5;
    c.strokeStyle = day > 0.5 ? 'rgba(255,210,120,.65)' : 'rgba(141,202,255,.38)';
    c.beginPath();
    c.ellipse(x, y, 84, 27 * (0.16 + openness * 0.84), 0, 0, Math.PI * 2);
    c.stroke();
    if (openness > 0.05) {
        const react = game.eyeReact;
        c.globalAlpha = openness;
        c.shadowColor = '#ff4a28';
        c.shadowBlur = 30 + react * 34;
        c.fillStyle = '#1a0509';
        c.beginPath();
        c.ellipse(x, y, 23, 24 * openness, 0, 0, Math.PI * 2);
        c.fill();
        const iris = c.createRadialGradient(x, y, 1, x, y, 24);
        iris.addColorStop(0, react > 0.02 ? '#fff1c8' : '#ffd08a');
        iris.addColorStop(0.4, '#f0452c');
        iris.addColorStop(1, '#8a1810');
        c.fillStyle = iris;
        c.beginPath();
        c.ellipse(x, y, 9 + react * 5, 24 * openness, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#fff0d0';
        c.beginPath();
        c.arc(x - 4, y - 6 * openness, 2.4, 0, Math.PI * 2);
        c.fill();
    }
    c.restore();
    c.globalAlpha = 1;
    c.shadowBlur = 0;
}
// AutoSprite parallax props (loaded lazily; transparent PNGs)
const propImgs = {};
const propReady = {};
let propsInit = false;
function ensureProps() {
    if (propsInit)
        return;
    propsInit = true;
    for (const n of ['pagoda', 'shishi', 'pine', 'stele', 'palace']) {
        const im = new Image();
        im.onload = () => (propReady[n] = true);
        im.src = 'assets/sprites/props/' + n + '.png';
        propImgs[n] = im;
    }
}
function drawPropImg(c, name, cx, baseY, targetH, alpha) {
    const img = propImgs[name];
    if (!img || !propReady[name])
        return;
    const scale = targetH / img.height, w = img.width * scale;
    c.globalAlpha = alpha;
    c.drawImage(img, cx - w / 2, baseY - targetH, w, targetH);
    c.globalAlpha = 1;
}
// smooth multi-octave ridgeline height at world-x
function ridgeH(wx, layer) {
    return Math.sin(wx * 0.006 + layer) * 0.6 + Math.sin(wx * 0.017 + layer * 2) * 0.28 + Math.sin(wx * 0.043 + layer) * 0.12;
}
// Layered rolling mountains (vertical + horizontal parallax) + sprite props + fog.
export function drawParallax(game, c) {
    const th = theme(game), day = game.dayAmount;
    const haze = mixHex(th.hazeNight, th.haze, day);
    const ridge = mixHex(th.ridgeNight, th.ridge, day);
    // 5 ridge layers with strong atmospheric perspective: distant peaks nearly
    // dissolve into the haze (mysterious depth); near ridges move much faster.
    const PARS = [0.02, 0.055, 0.115, 0.22, 0.37];
    const BASE = [258, 296, 342, 394, 460];
    const AMP = [86, 78, 70, 62, 54];
    const N = PARS.length;
    for (let layer = 0; layer < N; layer++) {
        const par = PARS[layer], sc = game.camera.x * par, voff = game.camera.y * par;
        const y0 = BASE[layer] - voff, amp = AMP[layer];
        const far = 1 - layer / (N - 1); // 1 = farthest, 0 = nearest
        // atmospheric perspective, but keep even the farthest ridge readable so all
        // five planes stay visible (don't fully dissolve into the sky)
        const col = mixHex(ridge, haze, 0.1 + far * 0.58);
        c.globalAlpha = 0.64 + (1 - far) * 0.34;
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(-20, LOGICAL_H + 4);
        for (let x = -20; x <= LOGICAL_W + 20; x += 12) {
            const y = y0 - amp * (0.5 + 0.5 * ridgeH(x + sc, layer));
            c.lineTo(x, y);
        }
        c.lineTo(LOGICAL_W + 20, LOGICAL_H + 4);
        c.closePath();
        c.fill();
        // rim-light EVERY crest so each layer separates from the one behind it
        c.globalAlpha = (0.64 + (1 - far) * 0.34) * (0.3 + (1 - far) * 0.24);
        c.strokeStyle = mixHex(col, day > 0.5 ? '#ffd0a4' : '#b3ccff', 0.55);
        c.lineWidth = 1.4;
        c.beginPath();
        for (let x = -20; x <= LOGICAL_W + 20; x += 12) {
            const y = y0 - amp * (0.5 + 0.5 * ridgeH(x + sc, layer));
            x === -20 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        c.stroke();
    }
    c.globalAlpha = 1;
    // drifting mist banks weaving between the distant ridges (mystery + depth)
    c.save();
    c.globalCompositeOperation = 'screen';
    const tint = day > 0.5 ? '236,192,162' : '150,178,222';
    for (let i = 0; i < 7; i++) {
        const bx = ((i * 250 + game.time * (7 + i * 2.2)) % (LOGICAL_W + 460)) - 230;
        const by = 296 + (i % 3) * 42 + Math.sin(game.time * 0.2 + i) * 10 - game.camera.y * 0.08;
        const r = 130 + (i % 3) * 64;
        const g = c.createRadialGradient(bx, by, 0, bx, by, r);
        g.addColorStop(0, `rgba(${tint},${0.07 + (i % 3) * 0.015})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(bx, by, r, r * 0.42, 0, 0, Math.PI * 2);
        c.fill();
    }
    c.restore();
    // large sprite props scattered across two depth bands
    ensureProps();
    const names = ['pagoda', 'shishi', 'pine', 'stele', 'palace'];
    // raised well above the foreground terrain so the Chinese-style silhouettes
    // stand up on the ridges against the sky (not buried at the grass line)
    const bands = [
        { par: 0.13, baseY: 272, h: 56, alpha: 0.26, step: 540, seed: 41 }, // very distant, ghostly
        { par: 0.24, baseY: 312, h: 86, alpha: 0.46, step: 470, seed: 7 },
        { par: 0.4, baseY: 350, h: 116, alpha: 0.82, step: 560, seed: 23 },
    ];
    for (const b of bands) {
        const sc = game.camera.x * b.par, voff = game.camera.y * b.par;
        const first = Math.floor((sc - 280) / b.step), last = Math.ceil((sc + LOGICAL_W + 280) / b.step);
        for (let i = first; i <= last; i++) {
            if (hash(i * 13 + b.seed) > 0.62)
                continue;
            const name = names[Math.floor(hash(i * 7 + b.seed) * names.length)];
            const sx = i * b.step + hash(i * 3 + b.seed) * 150 - sc;
            drawPropImg(c, name, sx, b.baseY - voff, b.h * (0.82 + hash(i * 5 + b.seed) * 0.5), b.alpha);
        }
    }
    // paifang landmark + lantern string
    drawPaifang(c, 300 - ((game.camera.x * 0.5) % (LOGICAL_W + 400)) + 200, 436 - game.camera.y * 0.5, mixHex('#160812', th.ridge, 0.3), mixHex(th.accent, '#2a0a0c', 0.35));
    drawLanternString(game, c, day);
    // foreground floor fog
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
// East-Asian curved roof silhouette: eaves sweep upward at the ends
function curvedRoof(c, cx, y, w, h) {
    c.beginPath();
    c.moveTo(cx - w / 2 - 16, y - 13);
    c.quadraticCurveTo(cx - w * 0.28, y + 3, cx, y - 3);
    c.quadraticCurveTo(cx + w * 0.28, y + 3, cx + w / 2 + 16, y - 13);
    c.lineTo(cx + w / 2, y + h);
    c.lineTo(cx - w / 2, y + h);
    c.closePath();
    c.fill();
}
// Chinese paifang / pailou memorial archway (replaces the Japanese torii)
function drawPaifang(c, x, baseY, col, accent) {
    const w = 100, h = 104;
    c.fillStyle = col;
    for (const px of [-w / 2, -w / 6, w / 6, w / 2])
        c.fillRect(x + px - 3, baseY - h, 7, h); // four pillars
    c.fillRect(x - w / 2 - 8, baseY - h + 26, w + 16, 10); // lower lintel
    curvedRoof(c, x, baseY - h + 6, w + 30, 15); // main roof
    curvedRoof(c, x, baseY - h - 20, w * 0.46, 12); // raised central roof
    c.fillRect(x - 2, baseY - h - 32, 4, 10); // ridge finial
    c.fillStyle = accent;
    c.fillRect(x - 15, baseY - h + 9, 30, 13); // name plaque
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
    const sag = 40, y0 = 150;
    const cordY = (x, p) => y0 + Math.sin(p * Math.PI) * sag;
    c.save();
    for (let i = 0; i < 6; i++) {
        const x = ox + i * 300;
        // sagging cord
        c.globalAlpha = (1 - day) * 0.45 + 0.2;
        c.strokeStyle = 'rgba(30,16,10,.6)';
        c.lineWidth = 1.4;
        c.beginPath();
        for (let p = 0; p <= 1.001; p += 0.1) {
            const px = x + p * 260, py = cordY(x, p);
            p === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
        }
        c.stroke();
        // round red lanterns with gold caps + tassels
        for (let k = 0; k < 3; k++) {
            const p = 0.2 + k * 0.3;
            const lx = x + p * 260;
            const ly = cordY(x, p) + 12 + Math.sin(game.time * 1.5 + i + k) * 1.5;
            c.globalAlpha = (1 - day) * 0.9 + day * 0.55;
            c.shadowColor = '#ff4a22';
            c.shadowBlur = (1 - day) * 18 + 5;
            c.fillStyle = day > 0.5 ? '#cf432b' : '#e85236';
            c.beginPath();
            c.ellipse(lx, ly, 6, 8, 0, 0, Math.PI * 2);
            c.fill();
            c.shadowBlur = 0;
            c.fillStyle = 'rgba(255,224,150,.5)';
            c.beginPath();
            c.arc(lx, ly, 2.6, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = '#e8b24a';
            c.fillRect(lx - 3, ly - 10, 6, 2.5);
            c.fillRect(lx - 3, ly + 7, 6, 2.5);
            c.strokeStyle = '#e8b24a';
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(lx, ly + 9);
            c.lineTo(lx, ly + 16);
            c.stroke();
            c.fillStyle = '#cf432b';
            c.beginPath();
            c.moveTo(lx - 2.5, ly + 15);
            c.lineTo(lx + 2.5, ly + 15);
            c.lineTo(lx, ly + 20);
            c.closePath();
            c.fill();
        }
    }
    c.restore();
    c.globalAlpha = 1;
}
// ---- tiles -----------------------------------------------------------------
// topmost solid terrain row of a column ('#' or 'g'), or null for a pit.
// Columns outside the level are treated as empty (not the solid '#' that
// tileAt() returns for out-of-bounds), so the ground ends cleanly at the edges.
function surfaceRow(game, x) {
    if (x < 0 || x >= game.level.width)
        return null;
    const h = game.level.height;
    for (let y = 0; y < h; y++) {
        const ch = game.tileAt(x, y);
        if (ch === '#' || ch === 'g')
            return y;
    }
    return null;
}
// organic wobble so even flat spans read as gently rolling hills
function surfaceBump(wx) { return Math.sin(wx * 0.011) * 6 + Math.sin(wx * 0.037) * 3 + Math.sin(wx * 0.091) * 1.5; }
export function drawTiles(game, c) {
    drawGround(game, c);
    const x0 = Math.floor(game.camera.x / TILE) - 1, x1 = Math.ceil((game.camera.x + LOGICAL_W) / TILE) + 1;
    const y0 = Math.floor(game.camera.y / TILE) - 1, y1 = Math.ceil((game.camera.y + LOGICAL_H) / TILE) + 1;
    for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
            const ch = game.tileAt(x, y);
            if (ch === '.' || ch === '#' || ch === 'g')
                continue;
            const sx = x * TILE - game.camera.x, sy = y * TILE - game.camera.y;
            if (ch === 'o') {
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
                for (let i = 0; i < 3; i++) {
                    c.fillStyle = 'rgba(0,0,0,.2)';
                    c.fillRect(sx + 4 + i * 9, sy + 1, 1, 7);
                }
            }
            else if (ch === 'D')
                drawStatePlatform(game, c, sx, sy, 'day');
            else if (ch === 'N')
                drawStatePlatform(game, c, sx, sy, 'night');
            else if (ch === '^' || ch === 'F' || ch === 'S')
                drawHazard(game, c, sx, sy, ch);
        }
}
// Organic rolling terrain: smooth soil mounds with a grassy rim, cliff faces at
// pits, and scattered surface detail (tombstones, dead trees, rocks, grass).
function drawGround(game, c) {
    const th = theme(game), camX = game.camera.x, camY = game.camera.y;
    const x0 = Math.floor(camX / TILE) - 2, x1 = Math.ceil((camX + LOGICAL_W) / TILE) + 2;
    const bottom = LOGICAL_H + 60;
    const topY = (x) => { const sr = surfaceRow(game, x); return sr === null ? null : sr * TILE - camY + surfaceBump(x * TILE); };
    let a = null;
    const flush = (b) => { if (a !== null)
        drawSpan(game, c, th, a, b, camX, camY, bottom, topY); a = null; };
    for (let x = x0; x <= x1; x++) {
        if (surfaceRow(game, x) !== null) {
            if (a === null)
                a = x;
        }
        else
            flush(x - 1);
    }
    flush(x1);
}
function drawSpan(game, c, th, a, b, camX, camY, bottom, topY) {
    const leftX = a * TILE - camX, rightX = (b + 1) * TILE - camX;
    const pts = [{ x: leftX, y: topY(a) }];
    for (let x = a; x <= b; x++)
        pts.push({ x: x * TILE + TILE / 2 - camX, y: topY(x) });
    pts.push({ x: rightX, y: topY(b) });
    const minY = Math.min(...pts.map(p => p.y));
    const traceTop = () => { c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) {
        const m = { x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2 };
        c.quadraticCurveTo(pts[i - 1].x, pts[i - 1].y, m.x, m.y);
    } c.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y); };
    const surfY = (x) => topY(x);
    // ---- DIRT body: soil gradient, speckle texture, visible rocks, roots ----
    c.save();
    c.beginPath();
    traceTop();
    c.lineTo(rightX, bottom);
    c.lineTo(leftX, bottom);
    c.closePath();
    const g = c.createLinearGradient(0, minY, 0, minY + 300);
    g.addColorStop(0, th.soilTop);
    g.addColorStop(0.5, mixHex(th.soilTop, th.soilBot, 0.55));
    g.addColorStop(1, th.soilBot);
    c.fillStyle = g;
    c.fill();
    c.clip();
    // dirt speckle
    for (let x = a; x <= b; x++)
        for (let s = 0; s < 4; s++) {
            const r = hash(x * 31 + s * 7 + 2);
            const px = x * TILE + r * TILE - camX, py = surfY(x) + 12 + hash(x * 5 + s * 19) * 150;
            c.fillStyle = r < 0.5 ? 'rgba(0,0,0,.16)' : 'rgba(255,225,190,.05)';
            c.fillRect(px, py, 2, 2);
        }
    // rocks embedded in dirt (2-tone, rounded)
    for (let x = a; x <= b; x++)
        for (let s = 0; s < 2; s++) {
            const r = hash(x * 17 + s * 101 + 5);
            if (r > 0.5)
                continue;
            const rx = x * TILE + 3 + hash(x * 5 + s) * 26 - camX, ry = surfY(x) + 16 + hash(x * 9 + s * 13) * 140, rw = 4 + r * 9;
            drawStone(c, rx, ry, rw, th);
        }
    // roots hanging from the grass into the dirt
    c.strokeStyle = mixHex(th.grassLo, th.soilBot, 0.5);
    c.lineWidth = 1.4;
    c.lineCap = 'round';
    for (let x = a; x <= b; x++) {
        if (hash(x * 23 + 9) > 0.28)
            continue;
        const rx = x * TILE + 16 - camX, ry = surfY(x) + 12;
        c.beginPath();
        c.moveTo(rx, ry);
        c.quadraticCurveTo(rx + 3, ry + 8, rx - 2, ry + 16);
        c.stroke();
    }
    c.restore();
    // ---- GRASS turf band with a scalloped underside + blades ----
    const gt = 12;
    c.save();
    c.beginPath();
    traceTop();
    for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        const wob = Math.sin((p.x + camX) * 0.4) * 3 + Math.sin((p.x + camX) * 0.13) * 2;
        c.lineTo(p.x, p.y + gt + wob);
    }
    c.closePath();
    const gg = c.createLinearGradient(0, minY - 2, 0, minY + gt + 6);
    gg.addColorStop(0, mixHex(th.grass, '#e8ffb0', 0.35));
    gg.addColorStop(0.5, th.grass);
    gg.addColorStop(1, th.grassLo);
    c.fillStyle = gg;
    c.fill();
    c.restore();
    // bright top highlight + blades
    c.save();
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.strokeStyle = mixHex(th.grass, '#f0ffc0', 0.5);
    c.lineWidth = 1.4;
    c.beginPath();
    traceTop();
    c.stroke();
    c.strokeStyle = th.grassLo;
    for (let x = a; x <= b; x++) {
        const wx = x * TILE, sy = surfY(x);
        for (let k = 0; k < 3; k++) {
            const bx = wx + 6 + k * 9 - camX, sway = Math.sin(game.time * 1.4 + x + k) * 1.2;
            c.lineWidth = 1.3;
            c.beginPath();
            c.moveTo(bx, sy + 2);
            c.quadraticCurveTo(bx + sway, sy - 4, bx + sway * 1.6, sy - 8);
            c.stroke();
        }
    }
    c.restore();
    // cliff shading at the two edges (pit walls)
    for (const ex of [leftX, rightX]) {
        const grd = c.createLinearGradient(ex - 8, 0, ex + 8, 0);
        const dir = ex === leftX ? 1 : -1;
        grd.addColorStop(0, dir > 0 ? 'rgba(0,0,0,.32)' : 'rgba(0,0,0,0)');
        grd.addColorStop(1, dir > 0 ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,.32)');
        c.fillStyle = grd;
        c.fillRect(ex - 8, topY(ex === leftX ? a : b), 16, bottom);
    }
    // surface decorations
    for (let x = a; x <= b; x++)
        drawDecor(game, c, th, x, topY(x), camX);
}
function drawStone(c, x, y, w, th) {
    c.fillStyle = mixHex(th.soilBot, '#9a8a78', 0.5);
    c.beginPath();
    c.ellipse(x, y, w, w * 0.72, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,240,220,.14)';
    c.beginPath();
    c.ellipse(x - w * 0.28, y - w * 0.3, w * 0.5, w * 0.28, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,.3)';
    c.beginPath();
    c.ellipse(x, y + w * 0.36, w * 0.92, w * 0.3, 0, 0, Math.PI * 2);
    c.fill();
}
function drawDecor(game, c, th, x, sy, camX) {
    // skip columns that carry a platform/hazard just above the ground
    const above = game.tileAt(x, surfaceRow(game, x) - 1);
    if (above === 'o' || above === 'D' || above === 'N' || above === 'F' || above === 'S' || above === '^')
        return;
    const wx = x * TILE + TILE / 2 - camX;
    const r = hash(x * 7 + 3), r2 = hash(x * 13 + 5);
    const sway = Math.sin(game.time * 1.6 + x) * 1.5;
    c.save();
    if (r < 0.09) { // tombstone / cairn
        c.fillStyle = th.decor;
        c.beginPath();
        c.moveTo(wx - 7, sy);
        c.lineTo(wx - 7, sy - 14);
        c.arc(wx, sy - 14, 7, Math.PI, 0);
        c.lineTo(wx + 7, sy);
        c.closePath();
        c.fill();
        c.strokeStyle = 'rgba(255,255,255,.08)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(wx, sy - 3);
        c.lineTo(wx, sy - 16);
        c.stroke();
    }
    else if (r < 0.14) { // dead tree
        c.strokeStyle = th.decor;
        c.lineWidth = 3;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(wx, sy);
        c.lineTo(wx + sway, sy - 34);
        c.moveTo(wx + sway * 0.6, sy - 20);
        c.lineTo(wx + sway - 12, sy - 30);
        c.moveTo(wx + sway * 0.8, sy - 26);
        c.lineTo(wx + sway + 12, sy - 38);
        c.stroke();
    }
    else if (r < 0.20 && (game.level.theme === 'cavern' || game.level.theme === 'arena')) { // bones
        c.strokeStyle = mixHex(th.decor, '#d8cfc0', 0.6);
        c.lineWidth = 2;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(wx - 6, sy - 2);
        c.lineTo(wx + 6, sy - 5);
        c.stroke();
        c.beginPath();
        c.arc(wx - 7, sy - 2, 2, 0, Math.PI * 2);
        c.arc(wx + 7, sy - 5, 2, 0, Math.PI * 2);
        c.stroke();
    }
    else if (r < 0.30) { // rock cluster
        c.fillStyle = mixHex(th.soilBot, '#000', 0.2);
        c.beginPath();
        c.ellipse(wx - 4, sy - 3, 6, 4, 0, 0, Math.PI * 2);
        c.ellipse(wx + 5, sy - 2, 4, 3, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,.06)';
        c.fillRect(wx - 7, sy - 6, 5, 1);
    }
    else if (r < 0.72) { // grass tufts
        c.strokeStyle = r2 < 0.5 ? th.grass : th.grassLo;
        c.lineWidth = 1.6;
        c.lineCap = 'round';
        for (let i = -2; i <= 2; i++) {
            c.beginPath();
            c.moveTo(wx + i * 3, sy);
            c.quadraticCurveTo(wx + i * 3 + sway, sy - 6, wx + i * 3 + sway * 1.5 + i, sy - 11 - Math.abs(i));
            c.stroke();
        }
    }
    c.restore();
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
        c.globalAlpha = game.world === 'day' ? 0.18 : 0.28;
        c.strokeStyle = game.world === 'day' ? '#ffe19a' : '#bfeeff';
        c.lineWidth = 2;
        c.lineCap = 'round';
        for (let i = 0; i < 8; i++) {
            // updraft: streams rise upward (y decreases over time)
            const y = sy + z.h - ((i * 40 + game.time * 150) % z.h);
            const wob = Math.sin(game.time * 2 + i) * 10;
            c.beginPath();
            c.moveTo(sx + 20 + wob, y);
            c.bezierCurveTo(sx + z.w * 0.35, y - 18, sx + z.w * 0.65, y - 34, sx + z.w - 18 + wob, y - 46);
            c.stroke();
            // little upward chevron at the head of each stream
            c.beginPath();
            c.moveTo(sx + z.w - 24 + wob, y - 40);
            c.lineTo(sx + z.w - 18 + wob, y - 48);
            c.lineTo(sx + z.w - 12 + wob, y - 40);
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
            glow(e.x - game.camera.x + e.w / 2, e.y - game.camera.y + e.h / 2, 84, e.glowColor(game), 0.8);
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
    g.addColorStop(1, 'rgba(0,0,0,.36)');
    c.fillStyle = g;
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
}
//# sourceMappingURL=background.js.map
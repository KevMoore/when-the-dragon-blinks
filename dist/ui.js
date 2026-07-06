// All HUD + menu/overlay rendering. Pure drawing driven by Game state;
// input handling lives in game.ts.
import { clamp, easeOutCubic } from './math.js';
import { LOGICAL_W, LOGICAL_H } from './types.js';
import { levels, codexEntries } from './content.js';
const GOLD = '#ffd777', MOON = '#a9d6ff', PAPER = '#fff1ca';
export function wrapText(c, text, x, y, maxW, lh) {
    const words = text.split(' ');
    let line = '', yy = y;
    for (const w of words) {
        const test = line + w + ' ';
        if (c.measureText(test).width > maxW && line) {
            c.fillText(line, x, yy);
            line = w + ' ';
            yy += lh;
        }
        else
            line = test;
    }
    if (line) {
        c.fillText(line, x, yy);
        yy += lh;
    }
    return yy;
}
function labelColor(label) {
    return label === 'Myth' ? GOLD : (label === 'Historical Note' || label === 'History') ? MOON : '#ffc0a0';
}
function panel(c, x, y, w, h, a = 0.9) {
    c.fillStyle = `rgba(18,8,20,${a})`;
    c.fillRect(x, y, w, h);
    c.strokeStyle = 'rgba(246,191,94,.5)';
    c.lineWidth = 2;
    c.strokeRect(x + .5, y + .5, w - 1, h - 1);
}
// ---- HUD -------------------------------------------------------------------
export function drawHUD(game, c) {
    const p = game.player;
    c.save();
    // health as lantern pips
    c.fillStyle = 'rgba(9,5,13,.5)';
    c.fillRect(18, 16, 190, 40);
    c.strokeStyle = 'rgba(246,191,94,.3)';
    c.strokeRect(18.5, 16.5, 190, 40);
    for (let i = 0; i < p.maxHp; i++) {
        const on = i < p.hp;
        const x = 40 + i * 32, y = 36;
        c.save();
        if (on) {
            c.shadowColor = '#ff8b44';
            c.shadowBlur = 10;
        }
        c.fillStyle = on ? '#ffb24a' : '#37222c';
        c.beginPath();
        c.moveTo(x, y - 9);
        c.lineTo(x + 8, y);
        c.lineTo(x, y + 10);
        c.lineTo(x - 8, y);
        c.closePath();
        c.fill();
        c.restore();
    }
    // dragon gauge (fills from torch embers) or active Zhulong timer
    const gx = 18, gy = 62, gw = 190, gh = 11;
    c.fillStyle = 'rgba(9,5,13,.5)';
    c.fillRect(gx, gy, gw, gh);
    c.strokeStyle = 'rgba(246,191,94,.3)';
    c.strokeRect(gx + .5, gy + .5, gw, gh);
    if (game.player.dragonTime > 0) {
        const frac = clamp(game.player.dragonTime / 12, 0, 1);
        const grad = c.createLinearGradient(gx, 0, gx + gw, 0);
        grad.addColorStop(0, '#ffd777');
        grad.addColorStop(1, '#ff7a2a');
        c.fillStyle = grad;
        c.fillRect(gx + 2, gy + 2, (gw - 4) * frac, gh - 4);
        c.fillStyle = '#fff1ca';
        c.font = 'bold 11px Georgia';
        c.textAlign = 'left';
        c.fillText('🐉 ZHULONG  ' + game.player.dragonTime.toFixed(1) + 's', gx + 5, gy - 3);
    }
    else {
        const full = game.dragonMeter >= 1;
        c.fillStyle = full ? '#ffd777' : '#b5762f';
        c.fillRect(gx + 2, gy + 2, (gw - 4) * game.dragonMeter, gh - 4);
        c.fillStyle = 'rgba(255,255,255,.6)';
        c.font = '10px Georgia';
        c.textAlign = 'left';
        c.fillText(full ? 'Dragon ready!' : 'Dragon Gauge — collect torch embers', gx + 4, gy - 3);
    }
    // Nova inner-energy bar (creeps up over the level; full → hold fire to burst)
    const ny = gy + gh + 4, nready = game.nova >= 1;
    c.fillStyle = 'rgba(9,5,13,.5)';
    c.fillRect(gx, ny, gw, 9);
    c.strokeStyle = 'rgba(150,195,255,.3)';
    c.strokeRect(gx + .5, ny + .5, gw, 9);
    const ng = c.createLinearGradient(gx, 0, gx + gw, 0);
    ng.addColorStop(0, '#7fb8ff');
    ng.addColorStop(1, nready ? '#eaf4ff' : '#3f86c8');
    c.fillStyle = ng;
    c.fillRect(gx + 2, ny + 2, (gw - 4) * game.nova, 5);
    if (nready) {
        c.save();
        c.globalAlpha = 0.35 + 0.35 * Math.sin(game.time * 6);
        c.fillStyle = '#eaf4ff';
        c.fillRect(gx + 2, ny + 2, gw - 4, 5);
        c.restore();
        c.textAlign = 'center';
        c.font = 'bold 8px Georgia';
        c.fillStyle = '#0a1420';
        c.fillText('✦ NOVA READY — HOLD FIRE', gx + gw / 2, ny + 8);
    }
    else {
        c.textAlign = 'left';
        c.font = '8px Georgia';
        c.fillStyle = 'rgba(200,220,255,.55)';
        c.fillText('✦ Inner Energy', gx + 4, ny + 8);
    }
    // day/night dial
    const dx = 250, dy = 36, day = game.dayAmount;
    c.fillStyle = 'rgba(9,5,13,.5)';
    c.fillRect(dx - 24, 16, 240, 40);
    c.strokeStyle = 'rgba(246,191,94,.3)';
    c.strokeRect(dx - 23.5, 16.5, 240, 40);
    c.save();
    c.translate(dx, dy);
    c.fillStyle = '#241428';
    c.beginPath();
    c.arc(0, 0, 14, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = day > 0.5 ? GOLD : MOON;
    c.shadowColor = day > 0.5 ? '#ffb83b' : '#8bd2ff';
    c.shadowBlur = 10;
    c.beginPath();
    c.arc(0, 0, 8 + Math.sin(game.time * 3) * 1, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.fillStyle = day > 0.5 ? GOLD : MOON;
    c.font = '17px Georgia';
    c.textAlign = 'left';
    c.fillText(day > 0.5 ? 'DAY · Eye Open' : 'NIGHT · Eye Closed', dx + 22, 33);
    c.fillStyle = 'rgba(255,255,255,.7)';
    c.font = '12px Georgia';
    c.fillText('E / C / Y  ·  blink the world', dx + 22, 50);
    // right panel: level, relics, score, hi, combo
    c.fillStyle = 'rgba(9,5,13,.66)';
    c.fillRect(LOGICAL_W - 214, 16, 196, 94);
    c.strokeStyle = 'rgba(246,191,94,.28)';
    c.strokeRect(LOGICAL_W - 213.5, 16.5, 195, 94);
    c.textAlign = 'right';
    c.fillStyle = PAPER;
    c.font = '15px Georgia';
    c.fillText(game.level.title.replace('Level ', 'L').replace('Boss: ', ''), LOGICAL_W - 24, 35);
    c.fillStyle = GOLD;
    c.font = '13px Georgia';
    c.fillText('◆ ' + game.save.relics.length + '/' + game.totalRelics() + ' relics', LOGICAL_W - 24, 53);
    c.fillStyle = PAPER;
    c.font = 'bold 22px Georgia';
    c.fillText(game.score.toLocaleString(), LOGICAL_W - 24, 82);
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.font = '11px Georgia';
    c.fillText('HI ' + game.save.highScore.toLocaleString(), LOGICAL_W - 24, 99);
    if (game.combo > 1) {
        c.textAlign = 'left';
        c.fillStyle = GOLD;
        c.font = 'bold 15px Georgia';
        c.fillText('×' + game.combo, LOGICAL_W - 208, 82);
        c.fillStyle = 'rgba(255,255,255,.5)';
        c.font = '10px Georgia';
        c.fillText('combo', LOGICAL_W - 208, 96);
    }
    // boss bar
    if (game.boss && game.boss.alive) {
        const bw = 520, bx = (LOGICAL_W - bw) / 2, by = 84;
        c.textAlign = 'center';
        c.fillStyle = PAPER;
        c.font = '15px Georgia';
        c.fillText(game.boss.vulnerable ? 'The eye is exposed — strike now!' : 'The Lantern Eater — blink to NIGHT and break its mask', LOGICAL_W / 2, by - 6);
        c.fillStyle = 'rgba(8,4,8,.72)';
        c.fillRect(bx, by, bw, 18);
        c.strokeStyle = '#f1b55a';
        c.strokeRect(bx + .5, by + .5, bw, 18);
        const frac = clamp(game.boss.hp / game.boss.maxHp, 0, 1);
        const grad = c.createLinearGradient(bx, 0, bx + bw, 0);
        grad.addColorStop(0, '#ff6a3a');
        grad.addColorStop(1, '#a62d2f');
        c.fillStyle = game.boss.vulnerable ? '#8bd2ff' : grad;
        c.fillRect(bx + 2, by + 2, (bw - 4) * frac, 14);
    }
    c.restore();
}
export function drawFloatingText(c, msg) {
    c.save();
    c.globalAlpha = clamp(1 - (msg.t - msg.max + 0.6) / 0.6, 0, 1) * clamp(msg.t / 0.2, 0, 1);
    c.textAlign = 'center';
    c.font = '20px Georgia';
    const w = Math.max(360, c.measureText(msg.text).width + 60);
    panel(c, LOGICAL_W / 2 - w / 2, 452, w, 40, 0.72);
    c.fillStyle = PAPER;
    c.fillText(msg.text, LOGICAL_W / 2, 478);
    c.restore();
}
// ---- Title -----------------------------------------------------------------
export function drawTitle(game, c) {
    c.save();
    c.textAlign = 'center';
    c.shadowColor = '#d94a3a';
    c.shadowBlur = 30;
    c.fillStyle = '#ffe3a0';
    c.font = '62px Georgia';
    const bob = Math.sin(game.time * 1.2) * 3;
    c.fillText('When the Dragon Blinks', LOGICAL_W / 2, 168 + bob);
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(255,255,255,.82)';
    c.font = '19px Georgia';
    c.fillText('A mythic platformer inspired by Zhulong, the Torch Dragon', LOGICAL_W / 2, 206);
    const opts = ['Begin Journey', 'Level Select', 'Myth & History', 'Settings', 'How to Play', 'Start Fresh'];
    const px = LOGICAL_W / 2 - 165, py = 244;
    panel(c, px, py, 330, 262, 0.72);
    opts.forEach((o, i) => {
        const y = py + 38 + i * 40;
        const sel = i === game.titleSelection;
        if (sel) {
            c.fillStyle = 'rgba(246,191,94,.14)';
            c.fillRect(px + 12, y - 24, 306, 34);
        }
        const fresh = i === 5;
        c.fillStyle = sel ? GOLD : fresh ? 'rgba(255,255,255,.62)' : PAPER;
        c.font = sel ? '24px Georgia' : fresh ? '17px Georgia' : '20px Georgia';
        c.fillText((sel ? '◆  ' : '') + o + (sel ? '  ◆' : '') + (fresh ? '  ⟲' : ''), LOGICAL_W / 2, y);
    });
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.font = '11px Georgia';
    c.fillText('↑/↓ or stick · Enter/A select · H codex · Start Fresh wipes progress', LOGICAL_W / 2, 520);
    c.restore();
}
// Once-only (re-viewable) onboarding: controls + the core blink tactic.
export function drawHowTo(game, c) {
    c.save();
    const touch = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    c.fillStyle = 'rgba(8,5,12,.74)';
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    const px = 66, py = 40, pw = LOGICAL_W - 132, ph = LOGICAL_H - 80;
    panel(c, px, py, pw, ph, 0.92);
    c.strokeStyle = 'rgba(246,191,94,.5)';
    c.lineWidth = 2;
    c.strokeRect(px + 7, py + 7, pw - 14, ph - 14);
    c.textAlign = 'center';
    // header
    c.shadowColor = '#d94a3a';
    c.shadowBlur = 26;
    c.fillStyle = '#ffe3a0';
    c.font = '38px Georgia';
    c.fillText('How to Play', LOGICAL_W / 2, py + 52);
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(255,255,255,.72)';
    c.font = 'italic 15px Georgia';
    c.fillText('Blink the Torch Dragon’s eye to command day and night', LOGICAL_W / 2, py + 78);
    // control rows with glowing gold badges
    const rows = touch
        ? [['✧', 'Move', 'Drag the dial — push further to run faster'],
            ['▲', 'Jump', 'Tap Jump · tap twice in the air for a double jump'],
            ['✦', 'Fire', 'Tap to loose dragon-light · hold to charge a blast'],
            ['☯', 'Blink', 'Switch Day ⟷ Night — your sharpest weapon']]
        : [['A D', 'Move', 'Move · A/D or ← → (a gamepad stick runs analog)'],
            ['␣', 'Jump', 'Space · tap twice in the air for a double jump'],
            ['J', 'Fire', 'J or X to loose dragon-light · hold to charge a blast'],
            ['E', 'Blink', 'E / C — switch Day ⟷ Night, your sharpest weapon']];
    const rx = px + 60, startY = py + 118, rh = 46;
    rows.forEach((r, i) => {
        const y = startY + i * rh;
        const g = c.createRadialGradient(rx, y, 2, rx, y, 20);
        g.addColorStop(0, '#ffe6a8');
        g.addColorStop(0.6, '#e0902f');
        g.addColorStop(1, '#5a2a10');
        c.fillStyle = g;
        c.beginPath();
        c.arc(rx, y, 19, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = 'rgba(255,220,150,.6)';
        c.lineWidth = 1.5;
        c.stroke();
        c.fillStyle = '#1a0a08';
        c.font = 'bold 17px Georgia';
        c.textAlign = 'center';
        c.fillText(r[0], rx, y + 6);
        c.textAlign = 'left';
        c.fillStyle = GOLD;
        c.font = 'bold 19px Georgia';
        c.fillText(r[1], rx + 34, y - 4);
        c.fillStyle = 'rgba(255,255,255,.82)';
        c.font = '14px Georgia';
        c.fillText(r[2], rx + 34, y + 15);
    });
    // the core tactic band: the two hosts
    const by = startY + rows.length * rh + 6, bx = px + 26, bw = pw - 52, bh = 68;
    c.fillStyle = 'rgba(246,191,94,.08)';
    c.strokeStyle = 'rgba(246,191,94,.32)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.roundRect(bx, by, bw, bh, 12);
    c.fill();
    c.stroke();
    c.textAlign = 'left';
    c.fillStyle = '#ffd777';
    c.shadowColor = '#ffbe57';
    c.shadowBlur = 12;
    c.font = '22px Georgia';
    c.fillText('☀', bx + 20, by + 42);
    c.fillStyle = '#a9d6ff';
    c.shadowColor = '#8bd2ff';
    c.fillText('☾', bx + 50, by + 42);
    c.shadowBlur = 0;
    c.fillStyle = PAPER;
    c.font = 'bold 15px Georgia';
    c.fillText('The Two Hosts', bx + 84, by + 26);
    c.fillStyle = 'rgba(255,255,255,.8)';
    c.font = '13px Georgia';
    c.fillText('Sun-creatures wake by day, shadow-creatures by night. Blink to lull whichever hunts', bx + 84, by + 45);
    c.fillText('you — asleep, they are harmless. Gather torch-gems, become the dragon, and break the boss.', bx + 84, by + 61);
    // footer prompt (pulsing)
    const pulse = 0.55 + 0.45 * Math.sin(game.time * 3);
    c.textAlign = 'center';
    c.globalAlpha = pulse;
    c.fillStyle = GOLD;
    c.font = '19px Georgia';
    c.fillText(touch ? 'Tap to begin' : 'Press Enter / Space to begin', LOGICAL_W / 2, py + ph - 22);
    c.globalAlpha = 1;
    c.restore();
}
// ---- Level select ----------------------------------------------------------
const ACT_NAMES = ['I · Foothills of Zhong', 'II · The Blinking Bridges', 'III · The Breath Caverns', 'IV · The Sunless March'];
const ACT_COL = ['#c8863a', '#7fa0d8', '#6fc0a0', '#c85a4a'];
export function drawLevelSelect(game, c) {
    c.save();
    c.textAlign = 'center';
    c.fillStyle = '#ffe3a0';
    c.font = '36px Georgia';
    c.fillText('The Road to Mount Zhong', LOGICAL_W / 2, 60);
    const vis = game.visibleLevels();
    const cols = 8, cardW = 104, gap = 8, rowH = 82, cardH = 72;
    const startX = (LOGICAL_W - (cols * cardW + (cols - 1) * gap)) / 2, startY = 104;
    vis.forEach((li, i) => {
        const lvl = levels[li];
        const x = startX + (i % cols) * (cardW + gap), y = startY + Math.floor(i / cols) * rowH;
        const sel = i === game.levelSelection, playable = game.levelPlayable(li), done = game.save.completed.includes(lvl.id);
        const act = ((lvl.act || 1) - 1);
        c.fillStyle = playable ? 'rgba(20,9,22,.82)' : 'rgba(18,18,22,.5)';
        c.fillRect(x, y, cardW, cardH);
        c.strokeStyle = sel ? GOLD : playable ? ACT_COL[act] + 'aa' : 'rgba(120,120,120,.3)';
        c.lineWidth = sel ? 3 : 1.5;
        c.strokeRect(x + .5, y + .5, cardW, cardH);
        c.textAlign = 'center';
        if (!playable) {
            c.fillStyle = '#5a5560';
            c.font = '26px Georgia';
            c.fillText('⌧', x + cardW / 2, y + 44);
        }
        else {
            c.fillStyle = lvl.hidden ? '#ffd777' : done ? '#7bd06a' : PAPER;
            c.font = 'bold 22px Georgia';
            c.fillText(lvl.hidden ? '★' : String(li + 1), x + cardW / 2, y + 28);
            c.fillStyle = 'rgba(255,255,255,.72)';
            c.font = '9px Georgia';
            const nm = lvl.title.replace(/^Level \d+: /, '').replace('Hidden: ', '');
            c.fillText(nm.length > 17 ? nm.slice(0, 16) + '…' : nm, x + cardW / 2, y + 48);
            c.font = '9px Georgia';
            if (lvl.isBoss) {
                c.fillStyle = '#ff6a4a';
                c.fillText('◆ BOSS', x + cardW / 2, y + 64);
            }
            else if (done) {
                c.fillStyle = '#7bd06a';
                c.fillText('✓ restored', x + cardW / 2, y + 64);
            }
        }
    });
    // selected level detail + act label
    const sli = vis[game.levelSelection];
    if (sli !== undefined) {
        const lvl = levels[sli];
        c.textAlign = 'center';
        c.fillStyle = ACT_COL[(lvl.act || 1) - 1];
        c.font = 'bold 15px Georgia';
        c.fillText('Act ' + ACT_NAMES[(lvl.act || 1) - 1], LOGICAL_W / 2, 452);
        c.fillStyle = PAPER;
        c.font = '17px Georgia';
        c.fillText(lvl.title.replace(/^Level \d+: /, ''), LOGICAL_W / 2, 476);
        c.fillStyle = 'rgba(255,255,255,.72)';
        c.font = 'italic 13px Georgia';
        c.fillText(lvl.subtitle, LOGICAL_W / 2, 496);
    }
    c.fillStyle = 'rgba(255,255,255,.5)';
    c.font = '12px Georgia';
    c.fillText('↑↓←→ or stick · Enter/tap start · Esc back', LOGICAL_W / 2, 522);
    c.restore();
}
// ---- Codex -----------------------------------------------------------------
export function drawCodex(game, c) {
    c.save();
    panel(c, 60, 44, LOGICAL_W - 120, LOGICAL_H - 92, 0.78);
    c.fillStyle = '#ffe3a0';
    c.font = '40px Georgia';
    c.textAlign = 'center';
    c.fillText('Myth & History', LOGICAL_W / 2, 90);
    c.font = '13px Georgia';
    c.fillStyle = 'rgba(255,255,255,.66)';
    wrapText(c, 'This game is inspired by traditional accounts of Zhulong. It is not a literal scholarly reconstruction. Mythological details vary across sources, translations, and retellings.', LOGICAL_W / 2 - 300, 112, 600, 17);
    const leftX = 92, top = 168;
    codexEntries.forEach((e, i) => {
        const unlocked = game.save.codex.includes(e.id), sel = i === game.codexSelection;
        if (sel) {
            c.fillStyle = 'rgba(246,191,94,.15)';
            c.fillRect(leftX - 10, top + i * 36 - 22, 300, 30);
        }
        c.fillStyle = unlocked ? (sel ? GOLD : PAPER) : '#777';
        c.font = '17px Georgia';
        c.textAlign = 'left';
        c.fillText((unlocked ? '◇ ' : '🔒 ') + e.title, leftX, top + i * 36);
    });
    const entry = codexEntries[game.codexSelection];
    const unlocked = game.save.codex.includes(entry.id);
    c.strokeStyle = 'rgba(246,191,94,.24)';
    c.strokeRect(430.5, 160.5, LOGICAL_W - 500, 300);
    c.fillStyle = unlocked ? '#ffe3a0' : '#999';
    c.font = '26px Georgia';
    c.textAlign = 'left';
    c.fillText(entry.title, 456, 200);
    c.fillStyle = unlocked ? PAPER : '#aaa';
    c.font = '18px Georgia';
    wrapText(c, unlocked ? entry.body : 'Locked — ' + entry.unlockHint + '.', 456, 238, LOGICAL_W - 540, 26);
    c.fillStyle = 'rgba(255,255,255,.64)';
    c.font = '15px Georgia';
    c.textAlign = 'center';
    c.fillText('↑/↓ choose · Esc back', LOGICAL_W / 2, LOGICAL_H - 66);
    c.restore();
}
// ---- Settings --------------------------------------------------------------
export function drawSettings(game, c) {
    c.save();
    panel(c, LOGICAL_W / 2 - 260, 110, 520, 320, 0.82);
    c.textAlign = 'center';
    c.fillStyle = '#ffe3a0';
    c.font = '38px Georgia';
    c.fillText('Settings', LOGICAL_W / 2, 168);
    const s = game.save.settings;
    const rows = [
        { label: 'Master Volume', value: Math.round(s.master * 100) + '%', bar: s.master },
        { label: 'Music', value: s.music ? 'On' : 'Off' },
        { label: 'Screen Shake', value: s.shake ? 'On' : 'Off' },
        { label: 'Reduced Motion', value: s.reducedMotion ? 'On' : 'Off' },
        { label: 'Back', value: '' },
    ];
    rows.forEach((r, i) => {
        const y = 220 + i * 42;
        const sel = i === game.settingsSelection;
        if (sel) {
            c.fillStyle = 'rgba(246,191,94,.14)';
            c.fillRect(LOGICAL_W / 2 - 230, y - 24, 460, 34);
        }
        c.textAlign = 'left';
        c.fillStyle = sel ? GOLD : PAPER;
        c.font = '20px Georgia';
        c.fillText((sel ? '▸ ' : '  ') + r.label, LOGICAL_W / 2 - 214, y);
        c.textAlign = 'right';
        if (r.bar !== undefined) {
            const bx = LOGICAL_W / 2 + 70, bw = 130;
            c.fillStyle = 'rgba(255,255,255,.15)';
            c.fillRect(bx, y - 12, bw, 10);
            c.fillStyle = GOLD;
            c.fillRect(bx, y - 12, bw * r.bar, 10);
        }
        else if (r.value) {
            c.fillStyle = r.value === 'On' ? '#7bd06a' : PAPER;
            c.fillText(r.value, LOGICAL_W / 2 + 200, y);
        }
    });
    c.textAlign = 'center';
    c.fillStyle = 'rgba(255,255,255,.64)';
    c.font = '14px Georgia';
    c.fillText('↑/↓ choose · ←/→ or Enter adjust · Esc back', LOGICAL_W / 2, 414);
    c.restore();
}
// ---- Lore panel ------------------------------------------------------------
export function drawLore(game, c) {
    if (!game.lorePanel)
        return;
    const app = easeOutCubic(clamp(game.loreAnim, 0, 1));
    c.save();
    c.fillStyle = `rgba(4,2,7,${0.66 * app})`;
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    const w = 660, h = 380, x = (LOGICAL_W - w) / 2, y = (LOGICAL_H - h) / 2 - 6 + (1 - app) * 24;
    c.globalAlpha = app;
    panel(c, x, y, w, h, 0.94);
    c.textAlign = 'center';
    c.fillStyle = '#ffe3a0';
    c.font = '32px Georgia';
    c.fillText(game.lorePanel.title, LOGICAL_W / 2, y + 50);
    let yy = y + 98;
    c.textAlign = 'left';
    for (const sec of game.lorePanel.sections) {
        c.fillStyle = labelColor(sec.label);
        c.font = 'bold 18px Georgia';
        c.fillText(sec.label, x + 44, yy);
        c.fillStyle = PAPER;
        c.font = '20px Georgia';
        yy = wrapText(c, sec.text, x + 44, yy + 28, w - 88, 27) + 20;
    }
    c.textAlign = 'center';
    c.fillStyle = 'rgba(255,255,255,.62)';
    c.font = '16px Georgia';
    c.fillText('Enter / A / tap to continue', LOGICAL_W / 2, y + h - 26);
    c.restore();
    c.globalAlpha = 1;
}
// ---- Pause -----------------------------------------------------------------
export function drawPause(game, c) {
    c.save();
    c.fillStyle = 'rgba(4,2,7,.62)';
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    panel(c, LOGICAL_W / 2 - 165, 150, 330, 240);
    c.textAlign = 'center';
    c.fillStyle = '#ffe3a0';
    c.font = '40px Georgia';
    c.fillText('Paused', LOGICAL_W / 2, 206);
    const opts = ['Resume', 'Restart Level', 'Settings', 'Return to Title'];
    opts.forEach((o, i) => {
        const y = 250 + i * 34;
        const sel = i === game.pauseSelection;
        c.fillStyle = sel ? GOLD : PAPER;
        c.font = sel ? '22px Georgia' : '19px Georgia';
        c.fillText((sel ? '▸ ' : '') + o, LOGICAL_W / 2, y);
    });
    c.restore();
}
// ---- Completion screens ----------------------------------------------------
export function drawLevelComplete(game, c) {
    c.save();
    c.fillStyle = 'rgba(4,2,7,.68)';
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    c.textAlign = 'center';
    c.fillStyle = '#ffe3a0';
    c.font = '46px Georgia';
    c.fillText('Shrine Path Restored', LOGICAL_W / 2, 190);
    c.fillStyle = PAPER;
    c.font = '20px Georgia';
    c.fillText('A new Myth & History entry has been unlocked.', LOGICAL_W / 2, 238);
    const t = game.lastLevelTime;
    if (t > 0) {
        c.fillStyle = GOLD;
        c.font = '18px Georgia';
        c.fillText('Time  ' + t.toFixed(1) + 's' + (game.lastWasBest ? '   ★ new best' : ''), LOGICAL_W / 2, 272);
    }
    c.fillStyle = PAPER;
    c.font = '19px Georgia';
    c.fillText('Score  ' + game.score.toLocaleString() + '   (+' + game.lastLevelBonus.toLocaleString() + ' time bonus)', LOGICAL_W / 2, 302);
    c.fillStyle = 'rgba(255,255,255,.85)';
    c.font = '17px Georgia';
    c.fillText('Enter / tap: continue · Esc: title', LOGICAL_W / 2, 338);
    c.restore();
}
export function drawGameComplete(game, c) {
    c.save();
    c.fillStyle = 'rgba(4,2,7,.74)';
    c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    c.textAlign = 'center';
    c.fillStyle = '#ffe3a0';
    c.font = '48px Georgia';
    c.fillText('The Dragon Blinks Again', LOGICAL_W / 2, 104);
    panel(c, 168, 138, LOGICAL_W - 336, 268, 0.88);
    c.textAlign = 'left';
    let yy = 184;
    c.font = '18px Georgia';
    yy = labelled(c, 'Myth', 'Zhulong is remembered as a vast dragon associated with cosmic light, darkness, and natural cycles.', 208, yy, LOGICAL_W - 416);
    yy = labelled(c, 'History', 'Accounts appear in old Chinese mythological and geographical traditions. Details vary across texts, translations, and retellings.', 208, yy + 14, LOGICAL_W - 416);
    yy = labelled(c, 'Game Inspiration', 'The Day/Night mechanic adapts the eye motif. The shrine runner and Lantern Eater are original inventions created for the game.', 208, yy + 14, LOGICAL_W - 416);
    const opts = ['Myth & History', 'Replay Levels', 'Return to Title'];
    c.textAlign = 'center';
    opts.forEach((o, i) => {
        const sel = i === game.completeSelection;
        c.fillStyle = sel ? GOLD : PAPER;
        c.font = sel ? '20px Georgia' : '17px Georgia';
        c.fillText((sel ? '▸ ' : '') + o, LOGICAL_W / 2 - 220 + i * 220, 436);
    });
    c.restore();
}
function labelled(c, label, text, x, y, w) {
    c.fillStyle = labelColor(label);
    c.font = 'bold 18px Georgia';
    c.textAlign = 'left';
    c.fillText(label, x, y);
    c.fillStyle = PAPER;
    c.font = '17px Georgia';
    return wrapText(c, text, x, y + 24, w, 23);
}
// ---- Debug overlay ---------------------------------------------------------
export function drawDebug(game, c) {
    c.save();
    c.strokeStyle = '#00ff99';
    c.lineWidth = 1;
    const p = game.player.rect();
    c.strokeRect(p.x - game.camera.x, p.y - game.camera.y, p.w, p.h);
    c.strokeStyle = '#00ff99';
    for (const s of game.solidsForRect({ x: game.camera.x, y: game.camera.y, w: LOGICAL_W, h: LOGICAL_H })) {
        c.strokeStyle = s.oneWay ? '#3af' : '#00ff99';
        c.strokeRect(s.x - game.camera.x, s.y - game.camera.y, s.w, s.h);
    }
    c.fillStyle = '#00ff99';
    c.font = '12px monospace';
    c.textAlign = 'left';
    c.fillText(`vx ${game.player.vx.toFixed(0)} vy ${game.player.vy.toFixed(0)} grounded ${game.player.grounded} wall ${game.player.wallDir}`, 20, LOGICAL_H - 20);
    c.restore();
}
//# sourceMappingURL=ui.js.map
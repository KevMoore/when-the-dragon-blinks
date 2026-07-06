// Secret end-of-level mini-game: 古琴 (Guqin) melody, piano-tiles style.
// Falling jade tiles arrive at a hit-line on the beat; tap the lane in time to
// pluck the note. Accuracy + combo award bonus torch-embers. On-theme with the
// Torch Dragon myth — you play a hidden pentatonic phrase to earn the reward.
import { LOGICAL_W, LOGICAL_H } from './types.js';
import type { Game } from './game.js';

// Chinese pentatonic strings low→high (宫 商 角 徵 → C E G C'), one per lane.
const LANE_FREQ = [261.63, 329.63, 392.0, 523.25];
const LANE_GLYPH = ['宮', '角', '徵', '清'];
const LANE_KEY = ['a', 's', 'd', 'f'];
const LANE_COL = ['#ff6a4a', '#ffb24a', '#7ad0c0', '#b07aff'];

type Tile = { lane: number; y: number; hit: boolean; missed: boolean; fx: number };

export class GuqinGame {
  private tiles: Tile[] = [];
  private melody: { lane: number; beat: number }[] = [];
  private bpm = 90;
  private t = 0;
  private spawnIdx = 0;
  hits = 0; misses = 0; combo = 0; maxCombo = 0;
  done = false; finishT = 0; bonus = 0;
  private hitFlash = [0, 0, 0, 0];
  private fall = 1.75;

  constructor(private game: Game) {
    // a gentle pentatonic phrase (lane indices on an eighth-note grid)
    const seq = [0, 1, 2, 3, 2, 1, 0, 0, 2, 1, 0, 2, 3, 2, 1, 0, 1, 2, 3, 3, 2, 1, 2, 0, 1, 0, 2, 3, 2, 1, 0];
    this.melody = seq.map((lane, i) => ({ lane, beat: 2 + i * 0.5 }));
  }

  private get beatDur() { return 60 / this.bpm; }
  private get hitY() { return LOGICAL_H - 132; }
  private get laneW() { return 92; }
  private laneX(l: number) { const total = 4 * this.laneW + 3 * 16; return (LOGICAL_W - total) / 2 + l * (this.laneW + 16); }
  get total() { return this.melody.length; }

  update(dt: number) {
    const input = this.game.input;
    if (this.done) {
      this.finishT += dt;
      for (const tile of this.tiles) tile.fx += dt;
      if (this.finishT > 0.7 && (input.just('confirm') || input.pointer?.clicked)) this.game.finishGuqin();
      return;
    }
    this.t += dt;
    for (let i = 0; i < 4; i++) this.hitFlash[i] = Math.max(0, this.hitFlash[i] - dt * 4);
    const topY = -46, speed = (this.hitY - topY) / this.fall;
    // spawn tiles so each arrives at the hit-line on its beat
    while (this.spawnIdx < this.melody.length) {
      const note = this.melody[this.spawnIdx], arriveT = note.beat * this.beatDur;
      if (this.t >= arriveT - this.fall) { this.tiles.push({ lane: note.lane, y: topY, hit: false, missed: false, fx: 0 }); this.spawnIdx++; }
      else break;
    }
    for (const tile of this.tiles) {
      if (tile.hit) { tile.fx += dt; continue; }
      tile.y += speed * dt;
      if (!tile.missed && tile.y > this.hitY + 48) { tile.missed = true; this.misses++; this.combo = 0; }
    }
    for (let l = 0; l < 4; l++) if (this.laneTriggered(l)) this.strike(l);
    if (this.spawnIdx >= this.melody.length && this.tiles.every(t => t.hit || t.missed)) this.finish();
  }

  private laneTriggered(l: number): boolean {
    const input = this.game.input;
    if (input.pressed.has(LANE_KEY[l])) return true;
    const p = input.pointer;
    if (p && p.clicked) { const x = this.laneX(l); if (p.x >= x && p.x <= x + this.laneW && p.y > this.hitY - 260) return true; }
    return false;
  }

  private strike(l: number) {
    this.hitFlash[l] = 1;
    let best: Tile | null = null, bestD = 999;
    for (const tile of this.tiles) { if (tile.lane !== l || tile.hit || tile.missed) continue; const d = Math.abs(tile.y - this.hitY); if (d < bestD) { bestD = d; best = tile; } }
    if (best && bestD < 58) {
      best.hit = true; best.fx = 0; this.hits++; this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.game.audio.pluck(LANE_FREQ[l]);
      this.game.particles.sparks(this.laneX(l) + this.laneW / 2, this.hitY, 12, '#ffe6a0');
    } else {
      this.game.audio.pluck(LANE_FREQ[l] * 0.5, 0.18); this.combo = 0;   // dull thunk on a mistap
    }
  }

  private finish() {
    if (this.done) return;
    this.done = true; this.finishT = 0;
    this.bonus = this.hits * 150 + this.maxCombo * 60;
    this.game.score += this.bonus;
    if (this.game.score > this.game.save.highScore) this.game.save.highScore = this.game.score;
    this.game.audio.sfx('victory');
  }

  draw(c: CanvasRenderingContext2D) {
    // dim backdrop
    c.fillStyle = 'rgba(10,5,12,0.82)'; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    // title
    c.textAlign = 'center';
    c.fillStyle = '#ffd777'; c.font = 'bold 30px Georgia';
    c.fillText('古琴 · The Hidden Melody', LOGICAL_W / 2, 52);
    c.fillStyle = 'rgba(255,240,200,.7)'; c.font = '13px Georgia';
    c.fillText('Tap the strings in time — A S D F or tap the lanes', LOGICAL_W / 2, 74);

    const hitY = this.hitY;
    // lanes
    for (let l = 0; l < 4; l++) {
      const x = this.laneX(l), w = this.laneW;
      c.fillStyle = l % 2 === 0 ? 'rgba(255,255,255,.03)' : 'rgba(255,255,255,.05)';
      c.fillRect(x, 84, w, hitY - 84 + 60);
      c.strokeStyle = 'rgba(255,215,140,.14)'; c.lineWidth = 1; c.strokeRect(x + .5, 84.5, w, hitY - 84 + 60);
      // string line
      c.strokeStyle = `rgba(255,230,180,${0.2 + this.hitFlash[l] * 0.6})`; c.lineWidth = 1 + this.hitFlash[l] * 2;
      c.beginPath(); c.moveTo(x + w / 2, 84); c.lineTo(x + w / 2, hitY + 40); c.stroke();
    }
    // hit-line
    c.save(); c.globalCompositeOperation = 'lighter';
    c.strokeStyle = 'rgba(255,200,110,.5)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(this.laneX(0) - 6, hitY); c.lineTo(this.laneX(3) + this.laneW + 6, hitY); c.stroke();
    c.restore();
    // lane pads + glyphs at the hit-line
    for (let l = 0; l < 4; l++) {
      const x = this.laneX(l), w = this.laneW, fl = this.hitFlash[l];
      c.fillStyle = `rgba(${l === 0 ? '255,106,74' : l === 1 ? '255,178,74' : l === 2 ? '122,208,192' : '176,122,255'},${0.16 + fl * 0.5})`;
      roundRect(c, x + 6, hitY - 6, w - 12, 40, 8); c.fill();
      c.fillStyle = `rgba(255,245,220,${0.5 + fl * 0.5})`; c.font = 'bold 22px Georgia'; c.textAlign = 'center';
      c.fillText(LANE_GLYPH[l], x + w / 2, hitY + 22);
    }
    // tiles
    for (const tile of this.tiles) {
      const x = this.laneX(tile.lane), w = this.laneW;
      if (tile.hit) {
        const a = Math.max(0, 1 - tile.fx * 3);
        if (a <= 0) continue;
        c.globalAlpha = a; c.fillStyle = '#fff2c8';
        roundRect(c, x + 8 - tile.fx * 20, hitY - 8 - tile.fx * 30, w - 16 + tile.fx * 40, 44 + tile.fx * 30, 10); c.fill();
        c.globalAlpha = 1; continue;
      }
      if (tile.missed) continue;
      c.save();
      c.shadowColor = LANE_COL[tile.lane]; c.shadowBlur = 14;
      const grad = c.createLinearGradient(0, tile.y, 0, tile.y + 44);
      grad.addColorStop(0, LANE_COL[tile.lane]); grad.addColorStop(1, mix(LANE_COL[tile.lane]));
      c.fillStyle = grad; roundRect(c, x + 8, tile.y, w - 16, 42, 10); c.fill();
      c.shadowBlur = 0; c.fillStyle = 'rgba(255,255,255,.22)'; roundRect(c, x + 12, tile.y + 4, w - 24, 10, 5); c.fill();
      c.restore();
    }
    c.globalAlpha = 1;

    // HUD: combo + score
    c.textAlign = 'left'; c.fillStyle = 'rgba(255,240,200,.85)'; c.font = 'bold 16px Georgia';
    c.fillText(`Combo ${this.combo}`, 30, 110);
    c.fillStyle = 'rgba(200,230,255,.7)'; c.font = '13px Georgia';
    c.fillText(`Hit ${this.hits}  ·  Miss ${this.misses}`, 30, 130);

    if (this.done) {
      c.fillStyle = 'rgba(8,4,10,0.7)'; c.fillRect(0, LOGICAL_H / 2 - 90, LOGICAL_W, 180);
      c.textAlign = 'center';
      const acc = Math.round(100 * this.hits / Math.max(1, this.hits + this.misses));
      const rank = acc >= 95 ? '完美 · Flawless' : acc >= 75 ? '妙 · Sublime' : acc >= 50 ? '好 · Fair' : '練 · Keep practising';
      c.fillStyle = '#ffd777'; c.font = 'bold 34px Georgia'; c.fillText(rank, LOGICAL_W / 2, LOGICAL_H / 2 - 30);
      c.fillStyle = '#fff2c8'; c.font = '18px Georgia';
      c.fillText(`Accuracy ${acc}%   ·   Best combo ${this.maxCombo}`, LOGICAL_W / 2, LOGICAL_H / 2 + 4);
      c.fillStyle = '#ffb24a'; c.font = 'bold 22px Georgia';
      c.fillText(`+${this.bonus} bonus`, LOGICAL_W / 2, LOGICAL_H / 2 + 40);
      if (this.finishT > 0.7) { c.fillStyle = `rgba(255,240,200,${0.5 + 0.4 * Math.sin(this.finishT * 4)})`; c.font = '14px Georgia'; c.fillText('Press to continue', LOGICAL_W / 2, LOGICAL_H / 2 + 72); }
    }
    c.textAlign = 'left';
  }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function mix(hex: string) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgb(${Math.round(r * 0.45)},${Math.round(g * 0.45)},${Math.round(b * 0.45)})`;
}

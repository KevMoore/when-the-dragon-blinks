// Secret end-of-level mini-game #3: 燈 "Lantern Rite" — a memory game.
// A sequence of paper lanterns lights up; repeat it back by tapping them. Each
// round adds one lantern. On-theme with the torch/lantern motif; every lantern
// sounds a guqin note so a correct run also plays a little melody.
import { LOGICAL_W, LOGICAL_H } from './types.js';
import type { Game } from './game.js';

const N = 5;
const FREQ = [261.63, 293.66, 329.63, 392.0, 523.25];
const HUE = ['#ff6a4a', '#ffb24a', '#ffe07a', '#7ad0c0', '#b07aff'];

export class LanternGame {
  private seq: number[] = [];
  round = 0; private maxRounds = 5;
  private phase: 'show' | 'input' | 'good' | 'wrong' | 'done' = 'show';
  private showStep = -1; private timer = 0.6; private inputIdx = 0;
  private lit = [0, 0, 0, 0, 0];
  hits = 0; bonus = 0; finishT = 0;

  constructor(private game: Game) { this.nextRound(); }

  private lanternX(i: number) { return LOGICAL_W / 2 + (i - (N - 1) / 2) * 150; }
  private lanternY() { return LOGICAL_H / 2 - 10; }
  private get lr() { return 40; }

  private nextRound() {
    this.round++;
    this.seq.push(Math.floor(Math.random() * N));
    this.phase = 'show'; this.showStep = -1; this.timer = 0.7; this.inputIdx = 0;
  }

  update(dt: number) {
    const input = this.game.input;
    for (let i = 0; i < N; i++) this.lit[i] = Math.max(0, this.lit[i] - dt * 3.2);

    if (this.phase === 'done') { this.finishT += dt; if (this.finishT > 0.7 && (input.just('confirm') || input.pointer?.clicked)) this.game.finishLantern(); return; }

    if (this.phase === 'show') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.showStep++;
        if (this.showStep >= this.seq.length) { this.phase = 'input'; }
        else { const l = this.seq[this.showStep]; this.lit[l] = 1; this.game.audio.pluck(FREQ[l]); this.timer = 0.62; }
      }
      return;
    }
    if (this.phase === 'good' || this.phase === 'wrong') {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.phase === 'wrong') this.finish();
        else if (this.round >= this.maxRounds) this.finish();
        else this.nextRound();
      }
      return;
    }
    // input phase — tap the lanterns in order
    if (this.phase === 'input') {
      const l = this.tappedLantern();
      if (l >= 0) {
        this.lit[l] = 1;
        if (l === this.seq[this.inputIdx]) {
          this.game.audio.pluck(FREQ[l]); this.inputIdx++;
          if (this.inputIdx >= this.seq.length) {   // round cleared
            this.hits++; const pts = this.round * 150; this.bonus += pts; this.game.score += pts;
            this.game.particles.sparks(LOGICAL_W / 2, this.lanternY(), 18, '#ffd777');
            this.phase = 'good'; this.timer = 0.6;
          }
        } else { this.game.audio.pluck(150, 0.2); this.game.audio.sfx('hurt'); this.phase = 'wrong'; this.timer = 0.9; }
      }
    }
  }

  private tappedLantern(): number {
    const input = this.game.input, keys = ['a', 's', 'd', 'f', 'g'];
    for (let i = 0; i < N; i++) if (input.pressed.has(keys[i])) return i;
    const p = input.pointer;
    if (p && p.clicked) for (let i = 0; i < N; i++) { const dx = p.x - this.lanternX(i), dy = p.y - this.lanternY(); if (dx * dx + dy * dy < (this.lr + 14) ** 2) return i; }
    return -1;
  }

  private finish() {
    if (this.game.score > this.game.save.highScore) this.game.save.highScore = this.game.score;
    this.phase = 'done'; this.finishT = 0; this.game.audio.sfx('victory');
  }

  draw(c: CanvasRenderingContext2D) {
    c.fillStyle = 'rgba(10,5,12,0.82)'; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    c.textAlign = 'center';
    c.fillStyle = '#ffd777'; c.font = 'bold 30px Georgia'; c.fillText('燈 · The Lantern Rite', LOGICAL_W / 2, 52);
    c.fillStyle = 'rgba(255,240,200,.7)'; c.font = '13px Georgia';
    const prompt = this.phase === 'show' ? 'Watch the lanterns…' : this.phase === 'input' ? 'Now repeat — tap them in order (A S D F G)' : this.phase === 'wrong' ? 'Broken sequence…' : '';
    c.fillText(prompt, LOGICAL_W / 2, 74);

    const ly = this.lanternY();
    for (let i = 0; i < N; i++) {
      const x = this.lanternX(i), lit = this.lit[i];
      // string
      c.strokeStyle = 'rgba(180,140,90,.4)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, ly - this.lr - 40); c.lineTo(x, ly - this.lr); c.stroke();
      // glow
      if (lit > 0.02) {
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = lit * 0.8;
        const g = c.createRadialGradient(x, ly, 0, x, ly, this.lr * 2.2);
        g.addColorStop(0, HUE[i]); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.beginPath(); c.arc(x, ly, this.lr * 2.2, 0, Math.PI * 2); c.fill(); c.restore();
      }
      // lantern body
      c.save(); c.globalAlpha = 0.4 + lit * 0.6;
      const bg = c.createLinearGradient(x, ly - this.lr, x, ly + this.lr);
      bg.addColorStop(0, HUE[i]); bg.addColorStop(1, mixDark(HUE[i]));
      c.fillStyle = bg; c.strokeStyle = 'rgba(30,12,10,.7)'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(x, ly, this.lr * 0.8, this.lr, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = 'rgba(30,12,10,.8)'; c.fillRect(x - this.lr * 0.5, ly - this.lr - 5, this.lr, 5); c.fillRect(x - this.lr * 0.5, ly + this.lr, this.lr, 5);
      // tassel
      c.strokeStyle = '#c8302a'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, ly + this.lr + 5); c.lineTo(x, ly + this.lr + 18); c.stroke();
      c.restore();
    }

    c.fillStyle = 'rgba(255,240,200,.85)'; c.font = 'bold 15px Georgia'; c.textAlign = 'left';
    c.fillText(`Round ${Math.min(this.round, this.maxRounds)} / ${this.maxRounds}`, 30, 110);
    c.fillStyle = 'rgba(255,215,140,.8)'; c.fillText(`Bonus ${this.bonus}`, 30, 132);

    if (this.phase === 'done') {
      c.fillStyle = 'rgba(8,4,10,0.7)'; c.fillRect(0, LOGICAL_H / 2 + 70, LOGICAL_W, 130);
      c.textAlign = 'center'; c.fillStyle = '#ffd777'; c.font = 'bold 30px Georgia';
      c.fillText(`${this.hits} rite${this.hits === 1 ? '' : 's'} kept`, LOGICAL_W / 2, LOGICAL_H / 2 + 112);
      c.fillStyle = '#ffb24a'; c.font = 'bold 22px Georgia'; c.fillText(`+${this.bonus} bonus`, LOGICAL_W / 2, LOGICAL_H / 2 + 146);
      if (this.finishT > 0.7) { c.fillStyle = `rgba(255,240,200,${0.5 + 0.4 * Math.sin(this.finishT * 4)})`; c.font = '14px Georgia'; c.fillText('Press to continue', LOGICAL_W / 2, LOGICAL_H / 2 + 174); }
    }
    c.textAlign = 'left';
  }
}

function mixDark(hex: string) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgb(${Math.round(r * 0.4)},${Math.round(g * 0.4)},${Math.round(b * 0.4)})`;
}

// Secret end-of-level mini-game #2: 黎明 "Catch the Dawn".
// A marker sweeps across the day–night arc; tap to blink when it sits in the
// golden dawn window. On-theme with the core mechanic — Zhulong's eye opening is
// the coming of day. Nail the centre across several rounds for bonus embers.
import { LOGICAL_W, LOGICAL_H } from './types.js';
import type { Game } from './game.js';

export class DawnGame {
  private rounds = 4;
  round = 0;
  private pos = 0; private dir = 1; private speed = 0.85;
  private stopped = false; private stopT = 0; private lastQuality = 0;
  hits = 0; bonus = 0;
  done = false; finishT = 0;
  private eyeOpen = 0;

  constructor(private game: Game) { this.beginRound(); }

  private get halfWin() { return 0.15 - this.round * 0.022; }   // dawn window shrinks each round

  private beginRound() {
    this.pos = 0; this.dir = 1; this.stopped = false; this.stopT = 0;
    this.speed = 0.8 + this.round * 0.32;
  }

  update(dt: number) {
    const input = this.game.input;
    // smooth the eye toward how close the marker is to dawn-centre
    const near = 1 - Math.min(1, Math.abs(this.pos - 0.5) / 0.5);
    this.eyeOpen += ((this.stopped ? this.lastQuality : near) - this.eyeOpen) * Math.min(1, dt * 10);

    if (this.done) { this.finishT += dt; if (this.finishT > 0.7 && (input.just('confirm') || input.pointer?.clicked)) this.game.finishDawn(); return; }

    if (this.stopped) {
      this.stopT += dt;
      if (this.stopT > 0.75) { this.round++; if (this.round >= this.rounds) this.finish(); else this.beginRound(); }
      return;
    }
    this.pos += this.dir * this.speed * dt;
    if (this.pos >= 1) { this.pos = 1; this.dir = -1; } else if (this.pos <= 0) { this.pos = 0; this.dir = 1; }
    if (input.just('confirm') || input.just('jump') || input.pointer?.clicked) this.stop();
  }

  private stop() {
    this.stopped = true; this.stopT = 0;
    const d = Math.abs(this.pos - 0.5);
    if (d <= this.halfWin) {
      this.lastQuality = 1 - d / this.halfWin; this.hits++;
      const pts = Math.round(200 + this.lastQuality * 400 + this.round * 80);
      this.bonus += pts; this.game.score += pts;
      this.game.audio.pluck(this.lastQuality > 0.7 ? 660 : 523); this.game.audio.sfx('collect');
      this.game.particles.sparks(LOGICAL_W / 2, LOGICAL_H / 2 - 20, 16, '#ffd777');
    } else { this.lastQuality = 0; this.game.audio.pluck(180, 0.2); }
  }

  private finish() {
    this.done = true; this.finishT = 0;
    if (this.game.score > this.game.save.highScore) this.game.save.highScore = this.game.score;
    this.game.audio.sfx('victory');
  }

  draw(c: CanvasRenderingContext2D) {
    c.fillStyle = 'rgba(10,5,12,0.82)'; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    const cx = LOGICAL_W / 2, cy = LOGICAL_H / 2 - 30;
    c.textAlign = 'center';
    c.fillStyle = '#ffd777'; c.font = 'bold 30px Georgia'; c.fillText('黎明 · Catch the Dawn', cx, 52);
    c.fillStyle = 'rgba(255,240,200,.7)'; c.font = '13px Georgia';
    c.fillText('Blink when the marker sits in the golden dawn — tap / Space', cx, 74);

    // the eye (opens as you near the dawn window)
    const open = this.eyeOpen;
    c.save();
    c.strokeStyle = 'rgba(255,200,120,.5)'; c.lineWidth = 3;
    c.beginPath(); c.ellipse(cx, cy, 120, 20 + 62 * open, 0, 0, Math.PI * 2); c.stroke();
    if (open > 0.03) {
      c.save(); c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(cx, cy, 2, cx, cy, 70);
      g.addColorStop(0, `rgba(255,240,200,${open})`); g.addColorStop(0.4, `rgba(240,90,44,${open * 0.8})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(cx, cy, 60, (20 + 62 * open) * 0.9, 0, 0, Math.PI * 2); c.fill();
      c.restore();
      c.fillStyle = '#1a0509'; c.beginPath(); c.ellipse(cx, cy, 22, (10 + 40 * open), 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ff5230'; c.beginPath(); c.ellipse(cx, cy, 10, (10 + 40 * open) * 0.6, 0, 0, Math.PI * 2); c.fill();
    }
    c.restore();

    // the sweep bar
    const bx = cx - 300, bw = 600, by = LOGICAL_H - 120;
    c.fillStyle = 'rgba(0,0,0,.5)'; roundRect(c, bx, by, bw, 20, 10); c.fill();
    // dawn window
    const hw = this.halfWin;
    c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,200,110,.5)';
    roundRect(c, bx + bw * (0.5 - hw), by, bw * hw * 2, 20, 10); c.fill(); c.restore();
    c.fillStyle = 'rgba(255,240,200,.4)'; c.fillRect(cx - 1, by - 4, 2, 28);   // centre tick
    // marker
    const mx = bx + bw * this.pos;
    c.save(); c.shadowColor = '#ffd777'; c.shadowBlur = 12; c.fillStyle = this.stopped ? (this.lastQuality > 0 ? '#ffe6a0' : '#c8503a') : '#fff2c8';
    c.beginPath(); c.moveTo(mx, by - 8); c.lineTo(mx + 8, by - 20); c.lineTo(mx - 8, by - 20); c.closePath(); c.fill();
    c.fillRect(mx - 2, by - 6, 4, 30); c.restore();

    // rounds
    c.textAlign = 'left'; c.fillStyle = 'rgba(255,240,200,.85)'; c.font = 'bold 15px Georgia';
    c.fillText(`Round ${Math.min(this.round + 1, this.rounds)} / ${this.rounds}`, 30, 110);
    c.fillStyle = 'rgba(255,215,140,.8)'; c.fillText(`Bonus ${this.bonus}`, 30, 132);
    if (this.stopped && !this.done) { c.textAlign = 'center'; c.fillStyle = this.lastQuality > 0 ? '#ffd777' : 'rgba(200,200,220,.7)'; c.font = 'bold 24px Georgia'; c.fillText(this.lastQuality > 0.7 ? '完美 · Perfect dawn!' : this.lastQuality > 0 ? '好 · Caught' : '暗 · Missed', cx, by - 40); }

    if (this.done) {
      c.fillStyle = 'rgba(8,4,10,0.7)'; c.fillRect(0, cy - 60, LOGICAL_W, 150);
      c.textAlign = 'center'; c.fillStyle = '#ffd777'; c.font = 'bold 32px Georgia';
      c.fillText(`${this.hits}/${this.rounds} dawns caught`, cx, cy);
      c.fillStyle = '#ffb24a'; c.font = 'bold 22px Georgia'; c.fillText(`+${this.bonus} bonus`, cx, cy + 34);
      if (this.finishT > 0.7) { c.fillStyle = `rgba(255,240,200,${0.5 + 0.4 * Math.sin(this.finishT * 4)})`; c.font = '14px Georgia'; c.fillText('Press to continue', cx, cy + 66); }
    }
    c.textAlign = 'left';
  }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

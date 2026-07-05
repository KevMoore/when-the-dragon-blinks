// Enemy variety, each keyed to the day/night state:
//  moth     — flutters; hunts the player in DAY
//  guardian — stone walker; active in DAY, dormant/harmless at NIGHT
//  wisp     — spirit; hunts and is dangerous at NIGHT
//  sentry   — lantern turret; fires aimed shards in DAY
import { centerX, centerY, lerp, overlap, rand } from './math.js';
import { GRAVITY } from './types.js';
import { sprites } from './sprites.js';
import type { Rect } from './math.js';
import type { EntityKind } from './types.js';
import type { Game } from './game.js';

export class Enemy {
  kind: EntityKind;
  x: number; y: number; w = 28; h = 28; vx = 0; vy = 0;
  alive = true; hp = 2; baseY: number; baseX: number;
  phase = Math.random() * 10; flash = 0; fireTimer = rand(1, 2.4);
  points = 100;

  constructor(kind: EntityKind, x: number, y: number) {
    this.kind = kind; this.x = x; this.y = y; this.baseY = y; this.baseX = x;
    if (kind === 'moth') this.points = 100;
    if (kind === 'wisp') this.points = 120;
    if (kind === 'guardian') { this.w = 34; this.h = 42; this.hp = 3; this.points = 200; }
    if (kind === 'sentry') { this.w = 30; this.h = 34; this.hp = 3; this.points = 150; }
  }
  rect(): Rect { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  update(game: Game, dt: number) {
    if (!this.alive) return;
    this.flash = Math.max(0, this.flash - dt);
    const p = game.player;

    if (this.kind === 'moth') {
      const active = game.world === 'day';
      const dx = centerX(p.rect()) - centerX(this.rect());
      const dy = centerY(p.rect()) - centerY(this.rect());
      if (active && Math.abs(dx) < 380) { this.vx = lerp(this.vx, Math.sign(dx) * 110, 0.05); this.vy = lerp(this.vy, Math.sign(dy) * 70, 0.04); }
      else { this.vx = Math.sin(game.time * 1.8 + this.phase) * 40; this.vy = Math.cos(game.time * 2.2 + this.phase) * 24; }
      this.x += this.vx * dt; this.y += this.vy * dt;
    } else if (this.kind === 'wisp') {
      const active = game.world === 'night';
      this.y = this.baseY + Math.sin(game.time * 2.4 + this.phase) * 26;
      if (active) {
        const dx = centerX(p.rect()) - centerX(this.rect());
        if (Math.abs(dx) < 420) this.x = lerp(this.x, this.x + Math.sign(dx) * 60, 0.02);
        this.x += Math.sin(game.time + this.phase) * 30 * dt;
      }
    } else if (this.kind === 'guardian') {
      if (game.world === 'day') {
        this.vx = Math.sin(game.time * 0.8 + this.phase) * 78;
        this.vy += GRAVITY * dt;
        game.moveEntity(this, this.vx * dt, this.vy * dt);
      }
    } else if (this.kind === 'sentry') {
      if (game.world === 'day') {
        this.fireTimer -= dt;
        if (this.fireTimer <= 0) {
          this.fireTimer = rand(1.6, 2.4);
          const ang = Math.atan2(centerY(p.rect()) - centerY(this.rect()), centerX(p.rect()) - centerX(this.rect()));
          game.projectiles.push({ x: centerX(this.rect()), y: centerY(this.rect()), vx: Math.cos(ang) * 220, vy: Math.sin(ang) * 220, r: 7, life: 3, kind: 'shard', hostile: true });
          game.audio.sfx('attack');
        }
      }
    }

    const dangerous = this.dangerous(game);
    if (dangerous && overlap(this.rect(), p.rect())) p.hurt(game);
    // dash-through damage (bolts are handled centrally in Game.updateProjectiles)
    if (p.dashTime > 0 && overlap(this.rect(), p.rect())) this.hit(game, p.facing);
  }

  dangerous(game: Game) {
    if (this.kind === 'guardian') return game.world === 'day';
    if (this.kind === 'wisp') return game.world === 'night';
    if (this.kind === 'sentry') return false;    // turret body is harmless; its shards hurt
    return true; // moth always solid to touch (weak in night, but still bumps)
  }

  hit(game: Game, facing: number, dmg = 1) {
    this.hp -= dmg;
    this.flash = 0.12;
    this.vx += facing * 90;
    game.particles.hit(centerX(this.rect()), centerY(this.rect()), 12);
    game.camera.addTrauma(0.14);
    game.addHitstop(0.04);
    game.audio.sfx('bosshit');
    if (this.hp <= 0) {
      this.alive = false;
      game.particles.hit(centerX(this.rect()), centerY(this.rect()), 22, game.world === 'day' ? '#ffd777' : '#a9d6ff');
      game.particles.sparks(centerX(this.rect()), centerY(this.rect()), 14);
      game.audio.sfx('collect');
      game.addScore(this.points, centerX(this.rect()), centerY(this.rect()));
      game.spawnEmbers(centerX(this.rect()), centerY(this.rect()), this.points >= 200 ? 2 : 1);
    }
  }

  private dim(game: Game): boolean {
    if (this.kind === 'wisp') return game.world !== 'night';
    return game.world !== 'day'; // moth, guardian, sentry are day-active
  }

  draw(game: Game, c: CanvasRenderingContext2D) {
    if (!this.alive) return;
    const sx = this.x - game.camera.x, sy = this.y - game.camera.y;

    // ---- Sprite path ----
    const walking = this.kind === 'guardian' && game.world === 'day' && Math.abs(this.vx) > 6;
    const sheet = (walking && sprites.get('enemy/guardian/walk')?.ready)
      ? sprites.get('enemy/guardian/walk')
      : sprites.get('enemy/' + this.kind + '/idle');
    if (sheet && sheet.ready) {
      const grounded = this.kind === 'guardian';
      const targetH = this.h * (grounded ? 1.7 : 2.1);
      let face = this.vx < -4 ? -1 : this.vx > 4 ? 1 : 1;
      if (this.kind === 'wisp' || this.kind === 'moth') face = centerX(game.player.rect()) < centerX(this.rect()) ? -1 : 1;
      c.save();
      c.globalAlpha = (this.dim(game) ? 0.5 : 1) * (this.flash > 0 ? 0.7 : 1);
      const cy = grounded ? sy + this.h : sy + this.h / 2;
      c.translate(sx + this.w / 2, cy);
      c.scale(face, 1);
      sheet.blit(c, sheet.frameAt(game.time + this.phase), targetH, grounded);
      c.restore(); c.globalAlpha = 1;
      return;
    }

    c.save();
    c.translate(sx + this.w / 2, sy + this.h / 2);
    if (this.flash > 0) c.globalAlpha = 0.7;
    // ---- ASSET HOOK: swap for enemy sprite frames ----
    if (this.kind === 'moth') {
      const active = game.world === 'day';
      c.globalAlpha *= active ? 1 : 0.45;
      c.fillStyle = active ? '#ffcb57' : '#7d5a6c';
      const flap = 8 + Math.sin(game.time * 20) * 4;
      c.beginPath(); c.ellipse(-8, 0, 13, flap, 0.4, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(8, 0, 13, 16 - flap, -0.4, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#2b0f19'; c.fillRect(-4, -10, 8, 20);
    } else if (this.kind === 'wisp') {
      const active = game.world === 'night';
      c.globalAlpha *= active ? 1 : 0.25;
      c.shadowColor = '#93d8ff'; c.shadowBlur = active ? 22 : 6; c.fillStyle = '#b9eaff';
      c.beginPath(); c.arc(0, 0, 11, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#0a0611'; c.beginPath(); c.arc(-3, -2, 2, 0, Math.PI * 2); c.arc(4, -2, 2, 0, Math.PI * 2); c.fill();
    } else if (this.kind === 'sentry') {
      const active = game.world === 'day';
      c.globalAlpha *= active ? 1 : 0.5;
      c.fillStyle = '#3a2130'; c.fillRect(-13, -16, 26, 32);
      c.fillStyle = active ? '#ffb347' : '#4a3a2a';
      c.shadowColor = '#ff8b44'; c.shadowBlur = active ? 16 : 0;
      c.beginPath(); c.arc(0, 0, 8 + (active ? Math.sin(game.time * 6) * 1.5 : 0), 0, Math.PI * 2); c.fill();
      c.shadowBlur = 0;
    } else {
      const active = game.world === 'day';
      c.globalAlpha *= active ? 1 : 0.55;
      c.fillStyle = active ? '#87694c' : '#454253'; c.fillRect(-16, -21, 32, 42);
      c.fillStyle = active ? '#ffdb78' : '#2c2833'; c.fillRect(-8, -10, 16, 7);
      c.fillStyle = '#21131b'; c.fillRect(-11, 18, 8, 9); c.fillRect(3, 18, 8, 9);
    }
    // ---- END ASSET HOOK ----
    c.restore(); c.globalAlpha = 1; c.shadowBlur = 0;
  }
}

// Enemies are the two forces the dragon's eye holds in balance:
//  DAY (solar / stone):  moth, sentry (lantern turret), guardian
//  NIGHT (shadow/spirit): wisp, skull, ghoul (jiangshi), crawler
// Each rules its own world and falls dormant — harmless, easy prey — in the
// other, so blinking day<->night is a combat tool, not just traversal.
import { centerX, centerY, overlap, rand } from './math.js';
import { GRAVITY, TILE } from './types.js';
import { sprites } from './sprites.js';
import { Brain, lineOfSight, groundBrain, rangedBrain, flyerBrain } from './ai.js';
import type { Rect } from './math.js';
import type { EntityKind } from './types.js';
import type { Game } from './game.js';

export class Enemy {
  kind: EntityKind;
  x: number; y: number; w = 28; h = 28; vx = 0; vy = 0;
  alive = true; hp = 2; maxHp = 2; baseY: number; baseX: number;
  phase = Math.random() * 10; flash = 0; fireTimer = rand(1, 2.4);
  points = 100; grounded = false; aggro = 340; elite = false;
  brain: Brain;
  bb: Record<string, any> = {};

  constructor(kind: EntityKind, x: number, y: number, elite = false) {
    this.kind = kind; this.x = x; this.y = y; this.baseY = y; this.baseX = x;
    if (kind === 'moth') this.points = 100;
    if (kind === 'wisp') this.points = 120;
    if (kind === 'guardian') { this.w = 34; this.h = 42; this.hp = 3; this.points = 200; }
    if (kind === 'sentry') { this.w = 30; this.h = 34; this.hp = 3; this.points = 150; }
    if (kind === 'ghoul') { this.w = 32; this.h = 46; this.hp = 4; this.points = 180; }
    if (kind === 'skull') { this.w = 30; this.h = 30; this.hp = 2; this.points = 140; }
    if (kind === 'crawler') { this.w = 42; this.h = 22; this.hp = 2; this.points = 120; }
    if (kind === 'crow') { this.w = 30; this.h = 30; this.hp = 2; this.points = 150; }        // solar sunbird (day flyer)
    if (kind === 'sentinel') { this.w = 40; this.h = 48; this.hp = 6; this.points = 320; }     // bronze automaton (day tank)
    if (kind === 'wraith') { this.w = 32; this.h = 40; this.hp = 3; this.points = 180; }        // night shade (night flyer)
    this.brain = kind === 'sentry' ? rangedBrain()
      : (kind === 'ghoul' || kind === 'crawler' || kind === 'guardian' || kind === 'sentinel') ? groundBrain()
        : flyerBrain();
    // ground walkers pursue from right across the screen (they navigate toward you,
    // not idle until you arrive); flyers keep a tighter engage range
    this.aggro = (kind === 'ghoul' || kind === 'crawler' || kind === 'guardian' || kind === 'sentinel') ? 1150
      : kind === 'sentry' ? 460 : kind === 'skull' ? 380 : 380;
    // elite = end-of-level mini-boss: much bigger, tankier, hits harder, wider reach
    this.elite = elite;
    if (elite) { this.hp = Math.round(this.hp * 3.4); this.w = Math.round(this.w * 1.5); this.h = Math.round(this.h * 1.5); this.points *= 4; this.aggro = 640; }
    this.maxHp = this.hp;
  }
  rect(): Rect { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  private drawEliteBar(game: Game, c: CanvasRenderingContext2D, sx: number, sy: number) {
    const bw = this.w + 22, bx = sx + this.w / 2 - bw / 2, by = sy - this.h - 12;
    c.save();
    c.fillStyle = 'rgba(0,0,0,.65)'; c.fillRect(bx, by, bw, 6);
    c.strokeStyle = 'rgba(255,220,150,.5)'; c.lineWidth = 1; c.strokeRect(bx + .5, by + .5, bw, 6);
    c.fillStyle = game.world === 'night' ? '#b07aff' : '#ff5a30';
    c.fillRect(bx + 1, by + 1, (bw - 2) * Math.max(0, this.hp / this.maxHp), 4);
    c.restore();
  }

  // is there solid ground just ahead in `dir` (so a walker won't step into a pit)?
  private groundAhead(game: Game, dir: number): boolean {
    const ax = this.x + this.w / 2 + dir * (this.w / 2 + 5);
    const ch = game.tileAt(Math.floor(ax / TILE), Math.floor((this.y + this.h + 4) / TILE));
    return ch === '#' || ch === 'g' || ch === 'D' || ch === 'N' || ch === 'o';
  }

  update(game: Game, dt: number) {
    if (!this.alive) return;
    if (this.y > game.level.height * TILE + 80) { this.alive = false; return; }  // fell out of the world
    this.flash = Math.max(0, this.flash - dt);
    const p = game.player;

    // The eye decides which force is awake. Solar/stone creatures (moth, sentry,
    // guardian) rule the DAY; shadow/spirit/undead (wisp, skull, ghoul, crawler)
    // rule the NIGHT. In the wrong world they fall dormant — harmless, and easy
    // prey — so blinking is a weapon, not just traversal.
    // Zhulong is loose: every enemy wakes and charges the dragon regardless of
    // world or range (it's the strongest form — they throw themselves at it).
    const dragonRush = p.dragonTime > 0;
    const dormant = !dragonRush && this.isDormant(game);
    if (dormant) {
      if (this.isGround()) { this.vy += GRAVITY * dt; game.moveEntity(this, 0, this.vy * dt); }
      else this.y = this.baseY + Math.sin(game.time * 2 + this.phase) * 18;
    } else {
      const dx = centerX(p.rect()) - centerX(this.rect()), dy = centerY(p.rect()) - centerY(this.rect());
      const dist = Math.hypot(dx, dy);
      if (!dragonRush && dist > this.aggro * game.difficulty) {
        // out of aggro range — wait quietly until the player draws near
        if (this.isGround()) { this.vy += GRAVITY * dt; game.moveEntity(this, 0, this.vy * dt); }
        else this.y = this.baseY + Math.sin(game.time * 2 + this.phase) * 14;
      } else {
        const los = lineOfSight(game, centerX(this.rect()), centerY(this.rect()), centerX(p.rect()), centerY(p.rect()));
        this.brain.update({ e: this, game, dx, dy, dist, los, bb: this.bb }, dt);
      }
    }

    const dangerous = this.dangerous(game);
    if (dangerous && overlap(this.rect(), p.rect())) p.hurt(game);
    // dash-through damage (bolts are handled centrally in Game.updateProjectiles)
    if (p.dashTime > 0 && overlap(this.rect(), p.rect())) this.hit(game, p.facing);
  }

  // Is this a solar/stone DAY creature? (else it's a shadow/spirit NIGHT one)
  private dayKind(): boolean { return this.kind === 'moth' || this.kind === 'sentry' || this.kind === 'guardian' || this.kind === 'crow' || this.kind === 'sentinel'; }
  private isGround(): boolean { return this.kind === 'guardian' || this.kind === 'ghoul' || this.kind === 'crawler' || this.kind === 'sentinel'; }
  isDormant(game: Game): boolean { return this.dayKind() ? game.world !== 'day' : game.world !== 'night'; }

  dangerous(game: Game) {
    if (this.kind === 'sentry') return false;    // turret body is harmless; its shards hurt
    return !this.isDormant(game);                 // only awake, in-world creatures bite
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

  private dim(game: Game): boolean { return this.isDormant(game); }

  // Aura colour ties each enemy to the myth: warm fire for day/solar things,
  // cool spirit-light for night things.
  glowColor(_game: Game): string {
    switch (this.kind) {
      case 'wisp': case 'skull': return 'rgba(139,210,255,.75)';
      case 'wraith': return 'rgba(150,170,255,.8)';
      case 'ghoul': return 'rgba(150,224,120,.6)';
      case 'crawler': return 'rgba(255,92,73,.6)';
      case 'crow': return 'rgba(255,120,50,.85)';
      case 'sentinel': return 'rgba(255,200,110,.75)';
      case 'sentry': case 'moth': return 'rgba(255,157,77,.75)';
      default: return 'rgba(255,207,122,.65)'; // stone guardian
    }
  }

  draw(game: Game, c: CanvasRenderingContext2D) {
    if (!this.alive) return;
    const sx = this.x - game.camera.x, sy = this.y - game.camera.y;

    // elite mini-boss: a menacing pulsing aura beneath everything
    if (this.elite) {
      const cx = sx + this.w / 2, cy = sy + this.h / 2, gr = this.w * (2 + Math.sin(game.time * 4) * 0.12);
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5;
      const eg = c.createRadialGradient(cx, cy, 0, cx, cy, gr);
      eg.addColorStop(0, game.world === 'night' ? 'rgba(150,90,255,.6)' : 'rgba(255,90,40,.6)'); eg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = eg; c.beginPath(); c.arc(cx, cy, gr, 0, Math.PI * 2); c.fill(); c.restore(); c.globalAlpha = 1;
    }

    // readability: a dark contrast halo behind, then the day/night-coded glow —
    // so even dark sprites pop against busy terrain
    {
      const cx = sx + this.w / 2, cy = sy + this.h / 2, gr = this.w * 1.4;
      c.save();
      const dark = c.createRadialGradient(cx, cy, 0, cx, cy, gr * 0.9);
      dark.addColorStop(0, 'rgba(0,0,0,0.5)'); dark.addColorStop(0.7, 'rgba(0,0,0,0.28)'); dark.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = dark; c.beginPath(); c.arc(cx, cy, gr * 0.9, 0, Math.PI * 2); c.fill();
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = this.dim(game) ? 0.35 : 0.72;
      const gg = c.createRadialGradient(cx, cy, 0, cx, cy, gr);
      gg.addColorStop(0, this.glowColor(game)); gg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gg; c.beginPath(); c.arc(cx, cy, gr, 0, Math.PI * 2); c.fill();
      c.restore(); c.globalAlpha = 1;
    }

    // ---- Sprite path ----
    let animName = 'idle';
    if (this.kind === 'ghoul' || this.kind === 'crawler') animName = 'walk';
    else if ((this.kind === 'guardian' || this.kind === 'sentinel') && game.world === 'day' && Math.abs(this.vx) > 6) animName = 'walk';
    const sheet = sprites.get('enemy/' + this.kind + '/' + animName) || sprites.get('enemy/' + this.kind + '/idle') || sprites.get('enemy/' + this.kind + '/walk');
    if (sheet && sheet.ready) {
      const grounded = this.kind === 'guardian' || this.kind === 'ghoul' || this.kind === 'crawler' || this.kind === 'sentinel';
      const targetH = this.h * (this.kind === 'crawler' ? 2.5 : grounded ? 1.95 : 2.4);
      let face = this.vx < -4 ? -1 : this.vx > 4 ? 1 : 1;
      if (this.kind === 'wisp' || this.kind === 'moth' || this.kind === 'skull' || this.kind === 'crow' || this.kind === 'wraith') face = centerX(game.player.rect()) < centerX(this.rect()) ? -1 : 1;
      c.save();
      c.globalAlpha = (this.dim(game) ? 0.62 : 1) * (this.flash > 0 ? 0.7 : 1);
      const cy = grounded ? sy + this.h : sy + this.h / 2;
      c.translate(sx + this.w / 2, cy);
      c.scale(face, 1);
      sheet.blit(c, sheet.frameAt(game.time + this.phase), targetH, grounded);
      c.restore(); c.globalAlpha = 1;
      if (this.elite) this.drawEliteBar(game, c, sx, sy);
      return;
    }

    c.save();
    c.translate(sx + this.w / 2, sy + this.h / 2);
    if (this.flash > 0) c.globalAlpha = 0.7;
    // ---- ASSET HOOK: swap for enemy sprite frames ----
    if (this.kind === 'moth' || this.kind === 'crow') {
      const active = game.world === 'day';
      c.globalAlpha *= active ? 1 : 0.45;
      c.fillStyle = active ? '#ffcb57' : '#7d5a6c';
      const flap = 8 + Math.sin(game.time * 20) * 4;
      c.beginPath(); c.ellipse(-8, 0, 13, flap, 0.4, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(8, 0, 13, 16 - flap, -0.4, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#2b0f19'; c.fillRect(-4, -10, 8, 20);
    } else if (this.kind === 'wisp' || this.kind === 'wraith') {
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

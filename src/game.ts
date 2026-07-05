// Central orchestrator: state machine, physics/collision, and render dispatch.
import { clamp, easeOutCubic, overlap, rand } from './math.js';
import type { Rect } from './math.js';
import { LOGICAL_W, LOGICAL_H, TILE } from './types.js';
import type { GameMode, WorldState, LevelData, LorePanel, FloatingText, EntityKind, Projectile, ScorePop, Ember } from './types.js';
import { Input } from './input.js';
import { AudioManager } from './audio.js';
import { Camera } from './camera.js';
import { Particles } from './particles.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { LanternEater } from './boss.js';
import { Platform } from './platform.js';
import { stills } from './sprites.js';
import { levels, loreTexts, codexEntries } from './content.js';
import { loadSave, persist, type SaveData } from './storage.js';
import * as bg from './background.js';
import * as ui from './ui.js';

type Solid = { x: number; y: number; w: number; h: number; oneWay: boolean };

export class Game {
  input = new Input(document.getElementById('game') as HTMLCanvasElement);
  audio: AudioManager;
  camera = new Camera();
  particles = new Particles();
  player = new Player();

  state: GameMode = 'title';
  currentLevelIndex = 0;
  level: LevelData = levels[0];
  enemies: Enemy[] = [];
  platforms: Platform[] = [];
  boss: LanternEater | null = null;
  projectiles: Projectile[] = [];

  world: WorldState = 'day';
  transition = 1;
  dayAmount = 1;
  eyeBlink = 1;
  eyeReact = 0;              // 0..1 pulse — the watching eye flares on impacts
  flash = 0; flashColor = '#ffd777';
  time = 0;
  hitstop = 0;
  elapsed = 0;
  lastLevelTime = 0; lastWasBest = false; lastLevelBonus = 0;
  debug = false;

  // menu selections
  titleSelection = 0; levelSelection = 0; codexSelection = 0;
  settingsSelection = 0; pauseSelection = 0; completeSelection = 0;
  settingsReturn: GameMode = 'title';

  lorePanel: LorePanel | null = null; loreAnim = 0;
  message: FloatingText | null = null;
  score = 0; combo = 0; comboT = 0;
  scorePops: ScorePop[] = [];
  dragonMeter = 0;            // 0..1 — fills from Torch Embers; full → become Zhulong
  embers: Ember[] = [];
  transformT = 0;            // >0 while the transformation cinematic plays
  difficulty = 1;            // per-level aggression scalar (lower = easier)
  clearT = 0; clearing = false; clearOutro = ''; clearNext: GameMode = 'levelComplete';
  private activatedCheckpoints = new Set<number>();
  private viewedShrines = new Set<number>();
  private dashHintShown = false;
  howtoT = 0; howtoReturn: GameMode = 'title';
  private isTouch() { return !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches; }

  save: SaveData;

  constructor(private ctx: CanvasRenderingContext2D) {
    this.save = loadSave();
    this.audio = new AudioManager(this.save.settings);
    this.state = this.save.seenIntro ? 'title' : 'howto';
  }

  totalRelics() { return levels.reduce((n, l) => n + l.relics.length, 0); }

  // ---- persistence -------------------------------------------------------
  persistSave() { persist(this.save); }
  unlockCodex(ids: string[]) { for (const id of ids) if (!this.save.codex.includes(id)) this.save.codex.push(id); this.persistSave(); }

  // ---- level lifecycle ---------------------------------------------------
  startLevel(i: number, withIntro = true) {
    this.currentLevelIndex = clamp(i, 0, levels.length - 1);
    this.level = levels[this.currentLevelIndex];
    this.difficulty = [0.85, 1.1, 1.32, 1.15][this.currentLevelIndex] ?? 1.0;
    this.world = 'day'; this.transition = 1; this.dayAmount = 1; this.flash = 0;
    this.audio.setWorld('day', true);
    this.player.reset(this.level.spawn);
    this.player.checkpoint = { ...this.level.spawn };
    this.enemies = this.level.entities.map(e => new Enemy(e.kind, e.x, e.y));
    for (const en of this.enemies) this.snapEnemySpawn(en);
    this.platforms = (this.level.platforms || []).map(p => new Platform(p));
    this.boss = this.level.isBoss ? new LanternEater() : null;
    this.projectiles = []; this.particles.clear();
    this.activatedCheckpoints.clear();
    this.viewedShrines.clear();
    this.combo = 0; this.comboT = 0; this.scorePops = [];
    this.dragonMeter = 0; this.embers = []; this.player.dragonTime = 0; this.player.dragonTrail = []; this.transformT = 0;
    this.clearT = 0; this.clearing = false;
    this.elapsed = 0; this.message = null;
    this.camera.snap(0, 0);
    this.camera.follow(this.player.x, this.player.y, 1, 0, this.level.width, this.level.height, 0.016);
    this.camera.snap(this.camera.x, this.camera.y);
    if (withIntro) this.openLore(this.level.introLore, 'playing'); else this.state = 'playing';
  }

  // Keep spawned enemies out of pits/walls: walkers snap onto the nearest solid
  // ground column; flyers get lifted out of any terrain they overlap.
  private snapEnemySpawn(en: Enemy) {
    const walker = en.kind === 'ghoul' || en.kind === 'crawler' || en.kind === 'guardian';
    if (walker) {
      for (let dx = 0; dx <= 10; dx++) {
        for (const s of dx === 0 ? [0] : [dx, -dx]) {
          const px = en.x + s * TILE;
          const gy = this.groundYBelow(px, en.w, en.y);
          if (gy < this.level.height * TILE) { en.x = px; en.y = gy - en.h; en.baseY = en.y; return; }
        }
      }
    } else {
      let guard = 0;
      while (this.overlapsSolid(en.rect()) && en.y > TILE && guard++ < 30) en.y -= TILE;
      en.baseY = en.y;
    }
  }

  openLore(id: string, nextMode?: GameMode) {
    const base = loreTexts[id]; if (!base) return;
    this.lorePanel = { ...base, nextMode: nextMode || base.nextMode };
    this.loreAnim = 0; this.state = 'lore';
  }
  closeLore() {
    if (!this.lorePanel) return;
    const next = this.lorePanel.nextMode, after = this.lorePanel.after;
    this.lorePanel = null; if (after) after(); this.state = next;
  }
  flashText(text: string) { this.message = text ? { text, t: 0, max: 2.6 } : null; }
  addHitstop(s: number) { this.hitstop = Math.max(this.hitstop, s); }
  spawnEnemy(kind: EntityKind, x: number, y: number) { this.enemies.push(new Enemy(kind, x, y)); }

  addScore(points: number, x: number, y: number) {
    this.comboT = 2.6;
    const mult = 1 + Math.min(this.combo, 9) * 0.2;   // up to ~2.8x
    const gained = Math.round(points * mult);
    this.combo++;
    this.score += gained;
    this.eyeReact = Math.max(this.eyeReact, 0.7);      // the dragon notices each strike
    if (this.score > this.save.highScore) { this.save.highScore = this.score; this.persistSave(); }
    this.scorePops.push({ x, y, text: '+' + gained, t: 0, color: this.combo > 3 ? '#ffd777' : '#fff1ca' });
    if (this.scorePops.length > 40) this.scorePops.shift();
  }

  // Torch Embers: dropped by slain enemies; collecting them fills the Dragon Gauge.
  spawnEmbers(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) this.embers.push({ x, y, vx: rand(-70, 70), vy: rand(-190, -90), life: 9 });
    if (this.embers.length > 120) this.embers.splice(0, this.embers.length - 120);
  }
  private updateEmbers(dt: number) {
    const p = this.player, pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
    for (const e of this.embers) {
      const dx = pcx - e.x, dy = pcy - e.y, d = Math.hypot(dx, dy);
      if (d < 150) { e.vx += (dx / d) * 900 * dt; e.vy += (dy / d) * 900 * dt; }   // magnet
      else e.vy += 300 * dt;
      e.vx *= 0.98; e.vy *= 0.98;
      e.x += e.vx * dt; e.y += e.vy * dt; e.life -= dt;
      if (p.dragonTime <= 0 && d < 22) {
        e.life = 0;
        this.dragonMeter = Math.min(1, this.dragonMeter + 0.085);
        this.score += 25;
        this.particles.sparks(e.x, e.y, 4, '#ffd777');
        this.audio.sfx('menu');
        if (this.dragonMeter >= 1) this.beginTransform();
      }
    }
    this.embers = this.embers.filter(e => e.life > 0);
  }
  private beginTransform() {
    this.transformT = 1.9; this.dragonMeter = 0;
    this.player.vx = 0; this.player.vy = 0; this.player.animClock = 0;
    this.audio.sfx('victory'); this.camera.addTrauma(0.45);
    const cx = this.player.x + this.player.w / 2, cy = this.player.y + this.player.h / 2;
    this.particles.ring(cx, cy, 30, 240, '#ffd777');
  }
  private updateTransform(dt: number) {
    this.transformT -= dt;
    this.player.animClock += dt;
    const p = 1 - this.transformT / 1.9;
    const cx = this.player.x + this.player.w / 2, cy = this.player.y + this.player.h / 2;
    // embers spiral inward, then burst outward at the flash
    if (p < 0.55 && this.particles.list.length < 560) {
      const a = this.time * 6 + this.particles.list.length, r = 80 + Math.random() * 90;
      this.particles.list.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, vx: -Math.cos(a) * 260, vy: -Math.sin(a) * 260, life: 0.5, maxLife: 0.5, size: rand(2, 4), kind: 'spark', color: '#ffd777', grav: 0 });
    }
    if (Math.abs(p - 0.5) < 0.03) { this.camera.addTrauma(0.7); this.particles.ring(cx, cy, 40, 420, '#ffd777'); this.particles.sparks(cx, cy, 46, '#ff9d4d'); this.audio.sfx('boss'); }
    if (this.transformT <= 0) this.startDragon();
  }
  private startDragon() {
    this.transformT = 0; this.dragonMeter = 0;
    this.player.dragonTime = 12; this.player.dragonTrail = []; this.player.dragonFireCd = 0;
    this.camera.addTrauma(0.6); this.flash = 0.6; this.flashColor = '#ffd777';
    this.flashText('Fly, Torch Dragon — burn the dark!');
  }

  completeLevel() {
    if (this.clearing) return;
    const id = this.level.id;
    if (!this.save.completed.includes(id)) this.save.completed.push(id);
    this.save.highestUnlocked = Math.max(this.save.highestUnlocked, Math.min(this.currentLevelIndex + 1, levels.length - 1));
    this.unlockCodex(this.level.unlockCodexOnComplete);
    this.lastLevelTime = this.elapsed;
    const prev = this.save.bestTimes[id];
    this.lastWasBest = prev === undefined || this.elapsed < prev;
    if (this.lastWasBest) this.save.bestTimes[id] = this.elapsed;
    this.lastLevelBonus = Math.max(500, Math.round(4000 - this.elapsed * 30));
    this.score += this.lastLevelBonus;
    if (this.score > this.save.highScore) this.save.highScore = this.score;
    this.persistSave();
    // play the manga stage-clear cinematic, then open the outro lore
    this.clearing = true; this.clearOutro = this.level.outroLore;
    this.clearNext = this.level.isBoss ? 'gameComplete' : 'levelComplete';
    this.clearT = 2.0; this.flash = 0.5; this.flashColor = '#fff2c8'; this.camera.addTrauma(0.5);
    this.audio.sfx('victory');
  }
  private updateClear(dt: number) {
    this.clearT -= dt;
    if (this.clearT <= 0) { this.clearT = 0; this.openLore(this.clearOutro, this.clearNext); }
  }
  onBossDefeated() {
    if (this.boss) this.addScore(5000, this.boss.x + this.boss.w / 2, this.boss.y + 40);
    this.audio.sfx('victory');
    this.flashText('Balance restored. The dragon blinks again.');
    this.completeLevel();
  }

  // ---- collision ---------------------------------------------------------
  tileAt(tx: number, ty: number): string {
    if (ty < 0 || ty >= this.level.height || tx < 0 || tx >= this.level.width) return '#';
    return this.level.tiles[ty][tx] || '.';
  }
  isHazardChar(ch: string) { return ch === '^' || (ch === 'F' && this.world === 'day') || (ch === 'S' && this.world === 'night'); }

  solidsForRect(r: Rect, world: WorldState = this.world): Solid[] {
    const out: Solid[] = [];
    const x0 = Math.floor(r.x / TILE) - 1, x1 = Math.floor((r.x + r.w) / TILE) + 1;
    const y0 = Math.floor(r.y / TILE) - 1, y1 = Math.floor((r.y + r.h) / TILE) + 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const ch = this.tileAt(x, y);
      const solid = ch === '#' || ch === 'g' || (ch === 'D' && world === 'day') || (ch === 'N' && world === 'night');
      if (solid) out.push({ x: x * TILE, y: y * TILE, w: TILE, h: TILE, oneWay: false });
      else if (ch === 'o') out.push({ x: x * TILE, y: y * TILE, w: TILE, h: TILE, oneWay: true });
    }
    for (const pl of this.platforms) {
      if (!pl.solidNow(world)) continue;
      if (pl.x + pl.w < r.x - TILE || pl.x > r.x + r.w + TILE || pl.y + pl.h < r.y - TILE || pl.y > r.y + r.h + TILE) continue;
      out.push({ x: pl.x, y: pl.y, w: pl.w, h: pl.h, oneWay: false });
    }
    return out;
  }
  overlapsSolid(r: Rect, world: WorldState = this.world) {
    return this.solidsForRect(r, world).some(s => !s.oneWay && overlap(r, s));
  }
  /** World-Y of the ground surface directly beneath a footprint (for shadows). */
  groundYBelow(px: number, w: number, fromY: number): number {
    const x0 = Math.floor((px + 2) / TILE), x1 = Math.floor((px + w - 2) / TILE);
    for (let ry = Math.floor(fromY / TILE); ry < this.level.height + 2; ry++) {
      for (let x = x0; x <= x1; x++) {
        const ch = this.tileAt(x, ry);
        if (ch === '#' || ch === 'g' || (ch === 'D' && this.world === 'day') || (ch === 'N' && this.world === 'night') || ch === 'o') return ry * TILE;
      }
    }
    return this.level.height * TILE;
  }
  /** Is the entity standing on a one-way (jump-through) tile? */
  onOneWayGround(e: { x: number; y: number; w: number; h: number }) {
    const y = Math.floor((e.y + e.h + 2) / TILE);
    const x0 = Math.floor((e.x + 2) / TILE), x1 = Math.floor((e.x + e.w - 2) / TILE);
    for (let x = x0; x <= x1; x++) if (this.tileAt(x, y) === 'o') return true;
    return false;
  }

  moveEntity(e: { x: number; y: number; w: number; h: number; vx: number; vy: number; grounded?: boolean; dropThrough?: number }, dx: number, dy: number, corner = false) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6));
    const sx = dx / steps, sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      // horizontal
      e.x += sx;
      let rect = { x: e.x, y: e.y, w: e.w, h: e.h };
      for (const s of this.solidsForRect(rect)) {
        if (s.oneWay || !overlap(rect, s)) continue;
        if (sx > 0) e.x = s.x - e.w; else if (sx < 0) e.x = s.x + s.w;
        e.vx = 0; rect = { x: e.x, y: e.y, w: e.w, h: e.h };
      }
      // vertical
      const prevBottom = e.y + e.h;
      e.y += sy;
      if (e.grounded !== undefined) e.grounded = false;
      rect = { x: e.x, y: e.y, w: e.w, h: e.h };
      for (const s of this.solidsForRect(rect)) {
        if (!overlap(rect, s)) continue;
        if (s.oneWay) {
          const dropping = (e.dropThrough || 0) > 0;
          if (sy > 0 && prevBottom <= s.y + 2 && !dropping) {
            e.y = s.y - e.h; e.vy = 0; if (e.grounded !== undefined) e.grounded = true;
            rect = { x: e.x, y: e.y, w: e.w, h: e.h };
          }
          continue;
        }
        if (sy > 0) { e.y = s.y - e.h; e.vy = 0; if (e.grounded !== undefined) e.grounded = true; }
        else if (sy < 0) {
          if (corner) {
            let nudged = false;
            for (const off of [4, -4, 6, -6, 9, -9]) {
              if (!this.overlapsSolid({ x: e.x + off, y: e.y, w: e.w, h: e.h })) { e.x += off; nudged = true; break; }
            }
            if (nudged) { rect = { x: e.x, y: e.y, w: e.w, h: e.h }; continue; }
          }
          e.y = s.y + s.h; e.vy = 0;
        }
        rect = { x: e.x, y: e.y, w: e.w, h: e.h };
      }
    }
  }

  tryToggleWorld(forced = false): boolean {
    const next: WorldState = this.world === 'day' ? 'night' : 'day';
    if (!forced && this.overlapsSolid(this.player.rect(), next)) {
      this.flashText('The new world would crush you here. Step aside.');
      this.particles.hit(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, 10);
      return false;
    }
    this.world = next; this.transition = 0;
    this.flash = 0.55; this.flashColor = next === 'day' ? '#ffd777' : '#a9d6ff';
    this.audio.setWorld(next); this.audio.sfx('toggle');
    this.camera.addTrauma(forced ? 0.5 : 0.28);
    const cx = this.player.x + this.player.w / 2, cy = this.player.y + this.player.h / 2;
    this.particles.sparks(cx, cy, 26, next === 'day' ? '#ffd777' : '#a9d6ff');
    this.particles.ring(cx, cy, 20, 220, next === 'day' ? '#ffe19a' : '#bfeeff');
    return true;
  }

  // ---- main update -------------------------------------------------------
  update(dt: number) {
    this.input.updateGamepad();
    this.time += dt;
    if (this.input.just('debug')) this.debug = !this.debug;

    switch (this.state) {
      case 'howto': this.updateHowTo(dt); break;
      case 'title': this.updateTitle(); break;
      case 'levelSelect': this.updateLevelSelect(); break;
      case 'codex': this.updateCodex(); break;
      case 'settings': this.updateSettings(); break;
      case 'lore': this.updateLore(dt); break;
      case 'playing': this.updatePlaying(dt); break;
      case 'paused': this.updatePause(); break;
      case 'levelComplete': this.updateLevelComplete(); break;
      case 'gameComplete': this.updateGameComplete(); break;
    }

    // global fx
    this.transition = Math.min(1, this.transition + dt * 3);
    if (this.state !== 'title') {
      const eased = easeOutCubic(this.transition);
      this.dayAmount = this.world === 'day' ? eased : 1 - eased;
      this.eyeBlink = 1;
    }
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.eyeReact = Math.max(0, this.eyeReact - dt * 2.4);
    this.particles.update(dt);
    this.camera.update(dt);
    this.camera.enabled = this.save.settings.shake && !this.save.settings.reducedMotion;
    if (this.message) { this.message.t += dt; if (this.message.t > this.message.max) this.message = null; }
    if (this.state === 'playing') document.body.classList.add('playing'); else document.body.classList.remove('playing');
    this.updateMusic();
    this.input.endFrame();
  }

  private updateMusic() {
    let key = 'startscreen';
    if (this.state === 'playing' || this.state === 'paused' || this.state === 'lore') {
      if (this.transformT > 0 || this.player.dragonTime > 0) key = 'dragon';
      else if (this.level.isBoss) key = 'bossman';
      else key = 'gameplay';
    }
    this.audio.playMusic(key);
  }

  private updatePlaying(dt: number) {
    if (this.clearT > 0) { this.updateClear(dt); return; }
    if (this.transformT > 0) { this.updateTransform(dt); return; }
    if (!this.dashHintShown && this.isTouch()) { this.dashHintShown = true; this.flashText('Tip: double-tap ◀ / ▶ to dash'); }
    if (this.input.just('pause')) { this.state = 'paused'; this.pauseSelection = 0; return; }
    if (this.input.just('toggle')) this.tryToggleWorld();

    if (this.hitstop > 0) { this.hitstop -= dt; return; }

    for (const pl of this.platforms) pl.update(dt, this.time);
    this.carryRider();
    this.player.update(this, dt);
    for (const e of this.enemies) e.update(this, dt);
    this.enemies = this.enemies.filter(e => e.alive);
    if (this.boss) this.boss.update(this, dt);
    this.updateProjectiles(dt);
    this.updateEmbers(dt);
    this.checkHazardsAndObjects();
    this.camera.follow(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, this.player.facing, this.player.vx, this.level.width, this.level.height, dt);
    if (this.level.windZones) for (const z of this.level.windZones) if (Math.random() < 0.15) this.particles.embers(rand(z.x, z.x + z.w), z.y + z.h, 1);
    if (this.dayAmount < 0.5) this.particles.petal(this.level.width * TILE, 'night'); else this.particles.petal(this.level.width * TILE, 'day');
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    for (const s of this.scorePops) s.t += dt;
    if (this.scorePops.length) this.scorePops = this.scorePops.filter(s => s.t < 0.9);
    this.elapsed += dt;
  }

  // move the player with a platform it is resting on
  private carryRider() {
    const p = this.player;
    if (!p.grounded && p.vy < 0) return;
    for (const pl of this.platforms) {
      if (!pl.solidNow(this.world)) continue;
      const onTop = p.x + p.w > pl.x + 2 && p.x < pl.x + pl.w - 2 && Math.abs((p.y + p.h) - pl.y) <= 8;
      if (onTop) {
        p.x += pl.dx; p.y += pl.dy;
        pl.touch();
        break;
      }
    }
  }

  private updateProjectiles(dt: number) {
    for (const pr of this.projectiles) {
      pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
      if (!pr.hostile && Math.random() < 0.4) this.particles.sparks(pr.x, pr.y, 1, pr.kind === 'blast' ? '#ff9d4d' : (this.world === 'day' ? '#ffd777' : '#a9d6ff'));
      const box = { x: pr.x - pr.r, y: pr.y - pr.r, w: pr.r * 2, h: pr.r * 2 };
      if (pr.hostile) {
        if (overlap(this.player.rect(), box)) { pr.life = 0; this.player.hurt(this); this.particles.hit(pr.x, pr.y, 10); }
      } else {
        // player dragon-light: damage enemies (blasts pierce, hitting each once)
        const dir = pr.vx < 0 ? -1 : 1;
        for (const e of this.enemies) {
          if (!e.alive || !overlap(e.rect(), box)) continue;
          if (pr.pierce) { if (pr.hit!.has(e)) continue; pr.hit!.add(e); }
          e.hit(this, dir, pr.dmg || 1);
          this.particles.hit(pr.x, pr.y, 8, '#ffcf7a');
          if (!pr.pierce) { pr.life = 0; break; }
        }
        // damage the boss only when its eye is exposed (night + recovering)
        if (this.boss && this.boss.alive && this.boss.vulnerable && overlap(this.boss.eyeRect(), box)) {
          this.boss.wound(this, pr.dmg || 1);
          this.particles.hit(pr.x, pr.y, 10, '#a9d6ff');
          if (!pr.pierce) pr.life = 0;
        }
      }
      if (pr.life > 0 && this.overlapsSolid(box)) {
        pr.life = 0; this.particles.sparks(pr.x, pr.y, 6, pr.kind === 'blast' ? '#ff9d4d' : '#ffd777');
      }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0);
  }

  private checkHazardsAndObjects() {
    const pr = this.player.rect();
    const x0 = Math.floor(pr.x / TILE) - 1, x1 = Math.floor((pr.x + pr.w) / TILE) + 1;
    const y0 = Math.floor(pr.y / TILE) - 1, y1 = Math.floor((pr.y + pr.h) / TILE) + 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (this.isHazardChar(this.tileAt(x, y)) && overlap(pr, { x: x * TILE + 5, y: y * TILE + 6, w: TILE - 10, h: TILE - 8 })) this.player.hurt(this);
    }
    this.level.checkpoints.forEach((cp, i) => {
      if (overlap(pr, cp)) {
        this.player.checkpoint = { x: cp.x, y: cp.y - this.player.h + cp.h };
        if (!this.activatedCheckpoints.has(i)) {
          this.activatedCheckpoints.add(i);
          this.audio.sfx('checkpoint');
          this.particles.sparks(cp.x + 12, cp.y + 16, 16, '#ffd777');
          this.flashText('Checkpoint kindled.');
        }
      }
    });
    // Shrines auto-open the first time you reach them (no button needed);
    // desktop players can re-read with the interact key afterwards.
    this.level.shrines.forEach((shrine, i) => {
      const r = { x: shrine.x - 18, y: shrine.y - 50, w: 60, h: 70 };
      if (!overlap(pr, r)) return;
      if (!this.viewedShrines.has(i)) { this.viewedShrines.add(i); this.openLore(shrine.textId, 'playing'); this.audio.sfx('shrine'); }
      else if (this.input.just('interact')) { this.openLore(shrine.textId, 'playing'); this.audio.sfx('shrine'); }
    });
    for (const relic of this.level.relics) {
      if (this.save.relics.includes(relic.id)) continue;
      if (overlap(pr, { x: relic.x, y: relic.y, w: 22, h: 22 })) {
        this.save.relics.push(relic.id); this.persistSave();
        this.particles.sparks(relic.x + 11, relic.y + 11, 26, '#ffd777');
        this.audio.sfx('collect');
        this.addScore(500, relic.x + 11, relic.y);
        this.dragonMeter = Math.min(1, this.dragonMeter + 0.25);
        this.openLore(relic.noteId, 'playing');
      }
    }
    if (!this.level.isBoss && overlap(pr, this.level.exit)) this.completeLevel();
  }

  // ---- menu updates ------------------------------------------------------
  private updateHowTo(dt: number) {
    // living backdrop: the eye blinks and stars drift behind the guide
    this.dayAmount = clamp(0.5 + Math.sin(this.time * 0.4) * 0.7, 0, 1);
    const blink = Math.sin(this.time * 0.9);
    this.eyeBlink = blink > 0.4 ? 1 : clamp((blink + 1) / 1.4, 0.1, 1);
    this.transition = 1;
    if (Math.random() < 0.5) this.particles.stars(LOGICAL_W);
    this.howtoT += dt;
    if (this.howtoT > 0.4 && (this.input.just('confirm') || this.input.just('back') || this.input.pointer?.clicked)) {
      if (!this.save.seenIntro) { this.save.seenIntro = true; this.persistSave(); }
      this.audio.sfx('menu');
      this.state = this.howtoReturn;
    }
  }

  private updateTitle() {
    // ambient cosmic blink of the distant eye behind the menu
    this.dayAmount = clamp(0.5 + Math.sin(this.time * 0.4) * 0.7, 0, 1);
    const blink = Math.sin(this.time * 0.9);
    this.eyeBlink = blink > 0.4 ? 1 : clamp((blink + 1) / 1.4, 0.1, 1);
    this.transition = 1;
    if (Math.random() < 0.9) this.particles.stars(LOGICAL_W);
    const opts = 5;
    if (this.input.just('up')) { this.titleSelection = (this.titleSelection + opts - 1) % opts; this.audio.sfx('menu'); }
    if (this.input.just('down')) { this.titleSelection = (this.titleSelection + 1) % opts; this.audio.sfx('menu'); }
    if (this.input.just('codex')) { this.state = 'codex'; return; }
    if (this.input.pointer?.clicked) {
      const y = this.input.pointer.y, py = 254;
      for (let i = 0; i < opts; i++) if (y > py + 14 + i * 42 && y < py + 50 + i * 42) { this.titleSelection = i; this.chooseTitle(); }
    }
    if (this.input.just('confirm')) this.chooseTitle();
  }
  private chooseTitle() {
    this.audio.sfx('menu');
    if (this.titleSelection === 0) { this.score = 0; this.startLevel(this.save.highestUnlocked >= levels.length ? 0 : this.save.highestUnlocked, true); }
    else if (this.titleSelection === 1) this.state = 'levelSelect';
    else if (this.titleSelection === 2) this.state = 'codex';
    else if (this.titleSelection === 3) { this.settingsReturn = 'title'; this.settingsSelection = 0; this.state = 'settings'; }
    else if (this.titleSelection === 4) { this.howtoReturn = 'title'; this.howtoT = 0; this.state = 'howto'; }
  }
  private updateLevelSelect() {
    if (this.input.just('back')) { this.state = 'title'; return; }
    const max = Math.min(this.save.highestUnlocked, levels.length - 1);
    if (this.input.just('left')) { this.levelSelection = clamp(this.levelSelection - 1, 0, max); this.audio.sfx('menu'); }
    if (this.input.just('right')) { this.levelSelection = clamp(this.levelSelection + 1, 0, max); this.audio.sfx('menu'); }
    if (this.input.just('confirm') && this.levelSelection <= this.save.highestUnlocked) { this.score = 0; this.startLevel(this.levelSelection, true); }
  }
  private updateCodex() {
    if (this.input.just('back')) { this.state = 'title'; return; }
    const n = codexEntries.length;
    if (this.input.just('up')) { this.codexSelection = (this.codexSelection + n - 1) % n; this.audio.sfx('menu'); }
    if (this.input.just('down')) { this.codexSelection = (this.codexSelection + 1) % n; this.audio.sfx('menu'); }
  }
  private updateSettings() {
    if (this.input.just('back')) { this.state = this.settingsReturn; return; }
    const n = 5;
    if (this.input.just('up')) { this.settingsSelection = (this.settingsSelection + n - 1) % n; this.audio.sfx('menu'); }
    if (this.input.just('down')) { this.settingsSelection = (this.settingsSelection + 1) % n; this.audio.sfx('menu'); }
    const s = this.save.settings;
    const left = this.input.just('left'), right = this.input.just('right'), confirm = this.input.just('confirm');
    if (this.settingsSelection === 0) {
      if (left) s.master = clamp(Math.round((s.master - 0.1) * 10) / 10, 0, 1);
      if (right) s.master = clamp(Math.round((s.master + 0.1) * 10) / 10, 0, 1);
      if (left || right) { this.audio.applySettings(); this.audio.sfx('menu'); this.persistSave(); }
    } else if (this.settingsSelection === 1 && (left || right || confirm)) { s.music = !s.music; this.audio.applySettings(); this.persistSave(); this.audio.sfx('menu'); }
    else if (this.settingsSelection === 2 && (left || right || confirm)) { s.shake = !s.shake; this.persistSave(); this.audio.sfx('menu'); }
    else if (this.settingsSelection === 3 && (left || right || confirm)) { s.reducedMotion = !s.reducedMotion; this.persistSave(); this.audio.sfx('menu'); }
    else if (this.settingsSelection === 4 && confirm) { this.state = this.settingsReturn; this.audio.sfx('menu'); }
  }
  private updateLore(dt: number) {
    this.loreAnim = Math.min(1, this.loreAnim + dt * 5);
    if (this.loreAnim > 0.3 && (this.input.just('confirm') || this.input.just('back') || this.input.pointer?.clicked)) this.closeLore();
  }
  private updatePause() {
    if (this.input.just('pause') || this.input.just('back')) { this.state = 'playing'; return; }
    const n = 4;
    if (this.input.just('up')) { this.pauseSelection = (this.pauseSelection + n - 1) % n; this.audio.sfx('menu'); }
    if (this.input.just('down')) { this.pauseSelection = (this.pauseSelection + 1) % n; this.audio.sfx('menu'); }
    if (this.input.just('confirm')) {
      this.audio.sfx('menu');
      if (this.pauseSelection === 0) this.state = 'playing';
      else if (this.pauseSelection === 1) this.startLevel(this.currentLevelIndex, false);
      else if (this.pauseSelection === 2) { this.settingsReturn = 'paused'; this.settingsSelection = 0; this.state = 'settings'; }
      else if (this.pauseSelection === 3) this.state = 'title';
    }
  }
  private updateLevelComplete() {
    if (this.input.just('confirm') || this.input.pointer?.clicked) {
      const next = this.currentLevelIndex + 1;
      if (next < levels.length) this.startLevel(next, true); else this.state = 'gameComplete';
    }
    if (this.input.just('back')) this.state = 'title';
  }
  private updateGameComplete() {
    const n = 3;
    if (this.input.just('left')) this.completeSelection = (this.completeSelection + n - 1) % n;
    if (this.input.just('right')) this.completeSelection = (this.completeSelection + 1) % n;
    if (this.input.just('confirm') || this.input.pointer?.clicked) {
      this.audio.sfx('menu');
      if (this.completeSelection === 0) this.state = 'codex';
      else if (this.completeSelection === 1) this.state = 'levelSelect';
      else this.state = 'title';
    }
    if (this.input.just('back')) this.state = 'title';
  }

  // ---- render ------------------------------------------------------------
  render() {
    const c = this.ctx;
    c.save();
    c.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
    c.translate(this.camera.shakeX, this.camera.shakeY);
    switch (this.state) {
      case 'howto': bg.drawSky(this, c); bg.drawParallax(this, c); this.particles.draw(c, 0, 0, this.world); ui.drawHowTo(this, c); break;
      case 'title': bg.drawSky(this, c); bg.drawParallax(this, c); this.particles.draw(c, 0, 0, this.world); ui.drawTitle(this, c); break;
      case 'levelSelect': bg.drawSky(this, c); bg.drawParallax(this, c); ui.drawLevelSelect(this, c); break;
      case 'codex': bg.drawSky(this, c); bg.drawParallax(this, c); ui.drawCodex(this, c); break;
      case 'settings':
        if (this.settingsReturn === 'paused') this.drawWorld(c); else { bg.drawSky(this, c); bg.drawParallax(this, c); }
        ui.drawSettings(this, c); break;
      default:
        this.drawWorld(c);
        if (this.state === 'lore') ui.drawLore(this, c);
        if (this.state === 'paused') ui.drawPause(this, c);
        if (this.state === 'levelComplete') ui.drawLevelComplete(this, c);
        if (this.state === 'gameComplete') ui.drawGameComplete(this, c);
    }
    if (this.transformT > 0) this.drawTransformCinematic(c);
    if (this.clearT > 0) this.drawMangaClear(c);
    // toggle flash
    if (this.flash > 0.01) { c.globalAlpha = this.flash * 0.5; c.fillStyle = this.flashColor; c.fillRect(-40, -40, LOGICAL_W + 80, LOGICAL_H + 80); c.globalAlpha = 1; }
    c.restore();
  }

  private drawWorld(c: CanvasRenderingContext2D) {
    bg.drawSky(this, c);
    bg.drawParallax(this, c);
    bg.drawWind(this, c);
    bg.drawTiles(this, c);
    this.drawPlatforms(c);
    this.drawObjects(c);
    for (const e of this.enemies) e.draw(this, c);
    if (this.boss) this.boss.draw(this, c);
    for (const pr of this.projectiles) this.drawProjectile(c, pr);
    this.drawEmbers(c);
    this.player.draw(this, c);
    this.particles.draw(c, this.camera.x, this.camera.y, this.world);
    bg.drawLighting(this, c);
    bg.drawVignette(c);
    if (this.player.dragonTime > 0) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.06 + 0.03 * Math.sin(this.time * 6); c.fillStyle = '#ffb84a'; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H); c.restore(); c.globalAlpha = 1; }
    this.drawScorePops(c);
    ui.drawHUD(this, c);
    if (this.debug) ui.drawDebug(this, c);
    if (this.message) ui.drawFloatingText(c, this.message);
  }

  private drawPlatforms(c: CanvasRenderingContext2D) {
    for (const pl of this.platforms) {
      if (pl.gone) continue;
      const active = pl.solidNow(this.world);
      const jitter = pl.crumble && pl.touched && !pl.gone ? Math.sin(this.time * 40) * pl.shakeT * 2 : 0;
      const x = pl.x - this.camera.x + jitter, y = pl.y - this.camera.y;
      c.globalAlpha = active ? 1 : 0.25;
      c.save();
      if (active) { c.shadowColor = pl.crumble ? '#c98a3a' : (this.world === 'day' ? '#ffcf7a' : '#a9d6ff'); c.shadowBlur = 12; }
      c.fillStyle = pl.crumble ? '#7a5a34' : '#3b4c63';
      c.fillRect(x, y, pl.w, pl.h);
      c.fillStyle = pl.crumble ? '#a9803f' : '#5f7ea6'; c.fillRect(x, y, pl.w, 5);
      if (pl.crumble) { c.strokeStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.moveTo(x + pl.w * 0.4, y); c.lineTo(x + pl.w * 0.5, y + pl.h); c.stroke(); }
      c.restore();
    }
    c.globalAlpha = 1;
  }

  private drawObjects(c: CanvasRenderingContext2D) {
    // checkpoints
    for (const r of this.level.checkpoints) {
      const cx = r.x + r.w / 2 - this.camera.x, by = r.y + r.h - this.camera.y;
      if (stills.checkpoint?.ready) {
        c.save(); c.globalAlpha = 0.88; c.shadowColor = '#ffb24a'; c.shadowBlur = 8 + Math.sin(this.time * 4) * 3; stills.checkpoint.draw(c, cx, by, 52); c.restore();
      } else {
        const x = r.x - this.camera.x, y = r.y - this.camera.y;
        c.fillStyle = '#251422'; c.fillRect(x + 10, y + 16, 8, 40);
        c.fillStyle = '#b33a32'; c.beginPath(); c.moveTo(x + 18, y + 18); c.lineTo(x + 46, y + 28); c.lineTo(x + 18, y + 38); c.fill();
      }
    }
    // shrines
    for (const s of this.level.shrines) {
      const cx = s.x + 13 - this.camera.x, by = s.y + 58 - this.camera.y;
      if (stills.shrine?.ready) {
        c.save(); c.globalAlpha = 0.85; c.shadowColor = this.world === 'day' ? '#ffd777' : '#a9d6ff'; c.shadowBlur = 10 + Math.sin(this.time * 3) * 3; stills.shrine.draw(c, cx, by, 58); c.restore();
      } else {
        const x = s.x - this.camera.x, y = s.y - this.camera.y;
        c.fillStyle = '#2b121d'; c.fillRect(x, y, 26, 55); c.fillStyle = '#d6a348'; c.fillRect(x - 8, y, 42, 8);
      }
    }
    // relics
    for (const relic of this.level.relics) {
      if (this.save.relics.includes(relic.id)) continue;
      const x = relic.x - this.camera.x, y = relic.y - this.camera.y + Math.sin(this.time * 4 + relic.x) * 5;
      c.save(); c.shadowColor = '#ffd777'; c.shadowBlur = 20; c.fillStyle = '#ffe6a0';
      c.beginPath(); c.moveTo(x + 11, y); c.lineTo(x + 22, y + 11); c.lineTo(x + 11, y + 22); c.lineTo(x, y + 11); c.closePath(); c.fill();
      c.restore();
    }
    // exit gate
    if (!this.level.isBoss) {
      const e = this.level.exit, cx = e.x + e.w / 2 - this.camera.x, by = e.y + e.h - this.camera.y;
      if (stills.gate?.ready) {
        const h = e.h + 30, midY = by - h * 0.5;
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.4 + 0.2 * Math.sin(this.time * 4);
        const g = c.createRadialGradient(cx, midY, 0, cx, midY, 70); g.addColorStop(0, 'rgba(255,90,50,.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.beginPath(); c.arc(cx, midY, 70, 0, Math.PI * 2); c.fill(); c.restore();
        c.save(); c.shadowColor = '#ff4a28'; c.shadowBlur = 22 + Math.sin(this.time * 3) * 8; stills.gate.draw(c, cx, by, h); c.restore();
      } else {
        const x = e.x - this.camera.x, y = e.y - this.camera.y;
        c.save(); c.shadowColor = this.world === 'day' ? '#ffbd54' : '#a9d6ff'; c.shadowBlur = 22;
        c.strokeStyle = this.world === 'day' ? '#ffd777' : '#a9d6ff'; c.lineWidth = 5;
        c.beginPath(); c.roundRect(x, y, e.w, e.h, 16); c.stroke();
        c.fillStyle = this.world === 'day' ? '#ffd777' : '#a9d6ff'; c.beginPath(); c.ellipse(x + e.w / 2, y + e.h / 2, 10, 5, 0, 0, Math.PI * 2); c.fill();
        c.restore();
      }
    }
  }

  private drawProjectile(c: CanvasRenderingContext2D, p: Projectile) {
    const x = p.x - this.camera.x, y = p.y - this.camera.y;
    c.save();
    if (p.kind === 'bolt' || p.kind === 'blast') {
      const day = this.world === 'day';
      const core = p.kind === 'blast' ? '#ffe08a' : (day ? '#fff1c4' : '#dff0ff');
      const glow = p.kind === 'blast' ? '#ff7a2a' : (day ? '#ff9d4d' : '#6db6ff');
      c.shadowColor = glow; c.shadowBlur = p.kind === 'blast' ? 26 : 15;
      c.translate(x, y); c.rotate(Math.atan2(p.vy, p.vx));
      c.fillStyle = core;
      const lx = p.r * (p.kind === 'blast' ? 1.5 : 2.4), ly = p.r * (p.kind === 'blast' ? 1.1 : 0.7);
      c.beginPath(); c.ellipse(0, 0, lx, ly, 0, 0, Math.PI * 2); c.fill();
      if (p.kind === 'blast') { c.globalAlpha = 0.6; c.fillStyle = glow; c.beginPath(); c.arc(0, 0, p.r * 0.7, 0, Math.PI * 2); c.fill(); }
    } else {
      c.shadowColor = p.kind === 'shard' ? '#ffcaa0' : '#ff674d'; c.shadowBlur = 16;
      c.fillStyle = p.kind === 'shard' ? '#ffd9a0' : '#ffb45d';
      c.translate(x, y);
      c.beginPath(); c.arc(0, 0, p.r, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#3b0c12'; c.fillRect(-3, -2, 6, 4);
    }
    c.restore();
  }

  private drawScorePops(c: CanvasRenderingContext2D) {
    c.save(); c.textAlign = 'center'; c.font = 'bold 16px Georgia';
    for (const s of this.scorePops) {
      c.globalAlpha = Math.max(0, 1 - s.t / 0.9);
      c.fillStyle = s.color;
      c.fillText(s.text, s.x - this.camera.x, s.y - this.camera.y - s.t * 42);
    }
    c.restore(); c.globalAlpha = 1;
  }

  // The transformation interstitial: darken, god-rays, shockwaves, the great eye
  // opening, a flash, and calligraphic title — a moment of wonderment.
  private drawTransformCinematic(c: CanvasRenderingContext2D) {
    const dur = 1.9, p = clamp(1 - this.transformT / dur, 0, 1);
    const cx = this.player.x + this.player.w / 2 - this.camera.x, cy = this.player.y + this.player.h / 2 - this.camera.y;
    const swell = Math.sin(p * Math.PI);
    // focus vignette closing in on the hero
    const dark = swell * 0.75;
    const vg = c.createRadialGradient(cx, cy, 30, cx, cy, 560);
    vg.addColorStop(0, 'rgba(8,3,2,0)'); vg.addColorStop(1, `rgba(6,2,2,${dark})`);
    c.fillStyle = vg; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    // rotating god-rays from the hero
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = swell * 0.5;
    c.translate(cx, cy); c.rotate(this.time * 1.1);
    for (let i = 0; i < 12; i++) { c.rotate(Math.PI * 2 / 12); c.fillStyle = 'rgba(255,200,90,.5)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(580, -26); c.lineTo(580, 26); c.closePath(); c.fill(); }
    c.restore();
    // expanding shockwave rings
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) { const rp = p * 1.4 - k * 0.18; if (rp > 0 && rp < 1) { c.globalAlpha = (1 - rp) * 0.6; c.strokeStyle = '#ffd777'; c.lineWidth = 4; c.beginPath(); c.arc(cx, cy, rp * 460, 0, Math.PI * 2); c.stroke(); } }
    c.restore(); c.globalAlpha = 1;
    // the great eye opening high above
    const open = clamp((p - 0.12) / 0.5, 0, 1), ex = LOGICAL_W / 2, ey = 150;
    c.save(); c.globalAlpha = clamp(p / 0.3, 0, 1) * clamp((1 - p) / 0.25, 0, 1);
    c.shadowColor = '#ff4a28'; c.shadowBlur = 40;
    c.fillStyle = '#160406'; c.beginPath(); c.ellipse(ex, ey, 150, 60 * (0.12 + open * 0.88), 0, 0, Math.PI * 2); c.fill();
    const iris = c.createRadialGradient(ex, ey, 2, ex, ey, 58);
    iris.addColorStop(0, '#ffe0a0'); iris.addColorStop(0.4, '#f0452c'); iris.addColorStop(1, '#8a1810');
    c.fillStyle = iris; c.beginPath(); c.ellipse(ex, ey, 26, 58 * open, 0, 0, Math.PI * 2); c.fill();
    c.restore(); c.globalAlpha = 1; c.shadowBlur = 0;
    // white-gold flash at the midpoint
    const flash = Math.max(0, 1 - Math.abs(p - 0.5) / 0.12);
    if (flash > 0) { c.globalAlpha = flash * 0.85; c.fillStyle = '#fff2c8'; c.fillRect(-40, -40, LOGICAL_W + 80, LOGICAL_H + 80); c.globalAlpha = 1; }
    // calligraphic title, in after the flash and out at the very end
    const tin = clamp((p - 0.42) / 0.25, 0, 1) * clamp((1 - p) / 0.18, 0, 1);
    if (tin > 0) {
      c.save(); c.globalAlpha = tin; c.textAlign = 'center';
      c.shadowColor = '#ff6a2a'; c.shadowBlur = 34; c.fillStyle = '#ffdf9a'; c.font = 'bold 88px Georgia';
      c.fillText('烛龍', LOGICAL_W / 2, 260 - swell * 6);
      c.shadowBlur = 12; c.font = '22px Georgia'; c.fillStyle = '#fff1ca';
      c.fillText('Z H U L O N G   A W A K E N S', LOGICAL_W / 2, 300 - swell * 6);
      c.restore(); c.globalAlpha = 1;
    }
    c.shadowBlur = 0;
  }

  // Manga-esque STAGE CLEAR: white burst, radial action lines, screentone, a
  // slamming banner and stamped 過關 calligraphy.
  private drawMangaClear(c: CanvasRenderingContext2D) {
    const dur = 2.0, p = clamp(1 - this.clearT / dur, 0, 1);
    const cx = LOGICAL_W / 2, cy = LOGICAL_H / 2;
    // white flash in, then a translucent ink wash
    c.fillStyle = `rgba(252,246,232,${Math.max(0, 0.92 - p * 5)})`; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    c.globalAlpha = clamp(p * 5, 0, 1) * 0.45; c.fillStyle = '#140a10'; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H); c.globalAlpha = 1;
    // radial action lines
    c.save(); c.translate(cx, cy);
    const n = 52;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.sin(i * 3) * 0.02;
      const inner = 150 + Math.sin(i * 7) * 34 - p * 60;
      c.strokeStyle = i % 2 ? 'rgba(20,10,14,.5)' : 'rgba(255,240,210,.32)';
      c.lineWidth = i % 3 ? 2 : 6;
      c.beginPath(); c.moveTo(Math.cos(a) * inner, Math.sin(a) * inner); c.lineTo(Math.cos(a) * 900, Math.sin(a) * 900); c.stroke();
    }
    c.restore();
    // screentone dots in the corners
    c.save(); c.fillStyle = 'rgba(20,10,14,.25)';
    for (let gx = 0; gx < LOGICAL_W; gx += 12) for (let gy = 0; gy < LOGICAL_H; gy += 12) {
      const edge = Math.min(gx, LOGICAL_W - gx, gy, LOGICAL_H - gy);
      if (edge < 90) { c.beginPath(); c.arc(gx, gy, 2.2 * (1 - edge / 90), 0, Math.PI * 2); c.fill(); }
    }
    c.restore();
    // banner slams in from the left
    const slide = (1 - clamp((p - 0.12) / 0.18, 0, 1)) * -700;
    c.save(); c.translate(cx + slide, cy - 18); c.rotate(-0.11);
    c.fillStyle = '#c8302a'; c.fillRect(-370, -54, 740, 108);
    c.fillStyle = '#1a0a10'; c.fillRect(-370, -54, 740, 8); c.fillRect(-370, 46, 740, 8);
    c.textAlign = 'center'; c.fillStyle = '#ffe0a0'; c.font = 'bold 60px Georgia';
    c.fillText(this.clearNext === 'gameComplete' ? 'BALANCE RESTORED' : 'STAGE CLEAR', 0, 2);
    c.restore();
    // 過關 stamp
    const stamp = clamp((p - 0.42) / 0.14, 0, 1);
    if (stamp > 0) {
      c.save(); c.globalAlpha = Math.min(1, stamp); const sc = 1.5 - 0.5 * Math.min(1, stamp);
      c.translate(cx, cy + 128); c.scale(sc, sc); c.rotate(0.05);
      c.fillStyle = '#ffd777'; c.strokeStyle = '#1a0a10'; c.lineWidth = 5; c.font = 'bold 74px Georgia'; c.textAlign = 'center';
      c.strokeText('過關', 0, 0); c.fillText('過關', 0, 0); c.restore();
    }
    c.globalAlpha = 1;
  }

  private drawEmbers(c: CanvasRenderingContext2D) {
    c.save();
    for (const e of this.embers) {
      const x = e.x - this.camera.x, y = e.y - this.camera.y;
      const pulse = 0.7 + Math.sin(this.time * 8 + e.x) * 0.3;
      c.globalAlpha = clamp(e.life, 0, 1);
      c.shadowColor = '#ff9d4d'; c.shadowBlur = 10; c.fillStyle = '#ffd777';
      c.beginPath(); c.arc(x, y, 2.5 * pulse + 1.6, 0, Math.PI * 2); c.fill();
    }
    c.restore(); c.globalAlpha = 1;
  }

  private drawPrompt(c: CanvasRenderingContext2D, x: number, y: number, text: string) {
    c.save(); c.font = '14px Georgia'; c.textAlign = 'center';
    const w = c.measureText(text).width + 20;
    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(x - w / 2, y - 16, w, 22);
    c.strokeStyle = 'rgba(246,191,94,.5)'; c.strokeRect(x - w / 2, y - 16, w, 22);
    c.fillStyle = '#fff1ca'; c.fillText(text, x, y); c.restore();
  }
}

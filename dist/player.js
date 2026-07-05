// The shrine runner: responsive platformer feel — coyote time, jump buffering,
// variable + apex-hang jump, corner correction, wall slide/jump, dash with
// afterimages, and squash/stretch juice.
import { clamp, lerp, rand, damp, mixHex, overlap } from './math.js';
import { GRAVITY, TILE } from './types.js';
import { sprites } from './sprites.js';
const RUN_ACCEL = 4200;
const AIR_ACCEL = 2600;
const MAX_SPEED = 258;
const JUMP_VEL = 640;
const COYOTE = 0.1;
const JUMP_BUFFER = 0.13;
const WALL_SLIDE_MAX = 96;
export class Player {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.w = 22;
        this.h = 42;
        this.vx = 0;
        this.vy = 0;
        this.facing = 1;
        this.grounded = false;
        this.coyote = 0;
        this.jumpBuffer = 0;
        this.dashTime = 0;
        this.dashCooldown = 0;
        this.invuln = 0;
        this.hp = 5;
        this.maxHp = 5;
        this.checkpoint = { x: 64, y: 430 };
        this.attackTimer = 0; // shoot animation / muzzle timer
        this.shootCd = 0;
        this.charging = false;
        this.chargeT = 0;
        // juice / animation
        this.scaleX = 1;
        this.scaleY = 1;
        this.animTime = 0;
        this.animName = 'idle';
        this.animClock = 0;
        this.dropThrough = 0;
        this.airJumps = 1; // mid-air jumps available (reset on landing)
        this.dragonTime = 0; // seconds remaining in Zhulong flight form
        this.dragonTrail = [];
        this.dragonFireCd = 0;
        this.wallDir = 0; // -1 wall on left, 1 on right, 0 none
        this.wallLock = 0; // brief control lock after a wall jump
        this.afterimages = [];
        this.dead = false;
    }
    rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
    /** Unit aim direction from held inputs (straight, up, diagonal, down-in-air). */
    aim(game) {
        const i = game.input;
        const left = i.down('left'), right = i.down('right');
        const up = i.down('up'), dn = i.down('down') && !this.grounded;
        let dx = 0, dy = 0;
        if (left && !right)
            dx = -1;
        else if (right && !left)
            dx = 1;
        if (up)
            dy = -1;
        else if (dn)
            dy = 1;
        if (dx === 0 && dy === 0)
            dx = this.facing;
        const len = Math.hypot(dx, dy) || 1;
        return [dx / len, dy / len];
    }
    reset(spawn) {
        this.x = spawn.x;
        this.y = spawn.y;
        this.vx = 0;
        this.vy = 0;
        this.hp = this.maxHp;
        this.grounded = false;
        this.invuln = 0;
        this.attackTimer = 0;
        this.dashTime = 0;
        this.wallDir = 0;
        this.wallLock = 0;
        this.afterimages.length = 0;
        this.dead = false;
        this.airJumps = 1;
        this.scaleX = this.scaleY = 1;
    }
    respawnAtCheckpoint() {
        this.x = this.checkpoint.x;
        this.y = this.checkpoint.y;
        this.vx = 0;
        this.vy = 0;
        this.hp = this.maxHp;
        this.invuln = 1.0;
        this.wallDir = 0;
        this.afterimages.length = 0;
    }
    update(game, dt) {
        if (this.dragonTime > 0) {
            this.updateDragon(game, dt);
            return;
        }
        const input = game.input;
        this.animTime += dt;
        this.wallLock = Math.max(0, this.wallLock - dt);
        const left = input.down('left') && this.wallLock <= 0;
        const right = input.down('right') && this.wallLock <= 0;
        const wasGrounded = this.grounded;
        // horizontal accel / friction
        const accel = this.grounded ? RUN_ACCEL : AIR_ACCEL;
        if (left) {
            this.vx -= accel * dt;
            this.facing = -1;
        }
        if (right) {
            this.vx += accel * dt;
            this.facing = 1;
        }
        if (!left && !right)
            this.vx = lerp(this.vx, 0, this.grounded ? 0.26 : 0.06);
        this.vx = clamp(this.vx, -MAX_SPEED, MAX_SPEED);
        // wall contact (only meaningful in the air)
        this.wallDir = 0;
        if (!this.grounded) {
            if (game.overlapsSolid({ x: this.x - 3, y: this.y + 4, w: this.w, h: this.h - 10 }) && (left || this.facing < 0))
                this.wallDir = -1;
            else if (game.overlapsSolid({ x: this.x + 3, y: this.y + 4, w: this.w, h: this.h - 10 }) && (right || this.facing > 0))
                this.wallDir = 1;
        }
        // timers
        this.coyote = this.grounded ? COYOTE : Math.max(0, this.coyote - dt);
        if (input.just('jump'))
            this.jumpBuffer = JUMP_BUFFER;
        else
            this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
        // drop through a jump-through platform: hold Down + Jump
        this.dropThrough = Math.max(0, this.dropThrough - dt);
        if (this.grounded && input.down('down') && this.jumpBuffer > 0 && game.onOneWayGround(this)) {
            this.dropThrough = 0.2;
            this.jumpBuffer = 0;
            this.vy = Math.max(this.vy, 40);
        }
        // jump: ground/coyote, else wall jump
        if (this.jumpBuffer > 0 && (this.coyote > 0 || this.grounded)) {
            this.doJump(game);
        }
        else if (this.jumpBuffer > 0 && this.wallDir !== 0) {
            this.vy = -JUMP_VEL * 0.98;
            this.vx = -this.wallDir * 320;
            this.facing = -this.wallDir;
            this.wallLock = 0.16;
            this.jumpBuffer = 0;
            this.coyote = 0;
            this.stretch(0.7, 1.35);
            game.particles.sparks(this.x + this.w / 2, this.y + this.h / 2, 10, '#ffe19a');
            game.audio.sfx('jump');
        }
        else if (this.jumpBuffer > 0 && this.airJumps > 0) {
            // mid-air double jump — a full second boost (tap jump twice for ~2x height)
            this.vy = -JUMP_VEL;
            this.airJumps--;
            this.jumpBuffer = 0;
            this.stretch(0.72, 1.32);
            game.particles.ring(this.x + this.w / 2, this.y + this.h, 12, 150, game.world === 'day' ? '#ffd777' : '#a9d6ff');
            game.particles.dust(this.x + this.w / 2, this.y + this.h, 6);
            game.audio.sfx('jump');
        }
        // variable jump height
        if (!input.down('jump') && this.vy < -150)
            this.vy += 1900 * dt;
        // dash
        this.dashCooldown = Math.max(0, this.dashCooldown - dt);
        if (input.just('dash') && this.dashCooldown <= 0 && this.dashTime <= 0) {
            this.dashTime = 0.16;
            this.dashCooldown = 0.5;
            this.vx = this.facing * 620;
            this.vy = Math.min(this.vy, 0);
            this.invuln = Math.max(this.invuln, 0.18);
            this.stretch(1.5, 0.6);
            game.particles.sparks(this.x + this.w / 2, this.y + this.h / 2, 16, game.world === 'day' ? '#ffd777' : '#a9d6ff');
            game.audio.sfx('attack');
        }
        // gravity (with apex hang, wall slide, fast-fall)
        if (this.dashTime > 0) {
            this.dashTime -= dt;
            this.spawnAfterimage();
        }
        else {
            let g = GRAVITY;
            if (Math.abs(this.vy) < 120 && !this.grounded)
                g *= 0.56; // apex hang
            if (input.down('down') && !this.grounded)
                g *= 1.7; // fast fall
            this.vy += g * dt;
            if (this.wallDir !== 0 && this.vy > WALL_SLIDE_MAX) {
                this.vy = WALL_SLIDE_MAX;
                if (Math.random() < 0.4)
                    game.particles.dust(this.wallDir < 0 ? this.x : this.x + this.w, this.y + rand(0, this.h), 1);
            }
        }
        this.vy = clamp(this.vy, -980, 820);
        // shooting: tap = aimed dragon-light bolt, hold = charged fire blast
        this.shootCd = Math.max(0, this.shootCd - dt);
        const atkDown = input.down('attack');
        if (input.just('attack') && this.shootCd <= 0) {
            this.fireBolt(game);
            this.charging = true;
            this.chargeT = 0;
        }
        if (this.charging) {
            if (atkDown) {
                this.chargeT += dt;
                if (this.chargeT > 0.5 && Math.random() < 0.5) {
                    const [ax, ay] = this.aim(game);
                    game.particles.embers(this.x + this.w / 2 + ax * 18, this.y + this.h * 0.42 + ay * 12, 1);
                }
            }
            else {
                if (this.chargeT >= 0.5)
                    this.fireBlast(game);
                this.charging = false;
                this.chargeT = 0;
            }
        }
        this.attackTimer = Math.max(0, this.attackTimer - dt);
        this.invuln = Math.max(0, this.invuln - dt);
        // breath currents
        for (const zone of game.level.windZones || []) {
            const zoneRect = { x: zone.x, y: zone.y, w: zone.w, h: zone.h };
            if (this.overlaps(zoneRect)) {
                this.vy -= 1150 * dt;
                this.vx += Math.sin(game.time * 3 + zone.x) * 30 * dt;
                this.vy = Math.max(this.vy, -300);
                if (Math.random() < 0.6)
                    game.particles.mist(rand(zone.x, zone.x + zone.w), zone.y + zone.h - 12, 1);
            }
        }
        // integrate with collision (corner correction for the player head)
        game.moveEntity(this, this.vx * dt, this.vy * dt, true);
        // landing
        if (this.grounded)
            this.airJumps = 1;
        if (!wasGrounded && this.grounded) {
            const impact = clamp(Math.abs(this.vy) / 800, 0, 1);
            game.audio.sfx('land');
            game.particles.dust(this.x + this.w / 2, this.y + this.h, 6 + Math.floor(impact * 10));
            this.stretch(1 + impact * 0.35, 1 - impact * 0.32);
            if (impact > 0.55)
                game.camera.addTrauma(0.12);
        }
        // ease squash back to neutral
        this.scaleX = damp(this.scaleX, 1, 12, dt);
        this.scaleY = damp(this.scaleY, 1, 12, dt);
        // afterimage fade
        for (const a of this.afterimages)
            a.life -= dt;
        this.afterimages = this.afterimages.filter(a => a.life > 0);
        // animation state for sprite playback
        const desired = this.attackTimer > 0 ? 'attack'
            : !this.grounded ? 'jump'
                : Math.abs(this.vx) > 26 ? 'run' : 'idle';
        if (desired !== this.animName) {
            this.animName = desired;
            this.animClock = 0;
        }
        else
            this.animClock += dt;
        // pit death
        if (this.y > game.level.height * TILE + 240)
            this.hurt(game, 1, true);
    }
    doJump(game) {
        this.vy = -JUMP_VEL;
        this.grounded = false;
        this.coyote = 0;
        this.jumpBuffer = 0;
        this.stretch(0.7, 1.35);
        game.particles.dust(this.x + this.w / 2, this.y + this.h, 8);
        game.audio.sfx('jump');
    }
    stretch(sx, sy) { this.scaleX = sx; this.scaleY = sy; }
    spawnAfterimage() {
        this.afterimages.push({ x: this.x, y: this.y, life: 0.22, facing: this.facing });
    }
    fireBolt(game) {
        const [dx, dy] = this.aim(game);
        const sp = 660;
        const mx = this.x + this.w / 2 + dx * 18, my = this.y + this.h * 0.42 + dy * 12;
        game.projectiles.push({ x: mx, y: my, vx: dx * sp, vy: dy * sp, r: 6, life: 1.1, kind: 'bolt', hostile: false, dmg: 1 });
        this.shootCd = 0.16;
        this.attackTimer = 0.14;
        if (dx !== 0)
            this.facing = dx < 0 ? -1 : 1;
        this.stretch(1.12, 0.92);
        game.particles.sparks(mx, my, 4, game.world === 'day' ? '#ffd777' : '#a9d6ff');
        game.audio.sfx('attack');
        game.camera.addTrauma(0.05);
    }
    fireBlast(game) {
        const [dx, dy] = this.aim(game);
        const sp = 540;
        const mx = this.x + this.w / 2 + dx * 20, my = this.y + this.h * 0.42 + dy * 12;
        game.projectiles.push({ x: mx, y: my, vx: dx * sp, vy: dy * sp, r: 16, life: 1.5, kind: 'blast', hostile: false, dmg: 4, pierce: true, hit: new Set() });
        this.attackTimer = 0.24;
        if (dx !== 0)
            this.facing = dx < 0 ? -1 : 1;
        this.stretch(1.3, 0.8);
        game.particles.ring(mx, my, 16, 210, '#ff9d4d');
        game.particles.embers(mx, my, 8);
        game.audio.sfx('boss');
        game.camera.addTrauma(0.32);
    }
    // ---- Zhulong flight form ------------------------------------------------
    updateDragon(game, dt) {
        this.dragonTime -= dt;
        this.invuln = 0.5; // untouchable while transformed
        this.animTime += dt;
        const i = game.input;
        const dx = (i.down('right') ? 1 : 0) - (i.down('left') ? 1 : 0);
        const dy = (i.down('down') ? 1 : 0) - (i.down('up') ? 1 : 0);
        const sp = 385;
        this.vx = dx * sp;
        this.vy = dy * sp;
        if (dx !== 0)
            this.facing = dx < 0 ? -1 : 1;
        // free flight, clamped to the level (no terrain collision)
        this.x = clamp(this.x + this.vx * dt, TILE, game.level.width * TILE - this.w - TILE);
        this.y = clamp(this.y + this.vy * dt, TILE, game.level.height * TILE - this.h - TILE);
        const hx = this.x + this.w / 2, hy = this.y + this.h / 2;
        this.dragonTrail.unshift({ x: hx, y: hy });
        if (this.dragonTrail.length > 64)
            this.dragonTrail.pop();
        // continuous fire-breath in the facing/aim direction
        this.dragonFireCd -= dt;
        if (this.dragonFireCd <= 0) {
            this.dragonFireCd = 0.1;
            const ax = this.facing, ay = dy * 0.5, len = Math.hypot(ax, ay) || 1;
            game.projectiles.push({ x: hx + this.facing * 22, y: hy, vx: ax / len * 780, vy: ay / len * 780, r: 10, life: 1.1, kind: 'blast', hostile: false, dmg: 3, pierce: true, hit: new Set() });
            game.particles.embers(hx + this.facing * 22, hy, 2);
            if (Math.random() < 0.5)
                game.audio.sfx('attack');
        }
        // the dragon's body sweeps enemies aside
        for (const e of game.enemies)
            if (e.alive && overlap(this.rect(), e.rect()))
                e.hit(game, this.facing, 3);
        game.particles.embers(hx - this.facing * 16 + rand(-6, 6), hy + rand(-8, 8), 1);
        if (this.dragonTime <= 0) {
            this.dragonTrail.length = 0;
            this.vy = 0;
            this.invuln = 1.2;
            let guard = 0; // don't revert stuck inside terrain
            while (game.overlapsSolid(this.rect()) && this.y > TILE && guard++ < 40)
                this.y -= TILE;
            game.particles.sparks(hx, hy, 24, '#ffd777');
            game.flashText('The dragon settles. Balance holds.');
        }
    }
    drawSummon(game, c) {
        const p = clamp(1 - game.transformT / 1.9, 0, 1);
        const rise = Math.sin(p * Math.PI) * 22;
        const sx = this.x - game.camera.x, sy = this.y - game.camera.y - rise;
        const cx = sx + this.w / 2, cy = sy + this.h / 2;
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = Math.sin(p * Math.PI);
        const g = c.createRadialGradient(cx, cy, 0, cx, cy, 74);
        g.addColorStop(0, `rgba(255,214,130,${0.5 + 0.4 * Math.sin(game.time * 22)})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(cx, cy, 74, 0, Math.PI * 2);
        c.fill();
        c.restore();
        c.globalAlpha = 1;
        const hasSummon = !!sprites.get('player/summon')?.ready;
        const sheet = hasSummon ? sprites.get('player/summon') : sprites.get('player/idle');
        if (sheet && sheet.ready) {
            const frame = hasSummon ? Math.min(7, Math.floor(p * 8)) : sheet.frameAt(this.animClock);
            c.save();
            c.translate(sx + this.w / 2, sy + this.h);
            c.scale(this.facing, 1);
            c.shadowColor = '#ffcf5a';
            c.shadowBlur = 22;
            sheet.blit(c, frame, this.h * 1.72, true);
            c.restore();
        }
    }
    drawDragon(game, c) {
        const trail = this.dragonTrail, cam = game.camera;
        // Prefer the AutoSprite dragon: a short glowing trail + the dragon at the head.
        const anim = this.dragonFireCd > 0.06 ? 'attack' : 'idle';
        const sheet = sprites.get('dragon/' + anim)?.ready ? sprites.get('dragon/' + anim) : sprites.get('dragon/idle');
        if (sheet && sheet.ready) {
            c.save();
            for (let i = Math.min(trail.length - 1, 42); i >= 2; i -= 2) {
                const p = trail[i];
                if (!p)
                    continue;
                const t = 1 - i / 44;
                c.globalAlpha = t * 0.7;
                c.fillStyle = mixHex('#8a1810', '#ffcf5a', t);
                c.shadowColor = '#ff7a2a';
                c.shadowBlur = 7;
                c.beginPath();
                c.arc(p.x - cam.x, p.y - cam.y, 2 + t * t * 7, 0, Math.PI * 2);
                c.fill();
            }
            c.restore();
            c.globalAlpha = 1;
            c.shadowBlur = 0;
            const hx = this.x + this.w / 2 - cam.x, hy = this.y + this.h / 2 - cam.y;
            c.save();
            c.translate(hx, hy);
            c.scale(this.facing, 1);
            c.shadowColor = '#ff8b3a';
            c.shadowBlur = 18;
            sheet.blit(c, sheet.frameAt(this.animTime), 108, false);
            c.restore();
            return;
        }
        c.save();
        for (let i = trail.length - 1; i >= 0; i--) {
            const t = 1 - i / Math.max(1, trail.length);
            const p = trail[i];
            const x = p.x - cam.x, y = p.y - cam.y;
            const r = 3 + t * t * 13;
            c.fillStyle = mixHex('#8a1810', '#ffcf5a', t);
            c.shadowColor = '#ff7a2a';
            c.shadowBlur = 8;
            c.beginPath();
            c.arc(x, y, r, 0, Math.PI * 2);
            c.fill();
            if (i % 3 === 0 && t > 0.25) {
                c.fillStyle = '#ffd06a';
                c.beginPath();
                c.moveTo(x, y - r);
                c.lineTo(x - 4, y - r - 7);
                c.lineTo(x + 4, y - r - 7);
                c.closePath();
                c.fill();
            }
        }
        c.shadowBlur = 0;
        const h = trail[0] || { x: this.x + this.w / 2, y: this.y + this.h / 2 };
        const hx = h.x - cam.x, hy = h.y - cam.y, f = this.facing;
        c.save();
        c.translate(hx, hy);
        c.scale(f, 1);
        c.fillStyle = '#c73320';
        c.shadowColor = '#ff7a2a';
        c.shadowBlur = 14;
        c.beginPath();
        c.ellipse(4, 0, 20, 15, 0, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.ellipse(20, 3, 12, 8, 0, 0, Math.PI * 2);
        c.fill();
        c.shadowBlur = 0;
        c.strokeStyle = '#ffd06a';
        c.lineWidth = 3;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(-4, -10);
        c.quadraticCurveTo(-16, -22, -24, -14);
        c.stroke();
        c.strokeStyle = '#ffe6a0';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(26, 7);
        c.quadraticCurveTo(42, 3, 54, 12);
        c.stroke();
        c.beginPath();
        c.moveTo(26, 9);
        c.quadraticCurveTo(40, 15, 50, 24);
        c.stroke();
        c.fillStyle = '#fff0c0';
        c.shadowColor = '#ffcf5a';
        c.shadowBlur = 8;
        c.beginPath();
        c.arc(8, -4, 3.6, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#3a0a0a';
        c.beginPath();
        c.arc(9, -4, 1.7, 0, Math.PI * 2);
        c.fill();
        c.restore();
        c.restore();
    }
    overlaps(r) { return this.x < r.x + r.w && this.x + this.w > r.x && this.y < r.y + r.h && this.y + this.h > r.y; }
    hurt(game, amount = 1, pit = false) {
        if (this.invuln > 0 && !pit)
            return;
        this.hp -= amount;
        this.invuln = 1.1;
        game.camera.addTrauma(0.5);
        game.addHitstop(0.06);
        game.audio.sfx('hurt');
        game.particles.hit(this.x + this.w / 2, this.y + this.h / 2, 18);
        if (this.hp <= 0 || pit) {
            this.respawnAtCheckpoint();
            game.flashText(pit ? 'The shrine wind returns you.' : 'The fragment rekindles.');
            game.camera.snap(this.x - 400, this.y - 300);
        }
        else {
            this.vx = -this.facing * 260;
            this.vy = -340;
        }
    }
    draw(game, c) {
        if (game.transformT > 0) {
            this.drawSummon(game, c);
            return;
        }
        if (this.dragonTime > 0) {
            this.drawDragon(game, c);
            return;
        }
        // afterimages
        for (const a of this.afterimages) {
            c.globalAlpha = (a.life / 0.22) * 0.35;
            c.fillStyle = game.world === 'day' ? '#ffd777' : '#a9d6ff';
            c.fillRect(a.x - game.camera.x + 3, a.y - game.camera.y + 3, this.w - 6, this.h - 6);
        }
        c.globalAlpha = 1;
        const sx = this.x - game.camera.x, sy = this.y - game.camera.y;
        const blink = this.invuln > 0 && Math.floor(this.invuln * 18) % 2 === 0;
        if (blink)
            c.globalAlpha = 0.4;
        // run / idle bob
        const speed = Math.abs(this.vx) / MAX_SPEED;
        const bob = this.grounded ? Math.sin(this.animTime * 16) * speed * 2 : 0;
        const idle = this.grounded && speed < 0.05 ? Math.sin(this.animTime * 3) * 1.2 : 0;
        // ---- Sprite path: use AutoSprite sheet when loaded ----
        const sheet = sprites.get('player/' + this.animName);
        if (sheet && sheet.ready) {
            const targetH = this.h * 1.72; // sprite slightly overhangs the AABB
            c.save();
            // shadow under feet
            c.fillStyle = 'rgba(0,0,0,.3)';
            c.beginPath();
            c.ellipse(sx + this.w / 2, sy + this.h - 1, 16, 5, 0, 0, Math.PI * 2);
            c.fill();
            c.translate(sx + this.w / 2, sy + this.h + bob + idle);
            c.scale(this.facing * this.scaleX, this.scaleY);
            sheet.blit(c, sheet.frameAt(this.animClock), targetH, true);
            c.restore();
            // eye-shard glow overlay (keyed to world state), at the chest
            const eyeCol = game.world === 'day' ? '#ffd277' : '#a9d6ff';
            c.save();
            c.globalCompositeOperation = 'lighter';
            c.shadowColor = eyeCol;
            c.shadowBlur = 14;
            c.fillStyle = eyeCol;
            c.beginPath();
            c.arc(sx + this.w / 2 + this.facing * 3, sy + this.h * 0.42 + bob, 2.6 + Math.sin(this.animTime * 6) * 0.6, 0, Math.PI * 2);
            c.fill();
            c.restore();
            this.drawShotFx(game, c);
            if (blink)
                c.globalAlpha = 1;
            return;
        }
        c.save();
        c.translate(sx + this.w / 2, sy + this.h / 2 + bob + idle);
        c.scale(this.facing * this.scaleX, this.scaleY);
        // ---- ASSET HOOK: replace this block with player sprite frame draw ----
        // shadow
        c.fillStyle = 'rgba(0,0,0,.28)';
        c.beginPath();
        c.ellipse(0, 25 / this.scaleY, 15, 5, 0, 0, Math.PI * 2);
        c.fill();
        // robe (gold->red->dark)
        const grad = c.createLinearGradient(0, -22, 0, 24);
        grad.addColorStop(0, '#f7d17a');
        grad.addColorStop(.5, '#a8302e');
        grad.addColorStop(1, '#2b0f19');
        c.fillStyle = grad;
        c.beginPath();
        c.moveTo(-8, -14);
        c.lineTo(10, -10);
        c.lineTo(8, 22);
        c.lineTo(-10, 22);
        c.closePath();
        c.fill();
        // legs (animated)
        const legSwing = this.grounded ? Math.sin(this.animTime * 16) * speed * 6 : 4;
        c.strokeStyle = '#1b0b12';
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(-4, 20);
        c.lineTo(-8, 28 + (this.grounded ? legSwing : 0));
        c.moveTo(5, 20);
        c.lineTo(9, 28 - (this.grounded ? legSwing : 0));
        c.stroke();
        // head
        c.fillStyle = '#f1c28f';
        c.beginPath();
        c.arc(0, -20, 8, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#1b0b12';
        c.fillRect(-7, -27, 14, 7);
        // eye-shard glow (colored by world)
        const eyeCol = game.world === 'day' ? '#ffd277' : '#a9d6ff';
        c.fillStyle = eyeCol;
        c.shadowColor = game.world === 'day' ? '#ffb83b' : '#8bd2ff';
        c.shadowBlur = 16;
        c.beginPath();
        c.arc(6, -13, 3, 0, Math.PI * 2);
        c.fill();
        c.fillRect(9, -13, 12, 3);
        c.shadowBlur = 0;
        // ---- END ASSET HOOK ----
        c.restore();
        c.globalAlpha = 1;
        this.drawShotFx(game, c);
    }
    drawShotFx(game, c) {
        const sx = this.x - game.camera.x, sy = this.y - game.camera.y;
        const [dx, dy] = this.aim(game);
        const cx = sx + this.w / 2, cy = sy + this.h * 0.42;
        if (this.charging && this.chargeT > 0.12) {
            const cr = Math.min(1, this.chargeT / 0.5);
            const gx = cx + dx * 20, gy = cy + dy * 14, rad = 9 + cr * 16;
            c.save();
            c.globalCompositeOperation = 'lighter';
            const g = c.createRadialGradient(gx, gy, 0, gx, gy, rad);
            g.addColorStop(0, cr >= 1 ? '#ffe08a' : '#ff9d4d');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = g;
            c.beginPath();
            c.arc(gx, gy, rad, 0, Math.PI * 2);
            c.fill();
            c.restore();
        }
        if (this.attackTimer > 0) {
            const t = this.attackTimer / 0.24;
            const mx = cx + dx * 18, my = cy + dy * 12;
            c.save();
            c.globalCompositeOperation = 'lighter';
            c.globalAlpha = t;
            c.fillStyle = game.world === 'day' ? '#ffe7a7' : '#bbe7ff';
            c.beginPath();
            c.arc(mx, my, 5 + t * 5, 0, Math.PI * 2);
            c.fill();
            c.restore();
            c.globalAlpha = 1;
        }
    }
}
//# sourceMappingURL=player.js.map
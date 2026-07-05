// The shrine runner: responsive platformer feel — coyote time, jump buffering,
// variable + apex-hang jump, corner correction, wall slide/jump, dash with
// afterimages, and squash/stretch juice.
import { clamp, lerp, rand, damp } from './math.js';
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
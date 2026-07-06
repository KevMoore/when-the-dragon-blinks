// The shrine runner: responsive platformer feel — coyote time, jump buffering,
// variable + apex-hang jump, corner correction, wall slide/jump, dash with
// afterimages, and squash/stretch juice.
import { clamp, lerp, rand, damp, mixHex, overlap } from './math.js';
import { GRAVITY, TILE } from './types.js';
import { sprites, stills } from './sprites.js';
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
        this.dragonBank = 0; // climb/dive tilt for smooth banking
        this.crouching = false;
        this.wallDir = 0; // -1 wall on left, 1 on right, 0 none
        this.wallLock = 0; // brief control lock after a wall jump
        this.afterimages = [];
        this.dead = false;
    }
    rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
    /** Unit aim direction from held inputs (straight, up, diagonal, down-in-air). */
    // Fire along whatever angle the stick is pushed from centre (full analog);
    // keyboard / d-pad falls back to 8-way. Neutral → straight ahead.
    aim(game) {
        const i = game.input;
        let dx = 0, dy = 0;
        if (Math.hypot(i.stickX, i.stickY) > 0.3) {
            dx = i.stickX;
            dy = i.stickY;
        } // analog stick angle
        else {
            if (i.down('left'))
                dx -= 1;
            if (i.down('right'))
                dx += 1;
            if (i.down('up'))
                dy -= 1;
            if (i.down('down'))
                dy += 1;
        }
        if (this.grounded && dy > 0)
            dy = 0; // can't fire into the floor you stand on
        if (dx === 0 && dy === 0) {
            dx = this.facing;
            dy = 0;
        }
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
        this.h = 42;
        this.crouching = false;
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
        const mx = this.wallLock <= 0 ? input.moveX() : 0; // analog: stick tilt scales speed
        const moving = Math.abs(mx) > 0.04;
        const left = mx < -0.05, right = mx > 0.05;
        const wasGrounded = this.grounded;
        // horizontal accel / friction
        // crouch: hold Down on the ground → shrink hitbox, move slow, fire low
        const wantCrouch = this.grounded && input.down('down') && this.dashTime <= 0;
        if (wantCrouch && !this.crouching) {
            this.y += 14;
            this.h = 28;
            this.crouching = true;
        }
        else if (!wantCrouch && this.crouching) {
            if (!game.overlapsSolid({ x: this.x, y: this.y - 14, w: this.w, h: 42 })) {
                this.y -= 14;
                this.h = 42;
                this.crouching = false;
            }
        }
        const crouchMul = this.crouching ? 0.45 : 1;
        const accel = this.grounded ? (this.crouching ? RUN_ACCEL * 0.5 : RUN_ACCEL) : AIR_ACCEL;
        if (moving) {
            this.vx += Math.sign(mx) * accel * dt;
            this.facing = mx < 0 ? -1 : 1;
        }
        else
            this.vx = lerp(this.vx, 0, this.grounded ? 0.26 : 0.06);
        // the further you push the dial, the faster you run: a slow creep near
        // centre ramping to a full sprint at the rim (keys/d-pad report 1 → sprint)
        const spd = Math.min(1, Math.abs(mx));
        const cap = MAX_SPEED * crouchMul * (moving ? 0.24 + 0.94 * spd : 1.18);
        this.vx = clamp(this.vx, -cap, cap);
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
                // NOVA: with inner energy full, a sustained hold unleashes a radial burst
                if (game.nova >= 1 && this.chargeT >= 0.75) {
                    game.fireNova(this);
                    this.charging = false;
                    this.chargeT = 0;
                }
                else if (this.chargeT > 0.5 && Math.random() < 0.5) {
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
        const desired = this.crouching ? 'crouch'
            : this.attackTimer > 0 ? 'attack'
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
        // analog flight: stick vector (or keys), with momentum so it glides & banks
        let ax = 0, ay = 0;
        if (Math.hypot(i.stickX, i.stickY) > 0.12) {
            ax = clamp(i.stickX, -1, 1);
            ay = clamp(i.stickY, -1, 1);
        }
        else {
            ax = (i.down('right') ? 1 : 0) - (i.down('left') ? 1 : 0);
            ay = (i.down('down') ? 1 : 0) - (i.down('up') ? 1 : 0);
        }
        const sp = 445;
        this.vx = damp(this.vx, ax * sp, 5.5, dt);
        this.vy = damp(this.vy, ay * sp, 5.5, dt);
        const dy = ay; // aim (for fire below)
        if (Math.abs(this.vx) > 24)
            this.facing = this.vx < 0 ? -1 : 1;
        this.dragonBank = damp(this.dragonBank, clamp(this.vy / sp, -1, 1) * 0.5, 6, dt); // climb/dive tilt
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
            game.dragonMeter = 0; // fully spent — earn the next transform from scratch
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
            // flowing serpentine body: a tapering fire-ribbon along the flight trail
            const pts = [];
            for (let i = 0; i < trail.length; i += 2) {
                const p = trail[i];
                if (p)
                    pts.push({ x: p.x - cam.x, y: p.y - cam.y });
            }
            c.save();
            c.lineCap = 'round';
            c.lineJoin = 'round';
            c.globalCompositeOperation = 'lighter'; // outer fire glow
            for (let k = 1; k < pts.length; k++) {
                const t = 1 - k / pts.length;
                c.strokeStyle = `rgba(255,${(120 + 120 * t) | 0},${(50 * t) | 0},${0.36 * t + 0.07})`;
                c.lineWidth = 24 * t + 4;
                c.beginPath();
                c.moveTo(pts[k - 1].x, pts[k - 1].y);
                c.lineTo(pts[k].x, pts[k].y);
                c.stroke();
            }
            c.globalCompositeOperation = 'source-over'; // solid tapering body
            for (let k = 1; k < pts.length; k++) {
                const t = 1 - k / pts.length;
                c.strokeStyle = mixHex('#6e1207', '#ffb347', t);
                c.lineWidth = 13 * t + 2.5;
                c.beginPath();
                c.moveTo(pts[k - 1].x, pts[k - 1].y);
                c.lineTo(pts[k].x, pts[k].y);
                c.stroke();
            }
            for (let k = 3; k < pts.length - 1; k += 3) { // dorsal fin-spikes
                const t = 1 - k / pts.length;
                if (t < 0.2)
                    continue;
                const a = pts[k - 1], b = pts[k], ddx = b.x - a.x, ddy = b.y - a.y, L = Math.hypot(ddx, ddy) || 1, s = 8 * t;
                c.fillStyle = '#ffd877';
                c.beginPath();
                c.moveTo(b.x - ddx / L * 4, b.y - ddy / L * 4);
                c.lineTo(b.x - ddy / L * s, b.y + ddx / L * s);
                c.lineTo(b.x + ddx / L * 4, b.y + ddy / L * 4);
                c.closePath();
                c.fill();
            }
            c.restore();
            c.globalAlpha = 1;
            c.shadowBlur = 0;
            // head sprite, banked to the flight angle
            const hx = this.x + this.w / 2 - cam.x, hy = this.y + this.h / 2 - cam.y;
            c.save();
            c.translate(hx, hy);
            c.rotate(this.dragonBank * this.facing);
            c.scale(this.facing, 1);
            c.shadowColor = '#ff8b3a';
            c.shadowBlur = 20;
            sheet.blit(c, sheet.frameAt(this.animTime), 112, false);
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
        if (this.dragonTime > 0)
            return; // Zhulong incarnate — nothing touches the dragon
        if (this.invuln > 0 && !pit)
            return;
        this.hp -= amount;
        this.invuln = 1.1;
        game.eyeReact = 1; // the dragon flinches when you are struck
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
    // Shadow stays on the ground and shrinks/fades as the player rises.
    drawGroundShadow(game, c) {
        const gy = game.groundYBelow(this.x, this.w, this.y + this.h);
        const gap = Math.max(0, gy - (this.y + this.h));
        const s = clamp(1 - gap / 320, 0.32, 1);
        const sx = this.x + this.w / 2 - game.camera.x, sy = gy - game.camera.y;
        c.save();
        c.globalAlpha = 0.32 * s;
        c.fillStyle = '#000';
        c.beginPath();
        c.ellipse(sx, sy - 1, 16 * s, 5 * s, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
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
        this.drawGroundShadow(game, c);
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
        // ---- Directional aim pose: while firing up/down/diagonally, show the
        // matching AutoSprite pose (falls through to the attack sheet for forward) ----
        const aimKey = this.attackTimer > 0 ? this.aimPoseKey(game) : '';
        if (aimKey && stills[aimKey]?.ready) {
            c.save();
            c.translate(sx + this.w / 2, sy + this.h + bob + idle);
            c.scale(this.facing * this.scaleX, this.scaleY);
            stills[aimKey].draw(c, 0, 0, 76, true);
            c.restore();
            const eyeCol = game.world === 'day' ? '#ffd277' : '#a9d6ff';
            c.save();
            c.globalCompositeOperation = 'lighter';
            c.shadowColor = eyeCol;
            c.shadowBlur = 14;
            c.fillStyle = eyeCol;
            c.beginPath();
            c.arc(sx + this.w / 2 + this.facing * 3, sy + this.h * 0.42 + bob, 2.6, 0, Math.PI * 2);
            c.fill();
            c.restore();
            this.drawShotFx(game, c);
            if (blink)
                c.globalAlpha = 1;
            return;
        }
        // ---- Sprite path: use AutoSprite sheet when loaded ----
        const sheet = sprites.get('player/' + this.animName);
        if (sheet && sheet.ready) {
            const targetH = 72; // constant so crouch doesn't shrink the sprite
            c.save();
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
    // bucket the aim elevation into a directional pose (empty = fire forward)
    aimPoseKey(game) {
        const [dx, dy] = this.aim(game);
        const el = Math.atan2(dy, Math.max(1e-4, Math.abs(dx))); // -π/2 up .. +π/2 down
        if (el < -1.02)
            return 'aimup';
        if (el < -0.39)
            return 'aimupdiag';
        if (el > 1.02)
            return 'aimdown';
        if (el > 0.39)
            return 'aimdowndiag';
        return '';
    }
    drawShotFx(game, c) {
        const sx = this.x - game.camera.x, sy = this.y - game.camera.y;
        const [dx, dy] = this.aim(game);
        const cx = sx + this.w / 2, cy = sy + this.h * 0.42;
        // aim reticle: show the exact line dragon-light will travel while aiming
        const aiming = this.attackTimer > 0 || Math.hypot(game.input.stickX, game.input.stickY) > 0.3;
        if (aiming) {
            const rx = cx + dx * 36, ry = cy + dy * 36;
            c.save();
            c.globalAlpha = 0.55;
            c.strokeStyle = game.world === 'day' ? '#ffd777' : '#a9d6ff';
            c.lineWidth = 1.5;
            c.beginPath();
            c.arc(rx, ry, 4.5, 0, Math.PI * 2);
            c.stroke();
            c.globalAlpha = 0.3;
            c.beginPath();
            c.moveTo(cx + dx * 18, cy + dy * 18);
            c.lineTo(rx - dx * 7, ry - dy * 7);
            c.stroke();
            c.restore();
            c.globalAlpha = 1;
        }
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
            const mx = cx + dx * 16, my = cy + dy * 12;
            c.save();
            c.globalCompositeOperation = 'lighter';
            c.globalAlpha = t;
            c.translate(mx, my);
            c.rotate(Math.atan2(dy, dx));
            c.fillStyle = game.world === 'day' ? '#ffe7a7' : '#bbe7ff';
            // elongated flash pointing exactly the way you're firing
            c.beginPath();
            c.moveTo(0, -3 - t * 2);
            c.lineTo(20 * t + 8, 0);
            c.lineTo(0, 3 + t * 2);
            c.closePath();
            c.fill();
            c.beginPath();
            c.arc(0, 0, 4 + t * 4, 0, Math.PI * 2);
            c.fill();
            c.restore();
            c.globalAlpha = 1;
        }
    }
}
//# sourceMappingURL=player.js.map
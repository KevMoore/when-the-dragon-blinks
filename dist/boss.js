// The Lantern Eater — an original boss. Its lantern mask stays shut (invulnerable)
// while it charges and attacks, then opens during recovery. You can only wound the
// exposed eye while the world is at NIGHT — so the fight forces you to blink.
import { centerX, centerY, clamp, overlap, rand } from './math.js';
import { sprites } from './sprites.js';
export class LanternEater {
    constructor() {
        this.x = 700;
        this.y = 180;
        this.w = 137;
        this.h = 164; // ~35% smaller (fits mobile/tablet)
        this.hp = 30;
        this.maxHp = 30;
        this.alive = true;
        this.state = 'intro';
        this.stateT = 1.4;
        this.attack = 'barrage';
        this.hurtFlash = 0;
        this.maskOpen = 0; // 0..1 openness of the mask (eye exposure)
        this.homeX = 700;
        this.time = 0;
        this.phase = 1;
    }
    bodyRect() { return { x: this.x + this.w * 0.16, y: this.y + this.h * 0.24, w: this.w * 0.68, h: this.h * 0.6 }; }
    // generous sweet spot (easier to land the hit), scaled a touch with the boss
    eyeRect() { const w = 96, h = 88; return { x: this.x + this.w / 2 - w / 2, y: this.y + this.h * 0.06, w, h }; }
    get vulnerable() { return this.state === 'recover' && this.maskOpen > 0.45; }
    update(game, dt) {
        if (!this.alive)
            return;
        this.time += dt;
        this.hurtFlash = Math.max(0, this.hurtFlash - dt);
        this.phase = this.hp <= this.maxHp / 3 ? 3 : this.hp <= (this.maxHp * 2) / 3 ? 2 : 1;
        // idle float + drift toward a home offset above the player
        const targetX = clamp(centerX(game.player.rect()) - this.w / 2, 96, game.level.width * 32 - this.w - 96);
        this.x += (targetX - this.x) * (this.state === 'attack' ? 0.005 : 0.02);
        this.y = 150 + Math.sin(this.time * 1.3) * 16;
        this.stateT -= dt;
        // mask openness follows recovery
        const wantOpen = this.state === 'recover' ? 1 : this.state === 'telegraph' ? 0.25 : 0;
        this.maskOpen += (wantOpen - this.maskOpen) * Math.min(1, dt * 8);
        switch (this.state) {
            case 'intro':
                if (this.stateT <= 0)
                    this.enter('idle', 0.6);
                break;
            case 'idle':
                if (this.stateT <= 0)
                    this.beginTelegraph(game);
                break;
            case 'telegraph':
                if (this.stateT <= 0) {
                    this.doAttack(game);
                    this.enter('attack', 0.5);
                }
                break;
            case 'attack':
                if (this.stateT <= 0)
                    this.enter('recover', this.phase === 3 ? 1.3 : 1.7);
                break;
            case 'recover':
                // damage now comes from player bolts hitting the exposed eye (see Game.updateProjectiles)
                if (this.stateT <= 0)
                    this.enter('idle', this.phase === 3 ? 0.3 : 0.7);
                break;
        }
        // contact damage from the body
        if (overlap(this.bodyRect(), game.player.rect()))
            game.player.hurt(game);
    }
    enter(s, t) { this.state = s; this.stateT = t; }
    beginTelegraph(game) {
        // choose an attack for this phase
        const pool = this.phase === 1 ? ['barrage', 'slam']
            : this.phase === 2 ? ['barrage', 'slam', 'summon']
                : ['barrage', 'slam', 'rain', 'summon'];
        this.attack = pool[Math.floor(rand(0, pool.length))];
        this.enter('telegraph', this.phase === 3 ? 0.55 : 0.8);
        game.audio.sfx('boss');
        // phase 2+ occasionally forces a blink to keep the player honest
        if (this.phase >= 2 && Math.random() < 0.4)
            game.tryToggleWorld(true);
    }
    doAttack(game) {
        const p = game.player;
        game.camera.addTrauma(0.4);
        if (this.attack === 'barrage') {
            const count = 3 + this.phase;
            const base = Math.atan2(centerY(p.rect()) - (this.y + 70), centerX(p.rect()) - centerX(this.bodyRect()));
            for (let i = 0; i < count; i++) {
                const ang = base + (i - (count - 1) / 2) * 0.24;
                const sp = 200 + this.phase * 26;
                game.projectiles.push({ x: centerX(this.bodyRect()), y: this.y + 70, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 10, life: 4, kind: 'lantern', hostile: true });
            }
            game.audio.sfx('boss');
        }
        else if (this.attack === 'slam') {
            // shockwave rolling both ways along the floor
            game.camera.addTrauma(0.8);
            game.addHitstop(0.05);
            const floorY = game.level.height * 32 - 2 * 32 - 14;
            for (const dir of [-1, 1]) {
                game.projectiles.push({ x: centerX(this.bodyRect()), y: floorY, vx: dir * 300, vy: 0, r: 14, life: 3, kind: 'lantern', hostile: true });
            }
            game.particles.ring(centerX(this.bodyRect()), floorY, 20, 240, '#ff8b44');
        }
        else if (this.attack === 'rain') {
            const w = game.level.width * 32;
            for (let i = 0; i < 6; i++) {
                const rx = rand(120, w - 120);
                game.projectiles.push({ x: rx, y: this.y, vx: rand(-30, 30), vy: 180, r: 9, life: 5, kind: 'lantern', hostile: true });
            }
        }
        else if (this.attack === 'summon') {
            game.spawnEnemy(game.world === 'night' ? 'wisp' : 'moth', this.x + 20, this.y + 90);
            game.spawnEnemy(game.world === 'night' ? 'wisp' : 'moth', this.x + this.w - 40, this.y + 90);
            game.particles.sparks(centerX(this.bodyRect()), centerY(this.bodyRect()), 20, '#d94a3a');
        }
    }
    /** Called by Game when a player bolt strikes the exposed eye. */
    wound(game, dmg = 1) {
        if (!this.vulnerable)
            return;
        this.hp -= dmg;
        this.hurtFlash = 0.16;
        this.stateT = Math.min(this.stateT, 0.25); // knocked back out of recovery
        // the storm answers — a bolt cracks down onto the wounded Eater
        game.lightningT = 0.26;
        game.lightningX = this.x + this.w / 2 - game.camera.x;
        game.lightningY = this.y + this.h * 0.4 - game.camera.y;
        game.flash = Math.max(game.flash, 0.45);
        game.flashColor = '#e6eeff';
        game.camera.addTrauma(0.5);
        game.addHitstop(0.07);
        game.particles.hit(centerX(this.eyeRect()), centerY(this.eyeRect()), 26, '#a9d6ff');
        game.audio.sfx('bosshit');
        if (this.hp <= 0) {
            this.alive = false;
            game.particles.hit(centerX(this.bodyRect()), centerY(this.bodyRect()), 90, '#ffd777');
            game.camera.addTrauma(1);
            game.onBossDefeated();
        }
    }
    draw(game, c) {
        if (!this.alive)
            return;
        const sx = this.x - game.camera.x, sy = this.y - game.camera.y;
        const telegraphNow = this.state === 'telegraph';
        // ---- Sprite path ----
        const anim = this.maskOpen > 0.3 ? 'attack' : 'idle';
        const sheet = sprites.get('boss/' + anim) || sprites.get('boss/idle');
        if (sheet && sheet.ready) {
            const face = centerX(game.player.rect()) < centerX(this.bodyRect()) ? -1 : 1;
            const targetH = this.h * 1.2 * game.spriteScale;
            c.save();
            c.globalAlpha = this.hurtFlash > 0 ? 0.7 : 1;
            // aura keyed to state
            c.shadowColor = this.vulnerable ? '#a9d6ff' : telegraphNow ? '#ffcf7a' : '#ff8b44';
            c.shadowBlur = telegraphNow ? 30 + Math.sin(this.time * 30) * 10 : this.vulnerable ? 28 : 16;
            c.translate(sx + this.w / 2, sy + this.h / 2);
            c.scale(face, 1);
            sheet.blit(c, sheet.frameAt(this.time), targetH, false);
            c.restore();
            // exposed-eye highlight when vulnerable
            if (this.vulnerable) {
                c.save();
                c.globalCompositeOperation = 'lighter';
                const g = c.createRadialGradient(sx + this.w / 2, sy + 44, 0, sx + this.w / 2, sy + 44, 60);
                g.addColorStop(0, 'rgba(140,210,255,.8)');
                g.addColorStop(1, 'rgba(0,0,0,0)');
                c.fillStyle = g;
                c.beginPath();
                c.arc(sx + this.w / 2, sy + 44, 60, 0, Math.PI * 2);
                c.fill();
                c.restore();
            }
            c.globalAlpha = 1;
            if (telegraphNow) {
                c.save();
                c.globalAlpha = 0.6 + Math.sin(this.time * 24) * 0.4;
                c.fillStyle = '#ffcf7a';
                c.font = 'bold 40px Georgia';
                c.textAlign = 'center';
                c.fillText('!', sx + this.w / 2, sy - 14);
                c.restore();
            }
            return;
        }
        c.save();
        c.translate(sx + this.w / 2, sy + this.h / 2);
        c.scale(this.w / 130, this.h / 158);
        const telegraph = this.state === 'telegraph';
        c.globalAlpha = this.hurtFlash > 0 ? 0.7 : 1;
        // smoky body
        c.shadowColor = this.vulnerable ? '#a9d6ff' : telegraph ? '#ffcf7a' : '#ff8b44';
        c.shadowBlur = telegraph ? 34 + Math.sin(this.time * 30) * 10 : this.vulnerable ? 30 : 18;
        const body = c.createRadialGradient(0, 0, 10, 0, 0, 84);
        body.addColorStop(0, this.vulnerable ? '#355472' : '#4a171c');
        body.addColorStop(1, '#08050d');
        c.fillStyle = body;
        c.beginPath();
        c.moveTo(-48, -50);
        c.bezierCurveTo(-90, -10, -68, 80, 0, 80);
        c.bezierCurveTo(72, 80, 90, -22, 48, -50);
        c.bezierCurveTo(26, -76, -24, -76, -48, -50);
        c.fill();
        c.shadowBlur = 0;
        // lantern mask; two halves slide apart as the eye opens
        const open = this.maskOpen * 20;
        c.fillStyle = this.vulnerable ? '#e7f8ff' : '#f0b752';
        c.beginPath();
        c.roundRect(-38 - open, -44, 40, 58, 12);
        c.fill();
        c.beginPath();
        c.roundRect(-2 + open, -44, 40, 58, 12);
        c.fill();
        // exposed eye
        if (this.maskOpen > 0.15) {
            c.save();
            c.globalAlpha = this.maskOpen;
            c.shadowColor = this.vulnerable ? '#8bd2ff' : '#d94a3a';
            c.shadowBlur = 22;
            c.fillStyle = '#150910';
            c.beginPath();
            c.ellipse(0, -14, 20, 22, 0, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = this.vulnerable ? '#8bd2ff' : '#d94a3a';
            c.beginPath();
            c.arc(0, -14, this.vulnerable ? 11 : 7, 0, Math.PI * 2);
            c.fill();
            c.restore();
        }
        // smoky arms
        c.strokeStyle = 'rgba(20,8,18,.82)';
        c.lineWidth = 15;
        c.lineCap = 'round';
        const sway = Math.sin(this.time * 2) * 8;
        c.beginPath();
        c.moveTo(-44, 12);
        c.bezierCurveTo(-94, 22 + sway, -96, 66, -60, 80);
        c.moveTo(44, 12);
        c.bezierCurveTo(94, 22 - sway, 96, 66, 60, 80);
        c.stroke();
        c.restore();
        c.globalAlpha = 1;
        // telegraph exclamation above head
        if (telegraph) {
            c.save();
            c.globalAlpha = 0.6 + Math.sin(this.time * 24) * 0.4;
            c.fillStyle = '#ffcf7a';
            c.font = 'bold 40px Georgia';
            c.textAlign = 'center';
            c.fillText('!', sx + this.w / 2, sy - 14);
            c.restore();
        }
    }
}
//# sourceMappingURL=boss.js.map
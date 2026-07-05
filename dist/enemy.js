// Enemy variety, each keyed to the day/night state:
//  moth     — flutters; hunts the player in DAY
//  guardian — stone walker; active in DAY, dormant/harmless at NIGHT
//  wisp     — spirit; hunts and is dangerous at NIGHT
//  sentry   — lantern turret; fires aimed shards in DAY
import { centerX, centerY, overlap, rand } from './math.js';
import { GRAVITY, TILE } from './types.js';
import { sprites } from './sprites.js';
import { lineOfSight, groundBrain, rangedBrain, flyerBrain } from './ai.js';
export class Enemy {
    constructor(kind, x, y) {
        this.w = 28;
        this.h = 28;
        this.vx = 0;
        this.vy = 0;
        this.alive = true;
        this.hp = 2;
        this.phase = Math.random() * 10;
        this.flash = 0;
        this.fireTimer = rand(1, 2.4);
        this.points = 100;
        this.grounded = false;
        this.aggro = 340;
        this.bb = {};
        this.kind = kind;
        this.x = x;
        this.y = y;
        this.baseY = y;
        this.baseX = x;
        if (kind === 'moth')
            this.points = 100;
        if (kind === 'wisp')
            this.points = 120;
        if (kind === 'guardian') {
            this.w = 34;
            this.h = 42;
            this.hp = 3;
            this.points = 200;
        }
        if (kind === 'sentry') {
            this.w = 30;
            this.h = 34;
            this.hp = 3;
            this.points = 150;
        }
        if (kind === 'ghoul') {
            this.w = 32;
            this.h = 46;
            this.hp = 4;
            this.points = 180;
        }
        if (kind === 'skull') {
            this.w = 30;
            this.h = 30;
            this.hp = 2;
            this.points = 140;
        }
        if (kind === 'crawler') {
            this.w = 42;
            this.h = 22;
            this.hp = 2;
            this.points = 120;
        }
        this.brain = kind === 'sentry' ? rangedBrain()
            : (kind === 'ghoul' || kind === 'crawler' || kind === 'guardian') ? groundBrain()
                : flyerBrain();
        this.aggro = kind === 'sentry' ? 420 : kind === 'skull' ? 360 : (kind === 'ghoul' || kind === 'crawler' || kind === 'guardian') ? 300 : 340;
    }
    rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
    // is there solid ground just ahead in `dir` (so a walker won't step into a pit)?
    groundAhead(game, dir) {
        const ax = this.x + this.w / 2 + dir * (this.w / 2 + 5);
        const ch = game.tileAt(Math.floor(ax / TILE), Math.floor((this.y + this.h + 4) / TILE));
        return ch === '#' || ch === 'g' || ch === 'D' || ch === 'N' || ch === 'o';
    }
    update(game, dt) {
        if (!this.alive)
            return;
        if (this.y > game.level.height * TILE + 80) {
            this.alive = false;
            return;
        } // fell out of the world
        this.flash = Math.max(0, this.flash - dt);
        const p = game.player;
        // Day/Night dormancy: stone guardians sleep at night, solar moths at night,
        // spirit wisps by day. Everything else runs its GOAP brain continuously.
        const dormant = (this.kind === 'guardian' && game.world !== 'day')
            || (this.kind === 'moth' && game.world !== 'day')
            || (this.kind === 'wisp' && game.world !== 'night');
        if (dormant) {
            if (this.kind === 'guardian') {
                this.vy += GRAVITY * dt;
                game.moveEntity(this, 0, this.vy * dt);
            }
            else
                this.y = this.baseY + Math.sin(game.time * 2 + this.phase) * 22;
        }
        else {
            const dx = centerX(p.rect()) - centerX(this.rect()), dy = centerY(p.rect()) - centerY(this.rect());
            const dist = Math.hypot(dx, dy);
            if (dist > this.aggro * game.difficulty) {
                // out of aggro range — wait quietly until the player draws near
                if (this.kind === 'ghoul' || this.kind === 'crawler' || this.kind === 'guardian') {
                    this.vy += GRAVITY * dt;
                    game.moveEntity(this, 0, this.vy * dt);
                }
                else
                    this.y = this.baseY + Math.sin(game.time * 2 + this.phase) * 14;
            }
            else {
                const los = lineOfSight(game, centerX(this.rect()), centerY(this.rect()), centerX(p.rect()), centerY(p.rect()));
                this.brain.update({ e: this, game, dx, dy, dist, los, bb: this.bb }, dt);
            }
        }
        const dangerous = this.dangerous(game);
        if (dangerous && overlap(this.rect(), p.rect()))
            p.hurt(game);
        // dash-through damage (bolts are handled centrally in Game.updateProjectiles)
        if (p.dashTime > 0 && overlap(this.rect(), p.rect()))
            this.hit(game, p.facing);
    }
    dangerous(game) {
        if (this.kind === 'guardian')
            return game.world === 'day';
        if (this.kind === 'wisp')
            return game.world === 'night';
        if (this.kind === 'sentry')
            return false; // turret body is harmless; its shards hurt
        return true; // moth always solid to touch (weak in night, but still bumps)
    }
    hit(game, facing, dmg = 1) {
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
    dim(game) {
        if (this.kind === 'wisp')
            return game.world !== 'night';
        if (this.kind === 'ghoul' || this.kind === 'skull' || this.kind === 'crawler')
            return false; // always present
        return game.world !== 'day'; // moth, guardian, sentry are day-active
    }
    // Aura colour ties each enemy to the myth: warm fire for day/solar things,
    // cool spirit-light for night things.
    glowColor(_game) {
        switch (this.kind) {
            case 'wisp':
            case 'skull': return 'rgba(139,210,255,.75)';
            case 'ghoul': return 'rgba(150,224,120,.6)';
            case 'crawler': return 'rgba(255,92,73,.6)';
            case 'sentry':
            case 'moth': return 'rgba(255,157,77,.75)';
            default: return 'rgba(255,207,122,.65)'; // stone guardian
        }
    }
    draw(game, c) {
        if (!this.alive)
            return;
        const sx = this.x - game.camera.x, sy = this.y - game.camera.y;
        // aura so the enemy always reads against terrain (also myth-codes day/night)
        {
            const cx = sx + this.w / 2, cy = sy + this.h / 2, gr = this.w * 1.25;
            c.save();
            c.globalCompositeOperation = 'lighter';
            c.globalAlpha = this.dim(game) ? 0.3 : 0.6;
            const gg = c.createRadialGradient(cx, cy, 0, cx, cy, gr);
            gg.addColorStop(0, this.glowColor(game));
            gg.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = gg;
            c.beginPath();
            c.arc(cx, cy, gr, 0, Math.PI * 2);
            c.fill();
            c.restore();
            c.globalAlpha = 1;
        }
        // ---- Sprite path ----
        let animName = 'idle';
        if (this.kind === 'ghoul' || this.kind === 'crawler')
            animName = 'walk';
        else if (this.kind === 'guardian' && game.world === 'day' && Math.abs(this.vx) > 6)
            animName = 'walk';
        const sheet = sprites.get('enemy/' + this.kind + '/' + animName) || sprites.get('enemy/' + this.kind + '/idle') || sprites.get('enemy/' + this.kind + '/walk');
        if (sheet && sheet.ready) {
            const grounded = this.kind === 'guardian' || this.kind === 'ghoul' || this.kind === 'crawler';
            const targetH = this.h * (this.kind === 'crawler' ? 2.2 : grounded ? 1.7 : 2.1);
            let face = this.vx < -4 ? -1 : this.vx > 4 ? 1 : 1;
            if (this.kind === 'wisp' || this.kind === 'moth' || this.kind === 'skull')
                face = centerX(game.player.rect()) < centerX(this.rect()) ? -1 : 1;
            c.save();
            c.globalAlpha = (this.dim(game) ? 0.62 : 1) * (this.flash > 0 ? 0.7 : 1);
            const cy = grounded ? sy + this.h : sy + this.h / 2;
            c.translate(sx + this.w / 2, cy);
            c.scale(face, 1);
            sheet.blit(c, sheet.frameAt(game.time + this.phase), targetH, grounded);
            c.restore();
            c.globalAlpha = 1;
            return;
        }
        c.save();
        c.translate(sx + this.w / 2, sy + this.h / 2);
        if (this.flash > 0)
            c.globalAlpha = 0.7;
        // ---- ASSET HOOK: swap for enemy sprite frames ----
        if (this.kind === 'moth') {
            const active = game.world === 'day';
            c.globalAlpha *= active ? 1 : 0.45;
            c.fillStyle = active ? '#ffcb57' : '#7d5a6c';
            const flap = 8 + Math.sin(game.time * 20) * 4;
            c.beginPath();
            c.ellipse(-8, 0, 13, flap, 0.4, 0, Math.PI * 2);
            c.fill();
            c.beginPath();
            c.ellipse(8, 0, 13, 16 - flap, -0.4, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = '#2b0f19';
            c.fillRect(-4, -10, 8, 20);
        }
        else if (this.kind === 'wisp') {
            const active = game.world === 'night';
            c.globalAlpha *= active ? 1 : 0.25;
            c.shadowColor = '#93d8ff';
            c.shadowBlur = active ? 22 : 6;
            c.fillStyle = '#b9eaff';
            c.beginPath();
            c.arc(0, 0, 11, 0, Math.PI * 2);
            c.fill();
            c.fillStyle = '#0a0611';
            c.beginPath();
            c.arc(-3, -2, 2, 0, Math.PI * 2);
            c.arc(4, -2, 2, 0, Math.PI * 2);
            c.fill();
        }
        else if (this.kind === 'sentry') {
            const active = game.world === 'day';
            c.globalAlpha *= active ? 1 : 0.5;
            c.fillStyle = '#3a2130';
            c.fillRect(-13, -16, 26, 32);
            c.fillStyle = active ? '#ffb347' : '#4a3a2a';
            c.shadowColor = '#ff8b44';
            c.shadowBlur = active ? 16 : 0;
            c.beginPath();
            c.arc(0, 0, 8 + (active ? Math.sin(game.time * 6) * 1.5 : 0), 0, Math.PI * 2);
            c.fill();
            c.shadowBlur = 0;
        }
        else {
            const active = game.world === 'day';
            c.globalAlpha *= active ? 1 : 0.55;
            c.fillStyle = active ? '#87694c' : '#454253';
            c.fillRect(-16, -21, 32, 42);
            c.fillStyle = active ? '#ffdb78' : '#2c2833';
            c.fillRect(-8, -10, 16, 7);
            c.fillStyle = '#21131b';
            c.fillRect(-11, 18, 8, 9);
            c.fillRect(3, 18, 8, 9);
        }
        // ---- END ASSET HOOK ----
        c.restore();
        c.globalAlpha = 1;
        c.shadowBlur = 0;
    }
}
//# sourceMappingURL=enemy.js.map
// Unified input: keyboard, gamepad, on-screen touch buttons, and pointer.
import { LOGICAL_W, LOGICAL_H } from './types.js';
export class Input {
    constructor(canvas) {
        this.canvas = canvas;
        this.keys = new Set();
        this.pressed = new Set();
        this.touch = new Set();
        this.touchPressed = new Set();
        this.gpButtons = [];
        this.prevGpButtons = [];
        this.axisX = 0;
        this.axisY = 0;
        this.pointer = null;
        this.stickX = 0;
        this.stickY = 0; // left-thumb drag joystick (-1..1)
        this.lastDirTap = {};
        window.addEventListener('keydown', e => {
            const k = e.key.toLowerCase();
            if (!this.keys.has(k))
                this.pressed.add(k);
            this.keys.add(k);
            if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'spacebar'].includes(k))
                e.preventDefault();
        }, { passive: false });
        window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
        window.addEventListener('blur', () => this.keys.clear());
        canvas.addEventListener('pointerdown', e => {
            const p = this.toCanvasPoint(e.clientX, e.clientY);
            this.pointer = { x: p.x, y: p.y, clicked: true };
        });
        const controls = document.getElementById('touch-controls');
        controls?.querySelectorAll('button[data-action]').forEach(btn => {
            const action = btn.dataset.action;
            const down = (e) => {
                e.preventDefault();
                this.touch.add(action);
                this.touchPressed.add(action);
                btn.classList.add('active');
                // double-tap a direction to dash
                if (action === 'left' || action === 'right') {
                    const now = performance.now();
                    if (now - (this.lastDirTap[action] || 0) < 300)
                        this.touchPressed.add('dash');
                    this.lastDirTap[action] = now;
                }
            };
            const up = (e) => { e.preventDefault(); this.touch.delete(action); btn.classList.remove('active'); };
            btn.addEventListener('pointerdown', down);
            btn.addEventListener('pointerup', up);
            btn.addEventListener('pointercancel', up);
            btn.addEventListener('pointerleave', up);
        });
        // left-thumb drag joystick: tilt drives move (X) + aim-up / crouch (Y)
        const zone = document.getElementById('stick-zone');
        const stick = document.getElementById('touch-stick');
        const knob = document.getElementById('stick-knob');
        if (zone && stick && knob && typeof zone.addEventListener === 'function') {
            let sid = null, cxp = 0, cyp = 0, rad = 52, lastTap = 0, prevKey = '';
            const dirEls = {
                up: stick.querySelector('.sdir.up'), down: stick.querySelector('.sdir.down'),
                left: stick.querySelector('.sdir.left'), right: stick.querySelector('.sdir.right'),
            };
            const buzz = (ms) => { try {
                navigator.vibrate?.(ms);
            }
            catch { } };
            // reflect exactly what input the stick registers + a haptic tick per new direction
            const feedback = (sx, sy) => {
                const on = { left: sx < -0.3, right: sx > 0.3, up: sy < -0.5, down: sy > 0.5 };
                let key = '';
                for (const d of ['up', 'down', 'left', 'right']) {
                    dirEls[d]?.classList.toggle('on', on[d]);
                    if (on[d])
                        key += d[0];
                }
                if (key !== prevKey) {
                    if (key.length > prevKey.length)
                        buzz(9);
                    prevKey = key;
                }
            };
            const move = (e) => {
                if (e.pointerId !== sid)
                    return;
                let dx = e.clientX - cxp, dy = e.clientY - cyp;
                const len = Math.hypot(dx, dy) || 1, cl = Math.min(len, rad);
                dx = dx / len * cl;
                dy = dy / len * cl;
                knob.style.transform = `translate(${dx}px, ${dy}px)`;
                this.stickX = dx / rad;
                this.stickY = dy / rad;
                feedback(this.stickX, this.stickY);
                e.preventDefault();
            };
            const start = (e) => {
                sid = e.pointerId;
                const r = stick.getBoundingClientRect();
                cxp = r.left + r.width / 2;
                cyp = r.top + r.height / 2;
                rad = r.width * 0.42;
                const now = performance.now();
                if (now - lastTap < 300) {
                    this.touchPressed.add('dash');
                    buzz(18);
                } // double-tap the stick = dash
                lastTap = now;
                stick.classList.add('pressed');
                buzz(6);
                move(e);
                try {
                    zone.setPointerCapture(e.pointerId);
                }
                catch { }
                e.preventDefault();
            };
            const end = (e) => { if (e.pointerId !== sid)
                return; sid = null; this.stickX = 0; this.stickY = 0; knob.style.transform = 'translate(0,0)'; stick.classList.remove('pressed'); feedback(0, 0); };
            zone.addEventListener('pointerdown', start);
            zone.addEventListener('pointermove', move);
            zone.addEventListener('pointerup', end);
            zone.addEventListener('pointercancel', end);
        }
    }
    toCanvasPoint(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        // account for object-fit: contain letterboxing
        const scale = Math.min(rect.width / LOGICAL_W, rect.height / LOGICAL_H);
        const drawW = LOGICAL_W * scale, drawH = LOGICAL_H * scale;
        const offX = rect.left + (rect.width - drawW) / 2;
        const offY = rect.top + (rect.height - drawH) / 2;
        return { x: (clientX - offX) / scale, y: (clientY - offY) / scale };
    }
    updateGamepad() {
        this.prevGpButtons = this.gpButtons.slice();
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        let gp = null;
        for (const p of pads) {
            if (p) {
                gp = p;
                break;
            }
        }
        this.axisX = 0;
        this.axisY = 0;
        this.gpButtons = [];
        if (!gp)
            return;
        this.axisX = Math.abs(gp.axes[0]) > 0.25 ? gp.axes[0] : 0;
        this.axisY = Math.abs(gp.axes[1]) > 0.35 ? gp.axes[1] : 0;
        this.gpButtons = gp.buttons.map(b => b.pressed);
    }
    // analog horizontal move (-1..1): stick tilt scales speed; keys/dpad = full
    moveX() {
        if (Math.abs(this.stickX) > 0.14)
            return Math.max(-1, Math.min(1, this.stickX / 0.9));
        if (Math.abs(this.axisX) > 0.05)
            return Math.max(-1, Math.min(1, this.axisX));
        const k = this.keys;
        let v = 0;
        if (k.has('a') || k.has('arrowleft') || this.touch.has('left') || !!this.gpButtons[14])
            v -= 1;
        if (k.has('d') || k.has('arrowright') || this.touch.has('right') || !!this.gpButtons[15])
            v += 1;
        return v;
    }
    down(action) {
        const k = this.keys;
        if (action === 'left')
            return k.has('a') || k.has('arrowleft') || this.touch.has('left') || this.stickX < -0.3 || this.axisX < -0.25 || !!this.gpButtons[14];
        if (action === 'right')
            return k.has('d') || k.has('arrowright') || this.touch.has('right') || this.stickX > 0.3 || this.axisX > 0.25 || !!this.gpButtons[15];
        if (action === 'up')
            return k.has('w') || k.has('arrowup') || this.touch.has('up') || this.stickY < -0.5 || this.axisY < -0.4 || !!this.gpButtons[12];
        if (action === 'down')
            return k.has('s') || k.has('arrowdown') || this.touch.has('down') || this.stickY > 0.5 || this.axisY > 0.4 || !!this.gpButtons[13];
        // jump is a dedicated button so Up can be used to aim shots upward
        if (action === 'jump')
            return k.has(' ') || this.touch.has('jump') || !!this.gpButtons[0];
        if (action === 'attack')
            return k.has('j') || k.has('x') || this.touch.has('attack') || !!this.gpButtons[2];
        if (action === 'dash')
            return k.has('shift') || k.has('k') || this.touch.has('dash') || !!this.gpButtons[1];
        if (action === 'toggle')
            return k.has('e') || k.has('c') || k.has('l') || this.touch.has('toggle') || !!this.gpButtons[3] || !!this.gpButtons[4] || !!this.gpButtons[5];
        return false;
    }
    just(action) {
        const p = this.pressed, t = this.touchPressed;
        const gpJust = (i) => !!this.gpButtons[i] && !this.prevGpButtons[i];
        if (action === 'confirm')
            return p.has('enter') || p.has(' ') || t.has('jump') || gpJust(0) || gpJust(9);
        if (action === 'back')
            return p.has('escape') || gpJust(1);
        if (action === 'up')
            return p.has('arrowup') || p.has('w') || gpJust(12);
        if (action === 'down')
            return p.has('arrowdown') || p.has('s') || gpJust(13);
        if (action === 'left')
            return p.has('arrowleft') || p.has('a') || gpJust(14);
        if (action === 'right')
            return p.has('arrowright') || p.has('d') || gpJust(15);
        if (action === 'jump')
            return p.has(' ') || t.has('jump') || gpJust(0);
        if (action === 'attack')
            return p.has('j') || p.has('x') || t.has('attack') || gpJust(2);
        if (action === 'dash')
            return p.has('shift') || p.has('k') || t.has('dash') || gpJust(1);
        if (action === 'toggle')
            return p.has('e') || p.has('c') || p.has('l') || t.has('toggle') || gpJust(3) || gpJust(4) || gpJust(5);
        if (action === 'pause')
            return p.has('escape') || p.has('p') || t.has('pause') || gpJust(9);
        if (action === 'interact')
            return p.has('f') || t.has('interact') || gpJust(12) || gpJust(3);
        if (action === 'debug')
            return p.has('f1');
        if (action === 'codex')
            return p.has('h');
        if (action === 'levelselect')
            return p.has('l');
        return false;
    }
    endFrame() {
        this.pressed.clear();
        this.touchPressed.clear();
        if (this.pointer)
            this.pointer.clicked = false;
    }
}
//# sourceMappingURL=input.js.map
export class AudioManager {
    constructor(settings) {
        this.ctx = null;
        this.master = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.started = false;
        this.droneOscs = [];
        this.padFilter = null;
        this.padGain = null;
        this.world = 'day';
        // ---- streamed music tracks (mp3) ----
        this.musicEls = {};
        this.curKey = null;
        this.pendingKey = null;
        this.unlocked = false;
        this.fadeTimer = null;
        this.settings = settings;
        for (const k of ['startscreen', 'gameplay', 'bossman', 'dragon']) {
            try {
                const el = new Audio('assets/audio/' + k + '.mp3');
                el.loop = true;
                el.preload = 'auto';
                el.volume = 0;
                this.musicEls[k] = el;
            }
            catch { }
        }
        // Browsers require a user gesture before audio can start.
        const kick = () => { this.ensure(); this.unlocked = true; if (this.pendingKey)
            this.playMusic(this.pendingKey); };
        window.addEventListener('pointerdown', kick);
        window.addEventListener('keydown', kick);
    }
    // ---- music ----
    musicLevel() { return this.settings.music ? this.settings.master * 0.6 : 0; }
    playMusic(key) {
        this.pendingKey = key;
        if (!this.unlocked)
            return;
        if (!this.settings.music) {
            this.stopMusic();
            return;
        }
        if (this.curKey === key) {
            const el = this.musicEls[key];
            if (el) {
                if (el.paused)
                    el.play().catch(() => { });
                el.volume = this.musicLevel();
            }
            return;
        }
        const next = this.musicEls[key];
        if (!next)
            return;
        const prev = this.curKey ? this.musicEls[this.curKey] : null;
        this.curKey = key;
        if (key === 'dragon' || key === 'bossman')
            next.currentTime = 0; // stings restart
        next.volume = 0;
        next.play().catch(() => { });
        this.crossfade(prev, next);
    }
    crossfade(prev, next) {
        if (this.fadeTimer)
            clearInterval(this.fadeTimer);
        const target = this.musicLevel();
        let t = 0;
        this.fadeTimer = setInterval(() => {
            t += 0.06;
            const p = Math.min(1, t / 0.8);
            next.volume = target * p;
            if (prev && prev !== next)
                prev.volume = Math.max(0, target * (1 - p));
            if (p >= 1) {
                clearInterval(this.fadeTimer);
                this.fadeTimer = null;
                if (prev && prev !== next)
                    prev.pause();
            }
        }, 60);
    }
    stopMusic() { for (const k in this.musicEls)
        this.musicEls[k].pause(); this.curKey = null; if (this.fadeTimer) {
        clearInterval(this.fadeTimer);
        this.fadeTimer = null;
    } }
    ensure() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended')
                this.ctx.resume();
            return;
        }
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.master = this.ctx.createGain();
            this.master.gain.value = this.settings.master;
            this.master.connect(this.ctx.destination);
            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = this.settings.music ? 1 : 0;
            this.musicGain.connect(this.master);
            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = 1;
            this.sfxGain.connect(this.master);
        }
        catch {
            this.ctx = null;
        }
    }
    applySettings() {
        if (this.master)
            this.master.gain.value = this.settings.master;
        if (!this.settings.music)
            this.stopMusic();
        else if (this.curKey) {
            const el = this.musicEls[this.curKey];
            if (el) {
                el.volume = this.musicLevel();
                if (el.paused)
                    el.play().catch(() => { });
            }
        }
        else if (this.pendingKey && this.unlocked)
            this.playMusic(this.pendingKey);
    }
    // ---- Ambient music bed -------------------------------------------------
    startMusic() {
        if (this.started || !this.ctx || !this.musicGain)
            return;
        this.started = true;
        const ac = this.ctx;
        this.padGain = ac.createGain();
        this.padGain.gain.value = 0.16;
        this.padFilter = ac.createBiquadFilter();
        this.padFilter.type = 'lowpass';
        this.padFilter.frequency.value = 700;
        this.padFilter.Q.value = 3;
        this.padGain.connect(this.musicGain);
        this.padFilter.connect(this.padGain);
        // A soft stacked drone (root, fifth, octave) — a pentatonic-friendly chord.
        const freqs = [98, 147, 196, 294];
        for (const f of freqs) {
            const o = ac.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = f;
            const og = ac.createGain();
            og.gain.value = 0.25;
            o.connect(og);
            og.connect(this.padFilter);
            // slow detune shimmer
            const lfo = ac.createOscillator();
            lfo.frequency.value = 0.07 + Math.random() * 0.05;
            const lg = ac.createGain();
            lg.gain.value = 2.5;
            lfo.connect(lg);
            lg.connect(o.detune);
            o.start();
            lfo.start();
            this.droneOscs.push(o, lfo);
        }
        this.setWorld(this.world, true);
    }
    setWorld(w, instant = false) {
        this.world = w;
        if (!this.ctx || !this.padFilter || !this.padGain)
            return;
        const now = this.ctx.currentTime;
        const cutoff = w === 'day' ? 1100 : 480;
        const level = w === 'day' ? 0.18 : 0.13;
        const tc = instant ? 0.01 : 0.6;
        this.padFilter.frequency.setTargetAtTime(cutoff, now, tc);
        this.padGain.gain.setTargetAtTime(level, now, tc);
    }
    // ---- One-shot SFX ------------------------------------------------------
    sfx(name) {
        this.ensure();
        const ac = this.ctx;
        if (!ac || !this.sfxGain)
            return;
        const now = ac.currentTime;
        switch (name) {
            case 'jump': return this.blip(now, 300, 620, 0.12, 'triangle', 0.35);
            case 'land': return this.noise(now, 0.09, 900, 0.25);
            case 'attack': return this.blip(now, 680, 220, 0.13, 'sawtooth', 0.3);
            case 'toggle': return this.sweep(now, 220, 880, 0.35, 0.4);
            case 'hurt': return this.blip(now, 200, 70, 0.22, 'square', 0.4);
            case 'collect': return this.arp(now, [660, 880, 1320], 0.09, 0.3);
            case 'checkpoint': return this.arp(now, [523, 784], 0.14, 0.3);
            case 'shrine': return this.arp(now, [392, 523, 659, 784], 0.16, 0.24);
            case 'boss': return this.blip(now, 90, 55, 0.3, 'sawtooth', 0.45);
            case 'bosshit': return this.noise(now, 0.14, 1600, 0.4);
            case 'menu': return this.blip(now, 520, 560, 0.05, 'sine', 0.25);
            case 'victory': return this.arp(now, [523, 659, 784, 1047, 1319], 0.14, 0.34);
        }
    }
    // A plucked-string tone for the guqin mini-game (soft attack, long decay).
    pluck(freq, gain = 0.5) {
        this.ensure();
        const ac = this.ctx;
        if (!ac || !this.sfxGain)
            return;
        const now = ac.currentTime;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(gain, now + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
        g.connect(this.sfxGain);
        const parts = [['triangle', 1, 0.6], ['sine', 2, 0.22], ['sine', 3, 0.12]];
        for (const [type, mul, gg] of parts) {
            const o = ac.createOscillator();
            o.type = type;
            o.frequency.setValueAtTime(freq * mul, now);
            o.frequency.exponentialRampToValueAtTime(freq * mul * 0.992, now + 0.5);
            const og = ac.createGain();
            og.gain.value = gg;
            o.connect(og);
            og.connect(g);
            o.start(now);
            o.stop(now + 1.25);
        }
    }
    env(node, now, len, peak) {
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(peak, now + Math.min(0.02, len * 0.3));
        g.gain.exponentialRampToValueAtTime(0.0001, now + len);
        node.connect(g);
        g.connect(this.sfxGain);
        return g;
    }
    blip(now, f0, f1, len, type, peak) {
        const o = this.ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f0, now);
        o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), now + len);
        this.env(o, now, len, peak);
        o.start(now);
        o.stop(now + len + 0.03);
    }
    sweep(now, f0, f1, len, peak) {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(f0, now);
        o.frequency.exponentialRampToValueAtTime(f1, now + len * 0.6);
        o.frequency.exponentialRampToValueAtTime(f0 * 1.2, now + len);
        this.env(o, now, len, peak);
        o.start(now);
        o.stop(now + len + 0.03);
    }
    arp(now, freqs, step, peak) {
        freqs.forEach((f, i) => this.blip(now + i * step, f, f, step * 1.4, 'sine', peak));
    }
    noise(now, len, cutoff, peak) {
        const ac = this.ctx;
        const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * len), ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++)
            d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        const src = ac.createBufferSource();
        src.buffer = buf;
        const filt = ac.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = cutoff;
        const g = ac.createGain();
        g.gain.value = peak;
        src.connect(filt);
        filt.connect(g);
        g.connect(this.sfxGain);
        src.start(now);
    }
}
//# sourceMappingURL=audio.js.map
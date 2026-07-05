// Sprite sheet loading + frame animation. AutoSprite-generated sheets live in
// assets/sprites/ as horizontal (or grid) strips. Everything degrades
// gracefully: until a sheet finishes loading, `ready` is false and callers
// fall back to their procedural drawing.
export class Sheet {
    constructor(spec) {
        this.spec = spec;
        this.img = new Image();
        this.ready = false;
        this.img.onload = () => { this.ready = true; };
        this.img.onerror = () => { this.ready = false; };
        this.img.src = spec.src;
    }
    /** Frame index for a given elapsed animation time. */
    frameAt(t) {
        const f = Math.floor(t * this.spec.fps);
        return this.spec.loop ? ((f % this.spec.frames) + this.spec.frames) % this.spec.frames
            : Math.min(f, this.spec.frames - 1);
    }
    done(t) { return !this.spec.loop && t * this.spec.fps >= this.spec.frames - 1; }
    /** Blit frame `i` at the current transform origin, scaled so the frame
     *  height maps to `targetH` px. Horizontally centered; `anchorBottom` places
     *  the frame's bottom edge at y=0 (feet), else it is vertically centered.
     *  The caller owns translate/scale/flip so squash & facing compose cleanly. */
    blit(c, i, targetH, anchorBottom = true) {
        if (!this.ready)
            return;
        const { fw, fh, cols } = this.spec;
        const perRow = cols || this.spec.frames;
        const sx = (i % perRow) * fw;
        const sy = Math.floor(i / perRow) * fh;
        const scale = targetH / fh;
        const w = fw * scale, h = fh * scale;
        c.drawImage(this.img, sx, sy, fw, fh, -w / 2, anchorBottom ? -h : -h / 2, w, h);
    }
}
export class SpriteBank {
    constructor() {
        this.sheets = new Map();
    }
    add(key, spec) { this.sheets.set(key, new Sheet(spec)); }
    get(key) { return this.sheets.get(key); }
    ready(key) { return !!this.sheets.get(key)?.ready; }
}
export const sprites = new SpriteBank();
// Single transparent images (structures/props) drawn whole, scaled by height.
export class Still {
    constructor(src) {
        this.img = new Image();
        this.ready = false;
        this.img.onload = () => (this.ready = true);
        this.img.src = src;
    }
    draw(c, cx, baseY, targetH, anchorBottom = true) {
        if (!this.ready)
            return;
        const s = targetH / this.img.height, w = this.img.width * s;
        c.drawImage(this.img, cx - w / 2, baseY - (anchorBottom ? targetH : targetH / 2), w, targetH);
    }
}
export const stills = {};
export function loadStill(key, src) { stills[key] = new Still(src); }
//# sourceMappingURL=sprites.js.map
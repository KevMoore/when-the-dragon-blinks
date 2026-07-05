// Sprite sheet loading + frame animation. AutoSprite-generated sheets live in
// assets/sprites/ as horizontal (or grid) strips. Everything degrades
// gracefully: until a sheet finishes loading, `ready` is false and callers
// fall back to their procedural drawing.

export type SheetSpec = {
  src: string;      // path relative to the document root
  fw: number;       // frame width (px)
  fh: number;       // frame height (px)
  frames: number;   // total frames
  cols?: number;    // columns in the sheet (defaults to `frames` = single row)
  fps: number;      // playback speed
  loop: boolean;
};

export class Sheet {
  img = new Image();
  ready = false;
  constructor(public spec: SheetSpec) {
    this.img.onload = () => { this.ready = true; };
    this.img.onerror = () => { this.ready = false; };
    this.img.src = spec.src;
  }
  /** Frame index for a given elapsed animation time. */
  frameAt(t: number): number {
    const f = Math.floor(t * this.spec.fps);
    return this.spec.loop ? ((f % this.spec.frames) + this.spec.frames) % this.spec.frames
      : Math.min(f, this.spec.frames - 1);
  }
  done(t: number): boolean { return !this.spec.loop && t * this.spec.fps >= this.spec.frames - 1; }

  /** Blit frame `i` at the current transform origin, scaled so the frame
   *  height maps to `targetH` px. Horizontally centered; `anchorBottom` places
   *  the frame's bottom edge at y=0 (feet), else it is vertically centered.
   *  The caller owns translate/scale/flip so squash & facing compose cleanly. */
  blit(c: CanvasRenderingContext2D, i: number, targetH: number, anchorBottom = true) {
    if (!this.ready) return;
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
  private sheets = new Map<string, Sheet>();
  add(key: string, spec: SheetSpec) { this.sheets.set(key, new Sheet(spec)); }
  get(key: string): Sheet | undefined { return this.sheets.get(key); }
  ready(key: string): boolean { return !!this.sheets.get(key)?.ready; }
}

export const sprites = new SpriteBank();

// Single transparent images (structures/props) drawn whole, scaled by height.
export class Still {
  img = new Image(); ready = false;
  constructor(src: string) { this.img.onload = () => (this.ready = true); this.img.src = src; }
  draw(c: CanvasRenderingContext2D, cx: number, baseY: number, targetH: number, anchorBottom = true) {
    if (!this.ready) return;
    const s = targetH / this.img.height, w = this.img.width * s;
    c.drawImage(this.img, cx - w / 2, baseY - (anchorBottom ? targetH : targetH / 2), w, targetH);
  }
}
export const stills: Record<string, Still> = {};
export function loadStill(key: string, src: string) { stills[key] = new Still(src); }

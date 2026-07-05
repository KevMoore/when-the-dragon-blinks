type WorldState = 'day' | 'night';
type GameMode = 'title' | 'levelSelect' | 'codex' | 'lore' | 'playing' | 'paused' | 'levelComplete' | 'gameComplete';
type EntityKind = 'moth' | 'guardian' | 'wisp';

type Rect = { x: number; y: number; w: number; h: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; kind: 'spark' | 'dust' | 'mist' | 'star' | 'hit' };
type Projectile = { x: number; y: number; vx: number; vy: number; r: number; life: number; kind: 'lantern' };
type FloatingText = { text: string; t: number; max: number };
type CodexEntry = { id: string; title: string; body: string; unlockHint: string };
type LorePanel = { title: string; sections: { label: string; text: string }[]; nextMode: GameMode; after?: () => void };

type LevelData = {
  id: string;
  title: string;
  subtitle: string;
  width: number;
  height: number;
  tiles: string[];
  spawn: { x: number; y: number };
  exit: Rect;
  checkpoints: Rect[];
  relics: { id: string; x: number; y: number; noteId: string }[];
  shrines: { x: number; y: number; textId: string }[];
  entities: { kind: EntityKind; x: number; y: number }[];
  windZones?: Rect[];
  introLore: string;
  outroLore: string;
  unlockCodexOnComplete: string[];
  isBoss?: boolean;
};

const LOGICAL_W = 960;
const LOGICAL_H = 540;
const TILE = 32;
const GRAVITY = 1800;
const SAVE_KEY = 'when-the-dragon-blinks-save-v1';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = true;

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }
function overlap(a: Rect, b: Rect) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function centerX(r: Rect) { return r.x + r.w / 2; }
function centerY(r: Rect) { return r.y + r.h / 2; }
function rand(min: number, max: number) { return min + Math.random() * (max - min); }
function oneOf<T>(items: T[]): T { return items[Math.floor(Math.random() * items.length)]; }

function emptyMap(w: number, h: number): string[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
}
function setTile(map: string[][], x: number, y: number, c: string) {
  if (y >= 0 && y < map.length && x >= 0 && x < map[0].length) map[y][x] = c;
}
function rectTiles(map: string[][], x: number, y: number, w: number, h: number, c: string) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) setTile(map, xx, yy, c);
}
function mapToStrings(map: string[][]): string[] { return map.map(row => row.join('')); }

function makeLevel1(): LevelData {
  const w = 76, h = 17;
  const m = emptyMap(w, h);
  rectTiles(m, 0, 15, w, 2, '#');
  rectTiles(m, 9, 13, 5, 1, '#');
  rectTiles(m, 18, 12, 5, 1, '#');
  rectTiles(m, 27, 11, 6, 1, 'D');
  rectTiles(m, 37, 12, 5, 1, '#');
  rectTiles(m, 45, 10, 5, 1, 'N');
  rectTiles(m, 55, 12, 4, 1, '#');
  rectTiles(m, 64, 13, 5, 1, '#');
  rectTiles(m, 32, 14, 4, 1, '^');
  rectTiles(m, 60, 14, 2, 1, '^');
  rectTiles(m, 70, 10, 2, 5, '#');
  return {
    id: 'mountain-gate', title: 'Level 1: Mountain Gate', subtitle: 'The first step toward the dragon eye', width: w, height: h, tiles: mapToStrings(m),
    spawn: { x: 64, y: 410 }, exit: { x: 2200, y: 356, w: 42, h: 92 },
    checkpoints: [{ x: 424, y: 394, w: 28, h: 56 }, { x: 1660, y: 394, w: 28, h: 56 }],
    relics: [{ id: 'l1-hidden-night-path', x: 1480, y: 280, noteId: 'relic-eye-fragment' }],
    shrines: [{ x: 290, y: 390, textId: 'shrine-who-is-zhulong' }],
    entities: [{ kind: 'moth', x: 690, y: 330 }, { kind: 'guardian', x: 1180, y: 390 }],
    introLore: 'intro-l1', outroLore: 'outro-l1', unlockCodexOnComplete: ['texts-vary']
  };
}

function makeLevel2(): LevelData {
  const w = 88, h = 17;
  const m = emptyMap(w, h);
  rectTiles(m, 0, 15, w, 2, '#');
  rectTiles(m, 10, 12, 5, 1, 'D');
  rectTiles(m, 18, 10, 5, 1, 'N');
  rectTiles(m, 27, 12, 5, 1, 'D');
  rectTiles(m, 36, 9, 5, 1, 'N');
  rectTiles(m, 45, 12, 5, 1, '#');
  rectTiles(m, 54, 11, 5, 1, 'D');
  rectTiles(m, 64, 9, 6, 1, 'N');
  rectTiles(m, 74, 12, 5, 1, '#');
  rectTiles(m, 22, 14, 4, 1, 'F');
  rectTiles(m, 51, 14, 4, 1, 'S');
  rectTiles(m, 80, 10, 2, 5, '#');
  return {
    id: 'blinking-bridge', title: 'Level 2: The Blinking Bridge', subtitle: 'Day and night become platforms', width: w, height: h, tiles: mapToStrings(m),
    spawn: { x: 64, y: 410 }, exit: { x: 2545, y: 356, w: 42, h: 92 },
    checkpoints: [{ x: 780, y: 394, w: 28, h: 56 }, { x: 1660, y: 394, w: 28, h: 56 }],
    relics: [{ id: 'l2-moon-bridge', x: 2080, y: 220, noteId: 'relic-blinking-image' }],
    shrines: [{ x: 480, y: 390, textId: 'shrine-eye-day-night' }],
    entities: [{ kind: 'moth', x: 1060, y: 280 }, { kind: 'wisp', x: 1450, y: 360 }, { kind: 'guardian', x: 2050, y: 390 }],
    introLore: 'intro-l2', outroLore: 'outro-l2', unlockCodexOnComplete: ['blinking-image']
  };
}

function makeLevel3(): LevelData {
  const w = 96, h = 17;
  const m = emptyMap(w, h);
  rectTiles(m, 0, 15, w, 2, '#');
  rectTiles(m, 9, 12, 4, 1, '#');
  rectTiles(m, 17, 10, 5, 1, 'D');
  rectTiles(m, 27, 8, 5, 1, 'N');
  rectTiles(m, 38, 11, 6, 1, '#');
  rectTiles(m, 49, 13, 6, 1, 'D');
  rectTiles(m, 59, 10, 5, 1, 'N');
  rectTiles(m, 70, 12, 5, 1, '#');
  rectTiles(m, 80, 10, 7, 1, '#');
  rectTiles(m, 42, 14, 4, 1, 'F');
  rectTiles(m, 66, 14, 4, 1, 'S');
  rectTiles(m, 89, 8, 2, 7, '#');
  return {
    id: 'breath-cavern', title: 'Level 3: Breath Cavern', subtitle: 'The mountain moves with dragon breath', width: w, height: h, tiles: mapToStrings(m),
    spawn: { x: 64, y: 410 }, exit: { x: 2850, y: 292, w: 42, h: 156 },
    checkpoints: [{ x: 920, y: 394, w: 28, h: 56 }, { x: 2040, y: 394, w: 28, h: 56 }],
    relics: [{ id: 'l3-breath-current', x: 2000, y: 265, noteId: 'relic-breath-seasons' }],
    shrines: [{ x: 360, y: 390, textId: 'shrine-breath' }],
    entities: [{ kind: 'wisp', x: 900, y: 335 }, { kind: 'moth', x: 1380, y: 265 }, { kind: 'guardian', x: 2300, y: 390 }],
    windZones: [{ x: 820, y: 235, w: 110, h: 245 }, { x: 1820, y: 210, w: 150, h: 260 }],
    introLore: 'intro-l3', outroLore: 'outro-l3', unlockCodexOnComplete: ['breath-seasons']
  };
}

function makeBossLevel(): LevelData {
  const w = 40, h = 17;
  const m = emptyMap(w, h);
  rectTiles(m, 0, 15, w, 2, '#');
  rectTiles(m, 0, 0, 2, 17, '#');
  rectTiles(m, w - 2, 0, 2, 17, '#');
  rectTiles(m, 10, 12, 5, 1, 'D');
  rectTiles(m, 25, 12, 5, 1, 'N');
  return {
    id: 'lantern-eater', title: 'Boss: The Lantern Eater', subtitle: 'An invented creature that hoards the dawn', width: w, height: h, tiles: mapToStrings(m),
    spawn: { x: 150, y: 410 }, exit: { x: 1120, y: 356, w: 40, h: 92 },
    checkpoints: [{ x: 130, y: 394, w: 28, h: 56 }], relics: [],
    shrines: [{ x: 250, y: 390, textId: 'shrine-boss-invention' }], entities: [],
    introLore: 'intro-boss', outroLore: 'outro-boss', unlockCodexOnComplete: ['game-inventions', 'myth-vs-adaptation'], isBoss: true
  };
}

const levels = [makeLevel1(), makeLevel2(), makeLevel3(), makeBossLevel()];

const loreTexts: Record<string, LorePanel> = {
  'intro-l1': {
    title: 'Before the Mountain Gate', nextMode: 'playing', sections: [
      { label: 'Myth', text: 'Zhulong, the Torch Dragon or Candle Dragon, is imagined in some traditions as a cosmic being of light, darkness, and turning cycles.' },
      { label: 'Game Inspiration', text: 'You carry a small fragment of the dragon eye. It awakens as you climb.' }
    ]
  },
  'outro-l1': {
    title: 'After Level 1', nextMode: 'levelComplete', sections: [
      { label: 'Historical Note', text: 'Descriptions of Zhulong vary across ancient texts, translations, and later retellings. Some emphasize a red serpentine body and human-like face.' },
      { label: 'Game Inspiration', text: 'The shrine runner, relics, and gate trials are original game inventions that help introduce the myth.' }
    ]
  },
  'intro-l2': {
    title: 'Before the Blinking Bridge', nextMode: 'playing', sections: [
      { label: 'Myth', text: 'In some accounts, when Zhulong opens his eyes there is day; when he closes them there is night.' },
      { label: 'Game Inspiration', text: 'This level turns the eye-opening motif into a platforming rule. Blink the world to find the path.' }
    ]
  },
  'outro-l2': {
    title: 'After Level 2', nextMode: 'levelComplete', sections: [
      { label: 'Historical Note', text: 'Myths often give natural cycles a memorable story-shape. Zhulong’s blinking eye gives day and night a living image.' },
      { label: 'Game Inspiration', text: 'Day-only and night-only platforms are a playable adaptation, not a literal detail from the old sources.' }
    ]
  },
  'intro-l3': {
    title: 'Before Breath Cavern', nextMode: 'playing', sections: [
      { label: 'Myth', text: 'Zhulong’s breath is sometimes connected with wind, weather, cold, heat, or seasonal change.' },
      { label: 'Game Inspiration', text: 'The caverns below the mountain still move with the dragon’s breath. Ride the currents carefully.' }
    ]
  },
  'outro-l3': {
    title: 'After Level 3', nextMode: 'levelComplete', sections: [
      { label: 'Historical Note', text: 'Many ancient myths connect divine or cosmic beings with natural forces. Here, wind currents are inspired by Zhulong’s breath.' },
      { label: 'Game Inspiration', text: 'The boss ahead is original: a symbol of imbalance between light and darkness.' }
    ]
  },
  'intro-boss': {
    title: 'Before the Lantern Eater', nextMode: 'playing', sections: [
      { label: 'Myth', text: 'Zhulong’s power is tied here to balance: day and night, light and darkness, breath and stillness.' },
      { label: 'Game Inspiration', text: 'The Lantern Eater is an original creature created for this game. It represents light hoarded instead of shared.' }
    ]
  },
  'outro-boss': {
    title: 'The Dragon Blinks Again', nextMode: 'gameComplete', sections: [
      { label: 'Myth', text: 'Zhulong is remembered as a vast dragon associated with cosmic light, darkness, and natural cycles.' },
      { label: 'History', text: 'Accounts appear in old Chinese mythological and geographical traditions; details vary between texts, regions, translations, and retellings.' },
      { label: 'Game Inspiration', text: 'This game adapts the eye motif into a Day/Night mechanic. The shrine runner, Lantern Eater, and level trials are original inventions.' }
    ]
  },
  'shrine-who-is-zhulong': {
    title: 'Lore Shrine: Who is Zhulong?', nextMode: 'playing', sections: [
      { label: 'Myth', text: 'Zhulong is also called Torch Dragon or Candle Dragon. Some descriptions give him a human face and a serpentine red body.' },
      { label: 'Game Inspiration', text: 'The distant eye in the sky is this game’s way of making that cosmic scale visible while you play.' }
    ]
  },
  'shrine-eye-day-night': {
    title: 'Lore Shrine: The Eye', nextMode: 'playing', sections: [
      { label: 'Myth', text: 'The opening and closing of Zhulong’s eyes is linked in some accounts with the arrival of day and night.' },
      { label: 'Game Inspiration', text: 'Press the blink button to shift between sunlight and spirit-shadow.' }
    ]
  },
  'shrine-breath': {
    title: 'Lore Shrine: The Breath', nextMode: 'playing', sections: [
      { label: 'Myth', text: 'Zhulong’s breath is sometimes described as a force of wind or seasonal change.' },
      { label: 'Game Inspiration', text: 'The rising gusts in this cavern are not literal history. They are a playable metaphor for dragon breath.' }
    ]
  },
  'shrine-boss-invention': {
    title: 'Lore Shrine: Invention', nextMode: 'playing', sections: [
      { label: 'Historical Note', text: 'The Lantern Eater is not part of the Zhulong legend.' },
      { label: 'Game Inspiration', text: 'It was invented to dramatize imbalance: light trapped, night starved, and the world unable to blink.' }
    ]
  },
  'relic-eye-fragment': {
    title: 'Relic: Eye Fragment', nextMode: 'playing', sections: [
      { label: 'Myth', text: 'A single eye can be a powerful mythic image: vision, light, time, and cosmic awareness.' },
      { label: 'Game Inspiration', text: 'Relics unlock optional notes in Myth & History.' }
    ]
  },
  'relic-blinking-image': {
    title: 'Relic: Moon Bridge', nextMode: 'playing', sections: [
      { label: 'Historical Note', text: 'Ancient mythic images are often compact: one gesture, such as an eye closing, can explain a whole natural rhythm.' },
      { label: 'Game Inspiration', text: 'The bridge exists only under moonlight to make the myth readable through play.' }
    ]
  },
  'relic-breath-seasons': {
    title: 'Relic: Breath Bell', nextMode: 'playing', sections: [
      { label: 'Myth', text: 'Some tellings connect Zhulong’s breath or voice with winter, summer, wind, or rain.' },
      { label: 'Game Inspiration', text: 'A future full game could expand this into seasonal puzzles.' }
    ]
  }
};

const codexEntries: CodexEntry[] = [
  { id: 'who-is-zhulong', title: 'Who is Zhulong?', unlockHint: 'Unlocked from the start', body: 'Zhulong, also known as Torch Dragon or Candle Dragon, is a figure from Chinese mythology. Some accounts describe a vast red, serpentine being with a human-like face and cosmic powers.' },
  { id: 'eye-day-night', title: 'The Eye of Day and Night', unlockHint: 'Unlocked from the start', body: 'In some accounts, Zhulong opens his eyes and there is day; he closes his eyes and there is night. This game adapts that image into the blink mechanic.' },
  { id: 'texts-vary', title: 'Details Vary', unlockHint: 'Complete Level 1', body: 'Myths change across texts, regions, translations, and retellings. The game uses careful wording because it is inspired by tradition rather than claiming to be a literal reconstruction.' },
  { id: 'blinking-image', title: 'Blinking as a Mythic Image', unlockHint: 'Complete Level 2', body: 'A mythic image can turn a natural cycle into something memorable. Zhulong’s eye gives day and night a body, a rhythm, and a story.' },
  { id: 'breath-seasons', title: 'Breath, Wind, and Seasons', unlockHint: 'Complete Level 3', body: 'Some descriptions associate Zhulong’s breath with wind, weather, winter, summer, or seasonal change. Breath Cavern turns this into rising currents and shifting danger.' },
  { id: 'game-inventions', title: 'What the Game Invented', unlockHint: 'Defeat the boss', body: 'The shrine runner, relic shards, Lantern Eater, spirit platforms, and boss arena are original game creations designed to make the myth interactive.' },
  { id: 'myth-vs-adaptation', title: 'Myth vs. Adaptation', unlockHint: 'Defeat the boss', body: 'This game respects the legend while adapting it. Myth panels describe source-inspired ideas; Game Inspiration panels explain invented mechanics and story elements.' }
];

class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  touch = new Set<string>();
  touchPressed = new Set<string>();
  gpButtons: boolean[] = [];
  prevGpButtons: boolean[] = [];
  axisX = 0;
  pointer: { x: number; y: number; clicked: boolean } | null = null;
  debugPressed = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (['arrowleft','arrowright','arrowup','arrowdown',' ','spacebar'].includes(k)) e.preventDefault();
    }, { passive: false });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    canvas.addEventListener('pointerdown', e => {
      const p = this.toCanvasPoint(e.clientX, e.clientY);
      this.pointer = { x: p.x, y: p.y, clicked: true };
    });
    const controls = document.getElementById('touch-controls')!;
    controls.querySelectorAll('button[data-action]').forEach(btn => {
      const action = (btn as HTMLElement).dataset.action!;
      const down = (e: Event) => { e.preventDefault(); this.touch.add(action); this.touchPressed.add(action); btn.classList.add('active'); };
      const up = (e: Event) => { e.preventDefault(); this.touch.delete(action); btn.classList.remove('active'); };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    });
  }

  toCanvasPoint(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = LOGICAL_W / rect.width;
    const sy = LOGICAL_H / rect.height;
    return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
  }

  updateGamepad() {
    this.prevGpButtons = this.gpButtons.slice();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads[0];
    this.axisX = 0;
    this.gpButtons = [];
    if (!gp) return;
    this.axisX = Math.abs(gp.axes[0]) > 0.25 ? gp.axes[0] : 0;
    this.gpButtons = gp.buttons.map(b => b.pressed);
  }

  down(action: string): boolean {
    const k = this.keys;
    if (action === 'left') return k.has('a') || k.has('arrowleft') || this.touch.has('left') || this.axisX < -0.25 || !!this.gpButtons[14];
    if (action === 'right') return k.has('d') || k.has('arrowright') || this.touch.has('right') || this.axisX > 0.25 || !!this.gpButtons[15];
    if (action === 'jump') return k.has(' ') || k.has('w') || k.has('arrowup') || this.touch.has('jump') || !!this.gpButtons[0];
    if (action === 'attack') return k.has('j') || k.has('x') || this.touch.has('attack') || !!this.gpButtons[2];
    if (action === 'dash') return k.has('shift') || k.has('k') || this.touch.has('dash') || !!this.gpButtons[1];
    if (action === 'toggle') return k.has('e') || k.has('c') || k.has('l') || this.touch.has('toggle') || !!this.gpButtons[3] || !!this.gpButtons[4] || !!this.gpButtons[5];
    if (action === 'pause') return k.has('escape') || !!this.gpButtons[9];
    if (action === 'interact') return k.has('f') || k.has('arrowup') || !!this.gpButtons[0];
    return false;
  }

  just(action: string): boolean {
    const p = this.pressed;
    const t = this.touchPressed;
    const gpJust = (i: number) => !!this.gpButtons[i] && !this.prevGpButtons[i];
    if (action === 'confirm') return p.has('enter') || p.has(' ') || t.has('jump') || gpJust(0) || gpJust(9);
    if (action === 'back') return p.has('escape') || gpJust(1);
    if (action === 'up') return p.has('arrowup') || p.has('w') || gpJust(12);
    if (action === 'down') return p.has('arrowdown') || p.has('s') || gpJust(13);
    if (action === 'left') return p.has('arrowleft') || p.has('a') || gpJust(14);
    if (action === 'right') return p.has('arrowright') || p.has('d') || gpJust(15);
    if (action === 'jump') return p.has(' ') || p.has('w') || p.has('arrowup') || t.has('jump') || gpJust(0);
    if (action === 'attack') return p.has('j') || p.has('x') || t.has('attack') || gpJust(2);
    if (action === 'dash') return p.has('shift') || p.has('k') || t.has('dash') || gpJust(1);
    if (action === 'toggle') return p.has('e') || p.has('c') || p.has('l') || t.has('toggle') || gpJust(3) || gpJust(4) || gpJust(5);
    if (action === 'pause') return p.has('escape') || gpJust(9);
    if (action === 'interact') return p.has('f') || gpJust(0);
    if (action === 'debug') return p.has('f1');
    if (action === 'codex') return p.has('h');
    if (action === 'levelselect') return p.has('l');
    return false;
  }

  endFrame() {
    this.pressed.clear();
    this.touchPressed.clear();
    if (this.pointer) this.pointer.clicked = false;
  }
}

class AudioManager {
  enabled = true;
  ctx: AudioContext | null = null;
  volume = 0.35;
  ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  beep(type: 'jump' | 'land' | 'attack' | 'toggle' | 'hurt' | 'collect' | 'boss' | 'menu') {
    if (!this.enabled) return;
    try {
      this.ensure();
      const ac = this.ctx!;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const now = ac.currentTime;
      const map: Record<string, [number, number, OscillatorType]> = {
        jump: [420, .08, 'sine'], land: [110, .05, 'triangle'], attack: [660, .07, 'square'], toggle: [220, .18, 'sine'], hurt: [90, .14, 'sawtooth'], collect: [880, .12, 'sine'], boss: [70, .18, 'triangle'], menu: [520, .05, 'sine']
      };
      const [freq, len, wave] = map[type];
      osc.frequency.setValueAtTime(freq, now);
      if (type === 'toggle') osc.frequency.exponentialRampToValueAtTime(freq * 2.2, now + len);
      gain.gain.setValueAtTime(this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + len);
      osc.type = wave;
      osc.connect(gain); gain.connect(ac.destination);
      osc.start(now); osc.stop(now + len + .02);
    } catch {}
  }
}

class Player {
  x = 0; y = 0; w = 22; h = 42;
  vx = 0; vy = 0;
  facing = 1;
  grounded = false;
  coyote = 0;
  jumpBuffer = 0;
  dashTime = 0;
  dashCooldown = 0;
  invuln = 0;
  hp = 5;
  maxHp = 5;
  checkpoint = { x: 64, y: 410 };
  attackTimer = 0;
  attackCooldown = 0;
  landDustCooldown = 0;

  rect(): Rect { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  attackRect(): Rect { return { x: this.facing > 0 ? this.x + this.w - 2 : this.x - 30, y: this.y + 7, w: 32, h: 24 }; }

  reset(level: LevelData) {
    this.x = level.spawn.x; this.y = level.spawn.y; this.vx = 0; this.vy = 0; this.hp = this.maxHp;
    this.checkpoint = { ...level.spawn }; this.grounded = false; this.invuln = 0; this.attackTimer = 0;
  }

  update(game: Game, dt: number) {
    const input = game.input;
    const left = input.down('left'), right = input.down('right');
    const wasGrounded = this.grounded;
    const accel = this.grounded ? 3600 : 2600;
    const maxSpeed = 250;
    if (left) { this.vx -= accel * dt; this.facing = -1; }
    if (right) { this.vx += accel * dt; this.facing = 1; }
    if (!left && !right) this.vx = lerp(this.vx, 0, this.grounded ? 0.22 : 0.08);
    this.vx = clamp(this.vx, -maxSpeed, maxSpeed);

    this.coyote = this.grounded ? 0.11 : Math.max(0, this.coyote - dt);
    if (input.just('jump')) this.jumpBuffer = 0.14;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vy = -610;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      game.spawnDust(this.x + this.w / 2, this.y + this.h, 8);
      game.audio.beep('jump');
    }
    if (!input.down('jump') && this.vy < -130) this.vy += 1600 * dt;

    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (input.just('dash') && this.dashCooldown <= 0) {
      this.dashTime = 0.16;
      this.dashCooldown = 0.55;
      this.vx = this.facing * 560;
      this.vy = Math.min(this.vy, 0);
      game.spawnSparks(this.x + this.w / 2, this.y + this.h / 2, 14);
    }
    if (this.dashTime > 0) this.dashTime -= dt;
    else this.vy += GRAVITY * dt;
    this.vy = clamp(this.vy, -900, 760);

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    if (input.just('attack') && this.attackCooldown <= 0) {
      this.attackTimer = 0.15;
      this.attackCooldown = 0.28;
      game.spawnSparks(this.x + this.w / 2 + this.facing * 25, this.y + 20, 10);
      game.audio.beep('attack');
    }
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.invuln = Math.max(0, this.invuln - dt);

    // Breath currents lift the runner and add a visual stream.
    for (const zone of game.level.windZones || []) {
      if (overlap(this.rect(), zone)) {
        this.vy -= 820 * dt;
        this.vx += Math.sin(game.time * 3 + zone.x) * 25 * dt;
        if (Math.random() < 0.5) game.particles.push({ x: rand(zone.x, zone.x + zone.w), y: rand(zone.y + zone.h - 20, zone.y + zone.h), vx: rand(-15, 15), vy: rand(-120, -60), life: .8, maxLife: .8, size: rand(2, 5), kind: 'mist' });
      }
    }

    game.moveEntity(this, this.vx * dt, this.vy * dt);
    if (!wasGrounded && this.grounded) {
      game.audio.beep('land');
      game.spawnDust(this.x + this.w / 2, this.y + this.h, 10);
    }

    if (this.y > game.level.height * TILE + 200) this.hurt(game, 1, true);
  }

  hurt(game: Game, amount = 1, pit = false) {
    if (this.invuln > 0 && !pit) return;
    this.hp -= amount;
    this.invuln = 1.1;
    game.shake = Math.max(game.shake, 8);
    game.audio.beep('hurt');
    game.spawnHit(this.x + this.w / 2, this.y + this.h / 2, 18);
    if (this.hp <= 0 || pit) {
      this.hp = this.maxHp;
      this.x = this.checkpoint.x; this.y = this.checkpoint.y; this.vx = 0; this.vy = 0;
      game.flashText(pit ? 'The shrine wind returns you.' : 'The fragment rekindles.');
    } else {
      this.vx = -this.facing * 250;
      this.vy = -330;
    }
  }

  draw(game: Game, c: CanvasRenderingContext2D) {
    const sx = this.x - game.camera.x, sy = this.y - game.camera.y;
    const blink = this.invuln > 0 && Math.floor(this.invuln * 18) % 2 === 0;
    if (blink) c.globalAlpha = 0.45;
    c.save();
    c.translate(sx + this.w / 2, sy + this.h / 2);
    c.scale(this.facing, 1);
    // shadow
    c.fillStyle = 'rgba(0,0,0,.28)';
    c.beginPath(); c.ellipse(0, 25, 16, 5, 0, 0, Math.PI * 2); c.fill();
    // robe
    const grad = c.createLinearGradient(0, -22, 0, 24);
    grad.addColorStop(0, '#f7d17a'); grad.addColorStop(.5, '#a8302e'); grad.addColorStop(1, '#2b0f19');
    c.fillStyle = grad;
    c.beginPath();
    c.moveTo(-8, -14); c.lineTo(10, -10); c.lineTo(8, 22); c.lineTo(-10, 22); c.closePath(); c.fill();
    // head and hair
    c.fillStyle = '#f1c28f'; c.beginPath(); c.arc(0, -20, 8, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1b0b12'; c.fillRect(-7, -27, 14, 7);
    // scarf/eye shard
    c.fillStyle = game.world === 'day' ? '#ffd277' : '#a9d6ff';
    c.beginPath(); c.arc(6, -13, 3, 0, Math.PI * 2); c.fill();
    c.shadowColor = game.world === 'day' ? '#ffb83b' : '#8bd2ff'; c.shadowBlur = 14;
    c.fillRect(9, -13, 12, 3);
    c.shadowBlur = 0;
    // legs
    c.strokeStyle = '#1b0b12'; c.lineWidth = 3; c.beginPath(); c.moveTo(-4, 20); c.lineTo(-8, 28); c.moveTo(5, 20); c.lineTo(9, 28); c.stroke();
    // attack flash
    if (this.attackTimer > 0) {
      c.globalAlpha = this.attackTimer / 0.15;
      c.strokeStyle = game.world === 'day' ? '#ffe7a7' : '#bbe7ff'; c.lineWidth = 4;
      c.beginPath(); c.arc(25, -2, 22, -1.2, 1.2); c.stroke();
    }
    c.restore();
    c.globalAlpha = 1;
  }
}

class Enemy {
  kind: EntityKind;
  x: number; y: number; w = 28; h = 28; vx = 0; vy = 0; alive = true; hp = 2; baseY: number; phase = Math.random() * 10;
  constructor(kind: EntityKind, x: number, y: number) { this.kind = kind; this.x = x; this.y = y; this.baseY = y; if (kind === 'guardian') { this.w = 34; this.h = 42; this.hp = 3; } }
  rect(): Rect { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  update(game: Game, dt: number) {
    if (!this.alive) return;
    const p = game.player;
    if (this.kind === 'moth') {
      const active = game.world === 'day';
      const dx = centerX(p.rect()) - centerX(this.rect());
      const dy = centerY(p.rect()) - centerY(this.rect());
      if (active && Math.abs(dx) < 360) { this.vx = lerp(this.vx, Math.sign(dx) * 95, 0.04); this.vy = lerp(this.vy, Math.sign(dy) * 60, 0.03); }
      else { this.vx = Math.sin(game.time * 1.8 + this.phase) * 35; this.vy = Math.cos(game.time * 2.2 + this.phase) * 20; }
      this.x += this.vx * dt; this.y += this.vy * dt;
    }
    if (this.kind === 'wisp') {
      const active = game.world === 'night';
      this.y = this.baseY + Math.sin(game.time * 2.4 + this.phase) * 24;
      if (active) this.x += Math.sin(game.time + this.phase) * 36 * dt;
    }
    if (this.kind === 'guardian') {
      if (game.world === 'day') {
        this.vx = Math.sin(game.time * .8 + this.phase) * 70;
        this.vy += GRAVITY * dt;
        game.moveEntity(this, this.vx * dt, this.vy * dt);
      }
    }
    const dangerous = this.kind !== 'guardian' || game.world === 'day';
    if (dangerous && overlap(this.rect(), p.rect())) p.hurt(game);
    if (p.attackTimer > 0 && overlap(this.rect(), p.attackRect())) this.hit(game);
  }
  hit(game: Game) {
    this.hp--;
    game.spawnHit(this.x + this.w / 2, this.y + this.h / 2, 12);
    if (this.hp <= 0) { this.alive = false; game.audio.beep('collect'); }
  }
  draw(game: Game, c: CanvasRenderingContext2D) {
    if (!this.alive) return;
    const sx = this.x - game.camera.x, sy = this.y - game.camera.y;
    c.save();
    c.translate(sx + this.w / 2, sy + this.h / 2);
    if (this.kind === 'moth') {
      const active = game.world === 'day';
      c.globalAlpha = active ? 1 : .45;
      c.fillStyle = active ? '#ffcb57' : '#7d5a6c';
      c.beginPath(); c.ellipse(-8, 0, 13, 8 + Math.sin(game.time * 18) * 3, .4, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(8, 0, 13, 8 - Math.sin(game.time * 18) * 3, -.4, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#2b0f19'; c.fillRect(-4, -10, 8, 20);
    } else if (this.kind === 'wisp') {
      const active = game.world === 'night';
      c.globalAlpha = active ? 1 : .25;
      c.shadowColor = '#93d8ff'; c.shadowBlur = active ? 20 : 6;
      c.fillStyle = '#b9eaff';
      c.beginPath(); c.arc(0, 0, 11, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#0a0611'; c.beginPath(); c.arc(-3, -2, 2, 0, Math.PI * 2); c.arc(4, -2, 2, 0, Math.PI * 2); c.fill();
    } else {
      const active = game.world === 'day';
      c.globalAlpha = active ? 1 : .55;
      c.fillStyle = active ? '#87694c' : '#454253';
      c.fillRect(-16, -21, 32, 42);
      c.fillStyle = active ? '#ffdb78' : '#2c2833'; c.fillRect(-8, -10, 16, 7);
      c.fillStyle = '#21131b'; c.fillRect(-11, 18, 8, 9); c.fillRect(3, 18, 8, 9);
    }
    c.restore(); c.globalAlpha = 1; c.shadowBlur = 0;
  }
}

class LanternEater {
  x = 760; y = 290; w = 120; h = 150; hp = 18; maxHp = 18; alive = true;
  timer = 0; attackTimer = 1.2; vulnerable = false; hurtFlash = 0; phase = 1;
  rect(): Rect { return { x: this.x + 22, y: this.y + 34, w: this.w - 44, h: this.h - 44 }; }
  update(game: Game, dt: number) {
    if (!this.alive) return;
    this.timer += dt; this.attackTimer -= dt; this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.phase = this.hp <= 6 ? 3 : this.hp <= 12 ? 2 : 1;
    this.y = 285 + Math.sin(game.time * 1.4) * 14;
    this.vulnerable = game.world === 'night' && (this.attackTimer > 0.45 || this.phase >= 2);
    if (this.attackTimer <= 0) {
      this.attack(game);
      this.attackTimer = this.phase === 1 ? 2.1 : this.phase === 2 ? 1.55 : 1.12;
    }
    if (game.player.attackTimer > 0 && this.vulnerable && overlap(game.player.attackRect(), this.rect())) {
      this.hit(game);
      game.player.attackTimer = 0;
    }
    if (overlap(this.rect(), game.player.rect())) game.player.hurt(game);
  }
  attack(game: Game) {
    game.shake = Math.max(game.shake, 10);
    game.audio.beep('boss');
    const p = game.player;
    const count = this.phase === 3 ? 5 : this.phase === 2 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const angle = Math.atan2(centerY(p.rect()) - (this.y + 70), centerX(p.rect()) - (this.x + 60)) + rand(-0.45, 0.45);
      const speed = rand(130, 210) + this.phase * 20;
      game.projectiles.push({ x: this.x + 60, y: this.y + 70, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 10, life: 4, kind: 'lantern' });
    }
    if (this.phase >= 2 && Math.random() < .45) game.tryToggleWorld(true);
  }
  hit(game: Game) {
    this.hp--;
    this.hurtFlash = .15;
    game.shake = Math.max(game.shake, 7);
    game.spawnHit(this.x + this.w / 2, this.y + this.h / 2, 26);
    game.audio.beep('boss');
    if (this.hp <= 0) {
      this.alive = false;
      game.spawnHit(this.x + this.w / 2, this.y + this.h / 2, 80);
      game.completeLevel();
    }
  }
  draw(game: Game, c: CanvasRenderingContext2D) {
    if (!this.alive) return;
    const sx = this.x - game.camera.x, sy = this.y - game.camera.y;
    c.save(); c.translate(sx + this.w / 2, sy + this.h / 2);
    c.globalAlpha = this.hurtFlash > 0 ? .65 : 1;
    c.shadowColor = this.vulnerable ? '#a9d6ff' : '#ff8b44'; c.shadowBlur = this.vulnerable ? 28 : 18;
    const body = c.createRadialGradient(0, 0, 10, 0, 0, 78);
    body.addColorStop(0, this.vulnerable ? '#345070' : '#4a171c'); body.addColorStop(1, '#08050d');
    c.fillStyle = body;
    c.beginPath();
    c.moveTo(-45, -48); c.bezierCurveTo(-85, -10, -65, 75, 0, 75); c.bezierCurveTo(70, 75, 85, -20, 45, -48); c.bezierCurveTo(24, -72, -22, -72, -45, -48); c.fill();
    c.shadowBlur = 0;
    // lantern mask
    c.fillStyle = this.vulnerable ? '#e7f8ff' : '#f0b752';
    c.beginPath(); c.roundRect(-36, -42, 72, 54, 18); c.fill();
    c.fillStyle = '#150910'; c.fillRect(-25, -22, 18, 8); c.fillRect(7, -22, 18, 8);
    c.fillStyle = this.vulnerable ? '#81d9ff' : '#d94a3a';
    c.beginPath(); c.arc(0, 5, this.vulnerable ? 13 : 8, 0, Math.PI * 2); c.fill();
    // smoky arms
    c.strokeStyle = 'rgba(20, 8, 18, .82)'; c.lineWidth = 14; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-42, 10); c.bezierCurveTo(-92, 20, -95, 64, -58, 78); c.moveTo(42, 10); c.bezierCurveTo(92, 20, 95, 64, 58, 78); c.stroke();
    c.restore(); c.globalAlpha = 1;
  }
}

class Game {
  input = new Input(canvas);
  audio = new AudioManager();
  state: GameMode = 'title';
  previousState: GameMode = 'title';
  player = new Player();
  currentLevelIndex = 0;
  level: LevelData = levels[0];
  enemies: Enemy[] = [];
  boss: LanternEater | null = null;
  particles: Particle[] = [];
  projectiles: Projectile[] = [];
  world: WorldState = 'day';
  transition = 1;
  targetWorld: WorldState = 'day';
  time = 0;
  camera = { x: 0, y: 0 };
  shake = 0;
  debug = false;
  titleSelection = 0;
  levelSelection = 0;
  codexSelection = 0;
  lorePanel: LorePanel | null = null;
  message: FloatingText | null = null;
  save: { highestUnlocked: number; completed: string[]; relics: string[]; codex: string[]; settings: { volume: number } };

  constructor() {
    this.save = this.loadSave();
    this.startTitle();
  }

  loadSave() {
    const fallback = { highestUnlocked: 0, completed: [], relics: [], codex: ['who-is-zhulong', 'eye-day-night'], settings: { volume: .35 } };
    try { return { ...fallback, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch { return fallback; }
  }
  persist() { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); }
  unlockCodex(ids: string[]) { for (const id of ids) if (!this.save.codex.includes(id)) this.save.codex.push(id); this.persist(); }

  startTitle() { this.state = 'title'; this.particles = []; this.projectiles = []; }

  startLevel(i: number, withIntro = true) {
    this.currentLevelIndex = clamp(i, 0, levels.length - 1);
    this.level = levels[this.currentLevelIndex];
    this.world = 'day'; this.targetWorld = 'day'; this.transition = 1;
    this.player.reset(this.level);
    this.enemies = this.level.entities.map(e => new Enemy(e.kind, e.x, e.y));
    this.boss = this.level.isBoss ? new LanternEater() : null;
    this.projectiles = []; this.particles = [];
    this.camera.x = 0; this.camera.y = 0;
    this.flashText('');
    if (withIntro) this.openLore(this.level.introLore, 'playing'); else this.state = 'playing';
  }

  openLore(id: string, nextMode?: GameMode) {
    const base = loreTexts[id];
    if (!base) return;
    this.previousState = this.state;
    this.lorePanel = { ...base, nextMode: nextMode || base.nextMode };
    this.state = 'lore';
  }

  closeLore() {
    if (!this.lorePanel) return;
    const next = this.lorePanel.nextMode;
    const after = this.lorePanel.after;
    this.lorePanel = null;
    if (after) after();
    this.state = next;
  }

  flashText(text: string) { if (text) this.message = { text, t: 0, max: 2.5 }; else this.message = null; }

  tileAt(tx: number, ty: number): string {
    if (ty < 0 || ty >= this.level.height || tx < 0 || tx >= this.level.width) return '#';
    return this.level.tiles[ty][tx] || '.';
  }
  isSolidChar(ch: string, world: WorldState = this.world) { return ch === '#' || (ch === 'D' && world === 'day') || (ch === 'N' && world === 'night'); }
  isHazardChar(ch: string) { return ch === '^' || (ch === 'F' && this.world === 'day') || (ch === 'S' && this.world === 'night'); }

  solidsForRect(rect: Rect, world: WorldState = this.world): Rect[] {
    const out: Rect[] = [];
    const x0 = Math.floor(rect.x / TILE) - 1, x1 = Math.floor((rect.x + rect.w) / TILE) + 1;
    const y0 = Math.floor(rect.y / TILE) - 1, y1 = Math.floor((rect.y + rect.h) / TILE) + 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const ch = this.tileAt(x, y);
      if (this.isSolidChar(ch, world)) out.push({ x: x * TILE, y: y * TILE, w: TILE, h: TILE });
    }
    return out;
  }

  overlapsSolid(rect: Rect, world: WorldState = this.world) { return this.solidsForRect(rect, world).some(s => overlap(rect, s)); }

  moveEntity(e: { x: number; y: number; w: number; h: number; vx: number; vy: number; grounded?: boolean }, dx: number, dy: number) {
    let steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8);
    steps = Math.max(1, steps);
    for (let i = 0; i < steps; i++) {
      const sx = dx / steps, sy = dy / steps;
      e.x += sx;
      let rect = { x: e.x, y: e.y, w: e.w, h: e.h };
      for (const s of this.solidsForRect(rect)) {
        if (!overlap(rect, s)) continue;
        if (sx > 0) e.x = s.x - e.w;
        if (sx < 0) e.x = s.x + s.w;
        e.vx = 0;
        rect = { x: e.x, y: e.y, w: e.w, h: e.h };
      }
      e.y += sy;
      if (e.grounded !== undefined) e.grounded = false;
      rect = { x: e.x, y: e.y, w: e.w, h: e.h };
      for (const s of this.solidsForRect(rect)) {
        if (!overlap(rect, s)) continue;
        if (sy > 0) { e.y = s.y - e.h; if (e.grounded !== undefined) e.grounded = true; }
        if (sy < 0) e.y = s.y + s.h;
        e.vy = 0;
        rect = { x: e.x, y: e.y, w: e.w, h: e.h };
      }
    }
  }

  tryToggleWorld(forced = false) {
    const next: WorldState = this.world === 'day' ? 'night' : 'day';
    if (!forced && this.overlapsSolid(this.player.rect(), next)) {
      this.flashText('The new world would crush you. Step aside.');
      this.spawnHit(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, 10);
      return false;
    }
    this.world = next; this.targetWorld = next; this.transition = 0;
    this.shake = Math.max(this.shake, forced ? 11 : 5);
    this.spawnSparks(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, 30);
    this.audio.beep('toggle');
    return true;
  }

  update(dt: number) {
    this.input.updateGamepad();
    this.time += dt;
    if (this.input.just('debug')) this.debug = !this.debug;
    if (this.state === 'title') this.updateTitle();
    else if (this.state === 'levelSelect') this.updateLevelSelect();
    else if (this.state === 'codex') this.updateCodex();
    else if (this.state === 'lore') this.updateLore();
    else if (this.state === 'playing') this.updatePlaying(dt);
    else if (this.state === 'paused') this.updatePause();
    else if (this.state === 'levelComplete') this.updateLevelComplete();
    else if (this.state === 'gameComplete') this.updateGameComplete();
    this.updateParticles(dt);
    this.transition = Math.min(1, this.transition + dt * 2.8);
    this.shake = Math.max(0, this.shake - dt * 25);
    if (this.message) { this.message.t += dt; if (this.message.t > this.message.max) this.message = null; }
    this.input.endFrame();
  }

  updateTitle() {
    const options = ['Begin Journey', 'Level Select', 'Myth & History'];
    if (this.input.just('up')) this.titleSelection = (this.titleSelection + options.length - 1) % options.length;
    if (this.input.just('down')) this.titleSelection = (this.titleSelection + 1) % options.length;
    if (this.input.just('codex')) { this.state = 'codex'; return; }
    if (this.input.just('levelselect')) { this.state = 'levelSelect'; return; }
    if (this.input.pointer?.clicked) {
      const y = this.input.pointer.y;
      options.forEach((_, i) => { if (y > 334 + i * 44 && y < 372 + i * 44) this.titleSelection = i; });
      this.chooseTitleOption();
    }
    if (this.input.just('confirm')) this.chooseTitleOption();
  }
  chooseTitleOption() {
    this.audio.beep('menu');
    if (this.titleSelection === 0) this.startLevel(this.save.highestUnlocked >= levels.length ? 0 : this.save.highestUnlocked, true);
    if (this.titleSelection === 1) this.state = 'levelSelect';
    if (this.titleSelection === 2) this.state = 'codex';
  }
  updateLevelSelect() {
    if (this.input.just('back')) { this.state = 'title'; return; }
    if (this.input.just('left')) this.levelSelection = clamp(this.levelSelection - 1, 0, Math.min(this.save.highestUnlocked, levels.length - 1));
    if (this.input.just('right')) this.levelSelection = clamp(this.levelSelection + 1, 0, Math.min(this.save.highestUnlocked, levels.length - 1));
    if (this.input.pointer?.clicked) {
      const x = this.input.pointer.x;
      levels.forEach((_, i) => { if (x > 110 + i * 190 && x < 270 + i * 190) this.levelSelection = i; });
      if (this.levelSelection <= this.save.highestUnlocked) this.startLevel(this.levelSelection, true);
    }
    if (this.input.just('confirm') && this.levelSelection <= this.save.highestUnlocked) this.startLevel(this.levelSelection, true);
  }
  updateCodex() {
    const entries = codexEntries;
    if (this.input.just('back')) { this.state = 'title'; return; }
    if (this.input.just('up')) this.codexSelection = (this.codexSelection + entries.length - 1) % entries.length;
    if (this.input.just('down')) this.codexSelection = (this.codexSelection + 1) % entries.length;
    if (this.input.pointer?.clicked) {
      const y = this.input.pointer.y;
      entries.forEach((_, i) => { if (y > 115 + i * 38 && y < 148 + i * 38) this.codexSelection = i; });
    }
  }
  updateLore() { if (this.input.just('confirm') || this.input.just('back') || this.input.pointer?.clicked) this.closeLore(); }
  updatePause() {
    if (this.input.just('pause') || this.input.just('back')) this.state = 'playing';
    if (this.input.just('confirm')) this.state = 'playing';
  }
  updateLevelComplete() {
    if (this.input.just('confirm') || this.input.pointer?.clicked) {
      const next = this.currentLevelIndex + 1;
      if (next < levels.length) this.startLevel(next, true); else this.state = 'gameComplete';
    }
    if (this.input.just('back')) this.state = 'title';
  }
  updateGameComplete() {
    if (this.input.just('confirm') || this.input.pointer?.clicked) this.state = 'codex';
    if (this.input.just('back')) this.state = 'title';
  }

  updatePlaying(dt: number) {
    if (this.input.just('pause')) { this.state = 'paused'; return; }
    if (this.input.just('toggle')) this.tryToggleWorld();
    this.player.update(this, dt);
    for (const enemy of this.enemies) enemy.update(this, dt);
    this.enemies = this.enemies.filter(e => e.alive);
    if (this.boss) this.boss.update(this, dt);
    this.updateProjectiles(dt);
    this.checkHazardsAndObjects();
    this.updateCamera(dt);
  }

  checkHazardsAndObjects() {
    const pr = this.player.rect();
    const x0 = Math.floor(pr.x / TILE) - 1, x1 = Math.floor((pr.x + pr.w) / TILE) + 1;
    const y0 = Math.floor(pr.y / TILE) - 1, y1 = Math.floor((pr.y + pr.h) / TILE) + 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (this.isHazardChar(this.tileAt(x, y)) && overlap(pr, { x: x * TILE + 4, y: y * TILE + 4, w: TILE - 8, h: TILE - 8 })) this.player.hurt(this);
    }
    for (const cp of this.level.checkpoints) if (overlap(pr, cp)) { this.player.checkpoint = { x: cp.x, y: cp.y - this.player.h + cp.h }; }
    for (const shrine of this.level.shrines) {
      const r = { x: shrine.x - 16, y: shrine.y - 50, w: 56, h: 66 };
      if (overlap(pr, r) && this.input.just('interact')) { this.openLore(shrine.textId, 'playing'); this.audio.beep('menu'); }
    }
    for (const relic of this.level.relics) {
      if (this.save.relics.includes(relic.id)) continue;
      const r = { x: relic.x, y: relic.y, w: 22, h: 22 };
      if (overlap(pr, r)) {
        this.save.relics.push(relic.id); this.persist();
        this.spawnSparks(relic.x + 11, relic.y + 11, 24); this.audio.beep('collect');
        this.openLore(relic.noteId, 'playing');
      }
    }
    if (!this.level.isBoss && overlap(pr, this.level.exit)) this.completeLevel();
  }

  updateProjectiles(dt: number) {
    for (const pr of this.projectiles) {
      pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
      if (overlap(this.player.rect(), { x: pr.x - pr.r, y: pr.y - pr.r, w: pr.r * 2, h: pr.r * 2 })) { pr.life = 0; this.player.hurt(this); }
      if (this.overlapsSolid({ x: pr.x - pr.r, y: pr.y - pr.r, w: pr.r * 2, h: pr.r * 2 })) pr.life = 0;
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0);
  }

  completeLevel() {
    const id = this.level.id;
    if (!this.save.completed.includes(id)) this.save.completed.push(id);
    this.save.highestUnlocked = Math.max(this.save.highestUnlocked, Math.min(this.currentLevelIndex + 1, levels.length - 1));
    this.unlockCodex(this.level.unlockCodexOnComplete);
    this.persist();
    this.openLore(this.level.outroLore, this.level.isBoss ? 'gameComplete' : 'levelComplete');
  }

  updateCamera(dt: number) {
    const targetX = clamp(this.player.x + this.player.w / 2 - LOGICAL_W * 0.42 + this.player.facing * 70, 0, Math.max(0, this.level.width * TILE - LOGICAL_W));
    const targetY = clamp(this.player.y + this.player.h / 2 - LOGICAL_H * 0.58, 0, Math.max(0, this.level.height * TILE - LOGICAL_H));
    this.camera.x = lerp(this.camera.x, targetX, 1 - Math.pow(0.0008, dt));
    this.camera.y = lerp(this.camera.y, targetY, 1 - Math.pow(0.0008, dt));
  }

  updateParticles(dt: number) {
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.kind === 'dust' ? 160 : p.kind === 'mist' ? -10 : 80) * dt; p.life -= dt; }
    this.particles = this.particles.filter(p => p.life > 0);
    if (this.state === 'title' && Math.random() < .8) this.particles.push({ x: rand(0, LOGICAL_W), y: rand(130, 520), vx: rand(-10, 10), vy: rand(-8, -2), life: rand(2, 5), maxLife: 5, size: rand(1, 3), kind: 'star' });
  }

  spawnDust(x: number, y: number, n: number) { for (let i = 0; i < n; i++) this.particles.push({ x, y, vx: rand(-90, 90), vy: rand(-70, -10), life: rand(.25, .55), maxLife: .55, size: rand(2, 5), kind: 'dust' }); }
  spawnSparks(x: number, y: number, n: number) { for (let i = 0; i < n; i++) { const a = rand(0, Math.PI * 2), sp = rand(50, 220); this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(.25, .75), maxLife: .75, size: rand(2, 4), kind: 'spark' }); } }
  spawnHit(x: number, y: number, n: number) { for (let i = 0; i < n; i++) { const a = rand(0, Math.PI * 2), sp = rand(80, 320); this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(.18, .65), maxLife: .65, size: rand(2, 6), kind: 'hit' }); } }

  render() {
    ctx.save();
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
    if (this.shake > 0) ctx.translate(rand(-this.shake, this.shake), rand(-this.shake, this.shake));
    if (this.state === 'title') this.drawTitle(ctx);
    else if (this.state === 'levelSelect') this.drawLevelSelect(ctx);
    else if (this.state === 'codex') this.drawCodex(ctx);
    else {
      this.drawWorld(ctx);
      if (this.state === 'lore') this.drawLore(ctx);
      if (this.state === 'paused') this.drawPause(ctx);
      if (this.state === 'levelComplete') this.drawLevelComplete(ctx);
      if (this.state === 'gameComplete') this.drawGameComplete(ctx);
    }
    ctx.restore();
  }

  drawWorld(c: CanvasRenderingContext2D) {
    this.drawBackground(c);
    this.drawWind(c);
    this.drawTiles(c);
    for (const cp of this.level.checkpoints) this.drawCheckpoint(c, cp);
    for (const shrine of this.level.shrines) this.drawShrine(c, shrine.x, shrine.y);
    for (const relic of this.level.relics) if (!this.save.relics.includes(relic.id)) this.drawRelic(c, relic.x, relic.y);
    if (!this.level.isBoss) this.drawExit(c);
    for (const e of this.enemies) e.draw(this, c);
    if (this.boss) this.boss.draw(this, c);
    for (const p of this.projectiles) this.drawProjectile(c, p);
    this.player.draw(this, c);
    this.drawParticles(c);
    this.drawHUD(c);
    if (this.debug) this.drawDebug(c);
    if (this.message) this.drawFloatingText(c, this.message);
  }

  drawBackground(c: CanvasRenderingContext2D) {
    const day = this.world === 'day' ? 1 : 0;
    const t = this.transition;
    const dayAlpha = this.world === 'day' ? easeOutCubic(t) : 1 - easeOutCubic(t);
    const nightAlpha = 1 - dayAlpha;
    c.fillStyle = '#0a0611'; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    const dg = c.createLinearGradient(0, 0, 0, LOGICAL_H);
    dg.addColorStop(0, '#ef8a49'); dg.addColorStop(.45, '#51213a'); dg.addColorStop(1, '#150915');
    c.globalAlpha = dayAlpha; c.fillStyle = dg; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    const ng = c.createLinearGradient(0, 0, 0, LOGICAL_H);
    ng.addColorStop(0, '#07142d'); ng.addColorStop(.48, '#16122b'); ng.addColorStop(1, '#08050d');
    c.globalAlpha = nightAlpha; c.fillStyle = ng; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    c.globalAlpha = 1;
    // sun/moon
    c.save(); c.translate(-this.camera.x * .04, 0);
    c.globalAlpha = dayAlpha; c.fillStyle = '#ffd17c'; c.shadowColor = '#ffbd54'; c.shadowBlur = 48; c.beginPath(); c.arc(770, 90, 42, 0, Math.PI * 2); c.fill();
    c.globalAlpha = nightAlpha; c.fillStyle = '#d7eeff'; c.shadowColor = '#a9d6ff'; c.shadowBlur = 36; c.beginPath(); c.arc(760, 92, 32, 0, Math.PI * 2); c.fill();
    c.restore(); c.shadowBlur = 0; c.globalAlpha = 1;
    // Zhulong eye in clouds
    this.drawDragonEye(c, dayAlpha);
    // parallax mountains / temples
    for (let layer = 0; layer < 4; layer++) {
      const par = [0.08, 0.16, 0.28, 0.42][layer];
      const baseY = [330, 365, 420, 470][layer];
      c.fillStyle = [`rgba(31,20,39,.62)`, `rgba(26,16,31,.72)`, `rgba(18,12,24,.84)`, `rgba(10,7,15,.96)`][layer];
      c.beginPath(); c.moveTo(0, LOGICAL_H);
      for (let x = -120; x <= LOGICAL_W + 180; x += 90) {
        const wx = x - (this.camera.x * par % 90);
        const peak = baseY - 70 - Math.sin((x + layer * 70) * .04) * 30;
        c.lineTo(wx, baseY); c.lineTo(wx + 45, peak); c.lineTo(wx + 90, baseY);
      }
      c.lineTo(LOGICAL_W, LOGICAL_H); c.closePath(); c.fill();
    }
    // temple silhouettes foreground parallax
    c.fillStyle = 'rgba(9,6,13,.86)';
    for (let i = -2; i < 9; i++) {
      const x = i * 180 - (this.camera.x * .55 % 180);
      c.fillRect(x + 60, 420, 65, 120);
      c.beginPath(); c.moveTo(x + 42, 420); c.lineTo(x + 92, 382); c.lineTo(x + 142, 420); c.closePath(); c.fill();
    }
  }

  drawDragonEye(c: CanvasRenderingContext2D, dayAlpha: number) {
    c.save();
    const x = 220 - this.camera.x * .03, y = 92;
    c.globalAlpha = .55;
    c.fillStyle = 'rgba(255,210,120,.08)';
    c.beginPath(); c.ellipse(x, y, 170, 58, .02, 0, Math.PI * 2); c.fill();
    c.globalAlpha = .72;
    c.strokeStyle = dayAlpha > .5 ? 'rgba(255,210,120,.75)' : 'rgba(141,202,255,.45)'; c.lineWidth = 5;
    c.beginPath(); c.ellipse(x, y, 132, 40 * (.25 + dayAlpha * .75), 0, 0, Math.PI * 2); c.stroke();
    if (dayAlpha > .08) {
      c.globalAlpha = dayAlpha;
      c.shadowColor = '#ff5c38'; c.shadowBlur = 34;
      c.fillStyle = '#18060b'; c.beginPath(); c.ellipse(x, y, 34, 39, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#f04d34'; c.beginPath(); c.ellipse(x, y, 13, 39, 0, 0, Math.PI * 2); c.fill();
    }
    c.restore(); c.globalAlpha = 1; c.shadowBlur = 0;
  }

  drawTiles(c: CanvasRenderingContext2D) {
    const x0 = Math.floor(this.camera.x / TILE) - 1, x1 = Math.ceil((this.camera.x + LOGICAL_W) / TILE) + 1;
    const y0 = Math.floor(this.camera.y / TILE) - 1, y1 = Math.ceil((this.camera.y + LOGICAL_H) / TILE) + 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const ch = this.tileAt(x, y); if (ch === '.') continue;
      const sx = x * TILE - this.camera.x, sy = y * TILE - this.camera.y;
      if (ch === '#') this.drawStone(c, sx, sy);
      if (ch === 'D') this.drawStatePlatform(c, sx, sy, 'day');
      if (ch === 'N') this.drawStatePlatform(c, sx, sy, 'night');
      if (ch === '^' || ch === 'F' || ch === 'S') this.drawHazard(c, sx, sy, ch);
    }
  }
  drawStone(c: CanvasRenderingContext2D, x: number, y: number) {
    c.fillStyle = '#2c2630'; c.fillRect(x, y, TILE, TILE);
    c.fillStyle = '#3e3742'; c.fillRect(x + 2, y + 2, TILE - 4, 7);
    c.strokeStyle = 'rgba(255,255,255,.06)'; c.strokeRect(x + .5, y + .5, TILE - 1, TILE - 1);
  }
  drawStatePlatform(c: CanvasRenderingContext2D, x: number, y: number, state: WorldState) {
    const active = this.world === state;
    c.globalAlpha = active ? 1 : .24;
    c.fillStyle = state === 'day' ? '#d49338' : '#5b83aa'; c.fillRect(x, y + 5, TILE, TILE - 10);
    c.fillStyle = state === 'day' ? '#ffe19a' : '#c7f0ff'; c.fillRect(x + 3, y + 7, TILE - 6, 4);
    c.globalAlpha = 1;
  }
  drawHazard(c: CanvasRenderingContext2D, x: number, y: number, ch: string) {
    const active = this.isHazardChar(ch);
    c.globalAlpha = active ? 1 : .22;
    c.fillStyle = ch === 'F' ? '#ff7840' : ch === 'S' ? '#8ed7ff' : '#b8a6a6';
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(x + i * 8, y + TILE); c.lineTo(x + i * 8 + 4, y + 8); c.lineTo(x + i * 8 + 8, y + TILE); c.fill(); }
    c.globalAlpha = 1;
  }
  drawWind(c: CanvasRenderingContext2D) {
    for (const z of this.level.windZones || []) {
      const sx = z.x - this.camera.x, sy = z.y - this.camera.y;
      c.save(); c.globalAlpha = this.world === 'day' ? .17 : .28; c.strokeStyle = this.world === 'day' ? '#ffe19a' : '#bfeeff'; c.lineWidth = 2;
      for (let i = 0; i < 6; i++) { const y = sy + (i * 37 + this.time * 65) % z.h; c.beginPath(); c.moveTo(sx + 15 + Math.sin(this.time * 2 + i) * 10, y); c.bezierCurveTo(sx + z.w / 2, y - 25, sx + z.w - 20, y + 20, sx + z.w - 5, y - 12); c.stroke(); }
      c.restore();
    }
  }
  drawCheckpoint(c: CanvasRenderingContext2D, r: Rect) {
    const x = r.x - this.camera.x, y = r.y - this.camera.y;
    c.fillStyle = '#251422'; c.fillRect(x + 10, y + 16, 8, 38);
    c.fillStyle = '#b33a32'; c.beginPath(); c.moveTo(x + 18, y + 18); c.lineTo(x + 46, y + 28); c.lineTo(x + 18, y + 38); c.fill();
    c.fillStyle = '#ffd77d'; c.beginPath(); c.arc(x + 14, y + 16, 8, 0, Math.PI * 2); c.fill();
  }
  drawShrine(c: CanvasRenderingContext2D, x: number, y: number) {
    const sx = x - this.camera.x, sy = y - this.camera.y;
    c.fillStyle = '#2b121d'; c.fillRect(sx, sy, 26, 55);
    c.fillStyle = '#d6a348'; c.fillRect(sx - 8, sy, 42, 8);
    c.fillStyle = this.world === 'day' ? '#ffd777' : '#a9d6ff'; c.beginPath(); c.arc(sx + 13, sy + 24, 7 + Math.sin(this.time * 5) * 1.5, 0, Math.PI * 2); c.fill();
    if (Math.abs(this.player.x - x) < 55 && Math.abs(this.player.y - y) < 70) this.drawSmallPrompt(c, sx - 18, sy - 24, 'F / ▲ Lore');
  }
  drawRelic(c: CanvasRenderingContext2D, x: number, y: number) {
    const sx = x - this.camera.x, sy = y - this.camera.y + Math.sin(this.time * 4 + x) * 5;
    c.save(); c.shadowColor = '#ffd777'; c.shadowBlur = 18; c.fillStyle = '#ffd777';
    c.beginPath(); c.moveTo(sx + 11, sy); c.lineTo(sx + 22, sy + 11); c.lineTo(sx + 11, sy + 22); c.lineTo(sx, sy + 11); c.closePath(); c.fill();
    c.restore();
  }
  drawExit(c: CanvasRenderingContext2D) {
    const e = this.level.exit, sx = e.x - this.camera.x, sy = e.y - this.camera.y;
    c.save(); c.shadowColor = this.world === 'day' ? '#ffbd54' : '#a9d6ff'; c.shadowBlur = 20;
    c.strokeStyle = this.world === 'day' ? '#ffd777' : '#a9d6ff'; c.lineWidth = 5;
    c.beginPath(); c.roundRect(sx, sy, e.w, e.h, 18); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(sx + 9, sy + 10, e.w - 18, e.h - 20);
    c.restore();
  }
  drawProjectile(c: CanvasRenderingContext2D, p: Projectile) {
    const x = p.x - this.camera.x, y = p.y - this.camera.y;
    c.save(); c.shadowColor = '#ff674d'; c.shadowBlur = 18; c.fillStyle = '#ffb45d'; c.beginPath(); c.arc(x, y, p.r, 0, Math.PI * 2); c.fill(); c.fillStyle = '#3b0c12'; c.fillRect(x - 4, y - 2, 8, 4); c.restore();
  }
  drawParticles(c: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      c.globalAlpha = a;
      c.fillStyle = p.kind === 'spark' ? (this.world === 'day' ? '#ffd777' : '#a9d6ff') : p.kind === 'hit' ? '#ff5c49' : p.kind === 'mist' ? '#c8ecff' : p.kind === 'star' ? '#ffe9b1' : '#c29b76';
      c.beginPath(); c.arc(p.x - this.camera.x, p.y - this.camera.y, p.size, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
  }
  drawSmallPrompt(c: CanvasRenderingContext2D, x: number, y: number, text: string) {
    c.save(); c.font = '14px Georgia'; c.textAlign = 'center'; c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(x - 38, y - 17, 76, 22); c.strokeStyle = 'rgba(246,191,94,.45)'; c.strokeRect(x - 38, y - 17, 76, 22); c.fillStyle = '#fff1ca'; c.fillText(text, x, y - 2); c.restore();
  }

  drawHUD(c: CanvasRenderingContext2D) {
    c.save();
    c.fillStyle = 'rgba(9,5,13,.58)'; c.fillRect(18, 16, 322, 62);
    c.strokeStyle = 'rgba(246,191,94,.35)'; c.strokeRect(18.5, 16.5, 322, 62);
    for (let i = 0; i < this.player.maxHp; i++) {
      c.fillStyle = i < this.player.hp ? '#d94a3a' : '#34212b'; c.beginPath(); c.moveTo(42 + i * 28, 36); c.bezierCurveTo(32 + i * 28, 22, 20 + i * 28, 37, 42 + i * 28, 55); c.bezierCurveTo(64 + i * 28, 37, 52 + i * 28, 22, 42 + i * 28, 36); c.fill();
    }
    const worldLabel = this.world === 'day' ? 'DAY: Eye Open' : 'NIGHT: Eye Closed';
    c.fillStyle = this.world === 'day' ? '#ffd777' : '#a9d6ff'; c.font = '18px Georgia'; c.fillText(worldLabel, 190, 40);
    c.font = '13px Georgia'; c.fillStyle = 'rgba(255,255,255,.78)'; c.fillText('E/C/Y toggles the dragon blink', 190, 61);
    c.fillStyle = 'rgba(9,5,13,.58)'; c.fillRect(LOGICAL_W - 308, 16, 290, 52); c.strokeStyle = 'rgba(246,191,94,.35)'; c.strokeRect(LOGICAL_W - 307.5, 16.5, 289, 51);
    c.fillStyle = '#fff1ca'; c.font = '18px Georgia'; c.textAlign = 'right'; c.fillText(this.level.title, LOGICAL_W - 32, 38);
    c.font = '13px Georgia'; c.fillStyle = 'rgba(255,255,255,.72)'; c.fillText('Relics ' + this.save.relics.length + '  •  F1 collision debug', LOGICAL_W - 32, 57);
    if (this.boss && this.boss.alive) {
      c.fillStyle = 'rgba(8,4,8,.72)'; c.fillRect(230, 92, 500, 24); c.strokeStyle = '#f1b55a'; c.strokeRect(230.5, 92.5, 499, 23);
      c.fillStyle = '#a62d2f'; c.fillRect(235, 97, 490 * (this.boss.hp / this.boss.maxHp), 14);
      c.fillStyle = '#fff1ca'; c.textAlign = 'center'; c.font = '15px Georgia'; c.fillText(this.boss.vulnerable ? 'Lantern Eater — vulnerable in Night' : 'Lantern Eater — blink to expose the light', 480, 86);
    }
    c.restore();
  }
  drawFloatingText(c: CanvasRenderingContext2D, msg: FloatingText) {
    c.save(); c.globalAlpha = 1 - Math.max(0, (msg.t - msg.max + .6) / .6); c.textAlign = 'center'; c.font = '20px Georgia'; c.fillStyle = 'rgba(9,5,13,.72)'; c.fillRect(260, 460, 440, 42); c.strokeStyle = 'rgba(246,191,94,.35)'; c.strokeRect(260.5, 460.5, 439, 41); c.fillStyle = '#fff1ca'; c.fillText(msg.text, 480, 487); c.restore(); }

  drawTitle(c: CanvasRenderingContext2D) {
    this.camera.x = 0; this.camera.y = 0;
    this.world = (Math.sin(this.time * .5) > -0.2) ? 'day' : 'night';
    this.transition = 1;
    this.drawBackground(c);
    this.drawParticles(c);
    c.save();
    c.textAlign = 'center';
    c.shadowColor = '#d94a3a'; c.shadowBlur = 28;
    c.fillStyle = '#ffe3a0'; c.font = '64px Georgia'; c.fillText('When the Dragon Blinks', LOGICAL_W / 2, 178);
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(255,255,255,.82)'; c.font = '20px Georgia'; c.fillText('A mythic platformer inspired by Zhulong, the Torch Dragon', LOGICAL_W / 2, 216);
    c.fillStyle = 'rgba(10,5,13,.72)'; c.fillRect(318, 304, 324, 168); c.strokeStyle = 'rgba(246,191,94,.42)'; c.strokeRect(318.5, 304.5, 323, 167);
    const opts = ['Begin Journey', 'Level Select', 'Myth & History'];
    opts.forEach((o, i) => {
      const y = 360 + i * 44; const sel = i === this.titleSelection;
      c.fillStyle = sel ? '#ffd777' : '#fff1ca'; c.font = sel ? '26px Georgia' : '22px Georgia';
      c.fillText((sel ? '◆ ' : '  ') + o + (sel ? ' ◆' : '  '), LOGICAL_W / 2, y);
    });
    c.fillStyle = 'rgba(255,255,255,.64)'; c.font = '14px Georgia'; c.fillText('Enter / A to select  •  H opens Myth & History', LOGICAL_W / 2, 506);
    c.restore();
  }
  drawLevelSelect(c: CanvasRenderingContext2D) {
    this.drawBackground(c);
    c.save(); c.textAlign = 'center'; c.fillStyle = '#ffe3a0'; c.font = '48px Georgia'; c.fillText('Choose a Shrine Path', 480, 96);
    levels.forEach((lvl, i) => {
      const x = 110 + i * 190, y = 190, unlocked = i <= this.save.highestUnlocked, sel = i === this.levelSelection;
      c.fillStyle = unlocked ? 'rgba(20,9,22,.76)' : 'rgba(20,20,24,.45)'; c.fillRect(x, y, 160, 190);
      c.strokeStyle = sel ? '#ffd777' : 'rgba(246,191,94,.32)'; c.lineWidth = sel ? 3 : 1; c.strokeRect(x + .5, y + .5, 159, 189);
      c.fillStyle = unlocked ? '#fff1ca' : '#777'; c.font = '20px Georgia'; c.fillText(lvl.title.replace('Level ', 'L'), x + 80, y + 42);
      c.font = '14px Georgia'; wrapText(c, unlocked ? lvl.subtitle : 'Locked', x + 18, y + 78, 124, 20);
      c.fillStyle = unlocked ? '#ffd777' : '#555'; c.font = '42px Georgia'; c.fillText(unlocked ? (i === 3 ? '☲' : '◈') : '⌧', x + 80, y + 154);
    });
    c.fillStyle = 'rgba(255,255,255,.68)'; c.font = '16px Georgia'; c.fillText('←/→ choose  •  Enter start  •  Esc back', 480, 480); c.restore();
  }
  drawCodex(c: CanvasRenderingContext2D) {
    this.drawBackground(c);
    c.save();
    c.fillStyle = 'rgba(8,4,12,.72)'; c.fillRect(64, 48, 832, 444); c.strokeStyle = 'rgba(246,191,94,.38)'; c.strokeRect(64.5, 48.5, 831, 443);
    c.fillStyle = '#ffe3a0'; c.font = '42px Georgia'; c.textAlign = 'center'; c.fillText('Myth & History', 480, 92);
    c.font = '14px Georgia'; c.fillStyle = 'rgba(255,255,255,.68)'; c.fillText('This game is inspired by traditional accounts of Zhulong. Mythological details vary across sources and retellings.', 480, 116);
    const leftX = 94, top = 144;
    codexEntries.forEach((e, i) => {
      const unlocked = this.save.codex.includes(e.id); const sel = i === this.codexSelection;
      c.fillStyle = sel ? 'rgba(246,191,94,.16)' : 'transparent'; c.fillRect(leftX - 10, top + i * 38 - 24, 300, 32);
      c.fillStyle = unlocked ? (sel ? '#ffd777' : '#fff1ca') : '#777'; c.font = '18px Georgia'; c.textAlign = 'left'; c.fillText((unlocked ? '◇ ' : '◇ ') + e.title, leftX, top + i * 38);
    });
    const entry = codexEntries[this.codexSelection]; const unlocked = this.save.codex.includes(entry.id);
    c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(430, 142, 410, 280);
    c.strokeStyle = 'rgba(246,191,94,.24)'; c.strokeRect(430.5, 142.5, 409, 279);
    c.fillStyle = unlocked ? '#ffe3a0' : '#999'; c.font = '28px Georgia'; c.textAlign = 'left'; c.fillText(entry.title, 458, 188);
    c.fillStyle = unlocked ? '#fff1ca' : '#aaa'; c.font = '19px Georgia'; wrapText(c, unlocked ? entry.body : 'Locked. ' + entry.unlockHint + '.', 458, 226, 350, 28);
    c.fillStyle = 'rgba(255,255,255,.64)'; c.font = '15px Georgia'; c.textAlign = 'center'; c.fillText('↑/↓ choose  •  Esc back', 480, 466); c.restore();
  }
  drawLore(c: CanvasRenderingContext2D) {
    if (!this.lorePanel) return;
    c.save(); c.fillStyle = 'rgba(4,2,7,.66)'; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    const x = 155, y = 82, w = 650, h = 376;
    c.fillStyle = 'rgba(18,8,20,.92)'; c.fillRect(x, y, w, h); c.strokeStyle = 'rgba(246,191,94,.54)'; c.lineWidth = 2; c.strokeRect(x + .5, y + .5, w - 1, h - 1);
    c.textAlign = 'center'; c.fillStyle = '#ffe3a0'; c.font = '34px Georgia'; c.fillText(this.lorePanel.title, LOGICAL_W / 2, y + 52);
    let yy = y + 98;
    c.textAlign = 'left';
    for (const sec of this.lorePanel.sections) {
      c.fillStyle = sec.label === 'Myth' ? '#ffd777' : sec.label === 'Historical Note' || sec.label === 'History' ? '#a9d6ff' : '#ffc0a0';
      c.font = '18px Georgia'; c.fillText(sec.label, x + 42, yy);
      c.fillStyle = '#fff1ca'; c.font = '20px Georgia'; yy = wrapText(c, sec.text, x + 42, yy + 28, w - 84, 27) + 22;
    }
    c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,.62)'; c.font = '16px Georgia'; c.fillText('Enter / A / tap to continue', LOGICAL_W / 2, y + h - 28);
    c.restore();
  }
  drawPause(c: CanvasRenderingContext2D) {
    c.save(); c.fillStyle = 'rgba(4,2,7,.62)'; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H); c.fillStyle = 'rgba(18,8,20,.92)'; c.fillRect(330, 170, 300, 180); c.strokeStyle = 'rgba(246,191,94,.5)'; c.strokeRect(330.5, 170.5, 299, 179); c.textAlign = 'center'; c.fillStyle = '#ffe3a0'; c.font = '42px Georgia'; c.fillText('Paused', 480, 230); c.fillStyle = '#fff1ca'; c.font = '18px Georgia'; c.fillText('Enter or Esc to resume', 480, 282); c.fillText('Day/Night: E/C/Y  •  Attack: J/X', 480, 316); c.restore();
  }
  drawLevelComplete(c: CanvasRenderingContext2D) {
    c.save(); c.fillStyle = 'rgba(4,2,7,.68)'; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H); c.textAlign = 'center'; c.fillStyle = '#ffe3a0'; c.font = '48px Georgia'; c.fillText('Shrine Path Restored', 480, 205); c.fillStyle = '#fff1ca'; c.font = '22px Georgia'; c.fillText('A new Myth & History entry has been unlocked.', 480, 255); c.font = '18px Georgia'; c.fillText('Enter / tap for the next level  •  Esc for title', 480, 315); c.restore();
  }
  drawGameComplete(c: CanvasRenderingContext2D) {
    c.save(); c.fillStyle = 'rgba(4,2,7,.72)'; c.fillRect(0, 0, LOGICAL_W, LOGICAL_H); c.textAlign = 'center'; c.fillStyle = '#ffe3a0'; c.font = '50px Georgia'; c.fillText('The Dragon Blinks Again', 480, 110);
    c.fillStyle = 'rgba(18,8,20,.86)'; c.fillRect(170, 150, 620, 260); c.strokeStyle = 'rgba(246,191,94,.45)'; c.strokeRect(170.5, 150.5, 619, 259);
    c.textAlign = 'left'; let yy = 195; c.font = '19px Georgia';
    yy = drawLabelled(c, 'Myth', 'Zhulong is remembered as a vast dragon associated with cosmic light, darkness, and natural cycles.', 210, yy, 540);
    yy = drawLabelled(c, 'History', 'Accounts appear in old Chinese mythological and geographical traditions. Details vary across texts, translations, and retellings.', 210, yy + 12, 540);
    yy = drawLabelled(c, 'Game Inspiration', 'The Day/Night mechanic adapts the eye motif. The shrine runner and Lantern Eater are original game inventions.', 210, yy + 12, 540);
    c.textAlign = 'center'; c.fillStyle = '#fff1ca'; c.font = '18px Georgia'; c.fillText('Enter / tap: Myth & History  •  Esc: Title', 480, 470); c.restore();
  }
  drawDebug(c: CanvasRenderingContext2D) {
    c.save(); c.strokeStyle = '#00ff99'; c.lineWidth = 1;
    const p = this.player.rect(); c.strokeRect(p.x - this.camera.x, p.y - this.camera.y, p.w, p.h);
    if (this.player.attackTimer > 0) { const a = this.player.attackRect(); c.strokeStyle = '#ff0'; c.strokeRect(a.x - this.camera.x, a.y - this.camera.y, a.w, a.h); }
    for (const s of this.solidsForRect({ x: this.camera.x, y: this.camera.y, w: LOGICAL_W, h: LOGICAL_H })) c.strokeRect(s.x - this.camera.x, s.y - this.camera.y, s.w, s.h);
    c.restore();
  }
}

function wrapText(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  const words = text.split(' '); let line = ''; let yy = y;
  for (const word of words) {
    const test = line + word + ' ';
    if (c.measureText(test).width > maxWidth && line) { c.fillText(line, x, yy); line = word + ' '; yy += lineHeight; }
    else line = test;
  }
  if (line) { c.fillText(line, x, yy); yy += lineHeight; }
  return yy;
}
function drawLabelled(c: CanvasRenderingContext2D, label: string, text: string, x: number, y: number, w: number): number {
  c.fillStyle = label === 'Myth' ? '#ffd777' : label === 'History' ? '#a9d6ff' : '#ffc0a0'; c.font = '18px Georgia'; c.fillText(label, x, y);
  c.fillStyle = '#fff1ca'; c.font = '18px Georgia'; return wrapText(c, text, x, y + 26, w, 24);
}

let last = performance.now();
let accumulator = 0;
const STEP = 1 / 60;
const game = new Game();

function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now; accumulator += dt;
  while (accumulator >= STEP) { game.update(STEP); accumulator -= STEP; }
  game.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Keep the logical canvas buffer stable; CSS handles fit/contain.
function resize() {
  canvas.width = LOGICAL_W; canvas.height = LOGICAL_H;
  ctx.imageSmoothingEnabled = true;
}
window.addEventListener('resize', resize);
resize();

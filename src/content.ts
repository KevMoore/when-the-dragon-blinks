// Level layouts (built with a compact tile grid), plus lore panels and codex.
import { TILE } from './types.js';
import type { LevelData, CodexEntry, LorePanel, MovingPlatform } from './types.js';

// ---- tile grid helpers -----------------------------------------------------
function emptyMap(w: number, h: number): string[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
}
function setTile(map: string[][], x: number, y: number, c: string) {
  if (y >= 0 && y < map.length && x >= 0 && x < map[0].length) map[y][x] = c;
}
function rect(map: string[][], x: number, y: number, w: number, h: number, c: string) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) setTile(map, xx, yy, c);
}
function row(map: string[][], x: number, y: number, w: number, c: string) { rect(map, x, y, w, 1, c); }
function toStrings(map: string[][]): string[] { return map.map(r => r.join('')); }

/** Build continuous rolling ground from stepped segments.
 *  segs: sorted {x, top}; `top` is the grass row for columns >= x until the next
 *  segment. top === null leaves a pit. Grass caps the surface, stone fills below. */
function ground(m: string[][], w: number, h: number, segs: { x: number; top: number | null }[]) {
  let si = 0;
  for (let x = 0; x < w; x++) {
    while (si + 1 < segs.length && segs[si + 1].x <= x) si++;
    const top = segs[si].top;
    if (top === null) continue;
    setTile(m, x, top, 'g');
    for (let y = top + 1; y < h; y++) setTile(m, x, y, '#');
  }
}
function mp(x: number, y: number, w: number, o: Partial<MovingPlatform> = {}): MovingPlatform {
  return { x: x * TILE, y: y * TILE, w: w * TILE, ax: 0, ay: 0, speed: 1, phase: 0, ...o };
}

// ---- Level 1: Mountain Gate ------------------------------------------------
function makeLevel1(): LevelData {
  const w = 156, h = 18;
  const m = emptyMap(w, h);
  ground(m, w, h, [
    { x: 0, top: 14 }, { x: 16, top: 13 }, { x: 26, top: 14 }, { x: 34, top: null }, { x: 38, top: 14 },
    { x: 50, top: 12 }, { x: 62, top: 14 }, { x: 70, top: 13 }, { x: 78, top: null }, { x: 82, top: 14 },
    { x: 94, top: 12 }, { x: 106, top: 14 }, { x: 116, top: 11 }, { x: 128, top: 11 }, { x: 138, top: 12 }, { x: 150, top: 12 },
  ]);
  rect(m, 154, 7, 2, 11, '#');                       // end wall
  // Mario-style jump-through platforms (cover & vantage points)
  row(m, 20, 10, 5, 'o'); row(m, 52, 9, 6, 'o'); row(m, 96, 9, 5, 'o'); row(m, 120, 8, 6, 'o');
  row(m, 42, 11, 4, 'D');                            // day-only cover
  // night spirit bridge across the 2nd pit + a night ladder up to the relic
  row(m, 77, 13, 6, 'N'); row(m, 84, 10, 4, 'N'); row(m, 80, 7, 6, 'N');
  row(m, 40, 13, 4, 'F'); row(m, 108, 13, 4, 'S');   // stateful hazards on the ground
  return {
    id: 'mountain-gate', title: 'Level 1: Mountain Gate', subtitle: 'March, shoot, and blink toward the eye',
    theme: 'mountain', width: w, height: h, tiles: toStrings(m),
    spawn: { x: 64, y: 400 }, exit: { x: 150 * TILE, y: 7 * TILE, w: 44, h: 6 * TILE },
    checkpoints: [{ x: 36 * TILE, y: 14 * TILE - 40, w: 28, h: 56 }, { x: 106 * TILE, y: 14 * TILE - 40, w: 28, h: 56 }],
    relics: [{ id: 'l1-hidden-night-path', x: 82 * TILE, y: 7 * TILE - 26, noteId: 'relic-eye-fragment' }],
    shrines: [{ x: 10 * TILE, y: 12 * TILE, textId: 'shrine-who-is-zhulong' }],
    entities: [
      { kind: 'moth', x: 30 * TILE, y: 300 }, { kind: 'crawler', x: 52 * TILE, y: 380 }, { kind: 'guardian', x: 64 * TILE, y: 340 },
      { kind: 'sentry', x: 92 * TILE, y: 260 }, { kind: 'ghoul', x: 110 * TILE, y: 340 }, { kind: 'skull', x: 132 * TILE, y: 280 },
    ],
    platforms: [mp(34, 13, 3, { ax: 4 * TILE, speed: 0.7 })],
    introLore: 'intro-l1', outroLore: 'outro-l1', unlockCodexOnComplete: ['texts-vary'],
  };
}

// ---- Level 2: The Blinking Bridge -----------------------------------------
function makeLevel2(): LevelData {
  const w = 170, h = 18;
  const m = emptyMap(w, h);
  ground(m, w, h, [
    { x: 0, top: 14 }, { x: 14, top: 13 }, { x: 22, top: null }, { x: 32, top: 14 },
    { x: 44, top: 12 }, { x: 54, top: null }, { x: 64, top: 14 }, { x: 76, top: 13 },
    { x: 86, top: null }, { x: 96, top: 14 }, { x: 108, top: 12 }, { x: 120, top: 14 },
    { x: 130, top: null }, { x: 140, top: 14 }, { x: 152, top: 12 }, { x: 164, top: 12 },
  ]);
  rect(m, 168, 7, 2, 11, '#');
  // chasm crossings — alternate day/night platforms to pass
  row(m, 24, 13, 3, 'D'); row(m, 28, 11, 3, 'N');
  row(m, 55, 12, 3, 'N'); row(m, 59, 13, 3, 'D');
  row(m, 87, 12, 3, 'D'); row(m, 91, 11, 3, 'N');
  row(m, 22, 16, 10, '^'); row(m, 54, 16, 10, '^'); row(m, 86, 16, 10, '^'); row(m, 130, 16, 10, '^');
  // jump-through vantage + long moon-bridge relic route
  row(m, 44, 9, 5, 'o'); row(m, 108, 9, 5, 'o');
  row(m, 104, 10, 3, 'N'); row(m, 106, 8, 3, 'N'); row(m, 100, 6, 16, 'N');
  row(m, 36, 13, 4, 'F'); row(m, 116, 11, 4, 'S');
  return {
    id: 'blinking-bridge', title: 'Level 2: The Blinking Bridge', subtitle: 'Blink the world to make the path',
    theme: 'bridge', width: w, height: h, tiles: toStrings(m),
    spawn: { x: 64, y: 400 }, exit: { x: 164 * TILE, y: 7 * TILE, w: 44, h: 6 * TILE },
    checkpoints: [{ x: 40 * TILE, y: 12 * TILE - 40, w: 28, h: 56 }, { x: 96 * TILE, y: 14 * TILE - 40, w: 28, h: 56 }, { x: 140 * TILE, y: 14 * TILE - 40, w: 28, h: 56 }],
    relics: [{ id: 'l2-moon-bridge', x: 108 * TILE, y: 6 * TILE - 26, noteId: 'relic-blinking-image' }],
    shrines: [{ x: 8 * TILE, y: 12 * TILE, textId: 'shrine-eye-day-night' }],
    entities: [
      { kind: 'moth', x: 18 * TILE, y: 300 }, { kind: 'sentry', x: 46 * TILE, y: 340 }, { kind: 'skull', x: 58 * TILE, y: 290 },
      { kind: 'ghoul', x: 72 * TILE, y: 340 }, { kind: 'sentry', x: 108 * TILE, y: 260 }, { kind: 'skull', x: 134 * TILE, y: 290 }, { kind: 'ghoul', x: 156 * TILE, y: 330 },
      { kind: 'crawler', x: 40 * TILE, y: 340 }, { kind: 'wisp', x: 100 * TILE, y: 300 }, { kind: 'ghoul', x: 120 * TILE, y: 340 }, { kind: 'skull', x: 148 * TILE, y: 280 },
    ],
    platforms: [
      mp(56, 12, 3, { ax: 3 * TILE, speed: 0.8 }),
      mp(132, 13, 3, { ay: 3 * TILE, speed: 0.9 }), mp(135, 13, 3, { ay: 3 * TILE, speed: 0.9, phase: Math.PI }),
    ],
    introLore: 'intro-l2', outroLore: 'outro-l2', unlockCodexOnComplete: ['blinking-image'],
  };
}

// ---- Level 3: Breath Cavern -----------------------------------------------
function makeLevel3(): LevelData {
  const w = 172, h = 20;
  const m = emptyMap(w, h);
  ground(m, w, h, [
    { x: 0, top: 16 }, { x: 14, top: 15 }, { x: 24, top: 16 }, { x: 32, top: 14 }, { x: 42, top: 16 },
    { x: 50, top: null }, { x: 60, top: 15 }, { x: 72, top: 16 }, { x: 82, top: 14 }, { x: 92, top: 16 },
    { x: 100, top: null }, { x: 110, top: 16 }, { x: 122, top: 14 }, { x: 134, top: 16 },
    { x: 146, top: 13 }, { x: 158, top: 13 }, { x: 168, top: 13 },
  ]);
  rect(m, 170, 8, 2, 12, '#');
  // updraft shafts (ride the dragon's breath up and across the pits)
  row(m, 52, 5, 3, 'o'); rect(m, 55, 3, 4, 2, '#');         // relic ledge atop shaft 1
  // jump-through vantage + day/night cover
  row(m, 34, 11, 4, 'o'); row(m, 122, 10, 4, 'o');
  row(m, 72, 13, 4, 'D'); row(m, 110, 13, 4, 'N');
  row(m, 26, 15, 4, 'F'); row(m, 134, 15, 4, 'S');
  return {
    id: 'breath-cavern', title: 'Level 3: Breath Cavern', subtitle: 'The cavern moves with dragon breath',
    theme: 'cavern', width: w, height: h, tiles: toStrings(m),
    spawn: { x: 64, y: 470 }, exit: { x: 166 * TILE, y: 8 * TILE, w: 44, h: 6 * TILE },
    checkpoints: [{ x: 44 * TILE, y: 16 * TILE - 40, w: 28, h: 56 }, { x: 92 * TILE, y: 16 * TILE - 40, w: 28, h: 56 }, { x: 134 * TILE, y: 16 * TILE - 40, w: 28, h: 56 }],
    relics: [{ id: 'l3-breath-current', x: 53 * TILE, y: 5 * TILE - 26, noteId: 'relic-breath-seasons' }],
    shrines: [{ x: 8 * TILE, y: 14 * TILE, textId: 'shrine-breath' }],
    entities: [
      { kind: 'crawler', x: 30 * TILE, y: 440 }, { kind: 'moth', x: 44 * TILE, y: 300 }, { kind: 'ghoul', x: 74 * TILE, y: 420 },
      { kind: 'skull', x: 92 * TILE, y: 340 }, { kind: 'crawler', x: 116 * TILE, y: 440 }, { kind: 'sentry', x: 146 * TILE, y: 382 }, { kind: 'ghoul', x: 158 * TILE, y: 400 },
      { kind: 'skull', x: 60 * TILE, y: 320 }, { kind: 'wisp', x: 88 * TILE, y: 320 }, { kind: 'crawler', x: 128 * TILE, y: 420 }, { kind: 'ghoul', x: 110 * TILE, y: 400 },
    ],
    platforms: [
      mp(84, 13, 3, { ax: 5 * TILE, speed: 0.8 }),
      mp(64, 14, 3, { crumble: true }), mp(114, 14, 3, { crumble: true }),
      mp(124, 11, 3, { ay: 3 * TILE, speed: 1.1 }),
    ],
    windZones: [{ x: 50 * TILE, y: 2 * TILE, w: 10 * TILE, h: 16 * TILE }, { x: 100 * TILE, y: 2 * TILE, w: 10 * TILE, h: 16 * TILE }],
    introLore: 'intro-l3', outroLore: 'outro-l3', unlockCodexOnComplete: ['breath-seasons'],
  };
}

// ---- Boss: The Lantern Eater ----------------------------------------------
function makeBossLevel(): LevelData {
  const w = 40, h = 18;
  const m = emptyMap(w, h);
  row(m, 0, 16, w, '#'); row(m, 0, 17, w, '#');
  rect(m, 0, 0, 2, 18, '#'); rect(m, w - 2, 0, 2, 18, '#');
  row(m, 6, 12, 4, 'D'); row(m, 30, 12, 4, 'N');   // side ledges to dodge/climb
  row(m, 17, 10, 6, 'o');                           // center perch (one-way)
  return {
    id: 'lantern-eater', title: 'Boss: The Lantern Eater', subtitle: 'An invented creature that hoards the dawn',
    theme: 'arena', width: w, height: h, tiles: toStrings(m),
    spawn: { x: 150, y: 430 }, exit: { x: 1120, y: 356, w: 40, h: 92 },
    checkpoints: [{ x: 130, y: 12 * TILE - 24, w: 28, h: 56 }], relics: [],
    shrines: [{ x: 250, y: 14 * TILE, textId: 'shrine-boss-invention' }], entities: [],
    introLore: 'intro-boss', outroLore: 'outro-boss', unlockCodexOnComplete: ['game-inventions', 'myth-vs-adaptation'], isBoss: true,
  };
}

export const levels: LevelData[] = [makeLevel1(), makeLevel2(), makeLevel3(), makeBossLevel()];

// ---- Lore panels -----------------------------------------------------------
export const loreTexts: Record<string, LorePanel> = {
  'intro-l1': { title: 'Before the Mountain Gate', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'Zhulong, the Torch Dragon or Candle Dragon, is imagined in some traditions as a cosmic being of light, darkness, and turning cycles — day when his eye opens, night when it closes.' },
    { label: 'Game Inspiration', text: 'The Lantern Eater has trapped the dawn, and the eye no longer turns on its own. You carry a fragment of it. With it you can blink the sky — and the two hosts answer: sun-things wake by day, shadow-things by night. Wake the eye, climb to the gate.' }] },
  'outro-l1': { title: 'After Level 1', nextMode: 'levelComplete', sections: [
    { label: 'Historical Note', text: 'Descriptions of Zhulong vary across ancient texts, translations, and later retellings. Some emphasize a red serpentine body and a human-like face.' },
    { label: 'Game Inspiration', text: 'The shrine runner, relics, and gate trials are original inventions that help introduce the myth.' }] },
  'intro-l2': { title: 'Before the Blinking Bridge', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'In some accounts, when Zhulong opens his eyes there is day; when he closes them there is night.' },
    { label: 'Game Inspiration', text: 'This level turns the eye-opening motif into a platforming rule. Blink the world to find the path.' }] },
  'outro-l2': { title: 'After Level 2', nextMode: 'levelComplete', sections: [
    { label: 'Historical Note', text: 'Myths often give natural cycles a memorable story-shape. Zhulong’s blinking eye gives day and night a living image.' },
    { label: 'Game Inspiration', text: 'Day-only and night-only platforms are a playable adaptation, not a literal detail from the old sources.' }] },
  'intro-l3': { title: 'Before Breath Cavern', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'Zhulong’s breath is sometimes connected with wind, weather, cold, heat, or seasonal change.' },
    { label: 'Game Inspiration', text: 'The caverns below the mountain still move with the dragon’s breath. Ride the currents carefully.' }] },
  'outro-l3': { title: 'After Level 3', nextMode: 'levelComplete', sections: [
    { label: 'Historical Note', text: 'Many ancient myths connect divine or cosmic beings with natural forces. Here, wind currents are inspired by Zhulong’s breath.' },
    { label: 'Game Inspiration', text: 'The boss ahead is original: a symbol of imbalance between light and darkness.' }] },
  'intro-boss': { title: 'Before the Lantern Eater', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'Zhulong’s power is tied here to balance: day and night, light and darkness, breath and stillness.' },
    { label: 'Game Inspiration', text: 'The Lantern Eater is an original creature. It represents light hoarded instead of shared — strike its eye while the world is dark.' }] },
  'outro-boss': { title: 'The Dragon Blinks Again', nextMode: 'gameComplete', sections: [
    { label: 'Myth', text: 'Zhulong is remembered as a vast dragon associated with cosmic light, darkness, and natural cycles.' },
    { label: 'History', text: 'Accounts appear in old Chinese mythological and geographical traditions; details vary between texts, regions, translations, and retellings.' },
    { label: 'Game Inspiration', text: 'This game adapts the eye motif into a Day/Night mechanic. The shrine runner, Lantern Eater, and level trials are original inventions.' }] },
  'shrine-who-is-zhulong': { title: 'Lore Shrine: Who is Zhulong?', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'Zhulong is also called Torch Dragon or Candle Dragon. Some descriptions give him a human face and a serpentine red body.' },
    { label: 'Game Inspiration', text: 'The distant eye in the sky is this game’s way of making that cosmic scale visible while you play.' }] },
  'shrine-eye-day-night': { title: 'Lore Shrine: The Eye', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'The opening and closing of Zhulong’s eyes is linked in some accounts with the arrival of day and night.' },
    { label: 'Game Inspiration', text: 'Blink to shift between sunlight and spirit-shadow — and use it in a fight. Sun-things fall asleep in the dark; shadow-things fall asleep in the light. Blink to disarm whichever host hunts you, then strike them while they dream.' }] },
  'shrine-breath': { title: 'Lore Shrine: The Breath', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'Zhulong’s breath is sometimes described as a force of wind or seasonal change.' },
    { label: 'Game Inspiration', text: 'The rising gusts in this cavern are a playable metaphor for dragon breath, not a literal history.' }] },
  'shrine-boss-invention': { title: 'Lore Shrine: Invention', nextMode: 'playing', sections: [
    { label: 'Historical Note', text: 'The Lantern Eater is not part of the Zhulong legend.' },
    { label: 'Game Inspiration', text: 'It was invented to dramatize imbalance: light trapped, night starved, and the world unable to blink.' }] },
  'relic-eye-fragment': { title: 'Relic: Eye Fragment', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'A single eye can be a powerful mythic image: vision, light, time, and cosmic awareness.' },
    { label: 'Game Inspiration', text: 'Relics unlock optional notes in Myth & History.' }] },
  'relic-blinking-image': { title: 'Relic: Moon Bridge', nextMode: 'playing', sections: [
    { label: 'Historical Note', text: 'Ancient mythic images are often compact: one gesture, such as an eye closing, can explain a whole natural rhythm.' },
    { label: 'Game Inspiration', text: 'The bridge exists only under moonlight to make the myth readable through play.' }] },
  'relic-breath-seasons': { title: 'Relic: Breath Bell', nextMode: 'playing', sections: [
    { label: 'Myth', text: 'Some tellings connect Zhulong’s breath or voice with winter, summer, wind, or rain.' },
    { label: 'Game Inspiration', text: 'A future full game could expand this into seasonal puzzles.' }] },
};

// ---- Codex -----------------------------------------------------------------
export const codexEntries: CodexEntry[] = [
  { id: 'who-is-zhulong', title: 'Who is Zhulong?', unlockHint: 'Unlocked from the start', body: 'Zhulong, also known as Torch Dragon or Candle Dragon, is a figure from Chinese mythology. Some accounts describe a vast red, serpentine being with a human-like face and cosmic powers.' },
  { id: 'eye-day-night', title: 'The Eye of Day and Night', unlockHint: 'Unlocked from the start', body: 'In some accounts, Zhulong opens his eyes and there is day; he closes his eyes and there is night. This game adapts that image into the blink mechanic.' },
  { id: 'two-hosts', title: 'The Two Hosts', unlockHint: 'Unlocked from the start', body: 'With the eye unbalanced, the world holds two hosts of creatures. Solar and stone things — moths, lantern sentries, stone guardians — wake and hunt by day. Shadow, spirit, and restless dead — wisps, spirit skulls, jiangshi, and crawlers — wake and hunt by night. Each is only dangerous in its own world; blink to the other and it falls dormant, harmless, easy to strike. Holding the right eye is a weapon. (An original game system built on the day/night eye motif.)' },
  { id: 'texts-vary', title: 'Details Vary', unlockHint: 'Complete Level 1', body: 'Myths change across texts, regions, translations, and retellings. The game uses careful wording because it is inspired by tradition rather than claiming to be a literal reconstruction.' },
  { id: 'blinking-image', title: 'Blinking as a Mythic Image', unlockHint: 'Complete Level 2', body: 'A mythic image can turn a natural cycle into something memorable. Zhulong’s eye gives day and night a body, a rhythm, and a story.' },
  { id: 'breath-seasons', title: 'Breath, Wind, and Seasons', unlockHint: 'Complete Level 3', body: 'Some descriptions associate Zhulong’s breath with wind, weather, winter, summer, or seasonal change. Breath Cavern turns this into rising currents and shifting danger.' },
  { id: 'game-inventions', title: 'What the Game Invented', unlockHint: 'Defeat the boss', body: 'The shrine runner, relic shards, Lantern Eater, spirit platforms, and boss arena are original creations designed to make the myth interactive.' },
  { id: 'myth-vs-adaptation', title: 'Myth vs. Adaptation', unlockHint: 'Defeat the boss', body: 'This game respects the legend while adapting it. Myth panels describe source-inspired ideas; Game Inspiration panels explain invented mechanics and story elements.' },
];

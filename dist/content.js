// Level layouts (built with a compact tile grid), plus lore panels and codex.
import { TILE } from './types.js';
// ---- tile grid helpers -----------------------------------------------------
function emptyMap(w, h) {
    return Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
}
function setTile(map, x, y, c) {
    if (y >= 0 && y < map.length && x >= 0 && x < map[0].length)
        map[y][x] = c;
}
function rect(map, x, y, w, h, c) {
    for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++)
            setTile(map, xx, yy, c);
}
function row(map, x, y, w, c) { rect(map, x, y, w, 1, c); }
function toStrings(map) { return map.map(r => r.join('')); }
function mp(x, y, w, o = {}) {
    return { x: x * TILE, y: y * TILE, w: w * TILE, ax: 0, ay: 0, speed: 1, phase: 0, ...o };
}
// ---- Level 1: Mountain Gate ------------------------------------------------
function makeLevel1() {
    const w = 118, h = 18;
    const m = emptyMap(w, h);
    row(m, 0, 16, w, '#');
    row(m, 0, 17, w, '#');
    // opening steps
    row(m, 8, 14, 4, 'g');
    row(m, 14, 12, 4, 'g');
    row(m, 21, 11, 5, 'D');
    row(m, 30, 13, 4, 'g');
    row(m, 30, 15, 4, '^'); // spike pit lip
    row(m, 38, 12, 3, 'o');
    row(m, 43, 10, 4, 'N'); // hidden night step
    row(m, 50, 13, 6, 'g');
    row(m, 58, 15, 3, '^');
    row(m, 62, 12, 4, 'g');
    row(m, 69, 10, 4, 'D');
    row(m, 76, 12, 5, 'g');
    row(m, 84, 11, 3, 'o');
    row(m, 90, 13, 6, 'g');
    row(m, 98, 15, 4, '^');
    row(m, 103, 12, 5, 'g');
    row(m, 110, 9, 6, '#'); // gate landing
    rect(m, 114, 9, 2, 7, '#');
    // secret night staircase to the relic alcove (each step is 2 tiles, reachable)
    row(m, 47, 8, 3, 'N');
    row(m, 44, 6, 5, 'N');
    return {
        id: 'mountain-gate', title: 'Level 1: Mountain Gate', subtitle: 'Learn to climb toward the eye',
        theme: 'mountain', width: w, height: h, tiles: toStrings(m),
        spawn: { x: 64, y: 430 }, exit: { x: 111 * TILE, y: 5 * TILE, w: 44, h: 4 * TILE },
        checkpoints: [{ x: 51 * TILE, y: 12 * TILE - 24, w: 28, h: 56 }, { x: 90 * TILE, y: 12 * TILE - 24, w: 28, h: 56 }],
        relics: [{ id: 'l1-hidden-night-path', x: 45 * TILE, y: 6 * TILE - 26, noteId: 'relic-eye-fragment' }],
        shrines: [{ x: 16 * TILE, y: 11 * TILE, textId: 'shrine-who-is-zhulong' }],
        entities: [{ kind: 'moth', x: 26 * TILE, y: 300 }, { kind: 'guardian', x: 54 * TILE, y: 384 }, { kind: 'moth', x: 78 * TILE, y: 300 }, { kind: 'guardian', x: 94 * TILE, y: 384 }],
        platforms: [mp(33, 12, 3, { ax: 4 * TILE, speed: 0.7 })],
        introLore: 'intro-l1', outroLore: 'outro-l1', unlockCodexOnComplete: ['texts-vary'],
    };
}
// ---- Level 2: The Blinking Bridge -----------------------------------------
function makeLevel2() {
    const w = 128, h = 18;
    const m = emptyMap(w, h);
    row(m, 0, 16, w, '#');
    row(m, 0, 17, w, '#');
    // alternating day/night stepping stones over a gap
    row(m, 8, 13, 4, 'D');
    row(m, 15, 11, 4, 'N');
    row(m, 22, 13, 4, 'D');
    row(m, 29, 10, 4, 'N');
    row(m, 36, 12, 4, 'D');
    row(m, 43, 9, 5, 'N');
    // a chasm you cross only with correct switching
    rect(m, 50, 14, 18, 3, '.'); // pit
    row(m, 50, 15, 18, '^'); // spikes at bottom
    row(m, 52, 12, 3, 'D');
    row(m, 57, 10, 3, 'N');
    row(m, 62, 12, 3, 'D');
    row(m, 70, 13, 5, 'g');
    row(m, 78, 11, 4, 'N');
    row(m, 85, 13, 4, 'D');
    // upper optional collectible route (night bridge) with a reachable night ladder
    row(m, 47, 7, 3, 'N');
    row(m, 44, 5, 20, 'N');
    rect(m, 43, 4, 1, 3, '#');
    row(m, 92, 12, 6, 'g');
    row(m, 100, 10, 4, 'D');
    row(m, 107, 12, 5, 'N');
    row(m, 114, 10, 8, '#');
    rect(m, 120, 10, 2, 6, '#');
    row(m, 66, 14, 3, 'F');
    row(m, 96, 14, 3, 'S'); // stateful hazards
    return {
        id: 'blinking-bridge', title: 'Level 2: The Blinking Bridge', subtitle: 'Day and night become the path',
        theme: 'bridge', width: w, height: h, tiles: toStrings(m),
        spawn: { x: 64, y: 430 }, exit: { x: 115 * TILE, y: 6 * TILE, w: 44, h: 4 * TILE },
        checkpoints: [{ x: 37 * TILE, y: 11 * TILE - 24, w: 28, h: 56 }, { x: 71 * TILE, y: 12 * TILE - 24, w: 28, h: 56 }, { x: 93 * TILE, y: 11 * TILE - 24, w: 28, h: 56 }],
        relics: [{ id: 'l2-moon-bridge', x: 54 * TILE, y: 5 * TILE - 26, noteId: 'relic-blinking-image' }],
        shrines: [{ x: 9 * TILE, y: 12 * TILE, textId: 'shrine-eye-day-night' }],
        entities: [{ kind: 'moth', x: 30 * TILE, y: 260 }, { kind: 'wisp', x: 58 * TILE, y: 300 }, { kind: 'sentry', x: 74 * TILE, y: 384 }, { kind: 'wisp', x: 102 * TILE, y: 300 }, { kind: 'guardian', x: 116 * TILE, y: 288 }],
        platforms: [mp(52, 12, 3, { ay: 3 * TILE, speed: 0.9 }), mp(62, 12, 3, { ay: 3 * TILE, speed: 0.9, phase: Math.PI })],
        introLore: 'intro-l2', outroLore: 'outro-l2', unlockCodexOnComplete: ['blinking-image'],
    };
}
// ---- Level 3: Breath Cavern -----------------------------------------------
function makeLevel3() {
    const w = 132, h = 20;
    const m = emptyMap(w, h);
    row(m, 0, 18, w, '#');
    row(m, 0, 19, w, '#');
    row(m, 6, 15, 4, 'g');
    row(m, 12, 13, 4, 'D');
    row(m, 19, 11, 4, 'g');
    row(m, 12, 17, 3, 'F');
    row(m, 26, 17, 3, 'S');
    row(m, 26, 13, 4, 'N');
    row(m, 33, 15, 4, 'g');
    // wind updraft shaft climbing
    rect(m, 40, 8, 6, 10, '.');
    row(m, 40, 6, 3, 'o');
    row(m, 45, 4, 3, 'o');
    row(m, 41, 2, 4, '#');
    row(m, 48, 13, 4, 'D');
    row(m, 55, 11, 4, 'N');
    row(m, 62, 14, 5, 'g');
    row(m, 62, 17, 5, 'F');
    row(m, 70, 12, 4, 'g');
    row(m, 77, 10, 4, 'D');
    row(m, 84, 12, 4, 'N');
    // second updraft
    rect(m, 90, 6, 6, 12, '.');
    row(m, 91, 4, 4, '#');
    row(m, 98, 13, 5, 'g');
    row(m, 106, 11, 4, 'D');
    row(m, 113, 9, 5, 'N');
    row(m, 120, 8, 10, '#');
    rect(m, 128, 8, 2, 10, '#');
    return {
        id: 'breath-cavern', title: 'Level 3: Breath Cavern', subtitle: 'The mountain moves with dragon breath',
        theme: 'cavern', width: w, height: h, tiles: toStrings(m),
        spawn: { x: 64, y: 480 }, exit: { x: 121 * TILE, y: 4 * TILE, w: 44, h: 4 * TILE },
        checkpoints: [{ x: 34 * TILE, y: 14 * TILE - 24, w: 28, h: 56 }, { x: 63 * TILE, y: 13 * TILE - 24, w: 28, h: 56 }, { x: 99 * TILE, y: 12 * TILE - 24, w: 28, h: 56 }],
        relics: [{ id: 'l3-breath-current', x: 44 * TILE, y: 3 * TILE, noteId: 'relic-breath-seasons' }],
        shrines: [{ x: 7 * TILE, y: 14 * TILE, textId: 'shrine-breath' }],
        entities: [{ kind: 'wisp', x: 30 * TILE, y: 300 }, { kind: 'moth', x: 52 * TILE, y: 280 }, { kind: 'sentry', x: 72 * TILE, y: 352 }, { kind: 'wisp', x: 108 * TILE, y: 300 }, { kind: 'guardian', x: 122 * TILE, y: 224 }],
        platforms: [
            mp(48, 13, 3, { ax: 5 * TILE, speed: 0.8 }),
            mp(70, 12, 3, { crumble: true }),
            mp(98, 13, 3, { crumble: true }),
            mp(84, 12, 3, { ay: 3 * TILE, speed: 1.1 }),
        ],
        windZones: [{ x: 40 * TILE, y: 2 * TILE, w: 6 * TILE, h: 16 * TILE }, { x: 90 * TILE, y: 4 * TILE, w: 6 * TILE, h: 14 * TILE }],
        introLore: 'intro-l3', outroLore: 'outro-l3', unlockCodexOnComplete: ['breath-seasons'],
    };
}
// ---- Boss: The Lantern Eater ----------------------------------------------
function makeBossLevel() {
    const w = 40, h = 18;
    const m = emptyMap(w, h);
    row(m, 0, 16, w, '#');
    row(m, 0, 17, w, '#');
    rect(m, 0, 0, 2, 18, '#');
    rect(m, w - 2, 0, 2, 18, '#');
    row(m, 6, 12, 4, 'D');
    row(m, 30, 12, 4, 'N'); // side ledges to dodge/climb
    row(m, 17, 10, 6, 'o'); // center perch (one-way)
    return {
        id: 'lantern-eater', title: 'Boss: The Lantern Eater', subtitle: 'An invented creature that hoards the dawn',
        theme: 'arena', width: w, height: h, tiles: toStrings(m),
        spawn: { x: 150, y: 430 }, exit: { x: 1120, y: 356, w: 40, h: 92 },
        checkpoints: [{ x: 130, y: 12 * TILE - 24, w: 28, h: 56 }], relics: [],
        shrines: [{ x: 250, y: 14 * TILE, textId: 'shrine-boss-invention' }], entities: [],
        introLore: 'intro-boss', outroLore: 'outro-boss', unlockCodexOnComplete: ['game-inventions', 'myth-vs-adaptation'], isBoss: true,
    };
}
export const levels = [makeLevel1(), makeLevel2(), makeLevel3(), makeBossLevel()];
// ---- Lore panels -----------------------------------------------------------
export const loreTexts = {
    'intro-l1': { title: 'Before the Mountain Gate', nextMode: 'playing', sections: [
            { label: 'Myth', text: 'Zhulong, the Torch Dragon or Candle Dragon, is imagined in some traditions as a cosmic being of light, darkness, and turning cycles.' },
            { label: 'Game Inspiration', text: 'You carry a small fragment of the dragon eye. It awakens as you climb.' }
        ] },
    'outro-l1': { title: 'After Level 1', nextMode: 'levelComplete', sections: [
            { label: 'Historical Note', text: 'Descriptions of Zhulong vary across ancient texts, translations, and later retellings. Some emphasize a red serpentine body and a human-like face.' },
            { label: 'Game Inspiration', text: 'The shrine runner, relics, and gate trials are original inventions that help introduce the myth.' }
        ] },
    'intro-l2': { title: 'Before the Blinking Bridge', nextMode: 'playing', sections: [
            { label: 'Myth', text: 'In some accounts, when Zhulong opens his eyes there is day; when he closes them there is night.' },
            { label: 'Game Inspiration', text: 'This level turns the eye-opening motif into a platforming rule. Blink the world to find the path.' }
        ] },
    'outro-l2': { title: 'After Level 2', nextMode: 'levelComplete', sections: [
            { label: 'Historical Note', text: 'Myths often give natural cycles a memorable story-shape. Zhulong’s blinking eye gives day and night a living image.' },
            { label: 'Game Inspiration', text: 'Day-only and night-only platforms are a playable adaptation, not a literal detail from the old sources.' }
        ] },
    'intro-l3': { title: 'Before Breath Cavern', nextMode: 'playing', sections: [
            { label: 'Myth', text: 'Zhulong’s breath is sometimes connected with wind, weather, cold, heat, or seasonal change.' },
            { label: 'Game Inspiration', text: 'The caverns below the mountain still move with the dragon’s breath. Ride the currents carefully.' }
        ] },
    'outro-l3': { title: 'After Level 3', nextMode: 'levelComplete', sections: [
            { label: 'Historical Note', text: 'Many ancient myths connect divine or cosmic beings with natural forces. Here, wind currents are inspired by Zhulong’s breath.' },
            { label: 'Game Inspiration', text: 'The boss ahead is original: a symbol of imbalance between light and darkness.' }
        ] },
    'intro-boss': { title: 'Before the Lantern Eater', nextMode: 'playing', sections: [
            { label: 'Myth', text: 'Zhulong’s power is tied here to balance: day and night, light and darkness, breath and stillness.' },
            { label: 'Game Inspiration', text: 'The Lantern Eater is an original creature. It represents light hoarded instead of shared — strike its eye while the world is dark.' }
        ] },
    'outro-boss': { title: 'The Dragon Blinks Again', nextMode: 'gameComplete', sections: [
            { label: 'Myth', text: 'Zhulong is remembered as a vast dragon associated with cosmic light, darkness, and natural cycles.' },
            { label: 'History', text: 'Accounts appear in old Chinese mythological and geographical traditions; details vary between texts, regions, translations, and retellings.' },
            { label: 'Game Inspiration', text: 'This game adapts the eye motif into a Day/Night mechanic. The shrine runner, Lantern Eater, and level trials are original inventions.' }
        ] },
    'shrine-who-is-zhulong': { title: 'Lore Shrine: Who is Zhulong?', nextMode: 'playing', sections: [
            { label: 'Myth', text: 'Zhulong is also called Torch Dragon or Candle Dragon. Some descriptions give him a human face and a serpentine red body.' },
            { label: 'Game Inspiration', text: 'The distant eye in the sky is this game’s way of making that cosmic scale visible while you play.' }
        ] },
    'shrine-eye-day-night': { title: 'Lore Shrine: The Eye', nextMode: 'playing', sections: [
            { label: 'Myth', text: 'The opening and closing of Zhulong’s eyes is linked in some accounts with the arrival of day and night.' },
            { label: 'Game Inspiration', text: 'Press the blink button to shift between sunlight and spirit-shadow.' }
        ] },
    'shrine-breath': { title: 'Lore Shrine: The Breath', nextMode: 'playing', sections: [
            { label: 'Myth', text: 'Zhulong’s breath is sometimes described as a force of wind or seasonal change.' },
            { label: 'Game Inspiration', text: 'The rising gusts in this cavern are a playable metaphor for dragon breath, not a literal history.' }
        ] },
    'shrine-boss-invention': { title: 'Lore Shrine: Invention', nextMode: 'playing', sections: [
            { label: 'Historical Note', text: 'The Lantern Eater is not part of the Zhulong legend.' },
            { label: 'Game Inspiration', text: 'It was invented to dramatize imbalance: light trapped, night starved, and the world unable to blink.' }
        ] },
    'relic-eye-fragment': { title: 'Relic: Eye Fragment', nextMode: 'playing', sections: [
            { label: 'Myth', text: 'A single eye can be a powerful mythic image: vision, light, time, and cosmic awareness.' },
            { label: 'Game Inspiration', text: 'Relics unlock optional notes in Myth & History.' }
        ] },
    'relic-blinking-image': { title: 'Relic: Moon Bridge', nextMode: 'playing', sections: [
            { label: 'Historical Note', text: 'Ancient mythic images are often compact: one gesture, such as an eye closing, can explain a whole natural rhythm.' },
            { label: 'Game Inspiration', text: 'The bridge exists only under moonlight to make the myth readable through play.' }
        ] },
    'relic-breath-seasons': { title: 'Relic: Breath Bell', nextMode: 'playing', sections: [
            { label: 'Myth', text: 'Some tellings connect Zhulong’s breath or voice with winter, summer, wind, or rain.' },
            { label: 'Game Inspiration', text: 'A future full game could expand this into seasonal puzzles.' }
        ] },
};
// ---- Codex -----------------------------------------------------------------
export const codexEntries = [
    { id: 'who-is-zhulong', title: 'Who is Zhulong?', unlockHint: 'Unlocked from the start', body: 'Zhulong, also known as Torch Dragon or Candle Dragon, is a figure from Chinese mythology. Some accounts describe a vast red, serpentine being with a human-like face and cosmic powers.' },
    { id: 'eye-day-night', title: 'The Eye of Day and Night', unlockHint: 'Unlocked from the start', body: 'In some accounts, Zhulong opens his eyes and there is day; he closes his eyes and there is night. This game adapts that image into the blink mechanic.' },
    { id: 'texts-vary', title: 'Details Vary', unlockHint: 'Complete Level 1', body: 'Myths change across texts, regions, translations, and retellings. The game uses careful wording because it is inspired by tradition rather than claiming to be a literal reconstruction.' },
    { id: 'blinking-image', title: 'Blinking as a Mythic Image', unlockHint: 'Complete Level 2', body: 'A mythic image can turn a natural cycle into something memorable. Zhulong’s eye gives day and night a body, a rhythm, and a story.' },
    { id: 'breath-seasons', title: 'Breath, Wind, and Seasons', unlockHint: 'Complete Level 3', body: 'Some descriptions associate Zhulong’s breath with wind, weather, winter, summer, or seasonal change. Breath Cavern turns this into rising currents and shifting danger.' },
    { id: 'game-inventions', title: 'What the Game Invented', unlockHint: 'Defeat the boss', body: 'The shrine runner, relic shards, Lantern Eater, spirit platforms, and boss arena are original creations designed to make the myth interactive.' },
    { id: 'myth-vs-adaptation', title: 'Myth vs. Adaptation', unlockHint: 'Defeat the boss', body: 'This game respects the legend while adapting it. Myth panels describe source-inspired ideas; Game Inspiration panels explain invented mechanics and story elements.' },
];
//# sourceMappingURL=content.js.map
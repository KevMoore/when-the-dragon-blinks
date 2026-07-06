// Registers the AutoSprite-generated sheets. Called once at boot; sheets load
// asynchronously and each entity falls back to procedural art until ready.
// All sheets are 8 frames in a 3-column grid; frame size varies per subject.
import { sprites, loadStill } from './sprites.js';
export function loadSprites() {
    loadStill('platform', 'assets/sprites/props/platform.png');
    loadStill('bridge', 'assets/sprites/props/bridge.png');
    loadStill('mountains', 'assets/sprites/props/mountains.png');
    loadStill('fgrass', 'assets/sprites/props/fgrass.png');
    loadStill('fhang', 'assets/sprites/props/fhang.png');
    loadStill('gate', 'assets/sprites/structures/gate.png');
    loadStill('gate1', 'assets/sprites/structures/gate1.png');
    loadStill('gate2', 'assets/sprites/structures/gate2.png');
    loadStill('gate3', 'assets/sprites/structures/gate3.png');
    loadStill('gate4', 'assets/sprites/structures/gate4.png');
    loadStill('shrine', 'assets/sprites/structures/shrine.png');
    loadStill('checkpoint', 'assets/sprites/structures/checkpoint.png');
    loadStill('aimup', 'assets/sprites/player/aimup.png');
    loadStill('aimupdiag', 'assets/sprites/player/aimupdiag.png');
    loadStill('aimdown', 'assets/sprites/player/aimdown.png');
    loadStill('aimdowndiag', 'assets/sprites/player/aimdowndiag.png');
    const S = 'assets/sprites/';
    const add = (key, path, fw, fps, loop) => sprites.add(key, { src: S + path, fw, fh: fw, frames: 8, cols: 3, fps, loop });
    // player
    add('player/idle', 'player/idle.png', 128, 8, true);
    add('player/run', 'player/run.png', 128, 14, true);
    add('player/jump', 'player/jump.png', 128, 12, false);
    add('player/attack', 'player/attack.png', 128, 18, false);
    add('player/summon', 'player/summon.png', 128, 12, false);
    add('player/crouch', 'player/crouch.png', 128, 14, false);
    // enemies — silky 12-frame / 4-column flight for the airborne ones
    const addF = (key, path, fw, fps) => sprites.add(key, { src: S + path, fw, fh: fw, frames: 12, cols: 4, fps, loop: true });
    addF('enemy/moth/idle', 'moth/idle.png', 96, 14);
    addF('enemy/wisp/idle', 'wisp/idle.png', 96, 12);
    add('enemy/guardian/idle', 'guardian/idle.png', 128, 8, true);
    addF('enemy/guardian/walk', 'guardian/walk.png', 128, 12);
    add('enemy/sentry/idle', 'sentry/idle.png', 96, 8, true);
    addF('enemy/ghoul/walk', 'ghoul/walk.png', 128, 11);
    addF('enemy/skull/idle', 'skull/idle.png', 96, 12);
    addF('enemy/crawler/walk', 'crawler/walk.png', 128, 16);
    // new fable bad dudes (crow + wraith fly silky 12-frame; sentinel walks)
    addF('enemy/crow/idle', 'crow/idle.png', 96, 14);
    add('enemy/sentinel/idle', 'sentinel/idle.png', 128, 8, true);
    addF('enemy/sentinel/walk', 'sentinel/walk.png', 128, 11);
    addF('enemy/wraith/idle', 'wraith/idle.png', 96, 12);
    // boss — smooth 12-frame loom + mask-crack lunge
    sprites.add('boss/idle', { src: S + 'boss/idle.png', fw: 160, fh: 160, frames: 12, cols: 4, fps: 10, loop: true });
    sprites.add('boss/attack', { src: S + 'boss/attack.png', fw: 160, fh: 160, frames: 12, cols: 4, fps: 14, loop: true });
    // Zhulong transformation (smoother 12-frame / 4-column flight + breath)
    sprites.add('dragon/idle', { src: S + 'dragon/idle.png', fw: 160, fh: 160, frames: 12, cols: 4, fps: 12, loop: true });
    sprites.add('dragon/attack', { src: S + 'dragon/attack.png', fw: 160, fh: 160, frames: 12, cols: 4, fps: 16, loop: true });
}
//# sourceMappingURL=spritedata.js.map
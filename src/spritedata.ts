// Registers the AutoSprite-generated sheets. Called once at boot; sheets load
// asynchronously and each entity falls back to procedural art until ready.
// All sheets are 8 frames in a 3-column grid; frame size varies per subject.
import { sprites, loadStill } from './sprites.js';

export function loadSprites() {
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
  const add = (key: string, path: string, fw: number, fps: number, loop: boolean) =>
    sprites.add(key, { src: S + path, fw, fh: fw, frames: 8, cols: 3, fps, loop });

  // player
  add('player/idle', 'player/idle.png', 128, 8, true);
  add('player/run', 'player/run.png', 128, 14, true);
  add('player/jump', 'player/jump.png', 128, 12, false);
  add('player/attack', 'player/attack.png', 128, 18, false);
  add('player/summon', 'player/summon.png', 128, 12, false);
  add('player/crouch', 'player/crouch.png', 128, 14, false);

  // enemies
  add('enemy/moth/idle', 'moth/idle.png', 96, 12, true);
  add('enemy/wisp/idle', 'wisp/idle.png', 96, 8, true);
  add('enemy/guardian/idle', 'guardian/idle.png', 128, 8, true);
  add('enemy/guardian/walk', 'guardian/walk.png', 128, 10, true);
  add('enemy/sentry/idle', 'sentry/idle.png', 96, 8, true);

  add('enemy/ghoul/walk', 'ghoul/walk.png', 128, 8, true);
  add('enemy/skull/idle', 'skull/idle.png', 96, 8, true);
  add('enemy/crawler/walk', 'crawler/walk.png', 128, 12, true);
  // new fable bad dudes
  add('enemy/crow/idle', 'crow/idle.png', 96, 12, true);
  add('enemy/sentinel/idle', 'sentinel/idle.png', 128, 8, true);
  add('enemy/sentinel/walk', 'sentinel/walk.png', 128, 10, true);
  add('enemy/wraith/idle', 'wraith/idle.png', 96, 8, true);

  // boss
  add('boss/idle', 'boss/idle.png', 160, 8, true);
  add('boss/attack', 'boss/attack.png', 160, 12, true);

  // Zhulong transformation (smoother 12-frame / 4-column flight + breath)
  sprites.add('dragon/idle', { src: S + 'dragon/idle.png', fw: 160, fh: 160, frames: 12, cols: 4, fps: 12, loop: true });
  sprites.add('dragon/attack', { src: S + 'dragon/attack.png', fw: 160, fh: 160, frames: 12, cols: 4, fps: 16, loop: false });
}

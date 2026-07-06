// Shared types, constants, and the tile alphabet.
import type { Rect } from './math.js';

export const LOGICAL_W = 960;
export const LOGICAL_H = 540;
export const TILE = 32;
export const GRAVITY = 1900;
export const SAVE_KEY = 'when-the-dragon-blinks-save-v2';

export type WorldState = 'day' | 'night';
export type GameMode =
  | 'howto' | 'title' | 'levelSelect' | 'codex' | 'settings' | 'lore'
  | 'playing' | 'paused' | 'levelComplete' | 'gameComplete' | 'guqin' | 'dawn';
export type EntityKind = 'moth' | 'guardian' | 'wisp' | 'sentry' | 'ghoul' | 'skull' | 'crawler'
  | 'crow' | 'sentinel' | 'wraith';   // new fable-true bad dudes (day crow, day automaton, night wraith)

export type Particle = {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number;
  kind: 'spark' | 'dust' | 'mist' | 'star' | 'hit' | 'ember' | 'petal' | 'glow';
  color?: string; grav?: number; spin?: number; rot?: number;
};
export type Projectile = {
  x: number; y: number; vx: number; vy: number; r: number; life: number;
  kind: 'lantern' | 'shard' | 'bolt' | 'blast'; hostile: boolean;
  dmg?: number; pierce?: boolean; hit?: Set<unknown>;
};
export type ScorePop = { x: number; y: number; text: string; t: number; color: string };
export type Ember = { x: number; y: number; vx: number; vy: number; life: number };
export type FloatingText = { text: string; t: number; max: number };
export type CodexEntry = { id: string; title: string; body: string; unlockHint: string };
export type LorePanel = {
  title: string;
  sections: { label: string; text: string }[];
  nextMode: GameMode;
  after?: () => void;
};

/** Tile alphabet used in the string maps:
 *  '.' empty   '#' stone   'D' day-only   'N' night-only
 *  'o' one-way platform     '^' spikes     'F' fire (day)     'S' spirit spikes (night)
 *  'g' grass-topped stone (decorative solid) */
export type MovingPlatform = {
  x: number; y: number; w: number;         // pixel position/size (h = TILE)
  ax: number; ay: number;                  // travel amplitude in px
  speed: number; phase: number;
  state?: WorldState;                       // if set, only solid in this world
  crumble?: boolean;                        // falls after being stood on
};

export type LevelData = {
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
  entities: { kind: EntityKind; x: number; y: number; elite?: boolean }[];
  gems?: { x: number; y: number }[];       // torch-gems on the route (fill the dragon meter)
  bridges?: { x: number; y: number; w: number }[];   // wobbling rope bridges over chasms
  platforms?: MovingPlatform[];
  windZones?: Rect[];
  introLore: string;
  outroLore: string;
  unlockCodexOnComplete: string[];
  theme: 'mountain' | 'bridge' | 'cavern' | 'arena' | 'sunless';
  isBoss?: boolean;
  difficulty?: number;        // per-level aggression scalar
  act?: number;               // 1..4 (for the level-select map + lore)
  hidden?: boolean;           // a secret level, shown on the map only once found
  secretExit?: Rect;          // reaching this warps to `secretExitTo` instead of the normal exit
  secretExitTo?: number;      // level index of the hidden level
};

// localStorage-backed save with a settings block.
import { SAVE_KEY } from './types.js';

export type Settings = {
  master: number;   // 0..1
  music: boolean;
  shake: boolean;   // screen shake enabled
  reducedMotion: boolean;
};
export type SaveData = {
  highestUnlocked: number;
  completed: string[];
  relics: string[];
  codex: string[];
  bestTimes: Record<string, number>;
  settings: Settings;
};

const fallback = (): SaveData => ({
  highestUnlocked: 0,
  completed: [],
  relics: [],
  codex: ['who-is-zhulong', 'eye-day-night'],
  bestTimes: {},
  settings: { master: 0.7, music: true, shake: true, reducedMotion: false },
});

export function loadSave(): SaveData {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    const base = fallback();
    return { ...base, ...raw, settings: { ...base.settings, ...(raw.settings || {}) } };
  } catch {
    return fallback();
  }
}

export function persist(save: SaveData) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {}
}

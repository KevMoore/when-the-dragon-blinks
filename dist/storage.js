// localStorage-backed save with a settings block.
import { SAVE_KEY } from './types.js';
const fallback = () => ({
    highestUnlocked: 0,
    completed: [],
    relics: [],
    codex: ['who-is-zhulong', 'eye-day-night'],
    bestTimes: {},
    highScore: 0,
    seenIntro: false,
    foundHidden: [],
    settings: { master: 0.7, music: true, shake: true, reducedMotion: false, leftHanded: false },
});
// A clean save (keeps the player's audio/settings prefs) — for "Start Fresh".
export function freshSave(settings) { return { ...fallback(), settings: { ...settings } }; }
export function loadSave() {
    try {
        const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
        const base = fallback();
        return { ...base, ...raw, settings: { ...base.settings, ...(raw.settings || {}) } };
    }
    catch {
        return fallback();
    }
}
export function persist(save) {
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    }
    catch { }
}
//# sourceMappingURL=storage.js.map
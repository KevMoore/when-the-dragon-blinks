// Shrine Forge instance: same site bundle, but the EDITOR is the root page.
// (play.html remains the full game for same-origin playtesting.)
import { cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public');

await cp(join(out, 'editor.html'), join(out, 'index.html'));
console.log('Editor instance assembled: editor is the root page');

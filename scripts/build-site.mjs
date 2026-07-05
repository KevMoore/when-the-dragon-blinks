// Assemble a clean, self-contained static site into ./public for deployment.
// Runs after `tsc` has emitted ./dist. Copies only what the SPA needs so we
// never publish node_modules or source.
import { rm, mkdir, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const entry of ['index.html', 'styles.css', 'dist', 'assets']) {
  await cp(join(root, entry), join(out, entry), { recursive: true });
}

console.log('Static site assembled into ./public');

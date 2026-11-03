import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'style.css', 'keeper.css', 'speech.css', 'outcome.css', 'shop-resize.css', 'typography.css', 'app.js', 'game.js', 'catalog.js', 'keeper.js', 'speech.js', 'outcome.js', 'shop-resize.js', 'assets', 'data']) await cp(path.join(root, file), path.join(dist, file), { recursive: true });
// One release fingerprint keeps CSS and module imports in sync across Pages' CDN caches.
const applicationFiles = ['style.css', 'keeper.css', 'speech.css', 'outcome.css', 'shop-resize.css', 'typography.css', 'app.js', 'game.js', 'catalog.js', 'keeper.js', 'speech.js', 'outcome.js', 'shop-resize.js'];
const contents = await Promise.all(applicationFiles.map(file => readFile(path.join(root, file), 'utf8')));
const fingerprint = createHash('sha256').update(contents.join('\n')).digest('hex').slice(0, 12);
for (const file of ['index.html', ...applicationFiles]) {
  let content = await readFile(path.join(root, file), 'utf8');
  for (const target of applicationFiles) {
    for (const quote of ['"', "'"]) content = content.replaceAll(`${quote}./${target}${quote}`, `${quote}./${target}?v=${fingerprint}${quote}`);
  }
  await writeFile(path.join(dist, file), content);
}
await writeFile(path.join(dist, '.nojekyll'), '');
console.log('Built static site in dist/');

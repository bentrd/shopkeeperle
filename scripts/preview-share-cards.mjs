/** Native Canvas QA fixtures. Every board comes from real game-engine guesses. */
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createPuzzle, makeGuess, puzzleStatus, useHint } from '../game.js';
import { buildShareModel } from '../share-model.js';
import { drawShareCard, SHARE_FORMATS, CARD_FONTS } from '../share-card.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.cache/share-previews');
await mkdir(output, { recursive: true });
const requireHere = createRequire(path.join(root, 'package.json'));
const runtimeModules = process.env.BRAND_NODE_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
function dependency(name) {
  try { return requireHere(name); }
  catch { return createRequire(path.join(runtimeModules, '_share-preview-resolver.cjs'))(name); }
}
const { createCanvas, loadImage, GlobalFonts } = dependency('@napi-rs/canvas');
const sharp = dependency('sharp');
GlobalFonts.registerFromPath(path.join(root, 'assets/brand/fonts/Cinzel.ttf'), CARD_FONTS.title);
GlobalFonts.registerFromPath(path.join(root, 'assets/brand/fonts/DMSans.ttf'), CARD_FONTS.body);
const catalog = JSON.parse(await readFile(path.join(root, 'data/catalog.json'), 'utf8'));
const assets = Object.fromEntries(await Promise.all([
  ['logo', 'assets/brand/icon.svg'], ['keeper', 'assets/shopkeeper-user.png'], ['qr', 'assets/brand/qr-code.png'],
].map(async ([key, file]) => [key, await loadImage(path.join(root, file))])));
const date = '2026-11-04';
const siteUrl = 'https://bentrd.github.io/shopkeeperle/';
const fixtures = [
  { name: 'victory', guesses: ['6692', '6697', '6610', '3814'], hint: false, expected: 'won' },
  { name: 'defeat', guesses: ['8020', '6697', '6610', '3031', '3089', '3083'], hint: true, expected: 'lost' },
];
const report = [];
for (const fixture of fixtures) {
  let state = createPuzzle({ catalog, mode: 'daily', date, answerId: '3814' });
  if (fixture.hint) state = useHint(state);
  for (const guess of fixture.guesses) state = makeGuess(state, guess, catalog);
  if (puzzleStatus(state) !== fixture.expected) throw new Error(`Invalid ${fixture.name} fixture`);
  const model = buildShareModel({ state, catalog, siteUrl });
  await writeFile(path.join(output, `example-${fixture.name}-model.json`), JSON.stringify(model, null, 2));
  for (const [format, dimensions] of Object.entries(SHARE_FORMATS)) {
    const canvas = createCanvas(dimensions.width, dimensions.height);
    const context = canvas.getContext('2d');
    const textBounds = [];
    const fillText = context.fillText.bind(context);
    context.fillText = (text, x, y, ...rest) => {
      const metrics = context.measureText(String(text));
      const width = metrics.width;
      const left = context.textAlign === 'center' ? x - width / 2 : context.textAlign === 'right' ? x - width : x;
      textBounds.push({ text, x: left, y: y - metrics.actualBoundingBoxAscent, width, height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent, font: context.font });
      fillText(text, x, y, ...rest);
    };
    drawShareCard(context, { model, format, assets });
    const filename = `example-${fixture.name}-${format}.png`;
    await writeFile(path.join(output, filename), canvas.toBuffer('image/png'));
    const clippedText = textBounds.filter(t => t.x < 0 || t.x + t.width > dimensions.width || t.y < 0 || t.y + t.height > dimensions.height);
    report.push({ fixture: fixture.name, format, filename, ...dimensions, clippedText, textBounds });
  }
}
await writeFile(path.join(output, 'layout-report.json'), JSON.stringify(report, null, 2));
const thumbs = await Promise.all(report.map(async entry => ({ input: await sharp(path.join(output, entry.filename)).resize(360, 640, { fit: 'contain', background: '#18242a' }).png().toBuffer() })));
await sharp({ create: { width: 1080, height: 1280, channels: 3, background: '#18242a' } }).composite(thumbs.map((t, i) => ({ input: t.input, left: (i % 3) * 360, top: Math.floor(i / 3) * 640 }))).png().toFile(path.join(output, 'contact-sheet.png'));
console.log(JSON.stringify(report.map(({ fixture, format, filename, width, height, clippedText }) => ({ fixture, format, filename, width, height, clippedText })), null, 2));

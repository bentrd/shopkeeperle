/**
 * Rebuild Shopkeeperle's native vector branding and social preview.
 * Requires sharp and @napi-rs/canvas, resolved from local node_modules or
 * BRAND_NODE_MODULES=/absolute/path/to/node_modules. No browser is required.
 * The committed TTFs, item PNGs, and QR matrix make subsequent runs offline.
 */
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'assets/brand');
const requireHere = createRequire(path.join(root, 'package.json'));
const bundledModules = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
function dependency(name) {
  try { return requireHere(name); } catch (error) {
    const modules = process.env.BRAND_NODE_MODULES || bundledModules;
    try { return createRequire(path.join(modules, '_brand-resolver.cjs'))(name); } catch {
      throw new Error(`Install ${name} locally or set BRAND_NODE_MODULES to a directory containing it.`, { cause: error });
    }
  }
}
const sharp = dependency('sharp');
const { createCanvas, loadImage, GlobalFonts } = dependency('@napi-rs/canvas');
await mkdir(path.join(out, 'source'), { recursive: true });
await mkdir(path.join(out, 'fonts'), { recursive: true });
async function ensureFile(relative, url) {
  const destination = path.join(out, relative);
  try { await access(destination); return destination; } catch {}
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  return destination;
}
await ensureFile('fonts/Cinzel.ttf', 'https://raw.githubusercontent.com/google/fonts/main/ofl/cinzel/Cinzel%5Bwght%5D.ttf');
await ensureFile('fonts/DMSans.ttf', 'https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/DMSans%5Bopsz,wght%5D.ttf');
await ensureFile('fonts/Cinzel-OFL.txt', 'https://raw.githubusercontent.com/google/fonts/main/ofl/cinzel/OFL.txt');
await ensureFile('fonts/DMSans-OFL.txt', 'https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/OFL.txt');
GlobalFonts.registerFromPath(path.join(out, 'fonts/Cinzel.ttf'), 'Shopkeeper Cinzel');
GlobalFonts.registerFromPath(path.join(out, 'fonts/DMSans.ttf'), 'Shopkeeper DM Sans');

const defs = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#163a3f"/><stop offset=".5" stop-color="#092229"/><stop offset="1" stop-color="#041319"/></linearGradient>
  <radialGradient id="glow"><stop stop-color="#4d786546"/><stop offset="1" stop-color="#09222900"/></radialGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff0b4"/><stop offset=".38" stop-color="#d4b16c"/><stop offset="1" stop-color="#916730"/></linearGradient>
  <linearGradient id="bag" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e8ca81"/><stop offset="1" stop-color="#a27b3c"/></linearGradient>
</defs>`;
const emblem = `<path d="M256 84 402 168v176l-146 84-146-84V168Z" fill="#06191d" stroke="url(#gold)" stroke-width="6"/>
  <path d="M256 101 387 177v158l-131 76-131-76V177Z" fill="url(#glow)" stroke="#a88b4b46" stroke-width="2"/>
  <path d="M212 220v-31c0-25 19-45 44-45s44 20 44 45v31" fill="none" stroke="url(#gold)" stroke-width="13" stroke-linecap="round"/>
  <path d="m171 216-23 135 26 25h164l26-25-23-135Z" fill="url(#bag)" stroke="#edcf8a" stroke-width="5" stroke-linejoin="round"/>
  <path d="m171 216 23 30h124l23-30M172 351h168" fill="none" stroke="#795329" stroke-width="5" opacity=".55"/>
  <circle cx="256" cy="298" r="51" fill="#0a292c" stroke="#ffe7a1" stroke-width="6"/>
  <path d="M275 276c-8-9-34-8-37 3-6 18 39 14 37 32-2 16-32 19-42 6M256 261v72" fill="none" stroke="#ecd192" stroke-width="9" stroke-linecap="round"/>
  <path d="m256 108 7 9-7 9-7-9Z" fill="#efd699"/>
  <path d="m256 393 7 9-7 9-7-9Z" fill="#d5b16c"/>`;
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Shopkeeperle gold shop bag and coin crest">${defs}<path fill="url(#bg)" d="M0 0h512v512H0z"/><rect x="23" y="23" width="466" height="466" rx="70" fill="none" stroke="#9c83442e" stroke-width="2"/><path d="M48 138V80q0-32 32-32h58M374 48h58q32 0 32 32v58M464 374v58q0 32-32 32h-58M138 464H80q-32 0-32-32v-58" fill="none" stroke="#c7a76445" stroke-width="3"/>${emblem}</svg>`;
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Shopkeeperle shop crest">${defs}${emblem}</svg>`;
await writeFile(path.join(out, 'icon.svg'), iconSvg);
await writeFile(path.join(out, 'logo-mark.svg'), logoSvg);
for (const size of [192, 512, 1024]) await sharp(Buffer.from(iconSvg)).resize(size, size).png().toFile(path.join(out, `icon-${size}.png`));
await sharp(Buffer.from(iconSvg)).resize(180, 180).png().toFile(path.join(out, 'apple-touch-icon.png'));
await sharp(Buffer.from(iconSvg)).resize(32, 32).png().toFile(path.join(out, 'favicon32.png'));
// Opaque background; the complete primary crest fits the central 80% safe circle.
await sharp(Buffer.from(iconSvg)).resize(512, 512).flatten({ background: '#092229' }).png().toFile(path.join(out, 'icon-maskable-512.png'));
const icoSizes = [16, 32, 48];
const icoPngs = await Promise.all(icoSizes.map(size => sharp(Buffer.from(iconSvg)).resize(size, size).png().toBuffer()));
const icoHeader = Buffer.alloc(6 + icoSizes.length * 16);
icoHeader.writeUInt16LE(1, 2); icoHeader.writeUInt16LE(icoSizes.length, 4);
let icoOffset = icoHeader.length;
icoPngs.forEach((png, i) => {
  const entry = 6 + i * 16;
  icoHeader[entry] = icoSizes[i]; icoHeader[entry + 1] = icoSizes[i];
  icoHeader.writeUInt16LE(1, entry + 4); icoHeader.writeUInt16LE(32, entry + 6);
  icoHeader.writeUInt32LE(png.length, entry + 8); icoHeader.writeUInt32LE(icoOffset, entry + 12);
  icoOffset += png.length;
});
await writeFile(path.join(out, 'favicon.ico'), Buffer.concat([icoHeader, ...icoPngs]));

const qr = JSON.parse(await readFile(path.join(out, 'source/qr-matrix.json'), 'utf8'));
const qrSize = qr.matrix.length;
const qrPath = qr.matrix.flatMap((row, y) => [...row].flatMap((v, x) => v === '1' ? [`M${x} ${y}h1v1h-1z`] : [])).join('');
const qrSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 ${qrSize} ${qrSize}" shape-rendering="crispEdges" role="img" aria-label="Open Shopkeeperle at ${qr.url}"><path fill="#fff" d="M0 0h${qrSize}v${qrSize}H0z"/><path fill="#0a2024" d="${qrPath}"/></svg>`;
await writeFile(path.join(out, 'qr-code.svg'), qrSvg);
await sharp(Buffer.from(qrSvg)).resize(512, 512, { kernel: 'nearest' }).png().toFile(path.join(out, 'qr-code.png'));

const catalog = JSON.parse(await readFile(path.join(root, 'data/catalog.json'), 'utf8'));
const itemIds = ['1036', '1052', '1028'];
const itemSourcePath = path.join(out, 'source/item-source.json');
let itemSource;
try { itemSource = JSON.parse(await readFile(itemSourcePath, 'utf8')); }
catch {
  itemSource = { version: catalog.version, urls: Object.fromEntries(itemIds.map(id => [id, catalog.items[id]?.image || `https://ddragon.leagueoflegends.com/cdn/${catalog.version}/img/item/${id}.png`])) };
  await writeFile(itemSourcePath, JSON.stringify(itemSource));
}
const itemPaths = await Promise.all(itemIds.map(id => ensureFile(`source/item-${id}.png`, itemSource.urls[id])));
const [logo, keeper, ...itemImages] = await Promise.all([
  loadImage(Buffer.from(iconSvg)), loadImage(path.join(root, 'assets/shopkeeper-user.png')), ...itemPaths.map(p => loadImage(p)),
]);
const canvas = createCanvas(2400, 1260);
const ctx = canvas.getContext('2d');
ctx.scale(2, 2);
function tracked(text, x, y, spacing = 0) {
  for (const letter of text) { ctx.fillText(letter, x, y); x += ctx.measureText(letter).width + spacing; }
}
function text(value, x, y, font, color) { ctx.font = font; ctx.fillStyle = color; ctx.fillText(value, x, y); }
function roundedRect(x, y, w, h, radius) { ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); }
const background = ctx.createLinearGradient(0, 0, 1200, 630);
background.addColorStop(0, '#06171c'); background.addColorStop(.58, '#102c31'); background.addColorStop(1, '#06151b');
ctx.fillStyle = background; ctx.fillRect(0, 0, 1200, 630);
const glow = ctx.createRadialGradient(936, 285, 20, 936, 285, 340);
glow.addColorStop(0, '#b6a06b36'); glow.addColorStop(1, '#b6a06b00');
ctx.fillStyle = glow; ctx.fillRect(650, 0, 550, 630);
ctx.fillStyle = '#020e164d'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(809, 0); ctx.lineTo(702, 630); ctx.lineTo(0, 630); ctx.closePath(); ctx.fill();
ctx.strokeStyle = '#c0a25f57'; ctx.lineWidth = 1; ctx.strokeRect(22.5, 22.5, 1155, 585);
ctx.strokeStyle = '#c0a25f24'; ctx.beginPath(); ctx.moveTo(813, 32); ctx.lineTo(716, 598); ctx.stroke();
ctx.strokeStyle = '#c0a25f17';
for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(956, 303, 170 + i * 37, -.9, 2.6); ctx.stroke(); }
ctx.drawImage(logo, 59, 52, 80, 80);
ctx.font = '600 37px "Shopkeeper Cinzel"'; ctx.fillStyle = '#e8d3a3'; tracked('SHOPKEEPERLE', 157, 104, 1.25);
text('Know your build?', 63, 226, '600 61px "Shopkeeper Cinzel"', '#f1e9d6');
ctx.font = '500 16px "Shopkeeper DM Sans"'; ctx.fillStyle = '#a8b8ac'; tracked('A LEAGUE ITEM GUESSING GAME', 67, 266, 1.75);
text('Read the recipe. Find the mystery item.', 67, 303, '400 20px "Shopkeeper DM Sans"', '#b6c3b7');
const clueColors = ['#79c99b', '#e5ae65', '#83958d'];
const clueLabels = ['DIRECT', 'RELATED', 'UNRELATED'];
itemImages.forEach((item, i) => {
  const x = 67 + i * 112, y = 339;
  ctx.shadowColor = `${clueColors[i]}33`; ctx.shadowBlur = 14;
  ctx.fillStyle = '#0c2026'; ctx.fillRect(x - 4, y - 4, 90, 90);
  ctx.shadowBlur = 0; ctx.strokeStyle = clueColors[i]; ctx.lineWidth = 2; ctx.strokeRect(x - 4, y - 4, 90, 90);
  ctx.drawImage(item, x + 1, y + 1, 80, 80);
  ctx.fillStyle = ['#37684d', '#98652f', '#3a514d'][i]; ctx.fillRect(x + 65, y + 65, 25, 25);
  ctx.strokeStyle = clueColors[i]; ctx.lineWidth = 1; ctx.strokeRect(x + 65, y + 65, 25, 25);
  ctx.strokeStyle = '#f3efd9'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
  if (i === 0) { ctx.moveTo(x + 71, y + 77); ctx.lineTo(x + 76, y + 82); ctx.lineTo(x + 84, y + 72); }
  else if (i === 1) {
    ctx.moveTo(x + 69, y + 77); ctx.lineTo(x + 85, y + 77);
    ctx.moveTo(x + 73, y + 72); ctx.lineTo(x + 68, y + 77); ctx.lineTo(x + 73, y + 82);
    ctx.moveTo(x + 81, y + 72); ctx.lineTo(x + 86, y + 77); ctx.lineTo(x + 81, y + 82);
  } else { ctx.moveTo(x + 73, y + 73); ctx.lineTo(x + 82, y + 82); ctx.moveTo(x + 82, y + 73); ctx.lineTo(x + 73, y + 82); }
  ctx.stroke(); ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  ctx.textAlign = 'center';
  ctx.font = '600 11px "Shopkeeper DM Sans"'; ctx.fillStyle = clueColors[i]; ctx.fillText(clueLabels[i], x + 41, y + 112); ctx.textAlign = 'start';
});
roundedRect(66, 504, 234, 43, 3); ctx.fillStyle = '#c1a25d18'; ctx.fill(); ctx.strokeStyle = '#bfa46577'; ctx.stroke();
text('DAILY + UNLIMITED', 85, 532, '600 16px "Shopkeeper DM Sans"', '#dfca98');
text('bentrd.github.io/shopkeeperle', 67, 588, '400 18px "Shopkeeper DM Sans"', '#acbcae');
// Place the supplied transparent character intact; no segmentation or retouching.
ctx.shadowColor = '#00000070'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
const keeperH = 582, keeperW = keeperH * keeper.width / keeper.height;
ctx.drawImage(keeper, 1190 - keeperW - 25, 31, keeperW, keeperH);
ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
await sharp(canvas.toBuffer('image/png')).resize(1200, 630).jpeg({ quality: 92, mozjpeg: true }).toFile(path.join(out, 'social-preview.jpg'));

await writeFile(path.join(out, 'SOURCES.md'), `# Shopkeeperle brand assets\n\nThe shop-bag/coin crest, icon, and card composition are original native vector/Canvas UI graphics. Rebuild with \`node scripts/generate-brand-assets.mjs\`; requires \`sharp\` and \`@napi-rs/canvas\` (local packages or \`BRAND_NODE_MODULES\`). No browser or image-generation model is used.\n\n- \`icon.svg\`: opaque square master; primary crest fits a central 80% safe circle. \`logo-mark.svg\` is the transparent crest.\n- PNGs: 192, 512, and 1024 app icons; 180 Apple touch icon; 512 opaque maskable icon; 32 favicon. \`favicon.ico\` contains 16/32/48 PNG entries.\n- \`qr-code.svg\` / \`qr-code.png\`: ${qr.url}; Q error correction, four-module quiet zone. The committed QR matrix was generated locally with Python qrcode and is the reproducible source.\n- \`fonts/Cinzel.ttf\` and \`fonts/DMSans.ttf\`: official [Google Fonts repository](https://github.com/google/fonts); SIL Open Font License 1.1 included beside each font. Canvas family names: Shopkeeper Cinzel and Shopkeeper DM Sans.\n- Card character: supplied \`assets/shopkeeper-user.png\`, drawn intact with preserved aspect ratio. League of Legends art © Riot Games.\n- Card item icons: Riot Data Dragon ${itemSource.version}, ids ${itemIds.join(', ')}, stored under \`source/\`; [Riot Data Dragon documentation](https://developer.riotgames.com/docs/lol#data-dragon).\n\nThe existing input files are reused, so subsequent runs work offline.\n`);
console.log('Generated brand icons, QR, and 1200×630 social preview in assets/brand/');

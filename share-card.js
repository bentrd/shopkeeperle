export const SHARE_FORMATS = {
  story: { label: 'Story', width: 1080, height: 1920, ratio: '9:16' },
  post: { label: 'Post', width: 1080, height: 1350, ratio: '4:5' },
  square: { label: 'Square', width: 1080, height: 1080, ratio: '1:1' },
};
export const CARD_FONTS = { title: 'Shopkeeper Cinzel', body: 'Shopkeeper DM Sans' };
const PALETTE = {
  green: { fill: '#35614d', edge: '#83c79a', ink: '#d5efd1' },
  orange: { fill: '#80582f', edge: '#e0ac64', ink: '#ffe4b7' },
  grey: { fill: '#1c3439', edge: '#536c6c', ink: '#95aba6' },
};

function font(ctx, size, { serif = false, weight = 500 } = {}) {
  ctx.font = `${weight} ${size}px "${serif ? CARD_FONTS.title : CARD_FONTS.body}", ${serif ? 'Georgia' : 'sans-serif'}`;
}
function tracked(ctx, text, x, y, spacing = 2, align = 'left') {
  const widths = [...text].map(char => ctx.measureText(char).width);
  const width = widths.reduce((sum, value) => sum + value, 0) + Math.max(0, widths.length - 1) * spacing;
  if (align === 'center') x -= width / 2;
  [...text].forEach((char, i) => { ctx.fillText(char, x, y); x += widths[i] + spacing; });
}
function fitted(ctx, text, x, y, maximum, size, options) {
  do { font(ctx, size, options); if (ctx.measureText(text).width <= maximum) break; size -= 1; } while (size > 12);
  ctx.fillText(text, x, y);
}
function line(ctx, x1, y1, x2, y2, color, width = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function tile(ctx, x, y, size, color) {
  const p = PALETTE[color] || PALETTE.grey;
  ctx.fillStyle = p.fill; ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = p.edge; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
  ctx.fillStyle = '#ffffff08'; ctx.fillRect(x + 4, y + 4, size - 8, size * .38);
  ctx.strokeStyle = p.ink; ctx.lineWidth = Math.max(2, size / 21); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const cx = x + size / 2, cy = y + size / 2, arm = size * .18;
  ctx.beginPath();
  if (color === 'green') { ctx.moveTo(cx - arm, cy); ctx.lineTo(cx - arm * .2, cy + arm * .7); ctx.lineTo(cx + arm * 1.2, cy - arm); }
  else if (color === 'orange') {
    ctx.moveTo(cx - arm * 1.25, cy); ctx.lineTo(cx + arm * 1.25, cy);
    ctx.moveTo(cx - arm * .55, cy - arm * .65); ctx.lineTo(cx - arm * 1.25, cy); ctx.lineTo(cx - arm * .55, cy + arm * .65);
    ctx.moveTo(cx + arm * .55, cy - arm * .65); ctx.lineTo(cx + arm * 1.25, cy); ctx.lineTo(cx + arm * .55, cy + arm * .65);
  } else { ctx.moveTo(cx - arm * .7, cy - arm * .7); ctx.lineTo(cx + arm * .7, cy + arm * .7); ctx.moveTo(cx + arm * .7, cy - arm * .7); ctx.lineTo(cx - arm * .7, cy + arm * .7); }
  ctx.stroke(); ctx.lineCap = 'butt';
}

/** Draw only the explicitly spoiler-free model; never a screenshot of the revealed puzzle. */
export function drawShareCard(ctx, { model, format = 'story', assets = {} }) {
  const dimensions = SHARE_FORMATS[format];
  if (!dimensions) throw new Error('Unknown image format.');
  const { width: w, height: h } = dimensions;
  const story = format === 'story', square = format === 'square';
  const victory = model.outcome === 'Victory';
  const accent = victory ? '#6fc9c7' : '#d27768';
  ctx.save(); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = '#06171c'; ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * .54, h * .4, 10, w * .54, h * .4, w * .95);
  glow.addColorStop(0, victory ? '#123a41' : '#392225'); glow.addColorStop(.6, '#0a242b'); glow.addColorStop(1, '#06171c');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) line(ctx, 180 + i * 200, 0, -380 + i * 200, h, '#b7c0a604');
  const frameTop = story ? 190 : 36, frameBottom = story ? h - 150 : h - 36;
  ctx.strokeStyle = '#bda06a55'; ctx.lineWidth = 2; ctx.strokeRect(52, frameTop, w - 104, frameBottom - frameTop);
  for (const [x, y, sx, sy] of [[52, frameTop, 1, 1], [w - 52, frameTop, -1, 1], [52, frameBottom, 1, -1], [w - 52, frameBottom, -1, -1]]) {
    line(ctx, x, y + 24 * sy, x, y, '#dbc28c', 3); line(ctx, x, y, x + 24 * sx, y, '#dbc28c', 3);
  }

  const brandY = story ? 270 : square ? 82 : 96;
  if (assets.logo) ctx.drawImage(assets.logo, 88, brandY - 8, 82, 82);
  ctx.fillStyle = '#e6d2a3';
  fitted(ctx, 'SHOPKEEPERLE', 194, brandY + 46, 790, 54, { serif: true, weight: 600 });
  font(ctx, 19); ctx.fillStyle = '#9eb8b0'; tracked(ctx, 'KNOW YOUR BUILD?', 197, brandY + 83, 3);

  const outcomeY = story ? 520 : square ? 292 : 332;
  font(ctx, 20, { weight: 600 }); ctx.fillStyle = '#bda779';
  const date = model.date ? new Date(`${model.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase() : 'NO DAILY LIMIT';
  tracked(ctx, `${model.mode.toUpperCase()} · ${date}`, w / 2, outcomeY - (square ? 82 : 116), 3, 'center');
  ctx.textAlign = 'center'; ctx.shadowColor = victory ? '#4ec9dd40' : '#df634b40'; ctx.shadowBlur = 35;
  ctx.fillStyle = victory ? '#ead6a6' : '#e3af98'; font(ctx, story ? 100 : 92, { serif: true, weight: 600 }); ctx.fillText(model.outcome.toUpperCase(), w / 2, outcomeY);
  ctx.shadowBlur = 0;
  font(ctx, story ? 78 : 66, { weight: 700 }); ctx.fillStyle = '#e4e7d9'; ctx.fillText(model.score, w / 2, outcomeY + (story ? 100 : 83));
  font(ctx, 19); ctx.fillStyle = '#9ab3aa'; ctx.fillText(model.hintUsed ? 'GUESSES · HINT USED' : 'GUESSES', w / 2, outcomeY + (story ? 137 : 117));

  const area = story ? { y: 740, h: 590, w: 740 } : square ? { y: 462, h: 360, w: 740 } : { y: 510, h: 470, w: 740 };
  const rows = model.colors.length, cols = Math.max(...model.colors.map(row => row.length), 1);
  const gap = story ? 16 : 12;
  const size = Math.min(story ? 84 : square ? 64 : 74, (area.h - gap * (rows - 1)) / rows, (area.w - 60 - gap * (cols - 1)) / cols);
  const totalWidth = cols * size + (cols - 1) * gap, totalHeight = rows * size + (rows - 1) * gap;
  const x = (w - totalWidth) / 2, y = area.y + (area.h - totalHeight) / 2;
  model.colors.forEach((row, index) => {
    ctx.textAlign = 'right'; font(ctx, 19); ctx.fillStyle = '#819c92'; ctx.fillText(String(index + 1).padStart(2, '0'), x - 25, y + index * (size + gap) + size * .61);
    row.forEach((color, column) => tile(ctx, x + column * (size + gap), y + index * (size + gap), size, color));
  });
  ctx.textAlign = 'center'; font(ctx, 18); ctx.fillStyle = '#a6b9ad';
  ctx.fillText('DIRECT   ·   RELATED   ·   UNRELATED', w / 2, area.y + area.h + 43);

  // Decorative merchant art and a generic game link contain no answer-specific information.
  const artHeight = story ? 475 : square ? 265 : 340;
  const artX = story ? 670 : square ? 795 : 745, artY = story ? 1280 : square ? 766 : 952;
  if (assets.keeper) {
    ctx.save(); ctx.globalAlpha = .96; ctx.drawImage(assets.keeper, artX, artY, artHeight * 725 / 1005, artHeight); ctx.restore();
  }
  const footerY = story ? 1380 : square ? 894 : 1090;
  const qrSize = story ? 156 : square ? 104 : 126;
  if (assets.qr) {
    ctx.fillStyle = '#fff'; ctx.fillRect(90, footerY, qrSize, qrSize);
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(assets.qr, 90, footerY, qrSize, qrSize); ctx.restore();
  }
  ctx.textAlign = 'left';
  const footerX = story ? 90 : 90 + qrSize + 24;
  const footerTextY = story ? footerY + qrSize + 48 : footerY + 30;
  ctx.fillStyle = '#a8bcb1'; font(ctx, story ? 22 : 18); ctx.fillText(story ? 'SCAN TO OPEN THE SHOP' : 'OPEN THE SHOP', footerX, footerTextY);
  ctx.fillStyle = '#e5d0a1'; font(ctx, story ? 30 : 26, { weight: 600 }); ctx.fillText('bentrd.github.io', footerX, footerTextY + (story ? 45 : 38));
  ctx.fillStyle = '#b7c7b7'; font(ctx, story ? 26 : 22); ctx.fillText('/shopkeeperle/', footerX, footerTextY + (story ? 82 : 72));
  ctx.fillStyle = '#7f9c94'; font(ctx, story ? 18 : 16); ctx.textAlign = 'center';
  ctx.fillText('One recipe. Six guesses. Daily + Unlimited.', w / 2, frameBottom - 24);
  ctx.restore();
  return dimensions;
}

let assetPromise;
export function loadShareAssets() {
  if (assetPromise) return assetPromise;
  const image = name => new Promise(resolve => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null);
    img.src = new URL(name, import.meta.url).href;
  });
  assetPromise = (async () => {
    const fonts = typeof FontFace === 'function' ? Promise.allSettled([
      [CARD_FONTS.title, './assets/brand/fonts/Cinzel.ttf'], [CARD_FONTS.body, './assets/brand/fonts/DMSans.ttf'],
    ].map(async ([family, path]) => { const face = await new FontFace(family, `url("${new URL(path, import.meta.url).href}")`).load(); document.fonts.add(face); })) : Promise.resolve();
    const [logo, keeper, qr] = await Promise.all([image('./assets/brand/icon.svg'), image('./assets/shopkeeper-user.png'), image('./assets/brand/qr-code.png')]);
    await fonts;
    return { logo, keeper, qr };
  })();
  return assetPromise;
}

export async function createShareCard(model, format = 'story') {
  const dimensions = SHARE_FORMATS[format];
  if (!dimensions) throw new Error('Unknown image format.');
  const assets = await loadShareAssets();
  const canvas = document.createElement('canvas'); canvas.width = dimensions.width; canvas.height = dimensions.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image creation is unavailable.');
  drawShareCard(context, { model, format, assets });
  const blob = await new Promise((resolve, reject) => {
    try { canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not create the image.')), 'image/png'); }
    catch (error) { reject(error); }
  });
  const filename = `shopkeeperle-${model.date || 'unlimited'}-${format}.png`;
  return { blob, filename, width: canvas.width, height: canvas.height };
}

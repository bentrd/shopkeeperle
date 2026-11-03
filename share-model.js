import { MAX_GUESSES, compareGuess } from './game.js';

const SQUARES = { green: '🟩', orange: '🟧', grey: '⬛' };
const MAX_COMPONENTS = 8; // The item-data validator permits at most eight recipe ingredients.

function canonicalUrl(siteUrl, mode) {
  const url = new URL(siteUrl);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('A web URL is required.');
  url.username = ''; url.password = ''; url.search = ''; url.hash = '';
  url.pathname = url.pathname.replace(/\/index\.html?$/i, '/');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  if (mode === 'unlimited') url.searchParams.set('mode', 'unlimited');
  return url.href;
}

function dailyDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error('A valid daily date is required.');
  }
  return date;
}

/** Explicit allowlist: no item IDs, names, icons, or puzzle/catalog objects leave this function. */
export function buildShareModel({ state, catalog, siteUrl }) {
  if (!state || !['daily', 'unlimited'].includes(state.mode) || !Array.isArray(state.guesses) ||
      !state.guesses.length || state.guesses.length > MAX_GUESSES || new Set(state.guesses).size !== state.guesses.length) {
    throw new Error('Only a finished puzzle can be shared.');
  }
  const feedback = state.guesses.map(id => compareGuess(catalog, state.answerId, id));
  const winner = feedback.findIndex(row => row.correct);
  if (winner !== -1 && winner !== feedback.length - 1) throw new Error('Invalid finished puzzle.');
  if (winner === -1 && feedback.length < MAX_GUESSES) throw new Error('Only a finished puzzle can be shared.');
  const colors = feedback.map(row => {
    if (!row.slotColors.length || row.slotColors.length > MAX_COMPONENTS || row.slotColors.some(color => !Object.hasOwn(SQUARES, color))) {
      throw new Error('Invalid recipe feedback.');
    }
    return [...row.slotColors];
  });
  const title = 'Shopkeeperle';
  const mode = state.mode === 'daily' ? 'Daily' : 'Unlimited';
  const date = state.mode === 'daily' ? dailyDate(state.date) : undefined;
  const outcome = winner === -1 ? 'Defeat' : 'Victory';
  const score = `${winner === -1 ? 'X' : state.guesses.length}/${MAX_GUESSES}`;
  const hintUsed = state.hintUsed === true;
  const url = canonicalUrl(siteUrl, state.mode);
  const grid = colors.map(row => row.map(color => SQUARES[color]).join('')).join('\n');
  const text = `${title} ${date || mode} · ${score}${hintUsed ? ' 💡' : ''}\n${grid}\n${url}`;
  if ([...text].length > 2200) throw new Error('Result caption is too long.');
  const alt = `${title} ${mode}${date ? `, ${date}` : ''}. ${outcome}, ${score}.${hintUsed ? ' Hint used.' : ''} Recipe feedback: ${colors.map((row, index) => `row ${index + 1}: ${row.join(', ')}`).join('; ')}.`;
  return { title, mode, ...(date ? { date } : {}), outcome, score, hintUsed, colors, url, text, caption: text, alt };
}

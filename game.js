/** Pure game rules. Daily snapshots pin the patch and answer outside this module. */
export const MAX_GUESSES = 6;

export function utcDate(now = new Date()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function millisecondsUntilReset(now = new Date()) {
  const value = new Date(now);
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + 1) - value.getTime();
}

function answerIds(catalog) {
  return [...new Set(catalog.answers.map(String))].filter(id => catalog.items[id]).sort((a, b) => Number(a) - Number(b));
}

export function dailyAnswerId(catalog, date = utcDate()) {
  const ids = answerIds(catalog);
  if (!ids.length) throw new Error('No items available.');
  let hash = 2166136261;
  for (const character of `shopkeeperle:${date}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ids[(hash >>> 0) % ids.length];
}

export function randomAnswerId(catalog, previousId) {
  let ids = answerIds(catalog);
  if (ids.length > 1) ids = ids.filter(id => id !== String(previousId));
  if (!ids.length) throw new Error('No items available.');
  const number = new Uint32Array(1);
  // Rejection sampling avoids modulo bias while using browser cryptographic randomness.
  const limit = Math.floor(4294967296 / ids.length) * ids.length;
  do { globalThis.crypto.getRandomValues(number); } while (number[0] >= limit);
  return ids[number[0] % ids.length];
}

export function normalizeSearch(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function searchItems(catalog, query = '', { exclude = [] } = {}) {
  const excluded = new Set(exclude.map(String));
  const normalized = normalizeSearch(query);
  const words = normalized.split(' ').filter(Boolean);
  return answerIds(catalog).filter(id => !excluded.has(id)).map(id => catalog.items[id])
    .filter(item => words.every(word => normalizeSearch(item.name).includes(word)))
    .sort((a, b) => {
      const aStarts = normalizeSearch(a.name).startsWith(normalized);
      const bStarts = normalizeSearch(b.name).startsWith(normalized);
      return Number(bStarts) - Number(aStarts) || a.name.localeCompare(b.name, 'en');
    });
}

/** Wordle-style slot feedback. Reserve exact matches before spending duplicate ingredients. */
export function scoreRecipeSlots(targetRecipe, guessedRecipe) {
  const normalized = id => id == null ? null : String(id);
  const target = targetRecipe.map(normalized);
  const guessed = guessedRecipe.map(normalized);
  const result = guessed.map((id, index) => id !== null && id === target[index] ? 'green' : 'grey');
  const remaining = new Map();
  for (let index = 0; index < target.length; index++) {
    if (result[index] === 'green') continue;
    const id = target[index];
    if (id === null) continue;
    remaining.set(id, (remaining.get(id) || 0) + 1);
  }
  for (let index = 0; index < guessed.length; index++) {
    if (result[index] === 'green') continue;
    const id = guessed[index];
    if (remaining.get(id) > 0) {
      result[index] = 'orange';
      remaining.set(id, remaining.get(id) - 1);
    }
  }
  return result;
}

export function compareGuess(catalog, answerId, guessId) {
  const answer = catalog.items[String(answerId)];
  const guess = catalog.items[String(guessId)];
  if (!answer || !guess) throw new Error('Unknown item.');
  const remaining = (answer.recipe || []).map(String);
  const sharedComponents = [];
  for (const id of (guess.recipe || []).map(String)) {
    const index = remaining.indexOf(id);
    if (index !== -1) {
      sharedComponents.push(id);
      remaining.splice(index, 1);
    }
  }
  const difference = answer.gold.total - guess.gold.total;
  const signature = item => `${[...(item.recipe || [])].map(String).sort().join(',')}:${item.gold.combine}`;
  // Some distinct League items have an identical recipe. Accept both despite data ordering.
  const correct = String(answerId) === String(guessId) || signature(answer) === signature(guess);
  return {
    correct,
    slotColors: correct ? (guess.recipe || []).map(() => 'green') : scoreRecipeSlots(answer.recipe || [], guess.recipe || []),
    sharedComponents,
    sharedCount: sharedComponents.length,
    componentCount: (answer.recipe || []).length,
    goldDirection: difference > 0 ? 'higher' : difference < 0 ? 'lower' : 'equal',
  };
}

export function createPuzzle({ catalog, mode = 'daily', date = utcDate(), answerId }) {
  if (!['daily', 'unlimited'].includes(mode)) throw new Error('Unknown game mode.');
  const id = String(answerId ?? (mode === 'daily' ? dailyAnswerId(catalog, date) : randomAnswerId(catalog)));
  if (!answerIds(catalog).includes(id)) throw new Error('Unknown answer.');
  return { schemaVersion: 1, mode, date, version: catalog.version, answerId: id, guesses: [], hintUsed: false, solvedBy: null };
}

export function puzzleStatus(state) {
  if (state.solvedBy || state.guesses.includes(state.answerId)) return 'won';
  return state.guesses.length >= MAX_GUESSES ? 'lost' : 'playing';
}

export function makeGuess(state, guessId, catalog) {
  const id = String(guessId);
  if (puzzleStatus(state) !== 'playing') throw new Error('This recipe is finished.');
  if (!answerIds(catalog).includes(id)) throw new Error('Choose an item from the shop.');
  if (state.guesses.includes(id)) throw new Error('You already guessed that item.');
  return { ...state, guesses: [...state.guesses, id], solvedBy: compareGuess(catalog, state.answerId, id).correct ? id : null };
}

export function useHint(state) {
  return { ...state, hintUsed: true };
}

export function serializePuzzle(state) {
  return JSON.stringify(state);
}

/** Reject stale, corrupt, or impossible saves; callers can safely start a fresh board. */
export function restorePuzzle(raw, catalog, expected = {}) {
  try {
    const state = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!state || state.schemaVersion !== 1 || !['daily', 'unlimited'].includes(state.mode)) return null;
    if (state.version !== catalog.version || !validDate(state.date)) return null;
    if (expected.mode && state.mode !== expected.mode) return null;
    if (expected.date && state.date !== expected.date) return null;
    if (expected.answerId != null && state.answerId !== String(expected.answerId)) return null;
    const ids = new Set(answerIds(catalog));
    if (typeof state.answerId !== 'string' || !ids.has(state.answerId)) return null;
    if (!Array.isArray(state.guesses) || state.guesses.length > MAX_GUESSES) return null;
    if (new Set(state.guesses).size !== state.guesses.length || state.guesses.some(id => typeof id !== 'string' || !ids.has(id))) return null;
    const winner = state.guesses.findIndex(id => compareGuess(catalog, state.answerId, id).correct);
    if (winner !== -1 && winner !== state.guesses.length - 1) return null;
    const solvedBy = winner === -1 ? null : state.guesses[winner];
    if (state.solvedBy != null && state.solvedBy !== solvedBy) return null;
    if (typeof state.hintUsed !== 'boolean') return null;
    return {
      schemaVersion: 1, mode: state.mode, date: state.date, version: state.version,
      answerId: state.answerId, guesses: [...state.guesses], hintUsed: state.hintUsed, solvedBy,
    };
  } catch { return null; }
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && utcDate(`${value}T00:00:00Z`) === value;
}

/** Completed daily boards, keyed by UTC date; duplicate records never inflate totals. */
export function dailyStats(records = [], now = new Date()) {
  const today = utcDate(now);
  const unique = new Map();
  for (const record of Array.isArray(records) ? records : Object.values(records || {})) {
    if (!record || record.mode !== 'daily' || !validDate(record.date) || record.date > today || !Array.isArray(record.guesses)) continue;
    if (record.guesses.length > MAX_GUESSES || !record.guesses.length || new Set(record.guesses).size !== record.guesses.length) continue;
    if (typeof record.answerId !== 'string' || record.guesses.some(id => typeof id !== 'string')) continue;
    if (record.solvedBy != null && (typeof record.solvedBy !== 'string' || record.solvedBy !== record.guesses.at(-1))) continue;
    const winner = record.guesses.indexOf(record.answerId);
    if (winner !== -1 && winner !== record.guesses.length - 1) continue;
    if (puzzleStatus(record) === 'playing') continue;
    const existing = unique.get(record.date);
    // First completed board is authoritative, as a daily board cannot be replayed.
    if (!existing) unique.set(record.date, record);
  }
  const distribution = Array(MAX_GUESSES).fill(0);
  let wins = 0;
  let maxStreak = 0;
  let runningStreak = 0;
  let previousDate;
  for (const [date, record] of [...unique].sort(([a], [b]) => a.localeCompare(b))) {
    const yesterday = utcDate(Date.parse(`${date}T00:00:00Z`) - 86400000);
    if (date !== previousDate && previousDate !== yesterday) runningStreak = 0;
    if (puzzleStatus(record) === 'won') {
      wins++;
      distribution[record.guesses.length - 1]++;
      runningStreak++;
      maxStreak = Math.max(maxStreak, runningStreak);
    } else runningStreak = 0;
    previousDate = date;
  }
  let currentStreak = 0;
  let cursor = today;
  if (!unique.has(cursor)) cursor = utcDate(Date.parse(`${today}T00:00:00Z`) - 86400000);
  while (unique.has(cursor) && puzzleStatus(unique.get(cursor)) === 'won') {
    currentStreak++;
    cursor = utcDate(Date.parse(`${cursor}T00:00:00Z`) - 86400000);
  }
  return { played: unique.size, wins, winRate: unique.size ? Math.round(wins / unique.size * 100) : 0, currentStreak, maxStreak, distribution };
}

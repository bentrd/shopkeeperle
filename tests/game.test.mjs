import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_GUESSES, utcDate, millisecondsUntilReset, dailyAnswerId, randomAnswerId, searchItems, scoreRecipeSlots, compareGuess, createPuzzle, puzzleStatus, makeGuess, serializePuzzle, restorePuzzle, dailyStats } from '../game.js';

const catalog = {
  version: '16.22.1',
  answers: ['100', '101', '102', '103', '104', '105', '106', '107'],
  items: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(100 + i), {
    id: String(100 + i), name: ['Infinity Edge', 'Rabadon’s Deathcap', 'Kraken Slayer', 'Serylda’s Grudge', 'Warmog’s Armor', 'Morellonomicon', 'Hextech Rocketbelt', 'Maw of Malmortius'][i],
    recipe: i === 0 ? ['1', '1', '2'] : i === 1 ? ['1', '2', '2'] : [String(i + 3)], gold: { total: 3000 + i * 100, combine: 500 },
  }])),
};

test('UTC date and reset are independent of a player timezone', () => {
  assert.equal(utcDate('2026-11-04T00:30:00+02:00'), '2026-11-03');
  assert.equal(millisecondsUntilReset('2026-11-03T23:59:59Z'), 1000);
  assert.equal(millisecondsUntilReset('2026-11-04T00:00:00Z'), 86400000);
});

test('daily pick is deterministic and independent of catalog insertion order', () => {
  assert.equal(dailyAnswerId(catalog, '2026-11-03'), dailyAnswerId({ ...catalog, answers: [...catalog.answers].reverse() }, '2026-11-03'));
  assert.ok(catalog.answers.includes(dailyAnswerId(catalog, '2026-11-03')));
});

test('unlimited never immediately repeats when alternatives exist', () => {
  for (let i = 0; i < 30; i++) assert.notEqual(randomAnswerId(catalog, '100'), '100');
});

test('shared recipe feedback counts duplicate components only as often as present', () => {
  const feedback = compareGuess(catalog, '100', '101');
  assert.equal(feedback.correct, false);
  assert.deepEqual(feedback.sharedComponents, ['1', '2']);
  assert.equal(feedback.sharedCount, 2);
  assert.equal(feedback.componentCount, 3);
  assert.equal(feedback.goldDirection, 'lower');
  assert.deepEqual(feedback.slotColors, ['green', 'grey', 'green']);
  assert.equal(compareGuess(catalog, '100', '100').correct, true);
});

test('positional recipe feedback distinguishes exact, misplaced, and absent components', () => {
  assert.deepEqual(scoreRecipeSlots(['1', '2', '3'], ['1', '3', '4']), ['green', 'orange', 'grey']);
  assert.deepEqual(scoreRecipeSlots(['1', '2'], ['2', '1']), ['orange', 'orange']);
  assert.deepEqual(scoreRecipeSlots(['1', '2'], [1, 2]), ['green', 'green']);
});

test('slot feedback reserves greens before allocating duplicate oranges', () => {
  assert.deepEqual(scoreRecipeSlots(['1', '2', '1'], ['1', '1', '1']), ['green', 'grey', 'green']);
  assert.deepEqual(scoreRecipeSlots(['1', '2', '1'], ['2', '1', '1']), ['orange', 'orange', 'green']);
  assert.deepEqual(scoreRecipeSlots(['1', '2', '3'], ['2', '2', '2']), ['grey', 'green', 'grey']);
  assert.deepEqual(scoreRecipeSlots(['1', '1', '3'], ['2', '3', '1']), ['grey', 'orange', 'orange']);
});

test('slot feedback handles different recipe sizes without changing inputs', () => {
  const target = ['1', '2', '3'];
  const guess = ['3'];
  assert.deepEqual(scoreRecipeSlots(target, guess), ['orange']);
  assert.deepEqual(scoreRecipeSlots(['1'], ['1', '1', '2', '3']), ['green', 'grey', 'grey', 'grey']);
  assert.deepEqual(scoreRecipeSlots([], ['1']), ['grey']);
  assert.deepEqual(scoreRecipeSlots(target, []), []);
  assert.deepEqual(scoreRecipeSlots(['1', null, '2'], [null, null, '2', undefined]), ['grey', 'grey', 'green', 'grey']);
  assert.deepEqual(target, ['1', '2', '3']);
  assert.deepEqual(guess, ['3']);
});

test('items with the same visible recipe and combine cost are accepted fairly', () => {
  const variant = { ...catalog, items: { ...catalog.items, '101': { ...catalog.items['101'], recipe: ['2', '1', '1'], gold: { ...catalog.items['100'].gold } } } };
  assert.equal(compareGuess(variant, '100', '101').correct, true);
  assert.deepEqual(compareGuess(variant, '100', '101').slotColors, ['green', 'green', 'green']);
  const state = makeGuess(createPuzzle({ catalog: variant, date: '2026-11-03', answerId: '100' }), '101', variant);
  assert.equal(puzzleStatus(state), 'won');
  assert.equal(state.solvedBy, '101');
  assert.deepEqual(restorePuzzle(serializePuzzle(state), variant), state);
  const differentCost = { ...variant, items: { ...variant.items, '101': { ...variant.items['101'], gold: { total: 3000, combine: 600 } } } };
  assert.equal(compareGuess(differentCost, '100', '101').correct, false);
});

test('all component slots can match while a different combine cost keeps the item incorrect', () => {
  const variant = { ...catalog, items: { ...catalog.items, '101': { ...catalog.items['101'], recipe: [...catalog.items['100'].recipe], gold: { total: 3100, combine: 600 } } } };
  const feedback = compareGuess(variant, '100', '101');
  assert.deepEqual(feedback.slotColors, ['green', 'green', 'green']);
  assert.equal(feedback.correct, false);
  const state = makeGuess(createPuzzle({ catalog: variant, date: '2026-11-03', answerId: '100' }), '101', variant);
  assert.equal(puzzleStatus(state), 'playing');
});

test('search tolerates punctuation and excludes already purchased guesses', () => {
  assert.equal(searchItems(catalog, 'rabadon s')[0].id, '101');
  assert.equal(searchItems(catalog, 'INFINITY')[0].id, '100');
  assert.equal(searchItems(catalog, 'infinity', { exclude: ['100'] }).length, 0);
});

test('six guesses exhaust a puzzle and a correct guess finishes it immediately', () => {
  let state = createPuzzle({ catalog, date: '2026-11-03', answerId: '107' });
  for (let i = 0; i < MAX_GUESSES; i++) state = makeGuess(state, String(100 + i), catalog);
  assert.equal(puzzleStatus(state), 'lost');
  assert.throws(() => makeGuess(state, '107', catalog), /finished/);
  const won = makeGuess(createPuzzle({ catalog, date: '2026-11-03', answerId: '100' }), '100', catalog);
  assert.equal(puzzleStatus(won), 'won');
  assert.throws(() => makeGuess(won, '101', catalog), /finished/);
});

test('guess changes are immutable and duplicates are rejected', () => {
  const state = createPuzzle({ catalog, date: '2026-11-03', answerId: '107' });
  const next = makeGuess(state, '100', catalog);
  assert.deepEqual(state.guesses, []);
  assert.deepEqual(next.guesses, ['100']);
  assert.throws(() => makeGuess(next, '100', catalog), /already/);
});

test('restoring handles corrupt storage and rejects stale or impossible boards', () => {
  const state = makeGuess(createPuzzle({ catalog, date: '2026-11-03', answerId: '107' }), '100', catalog);
  const options = { mode: 'daily', date: '2026-11-03', answerId: '107' };
  assert.deepEqual(restorePuzzle(serializePuzzle(state), catalog, options), state);
  assert.equal(restorePuzzle('{', catalog), null);
  assert.equal(restorePuzzle(null, catalog), null);
  assert.equal(restorePuzzle({ ...state, date: '2026-02-31' }, catalog), null);
  assert.equal(restorePuzzle({ ...state, version: 'old' }, catalog), null);
  assert.equal(restorePuzzle(state, catalog, { ...options, date: '2026-11-04' }), null);
  assert.equal(restorePuzzle({ ...state, guesses: ['100', '100'] }, catalog), null);
  assert.equal(restorePuzzle({ ...state, guesses: ['107', '100'] }, catalog), null);
  assert.equal(restorePuzzle({ ...state, guesses: ['100', '999'] }, catalog), null);
});

function completed(date, won = true) {
  let state = createPuzzle({ catalog, date, answerId: '107' });
  if (won) return makeGuess(state, '107', catalog);
  for (let i = 0; i < MAX_GUESSES; i++) state = makeGuess(state, String(100 + i), catalog);
  return state;
}

test('stats deduplicate completed UTC days and calculate streak gaps and losses', () => {
  const today = completed('2026-11-03');
  const stats = dailyStats([completed('2026-10-31'), completed('2026-11-01'), completed('2026-11-02'), today, today], '2026-11-03T23:59:00Z');
  assert.equal(stats.played, 4);
  assert.equal(stats.wins, 4);
  assert.equal(stats.currentStreak, 4);
  assert.equal(stats.maxStreak, 4);
  assert.equal(stats.distribution[0], 4);
  assert.equal(dailyStats([completed('2026-11-01'), today], '2026-11-03').currentStreak, 1);
  assert.equal(dailyStats([completed('2026-11-02')], '2026-11-03').currentStreak, 1);
  assert.equal(dailyStats([completed('2026-11-02'), completed('2026-11-03', false)], '2026-11-03').currentStreak, 0);
  assert.equal(dailyStats([completed('2026-11-01')], '2026-11-03').currentStreak, 0);
});

test('stats recover from null or partially corrupted stored history', () => {
  assert.equal(dailyStats(null, '2026-11-03').played, 0);
  const state = completed('2026-11-03');
  assert.equal(dailyStats([null, { ...state, answerId: null }, { ...state, solvedBy: 'missing' }, state], '2026-11-03').played, 1);
});

test('actual catalog accepts every item sharing the displayed recipe and cost', async () => {
  const { readFile } = await import('node:fs/promises');
  const current = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  const groups = new Map();
  for (const id of current.answers) {
    const item = current.items[id];
    const signature = [...item.recipe].sort().join(',') + ':' + item.gold.combine;
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(id);
  }
  for (const ids of groups.values()) {
    for (const answerId of ids) {
      for (const guessId of ids) {
        const state = makeGuess(createPuzzle({ catalog: current, date: '2026-11-03', answerId }), guessId, current);
        assert.equal(puzzleStatus(state), 'won', `${current.items[guessId].name} matches ${current.items[answerId].name}`);
        assert.equal(restorePuzzle(serializePuzzle(state), current).solvedBy, guessId);
      }
    }
  }
});

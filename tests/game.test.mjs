import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_GUESSES, utcDate, millisecondsUntilReset, dailyAnswerId, randomAnswerId, searchItems, getGuessRecipe, scoreRecipeComponents, compareGuess, createPuzzle, puzzleStatus, makeGuess, serializePuzzle, restorePuzzle, dailyStats } from '../game.js';

const catalog = {
  version: '16.22.1',
  answers: ['100', '101', '102', '103', '104', '105', '106', '107'],
  items: Object.fromEntries([...Array.from({ length: 10 }, (_, i) => [String(i + 1), { id: String(i + 1), name: `Component ${i + 1}`, recipe: [], gold: { total: 100, combine: 100 }, tags: [] }]), ...Array.from({ length: 8 }, (_, i) => [String(100 + i), {
    id: String(100 + i), name: ['Infinity Edge', 'Rabadon’s Deathcap', 'Kraken Slayer', 'Serylda’s Grudge', 'Warmog’s Armor', 'Morellonomicon', 'Hextech Rocketbelt', 'Maw of Malmortius'][i],
    recipe: i === 0 ? ['1', '1', '2'] : i === 1 ? ['1', '2', '2'] : [String(i + 3)], gold: { total: 3000 + i * 100, combine: 500 },
  }])]),
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
  assert.deepEqual(feedback.slotColors, ['green', 'green', 'grey']);
  assert.equal(compareGuess(catalog, '100', '100').correct, true);
});

const craftingCatalog = {
  version: '16.22.1',
  answers: ['3814', '9001', '9003', '9010'],
  items: Object.fromEntries([
    ['1036', 'Long Sword', []], ['1028', 'Ruby Crystal', []],
    ['3134', 'Serrated Dirk', ['1036', '1036']],
    ['2021', 'Tunneler', ['1036', '1028']],
    ['3133', "Caulfield's Warhammer", ['1036', '1036']],
    ['3814', 'Edge of Night', ['3134', '2021']],
    ['9001', 'Simple Target', ['1036']],
    ['9002', 'Upgrade Probe', ['3134']],
    ['9003', 'Duplicate Target', ['3134', '3134']],
    ['9004', 'Duplicate Probe', ['3134', '3134', '3134']],
    ['9005', 'Mixed Probe', ['1036', '3134', '1036']],
    ['9006', 'Sibling Probe', ['3133']],
    ['9007', 'Reordered Probe', ['2021', '3134']],
    ['9010', 'Cyclic Target', ['9011']],
    ['9011', 'Cycle A', ['9012']], ['9012', 'Cycle B', ['9011']],
  ].map(([id, name, recipe]) => [id, { id, name, recipe, gold: { total: 1000, combine: 100 } }])),
};

test('Long Sword is orange when the hidden recipe contains Serrated Dirk', () => {
  assert.deepEqual(getGuessRecipe(craftingCatalog, '1036'), ['1036']);
  assert.deepEqual(scoreRecipeComponents(craftingCatalog, '3814', '1036'), ['orange']);
  assert.deepEqual(compareGuess(craftingCatalog, '3814', '1036').slotColors, ['orange']);
});

test('direct ingredient matches are green regardless of recipe order', () => {
  assert.deepEqual(scoreRecipeComponents(craftingCatalog, '3814', '9007'), ['green', 'green']);
  assert.deepEqual(scoreRecipeComponents(catalog, '100', '101'), ['green', 'green', 'grey']);
});

test('green duplicate allocation is capped by exact target quantities', () => {
  assert.deepEqual(scoreRecipeComponents(craftingCatalog, '9003', '9004'), ['green', 'green', 'grey']);
  assert.deepEqual(scoreRecipeComponents(craftingCatalog, '3814', '9005'), ['orange', 'green', 'orange']);
});

test('orange recognizes upgrades and recursive subcomponents, even beyond a green match', () => {
  assert.deepEqual(scoreRecipeComponents(craftingCatalog, '9001', '9002'), ['orange']);
  const deep = { ...craftingCatalog, items: { ...craftingCatalog.items,
    '9013': { id: '9013', name: 'Deep Target', recipe: ['3814'], gold: { total: 2000, combine: 100 } },
  } };
  assert.deepEqual(scoreRecipeComponents(deep, '9013', '1036'), ['orange']);
});

test('siblings that only share a leaf component remain grey', () => {
  assert.deepEqual(scoreRecipeComponents(craftingCatalog, '3814', '9006'), ['grey']);
});

test('crafting cycles terminate and leave unrelated components grey', () => {
  assert.deepEqual(scoreRecipeComponents(craftingCatalog, '9010', '1036'), ['grey']);
  const cycleProbe = { ...craftingCatalog, items: { ...craftingCatalog.items,
    '9014': { id: '9014', name: 'Cycle Probe', recipe: ['9012'], gold: { total: 2000, combine: 100 } },
  } };
  assert.deepEqual(scoreRecipeComponents(cycleProbe, '9010', '9014'), ['orange']);
});

test('intermediates and basic components cannot be selected, guessed or restored', () => {
  assert.deepEqual(searchItems(craftingCatalog, 'long sword'), []);
  assert.deepEqual(searchItems(craftingCatalog, 'serrated dirk'), []);
  const state = createPuzzle({ catalog: craftingCatalog, answerId: '3814', date: '2026-11-03' });
  assert.throws(() => makeGuess(state, '1036', craftingCatalog), /completed item or boots/);
  assert.throws(() => makeGuess(state, '3134', craftingCatalog), /completed item or boots/);
  assert.equal(restorePuzzle({ ...state, guesses: ['1036'] }, craftingCatalog), null);
  assert.equal(restorePuzzle({ ...state, answerId: '3134' }, craftingCatalog), null);
  assert.throws(() => createPuzzle({ catalog: craftingCatalog, answerId: '1036' }), /Unknown answer/);
  assert.throws(() => makeGuess(state, 'missing', craftingCatalog), /Choose a completed item/);
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

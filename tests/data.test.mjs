import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCatalog, dailyAnswer, getPlayableIds, isShopItem, recipeKey } from '../scripts/update-data.mjs';
import { dailyAnswerId, createPuzzle, makeGuess, restorePuzzle, serializePuzzle, getGuessRecipe } from '../game.js';

const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));

test('published answer pool has completed Summoner’s Rift items and the boots exception', () => {
  assert.ok(catalog.answers.length >= 50);
  assert.equal(new Set(catalog.answers).size, catalog.answers.length);
  for (const id of catalog.answers) {
    const item = catalog.items[id];
    assert.ok(Number(id) < 10000);
    assert.ok(item.recipe.length > 0 || id === '1001');
    assert.ok(item.gold.combine > 0 || item.tags.includes('Boots') || id === '3172');
    assert.ok(item.recipe.every(component => catalog.items[component]));
    assert.equal(item.recipeKey, recipeKey(item.recipe, item.gold.combine));
    assert.equal(item.gold.total, item.gold.combine + item.recipe.reduce((gold, component) => gold + catalog.items[component].gold.total, 0));
    assert.ok(item.image.startsWith(`https://ddragon.leagueoflegends.com/cdn/${catalog.version}/img/item/`));
  }
});

test('live catalog includes completed items while excluding components and non-equipment', () => {
  const playable = getPlayableIds(catalog);
  assert.deepEqual(catalog.answers, playable);
  assert.equal(catalog.pool, 'completed-items-v1');
  for (const id of ['3031', '3814', '6694', '3041', '3003', '3004', '3119', '2526']) {
    assert.ok(playable.includes(id), `${catalog.items[id].name} is completed equipment`);
  }
  for (const id of ['1036', '3134', '3133', '3035', '3077', '1053', '3070', '1055', '1083', '2051', '2003', '2031', '2055', '1101', '1102', '1103', '3340', '3865', '3869']) {
    assert.ok(catalog.items[id], `${id} remains available internally for recipes`);
    assert.ok(!playable.includes(id), `${catalog.items[id].name} cannot be guessed or selected`);
  }
  // Old answers arrays must neither whitelist intermediates nor suppress real final items.
  assert.deepEqual(getPlayableIds({ ...catalog, answers: ['1036'] }), playable);
});

test('base and upgraded boots are playable even when Riot omits the Boots tag', () => {
  const playable = getPlayableIds(catalog);
  for (const id of ['1001', '3006', '3008', '3009', '3020', '3047', '3111', '3158', '3168', '3170', '3171', '3172', '3173', '3174', '3175']) {
    assert.ok(playable.includes(id), `${catalog.items[id].name} uses the boots exception`);
  }
  assert.deepEqual(getGuessRecipe(catalog, '1001'), ['1001']);
  const state = makeGuess(createPuzzle({ catalog, answerId: '3814', date: '2026-11-03' }), '1001', catalog);
  assert.deepEqual(restorePuzzle(serializePuzzle(state), catalog), state);
});

test('only paid obtainable shop upgrades make their parent intermediate', () => {
  const item = (id, recipe, combine = 100, extra = {}) => ({ id, name: id, recipe, gold: { total: 1000, combine }, tags: [], ...extra });
  const fixture = { items: {
    '1': item('1', []),
    '100': item('100', ['1']),
    '101': item('101', ['100']),
    '102': item('102', ['101'], 0), // Free transformation must not block 101.
    '103': item('103', ['101'], 100, { purchasable: false }),
    '104': item('104', ['101'], 100, { inStore: false }),
    '105': item('105', ['101'], 100, { requiredChampion: 'Ornn' }),
    '106': item('106', ['101'], 100, { tags: ['Consumable'] }),
    '107': item('107', ['101'], 100, { maps: { 11: false } }),
    '10001': item('10001', ['101']), // Mode/Ornn variant outside ordinary shop IDs.
  } };
  assert.deepEqual(getPlayableIds(fixture), ['101']);
});

test('starter, jungle, consumable and trinket categories stay excluded even with recipes', () => {
  const fixture = { items: {
    '1': { id: '1', name: 'Component', recipe: [], gold: { total: 100, combine: 100 }, tags: [] },
    ...Object.fromEntries(['Lane', 'Jungle', 'Consumable', 'Trinket'].map((tag, index) => [String(100 + index), {
      id: String(100 + index), name: tag, recipe: ['1'], gold: { total: 1000, combine: 900 }, tags: [tag],
    }])),
  } };
  assert.deepEqual(getPlayableIds(fixture), []);
});

test('historical snapshot pools are recalculated while valid daily targets stay unchanged', async () => {
  const original = JSON.parse(await readFile(new URL('../data/patches/16.22.1.json', import.meta.url), 'utf8'));
  assert.ok(original.answers.includes('3134')); // Legacy snapshot still includes intermediates.
  const playable = getPlayableIds(original);
  assert.deepEqual(playable, catalog.answers);
  for (const date of ['2026-11-03', '2026-11-04']) {
    const manifest = JSON.parse(await readFile(new URL(`../data/daily/${date}.json`, import.meta.url), 'utf8'));
    assert.ok(playable.includes(manifest.answerId));
    assert.equal(createPuzzle({ catalog: original, date, answerId: manifest.answerId }).answerId, manifest.answerId);
  }
  assert.ok(playable.includes(dailyAnswerId(original, '2026-11-05')));
  assert.equal(restorePuzzle({ schemaVersion: 1, mode: 'unlimited', date: '2026-11-03', version: original.version, answerId: '3134', guesses: [], hintUsed: false, solvedBy: null }, original), null);
});

test('recipe identity preserves duplicate ingredients and ignores ingredient order', () => {
  assert.equal(recipeKey(['1036', '1042', '1036'], 250), recipeKey(['1042', '1036', '1036'], 250));
  assert.notEqual(recipeKey(['1036', '1042'], 250), recipeKey(['1036', '1042', '1036'], 250));
  assert.notEqual(recipeKey(['1036', '1042'], 250), recipeKey(['1036', '1042'], 350));
});

test('mode variants, hidden items and champion-only items are excluded', () => {
  const item = { name: 'Test item', image: { full: '1001.png' }, maps: { 11: true }, gold: { purchasable: true } };
  assert.equal(isShopItem('1001', item), true);
  assert.equal(isShopItem('321001', item), false);
  assert.equal(isShopItem('1001', { ...item, hideFromAll: true }), false);
  assert.equal(isShopItem('1001', { ...item, inStore: false }), false);
  assert.equal(isShopItem('1001', { ...item, requiredChampion: 'Kalista' }), false);
  assert.equal(isShopItem('1001', { ...item, maps: { 11: false, 12: true } }), false);
  assert.equal(isShopItem('1001', { ...item, gold: { purchasable: false } }), false);
});

test('daily selection is deterministic and each selected ID is in the supplied pool', () => {
  const answer = dailyAnswer('2026-11-03', catalog.answers);
  assert.equal(answer, dailyAnswer('2026-11-03', catalog.answers));
  assert.ok(catalog.answers.includes(answer));
  assert.throws(() => dailyAnswer('bad-date', catalog.answers));
  assert.throws(() => dailyAnswer('2026-11-03', []));
});

test('future daily manifests use the same answer as the browser fallback', () => {
  for (const date of ['2026-11-05', '2026-12-31', '2027-01-01']) {
    assert.equal(dailyAnswer(date, catalog.answers), dailyAnswerId(catalog, date));
    assert.equal(dailyAnswer(date, [...catalog.answers].reverse()), dailyAnswerId(catalog, date));
  }
});

test('mismatched and dangerously small upstream payloads fail instead of replacing good data', () => {
  assert.throws(() => buildCatalog({ version: '1.0.0', data: {} }, '2.0.0'));
  assert.throws(() => buildCatalog({ version: '1.0.0', data: {} }, '1.0.0'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCatalog, dailyAnswer, isShopItem, recipeKey } from '../scripts/update-data.mjs';
import { dailyAnswerId } from '../game.js';

const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));

test('published answer pool has real, complete Summoner’s Rift recipes', () => {
  assert.ok(catalog.answers.length >= 50);
  assert.equal(new Set(catalog.answers).size, catalog.answers.length);
  for (const id of catalog.answers) {
    const item = catalog.items[id];
    assert.ok(Number(id) < 10000);
    assert.ok(item.recipe.length > 0);
    assert.ok(item.gold.combine > 0);
    assert.ok(item.recipe.every(component => catalog.items[component]));
    assert.equal(item.recipeKey, recipeKey(item.recipe, item.gold.combine));
    assert.equal(item.gold.total, item.gold.combine + item.recipe.reduce((gold, component) => gold + catalog.items[component].gold.total, 0));
    assert.ok(item.image.startsWith(`https://ddragon.leagueoflegends.com/cdn/${catalog.version}/img/item/`));
  }
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

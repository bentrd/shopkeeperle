import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPuzzle, makeGuess, compareGuess, MAX_GUESSES } from '../game.js';
import { getPlayableIds } from '../catalog.js';
import { buildShareModel } from '../share-model.js';

const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const siteUrl = 'https://bentrd.github.io/shopkeeperle/';
const date = '2026-11-04';

function finish({ mode = 'daily', answerId = '3814', guesses = ['6694', '3814'], hintUsed = false } = {}) {
  let state = createPuzzle({ catalog, mode, date, answerId });
  for (const id of guesses) state = makeGuess(state, id, catalog);
  return { ...state, hintUsed };
}

test('daily receipt has the exact score, pinned date, newline grid and canonical URL', () => {
  const state = finish();
  const model = buildShareModel({ state, catalog, siteUrl: `${siteUrl}?mode=unlimited&utm=secret#spoiler` });
  assert.equal(model.title, 'Shopkeeperle');
  assert.equal(model.mode, 'Daily');
  assert.equal(model.date, date);
  assert.equal(model.outcome, 'Victory');
  assert.equal(model.score, '2/6');
  assert.equal(model.url, siteUrl);
  assert.deepEqual(model.colors, state.guesses.map(id => compareGuess(catalog, state.answerId, id).slotColors));
  assert.equal(model.text, `Shopkeeperle ${date} · 2/6\n⬛⬛\n🟩🟩\n${siteUrl}`);
  assert.equal(model.caption, model.text);
  assert.equal(model.text.split('\n').length, 4);
});

test('unlimited has no date and only the canonical mode query', () => {
  const state = finish({ mode: 'unlimited', guesses: ['3814'], hintUsed: true });
  const model = buildShareModel({ state, catalog, siteUrl: 'https://user:password@example.com/shopkeeperle/index.html?answer=3814#secret' });
  assert.equal(model.mode, 'Unlimited');
  assert.equal(Object.hasOwn(model, 'date'), false);
  assert.equal(model.url, 'https://example.com/shopkeeperle/?mode=unlimited');
  assert.equal(model.text, 'Shopkeeperle Unlimited · 1/6 💡\n🟩🟩\nhttps://example.com/shopkeeperle/?mode=unlimited');
  assert.equal(model.hintUsed, true);
  assert.ok(model.alt.includes('Hint used.'));
});

test('defeat uses X/6 and preserves all six feedback rows', () => {
  const guesses = getPlayableIds(catalog).filter(id => !compareGuess(catalog, '3814', id).correct).slice(0, MAX_GUESSES);
  const model = buildShareModel({ state: finish({ guesses }), catalog, siteUrl });
  assert.equal(model.outcome, 'Defeat');
  assert.equal(model.score, 'X/6');
  assert.equal(model.colors.length, 6);
  assert.equal(model.text.split('\n').length, 8);
});

test('share output contains no answer, component or item identifiers, names or images', () => {
  const secretName = 'PRIVATE-SPOILER-ITEM-NAME🗡️'.repeat(10000);
  const named = { ...catalog, items: Object.fromEntries(Object.entries(catalog.items).map(([id, item]) => [id, { ...item, name: secretName, image: 'https://private.invalid/SECRET-ICON.png' }])) };
  const model = buildShareModel({ state: finish(), catalog: named, siteUrl });
  const serialized = JSON.stringify(model);
  for (const value of ['3814', '3134', '2021', '6694', '3133', '3035', 'Edge of Night', 'Serrated Dirk', 'Tunneler', 'PRIVATE-SPOILER', 'SECRET-ICON', 'answerId', 'items', 'guesses']) {
    assert.ok(!serialized.includes(value), `No ${value} in a shared receipt`);
  }
  assert.deepEqual(Object.keys(model), ['title', 'mode', 'date', 'outcome', 'score', 'hintUsed', 'colors', 'url', 'text', 'caption', 'alt']);
  assert.ok([...model.caption].length < 500);
  assert.ok([...model.alt].length < 600);
});

test('unfinished, forged, overlong and impossible boards cannot be shared', () => {
  const playing = createPuzzle({ catalog, date, answerId: '3814' });
  assert.throws(() => buildShareModel({ state: playing, catalog, siteUrl }), /finished puzzle/);
  const oneMiss = makeGuess(playing, '6694', catalog);
  assert.throws(() => buildShareModel({ state: { ...oneMiss, solvedBy: '6694' }, catalog, siteUrl }), /finished puzzle/);
  assert.throws(() => buildShareModel({ state: { ...finish(), guesses: ['3814', '6694'] }, catalog, siteUrl }), /Invalid finished/);
  assert.throws(() => buildShareModel({ state: { ...finish(), guesses: Array(7).fill('6694') }, catalog, siteUrl }), /finished puzzle/);
  assert.throws(() => buildShareModel({ state: { ...finish(), date: '2026-02-31' }, catalog, siteUrl }), /valid daily date/);
  assert.throws(() => buildShareModel({ state: finish(), catalog, siteUrl: 'javascript:alert(1)' }), /web URL/);
  assert.throws(() => buildShareModel({ state: finish(), catalog, siteUrl: `https://example.com/${'a'.repeat(2200)}` }), /caption is too long/);
});

test('duplicate component quantities and original inputs are preserved by the engine grid', () => {
  const state = finish({ answerId: '2501', guesses: ['3053', '2501'] });
  const before = JSON.stringify({ state, catalog });
  const model = buildShareModel({ state, catalog, siteUrl });
  assert.deepEqual(model.colors, state.guesses.map(id => compareGuess(catalog, state.answerId, id).slotColors));
  assert.deepEqual(model.colors[1], ['green', 'green']);
  assert.ok(model.caption.includes('🟧'));
  model.colors[0][0] = 'green';
  assert.equal(JSON.stringify({ state, catalog }), before);
});

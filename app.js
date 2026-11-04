import { MAX_GUESSES, utcDate, millisecondsUntilReset, dailyAnswerId, randomAnswerId, normalizeSearch, searchItems, getGuessRecipe, compareGuess, createPuzzle, puzzleStatus, makeGuess, useHint, serializePuzzle, restorePuzzle, dailyStats } from './game.js';
import { buildCatalog, getPlayableIds, VERSIONS_URL } from './catalog.js';
import { initShopkeeper } from './keeper.js';
import { initSpeechBubble } from './speech.js';
import { initOutcomeDialog, outcomeCrest } from './outcome.js';
import { initShopResize } from './shop-resize.js';
import { buildShareModel } from './share-model.js';
import { initSharing } from './sharing.js';

// Safari also exposes native pinch zoom through gesture events.
for (const type of ['gesturestart', 'gesturechange']) {
  document.addEventListener(type, event => event.preventDefault(), { passive: false });
}

const $ = selector => document.querySelector(selector);
let touchInteraction = matchMedia('(pointer: coarse)').matches;
document.addEventListener('pointerdown', event => { touchInteraction = event.pointerType !== 'mouse'; }, { capture: true, passive: true });
document.addEventListener('keydown', event => {
  // Typing on the on-screen keyboard is still part of a touch interaction.
  if (!['INPUT', 'TEXTAREA'].includes(event.target.tagName) || ['Tab', 'ArrowDown', 'ArrowUp', 'Escape'].includes(event.key) || event.ctrlKey || event.metaKey) touchInteraction = false;
}, { capture: true });
function dismissTouchKeyboard() {
  if (touchInteraction && document.activeElement === $('#item-search')) $('#item-search').blur();
}
function restoreSearchFocus() {
  if (touchInteraction) dismissTouchKeyboard();
  else $('#item-search').focus({ preventScroll: true });
}
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const quotes = ['What are we building today?', 'A sharp eye is worth more than a full purse.', 'Take your time. The Rift can wait.', 'Fine wares. Finer instincts.', 'Now that has the makings of a good build.', 'A little shop knowledge goes a long way.'];
const base = new URL('./', location.href);
const storagePrefix = 'shopkeeperle:v1:';
const keeper = initShopkeeper({scene: $('.keeper-scene'), image: $('img.keeper')});
const speech = initSpeechBubble({button: $('#quote-button'), quote: $('#quote')});
speech.setText($('#quote').textContent);
initShopResize({panel:$('#purchase-panel'), grid:$('#item-grid')});
let latestCatalog, catalog, state, daily, dailyCatalog;
let mode = new URL(location.href).searchParams.get('mode') === 'unlimited' ? 'unlimited' : 'daily';
let selectedId = null, filter = 'all', quoteIndex = 0, loadGeneration = 0;
let storageWarning = false, refreshedAt = null, dailyUnavailable = false, pendingMode = null;
const memorySaves = new Map();
const catalogs = new Map();
const outcome = initOutcomeDialog({
  dialog: $('#outcome-dialog'),
  onNext: startNextRecipe,
  onShare: shareResult,
  onDismiss: () => $('#result-heading')?.focus({ preventScroll: true }),
});
const sharing = initSharing({
  dialog: $('#share-dialog'),
  onDismiss: () => { if ($('#result-heading')) $('#result-heading').focus({ preventScroll: true }); else restoreSearchFocus(); },
});

function readSave(key) { if (memorySaves.has(key)) return memorySaves.get(key); try { return localStorage.getItem(storagePrefix + key); } catch { return null; } }
function writeSave(key, value) {
  memorySaves.set(key, value);
  try { localStorage.setItem(storagePrefix + key, value); }
  catch { if (!storageWarning) { storageWarning = true; toast('Browser storage is unavailable. Progress lasts for this visit.'); } }
}
function saveState() {
  writeSave(state.mode === 'daily' ? `daily:${state.date}` : 'unlimited', serializePuzzle(state));
  if (state.mode === 'unlimited') writeSave('unlimited-catalog', JSON.stringify(catalog));
}
async function getJSON(url, { remote = false } = {}) {
  const response = await fetch(remote ? url : new URL(url, base), { cache: 'no-cache', signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Data unavailable (${response.status})`);
  return response.json();
}
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { $('#toast').hidden = true; }, 3500);
}
function setQuote(text) { speech.setText(`“${text}”`); }
function itemImage(item, extra = '') { return `<img src="${escape(item.image)}" alt="${escape(item.name)}" width="48" height="48" ${extra}>`; }
function cleanSearch() { selectedId = null; filter = 'all'; $('#item-search').value = ''; $('#form-message').textContent = ''; }

async function loadDaily() {
  const date = utcDate();
  const manifest = await getJSON(`data/daily/${date}.json`);
  if (manifest.date !== date || !/^\d+\.\d+\.\d+(?:-[a-f0-9]+)?$/.test(manifest.snapshot || manifest.version)) throw new Error('Invalid daily manifest');
  const patch = await getJSON(`data/patches/${manifest.snapshot || manifest.version}.json`);
  if (patch.version !== manifest.version || !patch.answers.includes(manifest.answerId)) throw new Error('Invalid daily recipe');
  // Older snapshots retain all clue components. Apply current eligibility to their answer too.
  daily = { ...manifest, answerId: getPlayableIds(patch).includes(manifest.answerId) ? manifest.answerId : dailyAnswerId(patch, date) };
  dailyCatalog = patch; dailyUnavailable = false;
}

async function startMode(nextMode, { newPuzzle = false } = {}) {
  if (!latestCatalog) return;
  if (pendingMode === nextMode && !newPuzzle) return;
  const generation = ++loadGeneration;
  pendingMode = nextMode;
  outcome.close({navigating: true});
  sharing.close({navigating: true});
  $('#game').setAttribute('aria-busy', 'true');
  if (state) saveState();
  try {
    if (nextMode === 'daily') {
      if (!daily || daily.date !== utcDate()) await loadDaily();
      if (generation !== loadGeneration) return;
      catalog = dailyCatalog;
      state = restorePuzzle(readSave(`daily:${daily.date}`), catalog, { mode: 'daily', date: daily.date, answerId: daily.answerId }) || createPuzzle({ catalog, mode: 'daily', date: daily.date, answerId: daily.answerId });
    } else {
      const previousId = state?.answerId;
      let savedCatalog;
      if (!newPuzzle) {
        try {
          const saved = JSON.parse(readSave('unlimited'));
          savedCatalog = JSON.parse(readSave('unlimited-catalog')) || catalogs.get(saved?.version);
          if (savedCatalog && savedCatalog.version === saved?.version) state = restorePuzzle(saved, savedCatalog, { mode: 'unlimited' });
          else state = null;
        } catch { state = null; }
      } else state = null;
      catalog = state ? savedCatalog : latestCatalog;
      state ||= createPuzzle({ catalog, mode: 'unlimited', answerId: randomAnswerId(catalog, previousId) });
    }
    catalogs.set(catalog.version, catalog);
    mode = nextMode; cleanSearch(); saveState();
    if (puzzleStatus(state) === 'playing') setQuote('What are we building today?');
    const url = new URL(location.href);
    if (mode === 'unlimited') url.searchParams.set('mode', 'unlimited'); else url.searchParams.delete('mode');
    history.replaceState(null, '', url);
    $('#load-error').hidden = true;
    render();
  } catch (error) {
    if (generation !== loadGeneration) return;
    if (nextMode === 'daily') {
      dailyUnavailable = true;
      $('#load-error').innerHTML = 'Today’s delivery is running late. <button id="fallback-unlimited">Play unlimited</button> or <button id="retry-daily">try again</button>.';
      $('#fallback-unlimited').onclick = () => startMode('unlimited');
      $('#retry-daily').onclick = () => startMode('daily');
      $('#load-error').hidden = false;
      if (!state) await startMode('unlimited');
      // Keep the notice visible if initial load had to fall back.
      $('#load-error').hidden = false;
    } else showFatal();
  } finally { if (generation === loadGeneration) { pendingMode = null; $('#game').setAttribute('aria-busy', 'false'); } }
}

function render() {
  if (!state) return;
  const status = puzzleStatus(state), finished = status !== 'playing';
  $('#game').dataset.status = status;
  const answer = catalog.items[state.answerId];
  const displayed = catalog.items[state.solvedBy || state.answerId];
  const lastId = state.guesses.at(-1), last = lastId && catalog.items[lastId];
  const lastFeedback = last && compareGuess(catalog, state.answerId, lastId);
  $('#daily-mode').setAttribute('aria-pressed', String(mode === 'daily'));
  $('#unlimited-mode').setAttribute('aria-pressed', String(mode === 'unlimited'));
  $('#patch-label').textContent = `Patch ${catalog.version.split('.').slice(0, 2).join('.')}`;
  $('.patch').title = `Riot Data Dragon ${catalog.version}${mode === 'daily' ? ' · fixed for this daily puzzle' : ''}`;
  $('#puzzle-label').textContent = mode === 'daily' ? 'TODAY’S RECIPE' : 'UNLIMITED RECIPE';
  $('#puzzle-date').textContent = mode === 'daily' ? new Date(`${state.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).toUpperCase() : 'NO DAILY LIMIT';
  $('.mystery-inner').innerHTML = finished ? itemImage(displayed, 'fetchpriority="high"') : '?';
  $('.mystery-inner').setAttribute('aria-label', finished ? displayed.name : 'Mystery item');
  $('#answer-heading').textContent = finished ? displayed.name : last ? `Your guess: ${last.name}` : 'Name the mystery item';
  $('#recipe-subtitle').textContent = finished ? (status === 'won' ? 'That’s a build worth buying.' : 'Here’s what was on the shopping list.') : last ? 'Use these colours to plan your next guess.' : 'Guess an item to inspect its recipe.';
  if (!finished && last && lastFeedback.slotColors.every(color => color === 'green')) $('#recipe-subtitle').textContent = getGuessRecipe(catalog, lastId).length === answer.recipe.length ? 'Right ingredients. Keep an eye on the gold cost.' : 'A good start. There’s more to this recipe.';
  const recipeItem = finished ? displayed : last;
  const shownRecipe = recipeItem ? getGuessRecipe(catalog, recipeItem.id) : [null, null, null];
  $('#ingredients').innerHTML = shownRecipe.map((id, index) => {
    if (!id) return '<div class="ingredient unknown"><div class="empty-slot" aria-label="Hidden ingredient">?</div><span>Unknown</span></div>';
    const item = catalog.items[id];
    const color = finished ? 'green' : lastFeedback.slotColors[index];
    const label = color === 'green' ? 'Direct ingredient' : color === 'orange' ? 'Related crafting branch' : 'Not in recipe';
    return `<div class="ingredient ${color}" title="${escape(item.name)}: ${label}"><div class="colored-slot">${itemImage(item)}<b aria-label="${label}">${color === 'green' ? '✓' : color === 'orange' ? '↔' : '×'}</b></div><span>${escape(item.name)}</span></div>`;
  }).join('');
  $('#combine-cost').textContent = recipeItem ? recipeItem.gold.total.toLocaleString('en-US') : '???';
  $('#cost-caption').textContent = finished ? 'total gold' : last ? `gold · ${lastFeedback.goldDirection === 'equal' ? 'right price' : `aim ${lastFeedback.goldDirection}`}` : 'gold · hidden until you guess';
  $('.combine-cost').className = `combine-cost ${finished || lastFeedback?.goldDirection === 'equal' ? 'price-green' : last ? 'price-orange' : ''}`;
  $('#attempt-label').textContent = finished ? `${state.guesses.length}/${MAX_GUESSES} guesses used` : `${MAX_GUESSES - state.guesses.length} guesses remaining`;
  $('#attempts').innerHTML = Array.from({ length: MAX_GUESSES }, (_, i) => `<i class="${i < state.guesses.length ? (status === 'won' && i === state.guesses.length - 1 ? 'win' : 'used') : ''}"></i>`).join('');
  $('#attempts').setAttribute('aria-label', `${state.guesses.length} of ${MAX_GUESSES} attempts used`);
  $('#hint-button').hidden = finished || state.hintUsed;
  $('#hint').hidden = !state.hintUsed || finished;
  $('#hint').textContent = `One possible answer starts with “${answer.name.charAt(0)}”.`;
  $('#purchase-panel').hidden = finished;
  $('#result-panel').hidden = !finished;
  $('#history-section').hidden = !state.guesses.length;
  renderHistory();
  if (finished) renderResult(status, displayed);
  else renderGrid();
  updateClock();
}

function renderGrid() {
  const query = $('#item-search').value;
  let items = searchItems(catalog, query, { exclude: state.guesses });
  if (filter !== 'all') items = items.filter(item => filter === 'defense' ? item.tags.some(tag => ['Armor', 'SpellBlock', 'Health'].includes(tag)) : item.tags.includes(filter));
  $('#item-count').textContent = `${items.length} ITEMS IN STOCK`;
  $('#item-grid').innerHTML = items.length ? items.map(item => `<button type="button" class="shop-item" data-id="${item.id}" aria-label="Select ${escape(item.name)}, ${item.gold.total} gold" aria-pressed="${item.id === selectedId}" title="${escape(item.name)} · ${item.gold.total} gold">${itemImage(item, 'loading="lazy"')}</button>`).join('') : '<div class="empty-search">No items found. Try another name or filter.</div>';
  for (const button of $$('#item-grid button')) button.addEventListener('click', () => selectItem(button.dataset.id));
  for (const button of $$('.filter-tabs button')) button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
  $('#guess-button').disabled = !selectedId;
  $('#selection-label').textContent = selectedId ? `${catalog.items[selectedId].name} · ${catalog.items[selectedId].gold.total.toLocaleString('en-US')} gold` : 'Select an item below, then buy your guess.';
}
function $$(selector) { return document.querySelectorAll(selector); }
function selectItem(id) {
  selectedId = id;
  // Keep the scrolled inventory position while updating the selection.
  for (const button of $$('#item-grid button')) button.setAttribute('aria-pressed', String(button.dataset.id === id));
  $('#guess-button').disabled = false;
  $('#selection-label').textContent = `${catalog.items[id].name} · ${catalog.items[id].gold.total.toLocaleString('en-US')} gold`;
  $('#form-message').textContent = '';
  dismissTouchKeyboard();
}
function renderHistory() {
  $('#history').innerHTML = state.guesses.map((id, index) => {
    const item = catalog.items[id], feedback = compareGuess(catalog, state.answerId, id);
    const direction = feedback.goldDirection;
    const priceLabel = direction === 'equal' ? 'Same cost' : `Aim ${direction}`;
    return `<li class="guess-row"><span class="guess-number">${index + 1}</span>${itemImage(item)}<span class="guess-name">${escape(item.name)}${feedback.correct ? '<small>✓ Recipe found</small>' : ''}</span><span class="history-recipe" aria-label="Recipe feedback">${getGuessRecipe(catalog, id).map((component, i) => { const color = feedback.slotColors[i], label = color === 'green' ? 'Direct ingredient' : color === 'orange' ? 'Related crafting branch' : 'Not in recipe'; return `<span class="history-slot ${color}" title="${escape(catalog.items[component].name)}: ${label}">${itemImage(catalog.items[component])}<b aria-label="${label}">${color === 'green' ? '✓' : color === 'orange' ? '↔' : '×'}</b></span>`; }).join('')}</span><span class="feedback"><span class="price ${direction === 'equal' ? 'green-text' : 'orange-text'}" title="The mystery item’s total gold cost is ${direction} compared with this guess">${direction === 'higher' ? '↑' : direction === 'lower' ? '↓' : '='} ${priceLabel}</span></span></li>`;
  }).join('');
}
function renderResult(status, displayed) {
  const equivalents = getPlayableIds(catalog).filter(id => compareGuess(catalog, state.answerId, id).correct);
  const alternatives = equivalents.filter(id => id !== displayed.id).map(id => catalog.items[id].name);
  $('#result-panel').className = `result-panel ${status === 'won' ? 'victory' : 'defeat'}`;
  $('#result-panel').innerHTML = `${outcomeCrest}<div class="result-copy"><h2 id="result-heading" tabindex="-1">${status === 'won' ? 'VICTORY' : 'DEFEAT'}</h2><p>${status === 'won' ? `Recipe solved in ${state.guesses.length} ${state.guesses.length === 1 ? 'guess' : 'guesses'}.` : `No guesses remaining. The item was ${escape(displayed.name)}.`}${alternatives.length ? ` Also accepted: ${escape(alternatives.join(', '))}.` : ''}</p><button class="text-button result-inspect" id="review-result-button">View result ↗</button></div><div class="result-actions"><button class="secondary-button" id="share-button">Share result ↗</button><button class="gold-button" id="next-button">${mode === 'daily' ? 'Play unlimited' : 'Next recipe'} <span>→</span></button></div>`;
  $('#share-button').onclick = shareResult;
  $('#next-button').onclick = startNextRecipe;
  $('#review-result-button').onclick = showCompletedResult;
  setQuote(status === 'won' ? 'A fine purchase! You know your way around a shop.' : 'No refunds on guesses. But the next recipe is on me.');
}

function showCompletedResult() {
  if (!state || pendingMode || puzzleStatus(state) === 'playing') return;
  outcome.show({status:puzzleStatus(state), item:catalog.items[state.solvedBy || state.answerId], guesses:state.guesses.length, limit:MAX_GUESSES, mode});
}
async function startNextRecipe() {
  await startMode('unlimited', {newPuzzle:true});
  if (state && puzzleStatus(state) === 'playing') {
    setQuote('Another customer with excellent taste!');
    restoreSearchFocus();
  }
}

$('#guess-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!state || pendingMode || puzzleStatus(state) !== 'playing') return;
  if (!selectedId) {
    const exact = searchItems(catalog, $('#item-search').value, { exclude: state.guesses }).filter(item => normalizeSearch(item.name) === normalizeSearch($('#item-search').value));
    if (exact.length === 1) selectedId = exact[0].id;
  }
  if (!selectedId) return;
  dismissTouchKeyboard();
  try {
    state = makeGuess(state, selectedId, catalog); saveState(); cleanSearch(); render();
    keeper.react(puzzleStatus(state) === 'won' ? 'success' : 'miss');
    if (puzzleStatus(state) !== 'playing') showCompletedResult();
    if (puzzleStatus(state) === 'playing') {
      setQuote(['Not quite. Have another look at those components.', 'Close the purse, open the mind.', 'A good build starts with the right ingredients.'][(state.guesses.length - 1) % 3]);
      restoreSearchFocus();
      $('#form-message').textContent = 'Not that one. Use the coloured ingredients to try another build.';
    }
  } catch (error) { $('#form-message').textContent = error.message; }
});
$('#item-search').addEventListener('input', () => { selectedId = null; $('#form-message').textContent = ''; renderGrid(); $('#item-grid').scrollTop = 0; });
$('#item-search').addEventListener('keydown', event => {
  if (event.isComposing || !state || pendingMode) return;
  if (event.key === 'Enter' && !selectedId) {
    const exact = searchItems(catalog, $('#item-search').value, {exclude: state.guesses}).filter(item => normalizeSearch(item.name) === normalizeSearch($('#item-search').value));
    if (exact.length === 1) { event.preventDefault(); selectItem(exact[0].id); $('#guess-form').requestSubmit(); }
  }
  if (event.key === 'ArrowDown') { event.preventDefault(); $('#item-grid button')?.focus(); }
  if (event.key === 'Escape') { cleanSearch(); renderGrid(); }
});
for (const button of $$('.filter-tabs button')) button.addEventListener('click', () => { filter = button.dataset.filter; selectedId = null; $('#form-message').textContent = ''; dismissTouchKeyboard(); renderGrid(); $('#item-grid').scrollTop = 0; });
$('#daily-mode').onclick = () => startMode('daily');
$('#unlimited-mode').onclick = () => startMode('unlimited');
$('#hint-button').onclick = () => { if (!state || pendingMode || puzzleStatus(state) !== 'playing') return; state = useHint(state); saveState(); render(); };
function chatWithKeeper() { quoteIndex = (quoteIndex + 1) % quotes.length; setQuote(quotes[quoteIndex]); keeper.react('chat'); }
$('#quote-button').onclick = chatWithKeeper;
// Give button clicks a brief acknowledgement. Guessing has its own stronger reaction.
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button && !button.disabled && !['guess-button', 'quote-button'].includes(button.id)) keeper.react('chat');
});
document.addEventListener('keydown', event => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) && !$('dialog[open]') && state && !pendingMode && puzzleStatus(state) === 'playing') { event.preventDefault(); $('#item-search').focus(); }
});

function openModal(content) { dismissTouchKeyboard(); $('#modal-content').innerHTML = content; $('#modal').showModal(); }
$('.modal-close').onclick = () => $('#modal').close();
$('#modal').addEventListener('click', event => { if (event.target === $('#modal')) { const bounds = $('#modal').getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) $('#modal').close(); } });
$('#help-button').onclick = () => openModal(`<span class="eyebrow">WELCOME TO THE SHOP</span><h2>Find the secret recipe.</h2><ol><li>Pick a <strong>completed item or boots</strong>: search, select it, then <strong>buy your guess</strong>.</li><li>Its ingredients light up. <span class="green-text">Green: a direct ingredient.</span> <span class="orange-text">Orange: builds into, or is built from, an ingredient.</span> Grey: unrelated.</li><li>Find the secret item in six guesses. The gold arrow tells you to aim for a higher or lower total price.</li></ol><p>For example, a Long Sword <strong>inside your guessed recipe</strong> turns orange when the secret recipe needs Serrated Dirk. Ingredient order doesn’t matter.</p><p><strong>Daily:</strong> the same recipe for everyone, refreshed at 00:00 UTC.<br><strong>Unlimited:</strong> a fresh recipe whenever you want.</p><p>No intermediate, potion, or jungle-item guesses. Items with identical recipes and combine costs are all accepted. Progress stays in this browser.</p>`);
$('#stats-button').onclick = () => {
  const records = new Map();
  try { for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key.startsWith(storagePrefix + 'daily:')) { try { records.set(key, JSON.parse(localStorage.getItem(key))); } catch { /* Ignore a damaged individual record. */ } } } } catch { /* Storage may be blocked. */ }
  for (const [key, value] of memorySaves) if (key.startsWith('daily:')) { try { records.set(storagePrefix + key, JSON.parse(value)); } catch { /* Ignore a damaged individual record. */ } }
  const stats = dailyStats([...records.values()]);
  const max = Math.max(...stats.distribution, 1);
  openModal(`<span class="eyebrow">YOUR DAILY LEDGER</span><h2>A regular customer.</h2><div class="stat-grid"><div><strong>${stats.played}</strong><span>Played</span></div><div><strong>${stats.winRate}%</strong><span>Win rate</span></div><div><strong>${stats.currentStreak}</strong><span>Streak</span></div><div><strong>${stats.maxStreak}</strong><span>Best streak</span></div></div><span class="eyebrow">GUESS DISTRIBUTION</span><div class="distribution">${stats.distribution.map((count, i) => `<div><span>${i + 1}</span><span class="bar" style="width:${Math.max(6, count / max * 85)}%">${count}</span></div>`).join('')}</div><p>Daily results saved on this browser.</p>`);
};
$('#about-button').onclick = () => openModal(`<span class="eyebrow">STRAIGHT FROM THE SOURCE</span><h2>Fresh wares, familiar faces.</h2><p>Recipes and icons: <a href="https://developer.riotgames.com/docs/lol#data-dragon" target="_blank" rel="noreferrer">Riot Data Dragon</a>. Patch <strong>${escape(catalog?.version || '—')}</strong>, Summoner’s Rift shop items.</p><p>Unlimited checks Riot when you open the game. The published catalog refreshes every three hours. Daily recipes are fixed to their original patch so everyone gets the same puzzle.</p><p>Riot publishes Data Dragon manually, so new patches can take a little time to arrive.${refreshedAt ? ` Last live check: ${escape(refreshedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}.` : ''}</p><p>League characters and item artwork © Riot Games. Shopkeeper chatter is original flavour text. A fan project inspired by <a href="https://minecraftle.zachmanson.com/" target="_blank" rel="noreferrer">Minecraftle</a> and Wordle.</p><p><a href="https://github.com/bentrd/shopkeeperle" target="_blank" rel="noreferrer">Source code ↗</a></p>`);

function shareResult() {
  if (!state || pendingMode || puzzleStatus(state) === 'playing') return;
  try { sharing.open(buildShareModel({state, catalog, siteUrl:$('link[rel="canonical"]')?.href || base.href})); }
  catch { toast('Finish a recipe to share its result.'); }
}
function updateClock() {
  if (!state) return;
  if (mode === 'unlimited') { $('#reset-label').textContent = 'Unlimited stock. Come back as often as you like.'; return; }
  const seconds = Math.ceil(millisecondsUntilReset() / 1000);
  const time = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
  $('#reset-label').textContent = `New daily stock in ${time} · 00:00 UTC`;
}
async function refreshCatalog() {
  try {
    const versions = await getJSON(VERSIONS_URL, { remote: true });
    const version = versions[0];
    if (!/^\d+\.\d+\.\d+$/.test(version)) return;
    const raw = await getJSON(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`, { remote: true });
    const next = buildCatalog(raw, version);
    latestCatalog = next; refreshedAt = new Date();
    // An in-progress recipe keeps its patch. The next unlimited recipe uses fresh data.
    if (!pendingMode && state?.mode === 'unlimited' && state.guesses.length === 0 && catalog.version !== next.version) await startMode('unlimited', { newPuzzle: true });
  } catch { /* A bundled, validated catalog keeps the shop playable when Riot is unavailable. */ }
}
function showFatal() {
  $('#load-error').innerHTML = 'The shop couldn’t open. Check your connection and <button id="reload-button">try again</button>.';
  $('#load-error').hidden = false;
  $('#reload-button').onclick = () => location.reload();
}
async function init() {
  try {
    latestCatalog = await getJSON('data/catalog.json');
    await startMode(mode);
    refreshCatalog();
  } catch { showFatal(); }
}
setInterval(() => {
  updateClock();
  if (state?.mode === 'daily' && state.date !== utcDate() && !dailyUnavailable) startMode('daily');
}, 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (state?.mode === 'daily' && state.date !== utcDate()) startMode('daily');
    if (!refreshedAt || Date.now() - refreshedAt.getTime() > 3600000) refreshCatalog();
  }
});
init();

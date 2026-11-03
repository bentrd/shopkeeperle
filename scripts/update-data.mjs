#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildCatalog, VERSIONS_URL } from '../catalog.js';
import { dailyAnswerFromIds } from '../game.js';
export { buildCatalog, getPlayableIds, recipeKey, isShopItem, VERSIONS_URL } from '../catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');

/** Stable UTC-date selection; the saved manifest pins the original patch forever. */
export function dailyAnswer(date, answers) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !answers.length) throw new Error('Invalid daily selection input');
  // Share the browser fallback's selection rule; existing saved manifests stay untouched.
  return dailyAnswerFromIds(answers, date);
}

function contentOf(catalog) {
  const { checkedAt, ...content } = catalog;
  return JSON.stringify(content);
}

async function readJSON(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function fetchJSON(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Shopkeeperle/1.0 (Riot Data Dragon recipe game)' } });
      if (!response.ok) throw new Error(`${response.status} from ${url}`);
      return await response.json();
    } catch (error) { lastError = error; }
  }
  throw lastError;
}

export async function updateData({ now = new Date(), dataDirectory = DATA } = {}) {
  await mkdir(path.join(dataDirectory, 'patches'), { recursive: true });
  await mkdir(path.join(dataDirectory, 'daily'), { recursive: true });
  const versions = await fetchJSON(VERSIONS_URL);
  if (!Array.isArray(versions) || !/^\d+\.\d+\.\d+$/.test(versions[0])) throw new Error('Invalid versions response');
  const version = versions[0];
  const raw = await fetchJSON(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`);
  const catalog = buildCatalog(raw, version, now.toISOString());
  const previous = await readJSON(path.join(dataDirectory, 'catalog.json'));
  const changed = !previous || contentOf(previous) !== contentOf(catalog);
  // Leave checkedAt unchanged on a no-op, avoiding four meaningless commits each day.
  const current = changed ? catalog : previous;
  let snapshot = version;
  const original = await readJSON(path.join(dataDirectory, 'patches', `${version}.json`));
  if (original && contentOf(original) !== contentOf(current)) {
    snapshot += '-' + createHash('sha256').update(contentOf(current)).digest('hex').slice(0, 10);
  }
  const snapshotPath = path.join(dataDirectory, 'patches', `${snapshot}.json`);
  if (!await readJSON(snapshotPath)) await writeFile(snapshotPath, JSON.stringify(current) + '\n');
  if (changed) await writeFile(path.join(dataDirectory, 'catalog.json'), JSON.stringify(current) + '\n');
  const created = [];
  // Prepare tomorrow as well: a delayed GitHub cron must not change a puzzle at rollover.
  for (const offset of [0, 1]) {
    const date = new Date(now.getTime() + offset * 86400000).toISOString().slice(0, 10);
    const dailyPath = path.join(dataDirectory, 'daily', `${date}.json`);
    if (await readJSON(dailyPath)) continue;
    const daily = { schemaVersion: 1, date, version, snapshot, answerId: dailyAnswer(date, current.answers) };
    await writeFile(dailyPath, JSON.stringify(daily) + '\n');
    created.push(date);
  }
  return { version, recipes: current.answers.length, catalogChanged: changed, dailyCreated: created };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await updateData())); }
  catch (error) { console.error(`Data refresh failed: ${error.message}`); process.exitCode = 1; }
}

/** Browser- and Node-compatible normalization of Riot's public item catalog. */
export const VERSIONS_URL = 'https://ddragon.leagueoflegends.com/api/versions.json';

export function recipeKey(recipe, combine) {
  return [...recipe].sort((a, b) => Number(a) - Number(b)).join(',') + '|' + combine;
}

/** High-numbered entries are mode-specific variants, despite some map flags. */
export function isShopItem(id, item) {
  return /^\d{4}$/.test(id) && Number(id) < 10000 && item?.maps?.['11'] === true &&
    item.gold?.purchasable === true && item.inStore !== false && !item.hideFromAll &&
    !item.requiredChampion && !item.requiredAlly && typeof item.name === 'string' &&
    !!item.name.trim() && typeof item.image?.full === 'string';
}

const EXCLUDED_PLAY_TAGS = new Set(['Consumable', 'Trinket', 'Jungle', 'Lane']);

/** Recalculate eligibility even for old snapshots whose answers still contain components. */
export function getPlayableIds(catalog) {
  const items = catalog?.items || {};
  const entries = Object.entries(items).filter(([id, item]) =>
    /^\d+$/.test(id) && Number(id) < 10000 && item && item.purchasable !== false &&
    item.gold?.purchasable !== false && item.inStore !== false && !item.hideFromAll &&
    !item.requiredChampion && !item.requiredAlly && item.maps?.['11'] !== false);
  const available = new Set(entries.map(([id]) => id));
  const recipeOf = item => Array.isArray(item.recipe) ? item.recipe.map(String) : [];
  const excluded = item => item.consumed || item.consumeOnFull ||
    (item.tags || []).some(tag => EXCLUDED_PLAY_TAGS.has(tag));
  const paidRecipe = item => recipeOf(item).length > 0 && item.gold?.combine > 0 &&
    recipeOf(item).every(component => available.has(component));
  // Infer upgraded boots from their crafting ancestry as Riot occasionally omits the Boots tag.
  const boots = new Set(entries.filter(([id, item]) => id === '1001' || item.tags?.includes('Boots')).map(([id]) => id));
  for (let pass = 0; pass < entries.length; pass++) {
    let changed = false;
    for (const [id, item] of entries) {
      if (boots.has(id) || !recipeOf(item).some(component => boots.has(component))) continue;
      boots.add(id); changed = true;
    }
    if (!changed) break;
  }
  // Only real paid shop upgrades make an item intermediate. Free evolutions, Ornn variants,
  // unavailable items and mode-specific entries never disqualify their purchased parent.
  const hasPaidUpgrade = new Set();
  for (const [, item] of entries) {
    if (excluded(item) || !paidRecipe(item)) continue;
    for (const component of recipeOf(item)) hasPaidUpgrade.add(component);
  }
  return entries.filter(([id, item]) => !excluded(item) && item.gold?.total > 0 &&
    (boots.has(id) || paidRecipe(item) && !hasPaidUpgrade.has(id)))
    .map(([id]) => id).sort((a, b) => Number(a) - Number(b));
}

export function buildCatalog(raw, version, checkedAt = new Date().toISOString()) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version) ||
      !raw?.data || typeof raw.data !== 'object' || Array.isArray(raw.data) || raw.version !== version) {
    throw new Error('Item payload version does not match requested version');
  }
  const entries = Object.entries(raw.data).filter(([id, item]) => isShopItem(id, item));
  const items = Object.fromEntries(entries.map(([id, item]) => {
    const recipe = item.from ?? [];
    if (!Array.isArray(recipe) || recipe.length > 8 || recipe.some(component => typeof component !== 'string' || !/^\d{4}$/.test(component))) {
      throw new Error(`Invalid recipe in ${id}`);
    }
    if (![item.gold.total, item.gold.base].every(value => Number.isFinite(value) && value >= 0 && value <= 1000000)) {
      throw new Error(`Invalid price in ${id}`);
    }
    if (!/^\d+\.png$/.test(item.image.full) || item.name.length > 180 || /[\u0000-\u001f]/.test(item.name)) {
      throw new Error(`Invalid name or icon in ${id}`);
    }
    return [id, {
      id,
      name: item.name,
      recipe: [...recipe],
      gold: { total: item.gold.total, combine: item.gold.base },
      image: `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${item.image.full}`,
      tags: Array.isArray(item.tags) ? item.tags.filter(tag => typeof tag === 'string' && /^[A-Za-z]{1,50}$/.test(tag)) : [],
      ...(item.consumed ? { consumed: true } : {}),
      ...(item.consumeOnFull ? { consumeOnFull: true } : {}),
      recipeKey: recipeKey(recipe, item.gold.base),
    }];
  }));
  const answers = getPlayableIds({ items });
  if (answers.length < 50) throw new Error(`Refusing suspicious item pool: only ${answers.length} recipes`);
  for (const id of answers) {
    const item = items[id];
    if (item.recipe.some(component => !items[component])) throw new Error(`Missing component in ${id}`);
  }
  return {
    schemaVersion: 1,
    pool: 'completed-items-v1',
    version,
    checkedAt,
    source: `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`,
    items,
    answers,
  };
}

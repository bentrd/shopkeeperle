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

export function buildCatalog(raw, version, checkedAt = new Date().toISOString()) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version) ||
      !raw?.data || typeof raw.data !== 'object' || Array.isArray(raw.data) || raw.version !== version) {
    throw new Error('Item payload version does not match requested version');
  }
  const entries = Object.entries(raw.data).filter(([id, item]) => isShopItem(id, item));
  const allowed = new Set(entries.map(([id]) => id));
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
      recipeKey: recipeKey(recipe, item.gold.base),
    }];
  }));
  // Free quest evolutions, upgraded boots and transforms are not shop recipes.
  const answers = entries.filter(([, item]) => item.from?.length && item.gold.base > 0 &&
    item.from.every(id => allowed.has(id))).map(([id]) => id).sort((a, b) => Number(a) - Number(b));
  if (answers.length < 50) throw new Error(`Refusing suspicious item pool: only ${answers.length} recipes`);
  for (const id of answers) {
    const item = items[id];
    if (item.recipe.some(component => !items[component])) throw new Error(`Missing component in ${id}`);
  }
  return {
    schemaVersion: 1,
    version,
    checkedAt,
    source: `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`,
    items,
    answers,
  };
}

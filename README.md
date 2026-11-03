# Shopkeeperle

A small League of Legends item recipe guessing game. **[Play Shopkeeperle](https://bentrd.github.io/shopkeeperle/)**

Find the secret item in six guesses. Pick a **completed item or boots**, then inspect its ingredients: green means a direct ingredient of the secret recipe; orange means a subcomponent or upgrade in that ingredient’s crafting branch; grey means unrelated. Order doesn’t matter. For example, Long Sword inside a guessed recipe gives an orange clue toward a recipe that needs Serrated Dirk. A gold arrow helps narrow down the secret item’s total cost. Daily mode gives everyone the same UTC-day recipe. Unlimited mode keeps the shop open. Includes search, item filters, a first-letter hint, daily statistics, browser-local progress, and spoiler-free sharing. Identical recipes and combine costs are accepted as equivalent answers.

The supplied shopkeeper is a lightweight CSS puppet with visible breathing, a gentle sway, a head nod, and reactions to button clicks and guesses. Reduced-motion preferences disable movement. Wins and losses open a League-inspired VICTORY/DEFEAT reveal; a large status banner remains at the top after closing it or reloading. The item shop’s bottom grip expands the inventory by mouse, touch, or keyboard.

## Run locally

Node 24+ recommended. No package dependencies or Riot API key.

```sh
npm run dev
# http://127.0.0.1:4173
npm test
npm run build
```

`dist/` is a static site that works under a GitHub Pages repository path.

## Riot data and automatic updates

The official source is [Riot Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon):

- Versions: `https://ddragon.leagueoflegends.com/api/versions.json`
- Recipes: `https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/item.json` (`from` lists direct components; `gold.base` is combine cost).
- Icons: `https://ddragon.leagueoflegends.com/cdn/{version}/img/item/{image.full}`.

The browser checks Riot on opening and after returning to the tab following an hour away. Unlimited’s next recipe uses the latest successfully fetched catalog. A recipe already in progress keeps its original data. The bundled catalog is a fallback if Riot is unavailable. No account data or credentials are used.

[GitHub Actions](.github/workflows/pages.yml) checks every three hours, validates the catalog, commits new snapshots and daily manifests, tests, and deploys Pages. It runs on pushes and manual dispatch too. No-op catalog checks do not make commits. Actions schedules may be delayed by GitHub; GitHub can also disable scheduled workflows in public repositories after 60 days without repository activity. Normal daily manifest commits keep this repository active while the workflow runs. Failed refreshes fail the workflow and preserve the last good deployed build.

Guesses and secret answers use the same completed-item pool: purchasable, visible Summoner’s Rift equipment with a paid recipe and no further obtainable paid upgrade. Boots are the exception, including base Boots and their purchasable upgrades. Intermediate, starter, potion, consumable, trinket, and jungle items are excluded. Mode variants, champion-specific items, and unavailable upgrades are excluded too. Free transformations and Ornn variants do not make their purchased parent count as intermediate. All components remain internally available for clues, in their original quantities including repeats.

`data/daily/YYYY-MM-DD.json` pins the answer and immutable `data/patches/` snapshot. Today and tomorrow are prepared, covering ordinary cron delays across midnight. Existing daily manifests are never replaced, including after a patch or same-version correction. Missing daily data offers unlimited play instead of giving players different daily answers. Run `npm run update-data` to refresh manually.

Current eligibility is also applied to historical snapshots and saved games. An old daily target that no longer qualifies is deterministically replaced using that same pinned snapshot; valid daily targets remain unchanged. Saves containing excluded targets or guesses restart under the current rules.

“Up to date” means the latest **published Data Dragon** dataset. Riot explicitly notes this is a manual publication process and may lag a live game patch. A daily recipe can use yesterday’s patch by design, with its version shown in the UI.

## Publishing

The public repository is `bentrd/shopkeeperle`. Pages uses the GitHub Actions source. The workflow needs `contents: write`, `pages: write`, and `id-token: write`; no additional secrets are required.

## Credits

Inspired by [Minecraftle](https://minecraftle.zachmanson.com/) and Wordle. The principal merchant image was supplied by the project owner. See [asset provenance](assets/SOURCES.md). Merchant chatter is original flavour text rather than quoted game dialogue.

Shopkeeperle was created under Riot Games’ [“Legal Jibber Jabber” policy](https://www.riotgames.com/en/legal) using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.

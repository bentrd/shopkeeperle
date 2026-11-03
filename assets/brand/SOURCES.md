# Shopkeeperle brand assets

The shop-bag/coin crest, icon, and card composition are original native vector/Canvas UI graphics. Rebuild with `node scripts/generate-brand-assets.mjs`; requires `sharp` and `@napi-rs/canvas` (local packages or `BRAND_NODE_MODULES`). No browser or image-generation model is used.

- `icon.svg`: opaque square master; primary crest fits a central 80% safe circle. `logo-mark.svg` is the transparent crest.
- PNGs: 192, 512, and 1024 app icons; 180 Apple touch icon; 512 opaque maskable icon; 32 favicon. `favicon.ico` contains 16/32/48 PNG entries.
- `qr-code.svg` / `qr-code.png`: https://bentrd.github.io/shopkeeperle/; Q error correction, four-module quiet zone. The committed QR matrix was generated locally with Python qrcode and is the reproducible source.
- `fonts/Cinzel.ttf` and `fonts/DMSans.ttf`: official [Google Fonts repository](https://github.com/google/fonts); SIL Open Font License 1.1 included beside each font. Canvas family names: Shopkeeper Cinzel and Shopkeeper DM Sans.
- Card character: supplied `assets/shopkeeper-user.png`, drawn intact with preserved aspect ratio. League of Legends art © Riot Games.
- Card item icons: Riot Data Dragon 16.22.1, ids 1036, 1052, 1028, stored under `source/`; [Riot Data Dragon documentation](https://developer.riotgames.com/docs/lol#data-dragon).

The existing input files are reused, so subsequent runs work offline.

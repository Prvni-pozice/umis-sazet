# Umíš sázet? 🌱

Webová 3D voxel hra (Minecraft styl) — krajina Vysočiny. Zasaď 12 doubků,
pak je zalij vodou z rybníka. Měří se čas obou fází zvlášť, na týdenní
žebříček jde součet.

## Hra

1. **Kvíz** — před startem 1 náhodný tip o výsadbě dubů (jen edukativní,
   čas neovlivňuje). Pool 20 otázek v `src/quiz.js` (⚠ placeholder texty).
2. **Fáze 1 — sázení**: projdi všech 12 hnědých záhonů (průchod = zasadit,
   animace ruky se sazeničkou). Markery 🌱 ukazují nejbližších 8 záhonů.
3. **Fáze 2 — zalévání**: naber vodu dotykem vodní plochy (vědro = 5 dílků,
   ukazatel na pravém boku), průchodem přes sazenici ji zaliješ — vyroste
   v mladý dub. Markery 💧.
4. **Konec**: dva časy + součet; výsledek lze uložit na žebříček.

## Žebříček

- Do žebříčku jde **každý uložený výsledek** — žádné ověřování, stačí jméno.
- **Telefon je nepovinný** — jediná cesta, jak se ozvat výherci týdne.
  Nikde se nezobrazuje, v odpovědi API se nevrací.
- **Týdenní vyhodnocení** (ISO týden, Europe/Prague): první 3 každý týden
  něco vyhrají. Tie-break: při stejném čase je výš starší výsledek.
- Anti-cheat: server na startu kola vydá podepsaný token; POST ověří,
  že od vydání uplynul aspoň součet časů. Skóre počítá server.

## Stack

- Vite + Three.js (vanilla JS), WebAudio zvuky, procedurální textury.
- `src/world.js` — voxel krajina: kopce, smrky/duby, 2 rybníky, obilná pole,
  květnatá louka, 12 záhonů (SOIL bloky, `PLOT_COUNT`; layout se hledá
  opakovaně, dokud se nevejde celý).
- `src/planting.js` — sazenice, zalévání, růst. `src/hand.js` — FP ruka.
- `api/scores.js` — Vercel funkce; sdílená logika `api/_lib.js`;
  úložiště Vercel KV / Upstash (klíč `umis-sazet-store`).
- Lokální dev: stejné API ve `vite.config.js` middleware (store
  `data/scores.json`).
- Vercel Web Analytics: `@vercel/analytics` — ve vanilla buildu se volá
  `inject()` v `src/main.js` (ne React komponenta `<Analytics/>`).

## Vývoj

```bash
npm install
npm run dev     # http://<server>:5181
npm run build   # dist/
```

## Deploy (Vercel)

Běží na <https://hra-doubky.srdcemrozumem.cz/>.

1. Vercel projekt (preset Vite) napojený na GitHub repo — push do `master` = deploy.
2. Storage → Upstash Redis (env `KV_REST_API_URL/TOKEN` vzniknou samy).
3. Volitelně `SIGNING_SECRET` (jinak se anti-cheat token podepisuje KV tokenem).

## Placeholder assety

- Kvízové otázky (`src/quiz.js`) — texty doplní Zdeněk.
- Fotky zvířat (`public/assets/animals/`) z Wikimedia Commons —
  `python3 scripts/fetch_animal_photos.py` (srnka/zajíc/ježek/liška/veverka).

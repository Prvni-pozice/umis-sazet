# Umíš sázet? 🌱

Webová 3D voxel hra (Minecraft styl) — krajina Vysočiny. Zasaď 25 dubů,
pak je zalij vodou z rybníka. Měří se čas obou fází zvlášť, na týdenní
žebříček jde součet.

## Hra

1. **Kvíz** — před startem 1 náhodný tip o výsadbě dubů (jen edukativní,
   čas neovlivňuje). Pool 20 otázek v `src/quiz.js` (⚠ placeholder texty).
2. **Fáze 1 — sázení**: projdi všech 25 hnědých záhonů (průchod = zasadit,
   animace ruky se sazeničkou). Markery 🌱 ukazují nejbližších 8 záhonů.
3. **Fáze 2 — zalévání**: naber vodu dotykem vodní plochy (vědro = 5 dílků,
   ukazatel na pravém boku), průchodem přes sazenici ji zaliješ — vyroste
   v mladý dub. Markery 💧.
4. **Konec**: dva časy + součet; výsledek lze uložit na žebříček.

## Žebříček + ověření e-mailu

- **Oficiální žebříček** = hráči s ověřeným e-mailem (6místný kód mailem,
  ověření platí navždy). Bez e-mailu / před ověřením jde výsledek
  „mimo soutěž".
- **Týdenní vyhodnocení** (ISO týden, Europe/Prague): první 3 každý týden
  něco vyhrají. Tie-break: při stejném čase je výš starší výsledek.
- Anti-cheat: server na startu kola vydá podepsaný token; POST ověří,
  že od vydání uplynul aspoň součet časů. Skóre počítá server.
- E-mail se nikde nezobrazuje, slouží jen k ověření a kontaktu výherců.

## Stack

- Vite + Three.js (vanilla JS), WebAudio zvuky, procedurální textury.
- `src/world.js` — voxel krajina: kopce, smrky/duby, 2 rybníky, obilná pole,
  květnatá louka, 25 záhonů (SOIL bloky).
- `src/planting.js` — sazenice, zalévání, růst. `src/hand.js` — FP ruka.
- `api/scores.js`, `api/verify.js` — Vercel funkce; sdílená logika `api/_lib.js`;
  úložiště Vercel KV / Upstash (klíč `umis-sazet-store`).
- Lokální dev: stejné API ve `vite.config.js` middleware (store
  `data/scores.json`, ověřovací kód se místo SMTP loguje do konzole).

## Vývoj

```bash
npm install
npm run dev     # http://<server>:5181
npm run build   # dist/
```

## Deploy (Vercel)

1. Nový Vercel projekt (preset Vite) napojený na GitHub repo.
2. Storage → Upstash Redis (env `KV_REST_API_URL/TOKEN` vzniknou samy).
3. Env pro odesílání ověřovacích kódů (SMTP 1pmail.cz, **587 STARTTLS**):
   - `SMTP_USER` = podpora@prvni-pozice.com
   - `SMTP_PASS` = (heslo)
   - volitelně `SMTP_HOST` (default 1pmail.cz), `SMTP_PORT` (default 587),
     `SMTP_FROM`, `SIGNING_SECRET` (jinak se podepisuje KV tokenem)

## Placeholder assety

- Kvízové otázky (`src/quiz.js`) — texty doplní Zdeněk.
- Fotky zvířat (`public/assets/animals/`) z Wikimedia Commons —
  `python3 scripts/fetch_animal_photos.py` (srnka/zajíc/ježek/liška/veverka).

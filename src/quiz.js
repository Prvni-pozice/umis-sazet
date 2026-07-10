// quiz.js — edukativní tip před startem kola: 1 náhodná otázka z poolu,
// hráč tipne odpověď, uvidí správné řešení + vysvětlení, pak hra začne.
// Kvíz NEOVLIVŇUJE čas ani skóre.
//
// ⚠ PLACEHOLDER TEXTY — finální znění dodá Zdeněk / doplní se později.
// Témata: výsadba dubů na Vysočině.

export const QUIZ_POOL = [
  {
    q: 'Kdy je nejvhodnější doba pro výsadbu prostokořenných dubů?',
    options: ['Uprostřed léta', 'Podzim po opadu listí, nebo brzké jaro', 'Kdykoli během roku'],
    correct: 1,
    why: 'Sazenice je v klidu vegetace — kořeny se stihnou usadit před rašením.',
  },
  {
    q: 'Jak hluboká má být jamka pro sazenici dubu?',
    options: ['Tak akorát, aby kořenový krček zůstal v úrovni terénu', 'Co nejhlubší, aby strom pevně držel', 'Stačí kořeny přitlačit na povrch'],
    correct: 0,
    why: 'Zapuštěný krček uhnívá, mělká výsadba zase vysychá.',
  },
  {
    q: 'Kolik vody potřebuje čerstvě vysazený stromek při zálivce?',
    options: ['Skleničku', 'Cca 10 litrů, pomalu ke kořenům', 'Zálivka není potřeba, stačí déšť'],
    correct: 1,
    why: 'Vydatná pomalá zálivka usadí zeminu ke kořenům a podpoří ujmutí.',
  },
  {
    q: 'Proč se kolem čerstvé výsadby dává mulč?',
    options: ['Kvůli ozdobě', 'Drží vlhkost a brzdí plevel', 'Aby stromek rostl rovně'],
    correct: 1,
    why: 'Vrstva mulče (5–10 cm) výrazně snižuje výpar a konkurenci buřeně.',
  },
  {
    q: 'Co nejvíc ohrožuje mladé duby na Vysočině?',
    options: ['Okus zvěří', 'Přemíra slunce', 'Mráz v zimě'],
    correct: 0,
    why: 'Srnčí a jelení zvěř okusuje terminální pupeny — proto se sazenice chrání oplocenkami nebo tubusy.',
  },
  {
    q: 'Který dub je pro vlhčí stanoviště Vysočiny vhodnější?',
    options: ['Dub letní (křemelák)', 'Dub zimní (drnák)', 'Dub korkový'],
    correct: 0,
    why: 'Dub letní snáší vlhčí, hlubší půdy; dub zimní preferuje sušší svahy.',
  },
  {
    q: 'V jaké nadmořské výšce se Vysočina převážně nachází?',
    options: ['Do 200 m n. m.', 'Zhruba 400–700 m n. m.', 'Nad 1000 m n. m.'],
    correct: 1,
    why: 'Českomoravská vrchovina je krajina mírných kopců mezi ~400 a 800 m n. m.',
  },
  {
    q: 'Jaký spon (rozestup) se používá při výsadbě dubů v lese?',
    options: ['Cca 1 × 1 m', 'Cca 10 × 10 m', 'Sazenice těsně vedle sebe'],
    correct: 0,
    why: 'Hustší spon (1×1 až 1,5×1,5 m) nutí stromky růst rovně vzhůru za světlem.',
  },
  {
    q: 'K čemu slouží kůl u nově vysazeného stromu?',
    options: ['Na zavěšení cedulky', 'Stabilizuje stromek proti větru, než zakoření', 'Odhání ptáky'],
    correct: 1,
    why: 'Úvazek ke kůlu chrání kořenový bal před viklání — po 2–3 letech se odstraní.',
  },
  {
    q: 'Jak poznáš kvalitní sazenici dubu?',
    options: ['Má co nejvíc listů', 'Má bohatý, nepoškozený kořenový systém a rovný kmínek', 'Je co nejvyšší'],
    correct: 1,
    why: 'O ujmutí rozhodují kořeny — vysoká sazenice se slabými kořeny často uschne.',
  },
  {
    q: 'Kdy dub obvykle poprvé plodí žaludy?',
    options: ['Po 2–3 letech', 'Po 20–40 letech', 'Hned první rok'],
    correct: 1,
    why: 'Dub je dlouhověká dřevina — plodit začíná v dospělosti a dožívá se stovek let.',
  },
  {
    q: 'Proč se do smrkových porostů Vysočiny přisazují duby a buky?',
    options: ['Kvůli barvě na podzim', 'Smíšený les lépe odolává kůrovci, suchu a vichřicím', 'Aby bylo víc stínu'],
    correct: 1,
    why: 'Monokultury smrku plošně hynou — pestřejší les je stabilnější.',
  },
  {
    q: 'Jak často zalévat výsadbu v prvním (suchém) létě?',
    options: ['Každou hodinu po troškách', 'Cca 1× týdně vydatně', 'Vůbec'],
    correct: 1,
    why: 'Méně často, ale vydatně — voda pronikne hlouběji a kořeny rostou dolů za ní.',
  },
  {
    q: 'Co je to kořenový krček?',
    options: ['Nejtenčí kořínek', 'Přechod mezi kmínkem a kořeny', 'Vrchol stromku'],
    correct: 1,
    why: 'Při výsadbě musí zůstat přesně v úrovni terénu — je to nejcitlivější místo sazenice.',
  },
  {
    q: 'Jaká půda dubům na Vysočině nejvíc svědčí?',
    options: ['Hlubší hlinitá, mírně kyselá', 'Čistý písek', 'Zamokřená rašelina'],
    correct: 0,
    why: 'Dub kotví hlubokým kůlovým kořenem — potřebuje prokořenitelný profil.',
  },
  {
    q: 'Proč se žaludy před výsevem „školkují" přes zimu v chladu?',
    options: ['Aby nezplesnivěly na poličce', 'Semena dubu potřebují chladovou stratifikaci k naklíčení', 'Je to jen tradice'],
    correct: 1,
    why: 'Bez období chladu a vlhka žalud na jaře nevyklíčí.',
  },
  {
    q: 'Kolik procent lesů Vysočiny dnes tvoří jehličnany?',
    options: ['Asi čtvrtinu', 'Kolem tří čtvrtin', 'Skoro žádné'],
    correct: 1,
    why: 'Převažují smrkové porosty — proto je výsadba listnáčů (dubů) tak důležitá.',
  },
  {
    q: 'Co udělat se suchou trávou okolo sazenice?',
    options: ['Nechat ji být', 'Ožnout ji (vyžínání), aby sazenici nedusila', 'Zapálit ji'],
    correct: 1,
    why: 'Buřeň sazenici stíní, bere vodu a v zimě láká hlodavce — 2× ročně se vyžíná.',
  },
  {
    q: 'Jak dlouho se o novou výsadbu lesník stará, než „odroste"?',
    options: ['Rok', 'Zhruba 5–10 let', 'Vůbec se nestará'],
    correct: 1,
    why: 'Vyžínání, ochrana proti zvěři a vylepšování uhynulých kusů trvá roky.',
  },
  {
    q: 'Kterému zvířeti vděčí duby za přirozené šíření?',
    options: ['Sojce (zahrabává žaludy do země)', 'Kapru', 'Vlaštovce'],
    correct: 0,
    why: 'Sojky si dělají zásoby žaludů v zemi — na zapomenuté „skrýše" vyrostou nové duby.',
  },
]

/** Vrátí náhodnou otázku z poolu. */
export function randomQuestion() {
  return QUIZ_POOL[Math.floor(Math.random() * QUIZ_POOL.length)]
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/*
 * CB-10 — UN'ICONA CHE NON ESISTE NON SI LAMENTA CON NESSUNO.
 *
 * ⛔ Il difetto: `icon(id)` (legacy/app.js) costruiva `<use href="#id">` senza validare niente.
 *    Un riferimento irrisolto non è un errore per il browser: la SVG 2 dice «A 'use' that has an
 *    unresolved or invalid URL reference is not rendered. For the purpose of bounding box
 *    calculations, it is equivalent to an empty container element», e l'albero d'ombra viene creato
 *    solo «when the user agent successfully resolves a 'use' element»
 *    (W3C SVG 2, https://svgwg.org/svg2-draft/struct.html#UseElement, letto 08/09/2026).
 *    ⇒ niente eccezione, niente riga in console, niente test rosso: un vuoto grande quanto l'icona.
 *    Confermato anche lato pratica: «When the ID doesn't exist in the sprite, the browser simply
 *    doesn't render anything for that use element» (SVG Genie, «SVG Sprites in 2026: Modern
 *    Patterns, Build Pipelines, and Alternatives», letto 08/09/2026).
 *
 * ⛔ Perché non basta il controllo statico che già esiste (`sprite.test.mjs`): quello incrocia i nomi
 *    SCRITTI nel sorgente con lo sprite, e per quelli va benissimo — i ternari fra due literal
 *    compresi. Ma in TRE punti il nome arriva da una tabella di dati (`icon(ico)` nell'elenco delle
 *    capability, `iconaSvgAlbero(voce.icona)` nei due menu contestuali) e lì nessuna lettura del
 *    sorgente può decidere: resta solo un controllo che gira mentre l'icona viene costruita.
 *
 * ⇒ Queste prove mettono in moto il CODICE VERO, prelevato dal sorgente di `app.js`, contro uno
 *   sprite finto di cui si decide il contenuto. Non una copia della logica: la logica. Se qualcuno
 *   toglie la validazione, o rimette un nome inesistente, qui diventa rosso.
 *   E le prove si giocano anche AL CONTRARIO, perché un controllo che non sa fallire non è un
 *   controllo: è la lezione del cancello semantico, inerte per mesi senza che una prova se ne
 *   accorgesse, perché ognuna dimostrava soltanto che il caso LEGITTIMO passava.
 */

const radice = fileURLToPath(new URL('../../', import.meta.url));
const sorgenteApp = readFileSync(radice + 'src/legacy/app.js', 'utf8');
const template = readFileSync(radice + 'index.template.html', 'utf8');

/*
 * Le funzioni si prelevano dal sorgente per NOME e si fermano alla prima riga «  }»: le funzioni di
 * primo livello dell'IIFE sono rientrate di due spazi, quelle annidate di più, quindi il delimitatore
 * è univoco. Stessa tecnica di `tests/parity/veli-sani-morde.spec.mjs` — si prova il testo che gira
 * davvero, non un gemello che può divergere senza che nessuno se ne accorga.
 */
function corpoFunzione(nome) {
  const apre = sorgenteApp.indexOf(`\n  function ${nome}(`);
  assert.notEqual(apre, -1, `funzione «${nome}» sparita da app.js: la cura di CB-10 è stata smontata`);
  const chiude = sorgenteApp.indexOf('\n  }\n', apre);
  assert.notEqual(chiude, -1, `funzione «${nome}» senza chiusura riconoscibile`);
  return sorgenteApp.slice(apre + 1, chiude + 4);
}
function rigaCostante(nome) {
  const riga = new RegExp(`^  const ${nome} = .*$`, 'm').exec(sorgenteApp);
  assert.ok(riga, `costante «${nome}» sparita da app.js`);
  return riga[0];
}

const BLOCCO = [
  rigaCostante('SIMBOLO_RIPIEGO'),
  rigaCostante('ALIAS_SIMBOLI'),
  rigaCostante('registroIconeMorte'),
  corpoFunzione('simboloDisegnato'),
  corpoFunzione('risolviSimboloIcona'),
  corpoFunzione('registraIconaMorta'),
  corpoFunzione('icon'),
  corpoFunzione('iconaSvgAlbero'),
].join('\n');

/** Uno sprite finto: si decide esattamente quali simboli esistono, così ogni caso resta isolato. */
function documentoFinto(idSimboli) {
  const simboli = new Map(idSimboli.map((id) => [id, { tagName: 'symbol' }]));
  const elemento = (tag) => {
    const attributi = new Map();
    const nodo = {
      tagName: tag,
      figli: [],
      setAttribute: (k, v) => attributi.set(k, String(v)),
      getAttribute: (k) => (attributi.has(k) ? attributi.get(k) : null),
      append: (...n) => nodo.figli.push(...n),
    };
    return nodo;
  };
  return {
    getElementById: (id) => simboli.get(id) ?? null,
    querySelector: (sel) => (sel === 'symbol' ? (simboli.values().next().value ?? null) : null),
    createElementNS: (_ns, tag) => elemento(tag),
    // un id che esiste ma NON è un simbolo: un `<use>` verso di lui torna a essere un buco muto
    aggiungiNonSimbolo: (id) => simboli.set(id, { tagName: 'div' }),
  };
}

function moduloIcone(idSimboli) {
  const documento = documentoFinto(idSimboli);
  const detti = [];
  const consolle = { error: (m) => detti.push(String(m)) };
  const fabbrica = new Function('document', 'console', `${BLOCCO}\nreturn { risolviSimboloIcona, icon, iconaSvgAlbero, registroIconeMorte, SIMBOLO_RIPIEGO };`);
  return { ...fabbrica(documento, consolle), documento, detti };
}

const SPRITE = ['i-ignoto', 'i-doc', 'i-chev', 'i-folder', 'i-trash'];
/** L'href che `icon()` ha davvero scritto, o null se non ha scritto nessun `use`. */
const hrefDi = (html) => (/href="#([^"]*)"/.exec(html) ?? [null, null])[1];

// ───────────────────────────── 1 · da qui non esce un riferimento morto ─────────────────────────

test('CB-10 — un nome che lo sprite NON disegna non produce mai un riferimento morto', () => {
  const { icon, registroIconeMorte, detti } = moduloIcone(SPRITE);
  const html = icon('i-questo-non-esiste');
  assert.equal(hrefDi(html), 'i-ignoto', 'deve puntare al ripiego, mai al nome inesistente');
  assert.doesNotMatch(html, /#i-questo-non-esiste/u, 'il nome morto non deve sopravvivere nell’HTML');
  assert.equal(registroIconeMorte.get('i-questo-non-esiste'), 1, 'il buco si conta: serve a poter dire «zero» avendolo davvero guardato');
  assert.match(detti[0] ?? '', /i-questo-non-esiste/u, 'e si dice ad alta voce: era esattamente la riga che mancava');
});

test('CB-10 AL CONTRARIO — la versione VECCHIA di icon() fallisce questa stessa prova', () => {
  /*
   * ⛔ Senza questa, la prova sopra potrebbe passare per il motivo sbagliato. Qui c'è `icon()` com'era
   *    prima della cura: se l'asserzione «nessun riferimento morto» non la respingesse, non starebbe
   *    misurando niente.
   */
  const iconVecchia = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
  const html = iconVecchia('i-questo-non-esiste');
  assert.equal(hrefDi(html), 'i-questo-non-esiste');
  assert.throws(
    () => assert.equal(hrefDi(html), 'i-ignoto'),
    /i-questo-non-esiste/u,
    'se il codice vecchio passasse, questa suite non morderebbe',
  );
});

test('un nome che lo sprite disegna passa intatto — il ripiego non deve mangiarsi le icone buone', () => {
  const { icon, registroIconeMorte, detti } = moduloIcone(SPRITE);
  assert.equal(hrefDi(icon('i-trash')), 'i-trash');
  assert.equal(registroIconeMorte.size, 0, 'nessun falso allarme: un cancello che accusa a vuoto smette di essere letto');
  assert.deepEqual(detti, []);
});

test('la traduzione si consulta solo se il nome chiesto non c’è davvero', () => {
  const senzaFile = moduloIcone(SPRITE); // i-file assente, i-doc presente
  assert.equal(hrefDi(senzaFile.icon('i-file')), 'i-doc', 'tradotto: il nome del monolite verso quello del mockup');
  const conFile = moduloIcone([...SPRITE, 'i-file']);
  assert.equal(hrefDi(conFile.icon('i-file')), 'i-file', 'il giorno che lo sprite lo disegna, la traduzione si fa da parte da sola');
});

test('un id che esiste nella pagina ma NON è un simbolo non vale come simbolo', () => {
  const { icon, documento } = moduloIcone(SPRITE);
  documento.aggiungiNonSimbolo('i-finto');
  assert.equal(hrefDi(icon('i-finto')), 'i-ignoto', 'un `use` verso un non-simbolo è lo stesso buco con un altro nome');
});

test('un nome malformato non esce dall’attributo: niente markup iniettato', () => {
  const { icon, registroIconeMorte } = moduloIcone(SPRITE);
  const html = icon('"><img src=x onerror=alert(1)>');
  assert.doesNotMatch(html, /<img/u, 'il nome finisce in un innerHTML: se non è un identificatore, non entra');
  assert.equal(hrefDi(html), null, 'nessun `use`: meglio un guscio vuoto di un riferimento inventato');
  assert.equal(registroIconeMorte.size, 1, 'e resta registrato, non ingoiato');
  assert.equal(hrefDi(icon(null)), null);
  assert.equal(hrefDi(icon(undefined)), null);
});

test('sprite assente: «non lo so» non diventa «rotto»', () => {
  /*
   * ⛔ Senza sprite (banco di prova senza foglio, montaggio anticipato) non si può sapere se un nome
   *    sia buono. Coprire tutto di ripieghi qui vorrebbe dire cancellare icone sane per un dubbio
   *    nostro, e insegnare a diffidare del ripiego proprio dove serve che sia creduto.
   */
  const { icon, registroIconeMorte, detti } = moduloIcone([]);
  assert.equal(hrefDi(icon('i-trash')), 'i-trash');
  assert.equal(registroIconeMorte.size, 0);
  assert.deepEqual(detti, [], 'nessun allarme su ciò che non si è potuto guardare');
});

test('la stessa icona morta si dice UNA volta, ma si conta ogni volta', () => {
  const { icon, registroIconeMorte, detti } = moduloIcone(SPRITE);
  for (let i = 0; i < 5; i += 1) icon('i-manca');
  assert.equal(registroIconeMorte.get('i-manca'), 5, 'il conto è la misura');
  assert.equal(detti.length, 1, 'una riga a ogni ridisegno seppellirebbe la console e tornerebbe a essere silenzio');
});

// ───────────────────────── 2 · le DUE porte rispondono allo stesso modo ─────────────────────────

test('iconaSvgAlbero passa dallo stesso risolutore di icon() — non più due verdetti sullo stesso nome', () => {
  /*
   * ⛔ La tabella di traduzione viveva dentro `iconaSvgAlbero` e la consultava quella funzione sola:
   *    `icon()` passava i nomi grezzi. Una tabella che copre un chiamante su due nasconde dove non copre.
   */
  const { icon, iconaSvgAlbero, registroIconeMorte } = moduloIcone(SPRITE);
  const usoDi = (svg) => svg.figli.find((n) => n.tagName === 'use') ?? null;

  const buona = iconaSvgAlbero('i-trash');
  assert.equal(usoDi(buona).getAttribute('href'), '#i-trash');
  assert.equal(buona.getAttribute('class'), 'i');

  assert.equal(usoDi(iconaSvgAlbero('i-file')).getAttribute('href'), '#i-doc', 'stessa traduzione di icon()');
  assert.equal(usoDi(iconaSvgAlbero('i-manca-anche-qui')).getAttribute('href'), '#i-ignoto', 'stesso ripiego di icon()');

  for (const nome of ['i-trash', 'i-file', 'i-manca-anche-qui']) {
    assert.equal(hrefDi(icon(nome)), usoDi(iconaSvgAlbero(nome)).getAttribute('href').slice(1), `le due porte divergono su «${nome}»`);
  }
  assert.equal(registroIconeMorte.get('i-manca-anche-qui'), 3, 'ogni porta registra, nessuna ingoia');
});

test('nome vuoto: iconaSvgAlbero non inventa un `use` verso il nulla', () => {
  const { iconaSvgAlbero } = moduloIcone(SPRITE);
  assert.deepEqual(iconaSvgAlbero('').figli, [], 'guscio vuoto, non href="#"');
});

// ─────────────────────────── 3 · lo sprite vero e il codice vero ───────────────────────────

test('⛔ il simbolo di RIPIEGO esiste davvero nello sprite generato', () => {
  // Un ripiego che non c'è sarebbe il difetto di partenza col nome nuovo.
  assert.match(template, /<symbol id="i-ignoto"/u, 'i-ignoto assente dal template: rigenera dal mockup');
  const mockup = readFileSync(radice + 'mockup/talos-mockup.html', 'utf8');
  assert.match(mockup, /<symbol id="i-ignoto"/u, 'il mockup è la FONTE: se manca lì, la prossima rigenerazione lo cancella');
});

test('⛔ nessun nome «i-…» scritto in src/ resta senza simbolo — QUALUNQUE virgoletta', () => {
  /*
   * ⛔ Il controllo che già esiste (`sprite.test.mjs`) legge solo i literal fra APICI SINGOLI, e solo
   *    in `src/legacy/app.js` + `src/components/*.js`. Un `icon("i-x")`, un nome dentro un backtick o
   *    un file in un'altra sottocartella gli passano davanti senza essere visti. Un controllo che
   *    riconosce una sola FORMA di scrittura non protegge dal difetto: protegge da una sua sillaba.
   */
  const definiti = new Set([...template.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
  const sorgenti = [];
  (function scendi(dir) {
    for (const voce of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, voce.name);
      if (voce.isDirectory()) { if (!/node_modules|dist/u.test(p)) scendi(p); } else if (/\.(js|mjs)$/u.test(voce.name)) sorgenti.push(p);
    }
  }(radice + 'src'));
  const morti = new Map();
  for (const file of sorgenti) {
    readFileSync(file, 'utf8').split('\n').forEach((riga, i) => {
      for (const m of riga.matchAll(/["'`](i-[a-zA-Z0-9_-]+)["'`]/g)) {
        if (!definiti.has(m[1])) morti.set(m[1], `${path.relative(radice, file)}:${i + 1}`);
      }
    });
  }
  assert.deepEqual([...morti.entries()], [], 'nomi chiamati e mai disegnati');
  assert.ok(sorgenti.length >= 20, `solo ${sorgenti.length} sorgenti letti: se l’elenco crollasse, la prova sopra passerebbe per il motivo sbagliato`);
  assert.equal(definiti.has('i-questo-non-esiste-mai'), false, 'AL CONTRARIO: l’elenco dei definiti sa dire di no');
});

test('⛔ i punti in cui il nome viene da una TABELLA DI DATI esistono ancora — sono la ragione di questa suite', () => {
  /*
   * Non è un vezzo: dice a chi legge PERCHÉ non ci si può fermare al controllo statico. Sono le
   * chiamate il cui argomento nessuna lettura del sorgente può risolvere — contate e nominate una
   * per una, non riassunte in una soglia «almeno N» (una soglia resta verde anche quando il difetto
   * che doveva descrivere è cambiato sotto, ed è così che un controllo diventa decorazione).
   * ⛔ I commenti si tolgono prima di contare: questo file e `app.js` NOMINANO quelle chiamate per
   *    spiegarle, e contare le menzioni invece delle cose è già costato tre difetti in un giorno.
   */
  const senzaCommenti = sorgenteApp.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal((senzaCommenti.match(/iconaSvgAlbero\(voce\.icona\)/g) ?? []).length, 2, 'i due menu contestuali prendono il nome dell’icona da una voce di menu');
  assert.equal((senzaCommenti.match(/\bicon\(ico\)/g) ?? []).length, 1, 'l’elenco delle capability prende il nome dalla riga della tabella');
});

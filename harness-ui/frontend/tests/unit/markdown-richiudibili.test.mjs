import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderizzaMarkdown } from '../../src/components/markdown.js';
import testiChat from '../../src/i18n/testi/chat.js';
import { avanzaScansione, chiudiInArrivo, confineDiRivelazione, creaScansione } from '../../src/components/markdown-in-arrivo.js';

/*
 * 10/11/2026 (0.2.1) — IL BLOCCO RICHIUDIBILE IN CHAT. Owner, foto delle 13:40: il modello scrive
 * `<details><summary>Cosa è successo</summary> … </details>` e la chat lo mostrava come testo letterale.
 *
 * Cura: in chat (`opzioni.blocchiRichiudibili`) passano SOLO `<details>` (al massimo con `open`) e `<summary>`; ogni altro HTML
 * resta testo; dentro il blocco vale il Markdown del resto della risposta. `htmlFidato` non si accende.
 * ⛔ Ogni prova sta anche al contrario: ciò che NON deve diventare un blocco, ciò che deve restare testo o codice.
 * ⛔ I testi sono finti, scritti qui: nessuna conversazione vera è stata letta.
 */

/* Il DOM finto delle unit (stessa scelta di `markdown-recinti-e-citazioni.test.mjs`): registra anche `innerHTML`. */
function creaDocumentoFinto() {
  const htmlAssegnati = [];
  const creaNodo = (tag, tipo = 'elemento') => {
    const nodo = {
      tag,
      tipo,
      figli: [],
      attributi: new Map(),
      style: {},
      classe: '',
      testoProprio: null,
      get className() { return nodo.classe; },
      set className(v) { nodo.classe = String(v); },
      get textContent() { return nodo.testoProprio !== null ? nodo.testoProprio : nodo.figli.map((f) => f.textContent).join(''); },
      set textContent(v) { nodo.testoProprio = String(v); nodo.figli = []; },
      get innerHTML() { return ''; },
      set innerHTML(v) { htmlAssegnati.push(String(v)); },
      appendChild: (f) => { if (f.tipo === 'frammento') nodo.figli.push(...f.figli); else nodo.figli.push(f); return f; },
      append: (...f) => f.forEach((x) => nodo.appendChild(x)),
      setAttribute: (k, v) => nodo.attributi.set(k, String(v)),
      getAttribute: (k) => (nodo.attributi.has(k) ? nodo.attributi.get(k) : null),
    };
    return nodo;
  };
  return {
    htmlAssegnati,
    createElement: (tag) => creaNodo(tag),
    createTextNode: (t) => ({ tag: '#text', tipo: 'testo', figli: [], testo: String(t), get textContent() { return this.testo; } }),
    createDocumentFragment: () => creaNodo('#fragment', 'frammento'),
  };
}

/** L'albero in una riga: `tag.classe[attributo]{figli}`; il testo fra virgolette. Due alberi uguali danno la stessa riga. */
function forma(nodo) {
  if (nodo.tipo === 'testo') return JSON.stringify(nodo.testo);
  const attributi = [...nodo.attributi.keys()].sort().map((k) => `[${k}${nodo.attributi.get(k) ? `=${nodo.attributi.get(k)}` : ''}]`).join('');
  const dentro = nodo.testoProprio !== null ? JSON.stringify(nodo.testoProprio) : nodo.figli.map(forma).join('');
  const nome = nodo.tipo === 'frammento' ? '' : `${nodo.tag}${nodo.classe ? `.${nodo.classe}` : ''}${attributi}`;
  return nodo.tipo === 'frammento' ? dentro : `${nome}{${dentro}}`;
}
/** Il testo unito degli elementi senza figli: mette insieme i nodi di testo spezzati dal renderer (un `<` da solo, per esempio). */
function testoUnito(nodo) {
  if (nodo.tipo === 'testo') return nodo.testo;
  if (nodo.testoProprio !== null) return nodo.testoProprio;
  return nodo.figli.map(testoUnito).join('');
}
function tagUsati(nodo, trovati = new Set()) {
  if (nodo.tipo === 'elemento') trovati.add(nodo.tag);
  nodo.figli.forEach((f) => tagUsati(f, trovati));
  return trovati;
}

const CHAT = { blocchiRichiudibili: true, linkConversazione: true, linkWeb: true };
function rendi(testo, opzioni = CHAT) {
  const document = creaDocumentoFinto();
  const frammento = renderizzaMarkdown(testo, { document, ...opzioni });
  return { forma: forma(frammento), frammento, document };
}
const R = 'details.md-richiudibile';
const R_APERTO = 'details.md-richiudibile[open]';
const T = 'summary.md-richiudibile__titolo';
const C = 'div.md-richiudibile__corpo';

test('DET-01 — un blocco chiuso: titolo, corpo in Markdown, righe vuote dentro, e il testo dopo resta fuori', () => {
  const testo = '<details>\n<summary>Cosa è successo</summary>\n\nTesto **forte** e `codice`.\n\n- a\n- b\n\n</details>\nDopo';
  assert.equal(rendi(testo).forma,
    `${R}{${T}{"Cosa è successo"}${C}{p{"Testo "strong{"forte"}" e "code{"codice"}"."}ul{li{"a"}li{"b"}}}}p{"Dopo"}`);
  /* al contrario: senza l'opzione (note, libreria, scheda di ricerca) resta testo letterale, come prima */
  const senza = rendi(testo, {});
  assert.equal(tagUsati(senza.frammento).has('details'), false);
  assert.match(testoUnito(senza.frammento), /<details>/);
  assert.match(testoUnito(senza.frammento), /<summary>Cosa è successo<\/summary>/);
});

test('DET-02 — l\'attributo `open`, le maiuscole e la forma su una riga sola', () => {
  assert.equal(rendi('<details open>\n<summary>T</summary>\nCorpo\n</details>').forma, `${R_APERTO}{${T}{"T"}${C}{p{"Corpo"}}}`);
  assert.equal(rendi('<DETAILS OPEN>\n<SUMMARY>T</SUMMARY>\nCorpo\n</DETAILS>').forma, `${R_APERTO}{${T}{"T"}${C}{p{"Corpo"}}}`);
  assert.equal(rendi('<details><summary>T</summary>Corpo</details>').forma, `${R}{${T}{"T"}${C}{p{"Corpo"}}}`);
  /* il testo che segue la chiusura sulla stessa riga non si perde e sta fuori */
  assert.equal(rendi('<details><summary>T</summary>Corpo</details> coda\nancora').forma, `${R}{${T}{"T"}${C}{p{"Corpo"}}}p{"coda"br{}"ancora"}`);
  /* il titolo rende il Markdown in linea */
  assert.equal(rendi('<details>\n<summary>Il **punto** `x`</summary>\nCorpo\n</details>').forma, `${R}{${T}{"Il "strong{"punto"}" "code{"x"}}${C}{p{"Corpo"}}}`);
});

test('DET-03 — senza `<summary>` il titolo è il nostro, nella lingua della app, mai vuoto', () => {
  assert.equal(rendi('<details>\nCorpo\n</details>').forma, `${R}{${T}{"Dettagli"}${C}{p{"Corpo"}}}`);
  /* nella lingua della app: il dizionario ha la voce nelle due lingue */
  assert.equal(testiChat.it.detailsUntitled, 'Dettagli');
  assert.equal(testiChat.en.detailsUntitled, 'Details');
  /* un `<summary>` che non è la prima cosa del blocco non è un titolo: resta testo nel corpo */
  const tardi = rendi('<details>\nPrima\n<summary>tardi</summary>\n</details>');
  assert.deepEqual([...tagUsati(tardi.frammento)].sort(), ['br', 'details', 'div', 'p', 'summary']); // il summary è il titolo di serie
  assert.equal(tardi.forma.startsWith(`${R}{${T}{"Dettagli"}`), true);
  assert.match(testoUnito(tardi.frammento), /<summary>tardi<\/summary>/);
});

test('DET-04 — un blocco NON ancora chiuso non mangia niente: si disegna aperto, con tutto il testo arrivato dentro', () => {
  const aMeta = rendi('Prima.\n<details>\n<summary>Cosa è succ');
  assert.equal(aMeta.forma, `p{"Prima."}${R_APERTO}{${T}{"Cosa è succ"}${C}{}}`);
  const colCorpo = rendi('<details>\n<summary>Titolo</summary>\n\nPrimo paragrafo.\n\nSecondo par');
  assert.equal(colCorpo.forma, `${R_APERTO}{${T}{"Titolo"}${C}{p{"Primo paragrafo."}p{"Secondo par"}}}`);
  /* al contrario: appena arriva la chiusura il blocco è quello che ha scritto il modello (chiuso, senza `open`) */
  assert.equal(rendi('<details>\n<summary>Titolo</summary>\n\nPrimo paragrafo.\n\nSecondo par\n</details>').forma,
    `${R}{${T}{"Titolo"}${C}{p{"Primo paragrafo."}p{"Secondo par"}}}`);
});

test('DET-05 — blocchi annidati: ognuno chiude il suo, a qualunque rientro', () => {
  const testo = '<details>\n<summary>Fuori</summary>\nUno\n  <details>\n  <summary>Dentro</summary>\n  Due\n  </details>\nTre\n</details>\nQuattro';
  assert.equal(rendi(testo).forma,
    `${R}{${T}{"Fuori"}${C}{p{"Uno"}${R}{${T}{"Dentro"}${C}{p{"  Due"}}}p{"Tre"}}}p{"Quattro"}`);
  /* al contrario: la prima chiusura NON chiude il blocco di fuori (un annidamento piatto lascerebbe «Tre» fuori) */
  const interno = rendi('<details>\n<details>\nA\n</details>\nB\n</details>');
  assert.equal(interno.forma, `${R}{${T}{"Dettagli"}${C}{${R}{${T}{"Dettagli"}${C}{p{"A"}}}p{"B"}}}`);
  /* il tetto: 8 livelli diventano blocchi, i più interni restano testo; e 5000 aperture una dentro l'altra non rompono niente */
  const profondo = rendi(`${'<details>\n'.repeat(12)}fondo\n${'</details>\n'.repeat(12)}dopo`);
  assert.equal(profondo.forma.split('details.md-richiudibile').length - 1, 8);
  assert.equal(testoUnito(profondo.frammento).includes('<details>'), true);
  assert.equal(profondo.forma.endsWith('p{"dopo"}'), true);
  assert.doesNotThrow(() => rendi('<details>\n'.repeat(5000)));
});

test('DET-06 — sicurezza: passano solo details e summary; script, img, iframe, on*= e javascript: restano testo', () => {
  const cattivo = [
    '<details>',
    '<summary>Titolo <img src=x onerror=alert(1)></summary>',
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(2)>',
    '<iframe src="x.html"></iframe>',
    '<a href="javascript:alert(3)">clic</a>',
    '<div onclick="alert(4)">div</div> e <span style="color:red">span</span>',
    '[link](javascript:alert(5))',
    '</details>',
  ].join('\n');
  const { frammento, document } = rendi(cattivo);
  const usati = tagUsati(frammento);
  for (const vietato of ['script', 'img', 'iframe', 'span']) assert.equal(usati.has(vietato), false, vietato);
  assert.deepEqual([...usati].sort(), ['a', 'br', 'details', 'div', 'p', 'summary']); // `div` è il corpo del blocco, `a` il link senza indirizzo
  assert.deepEqual(document.htmlAssegnati, []); // mai innerHTML
  const testo = testoUnito(frammento);
  for (const pezzo of ['<script>alert(1)</script>', '<img src=x onerror=alert(2)>', '<iframe src="x.html"></iframe>',
    '<a href="javascript:alert(3)">clic</a>', '<div onclick="alert(4)">div</div>', '<span style="color:red">span</span>', '<img src=x onerror=alert(1)>']) {
    assert.ok(testo.includes(pezzo), `resta testo: ${pezzo}`);
  }
  /* nessun attributo oltre `open` arriva al DOM, e il link con lo schema vietato non ha indirizzo */
  const conAttributi = (n, trovati = []) => { if (n.tipo === 'elemento' && n.attributi.size) trovati.push([n.tag, [...n.attributi.keys()]]); n.figli.forEach((f) => conAttributi(f, trovati)); return trovati; };
  assert.deepEqual(conAttributi(frammento), []);
});

test('DET-07 — al contrario: un details con altri attributi, un summary fuori da un details e l\'altro HTML restano testo', () => {
  for (const testo of [
    '<details onclick="alert(1)">\n<summary>T</summary>\nx\n</details>',
    '<details class="x">\nx\n</details>',
    '<details open onclick=alert(1)>\nx\n</details>',
    '<details open="javascript:alert(1)">\nx\n</details>',
    '<summary>da solo</summary>',
    '<div>blocco</div>\n<span>riga</span>',
    'Testo con <details> in mezzo alla riga </details>',
    '<detailsx>\nx\n</detailsx>',
  ]) {
    const { frammento, document } = rendi(testo);
    assert.equal(tagUsati(frammento).has('details'), false, testo);
    assert.equal(tagUsati(frammento).has('summary'), false, testo);
    assert.equal(testoUnito(frammento).replace(/\s+/g, ''), testo.replace(/\s+/g, ''), testo);
    assert.deepEqual(document.htmlAssegnati, []);
  }
});

test('DET-08 — un details scritto DENTRO il codice resta codice: recinto, codice in riga, e recinto dentro un blocco', () => {
  /* dentro un recinto */
  const recinto = rendi('```html\n<details>\n<summary>T</summary>\nx\n</details>\n```');
  assert.equal(recinto.forma, 'pre.code-block-nudo{code.language-html{"<details>\\n<summary>T</summary>\\nx\\n</details>"}}');
  /* nel codice in riga */
  const inRiga = rendi('Scrivi `<details>` e `</details>` attorno al testo.');
  assert.equal(inRiga.forma, 'p{"Scrivi "code{"<details>"}" e "code{"</details>"}" attorno al testo."}');
  const inRigaInTesta = rendi('`<details>`\nresta codice');
  assert.equal(tagUsati(inRigaInTesta.frammento).has('details'), false);
  /* dentro un blocco aperto: un `</details>` nel recinto o nel codice in riga NON chiude il blocco */
  const dentro = rendi('<details>\n<summary>T</summary>\n```html\n</details>\n```\nChiudi con `</details>` qui.\n</details>\nFuori');
  assert.equal(dentro.forma,
    `${R}{${T}{"T"}${C}{pre.code-block-nudo{code.language-html{"</details>"}}p{"Chiudi con "code{"</details>"}" qui."}}}p{"Fuori"}`);
  /* e un `<details>` nel recinto dentro un blocco non apre un annidamento */
  const annidatoFinto = rendi('<details>\n```\n<details>\n```\nA\n</details>\nB');
  assert.equal(annidatoFinto.forma, `${R}{${T}{"Dettagli"}${C}{pre.code-block-nudo{code{"<details>"}}p{"A"}}}p{"B"}`);
});

test('DET-09 — dieci blocchi di fila nello stesso messaggio, con righe vuote dentro e fuori', () => {
  const blocco = (n) => `<details>\n<summary>Passo ${n}</summary>\n\nRiga ${n}a.\n\nRiga ${n}b.\n\n</details>`;
  const testo = Array.from({ length: 10 }, (_, n) => blocco(n + 1)).join('\n\n');
  const atteso = Array.from({ length: 10 }, (_, n) => `${R}{${T}{"Passo ${n + 1}"}${C}{p{"Riga ${n + 1}a."}p{"Riga ${n + 1}b."}}}`).join('');
  assert.equal(rendi(testo).forma, atteso);
  /* attaccati, senza righe vuote in mezzo */
  assert.equal(rendi(Array.from({ length: 10 }, (_, n) => blocco(n + 1)).join('\n')).forma, atteso);
});

test('DET-10 — il blocco interrompe paragrafo, elenco e citazione pigra, come un recinto', () => {
  assert.equal(rendi('Paragrafo\n<details>\nx\n</details>').forma, `p{"Paragrafo"}${R}{${T}{"Dettagli"}${C}{p{"x"}}}`);
  assert.equal(rendi('- voce\n  <details>\n  x\n  </details>').forma, `ul{li{"voce"}}${R}{${T}{"Dettagli"}${C}{p{"  x"}}}`);
  assert.equal(rendi('> citazione\n<details>\nx\n</details>').forma, `blockquote.md-quote{p{"citazione"}}${R}{${T}{"Dettagli"}${C}{p{"x"}}}`);
  /* al contrario: senza l'opzione l'elenco tiene la riga rientrata come seguito della voce, come prima */
  assert.equal(rendi('- voce\n  <details>', {}).forma, 'ul{li{"voce"br{}"<details>"}}');
});

const V = 'div.md-richiudibile md-richiudibile--vuoto';
const TV = 'div.md-richiudibile__titolo';

test('DET-16 — un blocco chiuso dal modello col corpo vuoto è una riga di titolo, niente da aprire (giudice v1328: 73 su 120)', () => {
  assert.equal(rendi('<details>\n<summary>Cosa ho fatto</summary>\n\n</details>').forma, `${V}{${TV}{"Cosa ho fatto"}}`);
  /* la forma misurata: tre di fila, poi testo; e uno pieno accanto resta il blocco di sempre */
  const tre = ['Uno', 'Due', 'Tre'].map((n) => `<details>\n<summary>${n}</summary>\n\n</details>`).join('\n');
  assert.equal(rendi(`${tre}\n\nTesto dopo.\n<details>\n<summary>Pieno</summary>\n\nx\n\n</details>`).forma,
    `${V}{${TV}{"Uno"}}${V}{${TV}{"Due"}}${V}{${TV}{"Tre"}}p{"Testo dopo."}${R}{${T}{"Pieno"}${C}{p{"x"}}}`);
  /* solo spazi e righe vuote contano come vuoto, anche con `open`, su una riga sola, e senza titolo (il nostro) */
  assert.equal(rendi('<details open>\n<summary>T</summary>\n   \n\t\n</details>').forma, `${V}{${TV}{"T"}}`);
  assert.equal(rendi('<details><summary>T</summary></details> coda').forma, `${V}{${TV}{"T"}}p{"coda"}`);
  assert.equal(rendi('<details>\n</details>').forma, `${V}{${TV}{"Dettagli"}}`);
  /* niente controllo: né details né summary, nessun attributo (niente fuoco, niente tasti) */
  const { frammento } = rendi('<details>\n<summary>T</summary>\n\n</details>');
  assert.equal(tagUsati(frammento).has('details'), false);
  assert.equal(tagUsati(frammento).has('summary'), false);
  const conAttributi = (n, trovati = []) => { if (n.tipo === 'elemento' && n.attributi.size) trovati.push(n.tag); n.figli.forEach((f) => conAttributi(f, trovati)); return trovati; };
  assert.deepEqual(conAttributi(frammento), []);
  /* al contrario: una riga piena basta per il blocco apribile; e mentre arriva (non ancora chiuso) resta il blocco aperto */
  assert.equal(rendi('<details>\n<summary>T</summary>\n.\n</details>').forma, `${R}{${T}{"T"}${C}{p{"."}}}`);
  assert.equal(rendi('<details>\n<summary>T</summary>\n\n').forma, `${R_APERTO}{${T}{"T"}${C}{}}`);
  /* al contrario: un corpo fatto solo di codice non è vuoto */
  assert.equal(rendi('<details>\n<summary>T</summary>\n```\n\n```\n</details>').forma.startsWith(`${R}{`), true);
});

/* ------------------------------------------------------------------ il testo che sta arrivando */

const scansiona = (testo, limite = testo.length) => {
  const s = creaScansione();
  const confine = avanzaScansione(s, testo, limite);
  return { confine, coda: testo.slice(confine, limite), dentroFence: s.dentroFence };
};

test('DET-11 — la trappola delle righe vuote: dentro un blocco aperto non si taglia, prima e dopo sì', () => {
  const aperto = 'Prima\n<details>\n<summary>T</summary>\n\nUno.\n\n## Titolo dentro\n---\nDue.\n';
  assert.equal(scansiona(aperto).coda, aperto.slice('Prima\n'.length)); // il taglio è PRIMA dell'apertura, e poi più nessuno
  const chiuso = `${aperto}</details>\nDopo`;
  assert.equal(scansiona(chiuso).coda, 'Dopo'); // dopo la chiusura il blocco è stabile
  /* annidati: la chiusura di quello dentro non riapre i tagli */
  assert.equal(scansiona('<details>\n<details>\n\nA\n</details>\n\nB\n').confine, 0);
  /* un recinto dentro il blocco: la scansione sa di essere nel codice, e un `</details>` lì dentro non chiude */
  const colRecinto = scansiona('<details>\n```\n</details>\n\n');
  assert.deepEqual({ confine: colRecinto.confine, dentroFence: colRecinto.dentroFence }, { confine: 0, dentroFence: true });
  /* al contrario: un details dentro un recinto è codice e non ferma i tagli che vengono dopo */
  assert.equal(scansiona('```\n<details>\n```\nUno.\n\nDue').coda, 'Due');
  /* al contrario: il codice in riga non apre niente */
  assert.equal(scansiona('`<details>`\n\nDue').coda, 'Due');
  /* al contrario: un details con altri attributi non è un blocco */
  assert.equal(scansiona('<details class="x">\n\nDue').coda, 'Due');
  /* la chiusura con del testo dietro non è un taglio (quel testo comincia un paragrafo che può continuare) */
  assert.equal(scansiona('<details>\nx\n</details> coda\nancora').confine, 0);
});

/* I testi finti della prova di equivalenza: per OGNI prefisso, stabile a pezzi + coda = tutto insieme. */
const TESTI_FINTI = [
  'Ecco.\n<details>\n<summary>Cosa è successo</summary>\n\nPrimo **punto**.\n\n- a\n- b\n\n```js\nconst x = 1;\n\n// </details>\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n</details>\n\nFine.',
  '<details open>\n<summary>Fuori</summary>\n\n<details>\n<summary>Dentro</summary>\n\nx\n\n</details>\n\ny\n\n</details>\n## Titolo\nz',
  '- voce\n  <details>\n\n  dentro\n\n  </details>\n- altra\n\n> citazione\n<details>\nq\n</details> coda\nancora\n\nultimo',
  'Testo\n```\n<details>\n\n```\n`<details>` in riga\n\n<details class="x">\n\nnon è un blocco\n\n</details>\n\nfine',
  '<details>\n<summary>Uno</summary>\n\nA\n\n</details>\n<details>\n<summary>Due</summary>\n\nB\n\n</details>\n\n<details>\nmai chiuso\n\nresto\n\n## titolo',
  /* la forma misurata dal giudice (v1328) nella chat dell'owner, coi soli numeri: tre blocchi col corpo vuoto di fila, poi testo */
  '<details>\n<summary>Primo passo</summary>\n\n</details>\n<details>\n<summary>Secondo passo</summary>\n\n</details>\n<details>\n<summary>Terzo passo</summary>\n\n</details>\n\nTesto dopo.\n<details>\n<summary>Pieno</summary>\n\nuna riga\n\n</details>',
];

test('DET-12 — a ogni prefisso i pezzi stabili più la coda danno lo STESSO albero del tutto-insieme (anche riaperto dal disco)', () => {
  for (const testo of TESTI_FINTI) {
    const s = creaScansione();
    const tagli = [0];
    for (let n = 1; n <= testo.length; n += 1) {
      const prefisso = testo.slice(0, n);
      const confine = avanzaScansione(s, prefisso, prefisso.length);
      if (confine > tagli[tagli.length - 1]) tagli.push(confine);
      const pezzi = tagli.slice(1).map((fine, i) => prefisso.slice(tagli[i], fine));
      const aPezzi = [...pezzi, prefisso.slice(tagli[tagli.length - 1])].map((p) => rendi(p).forma).join('');
      assert.equal(aPezzi, rendi(prefisso).forma, `prefisso di ${n} caratteri di ${JSON.stringify(testo.slice(0, 40))}`);
    }
    /* riaperto dal disco: una scansione nuova sul testo intero taglia negli stessi punti */
    const daCapo = creaScansione();
    assert.equal(avanzaScansione(daCapo, testo, testo.length), tagli[tagli.length - 1]);
  }
});

test('DET-13 — i tag non si vedono a metà: passano interi, e un tag che sta arrivando aspetta', () => {
  const testo = 'Ecco.\n<details>\n<summary>Titolo</summary>\ncorpo';
  const inizio = testo.indexOf('<details>');
  /* dentro `<details>`: salta alla fine del tag */
  assert.equal(confineDiRivelazione(testo, inizio + 3), inizio + '<details>'.length);
  /* dentro `<summary>`: salta alla fine del tag, poi il titolo va al ritmo */
  const s = testo.indexOf('<summary>');
  assert.equal(confineDiRivelazione(testo, s + 2), s + '<summary>'.length);
  assert.equal(confineDiRivelazione(testo, s + '<summary>Tit'.length), s + '<summary>Tit'.length);
  /* dentro `</summary>`: tutto il tag */
  const c = testo.indexOf('</summary>');
  assert.equal(confineDiRivelazione(testo, c + 1), c + '</summary>'.length);
  /* un tag che sta arrivando in fondo alla riga incompleta: si aspetta, niente `<deta` a schermo */
  for (const parziale of ['<', '<d', '<deta', '<details', '<details ope', '</', '</det', '<summ', '</summary']) {
    const t = `Ecco.\n${parziale}`;
    assert.equal(confineDiRivelazione(t, t.length), 'Ecco.\n'.length, parziale);
  }
  /* al contrario: un `<` che non può diventare uno dei due tag va al ritmo */
  for (const altro of ['a < b', '<div', '<x', 'se x <3', '<detx']) {
    const t = `Ecco.\n${altro}`;
    assert.equal(confineDiRivelazione(t, t.length), t.length, altro);
  }
  /* al contrario: dentro un recinto è codice e va al ritmo */
  const nelCodice = '```\n<deta';
  assert.equal(confineDiRivelazione(nelCodice, nelCodice.length, { dentroFence: true }), nelCodice.length);
  /* la coda in arrivo chiude i segni aperti anche nel titolo */
  assert.equal(chiudiInArrivo('<details>\n<summary>Cosa **è'), '<details>\n<summary>Cosa **è**');
});

test('DET-14 — il vestito: il foglio spedito veste il blocco e il suo fuoco, in chiaro e in scuro dagli stessi gettoni', () => {
  const qui = path.dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(path.join(qui, '../../src/styles/index.css'), 'utf8');
  assert.match(css, /\.md-richiudibile\{/);
  assert.match(css, /\.md-richiudibile__titolo\{[^}]*cursor:pointer/);
  assert.match(css, /\.md-richiudibile__titolo::-webkit-details-marker\{display:none\}/);
  assert.match(css, /\.md-richiudibile__titolo:focus-visible\{[^}]*outline/);
  assert.match(css, /\.md-richiudibile\[open\] > \.md-richiudibile__titolo::before\{[^}]*transform/);
  /* il blocco vuoto (DET-16): niente cursore a mano, niente freccia visibile (il posto resta, i titoli stanno in colonna) */
  assert.match(css, /\.md-richiudibile--vuoto > \.md-richiudibile__titolo\{cursor:auto\}/);
  assert.match(css, /\.md-richiudibile--vuoto > \.md-richiudibile__titolo::before\{visibility:hidden\}/);
  /* niente colori scritti a mano nelle regole del blocco: solo gettoni del tema */
  const regole = css.split('\n').filter((r) => r.includes('.md-richiudibile'));
  assert.ok(regole.length >= 6);
  for (const r of regole) assert.equal(/#[0-9a-fA-F]{3,8}\b|rgb\(/.test(r.replace(/\/\*.*?\*\//g, '')), false, r);
});

test('DET-15 — il filo nella app: acceso solo dalla chat, e l\'esportazione del ragionamento scrive ancora il suo details', () => {
  const qui = path.dirname(fileURLToPath(import.meta.url));
  const app = readFileSync(path.join(qui, '../../src/legacy/app.js'), 'utf8');
  /* una sola chiamata nel monolite accende il blocco, e solo per chi passa il blocco di codice della chat */
  assert.equal(app.split('blocchiRichiudibili').length - 1, 1);
  assert.match(app, /const inChat = bloccoCodice !== costruisciBloccoCodice;\s+return renderizzaMarkdown\(testoGrezzo, \{ document, bloccoCodice, linkConversazione: true, linkWeb: true, blocchiRichiudibili: inChat \}\);/);
  /* al contrario: `htmlFidato` in chat resta spento (lo accende solo la scheda del modello) */
  assert.equal(app.includes('htmlFidato'), false);
  /* l'esportazione del ragionamento è quella di prima, parola per parola */
  assert.equal(app.split("riempiPosto(`pensiero:${evento.messageId}`, [`<details><summary>${tr('app.transcript.reasoningSummary')}</summary>`, '', pensiero, '', '</details>', '']);").length - 1, 1);
  /* la conversazione figlia mostra lo stesso testo del modello: accesa anche lì */
  const figlia = readFileSync(path.join(qui, '../../src/components/conversazione-figlia.js'), 'utf8');
  assert.match(figlia, /renderizzaMarkdown\(testoGrezzo, \{ document: d, bloccoCodice: recinto, blocchiRichiudibili: true \}\)/);
});

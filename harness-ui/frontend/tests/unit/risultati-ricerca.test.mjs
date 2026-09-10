import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { leggiRisultatiRicerca, creaRisultatiRicerca } from '../../src/components/risultati-ricerca.js';

/*
 * ⛔⛔ La ricerca web, letta come si legge una ricerca.
 *
 * Owner 10/09, con Hermes aperto accanto a TALOS: «formatta molto meglio i comandi e la ricerca
 * web». Da noi il corpo mostrava il testo che riceve il MODELLO — `maxResults: 8`, `url:`,
 * `published: date unknown` — messo davanti a una persona.
 *
 * ⛔ Il testo di prova qui sotto è VERO, copiato da una sessione del 4174 (`7f5816ce`, 10/09): un
 *   finto inventato proverebbe il finto. È già successo tre volte in questo repo.
 */
const VERO = `8 results for "GLM 5.3 benchmark prestazioni".

1. GLM-5.3 Benchmarks & Speed (September 2026) | BenchLM.ai
   url: https://benchlm.ai/models/glm-5-3
   published: date unknown
   GLM-5.3 scores 68.4 out of 100 and ranks #24 of 231. This profile shows 25 source-displayable benchmark rows.
2. GLM-5.3: Il Nuovo Re del Coding Open e della Cybersecurity
   url: https://iamag.it/news/rilascio-glm-5-3-benchmark-coding-cyber
   published: 2026-09-02
   Il modello raggiunge risultati di rilievo nel coding.`;

function nodoFinto(tag) {
  const attributi = new Map();
  const nodo = {
    tag, figli: [], classi: new Set(), testoProprio: null, href: null, target: null, rel: null,
    get className() { return [...nodo.classi].join(' '); },
    set className(v) { nodo.classi = new Set(String(v).split(/\s+/).filter(Boolean)); },
    get textContent() { return nodo.testoProprio !== null ? nodo.testoProprio : nodo.figli.map((f) => f.textContent ?? '').join(' '); },
    set textContent(v) { nodo.testoProprio = String(v); nodo.figli = []; },
    setAttribute: (k, v) => attributi.set(k, String(v)),
    getAttribute: (k) => (attributi.has(k) ? attributi.get(k) : null),
    append: (...x) => nodo.figli.push(...x),
    tutti(classe, dentro = []) {
      if (nodo.classi.has(classe)) dentro.push(nodo);
      for (const f of nodo.figli) f.tutti?.(classe, dentro);
      return dentro;
    },
    tuttiTag(t, dentro = []) {
      if (nodo.tag === t) dentro.push(nodo);
      for (const f of nodo.figli) f.tuttiTag?.(t, dentro);
      return dentro;
    },
  };
  return nodo;
}
const documentoFinto = () => ({ createElement: (tag) => nodoFinto(tag) });

test('ricerca: dal testo del modello escono i risultati, con query e conteggio', () => {
  const letti = leggiRisultatiRicerca(VERO);
  assert.ok(letti, 'il formato deve essere riconosciuto');
  assert.equal(letti.quanti, 8);
  assert.equal(letti.query, 'GLM 5.3 benchmark prestazioni', 'senza virgolette né punto finale');
  assert.equal(letti.risultati.length, 2);
  assert.equal(letti.risultati[0].titolo, 'GLM-5.3 Benchmarks & Speed (September 2026) | BenchLM.ai');
  assert.equal(letti.risultati[0].url, 'https://benchlm.ai/models/glm-5-3');
  assert.match(letti.risultati[0].estratto, /scores 68\.4/);
});

/* ⛔ «date unknown» non è una data: è l'assenza di una data, e si dice non dicendola. */
test('ricerca: «date unknown» diventa nessuna data, una data vera resta', () => {
  const letti = leggiRisultatiRicerca(VERO);
  assert.equal(letti.risultati[0].quando, null);
  assert.equal(letti.risultati[1].quando, '2026-09-02');
});

test('ricerca: a schermo il titolo è il collegamento, e porta il dominio', () => {
  const blocco = creaRisultatiRicerca(leggiRisultatiRicerca(VERO), { document: documentoFinto() });
  assert.ok(blocco);
  const titoli = blocco.tutti('talos-ricerca-web__titolo');
  assert.equal(titoli.length, 2);
  assert.equal(titoli[0].tag, 'a', 'un risultato con URL è un collegamento');
  assert.equal(titoli[0].href, 'https://benchlm.ai/models/glm-5-3');
  /* ⛔ Una pagina esterna non deve poter toccare la finestra che l'ha aperta. */
  assert.equal(titoli[0].rel, 'noopener noreferrer');
  assert.equal(titoli[0].target, '_blank');
  const dove = blocco.tutti('talos-ricerca-web__dove');
  assert.equal(dove[0].textContent, 'benchlm.ai', 'il dominio, senza www e senza il resto dell’URL');
  assert.equal(dove[1].textContent, 'iamag.it · 2026-09-02', 'con la data quando c’è');
});

/* ⛔ AL CONTRARIO: se il formato non è quello, non si inventa un elenco. */
test('ricerca, AL CONTRARIO: un testo che non è una ricerca torna null', () => {
  for (const brutto of ['', '   ', null, undefined, 42, 'nessun risultato', 'search failed: DuckDuckGo non raggiungibile']) {
    assert.equal(leggiRisultatiRicerca(brutto), null, `atteso null per ${JSON.stringify(brutto)}`);
  }
  assert.equal(creaRisultatiRicerca(null, { document: documentoFinto() }), null);
  assert.equal(creaRisultatiRicerca({ risultati: [] }, { document: documentoFinto() }), null);
});

test('ricerca: un risultato senza URL non diventa un collegamento morto', () => {
  const letti = leggiRisultatiRicerca('2 results for "x".\n\n1. Titolo senza collegamento\n   Un estratto qualsiasi.');
  const blocco = creaRisultatiRicerca(letti, { document: documentoFinto() });
  const titolo = blocco.tutti('talos-ricerca-web__titolo')[0];
  assert.equal(titolo.tag, 'span', '⛔ un <a> senza href è un bottone che non fa niente');
  assert.equal(blocco.tutti('talos-ricerca-web__dove').length, 0);
});

test('ricerca: oltre il tetto si dichiara quanti restano fuori', () => {
  const righe = ['12 results for "molti".', ''];
  for (let i = 1; i <= 12; i += 1) righe.push(`${i}. Titolo ${i}`, `   url: https://esempio${i}.it/pagina`);
  const letti = leggiRisultatiRicerca(righe.join('\n'));
  assert.equal(letti.risultati.length, 12);
  const blocco = creaRisultatiRicerca(letti, { document: documentoFinto(), tetto: 5 });
  assert.equal(blocco.tutti('talos-ricerca-web__titolo').length, 5);
  const resto = blocco.tutti('talos-ricerca-web__resto')[0];
  assert.ok(resto, 'il taglio si dichiara');
  assert.match(resto.textContent, /Altri 7 risultati/);
});

test('ricerca: le classi hanno una regola, e l’estratto è limitato a tre righe come in Hermes', () => {
  const qui = path.dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(path.join(qui, '../../src/styles/diff-in-chat.css'), 'utf8');
  for (const classe of ['talos-ricerca-web', 'talos-ricerca-web__voce', 'talos-ricerca-web__titolo', 'talos-ricerca-web__dove', 'talos-ricerca-web__estratto', 'talos-ricerca-web__resto']) {
    assert.ok(css.includes(`.${classe}`), `manca la regola per .${classe}`);
  }
  assert.ok(css.includes('-webkit-line-clamp:3'), 'tre righe di estratto, come il line-clamp-3 di Hermes');
  assert.ok(css.includes('.talos-ricerca-web__titolo:focus-visible'), 'il collegamento deve vedersi anche da tastiera');
});

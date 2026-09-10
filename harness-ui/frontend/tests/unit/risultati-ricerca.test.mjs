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
    /* ⛔ Il vero li ha: `apriModaleFonti` aggancia il clic su «Chiudi» e sul velo, e `remove()`
       toglie la modale. Un finto senza queste tre esplode dove il vero funziona. */
    addEventListener: (t, m) => nodo.ascolti.push({ t, m }),
    remove: () => { nodo.rimosso = true; },
    focus: () => { nodo.fuoco = true; },
    ascolti: [],
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

/*
 * ⛔ La pillola delle fonti — presa dal mobile (`TalosMobileSourcesChip.vue`), non inventata.
 * Owner 10/09: «il mobile fa già le pilline delle fonti molto bene, non dobbiamo inventare nulla».
 */
test('fonti: la pillola porta fino a tre marchi, poi il +N', async () => {
  const { creaPillolaFonti } = await import('../../src/components/risultati-ricerca.js');
  const righe = ['5 results for "x".', ''];
  for (const d of ['uno.it', 'due.com', 'tre.org', 'quattro.net', 'cinque.dev']) {
    righe.push(`${righe.length}. Titolo di ${d}`, `   url: https://www.${d}/pagina`);
  }
  const pillola = creaPillolaFonti(leggiRisultatiRicerca(righe.join('\n')), { document: documentoFinto() });
  assert.ok(pillola);
  assert.equal(pillola.tag, 'button');
  assert.equal(pillola.getAttribute('aria-label'), '5 fonti web');
  const marchi = pillola.tutti('talos-fonti__marchio');
  assert.equal(marchi.length, 4, 'tre marchi più il contatore, come nel mobile');
  /* La lettera è quella del dominio SENZA www: «U» di uno.it, non «W» di www. */
  assert.deepEqual(marchi.slice(0, 3).map((m) => m.textContent), ['U', 'D', 'T']);
  assert.equal(marchi[3].textContent, '+2');
});

test('fonti, AL CONTRARIO: senza URL non c’è nessuna pillola', async () => {
  const { creaPillolaFonti } = await import('../../src/components/risultati-ricerca.js');
  assert.equal(creaPillolaFonti(null, { document: documentoFinto() }), null);
  assert.equal(creaPillolaFonti({ risultati: [] }, { document: documentoFinto() }), null);
  const senzaUrl = leggiRisultatiRicerca('1 results for "x".\n\n1. Solo un titolo');
  assert.equal(creaPillolaFonti(senzaUrl, { document: documentoFinto() }), null, '⛔ una fonte che non si apre non è una fonte');
});

test('fonti: la pillola ha una regola di stile, e i marchi si sovrappongono come nel mobile', () => {
  const qui = path.dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(path.join(qui, '../../src/styles/diff-in-chat.css'), 'utf8');
  for (const classe of ['talos-fonti', 'talos-fonti__marchi', 'talos-fonti__marchio']) {
    assert.ok(css.includes(`.${classe}`), `manca la regola per .${classe}`);
  }
  assert.match(css, /\.talos-fonti__marchio\{[^}]*margin-left:-6px/, 'i marchi si sovrappongono, come il -space-x del mobile');
  assert.ok(css.includes('.talos-fonti:focus-visible'), 'un bottone deve vedersi anche da tastiera');
});

/*
 * ⛔ La modale delle fonti — owner 10/09: «bisogna aprire una modalina delle fonti come sul mobile
 * che ti danno i siti e i link esatti». Nel mobile ogni riga porta marchio, titolo, dominio, data
 * (o la sua assenza dichiarata) e l'URL per intero.
 */
function documentoConBody() {
  const body = nodoFinto('body');
  const ascolti = [];
  return {
    body,
    createElement: (tag) => nodoFinto(tag),
    createTextNode: (t) => ({ tag: '#text', textContent: String(t), figli: [], tutti: () => [], tuttiTag: () => [] }),
    addEventListener: (t, m) => ascolti.push({ t, m }),
    removeEventListener: () => {},
  };
}

test('fonti: la modale elenca titolo, dominio e URL ESATTO di ogni fonte', async () => {
  const { apriModaleFonti } = await import('../../src/components/risultati-ricerca.js');
  const doc = documentoConBody();
  const velo = apriModaleFonti(leggiRisultatiRicerca(VERO), { document: doc });
  assert.ok(velo, 'la modale si apre');
  assert.equal(velo.getAttribute('role'), 'dialog');
  assert.equal(velo.getAttribute('aria-modal'), 'true');
  const titoli = velo.tutti('talos-fonti-elenco__titolo');
  assert.equal(titoli.length, 2);
  assert.equal(titoli[0].href, 'https://benchlm.ai/models/glm-5-3');
  assert.equal(titoli[0].rel, 'noopener noreferrer');
  const url = velo.tutti('talos-fonti-elenco__url');
  assert.equal(url[0].textContent, 'https://benchlm.ai/models/glm-5-3', '⛔ l’URL per INTERO: è ciò che l’owner ha chiesto per nome');
  const dove = velo.tutti('talos-fonti-elenco__dove');
  assert.equal(dove[0].textContent, 'benchlm.ai · data non dichiarata', 'una pagina senza data lo DICE, non lascia un vuoto');
  assert.equal(dove[1].textContent, 'iamag.it · 2026-09-02');
});

test('fonti, AL CONTRARIO: senza fonti apribili la modale non si apre', async () => {
  const { apriModaleFonti } = await import('../../src/components/risultati-ricerca.js');
  assert.equal(apriModaleFonti(null, { document: documentoConBody() }), null);
  assert.equal(apriModaleFonti({ risultati: [{ titolo: 'x', url: null }] }, { document: documentoConBody() }), null);
});

test('fonti: la modale ha le sue regole di stile, e l’URL va a capo invece di essere troncato', () => {
  const qui = path.dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(path.join(qui, '../../src/styles/diff-in-chat.css'), 'utf8');
  for (const classe of ['talos-fonti-elenco', 'talos-fonti-elenco__voce', 'talos-fonti-elenco__titolo', 'talos-fonti-elenco__url']) {
    assert.ok(css.includes(`.${classe}`), `manca la regola per .${classe}`);
  }
  assert.match(css, /\.talos-fonti-elenco__url\{[^}]*overflow-wrap:anywhere/, 'troncarlo lo renderebbe di nuovo incompleto');
});

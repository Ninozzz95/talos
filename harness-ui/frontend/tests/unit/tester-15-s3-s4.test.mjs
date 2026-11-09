import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { documento } from './aiuto-dom-blocchi.mjs';

/*
 * Tester sul 4174, 04/11/2026 20:15 (candidata c45b49fbb), voce 15 ROSSA e le sorelle S3/S4
 * (`BRIEF-TESTER-ROSSO-15-S3-S4-2026-11-04.md`). Scritte rosse sulla candidata, prima della cura.
 */
const leggi = (percorso) => readFileSync(new URL(percorso, import.meta.url), 'utf8');
const RIFIUTO = { ok: false, error: { code: 'AUTH_REQUIRED', message: 'This server only accepts the TALOS window that started it' } };
const attesa = () => new Promise((f) => setTimeout(f, 5));
const fasce = (document) => document.body.childNodes.filter((n) => n.className === 'talos-accesso-perso').length;

function rispostaVera(status, corpo) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}

/*
 * T15 — il percorso VERO delle Note e della Bacheca: `apiGet` → `apiCentrale()` → `createApiClient` (`services/api-client.ts`),
 * che prende `globalThis.fetch` la prima volta che viene chiamato. Sulla candidata la prima chiamata è `rileggiStatoDelPiano()`
 * (`legacy/app.js:3179`), PRIMA di `sorvegliaAccesso()` (`legacy/app.js:3201`): il client teneva la fetch nuda e i 401 delle pagine
 * non passavano mai dalla sorveglianza. Qui si riproduce l'ordine di avvio del bundle: prima il modulo che `main.js` importa per
 * primo, poi un modulo che cattura `fetch` al caricamento, poi il client centrale creato «presto».
 */
test('T15 — un client che ha preso fetch all\'avvio (come il client centrale di Note e Bacheca) accende la fascia al 401 della finestra', async () => {
  const vecchiaFinestra = globalThis.window;
  const vecchiaFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  const document = documento();
  const finestra = { document, location: { href: 'http://127.0.0.1:4391/', origin: 'http://127.0.0.1:4391', reload() {} } };
  let corrente = () => rispostaVera(200, { ok: true, data: { note: [] } });
  finestra.fetch = async () => corrente();
  globalThis.window = finestra;
  // nel browser `window` È `globalThis`: chi legge `globalThis.fetch` vede ciò che la sorveglianza scrive su `window.fetch`
  Object.defineProperty(globalThis, 'fetch', { configurable: true, get: () => finestra.fetch });
  try {
    await import('../../src/accesso-perso-subito.js'); // il primo modulo del bundle (l'ordine lo controlla T15b)
    const catturata = globalThis.fetch; // un modulo che cattura fetch al caricamento
    const { createApiClient } = await import('../../src/services/api-client.ts');
    const centrale = createApiClient({ resolvePath: (p) => p });
    await centrale.get('/api/v1/me/notes');
    await attesa();
    assert.equal(fasce(document), 0, 'una risposta buona non accende niente');
    corrente = () => rispostaVera(401, RIFIUTO); // un'altra finestra entra: il cookie di questa non vale più
    await assert.rejects(() => centrale.get('/api/v1/me/notes'), (e) => e.code === 'AUTH_REQUIRED', 'la pagina riceve il suo errore, intatto');
    await attesa();
    assert.equal(fasce(document), 1, 'la lettura delle Note fallita accende la fascia');
    await catturata('/api/v1/sessions');
    await attesa();
    assert.equal(fasce(document), 1, 'una sola fascia, anche dalla fetch catturata al caricamento');
  } finally {
    globalThis.window = vecchiaFinestra;
    Object.defineProperty(globalThis, 'fetch', vecchiaFetch);
  }
});

test('T15b — la sorveglianza è il PRIMO import del bundle, e nel monolite parte prima di ogni lettura', () => {
  const main = leggi('../../src/main.js');
  const primoImport = /^import\s+(?:[^;]*?\s+from\s+)?['"]([^'"]+)['"];?/mu.exec(main)?.[1];
  assert.equal(primoImport, './accesso-perso-subito.js', 'il primo modulo valutato installa la sorveglianza');
  const app = leggi('../../src/legacy/app.js');
  const iife = app.indexOf('\n(() => {');
  const chiamata = app.indexOf('sorvegliaAccesso(', iife);
  assert.ok(iife > 0 && chiamata > iife, 'la chiamata sta dentro il corpo del monolite');
  const primaLettura = app.indexOf('\n  rileggiStatoDelPiano();', iife);
  assert.ok(primaLettura > 0, 'la prima lettura d\'avvio esiste ancora (se cambia nome, la prova va aggiornata)');
  assert.ok(chiamata < primaLettura, 'la sorveglianza parte prima della prima lettura d\'avvio');
});

/*
 * S4 (Tester 04/11 20:15, foto `15-dopo-fetch-diretto-scuro.png`): la fascia, fissa a 72 px dal bordo, copriva il titolo della
 * Bacheca. Deve stare nel flusso, in testa alla colonna centrale, e spingere giù la pagina.
 */
test('S4-15 — la fascia nasce in testa alla colonna centrale e lì non è fissa', async () => {
  const { sorvegliaAccesso } = await import('../../src/components/accesso-perso.js');
  const document = documento();
  const colonna = document.createElement('main');
  const pagina = document.createElement('section');
  colonna.append(pagina);
  colonna.prepend = (n) => { colonna.append(n); colonna.childNodes.unshift(colonna.childNodes.pop()); };
  document.body.append(colonna);
  document.getElementById = (id) => (id === 'centro' ? colonna : null);
  const finestra = { document, location: { href: 'http://127.0.0.1:4391/', origin: 'http://127.0.0.1:4391', reload() {} } };
  finestra.fetch = async () => rispostaVera(401, RIFIUTO);
  sorvegliaAccesso({ finestra });
  await finestra.fetch('/api/v1/board');
  await attesa();
  assert.equal(colonna.childNodes[0]?.className, 'talos-accesso-perso', 'prima della pagina, dentro la colonna');
  assert.equal(colonna.childNodes[1], pagina, 'la pagina resta, sotto');
  const css = leggi('../../src/styles/accesso-perso.css');
  const regola = /#centro\s*>\s*\.talos-accesso-perso\s*\{([^}]*)\}/u.exec(css)?.[1] ?? '';
  assert.match(regola, /position:\s*static/u, 'nel flusso: spinge, non copre');
  assert.match(regola, /transform:\s*none/u);
});

/*
 * S3 (Tester 04/11 20:15, voce 21, foto `21-lab-prima-della-ricarica-scuro.png`): passando dal vivo da inglese a italiano il
 * Laboratorio restava mezzo in inglese («Model for new chats», «RAM budget · demo scenario», «Downloads», «System», «Distinguish
 * what is measured…») fino alla ricarica. Il guscio (`lab-cornice-v3.js`) scriveva le sue scritte una volta sola, al montaggio.
 */
function domConAggiunte() {
  const document = documento();
  const proto = Object.getPrototypeOf(document.body);
  const posto = (n) => n.parentNode.childNodes.indexOf(n);
  const inserisci = (n, figli, dove) => { for (const f of figli) { if (f.parentNode) f.remove(); f.parentNode = n.parentNode; n.parentNode.childNodes.splice(dove(), 0, f); } };
  proto.before ??= function before(...figli) { inserisci(this, figli, () => posto(this)); };
  proto.after ??= function after(...figli) { let i = posto(this) + 1; inserisci(this, figli, () => i++); };
  proto.prepend ??= function prepend(...figli) { const resto = this.childNodes.splice(0); for (const f of resto) f.parentNode = null; this.append(...figli, ...resto); };
  proto.closest ??= function closest(sel) { for (let n = this; n && n.matches; n = n.parentNode) if (n.matches(sel)) return n; return null; };
  proto.contains ??= function contains(x) { for (let n = x; n; n = n.parentNode) if (n === this) return true; return false; };
  document.documentElement = new EventTarget();
  return document;
}

test('S3-21 — il Laboratorio riscrive le sue scritte al cambio di lingua dal vivo, senza ricarica', async () => {
  const lingua = await import('../../src/components/lingua.js');
  const { AREE } = await import('../../src/i18n/testi/index.js');
  const vecchioMO = globalThis.MutationObserver;
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  lingua.impostaLingua('en');
  try {
    const { montaGuscioLaboratorio } = await import('../../src/components/lab-cornice-v3.js');
    const document = domConAggiunte();
    const card = document.createElement('section');
    const lista = document.createElement('div');
    lista.setAttribute('role', 'tablist');
    card.append(lista);
    for (const id of ['overview', 'huggingface', 'installed', 'providers', 'catalog', 'downloads']) {
      const tab = document.createElement('button'); tab.dataset.modelLabTab = id; lista.append(tab);
      const pannello = document.createElement('div'); pannello.dataset.modelLabPanel = id; card.append(pannello);
    }
    document.body.append(card);
    assert.equal(montaGuscioLaboratorio(card), true, 'il guscio si monta');
    const it = AREE.modelli.it;
    const en = AREE.modelli.en;
    const tutto = () => card.textContent;
    for (const k of ['lab.newChatModel', 'lab.freeRam', 'lab.downloadTab', 'lab.systemTab', 'lab.systemNote']) assert.ok(tutto().includes(en[k]), `inglese all'avvio: ${k}`);
    lingua.impostaLingua('it');
    document.documentElement.dispatchEvent(new Event(lingua.EVENTO_LINGUA));
    for (const k of ['lab.newChatModel', 'lab.freeRam', 'lab.downloadTab', 'lab.systemTab', 'lab.systemNote', 'lab.systemHeading', 'lab.cloudApproval']) {
      assert.ok(tutto().includes(it[k]), `italiano dopo il cambio: ${k} = «${it[k]}»`);
      if (it[k] !== en[k]) assert.ok(!tutto().includes(en[k]), `niente inglese rimasto: ${k} = «${en[k]}»`);
    }
    assert.equal(card.querySelector('[data-lab-banda]').getAttribute('aria-label'), it['lab.configurationLabel']);
    // decisione 163: la banda dice la RAM libera MISURATA; senza misura «RAM libera» e un trattino, nella lingua nuova
    assert.equal(card.querySelector('[data-lab-banda-sopra-ram]').textContent, it['lab.freeRam'], 'la scritta sopra la RAM della banda');
    assert.equal(card.querySelector('[data-lab-banda-unita]').textContent, '', 'senza misura nessuna unità inventata');
  } finally {
    lingua.impostaLingua('it');
    globalThis.MutationObserver = vecchioMO;
  }
});

test('S3-21b — la card «Memoria e spazio sul disco» del Laboratorio riscrive le etichette fisse nella lingua nuova', async () => {
  const lingua = await import('../../src/components/lingua.js');
  const { AREE } = await import('../../src/i18n/testi/index.js');
  const vecchioDoc = globalThis.document;
  const document = domConAggiunte();
  Object.defineProperty(Object.getPrototypeOf(document.body), 'previousElementSibling', { configurable: true, get() {
    const fratelli = this.parentNode?.children ?? []; return fratelli[fratelli.indexOf(this) - 1] ?? null;
  } });
  globalThis.document = document;
  lingua.impostaLingua('en');
  try {
    const { creaMisuraMemoria, aggiornaMisuraMemoria } = await import('../../src/components/misura-memoria.js');
    const card = creaMisuraMemoria();
    const en = AREE.modelli.en;
    const it = AREE.modelli.it;
    for (const k of ['memory.heading', 'memory.totalRam', 'memory.notice']) assert.ok(card.textContent.includes(en[k]), `inglese all'avvio: ${k}`);
    lingua.impostaLingua('it');
    aggiornaMisuraMemoria(card, card.__talosMemoria ?? {}); // ciò che fa `aggiornaPannelloMemoria` al cambio di lingua
    // «Rimisura» no: il DOM finto non distingue `[data-memory-action=unload]` (senza virgolette) e scrive sul primo bottone; lo dice la foto
    for (const k of ['memory.heading', 'memory.totalRam', 'memory.diskAvailable', 'memory.notice']) {
      assert.ok(card.textContent.includes(it[k]), `italiano dopo il cambio: ${k} = «${it[k]}» in «${card.textContent}»`);
      if (it[k] !== en[k]) assert.ok(!card.textContent.includes(en[k]), `niente inglese rimasto: ${k}`);
    }
  } finally {
    lingua.impostaLingua('it');
    globalThis.document = vecchioDoc;
  }
});

/*
 * Revisione del blocco interfaccia (05/11/2026 sera, difetto basso del pezzo 2, mutante M14 sopravvissuto): S3-21b lasciava fuori
 * «Rimisura» perché il DOM finto prende `[data-memory-action=unload]` (senza virgolette) per il primo bottone con l'attributo.
 * Qui, per questa prova sola, il DOM finto legge i valori senza virgolette come il browser (CSS Selectors 4: un valore che è un
 * identificatore può stare senza virgolette), e il bottone «Rimisura» si legge da solo, nei due versi.
 */
test('S3-21c — al cambio di lingua dal vivo anche il bottone «Rimisura» della card Memoria passa alla lingua nuova', async () => {
  const lingua = await import('../../src/components/lingua.js');
  const { AREE } = await import('../../src/i18n/testi/index.js');
  const vecchioDoc = globalThis.document;
  const document = domConAggiunte();
  const proto = Object.getPrototypeOf(document.body);
  Object.defineProperty(proto, 'previousElementSibling', { configurable: true, get() {
    const fratelli = this.parentNode?.children ?? []; return fratelli[fratelli.indexOf(this) - 1] ?? null;
  } });
  const vecchioQSA = proto.querySelectorAll;
  const haProprio = Object.hasOwn(proto, 'querySelectorAll');
  proto.querySelectorAll = function querySelectorAll(sel) { return vecchioQSA.call(this, String(sel).replace(/\[([\w-]+)=([\w-]+)\]/gu, '[$1="$2"]')); };
  globalThis.document = document;
  lingua.impostaLingua('en');
  try {
    const { creaMisuraMemoria, aggiornaMisuraMemoria } = await import('../../src/components/misura-memoria.js');
    const card = creaMisuraMemoria();
    const en = AREE.modelli.en['memory.remeasure'];
    const it = AREE.modelli.it['memory.remeasure'];
    assert.notEqual(it, en, 'le due lingue dicono parole diverse, o la prova non distingue niente');
    const rimisura = () => card.querySelector('[data-memory-action="refresh"]');
    assert.equal(rimisura().textContent, en, 'in inglese all’avvio');
    assert.equal(card.querySelector('[data-memory-action="unload"]').textContent, AREE.modelli.en['memory.unloadModel'], 'il DOM finto ora distingue i due bottoni');
    lingua.impostaLingua('it');
    aggiornaMisuraMemoria(card, card.__talosMemoria ?? {}); // ciò che fa `aggiornaPannelloMemoria` al cambio di lingua
    assert.equal(rimisura().textContent, it, `italiano dopo il cambio: «${it}»`);
    lingua.impostaLingua('en');
    aggiornaMisuraMemoria(card, card.__talosMemoria ?? {});
    assert.equal(rimisura().textContent, en, 'verso contrario: e di nuovo in inglese');
  } finally {
    if (haProprio) proto.querySelectorAll = vecchioQSA; else delete proto.querySelectorAll;
    lingua.impostaLingua('it');
    globalThis.document = vecchioDoc;
  }
});

test("S4-7 — nel Laboratorio → Sistema l'unità della RAM libera è quella della banda (decisione 163: «GB»), con la spaziatura normale", async () => {
  const css = leggi('../../src/styles/sistema-schede.css');
  const regola = /#modelLabOverviewPanel \.system-value small\s*\{([^}]*)\}/u.exec(css)?.[1] ?? '';
  assert.match(regola, /letter-spacing:\s*0\s*;/u, "senza, l'unità eredita -.06em dal numero e si stringe");
  const memoria = leggi('../../src/components/misura-memoria.js');
  assert.ok(memoria.includes("set('[data-memory-unit]',eroeLeggibile?' '+eroeLeggibile.unita:'');"), "l'unità dell'eroe viene da misuraLeggibile");
  assert.ok(leggi('../../src/components/lab-cornice-v3.js').includes("scrivi(banda.querySelector('[data-lab-banda-unita]'), leggibile ? leggibile.unita : '');"),
    "la banda prende l'unità dalla stessa funzione: una sola unità a schermo");
  const { misuraLeggibile } = await import('../../src/components/misura-memoria.js');
  assert.equal(misuraLeggibile(12 * 2 ** 30).unita, 'GB', 'il formato del telefono: «GB», non «GiB»');
  assert.equal(misuraLeggibile(512 * 2 ** 20).unita, 'MB');
});

/* S4-4b decaduta: decisione 260 (owner 05/11 19:20), vale la 177 (la cornice su Memoria, Note, Automazioni e Libreria). */

test('S4-4d — strumento: il turno del Tester (comando, scrittura dopo la carta, rilettura) — ogni segmento conta tutti i suoi tipi di passo', async () => {
  const lingua = await import('../../src/components/lingua.js');
  lingua.impostaLingua('it');
  const { riassuntoVoci } = await import('../../src/components/attivita-segmento.js');
  const { specieAttrezzo } = await import('../../src/components/nomi-attrezzi.js');
  const attrezzo = (nome, percorso, stato = 'riuscito', operazione) => ({ tipo: 'tool', nome, stato, specie: specieAttrezzo(nome, operazione), argomenti: { percorso } });
  const pensiero = { tipo: 'reasoning', stato: 'concluso', durataMs: 2000 };
  // la sequenza delle foto `4-carta-1` e `5-grassetto` (04/11 20:08): ogni carta del consenso chiude il segmento (`legacy/app.js`, `chiudiSegmentoAttivo`)
  const segmenti = [
    [pensiero, attrezzo('leggi', 'note-ux.txt', 'fallito'), attrezzo('shell')], // prima della carta del comando
    [pensiero, attrezzo('scrivi', 'note-ux.txt', 'riuscito', 'add')],             // prima della carta della scrittura, dopo il «Consenti»
    [pensiero, attrezzo('leggi', 'note-ux.txt')],                                 // la rilettura di verifica: «1 file letto · 1 ragionamento»
  ];
  const testi = segmenti.map((voci) => [...riassuntoVoci(voci).parti, ...riassuntoVoci(voci).erroriParti].join(' · '));
  assert.match(testi[0], /comando/u, testi[0]);
  assert.match(testi[0], /lettur|lett/u, testi[0]);
  assert.match(testi[1], /creat|scritt/u, testi[1]);
  assert.match(testi[2], /^1 file letto · 1 ragionamento/u, testi[2]);
  // un segmento con TUTTI i tipi insieme li dice tutti: il conteggio non salta specie
  const tutto = riassuntoVoci([pensiero, attrezzo('shell'), attrezzo('scrivi', 'a.txt', 'riuscito', 'add'), attrezzo('leggi', 'a.txt')]).parti.join(' · ');
  for (const parola of [/comando/u, /creat/u, /letto/u, /ragionamento/u]) assert.match(tutto, parola, tutto);
});

test("D200 — una sola serie per il rischio: «Nuova sessione» dice quella del foglio Permessi; «Consigliato» è la pillola d'accento del modo di serie", async () => {
  const lingua = await import('../../src/components/lingua.js');
  const { AREE } = await import('../../src/i18n/testi/index.js');
  const { POLITICHE, pillolePolitica, pillolePoliticaHtml } = await import('../../src/components/politiche.js');
  try {
    for (const lin of ['en', 'it']) {
      lingua.impostaLingua(lin);
      const m = AREE.modello[lin];
      const rischio = [[m['permissions.lowRisk'], 'success'], [m['permissions.mediumRisk'], 'warning'], [m['permissions.mediumRisk'], 'warning'], [m['permissions.veryHighRisk'], 'danger']];
      assert.deepEqual(POLITICHE.map((p) => pillolePolitica(p.valore)[0]), rischio.map(([testo, tono]) => ({ testo, tono })), `la serie del foglio Permessi: ${lin}`);
      assert.deepEqual(POLITICHE.map((p) => pillolePolitica(p.valore).filter((x) => x.tono === 'accent').map((x) => x.testo)),
        [[], [m['permissions.recommended']], [], []], "solo il modo di serie è «Consigliato», come pillola d'accento");
      assert.deepEqual(pillolePolitica('Qualcosa altro'), [], 'un valore che non è dei nostri non ha pillole');
      assert.ok(pillolePoliticaHtml('Workspace write').includes(m['permissions.recommended']), 'la versione HTML porta la stessa serie');
    }
    const html = leggi('../../index.template.html');
    for (const [valore, chiave] of [['Read only', 'lowRisk'], ['Workspace write', 'mediumRisk'], ['On request', 'mediumRisk'], ['Full access', 'veryHighRisk']]) {
      assert.match(html, new RegExp(`data-permission-choice="${valore}">.*?data-t="modello\\.permissions\\.${chiave}"`, 'u'), `il foglio Permessi è la serie di riferimento: ${valore}`);
    }
    const app = leggi('../../src/legacy/app.js');
    assert.ok(app.includes('<small class="workspace-chooser-permission__rischio">${pillolePoliticaHtml(permission)}</small>'), '«Nuova sessione» scrive le pillole della serie unica');
    assert.ok(app.includes('${pillolePoliticaHtml(p.valore)}'), 'il foglio del monolite pure');
    for (const lin of ['en', 'it']) for (const k of ['readOnly', 'workspaceWrite', 'onRequest', 'fullAccess']) {
      assert.equal(AREE.varie[lin][`policy.${k}.note`], undefined, `la vecchia serie non resta nel dizionario: ${lin} ${k}`);
    }
  } finally { lingua.impostaLingua('it'); }
});

test('S4-6 — «Nuova sessione» a 125%: la fila delle cartelle e la colonna di Accesso dicono quando c\'è altro (sfumatura sul lato tagliato)', async () => {
  const { strisciaScorrevole } = await import('../../src/components/inspector.js');
  assert.equal(typeof strisciaScorrevole, 'function', 'la striscia che scorre dell\'app si presta alla «Nuova sessione»');
  const osservati = [];
  const finestra = { ResizeObserver: class { constructor(f) { this.f = f; } observe(n) { osservati.push(n); } } };
  const elemento = (misure) => {
    const ascolti = {};
    const conta = { n: 0 };
    return { ...misure, dataset: {}, children: [], ownerDocument: { defaultView: finestra }, addEventListener(tipo, f) { ascolti[tipo] = f; conta.n += 1; }, ascolti, conta };
  };
  // la fila: 8 carte in 1500 px, si vede la prima parte → «dopo»
  const fila = elemento({ scrollLeft: 0, clientWidth: 1500, scrollWidth: 1900 });
  strisciaScorrevole(fila);
  assert.equal(fila.dataset.taglio, 'dopo');
  fila.scrollLeft = 400; fila.ascolti.scroll();
  assert.equal(fila.dataset.taglio, 'prima');
  // le carte cambiano (dischi C: e D: aggiunti dopo): si rimisura senza un secondo ascoltatore
  fila.scrollWidth = 2300; assert.equal(strisciaScorrevole(fila), fila); assert.equal(fila.dataset.taglio, 'entrambi');
  assert.equal(fila.conta.n, 2, 'la seconda chiamata non aggiunge ascoltatori (scroll e rotella, una volta sola)');
  assert.equal(osservati.filter((n) => n === fila).length, 1, 'né un secondo osservatore');
  // la colonna di destra, sull'asse verticale: Accesso sotto la piega → «dopo»
  const colonna = elemento({ scrollTop: 0, clientHeight: 600, scrollHeight: 900 });
  strisciaScorrevole(colonna, { asse: 'y' });
  assert.equal(colonna.dataset.taglio, 'dopo');
  assert.equal(colonna.ascolti.wheel, undefined, 'in verticale la rotella resta del browser');
  colonna.scrollTop = 300; colonna.ascolti.scroll();
  assert.equal(colonna.dataset.taglio, 'prima');
  const app = leggi('../../src/legacy/app.js');
  assert.match(app, /strisciaScorrevole\(shortcuts\)/u, 'la fila delle cartelle');
  assert.match(app, /strisciaScorrevole\(right, \{ asse: 'y' \}\)/u, 'la colonna «Come lavoriamo»');
  const css = leggi('../../src/styles/foglio-monolite.css');
  for (const [classe, taglio] of [['workspace-chooser-shortcuts', 'dopo'], ['workspace-chooser-shortcuts', 'prima'], ['workspace-chooser-shortcuts', 'entrambi'], ['workspace-chooser-settings', 'dopo'], ['workspace-chooser-settings', 'prima'], ['workspace-chooser-settings', 'entrambi']]) {
    assert.match(css, new RegExp(`\\.${classe}\\[data-taglio=${taglio}\\]\\{[^}]*mask-image:linear-gradient`, 'u'), `${classe} ${taglio}`);
  }
});

test('S4-4a — il nome leggibile del modello: il pulsante del selettore e le righe della barra dopo il catalogo', () => {
  const app = leggi('../../src/legacy/app.js');
  assert.ok(!app.includes('triggerLabel.textContent = valoreScelto || etichettaVuota;'), 'l\'id grezzo nel pulsante');
  assert.ok(app.includes('triggerLabel.textContent = valoreScelto ? (voce?.nome || nomeModelloUmano(valoreScelto) || valoreScelto) : etichettaVuota;'), 'il nome del catalogo, poi quello umano dell\'id');
  assert.match(app, /function aggiornaInUso\(\) \{\s*aggiornaTriggerLabel\(\);/u, 'arrivato il catalogo il pulsante si riscrive');
  assert.match(app, /if \(registraNomiDelCatalogo\(coppie\)\) \{[^}]*aggiornaElencoSessioniReali\(\)/u, 'nomi nuovi ⇒ si ridisegnano anche le righe della barra');
});

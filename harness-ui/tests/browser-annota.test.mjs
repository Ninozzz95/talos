import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sorgenteOverlay, installaOverlay, togliOverlay, descriviElemento, raccogliErrori,
  pacchettoVuoto, CAMPI_PACCHETTO, selettoreStabile, pezzoSelettore, tagliaHtml, testoRemoto,
  ATTRIBUTI_STABILI, ATTRIBUTI_DEBOLI, MASSIMO_HTML, MONDO_OVERLAY,
} from '../src/browser-annota.mjs';

/*
 * M4 (07/09/2026) — l'annotazione dentro il browser pilotato via CDP.
 * Ogni prova ha la sua META AL CONTRARIO: non basta che il controllo trovi il difetto, deve anche
 * NON trovarlo dove non c'è. Un cancello che non ha mai respinto niente non è un cancello.
 */

/* ── Un DOM finto, quel tanto che basta alle funzioni pure ─────────────────────────────────────── */
function elemento(tag, { id = '', classi = [], attributi = {} } = {}) {
  return {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    id,
    classList: classi,
    getAttribute: (nome) => (Object.prototype.hasOwnProperty.call(attributi, nome) ? attributi[nome] : null),
    parentElement: null,
    children: [],
  };
}
function appendi(padre, ...figli) { for (const f of figli) { f.parentElement = padre; padre.children.push(f); } return padre; }
/** `unico` finto: dice sì solo ai selettori che gli dichiaro io — così la PREFERENZA si prova. */
const unicoFra = (...ammessi) => (sel) => ammessi.includes(sel);

/* ── Un client CDP finto: registra le chiamate e sa emettere eventi ───────────────────────────── */
function cdpFinto(risposte = {}) {
  const chiamate = [];
  const ascolti = new Map();
  const predefinite = {
    'Page.enable': {},
    'Page.getFrameTree': { frameTree: { frame: { id: 'F1' } } },
    'Page.createIsolatedWorld': { executionContextId: 7 },
    'Page.addScriptToEvaluateOnNewDocument': { identifier: 'S1' },
    'Page.removeScriptToEvaluateOnNewDocument': {},
    'Runtime.evaluate': { result: { value: pacchettoVuoto() } },
    'Runtime.enable': {}, 'Log.enable': {}, 'Runtime.disable': {}, 'Log.disable': {},
  };
  return {
    chiamate,
    ascolti,
    async invia(metodo, parametri, sessionId) {
      chiamate.push({ metodo, parametri, sessionId });
      const r = Object.prototype.hasOwnProperty.call(risposte, metodo) ? risposte[metodo] : predefinite[metodo];
      return typeof r === 'function' ? r(parametri, chiamate) : (r ?? {});
    },
    su(evento, gestore) { ascolti.set(evento, gestore); return () => ascolti.delete(evento); },
    emetti(evento, parametri, sessionId) { const g = ascolti.get(evento); if (g) g(parametri, sessionId); },
  };
}
/**
 * Le costanti che l'overlay USA ma che nessuno gli DICHIARA in testa: nel browser sarebbero un
 * ReferenceError dentro un try, cioè un pacchetto vuoto senza spiegazione. I commenti si tolgono
 * prima di guardare, altrimenti una parola italiana maiuscola dentro una glossa passa per costante.
 */
function orfane(sorgente) {
  const codice = sorgente.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const conosciuti = new Set(['HTML', 'CSS', 'JSON']); // del linguaggio e del DOM, non nostre
  const usati = new Set((codice.match(/\b[A-Z][A-Z_]{2,}\b/g) || []).filter((n) => !conosciuti.has(n)));
  const dichiarati = new Set((codice.match(/\bvar ([A-Z][A-Z_]{2,})\s*=/g) || []).map((m) => m.replace(/^var\s+/, '').replace(/\s*=$/, '')));
  return [...usati].filter((n) => !dichiarati.has(n)).sort();
}

const soloMetodi = (cdp) => cdp.chiamate.map((c) => c.metodo);
const primaCon = (cdp, metodo, dentro) => cdp.chiamate.find((c) => c.metodo === metodo && (!dentro || String(c.parametri?.expression || '').includes(dentro)));

/* ══════════════════════════════════════════════════════════════════════════════════════════════ */

test('SORGENTE-OVERLAY: è una IIFE valida, si difende dalla doppia installazione, e nessuna costante resta orfana', () => {
  const src = sorgenteOverlay();
  // compila (non esegue): un errore di sintassi nella serializzazione si vedrebbe solo nel browser, in silenzio
  assert.doesNotThrow(() => new Function(src), 'la sorgente generata deve compilare');
  assert.ok(src.startsWith('(function(){"use strict";') && src.trimEnd().endsWith('})();'));
  assert.ok(src.includes('if (window.__talosAnnotaCdp) return;'), 'rieseguirla non deve raddoppiare l\'overlay');
  assert.ok(src.includes('window.__talosAnnotaCdp = {'), 'deve esporre il suo attacco');
  assert.ok(src.includes(`var MASSIMO_HTML=${MASSIMO_HTML}`), 'le misure viaggiano come letterali, non come nomi del modulo');
  assert.ok(src.includes(JSON.stringify(ATTRIBUTI_STABILI)) && src.includes(JSON.stringify(ATTRIBUTI_DEBOLI)));
  for (const nome of ['descrivi', 'evidenzia', 'segna', 'accendi', 'spegni', 'svuotaSpilli', 'smonta']) {
    assert.ok(src.includes(`${nome}: ${nome}`), `l'overlay deve esporre ${nome}`);
  }
  // ⛔ il guasto che la testa del file annuncia: una funzione serializzata che nomina una costante
  // del MODULO. Nel browser sarebbe un ReferenceError dentro un try, cioè un pacchetto vuoto senza
  // spiegazione. Qui: ogni NOME_MAIUSCOLO usato dev'essere anche dichiarato nella testa dell'IIFE.
  assert.deepEqual(orfane(src), [], 'costanti usate nell\'overlay ma mai dichiarate nella sua testa');
  // AL CONTRARIO: il controllo qui sopra deve saper dire di NO — gli si toglie una dichiarazione
  assert.deepEqual(orfane(src.replace('var STILI=', 'var STILI_ALTRO=')), ['STILI'], 'il controllo delle costanti orfane deve mordere');
});

test('SELETTORE: il testid vince sull\'id — e senza attributi non si inventa niente', () => {
  const padre = elemento('section', { id: 'radice' });
  const bottone = elemento('button', { id: 'salva', attributi: { 'data-testid': 'salva-tutto', name: 'salva' } });
  appendi(padre, bottone);
  // tutti e tre i selettori sarebbero unici: la PREFERENZA è la cosa provata
  const sel = selettoreStabile(bottone, unicoFra('button[data-testid="salva-tutto"]', '#salva', 'button[name="salva"]'), ATTRIBUTI_STABILI, ATTRIBUTI_DEBOLI);
  assert.equal(sel, 'button[data-testid="salva-tutto"]');
  // e l'id resta il secondo: tolto il testid, tocca a lui (non ai nomi accessibili)
  const senzaTestid = elemento('button', { id: 'salva', attributi: { name: 'salva' } });
  appendi(elemento('section'), senzaTestid);
  assert.equal(selettoreStabile(senzaTestid, unicoFra('#salva', 'button[name="salva"]'), ATTRIBUTI_STABILI, ATTRIBUTI_DEBOLI), '#salva');

  // ⛔ META AL CONTRARIO: un elemento SENZA attributi non deve produrre un selettore inventato.
  const contenitore = elemento('div');
  const uno = elemento('div'); const due = elemento('div');
  appendi(contenitore, uno, due);
  const nudo = selettoreStabile(due, () => false, ATTRIBUTI_STABILI, ATTRIBUTI_DEBOLI);
  assert.ok(!/\[data-|\[name=|\[aria-label=|#/.test(nudo), `selettore inventato: ${nudo}`);
  assert.ok(nudo.includes('div:nth-of-type(2)'), 'la posizione fra i fratelli è un fatto, e si dice');
  assert.ok(nudo.includes(' > '), '⛔ il separatore resta « > »: annotazioni.js ci taglia sopra per raggruppare');
  // e le classi generate non entrano: un hash cambia al prossimo build
  const conHash = elemento('div', { classi: ['card', 'css-1a2b3c', 'sc-9f8e7d'] });
  appendi(elemento('main'), conHash);
  const pezzo = pezzoSelettore(conHash, () => false, ATTRIBUTI_STABILI, ATTRIBUTI_DEBOLI);
  assert.equal(pezzo.sel, 'div.card');
  assert.equal(pezzo.assoluto, false);
});

test('HTML ENORME: tagliato con la MISURA DICHIARATA — e uno corto resta intatto', () => {
  const enorme = `<div>${'x'.repeat(5000)}</div>`;
  const t = tagliaHtml(enorme, MASSIMO_HTML);
  assert.equal(t.troncato, true);
  assert.equal(t.caratteri, enorme.length);
  assert.ok(t.testo.includes(`troncato: ${enorme.length} caratteri in tutto`), 'la misura si dichiara, non si allude con un puntino');
  assert.ok(t.testo.includes(`mostrati i primi ${MASSIMO_HTML}`));
  assert.ok(t.testo.startsWith(`<div>${'x'.repeat(50)}`), 'il taglio è in coda, l\'inizio resta leggibile');
  // AL CONTRARIO: sotto la misura non si tocca niente, e non si annuncia un taglio che non c'è
  const corto = '<button data-testid="x">ciao</button>';
  const c = tagliaHtml(corto, MASSIMO_HTML);
  assert.deepEqual([c.testo, c.troncato, c.caratteri], [corto, false, corto.length]);
});

test('PACCHETTO: tutti i campi anche su una pagina vuota, e anche se il browser risponde con spazzatura', async () => {
  const vuoto = cdpFinto({ 'Runtime.evaluate': { result: { value: pacchettoVuoto() } } });
  const p = await descriviElemento(vuoto, 'S-1', { x: 10, y: 10 });
  for (const campo of CAMPI_PACCHETTO) assert.ok(campo in p, `manca il campo ${campo}`);
  assert.deepEqual([p.trovato, p.selettore, p.stili, p.antenati, p.indiziSorgente], [false, '', {}, [], {}]);
  assert.equal(p.sorgente, p.indiziSorgente, 'lo stesso oggetto anche sotto il nome che legge annotazioni.js');
  // niente elemento ⇒ niente seconda lettura nel mondo principale: non si interroga la pagina per nulla
  assert.equal(vuoto.chiamate.filter((c) => c.metodo === 'Runtime.evaluate' && c.parametri.contextId === undefined).length, 0);

  // AL CONTRARIO: il browser risponde `undefined` (contesto morto, valore non serializzabile).
  // Il pacchetto dev'essere comunque completo, non `undefined` che esplode a valle.
  const rotto = cdpFinto({ 'Runtime.evaluate': { result: {} } });
  const q = await descriviElemento(rotto, undefined, { x: 0, y: 0 });
  for (const campo of CAMPI_PACCHETTO) assert.ok(campo in q, `manca il campo ${campo} sul pacchetto di ripiego`);
  assert.equal(q.trovato, false);
});

test('INSTALLA: lo script permanente PIÙ il mondo per il documento già aperto — e non due volte', async () => {
  const cdp = cdpFinto();
  const esito = await installaOverlay(cdp, 'S-1');
  assert.deepEqual([esito.identificatore, esito.contesto], ['S1', 7]);
  const metodi = soloMetodi(cdp);
  // ⛔ servono TUTTI E DUE: addScript non gira sul documento già creato, createIsolatedWorld non sopravvive alla navigazione
  assert.ok(metodi.includes('Page.addScriptToEvaluateOnNewDocument'), 'senza questo l\'overlay muore alla prima navigazione');
  assert.ok(metodi.includes('Page.createIsolatedWorld'), 'senza questo l\'overlay non c\'è sulla pagina già aperta');
  const aggiunta = cdp.chiamate.find((c) => c.metodo === 'Page.addScriptToEvaluateOnNewDocument');
  assert.equal(aggiunta.parametri.worldName, MONDO_OVERLAY, 'il mondo isolato si nomina, altrimenti finisce nel mondo della pagina');
  assert.equal(aggiunta.sessionId, 'S-1');
  const mondo = cdp.chiamate.find((c) => c.metodo === 'Page.createIsolatedWorld');
  assert.deepEqual([mondo.parametri.frameId, mondo.parametri.grantUniveralAccess], ['F1', false], 'accesso universale MAI: la pagina è di terzi');
  const valutata = cdp.chiamate.find((c) => c.metodo === 'Runtime.evaluate');
  assert.equal(valutata.parametri.contextId, 7, 'l\'overlay si valuta DENTRO il mondo isolato');

  // AL CONTRARIO: una seconda installazione non deve registrare un secondo script permanente
  await installaOverlay(cdp, 'S-1');
  assert.equal(soloMetodi(cdp).filter((m) => m === 'Page.addScriptToEvaluateOnNewDocument').length, 1);
  // ...ma il mondo sì: dopo una navigazione è l'unico modo di riavere l'overlay sul documento aperto
  assert.equal(soloMetodi(cdp).filter((m) => m === 'Page.createIsolatedWorld').length, 2);
});

test('NAVIGAZIONE: il contesto perduto si ricrea una volta sola — un altro errore invece si alza', async () => {
  let giri = 0;
  const cdp = cdpFinto({
    'Runtime.evaluate': (parametri) => {
      if (!String(parametri.expression).includes('__talosAnnotaCdp.descrivi')) return { result: { value: true } };
      giri += 1;
      if (giri === 1) return { error: { code: -32000, message: 'Cannot find context with specified id' } };
      return { result: { value: { ...pacchettoVuoto(), trovato: true, selettore: 'button[data-testid="x"]', tag: 'button' } } };
    },
  });
  const p = await descriviElemento(cdp, 'S-1', { x: 5, y: 5 }, { mondoPrincipale: false });
  assert.equal(p.selettore, 'button[data-testid="x"]');
  assert.equal(giri, 2, 'un solo nuovo tentativo, non un ciclo');
  assert.equal(soloMetodi(cdp).filter((m) => m === 'Page.createIsolatedWorld').length, 2, 'il mondo è stato ricreato');

  // il documento è nuovo ma il contesto risponde: l'overlay non c'è ⇒ si reinstalla
  const senzaOverlay = cdpFinto({
    'Runtime.evaluate': (parametri, chiamate) => {
      if (!String(parametri.expression).includes('__talosAnnotaCdp.descrivi')) return { result: { value: true } };
      const quante = chiamate.filter((c) => String(c.parametri?.expression || '').includes('__talosAnnotaCdp.descrivi')).length;
      return quante === 1 ? { result: { value: { assente: true } } } : { result: { value: { ...pacchettoVuoto(), trovato: true, tag: 'p' } } };
    },
  });
  const q = await descriviElemento(senzaOverlay, 'S-1', { x: 1, y: 1 }, { mondoPrincipale: false });
  assert.equal(q.tag, 'p');
  assert.ok(!('assente' in q), 'la bandierina interna non deve finire nel pacchetto');

  // ⛔ META AL CONTRARIO: un errore che NON è un contesto perduto non si inghiotte e non si ritenta
  const guasto = cdpFinto({ 'Runtime.evaluate': (parametri) => (String(parametri.expression).includes('__talosAnnotaCdp.descrivi') ? { error: { code: -32601, message: 'Target closed' } } : { result: { value: true } }) });
  await assert.rejects(() => descriviElemento(guasto, 'S-1', { x: 1, y: 1 }), /Target closed/);
  assert.equal(soloMetodi(guasto).filter((m) => m === 'Page.createIsolatedWorld').length, 1, 'niente ricreazione su un errore che non la riguarda');
});

test('MONDO PRINCIPALE: la seconda lettura è SENZA contextId (è l\'unica che vede React e Vue) — e si può spegnere', async () => {
  const cdp = cdpFinto({
    'Runtime.evaluate': (parametri) => {
      const e = String(parametri.expression);
      if (e.includes('__talosAnnotaCdp.descrivi')) return { result: { value: { ...pacchettoVuoto(), trovato: true, selettore: '#salva', indiziSorgente: { framework: 'Vite' } } } };
      if (e.includes('_debugSource')) return { result: { value: { componente: 'BottoneSalva', file: 'src/Bottone.jsx:12' } } };
      return { result: { value: true } };
    },
  });
  const p = await descriviElemento(cdp, 'S-1', { x: 3, y: 4 });
  const lettura = primaCon(cdp, 'Runtime.evaluate', '_debugSource');
  assert.ok(lettura, 'la lettura degli espandi dev\'essere partita');
  assert.equal(lettura.parametri.contextId, undefined, '⛔ senza contextId = mondo principale: dal mondo isolato quegli espandi NON si vedono');
  assert.ok(lettura.parametri.expression.includes('"#salva"'), 'si entra per selettore, senza toccare la pagina');
  assert.deepEqual(p.indiziSorgente, { framework: 'Vite', componente: 'BottoneSalva', file: 'src/Bottone.jsx:12' }, 'gli indizi si sommano, non si sostituiscono');

  // AL CONTRARIO: con `mondoPrincipale:false` la pagina non viene interrogata affatto
  const zitto = cdpFinto({ 'Runtime.evaluate': (parametri) => (String(parametri.expression).includes('__talosAnnotaCdp.descrivi') ? { result: { value: { ...pacchettoVuoto(), trovato: true, selettore: '#salva' } } } : { result: { value: true } }) });
  await descriviElemento(zitto, 'S-1', { x: 1, y: 1 }, { mondoPrincipale: false });
  assert.equal(primaCon(zitto, 'Runtime.evaluate', '_debugSource'), undefined);
});

test('TOGLI: via lo script permanente e poi i nodi — e senza niente installato non si chiama nessuno', async () => {
  const cdp = cdpFinto();
  await installaOverlay(cdp, 'S-1');
  const esito = await togliOverlay(cdp, 'S-1');
  assert.deepEqual([esito.toltoScript, esito.smontato], [true, true]);
  const rimozione = cdp.chiamate.find((c) => c.metodo === 'Page.removeScriptToEvaluateOnNewDocument');
  assert.equal(rimozione.parametri.identifier, 'S1', 'senza l\'identificatore lo script tornerebbe alla prossima navigazione');
  assert.ok(primaCon(cdp, 'Runtime.evaluate', '? window.__talosAnnotaCdp.smonta()'), 'i nodi appesi al DOM condiviso vanno tolti a mano');

  // AL CONTRARIO: al secondo giro non c'è più niente da togliere e non si disturba il browser
  const prima = cdp.chiamate.length;
  const secondo = await togliOverlay(cdp, 'S-1');
  assert.deepEqual([secondo.toltoScript, secondo.smontato], [false, false]);
  assert.equal(cdp.chiamate.length, prima, 'nessuna chiamata inutile');

  // e se il documento è già cambiato sotto, lo smontaggio fallito non deve far fallire il distacco
  const navigato = cdpFinto({ 'Runtime.evaluate': (parametri) => (String(parametri.expression).includes('? window.__talosAnnotaCdp.smonta()') ? { error: { message: 'Cannot find context with specified id' } } : { result: { value: true } }) });
  await installaOverlay(navigato, 'S-2');
  const dopoNavigazione = await togliOverlay(navigato, 'S-2');
  assert.deepEqual([dopoNavigazione.toltoScript, dopoNavigazione.smontato], [true, false]);
});

test('ERRORI: tre eventi perché uno solo non basta — e il rumore resta fuori', async () => {
  const cdp = cdpFinto();
  const presa = raccogliErrori(cdp, 'S-1');
  assert.deepEqual(presa.errori, [], 'torna subito, si riempie dopo');
  // gli ascolti sono registrati PRIMA delle enable: un evento fra le due cose non deve cadere
  for (const evento of ['Runtime.consoleAPICalled', 'Runtime.exceptionThrown', 'Log.entryAdded']) {
    assert.ok(cdp.ascolti.has(evento), `manca l'ascolto di ${evento}`);
  }
  cdp.emetti('Runtime.consoleAPICalled', { type: 'error', args: [{ type: 'string', value: 'salvataggio  fallito' }, { type: 'object', className: 'Response' }] }, 'S-1');
  // ⛔ il 404 di un asset NON passa da console.*: senza Log.entryAdded sparirebbe
  cdp.emetti('Log.entryAdded', { entry: { source: 'network', level: 'error', text: 'Failed to load resource: 404', url: 'http://localhost:5173/logo.svg' } }, 'S-1');
  cdp.emetti('Runtime.exceptionThrown', { exceptionDetails: { text: 'Uncaught TypeError: x is not a function', url: 'http://localhost:5173/app.js', lineNumber: 41 } }, 'S-1');
  cdp.emetti('Runtime.exceptionThrown', { exceptionDetails: { text: 'Uncaught (in promise) Error', exception: { description: 'Error: rete assente' } } }, 'S-1');

  assert.deepEqual(presa.errori.map((e) => e.tipo), ['console', 'browser', 'eccezione', 'promessa']);
  assert.equal(presa.errori[0].testo, 'salvataggio fallito [Response]', 'gli argomenti remoti diventano testo senza altre domande al browser');
  assert.ok(presa.errori[1].testo.includes('404') && presa.errori[1].testo.includes('logo.svg'));
  assert.equal(presa.errori[2].testo, 'Uncaught TypeError: x is not a function — http://localhost:5173/app.js:42', 'la riga si conta da 1 per chi legge');
  assert.equal(presa.errori[1].origine, 'Log.network');

  // AL CONTRARIO — il rumore NON deve entrare, altrimenti venti righe di log riempiono il pacchetto
  const quante = presa.errori.length;
  cdp.emetti('Runtime.consoleAPICalled', { type: 'log', args: [{ value: 'sto partendo' }] }, 'S-1');
  cdp.emetti('Runtime.consoleAPICalled', { type: 'info', args: [{ value: 'versione 3' }] }, 'S-1');
  cdp.emetti('Log.entryAdded', { entry: { source: 'other', level: 'verbose', text: 'dettaglio' } }, 'S-1');
  assert.equal(presa.errori.length, quante, 'log, info e verbose non sono errori');
  // e nemmeno gli eventi di un ALTRO browser pilotato
  cdp.emetti('Runtime.consoleAPICalled', { type: 'error', args: [{ value: 'di un\'altra sessione' }] }, 'S-2');
  assert.equal(presa.errori.length, quante);

  // dopo `smetti()` non arriva più niente, e le enable vengono spente
  presa.smetti();
  cdp.emetti('Runtime.consoleAPICalled', { type: 'error', args: [{ value: 'tardi' }] }, 'S-1');
  assert.equal(presa.errori.length, quante);
  await new Promise((r) => setImmediate(r));
  assert.ok(soloMetodi(cdp).includes('Log.disable') && soloMetodi(cdp).includes('Runtime.disable'));
});

test('SESSIONE: il client di browser-vivo passa un OGGETTO, non una stringa — e gli eventi non vanno buttati', () => {
  /*
   * ⛔ Trovato leggendo `src/browser-vivo.mjs` (M2) il 07/09/2026: quel client chiama
   * `cb(params, { sessionId, metodo })`. Confrontando l'oggetto con la stringa, ogni evento
   * finiva scartato come «di un'altra sessione»: zero errori raccolti, e nessun avviso.
   */
  const comeM2 = cdpFinto();
  const presa = raccogliErrori(comeM2, 'S-1');
  comeM2.emetti('Runtime.consoleAPICalled', { type: 'error', args: [{ value: 'con il contesto a oggetto' }] }, { sessionId: 'S-1', metodo: 'Runtime.consoleAPICalled' });
  comeM2.emetti('Runtime.consoleAPICalled', { type: 'error', args: [{ value: 'con il sessionId nudo' }] }, 'S-1');
  comeM2.emetti('Runtime.consoleAPICalled', { type: 'error', args: [{ value: 'col sessionId dentro i parametri' }], sessionId: 'S-1' }, undefined);
  assert.equal(presa.errori.length, 3, 'tutte e tre le forme del secondo argomento sono la nostra sessione');
  // AL CONTRARIO: un'altra sessione resta fuori anche nella forma a oggetto
  comeM2.emetti('Runtime.consoleAPICalled', { type: 'error', args: [{ value: 'di un altro browser' }] }, { sessionId: 'S-9', metodo: 'Runtime.consoleAPICalled' });
  assert.equal(presa.errori.length, 3);
  presa.smetti();
});

test('TESTO REMOTO: il valore quando c\'è, la descrizione quando no, e mai una richiesta in più', () => {
  assert.equal(testoRemoto({ type: 'string', value: 'ciao' }), 'ciao');
  assert.equal(testoRemoto({ type: 'number', value: 404 }), '404');
  assert.equal(testoRemoto({ type: 'object', description: 'TypeError: x' }), 'TypeError: x');
  assert.equal(testoRemoto({ type: 'number', unserializableValue: 'NaN' }), 'NaN');
  assert.equal(testoRemoto({ type: 'object', preview: { description: 'Response' } }), 'Response');
  // AL CONTRARIO: un oggetto muto non diventa una stringa vuota (chi legge saprebbe che c'era un argomento)
  assert.equal(testoRemoto({ type: 'object', className: 'HTMLDivElement' }), '[HTMLDivElement]');
  assert.equal(testoRemoto({ type: 'undefined' }), '[undefined]');
  assert.equal(testoRemoto(null), '');
});

test('CLIENT CDP SBAGLIATO: si dice subito, non si scopre dopo tre chiamate', async () => {
  await assert.rejects(() => installaOverlay({}, 'S-1'), /invia\(metodo, parametri, sessionId\)/);
  assert.throws(() => raccogliErrori({ invia: async () => ({}) }, 'S-1'), /su\(evento, gestore\)/);
  // AL CONTRARIO: i nomi all'inglese di un client scritto altrove sono accettati
  assert.doesNotThrow(() => raccogliErrori({ send: async () => ({}), on: () => () => {}, off: () => {} }, 'S-1'));
});

/*
 * ⛔ 16/10/2026, owner («Chiudila adesso», dopo la nota della sessione mobile) — il Terminale aperto prima di avviare una sessione
 *   non inventa più l'id: lo chiede al server (`GET` e poi, se il suo non c'è, `POST /api/v1/terminals`). Owner, la sera stessa
 *   («Ognuna la sua, come prima»): ogni finestra ha il suo, ricordato per quella finestra anche dopo un ricaricamento.
 * Qui le funzioni VERE del client, lette dal sorgente di app.js (come W1-12 in aperti-minori), contro un server finto; le prove del
 *   registro della revisione del bugfixer (TERM-REV-02/03) stanno in `terminale-senza-sessione.test.mjs`, che non importa il frontend
 *   (R3 della CLI 0.6.8: l'albero della CLI non ha il frontend del desktop). Ogni controllo anche AL CONTRARIO.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { creaRegistroSchedeTerminale } from '../src/terminal-registry.mjs';
import { TESTI } from '../frontend/src/i18n/testi/index.js';
import { toPublicProblem } from '../src/public-problem.mjs';

const app = readFileSync(new URL('../frontend/src/legacy/app.js', import.meta.url), 'utf8');

function fino(inizio, firmaFine) {
  const da = app.indexOf(inizio);
  assert.ok(da > 0, `${inizio} non trovata in app.js`);
  const fine = app.indexOf('\n  }\n', app.indexOf(firmaFine, da)) + 4;
  return app.slice(da, fine);
}

/** `schedaStandaloneTerminale` con le sue due righe di memoria per finestra. */
const avvisi = [];
function schedaVera(statoTerminale, apiGet, apiPost, sessionStorage) {
  const corpo = fino('  const CHIAVE_TERMINALE_STANDALONE', '  async function schedaStandaloneTerminale() {');
  return new Function('statoTerminale', 'apiGet', 'apiPost', 'sessionStorage', 'toast', 'tr', 'messaggioErroreUtente', `${corpo}; return schedaStandaloneTerminale;`)(
    statoTerminale, apiGet, apiPost, sessionStorage, (titolo, testo) => avvisi.push([titolo, testo]), (k) => k, (e) => e?.message ?? '');
}

function memoriaDellaFinestra() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function serverFinto(presenti = []) {
  const chiamate = [];
  let n = 0;
  return {
    presenti,
    chiamate,
    apiGet: async (url) => { chiamate.push(['GET', url]); return { items: [...presenti] }; },
    apiPost: async (url, corpo) => { chiamate.push(['POST', url, corpo]); n += 1; const nuova = { terminalId: `dal-server-${n}`, cartella: 'C:/progetto', origine: 'standalone' }; presenti.push(nuova); return nuova; },
  };
}

test('TERMINALE-SENZA-SESSIONE-01 — senza schede il client ne fa creare una al SERVER, e poi riusa la sua', async () => {
  const stato = { standaloneId: null };
  const finestra = memoriaDellaFinestra();
  const server = serverFinto();
  assert.equal((await schedaVera(() => stato, server.apiGet, server.apiPost, finestra)()).terminalId, 'dal-server-1');
  assert.equal(stato.standaloneId, 'dal-server-1');
  assert.equal((await schedaVera(() => stato, server.apiGet, server.apiPost, finestra)()).terminalId, 'dal-server-1', 'la seconda volta la ritrova');
  assert.deepEqual(server.chiamate, [['GET', '/api/v1/terminals'], ['POST', '/api/v1/terminals', {}], ['GET', '/api/v1/terminals']]);
});

test('TERMINALE-SENZA-SESSIONE-02 — owner «ognuna la sua»: la stessa finestra dopo un ricaricamento ritrova la SUA; un\'altra finestra NON la adotta', async () => {
  const server = serverFinto();
  const prima = memoriaDellaFinestra();
  await schedaVera(() => ({ standaloneId: null }), server.apiGet, server.apiPost, prima)();
  // ricaricamento: lo stato in memoria è nuovo, la memoria della finestra no
  assert.equal((await schedaVera(() => ({ standaloneId: null }), server.apiGet, server.apiPost, prima)()).terminalId, 'dal-server-1');
  // un'altra finestra: il terminale della prima è sul server, ma non è suo
  assert.equal((await schedaVera(() => ({ standaloneId: null }), server.apiGet, server.apiPost, memoriaDellaFinestra())()).terminalId, 'dal-server-2');
});

test('TERMINALE-SENZA-SESSIONE-03 — dopo un riavvio del server (elenco vuoto) se ne crea una nuova; AL CONTRARIO un guasto non inventa un id', async () => {
  const stato = { standaloneId: 'vecchio-di-prima-del-riavvio' };
  const server = serverFinto();
  assert.equal((await schedaVera(() => stato, server.apiGet, server.apiPost, memoriaDellaFinestra())()).terminalId, 'dal-server-1');
  const giu = { standaloneId: null };
  const rotto = async () => { throw new Error('rete giù'); };
  assert.equal(await schedaVera(() => giu, rotto, rotto, memoriaDellaFinestra())(), null);
  assert.equal(giu.standaloneId, null, 'nessun id inventato');
  assert.deepEqual(avvisi.at(-1), ['app.terminal.standaloneFailed', 'rete giù'], 'e la persona sa perché');
});

/** `apriVistaTerminaleReale` vera, con le sue dipendenze finte. */
function apriVistaVera({ sessioneId, terminalId, origine, presenti }) {
  const t = { schede: new Map([[terminalId, { terminalId, origine, stato: 'disconnesso' }]]), ordine: [terminalId], attiva: terminalId, sessioneId, standaloneId: origine === 'standalone' ? terminalId : null };
  const fatti = { caricate: 0, attivate: [], scollegate: 0, dimenticato: false };
  const corpo = `${fino('  function riprendiTerminaleSenzaSessione(avvia, valido) {', '  function riprendiTerminaleSenzaSessione(avvia, valido) {')}
${fino('  function apriVistaTerminaleReale() {', '  function apriVistaTerminaleReale() {')}`;
  const apri = new Function('statoTerminale', '$', 'window', 'state', 'tr', 'scollegaTerminaleReale', 'aggiornaSchedeAgente', 'renderizzaSchedeTerminale', 'caricaSchedeTerminale', 'attivaSchedaTerminale', 'contaShellTerminale', 'apiGet', 'ricordaIdStandalone',
    `${corpo}; return apriVistaTerminaleReale;`)(
    () => t, () => ({}), { Terminal: function Terminal() {}, FitAddon: function FitAddon() {} },
    { realSession: { id: sessioneId }, view: 'terminal' }, (k) => k,
    () => { fatti.scollegate += 1; t.schede.clear(); t.ordine = []; t.attiva = null; t.sessioneId = undefined; }, () => {}, () => {},
    () => { fatti.caricate += 1; return new Promise(() => {}); },
    (id) => fatti.attivate.push(id),
    (stato = t) => stato.ordine.length,
    async () => ({ items: presenti }),
    (id) => { if (id === null) fatti.dimenticato = true; },
  );
  return { apri, fatti, t };
}

test('TERM-REV-01 (curato) — dopo un riavvio del server la scheda senza sessione col vecchio id non si ricollega alla cieca: si chiede al server, e se non c\'è più se ne crea una', async () => {
  const dopoIlRiavvio = creaRegistroSchedeTerminale({ cartellaDiSessione: () => null, cartellaStandalone: 'C:/progetto' });
  assert.equal(dopoIlRiavvio.risolviPerConnessione('id-di-prima'), null, 'premessa: il vecchio id riceve 403');
  const sparita = apriVistaVera({ sessioneId: null, terminalId: 'id-di-prima', origine: 'standalone', presenti: [] });
  sparita.apri();
  await new Promise((r) => { setTimeout(r, 10); });
  assert.deepEqual(sparita.fatti.attivate, [], 'il vecchio id non si riattiva');
  assert.equal(sparita.fatti.scollegate, 1);
  assert.equal(sparita.fatti.caricate, 1, 'se ne carica una nuova');
  assert.equal(sparita.fatti.dimenticato, true, 'e la finestra dimentica il vecchio id');
  // AL CONTRARIO: se c'è ancora, si riprende quella
  const viva = apriVistaVera({ sessioneId: null, terminalId: 'id-vivo', origine: 'standalone', presenti: [{ terminalId: 'id-vivo' }] });
  viva.apri();
  await new Promise((r) => { setTimeout(r, 10); });
  assert.deepEqual(viva.fatti.attivate, ['id-vivo']);
  assert.equal(viva.fatti.caricate, 0);
});

test('TERM-REV-01-CONTROLLO — AL CONTRARIO: con una sessione la prima scheda (id = sessionId) si riattiva subito, senza chiedere', () => {
  const { apri, fatti } = apriVistaVera({ sessioneId: 's1', terminalId: 's1', origine: 'prima-scheda', presenti: [] });
  apri();
  assert.deepEqual(fatti.attivate, ['s1']);
  assert.equal(fatti.caricate, 0);
});

test('TERMINALE-SENZA-SESSIONE-04 — nel codice del terminale non c\'è più un id inventato dal client', () => {
  const inizio = app.indexOf('  function statoTerminale() {');
  const fine = app.indexOf('  async function caricaSchedeTerminaleUnaVolta() {');
  assert.ok(inizio > 0 && fine > inizio);
  assert.doesNotMatch(app.slice(inizio, fine), /randomUUID|standalone-\$\{Date\.now/u);
  assert.doesNotMatch(app, /idStandaloneTerminale/u);
});

test('TERMINALE-SENZA-SESSIONE-05 — il rifiuto al tetto ha la sua frase per la persona: pubblicata dal server, la stessa in inglese nel dizionario, e in italiano', () => {
  const registro = creaRegistroSchedeTerminale({ cartellaDiSessione: () => null, cartellaStandalone: 'C:/p', schedeMassimePerSessione: 1, statoPtyFn: () => ({ viva: true }) });
  registro.creaStandalone();
  const rifiuto = registro.creaStandalone();
  const errore = Object.assign(new Error(rifiuto.erroreAvvio), { code: rifiuto.code, reason: rifiuto.reason });
  assert.equal(toPublicProblem(errore).explanation, rifiuto.erroreAvvio, 'pubblicata, non la copia generica «per questa sessione»');
  assert.equal(TESTI.en['errori.TERMINAL_LIMIT_REACHED.standalone_terminals_in_use'], rifiuto.erroreAvvio);
  assert.match(TESTI.it['errori.TERMINAL_LIMIT_REACHED.standalone_terminals_in_use'], /terminali senza sessione/u);
});

test('TERM-VER-02 — il pannello del terminale in basso passa dalla stessa verifica della vista (riserva del bugfixer, 16/10)', () => {
  const inizio = app.indexOf('else if (stato?.attiva && !state.realSession.id && stato.schede.get(stato.attiva)?.origine === \'standalone\')');
  assert.ok(inizio > 0, 'il pannello in basso distingue il terminale senza sessione');
  assert.match(app.slice(inizio, inizio + 400), /riprendiTerminaleSenzaSessione\(/u);
  assert.equal(app.split('riprendiTerminaleSenzaSessione(').length - 1, 3, 'una definizione e due porte: la vista e il pannello');
});

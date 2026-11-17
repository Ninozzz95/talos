/*
 * Giro di sicurezza 5 delle anteprime (11/11/2026; owner 09:12 «un ultimo giro con tutto», forma `FORMA-ORIGINE-PER-PAGINA-2026-11-11.md`
 * VERDE dal giudice v1418, condizioni v1416, v1417 a-c e v1430 d). Ogni pagina resa ha un'ORIGINE sua: `<etichetta>.localhost` alla porta
 * del servizio. Con l'isolamento di serie di Chromium (un processo per origine) la pagina che cade non porta via le sorelle, e i siti del
 * pannello Browser tornano a un processo solo.
 *   (a) l'etichetta è sua: minuscola, esadecimale, 128 bit, data dal servizio e legata al lasciapassare; il nome vale solo se l'etichetta
 *       è quella del lasciapassare della STESSA richiesta, e solo per la rotta delle pagine in GET;
 *   (b) la rotta delle pagine non posa biscotti; un `talos_token` che non è il nostro non apre niente;
 *   (d) pagina e app possono essere lo stesso SITO: una richiesta all'API col biscotto che arriva da un altro sito o da un sito fratello
 *       (`Sec-Fetch-Site: same-site` o `cross-site`) si rifiuta; nessuna intestazione CORS per le origini delle pagine.
 * Host scelti a mano con `http.request` (fetch non lo permette); nessuna rete: solo 127.0.0.1.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, request as richiestaHttp } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { creaLasciapassarePagine } from '../src/pagine-lasciapassare.mjs';
import * as guardia from '../src/guardia-origine.mjs';
const etichettaDaHost = (host) => (typeof guardia.etichettaDaHost === 'function' ? guardia.etichettaDaHost(host) : 'MANCA');
import { WorkspaceFileError, leggiFilePagina } from '../src/workspace-files.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const GETTONE_SERVER = 'b'.repeat(64);
const ETICHETTA = /^[0-9a-f]{32}$/u;
/** Un nome vero di pagina: spazi, accenti, un apostrofo e parentesi (l indirizzo lo codifica con `encodeURIComponent`). */
const NOME_DIFFICILE = "Rapporto (versione d'àrea) è finale.html";

function cartellaDiProva(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-origine-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const cartella = join(radice, 'progetto');
  mkdirSync(cartella, { recursive: true });
  writeFileSync(join(cartella, 'a.html'), '<!doctype html><script src="a.js"></script><p>a</p>');
  writeFileSync(join(cartella, 'a.js'), 'window.x = 1;');
  writeFileSync(join(cartella, 'b.html'), '<p>b</p>');
  writeFileSync(join(cartella, NOME_DIFFICILE), '<p>difficile</p>');
  return cartella;
}

async function avvia(t, { token = null, lasciapassarePagine, documento = false } = {}) {
  const cartella = cartellaDiProva(t);
  const sessionRegistry = {
    leggiPagina: async (idSessione, segmenti) => {
      if (idSessione !== 's-1') return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      try { return { ok: true, ...(await leggiFilePagina({ cartella, segmenti })) }; } catch (errore) {
        if (errore instanceof WorkspaceFileError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
    },
  };
  const staticHandler = documento
    ? async () => ({ statusCode: 200, contentType: 'text/html; charset=utf-8', body: Buffer.from('<!doctype html><html><head></head><body>APP</body></html>') })
    : async () => null;
  const app = createHttpApp({ senzaGettone: 'prove', staticHandler, sessionRegistry, listaTaskDisponibili: () => [], token,
    ...(lasciapassarePagine ? { lasciapassarePagine } : {}) });
  const server = createServer(app);
  await new Promise((fatto) => server.listen(0, '127.0.0.1', fatto));
  t.after(() => new Promise((fatto) => server.close(fatto)));
  return server.address().port;
}

/** Una richiesta con l'Host e le intestazioni scelte, sempre verso 127.0.0.1. */
function chiedi(porta, percorso, { host = `127.0.0.1:${porta}`, metodo = 'GET', intestazioni = {}, corpo = null } = {}) {
  return new Promise((ok, ko) => {
    const r = richiestaHttp({ host: '127.0.0.1', port: porta, path: percorso, method: metodo, headers: { host, ...intestazioni } }, (risposta) => {
      const pezzi = [];
      risposta.on('data', (d) => pezzi.push(d));
      risposta.once('end', () => {
        const testo = Buffer.concat(pezzi).toString('utf8');
        let json = null; try { json = JSON.parse(testo); } catch { /* non è JSON */ }
        ok({ stato: risposta.statusCode, intestazioni: risposta.headers, testo, json });
      });
    });
    r.once('error', ko);
    if (corpo !== null) r.write(corpo);
    r.end();
  });
}

/**
 * HTTP GREZZO: il percorso parte com'è scritto, byte per byte (un socket, così nessuno lo normalizza, nemmeno le barre rovesciate).
 * Torna lo stato, il codice della busta d'errore e il testo intero della risposta.
 */
function grezzo(porta, percorso, { host, intestazioni = {} } = {}) {
  return new Promise((ok, ko) => {
    const s = connect(porta, '127.0.0.1');
    const pezzi = [];
    s.on('data', (d) => pezzi.push(d));
    s.once('error', ko);
    s.once('end', () => {
      const testo = Buffer.concat(pezzi).toString('utf8');
      const stato = Number(/^HTTP\/1\.1 (\d{3})/u.exec(testo)?.[1] ?? 0);
      ok({ stato, codice: /"code":"([A-Z_]+)"/u.exec(testo)?.[1] ?? null, testo });
    });
    const righe = [`GET ${percorso} HTTP/1.1`, `Host: ${host}`, 'Connection: close', ...Object.entries(intestazioni).map(([k, v]) => `${k}: ${v}`)];
    s.write(`${righe.join('\r\n')}\r\n\r\n`);
  });
}

const conCookie = (intestazioni = {}) => ({ cookie: `talos_token=${GETTONE_SERVER}`, ...intestazioni });
async function creaPagina(porta, percorso, { token = false } = {}) {
  const r = await chiedi(porta, '/api/v1/sessions/s-1/pagine', { metodo: 'POST', intestazioni: { 'content-type': 'application/json', ...(token ? conCookie() : {}) },
    corpo: JSON.stringify({ percorso }) });
  assert.equal(r.stato, 200, r.testo);
  return r.json.data;
}

test('ORIGINE-01 (a) ogni lasciapassare ha la sua etichetta: minuscola, esadecimale, 128 bit, diversa a ogni pagina', async (t) => {
  const porta = await avvia(t);
  const prima = await creaPagina(porta, 'a.html');
  const seconda = await creaPagina(porta, 'a.html');
  assert.match(prima.indirizzo, /^\/api\/v1\/pagine\/[A-Za-z0-9_-]{43}\/a\.html$/u, 'l indirizzo resta quello di sempre (telefono, CLI, browser)');
  assert.match(String(prima.etichetta), ETICHETTA, 'oggi la risposta non porta un etichetta');
  assert.match(String(seconda.etichetta), ETICHETTA);
  assert.notEqual(prima.etichetta, seconda.etichetta, 'ogni lasciapassare la sua origine');
  /* il modulo: l'etichetta di un lasciapassare vivo, null per uno scaduto o sconosciuto; non rinnova il tempo */
  let adesso = 1000;
  const l = creaLasciapassarePagine({ ora: () => adesso });
  assert.equal(typeof l.etichetta, "function", "oggi il modulo non dà l etichetta");
  const g = l.crea({ sessionId: 's', prefisso: [], nome: 'a.html' });
  const e = l.etichetta(g);
  assert.match(e, ETICHETTA);
  assert.equal(l.etichetta('x'.repeat(43)), null);
  assert.equal(l.etichetta(42), null);
  adesso += 29 * 60 * 1000;
  assert.equal(l.etichetta(g), e);
  adesso += 2 * 60 * 1000;
  assert.equal(l.etichetta(g), null, 'chiederla non allunga la vita del lasciapassare');
  /* 128 bit veri: l'etichetta è TUTTI i 16 byte casuali chiesti per lei, non una parte allungata (mutante M11 del giro 5) */
  const chiesti = [];
  const fissi = creaLasciapassarePagine({ casuali: (k) => { const b = Buffer.from(Array.from({ length: k }, (_, i) => (i * 37 + 11 + chiesti.length * 101) & 255)); chiesti.push(b); return b; } });
  const gf = fissi.crea({ sessionId: 's', prefisso: [], nome: 'a.html' });
  assert.equal(chiesti.at(-1).length, 16);
  assert.equal(fissi.etichetta(gf), chiesti.at(-1).toString('hex'), 'l etichetta usa tutti i 16 byte');
  /* il nome dall'Host: minuscolo (gli host non distinguono), esattamente 32 cifre, un solo livello sotto localhost */
  assert.equal(etichettaDaHost(`${e}.localhost:5000`), e);
  assert.equal(etichettaDaHost(`${e.toUpperCase()}.LOCALHOST:5000`), e);
  for (const no of [`${e}.localhost.:5000`, `x.${e}.localhost:5000`, `${e.slice(1)}.localhost:5000`, `${e}0.localhost:5000`, `${e}.localhost.evil:5000`,
    `${e}.127.0.0.1:5000`, 'localhost:5000', '127.0.0.1:5000', undefined, '', `${e.slice(0, 31)}g.localhost:5000`]) assert.equal(etichettaDaHost(no), null, String(no));
});

test('ORIGINE-02 (a) il nome con l etichetta apre SOLO la sua pagina, in GET, col suo lasciapassare vivo; tutto il resto è HOST_FORBIDDEN', async (t) => {
  let adesso = 5_000_000;
  const lasciapassarePagine = creaLasciapassarePagine({ ora: () => adesso });
  const porta = await avvia(t, { lasciapassarePagine });
  const a = await creaPagina(porta, 'a.html');
  const b = await creaPagina(porta, 'b.html');
  const gettoneA = a.indirizzo.split('/')[4];
  const cartellaA = a.indirizzo.slice(0, a.indirizzo.lastIndexOf('/') + 1);
  const nomeA = `${a.etichetta}.localhost:${porta}`;
  const servita = await chiedi(porta, a.indirizzo, { host: nomeA });
  assert.equal(servita.stato, 200, `oggi il nome della pagina è rifiutato: ${servita.testo}`);
  assert.match(servita.testo, /<p>a<\/p>/u);
  assert.equal((await chiedi(porta, `${cartellaA}a.js`, { host: nomeA })).stato, 200, 'i vicini della pagina sulla sua origine');
  assert.equal((await chiedi(porta, a.indirizzo, { host: `${a.etichetta.toUpperCase()}.localhost:${porta}` })).stato, 200, 'maiuscole: lo stesso nome');
  const rifiuti = [
    ['un altra rotta col nome della pagina', '/api/v1/health', { host: nomeA }],
    ['la creazione col nome della pagina', '/api/v1/sessions/s-1/pagine', { host: nomeA, metodo: 'POST', intestazioni: { 'content-type': 'application/json' }, corpo: '{"percorso":"a.html"}' }],
    ['il documento dell app col nome della pagina', '/', { host: nomeA }],
    ['la pagina B col nome di A', b.indirizzo, { host: nomeA }],
    ['la pagina A col nome di B', a.indirizzo, { host: `${b.etichetta}.localhost:${porta}` }],
    ['un etichetta inventata', a.indirizzo, { host: `${'0'.repeat(32)}.localhost:${porta}` }],
    ['un livello in più', a.indirizzo, { host: `x.${a.etichetta}.localhost:${porta}` }],
    ['HEAD', a.indirizzo, { host: nomeA, metodo: 'HEAD' }],
    ['la forma assoluta della richiesta', `http://127.0.0.1:${porta}${a.indirizzo}`, { host: nomeA }],
  ];
  for (const [quale, percorso, opzioni] of rifiuti) {
    const r = await chiedi(porta, percorso, opzioni);
    assert.equal(r.stato, 400, `${quale}: ${r.stato} ${r.testo}`);
    if (opzioni.metodo !== 'HEAD') assert.equal(r.json?.error?.code, 'HOST_FORBIDDEN', quale);
  }
  /* il lasciapassare scaduto: il nome non vale più (e chiederlo non lo rinnova) */
  adesso += 31 * 60 * 1000;
  assert.equal((await chiedi(porta, a.indirizzo, { host: nomeA })).stato, 400, 'scaduto: il nome non apre niente');
  assert.equal(gettoneA.length, 43);
});

test('ORIGINE-03 (a, b, c) la pagina sulla sua origine: politica sulla sua cartella, la incornicia solo l app, nessun biscotto, nessun CORS', async (t) => {
  const porta = await avvia(t, { token: GETTONE_SERVER });
  const a = await creaPagina(porta, 'a.html', { token: true });
  const origine = `http://${a.etichetta}.localhost:${porta}`;
  const app = `http://127.0.0.1:${porta}`;
  for (const intestazioni of [{}, { origin: 'null' }, { origin: origine }, { origin: app }, conCookie({ origin: 'null' })]) {
    const r = await chiedi(porta, a.indirizzo, { host: `${a.etichetta}.localhost:${porta}`, intestazioni });
    assert.equal(r.stato, 200, JSON.stringify(intestazioni));
    const csp = String(r.intestazioni['content-security-policy']);
    assert.match(csp, /^sandbox allow-scripts; /u);
    assert.ok(csp.includes(`script-src ${origine}${a.indirizzo.slice(0, a.indirizzo.lastIndexOf('/') + 1)} `), csp);
    assert.ok(csp.endsWith(`frame-ancestors ${app}`), `l incornicia solo l app, non 'self' (la pagina stessa): ${csp}`);
    assert.equal(r.intestazioni['allow-csp-from'], app, 'la politica la chiede l app che la incornicia');
    assert.equal(r.intestazioni['set-cookie'], undefined, '(b) la rotta delle pagine non posa biscotti');
    assert.equal(r.intestazioni['access-control-allow-origin'], undefined, `(d) niente CORS per ${JSON.stringify(intestazioni)}`);
  }
  /* sul nome di sempre (browser, telefono): come prima, `'self'` */
  const sempre = await chiedi(porta, a.indirizzo);
  assert.ok(String(sempre.intestazioni['content-security-policy']).endsWith("frame-ancestors 'self'"));
  assert.equal(sempre.intestazioni['allow-csp-from'], app);
  assert.equal(sempre.intestazioni['set-cookie'], undefined);
  /* il preflight da un'origine di pagina: rifiutato, senza intestazioni CORS */
  const preflight = await chiedi(porta, '/api/v1/sessions', { metodo: 'OPTIONS', intestazioni: { origin: origine, 'access-control-request-method': 'GET' } });
  assert.equal(preflight.stato, 403);
  assert.equal(preflight.intestazioni['access-control-allow-origin'], undefined);
});

test('ORIGINE-04 (d) col biscotto, una richiesta all API da un sito fratello o da un altro sito si rifiuta: GET, POST semplice, modulo', async (t) => {
  const porta = await avvia(t, { token: GETTONE_SERVER });
  const a = await creaPagina(porta, 'a.html', { token: true });
  const pagina = `http://${a.etichetta}.localhost:${porta}`;
  const rifiutate = [
    ['GET con fetch da un sito fratello (la pagina su localhost)', '/api/v1/health', { host: `localhost:${porta}`, intestazioni: conCookie({ 'sec-fetch-site': 'same-site', 'sec-fetch-mode': 'no-cors', origin: pagina }) }],
    ['GET senza Origin da un sito fratello (immagine, collegamento)', '/api/v1/health', { host: `localhost:${porta}`, intestazioni: conCookie({ 'sec-fetch-site': 'same-site', 'sec-fetch-mode': 'navigate' }) }],
    ['GET da un altro sito', '/api/v1/health', { intestazioni: conCookie({ 'sec-fetch-site': 'cross-site' }) }],
    ['GET dall origine nulla di una pagina', '/api/v1/sessions', { intestazioni: conCookie({ 'sec-fetch-site': 'cross-site', origin: 'null' }) }],
    ['POST semplice da un sito fratello', '/api/v1/sessions/s-1/pagine', { host: `localhost:${porta}`, metodo: 'POST',
      intestazioni: conCookie({ 'sec-fetch-site': 'same-site', origin: pagina, 'content-type': 'text/plain' }), corpo: '{"percorso":"a.html"}' }],
    ['invio di un modulo da un sito fratello', '/api/v1/sessions/s-1/pagine', { host: `localhost:${porta}`, metodo: 'POST',
      intestazioni: conCookie({ 'sec-fetch-site': 'same-site', origin: pagina, 'content-type': 'application/x-www-form-urlencoded' }), corpo: 'percorso=a.html' }],
  ];
  for (const [quale, percorso, opzioni] of rifiutate) {
    const r = await chiedi(porta, percorso, opzioni);
    assert.equal(r.stato, 403, `${quale}: oggi ${r.stato}`);
    assert.equal(r.intestazioni['access-control-allow-origin'], undefined, quale);
  }
  /* chi resta: la finestra di TALOS (stessa origine, o il telefono dal suo WebView), un programma senza intestazioni, la persona che scrive l'indirizzo */
  const passano = [
    ['la finestra', { intestazioni: conCookie({ 'sec-fetch-site': 'same-origin' }) }],
    ['la persona nella barra degli indirizzi', { intestazioni: conCookie({ 'sec-fetch-site': 'none' }) }],
    ['il WebView del telefono', { intestazioni: conCookie({ 'sec-fetch-site': 'cross-site', origin: 'https://localhost' }) }],
    ['un programma', { intestazioni: conCookie() }],
  ];
  for (const [quale, opzioni] of passano) assert.equal((await chiedi(porta, '/api/v1/health', opzioni)).stato, 200, quale);
  /* (b) un biscotto che non è il nostro non apre niente, anche col nome giusto e anche se arriva per primo */
  assert.equal((await chiedi(porta, '/api/v1/health', { intestazioni: { cookie: 'talos_token=finto', 'sec-fetch-site': 'same-origin' } })).stato, 401);
  assert.equal((await chiedi(porta, '/api/v1/health', { intestazioni: { cookie: `talos_token=finto; talos_token=${GETTONE_SERVER}`, 'sec-fetch-site': 'same-origin' } })).stato, 401,
    'il primo valore è quello che conta: un biscotto posato da un altro nome non entra');
});

test('ORIGINE-05 (c) il documento dell app ammette in cornice le origini delle pagine solo alla sua porta, solo sul nome del guscio', async (t) => {
  const porta = await avvia(t, { token: GETTONE_SERVER, documento: true });
  const frameSrc = (csp) => /(?:^|;)\s*frame-src ([^;]*)/u.exec(String(csp))?.[1].trim().split(/\s+/u) ?? [];
  const guscio = frameSrc((await chiedi(porta, '/', { intestazioni: conCookie({ accept: 'text/html' }) })).intestazioni['content-security-policy']);
  assert.deepEqual(guscio.filter((s) => s.startsWith('http:')), [`http://localhost:${porta}`, `http://*.localhost:${porta}`], guscio.join(' '));
  const altro = frameSrc((await chiedi(porta, '/', { host: `localhost:${porta}`, intestazioni: conCookie({ accept: 'text/html' }) })).intestazioni['content-security-policy']);
  assert.deepEqual(altro.filter((s) => s.startsWith('http:')), [`http://127.0.0.1:${porta}`], 'sul nome localhost (browser) niente origini di pagina');
});

test('ORIGINE-06 (c) il nome di una pagina non esce dal guscio: il proxy del Browser (Node, che lo chiederebbe al DNS) non lo prende', async () => {
  const { bersaglioLocale, proxyPagina } = await import('../src/browser-proxy.mjs');
  const etichetta = 'a1'.repeat(16);
  const chiamate = [];
  const fetchFn = async (indirizzo) => { chiamate.push(indirizzo); return new Response('<p>x</p>', { status: 200, headers: { 'content-type': 'text/html' } }); };
  for (const nome of [`${etichetta}.localhost`, `${etichetta.toUpperCase()}.localhost`]) {
    assert.equal(bersaglioLocale(new URL(`http://${nome}:5000/`)), false, `${nome}: oggi il proxy lo accetta`);
    const esito = await proxyPagina(`http://${nome}:5000/api/v1/pagine/x/a.html`, { fetchFn });
    assert.equal(esito.ok, false, nome);
    assert.equal(esito.codice, 'BROWSER_PROXY_SOLO_LOCALE');
  }
  assert.deepEqual(chiamate, [], 'nessuna richiesta partita, nessun nome risolto');
  /* un rimando del dev server verso il nome di una pagina: fermato prima di seguirlo */
  const rimando = async (indirizzo) => { chiamate.push(indirizzo); return new Response(null, { status: 302, headers: { location: `http://${etichetta}.localhost:5000/api/v1/pagine/x/a.html` } }); };
  assert.equal((await proxyPagina('http://localhost:5173/', { fetchFn: rimando })).codice, 'BROWSER_PROXY_SOLO_LOCALE');
  assert.deepEqual(chiamate, ['http://localhost:5173/']);
  /* i dev server veri restano: localhost, 127.0.0.1, ::1, e i nomi sotto localhost che non sono un'etichetta di pagina */
  for (const buono of ['http://localhost:5173/', 'http://127.0.0.1:3000/', 'http://[::1]:8080/', 'http://app.localhost:5173/', `http://x${etichetta}.localhost:5000/`]) {
    assert.equal(bersaglioLocale(new URL(buono)), true, buono);
  }
});

test('ORIGINE-07 (a, e) col percorso GREZZO il nome della pagina non esce dalla sua pagina: punti, barre rovesciate, altre pagine, l app', async (t) => {
  /* reperto del controllore, giro 5 punto 11: il cancello leggeva `req.url` spezzato, il router `new URL` (che toglie `%2e%2e`) */
  const porta = await avvia(t, { token: GETTONE_SERVER, documento: true });
  const a = await creaPagina(porta, 'a.html', { token: true });
  const b = await creaPagina(porta, 'b.html', { token: true });
  const nomeA = `${a.etichetta}.localhost:${porta}`;
  const cartellaA = a.indirizzo.slice(0, a.indirizzo.lastIndexOf('/'));
  const gettoneB = b.indirizzo.split('/')[4];
  const casi = [
    ['%2e%2e verso /api/v1/tasks', `${cartellaA}/%2e%2e/%2e%2e/tasks`],
    ['%2E%2E maiuscolo', `${cartellaA}/%2E%2E/%2E%2E/tasks`],
    ['.%2e e %2e. misti', `${cartellaA}/.%2e/%2e./tasks`],
    ['.. letterale', `${cartellaA}/../../tasks`],
    ['barre rovesciate', `${cartellaA}/..\\..\\tasks`],
    ['un solo punto', `${cartellaA}/./a.html`],
    ['la pagina di B sul nome di A', `${cartellaA}/%2e%2e/${gettoneB}/b.html`],
    ['il documento dell app', `${cartellaA}/%2e%2e/%2e%2e/%2e%2e/%2e%2e/`],
    ['i file dell app', `${cartellaA}/%2e%2e/%2e%2e/%2e%2e/%2e%2e/app.js`],
    ['/ diretto', '/'],
    ['/app.js diretto', '/app.js'],
  ];
  const sbagliati = [];
  for (const [quale, percorso] of casi) {
    for (const intestazioni of [{}, conCookie()]) {
      const r = await grezzo(porta, percorso, { host: nomeA, intestazioni });
      const servitoAltro = r.testo.includes('<p>b</p>') || r.testo.includes('APP') || r.testo.includes('<p>a</p>');
      if (r.stato !== 400 || r.codice !== 'HOST_FORBIDDEN' || servitoAltro) sbagliati.push(`${quale} (${intestazioni.cookie ? 'col biscotto' : 'senza'}): ${r.stato} ${r.codice ?? ''}${servitoAltro ? ' con un altra risorsa' : ''}`);
    }
  }
  assert.deepEqual(sbagliati, [], 'ogni percorso che la normalizzazione cambia: 400 HOST_FORBIDDEN, mai un altra rotta');
  /* la pagina propria e il nome con le maiuscole restano aperti, anche in grezzo */
  for (const host of [nomeA, `${a.etichetta.toUpperCase()}.LOCALHOST:${porta}`]) {
    const r = await grezzo(porta, a.indirizzo, { host });
    assert.equal(r.stato, 200, `${host}: ${r.testo.slice(0, 300)}`);
    assert.match(r.testo, /<p>a<\/p>/u);
  }
});

test('ORIGINE-08 (a) il nome della pagina vale SOLO sotto /api/v1/pagine: un terzo pezzo diverso col lasciapassare giusto è HOST_FORBIDDEN', async (t) => {
  /* mutante X04 del controllore (giro 5): senza il controllo del terzo pezzo nessuna prova cadeva */
  const porta = await avvia(t, { token: GETTONE_SERVER });
  const a = await creaPagina(porta, 'a.html', { token: true });
  const gettoneA = a.indirizzo.split('/')[4];
  const nomeA = `${a.etichetta}.localhost:${porta}`;
  for (const terzo of ['sessions', 'tasks', 'me', 'pagina', 'Pagine', 'browser', '']) {
    const r = await grezzo(porta, `/api/v1/${terzo}/${gettoneA}/a.html`, { host: nomeA, intestazioni: conCookie() });
    assert.equal(r.stato, 400, `/api/v1/${terzo}/<lasciapassare di A>/a.html: ${r.stato} ${r.testo.slice(0, 200)}`);
    assert.equal(r.codice, 'HOST_FORBIDDEN', terzo);
  }
  for (const [quale, percorso] of [['v2 invece di v1', `/api/v2/pagine/${gettoneA}/a.html`], ['senza /api', `/x/v1/pagine/${gettoneA}/a.html`]]) {
    const r = await grezzo(porta, percorso, { host: nomeA, intestazioni: conCookie() });
    assert.equal(r.stato, 400, quale);
    assert.equal(r.codice, 'HOST_FORBIDDEN', quale);
  }
});

test('ORIGINE-09 (a) un percorso che fa cadere new URL sul nome della pagina riceve 400, mai 500', async (t) => {
  const porta = await avvia(t);
  const a = await creaPagina(porta, 'a.html');
  const nomeA = `${a.etichetta}.localhost:${porta}`;
  assert.throws(() => new URL('//[', 'http://127.0.0.1'), 'la premessa: questo percorso fa lanciare new URL');
  for (const percorso of ['//[', `//[${a.indirizzo}`, `/\\[${a.indirizzo}`]) {
    const r = await grezzo(porta, percorso, { host: nomeA });
    assert.equal(r.stato, 400, `${percorso}: ${r.stato} ${r.testo.slice(0, 200)}`);
    assert.equal(r.codice, 'HOST_FORBIDDEN', percorso);
  }
});

test('ORIGINE-10 (a) una pagina col nome vero difficile (spazi, accenti, apostrofo, parentesi) si apre sulla sua etichetta', async (t) => {
  const porta = await avvia(t);
  const p = await creaPagina(porta, NOME_DIFFICILE);
  assert.ok(p.indirizzo.endsWith(`/${encodeURIComponent(NOME_DIFFICILE)}`), p.indirizzo);
  assert.match(p.indirizzo, /%20\(versione%20d'%C3%A0rea\)%20%C3%A8%20finale\.html$/u, 'apostrofo e parentesi restano come sono, il resto codificato');
  const nome = `${p.etichetta}.localhost:${porta}`;
  const crudo = await grezzo(porta, p.indirizzo, { host: nome });
  assert.equal(crudo.stato, 200, `${crudo.stato} ${crudo.testo.slice(0, 300)}`);
  assert.match(crudo.testo, /<p>difficile<\/p>/u);
  const r = await chiedi(porta, p.indirizzo, { host: nome });
  assert.equal(r.stato, 200, r.testo);
  /* una pagina che chiede sé stessa o i suoi pezzi con una query (`a.js?v=2`) resta aperta: si confronta solo il percorso, la query no */
  for (const query of ['?v=2', '?x=a/../b&y=%2e%2e']) {
    const conQuery = await grezzo(porta, `${p.indirizzo}${query}`, { host: nome });
    assert.equal(conQuery.stato, 200, `${query}: ${conQuery.stato} ${conQuery.testo.slice(0, 300)}`);
    assert.match(conQuery.testo, /<p>difficile<\/p>/u, query);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { creaGestoreTerminaleWs } from '../src/terminal-ws.mjs';
import { codificaFrame, decodificaFrame, TIPO_FRAME_CONTROLLO, TIPO_FRAME_DATI } from '../src/pty-terminal.mjs';

/** ⭐ Stesso principio di pty-terminal.test.mjs: mai una vera WebSocket/socket TCP nei test unitari. */
function wsFinta() {
  const gestori = {};
  const finta = {
    OPEN: 1,
    readyState: 1,
    inviati: [],
    send(dati) { finta.inviati.push(dati); },
    on(evento, cb) { (gestori[evento] ??= []).push(cb); },
    _emetti(evento, ...args) { for (const cb of gestori[evento] ?? []) cb(...args); },
  };
  return finta;
}

function wssFinta(wsDaRestituire) {
  return class {
    handleUpgrade(_req, _socket, _head, cb) { cb(wsDaRestituire ?? wsFinta()); }
  };
}

function socketFinto() {
  return { scritture: [], distrutto: false, write(d) { this.scritture.push(d); }, destroy() { this.distrutto = true; } };
}

function reqFinto({ url = '/api/v1/terminal/ws?id=s1', origin } = {}) {
  return { url, headers: origin ? { origin } : {} };
}

/** Registro finto: cattura le chiamate, torna una `voce` reale-abbastanza (ascoltatori/backlog). */
function registroFinto(overrides = {}) {
  const chiamate = { apri: [], scrivi: [], ridimensiona: [], segnaDisconnesso: [] };
  const voce = { ascoltatori: new Set(), backlog: overrides.backlog ?? [] };
  return {
    chiamate,
    voce,
    apri(args) { chiamate.apri.push(args); return voce; },
    scrivi(...args) { chiamate.scrivi.push(args); },
    ridimensiona(...args) { chiamate.ridimensiona.push(args); },
    segnaDisconnesso(...args) { chiamate.segnaDisconnesso.push(args); },
  };
}

/**
 * ⭐⭐⭐ W1-01 (05/9) — `risolviScheda` ha sostituito `risolviCartella`. La
 * differenza che conta: questa può dire **no**. Il doppio di default dice
 * sempre sì (per i test che non parlano del cancello); i test del cancello
 * usano `schedaNegata()`.
 */
function schedaFinta(cartella = 'C:/x') {
  return (id) => ({ terminalId: id, sessionId: id, cartella });
}

/** Un registro delle schede che RIFIUTA tutto — l'id non è mai stato creato dal server. */
function schedaNegata() {
  return () => null;
}

const ORIGINE_OK = new Set(['http://127.0.0.1:4174']);

test('⛔⛔ AL CONTRARIO — un pathname diverso da /api/v1/terminal/ws distrugge il socket, nessun upgrade', () => {
  const registro = registroFinto();
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviScheda: schedaFinta() }, { WebSocketServer: wssFinta() });
  const socket = socketFinto();
  gestore.gestisciUpgrade(reqFinto({ url: '/api/v1/altro' }), socket, Buffer.alloc(0));
  assert.equal(socket.distrutto, true);
  assert.equal(registro.chiamate.apri.length, 0);
});

test('⛔⛔ AL CONTRARIO — nessun id in query: socket distrutto', () => {
  const registro = registroFinto();
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviScheda: schedaFinta() }, { WebSocketServer: wssFinta() });
  const socket = socketFinto();
  gestore.gestisciUpgrade(reqFinto({ url: '/api/v1/terminal/ws' }), socket, Buffer.alloc(0));
  assert.equal(socket.distrutto, true);
});

test('⛔⛔⛔ AL CONTRARIO — un Origin fuori dalla allowlist è rifiutato con 403, mai un upgrade', () => {
  const registro = registroFinto();
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviScheda: schedaFinta() }, { WebSocketServer: wssFinta() });
  const socket = socketFinto();
  gestore.gestisciUpgrade(reqFinto({ origin: 'https://sito-estraneo.example' }), socket, Buffer.alloc(0));
  assert.equal(socket.distrutto, true);
  assert.ok(socket.scritture.some((s) => String(s).includes('403')));
  assert.equal(registro.chiamate.apri.length, 0);
});

test('⭐⭐⭐ un Origin nella allowlist completa l\'upgrade e apre la PTY sulla cartella risolta', () => {
  const registro = registroFinto();
  const gestore = creaGestoreTerminaleWs(
    { registro, originiConsentite: ORIGINE_OK, risolviScheda: (id) => ({ terminalId: id, sessionId: id, cartella: `C:/ws-di/${id}` }) },
    { WebSocketServer: wssFinta() },
  );
  gestore.gestisciUpgrade(reqFinto({ origin: 'http://127.0.0.1:4174' }), socketFinto(), Buffer.alloc(0));
  assert.deepEqual(registro.chiamate.apri, [{ id: 's1', cartella: 'C:/ws-di/s1' }]);
});

test('⭐⭐ nessun Origin (client non-browser): consentito — stessa postura delle rotte HTTP esistenti verso curl/script locali', () => {
  const registro = registroFinto();
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviScheda: schedaFinta() }, { WebSocketServer: wssFinta() });
  const socket = socketFinto();
  gestore.gestisciUpgrade(reqFinto({}), socket, Buffer.alloc(0));
  assert.equal(socket.distrutto, false);
  assert.equal(registro.chiamate.apri.length, 1);
});

test('⭐⭐⭐ il backlog viene rimandato al client PRIMA di ogni evento live, con il framing giusto', () => {
  const registro = registroFinto({ backlog: ['uno', 'due'] });
  const ws = wsFinta();
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviScheda: schedaFinta() }, { WebSocketServer: wssFinta(ws) });
  gestore.gestisciUpgrade(reqFinto({}), socketFinto(), Buffer.alloc(0));
  assert.equal(ws.inviati.length, 2);
  assert.deepEqual(decodificaFrame(ws.inviati[0]), { tipo: TIPO_FRAME_DATI, payload: Buffer.from('uno') });
  assert.deepEqual(decodificaFrame(ws.inviati[1]), { tipo: TIPO_FRAME_DATI, payload: Buffer.from('due') });
});

test('⭐⭐ un evento "dati" del registro dopo la connessione arriva come frame DATI', () => {
  const registro = registroFinto();
  const ws = wsFinta();
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviScheda: schedaFinta() }, { WebSocketServer: wssFinta(ws) });
  gestore.gestisciUpgrade(reqFinto({}), socketFinto(), Buffer.alloc(0));
  for (const ascolta of registro.voce.ascoltatori) ascolta({ tipo: 'dati', dati: 'output vero' });
  const ultimo = decodificaFrame(ws.inviati.at(-1));
  assert.equal(ultimo.payload.toString('utf8'), 'output vero');
});

test('⭐⭐ un evento "uscita" del registro arriva come frame di CONTROLLO con il codice reale', () => {
  const registro = registroFinto();
  const ws = wsFinta();
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviScheda: schedaFinta() }, { WebSocketServer: wssFinta(ws) });
  gestore.gestisciUpgrade(reqFinto({}), socketFinto(), Buffer.alloc(0));
  for (const ascolta of registro.voce.ascoltatori) ascolta({ tipo: 'uscita', exitCode: 130 });
  const ultimo = decodificaFrame(ws.inviati.at(-1));
  assert.equal(ultimo.tipo, TIPO_FRAME_CONTROLLO);
  assert.deepEqual(JSON.parse(ultimo.payload.toString('utf8')), { evento: 'uscita', codice: 130 });
});

test('⭐⭐⭐ un frame DATI in arrivo dal client scrive DAVVERO nella PTY giusta', () => {
  const registro = registroFinto();
  const ws = wsFinta();
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviScheda: schedaFinta() }, { WebSocketServer: wssFinta(ws) });
  gestore.gestisciUpgrade(reqFinto({ url: '/api/v1/terminal/ws?id=abc' }), socketFinto(), Buffer.alloc(0));
  ws._emetti('message', codificaFrame(TIPO_FRAME_DATI, 'ls -la\r'));
  assert.deepEqual(registro.chiamate.scrivi, [['abc', 'ls -la\r']]);
});

test('⭐⭐ un frame di CONTROLLO {tipo:resize} ridimensiona; AL CONTRARIO un resize malformato è ignorato', () => {
  const registro = registroFinto();
  const ws = wsFinta();
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviScheda: schedaFinta() }, { WebSocketServer: wssFinta(ws) });
  gestore.gestisciUpgrade(reqFinto({ url: '/api/v1/terminal/ws?id=abc' }), socketFinto(), Buffer.alloc(0));
  ws._emetti('message', codificaFrame(TIPO_FRAME_CONTROLLO, JSON.stringify({ tipo: 'resize', cols: 90, rows: 25 })));
  ws._emetti('message', codificaFrame(TIPO_FRAME_CONTROLLO, JSON.stringify({ tipo: 'resize', cols: 'non-un-numero', rows: 25 })));
  ws._emetti('message', codificaFrame(TIPO_FRAME_CONTROLLO, 'non e json'));
  assert.deepEqual(registro.chiamate.ridimensiona, [['abc', 90, 25]]);
});

test('⛔⛔ alla chiusura: l\'ascoltatore viene tolto e il registro sa che il client si è disconnesso', () => {
  const registro = registroFinto();
  const ws = wsFinta();
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviScheda: schedaFinta() }, { WebSocketServer: wssFinta(ws) });
  gestore.gestisciUpgrade(reqFinto({ url: '/api/v1/terminal/ws?id=abc' }), socketFinto(), Buffer.alloc(0));
  assert.equal(registro.voce.ascoltatori.size, 1);
  ws._emetti('close');
  assert.equal(registro.voce.ascoltatori.size, 0, 'l\'ascoltatore va tolto: nessun invio a un client chiuso');
  assert.deepEqual(registro.chiamate.segnaDisconnesso, [['abc']]);
});

/*
 * ⭐⭐⭐ W1-01 (05/9) — IL CANCELLO NUOVO. Tutti i test qui sotto contano gli
 * spawn (`registro.chiamate.apri.length`), non lo status code: la prova che
 * conta non è «il server ha risposto 403», è **la PTY non è nata**.
 */

test('⛔⛔⛔ AL CONTRARIO — un terminalId che il server NON ha creato: 403 e NESSUNA PTY nata', () => {
  const registro = registroFinto();
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviScheda: schedaNegata() }, { WebSocketServer: wssFinta() });
  const socket = socketFinto();
  gestore.gestisciUpgrade(reqFinto({ url: '/api/v1/terminal/ws?id=id-mai-creato' }), socket, Buffer.alloc(0));
  assert.equal(socket.distrutto, true);
  assert.ok(socket.scritture.some((s) => String(s).includes('403')));
  assert.equal(registro.chiamate.apri.length, 0, '⛔ il fallback su cartelleProgetto[0] non esiste più: da un id ignoto NON nasce una shell');
});

test('⛔⛔⛔ AL CONTRARIO — il terminalId di UN\'ALTRA sessione è rifiutato allo stesso modo, nessuna PTY', () => {
  const registro = registroFinto();
  /* Il registro delle schede conosce solo `mio`: `altrui` esiste sul server ma non è di chi chiede — per questa connessione è un no secco. */
  const risolviScheda = (id) => (id === 'mio' ? { terminalId: 'mio', sessionId: 'sess-1', cartella: 'C:/lavoro/uno' } : null);
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviScheda }, { WebSocketServer: wssFinta() });
  const socket = socketFinto();
  gestore.gestisciUpgrade(reqFinto({ url: '/api/v1/terminal/ws?id=altrui' }), socket, Buffer.alloc(0));
  assert.equal(socket.distrutto, true);
  assert.equal(registro.chiamate.apri.length, 0);
});

test('⛔⛔⛔ AL CONTRARIO — senza il cookie talos_token (W1-10) è 401 e il registro delle schede non viene nemmeno interrogato', () => {
  const registro = registroFinto();
  let interrogato = 0;
  const gestore = creaGestoreTerminaleWs(
    { registro, originiConsentite: ORIGINE_OK, risolviScheda: (id) => { interrogato += 1; return schedaFinta()(id); }, token: 'segreto' },
    { WebSocketServer: wssFinta() },
  );
  const socket = socketFinto();
  gestore.gestisciUpgrade(reqFinto({ url: '/api/v1/terminal/ws?id=qualsiasi' }), socket, Buffer.alloc(0));
  assert.ok(socket.scritture.some((s) => String(s).includes('401')));
  assert.equal(interrogato, 0, 'il cancello a token viene PRIMA: W1-01 non lo aggira');
  assert.equal(registro.chiamate.apri.length, 0);
});

test('⭐⭐⭐ la CARTELLA arriva dalla scheda del registro, mai dalla query: due id diversi aprono nelle loro cartelle', () => {
  const registro = registroFinto();
  const risolviScheda = (id) => ({ terminalId: id, sessionId: 'sess-1', cartella: id === 'scheda-a' ? 'C:/a' : 'C:/b' });
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviScheda }, { WebSocketServer: wssFinta() });
  gestore.gestisciUpgrade(reqFinto({ url: '/api/v1/terminal/ws?id=scheda-a' }), socketFinto(), Buffer.alloc(0));
  gestore.gestisciUpgrade(reqFinto({ url: '/api/v1/terminal/ws?id=scheda-b' }), socketFinto(), Buffer.alloc(0));
  assert.deepEqual(registro.chiamate.apri, [
    { id: 'scheda-a', cartella: 'C:/a' },
    { id: 'scheda-b', cartella: 'C:/b' },
  ]);
});

test('⭐⭐⭐ COMPATIBILITÀ — `?id=<sessionId>` (quel che manda public/app.js, congelato) apre la PRIMA scheda su quel sessionId', () => {
  const registro = registroFinto();
  const risolviScheda = (id) => (id === 'sess-viva' ? { terminalId: 'sess-viva', sessionId: 'sess-viva', cartella: 'C:/workspace-vero' } : null);
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviScheda }, { WebSocketServer: wssFinta() });
  gestore.gestisciUpgrade(reqFinto({ url: '/api/v1/terminal/ws?id=sess-viva' }), socketFinto(), Buffer.alloc(0));
  assert.deepEqual(registro.chiamate.apri, [{ id: 'sess-viva', cartella: 'C:/workspace-vero' }]);
});

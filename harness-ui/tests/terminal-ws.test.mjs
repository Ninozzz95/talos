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

const ORIGINE_OK = new Set(['http://127.0.0.1:4174']);

test('⛔⛔ AL CONTRARIO — un pathname diverso da /api/v1/terminal/ws distrugge il socket, nessun upgrade', () => {
  const registro = registroFinto();
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviCartella: () => 'C:/x' }, { WebSocketServer: wssFinta() });
  const socket = socketFinto();
  gestore.gestisciUpgrade(reqFinto({ url: '/api/v1/altro' }), socket, Buffer.alloc(0));
  assert.equal(socket.distrutto, true);
  assert.equal(registro.chiamate.apri.length, 0);
});

test('⛔⛔ AL CONTRARIO — nessun id in query: socket distrutto', () => {
  const registro = registroFinto();
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviCartella: () => 'C:/x' }, { WebSocketServer: wssFinta() });
  const socket = socketFinto();
  gestore.gestisciUpgrade(reqFinto({ url: '/api/v1/terminal/ws' }), socket, Buffer.alloc(0));
  assert.equal(socket.distrutto, true);
});

test('⛔⛔⛔ AL CONTRARIO — un Origin fuori dalla allowlist è rifiutato con 403, mai un upgrade', () => {
  const registro = registroFinto();
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviCartella: () => 'C:/x' }, { WebSocketServer: wssFinta() });
  const socket = socketFinto();
  gestore.gestisciUpgrade(reqFinto({ origin: 'https://sito-estraneo.example' }), socket, Buffer.alloc(0));
  assert.equal(socket.distrutto, true);
  assert.ok(socket.scritture.some((s) => String(s).includes('403')));
  assert.equal(registro.chiamate.apri.length, 0);
});

test('⭐⭐⭐ un Origin nella allowlist completa l\'upgrade e apre la PTY sulla cartella risolta', () => {
  const registro = registroFinto();
  const gestore = creaGestoreTerminaleWs(
    { registro, originiConsentite: ORIGINE_OK, risolviCartella: (id) => `C:/ws-di/${id}` },
    { WebSocketServer: wssFinta() },
  );
  gestore.gestisciUpgrade(reqFinto({ origin: 'http://127.0.0.1:4174' }), socketFinto(), Buffer.alloc(0));
  assert.deepEqual(registro.chiamate.apri, [{ id: 's1', cartella: 'C:/ws-di/s1' }]);
});

test('⭐⭐ nessun Origin (client non-browser): consentito — stessa postura delle rotte HTTP esistenti verso curl/script locali', () => {
  const registro = registroFinto();
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviCartella: () => 'C:/x' }, { WebSocketServer: wssFinta() });
  const socket = socketFinto();
  gestore.gestisciUpgrade(reqFinto({}), socket, Buffer.alloc(0));
  assert.equal(socket.distrutto, false);
  assert.equal(registro.chiamate.apri.length, 1);
});

test('⭐⭐⭐ il backlog viene rimandato al client PRIMA di ogni evento live, con il framing giusto', () => {
  const registro = registroFinto({ backlog: ['uno', 'due'] });
  const ws = wsFinta();
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviCartella: () => 'C:/x' }, { WebSocketServer: wssFinta(ws) });
  gestore.gestisciUpgrade(reqFinto({}), socketFinto(), Buffer.alloc(0));
  assert.equal(ws.inviati.length, 2);
  assert.deepEqual(decodificaFrame(ws.inviati[0]), { tipo: TIPO_FRAME_DATI, payload: Buffer.from('uno') });
  assert.deepEqual(decodificaFrame(ws.inviati[1]), { tipo: TIPO_FRAME_DATI, payload: Buffer.from('due') });
});

test('⭐⭐ un evento "dati" del registro dopo la connessione arriva come frame DATI', () => {
  const registro = registroFinto();
  const ws = wsFinta();
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviCartella: () => 'C:/x' }, { WebSocketServer: wssFinta(ws) });
  gestore.gestisciUpgrade(reqFinto({}), socketFinto(), Buffer.alloc(0));
  for (const ascolta of registro.voce.ascoltatori) ascolta({ tipo: 'dati', dati: 'output vero' });
  const ultimo = decodificaFrame(ws.inviati.at(-1));
  assert.equal(ultimo.payload.toString('utf8'), 'output vero');
});

test('⭐⭐ un evento "uscita" del registro arriva come frame di CONTROLLO con il codice reale', () => {
  const registro = registroFinto();
  const ws = wsFinta();
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviCartella: () => 'C:/x' }, { WebSocketServer: wssFinta(ws) });
  gestore.gestisciUpgrade(reqFinto({}), socketFinto(), Buffer.alloc(0));
  for (const ascolta of registro.voce.ascoltatori) ascolta({ tipo: 'uscita', exitCode: 130 });
  const ultimo = decodificaFrame(ws.inviati.at(-1));
  assert.equal(ultimo.tipo, TIPO_FRAME_CONTROLLO);
  assert.deepEqual(JSON.parse(ultimo.payload.toString('utf8')), { evento: 'uscita', codice: 130 });
});

test('⭐⭐⭐ un frame DATI in arrivo dal client scrive DAVVERO nella PTY giusta', () => {
  const registro = registroFinto();
  const ws = wsFinta();
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviCartella: () => 'C:/x' }, { WebSocketServer: wssFinta(ws) });
  gestore.gestisciUpgrade(reqFinto({ url: '/api/v1/terminal/ws?id=abc' }), socketFinto(), Buffer.alloc(0));
  ws._emetti('message', codificaFrame(TIPO_FRAME_DATI, 'ls -la\r'));
  assert.deepEqual(registro.chiamate.scrivi, [['abc', 'ls -la\r']]);
});

test('⭐⭐ un frame di CONTROLLO {tipo:resize} ridimensiona; AL CONTRARIO un resize malformato è ignorato', () => {
  const registro = registroFinto();
  const ws = wsFinta();
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviCartella: () => 'C:/x' }, { WebSocketServer: wssFinta(ws) });
  gestore.gestisciUpgrade(reqFinto({ url: '/api/v1/terminal/ws?id=abc' }), socketFinto(), Buffer.alloc(0));
  ws._emetti('message', codificaFrame(TIPO_FRAME_CONTROLLO, JSON.stringify({ tipo: 'resize', cols: 90, rows: 25 })));
  ws._emetti('message', codificaFrame(TIPO_FRAME_CONTROLLO, JSON.stringify({ tipo: 'resize', cols: 'non-un-numero', rows: 25 })));
  ws._emetti('message', codificaFrame(TIPO_FRAME_CONTROLLO, 'non e json'));
  assert.deepEqual(registro.chiamate.ridimensiona, [['abc', 90, 25]]);
});

test('⛔⛔ alla chiusura: l\'ascoltatore viene tolto e il registro sa che il client si è disconnesso', () => {
  const registro = registroFinto();
  const ws = wsFinta();
  const gestore = creaGestoreTerminaleWs({ registro, originiConsentite: ORIGINE_OK, risolviCartella: () => 'C:/x' }, { WebSocketServer: wssFinta(ws) });
  gestore.gestisciUpgrade(reqFinto({ url: '/api/v1/terminal/ws?id=abc' }), socketFinto(), Buffer.alloc(0));
  assert.equal(registro.voce.ascoltatori.size, 1);
  ws._emetti('close');
  assert.equal(registro.voce.ascoltatori.size, 0, 'l\'ascoltatore va tolto: nessun invio a un client chiuso');
  assert.deepEqual(registro.chiamate.segnaDisconnesso, [['abc']]);
});

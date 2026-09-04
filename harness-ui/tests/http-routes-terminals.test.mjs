import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
// ⛔ Il registro VERO, non un doppio: qui si prova che il cancello morde
// attraversando il livello HTTP fino alla decisione di autorizzazione, non
// solo la funzione isolata (già provata in terminal-registry.test.mjs).
// Stessa disciplina di http-routes-sessions.test.mjs (W0-08).
import { creaRegistroSchedeTerminale } from '../src/terminal-registry.mjs';

const SESSIONI = { 'sess-1': 'C:/lavoro/uno', 'sess-2': 'C:/lavoro/due' };

async function listen(t, { token = null, senzaRegistro = false } = {}) {
  const ptyChiuse = [];
  const terminalRegistry = senzaRegistro ? null : creaRegistroSchedeTerminale({
    cartellaDiSessione: (id) => SESSIONI[id] ?? null,
    chiudiPtyFn: (terminalId) => ptyChiuse.push(terminalId),
    statoPtyFn: () => null,
  });
  const app = createHttpApp({
    staticHandler: async () => null,
    sessionRegistry: { cartellaDi: (id) => SESSIONI[id] ?? null },
    terminalRegistry,
    token,
  });
  const server = createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { base: `http://127.0.0.1:${server.address().port}`, terminalRegistry, ptyChiuse };
}

const JSON_POST = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' };

test('⭐⭐⭐ POST /sessions/:id/terminals crea una scheda: la PRIMA ha terminalId === sessionId (il monolite congelato non cambia di una riga)', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/sess-1/terminals`, JSON_POST);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.data.terminalId, 'sess-1');
  assert.equal(corpo.data.sessionId, 'sess-1');
  assert.equal(corpo.data.cartella, 'C:/lavoro/uno');
});

test('⭐⭐⭐ la SECONDA POST sulla stessa sessione dà un terminalId NUOVO, scelto dal server e non indovinabile', async (t) => {
  const { base } = await listen(t);
  await fetch(`${base}/api/v1/sessions/sess-1/terminals`, JSON_POST);
  const seconda = await (await fetch(`${base}/api/v1/sessions/sess-1/terminals`, JSON_POST)).json();
  assert.notEqual(seconda.data.terminalId, 'sess-1');
  assert.match(seconda.data.terminalId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'un UUID generato dal server: il client non lo propone e non lo indovina');
  assert.equal(seconda.data.cartella, 'C:/lavoro/uno');
});

test('⛔⛔⛔ AL CONTRARIO — POST su una sessione che NON esiste: 404, e non nasce nessuna scheda (mai la prima cartella di progetto)', async (t) => {
  const { base, terminalRegistry } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/sessione-inventata/terminals`, JSON_POST);
  assert.equal(risposta.status, 404);
  assert.equal((await risposta.json()).error.code, 'NOT_FOUND');
  assert.equal(terminalRegistry._schede.size, 0);
});

test('⛔⛔ AL CONTRARIO — un corpo con qualunque chiave è rifiutato: la sessione la dice il percorso, mai il corpo', async (t) => {
  const { base, terminalRegistry } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/sess-1/terminals`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ terminalId: 'me-lo-scelgo-io', cartella: 'C:/Windows/System32' }),
  });
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
  assert.equal(terminalRegistry._schede.size, 0, '⛔ nessuna porta laterale per farsi dare un id o una cartella scelti dal client');
});

test('⛔⛔ AL CONTRARIO — una query sulla POST è rifiutata (requireNoQuery, come le rotte vicine)', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/sess-1/terminals?cartella=C:/altrove`, JSON_POST);
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
});

test('⭐⭐ GET /sessions/:id/terminals elenca SOLO le schede di quella sessione', async (t) => {
  const { base } = await listen(t);
  await fetch(`${base}/api/v1/sessions/sess-1/terminals`, JSON_POST);
  await fetch(`${base}/api/v1/sessions/sess-1/terminals`, JSON_POST);
  await fetch(`${base}/api/v1/sessions/sess-2/terminals`, JSON_POST);
  const uno = await (await fetch(`${base}/api/v1/sessions/sess-1/terminals`.replace(/$/, ''))).json();
  assert.equal(uno.data.items.length, 2);
  assert.ok(uno.data.items.every((voce) => voce.sessionId === 'sess-1'));
  const due = await (await fetch(`${base}/api/v1/sessions/sess-2/terminals`)).json();
  assert.deepEqual(due.data.items.map((v) => v.terminalId), ['sess-2']);
});

test('⛔⛔ AL CONTRARIO — GET su una sessione inesistente è 404, non un elenco vuoto', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/sessione-inventata/terminals`);
  assert.equal(risposta.status, 404);
  assert.equal((await risposta.json()).error.code, 'NOT_FOUND');
});

test('⭐⭐⭐ POST .../terminals/:terminalId/close chiude la scheda E la PTY vera', async (t) => {
  const { base, ptyChiuse, terminalRegistry } = await listen(t);
  await fetch(`${base}/api/v1/sessions/sess-1/terminals`, JSON_POST);
  const seconda = await (await fetch(`${base}/api/v1/sessions/sess-1/terminals`, JSON_POST)).json();
  const risposta = await fetch(`${base}/api/v1/sessions/sess-1/terminals/${seconda.data.terminalId}/close`, JSON_POST);
  assert.equal(risposta.status, 200);
  assert.deepEqual(ptyChiuse, [seconda.data.terminalId], 'la chiusura esplicita deve arrivare fino alla PTY, non fermarsi al registro');
  assert.equal(terminalRegistry._schede.has(seconda.data.terminalId), false);
  assert.equal(terminalRegistry._schede.has('sess-1'), true, 'l\'altra scheda della stessa sessione resta viva');
});

test('⛔⛔⛔ AL CONTRARIO — chiudere un terminale di UN\'ALTRA sessione: 404, e la PTY altrui NON viene toccata', async (t) => {
  const { base, ptyChiuse, terminalRegistry } = await listen(t);
  await fetch(`${base}/api/v1/sessions/sess-2/terminals`, JSON_POST); // terminalId = 'sess-2'
  const risposta = await fetch(`${base}/api/v1/sessions/sess-1/terminals/sess-2/close`, JSON_POST);
  assert.equal(risposta.status, 404, 'stesso codice di un terminale inesistente: non si regala una sonda per scoprire quali id esistono');
  assert.deepEqual(ptyChiuse, []);
  assert.equal(terminalRegistry._schede.has('sess-2'), true);
});

test('⛔⛔ AL CONTRARIO — chiudere un terminalId mai esistito: 404, nessuna PTY toccata', async (t) => {
  const { base, ptyChiuse } = await listen(t);
  await fetch(`${base}/api/v1/sessions/sess-1/terminals`, JSON_POST);
  const risposta = await fetch(`${base}/api/v1/sessions/sess-1/terminals/mai-esistito/close`, JSON_POST);
  assert.equal(risposta.status, 404);
  assert.deepEqual(ptyChiuse, []);
});

test('⛔⛔⛔ AL CONTRARIO — oltre il tetto di otto schede per sessione: 409 TERMINAL_LIMIT_REACHED (ogni PTY su Windows porta con sé un conhost)', async (t) => {
  const { base, terminalRegistry } = await listen(t);
  for (let i = 0; i < 8; i += 1) {
    assert.equal((await fetch(`${base}/api/v1/sessions/sess-1/terminals`, JSON_POST)).status, 200, `la scheda ${i + 1} deve passare`);
  }
  const nona = await fetch(`${base}/api/v1/sessions/sess-1/terminals`, JSON_POST);
  assert.equal(nona.status, 409);
  assert.equal((await nona.json()).error.code, 'TERMINAL_LIMIT_REACHED');
  assert.equal(terminalRegistry.elenca('sess-1').items.length, 8, 'il tetto MORDE: la nona non esiste');
});

test('⛔⛔⛔ AL CONTRARIO — col token configurato (W1-10) e senza cookie: 401 su tutte e tre le rotte, nessuna scheda creata', async (t) => {
  const { base, terminalRegistry } = await listen(t, { token: 'segreto' });
  for (const [percorso, opzioni] of [
    ['/api/v1/sessions/sess-1/terminals', JSON_POST],
    ['/api/v1/sessions/sess-1/terminals', undefined],
    ['/api/v1/sessions/sess-1/terminals/sess-1/close', JSON_POST],
  ]) {
    const risposta = await fetch(`${base}${percorso}`, opzioni);
    assert.equal(risposta.status, 401, `${percorso} deve essere 401 senza cookie`);
    assert.equal((await risposta.json()).error.code, 'AUTH_REQUIRED');
  }
  assert.equal(terminalRegistry._schede.size, 0, 'W1-01 non aggira il cancello di W1-10');
});

test('⭐⭐ col cookie talos_token giusto le rotte funzionano come sempre', async (t) => {
  const { base } = await listen(t, { token: 'segreto' });
  const risposta = await fetch(`${base}/api/v1/sessions/sess-1/terminals`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: 'talos_token=segreto' }, body: '{}',
  });
  assert.equal(risposta.status, 200);
  assert.equal((await risposta.json()).data.terminalId, 'sess-1');
});

test('⛔⛔ senza registro dei terminali le rotte lo DICHIARANO (503), non fingono un elenco vuoto', async (t) => {
  const { base } = await listen(t, { senzaRegistro: true });
  const post = await fetch(`${base}/api/v1/sessions/sess-1/terminals`, JSON_POST);
  assert.equal(post.status, 503);
  assert.equal((await post.json()).error.code, 'TERMINAL_STORE_UNAVAILABLE');
  /* ⛔ La GET senza registro non combacia nemmeno la rotta: 404, mai un `items: []` che si legge come «nessun terminale aperto». */
  assert.equal((await fetch(`${base}/api/v1/sessions/sess-1/terminals`)).status, 404);
});

test('⛔ DELETE su una rotta terminale resta 405 come ogni altro metodo non nominato', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/sess-1/terminals`, { method: 'DELETE' });
  assert.equal(risposta.status, 405);
  assert.equal((await risposta.json()).error.code, 'METHOD_NOT_ALLOWED');
});

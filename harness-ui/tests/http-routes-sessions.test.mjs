import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { API_SCHEMA, createHttpApp } from '../src/http-app.mjs';

// ⛔ Un sessionRegistry FINTO, scritto qui apposta: session-registry.mjs ha
// già i suoi 10 test (buffer, iscrizione tardiva, stop). Questo file prova
// SOLO il livello HTTP — status code, buste, framing SSE — con un doppio
// minimo che il test stesso controlla riga per riga.
function registroFinto() {
  const sessioni = new Map();
  let contatore = 0;
  return {
    ultimeOpzioniAvvio: null,
    avvia(taskId, opzioni = {}) {
      this.ultimeOpzioniAvvio = opzioni;
      if (taskId === 'task-vietato') return { erroreAvvio: 'non ammesso', code: 'TASK_NOT_ALLOWED' };
      if (taskId === 'task-senza-chiave') return { erroreAvvio: 'chiave assente', code: 'CONFIG_INVALID' };
      contatore += 1;
      const sessionId = `sess-${contatore}`;
      sessioni.set(sessionId, { eventi: [], ascoltatori: new Set(), taskId, avviataAlle: '2026-08-24T18:00:00.000Z', conclusa: false });
      return { sessionId };
    },
    forka(idOrigine) {
      const voce = sessioni.get(idOrigine);
      if (!voce) return { erroreAvvio: 'Sessione origine non trovata', code: 'NOT_FOUND' };
      if (!voce.conclusa) return { erroreAvvio: 'La sessione origine è ancora in corso', code: 'SESSION_NOT_READY' };
      contatore += 1;
      const sessionId = `sess-${contatore}`;
      sessioni.set(sessionId, { eventi: [], ascoltatori: new Set(), taskId: voce.taskId, avviataAlle: '2026-08-24T18:05:00.000Z', conclusa: false, forkDa: idOrigine });
      return { sessionId };
    },
    resume(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (!voce.conclusa) return { erroreAvvio: 'La sessione è ancora in corso', code: 'SESSION_NOT_READY' };
      voce.conclusa = false;
      return { sessionId };
    },
    rinomina(sessionId, nome) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      const pulito = typeof nome === 'string' ? nome.trim() : '';
      if (pulito.length === 0 || pulito.length > 80) return { erroreAvvio: 'Nome non valido', code: 'QUERY_INVALID' };
      voce.nome = pulito;
      return { ok: true };
    },
    async compatta(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (!voce.conclusa) return { erroreAvvio: 'La sessione è ancora in corso', code: 'SESSION_NOT_READY' };
      voce.compattata = true; // solo per il test: prova che la rotta ha davvero raggiunto il registro
      return { ok: true, compattato: true };
    },
    async albero(sessionId, percorso = '') {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (percorso.includes('..')) return { erroreAvvio: 'Percorso non valido', code: 'QUERY_INVALID' };
      return { ok: true, voci: [{ nome: `${percorso || 'radice'}-finto.txt`, cartella: false }] };
    },
    elenca() {
      return [...sessioni.entries()]
        .map(([sessionId, voce]) => ({ sessionId, taskId: voce.taskId, nome: voce.nome ?? null, avviataAlle: voce.avviataAlle, conclusa: voce.conclusa, forkDa: voce.forkDa ?? null }))
        .sort((a, b) => b.avviataAlle.localeCompare(a.avviataAlle));
    },
    esporta(id) {
      const voce = sessioni.get(id);
      if (!voce) return null;
      return { schema: 'talos.harness-ui.session-export.v1', sessionId: id, taskId: voce.taskId, nome: voce.nome ?? null, avviataAlle: voce.avviataAlle, conclusa: voce.conclusa, forkDa: voce.forkDa ?? null, eventi: voce.eventi };
    },
    esiste(id) { return sessioni.has(id); },
    iscriviti(id, callback) {
      const voce = sessioni.get(id);
      if (!voce) return () => {};
      for (const evento of voce.eventi) callback(evento);
      voce.ascoltatori.add(callback);
      return () => voce.ascoltatori.delete(callback);
    },
    ferma(id) { return sessioni.has(id); },
    // Solo per il test: mette un evento nel buffer e lo spinge ai vivi.
    _emetti(id, evento) {
      const voce = sessioni.get(id);
      voce.eventi.push(evento);
      if (evento.type === 'RunFinished' || evento.type === 'RunError') voce.conclusa = true;
      for (const callback of voce.ascoltatori) callback(evento);
    },
  };
}

async function listen(t, { sessionRegistry = registroFinto(), listaTaskDisponibili } = {}) {
  const app = createHttpApp({
    campaignService: { listCampaigns: async () => [] },
    staticHandler: async () => null,
    sessionRegistry,
    listaTaskDisponibili: listaTaskDisponibili ?? (() => [{ id: 'sconto-a-scaglioni', progetto: 'listino', difficolta: 1, consegnaCorta: 'x' }]),
  });
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}`, sessionRegistry };
}

test('GET /api/v1/tasks torna l\'elenco leggero, avvolto nella busta standard', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/tasks`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.meta.schema, API_SCHEMA);
  assert.deepEqual(corpo.data.items, [{ id: 'sconto-a-scaglioni', progetto: 'listino', difficolta: 1, consegnaCorta: 'x' }]);
});

test('⭐ GET /api/v1/sessions torna un elenco vuoto senza sessioni, e un riepilogo per ognuna dopo', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  assert.deepEqual((await (await fetch(`${base}/api/v1/sessions`)).json()).data.items, []);

  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const corpo = await (await fetch(`${base}/api/v1/sessions`)).json();
  assert.equal(corpo.data.items.length, 1);
  assert.equal(corpo.data.items[0].sessionId, sessionId);
  assert.ok(!('eventi' in corpo.data.items[0]), 'la lista è leggera, mai gli eventi interi di ogni sessione');
});

test('GET /api/v1/sessions resta un elenco leggibile (vuoto) anche senza sessionRegistry configurato', async (t) => {
  const { base } = await listen(t, { sessionRegistry: null });
  const risposta = await fetch(`${base}/api/v1/sessions`);
  assert.equal(risposta.status, 200);
  assert.deepEqual((await risposta.json()).data.items, []);
});

test('POST /api/v1/sessions con un taskId valido torna 200 e un sessionId', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'sconto-a-scaglioni' }),
  });
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, true);
  assert.equal(typeof corpo.data.sessionId, 'string');
  assert.ok(corpo.data.sessionId.length > 0);
});

test('⛔ POST /api/v1/sessions rifiuta un corpo che non è ESATTAMENTE {taskId} o {taskId, client}', async (t) => {
  const { base } = await listen(t);
  const corpiCattivi = [
    {}, // manca taskId
    { taskId: 123 }, // tipo sbagliato
    { taskId: '' }, // vuoto
    { taskId: 'x', modello: 'qualcosa' }, // ⛔ mai modello dal client
    { taskId: 'x', chiave: 'segreta' }, // ⛔ mai la chiave dal client
    // ⛔ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 3 — 'client'
    // è un'allowlist di due soli valori, non una stringa libera.
    { taskId: 'x', client: 'bogus' },
    { taskId: 'x', client: 123 },
    { taskId: 'x', client: '' },
  ];
  for (const corpo of corpiCattivi) {
    const risposta = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    assert.equal(risposta.status, 400, JSON.stringify(corpo));
    assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
  }
});

/**
 * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 3 (§3.2 del
 * prompt) — `client:'mobile'` è l'unico valore che cambia qualcosa: il
 * server lo traduce in `{mobile:true}` verso `sessionRegistry.avvia()`.
 */
test('POST /api/v1/sessions con client:\'mobile\' passa {mobile:true} a sessionRegistry.avvia', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'sconto-a-scaglioni', client: 'mobile' }),
  });
  assert.equal(risposta.status, 200);
  assert.deepEqual(sessionRegistry.ultimeOpzioniAvvio, { mobile: true });
});

test('⛔ AL CONTRARIO: client:\'desktop\' ESPLICITO e client ASSENTE producono entrambi {mobile:false} — nessuna differenza di comportamento', async (t) => {
  const { base, sessionRegistry } = await listen(t);

  await fetch(`${base}/api/v1/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'sconto-a-scaglioni', client: 'desktop' }),
  });
  assert.deepEqual(sessionRegistry.ultimeOpzioniAvvio, { mobile: false });

  await fetch(`${base}/api/v1/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'sconto-a-scaglioni' }),
  });
  assert.deepEqual(sessionRegistry.ultimeOpzioniAvvio, { mobile: false });
});

test('⛔ POST /api/v1/sessions su un task fuori allowlist: 404 TASK_NOT_ALLOWED, mai una sessione', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'task-vietato' }),
  });
  assert.equal(risposta.status, 404);
  assert.equal((await risposta.json()).error.code, 'TASK_NOT_ALLOWED');
});

test('⛔ POST /api/v1/sessions senza chiave configurata: CONFIG_INVALID, non un crash generico', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'task-senza-chiave' }),
  });
  assert.equal((await risposta.json()).error.code, 'CONFIG_INVALID');
});

test('⭐⭐⭐ POST /api/v1/sessions/{id}/rename persiste il nome — elenca() e export lo mostrano dopo', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/rename`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Il mio nome' }),
  });
  assert.equal(risposta.status, 200);

  const elenco = await (await fetch(`${base}/api/v1/sessions`)).json();
  assert.equal(elenco.data.items[0].nome, 'Il mio nome');
  const esportato = await (await fetch(`${base}/api/v1/sessions/${sessionId}/export`)).json();
  assert.equal(esportato.data.nome, 'Il mio nome');
});

test('⛔ POST /api/v1/sessions/{id}/rename rifiuta un corpo che non è ESATTAMENTE {nome}', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  for (const corpo of [{}, { nome: 42 }, { nome: 'x', extra: 1 }, { taskId: 'x' }]) {
    const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/rename`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    });
    assert.equal(risposta.status, 400, JSON.stringify(corpo));
  }
});

test('⛔ POST /api/v1/sessions/{id}/rename con un nome vuoto: QUERY_INVALID, mai salvato', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/rename`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: '   ' }),
  });
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
});

test('⛔ POST /api/v1/sessions/{id}/rename su un id inesistente: 404', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/rename`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'x' }),
  });
  assert.equal(risposta.status, 404);
});

test('POST /api/v1/sessions/{id}/stop su una sessione vera torna 200, su un id inventato torna 404', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');

  const fermata = await fetch(`${base}/api/v1/sessions/${sessionId}/stop`, { method: 'POST' });
  assert.equal(fermata.status, 200);
  assert.deepEqual((await fermata.json()).data, { stopped: true });

  const inventata = await fetch(`${base}/api/v1/sessions/non-esiste/stop`, { method: 'POST' });
  assert.equal(inventata.status, 404);
});

test('⭐⭐⭐ POST /api/v1/sessions/{id}/fork su una sessione conclusa: 200 e un nuovo sessionId, con forkDa tracciato', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId: idOrigine } = sessionRegistry.avvia('sconto-a-scaglioni');
  sessionRegistry._emetti(idOrigine, { type: 'RunFinished', threadId: 't1', runId: 'r1' });

  const risposta = await fetch(`${base}/api/v1/sessions/${idOrigine}/fork`, { method: 'POST' });
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, true);
  assert.notEqual(corpo.data.sessionId, idOrigine);

  const esportato = await (await fetch(`${base}/api/v1/sessions/${corpo.data.sessionId}/export`)).json();
  assert.equal(esportato.data.forkDa, idOrigine);
});

test('⛔ POST /api/v1/sessions/{id}/fork su una sessione ANCORA IN CORSO: 409 SESSION_NOT_READY', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId: idOrigine } = sessionRegistry.avvia('sconto-a-scaglioni'); // mai concluso in questo test

  const risposta = await fetch(`${base}/api/v1/sessions/${idOrigine}/fork`, { method: 'POST' });
  assert.equal(risposta.status, 409);
  assert.equal((await risposta.json()).error.code, 'SESSION_NOT_READY');
});

test('⛔ POST /api/v1/sessions/{id}/fork su un id origine inesistente: 404', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/fork`, { method: 'POST' });
  assert.equal(risposta.status, 404);
});

test('⭐⭐⭐ POST /api/v1/sessions/{id}/resume su una sessione conclusa: 200 e LO STESSO sessionId', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  sessionRegistry._emetti(sessionId, { type: 'RunFinished', threadId: 't1', runId: 'r1' });

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/resume`, { method: 'POST' });
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.data.sessionId, sessionId, 'resume torna LO STESSO id, mai uno nuovo');
});

test('⛔ POST /api/v1/sessions/{id}/resume su una sessione ANCORA IN CORSO: 409 SESSION_NOT_READY', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni'); // mai concluso in questo test

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/resume`, { method: 'POST' });
  assert.equal(risposta.status, 409);
  assert.equal((await risposta.json()).error.code, 'SESSION_NOT_READY');
});

test('⛔ POST /api/v1/sessions/{id}/resume su un id inesistente: 404', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/resume`, { method: 'POST' });
  assert.equal(risposta.status, 404);
});

test('⭐ POST /api/v1/sessions/{id}/compact su una sessione conclusa: 200 e {compattato:true}', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  sessionRegistry._emetti(sessionId, { type: 'RunFinished', threadId: 't1', runId: 'r1' });

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/compact`, { method: 'POST' });
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, true);
  assert.deepEqual(corpo.data, { compattato: true });
});

test('⛔ POST /api/v1/sessions/{id}/compact su una sessione ANCORA IN CORSO: 409 SESSION_NOT_READY', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni'); // mai concluso in questo test

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/compact`, { method: 'POST' });
  assert.equal(risposta.status, 409);
  assert.equal((await risposta.json()).error.code, 'SESSION_NOT_READY');
});

test('⛔ POST /api/v1/sessions/{id}/compact su un id inesistente: 404', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/compact`, { method: 'POST' });
  assert.equal(risposta.status, 404);
});

test('⛔ le rotte nuove restano un\'eccezione NOMINATA: /api/v1/health con POST resta 405, non 404', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/health`, { method: 'POST' });
  assert.equal(risposta.status, 405);
  assert.equal(risposta.headers.get('allow'), 'GET, HEAD');
});

test('GET /api/v1/sessions/{id}/events su un id inesistente torna 404 JSON, non uno stream aperto', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/events`);
  assert.equal(risposta.status, 404);
  assert.equal(risposta.headers.get('content-type'), 'application/json; charset=utf-8');
});

test('⭐⭐ GET /api/v1/sessions/{id}/events replica la storia in frame SSE e chiude da solo su RunFinished', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  sessionRegistry._emetti(sessionId, { type: 'RunStarted', threadId: 't1', runId: 'r1' });
  sessionRegistry._emetti(sessionId, { type: 'TextMessageContent', messageId: 'm1', delta: 'ciao' });
  sessionRegistry._emetti(sessionId, { type: 'RunFinished', threadId: 't1', runId: 'r1', outcome: { type: 'success' } });

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/events`);
  assert.equal(risposta.status, 200);
  assert.equal(risposta.headers.get('content-type'), 'text/event-stream; charset=utf-8');

  const testo = await risposta.text(); // lo stream si chiude da solo dopo RunFinished: .text() non resta appeso
  const frame = testo.split('\n\n').map((f) => f.trim()).filter(Boolean).filter((f) => !f.startsWith(':'));
  const eventi = frame.map((f) => JSON.parse(f.replace(/^data: /, '')));
  assert.deepEqual(eventi.map((e) => e.type), ['RunStarted', 'TextMessageContent', 'RunFinished']);
});

test('⭐ GET /api/v1/sessions/{id}/export torna la storia intera, avvolta nella busta standard', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  sessionRegistry._emetti(sessionId, { type: 'RunStarted', threadId: 't1', runId: 'r1' });
  sessionRegistry._emetti(sessionId, { type: 'RunFinished', threadId: 't1', runId: 'r1' });

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/export`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.data.sessionId, sessionId);
  assert.equal(corpo.data.taskId, 'sconto-a-scaglioni');
  assert.deepEqual(corpo.data.eventi.map((e) => e.type), ['RunStarted', 'RunFinished']);
});

test('⛔ GET /api/v1/sessions/{id}/export su un id inesistente torna 404, non un export vuoto', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/export`);
  assert.equal(risposta.status, 404);
});

test('⭐ GET /api/v1/sessions/{id}/tree torna le voci alla radice, e passa "percorso" al registro', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');

  const allaRadice = await (await fetch(`${base}/api/v1/sessions/${sessionId}/tree`)).json();
  assert.deepEqual(allaRadice.data.voci, [{ nome: 'radice-finto.txt', cartella: false }]);

  const sottocartella = await (await fetch(`${base}/api/v1/sessions/${sessionId}/tree?percorso=src`)).json();
  assert.deepEqual(sottocartella.data.voci, [{ nome: 'src-finto.txt', cartella: false }]);
});

test('⛔ GET /api/v1/sessions/{id}/tree con un percorso che risale (".."): 400 QUERY_INVALID', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/tree?percorso=..%2Fetc`);
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
});

test('⛔ GET /api/v1/sessions/{id}/tree con una query fuori allowlist: 400 QUERY_INVALID', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/tree?altro=x`);
  assert.equal(risposta.status, 400);
});

test('⛔ GET /api/v1/sessions/{id}/tree su un id inesistente: 404', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/tree`);
  assert.equal(risposta.status, 404);
});

test('quando sessionRegistry non è configurato, le rotte nuove tornano 404/405 e Harness UI resta leggibile', async (t) => {
  const { base } = await listen(t, { sessionRegistry: null });
  assert.equal((await fetch(`${base}/api/v1/sessions/x/events`)).status, 404);
  assert.equal((await fetch(`${base}/api/v1/sessions/x/export`)).status, 404);
  assert.equal((await fetch(`${base}/api/v1/sessions/x/tree`)).status, 404);
  assert.equal((await fetch(`${base}/api/v1/sessions/x/fork`, { method: 'POST' })).status, 405,
    'senza registro, /fork non è una rotta POST nota: torna al blanket-405');
  assert.equal((await fetch(`${base}/api/v1/sessions/x/resume`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${base}/api/v1/sessions/x/compact`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${base}/api/v1/sessions/x/rename`, { method: 'POST', body: '{}' })).status, 405);
  assert.equal((await fetch(`${base}/api/v1/sessions`, { method: 'POST', body: '{}' })).status, 405,
    'senza registro, /api/v1/sessions non è una rotta POST nota: torna al blanket-405');
  assert.equal((await fetch(`${base}/api/v1/tasks`)).status, 200, 'i task restano un elenco leggibile a sé stante');
});

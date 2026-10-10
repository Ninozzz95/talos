/*
 * C1 (owner 10/10/2026, «L'ultima richiesta, tenuta in memoria» e «Misura lato server come Hermes»): il corpo che parte verso il
 * fornitore arriva al registro (`onRichiestaSpedita` nell'adattatore), resta in RAM, la sua ripartizione va a chi è connesso con un
 * evento EFFIMERO, e una rotta in sola lettura lo restituisce.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import test from 'node:test';
import { createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';
import { createSessionRegistry as createSessionRegistryReale, EVENTO_RICHIESTA_DEL_GIRO } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const URL_CHAT = 'https://openrouter.ai/api/v1/chat/completions';
const corpo = { model: 'z-ai/glm-5.3-flash', messages: [{ role: 'system', content: 'sistema' }, { role: 'user', content: 'ciao' }], tools: [{ type: 'function', function: { name: 'leggi', parameters: {} } }], stream: true };

test('C1-ULTIMA-01: the adapter hands the body that is SENT to onRichiestaSpedita, and still sends it', async () => {
  let ricevuto = null; let catturato = null;
  const adapter = createOwnerRuntimeAdapter({ importFn: async () => ({ talosLavora: (input) => input.fetchDiRete(URL_CHAT, { body: JSON.stringify(corpo) }) }) });
  await adapter.talosLavora({ fetchDiRete: async (_u, init) => { ricevuto = init.body; return Response.json({}); }, onRichiestaSpedita: (r) => { catturato = r; } });
  assert.ok(ricevuto, 'the request still leaves');
  assert.deepEqual(catturato, { messages: corpo.messages, tools: corpo.tools, model: corpo.model });
});

test('C1-ULTIMA-02: the other way round — a capture that throws never stops the request; without it nothing changes', async () => {
  for (const onRichiestaSpedita of [() => { throw new Error('rotta'); }, undefined]) {
    let ricevuto = null;
    const adapter = createOwnerRuntimeAdapter({ importFn: async () => ({ talosLavora: (input) => input.fetchDiRete(URL_CHAT, { body: JSON.stringify(corpo) }) }) });
    await adapter.talosLavora({ fetchDiRete: async (_u, init) => { ricevuto = init.body; return Response.json({}); }, ...(onRichiestaSpedita ? { onRichiestaSpedita } : {}) });
    assert.equal(ricevuto, JSON.stringify(corpo), 'the body leaves unchanged');
  }
});

const createSessionRegistry = (opzioni) => createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, ...opzioni });
function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}

test('C1-ULTIMA-03: the registry keeps the last request in RAM, announces its breakdown live, and never writes it to the journal', async () => {
  const cartellaStore = cartellaDiProva('talos-c1-ultima-');
  try {
    const visti = [];
    const registro = createSessionRegistry({
      cartellaStore, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k',
      avviaSessioneFn: async (input) => {
        input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' });
        await new Promise((r) => setTimeout(r, 0)); // dopo che la prova si è iscritta
        input.onRichiestaSpedita({ messages: corpo.messages, tools: corpo.tools, model: corpo.model });
        input.onEvento({ type: 'RunFinished' });
        return { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [] } };
      },
    });
    const { sessionId } = registro.avvia('task-vero');
    const via = registro.iscriviti(sessionId, (evento) => visti.push(evento));
    await attendiScritture({ cartellaStore, sessionId });
    const ultima = registro.leggiUltimaRichiesta(sessionId);
    assert.equal(ultima.model, corpo.model);
    assert.deepEqual(ultima.messages, corpo.messages);
    assert.deepEqual(ultima.ripartizione.categorie.map((c) => c.id), ['system', 'tools', 'conversation']);
    assert.ok(typeof ultima.at === 'string');
    const dalVivo = visti.filter((e) => e.type === 'CUSTOM' && e.name === EVENTO_RICHIESTA_DEL_GIRO);
    assert.equal(dalVivo.length, 1, 'whoever is connected gets the breakdown live');
    assert.deepEqual(dalVivo[0].value.ripartizione, ultima.ripartizione);
    assert.equal(dalVivo[0]._sequenza, undefined, 'ephemeral: no SSE sequence');
    const giornale = readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8');
    assert.ok(!giornale.includes(EVENTO_RICHIESTA_DEL_GIRO), 'live only: not in the journal');
    assert.equal(registro.leggiUltimaRichiesta('nessuna'), undefined, 'an unknown conversation');
    if (typeof via === 'function') via();
  } finally { rimuoviCartellaDiProva(cartellaStore); }
});

test('C1-ULTIMA-HTTP: GET /last-request — token guard, 200 with the copy or null, 404 for an unknown conversation, no query', async (t) => {
  const ultima = { at: '2026-10-10T00:00:00.000Z', model: 'm', messages: [], tools: [], ripartizione: { categorie: [{ id: 'conversation', tokens: 0 }], stimata: true, messaggi: 0, attrezzi: 0 } };
  const app = createHttpApp({
    staticHandler: async () => null, token: 'token-di-prova',
    sessionRegistry: { leggiUltimaRichiesta: (id) => (id === 's1' ? ultima : id === 's2' ? null : undefined) },
  });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/sessions`;
  const headers = { cookie: 'talos_token=token-di-prova' };
  assert.equal((await fetch(`${base}/s1/last-request`)).status, 401);
  const r = await fetch(`${base}/s1/last-request`, { headers });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).data, { ultimaRichiesta: ultima });
  assert.deepEqual((await (await fetch(`${base}/s2/last-request`, { headers })).json()).data, { ultimaRichiesta: null });
  assert.equal((await fetch(`${base}/altra/last-request`, { headers })).status, 404);
  assert.equal((await fetch(`${base}/s1/last-request?x=1`, { headers })).status, 400);
  assert.equal((await fetch(`${base}/s1/last-request`, { method: 'POST', headers })).status, 405);
});

test('C1-ULTIMA-LEVEL1-SERVICE: the context service hands each successful preparation to onPrepared; a throwing one changes nothing', async (t) => {
  for (const lancia of [false, true]) {
    const store = createSqliteContextStore({ databasePath: ':memory:' });
    t.after(() => store.close());
    const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('non serve'); } }, tokenCounter: { async countPreparedContext({ messages, tools, model: m }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: m.provider, model: m.model }; } }, clock: () => '2026-10-10T00:00:00.000Z' });
    const ricevuti = [];
    const service = createDesktopContextService({ store, engine, readSession: (id) => (id === 'chat' ? { sessionId: id, modello: 'local:test' } : null), isSessionEnabled: (id) => id === 'chat', resolveSessionModel: async () => ({ provider: 'local', model: 'test', windowTokens: 16384, responseReserve: 2048 }), clock: () => '2026-10-10T00:00:00.000Z',
      onPrepared: (x) => { ricevuti.push(x); if (lancia) throw new Error('rotto'); } });
    t.after(() => service.close());
    const hooks = await service.createKernelHooks({ sessionId: 'chat', runId: 'run-1' });
    const messaggi = [{ role: 'system', content: 'sistema' }, { role: 'user', content: 'ciao' }];
    const preparata = await hooks.prepare({ messages: messaggi, originali: messaggi, tools: [] });
    assert.ok(Array.isArray(preparata.messages), 'the preparation went through');
    assert.deepEqual(ricevuti, [{ sessionId: 'chat', level1: preparata.level1 ?? null, versionId: preparata.versionId ?? null }]);
  }
});

test('C1-ULTIMA-LEVEL1-REGISTRY: the counts annotated by the engine travel with the next request, ONCE', async () => {
  const visti = [];
  let spedisci = null;
  const registro = createSessionRegistry({
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k',
    avviaSessioneFn: async (input) => { input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); spedisci = input.onRichiestaSpedita; await new Promise(() => {}); },
  });
  const { sessionId } = registro.avvia('task-vero');
  registro.iscriviti(sessionId, (e) => visti.push(e));
  await new Promise((r) => setTimeout(r, 0));
  registro.annotaPreparazioneContesto({ sessionId, level1: { cleared: 3, shortened: 1 }, versionId: 'ver-1' });
  spedisci({ messages: corpo.messages, tools: corpo.tools, model: corpo.model });
  spedisci({ messages: corpo.messages, tools: corpo.tools, model: corpo.model }); // una richiesta dopo, senza preparazione nuova
  const eventi = visti.filter((e) => e.type === 'CUSTOM' && e.name === EVENTO_RICHIESTA_DEL_GIRO);
  assert.equal(eventi.length, 2);
  assert.deepEqual([eventi[0].value.level1, eventi[0].value.versionId], [{ cleared: 3, shortened: 1 }, 'ver-1']);
  assert.deepEqual([eventi[1].value.level1, eventi[1].value.versionId], [null, null], 'consumed: the next request does not inherit them');
  registro.annotaPreparazioneContesto({ sessionId, level1: { cleared: 'tre', shortened: 1 } });
  spedisci({ messages: [], tools: [], model: 'm' });
  assert.equal(visti.filter((e) => e.name === EVENTO_RICHIESTA_DEL_GIRO).at(-1).value.level1, null, 'nonsense counts are not shown');
});

test('C1-STATO-COMPATTAZIONE-HTTP: GET /compaction-state — the legacy record with its summary, 404 for an unknown conversation', async (t) => {
  const record = { coveredThrough: 4, riassunto: 'RIASSUNTO con le richieste', tokenPrima: 184000, tokenDopo: 41000, misura: 'stima', at: '2026-10-10T00:00:00.000Z', modello: 'm', indice: 'INDICE' };
  const app = createHttpApp({
    staticHandler: async () => null, token: 'token-di-prova',
    sessionRegistry: { statoCompattazione: (id) => (id === 's1' ? { record, inCorso: false } : { erroreAvvio: 'Session not found', code: 'NOT_FOUND' }) },
  });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/sessions`;
  const headers = { cookie: 'talos_token=token-di-prova' };
  assert.equal((await fetch(`${base}/s1/compaction-state`)).status, 401);
  const r = await fetch(`${base}/s1/compaction-state`, { headers });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).data, { record, inCorso: false });
  assert.equal((await fetch(`${base}/altra/compaction-state`, { headers })).status, 404);
  assert.equal((await fetch(`${base}/s1/compaction-state`, { method: 'POST', headers })).status, 405);
});

/*
 * C1, livello 2 del metodo approvato dall'owner il 09/10/2026 sera — il riassunto del motore, migliorato dove il banco A/B l'ha
 *   visto cedere (`TALOS-RICERCHE/banco-c1-2026-10-09/ESITO-BANCO-AB-2026-10-09.md`):
 *   - una sintesi con il FORMATO sbagliato (CTX_INVALID_SUMMARY) si riprova UNA volta, con un'istruzione sul formato: nel banco
 *     una compattazione su tre è morta così, senza riprova;
 *   - l'INDICE MECCANICO (percorsi, impronte, errori) entra nella proiezione: il motore perdeva gli «aghi» (2/8 sul trascritto
 *     lungo) che l'indice del legacy teneva (7/8). Hermes: «the anchor index fixed the needle-fact class», GUI a libro chiuso
 *     23,3 → 60,0 (`evals/compaction/results/SCORECARD-2026-08-15.md`).
 *   Il motore resta generico: l'indice è una funzione passata da chi lo crea, come il puntatore di recupero.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createContextEngine } from '../src/engine.mjs';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { parseContextSettings } from '../src/contracts.mjs';

const now = '2026-10-09T00:00:00.000Z';
const profilo = { provider: 'local', model: 'fixture', windowTokens: 131072, responseReserve: 2048, local: true };
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const valido = (request) => {
  const sourceId = JSON.parse(request.messages.at(-1).content).sourceIds?.[0] ?? 'u0';
  const quote = sourceId === 'u0' ? 'Database SQLite' : sourceId.startsWith('a') ? 'risposta' : 'richiesta 2';
  return { text: JSON.stringify({ schema: 'talos.context.summary.v1', text: 'sintesi', goal: 'g', decisions: ['Database SQLite'], constraints: [], completed: [], pending: [], resources: [], sources: [{ recordId: sourceId, quote }] }), finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 300 } };
};

async function banco(t, { summarize, anchorIndex, isPersonRequest } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'c1-livello2-'));
  const store = createSqliteContextStore({ databasePath: join(dir, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const richieste = [];
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async (request) => { richieste.push(request); return summarize(request, richieste.length); } };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: m }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: sha({ messages, tools }), provider: m.provider, model: m.model }; } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => now, ...(anchorIndex ? { anchorIndex } : {}), ...(isPersonRequest ? { isPersonRequest } : {}) });
  const sessionId = 'chat';
  await store.initSession({ sessionId, settings: parseContextSettings({}) });
  const lungo = ' ' + 'dettaglio '.repeat(400);
  const messaggi = [
    { role: 'user', content: 'Database SQLite' + lungo },
    { role: 'assistant', content: 'risposta: il file src/db/schema.sql ha impronta 9f2c4e7a1b3d' + lungo },
    { role: 'user', content: 'richiesta 2' + lungo },
    { role: 'assistant', content: 'risposta' + lungo },
  ];
  for (const [i, message] of messaggi.entries()) await engine.appendOriginal({ sessionId, record: { id: `${i % 2 ? 'a' : 'u'}${i}`, message, createdAt: now } });
  const compatta = async (key = 'k') => {
    const job = await engine.startCompaction({ sessionId, sessionModel: profilo, idempotencyKey: key });
    return engine.waitForCompaction({ sessionId, jobId: job.id });
  };
  return { engine, store, richieste, compatta, sessionId, messaggi };
}

test('C1-L2-FORMAT-RETRY: a summary in the wrong format is retried ONCE with a format instruction (a different request), then committed', async (t) => {
  const b = await banco(t, { summarize: (request, n) => (n === 1 ? { text: 'Ecco la sintesi: non è JSON', finishReason: 'stop' } : valido(request)) });
  const job = await b.compatta();
  assert.equal(job.state, 'committed', JSON.stringify(job.error));
  assert.equal(b.richieste.length, 2);
  assert.notEqual(b.richieste[1].messages[0].content, b.richieste[0].messages[0].content, 'never the same request twice');
  assert.match(b.richieste[1].messages[0].content, /JSON/u);
});

test('C1-L2-FORMAT-RETRY-ONCE: two wrong formats in a row fail with CTX_INVALID_SUMMARY, no loop', async (t) => {
  const b = await banco(t, { summarize: () => ({ text: 'ancora testo libero', finishReason: 'stop' }) });
  const job = await b.compatta();
  assert.equal(job.state, 'failed');
  assert.equal(job.error?.code, 'CTX_INVALID_SUMMARY');
  assert.equal(b.richieste.length, 2);
});

test('C1-L2-ANCHORS: the mechanical index of the summarized part enters the projection; without the function, nothing changes', async (t) => {
  const visti = [];
  const b = await banco(t, { summarize: (request) => valido(request), anchorIndex: (messaggi) => { visti.push(messaggi.length); return 'INDICE: src/db/schema.sql · 9f2c4e7a1b3d'; } });
  assert.equal((await b.compatta()).state, 'committed');
  const preparata = await b.engine.prepareForRequest({ sessionId: b.sessionId, messages: b.messaggi, tools: [], sessionModel: profilo });
  // C1 (09/10, banco v2): indice, registro e puntatore stanno in TESTO dopo il JSON della memoria (prima riga), come nel legacy
  const contenuto = preparata.messages.find((m) => String(m.content).includes('talos-context-memory')).content;
  const memoria = JSON.parse(contenuto.split('\n')[0]);
  assert.equal('anchors' in memoria, false, 'not inside the JSON');
  assert.ok(contenuto.includes('\nMechanical index of the summarized part (exact paths, hashes, errors):\nINDICE: src/db/schema.sql · 9f2c4e7a1b3d'));
  assert.ok(visti.length > 0 && visti.every((n) => n > 0), 'the function receives the summarized messages');

  const senza = await banco(t, { summarize: (request) => valido(request) });
  assert.equal((await senza.compatta()).state, 'committed');
  const p2 = await senza.engine.prepareForRequest({ sessionId: senza.sessionId, messages: senza.messaggi, tools: [], sessionModel: profilo });
  const c2 = p2.messages.find((m) => String(m.content).includes('talos-context-memory')).content;
  assert.equal(c2.includes('Mechanical index'), false);
});

/* ── Il registro dei vincoli della persona (metodo approvato, livello 2; Lost in Compaction, arXiv 2608.11242: i vincoli
   laterali si perdono quando si riassumono, funziona tenerli ALLA LETTERA). Nel banco v2 il motore perdeva lo «stato» su
   448dc574 (0/4 con glm) mentre il solo livello 1, che tiene tutte le richieste della persona, faceva 4/4. */
test('C1-L2-REGISTER: the requests of the person in the summarized part are kept verbatim after the memory JSON, oldest first', async (t) => {
  const b = await banco(t, { summarize: (request) => valido(request) });
  assert.equal((await b.compatta()).state, 'committed');
  const preparata = await b.engine.prepareForRequest({ sessionId: b.sessionId, messages: b.messaggi, tools: [], sessionModel: profilo });
  const contenuto = preparata.messages.find((m) => String(m.content).includes('talos-context-memory')).content;
  assert.equal(JSON.parse(contenuto.split('\n')[0]).kind, 'talos-context-memory');
  const registro = contenuto.slice(contenuto.indexOf('Requests of the person in the summarized part, verbatim'));
  const coperte = b.messaggi.filter((m) => m.role === 'user').map((m) => m.content).filter((testo) => !preparata.messages.some((m) => m.content === testo));
  assert.ok(coperte.length >= 1, 'the fixture covers at least one request');
  let da = 0;
  // le richieste della fixture superano il tetto per richiesta: si tengono INIZIO (alla lettera) e fine, con l'omissione detta
  for (const testo of coperte) { const inizio = testo.slice(0, 200); const at = registro.indexOf(inizio, da); assert.ok(at > 0, `verbatim and in order: ${testo.slice(0, 30)}`); da = at + inizio.length; }
  assert.match(registro, /characters omitted/u);
});


test('C1-L2-REGISTER-BUDGET: over the budget the first request and the latest ones stay whole, the omitted ones are counted', async () => {
  const { personRequestRegister, PERSON_REQUESTS_CHARS } = await import('../src/summary.mjs');
  const richieste = Array.from({ length: 30 }, (_, i) => `Richiesta ${i}: ${'vincolo '.repeat(60)}fine ${i}.`);
  const testo = personRequestRegister(richieste);
  assert.ok(testo.length <= PERSON_REQUESTS_CHARS + 400, `budget: ${testo.length}`);
  assert.ok(testo.includes(richieste[0]), 'the first request (the task) stays');
  assert.ok(testo.includes(richieste[29]) && testo.includes(richieste[28]), 'the latest ones stay');
  assert.match(testo, /\(\d+ other requests omitted here; conversation_search with this_conversation=true finds them\)/u);
  assert.ok(testo.indexOf(richieste[0]) < testo.indexOf(richieste[28]), 'oldest first');
  assert.equal(personRequestRegister([]), null);
});

test('C1-L2-REGISTER-PREDICATE: with isPersonRequest the register keeps only the person; without it, every covered user message (generic engine)', async (t) => {
  // review del bugfixer su 59cdfdcba (Y1): le buste di macchina (sotto-agenti, Workflow, dialogo) non sono richieste della persona
  // la sola richiesta coperta da questa fixture è «Database SQLite…» (vedi C1-L2-REGISTER): esclusa, il registro non c'è più
  const b = await banco(t, { summarize: (request) => valido(request), isPersonRequest: (m) => !String(m.content).startsWith('Database SQLite') });
  assert.equal((await b.compatta()).state, 'committed');
  const preparata = await b.engine.prepareForRequest({ sessionId: b.sessionId, messages: b.messaggi, tools: [], sessionModel: profilo });
  const contenuto = preparata.messages.find((m) => String(m.content).includes('talos-context-memory')).content;
  assert.equal(contenuto.includes('Requests of the person'), false, 'the excluded message does not make a register');
});

test('C1-L2-REGISTER-PREDICATE-THROWS: a predicate that throws counts as «not the person»: only what is surely theirs enters', async (t) => {
  const b = await banco(t, { summarize: (request) => valido(request), isPersonRequest: () => { throw new Error('predicato rotto'); } });
  assert.equal((await b.compatta()).state, 'committed');
  const preparata = await b.engine.prepareForRequest({ sessionId: b.sessionId, messages: b.messaggi, tools: [], sessionModel: profilo });
  const contenuto = preparata.messages.find((m) => String(m.content).includes('talos-context-memory')).content;
  assert.equal(contenuto.includes('Requests of the person'), false);
});

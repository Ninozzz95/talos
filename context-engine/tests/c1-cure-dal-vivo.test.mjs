/*
 * C1, prova dal vivo del motore di serie (09/10/2026 sera, 4177) — due difetti, owner «Tutti e due (Recommended)»:
 * (1) un riassunto partito al giro 3 (coveredThrough del giro 1) veniva BUTTATO al giro 4 con CTX_NO_REDUCTION: la verifica
 *     misurava il contesto cresciuto nel frattempo e pretendeva che entrasse, anche se il riassunto riduceva; poi la pausa a
 *     scalini e ogni giro sforava. ⇒ Un riassunto che riduce si pubblica sempre; se non basta, ne parte SUBITO un secondo fino
 *     ad adesso (al massimo uno in più).
 * (2) le uscite enormi della parte recente non si accorciavano mai (il livello 1 le toglie solo oltre le ultime 6 e a blocchi
 *     di 16). ⇒ Sotto pressione si accorciano come nel legacy (decisione owner 26/09, `compattazione-desktop.mjs::accorciaTesto`):
 *     inizio e fine più un rimando; l'originale resta nell'archivio e si ritrova col recupero.
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
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const conta = (messages) => Math.ceil(JSON.stringify({ messages, tools: [] }).length / 4);
/** The window whose input limit (heuristic margin 15%, `profiles.mjs:6`) puts `tokens` at `ratio`. */
const finestra = (tokens, ratio, reserve = 2048) => Math.ceil((tokens / ratio + reserve) / 0.85);
const grande = (n, k = 12000) => `uscita ${n}: ${'dato '.repeat(k / 5)}fine ${n}`;

async function banco(t, { summarize, settings = {} } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'c1-cure-dal-vivo-'));
  const store = createSqliteContextStore({ databasePath: join(dir, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const richieste = [];
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async (request) => { richieste.push(request); return summarize(request, richieste.length); } };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: m }) { return { schema: 'talos.context.tokens.v1', inputTokens: conta(messages), windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: sha({ messages, tools }), provider: m.provider, model: m.model }; } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => now, clearedToolPointer: 'Recover it with conversation_search.' });
  await store.initSession({ sessionId: 'chat', settings: parseContextSettings(settings) });
  let n = 0;
  const aggiungi = async (message) => { n += 1; await engine.appendOriginal({ sessionId: 'chat', record: { id: `r${n}`, message, createdAt: now } }); };
  return { engine, store, richieste, aggiungi };
}
const valida = (request) => {
  // cita il primo record del segmento che ha testo: nella fixture ogni giro è r(4k+1) persona «Leggi il capitolo», r(4k+2) chiamata
  // senza testo, r(4k+3) uscita «uscita N», r(4k+4) risposta «Codice del capitolo»; una fusione (senza sourceIds) cita r1
  const sourceIds = JSON.parse(request.messages.at(-1).content).sourceIds ?? [];
  const TESTI = ['Codice del capitolo', 'Leggi il capitolo', null, 'uscita'];
  const scelto = sourceIds.find((id) => /^r\d+$/u.test(id) && TESTI[Number(id.slice(1)) % 4]) ?? 'r1';
  return { text: JSON.stringify({ schema: 'talos.context.summary.v1', text: 'Letti i capitoli.', goal: 'leggere', decisions: [], constraints: [], completed: [], pending: [], resources: [], sources: [{ recordId: scelto, quote: TESTI[Number(scelto.slice(1)) % 4] }] }), finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
};
const giro = async (b, i) => {
  await b.aggiungi({ role: 'user', content: `Leggi il capitolo ${i}` });
  await b.aggiungi({ role: 'assistant', content: '', tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'leggi', arguments: `{"percorso":"capitolo-${i}.md"}` } }] });
  await b.aggiungi({ role: 'tool', content: grande(i), tool_call_id: `c${i}` });
  await b.aggiungi({ role: 'assistant', content: `Codice del capitolo ${i}` });
};

test('C1-VIVO-01: a summary that reduces is committed even if the context grew meanwhile and it is not enough', async (t) => {
  let sblocca; const cancello = new Promise((r) => { sblocca = r; });
  const b = await banco(t, { summarize: async (request) => { await cancello; return valida(request); } });
  for (const i of [1, 2, 3]) await giro(b, i);
  const profilo = { provider: 'local', model: 'fixture', windowTokens: finestra(conta([{ role: 'user', content: grande(0) }]) * 3, 0.95), responseReserve: 2048, local: true };
  const lavoro = await b.engine.startCompaction({ sessionId: 'chat', sessionModel: profilo, idempotencyKey: 'giro-3' }); // copre il giro 1
  for (const i of [4, 5]) await giro(b, i); // il contesto cresce mentre il riassunto lavora
  sblocca();
  const fine = await b.engine.waitForCompaction({ sessionId: 'chat', jobId: lavoro.id });
  assert.equal(fine.state, 'committed', JSON.stringify(fine.error));
});

test('C1-VIVO-02: after a commit that is not enough, a second summary up to now starts at once (one more at most)', async (t) => {
  const b = await banco(t, { summarize: (request) => valida(request) });
  for (const i of [1, 2, 3]) await giro(b, i);
  // gli ultimi due giri: richieste LUNGHE della persona (le regole non le accorciano) — da sole superano il limite, quindi il primo
  // riassunto (giri 1-3) riduce ma non basta, e serve il secondo fino ad adesso
  const lunga = (i) => `Leggi il capitolo ${i} ${'parola '.repeat(8000)}`;
  for (const i of [4, 5]) { await b.aggiungi({ role: 'user', content: lunga(i) }); await b.aggiungi({ role: 'assistant', content: `Codice del capitolo ${i}` }); }
  const coda = conta([{ role: 'user', content: lunga(4) }, { role: 'user', content: lunga(5) }]);
  const profilo = { provider: 'local', model: 'fixture', windowTokens: finestra(coda, 1.25, 2048), responseReserve: 2048, local: true }; // la coda è il 125% del limite
  const preparata = await b.engine.prepareForRequest({ sessionId: 'chat', tools: [], sessionModel: profilo });
  const stato = await b.engine.getContextState({ sessionId: 'chat' });
  // review Y3 (bugfixer, 10/10): `readContextSnapshot` dà i lavori in ORDER BY id (uuid casuale): l'ordine nel tempo si ricostruisce qui
  const fatti = stato.jobs.filter((j) => j.state === 'committed').sort((x, y) => x.coveredThrough - y.coveredThrough || String(x.createdAt).localeCompare(String(y.createdAt)));
  assert.equal(fatti.length, 2, `the first commit, then one more up to now: ${JSON.stringify(stato.jobs.map((j) => [j.state, j.coveredThrough, j.error?.code]))}`);
  assert.ok(fatti[1].coveredThrough > fatti[0].coveredThrough, 'the second covers more');
  assert.ok(preparata.measurement.inputTokens > 0);
});

test('C1-VIVO-03: under pressure the big outputs of the recent part are shortened (head, tail, pointer), the latest stays whole, no model', async (t) => {
  const b = await banco(t, { summarize: () => { throw new Error('no summary expected'); } });
  for (const i of [1, 2, 3]) await giro(b, i);
  const messaggi = (await b.store.readOriginals({ sessionId: 'chat' })).map((r) => r.message);
  const profilo = { provider: 'local', model: 'fixture', windowTokens: finestra(conta(messaggi), 0.85), responseReserve: 2048, local: true }; // sopra lo 0,75
  const preparata = await b.engine.prepareForRequest({ sessionId: 'chat', tools: [], sessionModel: profilo });
  assert.equal(b.richieste.length, 0, 'the rules were enough: no summary');
  const esiti = preparata.messages.filter((m) => m.role === 'tool');
  assert.equal(esiti.length, 3, 'no output disappears');
  assert.match(esiti[0].content, /^uscita 1: dato /u, 'the head stays');
  assert.match(esiti[0].content, /fine 1$/u, 'the tail stays');
  assert.match(esiti[0].content, /characters omitted .*Recover it with conversation_search\./u);
  assert.equal(esiti[2].content, grande(3), 'the latest output stays whole');
  assert.ok(preparata.measurement.inputTokens < conta(messaggi));
});

/*
 * C1, review Y2 del bugfixer (10/10/2026): sotto pressione il motore accorciava le uscite che il modello ha appena chiesto e non
 * ha ancora letto (un giro di letture in parallelo: due su tre a 1.664 caratteri). Come Hermes (`agent/context_compressor.py`,
 * clone 865ba906): il giro in sospeso si risparmia salvo superare la quota dura, si accorcia dalle uscite più vecchie e ci si
 * ferma appena basta.
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
import { shortenRecentLargeOutputs } from '../src/tool-output-clearing.mjs';

const now = '2026-10-10T00:00:00.000Z';
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const grande = (etichetta) => `${etichetta}: riga dell'uscita\n`.repeat(260); // ~6.300 caratteri, come la sonda del bugfixer
const finestra = (tokens, ratio) => Math.ceil((tokens / ratio + 2048) / 0.85);

/** `vecchie` letture una alla volta, già lette (una risposta dopo ciascuna); poi UN giro di `parallele` letture, in sospeso. */
function storia({ vecchie = 5, parallele = 3 } = {}) {
  const m = [{ role: 'system', content: 'sistema' }, { role: 'user', content: 'Leggi i file e dimmi cosa non va' }];
  for (let i = 0; i < vecchie; i++) {
    m.push({ role: 'assistant', content: '', tool_calls: [{ id: `v${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `vecchio${i}.mjs` }) } }] });
    m.push({ role: 'tool', content: grande(`vecchia ${i}`), tool_call_id: `v${i}` });
    m.push({ role: 'assistant', content: `letto vecchio${i}` });
  }
  m.push({ role: 'assistant', content: '', tool_calls: Array.from({ length: parallele }, (_, i) => ({ id: `p${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `nuovo${i}.mjs` }) } })) });
  for (let i = 0; i < parallele; i++) m.push({ role: 'tool', content: grande(`in sospeso ${i}`), tool_call_id: `p${i}` });
  return m;
}
const intera = (m) => !/characters omitted/u.test(m.content);
const uscite = (messaggi, prefisso) => messaggi.filter((m) => m.role === 'tool' && m.tool_call_id.startsWith(prefisso));

test('C1-GIRO-01: the pending round of parallel reads stays whole under pressure; older outputs give way', () => {
  const { messages } = shortenRecentLargeOutputs(storia());
  assert.ok(uscite(messages, 'p').every(intera), 'the three outputs the model has not read yet stay whole');
  assert.ok(uscite(messages, 'v').every((m) => !intera(m)), 'with no limit on what to remove, every older output is shortened');
});

test('C1-GIRO-02: the other way round, a pending round larger than the hard share still gives way', () => {
  const { messages } = shortenRecentLargeOutputs(storia(), { spareLimitChars: 1000 });
  assert.ok(uscite(messages, 'p').some((m) => !intera(m)), 'a round over the share is not spared');
});

test('C1-GIRO-03: shortening starts from the OLDEST and stops as soon as enough is removed', () => {
  const { messages, shortened } = shortenRecentLargeOutputs(storia(), { removeChars: 3000 });
  const vecchie = uscite(messages, 'v');
  assert.equal(shortened, 1, 'one output is enough for 3,000 characters');
  assert.equal(intera(vecchie[0]), false, 'the oldest goes first');
  assert.ok(vecchie.slice(1).every(intera), 'the newer ones stay whole');
  assert.ok(uscite(messages, 'p').every(intera));
});

test('C1-GIRO-04: a history that does not end in a tool round keeps the old rule: the newest output whole, the rest shortened', () => {
  const m = storia({ parallele: 1 });
  m.push({ role: 'assistant', content: 'risposta' }); // the round is answered: nothing is pending
  const { messages } = shortenRecentLargeOutputs(m);
  const tutte = messages.filter((x) => x.role === 'tool');
  assert.ok(intera(tutte.at(-1)), 'the newest output stays whole');
  assert.ok(tutte.slice(0, -1).every((x) => !intera(x)));
});

async function motore(t, messaggi, ratio) {
  const pieno = Math.ceil(JSON.stringify({ messages: messaggi, tools: [] }).length / 4);
  const dir = await mkdtemp(join(tmpdir(), 'c1-giro-'));
  const store = createSqliteContextStore({ databasePath: join(dir, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const richieste = [];
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async (r) => { richieste.push(r); throw new Error('no summary expected'); } };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: m }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: sha({ messages, tools }), provider: m.provider, model: m.model }; } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => now, clearedToolPointer: 'Recover it with conversation_search.' });
  await store.initSession({ sessionId: 'chat', settings: parseContextSettings({}) });
  for (const [i, message] of messaggi.entries()) await engine.appendOriginal({ sessionId: 'chat', record: { id: `r${i}`, message, createdAt: now } });
  const profilo = { provider: 'local', model: 'fixture', windowTokens: finestra(pieno, ratio), responseReserve: 2048, local: true };
  const preparata = await engine.prepareForRequest({ sessionId: 'chat', messages: messaggi, tools: [], sessionModel: profilo });
  return { preparata, richieste, profilo };
}

test('C1-GIRO-ENGINE-SHARE: the other way round in the engine, a pending round over 20% of the window gives way (Hermes hard share)', async (t) => {
  const messaggi = storia({ vecchie: 0 });
  const { preparata, richieste, profilo } = await motore(t, messaggi, 0.78);
  const tondo = uscite(messaggi, 'p').reduce((n, m) => n + m.content.length, 0);
  assert.ok(tondo > profilo.windowTokens * 0.2 * 3.5, 'premise: the round is over the share');
  assert.equal(richieste.length, 0, 'no summary: the round gave way');
  assert.ok(uscite(preparata.messages, 'p').some((m) => !intera(m)));
});

test('C1-GIRO-ENGINE: just over the trigger, the engine shortens the oldest output, keeps newer ones and the whole pending round', async (t) => {
  const messaggi = storia();
  const pieno = Math.ceil(JSON.stringify({ messages: messaggi, tools: [] }).length / 4);
  const dir = await mkdtemp(join(tmpdir(), 'c1-giro-'));
  const store = createSqliteContextStore({ databasePath: join(dir, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const richieste = [];
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async (r) => { richieste.push(r); throw new Error('no summary expected'); } };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: m }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: sha({ messages, tools }), provider: m.provider, model: m.model }; } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => now, clearedToolPointer: 'Recover it with conversation_search.' });
  await store.initSession({ sessionId: 'chat', settings: parseContextSettings({}) });
  for (const [i, message] of messaggi.entries()) await engine.appendOriginal({ sessionId: 'chat', record: { id: `r${i}`, message, createdAt: now } });
  const profilo = { provider: 'local', model: 'fixture', windowTokens: finestra(pieno, 0.78), responseReserve: 2048, local: true };
  const preparata = await engine.prepareForRequest({ sessionId: 'chat', messages: messaggi, tools: [], sessionModel: profilo });
  assert.equal(richieste.length, 0, 'no summary: shortening is enough');
  assert.ok(uscite(preparata.messages, 'p').every(intera), 'the pending round reaches the model whole');
  const vecchie = uscite(preparata.messages, 'v');
  assert.equal(intera(vecchie[0]), false, 'the oldest output is shortened');
  assert.ok(vecchie.some(intera), 'it stops when enough: at least one older output stays whole');
});

/* Review Y2-bis (bugfixer, 10/10): K5 consegna dopo le uscite del giro un messaggio messo in coda dalla persona. */
for (const coda of [1, 2]) {
  test(`C1-GIRO-CODA-${coda}: ${coda} queued message(s) after the round do not answer it: the round stays whole`, () => {
    const m = storia();
    for (let i = 0; i < coda; i++) m.push({ role: 'user', content: `aggiunta in coda ${i}` });
    const { messages } = shortenRecentLargeOutputs(m);
    assert.ok(uscite(messages, 'p').every(intera));
    assert.ok(uscite(messages, 'v').every((x) => !intera(x)));
  });
}

test('C1-GIRO-CODA-ANSWERED: the other way round, tool → assistant → user: the round was answered, it can be shortened', () => {
  const m = storia({ vecchie: 0 });
  m.push({ role: 'assistant', content: 'letti' }, { role: 'user', content: 'e ora?' });
  const { messages } = shortenRecentLargeOutputs(m, { removeChars: Number.MAX_SAFE_INTEGER });
  assert.ok(uscite(messages, 'p').some((x) => !intera(x)), 'nothing is pending: the outputs can give way');
});

test('C1-GIRO-CODA-ENGINE: in the engine, a queued message after the round keeps the round whole under pressure', async (t) => {
  // il giro è l'UNICA cosa accorciabile (nessuna uscita vecchia, una richiesta lunga della persona) e sta sotto la quota del 20%
  const messaggi = [{ role: 'system', content: 'sistema' }, { role: 'user', content: 'Vincolo della persona. '.repeat(1800) }];
  messaggi.push({ role: 'assistant', content: '', tool_calls: [0, 1, 2].map((i) => ({ id: `p${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `nuovo${i}.mjs` }) } })) });
  for (let i = 0; i < 3; i++) messaggi.push({ role: 'tool', content: `in sospeso ${i}: riga
`.repeat(130), tool_call_id: `p${i}` });
  messaggi.push({ role: 'user', content: 'aggiunta in coda: guarda anche i test' });
  const { preparata, profilo } = await motore(t, messaggi, 0.78);
  const tondo = uscite(messaggi, 'p').reduce((n, m) => n + m.content.length, 0);
  assert.ok(tondo <= profilo.windowTokens * 0.2 * 3.5, 'premise: the round is under the share');
  assert.ok(uscite(messaggi, 'p').every((m) => m.content.length >= 2000), 'premise: each output is long enough to be shortened');
  assert.ok(uscite(preparata.messages, 'p').every(intera), 'the round the model has not read reaches it whole');
});

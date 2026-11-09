/*
 * Performance, 31/10/2026 (forma coi tre, `in-corso/PROPOSTA-STIMA-SENZA-CIFRATO-2026-10-31.md`): il blocco firmato del fornitore si conta al suo peso misurato, 12 byte a token,
 * non come testo. Su Luna, contato come testo, faceva scattare la pulitura a 60 mila token veri su 272 mila.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createContextEngine, PESO_DEL_BLOCCO_FIRMATO } from '../src/engine.mjs';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { parseContextSettings } from '../src/contracts.mjs';

const now = '2026-10-31T00:00:00.000Z';
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
/** The window whose input limit (heuristic margin 15%, reserve 2048: `profiles.mjs:6`) puts `tokens` at `ratio`. */
const finestra = (tokens, ratio) => Math.ceil((tokens / ratio + 2048) / 0.85);
const blocco = (byte) => ({ version: 1, provider: 'chatgpt', model: 'gpt-6-luna', content: [{ type: 'reasoning', text: '', providerMetadata: { openai: { reasoningEncryptedContent: 'c'.repeat(byte) } } }] });

/** One person message, then `n` call/output pairs: every answer carries a signed block of `firmati` bytes, every output `uscita` characters. */
function storia(n, { firmati, uscita = 20 }) {
  const messaggi = [{ role: 'system', content: 'sistema' }, { role: 'user', content: 'Leggi i file e dimmi cosa non va' }];
  for (let i = 0; i < n; i++) {
    const id = `c${i}`;
    messaggi.push({ role: 'assistant', content: '', tool_calls: [{ id, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `src/f${i}.mjs` }) } }], talos_provider_state: blocco(firmati) });
    messaggi.push({ role: 'tool', content: `uscita ${i} `.padEnd(uscita, 'x'), tool_call_id: id });
  }
  return messaggi;
}

/** The counter the plan really has: text at 3.5 bytes a token, the block at its own weight. */
function conta(messages, tools) {
  const firmati = messages.reduce((n, m) => n + (m.talos_provider_state ? JSON.stringify(m.talos_provider_state).length : 0), 0);
  const chiari = JSON.stringify({ messages: messages.map(({ talos_provider_state, ...resto }) => resto), tools }).length;
  return Math.ceil(chiari / 3.5) + Math.ceil(firmati / 12);
}

async function banco(t, messaggi, { windowTokens, ...opzioni }) {
  const dir = await mkdtemp(join(tmpdir(), 'stima-firmato-'));
  const store = createSqliteContextStore({ databasePath: join(dir, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const conteggi = { n: 0 };
  const richieste = [];
  const model = {
    resolveModel: async ({ sessionModel }) => sessionModel,
    summarize: async (request) => {
      richieste.push(request);
      /* a long prefix is summarised in segments: each summary cites a sentence really in a record it was given; the final merge cites the person's message */
      const ids = JSON.parse(request.messages.at(-1).content).sourceIds ?? [];
      const sourceId = ids.find((id) => id === 'r1' || Number(id.slice(1)) % 2 === 1) ?? 'r1';
      const n = Number(sourceId.slice(1));
      const quote = n === 1 ? 'Leggi i file' : `uscita ${(n - 3) / 2}`;
      return { text: JSON.stringify({ schema: 'talos.context.summary.v1', text: 'sintesi', goal: 'g', decisions: [], constraints: [], completed: [], pending: [], resources: [], sources: [{ recordId: sourceId, quote }] }), finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: m }) {
    conteggi.n += 1;
    return { schema: 'talos.context.tokens.v1', inputTokens: conta(messages, tools), windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: sha({ messages, tools }), provider: m.provider, model: m.model, estimatedMarginTokens: 0 };
  } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => now, ...opzioni });
  await store.initSession({ sessionId: 'chat', settings: parseContextSettings({}) });
  for (const [i, message] of messaggi.entries()) await engine.appendOriginal({ sessionId: 'chat', record: { id: `r${i}`, message, createdAt: now } });
  return { engine, conteggi, richieste, profilo: { provider: 'chatgpt', model: 'gpt-6-luna', windowTokens, responseReserve: 2048 } };
}

test('STIMA-FIRMATO-LEGGERO: tanti byte firmati, pochi token: la richiesta parte intera con un conteggio solo', async (t) => {
  const messaggi = storia(200, { firmati: 4000, uscita: 600 });
  const b = await banco(t, messaggi, { windowTokens: finestra(conta(messaggi, []), 0.5) });
  assert.ok(JSON.stringify(messaggi).length / 3.5 > finestra(conta(messaggi, []), 0.5), 'come testo non entrerebbe nemmeno nella finestra');
  const preparata = await b.engine.prepareForRequest({ sessionId: 'chat', messages: messaggi, tools: [], sessionModel: { ...b.profilo, singleSlot: true } });
  assert.equal(preparata.toolOutputsCleared ?? 0, 0);
  assert.equal(preparata.job, undefined);
  assert.equal(b.conteggi.n, 1, 'la stima rapida non apre la strada delle puliture');
  assert.deepEqual(preparata.messages.map((m) => m.talos_provider_state ?? null), messaggi.map((m) => m.talos_provider_state ?? null), 'il blocco parte intero');
});

test('STIMA-FIRMATO-PESA: il blocco non vale zero: è il suo peso a portare sopra la soglia, e si ripulisce prima di riassumere', async (t) => {
  const messaggi = storia(40, { firmati: 3000, uscita: 4000 });
  const senzaBlocco = conta(messaggi.map(({ talos_provider_state, ...resto }) => resto), []);
  const conBlocco = conta(messaggi, []);
  const windowTokens = finestra(conBlocco, 0.8);
  assert.ok(senzaBlocco < 0.75 * (conBlocco / 0.8), 'senza il blocco la richiesta starebbe sotto la soglia');
  const b = await banco(t, messaggi, { windowTokens });
  const preparata = await b.engine.prepareForRequest({ sessionId: 'chat', messages: messaggi, tools: [], sessionModel: { ...b.profilo, singleSlot: true } });
  assert.ok(preparata.toolOutputsCleared > 0, 'livello 1, nessun riassunto');
  assert.equal(b.richieste.length, 0);
});

test('STIMA-FIRMATO-INTERO: chi passa peso 1 conta il blocco come testo, come prima', async (t) => {
  const messaggi = storia(200, { firmati: 4000, uscita: 600 });
  const b = await banco(t, messaggi, { windowTokens: finestra(conta(messaggi, []), 0.5), pesoDelBloccoFirmato: 1 });
  await b.engine.prepareForRequest({ sessionId: 'chat', messages: messaggi, tools: [], sessionModel: { ...b.profilo, singleSlot: true } });
  assert.ok(b.conteggi.n > 1, 'la stima rapida vede i byte interi');
  assert.ok(PESO_DEL_BLOCCO_FIRMATO < 1);
});

test('STIMA-FIRMATO-PEGGIORE: sessione riaperta senza àncora, il cifrato da solo supera la finestra: finisce in una riduzione, mai in un errore', async (t) => {
  const messaggi = storia(300, { firmati: 12000 });
  const b = await banco(t, messaggi, { windowTokens: finestra(conta(messaggi, []), 1.1), guadagnoMinimoChiesto: 0 });
  assert.ok(conta(messaggi, []) > b.profilo.windowTokens - b.profilo.responseReserve - Math.ceil(b.profilo.windowTokens * 0.15), 'oltre il limite d’ingresso');
  const preparata = await b.engine.prepareForRequest({ sessionId: 'chat', messages: messaggi, tools: [], sessionModel: b.profilo });
  assert.ok(b.richieste.length > 0, 'è partito il riassunto');
  assert.ok(preparata.measurement.inputTokens < conta(messaggi, []) / 2, `${preparata.measurement.inputTokens}`);
  assert.ok(preparata.measurement.inputTokens <= b.profilo.windowTokens - b.profilo.responseReserve - Math.ceil(b.profilo.windowTokens * 0.15), 'entra');
});

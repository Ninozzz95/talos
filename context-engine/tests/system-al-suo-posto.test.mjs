/*
 * Cache del piano (CLI + desktop, 15/10/2026): un messaggio di sistema arrivato DOPO la storia — il «Project context update» che
 * l'agent-service appende quando la cartella cambia, la frase F-027 del confine che il kernel appende alla ripresa — deve restare
 * AL SUO POSTO. Il motore lo rimetteva in testa, prima del primo messaggio della persona: cambiava il prefisso a ogni giro con la
 * cartella cambiata, e con lui la chiave della cache del piano (misurato dalla CLI: 0 token in cache fra due giri).
 * Come Hermes, `agent/context_compressor.py:4633` (`head = 1 if messages[0].role == "system"`): in testa si protegge solo il blocco
 * di sistema iniziale, tutto il resto resta nell'ordine della conversazione. OpenAI «Prompt caching» (letto il 15/10/2026): la cache
 * vale solo per un prefisso ESATTO, il contenuto stabile va in testa e quello variabile in fondo.
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

const now = '2026-10-15T00:00:00.000Z';

async function banco(t) {
  const dir = await mkdtemp(join(tmpdir(), 'ctx-system-posto-'));
  const store = createSqliteContextStore({ databasePath: join(dir, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('nessun riassunto in questa prova'); } };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: m }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: createHash('sha256').update(JSON.stringify({ messages, tools })).digest('hex'), provider: m.provider, model: m.model }; } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => now });
  await store.initSession({ sessionId: 'chat', settings: parseContextSettings({}) });
  const profilo = { provider: 'local', model: 'fixture', windowTokens: 400_000, responseReserve: 2048, local: true };
  let n = 0;
  const aggiungi = async (messaggi) => { for (const message of messaggi) await engine.appendOriginal({ sessionId: 'chat', record: { id: `r${n++}`, message, createdAt: now } }); };
  const prepara = (messaggi) => engine.prepareForRequest({ sessionId: 'chat', messages: messaggi, tools: [], sessionModel: profilo });
  return { aggiungi, prepara };
}

const ruoli = (messaggi) => messaggi.map((m) => (typeof m.content === 'string' && m.content.startsWith('Project context update') ? 'system(update)' : m.role));
const finoAlPrimoUser = (messaggi) => messaggi.slice(0, messaggi.findIndex((m) => m.role === 'user') + 1);

test('CTX-SYSTEM-01 — un system arrivato dopo la storia resta AL SUO POSTO; in testa solo il blocco iniziale', async (t) => {
  const b = await banco(t);
  const giro1 = [{ role: 'system', content: 'istruzioni' }, { role: 'system', content: 'Structure of «demo»: 5 files.' }, { role: 'user', content: 'Reply with exactly: one' }];
  await b.aggiungi(giro1);
  const primo = await b.prepara(giro1);
  const giro2 = [...giro1, { role: 'assistant', content: 'one' }, { role: 'system', content: 'Project context update: the following REPLACES the folder map.\n\nStructure of «demo»: 6 files.' }, { role: 'user', content: 'Reply with exactly: two' }];
  await b.aggiungi(giro2.slice(giro1.length));
  const secondo = await b.prepara(giro2);
  assert.deepEqual(ruoli(secondo.messages), ['system', 'system', 'user', 'assistant', 'system(update)', 'user'], 'the update stays where the conversation put it');
  assert.deepEqual(finoAlPrimoUser(secondo.messages), finoAlPrimoUser(primo.messages), 'the prefix up to the first person message does not change: the plan cache holds');
});

test('CTX-SYSTEM-02 AL CONTRARIO — senza system tardi la richiesta è identica a prima (testa di sistema, poi la conversazione)', async (t) => {
  const b = await banco(t);
  const messaggi = [{ role: 'system', content: 'istruzioni' }, { role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ciao!' }, { role: 'user', content: 'e adesso?' }];
  await b.aggiungi(messaggi);
  const preparata = await b.prepara(messaggi);
  assert.deepEqual(preparata.messages, messaggi);
});

/*
 * RIP-4 (ripassata del Blocco 21, 01/11/2026): la firma di un riassunto a più pezzi è dell'autore del testo salvato, cioè dell'ultimo pezzo valido.
 * Da due pezzi in su l'ultima chiamata è la fusione finale (`engine.mjs`, riduzione a coppie): qui lo si prova sul testo salvato, non solo sulla firma.
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

const profilo = { provider: 'openrouter', model: 'controlled-fixture', windowTokens: 16384, responseReserve: 2048 };
const ora = '2026-11-01T00:00:00.000Z';
const CONSEGNA = 'Database SQLite: leggi i dieci file e dimmi cosa contengono.';
const lettura = (k) => ({ role: 'assistant', content: null, tool_calls: [{ id: `c${k}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `f${k}.txt` }) } }] });
const risultato = (k) => ({ role: 'tool', tool_call_id: `c${k}`, content: [{ type: 'text', text: `file ${k}: ${'riga di contenuto '.repeat(400)}` }] });
const PROVENIENZA = { riassuntoDi: 'anthropic:riserva', dallaRiserva: true, nonDisponibile: { modello: 'openai:scelto', stato: 'bloccato', motivo: 'limite' } };

async function scena(t, risposta, { faultPoint } = {}) {
  const cartella = await mkdtemp(join(tmpdir(), 'tcec-rev21-'));
  const store = createSqliteContextStore({ databasePath: join(cartella, 'context.sqlite'), ...(faultPoint ? { faultPoint } : {}) });
  await store.initSession({ sessionId: 's', settings: parseContextSettings({ auto: true, triggerRatio: 0.5, targetRatio: 0.49 }) });
  const chiamate = [];
  const summarize = async (richiesta) => {
    const sourceIds = JSON.parse(richiesta.messages.at(-1).content).sourceIds ?? [];
    const sourceId = sourceIds.find((id) => id === 'u0' || id.startsWith('t')) ?? 'u0';
    const quote = sourceId === 'u0' ? 'Database SQLite' : `file ${sourceId.slice(1)}:`;
    chiamate.push(1);
    const valido = JSON.stringify({ schema: 'talos.context.summary.v1', text: `Pezzo ${chiamate.length}.`, goal: 'Leggere i file', decisions: [], constraints: [], completed: ['letti'], pending: [], resources: [], sources: [{ recordId: sourceId, quote }] });
    return risposta({ valido, numero: chiamate.length });
  };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: profile }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: profile.windowTokens, responseReserve: profile.responseReserve, method: 'heuristic', exact: false, requestHash: createHash('sha256').update(JSON.stringify({ messages, tools })).digest('hex'), provider: profile.provider, model: profile.model }; } };
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize }, tokenCounter, clock: () => ora });
  const aggiungi = (id, message) => engine.appendOriginal({ sessionId: 's', record: { id, message, createdAt: ora } });
  await aggiungi('s0', { role: 'system', content: 'Sei un assistente.' });
  await aggiungi('u0', { role: 'user', content: CONSEGNA });
  for (let k = 1; k <= 10; k += 1) { await aggiungi(`a${k}`, lettura(k)); await aggiungi(`t${k}`, risultato(k)); }
  await aggiungi('r0', { role: 'assistant', content: 'Letti tutti e dieci.' });
  await aggiungi('u1', { role: 'user', content: 'Grazie, e adesso?' });
  await aggiungi('r1', { role: 'assistant', content: 'Niente altro.' });
  t.after(async () => { await store.close(); await rm(cartella, { recursive: true, force: true }); });
  return { engine, store, chiamate };
}
const compatta = async ({ engine }) => {
  const job = await engine.startCompaction({ sessionId: 's', idempotencyKey: 'k1', kind: 'compact', sessionModel: profilo });
  for (let i = 0; i < 400; i += 1) {
    const stato = (await engine.getContextState({ sessionId: 's' })).jobs.find((j) => j.id === job.id);
    if (['committed', 'failed', 'cancelled', 'paused'].includes(stato?.state)) return stato;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('il lavoro non finisce');
};
const versioni = async ({ store }) => (await store.readContextOutbox({ sessionId: 's', limit: 50 })).filter((e) => e.kind === 'context.version.committed');

const ok = (valido) => ({ text: valido, finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 } });

test('RIP21-E — più pezzi: la riserva scrive il primo, il modello scelto scrive tutti gli altri e la fusione finale: la firma dice che il modello era indisponibile', async (t) => {
  const s = await scena(t, ({ valido, numero }) => (numero === 1 ? { ...ok(valido), provenienza: PROVENIENZA } : ok(valido)));
  const job = await compatta(s);
  assert.equal(job.state, 'committed');
  assert.ok(s.chiamate.length >= 2, `premessa: più chiamate, ${s.chiamate.length}`);
  const [v] = await versioni(s);
  assert.equal(v.payload.provenienza, undefined, 'il testo salvato l\'ha scritto il modello scelto all\'ultimo passo');
});

const testoSalvato = async ({ store }) => (await store.readContextSnapshot({ sessionId: 's' })).activeVersion.summary.text;

test('RIP22-E2 — il testo salvato è quello dell\'ultima chiamata, ed è lei che firma: la riserva scrive solo la fusione finale e la firma c\'è', async (t) => {
  const prova = await scena(t, ({ valido }) => ok(valido));
  await compatta(prova);
  const ultima = prova.chiamate.length;
  assert.ok(ultima >= 3, `premessa: pezzi e fusione, ${ultima}`);
  assert.equal(await testoSalvato(prova), `Pezzo ${ultima}.`, 'il testo salvato è dell\'ultima chiamata');
  const s = await scena(t, ({ valido, numero }) => (numero === ultima ? { ...ok(valido), provenienza: PROVENIENZA } : ok(valido)));
  assert.equal((await compatta(s)).state, 'committed');
  const [v] = await versioni(s);
  assert.deepEqual(v.payload.provenienza, PROVENIENZA);
  assert.equal(await testoSalvato(s), `Pezzo ${ultima}.`);
});

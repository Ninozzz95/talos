/*
 * Revisione del blocco 25, R2 — condizione del Mobile (01/11/2026 sera). La tabella del contratto dice «consenso: no, oscurata: no» per i riassunti del motore del
 * contesto (`session.context`, `session.context.versions`): è vero SOLO se chi scrive il riassunto riceve gli stessi messaggi del trascritto, mai il prompt di sistema,
 * la memoria o le regole del progetto (nel nucleo sono tutti `system`: `talosHarness.mjs:14475`, `:14499`, `:14518`). Il motore li toglie due volte: il piano dei pezzi
 * salta `system`/`developer` (`compaction-planner.mjs:51`) e la richiesta porta solo l'istruzione e i pezzi (`summary.mjs:22-34`).
 * Questa prova lo fissa: il segnaposto di un prompt di sistema non compare MAI nell'ingresso del riassuntore, e (controllo positivo) quello di un messaggio della persona sì.
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

const now = '2026-11-01T00:00:00.000Z';
const profilo = { provider: 'local', model: 'fixture', windowTokens: 131072, responseReserve: 2048, local: true };
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const DI_SISTEMA = 'SEGNAPOSTO-DEL-PROMPT-DI-SISTEMA-7f3a';
const DELLA_MEMORIA = 'SEGNAPOSTO-DELLA-MEMORIA-b21c';
const DEL_PROGETTO = 'SEGNAPOSTO-DEL-PROGETTO-e9d0';
const DELLA_PERSONA = 'SEGNAPOSTO-DELLA-PERSONA-41aa';

test('REV25-RIASSUNTORE-MOTORE: il riassunto del motore del contesto non riceve mai prompt di sistema, memoria né regole del progetto', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'rev25-riassuntore-'));
  const store = createSqliteContextStore({ databasePath: join(dir, 'context.sqlite') });
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const ingressi = [];
  const model = {
    resolveModel: async ({ sessionModel }) => sessionModel,
    summarize: async ({ messages }) => {
      ingressi.push(JSON.stringify(messages));
      return { text: JSON.stringify({ schema: 'talos.context.summary.v1', text: 'sintesi', goal: 'g', decisions: [], constraints: [], completed: [], pending: [], resources: [], sources: [{ recordId: 'u1', quote: `chiedo ${DELLA_PERSONA}` }] }), finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
  const tokenCounter = { async countPreparedContext({ messages, tools, model: m }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: m.windowTokens, responseReserve: m.responseReserve, method: 'heuristic', exact: false, requestHash: sha({ messages, tools }), provider: m.provider, model: m.model }; } };
  const engine = createContextEngine({ store, model, tokenCounter, clock: () => now, guadagnoMinimoChiesto: 0 });
  await store.initSession({ sessionId: 'chat', settings: parseContextSettings({}) });
  const lungo = ' ' + 'dettaglio '.repeat(300);
  const messaggi = [
    { id: 's0', message: { role: 'system', content: `You are TALOS. ${DI_SISTEMA}` } },
    { id: 's1', message: { role: 'system', content: `Project context: ${DEL_PROGETTO}` } },
    { id: 's2', message: { role: 'developer', content: `Memory: ${DELLA_MEMORIA}` } },
    { id: 'u1', message: { role: 'user', content: `chiedo ${DELLA_PERSONA} una cosa` } },
    { id: 'a1', message: { role: 'assistant', content: `ok${lungo}` } },
    /* un `system` a metà storia (il «Project context update» dell'agent-service): anche lui fuori */
    { id: 's3', message: { role: 'system', content: `Project context update: ${DEL_PROGETTO}` } },
    { id: 'u2', message: { role: 'user', content: `seconda${lungo}` } },
    { id: 'a2', message: { role: 'assistant', content: `fatto${lungo}` } },
  ];
  for (const { id, message } of messaggi) await engine.appendOriginal({ sessionId: 'chat', record: { id, message, createdAt: now } });
  const job = await engine.startCompaction({ sessionId: 'chat', sessionModel: profilo, idempotencyKey: 'k' });
  const fine = await engine.waitForCompaction({ sessionId: 'chat', jobId: job.id });
  assert.equal(fine.state, 'committed', JSON.stringify(fine.error));
  assert.ok(ingressi.length > 0, 'controllo positivo: il riassuntore è stato chiamato');
  const tutto = ingressi.join('\n');
  assert.ok(tutto.includes(DELLA_PERSONA), 'controllo positivo: i messaggi della persona arrivano (la cattura funziona)');
  for (const segnaposto of [DI_SISTEMA, DEL_PROGETTO, DELLA_MEMORIA]) assert.ok(!tutto.includes(segnaposto), `⛔ ${segnaposto} è arrivato al riassuntore`);
});

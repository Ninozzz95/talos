/*
 * F2 della CLI (prima revisione della 0.6.8, 16/10/2026, S2): `service.close` annullava solo i lavori chiesti a mano (`/jobs`); un
 * riassunto AUTOMATICO in volo (il `…-turn-bg` della fine di un giro lungo) continuava mentre l'archivio si chiudeva, e `talos -p`
 * restava vivo fino alla sua fine (60 s misurati sul costruito) per poi buttarlo. Qui il riassunto non finisce mai da solo: chi chiude
 * deve fermarlo, e aspettarlo.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';

const contatore = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }) };
const MODELLO = { provider: 'local', model: 'test', windowTokens: 200_000, responseReserve: 2048 };
const STORIA = [
  { role: 'system', content: 'Sei un assistente.' },
  { role: 'user', content: 'primo' }, { role: 'assistant', content: 'uno' },
  { role: 'user', content: 'secondo' }, { role: 'assistant', content: 'due' },
  { role: 'user', content: 'terzo' }, { role: 'assistant', content: 'tre' },
  { role: 'user', content: 'quarto' },
];

test('SERV-CHIUDE-01 — close ferma anche un riassunto AUTOMATICO in volo, e lo aspetta: il processo non resta appeso', async (t) => {
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close().catch(() => {}));
  let segnaleDelRiassunto = null;
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: (request) => new Promise((_, rifiuta) => {
    segnaleDelRiassunto = request.signal ?? null;
    request.signal?.addEventListener('abort', () => rifiuta(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }) };
  const engine = createContextEngine({ store, model, tokenCounter: contatore, clock: () => '2026-10-16T08:00:00.000Z' });
  const service = createDesktopContextService({ store, engine, readSession: id => id === 'chat' ? { sessionId: id, modello: 'local:test' } : null, isSessionEnabled: id => id === 'chat', resolveSessionModel: async () => MODELLO, clock: () => '2026-10-16T08:00:00.000Z' });
  await service.prepare({ sessionId: 'chat', messages: STORIA });
  // il riassunto automatico, come quello che il motore fa partire da solo (non un `/jobs` di chi chiama)
  const lavoro = await engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'auto-1-x-turn-bg', sessionModel: MODELLO });
  for (let i = 0; i < 20 && !segnaleDelRiassunto; i += 1) await new Promise((r) => setTimeout(r, 10));
  assert.ok(segnaleDelRiassunto, 'premessa: il riassunto è in volo e aspetta il modello');
  const inizio = Date.now();
  const chiusa = await Promise.race([service.close().then(() => 'chiusa'), new Promise((r) => setTimeout(() => r('appesa'), 2000))]);
  assert.equal(chiusa, 'chiusa', 'close resta appesa al riassunto');
  assert.ok(Date.now() - inizio < 2000);
  assert.equal(segnaleDelRiassunto.aborted, true, 'la chiamata del riassunto è stata fermata, non lasciata andare');
  const stato = (await store.readContextJob({ sessionId: 'chat', jobId: lavoro.id }))?.state;
  assert.equal(stato, 'cancelled', `il lavoro è chiuso: ${stato}`);
});

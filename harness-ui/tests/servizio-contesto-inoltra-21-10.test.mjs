/*
 * 21/10/2026 — il servizio del contesto inoltra i campi uno per uno (`hooks.prepare` → `api.prepare` → `engine.prepareForRequest`):
 * un campo nuovo che si perde a metà non dà nessun errore (la lezione del 17/10, «un'opzione nuova si prova lungo tutto il filo»).
 * Qui i due della riga viva: `summaryCeilingMs` (A1, il tetto del riassunto atteso) e `onInTurnWait` (B1 sulla strada del motore).
 * Servizio vero, archivio vero, motore vero con una spia su `prepareForRequest`. Nessuna rete.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';

const contatore = { countPreparedContext: async ({ messages, tools, model }) => ({ schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: model.provider, model: model.model }) };
const MODELLO = { provider: 'local', model: 'test', windowTokens: 200_000, responseReserve: 2048 };
const ORA = '2026-10-21T08:00:00.000Z';

function scena(t) {
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close());
  const vero = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('non serve'); } }, tokenCounter: contatore, clock: () => ORA });
  const visti = [];
  const engine = { ...vero, prepareForRequest: async (argomenti) => { visti.push(argomenti); return vero.prepareForRequest(argomenti); } };
  const service = createDesktopContextService({ store, engine, readSession: (id) => (id === 'chat' ? { sessionId: id, modello: 'local:test' } : null), isSessionEnabled: (id) => id === 'chat', resolveSessionModel: async () => MODELLO, clock: () => ORA });
  t.after(() => service.close());
  return { service, visti };
}
const messaggi = [{ role: 'system', content: 'Sei un assistente.' }, { role: 'user', content: 'ciao' }];

test('INOLTRO-01 summaryCeilingMs e onInTurnWait arrivano al motore attraverso il servizio', async (t) => {
  const { service, visti } = scena(t);
  const hooks = await service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
  const ascolta = () => {};
  await hooks.capture({ messages: messaggi });
  await hooks.prepare({ messages: messaggi, originali: messaggi, tools: [], summaryCeilingMs: 1_234, onInTurnWait: ascolta });
  assert.equal(visti.length, 1);
  assert.equal(visti[0].summaryCeilingMs, 1_234);
  assert.equal(visti[0].onInTurnWait, ascolta);
});

test('INOLTRO-02 verso contrario: senza i due campi, o con valori non validi, al motore non arrivano', async (t) => {
  const { service, visti } = scena(t);
  const hooks = await service.createKernelHooks({ sessionId: 'chat', runId: 'giro-1' });
  await hooks.capture({ messages: messaggi });
  await hooks.prepare({ messages: messaggi, originali: messaggi, tools: [] });
  await hooks.prepare({ messages: messaggi, originali: messaggi, tools: [], summaryCeilingMs: -5, onInTurnWait: 'non una funzione' });
  assert.equal(visti.length, 2);
  for (const v of visti) {
    assert.equal(Object.hasOwn(v, 'summaryCeilingMs'), false);
    assert.equal(Object.hasOwn(v, 'onInTurnWait'), false);
  }
});

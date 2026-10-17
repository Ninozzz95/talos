/*
 * ⛔ 16/10/2026 (S2, trovato dalla CLI col suo bugfixer sul `composeTalosRuntime` vero) — la cura del contatore (f92bbdff7) restituisce
 *   la stima con `fallback: <codice>`, e il contratto del motore del contesto (`TokenMeasurementV1`, `z.strictObject`) non lo
 *   conosceva: ogni stima di ripiego diventava `unrecognized_keys: fallback` e il giro FALLIVA, cioè il contrario di ciò che la cura
 *   voleva. Le prove del contatore non lo vedevano perché provavano il contatore da solo, mai insieme al motore.
 * ⇒ Qui il contatore VERO dentro il motore VERO (`createContextEngine` + `createDesktopContextService`, come c1-ultima-richiesta),
 *   per ognuno dei suoi guasti. Ogni controllo anche AL CONTRARIO.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createContextTokenCounter } from '../src/context-token-counters.mjs';
import { createDesktopContextService } from '../src/context-desktop-service.mjs';
import { createSqliteContextStore } from '../../context-engine/src/node/sqlite-store.mjs';
import { createContextEngine } from '../../context-engine/src/engine.mjs';
import { TokenMeasurementV1 } from '../../context-engine/src/contracts.mjs';

const appeso = (_url, { signal }) => new Promise((_, rifiuta) => { signal.addEventListener('abort', () => rifiuta(signal.reason), { once: true }); });
const GUASTI = {
  CTX_TOKEN_TIMEOUT: appeso,
  CTX_TOKEN_NETWORK: async () => { throw new Error('connessione rifiutata'); },
  CTX_TOKEN_HTTP: async () => Response.json({}, { status: 503 }),
  CTX_TOKEN_RESPONSE_INVALID: async () => Response.json({ object: 'response', output: [] }),
};

async function preparaCol(t, fetchFn) {
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close());
  const tokenCounter = createContextTokenCounter({ resolveProfile: async () => ({ baseURL: 'http://127.0.0.1:9000/v1' }), fetchFn, tempoMassimoMs: 50 });
  const misure = [];
  const engine = createContextEngine({ store, model: { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async () => { throw new Error('non serve'); } },
    tokenCounter: { countPreparedContext: async (richiesta) => { const m = await tokenCounter.countPreparedContext(richiesta); misure.push(m); return m; } },
    clock: () => '2026-10-16T00:00:00.000Z' });
  const service = createDesktopContextService({ store, engine, readSession: (id) => (id === 'chat' ? { sessionId: id, modello: 'local:test' } : null), isSessionEnabled: (id) => id === 'chat',
    resolveSessionModel: async () => ({ provider: 'local', model: 'test', windowTokens: 16384, responseReserve: 2048 }), clock: () => '2026-10-16T00:00:00.000Z' });
  t.after(() => service.close());
  const hooks = await service.createKernelHooks({ sessionId: 'chat', runId: 'run-1' });
  const messaggi = [{ role: 'system', content: 'sistema' }, { role: 'user', content: 'ciao' }];
  return { preparata: await hooks.prepare({ messages: messaggi, originali: messaggi, tools: [] }), misure };
}

for (const [codice, fetchFn] of Object.entries(GUASTI)) {
  test(`CONTATORE-NEL-MOTORE — ${codice}: il motore accetta la stima di ripiego e la richiesta si prepara`, async (t) => {
    const { preparata, misure } = await preparaCol(t, fetchFn);
    assert.ok(Array.isArray(preparata.messages), 'la richiesta si è preparata');
    assert.ok(misure.length > 0 && misure.every((m) => m.method === 'heuristic' && m.fallback === codice), JSON.stringify(misure.map((m) => [m.method, m.fallback])));
  });
}

test('CONTATORE-NEL-MOTORE — il contratto conosce `fallback` solo come codice del contatore; AL CONTRARIO un campo inventato resta rifiutato', () => {
  const base = { schema: 'talos.context.tokens.v1', inputTokens: 10, windowTokens: 100, responseReserve: 10, method: 'heuristic', exact: false, requestHash: 'a'.repeat(64), provider: 'local', model: 'test' };
  assert.equal(TokenMeasurementV1.parse({ ...base, fallback: 'CTX_TOKEN_TIMEOUT' }).fallback, 'CTX_TOKEN_TIMEOUT');
  assert.equal(TokenMeasurementV1.safeParse({ ...base, fallback: 'qualunque testo' }).success, false);
  assert.equal(TokenMeasurementV1.safeParse({ ...base, inventato: 1 }).success, false);
  assert.equal(TokenMeasurementV1.safeParse({ ...base, method: 'provider', exact: true, fallback: 'CTX_TOKEN_HTTP' }).success, false, 'un ripiego è sempre una stima');
});

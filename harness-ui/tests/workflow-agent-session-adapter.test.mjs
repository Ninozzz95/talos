// F3-32 (25/09/2026) — l'adattatore `agent-session` da solo, con un ponte finto: i rami che l'integrazione non tocca
// (riconciliazione dopo un crollo, annullamento, rifiuti, esito non durevole, forma v1, consegna con troncamenti).
import assert from 'node:assert/strict';
import test from 'node:test';

import { consegnaDelPasso, createAgentSessionAdapter } from '../src/workflow/adapters/agent-session.mjs';

const IDENTITA = { runId: '11111111-1111-4111-8111-111111111111', nodeId: 'leggi', activityExecutionId: '22222222-2222-4222-8222-222222222222',
  attempt: 1, leaseId: '33333333-3333-4333-8333-333333333333', leaseEpoch: 1 };
const PASSO = { id: 'leggi', kind: 'agent', label: 'Leggi', instructions: 'Leggi note.md.', capabilityProfile: 'read',
  modelPolicy: { mode: 'inherit', model: null, reasoning: null } };

function ponteFinto({ avvio, esito, trovata = null, letto = null } = {}) {
  const chiamate = { avvia: [], ferma: [] };
  return {
    chiamate,
    avviaSessioneDiPasso(input) { chiamate.avvia.push(input); return avvio ?? { sessionId: 'sess-1', modello: 'z-ai/glm-5.3-flash', fine: esito }; },
    async leggiEsitoSessioneDiPasso() { return letto; },
    trovaSessioneDiPasso() { return trovata; },
    ferma(id) { chiamate.ferma.push(id); },
  };
}
const fatti = () => { const scritti = []; return { scritti, recordSessionFact: async (type, payload) => { scritti.push({ type, payload }); } }; };
const ctx = (extra = {}) => ({ ...IDENTITA, outcomeSchemaVersion: 2, step: PASSO, run: { rootSessionId: 'radice', sessionModel: 'z-ai/glm-5.3-flash' },
  predecessors: { items: [], omitted: 0 }, ...fatti(), ...extra });
const ESITO_OK = { esito: 'succeeded', sequenzaTerminale: 9, testoFinale: 'fatto', codiceErrore: null,
  consumo: { promptTokens: 1, completionTokens: 1, toolCalls: 0, modelRequests: 1, knownCostUsd: null } };

test('WF-AGENT-ADAPTER-REFUSES: a step that is not a read-only agent never starts a session', async () => {
  for (const passo of [{ ...PASSO, kind: 'test' }, { ...PASSO, capabilityProfile: 'workspace-write' }]) {
    const ponte = ponteFinto();
    const esito = await createAgentSessionAdapter({ sessions: ponte }).execute(ctx({ step: passo }));
    assert.equal(esito.status, 'failed');
    assert.equal(esito.errorClass, 'validation');
    assert.equal(ponte.chiamate.avvia.length, 0);
  }
  const radiceSparita = ponteFinto({ avvio: { erroreAvvio: 'x', code: 'WORKFLOW_ROOT_SESSION_NOT_FOUND' } });
  const esito = await createAgentSessionAdapter({ sessions: radiceSparita }).execute(ctx());
  assert.deepEqual(esito, { status: 'failed', errorClass: 'validation', retryable: false, evidenceResultIds: [], receiptRef: null, actualUsage: null });
});

test('WF-AGENT-ADAPTER-NOT-DURABLE: a session whose end is not on disk is uncertain, never completed', async () => {
  const fine = Promise.reject(Object.assign(new Error('no'), { code: 'WORKFLOW_STEP_TERMINAL_NOT_DURABLE' }));
  const contesto = ctx();
  const esito = await createAgentSessionAdapter({ sessions: ponteFinto({ esito: fine }) }).execute(contesto);
  assert.deepEqual(esito, { status: 'uncertain', reasonClass: 'receipt_missing', observedReceiptRef: 'talos-session:sess-1', actualUsage: null });
  assert.deepEqual(contesto.scritti.map((f) => f.type), ['agent_session_created'], 'no finished fact for an end that is not proven');
});

test('WF-AGENT-ADAPTER-OUTCOMES: cancelled and failed sessions map to typed failures, the model follows the step', async () => {
  const annullata = await createAgentSessionAdapter({ sessions: ponteFinto({ esito: Promise.resolve({ ...ESITO_OK, esito: 'cancelled' }) }) }).execute(ctx());
  assert.equal(annullata.errorClass, 'cancelled');
  assert.equal(annullata.receiptRef, 'talos-session:sess-1#9');
  const fallita = await createAgentSessionAdapter({ sessions: ponteFinto({ esito: Promise.resolve({ ...ESITO_OK, esito: 'failed', codiceErrore: 'PROVIDER_REQUEST_ERROR' }) }) }).execute(ctx());
  assert.equal(fallita.errorClass, 'internal');
  const ponte = ponteFinto({ esito: Promise.resolve(ESITO_OK) });
  await createAgentSessionAdapter({ sessions: ponte }).execute(ctx({ step: { ...PASSO, modelPolicy: { mode: 'explicit', model: 'openai/gpt-5-nano', reasoning: null } } }));
  assert.equal(ponte.chiamate.avvia[0].modello, 'openai/gpt-5-nano', 'an explicit step model wins over the session model');
  assert.deepEqual(ponte.chiamate.avvia[0].legame, IDENTITA);
});

test('WF-AGENT-ADAPTER-V1-SHAPE: a v1 activity gets a v1 outcome (no usage, no receipt on failures)', async () => {
  const esito = await createAgentSessionAdapter({ sessions: ponteFinto({ esito: Promise.resolve(ESITO_OK) }) }).execute(ctx({ outcomeSchemaVersion: 1 }));
  assert.equal(esito.status, 'completed');
  assert.equal(Object.hasOwn(esito, 'actualUsage'), false);
  const fallito = await createAgentSessionAdapter({ sessions: ponteFinto() }).execute(ctx({ outcomeSchemaVersion: 1, step: { ...PASSO, kind: 'test' } }));
  assert.deepEqual(Object.keys(fallito).sort(), ['errorClass', 'evidenceResultIds', 'retryable', 'status']);
});

/*
 * F3-41c (25/09/2026) — decisioni owner «lo rifaccio da solo» e «i token del tentativo interrotto contano»: una sessione
 *   trovata e NON più viva è un tentativo provato INTERROTTO, col consumo del suo file; mai «completato» senza il suo risultato
 *   (la risposta non è un risultato registrato nel Workflow). Viva o in v1: resta `still_unknown`.
 */
test('WF-AGENT-RESTART-RECONCILE (adapter side): no session is not performed; a finished session is interrupted with its usage; a live one is still unknown', async () => {
  const nessuna = await createAgentSessionAdapter({ sessions: ponteFinto({ trovata: null }) }).reconcile({ ...IDENTITA, outcomeSchemaVersion: 2 });
  assert.deepEqual(nessuna, { outcome: 'proved_not_performed', receiptRef: null, resultIds: [], actualUsage: null });
  const consumo = { promptTokens: 700, completionTokens: 40, toolCalls: 2, modelRequests: 3, knownCostUsd: null };
  const finita = await createAgentSessionAdapter({ sessions: ponteFinto({ trovata: 'sess-1', letto: { esito: 'succeeded', sequenzaTerminale: 12, consumo } }) })
    .reconcile({ ...IDENTITA, outcomeSchemaVersion: 2 });
  assert.deepEqual(finita, { outcome: 'proved_interrupted', receiptRef: 'talos-session:sess-1#12', resultIds: [],
    actualUsage: { promptTokens: 700, completionTokens: 40, wallMs: 0, agentSeconds: 0, toolCalls: 2, modelRequests: 3, knownCostUsd: null } });
  const senzaFine = await createAgentSessionAdapter({ sessions: ponteFinto({ trovata: 'sess-1', letto: { esito: 'interrupted', sequenzaTerminale: null, consumo } }) })
    .reconcile({ ...IDENTITA, outcomeSchemaVersion: 2 });
  assert.equal(senzaFine.outcome, 'proved_interrupted');
  assert.equal(senzaFine.receiptRef, 'talos-session:sess-1', 'no terminal sequence: the receipt is the session itself');
  const viva = await createAgentSessionAdapter({ sessions: ponteFinto({ trovata: 'sess-1', letto: { esito: 'in-corso', sequenzaTerminale: null, consumo } }) })
    .reconcile({ ...IDENTITA, outcomeSchemaVersion: 2 });
  assert.deepEqual(viva, { outcome: 'still_unknown', receiptRef: null, resultIds: [], actualUsage: null });
  const interrottaV1 = await createAgentSessionAdapter({ sessions: ponteFinto({ trovata: 'sess-1', letto: { esito: 'interrupted', sequenzaTerminale: null, consumo } }) })
    .reconcile({ ...IDENTITA, outcomeSchemaVersion: 1 });
  assert.deepEqual(interrottaV1, { outcome: 'still_unknown', receiptRef: null, resultIds: [] }, 'v1 has no usage to prove: unchanged');
  const fileSparito = await createAgentSessionAdapter({ sessions: ponteFinto({ trovata: 'sess-1', letto: null }) }).reconcile({ ...IDENTITA, outcomeSchemaVersion: 2 });
  assert.equal(fileSparito.outcome, 'still_unknown', 'a session whose file cannot be read is not proven interrupted');
});

test('WF-AGENT-CANCEL: a live step is stopped and awaited; nothing running is already cancelled', async () => {
  let chiudi;
  const fine = new Promise((resolve) => { chiudi = resolve; });
  const ponte = ponteFinto({ esito: fine });
  const adattatore = createAgentSessionAdapter({ sessions: ponte });
  const esecuzione = adattatore.execute(ctx());
  await new Promise((r) => setImmediate(r));
  let annullato = false;
  const annullamento = adattatore.cancel({ ...IDENTITA }).then((valore) => { annullato = true; return valore; });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(ponte.chiamate.ferma, ['sess-1']);
  assert.equal(annullato, false, 'cancel waits for the session to end');
  chiudi({ ...ESITO_OK, esito: 'cancelled' });
  assert.deepEqual(await annullamento, { outcome: 'cancelled', evidenceResultIds: [] });
  assert.equal((await esecuzione).errorClass, 'cancelled');
  assert.deepEqual(await createAgentSessionAdapter({ sessions: ponteFinto() }).cancel({ ...IDENTITA }), { outcome: 'cancelled', evidenceResultIds: [] });
});

test('WF-AGENT-CONSEGNA: predecessors come as snapshots, truncation and omissions are said, failed steps say so', () => {
  const testo = consegnaDelPasso(PASSO, { omitted: 3, items: [
    { nodeId: 'a', label: 'Passo A', state: 'succeeded', completedAt: '2026-09-25T08:00:00.000Z', results: [{ summary: 'Risposta A', bytes: 9_000, truncated: true }] },
    { nodeId: 'b', label: 'Passo B', state: 'failed', completedAt: null, results: [] },
    { nodeId: 'c', label: 'Passo C', state: 'succeeded', completedAt: null, results: [] },
  ] });
  assert.ok(testo.startsWith('Leggi note.md.'));
  assert.match(testo, /### Passo A \(a\) — finished 2026-09-25T08:00:00\.000Z\nRisposta A\n\[truncated: the full result is 9000 bytes\]/u);
  assert.match(testo, /### Passo B \(b\)\n\(this step did not succeed: failed\)/u);
  assert.match(testo, /### Passo C \(c\)\n\(no result recorded\)/u);
  assert.match(testo, /\(3 more steps this one depends on are not shown\.\)/u);
  assert.equal(consegnaDelPasso(PASSO, { items: [], omitted: 0 }), 'Leggi note.md.');
});

test('WF-AGENT-ADAPTER-LONG-ANSWER-AND-CLOCK: the full answer is the bytes, the summary is capped, and the time is measured', async () => {
  const lungo = 'x'.repeat(5_000);
  const tempi = [1_000, 3_500, 3_500];
  const adattatore = createAgentSessionAdapter({ sessions: ponteFinto({ esito: Promise.resolve({ ...ESITO_OK, testoFinale: lungo }) }),
    nowMsFn: () => tempi.shift() ?? 3_500 });
  const esito = await adattatore.execute(ctx());
  const [risultato] = esito.results;
  assert.equal(risultato.summary.length, 4_096, 'the summary respects the ResultDraft cap (≤4.096)');
  assert.equal(Buffer.from(risultato.bytes).toString('utf8'), lungo, 'the full answer is kept in the bytes');
  assert.equal(esito.actualUsage.wallMs, 2_500);
  assert.equal(esito.actualUsage.agentSeconds, 3);
});

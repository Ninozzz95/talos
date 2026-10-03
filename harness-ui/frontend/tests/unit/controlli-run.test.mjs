/*
 * F3-52 (25/09/2026) — i controlli del run del workflow. Decisioni owner del 25/09 sera: nella testata del diagramma un
 * pulsante secondo lo stato più un «…» con gli altri e Annulla in fondo (21); Annulla con conferma che dice le conseguenze
 * (22); Riprova con conferma col conto (23). Ricerca: `.claude/RICERCA-10x4-F3-52-CONTROLLI-2026-09-25.md`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { azioniDelRun, conseguenzeAnnulla, righeAumento, testoAmbiguo, testoErroreRun } from '../../src/components/controlli-run.js';
import { creaClientGrafo } from '../../src/components/workflow-graph-client.js';

const pan = (status, counts = {}, extra = {}) => ({ runId: 'r1', status, groups: [{ phaseId: 'f', counts }], ...extra });
const vedi = ({ principale, menu, nota }) => [principale ? `${principale.azione}:${principale.etichetta}` : null, menu.map((v) => v.azione), nota];

test('WF-RUN-ACTIONS: only what the server would accept now is offered (workflow-orchestrator.mjs rifiutoDelControllo)', () => {
  assert.deepEqual(vedi(azioniDelRun(pan('running', { running: 2 }))), ['pause:Pausa', ['cancel'], null]);
  assert.deepEqual(vedi(azioniDelRun(pan('running', { running: 1, failed: 3 }))), ['pause:Pausa', ['retry', 'cancel'], null], 'failed steps can be retried while running');
  const pausa = azioniDelRun(pan('running', { running: 1 }, { pauseRequested: true }));
  assert.deepEqual([pausa.principale, pausa.menu.map((v) => v.azione)], [null, ['cancel']], 'a pause already requested is not offered again');
  assert.match(pausa.nota, /Pausa chiesta/u);
  assert.deepEqual(vedi(azioniDelRun(pan('paused'))), ['resume:Riprendi', ['cancel'], null]);
  assert.deepEqual(vedi(azioniDelRun(pan('needs_attention', { failed: 1 }))), ['retry:Riprova 1 passo', ['cancel'], null]);
  assert.deepEqual(vedi(azioniDelRun(pan('needs_attention', { uncertain: 2 }))), [null, ['cancel'], null], 'resume is refused in needs_attention');
  assert.deepEqual(vedi(azioniDelRun(pan('created'))), [null, ['cancel'], null]);
  const annullando = azioniDelRun(pan('running', { running: 2 }, { cancelRequested: true }));
  assert.deepEqual([annullando.principale, annullando.menu], [null, []]);
  assert.match(annullando.nota, /Annullamento in corso/u);
  for (const finito of ['succeeded', 'failed', 'cancelled']) assert.deepEqual(vedi(azioniDelRun(pan(finito, { failed: 2 }))), [null, [], null]);
  assert.deepEqual(vedi(azioniDelRun({ runId: null, status: 'planned', groups: [] })), [null, [], null], 'a plan has no run to command');
  assert.equal(azioniDelRun(pan('running', { failed: 1200 })).menu[0].etichetta, 'Riprova 1.200 passi');
  assert.equal(azioniDelRun(pan('running')).menu.at(-1).pericolo, true, 'cancel is the dangerous one, last');
});

test('WF-RUN-CANCEL-CONSEQUENCES: the confirmation says what happens, from the real counts (decision 22)', () => {
  assert.equal(conseguenzeAnnulla(pan('running', { running: 2, leased: 1, pending: 10, ready: 2, succeeded: 5 })),
    'I 3 passi in corso si fermano subito. I 12 passi non ancora partiti non partiranno. I risultati già registrati restano. Un run annullato non si riprende.');
  assert.equal(conseguenzeAnnulla(pan('paused', { running: 1, pending: 1 })),
    'Il passo in corso si ferma subito. Il passo non ancora partito non partirà. I risultati già registrati restano. Un run annullato non si riprende.');
  assert.equal(conseguenzeAnnulla(pan('paused', { succeeded: 3 })), 'I risultati già registrati restano. Un run annullato non si riprende.',
    'nothing in progress, nothing waiting: no invented step');
  // giro vero sul 4174 (25/09): in pausa i passi che aspettano un precedente sono `blocked`, e non partiranno anche loro
  assert.equal(conseguenzeAnnulla(pan('paused', { running: 1, blocked: 2, succeeded: 1 })),
    'Il passo in corso si ferma subito. I 2 passi non ancora partiti non partiranno. I risultati già registrati restano. Un run annullato non si riprende.');
});

test('WF-RUN-RETRY-RAISE: the raise is said in the words of the card limits, only what goes up (decision 23)', () => {
  assert.deepEqual(righeAumento({ promptTokens: 12_000, completionTokens: 0, wallMs: 80 * 60_000, agentSeconds: 99, toolCalls: 30, modelRequests: 40, knownCostUsd: 0.5 }), [
    ['Tempo massimo', '+ 1 h 20 min'], ['Richieste al modello', '+ 40'], ['Token letti', '+ 12.000'], ['Attrezzi usati', '+ 30'], ['Costo', '+ 0.50 $'],
  ]);
  assert.deepEqual(righeAumento({ promptTokens: 0, knownCostUsd: 0 }), [], 'zero raise, nothing listed');
  assert.deepEqual(righeAumento(null), []);
});

test('WF-RUN-TEXTS: errors are in words by code, and an ambiguous Retry says not to repeat blindly', () => {
  assert.match(testoErroreRun('WORKFLOW_RUN_STATE_CONFLICT'), /cambiato nel frattempo/u);
  assert.equal(testoErroreRun('CODICE_IGNOTO'), 'Il comando non è riuscito. Riprova tra poco.');
  assert.match(testoAmbiguo('retry'), /prima di ripeterlo/u);
  assert.doesNotMatch(testoErroreRun('WORKFLOW_RUN_STATE_CONFLICT'), /WORKFLOW|conflict/u, 'no technical names on screen');
});

/* ——— il client dei comandi ——— */
const S = 'sessione-1';
const RUN = { tipo: 'run', runId: 'r1', workflowId: 'w1', version: 1 };
const risposta = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
function server(esiti) {
  const chiamate = [];
  const fetchFn = async (url, opzioni = {}) => {
    chiamate.push({ url, metodo: opzioni.method ?? 'GET', corpo: opzioni.body ? JSON.parse(opzioni.body) : null });
    const esito = esiti.shift();
    if (esito instanceof Error) throw esito;
    return esito;
  };
  return { fetchFn, chiamate };
}

test('WF-RUN-COMMAND-CLIENT: one POST with a fresh commandId; an ambiguous outcome is resolved by a GET, never a second POST', async () => {
  const ok = server([risposta(202, { ok: true, data: { runId: 'r1', action: 'pause', status: 'running' } })]);
  const esito = await creaClientGrafo({ sessionId: S, fetchFn: ok.fetchFn }).comando(RUN, 'pause', { uuid: () => 'id-1' });
  assert.deepEqual([esito.ok, ok.chiamate[0].url, ok.chiamate[0].metodo, ok.chiamate[0].corpo], [true, `/api/v1/sessions/${S}/workflows/r1/pause`, 'POST', { commandId: 'id-1' }]);
  const rifiuto = server([risposta(409, { ok: false, error: { code: 'WORKFLOW_RUN_STATE_CONFLICT' } })]);
  assert.deepEqual(await creaClientGrafo({ sessionId: S, fetchFn: rifiuto.fetchFn }).comando(RUN, 'resume', { uuid: () => 'id-2' }),
    { ok: false, code: 'WORKFLOW_RUN_STATE_CONFLICT', status: 409 });
  // la rete cade: si rilegge la panoramica, e se la pausa risulta chiesta il gesto è riuscito
  const caduta = server([new Error('rete'), risposta(200, { ok: true, data: { runId: 'r1', status: 'running', pauseRequested: true, groups: [] } })]);
  const riletto = await creaClientGrafo({ sessionId: S, fetchFn: caduta.fetchFn }).comando(RUN, 'pause', { uuid: () => 'id-3' });
  assert.deepEqual([riletto.ok, riletto.riletto], [true, true]);
  assert.deepEqual(caduta.chiamate.map((c) => c.metodo), ['POST', 'GET'], 'never a second POST');
  // Riprova ambiguo: la rilettura non può provarlo, resta «non si sa»
  const riprova = server([risposta(502, null), risposta(200, { ok: true, data: { runId: 'r1', status: 'running', groups: [] } })]);
  assert.deepEqual(await creaClientGrafo({ sessionId: S, fetchFn: riprova.fetchFn }).comando(RUN, 'retry', { uuid: () => 'id-4' }), { ok: false, ambiguo: true });
  assert.deepEqual(riprova.chiamate.map((c) => c.metodo), ['POST', 'GET']);
  await assert.rejects(creaClientGrafo({ sessionId: S, fetchFn: ok.fetchFn }).comando({ tipo: 'piano', workflowId: 'w1', version: 1 }, 'pause'), /invalid run command/u); // 03/10/2026: errore di contratto, in inglese
  await assert.rejects(creaClientGrafo({ sessionId: S, fetchFn: ok.fetchFn }).comando(RUN, 'delete'), /invalid run command/u); // 03/10/2026: errore di contratto, in inglese
});

test('WF-RUN-RETRY-PREVIEW: the preview is read before the confirmation', async () => {
  const s = server([risposta(200, { ok: true, data: { schema: 'talos.workflow-retry-preview.v1', runId: 'r1', nodeIds: ['a', 'b'], ceilingRaise: { modelRequests: 8 } } })]);
  const anteprima = await creaClientGrafo({ sessionId: S, fetchFn: s.fetchFn }).anteprimaRiprova(RUN);
  assert.deepEqual([s.chiamate[0].url, s.chiamate[0].metodo, anteprima.nodeIds], [`/api/v1/sessions/${S}/workflows/r1/retry-preview`, 'GET', ['a', 'b']]);
});

test('WF-RUN-STATE-WORD: a requested pause or cancel is «in progress» only while the run is not over (real run 81d33e4f, 25/09)', async () => {
  const { statoDelRun, STATI_RUN } = await import('../../src/components/grafo-workflow.js');
  // il caso VERO del 4174: annullato, e il registro tiene ancora cancelRequested
  assert.equal(STATI_RUN[statoDelRun({ status: 'cancelled', cancelRequested: true })], 'Annullato');
  assert.equal(STATI_RUN[statoDelRun({ status: 'running', cancelRequested: true, pauseRequested: true })], 'Annullamento in corso');
  assert.equal(STATI_RUN[statoDelRun({ status: 'paused', cancelRequested: true })], 'Annullamento in corso');
  assert.equal(STATI_RUN[statoDelRun({ status: 'running', pauseRequested: true })], 'Pausa in corso');
  assert.equal(STATI_RUN[statoDelRun({ status: 'paused', pauseRequested: false })], 'In pausa');
  assert.equal(STATI_RUN[statoDelRun({ status: 'succeeded', pauseRequested: true })], 'Riuscito');
  assert.equal(statoDelRun(null, { tipo: 'piano', revisione: { status: 'approved' } }), 'approved');
  assert.equal(statoDelRun(null, { tipo: 'piano' }), 'proposed');
});

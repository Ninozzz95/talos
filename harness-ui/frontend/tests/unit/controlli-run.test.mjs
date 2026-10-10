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

test('C3-STEP-ACTION-CLIENT: one POST to the step route with only its own field; an ambiguous outcome re-reads the step, never a second POST', async () => {
  const { passoRisolvibile } = await import('../../src/components/controlli-run.js');
  const ok = server([risposta(202, { ok: true, data: { runId: 'r1', nodeId: 'uno', action: 'mark-done', status: 'running' } })]);
  const client = (s) => creaClientGrafo({ sessionId: S, fetchFn: s.fetchFn });
  assert.equal((await client(ok).azioneSulPasso(RUN, 'uno', 'mark-done', { summary: 'Fatto a mano', model: 'ignorato', uuid: () => 'id-1' })).ok, true);
  assert.deepEqual([ok.chiamate[0].url, ok.chiamate[0].metodo, ok.chiamate[0].corpo],
    [`/api/v1/sessions/${S}/workflows/r1/steps/uno/mark-done`, 'POST', { commandId: 'id-1', summary: 'Fatto a mano' }], 'mark-done carries the summary, never a model');
  const aParte = server([risposta(202, { ok: true, data: {} })]);
  await client(aParte).azioneSulPasso(RUN, 'a b', 'set-aside', { summary: 'no', uuid: () => 'id-2' });
  assert.deepEqual([aParte.chiamate[0].url, aParte.chiamate[0].corpo], [`/api/v1/sessions/${S}/workflows/r1/steps/a%20b/set-aside`, { commandId: 'id-2' }]);
  const rifiuto = server([risposta(409, { ok: false, error: { code: 'WORKFLOW_RUN_STATE_CONFLICT' } })]);
  assert.deepEqual(await client(rifiuto).azioneSulPasso(RUN, 'uno', 'retry-other-model', { model: 'm/x', uuid: () => 'id-3' }),
    { ok: false, code: 'WORKFLOW_RUN_STATE_CONFLICT', status: 409 });
  // la rete cade: si rilegge il passo (versione + run), e «segnato come fatto dalla persona» prova il gesto
  const caduta = server([new Error('rete'), risposta(200, { ok: true, data: { nodeId: 'uno' } }),
    risposta(200, { ok: true, data: { nodeId: 'uno', state: 'succeeded', resolution: 'marked-done' } })]);
  assert.deepEqual(await client(caduta).azioneSulPasso(RUN, 'uno', 'mark-done', { summary: 'x', uuid: () => 'id-4' }), { ok: true, riletto: true, dati: null });
  assert.deepEqual(caduta.chiamate.map((c) => c.metodo), ['POST', 'GET', 'GET'], 'never a second POST');
  // un passo finito da solo NON prova «segnato come fatto»: resta ambiguo
  const finito = server([risposta(502, null), risposta(200, { ok: true, data: {} }), risposta(200, { ok: true, data: { state: 'succeeded' } })]);
  assert.deepEqual(await client(finito).azioneSulPasso(RUN, 'uno', 'mark-done', { summary: 'x', uuid: () => 'id-5' }), { ok: false, ambiguo: true });
  await assert.rejects(client(ok).azioneSulPasso(RUN, 'uno', 'delete'), /invalid step action/u);
  await assert.rejects(client(ok).azioneSulPasso({ tipo: 'piano', workflowId: 'w1', version: 1 }, 'uno', 'set-aside'), /invalid step action/u);
  // offerte solo quando il server le accetterebbe
  assert.equal(passoRisolvibile({ runId: 'r1', status: 'needs_attention' }, 'failed'), true);
  assert.equal(passoRisolvibile({ runId: 'r1', status: 'running' }, 'failed'), true);
  assert.equal(passoRisolvibile({ runId: 'r1', status: 'running', cancelRequested: true }, 'failed'), false, 'a run being cancelled');
  assert.equal(passoRisolvibile({ runId: 'r1', status: 'paused' }, 'failed'), false, 'a paused run (same rule as Retry)');
  assert.equal(passoRisolvibile({ runId: 'r1', status: 'running' }, 'succeeded'), false, 'only a failed step');
  assert.equal(passoRisolvibile({ runId: null, status: 'planned' }, 'failed'), false, 'a plan has no run');
  // C3 tappa 2a: un passo incerto si decide solo quando il run chiede attenzione
  assert.equal(passoRisolvibile({ runId: 'r1', status: 'needs_attention' }, 'uncertain'), true);
  assert.equal(passoRisolvibile({ runId: 'r1', status: 'running' }, 'uncertain'), false, 'still being reconciled by the system');
  assert.equal(passoRisolvibile({ runId: 'r1', status: 'needs_attention', cancelRequested: true }, 'uncertain'), false);
});

test('C3-CEILING-CLIENT: «Alza il tetto e riprendi» is first only when the run waits for its budget; the command carries the amount said', async () => {
  const sforato = pan('needs_attention', { succeeded: 2, ready: 1 }, { attentionReasons: ['budget_overrun'] });
  assert.deepEqual(vedi(azioniDelRun(sforato)), ['raise-ceiling:Alza il tetto e riprendi', ['cancel'], null]);
  assert.deepEqual(vedi(azioniDelRun({ ...sforato, groups: [{ phaseId: 'f', counts: { failed: 1 } }] })),
    ['raise-ceiling:Alza il tetto e riprendi', ['retry', 'cancel'], null], 'with a failed step too, Retry goes in the «…»');
  assert.deepEqual(vedi(azioniDelRun(pan('needs_attention', { failed: 1 }, { attentionReasons: ['node_failed'] }))), ['retry:Riprova 1 passo', ['cancel'], null],
    'another reason: no raise');
  assert.deepEqual(vedi(azioniDelRun({ ...sforato, cancelRequested: true })).slice(0, 2), [null, []], 'not while cancelling');

  const IMPORTO = { promptTokens: 100, completionTokens: 0, wallMs: 0, agentSeconds: 0, toolCalls: 0, modelRequests: 0, knownCostUsd: 0 };
  const anteprima = server([risposta(200, { ok: true, data: { schema: 'talos.workflow-ceiling-preview.v1', runId: 'r1', waiting: true, amount: IMPORTO, nodeIds: ['c'] } })]);
  const letta = await creaClientGrafo({ sessionId: S, fetchFn: anteprima.fetchFn }).anteprimaTetto(RUN);
  assert.deepEqual([anteprima.chiamate[0].url, anteprima.chiamate[0].metodo, letta.amount], [`/api/v1/sessions/${S}/workflows/r1/ceiling-preview`, 'GET', IMPORTO]);
  const ok = server([risposta(202, { ok: true, data: { runId: 'r1', status: 'running', amount: IMPORTO } })]);
  await creaClientGrafo({ sessionId: S, fetchFn: ok.fetchFn }).comando(RUN, 'raise-ceiling', { uuid: () => 'id-9', amount: IMPORTO });
  assert.deepEqual([ok.chiamate[0].url, ok.chiamate[0].corpo], [`/api/v1/sessions/${S}/workflows/r1/raise-ceiling`, { commandId: 'id-9', amount: IMPORTO }]);
  const pausa = server([risposta(202, { ok: true, data: {} })]);
  await creaClientGrafo({ sessionId: S, fetchFn: pausa.fetchFn }).comando(RUN, 'pause', { uuid: () => 'id-8', amount: IMPORTO });
  assert.deepEqual(pausa.chiamate[0].corpo, { commandId: 'id-8' }, 'only the raise carries an amount');
  // la rete cade: il gesto è riuscito se il run non aspetta più per il budget, altrimenti resta «non si sa»
  const caduta = (dopo) => server([new Error('rete'), risposta(200, { ok: true, data: { runId: 'r1', groups: [], ...dopo } })]);
  const alzato = await creaClientGrafo({ sessionId: S, fetchFn: caduta({ status: 'running' }).fetchFn }).comando(RUN, 'raise-ceiling', { uuid: () => 'a', amount: IMPORTO });
  assert.equal(alzato.ok, true);
  const ancora = await creaClientGrafo({ sessionId: S, fetchFn: caduta({ status: 'needs_attention', attentionReasons: ['budget_overrun'] }).fetchFn })
    .comando(RUN, 'raise-ceiling', { uuid: () => 'b', amount: IMPORTO });
  assert.deepEqual(ancora, { ok: false, ambiguo: true });
  const annullato = await creaClientGrafo({ sessionId: S, fetchFn: caduta({ status: 'cancelled' }).fetchFn }).comando(RUN, 'raise-ceiling', { uuid: () => 'c', amount: IMPORTO });
  assert.deepEqual(annullato, { ok: false, ambiguo: true }, 'a cancelled run is not a raised ceiling');
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

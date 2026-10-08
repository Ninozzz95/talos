/*
 * ⛔⛔ A10 (07/10/2026) — un run in «Serve attenzione» per un passo INCERTO o per un BUDGET superato non aveva nessuna
 *   azione valida per il modello, e il rifiuto non lo diceva. Qui la regola pura (`workflow/azioni-del-run.mjs`); il
 *   rifiuto dell'orchestratore e la risposta al modello sono provati in `workflow-run-controls.test.mjs` (A10-*).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { azioniConsentiteDelRun, codaDelRifiuto, motiviDiAttenzioneDelRun, rifiutoDelControllo } from '../src/workflow/azioni-del-run.mjs';

const run = (campi) => ({ status: 'running', pauseRequested: false, cancelRequested: false, needsAttentionReasons: [], ...campi });
const stato = (campiRun, nodi = []) => ({ run: run(campiRun), nodes: new Map(nodi.map(([id, s]) => [id, { nodeId: id, state: s }])) });

test('A10-01: «Serve attenzione» per un passo incerto o un budget superato, nessun passo fallito ⇒ solo cancel', () => {
  for (const motivo of ['activity_uncertain:abc', 'budget_overrun']) {
    const s = stato({ status: 'needs_attention', needsAttentionReasons: [motivo] }, [['uno', 'uncertain'], ['due', 'succeeded']]);
    assert.deepEqual(azioniConsentiteDelRun(s), ['cancel'], motivo);
    assert.deepEqual(motiviDiAttenzioneDelRun(s.run), [motivo]);
    assert.match(codaDelRifiuto(s), /Allowed actions now: cancel\. The run needs attention because: /);
  }
});

test('A10-02: «Serve attenzione» con un passo fallito ⇒ cancel e retry', () => {
  const s = stato({ status: 'needs_attention', needsAttentionReasons: ['node_failed'] }, [['uno', 'failed']]);
  assert.deepEqual(azioniConsentiteDelRun(s), ['cancel', 'retry']);
});

test('A10-03: in corso ⇒ pause e cancel (retry solo se qualcosa è fallito); in pausa ⇒ resume e cancel', () => {
  assert.deepEqual(azioniConsentiteDelRun(stato({ status: 'running' }, [['uno', 'running']])), ['pause', 'cancel']);
  assert.deepEqual(azioniConsentiteDelRun(stato({ status: 'running' }, [['uno', 'failed']])), ['pause', 'cancel', 'retry']);
  assert.deepEqual(azioniConsentiteDelRun(stato({ status: 'paused' })), ['resume', 'cancel']);
  assert.deepEqual(azioniConsentiteDelRun(stato({ status: 'running', pauseRequested: true })), ['cancel']);
});

test('A10-04: un run finito o in annullamento non ammette niente, e la coda lo dice', () => {
  for (const s of [stato({ status: 'succeeded' }), stato({ status: 'cancelled' }), stato({ status: 'running', cancelRequested: true })]) {
    assert.deepEqual(azioniConsentiteDelRun(s), []);
    assert.equal(codaDelRifiuto(s), ' Allowed actions now: none.');
  }
});

test('A10-05: la regola del rifiuto e quella delle azioni ammesse sono la STESSA (nessuna azione ammessa viene rifiutata)', () => {
  const stati = ['running', 'paused', 'needs_attention', 'succeeded', 'failed', 'cancelled'];
  for (const status of stati) for (const pauseRequested of [false, true]) for (const cancelRequested of [false, true]) {
    const s = stato({ status, pauseRequested, cancelRequested }, [['uno', 'failed']]);
    for (const azione of azioniConsentiteDelRun(s)) assert.equal(rifiutoDelControllo(azione, s.run), null, `${status}/${azione}`);
  }
});

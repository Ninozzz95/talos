/*
 * C3b (owner 09/10/2026 sera) — il lato SERVER dell'avvio da solo (`src/workflow/avvio-da-solo.mjs`), con lo store VERO dei
 * Workflow: una proposta vera del modello (`proposeWorkflowFromTool`), poi approva e avvia con la stessa porta della persona, e
 * lo scheduler svegliato. Nei due versi: i passi non entrano nel tetto ⇒ niente approvato né avviato; una sessione che non è
 * quella della proposta ⇒ niente; senza runtime ⇒ niente (un run che nessuno esegue sarebbe un avvio finto).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { creaAvvioDaSolo } from '../src/workflow/avvio-da-solo.mjs';
import { proposeWorkflowFromTool } from '../src/workflow/planning-control.mjs';
import { createWorkflowStore, listRunsForSession, readDefinitionApproval } from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const BOZZA = {
  title: 'Prova avvio da solo', objective: 'Leggere e confrontare.',
  phases: [{ id: 'f', label: 'Fase' }],
  nodes: [
    { id: 'uno', phase: 'f', label: 'Uno', task: 'Leggi uno.' },
    { id: 'due', phase: 'f', label: 'Due', task: 'Leggi due.' },
    { id: 'confronta', phase: 'f', label: 'Confronta', task: 'Confronta.', dependsOn: ['uno', 'due'] },
  ],
};

async function scena(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-c3b-server-'));
  const store = await createWorkflowStore({ workflowDataRoot: radice, workspaceRoots: [], resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(radice); });
  const sessionId = randomUUID();
  const ricevuta = await proposeWorkflowFromTool(store, { sessionId, toolCallId: `call_${randomUUID()}`, draft: BOZZA,
    plannerModel: null, sessionModel: 'z-ai/glm-5.3-flash', modalitaOperativa: 'normale', agentRole: 'root' });
  const svegliati = [];
  const runtime = { scheduler: { sveglia: (runId) => svegliati.push(runId) } };
  const avvia = creaAvvioDaSolo({ store, runtimeFn: () => runtime, sessionExistsFn: (id) => id === sessionId });
  const input = (extra = {}) => ({ sessionId, workflowId: ricevuta.workflowId, version: ricevuta.version, definitionHash: ricevuta.definitionHash, ...extra });
  const approvata = async () => { try { await readDefinitionApproval(store, { workflowId: ricevuta.workflowId, version: ricevuta.version }); return true; } catch { return false; } };
  return { store, sessionId, ricevuta, svegliati, avvia, input, approvata };
}

test('C3B-S-01 — approved and started through the person\'s door, the steps reserved, the scheduler woken', async (t) => {
  const s = await scena(t);
  const chiesti = [];
  const esito = await s.avvia(s.input({ prenota: (passi) => { chiesti.push(passi); return true; } }));
  assert.equal(esito.avviato, true);
  assert.deepEqual(chiesti, [3], 'the cap is asked for every step');
  assert.equal(await s.approvata(), true, 'the version is approved (frozen), as by «Approve»');
  const runs = await listRunsForSession(s.store, { rootSessionId: s.sessionId });
  assert.deepEqual(runs.map((r) => r.runId ?? r), [esito.runId]);
  assert.deepEqual(s.svegliati, [esito.runId]);
});

test('C3B-S-02 — the other way: no room in the cap, another session, no runtime ⇒ nothing approved, nothing started', async (t) => {
  const s = await scena(t);
  assert.deepEqual(await s.avvia(s.input({ prenota: () => false })), { avviato: false, motivo: 'tetto', passi: 3 });
  assert.equal((await s.avvia(s.input({ sessionId: randomUUID(), prenota: () => true }))).avviato, false);
  const senzaRuntime = creaAvvioDaSolo({ store: s.store, runtimeFn: () => null, sessionExistsFn: () => true });
  assert.deepEqual(await senzaRuntime(s.input({ prenota: () => true })), { avviato: false, motivo: 'runtime' });
  assert.equal(await s.approvata(), false);
  assert.equal((await listRunsForSession(s.store, { rootSessionId: s.sessionId })).length, 0);
  assert.deepEqual(s.svegliati, []);
});

/*
 * Owner 10/10/2026 («Sola lettura dall'altro archivio») — l'archivio dei Workflow di un ALTRO processo si apre senza diventarne
 *   proprietari (`apriArchivioInSolaLettura`), come Hermes `SessionDB(read_only=True)` (`hermes_state.py:721-726`). Si legge mentre il
 *   proprietario è vivo; nessuna scrittura, nessun file nuovo, nessuna riparazione; una riga ancora in scrittura si ignora.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import {
  aggiornaIndiceInSolaLettura, apriArchivioInSolaLettura, appendEvent, approveDefinition, createDefinition, createRun,
  createWorkflowStore, listDefinitionsForSession, listRunSummariesForSession, readDefinition, readRunState, removeRun, watchRun,
  withGlobalAdmission, writeCheckpoint,
} from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const rootSessionId = '40000000-0000-4000-8000-000000000001';
const definition = JSON.parse(await readFile(new URL('./fixtures/workflow/records/definition-record-v1.json', import.meta.url), 'utf8'));
const approval = JSON.parse(await readFile(new URL('./fixtures/workflow/records/approval-v1.json', import.meta.url), 'utf8'));
const LIMITI = { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 };
const runId = '10000000-0000-4000-8000-000000000001';
const evento = (seq, type, payload, extra = {}) => ({
  schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1, eventId: randomUUID(), runId, seq,
  at: `2026-09-23T10:00:0${seq}.000Z`, type, nodeId: null, commandId: null, commandType: null, commandPayloadHash: null,
  causationId: null, correlationId: runId, graphVersion: 1, activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null,
  payload, ...extra,
});
const runCreated = () => evento(1, 'run_created', { workflowId: definition.workflowId, definitionVersion: definition.version,
  definitionHash: definition.definitionHash, rootSessionId, workspaceBaselineId: null, workspaceBaselineHash: null },
{ commandId: randomUUID(), commandType: 'start-run', commandPayloadHash: `sha256:${'c'.repeat(64)}` });
const sforamento = (seq) => evento(seq, 'budget_overrun_observed', { reservationId: null, source: 'provider_receipt', dimensions: ['toolCalls'],
  observed: { promptTokens: 0, completionTokens: 0, wallMs: 0, agentSeconds: 0, toolCalls: 1, modelRequests: 0, knownCostUsd: null } });

/** Ogni file sotto la radice con dimensione e data: la prova che chi legge non ha scritto niente. */
function fotografia(radice) {
  const fuori = [];
  const giro = (cartella) => {
    for (const voce of readdirSync(cartella, { withFileTypes: true })) {
      const p = join(cartella, voce.name);
      if (voce.isDirectory()) giro(p);
      else { const s = statSync(p); fuori.push(`${relative(radice, p)}:${s.size}:${s.mtimeMs}`); }
    }
  };
  giro(radice);
  return fuori.sort();
}

async function proprietarioConUnRun(t, { conRun = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'talos-wf-sola-lettura-'));
  const proprietario = await createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [], resultLimits: LIMITI });
  t.after(async () => { await proprietario.close(); rimuoviCartellaDiProva(root); });
  await createDefinition(proprietario, { record: definition });
  if (conRun) {
    await approveDefinition(proprietario, { approval });
    await createRun(proprietario, { event: runCreated() });
  }
  return { root, proprietario };
}

test('WF-SOLA-LETTURA-01: col proprietario VIVO si apre senza conflitto e legge proposta e run', async (t) => {
  const { root, proprietario } = await proprietarioConUnRun(t);
  const lettore = await apriArchivioInSolaLettura({ workflowDataRoot: root, resultLimits: LIMITI });
  t.after(() => lettore.close());
  await aggiornaIndiceInSolaLettura(lettore);
  const sessione = definition.proposal.initiatingSessionId;
  assert.deepEqual(listDefinitionsForSession(lettore, { sessionId: sessione }), listDefinitionsForSession(proprietario, { sessionId: sessione }));
  assert.equal(listDefinitionsForSession(lettore, { sessionId: sessione })[0].status, 'approved');
  assert.equal((await readDefinition(lettore, { workflowId: definition.workflowId, version: 1 })).definitionHash, definition.definitionHash);
  assert.deepEqual((await listRunSummariesForSession(lettore, { rootSessionId })).map((r) => r.runId), [runId]);
  assert.equal((await readRunState(lettore, { runId })).events.length, 1);
});

test('WF-SOLA-LETTURA-01b: un\'approvazione data DOPO l\'apertura si vede al rinfresco dell\'indice', async (t) => {
  const { root, proprietario } = await proprietarioConUnRun(t, { conRun: false });
  const lettore = await apriArchivioInSolaLettura({ workflowDataRoot: root, resultLimits: LIMITI });
  t.after(() => lettore.close());
  const sessione = definition.proposal.initiatingSessionId;
  await aggiornaIndiceInSolaLettura(lettore);
  const prima = listDefinitionsForSession(lettore, { sessionId: sessione })[0].status;
  assert.notEqual(prima, 'approved');
  await approveDefinition(proprietario, { approval });
  assert.equal(listDefinitionsForSession(lettore, { sessionId: sessione })[0].status, prima, 'senza rinfresco resta com\'era');
  await aggiornaIndiceInSolaLettura(lettore);
  assert.equal(listDefinitionsForSession(lettore, { sessionId: sessione })[0].status, 'approved');
});

test('WF-SOLA-LETTURA-02: ogni scrittura è rifiutata, e sul disco non cambia un byte', async (t) => {
  const { root } = await proprietarioConUnRun(t);
  const prima = fotografia(root);
  const lettore = await apriArchivioInSolaLettura({ workflowDataRoot: root, resultLimits: LIMITI });
  t.after(() => lettore.close());
  await aggiornaIndiceInSolaLettura(lettore);
  await readRunState(lettore, { runId });
  const scritture = [
    () => createDefinition(lettore, { record: definition }),
    () => approveDefinition(lettore, { approval }),
    () => createRun(lettore, { event: runCreated() }),
    () => appendEvent(lettore, { event: sforamento(2) }),
    () => removeRun(lettore, { runId }),
    () => writeCheckpoint(lettore, { checkpoint: {} }),
    () => withGlobalAdmission(lettore, async () => 'entrato'),
  ];
  for (const scrivi of scritture) await assert.rejects(scrivi, (e) => e.code === 'WORKFLOW_STORE_READ_ONLY', String(scrivi));
  assert.deepEqual(fotografia(root), prima, 'nessun file nuovo, nessun file toccato (owner.json compreso)');
});

test('WF-SOLA-LETTURA-03: una riga valida ancora senza a-capo è una scrittura in corso — si ignora, e il file resta com\'è', async (t) => {
  const { root, proprietario } = await proprietarioConUnRun(t);
  const segmento = join(root, 'runs', runId, 'journal', '000001.jsonl');
  const righe = readFileSync(segmento, 'utf8').trimEnd().split('\n');
  // la riga che il proprietario sta scrivendo: un fatto vero, letto prima del suo a-capo
  await appendEvent(proprietario, { event: sforamento(2) });
  const completa = readFileSync(segmento, 'utf8');
  const seconda = completa.trimEnd().split('\n')[1];
  const lettore = await apriArchivioInSolaLettura({ workflowDataRoot: root, resultLimits: LIMITI });
  t.after(() => lettore.close());
  // si ricostruisce il momento a metà in una copia del segmento: il prefisso valido più la riga senza a-capo
  const { writeFileSync } = await import('node:fs');
  writeFileSync(segmento, `${righe.join('\n')}\n${seconda}`);
  const prima = readFileSync(segmento);
  assert.equal((await readRunState(lettore, { runId })).events.length, 1, 'la riga a metà non conta ancora');
  assert.deepEqual(readFileSync(segmento), prima, 'chi legge non ripara');
  appendFileSync(segmento, '\n');
  assert.equal((await readRunState(lettore, { runId })).events.length, 2, 'col suo a-capo torna alla lettura dopo');
});

test('WF-SOLA-LETTURA-04: chi guarda un run dell\'altro processo viene avvisato quando il giornale cresce', async (t) => {
  const { root, proprietario } = await proprietarioConUnRun(t);
  const lettore = await apriArchivioInSolaLettura({ workflowDataRoot: root, resultLimits: LIMITI }, { ogniMs: 3_600_000 });
  t.after(() => lettore.close());
  const avvisi = [];
  const smetti = watchRun(lettore, { runId, onAppend: (seq) => avvisi.push(seq) });
  await lettore.sorvegliaOra(); // la prima fotografia è il punto di partenza
  await lettore.sorvegliaOra();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(avvisi, [], 'niente è cambiato: nessun avviso');
  await appendEvent(proprietario, { event: sforamento(2) });
  await lettore.sorvegliaOra();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(avvisi, [2]);
  smetti();
});

test('WF-SOLA-LETTURA-05: AL CONTRARIO — il proprietario la stessa riga senza a-capo la dice ambigua; e una cartella assente non si crea', async (t) => {
  const { root, proprietario } = await proprietarioConUnRun(t);
  const segmento = join(root, 'runs', runId, 'journal', '000001.jsonl');
  const riga = readFileSync(segmento, 'utf8').trimEnd();
  const { writeFileSync, existsSync } = await import('node:fs');
  writeFileSync(segmento, riga); // il run_created senza a-capo
  await assert.rejects(readRunState(proprietario, { runId }), (e) => e.code === 'WORKFLOW_JOURNAL_CORRUPT');
  const assente = join(root, 'non-ce');
  await assert.rejects(apriArchivioInSolaLettura({ workflowDataRoot: assente, resultLimits: LIMITI }), (e) => e.code === 'WORKFLOW_STORE_UNAVAILABLE');
  assert.equal(existsSync(assente), false);
});

test('WF-SOLA-LETTURA-06: un run rovinato dell\'altro processo non nasconde gli altri; al proprietario invece lo dice', async (t) => {
  const { root, proprietario } = await proprietarioConUnRun(t);
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const rovinato = '20000000-0000-4000-8000-000000000002';
  mkdirSync(join(root, 'runs', rovinato, 'journal'), { recursive: true });
  writeFileSync(join(root, 'runs', rovinato, 'journal', '000001.jsonl'), 'non è json\n');
  const lettore = await apriArchivioInSolaLettura({ workflowDataRoot: root, resultLimits: LIMITI });
  t.after(() => lettore.close());
  assert.deepEqual((await listRunSummariesForSession(lettore, { rootSessionId })).map((r) => r.runId), [runId]);
  /* Y1 (review di «desktop», 10/10/2026): letto il run rovinato, l'archivio in sola lettura NON passa a «serve attenzione» — il
     run sano, la proposta e l'elenco rispondono ancora. Un run danneggiato nell'archivio dell'app non deve riportare il 404. */
  await assert.rejects(readRunState(lettore, { runId: rovinato }), (e) => e.code === 'WORKFLOW_JOURNAL_CORRUPT');
  assert.equal(lettore.state, 'ready', 'un run illeggibile non cambia lo stato di chi legge soltanto');
  assert.equal((await readRunState(lettore, { runId })).events.length, 1);
  await aggiornaIndiceInSolaLettura(lettore);
  assert.equal(listDefinitionsForSession(lettore, { sessionId: definition.proposal.initiatingSessionId }).length, 1);
  assert.deepEqual((await listRunSummariesForSession(lettore, { rootSessionId })).map((r) => r.runId), [runId]);
  await assert.rejects(listRunSummariesForSession(proprietario, { rootSessionId }), 'AL CONTRARIO: il proprietario non lo salta in silenzio');
  assert.equal(proprietario.state, 'needs_attention', 'AL CONTRARIO: al proprietario il giornale rovinato chiede attenzione');
});

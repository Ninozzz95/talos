/*
 * F3-41c (25/09/2026), decisione owner «Da parte + rename» — il run NATO A METÀ. Prima: un crollo dentro `createRun` (cartelle
 * e copia della Definition scritte, `run_created` no) lasciava una cartella senza fatti che alla riapertura metteva l'INTERO
 * Store in `needs_attention` — nessun run partiva più. Ora: il run si prepara in un cantiere nascosto e appare con un rename solo;
 * ciò che un crollo lascia comunque (una cartella senza fatti, un cantiere mai pubblicato) si mette da parte col motivo, e il
 * disco non perde niente. Un giornale CON fatti che non si rigioca resta invece un danno (vedi `workflow-store.test.mjs`).
 * Ricerca: `.claude/RICERCA-F3-41c-RUN-NATO-A-META-2026-09-25.md`.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import {
  approveDefinition,
  createDefinition,
  createRun,
  createWorkflowStore,
  listRunIds,
  listRunsForSession,
  lookupCommandReceipt,
  readEvents,
} from '../src/workflow/store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const definitionRecord = JSON.parse(await readFile(new URL('./fixtures/workflow/records/definition-record-v1.json', import.meta.url), 'utf8'));
const approval = JSON.parse(await readFile(new URL('./fixtures/workflow/records/approval-v1.json', import.meta.url), 'utf8'));

const openStore = (root, deps = {}) => createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [],
  resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } }, deps);

function runCreated(runId, commandId = randomUUID()) {
  return {
    schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1, eventId: randomUUID(), runId, seq: 1,
    at: '2026-09-25T10:00:01.000Z', type: 'run_created', nodeId: null,
    commandId, commandType: 'start-run', commandPayloadHash: `sha256:${'c'.repeat(64)}`,
    causationId: null, correlationId: runId, graphVersion: 1,
    activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null,
    payload: { workflowId: definitionRecord.workflowId, definitionVersion: definitionRecord.version,
      definitionHash: definitionRecord.definitionHash, rootSessionId: '40000000-0000-4000-8000-000000000001',
      workspaceBaselineId: null, workspaceBaselineHash: null },
  };
}

async function banco(t) {
  const root = cartellaDiProva('talos-store-meta-');
  const aperti = [];
  const apri = async (deps) => { const store = await openStore(root, deps); aperti.push(store); return store; };
  t.after(async () => { for (const store of aperti) if (store.state !== 'closed') await store.close(); rimuoviCartellaDiProva(root); });
  const store = await apri();
  await createDefinition(store, { record: definitionRecord });
  await approveDefinition(store, { approval });
  return { root, apri, store };
}

/** La forma esatta che un crollo dentro il vecchio `createRun` lasciava: cartelle e Definition, nessun fatto. */
function cartellaNataAMeta(root, runId) {
  mkdirSync(join(root, 'runs', runId, 'definition'), { recursive: true });
  mkdirSync(join(root, 'runs', runId, 'journal'), { recursive: true });
  mkdirSync(join(root, 'runs', runId, 'checkpoints'), { recursive: true });
  writeFileSync(join(root, 'runs', runId, 'definition', 'record.json'), readFileSync(join(root, 'definitions', definitionRecord.workflowId, String(definitionRecord.version), 'record.json')));
}

test('WF-CRASH-RUN-HALF-CREATED-SET-ASIDE: a run folder without run_created is set aside, and the Store opens ready for every other run', async (t) => {
  const b = await banco(t);
  const buono = randomUUID();
  await createRun(b.store, { event: runCreated(buono) });
  const aMeta = randomUUID();
  await b.store.close();
  cartellaNataAMeta(b.root, aMeta);

  const dopo = await b.apri();
  assert.equal(dopo.state, 'ready', 'one half-born run does not stop the Store');
  assert.deepEqual(dopo.diagnostics, []);
  assert.deepEqual(dopo.quarantinedRuns.map((voce) => [voce.runId, voce.code]), [[aMeta, 'WORKFLOW_RUN_HALF_CREATED']]);
  assert.ok(existsSync(join(b.root, 'runs', aMeta, 'definition', 'record.json')), 'nothing is deleted');
  const marcatore = JSON.parse(readFileSync(join(b.root, 'runs', `.${aMeta}.quarantena`), 'utf8'));
  assert.equal(marcatore.reason, 'no_run_created');
  assert.deepEqual(await listRunIds(dopo), [buono], 'the run set aside is not listed');
  assert.deepEqual(await listRunsForSession(dopo, { rootSessionId: '40000000-0000-4000-8000-000000000001' }), [buono], 'nor in the runs of its session');
  await assert.rejects(readEvents(dopo, { runId: aMeta }), { code: 'WORKFLOW_RUN_NOT_FOUND' });
  assert.equal(dopo.state, 'ready', 'asking for it (an old link) does not declare the Store broken');
  assert.equal((await readEvents(dopo, { runId: buono }))[0].type, 'run_created', 'the good run reads');
  assert.equal(await lookupCommandReceipt(dopo, { commandId: randomUUID() }), null, 'the receipt scan skips it');
  await assert.rejects(createRun(dopo, { event: runCreated(aMeta) }), { code: 'WORKFLOW_RUN_CONFLICT' }, 'its id is never reused');

  await dopo.close();
  const ancora = await b.apri();
  assert.equal(ancora.state, 'ready');
  assert.equal(ancora.quarantinedRuns.length, 1, 'a second restart says it again, once, from the marker');
});

test('WF-CRASH-RUN-TORN-FIRST-FACT: a run_created cut in the middle of its line is a half-born run too', async (t) => {
  const b = await banco(t);
  const aMeta = randomUUID();
  await b.store.close();
  cartellaNataAMeta(b.root, aMeta);
  writeFileSync(join(b.root, 'runs', aMeta, 'journal', '000001.jsonl'), '{"seq":1,"event":{"schema":"talos.workfl');
  const dopo = await b.apri();
  assert.equal(dopo.state, 'ready');
  assert.deepEqual(dopo.quarantinedRuns.map((voce) => voce.runId), [aMeta]);
});

test('WF-CRASH-RUN-BUILD-LEFT-ASIDE: a build folder left by a crash before publishing is reported and kept, never read as a run', async (t) => {
  const b = await banco(t);
  const runId = randomUUID();
  await b.store.close();
  const cantiere = `.creating-${runId}-${randomUUID()}`;
  mkdirSync(join(b.root, 'runs', cantiere, 'journal'), { recursive: true });
  const dopo = await b.apri();
  assert.equal(dopo.state, 'ready');
  assert.deepEqual(dopo.quarantinedRuns.map((voce) => [voce.runId, voce.code]), [[runId, 'WORKFLOW_RUN_CREATION_INTERRUPTED']]);
  assert.ok(existsSync(join(b.root, 'runs', cantiere)), 'kept');
  assert.deepEqual(await listRunIds(dopo), []);
  await createRun(dopo, { event: runCreated(runId) });
  assert.deepEqual(await listRunIds(dopo), [runId], 'the command repeated after the crash creates the run');
});

test('WF-CREATE-RUN-ATOMIC: the run appears whole or not at all; a failure before publishing leaves no run and no build folder', async (t) => {
  const b = await banco(t);
  const runId = randomUUID();
  const commandId = randomUUID();
  // l'istante del crollo: tutto è scritto (Definition e primo fatto) ma non ancora pubblicato — che cosa vede chi guarda adesso?
  let visibileAlCrollo = null;
  let cantieriAlCrollo = null;
  b.store.failpoint = async (name) => {
    if (name !== 'store.run.before_publish') return;
    visibileAlCrollo = existsSync(join(b.root, 'runs', runId));
    cantieriAlCrollo = readdirSync(join(b.root, 'runs')).filter((nome) => nome.startsWith('.creating-')).length;
    throw new Error('the process died here');
  };
  await assert.rejects(createRun(b.store, { event: runCreated(runId, commandId) }), /the process died here/u);
  b.store.failpoint = undefined;
  assert.equal(visibileAlCrollo, false, 'at the crash instant the run folder is NOT visible: a crash here leaves no half-born run');
  assert.equal(cantieriAlCrollo, 1, 'everything was being prepared in one hidden build folder');
  assert.equal(existsSync(join(b.root, 'runs', runId)), false, 'no run folder was ever visible');
  assert.deepEqual(readdirSync(join(b.root, 'runs')), [], 'and this call removed its own build folder');
  assert.equal(b.store.state, 'ready');
  assert.equal(await lookupCommandReceipt(b.store, { commandId }), null, 'the command was not consumed');
  await createRun(b.store, { event: runCreated(runId, commandId) });
  const eventi = await readEvents(b.store, { runId });
  assert.deepEqual(eventi.map((evento) => evento.type), ['run_created']);
  assert.deepEqual(readdirSync(join(b.root, 'runs')), [runId], 'one run folder, no leftovers');
  await b.store.close();
  const dopo = await b.apri();
  assert.equal(dopo.state, 'ready');
  assert.deepEqual(dopo.quarantinedRuns, []);
  assert.deepEqual((await readEvents(dopo, { runId })).map((evento) => evento.type), ['run_created'], 'it reads back after a restart');
});

test('WF-CREATE-RUN-INVALID-LEAVES-NOTHING: a run_created the Definition refuses publishes nothing and does not touch the Store state', async (t) => {
  const b = await banco(t);
  const runId = randomUUID();
  const rotto = runCreated(runId);
  rotto.graphVersion = 7;
  await assert.rejects(createRun(b.store, { event: rotto }), { code: 'WORKFLOW_EVENT_INVALID' }, 'the contract refuses it first, as today');
  /*
   * La validazione contro la Definition PRIMA di pubblicare è la seconda linea (come il controllo del candidato in
   * `appendEventInternal`): col contratto di serie non si raggiunge, quindi si prova con una migrazione che lascia passare tutto
   * — la forma di un contratto futuro più largo del riduttore.
   */
  await b.store.close();
  const largo = await b.apri({ upgradeEventFn: (valore) => structuredClone(valore) });
  await assert.rejects(createRun(largo, { event: rotto }), { code: 'WORKFLOW_RUN_CREATE_INVALID' });
  assert.deepEqual(readdirSync(join(b.root, 'runs')), [], 'nothing published, no build folder left');
  assert.equal(largo.state, 'ready', 'a refused candidate does not touch the Store state');
});

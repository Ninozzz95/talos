import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { canonicalHash } from '../src/workflow/canonical-json.mjs';
import { compileWorkflowProposal } from '../src/workflow/plan-compiler.mjs';
import { createWorkflowStore, readDefinition } from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const base = JSON.parse(await readFile(
  new URL('./fixtures/workflow/definitions/core-v1-minimal.json', import.meta.url),
  'utf8',
));

const NOW = '2026-09-22T18:00:00.000Z';

function tempRoot() {
  return mkdtempSync(join(tmpdir(), 'talos-workflow-plan-'));
}

async function openStore(root) {
  return createWorkflowStore({
    workflowDataRoot: root,
    workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 },
  });
}

async function harness(t) {
  const root = tempRoot();
  const store = await openStore(root);
  t.after(async () => {
    if (store.state !== 'closed') await store.close();
    rimuoviCartellaDiProva(root);
  });
  return { root, store };
}

function input(overrides = {}) {
  return {
    core: structuredClone(base),
    workflowId: '81000000-0000-4000-8000-000000000001',
    version: 1,
    initiatingSessionId: '82000000-0000-4000-8000-000000000001',
    plannerModel: null,
    sessionModel: 'provider/model',
    ...overrides,
  };
}

const deps = Object.freeze({ nowFn: () => NOW });

test('PLAN-COMPILER-PERSISTED-IMMUTABLE-RECORD', async (t) => {
  const { store } = await harness(t);
  const result = await compileWorkflowProposal(store, input(), deps);
  assert.equal(result.record.definitionHash, canonicalHash(base));
  assert.equal(result.record.proposal.createdAt, NOW);
  assert.deepEqual(await readDefinition(store, {
    workflowId: result.record.workflowId,
    version: result.record.version,
  }), result.record);
});

test('PLAN-COMPILER-JCS-STABLE-HASH / M107_DEFINITION_HASH_INCLUDES_PREFLIGHT', async (t) => {
  const { store } = await harness(t);
  const reordered = {
    acceptance: structuredClone(base.acceptance),
    policy: structuredClone(base.policy),
    limits: structuredClone(base.limits),
    budgets: structuredClone(base.budgets),
    edges: structuredClone(base.edges),
    nodes: structuredClone(base.nodes),
    engineCompatibility: structuredClone(base.engineCompatibility),
    objective: base.objective,
    title: base.title,
    definitionSchemaVersion: base.definitionSchemaVersion,
    schema: base.schema,
  };
  const first = await compileWorkflowProposal(store, input(), deps);
  const second = await compileWorkflowProposal(store, input({
    core: reordered,
    workflowId: '81000000-0000-4000-8000-000000000002',
  }), deps);
  assert.equal(first.record.definitionHash, second.record.definitionHash);
  const metadataOnly = structuredClone(second.record);
  metadataOnly.preflight = { errors: [], warnings: [], estimates: { changed: true } };
  assert.equal(canonicalHash(metadataOnly.core), second.record.definitionHash);
});

test('PLAN-COMPILER-SEMANTIC-CHANGE-NEW-HASH', async (t) => {
  const { store } = await harness(t);
  const first = await compileWorkflowProposal(store, input(), deps);
  const changed = structuredClone(base);
  changed.objective += ' Con controllo aggiuntivo.';
  const second = await compileWorkflowProposal(store, input({
    core: changed,
    workflowId: '81000000-0000-4000-8000-000000000003',
  }), deps);
  assert.notEqual(first.record.definitionHash, second.record.definitionHash);
});

test('PLAN-COMPILER-ERRORS-NOT-PERSISTED / M106_PREFLIGHT_ERRORS_PERSISTED', async (t) => {
  const { store } = await harness(t);
  await assert.rejects(
    () => compileWorkflowProposal(store, input(), {
      nowFn: () => NOW,
      preflightContext: { graphMutationAuthorized: false },
    }),
    (error) => error?.code === 'WORKFLOW_DEFINITION_INVALID'
      && error?.preflight?.errors?.[0]?.code === 'PREFLIGHT_GRAPH_MUTATOR_MISSING',
  );
  await assert.rejects(
    () => readDefinition(store, { workflowId: input().workflowId, version: 1 }),
    (error) => error?.code === 'WORKFLOW_DEFINITION_NOT_FOUND',
  );
});

test('PLAN-COMPILER-WARNINGS-PERSISTED', async (t) => {
  const { store } = await harness(t);
  const result = await compileWorkflowProposal(store, input(), deps);
  assert.ok(result.record.preflight.warnings.some((item) => item.code === 'PREFLIGHT_UNKNOWN_COST'));
  assert.deepEqual((await readDefinition(store, {
    workflowId: result.record.workflowId,
    version: result.record.version,
  })).preflight, result.record.preflight);
});

test('PLAN-COMPILER-STRICT-INPUT', async (t) => {
  const { store } = await harness(t);
  await assert.rejects(
    () => compileWorkflowProposal(store, { ...input(), unexpected: true }, deps),
    (error) => error?.code === 'WORKFLOW_DEFINITION_INVALID',
  );
});

test('PLAN-COMPILER-IDENTITY-AND-VERSION-EXPLICIT', async (t) => {
  const { store } = await harness(t);
  const missingIdentity = input();
  delete missingIdentity.workflowId;
  await assert.rejects(
    () => compileWorkflowProposal(store, missingIdentity, deps),
    (error) => error?.code === 'WORKFLOW_DEFINITION_INVALID',
  );
  await assert.rejects(
    () => compileWorkflowProposal(store, input({ version: 0 }), deps),
    (error) => error?.code === 'WORKFLOW_DEFINITION_INVALID',
  );
});

test('PLAN-COMPILER-RETRY-SAME-BYTES', async (t) => {
  const { store } = await harness(t);
  const first = await compileWorkflowProposal(store, input(), deps);
  const second = await compileWorkflowProposal(store, input(), deps);
  assert.deepEqual(second.record, first.record);
});

test('WF-PROPOSAL-CLOCK-REPLAY: identical proposal returns original record after an ambiguous result', async (t) => {
  const { store } = await harness(t);
  const first = await compileWorkflowProposal(store, input(), { nowFn: () => NOW });
  const replay = await compileWorkflowProposal(store, input(), { nowFn: () => '2026-09-22T18:01:00.000Z' });
  assert.deepEqual(replay.record, first.record);
  assert.equal(replay.record.proposal.createdAt, NOW);
  await assert.rejects(
    () => compileWorkflowProposal(store, input({ sessionModel: 'provider/other' }), {
      nowFn: () => '2026-09-22T18:02:00.000Z',
    }),
    (error) => error?.code === 'WORKFLOW_DEFINITION_CONFLICT',
  );
});

test('PLAN-COMPILER-CONCURRENT-SAME-BYTES', async (t) => {
  const { store } = await harness(t);
  const [first, second] = await Promise.all([
    compileWorkflowProposal(store, input(), deps),
    compileWorkflowProposal(store, input(), deps),
  ]);
  assert.deepEqual(first.record, second.record);
  assert.deepEqual(await readDefinition(store, {
    workflowId: first.record.workflowId,
    version: first.record.version,
  }), first.record);
});

test('PLAN-COMPILER-CONCURRENT-DIFFERENT-BYTES-ONE-WINS', async (t) => {
  const { store } = await harness(t);
  const changed = structuredClone(base);
  changed.title = 'Proposta concorrente differente';
  const outcomes = await Promise.allSettled([
    compileWorkflowProposal(store, input(), deps),
    compileWorkflowProposal(store, input({ core: changed }), deps),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
  assert.equal(rejected?.reason?.code, 'WORKFLOW_DEFINITION_CONFLICT');
});

test('PLAN-COMPILER-CONFLICT-DIFFERENT-BYTES', async (t) => {
  const { store } = await harness(t);
  await compileWorkflowProposal(store, input(), deps);
  const changed = structuredClone(base);
  changed.title = 'Titolo semanticamente differente';
  await assert.rejects(
    () => compileWorkflowProposal(store, input({ core: changed }), deps),
    (error) => error?.code === 'WORKFLOW_DEFINITION_CONFLICT',
  );
});

test('PLAN-COMPILER-NO-APPROVAL-OR-RUN-SIDE-EFFECT / M109_APPROVAL_IMPLICIT_DURING_COMPILE', async (t) => {
  const { root, store } = await harness(t);
  const result = await compileWorkflowProposal(store, input(), deps);
  const versionRoot = join(root, 'definitions', result.record.workflowId, String(result.record.version));
  assert.equal(existsSync(join(versionRoot, 'record.json')), true);
  assert.equal(existsSync(join(versionRoot, 'approval.json')), false);
  assert.deepEqual(readdirSync(join(root, 'runs')), []);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { assertCapacityAvailable, validateCapacityPolicy } from '../src/workflow/admission.mjs';

const workspaceRoot = 'C:\\work\\talos';
const policy = () => ({
  globalAgents: 3, globalWriters: 2, localProcesses: 1,
  perProvider: new Map([['openai', 2]]),
  perModel: new Map([['openai', new Map([['gpt-5-nano', 1]])]]),
  perWorkspaceWriters: new Map([[workspaceRoot, 1]]),
});
const claim = (overrides = {}) => ({
  provider: 'openai', model: 'gpt-5-nano', workspaceRoot,
  agentSlots: 1, writerSlots: 1, localProcessSlots: 1,
  ...overrides,
});

test('ADMISSION-HARD-DIMENSIONS — every hard ceiling and absent key fails closed', () => {
  const limits = policy();
  assert.doesNotThrow(() => assertCapacityAvailable({ policy: limits, activeClaims: [], requested: claim() }));
  for (const [dimension, active, requested] of [
    ['globalAgents', [claim({ agentSlots: 3, writerSlots: 0, localProcessSlots: 0 })], claim({ writerSlots: 0, localProcessSlots: 0 })],
    ['globalWriters', [claim({ agentSlots: 0, writerSlots: 2, localProcessSlots: 0 })], claim({ agentSlots: 0, localProcessSlots: 0 })],
    ['localProcesses', [claim({ agentSlots: 0, writerSlots: 0 })], claim({ agentSlots: 0, writerSlots: 0 })],
    ['perProvider', [claim({ model: 'other', agentSlots: 2, writerSlots: 0, localProcessSlots: 0 })], claim({ writerSlots: 0, localProcessSlots: 0 })],
    ['perModel', [claim({ writerSlots: 0, localProcessSlots: 0 })], claim({ writerSlots: 0, localProcessSlots: 0 })],
    ['perWorkspaceWriters', [claim({ agentSlots: 0, localProcessSlots: 0 })], claim({ agentSlots: 0, localProcessSlots: 0 })],
  ]) {
    assert.throws(() => assertCapacityAvailable({ policy: limits, activeClaims: active, requested }),
      (error) => error.code === 'WORKFLOW_CAPACITY_EXCEEDED', dimension);
  }
  assert.throws(() => assertCapacityAvailable({
    policy: limits, activeClaims: [], requested: claim({ provider: 'anthropic', model: 'claude', writerSlots: 0, localProcessSlots: 0 }),
  }), (error) => error.code === 'WORKFLOW_CAPACITY_EXCEEDED');
  assert.throws(() => assertCapacityAvailable({
    policy: limits, activeClaims: [], requested: claim({ workspaceRoot: 'C:\\other', agentSlots: 0, localProcessSlots: 0 }),
  }), (error) => error.code === 'WORKFLOW_CAPACITY_EXCEEDED');
});

test('ADMISSION-POLICY-INVALID — missing, fractional and overflow values are rejected', () => {
  const missing = policy();
  delete missing.globalAgents;
  assert.throws(() => validateCapacityPolicy(missing), (error) => error.code === 'WORKFLOW_CAPACITY_POLICY_INVALID');
  const fractional = policy();
  fractional.perModel.get('openai').set('gpt-5-nano', 0.5);
  assert.throws(() => validateCapacityPolicy(fractional), (error) => error.code === 'WORKFLOW_CAPACITY_POLICY_INVALID');
  assert.throws(() => assertCapacityAvailable({
    policy: policy(),
    activeClaims: [claim({ agentSlots: Number.MAX_SAFE_INTEGER, writerSlots: 0, localProcessSlots: 0 })],
    requested: claim({ writerSlots: 0, localProcessSlots: 0 }),
  }), (error) => error.code === 'WORKFLOW_CAPACITY_EXCEEDED');
});

// Riparazione 24/09/2026 (mutazione M08 della revisione avversaria sopravvissuta): un provider che
// NON compare in perProvider deve valere tetto 0, anche quando perModel lo elenca. Il caso
// «anthropic» qui sopra era preso comunque da perModel, quindi togliere il `?? 0` di perProvider
// non faceva diventare rosso niente.
test('ADMISSION-UNLISTED-PROVIDER-FAILS-CLOSED — perModel alone never opens a provider absent from perProvider', () => {
  const limits = policy();
  limits.perModel.set('anthropic', new Map([['claude', 5]]));
  assert.throws(() => assertCapacityAvailable({
    policy: limits, activeClaims: [], requested: claim({ provider: 'anthropic', model: 'claude', writerSlots: 0, localProcessSlots: 0 }),
  }), (error) => error.code === 'WORKFLOW_CAPACITY_EXCEEDED' && /^perProvider /u.test(error.message));
  limits.perProvider.set('anthropic', 1);
  assert.doesNotThrow(() => assertCapacityAvailable({
    policy: limits, activeClaims: [], requested: claim({ provider: 'anthropic', model: 'claude', writerSlots: 0, localProcessSlots: 0 }),
  }));
});

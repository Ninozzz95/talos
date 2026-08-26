import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  CostReadError,
  normalizeCostFile,
  readCampaignCosts,
  readHarnessCost,
} from '../src/cost-reader.mjs';
import { PathPolicyError, createPathPolicy } from '../src/path-policy.mjs';

const fixtureBanco = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'banco');
const projects = 'esiti-22ago-progetti';

function fixturePolicy(campaigns = [projects, 'esiti-22ago-storia']) {
  const policy = createPathPolicy({ bancoDir: fixtureBanco, campaigns });
  policy.initialize();
  return policy;
}

function makeBancoWithoutCost(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-harness-cost-'));
  const campaignDir = join(root, projects);
  mkdirSync(campaignDir);
  writeFileSync(join(campaignDir, 'alpha.jsonl'), '{}\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const policy = createPathPolicy({ bancoDir: root, campaigns: [projects] });
  policy.initialize();
  return policy;
}

test('normalizeCostFile accepts only a matching finite canonical cost', () => {
  assert.deepEqual(normalizeCostFile({ harness: 'alpha', costoUsd: 0.25, ignored: true }, 'alpha'), {
    harness: 'alpha',
    costoUsd: 0.25,
    source: 'cost-file',
    estimated: false,
    rowsWithoutCost: 0,
  });
  assert.equal(normalizeCostFile({ harness: 'beta', costoUsd: 0.25 }, 'alpha'), null);
  assert.equal(normalizeCostFile({ harness: 'alpha', costoUsd: -1 }, 'alpha'), null);
  assert.equal(normalizeCostFile([], 'alpha'), null);
});

test('canonical cost uses matching harness cost file before row sum', async () => {
  const result = await readHarnessCost(fixturePolicy(), projects, 'alpha', [
    { harness: 'alpha', costoUsd: 99 },
  ]);
  assert.deepEqual(result, {
    harness: 'alpha',
    costoUsd: 0.02,
    source: 'cost-file',
    estimated: false,
    rowsWithoutCost: 0,
  });
});

test('missing cost file falls back to row sum and marks estimate', async (t) => {
  const result = await readHarnessCost(makeBancoWithoutCost(t), projects, 'alpha', [
    { harness: 'alpha', costoUsd: 0.1 },
    { harness: 'alpha', costoUsd: null },
    { harness: 'alpha', costoUsd: 0.2 },
  ]);
  assert.ok(Math.abs(result.costoUsd - 0.3) < Number.EPSILON * 2);
  assert.equal(result.source, 'row-sum');
  assert.equal(result.estimated, true);
  assert.equal(result.rowsWithoutCost, 1);
});

test('missing file and missing row costs returns null, never zero', async (t) => {
  const result = await readHarnessCost(makeBancoWithoutCost(t), projects, 'alpha', [
    { harness: 'alpha', costoUsd: null },
  ]);
  assert.deepEqual(result, {
    harness: 'alpha',
    costoUsd: null,
    source: 'unavailable',
    estimated: false,
    rowsWithoutCost: 1,
  });
});

test('cost file cannot be selected by browser input', async () => {
  await assert.rejects(
    readHarnessCost(fixturePolicy(), projects, '../alpha', []),
    PathPolicyError,
  );
});

test('readCampaignCosts returns one canonical entry per known harness', async () => {
  const result = await readCampaignCosts(fixturePolicy(), projects, new Map([
    ['beta', [{ harness: 'beta', costoUsd: 50 }]],
    ['alpha', [{ harness: 'alpha', costoUsd: 40 }]],
  ]));
  assert.deepEqual(result.map((cost) => [cost.harness, cost.costoUsd]), [['alpha', 0.02], ['beta', 0.03]]);
});

test('oversized cost file fails closed', async (t) => {
  const policy = makeBancoWithoutCost(t);
  const costFile = policy.resolveHarnessCostFile(projects, 'alpha');
  writeFileSync(costFile, ' '.repeat(70_000));
  await assert.rejects(readHarnessCost(policy, projects, 'alpha', []), CostReadError);
});

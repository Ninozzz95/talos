import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { readCampaignCosts } from '../src/cost-reader.mjs';
import {
  CampaignQueryError,
  createCampaignService,
  decodeCursor,
  encodeCursor,
  summarizeCampaign,
} from '../src/campaign-service.mjs';
import { createPathPolicy } from '../src/path-policy.mjs';
import { createReportSource } from '../src/report-source.mjs';

const fixtureBanco = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'banco');
const projects = 'esiti-22ago-progetti';
const story = 'esiti-22ago-storia';

function makeService({ bancoDir = fixtureBanco, campaigns = [projects, story], clock } = {}) {
  const pathPolicy = createPathPolicy({ bancoDir, campaigns });
  pathPolicy.initialize();
  return createCampaignService({
    pathPolicy,
    costReader: readCampaignCosts,
    reportSource: createReportSource(pathPolicy),
    clock,
  });
}

test('campaign list contains only the configured intersection of the fixed allowlist', async () => {
  const campaigns = await makeService({ campaigns: [story] }).listCampaigns();
  assert.deepEqual(campaigns.map((campaign) => campaign.name), [story]);
  assert.equal(campaigns[0].available, true);
  assert.deepEqual(campaigns[0].jsonlFiles, ['alpha.jsonl']);
  assert.match(campaigns[0].lastModifiedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('run order and cursor are deterministic', async () => {
  const service = makeService();
  await service.getSnapshot(projects);
  const first = await service.listRuns(projects, { limit: 1 });
  assert.equal(first.items[0].harness, 'alpha');
  assert.ok(first.nextCursor);
  assert.deepEqual(decodeCursor(first.nextCursor), [
    first.items[0].harness,
    first.items[0].id,
    first.items[0].source.file,
    first.items[0].source.line,
  ]);
  const second = await service.listRuns(projects, { limit: 1, cursor: first.nextCursor });
  assert.equal(second.items[0].harness, 'beta');
  assert.equal(second.nextCursor, null);
  assert.equal(encodeCursor(decodeCursor(first.nextCursor)), first.nextCursor);
});

test('filters accept only exact harness and esito values', async () => {
  const service = makeService();
  const exact = await service.listRuns(projects, { harness: 'beta', esito: 'parziale-da-rivedere' });
  assert.equal(exact.items.length, 1);
  assert.equal(exact.items[0].id, 'task-after-malformed');
  assert.equal((await service.listRuns(projects, { harness: 'bet' })).items.length, 0);
  assert.equal((await service.listRuns(projects, { esito: '.*' })).items.length, 0);
  await assert.rejects(service.listRuns(projects, { regex: '.*' }), CampaignQueryError);
  assert.throws(() => decodeCursor('not-a-cursor'), CampaignQueryError);
});

test('refresh rereads files and changes readAt/hash without a watcher', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'talos-harness-refresh-'));
  cpSync(fixtureBanco, root, { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let tick = 0;
  const clock = () => new Date(1_780_000_000_000 + tick++ * 1000);
  const service = makeService({ bancoDir: root, clock });
  const before = await service.getSnapshot(projects);
  writeFileSync(join(root, projects, 'alpha.jsonl'), `${JSON.stringify({
    harness: 'alpha', id: 'refreshed', difficolta: 1, esito: 'riuscito', ms: 1,
    costoUsd: 0.001, corpus: 'progetti', modello: 'fixture-model', quota: 'fixture',
    quando: '2026-08-24T11:00:00.000Z', detto: 'nuovo', giriDelTask: [],
  })}\n`, { flag: 'a' });
  const after = await service.getSnapshot(projects);
  assert.notEqual(after.readAt, before.readAt);
  assert.notEqual(after.sourceHash, before.sourceHash);
  assert.equal(after.summary.totalRows, before.summary.totalRows + 1);
});

test('summary counts every observed non-binary outcome without coercion', () => {
  const rows = [
    { harness: 'a', esito: 'riuscito', giriDelTask: [{ esito: 'riuscito' }] },
    { harness: 'a', esito: 'fallito', giriDelTask: [{ esito: 'fallito' }] },
    { harness: 'a', esito: 'ignoto', giriDelTask: [] },
    { harness: 'a', esito: 'parziale-da-rivedere', giriDelTask: [] },
  ];
  const summary = summarizeCampaign(rows, [{
    harness: 'a', costoUsd: 1, source: 'cost-file', estimated: false, rowsWithoutCost: 0,
  }], []);
  assert.deepEqual(summary.outcomeCounts, {
    fallito: 1,
    ignoto: 1,
    'parziale-da-rivedere': 1,
    riuscito: 1,
  });
  assert.equal(summary.totalRows, 4);
  assert.equal(summary.measuredRows, 2);
  assert.equal(summary.majorityPassedRows, 1);
  assert.equal(summary.passRate, 0.5);
});

test('summary labels row cost provenance explicitly', () => {
  const summary = summarizeCampaign([
    { harness: 'a', esito: 'riuscito', giriDelTask: [] },
  ], [{
    harness: 'a', costoUsd: 0.5, source: 'row-sum', estimated: true, rowsWithoutCost: 0,
  }], []);
  assert.equal(summary.canonicalCostUsd, 0.5);
  assert.equal(summary.costEstimated, true);
  assert.equal(summary.harnesses[0].cost.source, 'row-sum');
});

test('report text is returned byte-for-byte and never parsed', async () => {
  const service = makeService();
  const direct = await createReportSource((() => {
    const policy = createPathPolicy({ bancoDir: fixtureBanco, campaigns: [projects] });
    policy.initialize();
    return policy;
  })()).read(projects);
  const viaService = await service.getReport(projects);
  assert.equal(viaService.text, direct.text);
});

test('canonical cost uses matching files in a campaign snapshot', async () => {
  const snapshot = await makeService().getSnapshot(projects);
  assert.equal(snapshot.summary.canonicalCostUsd, 0.05);
  assert.equal(snapshot.summary.costEstimated, false);
  assert.deepEqual(snapshot.summary.harnesses.map((item) => item.cost.source), ['cost-file', 'cost-file']);
});

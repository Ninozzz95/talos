import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createPathPolicy } from '../src/path-policy.mjs';
import {
  MAX_REPORT_BYTES,
  ReportSourceError,
  createReportSource,
} from '../src/report-source.mjs';

const fixtureBanco = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'banco');
const projects = 'esiti-22ago-progetti';

function fixturePolicy() {
  const policy = createPathPolicy({ bancoDir: fixtureBanco, campaigns: [projects] });
  policy.initialize();
  return policy;
}

function makeBanco(t, reportText) {
  const root = mkdtempSync(join(tmpdir(), 'talos-harness-report-'));
  const campaignDir = join(root, projects);
  mkdirSync(campaignDir);
  writeFileSync(join(campaignDir, 'alpha.jsonl'), '{}\n');
  if (reportText !== undefined) writeFileSync(join(campaignDir, 'rapporto.txt'), reportText);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const policy = createPathPolicy({ bancoDir: root, campaigns: [projects] });
  policy.initialize();
  return { root, campaignDir, policy };
}

test('report source returns rapporto.txt byte-for-byte without executing code', async () => {
  const expected = readFileSync(join(fixtureBanco, projects, 'rapporto.txt'), 'utf8');
  const report = await createReportSource(fixturePolicy()).read(projects);
  assert.equal(report.text, expected);
  assert.equal(report.campaign, projects);
  assert.match(report.capturedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(report.sourceHash, /^[a-f0-9]{64}$/);
  assert.equal(report.provenance, 'rapporto.txt-existing-contract');

  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'report-source.mjs'), 'utf8');
  assert.doesNotMatch(source, /child_process|execSync|spawnSync|rapport[o]Campagna/);
});

test('missing rapporto.txt returns Rapporto non ancora prodotto and creates nothing', async (t) => {
  const { campaignDir, policy } = makeBanco(t);
  const reportFile = join(campaignDir, 'rapporto.txt');
  await assert.rejects(
    createReportSource(policy).read(projects),
    (error) => error instanceof ReportSourceError
      && error.code === 'REPORT_UNAVAILABLE'
      && error.message === 'Rapporto non ancora prodotto',
  );
  assert.equal(existsSync(reportFile), false);
});

test('oversized rapporto.txt fails closed', async (t) => {
  const { policy } = makeBanco(t, 'x'.repeat(MAX_REPORT_BYTES + 1));
  await assert.rejects(
    createReportSource(policy).read(projects),
    (error) => error instanceof ReportSourceError && error.code === 'PAYLOAD_LIMIT',
  );
});

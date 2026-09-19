import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  EvolutionBaselineError,
  resolveEvidencePath,
  validateBaselineShape,
  validateEvidence,
  validatePinnedDesktopActions,
  verifyEvolutionBaseline,
} from '../scripts/verifica-baseline-evoluzione.mjs';

test('E0-1 — la baseline reale prova i guardrail della release che stiamo per migrare', async () => {
  const result = await verifyEvolutionBaseline();
  assert.equal(result.schema, 'talos.evolution.implementation-baseline.v1');
  assert.equal(result.sourceCommit, '13f65c15cdeaf8986b882993a0773cdeafb867d2');
  assert.equal(result.desktopVersionAtCapture, '0.1.13');
  assert.ok(result.guardrails >= 16);
  assert.ok(result.pinnedDesktopActions >= 5);
});

test('E0-1 AL CONTRARIO — togliere un marcatore di evidenza rende la baseline rossa', async () => {
  const root = await mkdtemp(join(tmpdir(), 'talos-evolution-baseline-'));
  await writeFile(join(root, 'evidence.txt'), 'presente ma senza il marcatore richiesto', 'utf8');
  const baseline = {
    schema: 'talos.evolution.implementation-baseline.v1',
    source: {
      repository: 'Ninozzz95/talos',
      commit: '1'.repeat(40),
      desktopVersion: '0.1.13',
      capturedAt: '2026-09-19',
    },
    semantics: {
      historicalSnapshot: true,
      locksFutureDesktopVersion: false,
      rule: 'replacement requires reviewed evidence',
    },
    guardrails: [{
      id: 'test.guardrail',
      category: 'test',
      evidence: [{ path: 'evidence.txt', contains: 'QUESTO-DEVE-ESISTERE' }],
    }],
  };
  validateBaselineShape(baseline);
  await assert.rejects(
    validateEvidence({ baseline, repoRoot: root }),
    (error) => error instanceof EvolutionBaselineError && error.code === 'EVOLUTION_BASELINE_GUARD_MISSING',
  );
});

test('E0-1 AL CONTRARIO — un action desktop puntato a tag e non a SHA pieno viene rifiutato', () => {
  const workflow = [
    'jobs:',
    '  desktop:',
    '    steps:',
    '      - uses: actions/checkout@v7',
  ].join('\n');
  assert.throws(
    () => validatePinnedDesktopActions(workflow),
    (error) => error instanceof EvolutionBaselineError && error.code === 'EVOLUTION_BASELINE_ACTION_NOT_PINNED',
  );
});

test('E0-1 AL CONTRARIO — anche una action con name + uses deve essere fissata a SHA pieno', () => {
  const workflow = [
    'jobs:',
    '  desktop:',
    '    steps:',
    '      - name: cache',
    '        uses: actions/cache@v6',
  ].join('\n');
  assert.throws(
    () => validatePinnedDesktopActions(workflow),
    (error) => error instanceof EvolutionBaselineError && error.code === 'EVOLUTION_BASELINE_ACTION_NOT_PINNED',
  );
});

test('E0-1 AL CONTRARIO — due guardrail con lo stesso id non possono mascherarsi', () => {
  const baseline = {
    schema: 'talos.evolution.implementation-baseline.v1',
    source: {
      repository: 'Ninozzz95/talos',
      commit: '2'.repeat(40),
      desktopVersion: '0.1.13',
      capturedAt: '2026-09-19',
    },
    semantics: {
      historicalSnapshot: true,
      locksFutureDesktopVersion: false,
      rule: 'replacement requires reviewed evidence',
    },
    guardrails: [
      { id: 'test.duplicato', category: 'test', evidence: [{ path: 'a', contains: 'x' }] },
      { id: 'test.duplicato', category: 'test', evidence: [{ path: 'b', contains: 'y' }] },
    ],
  };
  assert.throws(
    () => validateBaselineShape(baseline),
    (error) => error instanceof EvolutionBaselineError && error.code === 'EVOLUTION_BASELINE_DUPLICATE',
  );
});

test('E0-1 AL CONTRARIO — una evidenza non può uscire dalla radice del repository', () => {
  assert.throws(
    () => resolveEvidencePath('C:\\repo', '../segreto.txt'),
    (error) => error instanceof EvolutionBaselineError && error.code === 'EVOLUTION_BASELINE_PATH_INVALID',
  );
});

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  JsonlReadError,
  normalizeRunRow,
  readCampaignRows,
  readJsonlFile,
} from '../src/jsonl-reader.mjs';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'banco');
const projects = join(fixtures, 'esiti-22ago-progetti');

function validValue(overrides = {}) {
  return {
    harness: 'alpha',
    id: 'task-1',
    difficolta: 2,
    esito: 'riuscito',
    ms: 125,
    costoUsd: 0.0125,
    corpus: 'progetti',
    modello: 'fixture-model',
    quota: 'fixture-provider',
    quando: '2026-08-24T10:00:00.000Z',
    detto: 'testo completo sintetico',
    cambiamenti: { quanti: 1, estratti: { secret: 'drop' } },
    giriDelTask: [{ esito: 'riuscito', ms: 120, costoUsd: 0.01, fonteDelCosto: 'drop' }],
    ...overrides,
  };
}

async function collect(iterator) {
  const items = [];
  for await (const item of iterator) items.push(item);
  return items;
}

test('valid row preserves only the approved fields', () => {
  const result = normalizeRunRow(validValue({ unknownTopLevel: 'drop' }), { file: 'alpha.jsonl', line: 7 });
  assert.ok(result.row);
  assert.deepEqual(Object.keys(result.row), [
    'rowKey', 'harness', 'id', 'difficolta', 'esito', 'ms', 'costoUsd',
    'corpus', 'modello', 'quota', 'quando', 'giriDelTask', 'detto', 'cambiamenti', 'source',
  ]);
  assert.deepEqual(result.row.source, { file: 'alpha.jsonl', line: 7 });
});

test('unknown fields never cross the normalization boundary', () => {
  const result = normalizeRunRow(validValue({ token: { secret: true }, uscita: '<script>' }), { file: 'alpha.jsonl', line: 1 });
  assert.equal('token' in result.row, false);
  assert.equal('uscita' in result.row, false);
  assert.equal('unknownTopLevel' in result.row, false);
  assert.deepEqual(result.row.cambiamenti, { quanti: 1 });
});

test('missing optional cambiamenti is null, not a crash', () => {
  const value = validValue();
  delete value.cambiamenti;
  assert.equal(normalizeRunRow(value, { file: 'alpha.jsonl', line: 1 }).row.cambiamenti, null);
});

test('non-binary esito is preserved verbatim', () => {
  const result = normalizeRunRow(validValue({ esito: 'parziale-da-rivedere' }), { file: 'alpha.jsonl', line: 1 });
  assert.equal(result.row.esito, 'parziale-da-rivedere');
});

test('malformed line yields a line diagnostic and later rows remain readable', async () => {
  const items = await collect(readJsonlFile(join(projects, 'beta.jsonl')));
  assert.equal(items[0].diagnostic.code, 'ROW_INVALID');
  assert.deepEqual(items[0].diagnostic.source, { file: 'beta.jsonl', line: 1 });
  assert.equal(items[1].row.id, 'task-after-malformed');
});

test('non-object JSON yields a diagnostic', async () => {
  const items = await collect(readJsonlFile(join(projects, 'alpha.jsonl')));
  assert.equal(items.at(-1).diagnostic.code, 'ROW_INVALID');
  assert.equal(items.at(-1).diagnostic.reason, 'ROW_NOT_OBJECT');
});

test('file, line and campaign limits fail closed', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'talos-harness-jsonl-limit-'));
  const file = join(root, 'limit.jsonl');
  writeFileSync(file, `${JSON.stringify(validValue())}\n${JSON.stringify(validValue({ id: 'task-2' }))}\n`);
  t.after(() => rmSync(root, { recursive: true, force: true }));

  await assert.rejects(collect(readJsonlFile(file, { maxFileBytes: 8 })), JsonlReadError);
  await assert.rejects(collect(readJsonlFile(file, { maxLineBytes: 8 })), JsonlReadError);

  const pathPolicy = {
    listJsonlFiles() { return [file]; },
  };
  await assert.rejects(
    readCampaignRows(pathPolicy, 'esiti-22ago-progetti', { maxCampaignRows: 1 }),
    JsonlReadError,
  );
});

test('detto remains complete text and is never logged', () => {
  const complete = 'prima riga\nseconda riga con <tag> e caratteri è';
  const calls = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => calls.push(args);
  console.error = (...args) => calls.push(args);
  try {
    const result = normalizeRunRow(validValue({ detto: complete }), { file: 'alpha.jsonl', line: 1 });
    assert.equal(result.row.detto, complete);
    assert.deepEqual(calls, []);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

test('giriDelTask strips fields outside esito/ms/costoUsd', () => {
  const result = normalizeRunRow(validValue(), { file: 'alpha.jsonl', line: 1 });
  assert.deepEqual(result.row.giriDelTask, [{ esito: 'riuscito', ms: 120, costoUsd: 0.01 }]);
});

test('readCampaignRows returns basenames, diagnostics and a stable SHA-256 shape', async () => {
  const files = [join(projects, 'alpha.jsonl'), join(projects, 'beta.jsonl')];
  const read = await readCampaignRows({ listJsonlFiles: () => files }, 'esiti-22ago-progetti');
  assert.equal(read.campaign, 'esiti-22ago-progetti');
  assert.deepEqual(read.sourceFiles, files.map((file) => basename(file)).sort());
  assert.match(read.readAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(read.sourceHash, /^[a-f0-9]{64}$/);
  assert.ok(read.rows.length >= 2);
  assert.ok(read.diagnostics.length >= 2);
});

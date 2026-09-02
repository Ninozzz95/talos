import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { extractLegacyContract } from '../../scripts/extract-legacy-contract.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const fixturePath = path.join(here, '../fixtures/legacy-contract.snapshot.json');

const input = Object.freeze({
  appPath: path.join(repoRoot, 'harness-ui/public/app.js'),
  htmlPath: path.join(repoRoot, 'harness-ui/public/index.html'),
  cssPath: path.join(repoRoot, 'harness-ui/public/styles.css'),
  aguiPath: path.join(repoRoot, 'harness-ui/src/agui-events.mjs'),
  staticPath: path.join(repoRoot, 'harness-ui/src/static-files.mjs'),
});

test('il contratto frontend desktop resta congelato prima dell’estrazione modulare', async () => {
  const expected = JSON.parse(await readFile(fixturePath, 'utf8'));
  const actual = await extractLegacyContract(input);
  assert.deepEqual(actual, expected);
});

test('la baseline contiene i contratti pubblici che il refactor deve conservare', async () => {
  const expected = JSON.parse(await readFile(fixturePath, 'utf8'));

  assert.ok(expected.hostGlobals.includes('__talosHarnessApiBase'));
  assert.ok(expected.hostGlobals.includes('__talosHarnessRoot'));
  assert.ok(expected.hostGlobals.includes('__talosHarnessUiRuntime'));
  assert.ok(expected.storageKeys.includes('talos.harness.desktop.settings.v1'));
  assert.ok(expected.eventTypes.includes('RunStarted'));
  assert.ok(expected.eventTypes.includes('TextMessageContent'));
  assert.ok(expected.eventTypes.includes('ToolCallResult'));
  assert.ok(expected.publicAssets.includes('/'));
  assert.ok(expected.publicAssets.includes('/app.js'));
  assert.ok(expected.publicAssets.includes('/styles.css'));
  assert.ok(expected.endpointFragments.some((value) => value.includes('/api/v1/sessions')));
  assert.ok(expected.endpointFragments.includes('/api/v1/workspace-browser'));
  assert.ok(expected.endpointFragments.includes('/api/v1/workspace-launches'));
  assert.deepEqual(expected.terminalFrames, { data: 0, control: 1 });
  assert.equal(expected.source, 'harness-ui/public');
  assert.ok(expected.assets.app.bytes > 400_000);
  assert.ok(expected.assets.html.bytes > 60_000);
  assert.ok(expected.assets.css.bytes > 140_000);
});

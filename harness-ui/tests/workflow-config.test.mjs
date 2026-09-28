import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import test from 'node:test';

import { ConfigurationError, loadConfig } from '../src/config.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

test('M073_WORKFLOW_DATA_ROOT_FALLS_BACK_TO_REPO — zero config leaves Workflow unavailable', () => {
  const config = loadConfig({}, new URL('../server.mjs', import.meta.url));
  assert.equal(config.workflowDataRoot, null);
});

test('WORKFLOW-CONFIG-EXPLICIT — explicit absolute Workflow root is normalized', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-config-'));
  t.after(() => rimuoviCartellaDiProva(root));
  const config = loadConfig({ TALOS_HARNESS_UI_WORKFLOW_DIR: root }, import.meta.url);
  assert.equal(config.workflowDataRoot, resolve(root));
  assert.equal(isAbsolute(config.workflowDataRoot), true);
});

test('WORKFLOW-CONFIG-DESKTOP — Desktop data root derives a dedicated workflows child', (t) => {
  const dataRoot = mkdtempSync(join(tmpdir(), 'talos-desktop-data-'));
  t.after(() => rimuoviCartellaDiProva(dataRoot));
  const config = loadConfig({ TALOS_DESKTOP_DATA_DIR: dataRoot }, import.meta.url);
  assert.equal(config.workflowDataRoot, join(resolve(dataRoot), 'workflows'));
});

test('WORKFLOW-CONFIG-ABSOLUTE — relative explicit and Desktop roots fail closed', () => {
  assert.throws(
    () => loadConfig({ TALOS_HARNESS_UI_WORKFLOW_DIR: 'relative/workflows' }, import.meta.url),
    ConfigurationError,
  );
  assert.throws(
    () => loadConfig({ TALOS_DESKTOP_DATA_DIR: 'relative/data' }, import.meta.url),
    ConfigurationError,
  );
});

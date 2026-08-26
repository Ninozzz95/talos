import assert from 'node:assert/strict';
import { accessSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  ConfigurationError,
  DEFAULT_HOST,
  DEFAULT_PORT,
  INITIAL_CAMPAIGNS,
  loadConfig,
} from '../src/config.mjs';

function makeBanco(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-harness-config-'));
  for (const campaign of INITIAL_CAMPAIGNS) {
    mkdirSync(join(root, campaign));
  }
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('config rejects missing TALOS_BANCO_DIR', () => {
  assert.throws(() => loadConfig({}, import.meta.url), ConfigurationError);
});

test('config rejects non-loopback host', (t) => {
  const bancoDir = makeBanco(t);
  for (const host of ['0.0.0.0', '192.168.1.2', 'example.test']) {
    assert.throws(
      () => loadConfig({ TALOS_BANCO_DIR: bancoDir, TALOS_HARNESS_UI_HOST: host }, import.meta.url),
      ConfigurationError,
    );
  }
});

test('config cannot expand the campaign allowlist', (t) => {
  const bancoDir = makeBanco(t);
  assert.throws(
    () => loadConfig({
      TALOS_BANCO_DIR: bancoDir,
      TALOS_HARNESS_UI_CAMPAIGNS: 'esiti-22ago-progetti,esiti-non-ammessi',
    }, import.meta.url),
    ConfigurationError,
  );
});

test('config applies fixed defaults and permits only an allowlist restriction', (t) => {
  const bancoDir = makeBanco(t);
  const config = loadConfig({
    TALOS_BANCO_DIR: bancoDir,
    TALOS_HARNESS_UI_CAMPAIGNS: 'esiti-22ago-storia',
  }, new URL('../server.mjs', import.meta.url));

  assert.equal(config.host, DEFAULT_HOST);
  assert.equal(config.port, DEFAULT_PORT);
  assert.deepEqual(config.campaigns, ['esiti-22ago-storia']);
  assert.equal(config.bancoDir, bancoDir);
  // ⭐ 26/8, DEC-053: il bundle canonico è mobile/public/harness-ui/ (la
  // pipeline AG-UI ci è già portata, verificata), non più harness-ui/public/
  // (la copia desktop originale, mai riconciliata con l'integrazione mobile).
  assert.match(config.publicDir, /mobile[\\/]public[\\/]harness-ui$/);
  accessSync(config.publicDir); // esiste davvero — non solo il pattern del nome
});

test('config rejects relative or unreadable banco paths and invalid ports', (t) => {
  const bancoDir = makeBanco(t);
  assert.throws(() => loadConfig({ TALOS_BANCO_DIR: 'relative/banco' }, import.meta.url), ConfigurationError);
  assert.throws(
    () => loadConfig({ TALOS_BANCO_DIR: join(bancoDir, 'missing') }, import.meta.url),
    ConfigurationError,
  );
  for (const port of ['1023', '65536', 'abc', '4174.5']) {
    assert.throws(
      () => loadConfig({ TALOS_BANCO_DIR: bancoDir, TALOS_HARNESS_UI_PORT: port }, import.meta.url),
      ConfigurationError,
    );
  }
});

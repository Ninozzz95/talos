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
  modelloRichiestaValido,
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

// ⭐⭐⭐ 27/8 — owner: "per adesso un allowlist per testare". Fail-closed per
// costruzione: assente = zero cartelle, mai "qualunque cartella passi".
test('config.cartelleProgetto è vuota per costruzione quando TALOS_HARNESS_UI_PROJECT_DIRS è assente', (t) => {
  const bancoDir = makeBanco(t);
  const config = loadConfig({ TALOS_BANCO_DIR: bancoDir }, import.meta.url);
  assert.deepEqual(config.cartelleProgetto, []);
});

test('config accetta un elenco di cartelle progetto VERE, separate da ";", con id stabili e nomi derivati', (t) => {
  const bancoDir = makeBanco(t);
  const uno = mkdtempSync(join(tmpdir(), 'talos-progetto-uno-'));
  const due = mkdtempSync(join(tmpdir(), 'talos-progetto-due-'));
  t.after(() => { rmSync(uno, { recursive: true, force: true }); rmSync(due, { recursive: true, force: true }); });

  const config = loadConfig({
    TALOS_BANCO_DIR: bancoDir,
    TALOS_HARNESS_UI_PROJECT_DIRS: `${uno};${due}`,
  }, import.meta.url);

  assert.equal(config.cartelleProgetto.length, 2);
  assert.equal(config.cartelleProgetto[0].id, '0');
  assert.equal(config.cartelleProgetto[1].id, '1');
  assert.ok(config.cartelleProgetto[0].percorso.endsWith(config.cartelleProgetto[0].nome));
});

test('⛔ config rifiuta una cartella progetto relativa, inesistente, o ripetuta due volte', (t) => {
  const bancoDir = makeBanco(t);
  const vera = mkdtempSync(join(tmpdir(), 'talos-progetto-vera-'));
  t.after(() => rmSync(vera, { recursive: true, force: true }));

  assert.throws(
    () => loadConfig({ TALOS_BANCO_DIR: bancoDir, TALOS_HARNESS_UI_PROJECT_DIRS: 'relative/progetto' }, import.meta.url),
    ConfigurationError,
    'relativa',
  );
  assert.throws(
    () => loadConfig({ TALOS_BANCO_DIR: bancoDir, TALOS_HARNESS_UI_PROJECT_DIRS: join(vera, 'assente') }, import.meta.url),
    ConfigurationError,
    'inesistente',
  );
  assert.throws(
    () => loadConfig({ TALOS_BANCO_DIR: bancoDir, TALOS_HARNESS_UI_PROJECT_DIRS: `${vera};${vera}` }, import.meta.url),
    ConfigurationError,
    'ripetuta',
  );
});

test('modelloRichiestaValido accetta il formato OpenRouter vendor/nome, e AL CONTRARIO rifiuta spazi, righe vuote e assenza di slash', () => {
  assert.equal(modelloRichiestaValido('deepseek/deepseek-chat'), true);
  assert.equal(modelloRichiestaValido('deepseek/deepseek-r1:free'), true);
  assert.equal(modelloRichiestaValido('z-ai/glm-4.7-flash'), true);
  assert.equal(modelloRichiestaValido('formato sbagliato con spazi'), false);
  assert.equal(modelloRichiestaValido('senza-slash'), false);
  assert.equal(modelloRichiestaValido(''), false);
  assert.equal(modelloRichiestaValido('vendor/'), false);
  assert.equal(modelloRichiestaValido(null), false);
  assert.equal(modelloRichiestaValido(42), false);
});

/*
 * ⛔⛔⛔ 27/8 — trovato dalla pipeline QA visiva (scripts/qa-visual-pipeline.mjs)
 * mentre provava il picker con una richiesta VERA: scegliere uno dei 12
 * alias reali "-latest" di OpenRouter (verificato con GET
 * https://openrouter.ai/api/v1/models) produceva SEMPRE un 400. Questi
 * 4 id sono ESATTAMENTE quelli visti nel catalogo il 27/8, non inventati.
 */
test('modelloRichiestaValido accetta i 12 alias reali "-latest" di OpenRouter (prefisso ~), e AL CONTRARIO rifiuta una tilde fuori posto', () => {
  assert.equal(modelloRichiestaValido('~anthropic/claude-sonnet-latest'), true);
  assert.equal(modelloRichiestaValido('~deepseek/deepseek-v4-flash-latest'), true);
  assert.equal(modelloRichiestaValido('~openai/gpt-latest'), true);
  assert.equal(modelloRichiestaValido('~google/gemini-flash-latest'), true);
  assert.equal(modelloRichiestaValido('~'), false);
  assert.equal(modelloRichiestaValido('~/'), false);
  assert.equal(modelloRichiestaValido('~~doppia/tilde'), false);
  assert.equal(modelloRichiestaValido('vendor/~nel-mezzo'), false);
  assert.equal(modelloRichiestaValido('~vendor/'), false);
});

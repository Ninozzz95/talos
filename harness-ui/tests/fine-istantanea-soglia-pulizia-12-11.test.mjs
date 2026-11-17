/*
 * Giudice v1605 (12/11/2026): `fine-istantanea-soglia-12-11.test.mjs` creava le sue cartelle (`mkdtempSync(join(tmpdir(),
 * 'fine-istantanea-'))`) e non le toglieva: una corsa col TEMP vero ne ha lasciate 75 nel TEMP dell'owner. Questa prova fa girare quel file
 * in un processo figlio con un TEMP tutto suo (sotto il tmpdir di questa corsa) e conta le cartelle `fine-istantanea-*` rimaste: zero.
 * Precedente nel nostro codice: `tests/aiuto/rimuovi-cartella-di-prova.mjs` (la rimozione con ritentativi, usata in `t.after` da
 * `compattazione-istantanea-revisione-2.test.mjs:54`); fra i concorrenti, Codex crea le cartelle di prova con `tempfile::TempDir`, che si
 * toglie da sola quando la prova finisce (codex-rs/core/tests/suite/compact.rs:6049, `TempDir::new()`).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');

test('FINE-ISTANTANEA-SOGLIA PULIZIA — il file delle prove non lascia nessuna cartella `fine-istantanea-*` nel TEMP', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'pulizia-fine-istantanea-'));
  t.after(() => rimuoviCartellaDiProva(temp));
  /* senza NODE_TEST_CONTEXT: con quella variabile il figlio si crede un sotto-processo del runner e non è una corsa vera */
  const { NODE_TEST_CONTEXT: _contesto, ...ambiente } = process.env;
  const figlio = spawnSync(process.execPath, ['--test', '--test-reporter=tap', join(import.meta.dirname, 'fine-istantanea-soglia-12-11.test.mjs')], {
    cwd: join(import.meta.dirname, '..'), encoding: 'utf8', timeout: 240_000,
    env: { ...ambiente, TEMP: temp, TMP: temp, TMPDIR: temp, TALOS_HARNESS_UI_KEYRING: 'memoria' },
  });
  assert.equal(figlio.status, 0, `il file delle prove è rosso da solo:\n${String(figlio.stdout).slice(-2000)}`);
  assert.match(String(figlio.stdout), /^# pass 3$/mu, `il figlio non ha fatto girare le 3 prove:\n${String(figlio.stdout).slice(-2000)}`);
  const rimaste = readdirSync(temp).filter((nome) => nome.startsWith('fine-istantanea-'));
  assert.deepEqual(rimaste, [], `cartelle di prova rimaste nel TEMP: ${rimaste.length}`);
});

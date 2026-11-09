/*
 * Fuga trovata il 31/10/2026 in WSL: 32 host di prova vivi da due giorni. Un host che nessuno chiude deve uscire da solo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

for (const [nome, argomenti] of [['host-con-comando.mjs', []], ['host-revisione-gruppi.mjs', ['exit 0']]]) {
  test(`HOST-FUGA-01 ${nome} exits on its own when nobody closes it`, async () => {
    const cartella = mkdtempSync(join(tmpdir(), 'host-fuga-'));
    const host = spawn(process.execPath, [fileURLToPath(new URL(`./fixtures/${nome}`, import.meta.url)), cartella, ...argomenti], {
      stdio: 'ignore', env: { ...process.env, TALOS_HOST_PROVA_MS: '1500' },
    });
    try {
      const esito = await Promise.race([
        new Promise((r) => host.once('exit', (codice) => r(codice))),
        new Promise((r) => setTimeout(() => r('still alive after 20 s'), 20_000)),
      ]);
      assert.equal(esito, 0);
    } finally {
      host.kill('SIGKILL');
      rimuoviCartellaDiProva(cartella);
    }
  });
}

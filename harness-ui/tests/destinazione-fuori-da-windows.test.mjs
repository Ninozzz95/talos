/*
 * Dove gira un comando fuori da Windows (31/10/2026). `wsl.exe` risponde anche da dentro WSL con l'interop acceso: TALOS su Linux faceva rientrare
 * i comandi da Windows in un'altra shell, e AND-08/09 cadevano. Su Linux e Android si esegue qui; altrove un comando chiesto in Linux non parte.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { destinazioneDelComando } from '../src/kernel/talosHarness.mjs';

for (const piattaforma of ['linux', 'android']) {
  test(`WSL-NATIVO-01 on ${piattaforma} a command runs here, also when Linux was asked`, async () => {
    assert.deepEqual(await destinazioneDelComando('ls', { dove: 'wsl2', piattaforma }), { ambiente: 'windows' });
    assert.deepEqual(await destinazioneDelComando('ls', { piattaforma, automaticoInLinux: true }), { ambiente: 'windows' });
  });
}

test('WSL-NATIVO-02 on macOS a command asked in Linux does not start in silence', async () => {
  assert.deepEqual(await destinazioneDelComando('ls', { dove: 'wsl2', piattaforma: 'darwin' }), { ambiente: 'assente' });
  assert.deepEqual(await destinazioneDelComando('ls', { piattaforma: 'darwin' }), { ambiente: 'windows' });
});

test('WSL-NATIVO-03 asking for Windows stays Windows on every platform', async () => {
  for (const piattaforma of ['win32', 'linux', 'darwin']) {
    assert.deepEqual(await destinazioneDelComando('ls', { dove: 'windows', piattaforma }), { ambiente: 'windows' });
  }
});

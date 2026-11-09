/*
 * La prova di `aiuto/attendi-figli-sulla-cartella.mjs` (03/11/2026): la pulizia di d-freno-23-10 e di S2-2-CONTA-01 cadeva con EPERM
 * sotto carico perché il `git -C <cartella>` del riassunto in sottofondo era ancora vivo. Qui la premessa si costruisce apposta, senza
 * aspettare il carico: un figlio con la cartella come directory corrente E nei suoi argomenti (come `git -C <cartella>`), che finisce
 * da solo dopo poco.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { attendiFigliSullaCartella } from './aiuto/attendi-figli-sulla-cartella.mjs';

/* Il figlio dice «pronto» quando gira davvero: l evento 'spawn' arriva prima, e misurato qui una rimozione subito dopo 'spawn' riusciva. */
async function figlioSullaCartella(cartella, durataMs) {
  const figlio = spawn(process.execPath, ['-e', `process.stdout.write('pronto'); setTimeout(() => {}, ${durataMs})`, cartella], { cwd: cartella, stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise((ok, ko) => { figlio.stdout.once('data', ok); figlio.once('error', ko); });
  return figlio;
}

test('ATTENDI-FIGLI-01 — un figlio vivo sulla cartella: si aspetta che finisca, poi la cartella si rimuove', async (t) => {
  const cartella = cartellaDiProva('talos-attendi-figli-');
  t.after(() => { if (existsSync(cartella)) rimuoviCartellaDiProva(cartella); });
  const figlio = await figlioSullaCartella(cartella, 1_500);
  const t0 = Date.now();
  await attendiFigliSullaCartella(cartella);
  assert.notEqual(figlio.exitCode ?? figlio.signalCode, null, 'quando l aiuto torna, il figlio è finito');
  assert.ok(Date.now() - t0 >= 1_000, 'ha aspettato il figlio, non è tornato subito');
  rimuoviCartellaDiProva(cartella);
  assert.equal(existsSync(cartella), false);
});

test('ATTENDI-FIGLI-02 — AL CONTRARIO (Windows): senza l aiuto, la stessa cartella col figlio vivo non si rimuove (EPERM)', { skip: process.platform !== 'win32' && 'su POSIX una cartella corrente di un processo si rimuove' }, async (t) => {
  const cartella = cartellaDiProva('talos-attendi-figli-contrario-');
  const figlio = await figlioSullaCartella(cartella, 3_000);
  t.after(async () => { figlio.kill(); await attendiFigliSullaCartella(cartella); rimuoviCartellaDiProva(cartella); });
  assert.throws(() => rimuoviCartellaDiProva(cartella), (e) => e.code === 'EPERM' || e.code === 'EBUSY');
});

test('ATTENDI-FIGLI-03 — un figlio su UN ALTRA cartella non si aspetta, e il tetto vale', async (t) => {
  const cartella = cartellaDiProva('talos-attendi-figli-mia-');
  const altra = cartellaDiProva('talos-attendi-figli-altra-');
  const figlio = await figlioSullaCartella(altra, 5_000);
  t.after(async () => { figlio.kill(); await attendiFigliSullaCartella(altra); rimuoviCartellaDiProva(altra); rimuoviCartellaDiProva(cartella); });
  let t0 = Date.now();
  await attendiFigliSullaCartella(cartella);
  assert.ok(Date.now() - t0 < 500, 'il figlio di un altra cartella non trattiene questa');
  t0 = Date.now();
  await attendiFigliSullaCartella(altra, { tettoMs: 300 });
  assert.ok(Date.now() - t0 < 1_500, 'col tetto di 300 ms torna anche se il figlio è ancora vivo');
  assert.equal(figlio.exitCode, null, 'il figlio era davvero ancora vivo');
});

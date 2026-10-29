/*
 * 27/10/2026 — revisione del blocco 10, G-R5, la metà del kernel (d'accordo con la CLI): `uccidiAlberoDelProcesso` lanciava `taskkill`
 * per NOME. Un taskkill.exe in una cartella del PATH davanti a System32 girava al posto di quello di sistema e lasciava l'albero vivo
 * (la stessa malattia di J-R4, curata nei moduli del server con `taskkill-di-sistema.mjs`). Ora il percorso intero, con la regola di
 * `SystemRoot` (solo una radice con la lettera del disco, altrimenti C:\Windows).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { uccidiAlberoDelProcesso } from '../src/kernel/talosHarness.mjs';
import { percorsoTaskkill } from '../src/taskkill-di-sistema.mjs';

test('TASKKILL-K-01 su Windows il kernel lancia taskkill per percorso intero, mai per nome', () => {
  const lanciati = [];
  const figlio = { pid: 4242, exitCode: null, signalCode: null, kill: () => {} };
  uccidiAlberoDelProcesso(figlio, { piattaforma: 'win32', spawnFn: (comando, argomenti) => { lanciati.push([comando, argomenti]); return { on() {} }; } });
  assert.equal(lanciati.length, 1);
  assert.equal(lanciati[0][0], percorsoTaskkill(process.env.SystemRoot));
  assert.match(lanciati[0][0], /^[A-Za-z]:\\.*\\System32\\taskkill\.exe$/u);
  assert.deepEqual(lanciati[0][1], ['/PID', '4242', '/T', '/F']);
});

test('TASKKILL-K-02 nessun taskkill per nome resta nel kernel (la riga della ricarica dopo la compattazione compresa)', () => {
  for (const f of ['../src/kernel/talosHarness.mjs', '../src/kernel/ricarica-post-compact.mjs']) {
    const testo = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(testo, /(?:spawnFn|execFile|spawn|spawnSync|execFileSync)\(\s*'taskkill'/u, f);
  }
});

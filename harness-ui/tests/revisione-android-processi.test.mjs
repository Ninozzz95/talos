/*
 * REVISIONE AVVERSARIA di 9f95dddb8 · c468bc865 · ff1b90c57 (15/10/2026 sera, bugfixer) — il comando nel suo gruppo, fuori da Windows.
 * Processi VERI: si lancia su Linux (WSL, PATH pulito). «[CURATO 15/10, era rossa]» = difetto mostrato; ogni prova dice cosa faceva PRIMA delle patch
 * (misurato sulla base `ca647e08d` con la stessa prova).
 * Il Ctrl-C del terminale si imita come lo manda un terminale: SIGINT al GRUPPO dell'host (l'host parte in un gruppo suo).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import * as kernel from '../src/kernel/talosHarness.mjs'; // la base `ca647e08d` non ha `creaPuliziaDeiGruppi`: le prove di processo girano anche lì

const HOST = fileURLToPath(new URL('./fixtures/host-revisione-gruppi.mjs', import.meta.url));
const SALTA = process.platform === 'win32' && 'gruppi di processi POSIX: su Windows c\'è taskkill /T';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
// `^`: solo il processo il cui comando COMINCIA con la marca (la riga dell'host porta il comando come argomento, e un host vivo farebbe un falso «vivo»)
const viviCon = (marca) => spawnSync('pgrep', ['-f', `^${marca}`], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
const togli = (marca) => spawnSync('pkill', ['-KILL', '-f', marca]);

async function avviaHost(comando, extra = []) {
  const cartella = mkdtempSync(join(tmpdir(), 'rev-gruppi-'));
  const host = spawn(process.execPath, [HOST, cartella, comando, ...extra], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let fuori = '';
  host.stdout.on('data', (d) => { fuori += d; });
  host.stderr.on('data', (d) => { fuori += d; });
  const t0 = Date.now();
  while (!/GRUPPO \d+/u.test(fuori) && Date.now() - t0 < 10_000) await pausa(50);
  assert.match(fuori, /GRUPPO \d+/u, `il comando non è partito: ${fuori}`);
  return { host, cartella, fuori: () => fuori };
}

test('REV-AND-01 [REGGE] — Ctrl-C all\'host: un comando che sa chiudersi pulito (trap su INT) finisce la sua pulizia, come prima: l\'host muore per il segnale, e un\'uscita per segnale non passa da `exit` (nessun SIGKILL)', { skip: SALTA }, async () => {
  const { host, cartella } = await avviaHost(`trap 'sleep 0.6; echo pulito > "${'$'}PWD/pulito.txt"; exit 0' INT TERM; sleep 62 & wait`);
  try {
    await pausa(300);
    process.kill(-host.pid, 'SIGINT');
    await pausa(2_000);
    assert.equal(existsSync(join(cartella, 'pulito.txt')), true, 'il comando ha ricevuto SIGINT ma non ha potuto finire la sua pulizia (0,6 s)');
  } finally {
    try { process.kill(-host.pid, 'SIGKILL'); } catch { /* già uscito */ }
    togli('sleep 62');
    rimuoviCartellaDiProva(cartella);
  }
});

for (const segnale of ['SIGHUP', 'SIGTERM']) {
  test(`REV-AND-02 [CURATO 15/10, era rossa] — ${segnale} al gruppo dell\'host (${segnale === 'SIGHUP' ? 'terminale chiuso' : 'host fermato'}): un comando lasciato in sottofondo (\`cmd &\`, la shell è già uscita) SOPRAVVIVE, orfano; prima moriva con l\'host. (Col Ctrl-C sopravvive prima e dopo: un \`&\` di una shell non interattiva ignora SIGINT, POSIX — misurato sulla base)`, { skip: SALTA }, async () => {
    const { host, cartella } = await avviaHost('sleep 63 & echo partito');
    try {
      await pausa(800); // la shell è uscita: il gruppo è dimenticato (dichiarato nel commit)
      assert.ok(viviCon('sleep 63').length > 0, 'premessa: il comando in sottofondo è partito');
      process.kill(-host.pid, segnale);
      await pausa(800);
      assert.deepEqual(viviCon('sleep 63'), [], `dopo ${segnale} all'host il comando in sottofondo è ancora vivo, orfano, per sempre`);
    } finally {
      try { process.kill(-host.pid, 'SIGKILL'); } catch { /* già uscito */ }
      togli('sleep 63');
      rimuoviCartellaDiProva(cartella);
    }
  });
}

test('REV-AND-03 [REGGE] — un host che gestisce SIGINT senza uscire: il comando lo riceve (come prima nel terminale) e l\'host resta vivo; un secondo Ctrl-C non lo abbatte', { skip: SALTA }, async () => {
  const { host, cartella, fuori } = await avviaHost(`trap 'echo preso >> "${'$'}PWD/presi.txt"' INT; sleep 64 & wait; sleep 64 & wait; sleep 64 & wait`, ['gestore']);
  try {
    await pausa(300);
    process.kill(-host.pid, 'SIGINT');
    await pausa(500);
    process.kill(-host.pid, 'SIGINT');
    await pausa(500);
    assert.equal(host.exitCode, null, `l'host doveva restare vivo: ${fuori()}`);
    assert.equal((fuori().match(/SIGINT gestito/gu) ?? []).length, 2);
  } finally {
    try { process.kill(-host.pid, 'SIGKILL'); } catch { /* già uscito */ }
    togli('sleep 64');
    rimuoviCartellaDiProva(cartella);
  }
});

/* ─── cb8dee280 (SIGKILL ai gruppi dopo la grazia per SIGTERM e SIGHUP), aggiunto al punto B ─── */

test('REV-AND-04 [CURATO 15/10, era rossa] — un host SENZA un suo gestore di SIGTERM (Android lo manda col `destroy` al solo processo): il comando che ignora SIGTERM sopravvive, perché l\'host si rimanda il segnale e muore PRIMA che scatti il SIGKILL dei 2 s', { skip: SALTA }, async () => {
  const { host, cartella } = await avviaHost(`trap '' TERM; sleep 65 & wait`);
  try {
    await pausa(400);
    assert.ok(viviCon('sleep 65').length > 0, 'premessa: il comando è partito');
    process.kill(host.pid, 'SIGTERM'); // al solo processo, come `Process.destroy()`
    await pausa(3_000);
    assert.notEqual(host.exitCode === null && host.signalCode === null, true, 'premessa: l\'host è uscito');
    assert.deepEqual(viviCon('sleep 65'), [], 'il comando che ignora SIGTERM è ancora vivo, orfano: il SIGKILL dopo la grazia non è mai partito');
  } finally {
    try { process.kill(-host.pid, 'SIGKILL'); } catch { /* già uscito */ }
    togli('sleep 65');
    rimuoviCartellaDiProva(cartella);
  }
});

test('REV-AND-05 [REGGE] — AL CONTRARIO: un host CON il suo gestore di SIGTERM che non esce: dopo 2 s il comando che ignora SIGTERM è ucciso (la strada di AND-09)', { skip: SALTA }, async () => {
  const { host, cartella } = await avviaHost(`trap '' TERM; sleep 66 & wait`, ['gestore-term']);
  try {
    await pausa(400);
    process.kill(host.pid, 'SIGTERM');
    await pausa(800);
    assert.ok(viviCon('sleep 66').length > 0, 'nella grazia è ancora vivo');
    await pausa(2_000);
    assert.deepEqual(viviCon('sleep 66'), []);
    assert.equal(host.exitCode, null, 'l\'host è rimasto vivo');
  } finally {
    try { process.kill(-host.pid, 'SIGKILL'); } catch { /* già uscito */ }
    togli('sleep 66');
    rimuoviCartellaDiProva(cartella);
  }
});

test('REV-AND-06 [CURATO 15/10, era S5] — un host che riceve SIGTERM, NON esce e lancia un comando NUOVO nella grazia: il SIGKILL dei 2 s colpisce anche il comando nato DOPO il segnale', { skip: typeof kernel.creaPuliziaDeiGruppi !== 'function' && 'la base non ha la pulizia dei gruppi' }, () => {
  const proc = new EventEmitter(); proc.pid = 500; proc.colpi = []; proc.kill = (pid, s) => proc.colpi.push([pid, s]); proc.exit = () => {};
  proc.on('SIGTERM', () => {}); // l'host gestisce il segnale e resta vivo
  const timer = [];
  const pulizia = kernel.creaPuliziaDeiGruppi({ proc, piattaforma: 'linux', impostaTimer: (f, ms) => { timer.push([f, ms]); return { unref() {} }; } });
  pulizia.registra(Object.assign(new EventEmitter(), { pid: 71 })); // vivo al SIGTERM
  proc.emit('SIGTERM');
  pulizia.registra(Object.assign(new EventEmitter(), { pid: 72 })); // nato dopo, nella grazia
  assert.equal(timer.length, 1, 'premessa: il SIGKILL è programmato');
  timer[0][0]();
  const uccisi = proc.colpi.filter(([, s]) => s === 'SIGKILL').map(([pid]) => pid);
  assert.deepEqual(uccisi, [-71], `il SIGKILL dovrebbe colpire solo i gruppi vivi al segnale: colpiti ${JSON.stringify(uccisi)}`);
});

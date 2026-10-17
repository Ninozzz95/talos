/*
 * SECONDA PASSATA (bugfixer, 15/10/2026 sera) sulle cure di `408d43eea` e `6b402260e`: gruppi ricordati finché vivi, e l'host senza
 * gestore che aspetta la grazia. «[REGGE]» = attaccato, ha retto. «[ROSSO]» = difetto mostrato. «[MISURA]» = un comportamento da
 * giudicare, misurato. Le prove a processi veri girano su Linux (WSL, PATH pulito).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { creaPuliziaDeiGruppi } from '../src/kernel/talosHarness.mjs';

const HOST = fileURLToPath(new URL('./fixtures/host-revisione-gruppi.mjs', import.meta.url));
const SALTA = process.platform === 'win32' && 'gruppi di processi POSIX: su Windows c\'è taskkill /T';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const viviCon = (marca) => spawnSync('pgrep', ['-f', `^${marca}`], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
const togli = (marca) => spawnSync('pkill', ['-KILL', '-f', marca]);

/* Un sistema finto: chi esiste come processo e chi come gruppo. `kill(x, 0)` lancia ESRCH se x non c'è (come il sistema vero). */
function sistemaFinto() {
  const processi = new Set(); const gruppi = new Set(); const colpi = [];
  const proc = new EventEmitter();
  proc.pid = 500;
  proc.exit = () => {};
  proc.kill = (bersaglio, segnale) => {
    const esiste = bersaglio < 0 ? gruppi.has(-bersaglio) : processi.has(bersaglio) || bersaglio === 500;
    if (!esiste) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
    if (segnale !== 0) colpi.push([bersaglio, segnale]);
  };
  return { proc, processi, gruppi, colpi };
}

test('SP-AND-01 [ROSSO, S5] — il numero di un gruppo ricordato, svuotato e poi RIUSATO da un altro capo di gruppo, riceve il colpo: la sonda `kill(-pgid, 0)` dice «vivo» anche per il gruppo di un altro', () => {
  const s = sistemaFinto();
  s.proc.on('SIGTERM', () => {}); // l'host gestisce: la pulizia inoltra il segnale e basta
  const pulizia = creaPuliziaDeiGruppi({ proc: s.proc, piattaforma: 'linux', impostaTimer: () => ({ unref() {} }) });
  /* il nostro comando: shell 81, capo del gruppo 81; lascia un `cmd &` (82) nel gruppo ed esce */
  const shell = Object.assign(new EventEmitter(), { pid: 81 });
  s.processi.add(81); s.processi.add(82); s.gruppi.add(81);
  pulizia.registra(shell);
  s.processi.delete(81); shell.emit('exit', 0);
  /* più tardi esce anche il `cmd &`: il gruppo 81 si svuota (nessuna sonda in mezzo: nessun comando nuovo, nessun segnale) */
  s.processi.delete(82); s.gruppi.delete(81);
  /* il numero 81 rinasce: un processo di qualcun altro, capo di un gruppo suo (setsid: un demone, un ssh-agent, un servizio) */
  s.processi.add(81); s.gruppi.add(81);
  s.proc.emit('SIGTERM');
  assert.deepEqual(s.colpi.filter(([b]) => b === -81), [], `colpito il gruppo 81 di un altro: ${JSON.stringify(s.colpi)}`);
});

test('SP-AND-01b [REGGE] — AL CONTRARIO: il nostro gruppo col solo `cmd &` dentro (la shell è uscita) riceve il segnale, e uno svuotato prima della sonda si dimentica', () => {
  const s = sistemaFinto();
  s.proc.on('SIGTERM', () => {});
  const pulizia = creaPuliziaDeiGruppi({ proc: s.proc, piattaforma: 'linux', impostaTimer: () => ({ unref() {} }) });
  const a = Object.assign(new EventEmitter(), { pid: 91 }); const b = Object.assign(new EventEmitter(), { pid: 93 });
  s.processi.add(91); s.processi.add(92); s.gruppi.add(91); s.processi.add(93); s.gruppi.add(93);
  pulizia.registra(a); pulizia.registra(b);
  s.processi.delete(91); a.emit('exit', 0); // resta 92 nel gruppo 91
  s.processi.delete(93); s.gruppi.delete(93); b.emit('exit', 0); // 93 vuoto
  s.proc.emit('SIGTERM');
  assert.deepEqual(s.colpi, [[-91, 'SIGTERM']]);
  assert.deepEqual(pulizia.vivi(), [91]);
});

test('SP-AND-02 [MISURA] — costo dello sfoltimento: 5.000 gruppi ricordati, una sonda per ognuno a ogni comando nuovo', () => {
  const s = sistemaFinto();
  const pulizia = creaPuliziaDeiGruppi({ proc: s.proc, piattaforma: 'linux' });
  for (let i = 0; i < 5_000; i += 1) { s.gruppi.add(10_000 + i); pulizia.registra(Object.assign(new EventEmitter(), { pid: 10_000 + i })); }
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 20; i += 1) { s.gruppi.add(20_000 + i); pulizia.registra(Object.assign(new EventEmitter(), { pid: 20_000 + i })); }
  const msPerComando = Number(process.hrtime.bigint() - t0) / 1e6 / 20;
  console.log(`[SP-AND-02] ${msPerComando.toFixed(3)} ms per comando nuovo con 5.000 gruppi ricordati (sistema finto: misura il ciclo, non la chiamata di sistema)`);
  assert.ok(msPerComando < 50, `${msPerComando} ms`);
});

async function avviaHost(comando, extra = []) {
  const cartella = mkdtempSync(join(tmpdir(), 'seconda-gruppi-'));
  const host = spawn(process.execPath, [HOST, cartella, comando, ...extra], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let fuori = '';
  host.stdout.on('data', (d) => { fuori += d; });
  host.stderr.on('data', (d) => { fuori += d; });
  const t0 = Date.now();
  while (!/GRUPPO \d+/u.test(fuori) && Date.now() - t0 < 10_000) await pausa(50);
  assert.match(fuori, /GRUPPO \d+/u, `il comando non è partito: ${fuori}`);
  return { host, cartella };
}

for (const [nome, secondo] of [['un secondo SIGTERM', 'SIGTERM'], ['un SIGINT', 'SIGINT']]) {
  test(`SP-AND-03 [ROSSO, S5] — host senza gestore che aspetta la grazia dopo un SIGTERM: arriva ${nome} a 0,5 s — l'host muore subito (i gestori sono tolti) e il comando che ignora SIGTERM resta?`, { skip: SALTA }, async () => {
    const { host, cartella } = await avviaHost(`trap '' TERM; sleep 68 & wait`);
    try {
      await pausa(400);
      process.kill(host.pid, 'SIGTERM');
      await pausa(500);
      const vivoNellaGrazia = host.exitCode === null && host.signalCode === null;
      process.kill(host.pid, secondo);
      await pausa(3_000);
      const resta = viviCon('sleep 68').length > 0;
      console.log(`[SP-AND-03 ${secondo}] host vivo nella grazia: ${vivoNellaGrazia}; host finito con ${host.signalCode ?? host.exitCode}; comando rimasto dopo 3,5 s: ${resta}`);
      assert.equal(vivoNellaGrazia, true, 'premessa: l\'host aspettava la grazia');
      assert.equal(resta, false, `${nome} durante la grazia: il comando che ignora SIGTERM è rimasto orfano`);
    } finally {
      try { process.kill(-host.pid, 'SIGKILL'); } catch { /* già uscito */ }
      togli('sleep 68');
      rimuoviCartellaDiProva(cartella);
    }
  });
}

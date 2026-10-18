import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { creaCampionatoreRisorse } from '../src/risorse-processi.mjs';
import { etichettaSandbox } from '../src/kernel/etichetta-sandbox.mjs';
import { eseguiComandoSandboxato, opzioniGruppoDelComando, uccidiAlberoDelProcesso } from '../src/kernel/talosHarness.mjs';

/*
 * ⛔ Lane mobile, 15/10/2026 (via del desktop dato lo stesso giorno): r4 dentro l'app Android, scheda «Processi». Misurato sul Pad
 *   (OnePlus Pad, Android 16, Node 24.18 dell'app, `process.platform === 'android'`), sessione LOCALE, `sleep 150; echo finito`:
 *   1. lo Stop risponde 200 «stopped» ma il comando va avanti: la shell prende il SIGTERM e lo onora solo quando esce il figlio
 *      (uscita 143 dopo 150,2 s). Sonda diretta: SIGTERM alla sola shell ⇒ 30.049 ms e 143; al GRUPPO (`detached` + `kill(-pid)`)
 *      ⇒ 1.009 ms e nessun `sleep` orfano. Fuori da Windows `uccidiAlberoDelProcesso` faceva solo `kill('SIGTERM')` sulla shell
 *      (e `q0-timeout-e-taglio-shell` saltava la prova fuori da Windows per questo);
 *   2. `GET …/processes/resources` ⇒ `metodo: null`: il campionatore conosce `win32` e `linux`, non `android` (/proc c'è);
 *   3. l'esito diceva `[sandbox: none (cmd.exe nativo: …)]` su un telefono.
 */

test('AND-01 — su Android CPU e memoria si leggono da /proc come su Linux (`metodo: proc`)', async () => {
  const stat = (pid, ppid, tick, inizio, rss) => `${pid} (sh) S ${ppid} 0 0 0 -1 0 0 0 0 0 ${tick} 0 0 0 20 0 1 0 ${inizio} 0 ${rss} 0`;
  const proc = { 10: stat(10, 1, 5, 100, 100), 11: stat(11, 10, 7, 110, 400) };
  const c = creaCampionatoreRisorse({ piattaforma: 'android', core: 1, readdirSync: () => Object.keys(proc), readFileSync: (f) => proc[f.split('/')[2]] });
  assert.equal(c.metodo, 'proc');
  const { metodo, perPid } = await c.misura({ pid: [10] });
  assert.equal(metodo, 'proc');
  assert.deepEqual(perPid.get(10), { cpuPercento: null, memoriaByte: 500 * 4096, processi: 2 });
  c.chiudi();
  // dove non si sa misurare resta onesto: niente metodo, niente numeri
  assert.equal(creaCampionatoreRisorse({ piattaforma: 'aix' }).metodo, null);
});

test('AND-02 — l\'etichetta della sandbox dice la shell vera: cmd.exe solo su Windows, sh di Android sul telefono', () => {
  assert.match(etichettaSandbox('none', null, 'win32'), /^none \(native cmd\.exe: same user and same privileges as the process, no isolation\)$/u);
  assert.equal(etichettaSandbox('none', null, 'android'), 'none (Android sh: run directly on the device, same user and same privileges as the app, no isolation)');
  assert.equal(etichettaSandbox('none', null, 'linux'), 'none (system sh: same user and same privileges as the process, no isolation)');
  assert.doesNotMatch(etichettaSandbox('none', null, 'darwin'), /cmd\.exe/u);
  // i lettori si fermano alla quadra: dentro non ce n'è mai una
  for (const p of ['win32', 'android', 'linux', 'darwin']) assert.doesNotMatch(etichettaSandbox('none', null, p), /\]/u);
  // gli altri valori non cambiano
  assert.equal(etichettaSandbox('adb-shell-on-device', null, 'android'), 'adb-shell-on-device (shell on the connected device, outside this machine)');
});

test('AND-03 — fuori da Windows lo Stop colpisce il GRUPPO del comando, poi lo uccide dopo la grazia; senza gruppo, la shell', () => {
  const colpi = [];
  const timer = [];
  const figlio = { pid: 4321, exitCode: null, signalCode: null, kill: (s) => colpi.push(['shell', s]) };
  const killFn = (pid, segnale) => { colpi.push([pid, segnale]); };
  assert.equal(uccidiAlberoDelProcesso(figlio, { piattaforma: 'android', killFn, impostaTimer: (f, ms) => { timer.push([f, ms]); return { unref() {} }; } }), true);
  assert.deepEqual(colpi, [[-4321, 'SIGTERM']]);
  assert.equal(timer[0][1], 2_000);
  timer[0][0]();
  assert.deepEqual(colpi, [[-4321, 'SIGTERM'], [-4321, 'SIGKILL']]);
  // un processo che non guida un gruppo (lanciato senza `detached`): ESRCH ⇒ si ripiega sulla shell, come prima
  const colpi2 = [];
  const esrch = () => { const e = new Error('kill ESRCH'); e.code = 'ESRCH'; throw e; };
  uccidiAlberoDelProcesso({ pid: 99, exitCode: null, signalCode: null, kill: (s) => colpi2.push(s) }, { piattaforma: 'linux', killFn: esrch, impostaTimer: () => ({ unref() {} }) });
  assert.deepEqual(colpi2, ['SIGTERM']);
  // un figlio già uscito non si tocca (PID riusato, F-007)
  const colpi3 = [];
  assert.equal(uccidiAlberoDelProcesso({ pid: 7, exitCode: 0, signalCode: null, kill: () => colpi3.push('x') }, { piattaforma: 'android', killFn: () => colpi3.push('g') }), false);
  assert.deepEqual(colpi3, []);
});

test('AND-04 — i comandi fuori da Windows partono in un gruppo loro (`detached`), su Windows no (lì c\'è taskkill /T)', () => {
  assert.deepEqual(opzioniGruppoDelComando('android'), { detached: true });
  assert.deepEqual(opzioniGruppoDelComando('linux'), { detached: true });
  assert.deepEqual(opzioniGruppoDelComando('win32'), {});
});

test('AND-05 (processi veri, fuori da Windows) — lo Stop ferma `sleep` subito: 130, e nessun orfano', { skip: process.platform === 'win32' && 'il gruppo di processi è POSIX: su Windows c\'è taskkill /T (q0)' }, async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'and-05-'));
  try {
    const stop = new AbortController();
    const t0 = Date.now();
    setTimeout(() => stop.abort(), 500);
    const esito = await eseguiComandoSandboxato('sleep 30; echo finito', cartella, { segnaleStop: stop.signal, timeoutMs: 60_000 });
    const durata = Date.now() - t0;
    assert.equal(esito.codice, 130);
    assert.ok(durata < 5_000, `fermato in ${durata} ms`);
    assert.doesNotMatch(esito.testo, /finito/u);
  } finally {
    rimuoviCartellaDiProva(cartella); // BC09: la rimozione delle prove passa dall'aiutante
  }
});

test('AND-06 — i core per normalizzare la CPU: su Android `os.cpus()` è vuoto (misurato: 0 sul Pad, 8 core veri) e si usa `availableParallelism`', async () => {
  const { coreDellaMacchina } = await import('../src/risorse-processi.mjs');
  assert.equal(coreDellaMacchina({ cpusFn: () => [], parallelismoFn: () => 8 }), 8);
  assert.equal(coreDellaMacchina({ cpusFn: () => [{}, {}, {}, {}], parallelismoFn: () => 8 }), 4);
  assert.equal(coreDellaMacchina({ cpusFn: () => [], parallelismoFn: null }), 1);
  assert.equal(coreDellaMacchina({ cpusFn: () => { throw new Error('x'); }, parallelismoFn: () => 0 }), 1);
});

/*
 * Revisione del desktop, 15/10/2026: col gruppo suo il comando non riceve più il Ctrl-C del terminale dell'host. Misurato su Linux
 *   (WSL): host in un gruppo, SIGINT al gruppo ⇒ prima della patch `sleep 77` morto, con la patch vivo e orfano. Cura come Hermes
 *   (pulizia all'uscita) e Codex (SIGKILL al gruppo su Ctrl-C): `creaPuliziaDeiGruppi`.
 */
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { creaPuliziaDeiGruppi } from '../src/kernel/talosHarness.mjs';

/* Un host finto: `kill(pid, 0)` è la sonda di vita — risponde solo per i gruppi in `p.gruppi` (ESRCH per gli altri), e non si conta fra
   i colpi; un colpo con un segnale vero si registra. */
function processoFinto(gruppi = []) {
  const p = new EventEmitter();
  p.pid = 500;
  p.colpi = [];
  p.uscito = null;
  p.gruppi = new Set(gruppi);
  p.kill = (pid, s) => {
    if (s === 0) { if (!p.gruppi.has(-pid)) { const e = new Error('kill ESRCH'); e.code = 'ESRCH'; throw e; } return; }
    p.colpi.push([pid, s]);
  };
  p.exit = (c) => { p.uscito = c; };
  return p;
}
const timerFinti = () => { const t = []; t.imposta = (f, ms) => { t.push([f, ms]); return { unref() {} }; }; return t; };
const figlio = (pid) => Object.assign(new EventEmitter(), { pid });

test('AND-07 — i gruppi vivi ricevono il segnale dell\'host e un SIGKILL all\'uscita; un gruppo resta ricordato finché ha qualcuno dentro (REV-AND-02); su Windows niente', () => {
  // SIGINT, nessun altro gestore: i gruppi ricevono SIGINT e il segnale torna SUBITO all'host (niente attesa per SIGINT)
  const proc = processoFinto([11, 22]);
  const t1 = timerFinti();
  const pulizia = creaPuliziaDeiGruppi({ proc, piattaforma: 'linux', impostaTimer: t1.imposta });
  pulizia.registra(figlio(11));
  pulizia.registra(figlio(22));
  proc.gruppi.delete(22); // il gruppo 22 si è svuotato: si dimentica prima di colpire
  proc.emit('SIGINT');
  assert.deepEqual(proc.colpi, [[-11, 'SIGINT'], [500, 'SIGINT']]);
  assert.deepEqual(pulizia.vivi(), [11]);
  assert.equal(t1.length, 0);
  assert.equal(proc.listenerCount('SIGINT'), 0);
  proc.emit('exit', 130);
  assert.deepEqual(proc.colpi.at(-1), [-11, 'SIGKILL']);

  // REV-AND-02: la shell è uscita ma nel gruppo c'è ancora un `cmd &` ⇒ il gruppo resta ricordato e riceve il segnale
  const proc6 = processoFinto([77]);
  proc6.on('SIGTERM', () => {});
  const p6 = creaPuliziaDeiGruppi({ proc: proc6, piattaforma: 'linux', impostaTimer: timerFinti().imposta });
  const shell = figlio(77);
  p6.registra(shell);
  shell.emit('exit', 0);
  proc6.emit('SIGTERM');
  assert.deepEqual(proc6.colpi, [[-77, 'SIGTERM']]);

  // l'host ha il suo gestore di SIGTERM: i gruppi ricevono il segnale, poi SIGKILL dopo 2 s, e il segnale NON torna all'host
  const proc2 = processoFinto([33, 34]);
  proc2.on('SIGTERM', () => {});
  const t2 = timerFinti();
  const p2 = creaPuliziaDeiGruppi({ proc: proc2, piattaforma: 'android', impostaTimer: t2.imposta });
  p2.registra(figlio(33));
  proc2.emit('SIGTERM');
  assert.deepEqual(proc2.colpi, [[-33, 'SIGTERM']]);
  assert.equal(t2.length, 1);
  assert.equal(t2[0][1], 2_000);
  p2.registra(figlio(34)); // nato DOPO il segnale (l'host non è uscito): il SIGKILL della grazia non è per lui
  t2[0][0]();
  assert.deepEqual(proc2.colpi, [[-33, 'SIGTERM'], [-33, 'SIGKILL']]);

  // un gruppo che si svuota durante la grazia non riceve il SIGKILL (il suo numero è libero)
  const proc5 = processoFinto([66]);
  proc5.on('SIGHUP', () => {});
  const t5 = timerFinti();
  const p5 = creaPuliziaDeiGruppi({ proc: proc5, piattaforma: 'linux', impostaTimer: t5.imposta });
  p5.registra(figlio(66));
  proc5.emit('SIGHUP');
  proc5.gruppi.delete(66);
  t5[0][0]();
  assert.deepEqual(proc5.colpi, [[-66, 'SIGHUP']], 'il numero di un gruppo svuotato non si colpisce');

  // SIGINT con un gestore dell'host: solo il segnale, nessun SIGKILL (in una CLI può voler dire «annulla il giro»)
  const proc4 = processoFinto([55]);
  proc4.on('SIGINT', () => {});
  const t4 = timerFinti();
  const p4 = creaPuliziaDeiGruppi({ proc: proc4, piattaforma: 'linux', impostaTimer: t4.imposta });
  p4.registra(figlio(55));
  proc4.emit('SIGINT');
  assert.deepEqual(proc4.colpi, [[-55, 'SIGINT']]);
  assert.equal(t4.length, 0);

  // su Windows non si registra niente e non si installa nessun gestore
  const proc3 = processoFinto([44]);
  const p3 = creaPuliziaDeiGruppi({ proc: proc3, piattaforma: 'win32' });
  p3.registra(figlio(44));
  assert.deepEqual(p3.vivi(), []);
  assert.equal(proc3.listenerCount('SIGINT'), 0);
  assert.equal(proc3.listenerCount('exit'), 0);
});

test('AND-07b — owner 15/10 sera (REV-AND-04): senza altri gestori, a SIGTERM l\'host aspetta la grazia SOLO se un gruppo è vivo, poi SIGKILL ai gruppi e il segnale a sé; senza gruppi vivi esce subito', () => {
  const proc = processoFinto([88]);
  const t = timerFinti();
  const p = creaPuliziaDeiGruppi({ proc, piattaforma: 'linux', impostaTimer: t.imposta });
  p.registra(figlio(88));
  proc.emit('SIGTERM');
  assert.deepEqual(proc.colpi, [[-88, 'SIGTERM']], 'il segnale a sé NON parte subito: c\'è un gruppo da fermare');
  assert.equal(t.length, 1);
  assert.equal(t[0][1], 2_000);
  t[0][0]();
  assert.deepEqual(proc.colpi, [[-88, 'SIGTERM'], [-88, 'SIGKILL'], [500, 'SIGTERM']]);

  // AL CONTRARIO: nessun gruppo vivo ⇒ il segnale torna subito, nessuna attesa
  const vuoto = processoFinto([]);
  const tv = timerFinti();
  const pv = creaPuliziaDeiGruppi({ proc: vuoto, piattaforma: 'linux', impostaTimer: tv.imposta });
  pv.registra(figlio(99)); // il suo gruppo si è già svuotato
  vuoto.emit('SIGTERM');
  assert.deepEqual(vuoto.colpi, [[500, 'SIGTERM']]);
  assert.equal(tv.length, 0);
});

const HOST = fileURLToPath(new URL('./fixtures/host-con-comando.mjs', import.meta.url));
const gruppoVivo = (pid) => { try { process.kill(-pid, 0); return true; } catch { return false; } };
async function avviaHost(argomenti) {
  const cartella = mkdtempSync(join(tmpdir(), 'and-08-'));
  const host = spawn(process.execPath, [HOST, cartella, ...argomenti], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let fuori = '';
  host.stdout.on('data', (d) => { fuori += d; });
  host.stderr.on('data', (d) => { fuori += d; });
  const t0 = Date.now();
  while (!/GRUPPO (\d+)/u.test(fuori) && Date.now() - t0 < 10_000) await new Promise((r) => setTimeout(r, 50));
  const gruppo = Number(/GRUPPO (\d+)/u.exec(fuori)?.[1]);
  assert.ok(gruppo > 0, `il comando non è partito: ${fuori}`);
  return { host, gruppo, cartella, fuori: () => fuori };
}

test('AND-08 (processi veri, fuori da Windows) — Ctrl-C al gruppo dell\'host ferma anche il comando, sia che l\'host esca sia che gestisca il segnale', { skip: process.platform === 'win32' && 'il gruppo di processi è POSIX' }, async () => {
  // 1. host senza gestore: esce per SIGINT, e il comando con lui
  const uno = await avviaHost([]);
  try {
    const uscita = new Promise((r) => uno.host.once('exit', (codice, segnale) => r({ codice, segnale })));
    process.kill(-uno.host.pid, 'SIGINT');
    // un host che non esce più (il segnale assorbito dalla pulizia) è il difetto: si aspetta 5 s, non per sempre
    const esito = await Promise.race([uscita, new Promise((r) => setTimeout(() => r('ancora vivo dopo 5 s'), 5_000))]);
    assert.deepEqual(esito, { codice: null, segnale: 'SIGINT' });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(gruppoVivo(uno.gruppo), false, `comando orfano nel gruppo ${uno.gruppo}`);
  } finally {
    for (const pid of [uno.host.pid, uno.gruppo]) { try { process.kill(-pid, 'SIGKILL'); } catch { /* già uscito */ } }
    rimuoviCartellaDiProva(uno.cartella);
  }
  // 2. host con un suo gestore che non esce: il comando riceve SIGINT lo stesso, l'host resta vivo
  const due = await avviaHost(['gestore']);
  try {
    process.kill(-due.host.pid, 'SIGINT');
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(due.host.exitCode, null, 'l\'host doveva restare vivo');
    assert.match(due.fuori(), /SIGINT gestito/u);
    assert.equal(gruppoVivo(due.gruppo), false, `comando vivo nel gruppo ${due.gruppo}`);
  } finally {
    for (const pid of [due.host.pid, due.gruppo]) { try { process.kill(-pid, 'SIGKILL'); } catch { /* già uscito */ } }
    rimuoviCartellaDiProva(due.cartella);
  }
});

test('AND-09 (processi veri, fuori da Windows) — come l app Android: l host gestisce SIGTERM, il comando lo ignora ⇒ SIGKILL al gruppo dopo la grazia, prima dei 3 s dopo cui l app uccide l host', { skip: process.platform === 'win32' && 'il gruppo di processi è POSIX' }, async () => {
  const tre = await avviaHost(['gestore-term']);
  try {
    await new Promise((r) => setTimeout(r, 300)); // il `trap` deve essere già in piedi
    process.kill(tre.host.pid, 'SIGTERM'); // l app colpisce il solo processo del server
    await new Promise((r) => setTimeout(r, 800));
    assert.match(tre.fuori(), /SIGTERM gestito/u);
    assert.equal(gruppoVivo(tre.gruppo), true, 'a 0,8 s il comando che ignora SIGTERM è ancora vivo: la prova misura la grazia, non un caso');
    await new Promise((r) => setTimeout(r, 2_000));
    assert.equal(gruppoVivo(tre.gruppo), false, `comando ancora vivo nel gruppo ${tre.gruppo} dopo 2,8 s`);
  } finally {
    for (const pid of [tre.host.pid, tre.gruppo]) { try { process.kill(-pid, 'SIGKILL'); } catch { /* già uscito */ } }
    rimuoviCartellaDiProva(tre.cartella);
  }
});

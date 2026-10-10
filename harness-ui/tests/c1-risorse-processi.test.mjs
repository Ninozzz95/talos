import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { tabellaDaRighe, sommaAlbero, sommaPerMarcatore, creaCampionatoreRisorse, COPIONE_WSL } from '../src/risorse-processi.mjs';

/*
 * C1 (owner 10/10/2026, «CPU e memoria per processo, misurate da noi, solo a scheda aperta», poi «Anche WSL, adesso») —
 *   `src/risorse-processi.mjs`.
 */

test('C1-RIS-01 — the tree of a shell: its descendants summed; a «child» born before its parent is a reused PID and is left out', () => {
  const t = tabellaDaRighe([
    [100, 1, 10_000, 5_000_000, 1_000], // la shell
    [101, 100, 20_000, 20_000_000, 1_010], // il comando vero (nipote della shell nel caso reale)
    [102, 101, 30_000, 1_000_000, 1_020],
    [103, 100, 99_999, 99_999_999, 500], // nato PRIMA della shell: PID riusato, non è suo
    [200, 1, 1, 1, 1_000], // un altro albero
    ['rotta'], [0, 0, 0, 0, 0],
  ]);
  assert.deepEqual(sommaAlbero(t, 100), { processi: 3, memoria: 60_000, cpu100ns: 26_000_000 });
  assert.equal(sommaAlbero(t, 999), null, 'a root that is gone: null, never zeros');
});

test('C1-RIS-02 — CPU is the difference between two samples, over the elapsed time and the cores; the first sample has none', async () => {
  let tick = 0;
  const statDi = (pid, ppid, t, inizio) => `${pid} (sh (x)) S ${ppid} 0 0 0 -1 0 0 0 0 0 ${t} 0 0 0 20 0 1 0 ${inizio} 0 256 0`;
  const proc = () => ({ 10: statDi(10, 1, tick, 100), 11: statDi(11, 10, tick * 3, 110) });
  let istante = 1_000;
  const c = creaCampionatoreRisorse({ piattaforma: 'linux', core: 4, ora: () => istante,
    readdirSync: () => Object.keys(proc()), readFileSync: (f) => proc()[f.split('/')[2]] });
  const prima = await c.misura({ pid: [10] });
  assert.equal(c.metodo, 'proc');
  assert.equal(prima.perPid.get(10).cpuPercento, null, 'first sample: no CPU yet');
  assert.equal(prima.perPid.get(10).processi, 2);
  assert.equal(prima.perPid.get(10).memoriaByte, 2 * 256 * 4096);
  // un secondo dopo l'albero ha usato 200 tick = 2 s di CPU su 4 core ⇒ 50 %
  tick = 50; istante = 2_000;
  const dopo = await c.misura({ pid: [10] });
  assert.equal(dopo.perPid.get(10).cpuPercento, 50);
  // al contrario: un PID che non c'è torna null, e una piattaforma senza misura risponde senza numeri
  assert.equal((await c.misura({ pid: [10, 77] })).perPid.get(77), null);
  const altrove = creaCampionatoreRisorse({ piattaforma: 'darwin' });
  assert.equal(altrove.metodo, null);
  assert.equal((await altrove.misura({ pid: [10] })).perPid.get(10), null);
});

test('C1-RIS-08 — two windows on two sessions alternate their requests: both keep their CPU base; an unasked base is forgotten after a while', async () => {
  // review Y3 (10/10): the sampler is ONE per server; pruning «what this request did not ask» wiped the other window's base
  let tick = 0;
  const statDi = (pid, t) => `${pid} (node) S 1 0 0 0 -1 0 0 0 0 0 ${t} 0 0 0 20 0 1 0 100 0 256 0`;
  const proc = () => ({ 10: statDi(10, tick), 20: statDi(20, tick) });
  let istante = 1_000;
  const c = creaCampionatoreRisorse({ piattaforma: 'linux', core: 1, ora: () => istante, dimenticaDopoMs: 30_000,
    readdirSync: () => Object.keys(proc()), readFileSync: (f) => proc()[f.split('/')[2]] });
  await c.misura({ pid: [10] }); // window A
  istante = 1_500; await c.misura({ pid: [20] }); // window B
  tick = 100; istante = 6_000;
  assert.equal((await c.misura({ pid: [10] })).perPid.get(10).cpuPercento, 20, 'A still has its base (1 s of CPU in 5 s)');
  istante = 6_500;
  assert.equal((await c.misura({ pid: [20] })).perPid.get(20).cpuPercento, 20, 'and so does B');
  // ⛔ the other way round: a base nobody asks for in 30 s is forgotten, so the next sample starts over
  tick = 200; istante = 40_000;
  await c.misura({ pid: [10] });
  istante = 41_000;
  assert.equal((await c.misura({ pid: [20] })).perPid.get(20).cpuPercento, null, 'B was not asked for 34 s: no stale base');
});

test('C1-RIS-03 — a broken read answers without numbers, it never invents them', async () => {
  const c = creaCampionatoreRisorse({ piattaforma: 'linux', readdirSync: () => { throw new Error('no /proc'); } });
  assert.equal((await c.misura({ pid: [10] })).perPid.get(10), null);
});

/* Un lettore finto: a ogni riga sull'ingresso risponde con `righe()` e FINE, come il copione vero. */
function lettoreFinto(righe, chiamate) {
  return (programma, argomenti) => {
    chiamate.push([programma, ...argomenti]);
    const figlio = new EventEmitter();
    figlio.stdin = new PassThrough(); figlio.stdout = new PassThrough(); figlio.stderr = new PassThrough();
    figlio.kill = () => { figlio.stdout.end(); };
    figlio.stdin.on('data', () => { figlio.stdout.write(`${[...righe(), 'FINE'].join('\n')}\n`); });
    return figlio;
  };
}

test('C1-RIS-05 — WSL: the processes carrying the marker are summed per command; one reader per distro; CPU from two samples', async () => {
  // campi di /proc/<pid>/stat dopo «) »: [11] utime, [12] stime, [21] rss in pagine
  const stat = (utime, rss) => `S 1 1 1 0 -1 0 0 0 0 0 ${utime} 0 0 0 20 0 1 0 100 0 ${rss} 0`;
  let utime = 0;
  const chiamate = [];
  let istante = 1_000;
  const c = creaCampionatoreRisorse({ piattaforma: 'win32', core: 2, ora: () => istante,
    spawnFn: lettoreFinto(() => [`ta1 ${stat(utime, 100)}`, `ta1 ${stat(utime, 50)}`, `tb2 ${stat(7, 10)}`, 'riga-rotta', `t;rm ${stat(1, 1)}`], chiamate) });
  const richiesta = { wsl: [{ distro: 'Ubuntu', marcatore: 'ta1' }, { distro: 'Ubuntu', marcatore: 'tzz' }] };
  const prima = await c.misura(richiesta);
  assert.deepEqual(prima.perMarcatore.get('Ubuntu:ta1'), { cpuPercento: null, memoriaByte: 150 * 4096, processi: 2 });
  assert.equal(prima.perMarcatore.get('Ubuntu:tzz'), null, 'a command whose processes are gone: null');
  assert.equal(prima.perMarcatore.has('Ubuntu:tb2'), false, 'only what was asked');
  // un secondo dopo: due processi a +50 tick ciascuno = 1 s di CPU su 2 core ⇒ 50 %
  utime = 50; istante = 2_000;
  assert.equal((await c.misura(richiesta)).perMarcatore.get('Ubuntu:ta1').cpuPercento, 50);
  assert.equal(chiamate.length, 1, 'the reader stays open between samples');
  assert.deepEqual(chiamate[0].slice(0, 7), ['wsl.exe', '-d', 'Ubuntu', '-u', 'root', '--exec', 'sh']);
  // al contrario: un nome di distro o un marcatore che non sono i nostri non arrivano mai alla riga di comando
  const prima2 = await c.misura({ wsl: [{ distro: 'Ubuntu; rm -rf /', marcatore: 'ta1' }, { distro: 'Ubuntu', marcatore: "x' ; y" }] });
  assert.equal(prima2.perMarcatore.size, 0);
  assert.equal(chiamate.length, 1);
  c.chiudi();
  assert.deepEqual([...sommaPerMarcatore([`ta1 ${stat(3, 2)}`]).values()], [{ processi: 1, memoria: 2 * 4096, cpu100ns: 3 * 100_000 }]);
  // un comando della persona può riscrivere la variabile: ciò che non ha la forma dei nostri marcatori non si somma
  assert.equal(sommaPerMarcatore([`t;rm ${stat(1, 1)}`, `${'x'.repeat(101)} ${stat(1, 1)}`]).size, 0);
});

test('C1-RIS-06 — a reader that never answers is switched off and the sample says «—»; the next one starts a new reader', async () => {
  const chiamate = [];
  const muto = (programma, argomenti) => {
    chiamate.push(programma);
    const figlio = new EventEmitter();
    figlio.stdin = new PassThrough(); figlio.stdout = new PassThrough(); figlio.stderr = new PassThrough();
    figlio.kill = () => { figlio.uccisa = true; };
    return figlio;
  };
  const c = creaCampionatoreRisorse({ piattaforma: 'win32', spawnFn: muto, attesaMassimaMs: 50 });
  assert.equal((await c.misura({ pid: [4242] })).perPid.get(4242), null);
  assert.equal((await c.misura({ pid: [4242] })).perPid.get(4242), null);
  assert.equal(chiamate.length, 2, 'a timed-out reader is replaced, not reused');
  c.chiudi();
});

test('C1-RIS-04 — Windows, for real: the persistent PowerShell measures a busy child; then it switches itself off', { skip: process.platform !== 'win32' }, async () => {
  const occupato = spawn(process.execPath, ['-e', 'const f=Date.now()+20000; let x=0; while(Date.now()<f){x++}'], { windowsHide: true });
  const c = creaCampionatoreRisorse({ spentoDopoMs: 60_000 });
  try {
    assert.equal(c.metodo, 'cim');
    const prima = await c.misura({ pid: [occupato.pid] });
    const m1 = prima.perPid.get(occupato.pid);
    assert.ok(m1, 'the child is found');
    assert.ok(m1.memoriaByte > 1_000_000, `a Node process uses more than 1 MB (${m1.memoriaByte})`);
    assert.equal(m1.cpuPercento, null);
    await new Promise((r) => setTimeout(r, 1_500));
    const dopo = await c.misura({ pid: [occupato.pid] });
    const m2 = dopo.perPid.get(occupato.pid);
    assert.ok(m2.cpuPercento > 0, `a busy loop uses CPU (${m2.cpuPercento} %)`);
  } finally {
    occupato.kill();
    c.chiudi();
  }
});

/* WSL vero solo se c'è una distro che risponde (la macchina dell'owner: Ubuntu). */
const distroVera = (() => {
  if (process.platform !== 'win32') return null;
  const r = spawnSync('wsl.exe', ['-d', 'Ubuntu', '--exec', 'true'], { windowsHide: true, timeout: 20_000 });
  return r.status === 0 ? 'Ubuntu' : null;
})();

test('C1-RIS-07 — WSL, for real: a marked busy command inside the distro is found and uses CPU; an unmarked one is not counted', { skip: distroVera ? false : 'no WSL distro', timeout: 60_000 }, async () => {
  const marcatore = `tprova${process.pid}`;
  const occupato = spawn('wsl.exe', ['-d', distroVera, '--exec', 'bash', '-lc', `export TALOS_CMD_ID='${marcatore}'\nsh -c 'end=$(($(date +%s)+15)); while [ $(date +%s) -lt $end ]; do :; done' & sleep 15`], { windowsHide: true });
  const c = creaCampionatoreRisorse({ spentoDopoMs: 60_000 });
  try {
    await new Promise((r) => setTimeout(r, 1_500));
    const richiesta = { wsl: [{ distro: distroVera, marcatore }] };
    const m1 = (await c.misura(richiesta)).perMarcatore.get(`${distroVera}:${marcatore}`);
    assert.ok(m1, 'the marked processes are found');
    assert.ok(m1.processi >= 2, `bash, sh and sleep carry the marker (${m1.processi})`);
    assert.ok(m1.memoriaByte > 100_000, `some resident memory (${m1.memoriaByte})`);
    await new Promise((r) => setTimeout(r, 1_500));
    const m2 = (await c.misura(richiesta)).perMarcatore.get(`${distroVera}:${marcatore}`);
    assert.ok(m2.cpuPercento > 0, `a busy loop uses CPU (${m2.cpuPercento} %)`);
    // al contrario: un marcatore che nessuno porta
    assert.equal((await c.misura({ wsl: [{ distro: distroVera, marcatore: 'tnessuno' }] })).perMarcatore.get(`${distroVera}:tnessuno`), null);
  } finally {
    occupato.kill();
    spawnSync('wsl.exe', ['-d', distroVera, '-u', 'root', '--exec', 'sh', '-c', `for d in /proc/[0-9]*; do grep -qaz '^TALOS_CMD_ID=${marcatore}$' "$d/environ" 2>/dev/null && kill "\${d#/proc/}"; done; true`], { windowsHide: true });
    c.chiudi();
  }
  assert.ok(COPIONE_WSL.includes('TALOS_CMD_ID='));
});

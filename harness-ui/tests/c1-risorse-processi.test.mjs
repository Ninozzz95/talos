import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { tabellaDaRighe, sommaAlbero, sommaPerMarcatore, creaCampionatoreRisorse, COPIONE_WSL } from '../src/risorse-processi.mjs';
import { percorsoWsl } from '../src/taskkill-di-sistema.mjs';

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
  // G-R5 (27/10/2026): wsl.exe by its full path under SystemRoot, never by name
  assert.deepEqual(chiamate[0].slice(0, 7), [percorsoWsl(), '-d', 'Ubuntu', '-u', 'root', '--exec', 'sh']);
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
  const occupato = spawn(process.execPath, ['-e', 'const f=Date.now()+60000; let x=0; while(Date.now()<f){x++}'], { windowsHide: true });
  // 11/10/2026, PR #58: on a loaded CI runner the cold start of PowerShell + CIM took more than the product's 8 s cap, the
  // first sample came back empty (the designed «—») and this test, which is about the real measure, turned red.
  const c = creaCampionatoreRisorse({ spentoDopoMs: 60_000, attesaMassimaMs: 45_000 });
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
  // 11/10/2026, PR #58: on a loaded CI runner the cold start of PowerShell + CIM took more than the product's 8 s cap, the
  // first sample came back empty (the designed «—») and this test, which is about the real measure, turned red.
  const c = creaCampionatoreRisorse({ spentoDopoMs: 60_000, attesaMassimaMs: 45_000 });
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

/*
 * ⭐ P-05 (pannello v2, owner 29/10/2026) — le PORTE IN ASCOLTO dell'albero di un comando. ⛔ Su questa macchina
 *   `-State Listen` ha mentito (78 socket in ascolto con State 0, misurato il 29/10): si prova sul dato vero, e al contrario.
 */
import { portePerPid, portePerPidDaProc, pidDellAlbero } from '../src/risorse-processi.mjs';

test('P05-01 — la riga PORTE del lettore di Windows: coppie [pid, porta], una coppia sola, righe rotte e porte fuori misura', () => {
  assert.deepEqual([...portePerPid('PORTE [[10,5173],[10,5174],[11,8080]]').get(10)], [5173, 5174]);
  assert.deepEqual([...portePerPid('PORTE [12,3000]').get(12)], [3000], 'ConvertTo-Json appiattisce una coppia sola');
  assert.equal(portePerPid('PORTE [[0,80],[5,0],[6,70000],["x",1]]').size, 0, 'pid e porte non validi si scartano');
  assert.equal(portePerPid('PORTE {rotta'), null, 'illeggibile = non misurato (null), mai «nessuna porta» inventato');
  assert.equal(portePerPid(undefined), null, 'senza riga PORTE (lettore vecchio) = non misurato');
  assert.equal(portePerPid('PORTE []').size, 0, 'misurato e vuoto: nessuna porta');
});

test('P05-02 — Linux: stato 0A di /proc/net/tcp{,6} e gli inode nei fd dei PID chiesti; una connessione aperta (01) non è un ascolto', () => {
  const tcp = '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n'
    + '   0: 0100007F:1435 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 111 1 0 100 0 0 10 0\n'
    + '   1: 0100007F:C350 0100007F:1435 01 00000000:00000000 00:00000000 00000000  1000        0 222 1 0 100 0 0 10 0\n';
  const tcp6 = '  sl  local_address remote_address st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n'
    + '   0: 00000000000000000000000000000000:1F90 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 333 1 0 100 0 0 10 0\n';
  const fd = { 10: ['3', '4'], 11: ['5'], 12: ['6'] };
  const link = { '/proc/10/fd/3': 'socket:[111]', '/proc/10/fd/4': 'pipe:[9]', '/proc/11/fd/5': 'socket:[222]', '/proc/12/fd/6': 'socket:[333]' };
  const fsFinto = {
    readFileSync: (p) => ({ '/proc/net/tcp': tcp, '/proc/net/tcp6': tcp6 }[p] ?? (() => { throw new Error('ENOENT'); })()),
    readdirSync: (p) => fd[/\/proc\/(\d+)\/fd/u.exec(p)?.[1]] ?? (() => { throw new Error('ENOENT'); })(),
    readlinkSync: (p) => link[p] ?? (() => { throw new Error('ENOENT'); })(),
  };
  const m = portePerPidDaProc(new Set([10, 11, 12, 99]), fsFinto);
  assert.deepEqual([...m.get(10)], [5173]);
  assert.equal(m.has(11), false, 'AL CONTRARIO: la connessione stabilita (01) del client non è una porta in ascolto');
  assert.deepEqual([...m.get(12)], [8080], 'anche IPv6');
});

test('P05-03 — l’albero: le porte dei discendenti salgono al comando che li ha lanciati', () => {
  const t = tabellaDaRighe([[100, 1, 1, 1, 1000], [101, 100, 1, 1, 1010], [200, 1, 1, 1, 1000]]);
  assert.deepEqual([...pidDellAlbero(t, 100)].sort(), [100, 101]);
  assert.equal(pidDellAlbero(t, 999), null);
});

test('P05-04 — sul dato VERO (Windows): un server in ascolto ha la sua porta; AL CONTRARIO un client connesso no, e un socket solo legato (Bound) nemmeno', { skip: process.platform === 'win32' ? false : 'solo Windows', timeout: 90_000 }, async () => {
  const server = spawn(process.execPath, ['-e', "const s=require('net').createServer(()=>{}).listen(0,'127.0.0.1',()=>{console.log(s.address().port)});setTimeout(()=>{},60000)"], { windowsHide: true });
  const porta = await new Promise((risolvi, rifiuta) => { server.stdout.once('data', (b) => risolvi(Number(String(b).trim()))); server.once('error', rifiuta); });
  const client = spawn(process.execPath, ['-e', `const c=require('net').connect(${porta},'127.0.0.1',()=>console.log(c.localPort));setTimeout(()=>{},60000)`], { windowsHide: true });
  const portaClient = await new Promise((risolvi) => client.stdout.once('data', (b) => risolvi(Number(String(b).trim()))));
  const c = creaCampionatoreRisorse({ spentoDopoMs: 60_000, attesaMassimaMs: 45_000 });
  try {
    const m = await c.misura({ pid: [server.pid, client.pid] });
    assert.ok(Array.isArray(m.perPid.get(server.pid)?.porte), 'le porte sono misurate (non null)');
    assert.ok(m.perPid.get(server.pid).porte.includes(porta), `il server ascolta su ${porta}: ${JSON.stringify(m.perPid.get(server.pid).porte)}`);
    assert.ok(!m.perPid.get(client.pid).porte.includes(portaClient), `AL CONTRARIO: la porta locale ${portaClient} del client non è un ascolto`);
    assert.deepEqual(m.perPid.get(client.pid).porte, [], 'il client non ascolta niente');
    /* un server legato a 0.0.0.0 senza connessioni: lo stesso stato 0 del fantasma del client, e QUESTO è un ascolto */
    const largo = spawn(process.execPath, ['-e', "const s=require('net').createServer(()=>{}).listen(0,'0.0.0.0',()=>{console.log(s.address().port)});setTimeout(()=>{},60000)"], { windowsHide: true });
    try {
      const portaLarga = await new Promise((risolvi) => largo.stdout.once('data', (x) => risolvi(Number(String(x).trim()))));
      const m2 = await c.misura({ pid: [largo.pid] });
      assert.ok(m2.perPid.get(largo.pid).porte.includes(portaLarga), `il server su 0.0.0.0 ascolta su ${portaLarga}: ${JSON.stringify(m2.perPid.get(largo.pid).porte)}`);
    } finally { largo.kill(); }
  } finally {
    server.kill(); client.kill(); c.chiudi();
  }
});

test('P05-05 — AL CONTRARIO: senza /proc/net/tcp leggibile le porte NON sono misurate (null), non «nessuna porta»', () => {
  const rotto = { readFileSync: () => { throw new Error('EACCES'); }, readdirSync: () => [], readlinkSync: () => '' };
  assert.equal(portePerPidDaProc(new Set([1]), rotto), null);
});

/*
 * P05-06 (cura P05-04, owner decision 347, 07/11/2026) — P05-04 was RED in train M under load (client port 58166 shown as
 *   listening). Measured 07/11 (raw Get-NetTCPConnection rows of the SAME snapshot the filter used, scratchpad
 *   p0504-righe-base-*.json): 6 reds in 40 probe runs, and in all six the client's live loopback connection row was THERE but its
 *   `State` was 2 (Listen), 0, 1 (Closed) or 6 (FinWait1) — never 5 — while the server's side of the same connection said 5, 0, 2 or
 *   6. The old rule dropped the client's 0.0.0.0 ghost only when a state-5 row shared its pid:port, so the ghost came out as a
 *   listening port. ⇒ `State` is not trusted to tell a connection: a row with a remote port is a connection, whatever it says.
 *   Rows below are copied from those files: [pid, localAddress, localPort, remoteAddress, remotePort, state].
 */
test('P05-06 — measured rows of the P05-04 reds: a client port never comes out as listening, whatever State its connection reports', () => {
  const misurati = [
    { file: 'solo-11', client: [24460, 51225, 2], server: [15524, 51224, 5] },
    { file: 'solo-4', client: [16836, 51211, 0], server: [29468, 51210, 5] },
    { file: 'carico-12', client: [17428, 51349, 0], server: [25432, 51348, 2] },
    { file: 'carico-13', client: [24760, 51351, 1], server: [24864, 51350, 0] },
    { file: 'carico-17', client: [13008, 51361, 6], server: [28544, 51360, 6] },
    { file: 'carico-3', client: [24376, 51330, 1], server: [22976, 51329, 5] },
  ];
  for (const { file, client: [cPid, cPorta, cStato], server: [sPid, sPorta, sStato] } of misurati) {
    const righe = [
      [cPid, '0.0.0.0', cPorta, '0.0.0.0', 0, 0], // the client's ghost
      [cPid, '127.0.0.1', cPorta, '127.0.0.1', sPorta, cStato], // the client's live connection, with the State it reported
      [sPid, '127.0.0.1', sPorta, '127.0.0.1', cPorta, sStato], // the server's accepted socket
      [sPid, '127.0.0.1', sPorta, '0.0.0.0', 0, 0], // the server's listening socket (State 0, as measured on 29/10)
    ];
    /* Round 2 (07/11): each side has exactly ONE connection here, so the table cannot tell them apart and the port is asked. Measured
       answers (scratchpad p0504g2-righe-discriminanti-solo.jsonl, 20 runs): every server port accepted a connect (220/220), every
       client port refused it (200/200). The replay gives that measured answer: the server answers, the client does not. */
    const m = portePerPid(`PORTE ${JSON.stringify(righe)}`, (pid) => pid === sPid);
    assert.ok(m instanceof Map, `${file}: the rows are read (not null)`);
    assert.equal(m.has(cPid), false, `${file}: AL CONTRARIO: the client's local port ${cPorta} is not a listening port: ${JSON.stringify([...(m.get(cPid) ?? [])])}`);
    assert.deepEqual([...(m.get(sPid) ?? [])], [sPorta], `${file}: the server on 127.0.0.1 (like the 4174) keeps its port even with a connection open`);
    assert.equal(portePerPid(`PORTE ${JSON.stringify(righe)}`).has(cPid), false, `${file}: with no answer at all the client port is still not shown`);
  }
});

test('P05-07 — the rule on raw rows: a 0.0.0.0/:: server without connections shows; Bound, Closed and connections never do; one row alone', () => {
  const righe = [
    [10, '0.0.0.0', 3000, '0.0.0.0', 0, 0], // a server on 0.0.0.0 without connections (third part of P05-04)
    [11, '::', 3001, '::', 0, 2], // IPv6, Listen
    [12, '0.0.0.0', 3002, '0.0.0.0', 0, 100], // Bound: never put to listen
    [13, '0.0.0.0', 3003, '0.0.0.0', 0, 1], // Closed
    /* Round 2 (07/11) removed the row «a ghost that says Listen» (pid 14): no measured source. Ghost rows measured 07/11 read 0, 1, 6
       or 100, never 2 (p0504g2-righe-discriminanti-{solo,carico}.jsonl, the rev-righe-* files of the three reviews), and a Listen
       row now always counts (finding 1 of the round-1 reviews: a real listener must never be hidden). */
    [15, '::', 3005, '::', 0, 0], // IPv6 ghost
    [15, '::1', 3005, '::1', 3001, 8], // its connection, CloseWait
    [16, '127.0.0.1', 4174, '0.0.0.0', 0, 0], // the 4174
    [16, '127.0.0.1', 4174, '127.0.0.1', 50000, 5], // with the owner's browser connected
    [17, '127.0.0.1', 5000, '127.0.0.1', 4174, 2], // a connection that says «Listen»: it has a remote port, it is not one
    [18, '0.0.0.0', 0, '0.0.0.0', 0, 0], [0, '0.0.0.0', 80, '0.0.0.0', 0, 2], [19, '0.0.0.0', 70000, '0.0.0.0', 0, 2], ['x', '0.0.0.0', 1, '0.0.0.0', 0, 2],
  ];
  /* the 4174 has one connection here: it is asked, and it answers (measured: a 127.0.0.1 server with a client accepted a connect 20/20).
     Round 3 (07/11, round-2 review finding 1: a client ghost was measured with NO connection row, rev-p0504g2/solo.jsonl round 6): a
     State-0 server without connections is asked too, so pid 10 is given its measured answer (every server port accepted, 420/420). */
  const m = portePerPid(`PORTE ${JSON.stringify(righe)}`, (pid) => pid === 10 || pid === 16);
  assert.equal(portePerPid(`PORTE ${JSON.stringify(righe)}`, (pid) => pid === 16).has(10), false, 'round 3: a zero-connection State-0 row that does not answer is hidden');
  assert.deepEqual([...m.keys()].sort((a, b) => a - b), [10, 11, 16]);
  assert.deepEqual([...m.get(10)], [3000]);
  assert.deepEqual([...m.get(11)], [3001]);
  assert.deepEqual([...m.get(16)], [4174]);
  assert.deepEqual([...portePerPid('PORTE [20,"0.0.0.0",8080,"0.0.0.0",0,0]', () => true).get(20)], [8080], 'ConvertTo-Json flattens a single row (asked, answers: round 3)');
  assert.equal(portePerPid('PORTE [20,"0.0.0.0",8080,"0.0.0.0",0,100]').size, 0, 'a single Bound row: measured, no port');
});

/*
 * P05-08..11 (P05-04 second round, owner decision 347, 07/11/2026). The three round-1 reviews were RED: a Listen row (State 2) on
 *   0.0.0.0/:: with a connection was hidden, a :: server with a keep-alive client was hidden 8/8, a client bound to 127.0.0.1 left its
 *   ghost shown as listening. Measured on real sockets (scratchpad p0504g2-righe-discriminanti-{solo,carico}.jsonl, 20 runs each):
 *   with exactly ONE connection on a pid:port, State, CreationTime (1 s resolution) and OffloadState do not separate a server from a
 *   client's ghost; asking the port (a connect) does, 420/420 alone. Two or more connections never belonged to a client (0/200).
 */
import { porteInAscoltoDaRighe, porteDaSondare, COPIONE_WINDOWS, sondaTcp } from '../src/risorse-processi.mjs';
import { percorsoPowershell } from '../src/taskkill-di-sistema.mjs';

/*
 * Round 4 (07/11, written source: the round-3 review scratchpad p0504g3-revisione.md, finding 1, bench rev-p0504g3/solo.jsonl): the
 *   rule «two connections show unasked» was wrong. A real client with SO_REUSEADDR (rev-p0504g3/riuso.py) leaves its ghost with TWO
 *   connection rows and was shown as listening 12-13 times in 15 (see P05-15). So pid 33 below (two connections) is now asked like
 *   every State-0 candidate; it is a server, so it is given the measured server answer (accepted, 420/420).
 */
test('P05-08 — round 4: a Listen row always shows unasked; EVERY State-0 candidate, whatever its connections, is decided by asking the port', () => {
  const righe = [
    [30, '0.0.0.0', 3100, '0.0.0.0', 0, 2], [30, '127.0.0.1', 3100, '127.0.0.1', 50100, 5], // a Listen row WITH a connection
    [31, '::', 3101, '::', 0, 2], [31, '::1', 3101, '::1', 50101, 5], // the same on ::
    [32, '::', 3102, '::', 0, 0], // node's default listen() as measured here: '::', State 0, no connection
    [33, '::', 3103, '::', 0, 0], [33, '127.0.0.1', 3103, '127.0.0.1', 50103, 5], [33, '127.0.0.1', 3103, '127.0.0.1', 50104, 0], // two
    [34, '::', 3104, '::', 0, 0], [34, '127.0.0.1', 3104, '127.0.0.1', 50105, 5], // http server on :: with one keep-alive client
    [35, '0.0.0.0', 50105, '0.0.0.0', 0, 0], [35, '127.0.0.1', 50105, '127.0.0.1', 3104, 2], // that client: ghost + its connection
    [36, '127.0.0.1', 50107, '0.0.0.0', 0, 0], [36, '127.0.0.1', 50107, '127.0.0.1', 3104, 5], // a client bound to 127.0.0.1
    [37, '0.0.0.0', 50108, '0.0.0.0', 0, 0], [37, '192.168.1.120', 50108, '140.82.112.3', 443, 5], // a client of a remote :443
    [38, '0.0.0.0', 65535, '0.0.0.0', 0, 0], // the last port
    /* Round 3 (07/11, round-2 review finding 1, rev-p0504g2/solo.jsonl round 6, replayed by rev-p0504g2/replay-zero.mjs): a churning
       client's ghost with NO connection row on its pid:port (its TIME_WAIT belongs to pid 0). It came out as listening with every
       ask answered NO. Copied as measured. */
    [29660, '0.0.0.0', 49599, '0.0.0.0', 0, 0],
  ];
  const chiesti = [];
  /* the servers answer (measured: every server port accepted a connect, 420/420); every client port refuses */
  const servono = new Set([32, 33, 34, 38]);
  const m = porteInAscoltoDaRighe(righe, (pid, porta) => { chiesti.push(`${pid}:${porta}`); return servono.has(pid); });
  assert.deepEqual([...m.keys()].sort((a, b) => a - b), [30, 31, 32, 33, 34, 38]);
  assert.deepEqual([...m.get(30)], [3100], 'a Listen row on 0.0.0.0 shows even with a connection on its port');
  assert.deepEqual([...m.get(31)], [3101], 'and on ::');
  assert.deepEqual([...m.get(32)], [3102], 'a :: server in State 0 without connections, asked, answers');
  assert.deepEqual([...m.get(33)], [3103], 'two connections on one pid:port, asked, answers: a server');
  assert.deepEqual([...m.get(34)], [3104], 'one connection and the port answers: a server');
  assert.deepEqual([...m.get(38)], [65535]);
  assert.equal(m.has(29660), false, `the measured zero-connection client ghost answered NO is not listening: ${JSON.stringify([...(m.get(29660) ?? [])])}`);
  assert.deepEqual(chiesti.sort(), ['29660:49599', '32:3102', '33:3103', '34:3104', '35:50105', '36:50107', '37:50108', '38:65535'], 'every State-0 candidate is asked, two connections included; Listen rows are not');
  const no = porteInAscoltoDaRighe(righe, () => false);
  assert.deepEqual([...no.keys()].sort((a, b) => a - b), [30, 31], 'every ask answered NO: only Listen rows show');
  const muto = porteInAscoltoDaRighe(righe);
  assert.deepEqual([...muto.keys()].sort((a, b) => a - b), [30, 31], 'with no answer, a State-0 candidate never shows, whatever its connections');
  for (const vago of [undefined, null, 'yes', 1]) {
    assert.deepEqual([...porteInAscoltoDaRighe(righe, () => vago).keys()].sort((a, b) => a - b), [30, 31], `only true is a yes, not ${vago}`);
  }
  assert.deepEqual(porteDaSondare(righe), [
    { pid: 32, porta: 3102, indirizzo: '::1' }, { pid: 33, porta: 3103, indirizzo: '::1' },
    { pid: 34, porta: 3104, indirizzo: '::1' }, { pid: 35, porta: 50105, indirizzo: '127.0.0.1' },
    { pid: 36, porta: 50107, indirizzo: '127.0.0.1' }, { pid: 37, porta: 50108, indirizzo: '127.0.0.1' },
    { pid: 38, porta: 65535, indirizzo: '127.0.0.1' }, { pid: 29660, porta: 49599, indirizzo: '127.0.0.1' },
  ], 'a wildcard is asked on loopback of its family, a precise address on itself');
  assert.deepEqual(porteDaSondare([[39, '0.0.0.0', 3105, '0.0.0.0', 0, 100], [39, '127.0.0.1', 3105, '127.0.0.1', 1, 5]]), [], 'Bound is never asked');
});

test('P05-09 — the sampler asks only the doubtful ports of the asked trees, keeps an answer while the row lives, re-asks a timeout', async () => {
  const processi = JSON.stringify([[40, 1, 1, 1, 1000], [41, 40, 1, 1, 1010], [42, 1, 1, 1, 1000]]);
  const base = [
    [41, '::', 3200, '::', 0, 0], [41, '127.0.0.1', 3200, '127.0.0.1', 50200, 5], // child of 40: a server with one client
    [41, '0.0.0.0', 50201, '0.0.0.0', 0, 0], [41, '127.0.0.1', 50201, '127.0.0.1', 9, 5], // and a client of its own
    [40, '0.0.0.0', 50202, '0.0.0.0', 0, 0], [40, '127.0.0.1', 50202, '127.0.0.1', 9, 5], // a probe that times out
    [42, '0.0.0.0', 3300, '0.0.0.0', 0, 0], [42, '127.0.0.1', 3300, '127.0.0.1', 50203, 5], // not asked for: never probed
  ];
  let righe = base;
  const chiesti = [];
  const sondaPorta = async (indirizzo, porta) => { chiesti.push(`${indirizzo}:${porta}`); return porta === 3200 ? true : porta === 50201 ? false : null; };
  const c = creaCampionatoreRisorse({ piattaforma: 'win32', sondaPorta, spawnFn: lettoreFinto(() => [processi, `PORTE ${JSON.stringify(righe)}`], []) });
  try {
    assert.deepEqual((await c.misura({ pid: [40] })).perPid.get(40).porte, [3200]);
    assert.deepEqual(chiesti.sort(), ['127.0.0.1:50201', '127.0.0.1:50202', '::1:3200']);
    chiesti.length = 0;
    assert.deepEqual((await c.misura({ pid: [40] })).perPid.get(40).porte, [3200], 'the answer is kept');
    assert.deepEqual(chiesti, ['127.0.0.1:50202'], 'only the timed-out one is asked again');
    chiesti.length = 0;
    righe = base.filter((r) => r[2] !== 3200);
    assert.deepEqual((await c.misura({ pid: [40] })).perPid.get(40).porte, []);
    righe = base;
    chiesti.length = 0;
    await c.misura({ pid: [40] });
    assert.ok(chiesti.includes('::1:3200'), 'a row that went away and came back is asked again (a new socket may hold the port)');
  } finally { c.chiudi(); }
  const lenta = creaCampionatoreRisorse({ piattaforma: 'win32', attesaSondaMs: 50, sondaPorta: () => new Promise(() => {}),
    spawnFn: lettoreFinto(() => [processi, `PORTE ${JSON.stringify(base)}`], []) });
  try {
    assert.deepEqual((await lenta.misura({ pid: [40] })).perPid.get(40).porte, [], 'an answer over the budget leaves the port hidden');
  } finally { lenta.chiudi(); }
});

test('P05-10 — boundary: the REAL PowerShell script, fed rows with the real State type, hands the JS decision what it needs', { skip: process.platform === 'win32' ? false : 'solo Windows', timeout: 60_000 }, async () => {
  /* Rows shaped as measured (p0504g2-proprieta.txt: the client's live connection said «Listen», its ghost State 0/Closed; the
     listener State 0 or Listen). The enum has no 0, which the cmdlet still returns: so every State is built with [Enum]::ToObject.
     Only Get-NetTCPConnection is replaced: the filter and the JSON are the product's own. */
  const tipo = '[Microsoft.PowerShell.Cmdletization.GeneratedTypes.NetTCPConnection.State]';
  const riga = (pid, la, lp, ra, rp, st) => `[pscustomobject]@{OwningProcess=${pid};LocalAddress='${la}';LocalPort=${lp};RemoteAddress='${ra}';RemotePort=${rp};State=[Enum]::ToObject(${tipo}, ${st})}`;
  const finte = [
    riga(50, '0.0.0.0', 3400, '0.0.0.0', 0, 2), riga(50, '127.0.0.1', 3400, '127.0.0.1', 50400, 5),
    riga(51, '0.0.0.0', 50400, '0.0.0.0', 0, 0), riga(51, '127.0.0.1', 50400, '127.0.0.1', 3400, 2),
    riga(52, '::', 3401, '::', 0, 0),
    riga(53, '127.0.0.1', 50500, '1.2.3.4', 443, 5),
  ];
  const copione = `Import-Module NetTCPIP\n$finte = @(${finte.join(', ')})\n${COPIONE_WINDOWS.replace('Get-NetTCPConnection -ErrorAction SilentlyContinue', () => '$finte')}`;
  assert.notEqual(copione.indexOf('@($finte)'), -1, 'the product script reads Get-NetTCPConnection where the fake rows go');
  const ps = spawn(percorsoPowershell(process.env.SystemRoot), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(copione, 'utf16le').toString('base64')], { windowsHide: true });
  let uscita = '';
  ps.stdout.setEncoding('utf8');
  await new Promise((risolvi, rifiuta) => {
    ps.stdout.on('data', (x) => { uscita += x; if (/\r?\nFINE\r?\n/u.test(uscita)) risolvi(); });
    ps.once('error', rifiuta);
    ps.stdin.write('leggi\n');
  });
  ps.stdin.end(); ps.kill();
  const rigaPorte = uscita.split(/\r?\n/u).find((r) => r.startsWith('PORTE '));
  assert.ok(rigaPorte, uscita.slice(0, 300));
  assert.equal(rigaPorte.includes('50500'), false, 'a connection with no remote-0 row on its pid:port is not sent');
  /* round 3: the :: listener (52) has no connection, so it is asked; it is given the measured server answer (accepted, 420/420) */
  const m = portePerPid(rigaPorte, (pid) => pid === 52);
  assert.deepEqual([...(m.get(50) ?? [])], [3400], `a Listen listener with a connection crosses the boundary: ${rigaPorte}`);
  assert.deepEqual([...(m.get(52) ?? [])], [3401], 'a :: listener in State 0');
  assert.equal(m.has(51), false, `the client's ghost: its connection crossed the boundary too: ${rigaPorte}`);
});

test('P05-11 — real sockets: a :: server with a keep-alive client and a 0.0.0.0 server with a client show; a client bound to 127.0.0.1 does not', { skip: process.platform === 'win32' ? false : 'solo Windows', timeout: 90_000 }, async () => {
  const vivi = [];
  const avvia = (codice) => { const p = spawn(process.execPath, ['-e', codice], { windowsHide: true }); vivi.push(p); return new Promise((ok, ko) => { p.stdout.once('data', (b) => ok([p.pid, Number(String(b).trim())])); p.once('error', ko); }); };
  const c = creaCampionatoreRisorse({ spentoDopoMs: 60_000, attesaMassimaMs: 45_000 });
  try {
    const [pidH, portaH] = await avvia("const s=require('http').createServer((q,r)=>r.end('ok'));s.keepAliveTimeout=60000;s.listen(0,()=>console.log(s.address().port));setTimeout(()=>{},60000)");
    const [pidK, portaK] = await avvia(`const h=require('http');const a=new h.Agent({keepAlive:true});const q=h.get({port:${portaH},host:'127.0.0.1',agent:a},(r)=>{console.log(r.socket.localPort);r.resume()});setTimeout(()=>{},60000)`);
    const [pidL, portaL] = await avvia("const s=require('net').createServer(()=>{}).listen(0,'0.0.0.0',()=>console.log(s.address().port));setTimeout(()=>{},60000)");
    const [pidC, portaC] = await avvia(`const c=require('net').connect(${portaL},'127.0.0.1',()=>console.log(c.localPort));setTimeout(()=>{},60000)`);
    const [pidB, portaB] = await avvia(`const c=require('net').connect({port:${portaL},host:'127.0.0.1',localAddress:'127.0.0.1'},()=>console.log(c.localPort));setTimeout(()=>{},60000)`);
    const m = await c.misura({ pid: [pidH, pidK, pidL, pidC, pidB] });
    assert.ok(m.perPid.get(pidH)?.porte?.includes(portaH), `the :: http server with a keep-alive client keeps ${portaH}: ${JSON.stringify(m.perPid.get(pidH)?.porte)}`);
    assert.ok(m.perPid.get(pidL)?.porte?.includes(portaL), `the 0.0.0.0 server with clients keeps ${portaL}: ${JSON.stringify(m.perPid.get(pidL)?.porte)}`);
    assert.deepEqual(m.perPid.get(pidK)?.porte, [], `AL CONTRARIO: the keep-alive client ${portaK} listens on nothing`);
    assert.deepEqual(m.perPid.get(pidC)?.porte, [], `AL CONTRARIO: the client ${portaC} listens on nothing`);
    assert.deepEqual(m.perPid.get(pidB)?.porte, [], `AL CONTRARIO: the client bound to 127.0.0.1 (${portaB}) listens on nothing`);
  } finally { for (const p of vivi) p.kill(); c.chiudi(); }
});

test('P05-12 — the ask itself: a listening port answers true, a closed one false (an answer), a bad address null (asked again)', async () => {
  const net = await import('node:net');
  const s = net.createServer((x) => x.destroy());
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
  const porta = s.address().port;
  try {
    assert.equal(await sondaTcp('127.0.0.1', porta), true);
    await new Promise((ok) => s.close(ok));
    assert.equal(await sondaTcp('127.0.0.1', porta), false, 'refused (measured: ECONNREFUSED in 3-7 ms) is an answer');
    assert.equal(await sondaTcp('localhost', porta), null, 'only an IP address is asked');
    assert.equal(await sondaTcp('127.0.0.1', 0), null);
    const appesa = { once: () => appesa, destroy: () => {} };
    assert.equal(await sondaTcp('127.0.0.1', porta, { attesaMs: 20, connetti: () => appesa }), null, 'no answer in time is not an answer');
  } finally { if (s.listening) s.close(); }
});

/*
 * P05-13..14 (P05-04 third round, owner decision 347, 07/11/2026). The round-2 review (scratchpad p0504g2-revisione.md, mutants
 *   rev-p0504g2/mutanti.log) found two survivors: M10 «every connect error is a refusal» and M23 «the probe socket is never
 *   destroyed». Only ECONNREFUSED says nobody listens (Node net docs: «ECONNREFUSED (Connection refused): No connection could be
 *   made because the target machine actively refused it»); Hermes treats it the same way (gateway/platforms/tcp_site.py:26-29,
 *   `except ConnectionRefusedError: return False` / `except OSError: return True`). Any other failure is not an answer here (null):
 *   it is not kept, and the port is asked again on the next sample. Every path closes its socket.
 */
function presaFinta(contatori) {
  const presa = new EventEmitter();
  presa.destroy = () => { contatori.distrutte++; };
  return presa;
}

test('P05-13 — the ask with an injected connect: refused is false, any other error or a timeout is null, success true; the socket is closed on every path', async () => {
  const casi = [
    { nome: 'accepted', fai: (p) => p.emit('connect'), atteso: true },
    { nome: 'ECONNREFUSED', fai: (p) => p.emit('error', Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })), atteso: false },
    ...['EACCES', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT', 'ECONNRESET', 'EADDRNOTAVAIL'].map((code) => (
      { nome: code, fai: (p) => p.emit('error', Object.assign(new Error(code), { code })), atteso: null })),
    { nome: 'an error with no code', fai: (p) => p.emit('error', new Error('?')), atteso: null },
    { nome: 'timeout (no event)', fai: () => {}, atteso: null },
    { nome: 'accepted, then a late error', fai: (p) => { p.emit('connect'); p.emit('error', Object.assign(new Error('late'), { code: 'ECONNRESET' })); }, atteso: true },
  ];
  for (const { nome, fai, atteso } of casi) {
    const contatori = { distrutte: 0 };
    const chiamate = [];
    const connetti = (opzioni) => { chiamate.push(opzioni); const p = presaFinta(contatori); setImmediate(() => fai(p)); return p; };
    assert.equal(await sondaTcp('::1', 3600, { attesaMs: 30, connetti }), atteso, `${nome} ⇒ ${atteso}`);
    assert.deepEqual(chiamate, [{ host: '::1', port: 3600 }], `${nome}: one connect, on the asked address and port`);
    assert.equal(contatori.distrutte, 1, `${nome}: the probe socket is destroyed exactly once`);
  }
  const rotta = { distrutte: 0 };
  const lancia = () => { throw Object.assign(new Error('no'), { code: 'EACCES' }); };
  assert.equal(await sondaTcp('127.0.0.1', 3600, { attesaMs: 30, connetti: lancia }), null, 'a connect that throws is not an answer');
  const nonSiChiude = () => { const p = presaFinta(rotta); p.destroy = () => { rotta.distrutte++; throw new Error('already closed'); }; setImmediate(() => p.emit('connect')); return p; };
  assert.equal(await sondaTcp('127.0.0.1', 3600, { attesaMs: 30, connetti: nonSiChiude }), true, 'a destroy that throws does not lose the answer');
  assert.equal(rotta.distrutte, 1);
});

test('P05-14 — the sampler with the real ask: a non-refusal error is not kept and is asked again; a refusal and an acceptance are kept', async () => {
  const processi = JSON.stringify([[60, 1, 1, 1, 1000], [61, 1, 1, 1, 1000]]);
  const righe = [
    [60, '0.0.0.0', 3700, '0.0.0.0', 0, 0], // a client ghost with no connection row (the round-2 measured shape)
    [61, '::', 3701, '::', 0, 0], // an idle server on ::
  ];
  const risposte = { 3700: ['EACCES', 'ECONNREFUSED'], 3701: ['connect'] };
  const chiesti = [];
  const contatori = { distrutte: 0 };
  const connetti = ({ host, port }) => {
    chiesti.push(`${host}:${port}`);
    const p = presaFinta(contatori);
    const r = risposte[port].shift();
    setImmediate(() => (r === 'connect' ? p.emit('connect') : p.emit('error', Object.assign(new Error(r), { code: r }))));
    return p;
  };
  const sondaPorta = (indirizzo, porta, o) => sondaTcp(indirizzo, porta, { ...o, connetti });
  const c = creaCampionatoreRisorse({ piattaforma: 'win32', sondaPorta, spawnFn: lettoreFinto(() => [processi, `PORTE ${JSON.stringify(righe)}`], []) });
  try {
    let m = await c.misura({ pid: [60, 61] });
    assert.deepEqual(m.perPid.get(60).porte, [], 'EACCES is not a yes');
    assert.deepEqual(m.perPid.get(61).porte, [3701], 'the idle server answers');
    assert.deepEqual(chiesti.sort(), ['127.0.0.1:3700', '::1:3701']);
    chiesti.length = 0;
    m = await c.misura({ pid: [60, 61] });
    assert.deepEqual(chiesti, ['127.0.0.1:3700'], 'EACCES was not kept: asked again; the acceptance was kept');
    assert.deepEqual(m.perPid.get(60).porte, []);
    chiesti.length = 0;
    m = await c.misura({ pid: [60, 61] });
    assert.deepEqual(chiesti, [], 'the refusal is kept while the row lives');
    assert.deepEqual(m.perPid.get(60).porte, []);
    assert.deepEqual(m.perPid.get(61).porte, [3701]);
    assert.equal(contatori.distrutte, 3, 'every probe socket closed');
  } finally { c.chiudi(); }
});

/*
 * P05-15..17 (P05-04 fourth round, owner decision 347, 07/11/2026). Written source: the round-3 review (scratchpad
 *   p0504g3-revisione.md) and its bench (rev-p0504g3/solo.jsonl, riuso.py). Finding 1: a client with SO_REUSEADDR leaves its ghost
 *   with TWO connection rows, and «two connections show unasked» showed it as listening 12-13 times in 15. Finding 2: a client
 *   leaking connections gave up to 5554 asks in one sample (mean 1547) and a fresh sample hid real servers. Finding 4: the mutants
 *   R15 (a sondaPorta that throws is kept as a refusal) and R18 (the probe timer is not cleared) survived, and a self-connect could
 *   read as an acceptance.
 */
import * as risorseProcessi from '../src/risorse-processi.mjs';
const TETTO_SONDE = risorseProcessi.TETTO_SONDE; // a namespace read, so the red run on the old code fails on the asserts, not on the import

test('P05-15 — measured rows of a SO_REUSEADDR client (two connections on its ghost port): it is asked; NO hides it, YES shows it', async () => {
  /* copied from rev-p0504g3/solo.jsonl, round 0: pid 27612 is riuso.py, 64392 its shared client port (bound 0.0.0.0, connected to
     two servers), 64390 and 64391 its own two listeners on 127.0.0.1. */
  const righe = [
    [27612, '0.0.0.0', 64392, '0.0.0.0', 0, 0], [27612, '127.0.0.1', 64392, '127.0.0.1', 64391, 5], [27612, '127.0.0.1', 64392, '127.0.0.1', 64390, 5],
    [27612, '127.0.0.1', 64390, '0.0.0.0', 0, 0], [27612, '127.0.0.1', 64390, '127.0.0.1', 64392, 5],
    [27612, '127.0.0.1', 64391, '0.0.0.0', 0, 0], [27612, '127.0.0.1', 64391, '127.0.0.1', 64392, 5],
  ];
  const chiesti = [];
  const no = porteInAscoltoDaRighe(righe, (pid, porta, indirizzo) => { chiesti.push(`${porta}@${indirizzo}`); return porta !== 64392; });
  assert.deepEqual([...(no.get(27612) ?? [])].sort((a, b) => a - b), [64390, 64391], `the client port answered NO is hidden, its two listeners answered YES show: ${JSON.stringify([...(no.get(27612) ?? [])])}`);
  assert.ok(chiesti.includes('64392@127.0.0.1'), `the two-connection ghost is asked, on the loopback of its family: ${JSON.stringify(chiesti)}`);
  assert.deepEqual([...porteInAscoltoDaRighe(righe, () => true).get(27612)].sort((a, b) => a - b), [64390, 64391, 64392], 'answered YES (a connect on it was accepted) it shows');
  assert.equal(porteInAscoltoDaRighe(righe).has(27612), false, 'with no answer nothing of this pid shows');
  assert.ok(porteDaSondare(righe).some((d) => d.pid === 27612 && d.porta === 64392 && d.indirizzo === '127.0.0.1'), 'it is in the list the sampler asks');
  /* the same rows through the sampler: the refused ghost stays hidden sample after sample, the listeners show */
  const processi = JSON.stringify([[27612, 1, 1, 1, 1000]]);
  const sondaPorta = async (indirizzo, porta) => porta !== 64392;
  const c = creaCampionatoreRisorse({ piattaforma: 'win32', sondaPorta, spawnFn: lettoreFinto(() => [processi, `PORTE ${JSON.stringify(righe)}`], []) });
  try {
    for (let i = 0; i < 3; i++) assert.deepEqual((await c.misura({ pid: [27612] })).perPid.get(27612).porte, [64390, 64391], `sample ${i}`);
  } finally { c.chiudi(); }
});

test('P05-16 — at most tettoSonde asks in a sample: thousands of ghost rows of a leaking client and one real server; the server shows, no ghost does', async () => {
  /* shapes copied from rev-p0504g3/solo.jsonl round 6: churn2 (pid 15984) left 3442 State-0 ghosts on 0.0.0.0, each beside its
     FinWait2 (7) connection to the server port 50203, e.g. [15984,"0.0.0.0",65529,"0.0.0.0",0,0] + [15984,"127.0.0.1",65529,
     "127.0.0.1",50203,7]; srvIdle4 (pid 22304) an idle 0.0.0.0 server, [22304,"0.0.0.0",50207,"0.0.0.0",0,0]. */
  const fantasmi = [];
  for (let p = 52000; p < 55000; p++) fantasmi.push([15984, '0.0.0.0', p, '0.0.0.0', 0, 0], [15984, '127.0.0.1', p, '127.0.0.1', 50203, 7]);
  const server = [22304, '0.0.0.0', 50207, '0.0.0.0', 0, 0];
  const processi = JSON.stringify([[15984, 1, 1, 1, 1000], [22304, 1, 1, 1, 1000]]);
  const righe = [...fantasmi, server]; // the server is the LAST row
  const chiesti = [];
  const sondaPorta = async (indirizzo, porta) => { chiesti.push(porta); return porta === 50207; };
  const c = creaCampionatoreRisorse({ piattaforma: 'win32', sondaPorta, spawnFn: lettoreFinto(() => [processi, `PORTE ${JSON.stringify(righe)}`], []) });
  try {
    let m = await c.misura({ pid: [15984, 22304] });
    assert.ok(chiesti.length <= TETTO_SONDE, `asks in the first sample ${chiesti.length} <= ${TETTO_SONDE}`);
    assert.ok(TETTO_SONDE >= 8 && TETTO_SONDE < 3000, `the cap is a real bound: ${TETTO_SONDE}`);
    assert.deepEqual(m.perPid.get(22304).porte, [50207], 'the server shows in the first sample, within the cap');
    assert.deepEqual(m.perPid.get(15984).porte, [], 'no ghost shows, asked (NO) or not asked yet');
    const primi = new Set(chiesti);
    assert.equal(primi.size, chiesti.length, 'each row asked once');
    chiesti.length = 0;
    m = await c.misura({ pid: [15984, 22304] });
    assert.ok(chiesti.length > 0 && chiesti.length <= TETTO_SONDE, `asks in the second sample ${chiesti.length} <= ${TETTO_SONDE}`);
    assert.equal(chiesti.includes(50207), false, 'the kept YES is not asked again');
    assert.ok(chiesti.every((p) => !primi.has(p)), 'a kept NO is not asked again: the next ghosts are');
    assert.deepEqual(m.perPid.get(22304).porte, [50207]);
    assert.deepEqual(m.perPid.get(15984).porte, [], 'the ghosts not asked yet still do not show');
  } finally { c.chiudi(); }
  /* inside ONE pid the oldest row goes first: a server seen before the leak started (its first ask timed out) is asked before the
     newer ghosts of the same pid, even as the last row and with a cap of 5 */
  let tabella = [[15984, '0.0.0.0', 50300, '0.0.0.0', 0, 0]];
  let primaVolta = true;
  const domande = [];
  const sonda2 = async (indirizzo, porta) => { domande.push(porta); if (porta !== 50300) return false; if (primaVolta) { primaVolta = false; return null; } return true; };
  const c2 = creaCampionatoreRisorse({ piattaforma: 'win32', tettoSonde: 5, sondaPorta: sonda2, spawnFn: lettoreFinto(() => [processi, `PORTE ${JSON.stringify(tabella)}`], []) });
  try {
    assert.deepEqual((await c2.misura({ pid: [15984] })).perPid.get(15984).porte, [], 'the first ask timed out: hidden');
    tabella = [...fantasmi, [15984, '0.0.0.0', 50300, '0.0.0.0', 0, 0]];
    domande.length = 0;
    assert.deepEqual((await c2.misura({ pid: [15984] })).perPid.get(15984).porte, [50300], 'the older row is asked first and answers');
    assert.equal(domande.length, 5, `the injected cap holds: ${domande.length}`);
    assert.equal(domande[0], 50300);
  } finally { c2.chiudi(); }
  /* across pids, inside the same turn, the older row goes first too (then the lower port, then row order: P05-19); and a row that went away comes back as a new
     row (its age is forgotten with its answer: a new socket may hold the port). Cap 1, every ask times out (null, never kept). */
  let tab3 = [[15984, '0.0.0.0', 50400, '0.0.0.0', 0, 0]];
  const dom3 = [];
  const c3 = creaCampionatoreRisorse({ piattaforma: 'win32', tettoSonde: 1, sondaPorta: async (indirizzo, porta) => { dom3.push(porta); return null; }, spawnFn: lettoreFinto(() => [processi, `PORTE ${JSON.stringify(tab3)}`], []) });
  try {
    await c3.misura({ pid: [15984, 22304] });
    tab3 = [[22304, '0.0.0.0', 50500, '0.0.0.0', 0, 0], [15984, '0.0.0.0', 50400, '0.0.0.0', 0, 0]];
    await c3.misura({ pid: [15984, 22304] });
    assert.deepEqual(dom3, [50400, 50400], 'the row seen in sample 1 goes before the newer row of another pid, even listed after it');
    tab3 = [[22304, '0.0.0.0', 50500, '0.0.0.0', 0, 0]];
    await c3.misura({ pid: [15984, 22304] });
    tab3 = [[22304, '0.0.0.0', 50500, '0.0.0.0', 0, 0], [15984, '0.0.0.0', 50400, '0.0.0.0', 0, 0]];
    dom3.length = 0;
    await c3.misura({ pid: [15984, 22304] });
    assert.deepEqual(dom3, [50500], 'the row of 50400 went away and came back: it is new, the older 50500 goes first');
  } finally { c3.chiudi(); }
});

test('P05-17 — a sondaPorta that throws is not an answer (asked again); a self-connect is not an acceptance; the probe timer is cleared', async () => {
  let volte = 0;
  const sondaPorta = async () => { volte++; if (volte === 1) throw new Error('boom'); return true; };
  const c = creaCampionatoreRisorse({ piattaforma: 'win32', sondaPorta, spawnFn: lettoreFinto(() => [JSON.stringify([[70, 1, 1, 1, 1000]]), `PORTE ${JSON.stringify([[70, '::', 3800, '::', 0, 0]])}`], []) });
  try {
    assert.deepEqual((await c.misura({ pid: [70] })).perPid.get(70).porte, [], 'a throw is no yes');
    assert.deepEqual((await c.misura({ pid: [70] })).perPid.get(70).porte, [3800], 'and no refusal either: asked again, it answers');
    assert.equal(volte, 2);
  } finally { c.chiudi(); }
  /* TCP simultaneous open: a probe whose own local address:port equals the asked one connects to itself with nobody listening */
  const conPorte = (locale, porta, remoto) => () => { const p = presaFinta({ distrutte: 0 }); Object.assign(p, { localAddress: locale, localPort: porta, remoteAddress: remoto }); setImmediate(() => p.emit('connect')); return p; };
  assert.equal(await sondaTcp('127.0.0.1', 3801, { attesaMs: 30, connetti: conPorte('127.0.0.1', 3801, '127.0.0.1') }), null, 'a self-connect is not an answer');
  assert.equal(await sondaTcp('::1', 3801, { attesaMs: 30, connetti: conPorte('::1', 3801, '::1') }), null, 'nor on ::1');
  assert.equal(await sondaTcp('127.0.0.1', 3801, { attesaMs: 30, connetti: conPorte('127.0.0.1', 50001, '127.0.0.1') }), true, 'another local port: accepted');
  /* the budget timer of the ask is cleared on an answer (Node: process.getActiveResourcesInfo() lists every live Timeout) */
  const timer = () => process.getActiveResourcesInfo().filter((x) => x === 'Timeout').length;
  const prima = timer();
  assert.equal(await sondaTcp('127.0.0.1', 3802, { attesaMs: 600_000, connetti: conPorte('127.0.0.1', 50002, '127.0.0.1') }), true);
  assert.ok(timer() <= prima, `no 10-minute timer left behind: ${prima} before, ${timer()} after`);
});

/*
 * Round 5 (07/11, written source: the round-4 review scratchpad p0504g4-revisione.md, findings 1-3, and its pure replay
 *   rev-p0504g4/alterna.mjs). http-app keeps ONE sampler for every session (`campionatoreRisorse ??=`); the round-4 sampler kept the
 *   answers and ages only of the pids of the CURRENT request, so every read by another session wiped them and the first 64 rows were
 *   asked again each time: a server after more than 64 ghost rows of its own pid never showed (alterna.log: «due-sessioni N=200 …
 *   first shown at sample null»; «una-sessione N=3000 … null» in 12 samples). Now the memory follows the WHOLE table, and inside a
 *   pid the lower port is asked first (measured on real rows: p0504g5/segnali.log, the server's port was the lowest of its pid in
 *   5 of 5 pids, 0 ascending steps in a table of 2572 rows).
 */
const TETTO_MEMORIA_SONDE = risorseProcessi.TETTO_MEMORIA_SONDE;

test('P05-18 — one sampler, two sessions in turn: the answers of one survive the reads of the other; a server after 3000 ghosts of its pid shows at once', async () => {
  /* (a) the shape of rev-p0504g4/alterna.mjs: 200 ghosts of pid A (each beside its connection to 50203), A's server LAST, here on a
     port above every ghost (it listened after its clients took theirs), so only kept answers bring it in: ceil(201 / 64) = 4 samples */
  const A = 15984, B = 22304;
  const fantasmi = [];
  for (let p = 52000; p < 52200; p++) fantasmi.push([A, '0.0.0.0', p, '0.0.0.0', 0, 0], [A, '127.0.0.1', p, '127.0.0.1', 50203, 7]);
  const righe = [...fantasmi, [A, '0.0.0.0', 52200, '0.0.0.0', 0, 0], [A, '127.0.0.1', 52200, '127.0.0.1', 61001, 5], [B, '0.0.0.0', 50300, '0.0.0.0', 0, 0]];
  const processi = JSON.stringify([[A, 1, 1, 1, 1000], [B, 1, 1, 1, 1000]]);
  let chiesti = [];
  const sondaPorta = async (indirizzo, porta) => { chiesti.push(porta); return porta === 52200 || porta === 50300; };
  const c = creaCampionatoreRisorse({ piattaforma: 'win32', sondaPorta, spawnFn: lettoreFinto(() => [processi, `PORTE ${JSON.stringify(righe)}`], []) });
  const perA = [];
  let primo = null;
  try {
    for (let i = 1; i <= 6; i++) {
      chiesti = [];
      const m = await c.misura({ pid: [A] });
      perA.push(chiesti.length);
      assert.ok(chiesti.length <= TETTO_SONDE, `session A, sample ${i}: ${chiesti.length} asks`);
      if (primo === null && (m.perPid.get(A).porte ?? []).includes(52200)) primo = i;
      assert.equal((m.perPid.get(A).porte ?? []).some((p) => p !== 52200), false, 'no ghost of A shows');
      chiesti = [];
      const b = await c.misura({ pid: [B] });
      assert.deepEqual(b.perPid.get(B).porte, [50300], `session B, sample ${i}`);
      assert.ok(chiesti.every((p) => p === 50300), `session B asks only its own rows: ${chiesti.slice(0, 5)}`);
    }
  } finally { c.chiudi(); }
  assert.ok(primo !== null && primo <= 4, `A's server shows within 4 samples of A with B reading in between: first at ${primo}, asks ${perA}`);
  assert.deepEqual(perA, [64, 64, 64, 9, 0, 0], 'every row of A asked once: the reads of B wipe nothing');
  /* (b) 3000 ghosts and the server in the SAME pid, one session, the rows in the real table order (ports descending, the server's
     lower port last): the server is asked in the first sample, within the cap */
  const tremila = [];
  for (let p = 54999; p >= 52000; p--) tremila.push([A, '0.0.0.0', p, '0.0.0.0', 0, 0], [A, '127.0.0.1', p, '127.0.0.1', 50203, 7]);
  const righe2 = [...tremila, [A, '0.0.0.0', 50207, '0.0.0.0', 0, 0]];
  chiesti = [];
  const c2 = creaCampionatoreRisorse({ piattaforma: 'win32', sondaPorta: async (indirizzo, porta) => { chiesti.push(porta); return porta === 50207; },
    spawnFn: lettoreFinto(() => [processi, `PORTE ${JSON.stringify(righe2)}`], []) });
  try {
    const m = await c2.misura({ pid: [A] });
    assert.ok(chiesti.length <= TETTO_SONDE, `asks ${chiesti.length} <= ${TETTO_SONDE}`);
    assert.deepEqual(m.perPid.get(A).porte, [50207], `the server shows in sample 1 after 3000 ghosts of its own pid: asked ${chiesti.slice(0, 3)}…`);
  } finally { c2.chiudi(); }
});

test('P05-19 — real rows in the real descending order: inside a pid the lower port is asked first, so a dev proxy server is asked in the first sample', async () => {
  /* copied from p0504g5/cattura.json (real Get-NetTCPConnection rows, 07/11): pid 28768 is a proxy listening on 0.0.0.0:18080 with
     400 connections out to another local server. Its remote-port-0 rows run in table order 61891, 61890, … (all State 0 for the first
     66, each [28768,"0.0.0.0",<port>,"0.0.0.0",0,0]) and its server row [28768,"0.0.0.0",18080,"0.0.0.0",0,0] comes LAST, 400 rows on.
     The first 66 ghosts and the server are kept, in order; the 334 rows in between and the connection rows are left out (they do not
     change what is asked). */
  const righe = [];
  for (let p = 61891; p >= 61826; p--) righe.push([28768, '0.0.0.0', p, '0.0.0.0', 0, 0]);
  righe.push([28768, '0.0.0.0', 18080, '0.0.0.0', 0, 0]);
  const processi = JSON.stringify([[28768, 1, 1, 1, 1000]]);
  const chiesti = [];
  const c = creaCampionatoreRisorse({ piattaforma: 'win32', sondaPorta: async (indirizzo, porta) => { chiesti.push(porta); return porta === 18080; },
    spawnFn: lettoreFinto(() => [processi, `PORTE ${JSON.stringify(righe)}`], []) });
  try {
    const m = await c.misura({ pid: [28768] });
    assert.equal(chiesti[0], 18080, `the server's low port is the first ask: ${chiesti.slice(0, 4)}`);
    assert.deepEqual(m.perPid.get(28768).porte, [18080], 'it shows in the first sample');
    assert.equal(chiesti.length, TETTO_SONDE);
    assert.deepEqual(chiesti.slice(1, 4), [61826, 61827, 61828], 'then the ghosts from the lowest port up');
  } finally { c.chiudi(); }
  /* at equal turn, age and port (one port on :: and on 0.0.0.0), row order decides: the row listed first is asked first */
  for (const [righe2, attesi] of [
    [[[50, '::', 3900, '::', 0, 0], [50, '0.0.0.0', 3900, '0.0.0.0', 0, 0]], ['::1', '127.0.0.1']],
    [[[50, '0.0.0.0', 3900, '0.0.0.0', 0, 0], [50, '::', 3900, '::', 0, 0]], ['127.0.0.1', '::1']],
  ]) {
    const dove = [];
    const c2 = creaCampionatoreRisorse({ piattaforma: 'win32', tettoSonde: 1, sondaPorta: async (indirizzo) => { dove.push(indirizzo); return false; },
      spawnFn: lettoreFinto(() => [JSON.stringify([[50, 1, 1, 1, 1000]]), `PORTE ${JSON.stringify(righe2)}`], []) });
    try {
      await c2.misura({ pid: [50] });
      await c2.misura({ pid: [50] });
      assert.deepEqual(dove, attesi, `row order: ${JSON.stringify(righe2)}`);
    } finally { c2.chiudi(); }
  }
  /* the lower port orders rows INSIDE a pid only: the pid turns come first, so 64 low ghost ports of one pid never crowd out the
     higher port of another pid's server (round-5 curator mutant G4) */
  const fitti = [];
  for (let p = 3000; p < 3064; p++) fitti.push([70, '0.0.0.0', p, '0.0.0.0', 0, 0]);
  const chiesti3 = [];
  const c3 = creaCampionatoreRisorse({ piattaforma: 'win32', sondaPorta: async (indirizzo, porta) => { chiesti3.push(porta); return porta === 9000; },
    spawnFn: lettoreFinto(() => [JSON.stringify([[70, 1, 1, 1, 1000], [71, 1, 1, 1, 1000]]), `PORTE ${JSON.stringify([...fitti, [71, '0.0.0.0', 9000, '0.0.0.0', 0, 0]])}`], []) });
  try {
    const m = await c3.misura({ pid: [70, 71] });
    assert.deepEqual(chiesti3.slice(0, 2).sort((a, b) => a - b), [3000, 9000], `one row of each pid first: ${chiesti3.slice(0, 3)}`);
    assert.deepEqual(m.perPid.get(71).porte, [9000], 'the other pid\'s server shows in the first sample');
    assert.equal(chiesti3.length, TETTO_SONDE);
  } finally { c3.chiudi(); }
});

test('P05-20 — a cap of 0 asks nothing; the kept answers are bounded (rows outside the asked trees forgotten first) and forgotten after a pause', async () => {
  const processi = JSON.stringify([[60, 1, 1, 1, 1000], [61, 1, 1, 1, 1000], [62, 1, 1, 1, 1000]]);
  const righe = [[60, '::', 4000, '::', 0, 0], [60, '0.0.0.0', 4001, '0.0.0.0', 0, 2], [61, '0.0.0.0', 4100, '0.0.0.0', 0, 0], [61, '0.0.0.0', 4101, '0.0.0.0', 0, 0],
    [62, '0.0.0.0', 4200, '0.0.0.0', 0, 0], [62, '0.0.0.0', 4201, '0.0.0.0', 0, 0]];
  let chiesti = [];
  const sondaPorta = async (indirizzo, porta) => { chiesti.push(porta); return porta === 4000; };
  const lettore = () => lettoreFinto(() => [processi, `PORTE ${JSON.stringify(righe)}`], []);
  const zero = creaCampionatoreRisorse({ piattaforma: 'win32', tettoSonde: 0, sondaPorta, spawnFn: lettore() });
  try {
    assert.deepEqual((await zero.misura({ pid: [60] })).perPid.get(60).porte, [4001], 'cap 0: the Listen row shows, the State-0 one stays hidden');
    assert.deepEqual(chiesti, [], 'cap 0: nothing asked');
  } finally { zero.chiudi(); }
  assert.ok(TETTO_MEMORIA_SONDE >= 16_384, `the default bound keeps a whole real table: ${TETTO_MEMORIA_SONDE}`);
  /* bound 3: two sessions of two rows each. Over the bound the rows outside the asked trees go first, the newest and the higher
     port first (the reverse of the asking order): each session asks again exactly one row of its own */
  const c = creaCampionatoreRisorse({ piattaforma: 'win32', tettoMemoria: 3, sondaPorta, spawnFn: lettore() });
  try {
    chiesti = []; await c.misura({ pid: [61] }); assert.deepEqual(chiesti, [4100, 4101]);
    chiesti = []; await c.misura({ pid: [62] }); assert.deepEqual(chiesti, [4200, 4201]);
    chiesti = []; await c.misura({ pid: [61] }); assert.deepEqual(chiesti, [4101], 'the higher port of 61 was forgotten to stay within 3');
    chiesti = []; await c.misura({ pid: [62] }); assert.deepEqual(chiesti, [4201], 'and then the higher port of 62');
    /* 61 now holds 4100 (first seen in sample 1) and 4101 (sample 3): the NEWER one went, so 61 asks 4101 again, never 4100 */
    chiesti = []; await c.misura({ pid: [61] }); assert.deepEqual(chiesti, [4101], 'the newest row outside the asked tree goes first');
  } finally { c.chiudi(); }
  /* one tree over the bound: its own newest, higher-port row goes, and when asked it keeps the place of a new row (this sample's
     age), never ahead of the kept older rows (round-5 curator mutant G22): bound 2, cap 1, three rows of one sample */
  const tre = [[63, '0.0.0.0', 4302, '0.0.0.0', 0, 0], [63, '0.0.0.0', 4301, '0.0.0.0', 0, 0], [63, '0.0.0.0', 4300, '0.0.0.0', 0, 0]];
  const chiesti4 = [];
  const e = creaCampionatoreRisorse({ piattaforma: 'win32', tettoMemoria: 2, tettoSonde: 1, sondaPorta: async (indirizzo, porta) => { chiesti4.push(porta); return false; },
    spawnFn: lettoreFinto(() => [JSON.stringify([[63, 1, 1, 1, 1000]]), `PORTE ${JSON.stringify(tre)}`], []) });
  try {
    await e.misura({ pid: [63] });
    assert.deepEqual(chiesti4, [4300], 'the dropped row 4302 does not jump ahead of 4300');
  } finally { e.chiudi(); }
  /* a pause longer than dimenticaDopoMs without reads forgets every answer: a row that went and came back unseen is asked again */
  let adesso = 1_000_000;
  const d = creaCampionatoreRisorse({ piattaforma: 'win32', ora: () => adesso, dimenticaDopoMs: 30_000, sondaPorta, spawnFn: lettore() });
  try {
    chiesti = []; await d.misura({ pid: [61] }); assert.deepEqual(chiesti, [4100, 4101]);
    adesso += 30_000;
    chiesti = []; await d.misura({ pid: [61] }); assert.deepEqual(chiesti, [], 'within dimenticaDopoMs the answers are kept');
    adesso += 30_001;
    chiesti = []; await d.misura({ pid: [61] }); assert.deepEqual(chiesti, [4100, 4101], 'after a longer pause they are asked again');
  } finally { d.chiudi(); }
});

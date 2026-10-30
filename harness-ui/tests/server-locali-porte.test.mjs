/*
 * ⭐ Owner 27/10/2026, server locali — le PORTE IN ASCOLTO dei processi della conversazione e la prova che rispondono
 *   (`src/server-locali.mjs`, seconda parte). Le funzioni pure su righe finte; poi un caso VERO su Windows: un server HTTP figlio di
 *   una shell, la cui porta deve comparire nell'albero di QUELLA shell, e in nessun altro. Ogni regola ha il suo verso contrario.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'; // BC09: il pulitore condiviso, non rmSync nudo

import { creaLettorePorte, creaSorveglianteServerLocali, lettorePorteDisponibile, pidDellAlbero, porteLinuxPerRadice, porteWindowsPerRadice, porteWslPerMarcatore, rispondeLaPorta } from '../src/server-locali.mjs';
import { tabellaDaRighe } from '../src/risorse-processi.mjs';

test('SL-PORTE-01 l\'albero: figli e nipoti sì, un PID riusato (nato prima del padre) no, una radice sparita è vuota', () => {
  const t = tabellaDaRighe([[10, 1, 0, 0, 1000], [11, 10, 0, 0, 1100], [12, 11, 0, 0, 1200], [13, 10, 0, 0, 900], [20, 1, 0, 0, 1000]]);
  assert.deepEqual([...pidDellAlbero(t, 10)].sort(), [10, 11, 12]);
  assert.deepEqual([...pidDellAlbero(t, 99)], []);
});

test('SL-PORTE-02 Windows: le porte dell\'albero di ogni radice, e null per una radice che non c\'è più', () => {
  const dati = { p: [[10, 1, 0, 0, 1], [11, 10, 0, 0, 2], [30, 1, 0, 0, 1]], l: [[5173, 11], [5173, 11], [8080, 30], [70000, 11], [24678, 11]] };
  const esito = porteWindowsPerRadice(dati, [10, 30, 77]);
  assert.deepEqual(esito.get(10), [5173, 24678], 'la porta del nipote, una volta sola, senza quelle impossibili');
  assert.deepEqual(esito.get(30), [8080]);
  assert.equal(esito.get(77), null);
});

test('SL-PORTE-03 WSL: solo i socket in ascolto dei processi marcati, porta esadecimale', () => {
  const righe = ['S cmd-a 4711', 'S cmd-a 4712', 'S cmd-b 5000', 'L 1435 4711', 'L 1F90 9999', 'L 0050 5000', 'L zz 1', 'S cattivo! 7'];
  const esito = porteWslPerMarcatore(righe);
  assert.deepEqual(esito.get('cmd-a'), [5173]);
  assert.deepEqual(esito.get('cmd-b'), [80]);
  assert.equal(esito.has('cattivo!'), false);
  assert.equal([...esito.values()].flat().includes(8080), false, 'una porta in ascolto di un processo NON marcato non è della conversazione');
});

/* Linux (29/10/2026): un /proc finto. 10 → 11 (nipote 12) ascoltano; 13 ha un PID riusato (nato prima del padre); 30 è un'altra
   radice; in tcp una riga ESTABLISHED (01) e una con inode 0 (socket orfano), in tcp6 un ascolto IPv6. */
function procLinux({ senzaTcp = false } = {}) {
  const intestazione = '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n';
  const file = new Map([
    ['/proc/10/stat', '10 (bash) S 1 10 10 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 1000 0 0'],
    ['/proc/11/stat', '11 (node (vite)) S 10 10 10 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 1100 0 0'],
    ['/proc/12/stat', '12 (esbuild) S 11 10 10 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 1200 0 0'],
    ['/proc/13/stat', '13 (vecchio) S 10 13 13 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 900 0 0'],
    ['/proc/30/stat', '30 (python3) S 1 30 30 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 1000 0 0'],
  ]);
  if (!senzaTcp) {
    file.set('/proc/net/tcp', `${intestazione}   0: 0100007F:1435 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 111 1 0\n`
      + '   1: 0100007F:C350 0100007F:1435 01 00000000:00000000 00:00000000 00000000  1000        0 112 1 0\n'
      + '   2: 00000000:0050 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 0 1 0\n'
      + '   3: 00000000:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 333 1 0\n'
      + '   4: 00000000:0BB8 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 444 1 0\n');
    file.set('/proc/net/tcp6', `${intestazione}   0: 00000000000000000000000001000000:6060 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 222 1 0\n`);
  }
  const fd = new Map([['/proc/10/fd', ['0']], ['/proc/11/fd', ['20', '21', '22']], ['/proc/12/fd', ['5']], ['/proc/13/fd', ['3']], ['/proc/30/fd', ['4']]]);
  const link = new Map([['/proc/10/fd/0', '/dev/pts/0'], ['/proc/11/fd/20', 'socket:[111]'], ['/proc/11/fd/21', 'socket:[112]'], ['/proc/11/fd/22', 'socket:[111]'],
    ['/proc/12/fd/5', 'socket:[222]'], ['/proc/13/fd/3', 'socket:[444]'], ['/proc/30/fd/4', 'socket:[333]']]);
  const manca = (p) => Object.assign(new Error(`ENOENT ${p}`), { code: 'ENOENT' });
  return {
    readFileSync: (p) => { if (!file.has(p)) throw manca(p); return file.get(p); },
    readdirSync: (p) => { if (p === '/proc') return ['1', '10', '11', '12', '13', '30', 'net', 'self', 'meminfo']; if (!fd.has(p)) throw manca(p); return fd.get(p); },
    readlinkSync: (p) => { if (!link.has(p)) throw manca(p); return link.get(p); },
  };
}

test('SL-PORTE-06 Linux: le porte in ascolto dell\'albero (figli e nipoti, IPv4 e IPv6), mai una connessione, un PID riusato o un\'altra radice', () => {
  const esito = porteLinuxPerRadice(procLinux(), [10, 30, 77]);
  assert.deepEqual(esito.get(10), [5173, 24672], 'la 5173 del figlio (una volta sola) e la 24672 IPv6 del nipote; non la 3000 del PID riusato');
  assert.deepEqual(esito.get(30), [8080]);
  assert.equal(esito.get(77), null, 'radice finita');
});

test('SL-PORTE-07 Linux al contrario: /proc/net/tcp illeggibile (Android) ⇒ si lancia, e il lettore non inventa porte', async () => {
  assert.throws(() => porteLinuxPerRadice(procLinux({ senzaTcp: true }), [10]), /not readable/u);
  const lettore = creaLettorePorte({ piattaforma: 'linux', fsProc: procLinux({ senzaTcp: true }) });
  const { perPid } = await lettore.leggi({ pid: [10] });
  assert.equal(perPid.has(10), false, 'nessuna risposta, non «nessuna porta»');
  const vero = await creaLettorePorte({ piattaforma: 'linux', fsProc: procLinux() }).leggi({ pid: [10] });
  assert.deepEqual(vero.perPid.get(10), [5173, 24672]);
  const android = await creaLettorePorte({ piattaforma: 'android', fsProc: procLinux() }).leggi({ pid: [10] });
  assert.equal(android.perPid.has(10), false, 'Android non usa /proc/net/tcp');
});

test('SL-PORTE-09 di serie il sorvegliante pretende la porta proprio dove il lettore esiste (qui: questa macchina)', async () => {
  const s = creaSorveglianteServerLocali({ lettorePorte: { leggi: async () => ({ perPid: new Map(), perMarcatore: new Map() }) }, sonda: async () => 'http://127.0.0.1:5173' });
  s.dallUscita('conv-A', { toolCallId: 'tc-1' }, { indirizzi: [{ host: 'localhost', porta: 5173 }] });
  await new Promise((r) => { setTimeout(r, 20); });
  assert.equal(s.portaDellaSessione('conv-A', 5173), !lettorePorteDisponibile(), 'un indirizzo solo stampato basta solo dove il lettore manca');
});

test('SL-PORTE-08 la porta si pretende solo dove il lettore esiste davvero', () => {
  assert.equal(lettorePorteDisponibile({ piattaforma: 'win32' }), true);
  assert.equal(lettorePorteDisponibile({ piattaforma: 'linux', readFileSync: procLinux().readFileSync }), true);
  assert.equal(lettorePorteDisponibile({ piattaforma: 'linux', readFileSync: procLinux({ senzaTcp: true }).readFileSync }), false, 'contenitore blindato');
  assert.equal(lettorePorteDisponibile({ piattaforma: 'android', readFileSync: procLinux().readFileSync }), false);
  assert.equal(lettorePorteDisponibile({ piattaforma: 'darwin' }), false);
});

test('SL-PORTE-04 la prova di risposta: un server vero risponde (anche 404), una porta chiusa no', async (t) => {
  const server = createServer((_q, r) => { r.statusCode = 404; r.end('no'); });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => server.close());
  const porta = server.address().port;
  assert.equal(await rispondeLaPorta(porta), `http://127.0.0.1:${porta}`);
  server.close();
  await new Promise((ok) => setTimeout(ok, 50));
  assert.equal(await rispondeLaPorta(porta, { attesaMs: 500 }), null);
  assert.equal(await rispondeLaPorta(0), null);
});

test('SL-PORTE-05 VERO su Windows: la porta di un server figlio di una shell sta nell\'albero di quella shell, e di nessun altro', { skip: process.platform !== 'win32' }, async (t) => {
  /* il server in un file suo: la riga di comando di cmd non deve portare virgolette annidate */
  const cartella = mkdtempSync(join(tmpdir(), 'talos-sl-porte-'));
  const file = join(cartella, 'server.cjs');
  writeFileSync(file, "const s=require('http').createServer((q,r)=>r.end('ok'));s.listen(0,'127.0.0.1',()=>console.log('PORTA '+s.address().port));");
  const shell = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', process.execPath, file], { windowsHide: true });
  t.after(async () => {
    await new Promise((ok) => { const k = spawn('taskkill', ['/PID', String(shell.pid), '/T', '/F'], { windowsHide: true }); k.on('exit', ok); k.on('error', ok); });
    rimuoviCartellaDiProva(cartella);
  });
  const porta = await new Promise((ok, ko) => {
    let uscita = '';
    shell.stdout.on('data', (p) => { uscita += p; const m = /PORTA (\d+)/u.exec(uscita); if (m) ok(Number(m[1])); });
    shell.on('exit', () => ko(new Error(`la shell è uscita: ${uscita}`)));
    setTimeout(() => ko(new Error('nessuna porta in 15 s')), 15_000).unref();
  });
  /* al contrario: una SORELLA (un altro comando della stessa conversazione, senza server). Non il processo della prova: la shell è sua
     figlia, quindi la porta sta giustamente anche nel suo albero (la prima stesura lo dava per «altro albero», ed era la prova sbagliata) */
  const sorella = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)'], { windowsHide: true });
  t.after(() => { try { sorella.kill(); } catch { /* già finita */ } });
  const lettore = creaLettorePorte({ spawnFn: spawn });
  t.after(() => lettore.chiudi());
  const { perPid } = await lettore.leggi({ pid: [shell.pid, sorella.pid] });
  t.diagnostic(JSON.stringify({ porta, shell: perPid.get(shell.pid), sorella: perPid.get(sorella.pid) }));
  assert.ok(perPid.get(shell.pid)?.includes(porta), `la porta ${porta} non è nell'albero della shell: ${JSON.stringify(perPid.get(shell.pid))}`);
  assert.deepEqual(perPid.get(sorella.pid), [], 'al contrario: la sorella è viva e non ha porte');
  assert.equal(await rispondeLaPorta(porta), `http://127.0.0.1:${porta}`);
});

/*
 * Il sensore della mano della persona (cura «finestra bloccata», punto 3). Nessun PowerShell vero: un figlio finto che risponde come
 * quello vero (la riga «pronto», poi una riga con l'inattività in millisecondi per ogni domanda).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { creaSensoreInput, ultimoInputDaRiga } from '../src/computer-use/input-persona.mjs';

function figlioFinto({ inattivo = () => '1234', pronto = true, muto = false } = {}) {
  const lanci = [];
  const spawn = (cmd, args, opzioni) => {
    const f = new EventEmitter();
    f.stdin = new PassThrough(); f.stdout = new PassThrough(); f.uccisi = 0;
    f.kill = () => { f.uccisi += 1; f.emit('exit', null, 'SIGTERM'); };
    lanci.push({ cmd, args, opzioni, f });
    if (pronto) setImmediate(() => f.stdout.write('pronto\r\n'));
    f.stdin.on('data', (b) => { if (!muto) for (const _ of String(b).split('\n').filter(Boolean)) f.stdout.write(`${inattivo()}\r\n`); });
    return f;
  };
  return { spawn, lanci };
}

test('IP-01: la riga del figlio diventa l\'ora dell\'ultimo input; righe storte ⇒ null', () => {
  assert.equal(ultimoInputDaRiga('1500', 10_000), 8_500);
  assert.equal(ultimoInputDaRiga(' 0 ', 10_000), 10_000);
  for (const storta of ['-1', '', 'abc', '12.5', '99999999999', null, undefined]) assert.equal(ultimoInputDaRiga(storta, 10_000), null, String(storta));
  assert.equal(ultimoInputDaRiga('4294967295', 5e9), 5e9 - 4294967295, 'il massimo dei 32 bit vale');
  assert.equal(ultimoInputDaRiga('4294967296', 5e9), null, 'oltre i 32 bit no');
  assert.equal(ultimoInputDaRiga('10', Number.NaN), null);
});

test('IP-02: un solo figlio nascosto, ambiente ripulito, una riga per domanda', async () => {
  const f = figlioFinto({ inattivo: () => '250' });
  const s = creaSensoreInput({ spawn: f.spawn, piattaforma: 'win32', adesso: () => 1_000_000, ambiente: { PATH: 'x', OPENROUTER_API_KEY: 'segreta' } });
  assert.equal(await s.ultimoInput(), 999_750);
  assert.equal(await s.ultimoInput(), 999_750);
  assert.equal(f.lanci.length, 1, 'un figlio solo per molte domande');
  const { cmd, args, opzioni } = f.lanci[0];
  // revisore A della 0.2.3 (ROSSO, sicurezza nuova): mai il nome cercato nel PATH, sempre il percorso intero di System32 (senza
  // SystemRoot nell'ambiente vale quello del server; Windows non distingue le maiuscole: «C:\WINDOWS» è la stessa cartella)
  assert.equal(cmd.toLowerCase(), 'c:\\windows\\system32\\windowspowershell\\v1.0\\powershell.exe');
  assert.ok(args.includes('-NoProfile') && args.includes('-NonInteractive'));
  assert.match(args.at(-1), /GetLastInputInfo/u);
  assert.equal(opzioni.windowsHide, true);
  assert.equal(opzioni.env.OPENROUTER_API_KEY, undefined, 'mai le chiavi dei fornitori al figlio');
  assert.equal(opzioni.env.PATH, 'x');
  s.chiudi();
  assert.equal(f.lanci[0].f.uccisi, 1);
});

test('IP-03: fuori da Windows nessun figlio e nessuna mano', async () => {
  const f = figlioFinto();
  const s = creaSensoreInput({ spawn: f.spawn, piattaforma: 'linux' });
  assert.equal(await s.ultimoInput(), null);
  assert.equal(f.lanci.length, 0);
});

test('IP-04: un figlio che non risponde in tempo dà null e si spegne; la domanda dopo lo riaccende', async () => {
  let muto = true;
  const lanci = [];
  const spawn = (cmd, args, opzioni) => {
    const f = new EventEmitter();
    f.stdin = new PassThrough(); f.stdout = new PassThrough(); f.uccisi = 0;
    f.kill = () => { f.uccisi += 1; };
    lanci.push(f);
    setImmediate(() => f.stdout.write('pronto\n'));
    f.stdin.on('data', () => { if (!muto) f.stdout.write('5\n'); });
    return f;
  };
  const s = creaSensoreInput({ spawn, piattaforma: 'win32', adesso: () => 100 });
  assert.equal(await s.ultimoInput(), null);
  assert.equal(lanci[0].uccisi, 1, 'il figlio muto si spegne: una riga in ritardo non va alla domanda dopo');
  muto = false;
  assert.equal(await s.ultimoInput(), 95);
  assert.equal(lanci.length, 2);
  s.chiudi();
});

test('IP-06: dal figlio vero, un\'inattività oltre i 32 bit (impossibile) dà null', async () => {
  const f = figlioFinto({ inattivo: () => '4294967296' });
  const s = creaSensoreInput({ spawn: f.spawn, piattaforma: 'win32', adesso: () => 5e9 });
  assert.equal(await s.ultimoInput(), null);
  s.chiudi();
});

test('IP-07: una riga arrivata IN RITARDO non va alla domanda dopo', async () => {
  let domande = 0;
  const spawn = () => {
    const f = new EventEmitter();
    f.stdin = new PassThrough(); f.stdout = new PassThrough(); f.kill = () => {};
    setImmediate(() => f.stdout.write('pronto\n'));
    // la prima risposta arriva a 1,5 s (scaduta a 1 s); la seconda dopo 0,8 s: la riga in ritardo cade MENTRE la seconda aspetta
    f.stdin.on('data', () => { domande += 1; const n = domande; setTimeout(() => f.stdout.write(n === 1 ? '111\n' : '5\n'), n === 1 ? 1500 : 800); });
    return f;
  };
  const s = creaSensoreInput({ spawn, piattaforma: 'win32', adesso: () => 100 });
  assert.equal(await s.ultimoInput(), null, 'la prima scade');
  assert.equal(await s.ultimoInput(), 95, 'la seconda ha la sua riga, non quella in ritardo');
  s.chiudi();
});

test('IP-10: dopo chiudi(), una riga del figlio vecchio non risponde alla domanda del figlio nuovo', async () => {
  const figli = [];
  const spawn = () => {
    const f = new EventEmitter();
    f.stdin = new PassThrough(); f.stdout = new PassThrough(); f.kill = () => {};
    figli.push(f);
    setImmediate(() => f.stdout.write('pronto\n'));
    const mio = figli.length;
    f.stdin.on('data', () => { if (mio === 1) f.stdout.write('7\n'); else setTimeout(() => f.stdout.write('5\n'), 300); });
    return f;
  };
  const s = creaSensoreInput({ spawn, piattaforma: 'win32', adesso: () => 100 });
  assert.equal(await s.ultimoInput(), 93);
  s.chiudi();
  const seconda = s.ultimoInput();
  await new Promise((ok) => { setTimeout(ok, 100); });
  figli[0].stdout.write('40\n'); // il figlio spento parla ancora (riga già nel tubo)
  assert.equal(await seconda, 95);
  assert.equal(figli.length, 2);
  s.chiudi();
});

test('IP-08: l\'ambiente del figlio è quello ripulito dell\'aiutante (nessuna telemetria, nessuna chiave)', async () => {
  const f = figlioFinto();
  const s = creaSensoreInput({ spawn: f.spawn, piattaforma: 'win32', ambiente: { PATH: 'x', SystemRoot: 'E:\\W', ANTHROPIC_API_KEY: 'segreta', GEMINI_API_KEY: 'segreta' } });
  await s.ultimoInput();
  assert.equal(f.lanci[0].cmd, 'E:\\W\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'il SystemRoot dell\'ambiente dato, non quello del server');
  const env = f.lanci[0].opzioni.env;
  assert.equal(env.DO_NOT_TRACK, '1');
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.GEMINI_API_KEY, undefined);
  s.chiudi();
});

/*
 * Revisore A della 0.2.3 (ROSSO, sicurezza nuova; `C:/T/rev-cuf-A-lavoro/prova-piantato.mjs`, `haGiratoIlPiantato:true`): il sensore
 * lanciava `powershell.exe` per NOME, e Windows lo cerca nel PATH del server (documentazione di Node, `child_process`: su Windows la
 * ricerca usa il PATH). Un `powershell.exe` messo in una cartella prima di System32 girava a ogni compito e rispondeva «persona ferma»:
 * lo stop alla mano non scattava mai. Qui `spawn` fa la ricerca di Windows (nome nudo ⇒ la prima cartella del PATH, dove sta il
 * piantato; percorso intero ⇒ quello): il piantato non deve partire mai, nemmeno con un `SystemRoot` storto (relativo, di rete, vuoto),
 * come per gli altri lanci di PowerShell del server (`taskkill-di-sistema.mjs`).
 */
test('IP-11: un powershell.exe piantato prima di System32 nel PATH non parte mai; parte quello di sistema, per percorso intero', async () => {
  const PIANTATO = 'C:\\Piantato';
  const VERO = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
  for (const SystemRoot of ['C:\\Windows', 'Windows', '\\\\server\\share', '', undefined]) {
    const partiti = [];
    const f = figlioFinto();
    const spawn = (cmd, args, opzioni) => {
      const cartelle = String(opzioni?.env?.PATH ?? '').split(';').filter(Boolean);
      partiti.push(/^[A-Za-z]:\\/u.test(cmd) ? cmd : `${cartelle[0]}\\${cmd}`);
      return f.spawn(cmd, args, opzioni);
    };
    const s = creaSensoreInput({ spawn, piattaforma: 'win32', adesso: () => 10_000,
      ambiente: { PATH: `${PIANTATO};C:\\Windows\\System32;C:\\Windows`, ...(SystemRoot === undefined ? {} : { SystemRoot }) } });
    assert.equal(await s.ultimoInput(), 8_766, String(SystemRoot));
    s.chiudi();
    assert.deepEqual(partiti.map((p) => p.toLowerCase()), [VERO.toLowerCase()], `SystemRoot ${JSON.stringify(SystemRoot)}: partito ${partiti}`);
  }
  // un SystemRoot vero su un'altra lettera si rispetta
  const f = figlioFinto();
  const s = creaSensoreInput({ spawn: f.spawn, piattaforma: 'win32', ambiente: { PATH: PIANTATO, SystemRoot: 'D:\\Win' } });
  await s.ultimoInput();
  s.chiudi();
  assert.equal(f.lanci[0].cmd, 'D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
});

test('IP-09: su macOS nessun figlio parte', async () => {
  const f = figlioFinto();
  const s = creaSensoreInput({ spawn: f.spawn, piattaforma: 'darwin' });
  assert.equal(await s.ultimoInput(), null);
  assert.equal(f.lanci.length, 0);
});

test('IP-05: un figlio che non parte (errore o uscita prima di «pronto») dà null, senza lanciare', async () => {
  const spawnRotto = () => { throw new Error('ENOENT'); };
  assert.equal(await creaSensoreInput({ spawn: spawnRotto, piattaforma: 'win32' }).ultimoInput(), null);
  const spawnEsce = () => {
    const f = new EventEmitter(); f.stdin = new PassThrough(); f.stdout = new PassThrough(); f.kill = () => {};
    setImmediate(() => f.emit('exit', 1, null));
    return f;
  };
  assert.equal(await creaSensoreInput({ spawn: spawnEsce, piattaforma: 'win32' }).ultimoInput(), null);
});

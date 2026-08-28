import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BACKLOG_MASSIMO_BYTE,
  codificaFrame,
  creaRegistroTerminali,
  decodificaFrame,
  MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA,
  sceltaShell,
  TIPO_FRAME_CONTROLLO,
  TIPO_FRAME_DATI,
} from '../src/pty-terminal.mjs';

/**
 * ⭐ Stesso principio del resto della suite: mai una PTY VERA nei test
 * unitari (costerebbe un processo di sistema, non deterministico) — una
 * finta iniettabile che implementa esattamente la superficie di `IPty`
 * usata da questo modulo (`onData`/`onExit`/`write`/`resize`/`kill`),
 * verificata contro `node_modules/node-pty/typings/node-pty.d.ts` prima
 * di scrivere `pty-terminal.mjs`.
 */
function ptyFinta() {
  const ascoltatoriDati = [];
  const ascoltatoriUscita = [];
  const finta = {
    scritture: [],
    resizeChiamate: [],
    uccisa: false,
    onData(cb) { ascoltatoriDati.push(cb); return { dispose() {} }; },
    onExit(cb) { ascoltatoriUscita.push(cb); return { dispose() {} }; },
    write(dati) { finta.scritture.push(dati); },
    resize(cols, rows) { finta.resizeChiamate.push({ cols, rows }); },
    kill() { finta.uccisa = true; },
    _emettiDati(dati) { for (const cb of ascoltatoriDati) cb(dati); },
    _emettiUscita(exitCode, signal) { for (const cb of ascoltatoriUscita) cb({ exitCode, signal }); },
  };
  return finta;
}

function registroPerTest(overrides = {}) {
  const ptyCreate = [];
  const spawnPtyFn = overrides.spawnPtyFn ?? ((comando, argomenti, opzioni) => {
    const p = ptyFinta();
    ptyCreate.push({ comando, argomenti, opzioni, p });
    return p;
  });
  let ora = overrides.oraIniziale ?? 0;
  const clock = overrides.clock ?? (() => ora);
  const avanza = (ms) => { ora += ms; };
  const registro = creaRegistroTerminali({
    spawnPtyFn,
    sceltaShellFn: overrides.sceltaShellFn ?? (() => ({ comando: 'shell-finta', argomenti: ['-i'], enforcement: 'test' })),
    clock,
  });
  return { registro, ptyCreate, avanza };
}

test('⭐⭐⭐ apri: spawna con cwd/cols/rows richiesti, usando la shell scelta da sceltaShellFn', () => {
  const { registro, ptyCreate } = registroPerTest();
  registro.apri({ id: 'a', cartella: 'C:/progetto', cols: 100, rows: 30 });
  assert.equal(ptyCreate.length, 1);
  assert.equal(ptyCreate[0].comando, 'shell-finta');
  assert.deepEqual(ptyCreate[0].argomenti, ['-i']);
  assert.equal(ptyCreate[0].opzioni.cwd, 'C:/progetto');
  assert.equal(ptyCreate[0].opzioni.cols, 100);
  assert.equal(ptyCreate[0].opzioni.rows, 30);
});

test('⭐⭐⭐ apri due volte sullo STESSO id vivo: riaggancia, non spawna una seconda PTY', () => {
  const { registro, ptyCreate } = registroPerTest();
  const prima = registro.apri({ id: 'a', cartella: 'C:/x' });
  const seconda = registro.apri({ id: 'a', cartella: 'C:/x' });
  assert.equal(ptyCreate.length, 1, 'una sola spawn per lo stesso id ancora vivo');
  assert.equal(prima, seconda);
});

test('⭐⭐ i dati emessi dalla PTY arrivano a ogni ascoltatore registrato', () => {
  const { registro, ptyCreate } = registroPerTest();
  const voce = registro.apri({ id: 'a', cartella: 'C:/x' });
  const ricevuti = [];
  voce.ascoltatori.add((evento) => ricevuti.push(evento));
  ptyCreate[0].p._emettiDati('ciao');
  assert.deepEqual(ricevuti, [{ tipo: 'dati', dati: 'ciao' }]);
});

test('⭐⭐ il backlog resta sotto BACKLOG_MASSIMO_BYTE, scartando i pezzi più vecchi', () => {
  const { registro, ptyCreate } = registroPerTest();
  const voce = registro.apri({ id: 'a', cartella: 'C:/x' });
  const pezzo = 'x'.repeat(1000);
  const numeroPezzi = Math.ceil(BACKLOG_MASSIMO_BYTE / 1000) + 20;
  for (let i = 0; i < numeroPezzi; i += 1) ptyCreate[0].p._emettiDati(pezzo);
  assert.ok(voce.byteBacklog <= BACKLOG_MASSIMO_BYTE, `byteBacklog=${voce.byteBacklog} deve restare sotto il tetto`);
  assert.ok(voce.backlog.length < numeroPezzi, 'i pezzi più vecchi devono essere stati scartati');
});

test('⭐ scrivi/ridimensiona instradano alla PTY giusta', () => {
  const { registro, ptyCreate } = registroPerTest();
  registro.apri({ id: 'a', cartella: 'C:/x' });
  registro.scrivi('a', 'echo ciao\r');
  registro.ridimensiona('a', 120, 40);
  assert.deepEqual(ptyCreate[0].p.scritture, ['echo ciao\r']);
  assert.deepEqual(ptyCreate[0].p.resizeChiamate, [{ cols: 120, rows: 40 }]);
});

test('⛔⛔ AL CONTRARIO — ridimensiona con cols/rows non positivi non tocca la PTY', () => {
  const { registro, ptyCreate } = registroPerTest();
  registro.apri({ id: 'a', cartella: 'C:/x' });
  registro.ridimensiona('a', 0, 40);
  registro.ridimensiona('a', 10, -1);
  assert.deepEqual(ptyCreate[0].p.resizeChiamate, []);
});

test('⛔ scrivi/ridimensiona su un id ignoto non lanciano (mai un crash su un client tardivo)', () => {
  const { registro } = registroPerTest();
  assert.doesNotThrow(() => { registro.scrivi('fantasma', 'x'); registro.ridimensiona('fantasma', 1, 1); });
});

test('⭐⭐⭐ reap chiude solo le PTY disconnesse da PIÙ di MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA', () => {
  const { registro, ptyCreate, avanza } = registroPerTest();
  registro.apri({ id: 'vecchia', cartella: 'C:/x' });
  registro.apri({ id: 'recente', cartella: 'C:/x' });
  registro.segnaDisconnesso('vecchia');
  avanza((MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA * 60_000) - 1);
  registro.segnaDisconnesso('recente'); // disconnessa proprio ora, all'ultimo istante disponibile
  avanza(2); // 'vecchia' ora supera il tetto, 'recente' no
  registro.reap();
  assert.equal(ptyCreate[0].p.uccisa, true, 'la PTY vecchia va chiusa');
  assert.equal(ptyCreate[1].p.uccisa, false, 'la PTY recente resta viva');
  assert.equal(registro._terminali.has('vecchia'), false);
  assert.equal(registro._terminali.has('recente'), true);
});

test('⛔⛔⛔ AL CONTRARIO — reap non chiude MAI una PTY ancora connessa, anche con l\'orologio molto avanti', () => {
  const { registro, ptyCreate, avanza } = registroPerTest();
  registro.apri({ id: 'attaccata', cartella: 'C:/x' });
  avanza(MINUTI_PRIMA_DI_CHIUDERE_PTY_ORFANA * 60_000 * 100);
  registro.reap();
  assert.equal(ptyCreate[0].p.uccisa, false);
  assert.equal(registro._terminali.has('attaccata'), true);
});

test('⭐ chiudiForzato uccide e rimuove subito, a prescindere dal tempo', () => {
  const { registro, ptyCreate } = registroPerTest();
  registro.apri({ id: 'a', cartella: 'C:/x' });
  registro.chiudiForzato('a');
  assert.equal(ptyCreate[0].p.uccisa, true);
  assert.equal(registro._terminali.has('a'), false);
});

test('⭐⭐ apri dopo una uscita reale (handle.onExit) NON riaggancia una PTY morta: ne spawna una nuova', () => {
  const { registro, ptyCreate } = registroPerTest();
  registro.apri({ id: 'a', cartella: 'C:/x' });
  ptyCreate[0].p._emettiUscita(0, undefined);
  registro.apri({ id: 'a', cartella: 'C:/x' });
  assert.equal(ptyCreate.length, 2, 'una PTY uscita non è viva: una riapertura ne crea una nuova');
});

test('⭐⭐⭐ sceltaShell — win32 con Git Bash presente: enforcement git-bash, comando esatto', () => {
  const scelta = sceltaShell({
    platform: 'win32',
    existsFn: (percorso) => percorso === 'C:\\Program Files\\Git\\bin\\bash.exe',
    percorsiGitBash: ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'],
  });
  assert.deepEqual(scelta, { comando: 'C:\\Program Files\\Git\\bin\\bash.exe', argomenti: ['--login', '-i'], enforcement: 'git-bash' });
});

test('⛔⛔ AL CONTRARIO — sceltaShell su win32 senza Git Bash: fallback DICHIARATO, mai spacciato per bash', () => {
  const scelta = sceltaShell({ platform: 'win32', existsFn: () => false, percorsiGitBash: ['C:\\nope\\bash.exe'] });
  assert.equal(scelta.enforcement, 'cmd-fallback');
  assert.equal(scelta.comando, 'cmd.exe');
});

test('⭐ sceltaShell — POSIX usa $SHELL quando presente, altrimenti /bin/bash', () => {
  assert.equal(sceltaShell({ platform: 'linux', env: { SHELL: '/usr/bin/zsh' } }).comando, '/usr/bin/zsh');
  assert.equal(sceltaShell({ platform: 'linux', env: {} }).comando, '/bin/bash');
});

test('⭐⭐⭐ codificaFrame/decodificaFrame: round-trip per entrambi i tipi', () => {
  const frameDati = codificaFrame(TIPO_FRAME_DATI, 'echo ciao\r');
  const decDati = decodificaFrame(frameDati);
  assert.equal(decDati.tipo, TIPO_FRAME_DATI);
  assert.equal(decDati.payload.toString('utf8'), 'echo ciao\r');

  const frameCtrl = codificaFrame(TIPO_FRAME_CONTROLLO, JSON.stringify({ tipo: 'resize', cols: 80, rows: 24 }));
  const decCtrl = decodificaFrame(frameCtrl);
  assert.equal(decCtrl.tipo, TIPO_FRAME_CONTROLLO);
  assert.deepEqual(JSON.parse(decCtrl.payload.toString('utf8')), { tipo: 'resize', cols: 80, rows: 24 });
});

test('⛔⛔⛔ AL CONTRARIO — decodificaFrame su input vuoto o tipo ignoto torna null, mai un crash', () => {
  assert.equal(decodificaFrame(Buffer.alloc(0)), null);
  assert.equal(decodificaFrame(Buffer.from([99, 1, 2, 3])), null);
});

/*
 * Giudice v1790 (GIALLO della consegna della bolla, 13/11/2026): il cursore dell'aiutante si spegne (`mcp --no-overlay`) SOLO quando il segno di TALOS
 * (cursore stilizzato e bordo) è davvero acceso. Il segno è spento di serie (`desktop/bolla-finestra.mjs`, `bollaAccesa`: solo con `--talos-bolla`) e,
 * anche acceso, non si mostra su Windows prima della 2004, fuori da Windows, a protezione dalle catture rifiutata o a guscio chiuso
 * (`desktop/segno-finestra.mjs`). In ogni altro caso, la CLI e ogni processo senza guscio compresi, il cursore dell'aiutante resta, come nella 0.2.1.
 * La strada del segnale: il guscio lo mette nell'ambiente del server quando lo avvia (`desktop/runtime.mjs`, `creaAvvioFiglio`), lo cambia col canale
 * privato che c'è già (`desktop/child-bootstrap.mjs`, `{ tipo: 'segno' }`), e l'aiutante lo rilegge OGNI volta che parte (`aiutante-mcp.mjs`).
 * Come Hermes, che sceglie gli argomenti dell'aiutante al momento dell'avvio (`tools/computer_use/cua_backend_driver.py:96-98`,
 * `[*args, "--no-overlay"] if on else list(args)`). L'aiutante è finto: nessuna prova tocca lo schermo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { creaAiutanteMcp } from '../src/computer-use/aiutante-mcp.mjs';
import { creaAvvioFiglio } from '../desktop/runtime.mjs';
import { processoAiutanteInMemoria } from './fixtures/processo-aiutante-in-memoria.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const FINTO = join(QUI, 'fixtures', 'aiutante-mcp-finto.mjs');
const IMPRONTA_FINTA = createHash('sha256').update(readFileSync(FINTO)).digest('hex');
const FIGLIO = join(QUI, 'fixtures', 'segno-dal-guscio-figlio.mjs');
const BOOTSTRAP = join(QUI, '..', 'desktop', 'child-bootstrap.mjs');
const VARIABILE = 'TALOS_SEGNO_ACCESO';

/** L'ambiente di questo processo senza la variabile del segno: come la CLI o un server lanciato a mano, che nessun guscio ha acceso. */
function senzaSegno() { const a = { ...process.env }; delete a[VARIABILE]; return a; }

/** Un aiutante col finto vero (un processo Node che parla MCP) e gli argomenti di ogni avvio contati. */
function aiutanteContato(ambiente) {
  const chiamate = [];
  const avvia = (exe, args, opzioni) => { chiamate.push(args); return spawn(process.execPath, [exe, ...args], opzioni); };
  return { chiamate, a: creaAiutanteMcp({ exe: FINTO, improntaAttesa: IMPRONTA_FINTA, avvia, ambiente }) };
}

test('SEGNO-SRV-01 segno spento (nessun guscio l\'ha detto acceso, come la CLI): l\'aiutante parte col SUO cursore, senza `--no-overlay`', async (t) => {
  const { a, chiamate } = aiutanteContato(senzaSegno());
  t.after(() => a.chiudi());
  assert.deepEqual(await a.apri(), { ok: true });
  assert.deepEqual(chiamate, [['mcp']]);
});

test('SEGNO-SRV-02 solo il valore esatto "1" spegne il cursore dell\'aiutante: "0", "true", "" o spazi lo lasciano acceso', async (t) => {
  for (const valore of ['0', 'true', '', ' 1', 'acceso']) {
    const { a, chiamate } = aiutanteContato({ ...senzaSegno(), [VARIABILE]: valore });
    t.after(() => a.chiudi());
    assert.deepEqual(await a.apri(), { ok: true }, valore);
    assert.deepEqual(chiamate, [['mcp']], `valore ${JSON.stringify(valore)}`);
  }
  const { a, chiamate } = aiutanteContato({ ...senzaSegno(), [VARIABILE]: '1' });
  t.after(() => a.chiudi());
  assert.deepEqual(await a.apri(), { ok: true });
  assert.deepEqual(chiamate, [['mcp', '--no-overlay']], 'segno davvero acceso: sullo schermo solo il cursore di TALOS');
});

test('SEGNO-SRV-03 il segno si rilegge a OGNI avvio dell\'aiutante, mai una volta per sempre: acceso → spento → acceso', async (t) => {
  const ambiente = { ...senzaSegno(), [VARIABILE]: '1' };
  const { a, chiamate } = aiutanteContato(ambiente);
  t.after(() => a.chiudi());
  assert.deepEqual(await a.apri(), { ok: true });
  a.chiudi();
  delete ambiente[VARIABILE]; // il guscio dice «spento» (protezione rifiutata) mentre l'aiutante è fermo
  assert.deepEqual(await a.apri(), { ok: true });
  a.chiudi();
  ambiente[VARIABILE] = '1';
  assert.deepEqual(await a.apri(), { ok: true });
  a.chiudi();
  ambiente[VARIABILE] = 'true'; // un valore che non è "1" vale spento anche fra due avvii
  assert.deepEqual(await a.apri(), { ok: true });
  assert.deepEqual(chiamate, [['mcp', '--no-overlay'], ['mcp'], ['mcp', '--no-overlay'], ['mcp']]);
});

test('SEGNO-SRV-04 il guscio mette il segno nell\'ambiente del server SOLO se è davvero acceso; un valore ereditato dal sistema non passa', () => {
  const percorsi = { root: resolve('r'), server: resolve('r/server.mjs'), bootstrap: resolve('r/child-bootstrap.mjs') };
  const base = { execPath: resolve('Electron.exe'), percorsi, port: 49152, token: 'a'.repeat(64), reportFile: resolve('report.json'), dataDir: resolve('profilo') };
  assert.equal(creaAvvioFiglio({ ...base, env: { PATH: 'p' }, segnoAcceso: true }).options.env[VARIABILE], '1');
  assert.equal(creaAvvioFiglio({ ...base, env: { PATH: 'p' }, segnoAcceso: false }).options.env[VARIABILE], undefined);
  assert.equal(creaAvvioFiglio({ ...base, env: { PATH: 'p' } }).options.env[VARIABILE], undefined, 'di serie spento');
  assert.equal(creaAvvioFiglio({ ...base, env: { PATH: 'p', [VARIABILE]: '1' }, segnoAcceso: false }).options.env[VARIABILE], undefined, 'ereditato e spento: via');
  assert.equal(creaAvvioFiglio({ ...base, env: { PATH: 'p', [VARIABILE]: '1' } }).options.env[VARIABILE], undefined, 'ereditato, guscio muto: via');
  assert.equal(creaAvvioFiglio({ ...base, env: { PATH: 'p' }, segnoAcceso: 'true' }).options.env[VARIABILE], undefined, 'solo il vero `true`');
  /* Windows legge l'ambiente senza badare alle maiuscole: un `talos_segno_acceso` ereditato varrebbe come il nostro */
  const minuscolo = creaAvvioFiglio({ ...base, env: { PATH: 'p', talos_segno_acceso: '1' }, segnoAcceso: false }).options.env;
  assert.deepEqual(Object.keys(minuscolo).filter((k) => k.toUpperCase() === VARIABILE), [], 'ereditato in minuscolo: via anche lui');
});

/** Il filo intero: ambiente del guscio → server con `child-bootstrap.mjs` precaricato → messaggio `segno` → l'aiutante che parte. Node al posto di Electron. */
async function filoIntero(t, segnoAcceso, ereditato = {}, server = FIGLIO) {
  const prova = tmpdir(); // nessuno ci scrive: il figlio finto non tocca il disco, solo cartelle d'ambiente plausibili
  const env = { ...ereditato, SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: join(prova, 'TEMP'), TMP: join(prova, 'TEMP'), HOME: join(prova, 'HOME'),
    USERPROFILE: join(prova, 'HOME'), APPDATA: join(prova, 'APPDATA'), LOCALAPPDATA: join(prova, 'LOCALAPPDATA'), TALOS_HARNESS_UI_KEYRING: 'memoria' };
  const avvio = creaAvvioFiglio({ execPath: process.execPath, percorsi: { root: resolve(QUI, '..'), server: FIGLIO, bootstrap: BOOTSTRAP }, port: 49152,
    token: 'b'.repeat(64), reportFile: join(prova, 'TEMP', 'report.json'), dataDir: join(prova, 'APPDATA'), env, segnoAcceso });
  const figlio = spawn(process.execPath, ['--import', pathToFileURL(BOOTSTRAP).href, server], { ...avvio.options, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  t.after(() => { if (figlio.connected) figlio.disconnect(); if (figlio.exitCode === null) figlio.kill(); });
  let errori = ''; figlio.stderr.on('data', (d) => { errori += d; });
  const coda = []; let attesa = null;
  /* giro 5 della bolla: il server dice al guscio quando un aiutante gira col suo cursore (`segno-aiutante`); quei messaggi vanno a parte, le risposte in coda */
  const alGuscio = [];
  figlio.on('message', (m) => { if (m?.tipo === 'segno-aiutante') { alGuscio.push(m.conCursore); return; } if (attesa) { const f = attesa; attesa = null; f(m); } else coda.push(m); });
  const prossimo = () => new Promise((ok, no) => {
    if (coda.length) { ok(coda.shift()); return; }
    const timer = setTimeout(() => no(new Error(`il figlio non risponde: ${errori.slice(0, 400)}`)), 10_000);
    attesa = (m) => { clearTimeout(timer); ok(m); };
  });
  assert.equal((await prossimo()).tipo, 'pronto');
  const leggi = async () => { figlio.send({ tipo: 'leggi' }); const m = await prossimo(); assert.equal(m.tipo, 'letto'); return m.argomenti; };
  const chiedi = async (tipo) => { figlio.send({ tipo }); return prossimo(); };
  return { figlio, leggi, chiedi, alGuscio };
}

test('SEGNO-SRV-05 filo intero, segno spento al lancio (di serie): il server avvia l\'aiutante col suo cursore, anche con un valore ereditato dal sistema', async (t) => {
  const { leggi } = await filoIntero(t, false, { [VARIABILE]: '1' });
  assert.deepEqual(await leggi(), ['mcp']);
});

test('SEGNO-SRV-06 filo intero, segno acceso al lancio, poi la protezione rifiutata: il messaggio `segno` riaccende il cursore dell\'aiutante al prossimo avvio', async (t) => {
  const { figlio, leggi } = await filoIntero(t, true);
  assert.deepEqual(await leggi(), ['mcp', '--no-overlay'], 'acceso davvero: solo il cursore di TALOS');
  figlio.send({ tipo: 'segno', acceso: false });
  assert.deepEqual(await leggi(), ['mcp'], 'rifiutato: torna il cursore dell\'aiutante');
  figlio.send({ tipo: 'segno', acceso: 'true' });
  assert.deepEqual(await leggi(), ['mcp'], 'solo il vero `true` accende');
  figlio.send({ tipo: 'segno', acceso: true });
  assert.deepEqual(await leggi(), ['mcp', '--no-overlay']);
});

/** Giro 6 della bolla: chiede lo stato finché l'aiutante ripartito col suo cursore è vivo (al più 3 s); torna l'ultimo stato. */
async function riaperto(chiedi) {
  let s = await chiedi('stato');
  for (const fine = Date.now() + 3000; !(s.vivo && s.avvii.length === 2) && Date.now() < fine;) { await new Promise((r) => setTimeout(r, 20)); s = await chiedi('stato'); }
  return s;
}

/* Giudice v1793-v1794 (13/11): il segno smette di vedersi mentre l'aiutante GIRA già col cursore spento. Il server lo chiude al confine del passo e la chiamata
   dopo lo riapre col suo cursore (`computer-use-segno-rifiutato.test.mjs` prova i casi (a)-(e) e il compito intero). */
test('SEGNO-SRV-07 filo intero, aiutante acceso col cursore spento, poi la protezione rifiutata: il server lo chiude e il passo dopo lo riapre col suo cursore', async (t) => {
  const { figlio, chiedi } = await filoIntero(t, true, {}, join(QUI, 'fixtures', 'segno-rifiutato-figlio.mjs'));
  const aperto = await chiedi('apri');
  assert.equal(aperto.esito.ok, true);
  assert.deepEqual(aperto.avvii, [['mcp', '--no-overlay']], 'acceso davvero: solo il cursore di TALOS');
  figlio.send({ tipo: 'segno', acceso: false });
  /* giro 6 della bolla (14/11): a compito in corso l'aiutante senza cursore si chiude e riparte SUBITO col suo, senza aspettare il passo dopo (prima: spento fino ad allora) */
  const stato = await riaperto(chiedi);
  assert.deepEqual([stato.vivo, stato.avvii], [true, [['mcp', '--no-overlay'], ['mcp']]], 'l\'aiutante senza cursore non resta acceso: al suo posto quello col cursore');
  const dopo = await chiedi('chiama');
  assert.equal(dopo.ok, true, 'la chiamata del passo dopo trova l\'aiutante riaperto');
  assert.deepEqual(dopo.avvii, [['mcp', '--no-overlay'], ['mcp']], 'riaperto col cursore dell\'aiutante');
});

test('SEGNO-SRV-08 filo intero, il messaggio `segno` acceso ripetuto non chiude nulla; poi il rifiuto chiude, e un altro rifiuto non riavvia di nuovo', async (t) => {
  const { figlio, chiedi } = await filoIntero(t, true, {}, join(QUI, 'fixtures', 'segno-rifiutato-figlio.mjs'));
  assert.equal((await chiedi('apri')).esito.ok, true);
  figlio.send({ tipo: 'segno', acceso: true });
  figlio.send({ tipo: 'segno', acceso: true });
  const acceso = await chiedi('stato');
  assert.equal(acceso.vivo, true, 'segno ancora acceso: l\'aiutante col solo cursore di TALOS resta');
  assert.deepEqual(acceso.avvii, [['mcp', '--no-overlay']]);
  figlio.send({ tipo: 'segno', acceso: false });
  assert.deepEqual((await riaperto(chiedi)).avvii, [['mcp', '--no-overlay'], ['mcp']], 'giro 6: il rifiuto chiude e riapre subito col suo cursore');
  assert.equal((await chiedi('chiama')).ok, true);
  figlio.send({ tipo: 'segno', acceso: false }); // l'aiutante di adesso ha già il suo cursore
  const fine = await chiedi('chiama');
  assert.deepEqual(fine.avvii, [['mcp', '--no-overlay'], ['mcp']], 'nessun secondo riavvio');
});

/* Giro 5 della bolla (decisione dell'owner 14/11/2026 08:18): il segno di TALOS si MOSTRA solo se nessun aiutante gira col suo cursore. Lo sa solo il server:
   lo dice al guscio col canale privato, `{ tipo: 'segno-aiutante', conCursore }`, solo quando cambia (come `{ tipo: 'sveglio' }`, `src/pc-sveglio.mjs`). */
test('SEGNO-SRV-09 l aiutante dice quando gira col suo cursore: vero all avvio senza `--no-overlay`, falso quando si chiude; niente per un aiutante senza cursore', async () => {
  const BYTE_FINTI = Buffer.from('aiutante del cursore detto');
  const ambiente = { [VARIABILE]: '1' };
  const detti = []; const avvii = [];
  const a = creaAiutanteMcp({ exe: 'C:/finto/detto/cua-driver.exe', improntaAttesa: createHash('sha256').update(BYTE_FINTI).digest('hex'), leggi: async () => BYTE_FINTI,
    avvia: (_exe, args) => { avvii.push(args); return processoAiutanteInMemoria(); }, ambiente, registro: () => {}, quandoCursore: (c) => detti.push(c) });
  assert.deepEqual(await a.apri(), { ok: true });
  assert.deepEqual([avvii, detti], [[['mcp', '--no-overlay']], []], 'senza il suo cursore: niente da dire');
  delete ambiente[VARIABILE]; a.segnoCambiato(); // il segno si spegne: chiuso al confine del passo
  assert.equal((await a.chiama('list_windows', {})).ok, true, 'la chiamata dopo lo riapre');
  assert.deepEqual([avvii.at(-1), detti], [['mcp'], [true]], 'riaperto col suo cursore: il guscio nasconde il segno');
  assert.equal((await a.chiama('list_windows', {})).ok, true);
  assert.deepEqual(detti, [true], 'una volta sola');
  a.chiudi();
  assert.deepEqual(detti, [true, false], 'chiuso: il guscio può mostrare il segno');
  a.chiudi();
  assert.deepEqual(detti, [true, false]);
  ambiente[VARIABILE] = '1';
  assert.deepEqual(await a.apri(), { ok: true });
  a.chiudi();
  assert.deepEqual(detti, [true, false], 'un aiutante senza cursore che parte e si chiude non dice niente');
  /* AL CONTRARIO: chi lo ascolta e lancia non ferma l'aiutante */
  const b = creaAiutanteMcp({ exe: 'C:/finto/detto/cua-driver.exe', improntaAttesa: createHash('sha256').update(BYTE_FINTI).digest('hex'), leggi: async () => BYTE_FINTI,
    avvia: () => processoAiutanteInMemoria(), ambiente: {}, registro: () => {}, quandoCursore: () => { throw new Error('ascoltatore rotto'); } });
  assert.deepEqual(await b.apri(), { ok: true });
  b.chiudi();
});

test('SEGNO-SRV-10 filo intero: il server col guscio (canale privato) gli manda `segno-aiutante` quando l aiutante riparte col cursore e quando si chiude', async (t) => {
  const { figlio, chiedi, alGuscio } = await filoIntero(t, true, {}, join(QUI, 'fixtures', 'segno-rifiutato-figlio.mjs'));
  assert.equal((await chiedi('apri')).esito.ok, true);
  assert.deepEqual(alGuscio, [], 'partito senza cursore: niente');
  figlio.send({ tipo: 'segno', acceso: false });
  const dopo = await chiedi('chiama');
  assert.deepEqual(dopo.avvii, [['mcp', '--no-overlay'], ['mcp']]);
  assert.deepEqual(alGuscio, [true], 'il guscio sa che adesso c è il cursore dell aiutante');
  figlio.send({ tipo: 'chiudi-aiutante' });
  assert.equal((await chiedi('stato')).vivo, false);
  assert.deepEqual(alGuscio, [true, false]);
});

/* giro 5 (mutanti a 2 uccisori): lo stesso canale visto dentro il processo, con due macchine. Al guscio si dice solo quando «almeno un aiutante col suo
   cursore» cambia: il secondo che parte o il primo che si chiude non cambiano niente. Il canale privato si simula con `process.send` per la durata della prova. */
test('SEGNO-SRV-11 due aiutanti col loro cursore nello stesso server: al guscio `segno-aiutante` vero al primo che parte, falso solo quando si chiude l ultimo', async (t) => {
  const { aiutantePerMacchina } = await import('../src/computer-use/aiutante-mcp.mjs');
  const prima = Object.getOwnPropertyDescriptor(process, 'send');
  const inviati = [];
  process.send = (m, fatto) => { inviati.push(m); fatto?.(); return true; };
  t.after(() => { if (prima) Object.defineProperty(process, 'send', prima); else delete process.send; });
  const BYTE_FINTI = Buffer.from('due macchine');
  const opzioni = (exe) => ({ exe, improntaAttesa: createHash('sha256').update(BYTE_FINTI).digest('hex'), leggi: async () => BYTE_FINTI,
    avvia: () => processoAiutanteInMemoria(), ambiente: {}, registro: () => {} }); // segno spento: ognuno col suo cursore
  const a = aiutantePerMacchina(opzioni('C:/finto/srv11-a/cua-driver.exe'));
  const b = aiutantePerMacchina(opzioni('C:/finto/srv11-b/cua-driver.exe'));
  assert.notEqual(a, b);
  assert.deepEqual(await a.apri(), { ok: true });
  assert.deepEqual(inviati, [{ tipo: 'segno-aiutante', conCursore: true }], 'il primo aiutante col suo cursore: il guscio nasconde il segno');
  assert.deepEqual(await b.apri(), { ok: true });
  a.chiudi();
  assert.deepEqual(inviati, [{ tipo: 'segno-aiutante', conCursore: true }], 'il secondo che parte e il primo che si chiude non cambiano niente');
  b.chiudi();
  assert.deepEqual(inviati, [{ tipo: 'segno-aiutante', conCursore: true }, { tipo: 'segno-aiutante', conCursore: false }], 'nessuno più col suo cursore');
});

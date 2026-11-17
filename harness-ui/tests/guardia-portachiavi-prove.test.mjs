/*
 * P045 (11/11/2026, judge v1404-v1407): a test run never opens the real system keychain; a real user on any folder always does.
 * Every test here is pure or uses an injected importer: the real `@napi-rs/keyring` is never imported, not even by a broken guard.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  NOMI_DEL_SEGNO, TEMPO_MASSIMO_ANTENATI_MS, VARIABILE_PROVA_ISOLATA, antenatoDiProva, attendiAntenati, avviaLetturaAntenati, dimenticaLetturaAntenati, lanciatoreDiProva, leggiTabellaProcessi, processoVivo,
  rigaDellaGuardia, segnoDiProva, segnoNellAmbiente, tabellaDaWindows, tokenDellaRiga,
} from '../src/guardia-portachiavi-prove.mjs';
import { creaAdattatorePortachiavi, creaAdattatorePortachiaviSistema } from '../src/adattatore-keyring.mjs';
import { LETTURA_ANTENATI_AVVIATA, deveLeggereGliAntenati } from '../src/guardia-portachiavi-prove.avvio.mjs';
import { ambienteDaUtenteVero } from '../desktop/tests/esenzioni-utente-vero.mjs';

const UTENTE = Object.freeze({ USERPROFILE: 'C:\\Users\\persona', APPDATA: 'D:\\altrove\\AppData\\Roaming', TALOS_HOME: 'E:\\casa-talos',
  TALOS_DESKTOP_DATA_DIR: 'F:\\dati', LOCALAPPDATA: 'G:\\locale', TEMP: 'H:\\tmp', PATH: 'C:\\Windows' });
const nessunAntenato = async () => Object.freeze({ segno: null, stato: 'letto' });
/*
 * Round (k), 11/11/2026 (owner «aggancio in OGNI node --test»): this file now also runs under the keyring hook (CI server step,
 * release, merge queue). The hook loaded in THIS process is a mark for the guard (P045-02); the pure checks below hand their inputs
 * explicitly, so they set the ambient hook aside while they run and put it back. The real-user children ask for their exemption by
 * name (`ambienteDaUtenteVero`, `desktop/tests/esenzioni-utente-vero.mjs`): no mark, the trip wire still on.
 */
const SIMBOLO_GANCIO = Symbol.for('talos.prova.gancioPortachiavi');
const RUNNER_COL_GANCIO = Boolean(globalThis[SIMBOLO_GANCIO]);
async function senzaIlGancioQui(fn) {
  const prima = globalThis[SIMBOLO_GANCIO];
  delete globalThis[SIMBOLO_GANCIO];
  try { return await fn(); } finally { if (prima !== undefined) globalThis[SIMBOLO_GANCIO] = prima; }
}
/** The test launcher the live ancestry finds above this file: `node --test`, or the hook when the runner preloads it (it comes first). */
const LANCIATORI_ATTESI = RUNNER_COL_GANCIO ? ['gancio-portachiavi', 'node --test'] : ['node --test'];

test('P045-01 — the mark is ONLY explicit: each test variable is one, and no folder, home or profile is (P1)', () => senzaIlGancioQui(() => {
  for (const nome of NOMI_DEL_SEGNO) {
    assert.deepEqual(segnoNellAmbiente({ ...UTENTE, [nome]: '1' }, []), { tipo: 'variabile', nome }, nome);
    assert.deepEqual(segnoNellAmbiente({ ...UTENTE, [nome.toLowerCase()]: 'x' }, []), { tipo: 'variabile', nome }, nome + ' in lower case');
    assert.equal(segnoNellAmbiente({ ...UTENTE, [nome]: '  ' }, []), null, nome + ' empty is not a mark');
  }
  // AL CONTRARIO (P1): every folder of the person moved anywhere, a custom TALOS_HOME, test-looking folder NAMES: no mark.
  assert.equal(segnoNellAmbiente(UTENTE, []), null);
  assert.equal(segnoNellAmbiente({ ...UTENTE, TALOS_HOME: 'C:\\T\\prove\\.prove\\test', TALOS_DESKTOP_DATA_DIR: 'C:\\tmp\\pytest-of-dev' }, []), null);
  assert.equal(segnoNellAmbiente({}, ['--test-isolation=process', '--testx']), null, 'only --test itself');
  assert.deepEqual(segnoNellAmbiente({}, ['--test']), { tipo: 'argomento', nome: '--test' });
  assert.equal(VARIABILE_PROVA_ISOLATA, 'TALOS_PROVA_ISOLATA');
}));

test('P045-02 — the test hook loaded in this process is a mark', () => senzaIlGancioQui(() => {
  const simbolo = Symbol.for('talos.prova.gancioPortachiavi');
  const prima = globalThis[simbolo];
  try {
    globalThis[simbolo] = Object.freeze({ url: 'file:///x' });
    assert.deepEqual(segnoNellAmbiente({}, []), { tipo: 'gancio', nome: 'gancio-portachiavi' });
  } finally { if (prima === undefined) delete globalThis[simbolo]; else globalThis[simbolo] = prima; }
  assert.equal(segnoNellAmbiente({}, []), null);
}));

test('P045-03 — a test launcher in a command line: node --test, playwright test, the hook; nothing else', () => {
  assert.equal(lanciatoreDiProva('"C:\\Program Files\\nodejs\\node.exe" --test --test-concurrency=1 tests/a.test.mjs'), 'node --test');
  assert.equal(lanciatoreDiProva('node --test'), 'node --test');
  assert.equal(lanciatoreDiProva('"C:\\nodejs\\node.exe" C:\\r\\node_modules\\@playwright\\test\\cli.js test --config x'), 'playwright test');
  assert.equal(lanciatoreDiProva('node /r/node_modules/playwright/cli.js test'), 'playwright test');
  assert.equal(lanciatoreDiProva('C:\\r\\node_modules\\.bin\\playwright.cmd test'), 'playwright test');
  assert.equal(lanciatoreDiProva('node --import=file:///C:/r/harness-ui/desktop/tests/gancio-portachiavi.mjs probe.mjs'), 'gancio-portachiavi');
  assert.equal(lanciatoreDiProva(['node', '--import', 'C:\\r\\tests\\gancio-portachiavi.mjs', 'x.mjs']), 'gancio-portachiavi');
  // AL CONTRARIO: a real user's processes, and look-alikes
  for (const riga of ['"C:\\Program Files\\TALOS\\TALOS.exe" --test', '"C:\\nodejs\\node.exe" server.mjs', 'node server.mjs --test-foo',
    'C:\\Windows\\explorer.exe', 'node C:\\Users\\pytest-of-dev\\test\\x.mjs', 'node /r/node_modules/playwright/cli.js show-report',
    'node C:\\progetti\\test\\cli.js test', 'cmd.exe /c node --version', '', null]) {
    assert.equal(lanciatoreDiProva(riga), null, String(riga));
  }
  assert.deepEqual(tokenDellaRiga('"a b" c  "d"'), ['a b', 'c', 'd']);
});

test('P045-04 — the ancestry walk: a test launcher two levels up is found; a reused pid, a cycle or a gap is not a parent', () => {
  const t = (righe) => new Map(righe.map(([pid, ppid, nato, riga]) => [pid, { ppid, nato, riga }]));
  const albero = t([[10, 9, '20261111080000.000003', 'node nipote.mjs'], [9, 8, '20261111080000.000002', 'cmd.exe /c node nipote.mjs'],
    [8, 7, '20261111080000.000001', 'node.exe --test x.test.mjs'], [7, 1, '20261111070000.000000', 'bash.exe']]);
  assert.deepEqual(antenatoDiProva(albero, 10), { tipo: 'antenato', nome: 'node --test', livello: 2 });
  // a dead parent's pid reused LATER by a `node --test`: not a parent (a real user is never refused by chance)
  const riuso = t([[10, 8, '20261111080000.000003', 'node server.mjs'], [8, 1, '20261111090000.000000', 'node --test']]);
  assert.equal(antenatoDiProva(riuso, 10), null);
  assert.equal(antenatoDiProva(t([[10, 11, '1', 'node'], [11, 10, '0', 'node']]), 10), null, 'cycle');
  assert.equal(antenatoDiProva(t([[10, 9, '20261111080000.000003', 'node']]), 10), null, 'gap');
  assert.equal(antenatoDiProva(new Map(), 10), null);
  assert.equal(antenatoDiProva(t([[10, 9, undefined, 'node'], [9, 1, '20261111070000.000000', 'node --test']]), 10), null, 'no birth date');
});

test('P045-05 — the Windows Script Host output becomes the table; broken records are skipped', () => {
  const RS = '\u001e', US = '\u001f';
  const testo = ['4' + US + '0' + US + '20261111070000.000000+060' + US + '', '12' + US + '4' + US + '20261111080000.123456+060' + US + 'node --test a b',
    'x' + US + '4' + US + '2026' + US + 'bad', '13' + US + '12' + US + 'not-a-date' + US + 'node'].join(RS);
  const tabella = tabellaDaWindows(testo);
  assert.deepEqual([...tabella.keys()], [4, 12]);
  assert.deepEqual(tabella.get(12), { ppid: 4, nato: '20261111080000.123456', riga: 'node --test a b' });
  assert.equal(tabellaDaWindows('').size, 0);
});

test('P045-06 — the read fails open: unreadable, refused or slower than the limit ⇒ no mark, and it is read once', async (t) => {
  t.after(dimenticaLetturaAntenati);
  dimenticaLetturaAntenati();
  assert.deepEqual(await avviaLetturaAntenati({ leggi: async () => { throw new Error('WMI off'); } }), { segno: null, stato: 'illeggibile' });
  dimenticaLetturaAntenati();
  assert.deepEqual(await avviaLetturaAntenati({ leggi: async () => null }), { segno: null, stato: 'illeggibile' });
  dimenticaLetturaAntenati();
  const a = performance.now();
  assert.deepEqual(await attendiAntenati({ leggi: () => new Promise(() => {}), tempoMassimo: 60 }), { segno: null, stato: 'tempo' });
  assert.ok(performance.now() - a < 1000, 'the limit holds');
  assert.equal(TEMPO_MASSIMO_ANTENATI_MS, 1000, 'judge v1407: at most 1 s');
  dimenticaLetturaAntenati();
  // the decision is shared like the read: a second access does not start a second timer nor a second read
  let contate = 0;
  const d1 = attendiAntenati({ leggi: async () => { contate += 1; return null; } });
  assert.equal(attendiAntenati({ leggi: async () => { contate += 1; return null; } }), d1, 'one shared decision');
  assert.deepEqual(await d1, { segno: null, stato: 'illeggibile' });
  assert.equal(contate, 1);
  dimenticaLetturaAntenati();
  let letture = 0;
  const tabella = new Map([[5, { ppid: 4, nato: '20261111080000.000001', riga: 'node x' }], [4, { ppid: 0, nato: '20261111080000.000000', riga: 'node --test' }]]);
  const leggi = async () => { letture += 1; return tabella; };
  const p1 = avviaLetturaAntenati({ leggi, pid: 5 });
  const p2 = avviaLetturaAntenati({ leggi, pid: 5 });
  assert.equal(p1, p2, 'one shared read');
  assert.deepEqual(await p1, { segno: { tipo: 'antenato', nome: 'node --test', livello: 1 }, stato: 'letto' });
  assert.equal(letture, 1);
  // a parent already gone (a detached start) leaves nothing to walk: no read at all, no mark
  dimenticaLetturaAntenati();
  let lette = 0;
  assert.deepEqual(await avviaLetturaAntenati({ leggi: async () => { lette += 1; return tabella; }, pid: 5, ppid: 4, vivo: () => false }), { segno: null, stato: 'senza-genitore' });
  assert.equal(lette, 0);
  dimenticaLetturaAntenati();
  assert.equal((await avviaLetturaAntenati({ leggi, pid: 5, ppid: 4, vivo: (p) => p === 4 })).stato, 'letto', 'a live parent: the read happens');
  assert.equal(processoVivo(process.pid), true);
  assert.equal(processoVivo(0), false);
  assert.equal(processoVivo(-1), false);
});

test('P045-07 — the mark of a run: environment first (no read), then this process, then the ancestry; a real user has none', () => senzaIlGancioQui(async () => {
  let chiamate = 0;
  const antenati = async () => { chiamate += 1; return { segno: { tipo: 'antenato', nome: 'node --test', livello: 3 }, stato: 'letto' }; };
  assert.deepEqual(await segnoDiProva({ env: { TALOS_PROVA_ISOLATA: '1' }, execArgv: [], ambienteDelProcesso: {}, antenati }), { tipo: 'variabile', nome: 'TALOS_PROVA_ISOLATA' });
  assert.deepEqual(await segnoDiProva({ env: {}, execArgv: [], ambienteDelProcesso: { NODE_TEST_CONTEXT: 'child-v8' }, antenati }), { tipo: 'variabile', nome: 'NODE_TEST_CONTEXT' });
  assert.equal(chiamate, 0, 'an environment mark needs no read');
  assert.deepEqual(await segnoDiProva({ env: {}, execArgv: [], ambienteDelProcesso: {}, antenati }), { tipo: 'antenato', nome: 'node --test', livello: 3 });
  // AL CONTRARIO: the real user (custom folders, custom TALOS_HOME, no test ancestor, or a read that failed): no mark
  assert.equal(await segnoDiProva({ env: UTENTE, execArgv: [], ambienteDelProcesso: UTENTE, antenati: nessunAntenato }), null);
  assert.equal(await segnoDiProva({ env: UTENTE, execArgv: [], ambienteDelProcesso: UTENTE, antenati: async () => ({ segno: null, stato: 'tempo' }) }), null);
}));

/** A fake `@napi-rs/keyring`: what the real import would return, recorded. */
function importatoreFinto() {
  const chiamate = [];
  class Entry { constructor(s, a) { this.s = s; this.a = a; } getPassword() { chiamate.push(['get', this.s, this.a]); return this.a === 'openrouter' ? 'sk-finta' : null; } setPassword() {} deletePassword() { return false; } }
  return { chiamate, importa: async () => { chiamate.push(['import']); return { Entry }; } };
}

test('P045-08 — with a mark the system adapter refuses BEFORE the import (KEYRING_TEST_PROFILE); without, the keys work', async () => {
  const conSegno = importatoreFinto();
  await assert.rejects(creaAdattatorePortachiaviSistema({ env: {}, segno: async () => ({ tipo: 'antenato', nome: 'playwright test' }), importa: conSegno.importa }),
    (e) => e.code === 'KEYRING_TEST_PROFILE' && e.segno.nome === 'playwright test' && /never opens the real system keychain/.test(e.message));
  assert.deepEqual(conSegno.chiamate, [], 'the module is not even imported');
  const senza = importatoreFinto();
  const viste = [];
  const k = await creaAdattatorePortachiaviSistema({ env: UTENTE, segno: async (o) => { viste.push(o.env); return null; }, importa: senza.importa });
  assert.equal(k.get('talos-harness-provider', 'openrouter'), 'sk-finta', 'a real user keeps a working keychain');
  assert.deepEqual(senza.chiamate, [['import'], ['get', 'talos-harness-provider', 'openrouter']]);
  assert.equal(viste[0], UTENTE, 'the guard reads the environment the caller hands in');
});

test('P045-09 — this very run is a test run: the default guard refuses here, through the real factory too (was MOTORE-PORTACHIAVI-01 on the real keychain)', async () => {
  const finto = importatoreFinto();
  await assert.rejects(creaAdattatorePortachiaviSistema({ importa: finto.importa }), (e) => e.code === 'KEYRING_TEST_PROFILE');
  assert.deepEqual(finto.chiamate, []);
  assert.equal(typeof creaAdattatorePortachiavi, 'function');
  assert.equal(LETTURA_ANTENATI_AVVIATA, false, 'a marked run starts no read of the processes');
});

test('P045-10 — the log line names the mark and its kind, never a value of the environment nor a path (judge v1407 condition 5)', () => {
  assert.equal(rigaDellaGuardia({ tipo: 'variabile', nome: 'TALOS_PROVA_ISOLATA' }),
    '[provider-store] test run (variable TALOS_PROVA_ISOLATA): the real system keychain is not opened, this server has no keychain'
    + ' / prova (variable TALOS_PROVA_ISOLATA): il portachiavi vero del sistema non si apre, questo server resta senza portachiavi');
  assert.match(rigaDellaGuardia({ tipo: 'antenato', nome: 'node --test', livello: 2 }), /^\[provider-store\] test run \(ancestor node --test\):/);
  assert.match(rigaDellaGuardia({ tipo: 'gancio', nome: 'gancio-portachiavi' }), /\(test hook gancio-portachiavi\)/);
  // a mark that would carry a value or a path never reaches the line
  for (const nome of ['C:\\Users\\persona\\AppData', 'sk-or-v1-segreto', 'TALOS_HOME=E:\\casa']) {
    const riga = rigaDellaGuardia({ tipo: 'variabile', nome });
    assert.ok(!riga.includes(nome) && riga.includes('(variable unknown)'), riga);
  }
  assert.ok(!/[A-Za-z]:\\|\/Users\/|sk-/.test(rigaDellaGuardia({ tipo: 'x', nome: 'y' })));
});

test('P045-11 — server.mjs starts the read third and logs the refusal with the guard line, not as «unavailable»', () => senzaIlGancioQui(() => {
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  const importazioni = server.split('\n').filter(r => r.startsWith('import ')).slice(0, 3);
  assert.equal(importazioni[2], "import './src/guardia-portachiavi-prove.avvio.mjs'; // ⛔ PER TERZO (P045, 11/11/2026): la lettura degli antenati parte qui, in parallelo, e trattiene solo il primo accesso al portachiavi");
  assert.match(server, /if \(errore\?\.code === 'KEYRING_TEST_PROFILE'\) console\.warn\(rigaDellaGuardia\(errore\.segno\)\);\n\s+else console\.warn\('\[provider-store\] portachiavi del sistema non disponibile/);
  const avvio = readFileSync(new URL('../src/guardia-portachiavi-prove.avvio.mjs', import.meta.url), 'utf8');
  assert.match(avvio, /export const LETTURA_ANTENATI_AVVIATA = deveLeggereGliAntenati\(\);\nif \(LETTURA_ANTENATI_AVVIATA\) void avviaLetturaAntenati\(\);/);
  // memoria, modulo: and a marked run start no read; a Worker neither (last round, the controller's reperto C)
  assert.equal(deveLeggereGliAntenati({ env: UTENTE, principale: true }), true, 'a real user, main thread: the read starts');
  assert.equal(deveLeggereGliAntenati({ env: UTENTE, principale: false }), false, 'a Worker of the server');
  assert.equal(deveLeggereGliAntenati({ env: { ...UTENTE, TALOS_HARNESS_UI_KEYRING: ' memoria ' }, principale: true }), false);
  assert.equal(deveLeggereGliAntenati({ env: { ...UTENTE, TALOS_HARNESS_UI_KEYRING: 'modulo:C:\\x.mjs' }, principale: true }), false);
  assert.equal(deveLeggereGliAntenati({ env: { ...UTENTE, TALOS_HARNESS_UI_KEYRING: '  ' }, principale: true }), true, 'blank is the system keychain');
  assert.equal(deveLeggereGliAntenati({ env: { ...UTENTE, NODE_TEST_CONTEXT: 'child-v8' }, principale: true }), false);
}));

test('P045-12 — the read never flashes a window and never starts PowerShell (judge v1407 condition 4)', () => {
  const guardia = readFileSync(new URL('../src/guardia-portachiavi-prove.mjs', import.meta.url), 'utf8');
  const lanci = [...guardia.matchAll(/\b(execFile|execFileSync|spawn|spawnSync|exec|execSync|fork)\(/g)];
  assert.equal(lanci.length, 1, 'one launch only: the Windows Script Host');
  assert.match(guardia.slice(lanci[0].index, lanci[0].index + 400), /\{ windowsHide: true, timeout: tempoMassimo/);
  const codice = guardia.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.equal(/powershell|pwsh/i.test(codice), false, 'no PowerShell in the code (only named in comments)');
  assert.ok(guardia.includes("['//NoLogo', '//B', COPIONE_WINDOWS, String(pid)]"), 'cscript in batch mode: no banner, no dialog');
});

test('P045-13 — the real reader of this machine sees this run: its own `node --test` parent is a test ancestor', { skip: !['win32', 'linux'].includes(process.platform) }, async () => {
  const tabella = await leggiTabellaProcessi({ tempoMassimo: 15000 });
  assert.ok(tabella instanceof Map && tabella.has(process.pid), 'the chain starts with this process');
  const segno = antenatoDiProva(tabella, process.pid);
  assert.ok(LANCIATORI_ATTESI.includes(segno?.nome), 'the test runner above this file, read live (the command line of the ancestors): ' + segno?.nome);
  assert.equal(segno.tipo, 'antenato');
});

test('P045-14 — cura dell\'avvio: the shell preloads the guard right after the bootstrap, the very URL the server imports, and the package carries it', async () => {
  const { creaAvvioFiglio } = await import('../desktop/runtime.mjs');
  const radice = fileURLToPath(new URL('..', import.meta.url));
  const percorsi = { root: radice, server: join(radice, 'server.mjs'), bootstrap: join(radice, 'desktop', 'child-bootstrap.mjs') };
  const avvio = creaAvvioFiglio({ execPath: process.execPath, percorsi, port: 49999, token: 'a'.repeat(64), reportFile: join(radice, '.prove', 'x.json'), dataDir: join(radice, '.prove') });
  const atteso = new URL('../src/guardia-portachiavi-prove.avvio.mjs', import.meta.url).href;
  assert.deepEqual(avvio.args, ['--import', pathToFileURL(percorsi.bootstrap).href, '--import', atteso, percorsi.server], 'bootstrap first (its tests read args[1]), then the guard, then the server');
  assert.ok(existsSync(fileURLToPath(atteso)));
  assert.equal(new URL('./src/guardia-portachiavi-prove.avvio.mjs', pathToFileURL(percorsi.server)).href, atteso, 'the server\'s own third import is the same module: one read');
  assert.equal(avvio.options.windowsHide, true);
  const { fileProduzione } = await import('../desktop/scripts/prepara-pacchetto.mjs');
  for (const nome of ['src/guardia-portachiavi-prove.avvio.mjs', 'src/guardia-portachiavi-prove.mjs', 'src/guardia-portachiavi-prove.wsf']) assert.equal(fileProduzione(nome), true, nome + ' goes into the package');
});

test('P045-15 — live: the read the preload starts is the one the main module finds (no second read), and it starts before the main module runs', { skip: !['win32', 'linux'].includes(process.platform) }, () => {
  const cartella = mkdtempSync(join(tmpdir(), 'p045-15-'));
  const principale = join(cartella, 'principale.mjs');
  const guardia = new URL('../src/guardia-portachiavi-prove.mjs', import.meta.url).href;
  writeFileSync(principale, [
    'const g = await import(' + JSON.stringify(guardia) + ');',
    'let nuova = false;',
    'const p = g.avviaLetturaAntenati({ leggi: async () => { nuova = true; return null; } });',
    'const esito = await p;',
    'process.stdout.write(JSON.stringify({ nuova, stato: esito.stato }));',
  ].join('\n'));
  // the child is a real user as far as the guard can tell from its environment (no mark, system keychain chosen); it never imports a keyring
  const env = ambienteDaUtenteVero('P045-15');
  const conPrecarica = spawnSync(process.execPath, ['--import', new URL('../src/guardia-portachiavi-prove.avvio.mjs', import.meta.url).href, principale], { env, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  const visto = JSON.parse(conPrecarica.stdout);
  assert.equal(visto.nuova, false, 'preloaded: the main module gets the read already under way');
  assert.ok(['letto', 'illeggibile'].includes(visto.stato), 'the preloaded read is the real one; it has no 1 s «tempo» of its own any more (only the first access has): ' + visto.stato);
  const senza = spawnSync(process.execPath, [principale], { env, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.deepEqual(JSON.parse(senza.stdout), { nuova: true, stato: 'illeggibile' }, 'control: without the preload the main module starts its own');
});

/*
 * Last round «che lo chiude» (owner 11/11 10:42, judge v1433-v1434). The controller measured that the 1 s limit started at the
 * preload while the result of `cscript` is handled only when the module graph frees the thread: 13 «tempo» in 20 at NORMAL load
 * (`RAPPORTO-CONTROLLORE-PORTACHIAVI-RAMO-INTERO-2026-11-11.md`, reperto A; its pure proof: 900 ms ⇒ read, 1500 ms ⇒ «tempo»).
 * No CPU burner (judge v1434): the slow cases are INJECTED here — a module load that holds the thread, a read that never ends.
 */
const GUARDIA_URL = new URL('../src/guardia-portachiavi-prove.mjs', import.meta.url).href;
const AVVIO_URL = new URL('../src/guardia-portachiavi-prove.avvio.mjs', import.meta.url).href;
/* The environment of a REAL USER as far as the guard can tell (no mark, no memoria, no NODE_OPTIONS), asked by the test's own name
   (`ambienteDaUtenteVero`): the children here never import a keyring, and under the hook they keep its trip wire. */
function cicloBloccato(nome, modo, blocco) {
  const cartella = mkdtempSync(join(tmpdir(), 'p045-ciclo-'));
  const precarica = join(cartella, 'precarica.mjs');
  const principale = join(cartella, 'principale.mjs');
  // the preload starts the read as the shell does; the injected read is a REAL child (its end arrives through the event loop) or never ends
  writeFileSync(precarica, [
    'import { execFile } from "node:child_process";',
    'import { join } from "node:path";',
    'const g = await import(' + JSON.stringify(GUARDIA_URL) + ');',
    'const tabella = new Map([[process.pid, { ppid: 4242, nato: "20261111080000.000001", riga: "node x" }], [4242, { ppid: 0, nato: "20261111080000.000000", riga: "node --test" }]]);',
    'const cmd = join(process.env.SystemRoot || "C:\\\\Windows", "System32", "cmd.exe");',
    'const leggi = ' + JSON.stringify(modo) + ' === "lenta" ? () => new Promise(() => {}) : () => new Promise((fatto) => execFile(cmd, ["/d", "/c", "exit 0"], { windowsHide: true }, () => fatto(tabella)));',
    'g.avviaLetturaAntenati({ leggi, vivo: () => true });',
  ].join('\n'));
  // the main module holds the thread like a module graph that loads for `blocco` ms, then the first keychain access asks for the mark
  writeFileSync(principale, [
    'const g = await import(' + JSON.stringify(GUARDIA_URL) + ');',
    'const fine = performance.now() + ' + Number(blocco) + ';',
    'while (performance.now() < fine) { /* the module graph, injected */ }',
    'const tieni = setTimeout(() => {}, 30000);',
    'const t0 = performance.now();',
    'const segno = await g.segnoDiProva({ env: {}, execArgv: [], ambienteDelProcesso: {} });',
    'clearTimeout(tieni);',
    'process.stdout.write(JSON.stringify({ segno, attesa: Math.round(performance.now() - t0) }));',
  ].join('\n'));
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(precarica).href, principale], { env: ambienteDaUtenteVero(nome), encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(r.status, 0, 'stderr: ' + String(r.stderr).slice(0, 600));
  return JSON.parse(r.stdout);
}

test('P045-16 — reperto A: a module load that holds the thread 1500 ms no longer turns a finished read into «tempo» (the limit counts from the first access)', { skip: process.platform !== 'win32' }, () => {
  const ANTENATO = { tipo: 'antenato', nome: 'node --test', livello: 1 };
  assert.deepEqual(cicloBloccato('P045-16', 'veloce', 300).segno, ANTENATO, 'control: a short load, the read is there');
  const lungo = cicloBloccato('P045-16', 'veloce', 1500);
  assert.deepEqual(lungo.segno, ANTENATO, 'a 1500 ms load: the read that finished meanwhile is used, not thrown away by the timer');
  assert.ok(lungo.attesa < 1000, 'and the first access does not wait for it: ' + lungo.attesa + ' ms');
});

test('P045-17 — never over 1 s for the person: a read that never ends gives «no mark» about 1 s after the FIRST access, whatever the load before (X3)', { skip: process.platform !== 'win32' }, () => {
  const { segno, attesa } = cicloBloccato('P045-17', 'lenta', 1500);
  assert.equal(segno, null, 'no mark: a real user keeps the keychain');
  assert.ok(attesa >= 900, 'the second is counted from the first access, not eaten by the module load: ' + attesa + ' ms');
  assert.ok(attesa <= 3000, 'at most about 1 s (judge v1407; 3 s of slack for a loaded runner, a 10 s limit fails): ' + attesa + ' ms');
});

test('P045-18 — one read per server start: the preload starts it in the MAIN thread only, its Workers do not read again; memoria, modulo: and a mark read nothing (X4)', { skip: process.platform !== 'win32' }, () => {
  const cartella = mkdtempSync(join(tmpdir(), 'p045-letture-'));
  const contatore = join(cartella, 'contatore.mjs');
  const principale = join(cartella, 'principale.mjs');
  // counts every cscript launch per thread and does not start it (no WMI here): the read then ends «illeggibile», fails open
  writeFileSync(contatore, [
    'import { ChildProcess } from "node:child_process";',
    'import { appendFileSync } from "node:fs";',
    'import { threadId } from "node:worker_threads";',
    'const vero = ChildProcess.prototype.spawn;',
    'ChildProcess.prototype.spawn = function contaCscript(o) {',
    '  if (/cscript\\.exe$/i.test(String(o && o.file))) { appendFileSync(process.env.P045_CONTEGGIO, "thread " + threadId + "\\n"); throw Object.assign(new Error("counted, not started"), { code: "P045_CONTATO" }); }',
    '  return vero.call(this, o);',
    '};',
  ].join('\n'));
  // like the server: Workers started from the main module (kernel/cancello-in-worker.mjs, process-output-store.mjs) inherit --import
  writeFileSync(principale, [
    'import { Worker } from "node:worker_threads";',
    'import { once } from "node:events";',
    'for (let i = 0; i < 2; i += 1) { const w = new Worker("export {}", { eval: true }); await once(w, "exit"); }',
    'await new Promise((fatto) => setTimeout(fatto, 50));',
  ].join('\n'));
  let n = 0;
  const letture = (extra) => {
    const conteggio = join(cartella, 'conteggio-' + (n += 1) + '.txt');
    writeFileSync(conteggio, '');
    const r = spawnSync(process.execPath, ['--import', pathToFileURL(contatore).href, '--import', AVVIO_URL, principale],
      { env: ambienteDaUtenteVero('P045-18', process.env, { ...extra, P045_CONTEGGIO: conteggio }), encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.equal(r.status, 0, 'stderr: ' + String(r.stderr).slice(0, 600));
    return readFileSync(conteggio, 'utf8').split('\n').filter(Boolean);
  };
  assert.deepEqual(letture({}), ['thread 0'], 'a real user: ONE read per start, in the main thread, none in the two Workers');
  assert.deepEqual(letture({ TALOS_HARNESS_UI_KEYRING: 'memoria' }), [], 'memoria: the system keychain is never opened, nothing to read');
  assert.deepEqual(letture({ TALOS_HARNESS_UI_KEYRING: 'modulo:C:\\finto\\keyring.mjs' }), [], 'modulo: the same');
  assert.deepEqual(letture({ TALOS_PROVA_ISOLATA: '1' }), [], 'a marked run: the environment decides, no read');
});

test('P045-21 — the REAL reader under a held thread: its cscript is not killed by a clock that started at the preload (life 10 s, not 1 s)', { skip: process.platform !== 'win32' }, () => {
  const cartella = mkdtempSync(join(tmpdir(), 'p045-vero-'));
  const principale = join(cartella, 'principale.mjs');
  writeFileSync(principale, [
    'const g = await import(' + JSON.stringify(GUARDIA_URL) + ');',
    'const fine = performance.now() + 2500;',
    'while (performance.now() < fine) { /* the module graph, injected: longer than the old 1 s life of cscript */ }',
    'const t0 = performance.now();',
    'const segno = await g.segnoDiProva({ env: {}, execArgv: [], ambienteDelProcesso: {} });',
    'process.stdout.write(JSON.stringify({ segno, attesa: Math.round(performance.now() - t0), stato: (await g.avviaLetturaAntenati()).stato }));',
  ].join('\n'));
  // the real start module preloads the real read (a real user's environment); above this child sits this file's `node --test`
  const r = spawnSync(process.execPath, ['--import', AVVIO_URL, principale], { env: ambienteDaUtenteVero('P045-21'), encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(r.status, 0, 'stderr: ' + String(r.stderr).slice(0, 600));
  const visto = JSON.parse(r.stdout);
  if (visto.segno === null) {
    // a WMI slower than 2.5 s + 1 s (a loaded machine): then the person waited its full second and the read is still the real one
    assert.ok(visto.attesa >= 900 && ['letto', 'illeggibile'].includes(visto.stato), 'a slow WMI, not a killed read: ' + JSON.stringify(visto));
  } else {
    assert.ok(LANCIATORI_ATTESI.includes(visto.segno.nome), 'the test runner above, read live: ' + JSON.stringify(visto));
    assert.equal(visto.stato, 'letto');
  }
});

test('P045-19 — a parent of another user is alive: EPERM means «exists» (X7), ESRCH means gone', () => {
  const errore = (code) => () => { throw Object.assign(new Error(code), { code }); };
  assert.equal(processoVivo(2147483640, errore('EPERM')), true, 'a parent we may not signal is still a parent: the read happens');
  assert.equal(processoVivo(2147483640, errore('ESRCH')), false, 'a parent that is gone');
  assert.equal(processoVivo(2147483640, () => true), true);
  assert.equal(processoVivo(0, () => true), false, 'no pid, nothing asked');
});

test('P045-20 — an ancestor whose command line has characters outside the console code page is still read, as «?» (X6, measured 11/11)', { skip: process.platform !== 'win32' }, () => {
  const cartella = mkdtempSync(join(tmpdir(), 'p045-accenti-'));
  const padre = join(cartella, 'p045-20-padre.mjs');
  const figlio = join(cartella, 'p045-20-figlio.mjs');
  writeFileSync(figlio, [
    'const g = await import(' + JSON.stringify(GUARDIA_URL) + ');',
    'const tabella = await g.leggiTabellaProcessi({ tempoMassimo: 15000 });',
    'process.stdout.write(JSON.stringify({ letta: tabella instanceof Map, riga: tabella?.get(process.ppid)?.riga ?? null }));',
  ].join('\n'));
  writeFileSync(padre, [
    'import { spawnSync } from "node:child_process";',
    'const r = spawnSync(process.execPath, [' + JSON.stringify(figlio) + '], { encoding: "utf8", windowsHide: true, timeout: 30000 });',
    'process.stdout.write(r.stdout);',
  ].join('\n'));
  const r = spawnSync(process.execPath, [padre, 'Ω-漢字-perché'], { encoding: 'utf8', windowsHide: true, timeout: 40000 });
  const visto = JSON.parse(r.stdout);
  assert.equal(visto.letta, true, 'the whole read does not fail for one accented command line');
  assert.ok(visto.riga.includes('p045-20-padre.mjs'), 'the ancestor is there: ' + visto.riga);
  assert.match(visto.riga, /^[\x20-\x7e]*$/, 'printable ASCII only');
  assert.ok(visto.riga.includes('?-??-perch?'), 'every character outside ASCII became «?»: ' + visto.riga);
});

/*
 * Round (k), 11/11/2026 — reperto A1 of the controller, said true: the comment of `attendiAntenati` promised that a finished read is
 * handled before any timer. It holds only when the thread is free after the first access. Held AFTER the access, the timer wins:
 * the event loop runs due timers before the poll phase that delivers the read (controller 11/11: 5/5 «tempo»). This pins it, so
 * nobody writes the old sentence again: «tempo» with the read done, the person's wait still bounded, the read itself «letto».
 */
test('P045-22 — A1: a read that finishes while the thread is held AFTER the first access loses to the timer («tempo»); the read itself is done', async () => {
  dimenticaLetturaAntenati();
  try {
    const tabella = new Map([[4243, { ppid: 4242, nato: '20261111080000.000001', riga: 'node x' }], [4242, { ppid: 0, nato: '20261111080000.000000', riga: 'node --test' }]]);
    const { execFile } = await import('node:child_process');
    let finita = 0;
    // a real child: its end reaches the read only through the event loop's poll phase
    const leggi = () => new Promise((fatto) => execFile(process.execPath, ['-e', ''], { windowsHide: true }, () => { finita = performance.now(); fatto(tabella); }));
    avviaLetturaAntenati({ leggi, pid: 4243, vivo: () => true });
    await new Promise((fatto) => setImmediate(fatto)); // the child is started
    const t0 = performance.now();
    let decisaQuando = 0;
    const decisa = attendiAntenati({ tempoMassimo: 1000 });
    decisa.then(() => { decisaQuando = performance.now(); });
    while (performance.now() - t0 < 2500) { /* the thread held after the first access: the child ends meanwhile */ }
    const esito = await decisa;
    assert.deepEqual(esito, { segno: null, stato: 'tempo' }, 'the timer of the access fired first, though the read was done');
    const letta = await avviaLetturaAntenati();
    assert.equal(letta.stato, 'letto', 'the read itself finished');
    assert.deepEqual(letta.segno, { tipo: 'antenato', nome: 'node --test', livello: 1 });
    assert.ok(finita > 0 && decisaQuando > 0 && finita >= decisaQuando, 'its result was delivered only after the timer decided: ' + Math.round(finita - decisaQuando) + ' ms');
  } finally { dimenticaLetturaAntenati(); }
});

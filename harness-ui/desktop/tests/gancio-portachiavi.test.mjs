import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SEGNO_GANCIO, OPZIONE_GANCIO, VARIABILE_REGISTRO, ambienteColGancio, portaIlGancio, righeDelGancio } from './gancio-portachiavi.mjs';
import { root } from './support.mjs';

/*
 * 11/11/2026, round 3 (judge v1401 K1, v1402 G1-G2): the positive control of the keyring trip wire, BEFORE any run trusts it.
 * Pure: no server, no shell, no window. Every child here is plain Node running a stub, in a folder under `.prove/` that holds a
 * FAKE `@napi-rs/keyring`, a FAKE native platform package and a FAKE `keyring*.node` (a text file): if the hook ever let one of
 * them through, the fake package would write `RAGGIUNTO.txt` (or the text file would fail as «not a valid Win32 application»).
 * Every child gets an explicit environment WITHOUT the hook (`{}` plus the private trace file): the hook must ride along anyway.
 * Each test writes to its own trace file, so the lines it expects never reach the trace the shell specs read.
 */
function banco(nome) {
  mkdirSync(join(root, '.prove'), { recursive: true });
  const cartella = mkdtempSync(join(root, '.prove', nome + '-'));
  for (const pacchetto of ['keyring', 'keyring-win32-x64-msvc']) {
    const dir = join(cartella, 'node_modules', '@napi-rs', pacchetto);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@napi-rs/' + pacchetto, version: '0.0.0-finto', main: 'index.js' }));
    writeFileSync(join(dir, 'index.js'), "require('fs').appendFileSync(" + JSON.stringify(join(cartella, 'RAGGIUNTO.txt')) + ", '" + pacchetto + "\\n');\n");
  }
  writeFileSync(join(cartella, 'keyring.win32-x64-msvc.node'), 'not a dll');
  return { cartella, registro: join(cartella, 'traccia.jsonl') };
}
const nodo = (cartella, script, env) => spawnSync(process.execPath, [join(cartella, script)], { cwd: cartella, env, encoding: 'utf8', windowsHide: true, timeout: 30000 });

test('SHELL-KEYRING-HOOK — this test process carries the hook (it came in through tests/support.mjs or --import)', () => {
  assert.ok(globalThis[SEGNO_GANCIO], 'the keyring hook is not loaded in the test process');
  assert.equal(globalThis[SEGNO_GANCIO].url, pathToFileURL(join(root, 'tests', 'gancio-portachiavi.mjs')).href);
});

test('SHELL-KEYRING-HOOK-POSITIVE (G1) — import, require, the native package, a keyring .node and process.dlopen all fail and write the trace', () => {
  const { cartella, registro } = banco('gancio-positivo');
  writeFileSync(join(cartella, 'figlio.mjs'), [
    "import { createRequire } from 'node:module';",
    'const require = createRequire(import.meta.url);',
    'const esiti = {};',
    'const prova = async (n, f) => { try { await f(); esiti[n] = "CARICATO"; } catch (e) { esiti[n] = e.code ?? String(e.message).slice(0, 80); } };',
    "await prova('import', () => import('@napi-rs/keyring'));",
    "await prova('require', () => require('@napi-rs/keyring'));",
    "await prova('nativoImport', () => import('@napi-rs/keyring-win32-x64-msvc'));",
    "await prova('nativoRequire', () => require('@napi-rs/keyring-win32-x64-msvc'));",
    "await prova('node', () => require('./keyring.win32-x64-msvc.node'));",
    "await prova('dlopen', () => process.dlopen({ exports: {} }, " + JSON.stringify(join(cartella, 'keyring.win32-x64-msvc.node')) + '));',
    'process.stdout.write(JSON.stringify(esiti));',
    '',
  ].join('\n'));
  const r = nodo(cartella, 'figlio.mjs', { [VARIABILE_REGISTRO]: registro });
  assert.equal(r.status, 97, 'the child must end with the hook\'s exit code; stderr: ' + String(r.stderr).slice(0, 400));
  assert.deepEqual(JSON.parse(r.stdout), { import: 'TALOS_GANCIO_PORTACHIAVI', require: 'TALOS_GANCIO_PORTACHIAVI', nativoImport: 'TALOS_GANCIO_PORTACHIAVI',
    nativoRequire: 'TALOS_GANCIO_PORTACHIAVI', node: 'TALOS_GANCIO_PORTACHIAVI', dlopen: 'TALOS_GANCIO_PORTACHIAVI' });
  assert.equal(existsSync(join(cartella, 'RAGGIUNTO.txt')), false, 'a fake keyring package ran: the hook let it through');
  const righe = righeDelGancio(registro);
  assert.ok(righe.some(x => x.tipo === 'caricato' && x.pid === r.pid), 'the child itself must write that it loaded the hook');
  const bloccate = righe.filter(x => x.tipo === 'bloccato' && x.pid === r.pid);
  assert.equal(bloccate.length, 6, 'one trace line per attempt: ' + JSON.stringify(bloccate));
  assert.deepEqual([...new Set(bloccate.map(x => x.modo))].sort(), ['dlopen', 'resolve']);
  assert.ok(bloccate.some(x => /keyring-win32-x64-msvc$/.test(x.cosa)) && bloccate.some(x => /\.node$/.test(x.cosa)));
});

test('SHELL-KEYRING-HOOK-CHILDREN (G2) — every launch form hands the hook on, even with an explicit empty env, down to the grandchild', () => {
  const { cartella, registro } = banco('gancio-nipoti');
  writeFileSync(join(cartella, 'nipote.cjs'), "try { require('@napi-rs/keyring'); process.stdout.write('CARICATO'); } catch (e) { process.stdout.write(String(e.code)); }\n");
  const nipote = JSON.stringify(join(cartella, 'nipote.cjs'));
  const comando = JSON.stringify('"' + process.execPath + '" "' + join(cartella, 'nipote.cjs') + '"');
  writeFileSync(join(cartella, 'figlio.mjs'), [
    "import * as cp from 'node:child_process';",
    "import { spawn, spawnSync, fork, exec, execSync, execFile, execFileSync } from 'node:child_process';",
    "import { once } from 'node:events';",
    'const vuoto = () => ({ cwd: ' + JSON.stringify(cartella) + ', env: {}, windowsHide: true });',
    'const leggi = async figlio => { let s = ""; figlio.stdout.on("data", d => { s += d; }); await once(figlio, "close"); return s; };',
    'const esiti = {};',
    '// The hook ends a blocked grandchild with exit code 97, so the sync exec forms throw: their output is on the error.',
    'const uscita = f => { try { return String(f()); } catch (e) { return String(e.stdout); } };',
    'esiti.spawn = await leggi(spawn(process.execPath, [' + nipote + '], vuoto()));',
    'esiti.fork = await leggi(fork(' + nipote + ', [], { ...vuoto(), silent: true }));',
    'esiti.exec = await new Promise(f => exec(' + comando + ', vuoto(), (_e, out) => f(String(out))));',
    'esiti.execFile = await new Promise(f => execFile(process.execPath, [' + nipote + '], vuoto(), (_e, out) => f(String(out))));',
    'esiti.spawnSync = String(spawnSync(process.execPath, [' + nipote + '], vuoto()).stdout);',
    'esiti.execSync = uscita(() => execSync(' + comando + ', vuoto()));',
    'esiti.execFileSync = uscita(() => execFileSync(process.execPath, [' + nipote + '], vuoto()));',
    'esiti.namespaceSpawnSync = String(cp.spawnSync(process.execPath, [' + nipote + '], vuoto()).stdout);',
    'esiti.senzaOpzioni = uscita(() => cp.execFileSync(process.execPath, [' + nipote + ']));',
    'process.stdout.write(JSON.stringify(esiti));',
    '',
  ].join('\n'));
  const r = nodo(cartella, 'figlio.mjs', { [VARIABILE_REGISTRO]: registro });
  assert.equal(r.status, 0, 'stderr: ' + String(r.stderr).slice(0, 600));
  const esiti = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(esiti).sort(), ['exec', 'execFile', 'execFileSync', 'execSync', 'fork', 'namespaceSpawnSync', 'senzaOpzioni', 'spawn', 'spawnSync']);
  for (const [forma, esito] of Object.entries(esiti)) assert.equal(esito, 'TALOS_GANCIO_PORTACHIAVI', forma + ': the grandchild must have the hook');
  assert.equal(existsSync(join(cartella, 'RAGGIUNTO.txt')), false);
  const righe = righeDelGancio(registro);
  // The two shell forms go through cmd.exe, so their grandchild's parent is the shell, not the child: counted by pid, not by ppid.
  assert.equal(righe.filter(x => x.tipo === 'caricato' && x.pid !== r.pid).length, 9, 'one hooked grandchild per launch form');
  assert.equal(righe.filter(x => x.tipo === 'bloccato' && x.pid !== r.pid).length, 9);
});

/*
 * Round k3, 11/11/2026 (judge v1521-v1522, PR #23 run 43049961767): node v24.22.2 hands the process_wrap binding POSITIONAL
 * arguments (`lib/internal/child_process.js:438-447`: file, args, cwd, envPairs, stdio, flags, uid, gid), where v24.18.0 handed one
 * options object (`:401`). The hook read `opzioni.envPairs` of a string, called it «unknown» and refused 293 children in the CI:
 * about 567 tests fell. A child is never refused now: it starts, and its environment carries two walls that reach its own children
 * too, (1) the hook in NODE_OPTIONS, always, (2) TALOS_HARNESS_UI_KEYRING=memoria unless the child already has its own choice.
 */
const leggiMuri = "const muri = coppie => { const e = {}; for (const c of coppie ?? []) { const s = String(c); const i = s.indexOf('='); e[s.slice(0, i).toUpperCase()] = s.slice(i + 1); }"
  + " return { gancio: String(e.NODE_OPTIONS ?? '').split(/\\s+/).includes(" + JSON.stringify(OPZIONE_GANCIO) + "), portachiavi: e.TALOS_HARNESS_UI_KEYRING ?? 'NONE', segno: e.TALOS_PROVA_ISOLATA ?? 'NONE', proprio: e.PROPRIO ?? 'NONE' }; };";

test('SHELL-KEYRING-HOOK-NEVER-REFUSES (CI #23) — a child with unusual options starts with both walls; bad options get node\'s own error', async () => {
  const { cartella, registro } = banco('gancio-mai-rifiuto');
  const scrivi = join(cartella, 'scrivi.cjs');
  writeFileSync(scrivi, leggiMuri + "\nrequire('fs').writeFileSync(process.argv[2], JSON.stringify(muri(Object.entries(process.env).map(([k, v]) => k + '=' + v))));\n");
  const prima = process.env[VARIABILE_REGISTRO];
  process.env[VARIABILE_REGISTRO] = registro;
  try {
    for (const [nome, envPairs] of [['coppie-non-coppie', 'not pairs'], ['senza-coppie', undefined]]) {
      const figlio = new ChildProcess();
      const uscita = once(figlio, 'exit');
      figlio.spawn({ file: process.execPath, args: [process.execPath, scrivi, join(cartella, nome + '.json')], envPairs, stdio: 'ignore', windowsHide: true });
      assert.ok(figlio.pid > 0, nome + ': the child must start');
      await uscita;
      const visto = JSON.parse(readFileSync(join(cartella, nome + '.json'), 'utf8'));
      assert.deepEqual({ gancio: visto.gancio, portachiavi: visto.portachiavi, segno: visto.segno }, { gancio: true, portachiavi: 'memoria', segno: '1' }, nome);
    }
    assert.throws(() => spawnSync(process.execPath, ['-e', '1'], 'not options'), { code: 'ERR_INVALID_ARG_TYPE' }, 'bad options: node\'s own error, never the hook\'s');
  } finally { if (prima === undefined) delete process.env[VARIABILE_REGISTRO]; else process.env[VARIABILE_REGISTRO] = prima; }
  assert.equal(righeDelGancio(registro).filter(x => x.tipo === 'rifiutato').length, 0, 'no refusal');
});

test('SHELL-KEYRING-HOOK-BINDING-FORMS (CI #23) — the raw spawn binding, positional (node >= 24.22) and with one object (node <= 24.18): both walls, nothing refused', () => {
  const { cartella, registro } = banco('gancio-forme-legame');
  // A stand-in for the binding, loaded BEFORE the hook (NODE_OPTIONS order): it records what the hook hands it and starts nothing.
  writeFileSync(join(cartella, 'legame-finto.mjs'), "const { Process } = process.binding('process_wrap');\nglobalThis.__legame = [];\nProcess.prototype.spawn = function legameFinto(...a) { globalThis.__legame.push(a); return 0; };\n");
  writeFileSync(join(cartella, 'figlio.mjs'), [
    leggiMuri,
    "const { Process } = process.binding('process_wrap');",
    'const esiti = {};',
    'const prova = (nome, f, prendi) => { try { f(); esiti[nome] = muri(prendi(globalThis.__legame.at(-1))); } catch (e) { esiti[nome] = e.code ?? String(e.message).slice(0, 80); } };',
    "prova('posizionale', () => new Process().spawn(process.execPath, [process.execPath, '-e', '1'], undefined, ['PROPRIO=1'], [], 0), a => a[3]);",
    "prova('posizionaleSenzaCoppie', () => new Process().spawn(process.execPath, [process.execPath, '-e', '1'], undefined, undefined, [], 0), a => a[3]);",
    "prova('oggetto', () => new Process().spawn({ file: process.execPath, args: [process.execPath, '-e', '1'], envPairs: ['PROPRIO=1'], stdio: [] }), a => a[0].envPairs);",
    'process.stdout.write(JSON.stringify(esiti));',
    '',
  ].join('\n'));
  const r = nodo(cartella, 'figlio.mjs', { [VARIABILE_REGISTRO]: registro, NODE_OPTIONS: '--import=' + pathToFileURL(join(cartella, 'legame-finto.mjs')).href, PROPRIO: '2' });
  assert.equal(r.status, 0, 'stderr: ' + String(r.stderr).slice(0, 600));
  const muri = { gancio: true, portachiavi: 'memoria', segno: '1' };
  assert.deepEqual(JSON.parse(r.stdout), { posizionale: { ...muri, proprio: '1' }, posizionaleSenzaCoppie: { ...muri, proprio: '2' }, oggetto: { ...muri, proprio: '1' } },
    'every form reaches the binding with the hook in NODE_OPTIONS, the memory keychain and the mark; its own variables kept');
  assert.equal(righeDelGancio(registro).filter(x => x.tipo === 'rifiutato').length, 0);
});

test('SHELL-KEYRING-HOOK-SHELL-GRANDCHILD (CI #23) — a node grandchild started by a shell, from a child with an empty env, has both walls', () => {
  const { cartella, registro } = banco('gancio-nipote-shell');
  writeFileSync(join(cartella, 'nipote.cjs'), "let importa; try { require('@napi-rs/keyring'); importa = 'CARICATO'; } catch (e) { importa = e.code; }\n"
    + "process.stdout.write(JSON.stringify({ gancio: Boolean(globalThis[Symbol.for('talos.prova.gancioPortachiavi')]), portachiavi: process.env.TALOS_HARNESS_UI_KEYRING ?? 'NONE', importa }));\n");
  const comando = JSON.stringify('"' + process.execPath + '" "' + join(cartella, 'nipote.cjs') + '"');
  writeFileSync(join(cartella, 'figlio.mjs'), [
    "import { exec, spawn } from 'node:child_process';",
    "import { once } from 'node:events';",
    'const vuoto = () => ({ cwd: ' + JSON.stringify(cartella) + ', env: {}, windowsHide: true });',
    'const esiti = {};',
    'esiti.exec = await new Promise(f => exec(' + comando + ', vuoto(), (_e, out) => f(JSON.parse(String(out)))));',
    'const s = spawn(' + comando + ', { ...vuoto(), shell: true }); let out = ""; s.stdout.on("data", d => { out += d; }); await once(s, "close"); esiti.shell = JSON.parse(out);',
    'process.stdout.write(JSON.stringify(esiti));',
    '',
  ].join('\n'));
  const r = nodo(cartella, 'figlio.mjs', { [VARIABILE_REGISTRO]: registro });
  assert.equal(r.status, 0, 'stderr: ' + String(r.stderr).slice(0, 600));
  const atteso = { gancio: true, portachiavi: 'memoria', importa: 'TALOS_GANCIO_PORTACHIAVI' };
  assert.deepEqual(JSON.parse(r.stdout), { exec: atteso, shell: atteso });
  assert.equal(existsSync(join(cartella, 'RAGGIUNTO.txt')), false, 'the fake keyring never ran');
});

test('SHELL-KEYRING-HOOK-MEMORY-WALL (CI #23, v1522) — a child that looks for the keychain finds memory; a child with its own choice keeps it, and the real keyring stays out', () => {
  const { cartella, registro } = banco('gancio-muro-memoria');
  const adattatore = pathToFileURL(join(root, '..', 'src', 'adattatore-keyring.mjs')).href;
  writeFileSync(join(cartella, 'custodia-finta.mjs'), 'const voci = new Map();\nexport function creaPortachiavi() { return { get: (s, a) => voci.get(s + "/" + a) ?? null, set: (s, a, v) => { voci.set(s + "/" + a, v); }, remove: (s, a) => { voci.delete(s + "/" + a); } }; }\n');
  writeFileSync(join(cartella, 'figlio.mjs'), [
    'const { leggiSceltaPortachiavi, creaAdattatorePortachiavi } = await import(' + JSON.stringify(adattatore) + ');',
    'const scelta = leggiSceltaPortachiavi(process.env);',
    'const custodia = await creaAdattatorePortachiavi(process.env);',
    "custodia.set('talos-prova', 'k3', 'valore-finto');",
    "let vero; try { await import('@napi-rs/keyring'); vero = 'CARICATO'; } catch (e) { vero = e.code; }",
    "process.exitCode = 0; process.stdout.write(JSON.stringify({ scelta, letto: custodia.get('talos-prova', 'k3'), vero }));",
    '',
  ].join('\n'));
  const memoria = nodo(cartella, 'figlio.mjs', { [VARIABILE_REGISTRO]: registro });
  assert.equal(memoria.status, 0, 'stderr: ' + String(memoria.stderr).slice(0, 600));
  assert.deepEqual(JSON.parse(memoria.stdout), { scelta: 'memoria', letto: 'valore-finto', vero: 'TALOS_GANCIO_PORTACHIAVI' }, 'no choice of its own: the memory keychain');
  const modulo = join(cartella, 'custodia-finta.mjs');
  const suo = nodo(cartella, 'figlio.mjs', { [VARIABILE_REGISTRO]: registro, TALOS_HARNESS_UI_KEYRING: 'modulo:' + modulo });
  assert.equal(suo.status, 0, 'stderr: ' + String(suo.stderr).slice(0, 600));
  assert.deepEqual(JSON.parse(suo.stdout), { scelta: { modulo }, letto: 'valore-finto', vero: 'TALOS_GANCIO_PORTACHIAVI' }, 'its own choice is kept: the keychain module works, the real keyring stays blocked');
  assert.equal(existsSync(join(cartella, 'RAGGIUNTO.txt')), false, 'the fake keyring package never ran');
});

test('SHELL-KEYRING-HOOK-ENV — the env a child receives: one NODE_OPTIONS spelling, the options kept, the hook once, the trace file', () => {
  const env = ambienteColGancio({ node_options: '--max-old-space-size=64', NODE_OPTIONS: '--no-warnings', PATH: 'x' });
  assert.deepEqual(Object.keys(env).filter(k => k.toUpperCase() === 'NODE_OPTIONS'), ['NODE_OPTIONS']);
  assert.deepEqual(env.NODE_OPTIONS.split(' ').sort(), ['--max-old-space-size=64', '--no-warnings', OPZIONE_GANCIO].sort());
  assert.equal(ambienteColGancio(env).NODE_OPTIONS, env.NODE_OPTIONS, 'the hook is never added twice');
  assert.ok(portaIlGancio(env));
  assert.equal(portaIlGancio({ NODE_OPTIONS: OPZIONE_GANCIO }), false, 'without the trace file the hook could not report');
  assert.equal(portaIlGancio({ NODE_OPTIONS: '--import=file:///altro.mjs', [VARIABILE_REGISTRO]: 'x' }), false);
});

/*
 * 11/11/2026, last piece of round 4 (owner 09:41, «segno obbligatorio nelle prove»): on a saturated machine the product guard's
 * ancestry read times out after 1 s and a child with a rebuilt environment was unmarked (probes a2 and c2 under the hook, 09:33).
 * The hook now marks EVERY child of a test process, the raw channels the controller used included. Red before, green after.
 */
test('SHELL-KEYRING-MARK-EVERY-CHANNEL — every child of a hooked process carries TALOS_PROVA_ISOLATA=1, through the raw channels too', () => {
  const { cartella, registro } = banco('gancio-segno-canali');
  writeFileSync(join(cartella, 'nipote.cjs'), "require('fs').writeFileSync(process.argv[2], String(process.env.TALOS_PROVA_ISOLATA ?? 'NONE'));\n");
  const nipote = join(cartella, 'nipote.cjs');
  const esito = nome => join(cartella, 'esito-' + nome + '.txt');
  const lavoro = nome => JSON.stringify("require('fs').writeFileSync(" + JSON.stringify(esito(nome)) + ", String(process.env.TALOS_PROVA_ISOLATA ?? 'NONE'));");
  writeFileSync(join(cartella, 'figlio.mjs'), [
    "import { spawnSync } from 'node:child_process';",
    "import { Worker, SHARE_ENV } from 'node:worker_threads';",
    "import { once } from 'node:events';",
    'const nipote = ' + JSON.stringify(nipote) + ';',
    "const tubi = [{ type: 'pipe', readable: true, writable: false }, { type: 'pipe', readable: false, writable: true }, { type: 'pipe', readable: false, writable: true }];",
    "process.binding('spawn_sync').spawn({ file: process.execPath, args: [process.execPath, nipote, " + JSON.stringify(esito('binding-spawn_sync')) + "], envPairs: ['SystemRoot=' + process.env.SystemRoot], windowsHide: true, stdio: tubi });",
    "const { Process } = process.binding('process_wrap');",
    'const p = new Process();',
    '// the form of the binding: one object up to node 24.18, positional from 24.22 (lib/internal/child_process.js:438-447 of v24.22.2)',
    "const [maggiore, minore] = process.versions.node.split('.').map(Number); const posizionale = maggiore > 24 || (maggiore === 24 && minore >= 22);",
    "await new Promise(fatto => { p.onexit = () => { p.close(); fatto(); }; const argomenti = [process.execPath, nipote, " + JSON.stringify(esito('binding-process_wrap')) + "], coppie = ['SystemRoot=' + process.env.SystemRoot], tubi = [{ type: 'ignore' }, { type: 'ignore' }, { type: 'ignore' }]; const errore = posizionale ? p.spawn(process.execPath, argomenti, undefined, coppie, tubi, 0) : p.spawn({ file: process.execPath, args: argomenti, envPairs: coppie, windowsHide: true, stdio: tubi }); if (errore) fatto(); });",
    "spawnSync(process.execPath, [nipote, " + JSON.stringify(esito('spawnSync-env-vuoto')) + "], { env: {}, windowsHide: true });",
    'for (const [nome, opzioni] of [["worker-env-vuoto", { env: {}, execArgv: [] }], ["worker-di-serie", {}], ["worker-share-env", { env: SHARE_ENV }]]) {',
    '  const codici = { "worker-env-vuoto": ' + lavoro('worker-env-vuoto') + ', "worker-di-serie": ' + lavoro('worker-di-serie') + ', "worker-share-env": ' + lavoro('worker-share-env') + ' };',
    '  const w = new Worker(codici[nome], { eval: true, ...opzioni });',
    "  await once(w, 'exit');",
    '}',
    '',
  ].join('\n'));
  const r = nodo(cartella, 'figlio.mjs', { [VARIABILE_REGISTRO]: registro });
  assert.equal(r.status, 0, 'stderr: ' + String(r.stderr).slice(0, 600));
  const visti = Object.fromEntries(['binding-spawn_sync', 'binding-process_wrap', 'spawnSync-env-vuoto', 'worker-env-vuoto', 'worker-di-serie', 'worker-share-env']
    .map(nome => [nome, existsSync(esito(nome)) ? readFileSync(esito(nome), 'utf8') : 'NOT RUN']));
  assert.deepEqual(visti, { 'binding-spawn_sync': '1', 'binding-process_wrap': '1', 'spawnSync-env-vuoto': '1', 'worker-env-vuoto': '1', 'worker-di-serie': '1', 'worker-share-env': '1' },
    'every child and worker of a test process carries the explicit mark');
});

/*
 * Round (k), 11/11/2026 (owner «aggancio in OGNI node --test», controller's reperto k): once the server suite runs under the hook,
 * the real-user controls of P045 (15, 16, 17, 18, 21) can no longer start a child that looks like a person to the product guard:
 * the hook marks every child. The exemption is NAMED, one test at a time (`esenzioni-utente-vero.mjs`): that child gets no mark of
 * any kind, but it still carries the hook's trip wire (the keyring cannot load), and its own children are marked again. A name that
 * is not on the list does not start.
 */
test('SHELL-KEYRING-REAL-USER-NAMED — a named real-user control child has no mark but keeps the trip wire; its children are marked; an unnamed one does not start', async () => {
  const { VARIABILE_UTENTE_VERO } = await import('./esenzioni-utente-vero.mjs');
  const { cartella, registro } = banco('gancio-utente-vero');
  writeFileSync(join(cartella, 'nipote.cjs'), "process.stdout.write(JSON.stringify({ segno: process.env.TALOS_PROVA_ISOLATA ?? 'NONE', esente: process.env.TALOS_PROVA_UTENTE_VERO ?? 'NONE', scelta: process.env.TALOS_HARNESS_UI_KEYRING ?? 'NONE' }));\n");
  const guardia = pathToFileURL(join(root, '..', 'src', 'guardia-portachiavi-prove.mjs')).href;
  writeFileSync(join(cartella, 'figlio.mjs'), [
    "import { spawnSync } from 'node:child_process';",
    'const g = await import(' + JSON.stringify(guardia) + ');',
    "const segni = Object.keys(process.env).filter(k => ['TALOS_PROVA_ISOLATA', 'TALOS_PROVA_GANCIO_REGISTRO', 'NODE_TEST_CONTEXT', 'NODE_TEST_WORKER_ID'].includes(k.toUpperCase()));",
    "const esito = { segni, simbolo: Boolean(globalThis[Symbol.for('talos.prova.gancioPortachiavi')]), guardia: g.segnoNellAmbiente(process.env, process.execArgv), scelta: process.env.TALOS_HARNESS_UI_KEYRING ?? 'NONE' };",
    "try { await import('@napi-rs/keyring'); esito.portachiavi = 'CARICATO'; } catch (e) { esito.portachiavi = e.code; }",
    'esito.nipote = JSON.parse(String(spawnSync(process.execPath, [' + JSON.stringify(join(cartella, 'nipote.cjs')) + '], { windowsHide: true }).stdout));',
    'process.stdout.write(JSON.stringify(esito));',
    '',
  ].join('\n'));
  const r = nodo(cartella, 'figlio.mjs', { [VARIABILE_REGISTRO]: registro, [VARIABILE_UTENTE_VERO]: 'P045-18' });
  assert.equal(r.status, 97, 'the blocked keyring still ends the child with the hook\'s code; stderr: ' + String(r.stderr).slice(0, 600));
  assert.deepEqual(JSON.parse(r.stdout), { segni: [], simbolo: false, guardia: null, scelta: 'NONE', portachiavi: 'TALOS_GANCIO_PORTACHIAVI', nipote: { segno: '1', esente: 'NONE', scelta: 'memoria' } },
    'no mark for the product guard, the trip wire on, the grandchild marked again and not exempt');
  assert.equal(existsSync(join(cartella, 'RAGGIUNTO.txt')), false, 'the fake keyring never ran');
  const righe = righeDelGancio(registro);
  assert.ok(righe.some(x => x.tipo === 'caricato' && x.pid === r.pid && x.esenzione === 'P045-18'), 'the exempt child writes its name in the trace');
  assert.ok(righe.some(x => x.tipo === 'bloccato' && x.pid === r.pid), 'and its blocked keyring');
  // AL CONTRARIO: a name that is not on the list, or no name at all, does not start (a new exception without a name fails)
  const prima = process.env[VARIABILE_REGISTRO];
  process.env[VARIABILE_REGISTRO] = registro;
  try {
    for (const nome of ['P045-99', '', 'tutti']) {
      assert.throws(() => spawnSync(process.execPath, ['-e', '1'], { env: { [VARIABILE_UTENTE_VERO]: nome }, windowsHide: true }), { code: 'TALOS_GANCIO_RIFIUTATO' }, JSON.stringify(nome));
    }
  } finally { if (prima === undefined) delete process.env[VARIABILE_REGISTRO]; else process.env[VARIABILE_REGISTRO] = prima; }
  const rifiuti = righeDelGancio(registro).filter(x => x.tipo === 'rifiutato');
  assert.equal(rifiuti.length, 3, 'one refusal line per unnamed exemption');
  // the refusal says WHY (the name), not only that the child lacked its trace: mutant M9 of round k (the name check removed, the
  // later trace check still refusing) stayed alive on the count alone
  assert.deepEqual(rifiuti.map(x => x.cosa), ['P045-99', '', 'tutti'].map(n => 'a real-user exemption without a name of the list: ' + JSON.stringify(n)));
});

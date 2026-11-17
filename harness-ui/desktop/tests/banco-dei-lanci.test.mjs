import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as runtimeVero from '../runtime.mjs';
import { leggiPortachiaviDiProva } from '../../src/adattatore-keyring.mjs';
import { preparaRuntime, root } from './support.mjs';
import * as senzaChiavi from './ambiente-senza-chiavi.mjs';
import { CHIAVI_FINTE, NOME, NOMI_DI_LANCIO, SPEC_FUORI, ambienteDiChiCorre, creaRegistratore, eInerte, eseguiNelBanco, importazioni, inerte, moduliVeri, opzioniTolleranti, soloCodice } from './banco-dei-lanci.mjs';

/*
 * 11/11/2026, round 3 (judge v1401 K1, K2, K4, K5, K6): every spec of the shell, run WHOLE on the bench (`banco-dei-lanci.mjs`),
 * every launch caught at the moment it happens. The spec list is the folder (K4: a new spec is in on the day it is written); the
 * only spec left out is named here with its reason. The environment a spec sees has no test keyring and carries invented keys
 * (K2, K5), so a launch that inherits it is red whoever runs the tests. Every red says the spec file and line (K6).
 */
const cartella = join(root, 'tests');
const SPEC = readdirSync(cartella).filter(n => n.endsWith('.spec.mjs') && !Object.hasOwn(SPEC_FUORI, n)).sort();

// One real test environment, built with the variable ABSENT and the invented keys PLANTED in the real ambient, then put back.
function conAmbiente(valori, fn) {
  const prima = Object.fromEntries(Object.keys(valori).map(k => [k, process.env[k]]));
  for (const [k, v] of Object.entries(valori)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { return fn(); } finally { for (const [k, v] of Object.entries(prima)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}
const provaVera = conAmbiente({ [NOME]: undefined, ...CHIAVI_FINTE }, () => preparaRuntime('banco-lanci'));
const nuovaProva = () => ({ ...provaVera, env: { ...provaVera.env } });

function processoDelBanco() {
  return inerte('process', { env: { ...ambienteDiChiCorre(), TALOS_FOTO_BARRA: join(provaVera.dataDir, 'foto') }, execPath: process.execPath,
    platform: process.platform, arch: process.arch, versions: process.versions, pid: process.pid, argv: [...process.argv], exitCode: undefined });
}
const ELETTRONE = join(provaVera.dataDir, 'electron-finto.exe');

/** What each import of a spec is bound to on the bench: the pure helpers are real, the launchers record, the rest is inert. */
function legami(legamiDelTesto, registra, tests, segni) {
  const ambito = {};
  // The real runtime helpers; one that cannot work on a stand-in (no page, no server) gives a stand-in back. `creaAvvioFiglio` stays
  // strict: if it refuses, the launch after it is never reached and the spec turns red with «reached no launch».
  const tolleranti = Object.fromEntries(Object.entries(runtimeVero).map(([k, f]) => [k, typeof f !== 'function' ? f
    : (...a) => { try { return f(...a); } catch { return inerte(k + '()', {}, registra); } }]));
  const runtime = { ...tolleranti, creaAvvioFiglio: o => runtimeVero.creaAvvioFiglio(opzioniTolleranti(o)),
    risolviPercorsi: o => runtimeVero.risolviPercorsi(opzioniTolleranti(o)), scegliMotoreLocale: () => null,
    scegliPortaEffimera: async () => 49152, scegliPortaPersistente: async () => 49152 };
  const moduli = {
    ...moduliVeri,
    /* round k (11/11, the candidate's `finestra-artefatto-rete.spec.mjs`): a spec may launch from `before`/`beforeEach`, so those run
       as bodies too, in file order; `after`/`afterEach` only clean up and stay inert */
    'node:test': { default: Object.assign((...a) => { tests.push(a.find(x => typeof x === 'function')); }, { skip: () => {}, todo: () => {} }),
      before: (...a) => { tests.push(a.find(x => typeof x === 'function')); }, beforeEach: (...a) => { tests.push(a.find(x => typeof x === 'function')); },
      after: () => {}, afterEach: () => {} },
    // `resolve` and `cache` too (round 4): `scripts/prova-pty.mjs` asks where node-pty is before it loads it in its Electron branch.
    'node:module': { createRequire: () => Object.assign(nome => (nome === 'electron' ? ELETTRONE : inerte('require(' + nome + ')', {}, registra)),
      { resolve: nome => join(provaVera.dataDir, 'risolto', String(nome)), cache: {} }) },
    // K1, the spec side: the mark taken before the launches, the trace read after them (recorded, in order, never real here).
    './support.mjs': { root, preparaRuntime: nuovaProva, lineeDelGancio: () => { segni.push({ tipo: 'segno', lanciPrima: segni.lanci() }); return 0; },
      nessunPortachiaviVero: () => { segni.push({ tipo: 'lettura', lanciPrima: segni.lanci() }); }, figlioColGancio: () => true },
    '../runtime.mjs': runtime,
    '../../src/adattatore-keyring.mjs': { leggiPortachiaviDiProva },
    './ambiente-senza-chiavi.mjs': senzaChiavi, '../tests/ambiente-senza-chiavi.mjs': senzaChiavi,
  };
  for (const { modulo, nome, esportato } of legamiDelTesto) {
    if (modulo === 'node:child_process') {
      if (NOMI_DI_LANCIO.has(esportato)) ambito[nome] = (...a) => registra(nome, esportato, a);
      else if (esportato === '*' || esportato === 'default') ambito[nome] = inerte(nome, {}, registra);
      continue;
    }
    const m = moduli[modulo];
    if (!m) continue; // an inert stand-in, from the bench's own scope
    if (esportato === '*') ambito[nome] = m;
    else if (Object.hasOwn(m, esportato)) ambito[nome] = m[esportato];
  }
  return ambito;
}

async function lanciDi(nomeFile, testoDato, { file = join(cartella, nomeFile), processo: processoDato } = {}) {
  const { testo, legami: daImport } = importazioni(testoDato ?? readFileSync(file, 'utf8'), 'tests/' + nomeFile);
  const lanci = []; const tests = []; const segni = Object.assign([], { lanci: () => lanci.length });
  const processo = processoDato ?? processoDelBanco();
  const registra = creaRegistratore({ file, processo, lanci });
  const { esito, corpo, ferma } = await eseguiNelBanco(testo, { ambito: legami(daImport, registra, tests, segni), file, processo, registra });
  const esiti = [esito];
  // Per body: the launches it made, and whether it took the trace mark BEFORE the first of them (K1: «the test reads the file
  // after each launch» needs a mark taken before it; the reading itself sits after windows the bench cannot open).
  const corpi = [{ nome: 'top level', lanci: lanci.length, segnato: false }];
  for (const fn of tests) {
    const primaL = lanci.length; const primaS = segni.length;
    esiti.push(await corpo(fn));
    const miei = segni.slice(primaS);
    corpi.push({ nome: 'test ' + corpi.length, lanci: lanci.length - primaL, segnato: miei.some(s => s.tipo === 'segno' && s.lanciPrima === primaL) });
  }
  ferma();
  return { lanci, esiti, tests: tests.length, corpi, letture: [...soloCodice(testoDato ?? readFileSync(file, 'utf8')).matchAll(/\bnessunPortachiaviVero\(/g)].length };
}

function controlla(lancio, nomeFile) {
  const dove = 'tests/' + nomeFile + ':' + lancio.riga + ' (' + lancio.chi + ')';
  const env = lancio.ambiente;
  assert.ok(env && typeof env === 'object' && !eInerte(env), dove + ': the launch hands the child no environment the bench can read');
  assert.equal(leggiPortachiaviDiProva(env), true, dove + ': the child would not get TALOS_HARNESS_UI_KEYRING=memoria (it could open the real keyring)');
  // Round 4 (P045): and the explicit mark the product guard reads, the one barrier that holds where the hook cannot (packaged app).
  assert.equal(env.TALOS_PROVA_ISOLATA, '1', dove + ': the child would not get TALOS_PROVA_ISOLATA=1 (the product guard could not see a test run)');
  const nomi = Object.keys(env).filter(k => Object.keys(CHIAVI_FINTE).includes(k.toUpperCase()));
  assert.deepEqual(nomi, [], dove + ': provider key names reach the child');
  const valori = new Set(Object.values(CHIAVI_FINTE));
  assert.deepEqual(Object.keys(env).filter(k => valori.has(String(env[k]))), [], dove + ': a planted key value reaches the child under another name');
}

test('SHELL-KEYRING-BENCH-CONTROL — the bench catches a launch that inherits the runner (positive control before trusting it)', async () => {
  const finto = "import { spawnSync } from 'node:child_process';\nimport * as cp from 'node:child_process';\n\nspawnSync('x', ['y']);\ncp.fork('z', { env: { PATH: 'p' } });\n";
  const { lanci } = await lanciDi('controllo-finto.spec.mjs', finto);
  assert.deepEqual(lanci.map(l => [l.riga, l.api]), [[4, 'spawnSync'], [5, 'fork']]);
  assert.throws(() => controlla(lanci[0], 'controllo-finto.spec.mjs'), /controllo-finto\.spec\.mjs:4 \(spawnSync\): the child would not get/);
  assert.equal(lanci[0].ambiente.GEMINI_API_KEY, CHIAVI_FINTE.GEMINI_API_KEY, 'the runner a spec sees carries the invented keys');
  assert.equal(lanci[0].ambiente[NOME], undefined, 'the runner a spec sees has no test keyring');
});

test('SHELL-KEYRING-BENCH — every launch of every shell spec, caught when it happens, hands the child memoria and no key', async t => {
  assert.ok(SPEC.length >= 6, 'the shell specs were not found in ' + cartella);
  const rossi = [];
  for (const nomeFile of SPEC) {
    const { lanci, esiti, tests, corpi, letture } = await lanciDi(nomeFile);
    t.diagnostic('tests/' + nomeFile + ': ' + tests + ' test(s), launches at ' + lanci.map(l => ':' + l.riga + ' ' + l.api).join(', ') + ' · bodies: ' + esiti.map(e => e.slice(0, 40)).join(' | '));
    if (!lanci.length) rossi.push('tests/' + nomeFile + ': the bench reached no launch — extend the bench with the spec (' + esiti.join(' | ') + ')');
    for (const lancio of lanci) { try { controlla(lancio, nomeFile); } catch (e) { rossi.push(e.message.split('\n')[0]); } }
    const conLanci = corpi.filter(c => c.lanci > 0);
    for (const c of conLanci.filter(c => !c.segnato)) rossi.push('tests/' + nomeFile + ' (' + c.nome + '): launches without `lineeDelGancio()` taken before the first one (K1)');
    if (letture < conLanci.length) rossi.push('tests/' + nomeFile + ': ' + conLanci.length + ' test bodies launch, the keyring trace is read ' + letture + ' times (K1: `nessunPortachiaviVero`)');
  }
  assert.deepEqual(rossi, [], 'launches that could reach the real keyring or leak a key:\n' + rossi.join('\n'));
});

/*
 * 11/11/2026, round 4 (controller of round 3, «medium»): three files handed the whole runner environment to children that need no
 * key (`ci-smoke.test.mjs:11` and `workflow.test.mjs:209,:230,:239` to PowerShell and git, `scripts/prova-pty.mjs:11,:21` to Electron
 * and to the PTY). Run whole on the bench with keys planted under every spelling the controller tried, also the names without
 * KEY/TOKEN/SECRET/PASSWORD: no planted name and no planted value may reach a child. They start no TALOS server, so no memoria here.
 */
const CHIAVI_LARGHE = Object.freeze({ ...CHIAVI_FINTE, openai_api_key: 'finto-largo-0101', Github_Token: 'finto-largo-0102',
  AWS_SECRET_ACCESS_KEY: 'finto-largo-0103', GOOGLE_APPLICATION_CREDENTIALS: 'finto-largo-0104', OPENROUTER_PAT: 'finto-largo-0105',
  AZURE_OPENAI_AD_CREDENTIAL: 'finto-largo-0106', CLAUDE_CODE_OAUTH_TOKEN: 'finto-largo-0107', DEEPSEEK_APIKEY: 'finto-largo-0108' });
const FILE_SENZA_CHIAVI = Object.freeze([['tests/ci-smoke.test.mjs', {}], ['tests/workflow.test.mjs', {}],
  ['scripts/prova-pty.mjs', {}], ['scripts/prova-pty.mjs', { electron: '39.0.0' }]]);

function nessunaChiave(lancio, dove) {
  const env = lancio.ambiente;
  const posto = dove + ':' + lancio.riga + ' (' + lancio.chi + ')';
  if (!env || typeof env !== 'object' || eInerte(env)) return posto + ': the launch hands the child no environment the bench can read';
  const nomi = Object.keys(env).filter(k => Object.keys(CHIAVI_LARGHE).some(n => n.toUpperCase() === k.toUpperCase()));
  const valori = new Set(Object.values(CHIAVI_LARGHE));
  const sotto = Object.keys(env).filter(k => valori.has(String(env[k])));
  return nomi.length || sotto.length ? posto + ': keys reach the child: ' + JSON.stringify([...new Set([...nomi, ...sotto])]) : null;
}

test('SHELL-KEYRING-NOKEYS — the launches of ci-smoke, workflow and prova-pty hand their children no key, under any spelling, and the explicit mark', async t => {
  const rossi = [];
  let quanti = 0;
  for (const [relativo, versioni] of FILE_SENZA_CHIAVI) {
    const file = join(root, relativo);
    // Last piece (owner 11/11 09:41): the runner's own mark is taken away, so only the helper can put it back on the child.
    const senzaSegno = Object.fromEntries(Object.entries(ambienteDiChiCorre()).filter(([k]) => k.toUpperCase() !== 'TALOS_PROVA_ISOLATA'));
    const processo = inerte('process', { env: { ...senzaSegno, ...CHIAVI_LARGHE }, execPath: process.execPath, platform: 'win32',
      arch: process.arch, versions: { ...process.versions, ...versioni }, pid: process.pid, argv: [...process.argv], exitCode: undefined });
    const { lanci, esiti } = await lanciDi(relativo, undefined, { file, processo });
    t.diagnostic(relativo + (versioni.electron ? ' (Electron branch)' : '') + ': launches at ' + lanci.map(l => ':' + l.riga + ' ' + l.api).join(', ') + ' · ' + esiti.map(e => e.slice(0, 30)).join(' | '));
    if (!lanci.length) rossi.push(relativo + ': the bench reached no launch (' + esiti.join(' | ') + ')');
    quanti += lanci.length;
    for (const l of lanci) { const r = nessunaChiave(l, relativo); if (r) rossi.push(r); }
    for (const l of lanci) if (l.ambiente && typeof l.ambiente === 'object' && !eInerte(l.ambiente) && String(l.ambiente.TALOS_PROVA_ISOLATA) !== '1') rossi.push(relativo + ':' + l.riga + ' (' + l.chi + '): the child starts without the explicit test mark TALOS_PROVA_ISOLATA=1');
  }
  assert.ok(quanti >= 6, 'the bench reached ' + quanti + ' launches in the three files');
  assert.deepEqual(rossi, [], 'launches that hand keys to a child:\n' + rossi.join('\n'));
});

test('SHELL-KEYRING-NOKEYS-CONTROL — the helper drops every planted spelling and keeps PATH and the rest', () => {
  const pulito = senzaChiavi.ambienteSenzaChiavi({ ...CHIAVI_LARGHE, PATH: 'p', Path: 'q', PATHEXT: '.EXE', SystemRoot: 'C:\\Windows', GITHUB_REF_NAME: 'x', PAT: 'y' });
  assert.deepEqual(pulito, { PATH: 'p', Path: 'q', PATHEXT: '.EXE', SystemRoot: 'C:\\Windows', GITHUB_REF_NAME: 'x', TALOS_PROVA_ISOLATA: '1' }, 'last piece: the helper puts the mark on every child');
  assert.equal(senzaChiavi.ambienteSenzaChiavi({ talos_prova_isolata: '1' }).TALOS_PROVA_ISOLATA, undefined, 'one spelling only: a mark already there is kept as it is');
});

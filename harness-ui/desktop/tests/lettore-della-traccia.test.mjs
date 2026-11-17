import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ambienteColGancio, VARIABILE_PROVA_ISOLATA, VARIABILE_REGISTRO } from './gancio-portachiavi.mjs';
import { figlioColGancio, nessunPortachiaviVero, preparaRuntime, root } from './support.mjs';

/*
 * 11/11/2026, round 4 (controller of round 3, X-K1e and X-K1f alive): the SPEC side of the trip wire, the reader of the trace,
 * had no pure test: the bench replaces it (`banco-dei-lanci.test.mjs`), so a reader that never throws or that says «hooked» for
 * any pid passed everything. Here the real reader reads a trace written by hand, with the real variable pointing at it.
 */
function conTraccia(righe, fn) {
  const cartella = mkdtempSync(join(root, '.prove', 'lettore-traccia-'));
  const file = join(cartella, 'traccia.jsonl');
  writeFileSync(file, righe.map(r => JSON.stringify(r)).join('\n') + (righe.length ? '\n' : ''));
  const prima = process.env[VARIABILE_REGISTRO];
  process.env[VARIABILE_REGISTRO] = file;
  try { return fn(); } finally { if (prima === undefined) delete process.env[VARIABILE_REGISTRO]; else process.env[VARIABILE_REGISTRO] = prima; }
}

test('SHELL-KEYRING-READER — nessunPortachiaviVero is red, with the site, on a blocked or refused line after the mark, green before it', () => {
  preparaRuntime('lettore-traccia').dataDir; // the .prove folder exists
  conTraccia([{ tipo: 'caricato', pid: 11 }, { tipo: 'bloccato', modo: 'resolve', cosa: '@napi-rs/keyring', pid: 12 }, { tipo: 'caricato', pid: 13 }], () => {
    assert.throws(() => nessunPortachiaviVero(0, 'tests/esempio.spec.mjs:7'),
      (e) => e.message.startsWith('tests/esempio.spec.mjs:7: a process started by this test reached for the real Windows keyring') && e.message.includes('"pid":12'));
    assert.throws(() => nessunPortachiaviVero(1), /lettore-della-traccia\.test\.mjs:\d+: a process started/, 'the site is read from the stack');
    assert.doesNotThrow(() => nessunPortachiaviVero(2), 'only what came after the mark counts');
  });
  conTraccia([{ tipo: 'rifiutato', cosa: 'node.exe', pid: 14 }], () => assert.throws(() => nessunPortachiaviVero(0, 'x:1'), /"rifiutato"/));
  conTraccia([{ tipo: 'caricato', pid: 15 }], () => assert.doesNotThrow(() => nessunPortachiaviVero(0, 'x:1')));
  conTraccia([], () => assert.doesNotThrow(() => nessunPortachiaviVero(0, 'x:1')));
});

test('SHELL-KEYRING-READER-PID — figlioColGancio is true only for the pid that wrote its own «caricato» line, after the mark', () => {
  conTraccia([{ tipo: 'caricato', pid: 21 }, { tipo: 'bloccato', pid: 22 }, { tipo: 'caricato', pid: 23 }], () => {
    assert.equal(figlioColGancio(21), true);
    assert.equal(figlioColGancio(23), true);
    assert.equal(figlioColGancio(22), false, 'a blocked line is not a loaded hook');
    assert.equal(figlioColGancio(24), false, 'a pid with no line at all');
    assert.equal(figlioColGancio(21, 1), false, 'a line before the mark does not count');
  });
});

test('SHELL-KEYRING-MARK — every child of a test process and every server of the specs carries the product\'s explicit mark (P045)', () => {
  assert.equal(VARIABILE_PROVA_ISOLATA, 'TALOS_PROVA_ISOLATA');
  assert.equal(ambienteColGancio({})[VARIABILE_PROVA_ISOLATA], '1', 'the hook hands the mark to a child launched with env {}');
  assert.equal(ambienteColGancio({ talos_prova_isolata: '1' }).TALOS_PROVA_ISOLATA, undefined, 'one spelling only');
  const { env } = preparaRuntime('segno-esplicito');
  assert.equal(env[VARIABILE_PROVA_ISOLATA], '1', 'tests/support.mjs: the server env of the specs carries the mark');
  assert.equal(env.TALOS_HARNESS_UI_KEYRING, 'memoria', 'and still the in-memory keyring first');
});

/*
 * 11/11/2026, last piece of round 4 (owner 09:41): every launcher or helper of the desktop tests and scripts that REBUILDS a child
 * environment from process.env (dropping TALOS_*) must put the explicit mark back: the product guard reads it, and on a saturated
 * machine it is the only signal left. The files that run the installed app are written, never run here; the bench only records.
 * Also the server's own tests and the frontend's: the same rule for every test of harness-ui that rebuilds a child env.
 */
/*
 * Round (k), 11/11/2026 (owner «aggancio in OGNI node --test», controller of the last round reperto k, judge v1456-v1459): the scan
 * also forbids an ORPHANING start — `detached: true` or cmd's `start /b` — that hands its child an environment of its own without
 * the mark (the controller's orphan server read 59 keychain entries of the 4174 space under a plain `node --test`). And the only
 * exceptions are NAMED, one by one: the real-user controls of `tests/guardia-portachiavi-prove.test.mjs`, which build their child
 * env through `ambienteDaUtenteVero('<test name>')` (`esenzioni-utente-vero.mjs`). No whole file is exempt any more: until today
 * that test file was, without a name.
 */
const RICOSTRUZIONE = 'Object.fromEntries(Object.entries(process.env)';
const STACCATO = /detached\s*:\s*true|\bstart\s*[,=]?\s*(?:\\?"\\?"\s+)?\/b\b/gi;
/** An orphaning start hands its child an env of its own when an `env` option sits next to it (not `process.env.X`, not `$env:`). */
const AMBIENTE_PROPRIO = /(?<![$\w.])env\s*[:,}]/;
/** The mark, or a named real-user exemption, covers a site only NEAR it: a mark elsewhere in the file (an input of a pure test) does not. */
const COPERTURA = /\.TALOS_PROVA_ISOLATA\s*=\s*'1'|TALOS_PROVA_ISOLATA:\s*'1'|ambienteDaUtenteVero\(\s*'[^']*'/;
const VICINO = 1500;
/* Round k2 (controller of round k, C-O1): who may name a real-user exemption. The owner of the names (NAMED-EXEMPTIONS checks that
   each name is a test of it) and the hook's own files, which define and test the variable; nobody else, comments included. */
const PROPRIETARIO_DELLE_ESENZIONI = 'tests/guardia-portachiavi-prove.test.mjs';
const FILE_DEL_GANCIO = new Set(['desktop/tests/esenzioni-utente-vero.mjs', 'desktop/tests/gancio-portachiavi.mjs', 'desktop/tests/gancio-portachiavi.test.mjs',
  'desktop/tests/lettore-della-traccia.test.mjs']);
const NOMI_DELL_ESENZIONE = /\bambienteDaUtenteVero\b|\bVARIABILE_UTENTE_VERO\b|TALOS_PROVA_UTENTE_VERO/g;
/** The places of `relativo` (path under harness-ui) that use the real-user exemption outside its owner: one red line each. */
export function esenzioniFuoriPosto(relativo, testo) {
  if (relativo === PROPRIETARIO_DELLE_ESENZIONI || FILE_DEL_GANCIO.has(relativo)) return [];
  const riga = i => testo.slice(0, i).split('\n').length;
  return [...testo.matchAll(NOMI_DELL_ESENZIONE)].map(m => relativo + ':' + riga(m.index) + ': «' + m[0] + '» outside its owner: only '
    + PROPRIETARIO_DELLE_ESENZIONI + ' names a real-user exemption, and only the hook\'s own files hold its variable');
}
export function siti(testo) {
  const riga = i => testo.slice(0, i).split('\n').length;
  const ricostruzioni = []; let i = -1;
  while ((i = testo.indexOf(RICOSTRUZIONE, i + 1)) >= 0) ricostruzioni.push(i);
  const staccati = [...testo.matchAll(STACCATO)].map(m => m.index).filter(k => AMBIENTE_PROPRIO.test(testo.slice(Math.max(0, k - 500), k + 500)));
  const coperto = k => COPERTURA.test(testo.slice(Math.max(0, k - VICINO), k + VICINO));
  return {
    ricostruzioni: ricostruzioni.length,
    staccati: staccati.length,
    scoperti: [...ricostruzioni, ...staccati].filter(k => !coperto(k)).map(riga).sort((a, b) => a - b),
    esenzioni: [...testo.matchAll(/ambienteDaUtenteVero\(\s*'([^']*)'/g)].map(m => m[1]),
  };
}
test('SHELL-KEYRING-MARK-REBUILD — every test or test script that rebuilds a child env, or starts an orphan with an env of its own, puts TALOS_PROVA_ISOLATA back or names its real-user exemption', async () => {
  const harness = join(root, '..');
  const ESENTI = new Map([
    ['desktop/tests/banco-dei-lanci.mjs', 'the bench builds the env a spec SEES while recording; it starts no child'],
    ['desktop/tests/lettore-della-traccia.test.mjs', 'this scan'],
  ]);
  // without the list every exemption is unnamed (red below), never a pass
  const { ESENZIONI_UTENTE_VERO } = await import('./esenzioni-utente-vero.mjs').catch(() => ({ ESENZIONI_UTENTE_VERO: {} }));
  const rossi = [];
  let ricostruzioni = 0;
  for (const cartella of ['desktop/tests', 'desktop/scripts', 'tests', 'frontend/tests']) {
    for (const nome of readdirSync(join(harness, cartella), { recursive: true })) {
      const relativo = (cartella + '/' + String(nome)).replace(/\\/g, '/');
      if (!/\.(mjs|cjs|js)$/.test(relativo) || relativo.includes('/node_modules/') || ESENTI.has(relativo)) continue;
      const s = siti(readFileSync(join(harness, relativo), 'utf8'));
      for (const e of s.esenzioni) if (!Object.hasOwn(ESENZIONI_UTENTE_VERO, e)) rossi.push(relativo + ': exemption without a name of the list: ' + JSON.stringify(e));
      ricostruzioni += s.ricostruzioni;
      for (const r of s.scoperti) rossi.push(relativo + ':' + r + ': a rebuilt env or an orphaning start with its own env, and no explicit mark nor named exemption within ' + VICINO + ' characters');
      rossi.push(...esenzioniFuoriPosto(relativo, readFileSync(join(harness, relativo), 'utf8'))); // k2: the exemption stays in its owner
    }
  }
  assert.ok(ricostruzioni >= 5, 'the scan found ' + ricostruzioni + ' rebuilt environments');
  assert.deepEqual(rossi, [], 'a child env without the explicit test mark:\n' + rossi.join('\n'));
});

test('SHELL-KEYRING-NAMED-EXEMPTIONS — the real-user exemptions are exactly the named controls of P045, each a real test with its reason', async () => {
  const { ESENZIONI_UTENTE_VERO, VARIABILE_UTENTE_VERO } = await import('./esenzioni-utente-vero.mjs');
  assert.equal(VARIABILE_UTENTE_VERO, 'TALOS_PROVA_UTENTE_VERO');
  // a new exemption is a decision: it is written here too, with its name (owner 11/11, «eccezioni nominate una per una»)
  assert.deepEqual(Object.keys(ESENZIONI_UTENTE_VERO), ['P045-15', 'P045-16', 'P045-17', 'P045-18', 'P045-21']);
  const guardia = readFileSync(join(root, '..', 'tests', 'guardia-portachiavi-prove.test.mjs'), 'utf8');
  for (const [nome, motivo] of Object.entries(ESENZIONI_UTENTE_VERO)) {
    assert.match(nome, /^P045-\d+$/, 'an exemption is named after its test');
    assert.ok(typeof motivo === 'string' && motivo.trim().length >= 20, nome + ': the reason is written');
    assert.ok(guardia.includes("test('" + nome + ' — '), nome + ' is a test of tests/guardia-portachiavi-prove.test.mjs');
    assert.ok(guardia.includes("ambienteDaUtenteVero('" + nome + "'") || guardia.includes("cicloBloccato('" + nome + "'"), nome + ' uses its own name');
  }
  // the scan sees an orphaning start with its own env, and the mark or a named exemption covers it (the controller's orphan probe)
  assert.deepEqual(siti("spawnSync('cmd.exe', ['/c', 'start \"\" /b node server.mjs'], { cwd, env, windowsHide: true });"), { ricostruzioni: 0, staccati: 1, scoperti: [1], esenzioni: [] });
  assert.deepEqual(siti("const env = { PATH: 'x', TALOS_PROVA_ISOLATA: '1' };\nspawnSync('cmd.exe', ['/c', 'start \"\" /b node server.mjs'], { cwd, env });").scoperti, [], 'the mark next to it covers it');
  assert.deepEqual(siti("spawn(process.execPath, [x], { detached: true, env: { PATH: process.env.PATH } });" + ' '.repeat(2000) + "f({ TALOS_PROVA_ISOLATA: '1' });").scoperti, [1], 'a mark far away (an input of a pure test) does not cover it');
  assert.deepEqual(siti("const env = " + RICOSTRUZIONE + ".filter(x));\nconst figlio = spawn(n, [], { env: ambienteDaUtenteVero('P045-18') });").scoperti, [], 'a named exemption covers it');
  assert.equal(siti("spawn(process.execPath, [x], { detached: true, stdio: 'ignore' });").staccati, 0, 'an inherited env keeps the mark of the runner');
  assert.equal(siti("const c = 'start /b npm test'; // a command classified, never started").staccati, 0);
  assert.equal(siti("'Remove-Item (Join-Path $env:USERPROFILE x)', 'start /b cmd'").staccati, 0, 'PowerShell $env: is not an env option');
});

/*
 * Round k2 (11/11/2026, controller of round k, point 5; its mutant C-O1 lived): the exemptions were strict to the NAME but not to the
 * FILE. A new test file could borrow `ambienteDaUtenteVero('P045-16')`, or set the raw variable itself, and its child ran with no mark.
 * An exemption holds only from the file that owns its name (`tests/guardia-portachiavi-prove.test.mjs`); the variable and the helper
 * appear only there and in the hook's own files. Comments count too: the scan is stricter than a person reading it.
 */
test('SHELL-KEYRING-EXEMPTION-OWNER — a real-user exemption holds only from the file that owns its name, and the raw variable only in the hook\'s own files', () => {
  // the controller's mutant C-O1: a new test file borrows a name of the list
  assert.deepEqual(esenzioniFuoriPosto('tests/zz-prestito.test.mjs', "import { ambienteDaUtenteVero } from '../desktop/tests/esenzioni-utente-vero.mjs';\nconst env = ambienteDaUtenteVero('P045-16');\n").map(r => r.split(': ')[0]),
    ['tests/zz-prestito.test.mjs:1', 'tests/zz-prestito.test.mjs:2']);
  // the raw variable, or the hook's constant for it, outside the hook's files
  assert.equal(esenzioniFuoriPosto('desktop/tests/nuova.test.mjs', "spawn(n, [], { env: { ...process.env, TALOS_PROVA_UTENTE_VERO: 'P045-18' } });").length, 1);
  assert.equal(esenzioniFuoriPosto('frontend/tests/unit/x.test.mjs', "const e = { [VARIABILE_UTENTE_VERO]: 'P045-15' };").length, 1);
  // the owner and the hook's own files keep them
  assert.deepEqual(esenzioniFuoriPosto('tests/guardia-portachiavi-prove.test.mjs', "const env = ambienteDaUtenteVero('P045-15');"), []);
  for (const f of ['desktop/tests/esenzioni-utente-vero.mjs', 'desktop/tests/gancio-portachiavi.mjs', 'desktop/tests/gancio-portachiavi.test.mjs']) {
    assert.deepEqual(esenzioniFuoriPosto(f, "export const VARIABILE_UTENTE_VERO = 'TALOS_PROVA_UTENTE_VERO';"), [], f);
  }
  assert.deepEqual(esenzioniFuoriPosto('tests/altro.test.mjs', "const env = { TALOS_PROVA_ISOLATA: '1' };"), [], 'no exemption, nothing to say');
});

/*
 * Round (k), 11/11/2026: the owner's decision is «the hook in EVERY node --test», and the judge (v1456-v1457) found the server step
 * of the CI, the release, the ledger workflows, harness-ui's verify:all and test:kernel, the frontend runner and others without it.
 * This lists EVERY `node --test` launch of the repository — workflows, package.json scripts, scripts under any `scripts/` folder —
 * and each one either preloads THIS hook (`node --test --import=<path that resolves to desktop/tests/gancio-portachiavi.mjs>`) or
 * is a named exception with its reason (packages that never reach the keyring, a file this cure may not touch). A new launch with
 * neither is red. The merge queue lives outside the repository: its own test (`coda-unione.test.mjs`) checks it.
 */
const GANCIO_FILE = join(root, 'tests', 'gancio-portachiavi.mjs');
const FUORI_DAL_CAMMINO = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'target', '.gradle', '.prove', '.talos', '.workspaces', 'test-results', 'artifacts', 'public', 'vendor', '.casa-linux', 'coverage', '.venv', 'playwright-report']);
export const ECCEZIONI_DEI_LANCI = new Map([
  ['control-plane/package.json', 'control-plane: its own server and browser gates; it never imports harness-ui nor @napi-rs/keyring'],
  ['context-engine/package.json', 'context-engine: the retrieval engine, no server and no keyring (the merge queue runs its tests with the hook anyway)'],
  ['harness-ui/relay/package.json', 'the relay package, published alone: the pinned iroh-relay launcher, it never imports harness-ui nor the keyring'],
  ['harness-ui/benchmarks/autocompact/package.json', 'a bench of the autocompact qualification: it imports the llama supervisor and the process policy, never the keyring'],
  ['harness-ui/frontend/prototypes/calm-lab/package.json', 'a design prototype with its own tests: no server, no keyring'],
  ['mobile/package.json', 'the phone scripts (parity ledger, local backend artifact): no keyring; a change here goes to the Mobile session first'],
  ['mobile/packages/contracts/package.json', 'the phone contracts (TypeScript conformance): no keyring; Mobile session first'],
  ['mobile/packages/design-tokens/package.json', 'the phone design tokens: no keyring; Mobile session first'],
  ['harness-ui/desktop/scripts/ripresa-desktop-gate.mjs', 'not touched by this cure (brief k, list of files not to touch); it runs the desktop tests, which load the hook through tests/support.mjs'],
]);
export function lanciDelRepo(repo) {
  const lanci = [];
  const pezzoDiNode = (riga) => riga.split(/&&|\|\||;|\s>\s|\s2>&1|\|/)[0].trim();
  const conGancio = (pezzo, base) => {
    const t = pezzo.split(/\s+/);
    if (t[0] !== 'node' || t[1] !== '--test' || !/^--import=/.test(t[2] ?? '')) return false;
    const percorso = t[2].slice('--import='.length);
    return existsSync(join(base, percorso)) && realpathSync(join(base, percorso)) === realpathSync(GANCIO_FILE);
  };
  const flussi = join(repo, '.github', 'workflows');
  for (const nome of readdirSync(flussi).filter(n => /\.ya?ml$/.test(n)).sort()) {
    const righe = readFileSync(join(flussi, nome), 'utf8').split('\n');
    righe.forEach((riga, i) => {
      if (/^\s*#/.test(riga)) return;
      const m = /\bnode\s+--test\b.*$/.exec(riga);
      if (!m) return;
      // the working directory of the step: from the step's own line up to the next step at the same indent
      let inizio = i;
      while (inizio > 0 && !/^\s*-\s/.test(righe[inizio])) inizio -= 1;
      const rientro = /^(\s*)-/.exec(righe[inizio])?.[1].length ?? 0;
      let cartella = '';
      for (let j = inizio; j < righe.length; j += 1) {
        if (j > inizio && new RegExp('^\\s{0,' + rientro + '}-\\s').test(righe[j])) break;
        const w = /^\s*working-directory:\s*(\S+)/.exec(righe[j]);
        if (w) { cartella = w[1]; break; }
      }
      const pezzo = pezzoDiNode(m[0]);
      lanci.push({ dove: '.github/workflows/' + nome + ':' + (i + 1), file: '.github/workflows/' + nome, pezzo, gancio: conGancio(pezzo, join(repo, cartella)) });
    });
  }
  (function cammina(dir, rel, inScripts) {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (d.isSymbolicLink()) continue;
      const r = rel ? rel + '/' + d.name : d.name;
      if (d.isDirectory()) { if (!FUORI_DAL_CAMMINO.has(d.name) && !d.name.startsWith('.prove')) cammina(join(dir, d.name), r, inScripts || d.name === 'scripts'); continue; }
      if (d.name === 'package.json') {
        let pacchetto;
        try { pacchetto = JSON.parse(readFileSync(join(dir, d.name), 'utf8')); } catch { continue; }
        for (const [script, riga] of Object.entries(pacchetto.scripts ?? {})) {
          for (const pezzo of String(riga).split(/&&|\|\||;/).map(p => p.trim())) {
            if (/^node\s/.test(pezzo) && pezzo.split(/\s+/).includes('--test')) lanci.push({ dove: r + '#' + script, file: r, pezzo, gancio: conGancio(pezzo, dir) });
          }
        }
      } else if (inScripts && /\.(mjs|cjs|js)$/.test(d.name) && !/\.(test|spec)\.(mjs|cjs|js)$/.test(d.name)) {
        const testo = readFileSync(join(dir, d.name), 'utf8');
        testo.split('\n').forEach((riga, i) => {
          if (!/\[\s*['"]--test['"]/.test(riga)) return;
          // the args array of the launch names the hook, and the file builds that name from the hook's own path
          const gancio = /gancio/i.test(riga) && testo.includes("'desktop', 'tests', 'gancio-portachiavi.mjs'");
          lanci.push({ dove: r + ':' + (i + 1), file: r, pezzo: riga.trim().slice(0, 160), gancio });
        });
      }
    }
  })(repo, '', false);
  return lanci;
}
test('SHELL-KEYRING-HOOK-EVERY-LAUNCH — every `node --test` of the repository (workflows, package.json, scripts) preloads the keyring hook, or is a named exception', () => {
  const lanci = lanciDelRepo(join(root, '..', '..'));
  // 17/11/2026 (PR 96): the public repository has 28 launches (it does not carry cli/ and other private folders); 30 was the private count.
  assert.ok(lanci.length >= 25, 'the scan found ' + lanci.length + ' launches');
  for (const [file, motivo] of ECCEZIONI_DEI_LANCI) {
    assert.ok(motivo.trim().length >= 20, file + ': the reason is written');
    // 17/11/2026 (PR 96): the public repository does not carry every folder (control-plane/, the autocompact bench): a file that is not there is skipped.
    if (!existsSync(join(root, '..', '..', file))) continue;
    assert.ok(lanci.some(l => l.file === file && !l.gancio), file + ': a named exception that no launch needs any more');
  }
  const senza = lanci.filter(l => !l.gancio && !ECCEZIONI_DEI_LANCI.has(l.file)).map(l => l.dove + '  ' + l.pezzo);
  assert.deepEqual(senza, [], 'a `node --test` without the keyring hook (owner 11/11: «aggancio in OGNI node --test»):\n' + senza.join('\n'));
  for (const dove of ['.github/workflows/ci.yml', '.github/workflows/release.yml', 'harness-ui/package.json#test:kernel', 'harness-ui/desktop/package.json#test:puri', 'harness-ui/frontend/scripts/run-node-tests.mjs']) {
    assert.ok(lanci.some(l => (l.dove === dove || l.file === dove) && l.gancio), dove + ' is among the launches, with the hook');
  }
});

/*
 * 11/11/2026, last round «che lo chiude» (owner 10:42, controller's reperto B): a test that starts a child through `cmd /c start`
 * with a rebuilt environment leaves an ORPHAN (its parent is already gone: no mark, no ancestry), and it reached the fake keyring
 * under a plain `node --test` at any load (probe «e», 1/8 free, 2/8 slow). Every `node --test` of this package now preloads the hook,
 * so the test process itself marks every child before it can become an orphan. A `node --test` typed by hand stays outside.
 */
test('SHELL-KEYRING-HOOK-PRELOADED — every `node --test` script of the desktop package preloads the keyring hook', () => {
  const pacchetto = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const PRECARICA = '--import=./tests/gancio-portachiavi.mjs';
  const pezzi = Object.entries(pacchetto.scripts ?? {}).flatMap(([nome, riga]) => String(riga).split(/&&|\|\||;/).map(p => [nome, p.trim()]))
    .filter(([, p]) => /^node\s/.test(p) && p.split(/\s+/).includes('--test'));
  assert.ok(pezzi.length >= 3, 'test:puri, test:guscio, test:installer: ' + pezzi.length);
  assert.deepEqual(pezzi.filter(([, p]) => p.split(/\s+/)[1] !== '--test' || p.split(/\s+/)[2] !== PRECARICA).map(([n, p]) => n + ': ' + p), [],
    'node --test ' + PRECARICA + ' first, before any other option or file');
  assert.equal(new URL('./gancio-portachiavi.mjs', import.meta.url).href, new URL('./tests/gancio-portachiavi.mjs', pathToFileURL(root + '/')).href, 'the preload is this very hook');
});

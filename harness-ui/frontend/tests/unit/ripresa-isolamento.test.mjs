import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creaAmbienteIsolato, creaEsecuzione, creaSnapshot, elencaTestBackend, esegui, rimuoviStato, staccaCollegamenti } from '../../scripts/ripresa-run.mjs';
import { rimuoviCartellaDiProva } from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * ⛔⛔ D2-a, 24/09/2026 — questa prova lasciava a OGNI corsa 8 cartelle `talos-ripresa-*` in TEMP (2 con un
 *   clone del repo e 4 giunzioni ai `node_modules` veri) e 8 cartelle di rapporti in
 *   `frontend/artifacts/ripresa/` (misura della revisione avversaria del 23/09 notte). Ora:
 *   · ogni esecuzione nasce con la sua rimozione (`t.after` → `rimuoviStato`, che stacca PRIMA i collegamenti);
 *   · i rapporti vanno in una radice di questo file in TEMP, tolta nell'`after` di file;
 *   · il cancello `harness-ui/tests/temp-nessun-residuo.test.mjs` (DESK-TEMP-2) lancia questo file in una
 *     TEMP privata e pretende ZERO residui, lì e in `artifacts/ripresa/`.
 */
const RAPPORTI = mkdtempSync(join(tmpdir(), 'talos-ripresa-rapporti-'));
// BC-09: la rimozione passa dall'aiuto di casa (ritenta sui codici della corsa e lo dichiara), sempre a
// collegamenti già staccati.
after(() => {
  staccaCollegamenti(RAPPORTI);
  rimuoviCartellaDiProva(RAPPORTI);
});
function esecuzione(t, kind) {
  const run = creaEsecuzione(kind, { radiceRapporti: RAPPORTI });
  t.after(() => rimuoviStato(run));
  return run;
}

test('RIPRESA-R0-RELEASE: il confronto conserva anche gli script di build della release', (t) => {
  const run = esecuzione(t, 'release-test');
  const snapshot = creaSnapshot(run, { release: true });
  const file = 'harness-ui/frontend/scripts/copy-vendored-assets.mjs';
  const expected = spawnSync('git', ['show', `desktop-v0.1.13:${file}`], { encoding: 'utf8', windowsHide: true });
  assert.equal(expected.status, 0, expected.stderr);
  assert.equal(readFileSync(join(snapshot, file), 'utf8').replaceAll('\r\n', '\n'), expected.stdout.replaceAll('\r\n', '\n'));
});

test('RIPRESA-R0-DISCOVERY: la suite include ricerca annidata e guscio', (t) => {
  const run = esecuzione(t, 'discovery-test');
  const files = ['harness-ui/tests/base.test.mjs', 'harness-ui/tests/research/profondita/ricerca.test.mjs', 'harness-ui/labs/electron-shell/guscio.test.mjs'];
  for (const file of [...files, 'harness-ui/tests/research/README.md']) {
    const target = join(run.workspace, file);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, 'fixture', { flag: 'wx' });
  }
  assert.deepEqual(elencaTestBackend(run.workspace).map(file => file.replaceAll('\\', '/')).sort(), [
    '../labs/electron-shell/guscio.test.mjs', '../tests/base.test.mjs', '../tests/research/profondita/ricerca.test.mjs',
  ]);
});

test('RIPRESA-R0-ISOLAMENTO: il figlio non eredita segreti, preload o archivi owner', (t) => {
  const run = esecuzione(t, 'isolation-test');
  const env = creaAmbienteIsolato(run, {
    ...process.env,
    OPENROUTER_API_KEY: 'owner-sentinel', HF_TOKEN: 'owner-sentinel',
    PROGRAMFILES: 'C:/Program Files', 'PROGRAMFILES(X86)': 'C:/Program Files (x86)',
    NODE_OPTIONS: '--require missing-owner-module',
    TALOS_DESKTOP_DATA_DIR: 'C:/owner-data', TALOS_HARNESS_UI_BASE_URL: 'http://127.0.0.1:4174',
  });
  const child = spawnSync(process.execPath, ['-e', 'console.log(JSON.stringify({secret:process.env.OPENROUTER_API_KEY,hf:process.env.HF_TOKEN,base:process.env.TALOS_HARNESS_UI_BASE_URL,data:process.env.TALOS_DESKTOP_DATA_DIR,home:process.env.USERPROFILE,projects:process.env.TALOS_HARNESS_UI_PROJECT_DIRS}))'], { env, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  assert.equal(result.secret, undefined);
  assert.equal(result.hf, undefined);
  assert.equal(result.base, undefined);
  assert.equal(result.data, run.data);
  assert.equal(result.home, run.home);
  assert.equal(result.projects, run.workspace);
  assert.equal(env.PROGRAMFILES, 'C:/Program Files');
  assert.equal(env['PROGRAMFILES(X86)'], 'C:/Program Files (x86)');
});

test('RIPRESA-R0-PORTACHIAVI: adattatore TALOS reale, keyring in memoria e nuovo per processo', (t) => {
  const run = esecuzione(t, 'keyring-test');
  const env = creaAmbienteIsolato(run);
  const adapter = new URL('../../../src/adattatore-keyring.mjs', import.meta.url).href;
  const script = `const {creaAdattatorePortachiaviSistema}=await import(${JSON.stringify(adapter)}); const k=await creaAdattatorePortachiaviSistema(); const before=k.get('ripresa-test','sentinel'); k.set('ripresa-test','sentinel','test-only'); const after=k.get('ripresa-test','sentinel'); k.remove('ripresa-test','sentinel'); console.log(JSON.stringify({before,after,removed:k.get('ripresa-test','sentinel')}));`;
  for (let n = 0; n < 2; n++) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { before: null, after: 'test-only', removed: null });
  }
});

test('RIPRESA-R0-RAPPORTI: esecuzioni distinte conservano manifest e stato distinti', (t) => {
  const a = esecuzione(t, 'manifest-test');
  const before = readFileSync(a.manifest, 'utf8');
  const b = esecuzione(t, 'manifest-test');
  assert.notEqual(a.output, b.output);
  assert.notEqual(a.data, b.data);
  assert.equal(readFileSync(a.manifest, 'utf8'), before);
  const manifest = JSON.parse(before);
  assert.match(manifest.head, /^[a-f0-9]{40}$/);
  assert.equal(manifest.keyring, 'test-only-memory');
  assert.equal(manifest.release, 'desktop-v0.1.13');
});

test('RIPRESA-R0-INTERRUZIONE: risultati persistono senza onEnd', (t) => {
  const run = esecuzione(t, 'reporter-test');
  const reporter = new URL('../../scripts/ripresa-reporter.mjs', import.meta.url).href;
  const script = `const {default: Reporter}=await import(${JSON.stringify(reporter)}); const r=new Reporter({output:${JSON.stringify(run.output)}}); const t={id:'sentinel',titlePath:()=>['suite','sentinel'],location:{file:'sentinel.spec.mjs',line:1},expectedStatus:'passed'}; r.onBegin({}, {allTests:()=>[t]}); r.onTestEnd(t,{status:'failed',duration:1,retry:0,errors:[{message:'sentinel failure'}],attachments:[]}); process.exit(23);`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(result.status, 23, result.stderr);
  const records = readFileSync(join(run.output, 'events.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(records.map(row => row.type), ['begin', 'testEnd']);
  assert.equal(records[1].status, 'failed');
  assert.equal(records[1].errors[0].message, 'sentinel failure');
});

test('RIPRESA-R0-SNAPSHOT: gestisce gitlink e scrivere nella copia non altera il sorgente', (t) => {
  const source = new URL('../../src/legacy/app.js', import.meta.url);
  const before = readFileSync(source);
  const run = esecuzione(t, 'snapshot-test');
  const snapshot = creaSnapshot(run);
  const copied = join(snapshot, 'harness-ui/frontend/src/legacy/app.js');
  assert.deepEqual(readFileSync(copied), before);
  writeFileSync(copied, 'isolated mutation');
  assert.deepEqual(readFileSync(source), before);
  const manifest = JSON.parse(readFileSync(join(run.output, 'source-files.json'), 'utf8'));
  assert.ok(manifest.some(row => row.file === 'mobile/third_party/llama.cpp' && row.gitlink));
});

/* ───────────── D2-a, 24/09/2026 — la rimozione dello stato, provata su giunzioni VERE ───────────── */

/** Un albero in TEMP con una giunzione annidata verso un bersaglio che ha una sentinella. */
function alberoConGiunzione(t) {
  const base = mkdtempSync(join(tmpdir(), 'talos-ripresa-giunzione-'));
  const bersaglio = join(base, 'bersaglio');
  mkdirSync(bersaglio);
  writeFileSync(join(bersaglio, 'sentinella.txt'), 'viva');
  const state = join(base, 'stato');
  mkdirSync(join(state, 'source', 'harness-ui'), { recursive: true });
  writeFileSync(join(state, 'source', 'file.txt'), 'x');
  symlinkSync(bersaglio, join(state, 'source', 'harness-ui', 'node_modules'), 'junction');
  t.after(() => { staccaCollegamenti(base); rimuoviCartellaDiProva(base); });
  return { bersaglio, state, giunzione: join(state, 'source', 'harness-ui', 'node_modules') };
}

test('RIPRESA-R0-PULIZIA-GIUNZIONI: le giunzioni si staccano PRIMA della rimozione, e il bersaglio resta intatto', (t) => {
  const { bersaglio, state, giunzione } = alberoConGiunzione(t);
  assert.ok(lstatSync(giunzione).isSymbolicLink(), 'premessa: la giunzione c’è e lstat la vede come collegamento');
  const giunzioneAlMomentoDellaRimozione = [];
  const esito = rimuoviStato({ state }, {
    rimuovi: (percorso, opzioni) => {
      giunzioneAlMomentoDellaRimozione.push(existsSync(giunzione));
      rmSync(percorso, opzioni);
    },
  });
  assert.deepEqual(giunzioneAlMomentoDellaRimozione, [false], '⛔ la rimozione ricorsiva parte solo a giunzioni già staccate');
  assert.equal(esito.staccati, 1);
  assert.equal(existsSync(state), false, 'lo stato non resta in TEMP');
  assert.equal(readFileSync(join(bersaglio, 'sentinella.txt'), 'utf8'), 'viva', '⛔ il bersaglio della giunzione (i node_modules veri) non si tocca');
});

test('RIPRESA-R0-PULIZIA-CONSERVA: lo stato conservato per ispezione resta, ma SENZA giunzioni', (t) => {
  const { bersaglio, state, giunzione } = alberoConGiunzione(t);
  const esito = rimuoviStato({ state }, { conserva: true });
  assert.equal(esito.rimosso, false);
  assert.equal(existsSync(join(state, 'source', 'file.txt')), true, 'conservato vuol dire conservato');
  assert.equal(existsSync(giunzione), false, '⛔ ma in TEMP non resta una giunzione verso i node_modules veri');
  assert.equal(readFileSync(join(bersaglio, 'sentinella.txt'), 'utf8'), 'viva');
});

test('RIPRESA-R0-PULIZIA-SNAPSHOT: lo stato di uno snapshot vero si toglie tutto, node_modules veri intatti', (t) => {
  const repoNodeModules = fileURLToPath(new URL('../../node_modules', import.meta.url));
  const voci = existsSync(repoNodeModules) ? readdirSync(repoNodeModules).length : null;
  const run = esecuzione(t, 'pulizia-test');
  const snapshot = creaSnapshot(run);
  const giunzioni = ['node_modules', 'harness-ui/node_modules', 'harness-ui/frontend/node_modules']
    .map((dir) => join(snapshot, dir)).filter((p) => existsSync(p) && lstatSync(p).isSymbolicLink());
  if (voci !== null) assert.ok(giunzioni.length > 0, 'premessa: con i node_modules installati lo snapshot ha le sue giunzioni');
  const esito = rimuoviStato(run);
  assert.equal(esito.staccati, giunzioni.length);
  assert.equal(existsSync(run.state), false, 'lo stato dello snapshot non resta in TEMP');
  if (voci !== null) assert.equal(readdirSync(repoNodeModules).length, voci, '⛔ i node_modules veri hanno ancora tutte le loro voci');
});

test('RIPRESA-R0-PULIZIA-ESEGUI: `esegui` toglie il suo stato anche quando fallisce a metà', async () => {
  const righe = [];
  const log = console.log;
  console.log = (...parti) => { righe.push(parti.join(' ')); };
  try {
    // Un nome di file non ammesso fa fallire `backend` DOPO lo snapshot (clone e giunzioni già creati).
    await assert.rejects(esegui('backend', ['../fuori.mjs'], { radiceRapporti: RAPPORTI, conservaStato: false }), /solo nomi di file test/);
  } finally {
    console.log = log;
  }
  const stato = /Stato isolato: (.+)$/m.exec(righe.join('\n'))?.[1]?.trim();
  assert.ok(stato, 'premessa: esegui ha creato uno stato e l’ha annunciato');
  assert.equal(existsSync(stato), false, '⛔ lo stato di una corsa fallita non resta in TEMP');
  assert.ok(righe.some((r) => /Stato isolato rimosso/.test(r)), 'e la rimozione si dichiara');
});

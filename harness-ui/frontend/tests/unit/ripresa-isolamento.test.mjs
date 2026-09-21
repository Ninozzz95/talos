import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { creaAmbienteIsolato, creaEsecuzione, creaSnapshot, elencaTestBackend } from '../../scripts/ripresa-run.mjs';

test('RIPRESA-R0-RELEASE: il confronto conserva anche gli script di build della release', () => {
  const run = creaEsecuzione('release-test');
  const snapshot = creaSnapshot(run, { release: true });
  const file = 'harness-ui/frontend/scripts/copy-vendored-assets.mjs';
  const expected = spawnSync('git', ['show', `desktop-v0.1.13:${file}`], { encoding: 'utf8', windowsHide: true });
  assert.equal(expected.status, 0, expected.stderr);
  assert.equal(readFileSync(join(snapshot, file), 'utf8').replaceAll('\r\n', '\n'), expected.stdout.replaceAll('\r\n', '\n'));
});

test('RIPRESA-R0-DISCOVERY: la suite include ricerca annidata e guscio', () => {
  const run = creaEsecuzione('discovery-test');
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

test('RIPRESA-R0-ISOLAMENTO: il figlio non eredita segreti, preload o archivi owner', () => {
  const run = creaEsecuzione('isolation-test');
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

test('RIPRESA-R0-PORTACHIAVI: adattatore TALOS reale, keyring in memoria e nuovo per processo', () => {
  const run = creaEsecuzione('keyring-test');
  const env = creaAmbienteIsolato(run);
  const adapter = new URL('../../../src/adattatore-keyring.mjs', import.meta.url).href;
  const script = `const {creaAdattatorePortachiaviSistema}=await import(${JSON.stringify(adapter)}); const k=await creaAdattatorePortachiaviSistema(); const before=k.get('ripresa-test','sentinel'); k.set('ripresa-test','sentinel','test-only'); const after=k.get('ripresa-test','sentinel'); k.remove('ripresa-test','sentinel'); console.log(JSON.stringify({before,after,removed:k.get('ripresa-test','sentinel')}));`;
  for (let n = 0; n < 2; n++) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { before: null, after: 'test-only', removed: null });
  }
});

test('RIPRESA-R0-RAPPORTI: esecuzioni distinte conservano manifest e stato distinti', () => {
  const a = creaEsecuzione('manifest-test');
  const before = readFileSync(a.manifest, 'utf8');
  const b = creaEsecuzione('manifest-test');
  assert.notEqual(a.output, b.output);
  assert.notEqual(a.data, b.data);
  assert.equal(readFileSync(a.manifest, 'utf8'), before);
  const manifest = JSON.parse(before);
  assert.match(manifest.head, /^[a-f0-9]{40}$/);
  assert.equal(manifest.keyring, 'test-only-memory');
  assert.equal(manifest.release, 'desktop-v0.1.13');
});

test('RIPRESA-R0-INTERRUZIONE: risultati persistono senza onEnd', () => {
  const run = creaEsecuzione('reporter-test');
  const reporter = new URL('../../scripts/ripresa-reporter.mjs', import.meta.url).href;
  const script = `const {default: Reporter}=await import(${JSON.stringify(reporter)}); const r=new Reporter({output:${JSON.stringify(run.output)}}); const t={id:'sentinel',titlePath:()=>['suite','sentinel'],location:{file:'sentinel.spec.mjs',line:1},expectedStatus:'passed'}; r.onBegin({}, {allTests:()=>[t]}); r.onTestEnd(t,{status:'failed',duration:1,retry:0,errors:[{message:'sentinel failure'}],attachments:[]}); process.exit(23);`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(result.status, 23, result.stderr);
  const records = readFileSync(join(run.output, 'events.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(records.map(row => row.type), ['begin', 'testEnd']);
  assert.equal(records[1].status, 'failed');
  assert.equal(records[1].errors[0].message, 'sentinel failure');
});

test('RIPRESA-R0-SNAPSHOT: gestisce gitlink e scrivere nella copia non altera il sorgente', () => {
  const source = new URL('../../src/legacy/app.js', import.meta.url);
  const before = readFileSync(source);
  const run = creaEsecuzione('snapshot-test');
  const snapshot = creaSnapshot(run);
  const copied = join(snapshot, 'harness-ui/frontend/src/legacy/app.js');
  assert.deepEqual(readFileSync(copied), before);
  writeFileSync(copied, 'isolated mutation');
  assert.deepEqual(readFileSync(source), before);
  const manifest = JSON.parse(readFileSync(join(run.output, 'source-files.json'), 'utf8'));
  assert.ok(manifest.some(row => row.file === 'mobile/third_party/llama.cpp' && row.gitlink));
});

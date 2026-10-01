import assert from 'node:assert/strict';
import test, {mock} from 'node:test';
import {createRequire, syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {mkdtemp, mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {cercaNelProgetto} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProvaAttesa} from './aiuto/rimuovi-cartella-di-prova.mjs';
const childProcess = createRequire(import.meta.url)('node:child_process');

// Process boundary fixture only. Other search suites exercise the shipped rg.
async function search({code, stdout, nome}) {
  const radice = await mkdtemp(join(tmpdir(), 'talos-search32-'));
  const previous = process.env.TALOS_RG_PATH;
  let patch, spawnCount = 0, listings = 0;
  try {
    await mkdir(join(radice, '.git'));
    process.env.TALOS_RG_PATH = process.execPath;
    patch = mock.method(childProcess, 'spawn', (_exe, args, options) => {
      spawnCount++;
      assert.equal(options.cwd, radice);
      assert.ok(args.includes('--fixed-strings'));
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.kill = () => true;
      queueMicrotask(() => {
        if (stdout) child.stdout.emit('data', Buffer.from(stdout));
        child.emit('close', code, code === null ? 'SIGTERM' : null);
      });
      return child;
    });
    syncBuiltinESMExports();
    const result = await cercaNelProgetto({
      async elenca() { listings++; return []; },
      async leggi() { assert.fail('no fallback file'); },
    }, {testo: 'needle', ...(nome === undefined ? {} : {nome})}, {radice});
    assert.equal(spawnCount, 1);
    return {result, listings};
  } finally {
    patch?.mock.restore();
    syncBuiltinESMExports();
    if (previous === undefined) delete process.env.TALOS_RG_PATH;
    else process.env.TALOS_RG_PATH = previous;
    await rimuoviCartellaDiProvaAttesa(radice);
  }
}

test('SEARCH32-PARTIAL — exit2 keeps valid matches but declares incomplete coverage', async () => {
  const {result, listings} = await search({code: 2, stdout: 'src/hit.txt:1:needle\n'});
  assert.match(result, /^src\/hit\.txt:1:needle$/m);
  assert.match(result, /incomplete scan: ripgrep reported an error/);
  assert.equal(listings, 0, 'partial matches must not cause an undisclosed second search');
});

test('SEARCH32-FILTERED-ZERO — exit2 cannot establish absence after filtering partial matches', async () => {
  const {result} = await search({code: 2, stdout: 'src/hit.txt:1:needle\n', nome: 'other'});
  assert.match(result, /^inconclusive search:/);
  assert.match(result, /incomplete scan: ripgrep reported an error/);
  assert.doesNotMatch(result, /no file matches/);
});

test('SEARCH32-SIGNAL — an unexpected signal with stdout is not a successful complete scan', async () => {
  const {result} = await search({code: null, stdout: 'src/hit.txt:1:needle\n'});
  assert.match(result, /^src\/hit\.txt:1:needle$/m);
  assert.match(result, /incomplete scan: ripgrep reported an error/);
});

test('SEARCH32-COMPLETE — exit0 retains the previous byte-exact result', async () => {
  const {result, listings} = await search({code: 0, stdout: 'src/hit.txt:1:needle\n'});
  assert.equal(result, 'src/hit.txt:1:needle');
  assert.equal(listings, 0);
});

test('SEARCH32-NOMATCH — exit1 remains a clean negative', async () => {
  const {result, listings} = await search({code: 1, stdout: ''});
  assert.match(result, /^no file matches "needle"/);
  assert.doesNotMatch(result, /inconclusive|incomplete scan/);
  assert.equal(listings, 0);
});

test('SEARCH32-FALLBACK — exit2 without stdout retains the bounded fallback contract', async () => {
  const {result, listings} = await search({code: 2, stdout: ''});
  assert.equal(result, 'no file matches. Scanned 0 files (0 read for content). Try a shorter or different "testo".');
  assert.equal(listings, 1);
});

test('SEARCH32-REAL-UPSTREAM — the shipped rg actually returns a match alongside exit2', async () => {
  const radice = await mkdtemp(join(tmpdir(), 'talos-search32-rg-'));
  try {
    await writeFile(join(radice, 'hit.txt'), 'needle\n');
    const {rgPath} = createRequire(import.meta.url)('@vscode/ripgrep');
    const result = childProcess.spawnSync(rgPath, ['--no-config', '--line-number', '--with-filename',
      '--fixed-strings', '-e', 'needle', '--', 'hit.txt', 'missing.txt'],
    {cwd: radice, encoding: 'utf8', windowsHide: true, timeout: 10_000});
    assert.equal(result.error, undefined);
    assert.equal(result.status, 2);
    assert.match(result.stdout, /^hit\.txt:1:needle$/m);
    assert.ok(result.stderr.includes('missing.txt'));
  } finally { await rimuoviCartellaDiProvaAttesa(radice); }
});

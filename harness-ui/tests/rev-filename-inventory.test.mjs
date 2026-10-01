import assert from 'node:assert/strict';
import test, {mock} from 'node:test';
import {createRequire, syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {mkdtemp, mkdir, writeFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {cercaNelProgetto} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProvaAttesa} from './aiuto/rimuovi-cartella-di-prova.mjs';
const childProcess = createRequire(import.meta.url)('node:child_process');

function disk(radice) {
  return {
    async elenca(p = '') {
      return (await readdir(join(radice, p), {withFileTypes: true})).map(v => ({
        nome: v.name, cartella: v.isDirectory(), byte: 0,
      }));
    },
    async leggi() { assert.fail('filename search must not read content'); },
  };
}

// Process fixtures test the TALOS boundary. The two REAL tests invoke shipped rg.
async function inventory({stdout, code = 0, nome = 'needle', abort = false}) {
  const radice = await mkdtemp(join(tmpdir(), 'talos-search33-process-'));
  const previous = process.env.TALOS_RG_PATH, controller = new AbortController();
  let patch, calls = 0, listings = 0;
  try {
    process.env.TALOS_RG_PATH = process.execPath;
    patch = mock.method(childProcess, 'spawn', (_exe, args, options) => {
      calls++;
      assert.equal(options.cwd, radice);
      assert.ok(args.includes('--files'));
      assert.ok(args.includes('--null'));
      assert.equal(args.at(-1), '.');
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.kill = () => true;
      queueMicrotask(() => {
        if (stdout) child.stdout.emit('data', Buffer.from(stdout));
        if (abort) controller.abort();
        child.emit('close', code);
      });
      return child;
    });
    syncBuiltinESMExports();
    const result = await cercaNelProgetto({
      async elenca() { listings++; return []; },
      async leggi() { assert.fail('no content read'); },
    }, {nome}, {radice, segnale: controller.signal});
    assert.equal(calls, 1, 'filename inventory must use the shipped process boundary');
    return {result, listings};
  } finally {
    patch?.mock.restore();
    syncBuiltinESMExports();
    if (previous === undefined) delete process.env.TALOS_RG_PATH;
    else process.env.TALOS_RG_PATH = previous;
    await rimuoviCartellaDiProvaAttesa(radice);
  }
}

test('SEARCH33-REAL20K — a filename beyond20000 is found by actual shipped rg', async t => {
  const radice = await mkdtemp(join(tmpdir(), 'talos-search33-real20k-'));
  const previous = process.env.TALOS_RG_PATH;
  try {
    // Filesystem fixture, not fabricated rg output. Bounded batches only create test data.
    for (let i = 0; i < 20_050; i += 64) {
      await Promise.all(Array.from({length: Math.min(64, 20_050 - i)}, (_, j) =>
        writeFile(join(radice, `a-${String(i + j).padStart(5, '0')}.txt`), '')));
    }
    await writeFile(join(radice, 'z-target.txt'), Buffer.from([0, 255, 128]));
    const realDisk = disk(radice);
    process.env.TALOS_RG_PATH = join(radice, 'missing-rg.exe');
    const fallbackStart = performance.now();
    const fallback = await cercaNelProgetto(realDisk, {nome: 'z-target'}, {radice});
    t.diagnostic(`fallback_ms=${(performance.now() - fallbackStart).toFixed(2)} fixture_files=20051`);
    assert.match(fallback, /^inconclusive search:/);
    assert.match(fallback, /collecting 20000 paths/);
    assert.doesNotMatch(fallback, /^z-target\.txt$/m);
    delete process.env.TALOS_RG_PATH;
    const rgStart = performance.now();
    const result = await cercaNelProgetto(realDisk, {nome: 'z-target'}, {radice});
    t.diagnostic(`shipped_rg_ms=${(performance.now() - rgStart).toFixed(2)} order=fallback_then_rg samples=1 not_a_benchmark`);
    assert.equal(result, 'z-target.txt');
  } finally {
    if (previous === undefined) delete process.env.TALOS_RG_PATH;
    else process.env.TALOS_RG_PATH = previous;
    await rimuoviCartellaDiProvaAttesa(radice);
  }
});

test('SEARCH33-NUL — newline Unicode and binary filenames retain complete NUL records', async () => {
  const {result, listings} = await inventory({nome: 'name', stdout: './weird\nname-雪.png\0other.txt\0'});
  assert.equal(result, 'weird\nname-雪.png');
  assert.equal(listings, 0);
});

test('SEARCH33-LITERAL — nome remains a case-insensitive substring rather than a glob', async () => {
  const {result} = await inventory({nome: '*ts', stdout: 'src/main.ts\0src/LITERAL*TS.txt\0'});
  assert.equal(result, 'src/LITERAL*TS.txt');
});

test('SEARCH33-PARTIAL — exit2 preserves confirmed filenames and discloses incomplete scan', async () => {
  const {result} = await inventory({stdout: 'needle.txt\0', code: 2});
  assert.match(result, /^needle\.txt$/m);
  assert.match(result, /incomplete scan: ripgrep reported an error/);
});

test('SEARCH33-PARTIAL-ZERO — partial inventory cannot prove a filename absent', async () => {
  const {result} = await inventory({stdout: 'other.txt\0', code: 2});
  assert.match(result, /^inconclusive search:/);
  assert.doesNotMatch(result, /no file matches/);
});

test('SEARCH33-TAIL — a final non-NUL fragment is discarded and declared incomplete', async () => {
  const {result} = await inventory({stdout: 'other.txt\0needle-partial'});
  assert.match(result, /^inconclusive search:/);
  assert.match(result, /incomplete scan:.*unfinished filename/);
  assert.doesNotMatch(result, /needle-partial/);
});

test('SEARCH33-SORT40 — unique sorted filenames and exact undisplayed count', async () => {
  const paths = Array.from({length: 43}, (_, i) => `needle-${String(i).padStart(2, '0')}.txt`);
  const {result} = await inventory({stdout: [...paths].reverse().concat(paths[0]).join('\0') + '\0'});
  assert.deepEqual(result.split('\n').slice(0, 40), paths.slice(0, 40));
  assert.match(result, /and 3 more matches not shown/);
  assert.doesNotMatch(result, /3\+ more/);
});

test('SEARCH33-ABORT — Stop discards any partial filenames and returns stopped', async () => {
  const {result} = await inventory({stdout: 'needle.txt\0', abort: true});
  assert.equal(result, 'stopped: the search was interrupted.');
});

test('SEARCH33-BYTE-LIMIT — bounded stdout exposes only completed names and a lower bound', async () => {
  const paths = Array.from({length: 43}, (_, i) => `needle-${String(i).padStart(2, '0')}.txt`);
  const {result} = await inventory({stdout: paths.join('\0') + '\0needle-' + 'x'.repeat(4_000_000), code: null});
  assert.match(result, /and 3\+ more matches not shown/);
  assert.match(result, /incomplete scan: too much output/);
  assert.match(result, /unfinished filename/);
  assert.doesNotMatch(result, /x{20}|ripgrep reported an error/);
});

test('SEARCH33-NOMATCH — successful complete inventory supports a clean negative', async () => {
  const {result, listings} = await inventory({stdout: 'other.txt\0'});
  assert.match(result, /^no file matches/);
  assert.doesNotMatch(result, /incomplete|inconclusive/);
  assert.equal(listings, 0);
});

test('SEARCH33-FALLBACK — exit2 without inventory retains the disclosed JS fallback', async () => {
  const {result, listings} = await inventory({stdout: '', code: 2});
  assert.equal(result, 'no file matches. Scanned 0 files.');
  assert.equal(listings, 1);
});

test('SEARCH33-REAL-SCOPE-IGNORE — shipped rg respects scope ignore pruning and binary filenames', async () => {
  const radice = await mkdtemp(join(tmpdir(), 'talos-search33-real-scope-'));
  const previous = process.env.TALOS_RG_PATH;
  try {
    delete process.env.TALOS_RG_PATH;
    for (const p of ['src', '.git', 'node_modules', 'dist']) await mkdir(join(radice, p));
    for (const p of ['src/needle-雪.png', 'needle-root.txt', '.needle-hidden', '.git/needle-git',
      'node_modules/needle-module', 'dist/needle-build']) await writeFile(join(radice, p), Buffer.from([0, 255]));
    assert.equal(await cercaNelProgetto(disk(radice), {nome: 'needle', dentro: 'src'}, {radice}), 'src/needle-雪.png');
    const withoutIgnore = await cercaNelProgetto(disk(radice), {nome: 'needle'}, {radice});
    assert.match(withoutIgnore, /^\.needle-hidden$/m);
    assert.doesNotMatch(withoutIgnore, /needle-git|needle-module|needle-build/);
    await writeFile(join(radice, '.gitignore'), 'needle-root.txt\n');
    const withIgnore = await cercaNelProgetto(disk(radice), {nome: 'needle'}, {radice});
    assert.match(withIgnore, /^dist\/needle-build$/m, 'with a gitignore the documented fallback pruning is inactive');
    assert.doesNotMatch(withIgnore, /needle-root|needle-git|needle-module/);
  } finally {
    if (previous === undefined) delete process.env.TALOS_RG_PATH;
    else process.env.TALOS_RG_PATH = previous;
    await rimuoviCartellaDiProvaAttesa(radice);
  }
});

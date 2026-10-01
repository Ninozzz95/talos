import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, mkdir, writeFile, readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {cercaNelProgetto} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProvaAttesa} from './aiuto/rimuovi-cartella-di-prova.mjs';

const file = (nome, byte = 10) => ({nome, byte, cartella: false});
const folder = nome => ({nome, byte: 0, cartella: true});

test('SEARCH31-SCOPE20K — dentro is applied before collection, with workspace-relative results', async () => {
  const called = [];
  const disco = {
    async elenca(dentro = '') {
      called.push(dentro);
      if (dentro === '') return [...Array.from({length: 20_001}, (_, i) => file(`a-${i}.txt`)), folder('z-target')];
      if (dentro === 'z-target') return [file('needle.txt')];
      return [];
    },
    async leggi(p) { assert.equal(p, 'z-target/needle.txt'); return 'needle'; },
  };
  const result = await cercaNelProgetto(disco, {testo: 'needle', dentro: 'z-target'});
  assert.match(result, /^z-target\/needle\.txt$/m);
  assert.doesNotMatch(result, /incomplete scan|20000/);
  assert.ok(!called.includes(''), 'the global root must not consume the selected scope budget');
});

test('SEARCH31-UNREADABLE-DIR — absence cannot be concluded from an unreadable subfolder', async () => {
  const disco = {
    async elenca(p = '') { if (p === 'closed') throw Error('EACCES C:/private'); return [folder('closed')]; },
    async leggi() { assert.fail('no readable file'); },
  };
  const result = await cercaNelProgetto(disco, {nome: 'needle'});
  assert.match(result, /^inconclusive search:/);
  assert.match(result, /1 folder\(s\) could not be read/);
  assert.doesNotMatch(result, /no file matches|C:\/private/);
});

test('SEARCH31-UNREADABLE-FILE — absence cannot be concluded from a failed content read', async () => {
  const disco = {async elenca() { return [file('closed.txt')]; }, async leggi() { throw Error('EACCES C:/private'); }};
  const result = await cercaNelProgetto(disco, {testo: 'needle'});
  assert.match(result, /^inconclusive search:/);
  assert.match(result, /1 file\(s\) could not be read/);
  assert.doesNotMatch(result, /no file matches|C:\/private/);
});

test('SEARCH31-TRUNCATED-CONTENT — a marker beyond the inspected prefix is not declared absent', async () => {
  const text = 'é'.repeat(200_000) + 'needle';
  const disco = {async elenca() { return [file('long.txt', Buffer.byteLength(text))]; }, async leggi() { return text; }};
  const result = await cercaNelProgetto(disco, {testo: 'needle'});
  assert.match(result, /^inconclusive search:/);
  assert.match(result, /1 file\(s\).*first 200000 UTF-16 code units/);
  assert.doesNotMatch(result, /no file matches|first 200000 bytes/);
});

test('SEARCH31-POSITIVE-GAP — matches stay visible alongside the disclosure of incomplete coverage', async () => {
  const disco = {
    async elenca(p = '') { if (p === 'closed') throw Error('EACCES'); return [file('hit.txt'), folder('closed')]; },
    async leggi() { return 'needle'; },
  };
  const result = await cercaNelProgetto(disco, {testo: 'needle'});
  assert.match(result, /^hit\.txt$/m);
  assert.match(result, /incomplete scan: 1 folder\(s\) could not be read/);
});

test('SEARCH31-ABORT-WALK — no new listing is issued after Stop during collection', async () => {
  const stop = new AbortController();
  let listings = 0;
  const disco = {
    async elenca() { listings++; stop.abort(); return [folder('more')]; },
    async leggi() { assert.fail('no read after Stop'); },
  };
  // A second listing is bounded, so the pre-fix walker terminates and exposes the bug.
  const elenca = disco.elenca;
  disco.elenca = async () => listings === 0 ? elenca() : (++listings, []);
  assert.equal(await cercaNelProgetto(disco, {nome: 'needle'}, {segnale: stop.signal}), 'stopped: the search was interrupted.');
  assert.equal(listings, 1);
});

test('SEARCH31-CLEAN-NEGATIVE — complete small scans preserve the existing negative response', async () => {
  const disco = {async elenca() { return [file('small.txt')]; }, async leggi() { return 'nothing'; }};
  assert.equal(await cercaNelProgetto(disco, {testo: 'needle'}), 'no file matches. Scanned 1 files (1 read for content). Try a shorter or different "testo".');
});

test('SEARCH31-ABORT-READ — Stop during the last read cannot become a completed result', async () => {
  const stop = new AbortController();
  const disco = {
    async elenca() { return [file('last.txt')]; },
    async leggi() { stop.abort(); return 'needle'; },
  };
  assert.equal(await cercaNelProgetto(disco, {testo: 'needle'}, {segnale: stop.signal}), 'stopped: the search was interrupted.');
});

test('SEARCH31-REAL-IGNORE — a scoped fallback respects real ignore rules and relative paths', async () => {
  const radice = await mkdtemp(join(tmpdir(), 'talos-search31-'));
  const previous = process.env.TALOS_RG_PATH;
  try {
    await mkdir(join(radice, '.git'));
    await mkdir(join(radice, 'ignored', 'nested'), {recursive: true});
    await mkdir(join(radice, 'src'));
    await writeFile(join(radice, '.gitignore'), 'ignored/\n');
    await writeFile(join(radice, 'ignored', 'nested', 'needle.txt'), 'needle');
    await writeFile(join(radice, 'src', 'needle.txt'), 'needle');
    process.env.TALOS_RG_PATH = join(radice, 'missing-rg.exe');
    const reads = [];
    const disco = {
      async elenca(p = '') {
        return (await readdir(join(radice, p), {withFileTypes: true})).map(v => ({nome: v.name, cartella: v.isDirectory(), byte: 10}));
      },
      async leggi(p) { reads.push(p); return readFile(join(radice, p), 'utf8'); },
    };
    const excluded = await cercaNelProgetto(disco, {testo: 'needle', dentro: 'ignored/nested'}, {radice});
    assert.doesNotMatch(excluded, /needle\.txt/);
    assert.deepEqual(reads, []);
    assert.equal(await cercaNelProgetto(disco, {testo: 'needle', dentro: 'src'}, {radice}), 'src/needle.txt');
    assert.deepEqual(reads, ['src/needle.txt']);
  } finally {
    if (previous === undefined) delete process.env.TALOS_RG_PATH;
    else process.env.TALOS_RG_PATH = previous;
    await rimuoviCartellaDiProvaAttesa(radice);
  }
});

test('SEARCH31-PRUNED-SCOPE — starting inside a subfolder cannot bypass ancestor pruning', async () => {
  for (const dentro of ['node_modules/pkg', '.git/objects', 'dist/assets']) {
    let reads = 0;
    const disco = {
      async elenca(p = '') { return p === dentro ? [file('needle.txt')] : [folder(dentro.split('/')[0])]; },
      async leggi() { reads++; return 'needle'; },
    };
    const result = await cercaNelProgetto(disco, {testo: 'needle', dentro});
    assert.doesNotMatch(result, /needle\.txt/);
    assert.equal(reads, 0);
  }
});

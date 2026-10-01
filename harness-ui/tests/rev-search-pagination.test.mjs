import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp, writeFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {cercaNelProgetto, talosLavora} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProvaAttesa} from './aiuto/rimuovi-cartella-di-prova.mjs';
const names = n => Array.from({length: n}, (_, i) => `hit-${String(i).padStart(3, '0')}.txt`);
const entries = paths => paths.map(nome => ({nome, cartella: false, byte: 20}));
const pathsFrom = output => [...output.matchAll(/^(hit-\d{3}\.txt)(?::|$)/gm)].map(m => m[1]);
const next = output => Number(/nextOffset: (\d+)/.exec(output)?.[1]);
function memory(paths) {
  return {async elenca() { return entries(paths); }, async leggi() { return 'needle'; }};
}
async function real(t, count = 45) {
  const radice = await mkdtemp(join(tmpdir(), 'talos-search34-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(radice));
  await Promise.all(names(count).map(p => writeFile(join(radice, p), 'needle\n'.repeat(5))));
  return {radice, disco: {
    async elenca(p = '') { return entries(await readdir(join(radice, p))); },
    async leggi() { assert.fail('shipped rg must handle this search'); },
  }};
}

test('SEARCH34-FALLBACK-NAME — recover all45 filenames with two nonoverlapping pages', async () => {
  const all = names(45), disco = memory(all);
  const a = await cercaNelProgetto(disco, {nome: 'hit'});
  assert.equal(next(a), 40);
  const b = await cercaNelProgetto(disco, {nome: 'hit', offset: next(a)});
  assert.deepEqual([...pathsFrom(a), ...pathsFrom(b)], all);
  assert.doesNotMatch(b, /nextOffset/);
});

test('SEARCH34-FALLBACK-CONTENT — AND filters survive result file offset', async () => {
  const all = names(45), disco = memory([...all, 'other.md']);
  const a = await cercaNelProgetto(disco, {testo: 'needle', nome: '.txt'});
  const b = await cercaNelProgetto(disco, {testo: 'needle', nome: '.txt', offset: 40});
  assert.deepEqual([...pathsFrom(a), ...pathsFrom(b)], all);
  assert.doesNotMatch(a + b, /other\.md/);
});

test('SEARCH34-RG-NAME — actual rg file inventory has a usable next page', async t => {
  const {radice, disco} = await real(t);
  const a = await cercaNelProgetto(disco, {nome: 'hit'}, {radice});
  const b = await cercaNelProgetto(disco, {nome: 'hit', offset: next(a)}, {radice});
  assert.deepEqual([...pathsFrom(a), ...pathsFrom(b)], names(45));
  assert.doesNotMatch(b, /nextOffset/);
});

test('SEARCH34-RG-LINES —100line cap advances by20 actual files rather than40', async t => {
  const {radice, disco} = await real(t);
  const pages = [];
  let offset = 0;
  for (let page = 0; page < 3; page++) {
    const result = await cercaNelProgetto(disco, {testo: 'needle', offset}, {radice});
    const paths = [...new Set(pathsFrom(result))];
    assert.equal(paths.length, page === 2 ? 5 : 20);
    pages.push(...paths);
    if (page < 2) { offset = next(result); assert.equal(offset, (page + 1) * 20); }
    else assert.doesNotMatch(result, /nextOffset/);
  }
  assert.deepEqual(pages, names(45));
});

test('SEARCH34-INVALID — invalid offsets are refused before any disk access', async () => {
  let io = 0;
  const disco = {async elenca() { io++; return []; }, async leggi() { io++; return ''; }};
  for (const offset of [-1, 1.5, '40', null, {}, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    const result = await cercaNelProgetto(disco, {nome: 'hit', offset});
    assert.match(result, /^REFUSED\./);
    assert.match(result, /offset.*non-negative safe integer/);
  }
  assert.equal(io, 0);
});

test('SEARCH34-END — an offset beyond complete results is a page end not global absence', async () => {
  const result = await cercaNelProgetto(memory(names(45)), {nome: 'hit', offset: 45});
  assert.match(result, /^no further matches at offset 45/);
  assert.match(result, /current search found 45 matching files/);
  assert.doesNotMatch(result, /^hit-|nextOffset|no file matches/m);
});

test('SEARCH34-PARTIAL-END — beyond120 known content hits remains inconclusive', async () => {
  const result = await cercaNelProgetto(memory(names(121)), {testo: 'needle', offset: 120});
  assert.match(result, /^inconclusive search:/);
  assert.match(result, /stopped looking after 120 matches/);
  assert.doesNotMatch(result, /^hit-|nextOffset|no further matches|no file matches/m);
});

test('SEARCH34-PARTIAL-COUNT — unreadable folder makes undisplayed count a lower bound', async () => {
  const disco = {async elenca(p = '') {
    if (p === 'closed') throw Error('EACCES');
    return [...entries(names(45)), {nome: 'closed', cartella: true}];
  }, async leggi() { return 'needle'; }};
  const result = await cercaNelProgetto(disco, {nome: 'hit'});
  assert.match(result, /and 5\+ more matches not shown/);
  assert.equal(next(result), 40);
  assert.match(result, /1 folder\(s\) could not be read/);
});

test('SEARCH34-LIVE — continuation declares live re-evaluation and reflects changed tree', async () => {
  const all = names(45), disco = memory(all);
  const first = await cercaNelProgetto(disco, {nome: 'hit'});
  assert.match(first, /live search.*files may change/);
  all.unshift('aaa-hit.txt');
  const second = await cercaNelProgetto(disco, {nome: 'hit', offset: 40});
  assert.deepEqual(pathsFrom(second), names(45).slice(39));
});

test('SEARCH34-LEGACY — omitted offset keeps the untruncated legacy response', async () => {
  const disco = memory(['hit-000.txt']);
  assert.equal(await cercaNelProgetto(disco, {nome: 'hit'}), 'hit-000.txt');
  assert.equal(await cercaNelProgetto(disco, {nome: 'hit', offset: 0}), 'hit-000.txt');
});

test('SEARCH34-STOP — paginated fallback still honors an already-aborted signal', async () => {
  const controller = new AbortController(); controller.abort();
  const result = await cercaNelProgetto(memory(names(45)), {nome: 'hit', offset: 40}, {segnale: controller.signal});
  assert.equal(result, 'stopped: the search was interrupted.');
});

test('SEARCH34-SCHEMA — actual kernel offers offset and dispatches it to provider tool result', async t => {
  const {radice} = await real(t);
  const sent = [], events = []; let turn = 0;
  await talosLavora({
    cartella: radice, task: {consegna: 'Find the next page of hit files.'}, modello: 'fixture', chiave: 'fixture',
    onGiro: e => events.push(e), fetchDiRete: async (_url, input) => {
      sent.push(JSON.parse(input.body));
      return {ok: true, status: 200, json: async () => ({choices: [{message: turn++ === 0
        ? {role: 'assistant', content: null, tool_calls: [{id: 'page-call', type: 'function',
          function: {name: 'cerca', arguments: JSON.stringify({nome: 'hit', offset: 40})}}]}
        : {role: 'assistant', content: 'Done.'}}], usage: {prompt_tokens: 10, completion_tokens: 5}})};
    },
  });
  const schema = sent[0].tools.find(t => t.function.name === 'cerca').function.parameters;
  assert.deepEqual(schema.properties.offset.type, 'integer');
  assert.equal(schema.properties.offset.minimum, 0);
  assert.equal(schema.properties.offset.maximum, Number.MAX_SAFE_INTEGER);
  assert.ok(!schema.required.includes('offset'));
  const tool = sent[1].messages.find(m => m.tool_call_id === 'page-call');
  assert.deepEqual(pathsFrom(tool.content), names(45).slice(40));
  const event = events.find(e => e.tipo === 'tool-esito' && e.toolCallId === 'page-call');
  assert.equal(event.content, tool.content);
});

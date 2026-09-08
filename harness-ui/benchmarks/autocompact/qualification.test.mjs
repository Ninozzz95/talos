import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, realpath, readdir, symlink, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { loadRecoveredHistory, validateSummary, writeCheckpoint, readCheckpoint, scoreRecall, fixtureTools } from './cases.mjs';
import { createLoopbackBridge, countRequest, recordedRequest } from './runtime.mjs';
import { summarizeWithPi, toPiMessages } from './engines.mjs';

async function cleanup(dir) {
  const absolute = await realpath(dir);
  assert.equal(dirname(absolute).toLowerCase(), (await realpath(tmpdir())).toLowerCase());
  assert.ok(basename(absolute).startsWith('talos-aq-'));
  await rm(absolute, { recursive: true, force: true });
}

test('AQ-01 checkpoint originale invariato', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'talos-aq-'));
  try {
    const file = join(dir, 'history.jsonl');
    const source = JSON.stringify({ tipo: 'checkpoint-ripresa', versioneGiro: 6, messaggi: [{ role: 'user', content: 'Chiamami Livia.' }], recupero: { ok: true } }) + '\n';
    await writeFile(file, source);
    const result = await loadRecoveredHistory(file);
    result.messages[0].content = 'changed';
    assert.equal(await readFile(file, 'utf8'), source);
    assert.equal(result.version, 6);
    assert.equal(result.sha256, createHash('sha256').update(source).digest('hex'));
  } finally { await cleanup(dir); }
});

test('AQ-02 sintesi vuota o troncata rifiutata', () => {
  for (const response of [{ text: '', finishReason: 'stop' }, { text: '  ', finishReason: 'stop' }, { text: 'Livia', finishReason: 'length' }]) {
    assert.throws(() => validateSummary(response, { before: 1000, after: 100, limit: 500 }), /EMPTY|TRUNCATED/);
  }
});

test('AQ-03 nessuna riduzione rifiutata', () => {
  assert.throws(() => validateSummary({ text: 'Livia', finishReason: 'stop' }, { before: 100, after: 101, limit: 500 }), /NO_REDUCTION/);
  assert.throws(() => validateSummary({ text: 'Livia', finishReason: 'stop' }, { before: 1000, after: 600, limit: 500 }), /OVER_BUDGET/);
});

test('AQ-04 errore persistenza conserva checkpoint', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'talos-aq-'));
  try {
    const path = join(dir, 'checkpoint.json');
    await writeCheckpoint(path, { text: 'originale', references: ['r1'] });
    const before = await readFile(path, 'utf8');
    await assert.rejects(writeCheckpoint(path, { text: 'nuovo' }, { beforeRename: () => { const e = new Error('disk full'); e.code = 'ENOSPC'; throw e; } }), /disk full/);
    assert.equal(await readFile(path, 'utf8'), before);
    assert.equal((await readCheckpoint(path)).text, 'originale');
    assert.deepEqual(await readdir(dir), ['checkpoint.json']);
  } finally { await cleanup(dir); }
});

test('AQ-05 richiamo valutato sui riferimenti esatti', () => {
  assert.deepEqual(scoreRecall('Nome: Livia\nRamo: quercia-47\nTicket: AQ-193', ['Livia', 'quercia-47', 'AQ-193']), { correct: 3, total: 3, missing: [] });
  assert.deepEqual(scoreRecall('Nome: Livia\nRamo: quercia-48', ['Livia', 'quercia-47']), { correct: 1, total: 2, missing: ['quercia-47'] });
});

test('AQ-06 lettura confinata alla fixture', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'talos-aq-'));
  try {
    await writeFile(join(dir, 'README.md'), 'Codice: sole-47.');
    const tools = fixtureTools(dir);
    assert.equal(await tools.read({ path: 'README.md' }), 'Codice: sole-47.');
    await assert.rejects(tools.read({ path: '../README.md' }), /OUTSIDE_FIXTURE/);
    await assert.rejects(tools.read({ path: 'C:/Windows/win.ini' }), /OUTSIDE_FIXTURE/);
  } finally { await cleanup(dir); }
});

test('AQ-07 annullamento non pubblica checkpoint', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'talos-aq-'));
  try {
    const path = join(dir, 'checkpoint.json');
    await writeCheckpoint(path, { text: 'originale' });
    const control = new AbortController();
    await assert.rejects(writeCheckpoint(path, { text: 'nuovo' }, { signal: control.signal, beforeRename: () => control.abort() }), /abort/i);
    assert.equal((await readCheckpoint(path)).text, 'originale');
  } finally { await cleanup(dir); }
});

test('AQ-08 sottostringhe e negazioni non valgono come richiamo', () => {
  for (const text of ['Nome: Olivia\nRamo: quercia-470\nTicket: AQ-1930', 'Nome: non Livia\nRamo: non quercia-47\nTicket: non AQ-193']) {
    assert.equal(scoreRecall(text, ['Livia', 'quercia-47', 'AQ-193']).correct, 0);
  }
});

test('AQ-09 link fuori fixture rifiutato', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'talos-aq-'));
  try {
    await mkdir(join(dir, 'inside'));
    // Windows file symlinks need an unavailable privilege; directory junctions
    // exercise the same canonical-containment branch without that privilege.
    await mkdir(join(dir, 'outside'));
    await symlink(join(dir, 'outside'), join(dir, 'inside/README.md'), 'junction');
    await assert.rejects(fixtureTools(join(dir, 'inside')).read({ path: 'README.md' }), /OUTSIDE_FIXTURE/);
  } finally { await cleanup(dir); }
});

test('AQ-10 checkpoint temporanei ripuliti e ingresso annullato', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'talos-aq-'));
  try {
    const path = join(dir, 'checkpoint.json');
    await assert.rejects(writeCheckpoint(path, { text: 'nuovo' }, { signal: AbortSignal.abort() }), /abort/i);
    assert.deepEqual(await readdir(dir), []);
    await writeCheckpoint(path, { text: 'originale', references: ['r1'], version: 1 });
    const bytes = await readFile(path);
    const c = new AbortController();
    await assert.rejects(writeCheckpoint(path, { text: 'nuovo' }, { signal: c.signal, beforeRename: () => c.abort() }), /abort/i);
    assert.deepEqual(await readFile(path), bytes);
    assert.deepEqual(await readdir(dir), ['checkpoint.json']);
  } finally { await cleanup(dir); }
});

test('AQ-11 conteggio prima del proxy Python', async () => {
  const paths = [];
  const runtime = { model: 'fixture', record: async () => {}, request: async path => {
    paths.push(path);
    return path.endsWith('/input_tokens') ? { input_tokens: 12 } : { choices: [{ message: { content: 'ok' } }] };
  } };
  const bridge = await createLoopbackBridge(runtime);
  try {
    const response = await fetch(`${bridge.baseUrl}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${bridge.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'fixture', messages: [{ role: 'user', content: 'Ciao' }] }) });
    assert.equal(response.status, 200);
    assert.deepEqual(paths, ['/v1/chat/completions/input_tokens', '/v1/chat/completions']);
  } finally { await bridge.close(); }
});

test('AQ-14 fallback conteggio dichiarato', async () => {
  const runtime = { request: async () => { const e = new Error('missing'); e.status = 404; throw e; } };
  const counted = await countRequest(runtime, { messages: [] });
  assert.equal(counted.exact, false);
  assert.equal(counted.method, 'json-chars/4');
  await assert.rejects(countRequest({ request: async () => ({ input_tokens: -1 }) }, {}), /INVALID_INPUT_TOKENS/);
});

test('AQ-13 API pubblica Pi: vuoto restituito, troncamento rifiutato, annullamento terminale', async () => {
  const messages = [{ role: 'user', content: 'Chiamami Livia.' }];
  const fake = (text, stopReason) => async () => ({ result: async () => ({ content: [{ type: 'text', text }], stopReason, usage: { input: 10, output: 1 } }) });
  const empty = await summarizeWithPi(messages, { streamFn: fake('', 'stop') });
  assert.equal(empty.text, ''); // Characterization of the actual installed public API.
  assert.throws(() => validateSummary(empty, { before: 100, after: 10, limit: 50 }), /EMPTY/);
  await assert.rejects(summarizeWithPi(messages, { streamFn: fake('Livia', 'length') }), /token cap/);
  const c = new AbortController();
  const streamFn = async () => ({ result: async () => { c.abort(); return { content: [{ type: 'text', text: 'parziale' }], stopReason: 'aborted', usage: {} }; } });
  await assert.rejects(summarizeWithPi(messages, { streamFn, signal: c.signal }), /abort/i);
});

test('AQ-15 conversione Pi conserva testo e associazioni tool', () => {
  const source = [{ role: 'system', content: 'Non scrivere file.' }, { role: 'assistant', content: 'Controllo.', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: '{"path":"README.md"}' } }] }, { role: 'tool', tool_call_id: 'c1', content: 'sole-47' }];
  const converted = toPiMessages(source);
  assert.match(converted[0].content[0].text, /Non scrivere file/);
  assert.equal(converted[1].content[1].id, 'c1');
  assert.deepEqual(converted[1].content[1].arguments, { path: 'README.md' });
  assert.equal(converted[2].toolCallId, 'c1');
  assert.equal(converted[2].toolName, 'leggi');
  assert.equal(converted[2].content[0].text, 'sole-47');
});

test('AQ-16 annullamento dopo sintesi impedisce pubblicazione', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'talos-aq-'));
  try {
    const path = join(dir, 'checkpoint.json');
    await writeCheckpoint(path, { generation: 0, messages: ['originale'] });
    const before = await readFile(path);
    const c = new AbortController();
    const summary = await Promise.resolve({ text: 'sintesi pronta' });
    c.abort();
    await assert.rejects(writeCheckpoint(path, summary, { signal: c.signal }), /abort/i);
    assert.deepEqual(await readFile(path), before);
  } finally { await cleanup(dir); }
});

test('AQ-12 errore durante lettura body conserva evento trasporto', async () => {
  const events = [];
  const supervisor = { request: async () => ({ text: async () => { throw new Error('socket closed'); } }) };
  await assert.rejects(recordedRequest(supervisor, async (kind, value) => events.push({kind,...value}), 'fixture', '/v1/chat/completions', { messages: [] }), /socket closed/);
  assert.deepEqual(events.map(e => e.kind), ['request', 'transport-error']);
  assert.equal(events[1].path, '/v1/chat/completions');
});

test('AQ-17 codice del file: negazione e suffisso non sono corretti', () => {
  assert.equal(scoreRecall('Codice: sole-47', ['sole-47']).correct, 1);
  assert.equal(scoreRecall('Codice: non sole-47', ['sole-47']).correct, 0);
  assert.equal(scoreRecall('Codice: sole-47-extra', ['sole-47']).correct, 0);
});

test('AQ-18 profilo identico sulle inferenze Python', async () => {
  const requests = [];
  const bridge = await createLoopbackBridge({ model: 'fixture', record: async () => {}, request: async (path, body) => {
    requests.push({path,body});
    return path.endsWith('input_tokens') ? { input_tokens: 12 } : { choices: [{ message: { content: 'ok' } }] };
  } });
  try {
    await fetch(`${bridge.baseUrl}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${bridge.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'fixture', messages: [], temperature: 0.3, max_tokens: 1024 }) });
    assert.equal(requests.at(-1).body.temperature, 0);
    assert.equal(requests.at(-1).body.seed, 193);
    assert.equal(requests.at(-1).body.max_tokens, 4096);
    assert.deepEqual(requests[0].body, requests[1].body);
  } finally { await bridge.close(); }
});

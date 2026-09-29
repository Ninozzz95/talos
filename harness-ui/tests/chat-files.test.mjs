import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createServer } from 'node:http';
import test from 'node:test';

import { saveChatFile, MAX_CHAT_FILE_BYTES } from '../src/chat-file-upload.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const withWorkspace = async (run) => {
  const rootDir = mkdtempSync(join(tmpdir(), 'talos-chat-files-'));
  try { await run(rootDir); } finally { rimuoviCartellaDiProva(rootDir); }
};
const upload = (rootDir, name, bytes) => saveChatFile({ rootDir, name, source: Readable.from([bytes]) });

test('CHAT-FILES-BYTES: copied binary bytes survive without UTF-8 decoding', async () => withWorkspace(async (rootDir) => {
  const bytes = Buffer.from([0, 0xff, 0x80, 0x50, 0x4b, 0, 10]);
  const result = await upload(rootDir, 'dati.zip', bytes);
  assert.deepEqual(result, { tipo: 'file', nome: 'dati.zip', percorso: 'allegati/dati.zip', bytes: bytes.length });
  assert.deepEqual(readFileSync(join(rootDir, result.percorso)), bytes);
}));

test('CHAT-FILES-COLLISION: concurrent uploads get distinct paths and never overwrite', async () => withWorkspace(async (rootDir) => {
  const results = await Promise.all([upload(rootDir, 'report.pdf', Buffer.from('one')), upload(rootDir, 'report.pdf', Buffer.from('two'))]);
  assert.deepEqual(new Set(results.map((value) => value.percorso)), new Set(['allegati/report.pdf', 'allegati/report-2.pdf']));
  assert.deepEqual(new Set(results.map((value) => readFileSync(join(rootDir, value.percorso), 'utf8'))), new Set(['one', 'two']));
}));

test('CHAT-FILES-LIMIT: count bytes while streaming and remove incomplete file', async () => withWorkspace(async (rootDir) => {
  const source = Readable.from([Buffer.alloc(MAX_CHAT_FILE_BYTES, 1), Buffer.from([2])]);
  await assert.rejects(saveChatFile({ rootDir, name: 'big.bin', source }), (error) => error.code === 'PAYLOAD_LIMIT');
  assert.equal(existsSync(join(rootDir, 'allegati/big.bin')), false);
  assert.deepEqual(readdirSync(join(rootDir, 'allegati')).filter((name) => name.endsWith('.part')), []);
}));

test('CHAT-FILES-NAME: paths, device names and invalid Windows names are refused', async () => withWorkspace(async (rootDir) => {
  for (const name of ['../outside', 'a/b', 'a\\b', 'CON.txt', 'tail.', 'bad:name', '']) {
    await assert.rejects(upload(rootDir, name, Buffer.from('x')), (error) => error.code === 'QUERY_INVALID', name);
  }
  assert.equal(existsSync(join(rootDir, 'allegati')), false);
}));

test('CHAT-FILES-SYMLINK: an attachments link outside the workspace is refused', async (t) => {
  await withWorkspace(async (rootDir) => withWorkspace(async (outside) => {
    try { symlinkSync(outside, join(rootDir, 'allegati'), 'junction'); }
    catch (error) { if (error.code === 'EPERM') return t.skip('junction creation unavailable'); throw error; }
    await assert.rejects(upload(rootDir, 'safe.bin', Buffer.from('x')), (error) => error.code === 'FOLDER_INVALID');
    assert.deepEqual(readdirSync(outside), []);
  }));
});

test('CHAT-FILES-DIRECTORY-SWAP: replacing the checked attachments directory cannot publish outside', async () => {
  await withWorkspace(async (rootDir) => withWorkspace(async (outside) => {
    const attachments = join(rootDir, 'allegati');
    let attempted = false;
    async function* racingSource() {
      attempted = true;
      try {
        renameSync(attachments, join(rootDir, 'allegati-before-swap'));
        symlinkSync(outside, attachments, 'junction');
      } catch (error) {
        if (!['EACCES', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
      }
      yield Buffer.from('x');
    }
    const receipt = await saveChatFile({ rootDir, name: 'safe.bin', source: racingSource() });
    assert.equal(attempted, true);
    assert.deepEqual(readdirSync(outside), []);
    assert.equal(readFileSync(join(rootDir, receipt.percorso), 'utf8'), 'x');
  }));
});

test('CHAT-FILES-ABORT: a failed stream leaves no published file', async () => withWorkspace(async (rootDir) => {
  async function* interrupted() { yield Buffer.from('partial'); throw new Error('client disconnected'); }
  await assert.rejects(saveChatFile({ rootDir, name: 'partial.bin', source: interrupted() }), /client disconnected/u);
  assert.equal(existsSync(join(rootDir, 'allegati/partial.bin')), false);
  assert.deepEqual(readdirSync(join(rootDir, 'allegati')).filter((name) => name.endsWith('.part')), []);
}));

test('CHAT-FILES-HELPER-MISSING: no path-based fallback is used', async () => withWorkspace(async (rootDir) => {
  await assert.rejects(saveChatFile({ rootDir, name: 'safe.bin', source: Readable.from([Buffer.from('x')]),
    helperPath: join(rootDir, 'missing-upload-helper.exe') }), (error) => error.code === 'FILE_WRITE_FAILED');
  assert.equal(existsSync(join(rootDir, 'allegati')), false);
}));

test('CHAT-FILES-HTTP: authenticated same-origin request copies bytes to the selected session only', async () => withWorkspace(async (rootDir) => {
  const app = createHttpApp({ staticHandler: () => {}, token: 'test-chat-file-token',
    sessionRegistry: { cartellaPerChatFile: (id) => id === 's1'
      ? { ok: true, cartella: rootDir } : { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' } } });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const bytes = Buffer.from([0, 255, 80, 75, 0]);
  const request = (id, headers = {}) => fetch(`${base}/api/v1/sessions/${id}/chat-files`, {
    method: 'POST', body: bytes, headers: { 'Content-Type': 'application/octet-stream',
      'X-Talos-File-Name': encodeURIComponent('dati € .zip'), Origin: base,
      'Sec-Fetch-Site': 'same-origin', Cookie: 'talos_token=test-chat-file-token', ...headers },
  });
  try {
    assert.equal((await request('s1', { Cookie: '' })).status, 401);
    assert.equal((await request('s1', { Origin: 'https://other.example' })).status, 403);
    assert.equal((await request('missing')).status, 404);
    const response = await request('s1');
    assert.equal(response.status, 201);
    const { data } = await response.json();
    assert.deepEqual(data, { tipo: 'file', nome: 'dati € .zip', percorso: 'allegati/dati € .zip', bytes: bytes.length });
    assert.deepEqual(readFileSync(join(rootDir, data.percorso)), bytes);
  } finally { await new Promise((resolve) => server.close(resolve)); }
}));

test('CHAT-FILES-REAL-SESSION: HTTP receipt resolves to bytes in the actual registry workspace', async () => withWorkspace(async (rootDir) => {
  const workspace = join(rootDir, 'progetto');
  const cartellaStore = join(rootDir, 'sessioni');
  mkdirSync(workspace);
  mkdirSync(cartellaStore);
  const registry = createSessionRegistry({ cartellaStore, modello: 'test/model', chiave: 'test',
    guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: () => ({ cartella: workspace, comandoProva: 'node --test', task: { id: 'test', consegna: 'prova' } }),
    avviaSessioneFn: async (input) => {
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' });
      input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r' });
      return { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [] } };
    },
  });
  const { sessionId } = registry.avvia('test');
  assert.ok(sessionId);
  const server = createServer(createHttpApp({ staticHandler: () => {}, sessionRegistry: registry }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (name, body) => fetch(`${base}/api/v1/sessions/${sessionId}/chat-files`, {
    method: 'POST', body, signal: AbortSignal.timeout(15000), headers: { Origin: base, 'Sec-Fetch-Site': 'same-origin',
      'Content-Type': 'application/octet-stream', 'X-Talos-File-Name': encodeURIComponent(name) },
  });
  try {
    const bytes = Buffer.from([0, 255, 80, 75]);
    const response = await post('allegato.zip', bytes);
    assert.equal(response.status, 201);
    const receipt = (await response.json()).data;
    const recovered = await registry.scaricaFile(sessionId, receipt.percorso);
    assert.equal(recovered.ok, true);
    assert.deepEqual(recovered.bytes, bytes);
    const tooLarge = await post('too-large.bin', Buffer.alloc(MAX_CHAT_FILE_BYTES + 1, 1));
    assert.equal(tooLarge.status, 413);
    assert.equal(existsSync(join(workspace, 'allegati', 'too-large.bin')), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await registry.chiudi();
  }
}));

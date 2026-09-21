import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';

async function listen(t, extra = {}) {
  const server = createServer(createHttpApp({ staticHandler: async () => null, ...extra }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('WORKSPACE-CHOOSER-ROOT-01 — GET /api/v1/workspace-browser inoltra il path opzionale e conserva la busta API', async (t) => {
  const calls = [];
  const value = { root: 'C:\\', path: 'C:\\Users', parent: 'C:\\', items: [], recommended: [] };
  const base = await listen(t, { workspaceBrowser: { browse: async (path) => { calls.push(path); return value; } } });
  const rootResponse = await fetch(`${base}/api/v1/workspace-browser`);
  assert.equal(rootResponse.status, 200);
  assert.deepEqual((await rootResponse.json()).data, value);
  const pathResponse = await fetch(`${base}/api/v1/workspace-browser?path=${encodeURIComponent('C:\\Users')}`);
  assert.equal(pathResponse.status, 200);
  assert.deepEqual(calls, [undefined, 'C:\\Users']);
});

test('WORKSPACE-CHOOSER-TRAVERSAL-03 — query sconosciute o path duplicati sono rifiutati senza chiamare il disco', async (t) => {
  let calls = 0;
  const base = await listen(t, { workspaceBrowser: { browse: async () => { calls += 1; return {}; } } });
  for (const query of ['?other=x', '?path=C%3A%5C&path=C%3A%5CUsers']) {
    const response = await fetch(`${base}/api/v1/workspace-browser${query}`);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'QUERY_INVALID');
  }
  assert.equal(calls, 0);
});

test('WORKSPACE-CHOOSER-PERMISSION-05 — errore adapter viene normalizzato senza dettagli tecnici', async (t) => {
  const base = await listen(t, { workspaceBrowser: { browse: async () => { const error = new Error('EACCES C:\\secret'); error.code = 'WORKSPACE_NOT_AVAILABLE'; throw error; } } });
  const response = await fetch(`${base}/api/v1/workspace-browser`);
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error.code, 'WORKSPACE_NOT_AVAILABLE');
  assert.equal(JSON.stringify(body).includes('EACCES'), false);
  assert.equal(JSON.stringify(body).includes('secret'), false);
});

test('WORKSPACE-CHOOSER-INVERSE-19 — endpoint assente non finge una root', async (t) => {
  const base = await listen(t);
  const response = await fetch(`${base}/api/v1/workspace-browser`);
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, 'WORKSPACE_NOT_AVAILABLE');
});

test('WORKSPACE-NEW-FOLDER-ROUTE-07 — POST crea la cartella tramite adapter e conserva la busta API', async (t) => {
  const calls = [];
  const value = { name: 'Nuovo progetto', path: 'C:\\Users\\Nuovo progetto' };
  const base = await listen(t, { workspaceBrowser: {
    browse: async () => ({}),
    createFolder: async (parentPath, name) => { calls.push({ parentPath, name }); return value; },
  } });

  const response = await fetch(`${base}/api/v1/workspace-browser/folders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ parentPath: 'C:\\Users', name: 'Nuovo progetto' }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, value);
  assert.deepEqual(calls, [{ parentPath: 'C:\\Users', name: 'Nuovo progetto' }]);
});

test('WORKSPACE-NEW-FOLDER-ROUTE-INVERSE-08 — payload extra e adapter assente non mutano il disco', async (t) => {
  let calls = 0;
  const base = await listen(t, { workspaceBrowser: {
    browse: async () => ({}),
    createFolder: async () => { calls += 1; return {}; },
  } });
  const invalid = await fetch(`${base}/api/v1/workspace-browser/folders`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ parentPath: 'C:\\Users', name: 'x', extra: true }),
  });
  assert.equal(invalid.status, 400);
  assert.equal(calls, 0);

  const withoutAdapter = await listen(t);
  const unavailable = await fetch(`${withoutAdapter}/api/v1/workspace-browser/folders`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ parentPath: 'C:\\Users', name: 'x' }),
  });
  assert.equal(unavailable.status, 422);
  assert.equal((await unavailable.json()).error.code, 'WORKSPACE_NOT_AVAILABLE');
});

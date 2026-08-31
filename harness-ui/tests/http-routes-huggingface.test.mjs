import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createHttpApp } from '../src/http-app.mjs';

async function listen(t, extra) {
  const server = createServer(createHttpApp({ staticHandler: async () => null, ...extra }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('HF-HTTP-01 espone ricerca, dettaglio e download senza segreti', async (t) => {
  const calls = [];
  const base = await listen(t, {
    hfHubClient: { searchModels: async (options) => { calls.push(['search', options]); return { items: [{ repo: 'org/model', revision: 'a'.repeat(40) }] }; }, describeModel: async () => ({ repo: 'org/model', revision: 'a'.repeat(40), readme: '# model' }), listGgufFiles: async () => [{ path: 'model.gguf', sizeBytes: 4, sha256: 'b'.repeat(64) }] },
    localModelTransfer: { start: async (manifest) => ({ id: manifest.id, state: 'running', progress: 0 }), status: () => ({ id: 'org-model', state: 'running', progress: 10 }), pause: async () => true, resume: async () => true, cancel: async () => true },
  });
  const search = await (await fetch(`${base}/api/v1/huggingface/search?query=model&limit=5`)).json();
  assert.equal(search.data.items[0].repo, 'org/model');
  const download = await fetch(`${base}/api/v1/huggingface/download`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'org-model', repo: 'org/model', revision: 'a'.repeat(40), files: [{ path: 'model.gguf', bytes: 4, sha256: 'b'.repeat(64) }], bytes: 4, sha256: 'b'.repeat(64), license: 'apache-2.0', path: 'org-model' }) });
  assert.equal(download.status, 200);
  assert.equal(JSON.stringify(await download.json()).includes('secret'), false);
  assert.equal(calls[0][1].limit, 5);
});

test('HF-HTTP-IMAGE-01 serve le immagini delle model card solo dal proxy locale', async (t) => {
  const seen = [];
  const base = await listen(t, {
    hfImageProxyFn: async (url) => { seen.push(url); return { mimeType: 'image/png', bytes: Buffer.from([137, 80, 78, 71]) }; },
  });
  const source = 'https://huggingface.co/org/model/resolve/main/card.png';
  const response = await fetch(`${base}/api/v1/huggingface/image?url=${encodeURIComponent(source)}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [137, 80, 78, 71]);
  assert.deepEqual(seen, [source]);
});

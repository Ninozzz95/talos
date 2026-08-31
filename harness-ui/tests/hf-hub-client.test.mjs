import assert from 'node:assert/strict';
import test from 'node:test';
import { createHfHubClient } from '../src/hf-hub-client.mjs';

function response(body, { status = 200, headers = {} } = {}) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(headers), json: async () => body, text: async () => String(body ?? '') };
}

test('HF-HUB-SEARCH-01 normalizza risultati e non espone token', async () => {
  const calls = [];
  const client = createHfHubClient({ token: 'secret', fetchImpl: async (url, options) => { calls.push({ url: String(url), options }); return response([{ id: 'org/model', sha: 'a'.repeat(40), downloads: 12, likes: 3, gated: false, tags: ['gguf'], cardData: { license: 'apache-2.0' } }]); } });
  const result = await client.searchModels({ query: 'model', limit: 5 });
  assert.equal(result.items[0].repo, 'org/model');
  assert.equal(result.items[0].revision, 'a'.repeat(40));
  assert.match(calls[0].options.headers.Authorization, /^Bearer /);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('HF-HUB-GATED-01 trasforma 403 in errore gated', async () => {
  const client = createHfHubClient({ fetchImpl: async () => response({}, { status: 403 }) });
  await assert.rejects(client.describeModel('org/private'), { code: 'HF_REPOSITORY_GATED' });
});

test('HF-HUB-RESOLVE-01 consente solo CDN HTTPS ufficiali', async () => {
  const client = createHfHubClient({ fetchImpl: async (url) => response(null, { status: 302, headers: { location: String(url).includes('bad') ? 'https://evil.example/file' : 'https://cdn-lfs.huggingface.co/file?Expires=9' } }) });
  const good = await client.resolveDownload('org/model', 'a'.repeat(40), 'foo.gguf');
  assert.equal(good.url.startsWith('https://cdn-lfs.huggingface.co/'), true);
  await assert.rejects(client.resolveDownload('org/model', 'a'.repeat(40), 'bad.gguf'), { code: 'HF_REDIRECT_HOST_REJECTED' });
});

test('HF-HUB-PATHS-01 legge size e sha256 dai paths-info', async () => {
  const client = createHfHubClient({ fetchImpl: async (_url, options) => options?.method === 'POST'
    ? response({ files: [{ path: 'm.gguf', size: 4, lfs: { oid: 'b'.repeat(64) }, security: { status: 'safe' } }] })
    : response([{ path: 'm.gguf', type: 'file', size: 4 }]) });
  const files = await client.pathsInfo('org/model', 'a'.repeat(40), ['m.gguf']);
  assert.deepEqual(files, [{ path: 'm.gguf', sizeBytes: 4, sha256: 'b'.repeat(64), security: 'safe' }]);
});

test('HF-HUB-CARD-IMAGE-01 estrae immagini HTML/Markdown senza lasciare tag grezzi nella descrizione', async () => {
  const readme = '<img src="https://cdn-uploads.huggingface.co/card.png" alt="Card" />\n![Diagram](assets/diagram.png)\n# Model';
  const client = createHfHubClient({ fetchImpl: async (url) => String(url).includes('/api/models/')
    ? response({ sha: 'a'.repeat(40), gated: false })
    : response(readme) });
  const detail = await client.describeModel('org/model', 'a'.repeat(40));
  assert.doesNotMatch(detail.readme, /<img|!\[/iu);
  assert.equal(detail.images.length, 2);
  assert.deepEqual(detail.images[0], { alt: 'Card', url: 'https://cdn-uploads.huggingface.co/card.png' });
  assert.equal(detail.images[1].url, `https://huggingface.co/org/model/resolve/${'a'.repeat(40)}/assets/diagram.png`);
});

test('HF-HUB-SEARCH-02 inoltra filtri, ordinamento e cursore senza perdere la revisione', async () => {
  let requested;
  const client = createHfHubClient({ fetchImpl: async (url) => {
    requested = new URL(url);
    return response({ items: [{ id: 'org/q4', sha: 'b'.repeat(40), downloads: 4 }], next: 'cursor-2' });
  } });
  const result = await client.searchModels({ query: 'qwen', limit: 10, cursor: 'cursor-1', sort: 'likes', direction: '1', author: 'org', filters: ['text-generation', 'q4'] });
  assert.equal(requested.searchParams.get('search'), 'qwen');
  assert.equal(requested.searchParams.get('limit'), '10');
  assert.equal(requested.searchParams.get('sort'), 'likes');
  assert.equal(requested.searchParams.get('direction'), '1');
  assert.equal(requested.searchParams.get('author'), 'org');
  assert.deepEqual(requested.searchParams.getAll('filter'), ['gguf', 'text-generation', 'q4']);
  assert.equal(requested.searchParams.get('cursor'), 'cursor-1');
  assert.equal(result.nextCursor, 'cursor-2');
});

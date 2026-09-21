import assert from 'node:assert/strict';
import test from 'node:test';
import { createHfHubClient } from '../src/hf-hub-client.mjs';

function response(body, { status = 200, headers = {} } = {}) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(headers), json: async () => body, text: async () => String(body ?? '') };
}

test('RIPRESA-HF-PARAMETRI-API — totale dichiarato, mai nome o byte', async () => {
  const values = [30532122624, null, -1, '8000000000', Infinity, 0];
  const client = createHfHubClient({ fetchImpl: async () => response(values.map((total, i) => ({ id: `org/8B-${i}`, gguf: { total } }))) });
  assert.deepEqual((await client.searchModels()).items.map(x => x.parameterCount), [30532122624, null, null, null, null, null]);
});
test('RIPRESA-HF-ACCESSO-ENUM — manual e auto richiedono accesso, assenza ignota', async () => {
  let url;
  const client = createHfHubClient({ fetchImpl: async u => { url = u; return response([false, true, 'manual', 'auto', undefined].map((gated, i) => ({ id: `org/model-${i}`, gated }))); } });
  assert.deepEqual((await client.searchModels()).items.map(x => x.gated), [false, true, true, true, null]);
  assert.ok(url.searchParams.getAll('expand[]').includes('gated'));
});
test('RIPRESA-HF-PAGINE-LINK — cursore ufficiale e preservazione query', async () => {
  const calls = [];
  const client = createHfHubClient({ fetchImpl: async url => { calls.push(url); return response([{ id: 'org/model' }], { headers: { Link: '<https://huggingface.co/api/models?cursor=pagina%2B2>; rel="next"' } }); } });
  const first = await client.searchModels({ query: 'qwen' });
  assert.equal(first.nextCursor, 'pagina+2');
  await client.searchModels({ query: 'qwen', cursor: first.nextCursor });
  assert.equal(calls[1].searchParams.get('cursor'), 'pagina+2');
  assert.equal(calls[1].searchParams.get('search'), 'qwen');
});
test('RIPRESA-HF-PAGINE-LINK-OSTILE — non importare cursori da altri host o percorsi', async () => {
  for (const link of ['https://evil.example/api/models?cursor=x','https://huggingface.co/api/datasets?cursor=x','https://user@huggingface.co/api/models?cursor=x']) {
    const client = createHfHubClient({ fetchImpl: async () => response([], { headers: { Link: `<${link}>; rel="next"` } }) });
    assert.equal((await client.searchModels()).nextCursor, null);
  }
});

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


test('RIPRESA-HF-ORDINAMENTI-ADAPTER — valori della UI, alias e paginazione attraversano il client', async () => {
  const calls = [];
  const client = createHfHubClient({ fetchImpl: async url => {
    calls.push(new URL(url));
    return response([{ id: 'org/model' }]);
  } });
  for (const sort of ['downloads', 'likes', 'createdAt', 'lastModified', 'created']) {
    await client.searchModels({ sort, cursor: 'next-page', query: 'qwen', limit: 1 });
    assert.equal(calls.at(-1).searchParams.get('sort'), sort === 'created' ? 'createdAt' : sort);
    assert.equal(calls.at(-1).searchParams.get('cursor'), 'next-page');
    assert.equal(calls.at(-1).searchParams.get('search'), 'qwen');
  }
  await assert.rejects(client.searchModels({ sort: 'anything' }), { code: 'HF_HUB_INVALID' });
  assert.equal(calls.length, 5, 'un sort sconosciuto non deve contattare upstream');
});

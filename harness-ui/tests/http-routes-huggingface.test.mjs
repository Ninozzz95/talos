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

/*
 * ⛔⛔⛔ 03/9 — BUG REALE trovato riproducendo a mano una chiamata a
 * /huggingface/repo con `revision=main`: 500 INTERNAL_ERROR. Causa:
 * listGgufFiles/pathsInfo (hf-hub-client.mjs) validano la revision con
 * ensureRevision — SOLO un commit hash vero (40-64 esa), mai un nome di
 * branch — ma la rotta passava `revision` GREZZA (il parametro della
 * query) invece di `detail.revision` (quello che describeModel ha GIÀ
 * risolto). Non raggiungibile dalla UI di oggi (app.js passa sempre
 * item.revision già risolto dalla ricerca) — ma un endpoint HTTP resta
 * raggiungibile da chiunque tocchi il loopback, mai da fidarsi ciecamente
 * dell'input.
 */
test('HF-HTTP-REPO-01 usa la revision RISOLTA da describeModel, non quella grezza della query', async (t) => {
  const chiamate = [];
  const base = await listen(t, {
    hfHubClient: {
      describeModel: async (repo, revision) => { chiamate.push(['describeModel', repo, revision]); return { repo, revision: 'c'.repeat(40), readme: '# model' }; },
      listGgufFiles: async (repo, revision) => { chiamate.push(['listGgufFiles', repo, revision]); return [{ path: 'model.gguf', sizeBytes: 4, sha256: 'b'.repeat(64) }]; },
      pathsInfo: async (repo, revision, paths) => { chiamate.push(['pathsInfo', repo, revision, paths]); return paths.map((path) => ({ path, sizeBytes: 4 })); },
    },
  });
  // ⭐ Stesso valore che una vera ricerca produce (search.items[].revision): già un hash risolto, non 'main'.
  const risposta = await fetch(`${base}/api/v1/huggingface/repo?repo=${encodeURIComponent('org/model')}&revision=${'c'.repeat(40)}`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.data.files.length, 1);
  assert.deepEqual(chiamate.find((c) => c[0] === 'listGgufFiles').slice(1), ['org/model', 'c'.repeat(40)]);
  assert.deepEqual(chiamate.find((c) => c[0] === 'pathsInfo').slice(1, 3), ['org/model', 'c'.repeat(40)]);
});

test('⛔ HF-HTTP-REPO-02 AL CONTRARIO — una revision GREZZA non risolta (es. "main") non fa mai schiantare la rotta', async (t) => {
  const chiamate = [];
  const base = await listen(t, {
    hfHubClient: {
      // describeModel accetta 'main' (risolve internamente all'hub) e torna l'hash VERO.
      describeModel: async (repo) => ({ repo, revision: 'd'.repeat(40), readme: '# model' }),
      // listGgufFiles/pathsInfo, come i veri (ensureRevision): rifiutano qualunque cosa non sia un hash — se ricevessero 'main' letterale, lancerebbero.
      listGgufFiles: async (repo, revision) => {
        chiamate.push(revision);
        if (!/^[a-f0-9]{40,64}$/iu.test(revision)) throw new Error('revision is invalid');
        return [{ path: 'model.gguf', sizeBytes: 4, sha256: 'b'.repeat(64) }];
      },
      pathsInfo: async (repo, revision, paths) => paths.map((path) => ({ path, sizeBytes: 4 })),
    },
  });
  const risposta = await fetch(`${base}/api/v1/huggingface/repo?repo=${encodeURIComponent('org/model')}&revision=main`);
  assert.equal(risposta.status, 200, 'mai un 500: la rotta deve risolvere da sola la revision vera prima di chiamare listGgufFiles');
  const corpo = await risposta.json();
  assert.equal(corpo.data.files.length, 1);
  assert.deepEqual(chiamate, ['d'.repeat(40)], 'listGgufFiles riceve SEMPRE l\'hash risolto, mai la stringa grezza della query');
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

/**
 * 11/10/2026 — la pillola del ragionamento legge i livelli da UNA chiamata (`GET /api/v1/models`, campi `livelliDiretti` e
 * `filoDiretti`): quelli dei modelli del piano ChatGPT devono arrivare lì, dall'elenco vero dell'account. Server vero su porta
 * effimera, nessuna rete esterna.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createHttpApp } from '../src/http-app.mjs';

async function avvia(t, opzioni) {
  const server = createServer(createHttpApp({ staticHandler: async () => null, catalogoModelliFn: async () => ({ modelli: [] }), ...opzioni }));
  await new Promise((ok, no) => { server.once('error', no); server.listen(0, '127.0.0.1', ok); });
  t.after(() => new Promise((ok) => server.close(ok)));
  return `http://127.0.0.1:${server.address().port}`;
}
const leggi = async (base) => (await (await fetch(`${base}/api/v1/models`)).json()).data;

test('LIVELLI-PIANO-01 — da collegati, /api/v1/models porta i livelli e il filo dei modelli del piano accanto a quelli degli altri fornitori diretti', async (t) => {
  const base = await avvia(t, { catalogoChatgpt: { elenca: async () => [{ id: 'chatgpt:gpt-6-luna', livelliRagionamento: ['low', 'medium', 'ultra'] }] } });
  const dati = await leggi(base);
  assert.deepEqual(dati.livelliDiretti.chatgpt, { 'gpt-6-luna': ['low', 'medium'] });
  assert.equal(dati.filoDiretti.chatgpt['gpt-6-luna'].none, null);
  assert.equal(dati.filoDiretti.chatgpt['gpt-6-luna'].low, 'low');
  assert.ok(Object.keys(dati.livelliDiretti).length > 1, 'gli altri fornitori diretti restano');
});

test('LIVELLI-PIANO-02 AL CONTRARIO — scollegati, elenco che fallisce, o server senza piano: la rotta risponde lo stesso e non inventa livelli', async (t) => {
  for (const catalogoChatgpt of [null, { elenca: async () => { throw Object.assign(new Error('No ChatGPT account is connected.'), { code: 'CHATGPT_NON_COLLEGATO' }); } }, { elenca: async () => [] }]) {
    const dati = await leggi(await avvia(t, { catalogoChatgpt }));
    assert.equal('chatgpt' in dati.livelliDiretti, false);
    assert.equal('chatgpt' in dati.filoDiretti, false);
    assert.deepEqual(dati.modelli, []);
  }
});

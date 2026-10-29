/*
 * L-1 del kit dello stress test (29/10/2026): con OpenRouter impostato su un altro indirizzo la chat lo rispettava, ma la generazione
 * di immagini mandava la CHIAVE sempre a openrouter.ai. Owner 29/10 sera, «anche le immagini all'indirizzo scelto» (come Z.AI il
 * 14/10, «la chiave solo all'indirizzo scelto»): le due strade delle immagini (`/images` e `/chat/completions`) partono dalla stessa
 * base della chat, e senza un indirizzo scelto resta quello di serie.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { baseImmaginiOpenRouter, generaImmagineOpenRouter } from '../src/image-generator.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';

test('IMG-IND-05 il filo dal REGISTRO al servizio: `baseImmaginiFn` arriva tale e quale a chi avvia la sessione', async () => {
  let input = null;
  const base = () => 'http://127.0.0.1:5555/api/v1';
  const registro = createSessionRegistry({
    avviaSessioneFn: async (i) => { input = i; i.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise(() => {}); },
    preparaEsecuzioneFn: async () => ({ ok: true, cartella: '/tmp/x', task: { consegna: 'x' } }), modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    baseImmaginiFn: base,
  });
  registro.avvia('task-vero');
  assert.equal(input?.baseImmaginiFn, base, 'il registro deve passare la funzione al servizio (lezione del 17/10: un\'opzione si perde campo per campo)');
});

function fetchFinto(corpo) {
  const chiamate = [];
  const fn = async (url, opzioni) => { chiamate.push({ url, auth: opzioni.headers.Authorization }); return { ok: true, status: 200, json: async () => corpo }; };
  fn.chiamate = chiamate;
  return fn;
}
const DEDICATO = { data: [{ b64_json: 'aGVsbG8=', media_type: 'image/png' }] };
const NATIVO = { choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,aGVsbG8=' } }] } }] };

test('IMG-IND-01 indirizzo scelto: /images va lì, con la chiave, e mai a openrouter.ai', async () => {
  const fetchFn = fetchFinto(DEDICATO);
  await generaImmagineOpenRouter({ prompt: 'p', modello: 'm', nativo: false, chiave: 'k', baseUrl: 'http://127.0.0.1:5555/api/v1' }, { fetchFn });
  assert.deepEqual(fetchFn.chiamate.map((c) => c.url), ['http://127.0.0.1:5555/api/v1/images']);
  assert.equal(fetchFn.chiamate[0].auth, 'Bearer k');
});

test('IMG-IND-02 indirizzo scelto: la strada nativa (/chat/completions) va lì anche lei', async () => {
  const fetchFn = fetchFinto(NATIVO);
  await generaImmagineOpenRouter({ prompt: 'p', modello: 'm', nativo: true, chiave: 'k', baseUrl: 'https://proxy.example.com/openrouter/v1/' }, { fetchFn });
  assert.deepEqual(fetchFn.chiamate.map((c) => c.url), ['https://proxy.example.com/openrouter/v1/chat/completions']);
});

test('IMG-IND-03 AL CONTRARIO: senza indirizzo scelto resta quello di serie', async () => {
  const fetchFn = fetchFinto(DEDICATO);
  await generaImmagineOpenRouter({ prompt: 'p', modello: 'm', nativo: false, chiave: 'k' }, { fetchFn });
  assert.deepEqual(fetchFn.chiamate.map((c) => c.url), ['https://openrouter.ai/api/v1/images']);
});

test('IMG-IND-04 la base dal registro dei fornitori: solo un indirizzo SCELTO e valido conta; illeggibile ⇒ quello di serie', () => {
  assert.equal(baseImmaginiOpenRouter({ endpoint: 'http://127.0.0.1:5555/api/v1', endpointConfigured: true }), 'http://127.0.0.1:5555/api/v1');
  assert.equal(baseImmaginiOpenRouter({ endpoint: 'http://127.0.0.1:5555/api/v1', endpointConfigured: false }), null);
  assert.equal(baseImmaginiOpenRouter({ endpoint: 'ftp://x', endpointConfigured: true }), null);
  assert.equal(baseImmaginiOpenRouter(null), null);
});

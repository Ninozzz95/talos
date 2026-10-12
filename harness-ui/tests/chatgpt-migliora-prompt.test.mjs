/**
 * 11/10/2026 — «tutto quello che è già disponibile nell'applicazione deve funzionare quando collegato con il piano» (owner).
 * «Migliora prompt» chiama il modello della sessione per conto suo (`prompt-enhancer-provider.mjs`), fuori dal trasporto comune:
 * con un modello del piano partiva senza token e con `max_output_tokens`, che il piano vieta (documentazione ufficiale,
 * developers.openai.com/siwc/token-sharing-open-source/preview-limitations, riletta l'11/10/2026).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { chiediMiglioramentoAlProvider } from '../src/prompt-enhancer-provider.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { CAMPI_VIETATI_DAL_PIANO } from '../src/chatgpt-richiesta.mjs';

const sse = (...eventi) => eventi.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const risposta = (testo) => ({ id: 'resp_1', object: 'response', created_at: 1791700000, status: 'completed', model: 'gpt-6-sol',
  output: [{ id: 'msg_1', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: testo, annotations: [] }] }],
  usage: { input_tokens: 30, input_tokens_details: { cached_tokens: 0 }, output_tokens: 12, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 42 } });
const flusso = (testo) => new Response(sse({ type: 'response.created', response: { id: 'resp_1', created_at: 1791700000, model: 'gpt-6-sol' } },
  { type: 'response.output_item.added', output_index: 0, item: { id: 'msg_1', type: 'message', role: 'assistant', content: [] } },
  { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: testo },
  { type: 'response.output_item.done', output_index: 0, item: risposta(testo).output[0] },
  { type: 'response.completed', response: risposta(testo) }), { status: 200, headers: { 'content-type': 'text/event-stream' } });

function banco(extra = {}) {
  const richieste = []; const usi = [];
  const providerStore = createProviderCredentialStore({ env: { OPENAI_API_KEY: 'sk-CHIAVE-API-CHE-NON-DEVE-PAGARE' } });
  const fetchFn = async (url, opzioni = {}) => {
    richieste.push({ url: String(url), aut: new Headers(opzioni.headers).get('authorization'), corpo: typeof opzioni.body === 'string' ? JSON.parse(opzioni.body) : null });
    return (extra.rispondi ?? (() => flusso('Prompt migliorato.')))();
  };
  const chiama = () => chiediMiglioramentoAlProvider({ modello: 'chatgpt:gpt-6-sol', messaggi: [{ role: 'system', content: 'Riscrivi.' }, { role: 'user', content: 'sistema questo' }],
    providerStore, fetchFn, leggiTokenDelPiano: async () => 'TOKEN-DEL-PIANO', registraUsoDelPiano: async (v) => { usi.push(v); }, ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'rispondi')) });
  return { richieste, usi, chiama };
}

test('MIGLIORA-PIANO-01 — su una sessione col piano «Migliora» passa dal piano: token del piano, corpo conforme, mai la chiave API; e si conta', async () => {
  const b = banco();
  const esito = await b.chiama();
  assert.equal(esito.contenuto, 'Prompt migliorato.');
  assert.equal(esito.fornitoreUsato, 'chatgpt');
  assert.equal(b.richieste.length, 1);
  const r = b.richieste[0];
  assert.equal(r.url, 'https://api.openai.com/v1/responses');
  assert.equal(r.aut, 'Bearer TOKEN-DEL-PIANO');
  assert.equal(r.corpo.store, false);
  assert.equal(r.corpo.stream, true);
  for (const campo of CAMPI_VIETATI_DAL_PIANO) assert.equal(campo in r.corpo, false, campo);
  assert.equal(r.corpo.input.some((v) => v.role === 'system'), false, 'il piano rifiuta i messaggi di sistema espliciti');
  assert.equal(JSON.stringify(b.richieste).includes('sk-CHIAVE-API-CHE-NON-DEVE-PAGARE'), false);
  assert.deepEqual(b.usi.map((u) => [u.esito, u.usage?.total_tokens]), [['completato', 42]]);
});

test('MIGLIORA-PIANO-02 AL CONTRARIO — senza il canale del token, o con l\'accesso scaduto, non parte niente e lo dice col codice del piano; mai la chiave API', async () => {
  const senza = banco({ leggiTokenDelPiano: null });
  await assert.rejects(senza.chiama(), { code: 'CHATGPT_NON_COLLEGATO' });
  assert.equal(senza.richieste.length, 0);
  const scaduto = banco({ leggiTokenDelPiano: async () => { throw Object.assign(new Error('The ChatGPT sign-in expired.'), { code: 'CHATGPT_ACCESSO_SCADUTO' }); } });
  await assert.rejects(scaduto.chiama(), { code: 'CHATGPT_ACCESSO_SCADUTO' });
  assert.equal(scaduto.richieste.length, 0);
  assert.deepEqual(scaduto.usi, []);
});

test('MIGLIORA-PIANO-03 — il limite di uso del piano esce col SUO codice (non «il fornitore non ha risposto»), non si conta e la chiave API non viene provata', async () => {
  const limite = () => new Response(JSON.stringify({ error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'Usage limit reached.' } }),
    { status: 429, headers: { 'content-type': 'application/json', 'x-oai-request-id': 'req_limite' } });
  const b = banco({ rispondi: limite });
  await assert.rejects(b.chiama(), { code: 'CHATGPT_LIMITE_DEL_PIANO' });
  assert.deepEqual(b.usi, []);
  assert.equal(JSON.stringify(b.richieste).includes('sk-CHIAVE-API-CHE-NON-DEVE-PAGARE'), false);
});

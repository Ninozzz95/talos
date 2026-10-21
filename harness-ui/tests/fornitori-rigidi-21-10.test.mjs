/*
 * P0 della ricognizione dei parametri dei fornitori, passata 2 (21/10/2026). Mistral, Groq e Cerebras rifiutano con 400/422 i campi
 * che non conoscono (Hermes `agent/message_sanitization.py:765-768`; Mistral, changelog: «Extra inputs are not permitted»), e verso
 * di loro partivano `reasoning_content` nei messaggi dell'assistente, il marcatore `cache_control` sul sistema (`talosHarness.mjs:2046`,
 * per tutti) e — su Mistral — `stream_options`. ⛔ Il rifiuto non è verificato dal vivo (servirebbe una chiave di quei fornitori).
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { preparaRichiestaCompatibile } from '../src/openai-compatible-runtime.mjs';
import { REGISTRO_FORNITORI, verificaRegistro } from '../src/provider-registry.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { toNativeMessages } from '../src/native-provider-adapter.mjs';
import { ID_NATIVI_SDK } from '../src/provider-registry.mjs';

const MARCATORE = { type: 'ephemeral', ttl: '1h' };
const corpoDelKernel = (model) => ({
  model,
  messages: [
    { role: 'system', content: [{ type: 'text', text: 'Sei TALOS.', cache_control: { ...MARCATORE } }] },
    { role: 'user', content: 'Leggi a.txt.' },
    { role: 'assistant', content: '', reasoning_content: 'PENSIERO', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: 'ciao' },
    { role: 'user', content: [{ type: 'text', text: 'E poi?' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] },
  ],
  stream: true,
  stream_options: { include_usage: true },
});

test('RIG-01 verso Mistral, Groq e Cerebras partono senza reasoning_content e senza cache_control; il sistema torna stringa', () => {
  for (const [id, model] of [['mistral', 'mistral-small-latest'], ['groq', 'openai/gpt-oss-20b'], ['cerebras', 'gpt-oss-120b']]) {
    const entrata = corpoDelKernel(model);
    const prima = structuredClone(entrata);
    const { corpo } = preparaRichiestaCompatibile(id, entrata);
    assert.equal(corpo.messages[0].content, 'Sei TALOS.', `${id}: ${JSON.stringify(corpo.messages[0])}`);
    assert.equal(Object.hasOwn(corpo.messages[2], 'reasoning_content'), false, `${id}: ${JSON.stringify(corpo.messages[2])}`);
    // le chiamate restano (verso Mistral l'id diventa di 9 alfanumerici, revisione F4: si confronta il resto, e l'esito resta accoppiato)
    const senzaId = (ts) => ts.map(({ id: _id, ...resto }) => resto);
    assert.deepEqual(senzaId(corpo.messages[2].tool_calls), senzaId(prima.messages[2].tool_calls), `${id}: le chiamate restano`);
    assert.equal(corpo.messages[3].tool_call_id, corpo.messages[2].tool_calls[0].id, `${id}: chiamata ed esito accoppiati`);
    assert.deepEqual(corpo.messages[4], prima.messages[4], `${id}: un contenuto a pezzi senza marcatore resta com'è (immagine compresa)`);
    assert.ok(!JSON.stringify(corpo).includes('cache_control'), `${id}: nessun marcatore`);
    assert.deepEqual(entrata, prima, `${id}: il corpo del chiamante non cambia`);
  }
});

test('RIG-02 stream_options si toglie solo dove il fornitore non lo documenta (Mistral, Cerebras); Groq lo tiene', () => {
  for (const [id, model] of [['mistral', 'mistral-small-latest'], ['cerebras', 'gpt-oss-120b']]) {
    assert.equal(Object.hasOwn(preparaRichiestaCompatibile(id, corpoDelKernel(model)).corpo, 'stream_options'), false, id);
  }
  assert.deepEqual(preparaRichiestaCompatibile('groq', corpoDelKernel('openai/gpt-oss-20b')).corpo.stream_options, { include_usage: true });
});

test('RIG-03 verso contrario: chi non dichiara campi rifiutati tiene ragionamento e stream_options; il marcatore resta solo a chi lo dichiara (owner 21/10 sera, come Hermes)', () => {
  for (const [id, model] of [['openrouter', 'z-ai/glm-5.3-flash'], ['zai', 'glm-5.3-flash'], ['deepseek', 'deepseek-flash']]) {
    const { corpo } = preparaRichiestaCompatibile(id, corpoDelKernel(model));
    assert.equal(corpo.messages[2].reasoning_content, 'PENSIERO', `${id}: il ragionamento resta`);
    assert.deepEqual(corpo.stream_options, { include_usage: true }, id);
    const dichiara = REGISTRO_FORNITORI[id].cache?.marcatore === 'cache_control';
    assert.equal(JSON.stringify(corpo.messages[0]).includes('cache_control'), dichiara, `${id}: marcatore solo se dichiarato (${dichiara})`);
  }
  assert.equal(REGISTRO_FORNITORI.openrouter.cache.marcatore, 'cache_control', 'premessa: OpenRouter lo dichiara (rotte Anthropic)');
});

test('RIG-06 marcatore come Hermes su tutti i fornitori del registro: parte solo a chi dichiara cache.marcatore cache_control, sulle due strade', () => {
  let conMarcatore = 0, senza = 0;
  const saltati = [];
  for (const [id, record] of Object.entries(REGISTRO_FORNITORI)) {
    const model = record.modelliDiRiserva?.[0]?.id ?? record.modelliNoti?.[0]?.id ?? 'modello-finto';
    const dichiara = record.cache?.marcatore === 'cache_control';
    if (ID_NATIVI_SDK.includes(id)) {
      // revisione M2: i nativi non passano dal traduttore — si misura la loro strada vera, `toNativeMessages`
      const nativi = toNativeMessages(corpoDelKernel(model).messages.slice(0, 2), { provider: id, model });
      const porta = JSON.stringify(nativi[0]).includes('cacheControl');
      if (record.wire === 'anthropic-messages') assert.equal(porta, dichiara, `${id} (nativo Anthropic)`);
      else assert.equal(porta, false, `${id} (nativo, filo senza marcatore)`);
    } else {
      let esito;
      try { esito = preparaRichiestaCompatibile(id, corpoDelKernel(model)); } catch (e) { saltati.push(`${id}: ${e.message}`); continue; }
      assert.equal(JSON.stringify(esito.corpo).includes('cache_control'), dichiara, `${id}`);
    }
    if (dichiara) conMarcatore += 1; else senza += 1;
  }
  assert.deepEqual(saltati, [], 'revisione M2: nessun fornitore esce dal controllo in silenzio');
  assert.ok(conMarcatore >= 3 && senza >= 20, `copertura: ${conMarcatore} con, ${senza} senza`);
});

test('RIG-08 (revisione M3) una voce che dichiara un altro marcatore (prompt_cache_key) non riceve cache_control', async () => {
  const { REGISTRO_FORNITORI: R } = await import('../src/provider-registry.mjs');
  assert.equal(R.mistral.cache.marcatore, 'prompt_cache_key', 'premessa');
  const corpo = preparaRichiestaCompatibile('mistral', corpoDelKernel('mistral-small-latest')).corpo;
  assert.equal(JSON.stringify(corpo).includes('cache_control'), false);
  assert.equal(R.mistral.campiRifiutati.campi.includes('cache_control'), true, 'oggi lo toglie anche la dichiarazione dei campi rifiutati');
});

test('RIG-07 (revisione F3) i casi che i mutanti non vedevano: assistente solo testo, pezzo unico non di testo, corpo del chiamante', () => {
  const entrata = {
    model: 'gpt-oss-120b',
    messages: [
      { role: 'system', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' }, cache_control: { ...MARCATORE } }] },
      { role: 'assistant', content: 'solo testo', reasoning_content: 'PENSIERO' },
    ],
  };
  const prima = structuredClone(entrata);
  const { corpo } = preparaRichiestaCompatibile('cerebras', entrata);
  assert.deepEqual(corpo.messages[0].content, [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }], 'un pezzo unico NON di testo resta a pezzi, senza marcatore');
  // revisione F1: verso Cerebras il ragionamento vero va nel SUO campo `reasoning`, non resta `reasoning_content`
  assert.deepEqual(corpo.messages[1], { role: 'assistant', content: 'solo testo', reasoning: 'PENSIERO' }, 'nessun reasoning_content, il testo nel campo di Cerebras');
  assert.deepEqual(entrata, prima, 'il corpo del chiamante non cambia');
});

test('RIG-04 il registro respinge una dichiarazione malformata', () => {
  assert.equal(verificaRegistro(), true);
  const con = (campiRifiutati) => ({ ...REGISTRO_FORNITORI, groq: { ...REGISTRO_FORNITORI.groq, campiRifiutati } });
  for (const errato of [null, {}, { campi: [], fonte: 'x', data: '2026-10-21' }, { campi: ['temperature'], fonte: 'x', data: '2026-10-21' }, { campi: ['cache_control'], data: '2026-10-21' }, { campi: ['cache_control'], fonte: 'x', data: 'ieri' }]) {
    assert.throws(() => verificaRegistro(con(errato)), /rejected fields/u, JSON.stringify(errato));
  }
});

test('RIG-05 la strada vera: router reale verso un server finto, il corpo che arriva a Mistral non ha i campi rifiutati', async (t) => {
  const ricevute = [];
  const server = createServer(async (req, res) => {
    const blocchi = []; for await (const b of req) blocchi.push(b);
    ricevute.push(JSON.parse(Buffer.concat(blocchi).toString()));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'pronto' } }], usage: { prompt_tokens: 7, completion_tokens: 1, total_tokens: 8 } }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  assert.notEqual(server.address().port, 4174);
  const store = createProviderCredentialStore({ env: { MISTRAL_API_KEY: 'credenziale-fittizia-rig' } });
  store.setRuntime('mistral', { endpoint: `http://127.0.0.1:${server.address().port}/v1` });
  const richiesta = creaFetchMultiProvider(fetch, { dipendenze: { leggiChiave: store.getKey, leggiRuntime: store.getRuntime } });
  const { stream: _s, stream_options: _o, ...senzaStream } = corpoDelKernel('mistral:mistral-small-latest');
  await richiesta('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ ...senzaStream, stream: false, stream_options: { include_usage: true } }) });
  const arrivato = ricevute.at(-1);
  assert.equal(arrivato.model, 'mistral-small-latest');
  assert.ok(!JSON.stringify(arrivato).includes('cache_control'), JSON.stringify(arrivato.messages[0]));
  assert.ok(!JSON.stringify(arrivato).includes('reasoning_content'), JSON.stringify(arrivato.messages[2]));
  assert.equal(Object.hasOwn(arrivato, 'stream_options'), false);
});

test('RIG-09 (revisione F1) verso Cerebras il ragionamento dell\u2019assistente va nel suo campo `reasoning`; il riempimento e il vuoto no; Groq lo toglie', () => {
  const messages = [
    { role: 'user', content: 'x' },
    { role: 'assistant', content: 'a', reasoning_content: 'PENSIERO' },
    { role: 'assistant', content: 'b', reasoning_content: ' ' },
    { role: 'assistant', content: 'c', reasoning_content: '' },
  ];
  const c = preparaRichiestaCompatibile('cerebras', { model: 'gpt-oss-120b', messages }).corpo.messages;
  assert.deepEqual(c[1], { role: 'assistant', content: 'a', reasoning: 'PENSIERO' });
  assert.deepEqual(c[2], { role: 'assistant', content: 'b' });
  assert.deepEqual(c[3], { role: 'assistant', content: 'c' });
  const g = preparaRichiestaCompatibile('groq', { model: 'openai/gpt-oss-20b', messages }).corpo.messages;
  assert.deepEqual(g[1], { role: 'assistant', content: 'a' }, 'Groq non ha un campo suo: si toglie e basta');
});

test('RIG-10 il registro accetta solo un campo del ragionamento conosciuto e datato', () => {
  const con = (ragionamentoNeiMessaggi) => ({ ...REGISTRO_FORNITORI, cerebras: { ...REGISTRO_FORNITORI.cerebras, ragionamentoNeiMessaggi } });
  for (const errato of [{ campo: 'thoughts', fonte: 'x', data: '2026-10-21' }, { campo: 'reasoning', data: '2026-10-21' }, null]) {
    assert.throws(() => verificaRegistro(con(errato)), /reasoning field in messages/u, JSON.stringify(errato));
  }
});

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

/* Decisione 330 (giro 3 della cura 324, punti 6b e 6c del giudice): l'assistant in coda senza attrezzi e senza testo che non porta più
   ragionamento si toglie; DeepSeek diretto (senza `prefix: true`) non lo prosegue e lo perde anche col ragionamento. Hermes toglie dalla
   copia per la rete gli assistant di solo ragionamento (`agent/turn_request_assembly.py:178-187`), con gli attrezzi restano. */
const conCoda = (model, coda) => ({ model, messages: [{ role: 'system', content: 'Sei TALOS.' }, { role: 'user', content: 'Leggi a.txt.' }, coda], stream: true });
const PREFILL = { role: 'assistant', content: '', reasoning_content: 'PENSIERO' };

test('RIG-11 (330, b) verso Groq e Mistral l\u2019assistant in coda rimasto senza ragionamento si toglie: mai un assistant vuoto per ultimo', () => {
  for (const [id, model] of [['groq', 'openai/gpt-oss-20b'], ['mistral', 'mistral-small-latest']]) {
    const entrata = conCoda(model, PREFILL);
    const prima = structuredClone(entrata);
    const { corpo } = preparaRichiestaCompatibile(id, entrata);
    assert.deepEqual(corpo.messages.at(-1), { role: 'user', content: 'Leggi a.txt.' }, `${id}: ${JSON.stringify(corpo.messages.at(-1))}`);
    assert.equal(corpo.messages.length, 2, id);
    assert.deepEqual(entrata, prima, `${id}: il corpo del chiamante non cambia`);
  }
});

test('RIG-12 (330, b, al contrario) restano: Cerebras col suo campo, OpenRouter e i motori di questo PC col ragionamento, ogni assistant con attrezzi o con testo', () => {
  assert.deepEqual(preparaRichiestaCompatibile('cerebras', conCoda('gpt-oss-120b', PREFILL)).corpo.messages.at(-1), { role: 'assistant', content: '', reasoning: 'PENSIERO' });
  for (const [id, model] of [['openrouter', 'z-ai/glm-5.3-flash'], ['local', 'qwen3-8b']]) {
    assert.deepEqual(preparaRichiestaCompatibile(id, conCoda(model, PREFILL)).corpo.messages.at(-1), PREFILL, id);
  }
  const conAttrezzi = { role: 'assistant', content: '', reasoning_content: 'PENSIERO', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: '{}' } }] };
  const conTesto = { role: 'assistant', content: 'Sto leggendo' };
  const aPezzi = { role: 'assistant', content: [{ type: 'text', text: 'Sto leggendo' }] };
  for (const [id, model] of [['groq', 'openai/gpt-oss-20b'], ['mistral', 'mistral-small-latest'], ['deepseek', 'deepseek-flash']]) {
    assert.equal(preparaRichiestaCompatibile(id, conCoda(model, conAttrezzi)).corpo.messages.at(-1).tool_calls.length, 1, `${id}: con gli attrezzi resta (R07)`);
    assert.equal(preparaRichiestaCompatibile(id, conCoda(model, conTesto)).corpo.messages.at(-1).content, 'Sto leggendo', `${id}: col testo resta`);
    assert.deepEqual(preparaRichiestaCompatibile(id, conCoda(model, aPezzi)).corpo.messages.at(-1).content, aPezzi.content, `${id}: col testo a pezzi resta`);
  }
  const vuotoAPezzi = { role: 'assistant', content: [{ type: 'text', text: '  ' }] };
  assert.equal(preparaRichiestaCompatibile('mistral', conCoda('mistral-small-latest', vuotoAPezzi)).corpo.messages.length, 2, 'testo a pezzi solo di spazi: vuoto');
  assert.equal(preparaRichiestaCompatibile('openrouter', conCoda('z-ai/glm-5.3-flash', { role: 'assistant', content: '' })).corpo.messages.length, 2, 'anche verso OpenRouter un assistant muto in coda si toglie');
  const conDettagli = { role: 'assistant', content: '', reasoning_details: [{ type: 'reasoning.encrypted', data: 'X' }] };
  assert.deepEqual(preparaRichiestaCompatibile('openrouter', conCoda('z-ai/glm-5.3-flash', conDettagli)).corpo.messages.at(-1), conDettagli, 'i soli dettagli sono ragionamento');
});

test('RIG-13 (330, c) DeepSeek diretto non prosegue l\u2019assistant in coda (prefix:true solo su /beta): si toglie anche col ragionamento', () => {
  assert.equal(REGISTRO_FORNITORI.deepseek.prefillInCoda.prosegue, false);
  const { corpo } = preparaRichiestaCompatibile('deepseek', conCoda('deepseek-flash', PREFILL));
  assert.deepEqual(corpo.messages.at(-1), { role: 'user', content: 'Leggi a.txt.' });
  // un assistant con ragionamento NON in coda resta (DeepSeek lo vuole rimandato coi tool_calls, RIG-03)
  assert.equal(preparaRichiestaCompatibile('deepseek', corpoDelKernel('deepseek-flash')).corpo.messages[2].reasoning_content, 'PENSIERO');
});

test('RIG-14 (330) il registro accetta prefillInCoda solo come «non prosegue», con fonte e data', () => {
  const con = (prefillInCoda) => ({ ...REGISTRO_FORNITORI, deepseek: { ...REGISTRO_FORNITORI.deepseek, prefillInCoda } });
  for (const errato of [null, {}, { prosegue: true, fonte: 'https://x.example', data: '2026-11-07' }, { prosegue: false, data: '2026-11-07' }, { prosegue: false, fonte: 'x', data: '2026-11-07' }, { prosegue: false, fonte: 'https://x.example', data: 'oggi' },
    // giro 5 (L1 dei revisori 1 e 3): una fonte è un indirizzo https vero e una data è un giorno del calendario
    { fonte: 'https://x.example', data: '2026-11-07' }, { prosegue: false, fonte: 'http://x.example', data: '2026-11-07' }, { prosegue: false, fonte: 'https://x', data: '2026-11-07' },
    // giro 6 (BASSO del revisore 3): niente etichette vuote nel dominio
    { prosegue: false, fonte: 'https://.example', data: '2026-11-07' }, { prosegue: false, fonte: 'https://example.', data: '2026-11-07' }, { prosegue: false, fonte: 'https://x..example', data: '2026-11-07' },
    { prosegue: false, fonte: 'https://a b.example', data: '2026-11-07' }, { prosegue: false, fonte: 'https://x.example/a b', data: '2026-11-07' }, { prosegue: false, fonte: 'https://x.exa\tmple', data: '2026-11-07' }, { prosegue: false, fonte: 'https://x.example', data: '2026-99-99' }, { prosegue: false, fonte: 'https://x.example', data: '2026-02-30' }]) {
    assert.throws(() => verificaRegistro(con(errato)), /trailing assistant declaration/u, JSON.stringify(errato));
  }
  assert.equal(verificaRegistro(con({ prosegue: false, fonte: 'https://x.example', data: '2026-11-07' })), true);
  assert.equal(verificaRegistro(con({ prosegue: false, fonte: 'https://x.example/a/b.md#c', data: '2024-02-29' })), true, 'il 29 febbraio di un anno bisestile è un giorno vero');
});

test('RIG-14B (330, b) un ragionamento di soli spazi non è ragionamento: l’assistant in coda si toglie anche verso OpenRouter', () => {
  for (const coda of [{ role: 'assistant', content: '', reasoning_content: '  \n' }, { role: 'assistant', content: '', reasoning: ' ' }]) {
    assert.equal(preparaRichiestaCompatibile('openrouter', conCoda('z-ai/glm-5.3-flash', coda)).corpo.messages.length, 2, JSON.stringify(coda));
  }
});

test('RIG-16 (giro 4, M1 del revisore 2): Kimi e Qwen continuano solo con partial:true, che TALOS non manda: dichiarati «non prosegue», con fonte', async () => {
  const { prefillInCodaArriva } = await import('../src/openai-compatible-runtime.mjs');
  for (const id of ['kimi', 'qwen']) {
    const voce = REGISTRO_FORNITORI[id];
    assert.equal(voce?.prefillInCoda?.prosegue, false, `${id}: prefillInCoda.prosegue`);
    assert.match(voce.prefillInCoda.fonte, /^https:\/\//, `${id}: fonte scritta`);
    assert.equal(prefillInCodaArriva(`${id}:modello-qualunque`), null, `${id}: nessuna continuazione`);
  }
  assert.deepEqual(prefillInCodaArriva('openrouter:moonshotai/kimi-k2'), { testo: true }, 'al contrario: via OpenRouter si continua');
});

test('RIG-17 (giro 6, MEDIO del revisore 2; giro 7, MEDIO del revisore 1): Ollama e Ollama Cloud leggono `reasoning`, non `reasoning_content`, e non proseguono il pensiero dell’assistant in coda', async () => {
  const { prefillInCodaArriva } = await import('../src/openai-compatible-runtime.mjs');
  for (const [id, model] of [['ollama', 'qwen3.5:9b'], ['ollama', 'glm-4.7'], ['ollama', 'deepseek-v3.2'], ['ollama-cloud', 'glm-4.7'], ['ollama-cloud', 'gpt-oss:20b']]) {
    const voce = REGISTRO_FORNITORI[id];
    assert.equal(voce.ragionamentoNeiMessaggi?.campo, 'reasoning', `${id}: campo del ragionamento`);
    assert.ok(voce.campiRifiutati?.campi?.includes('reasoning_content'), `${id}: reasoning_content non arriva`);
    assert.match(voce.ragionamentoNeiMessaggi.fonte, /ollama/u, `${id}: fonte scritta`);
    // giro 7: i renderer e i parser di Ollama (qwen35, glm47, deepseek3) non proseguono il pensiero di un assistant in coda senza testo
    assert.equal(voce.prefillInCoda?.prosegue, false, `${id}: prefillInCoda.prosegue`);
    assert.match(voce.prefillInCoda.fonte, /^https:\/\/github\.com\/ollama\/ollama\//u, `${id}: fonte nel sorgente di Ollama`);
    assert.equal(prefillInCodaArriva(`${id}:${model}`), null, `${id}:${model}: nessuna continuazione, la scala di oggi`);
    // la rete del filo: un assistant di solo ragionamento in coda non parte
    const { corpo } = preparaRichiestaCompatibile(id, conCoda(model, PREFILL));
    assert.deepEqual(corpo.messages.at(-1), { role: 'user', content: 'Leggi a.txt.' }, `${id}: l’assistant in coda si toglie`);
    // un assistant della storia col ragionamento: resta, nel campo di Ollama, mai il campo che Ollama butta
    const storia = preparaRichiestaCompatibile(id, corpoDelKernel(model)).corpo.messages.filter((m) => m.role === 'assistant');
    assert.ok(storia.length > 0 && storia.every((m) => !Object.hasOwn(m, 'reasoning_content')), `${id}: nessun reasoning_content`);
    assert.ok(storia.some((m) => m.reasoning === 'PENSIERO'), `${id}: l’eco della storia porta il ragionamento in \`reasoning\``);
  }
  assert.equal(prefillInCodaArriva('ollama:qwen3.5:9b'), null);
  // al contrario: il motore di TALOS (llama.cpp) prosegue il ragionamento in coda e legge reasoning_content; Cerebras col suo campo
  assert.deepEqual(prefillInCodaArriva('local:qwen3-8b'), { testo: true });
  assert.deepEqual(prefillInCodaArriva('cerebras:gpt-oss-120b'), { testo: true });
  assert.deepEqual(preparaRichiestaCompatibile('local', conCoda('qwen3-8b', PREFILL)).corpo.messages.at(-1), PREFILL);
  assert.deepEqual(preparaRichiestaCompatibile('cerebras', conCoda('gpt-oss-120b', PREFILL)).corpo.messages.at(-1), { role: 'assistant', content: '', reasoning: 'PENSIERO' });
});

/* Giro 8 della cura 324 (BASSO del revisore dei fornitori del giro 7): un prefill costruito per OpenRouter (coi `reasoning_details`)
   può arrivare a un altro fornitore DENTRO la stessa chiamata (il cambio di fornitore dopo un 429). I `reasoning_details` li legge solo
   OpenRouter: Hermes dà a Mistral, Groq e Cerebras nessun campo del ragionamento (rifiutano ogni chiave che non conoscono) e i tre campi
   solo ai fili alla OpenRouter (`agent/message_sanitization.py:645-647`, `:670-671`, `:674-676`). */
const DETTAGLI_OR = [{ type: 'reasoning.encrypted', data: 'X' }];
const PREFILL_OR = { role: 'assistant', content: '', reasoning_content: 'PENSIERO', reasoning_details: DETTAGLI_OR };
const SOLO_DETTAGLI = { role: 'assistant', content: '', reasoning_details: DETTAGLI_OR };

test('RIG-18 (giro 8): i `reasoning_details` dell’assistant in coda partono solo verso OpenRouter; verso un rigido coi soli dettagli l’assistant si toglie', () => {
  for (const [id, model] of [['groq', 'openai/gpt-oss-20b'], ['mistral', 'mistral-small-latest']]) {
    for (const coda of [PREFILL_OR, SOLO_DETTAGLI]) {
      const entrata = conCoda(model, coda);
      const prima = structuredClone(entrata);
      const { corpo } = preparaRichiestaCompatibile(id, entrata);
      assert.deepEqual(corpo.messages.at(-1), { role: 'user', content: 'Leggi a.txt.' }, `${id}: ${JSON.stringify(corpo.messages.at(-1))}`);
      assert.ok(!JSON.stringify(corpo).includes('reasoning_details'), id);
      assert.deepEqual(entrata, prima, `${id}: il corpo del chiamante non cambia`);
    }
  }
  // chi prosegue il ragionamento nel suo campo lo riceve, senza i dettagli; coi soli dettagli non c'è niente da proseguire
  assert.deepEqual(preparaRichiestaCompatibile('cerebras', conCoda('gpt-oss-120b', PREFILL_OR)).corpo.messages.at(-1), { role: 'assistant', content: '', reasoning: 'PENSIERO' });
  assert.deepEqual(preparaRichiestaCompatibile('local', conCoda('qwen3-8b', PREFILL_OR)).corpo.messages.at(-1), PREFILL);
  // giro 9 (BASSO del revisore delle prove del giro 8): l'assistant in coda si SOSTITUISCE, mai uno nuovo dopo quello coi dettagli
  for (const [id, model] of [['cerebras', 'gpt-oss-120b'], ['local', 'qwen3-8b']]) {
    const { corpo } = preparaRichiestaCompatibile(id, conCoda(model, PREFILL_OR));
    assert.equal(corpo.messages.length, 3, `${id}: ${JSON.stringify(corpo.messages)}`);
    assert.ok(!JSON.stringify(corpo).includes('reasoning_details'), `${id}: nessun reasoning_details nel corpo`);
  }
  for (const [id, model] of [['cerebras', 'gpt-oss-120b'], ['local', 'qwen3-8b']]) {
    assert.equal(preparaRichiestaCompatibile(id, conCoda(model, SOLO_DETTAGLI)).corpo.messages.length, 2, `${id}: coi soli dettagli si toglie`);
  }
  // al contrario: verso OpenRouter l'assistant in coda parte intero, dettagli compresi
  assert.deepEqual(preparaRichiestaCompatibile('openrouter', conCoda('z-ai/glm-5.3-flash', PREFILL_OR)).corpo.messages.at(-1), PREFILL_OR);
  assert.deepEqual(preparaRichiestaCompatibile('openrouter', conCoda('z-ai/glm-5.3-flash', SOLO_DETTAGLI)).corpo.messages.at(-1), SOLO_DETTAGLI);
  // un assistant con attrezzi o con testo non è un prefill: resta com'è, anche verso un rigido (la regola tocca solo l'assistant in coda muto)
  const conTesto = { role: 'assistant', content: 'Sto leggendo', reasoning_details: DETTAGLI_OR };
  assert.equal(preparaRichiestaCompatibile('groq', conCoda('openai/gpt-oss-20b', conTesto)).corpo.messages.at(-1).content, 'Sto leggendo');
});

test('RIG-19 (giro 8): la strada vera verso Mistral (router reale, server finto): il prefill di OpenRouter non arriva, né i suoi dettagli', async (t) => {
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
  const { stream: _s, ...corpo } = conCoda('mistral:mistral-small-latest', PREFILL_OR);
  await richiesta('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ ...corpo, stream: false }) });
  const arrivato = ricevute.at(-1);
  assert.equal(arrivato.model, 'mistral-small-latest');
  assert.equal(arrivato.messages.at(-1).role, 'user', JSON.stringify(arrivato.messages.at(-1)));
  assert.ok(!JSON.stringify(arrivato).includes('reasoning_details'));
});

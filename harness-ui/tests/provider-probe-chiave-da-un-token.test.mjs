/**
 * CLI-REQ-06 — la chiave dei quattro fornitori a catalogo pubblico si prova con UNA richiesta da un
 * token, in forma OpenAI, e si convalida secondo il `wire` del record.
 *
 * ⛔ Nessuna rete vera: i server finti stanno su 127.0.0.1 e le chiavi sono finte. Nessuna porta
 *    4174/4177/9333 (il banco si fa dare la porta dal sistema e lo verifica).
 *
 * ⛔ Le tre cause si devono distinguere: chiave rifiutata (401/403), fornitore non raggiungibile
 *    (errore di rete o scadenza) e traffico (429/5xx). Confonderle manda la persona a cambiare una
 *    chiave che andava bene.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';

import { REGISTRO_FORNITORI, verificaRegistro } from '../src/provider-registry.mjs';
import { createProviderProbe, SONDE_PROVIDER } from '../src/provider-probe.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { createHttpApp } from '../src/http-app.mjs';

/**
 * I quattro, con il modello che la documentazione del fornitore nomina e DUE fonti distinte.
 *
 * ⛔ Due e non una: `fonte` sulla sonda dice da dove viene l'ENDPOINT, `fonte` sulla richiesta
 *   minima dice da dove viene il MODELLO. Nella prima stesura ce n'era una sola, e per DeepInfra
 *   documentava l'endpoint mentre il cancello prometteva «fonte datata per endpoint e modello»:
 *   il cancello diceva più di quello che controllava.
 *
 * ⛔ Scritto qui a mano e non letto dal registro: un'aspettativa che si legge dall'oggetto provato
 *   non può smentirlo.
 */
const QUATTRO = {
  deepinfra: {
    variabile: 'DEEPINFRA_API_KEY',
    base: 'https://api.deepinfra.com/v1/openai',
    modello: 'openai/gpt-oss-20b',
    fonteEndpoint: 'https://docs.deepinfra.com/chat/overview',
    fonteModello: 'https://deepinfra.com/openai/gpt-oss-20b',
  },
  novita: {
    variabile: 'NOVITA_API_KEY',
    base: 'https://api.novita.ai/openai/v1',
    modello: 'meta-llama/llama-3.1-8b-instruct',
    fonteEndpoint: 'https://docs.novita.ai/guides/llm-api',
    fonteModello: 'https://novita.ai/models/model-detail/meta-llama-llama-3.1-8b-instruct',
  },
  'ollama-cloud': {
    variabile: 'OLLAMA_API_KEY',
    base: 'https://ollama.com/v1',
    modello: 'gemma4:31b',
    fonteEndpoint: 'https://docs.ollama.com/api/openai-compatibility',
    fonteModello: 'https://docs.ollama.com/cloud',
  },
  huggingface: {
    variabile: 'HF_TOKEN',
    base: 'https://router.huggingface.co/v1',
    modello: 'openai/gpt-oss-120b',
    fonteEndpoint: 'https://huggingface.co/docs/inference-providers/index',
    fonteModello: 'https://huggingface.co/docs/inference-providers/index',
  },
};

const CHIAVE_FINTA = 'credenziale-fittizia-cli-req-06';
const deps = (store) => ({ leggiChiave: store.getKey, leggiRuntime: store.getRuntime });
const portachiavi = (id) => createProviderCredentialStore({ env: { [QUATTRO[id].variabile]: CHIAVE_FINTA } });
/** Una risposta OpenAI `/chat/completions` con un solo token generato. */
const rispostaOpenAI = () => ({
  id: 'chatcmpl-uno', object: 'chat.completion', created: 1, model: 'qualunque',
  choices: [{ index: 0, finish_reason: 'length', message: { role: 'assistant', content: '' } }],
  usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
});
/** Una risposta Anthropic Messages: valida per `zai-anthropic`, MAI per i quattro. */
const rispostaAnthropic = () => ({
  id: 'msg_uno', type: 'message', role: 'assistant', model: 'glm-5.3-flash',
  content: [{ type: 'text', text: '.' }], stop_reason: 'max_tokens',
  usage: { input_tokens: 5, output_tokens: 1 },
});

/** Banco HTTP locale: registra ogni richiesta e risponde come dice `rispondi`. */
async function banco(t, rispondi) {
  const richieste = [];
  const server = createServer(async (req, res) => {
    const pezzi = [];
    for await (const p of req) pezzi.push(p);
    const testo = Buffer.concat(pezzi).toString();
    richieste.push({ url: req.url, method: req.method, headers: req.headers, body: testo ? JSON.parse(testo) : null });
    rispondi(richieste.at(-1), res);
  });
  await new Promise((risolvi, rifiuta) => { server.once('error', rifiuta); server.listen(0, '127.0.0.1', risolvi); });
  t.after(() => new Promise((risolvi) => { server.close(risolvi); server.closeAllConnections(); }));
  const porta = server.address().port;
  for (const vietata of [4174, 4177, 9333]) assert.notEqual(porta, vietata);
  return { richieste, base: `http://127.0.0.1:${porta}` };
}
const json = (res, corpo, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(corpo)); };

test('CLI-REQ-06-01 — i quattro dichiarano una richiesta minima OpenAI da un token, con fonte datata', () => {
  for (const [id, atteso] of Object.entries(QUATTRO)) {
    const record = REGISTRO_FORNITORI[id];
    assert.ok(record, id);
    assert.equal(record.wire, 'openai-chat', id);
    assert.equal(record.baseUrl, atteso.base, id);
    // Il catalogo pubblico RESTA: la richiesta minima lo affianca, non lo sostituisce.
    assert.equal(record.sonda.catalogoPubblico, true, id);
    assert.equal(record.sonda.attiva, true, id);
    const minima = record.sonda.richiestaMinima;
    assert.ok(minima, `${id}: richiesta minima assente`);
    assert.equal(minima.percorso, '/chat/completions', id);
    assert.equal(minima.corpo.model, atteso.modello, id);
    assert.equal(minima.corpo.max_tokens, 1, id);
    assert.equal(minima.corpo.stream, false, id);
    assert.deepEqual(minima.corpo.messages, [{ role: 'user', content: '.' }], id);
    // ⛔ Niente che possa moltiplicare il costo: nessun `n`, nessun campo di ritentativo.
    assert.equal(minima.corpo.n, undefined, id);
    assert.deepEqual(
      Object.keys(minima.corpo).sort(),
      ['max_tokens', 'messages', 'model', 'stream'],
      `${id}: il corpo minimo deve avere solo i quattro campi`,
    );
    // Due fonti datate: l'endpoint sulla sonda, il modello sulla richiesta minima.
    assert.equal(record.sonda.fonte, atteso.fonteEndpoint, id);
    assert.match(record.sonda.data, /^2026-09-17$/u, id);
    assert.equal(minima.fonte, atteso.fonteModello, `${id}: manca la fonte del MODELLO`);
    assert.match(minima.data, /^2026-09-17$/u, id);
    // ⛔ Nessun modello di ragionamento: con `max_tokens: 1` spenderebbe il token nel pensiero e
    //   potrebbe non produrre `choices` utilizzabili. Vale anche come promemoria per chi cambierà
    //   questi id: si sceglie un modello istruito piccolo, e si scrive dove l'hai letto.
    assert.doesNotMatch(minima.corpo.model, /(^|[/-])(r1|o1|thinking|reason)/iu, id);
    assert.equal(verificaRegistro({ [id]: record }), true, id);
    // La proiezione della sonda porta con sé il wire: è ciò che convalida la risposta.
    assert.equal(SONDE_PROVIDER[id].wire, 'openai-chat', id);
    assert.deepEqual(SONDE_PROVIDER[id].richiestaMinima, minima, id);
  }
  // `zai-anthropic` resta com'era: nessun elenco modelli, wire Anthropic.
  const zai = REGISTRO_FORNITORI['zai-anthropic'];
  assert.equal(zai.sonda.attiva, false);
  assert.equal(zai.sonda.richiestaMinima.percorso, '/messages');
  assert.equal(SONDE_PROVIDER['zai-anthropic'].wire, 'anthropic-messages');
});

test('CLI-REQ-06-02 — verificaRegistro RIFIUTA una richiesta minima che non è da un token', () => {
  const record = REGISTRO_FORNITORI.deepinfra;
  const minima = record.sonda.richiestaMinima;
  const guasti = [
    { percorso: 'chat/completions' },
    { percorso: '/chat/completions', corpo: { ...minima.corpo, max_tokens: 2 } },
    { percorso: '/chat/completions', corpo: { ...minima.corpo, max_tokens: undefined } },
    { percorso: '/chat/completions', corpo: { ...minima.corpo, stream: true } },
    { percorso: '/chat/completions', corpo: { ...minima.corpo, model: '' } },
    { percorso: '/chat/completions', corpo: { ...minima.corpo, messages: [] } },
    { percorso: '/chat/completions', corpo: { ...minima.corpo, messages: [{ role: 'user', content: '.' }, { role: 'user', content: '.' }] } },
    { percorso: '/chat/completions', corpo: undefined },
  ];
  for (const guasto of guasti) {
    const rotto = { ...record, sonda: { ...record.sonda, richiestaMinima: { ...minima, ...guasto } } };
    assert.throws(() => verificaRegistro({ deepinfra: rotto }), { code: 'PROVIDER_REGISTRY_INVALID' }, JSON.stringify(guasto));
  }
  // Senza fonte datata non si sa da dove vengono ENDPOINT e MODELLO: la prova costa credito.
  for (const senza of [{ fonte: undefined }, { data: undefined }, { data: '17/09/2026' }, { fonte: 'docs.deepinfra.com' }]) {
    const rotto = { ...record, sonda: { ...record.sonda, ...senza } };
    assert.throws(() => verificaRegistro({ deepinfra: rotto }), { code: 'PROVIDER_REGISTRY_INVALID' }, `endpoint ${JSON.stringify(senza)}`);
  }
  for (const senza of [{ fonte: undefined }, { data: undefined }, { data: 'ieri' }, { fonte: 'deepinfra.com/openai/gpt-oss-20b' }]) {
    const rotto = { ...record, sonda: { ...record.sonda, richiestaMinima: { ...minima, ...senza } } };
    assert.throws(() => verificaRegistro({ deepinfra: rotto }), { code: 'PROVIDER_REGISTRY_INVALID' }, `modello ${JSON.stringify(senza)}`);
  }
  // Verso opposto: il record vero passa, e chi non dichiara la richiesta minima non è obbligato a nulla.
  assert.equal(verificaRegistro({ deepinfra: record }), true);
  assert.equal(verificaRegistro({ groq: REGISTRO_FORNITORI.groq }), true);
});

test('CLI-REQ-06-03 — senza consenso la sonda ordinaria resta l\'elenco modelli: nessuna generazione', async (t) => {
  for (const id of Object.keys(QUATTRO)) {
    const b = await banco(t, (_r, res) => json(res, { data: [{ id: 'un-modello' }] }));
    const store = portachiavi(id);
    store.setRuntime(id, { endpoint: b.base });
    const sonda = createProviderProbe({ ...deps(store), fetchImpl: fetch });
    const esito = await sonda.prova(id);
    assert.equal(esito.esito, 'collegato', id);
    assert.equal(esito.credenzialeVerificata, false, id);
    assert.match(esito.motivo, /catalogo pubblico/iu, id);
    assert.equal(b.richieste.length, 1, id);
    assert.equal(b.richieste[0].method, 'GET', `${id}: la sonda ordinaria non deve MAI generare`);
    assert.equal(b.richieste[0].url, '/models', id);
    assert.equal(JSON.stringify(esito).includes(CHIAVE_FINTA), false, id);
  }
});

test('CLI-REQ-06-04 — col consenso parte UNA richiesta da un token e la risposta OpenAI verifica la chiave', async (t) => {
  for (const [id, atteso] of Object.entries(QUATTRO)) {
    const b = await banco(t, (_r, res) => json(res, rispostaOpenAI()));
    const store = portachiavi(id);
    store.setRuntime(id, { endpoint: b.base });
    const sonda = createProviderProbe({ ...deps(store), fetchImpl: fetch });
    const esito = await sonda.prova(id, { consentiGenerazione: true });
    assert.equal(esito.esito, 'collegato', id);
    assert.equal(esito.credenzialeVerificata, true, id);
    assert.equal(esito.httpStatus, 200, id);
    assert.equal(b.richieste.length, 1, `${id}: nessun ritentativo deve moltiplicare il costo`);
    const inviata = b.richieste[0];
    assert.equal(inviata.method, 'POST', id);
    assert.equal(inviata.url, '/chat/completions', id);
    assert.equal(inviata.headers.authorization, `Bearer ${CHIAVE_FINTA}`, id);
    assert.equal(inviata.headers['content-type'], 'application/json', id);
    // ⛔ Il costo: UN token, misurato sul corpo davvero inviato, non sulla dichiarazione.
    assert.equal(inviata.body.max_tokens, 1, id);
    assert.equal(inviata.body.stream, false, id);
    assert.equal(inviata.body.model, atteso.modello, id);
    assert.deepEqual(inviata.body.messages, [{ role: 'user', content: '.' }], id);
    assert.equal(JSON.stringify(esito).includes(CHIAVE_FINTA), false, id);
  }
});

test('CLI-REQ-06-05 — 200 senza forma OpenAI non verifica niente, e la forma Anthropic è rifiutata', async (t) => {
  const corpi = [
    ['Anthropic al posto di OpenAI', rispostaAnthropic()],
    ['choices vuoto', { ...rispostaOpenAI(), choices: [] }],
    ['choices assente', { usage: { prompt_tokens: 5 } }],
    ['prompt_tokens non numerico', { ...rispostaOpenAI(), usage: { prompt_tokens: 'cinque' } }],
    ['corpo vuoto', {}],
  ];
  for (const [nome, corpo] of corpi) {
    const b = await banco(t, (_r, res) => json(res, corpo));
    const store = portachiavi('deepinfra');
    store.setRuntime('deepinfra', { endpoint: b.base });
    const sonda = createProviderProbe({ ...deps(store), fetchImpl: fetch });
    const esito = await sonda.prova('deepinfra', { consentiGenerazione: true });
    assert.equal(esito.esito, 'errore', nome);
    assert.notEqual(esito.credenzialeVerificata, true, nome);
    assert.match(esito.motivo, /non verificat/iu, nome);
  }
  /*
   * ⛔ VERSO OPPOSTO — `usage` è FACOLTATIVO: pretenderlo è un falso NEGATIVO su una chiave buona.
   *   Novita e Ollama Cloud non documentano il corpo della risposta, quindi non possiamo promettere
   *   che quel campo arrivi; il handoff della CLI chiedeva «choices E usage.prompt_tokens finito»,
   *   e su questo punto la sua richiesta è stata allentata di proposito: `usage` si controlla SE c'è.
   */
  for (const [nome, corpo] of [
    ['usage assente', { choices: rispostaOpenAI().choices }],
    ['usage senza prompt_tokens', { choices: rispostaOpenAI().choices, usage: { completion_tokens: 1 } }],
  ]) {
    const b = await banco(t, (_r, res) => json(res, corpo));
    const store = portachiavi('novita');
    store.setRuntime('novita', { endpoint: b.base });
    const esito = await createProviderProbe({ ...deps(store), fetchImpl: fetch }).prova('novita', { consentiGenerazione: true });
    assert.equal(esito.esito, 'collegato', nome);
    assert.equal(esito.credenzialeVerificata, true, nome);
  }
});

test('CLI-REQ-06-11 — un 200 che DICHIARA un errore non è un sì: la chiave non si salva', async (t) => {
  /*
   * ⛔ Falso positivo misurato il 17/09/2026 sul codice appena scritto: un fornitore (o un proxy
   *   davanti a lui) che risponde 200 con `error` nel corpo otteneva `collegato` +
   *   `credenzialeVerificata: true` — cioè il prodotto avrebbe SALVATO una chiave rifiutata.
   *   La regola era già in questo file, su un altro catalogo: «HTTP 200 non basta se il corpo
   *   dichiara un errore» (`paginaDashScope`). Qui non era stata applicata.
   */
  const casi = [
    ['openai-chat, error accanto a choices', 'deepinfra', { ...rispostaOpenAI(), error: { message: 'invalid api key' } }],
    ['openai-chat, error come stringa', 'deepinfra', { ...rispostaOpenAI(), error: 'unauthorized' }],
    ['anthropic-messages, error accanto al messaggio', 'zai-anthropic', { ...rispostaAnthropic(), error: { type: 'authentication_error' } }],
  ];
  for (const [nome, provider, corpo] of casi) {
    const b = await banco(t, (_r, res) => json(res, corpo));
    const store = provider === 'zai-anthropic'
      ? createProviderCredentialStore({ env: { ZAI_ANTHROPIC_API_KEY: CHIAVE_FINTA } })
      : portachiavi(provider);
    store.setRuntime(provider, { endpoint: b.base });
    const esito = await createProviderProbe({ ...deps(store), fetchImpl: fetch }).prova(provider, { consentiGenerazione: true });
    assert.equal(esito.esito, 'errore', nome);
    assert.notEqual(esito.credenzialeVerificata, true, nome);
  }
  // Verso opposto: `error: null` è ciò che molti fornitori mandano quando è andata bene.
  const buono = await banco(t, (_r, res) => json(res, { ...rispostaOpenAI(), error: null }));
  const store = portachiavi('deepinfra');
  store.setRuntime('deepinfra', { endpoint: buono.base });
  const esito = await createProviderProbe({ ...deps(store), fetchImpl: fetch }).prova('deepinfra', { consentiGenerazione: true });
  assert.equal(esito.esito, 'collegato');
  assert.equal(esito.credenzialeVerificata, true);
});

test('CLI-REQ-06-12 — la risposta si legge fino a un TETTO, e oltre non si legge', async (t) => {
  /*
   * ⛔ L'indirizzo del fornitore è configurabile dalla persona (`runtime.endpoint`): senza un tetto
   *   una risposta ostile entra tutta in memoria PRIMA che qualcuno possa giudicarla — misurato il
   *   17/09/2026: 400 MiB letti per intero, 1710 MiB di picco, e poi ACCETTATI. La risposta a una
   *   generazione da UN token sta in poche centinaia di byte.
   *   Precedente nel repo: `leggiCorpoJson(req, 16 * 1024)` in `http-app.mjs`.
   */
  const PROVA_A_MANDARE = 16 * 1024 * 1024;
  let scritti = 0;
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const pezzo = Buffer.alloc(64 * 1024, 0x20); // spazi: resta JSON plausibile finché non finisce
    res.write('{"choices":[{"index":0,"message":{"role":"assistant","content":"');
    const manda = () => {
      while (scritti < PROVA_A_MANDARE) {
        if (res.destroyed || res.writableEnded) return;
        scritti += pezzo.byteLength;
        if (!res.write(pezzo)) { res.once('drain', manda); return; }
      }
      if (!res.destroyed) res.end('"}}],"usage":{"prompt_tokens":5}}');
    };
    res.on('error', () => {});
    manda();
  });
  await new Promise((risolvi, rifiuta) => { server.once('error', rifiuta); server.listen(0, '127.0.0.1', risolvi); });
  t.after(() => new Promise((risolvi) => { server.close(risolvi); server.closeAllConnections(); }));
  const porta = server.address().port;
  for (const vietata of [4174, 4177, 9333]) assert.notEqual(porta, vietata);

  const store = portachiavi('huggingface');
  store.setRuntime('huggingface', { endpoint: `http://127.0.0.1:${porta}` });
  const esito = await createProviderProbe({ ...deps(store), fetchImpl: fetch }).prova('huggingface', { consentiGenerazione: true });
  assert.equal(esito.esito, 'errore');
  assert.notEqual(esito.credenzialeVerificata, true);
  assert.match(esito.motivo, /troppo grande|non riconoscibile/iu);
  // ⛔ La misura che conta: ci siamo fermati MOLTO prima di quanto il fornitore voleva mandare.
  assert.ok(scritti < 4 * 1024 * 1024, `letti troppi byte: il server ne ha scritti ${scritti}`);
});

test('CLI-REQ-06-13 — un corpo che non finisce si ferma al TEMPO MASSIMO, e la causa è il tempo', async (t) => {
  // ⛔ Il tempo massimo arriva dal runtime, quindi è iniettabile: 250 ms, non secondi veri.
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{"choices":[');   // aperto e mai chiuso: il corpo non finisce
    res.on('error', () => {});
  });
  await new Promise((risolvi, rifiuta) => { server.once('error', rifiuta); server.listen(0, '127.0.0.1', risolvi); });
  t.after(() => new Promise((risolvi) => { server.close(risolvi); server.closeAllConnections(); }));
  const porta = server.address().port;
  for (const vietata of [4174, 4177, 9333]) assert.notEqual(porta, vietata);

  const sonda = createProviderProbe({
    leggiChiave: () => CHIAVE_FINTA,
    leggiRuntime: () => ({ endpoint: `http://127.0.0.1:${porta}`, timeoutSeconds: 0.25 }),
    fetchImpl: fetch,
  });
  // ⛔ Una guardia di sicurezza: senza `signal` la sonda aspetterebbe per sempre, e un test che si
  //   PIANTA non è un test rosso. Qui diventa rosso in cinque secondi, dicendo cosa è mancato.
  let scaduta = null;
  const sentinella = new Promise((risolvi) => { scaduta = setTimeout(() => risolvi('MAI FERMATA'), 5_000); });
  const esito = await Promise.race([sonda.prova('deepinfra', { consentiGenerazione: true }), sentinella]);
  clearTimeout(scaduta);
  assert.notEqual(esito, 'MAI FERMATA', 'la sonda non si è fermata entro il tempo massimo');
  assert.equal(esito.esito, 'irraggiungibile');
  assert.notEqual(esito.credenzialeVerificata, true);
  assert.match(esito.motivo, /entro/iu);
  assert.doesNotMatch(esito.motivo, /senza un messaggio valido/iu, 'una lettura scaduta non è una risposta malformata');
});

test('CLI-REQ-06-14 — ogni causa si chiama col suo nome', async (t) => {
  const store = portachiavi('deepinfra');
  // Un rinvio ad altro indirizzo non è «non raggiungibile»: il fornitore ha risposto, e non lo seguiamo.
  const rinvio = await banco(t, (_r, res) => { res.writeHead(302, { Location: 'https://altrove.invalid/v1/chat/completions' }); res.end(); });
  store.setRuntime('deepinfra', { endpoint: rinvio.base });
  const spostato = await createProviderProbe({ ...deps(store), fetchImpl: fetch }).prova('deepinfra', { consentiGenerazione: true });
  assert.equal(spostato.esito, 'irraggiungibile');
  assert.match(spostato.motivo, /rinvi|altro indirizzo/iu);
  assert.doesNotMatch(spostato.motivo, /^Non è stato possibile raggiungere/u);
  assert.equal(spostato.credenzialeVerificata, null);

  // Un 404 sulla prova da un token: la causa probabile è il modello, non «l'endpoint non esiste».
  const b404 = await banco(t, (_r, res) => json(res, {}, 404));
  store.setRuntime('deepinfra', { endpoint: b404.base });
  const mancante = await createProviderProbe({ ...deps(store), fetchImpl: fetch }).prova('deepinfra', { consentiGenerazione: true });
  assert.equal(mancante.esito, 'errore');
  assert.match(mancante.motivo, /modello/iu, 'il 404 della prova deve nominare il MODELLO, non l\'indirizzo');
  assert.match(mancante.motivo, /potrebbe non essere più disponibile/u);
  assert.match(mancante.motivo, /non è verificata/u);
  assert.equal(mancante.credenzialeVerificata, null);
  // ⛔ E la frase del 404 sull'ELENCO MODELLI resta quella di prima: non parla di modelli di prova.
  const elenco = await createProviderProbe({ ...deps(store), fetchImpl: fetch }).prova('deepinfra');
  assert.match(elenco.motivo, /elenco modelli/iu);
  assert.doesNotMatch(elenco.motivo, /potrebbe non essere più disponibile/u);
});

test('CLI-REQ-06-15 — credenzialeVerificata ha TRE stati, e il terzo è dichiarato', async (t) => {
  /*
   * Il contratto, per chi legge da fuori (la CLI):
   *   true  → il fornitore ha accettato una generazione vera con questa chiave;
   *   false → l'ha guardata e non la conferma — `esito` dice come (`non-autorizzato` = rifiutata,
   *           `collegato` = catalogo pubblico raggiunto, che di quella chiave non dice nulla);
   *   null  → nessuno l'ha giudicata.
   * ⛔ Il terzo stato NON può essere `undefined`: chi legge JSON non distingue «campo assente» da
   *   «non lo so», e sarebbe costretto a indovinare.
   */
  const store = portachiavi('deepinfra');
  const rifiuto = await banco(t, (_r, res) => json(res, {}, 401));
  store.setRuntime('deepinfra', { endpoint: rifiuto.base });
  const rifiutata = await createProviderProbe({ ...deps(store), fetchImpl: fetch }).prova('deepinfra', { consentiGenerazione: true });
  assert.equal(rifiutata.esito, 'non-autorizzato');
  assert.equal(rifiutata.credenzialeVerificata, false, 'un rifiuto è un giudizio: false, non null');

  const traffico = await banco(t, (_r, res) => json(res, {}, 429));
  store.setRuntime('deepinfra', { endpoint: traffico.base });
  const nonGiudicata = await createProviderProbe({ ...deps(store), fetchImpl: fetch }).prova('deepinfra', { consentiGenerazione: true });
  assert.equal(nonGiudicata.credenzialeVerificata, null, 'il traffico non giudica la chiave');

  const senzaChiave = createProviderCredentialStore({ env: {} });
  senzaChiave.setRuntime('deepinfra', { endpoint: 'http://127.0.0.1:1' });
  const mai = await createProviderProbe({ leggiChiave: senzaChiave.getKey, leggiRuntime: senzaChiave.getRuntime, fetchImpl: () => assert.fail('nessuna rete') }).prova('deepinfra');
  assert.equal(mai.credenzialeVerificata, null);

  // ⛔ Nessuno dei quattro stati può uscire come `undefined`: si prova sul JSON, come lo legge la CLI.
  for (const esito of [rifiutata, nonGiudicata, mai]) {
    assert.ok(Object.hasOwn(esito, 'credenzialeVerificata'), JSON.stringify(esito));
    assert.ok('credenzialeVerificata' in JSON.parse(JSON.stringify({ ...esito, credenzialeVerificata: esito.credenzialeVerificata ?? null })));
  }
});

test('CLI-REQ-06-16 — il CONSENSO non si prende dal client: né dal corpo, né dalla query', async (t) => {
  /*
   * ⛔ È l'unica porta fra un clic e il credito della persona. La prima stesura la provava solo nel
   *   verso comodo (una POST senza corpo): il revisore ha fatto leggere `consentiGenerazione` dal
   *   corpo del client e NESSUN test è diventato rosso. Qui la porta si spinge davvero.
   */
  const visti = [];
  const metodi = [];
  const store = portachiavi('deepinfra');
  const b = await banco(t, (r, res) => { metodi.push(r.method); json(res, { data: [{ id: 'un-modello' }] }); });
  store.setRuntime('deepinfra', { endpoint: b.base });
  const vera = createProviderProbe({ ...deps(store), fetchImpl: fetch });
  const providerProbe = { prova: async (provider, opzioni) => { visti.push(opzioni); return vera.prova(provider, opzioni); } };

  const server = createServer(createHttpApp({ staticHandler: async () => null, providerStore: store, providerProbe }));
  await new Promise((risolvi, rifiuta) => { server.once('error', rifiuta); server.listen(0, '127.0.0.1', risolvi); });
  t.after(() => new Promise((risolvi) => server.close(risolvi)));
  const porta = server.address().port;
  for (const vietata of [4174, 4177, 9333]) assert.notEqual(porta, vietata);
  const radice = `http://127.0.0.1:${porta}/api/v1/providers/deepinfra/test`;

  // (1) Il consenso NEL CORPO, in tutte le forme che un client potrebbe provare.
  for (const corpo of [{ consentiGenerazione: true }, { consentiGenerazione: 'true' }, { opzioni: { consentiGenerazione: true } }]) {
    const risposta = await fetch(radice, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    assert.equal(risposta.status, 200, JSON.stringify(corpo));
    assert.notEqual(visti.at(-1)?.consentiGenerazione, true, `il corpo del client ha aperto la porta: ${JSON.stringify(corpo)}`);
  }
  // (2) Il consenso nella QUERY STRING.
  for (const coda of ['?consentiGenerazione=true', '?consentiGenerazione=1']) {
    const prima = visti.length;
    const risposta = await fetch(`${radice}${coda}`, { method: 'POST' });
    assert.notEqual(risposta.status, 200, `la query è stata accettata: ${coda}`);
    assert.equal(visti.length, prima, `la query ha raggiunto la sonda: ${coda}`);
  }
  // (3) ⛔ La misura che conta: dal prodotto non è MAI partita una generazione.
  assert.ok(metodi.length > 0, 'la sonda non ha chiamato nessuno: la prova non proverebbe niente');
  assert.deepEqual([...new Set(metodi)], ['GET'], `dal prodotto è partita una generazione: ${metodi.join(',')}`);
});

test('CLI-REQ-06-06 — chiave rifiutata, fornitore irraggiungibile e traffico restano TRE cause diverse', async (t) => {
  for (const status of [401, 403]) {
    const b = await banco(t, (_r, res) => json(res, { error: { message: `chiave ${CHIAVE_FINTA} non valida` } }, status));
    const store = portachiavi('novita');
    store.setRuntime('novita', { endpoint: b.base });
    const sonda = createProviderProbe({ ...deps(store), fetchImpl: fetch });
    const esito = await sonda.prova('novita', { consentiGenerazione: true });
    assert.equal(esito.esito, 'non-autorizzato', String(status));
    assert.equal(esito.httpStatus, status);
    assert.notEqual(esito.credenzialeVerificata, true);
    // ⛔ Il corpo del fornitore può contenere la chiave: non deve uscire in nessun messaggio.
    assert.equal(JSON.stringify(esito).includes(CHIAVE_FINTA), false, String(status));
  }
  for (const status of [429, 500, 503]) {
    const b = await banco(t, (_r, res) => json(res, { error: { message: 'riprova' } }, status));
    const store = portachiavi('novita');
    store.setRuntime('novita', { endpoint: b.base });
    const sonda = createProviderProbe({ ...deps(store), fetchImpl: fetch });
    const esito = await sonda.prova('novita', { consentiGenerazione: true });
    assert.equal(esito.esito, 'errore', String(status));
    assert.equal(esito.httpStatus, status);
    assert.notEqual(esito.esito, 'non-autorizzato', `${status}: il traffico non è una chiave sbagliata`);
    assert.notEqual(esito.credenzialeVerificata, true);
    assert.equal(b.richieste.length, 1, `${status}: nessun ritentativo automatico`);
  }
  // Fornitore non raggiungibile: nessuna risposta, nessun httpStatus, mai «non autorizzato».
  const store = portachiavi('novita');
  store.setRuntime('novita', { endpoint: 'http://127.0.0.1:1' });
  const irraggiungibile = createProviderProbe({ ...deps(store), fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  const esito = await irraggiungibile.prova('novita', { consentiGenerazione: true });
  assert.equal(esito.esito, 'irraggiungibile');
  assert.equal(esito.httpStatus, undefined);
  assert.notEqual(esito.credenzialeVerificata, true);
  // 404: l'endpoint non c'è, quindi la chiave NON è stata giudicata.
  const b404 = await banco(t, (_r, res) => json(res, {}, 404));
  store.setRuntime('novita', { endpoint: b404.base });
  const quattroCentoQuattro = await createProviderProbe({ ...deps(store), fetchImpl: fetch }).prova('novita', { consentiGenerazione: true });
  assert.equal(quattroCentoQuattro.esito, 'errore');
  assert.match(quattroCentoQuattro.motivo, /non è verificata/u);
  assert.equal(quattroCentoQuattro.credenzialeVerificata, null);
});

test('CLI-REQ-06-07 — senza chiave non si chiama nessuno, nemmeno col consenso', async () => {
  for (const id of Object.keys(QUATTRO)) {
    const store = createProviderCredentialStore({ env: {} });
    store.setRuntime(id, { endpoint: 'http://127.0.0.1:1' });
    const sonda = createProviderProbe({ ...deps(store), fetchImpl: () => assert.fail(`${id}: rete senza chiave`) });
    const esito = await sonda.prova(id, { consentiGenerazione: true });
    assert.equal(esito.esito, 'non-provabile', id);
    assert.equal(esito.millisecondi, null, id);
  }
});

test('CLI-REQ-06-08 — il caso Anthropic resta intatto, nei due versi', async (t) => {
  const store = createProviderCredentialStore({ env: { ZAI_ANTHROPIC_API_KEY: CHIAVE_FINTA } });
  // Senza consenso: non-sondabile, e ZERO richieste (Z.AI non ha un elenco modelli).
  const mai = createProviderProbe({ ...deps(store), fetchImpl: () => assert.fail('Z.AI non genera senza consenso') });
  const senza = await mai.prova('zai-anthropic');
  assert.equal(senza.esito, 'non-sondabile');
  assert.match(senza.motivo, /un token/u);

  const b = await banco(t, (r, res) => json(res, r.body?.model === 'glm-5.3-flash' ? rispostaAnthropic() : rispostaOpenAI()));
  store.setRuntime('zai-anthropic', { endpoint: b.base });
  const sonda = createProviderProbe({ ...deps(store), fetchImpl: fetch });
  const con = await sonda.prova('zai-anthropic', { consentiGenerazione: true });
  assert.equal(con.esito, 'collegato');
  assert.equal(con.credenzialeVerificata, true);
  assert.equal(b.richieste[0].url, '/messages');
  assert.equal(b.richieste[0].body.max_tokens, 1);
  assert.equal(b.richieste[0].headers['anthropic-version'], '2023-06-01');

  // Verso contrario: una risposta OpenAI su un wire Anthropic NON verifica la chiave.
  const bOpenAI = await banco(t, (_r, res) => json(res, rispostaOpenAI()));
  store.setRuntime('zai-anthropic', { endpoint: bOpenAI.base });
  const sbagliata = await createProviderProbe({ ...deps(store), fetchImpl: fetch }).prova('zai-anthropic', { consentiGenerazione: true });
  assert.equal(sbagliata.esito, 'errore');
  assert.notEqual(sbagliata.credenzialeVerificata, true);
});

test('CLI-REQ-06-09 — il catalogo dei quattro resta quello vero del fornitore', async (t) => {
  for (const id of Object.keys(QUATTRO)) {
    const b = await banco(t, (_r, res) => json(res, { data: [{ id: 'modello-del-banco' }] }));
    const store = portachiavi(id);
    store.setRuntime(id, { endpoint: b.base });
    const sonda = createProviderProbe({ ...deps(store), fetchImpl: fetch });
    const catalogo = await sonda.elencaModelli(id);
    assert.deepEqual(catalogo.modelli.map((m) => m.id), [`${id}:modello-del-banco`], id);
    assert.equal(catalogo.fonte, undefined, `${id}: il catalogo non deve ripiegare sulla documentazione`);
    assert.equal(b.richieste[0].method, 'GET', id);
  }
  // Z.AI, che un elenco non ce l'ha, continua a dichiarare la riserva senza chiamare nessuno.
  const store = createProviderCredentialStore({ env: { ZAI_ANTHROPIC_API_KEY: CHIAVE_FINTA } });
  const zai = await createProviderProbe({ ...deps(store), fetchImpl: () => assert.fail('nessuna chiamata') }).elencaModelli('zai-anthropic');
  assert.equal(zai.fonte, 'documentazione');
  assert.equal(zai.credenzialeVerificata, false);
});

test('CLI-REQ-06-10 — la rotta HTTP del pannello non chiede MAI il consenso a generare', async (t) => {
  const opzioniViste = [];
  const providerProbe = { prova: async (provider, opzioni) => { opzioniViste.push({ provider, opzioni }); return { provider, esito: 'collegato', motivo: 'finto', modelli: 1, millisecondi: 1 }; } };
  const server = createServer(createHttpApp({ staticHandler: async () => null, providerStore: createProviderCredentialStore({ env: {} }), providerProbe }));
  await new Promise((risolvi, rifiuta) => { server.once('error', rifiuta); server.listen(0, '127.0.0.1', risolvi); });
  t.after(() => new Promise((risolvi) => server.close(risolvi)));
  const porta = server.address().port;
  for (const vietata of [4174, 4177, 9333]) assert.notEqual(porta, vietata);
  const risposta = await fetch(`http://127.0.0.1:${porta}/api/v1/providers/deepinfra/test`, { method: 'POST' });
  assert.equal(risposta.status, 200);
  assert.equal(opzioniViste.length, 1);
  assert.notEqual(opzioniViste[0].opzioni?.consentiGenerazione, true);
});

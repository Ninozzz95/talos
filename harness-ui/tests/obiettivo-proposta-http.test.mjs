/*
 * ⭐⭐⭐ /goal, fase G2c (decisione owner 14/10/2026: «il modello li propone, poi il pavimento») — LA PROPOSTA DEI CRITERI dalla
 *   richiesta alla busta, sul REGISTRO VERO (sessioni scritte sul disco e ripristinate: madre, figlia, passo di Workflow).
 *
 *   POST /api/v1/sessions/:id/goal/proposta {testo}  → { proposta: {pavimento, motivo?, criteri, scartati, errore?}, progetto, modello, fornitore }
 *
 * Si prova che cosa arriva al MODELLO (quello della sessione, il testo come dato, il preambolo del progetto) e che cosa arriva a
 * chi chiama; e AL CONTRARIO che una proposta non salva niente e non avvia giri, che una chiamata fallita è il pavimento
 * dichiarato e non un errore, e che una domanda sbagliata non arriva mai al modello.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { SISTEMA_PROPOSTA } from '../src/obiettivo/proposta.mjs';
import { chiediMiglioramentoAlProvider } from '../src/prompt-enhancer-provider.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { conStore, registroAGiri, righeObiettivo, scriviSessione } from './aiuto/banco-obiettivo.mjs';

const MADRE = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const FIGLIA = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const PASSO = 'cccccccc-3333-4333-8333-cccccccccccc';
const CHIAVE = 'sk-or-v1-segretissima-proposta-0000';
const PREAMBOLO = 'Working sheet — progetto di prova';

const RISPOSTA_BUONA = JSON.stringify({ criteria: [
  { type: 'command', text: 'I test passano', command: 'npm test' },
  { type: 'command', text: 'Pulizia', command: 'npm run lint || true' },
  { type: 'judgement', text: 'Il messaggio è chiaro' },
] });

const rispostaModello = (contenuto, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => ({ choices: [{ message: { content: contenuto } }] }) });
const portachiavi = () => ({
  getKey: (provider) => (provider === 'openrouter' ? CHIAVE : null),
  getRuntime: () => ({ provider: 'openrouter', endpoint: 'https://openrouter.example/api/v1', endpointConfigured: false, timeoutSeconds: 60 }),
});

/**
 * Il banco: tre sessioni sul disco, il registro vero che le ripristina, il server con la rete e il preambolo FINTI e contati.
 * ⛔ La rete di «migliora il prompt» esplode: la proposta deve passare dalla SUA porta.
 */
async function banco(t, cartellaStore, { rete, preambolo, localRuntimes, madre = {}, capacita, migliora } = {}) {
  scriviSessione(cartellaStore, MADRE, madre);
  scriviSessione(cartellaStore, FIGLIA, { padreId: MADRE, profonditaDelega: 1 });
  scriviSessione(cartellaStore, PASSO, { workflow: {
    runId: '11111111-1111-4111-8111-111111111111', nodeId: 'passo-1', activityExecutionId: '22222222-2222-4222-8222-222222222222',
    attempt: 1, leaseId: '33333333-3333-4333-8333-333333333333', leaseEpoch: 0,
  } });
  const { registro, giri } = registroAGiri(cartellaStore);
  assert.equal((await registro.ripristina()).ripristinate, 3, 'premise: mother, sub-agent and step are restored');
  const chiamate = { rete: [], preambolo: [] };
  const server = createServer(createHttpApp({
    staticHandler: async () => null,
    sessionRegistry: registro,
    providerStore: portachiavi(),
    localRuntimes,
    fetchPropostaObiettivoFn: async (indirizzo, opzioni) => { chiamate.rete.push({ indirizzo, opzioni }); return (rete ?? (async () => rispostaModello(RISPOSTA_BUONA)))(indirizzo, opzioni); },
    fetchMiglioraPromptFn: migliora ?? (async () => { throw new Error('the goal proposal must not use the improve-prompt network'); }),
    contestoDelProgettoFn: async (opzioni) => { chiamate.preambolo.push(opzioni); return (preambolo ?? (async () => ({ testo: PREAMBOLO })))(opzioni); },
    creaFiltroGitignoreFn: async (argomento) => ({ argomento }),
    ...(capacita ? { modelCapabilityFn: capacita } : {}),
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await attendiScritture({ cartellaStore }).catch(() => {}); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1/sessions`;
  const proponi = async (sessionId, corpo, { percorso = '/goal/proposta', metodo = 'POST' } = {}) => {
    const r = await fetch(`${base}/${sessionId}${percorso}`, { method: metodo, headers: { 'content-type': 'application/json' }, ...(metodo === 'POST' ? { body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) } : {}) });
    const grezzo = await r.text();
    const json = JSON.parse(grezzo);
    return { stato: r.status, data: json.data, error: json.error, grezzo };
  };
  return { registro, giri, chiamate, proponi, base };
}

test('PROP-REG-01 — the registry gives what a proposal needs, and refuses where a goal is not allowed; it writes nothing', async (t) => conStore(t, async (cartellaStore) => {
  const { registro, giri } = await banco(t, cartellaStore);
  const giriPrima = giri.length;
  const pronto = registro.contestoPropostaObiettivo(MADRE, '  rendi verdi i test del login  ');
  assert.deepEqual(pronto, {
    ok: true, testo: 'rendi verdi i test del login', cartella: cartellaStore,
    contesto: { sessionId: MADRE, modello: 'z-ai/glm-5.3-flash', provider: 'cloud', runtimeId: null, modelId: 'z-ai/glm-5.3-flash', reasoning: 'medium' },
  });
  const rifiuti = [
    [FIGLIA, 'x', 'GOAL_NOT_ALLOWED', 'goal-on-sub-agent'],
    [PASSO, 'x', 'GOAL_NOT_ALLOWED', 'goal-on-workflow-step'],
    [MADRE, '   ', 'GOAL_TEXT_INVALID', 'goal-text-empty'],
    [MADRE, 'x'.repeat(4001), 'GOAL_TEXT_INVALID', 'goal-text-too-long'],
    ['dddddddd-4444-4444-8444-dddddddddddd', 'x', 'NOT_FOUND', 'session-not-found'],
  ];
  for (const [sessionId, testo, code, reason] of rifiuti) {
    const esito = registro.contestoPropostaObiettivo(sessionId, testo);
    assert.deepEqual([esito.code, esito.reason], [code, reason], `${sessionId.slice(0, 8)} ${testo.slice(0, 8)}`);
  }
  await attendiScritture({ cartellaStore });
  for (const sessionId of [MADRE, FIGLIA, PASSO]) {
    assert.deepEqual(registro.statoObiettivo(sessionId), { ok: true, obiettivo: null });
    assert.deepEqual(righeObiettivo(cartellaStore, sessionId), [], 'asking for a proposal is not setting a goal');
  }
  assert.equal(giri.length, giriPrima, 'no turn started');
}));

test('PROP-REG-02 — the PROJECT is the starting folder: with «Full access» the working folder is the disk root, and the proposal does not read it', async (t) => conStore(t, async (cartellaStore) => {
  const { registro } = await banco(t, cartellaStore, { madre: { permessi: 'Full access', cartellaGiaScelta: false } });
  assert.equal(registro.contestoPropostaObiettivo(MADRE, 'x').cartella, cartellaStore);
}));

test('PROP-HTTP-01 — the SESSION’s model proposes from the goal and the project, the goal travels as data, and nothing is saved', async (t) => conStore(t, async (cartellaStore) => {
  const { registro, giri, chiamate, proponi } = await banco(t, cartellaStore);
  const giriPrima = giri.length;
  const r = await proponi(MADRE, { testo: '  rendi verdi i test del login  ' });
  assert.equal(r.stato, 200, JSON.stringify(r.error));
  assert.deepEqual(r.data, {
    ok: true,
    proposta: {
      pavimento: false,
      criteri: [
        { id: 'c1', testo: 'I test passano', verifica: { tipo: 'comando', comando: 'npm test', uscita: 0 } },
        { id: 'c2', testo: 'Il messaggio è chiaro', verifica: { tipo: 'giudizio' } },
      ],
      scartati: [{ posizione: 2, motivo: 'criterion-command-not-attributable', operatore: '||' }],
    },
    progetto: true, modello: 'z-ai/glm-5.3-flash', fornitore: 'openrouter',
  });
  // al modello: quello della sessione, niente stream, il prompt di sistema, e l'obiettivo pulito COME DATO col preambolo
  assert.equal(chiamate.rete.length, 1);
  const inviato = JSON.parse(chiamate.rete[0].opzioni.body);
  assert.equal(inviato.model, 'z-ai/glm-5.3-flash');
  assert.equal(inviato.stream, false);
  // il tetto alto e il ragionamento chiesto (senza catalogo parte com'è): misurati, vedi `USCITA_MASSIMA_PROPOSTA`
  assert.equal(inviato.max_tokens, 16384);
  assert.deepEqual(inviato.reasoning, { effort: 'medium' });
  assert.deepEqual(inviato.messages[0], { role: 'system', content: SISTEMA_PROPOSTA });
  assert.deepEqual(JSON.parse(inviato.messages[1].content), { task: 'propose_goal_criteria', language_policy: 'same_as_goal', goal: 'rendi verdi i test del login', project_context: PREAMBOLO });
  // il preambolo: la cartella del progetto, permesso e modello null (mai la voce della cache di un giro), il filtro con `{radice}`
  assert.equal(chiamate.preambolo.length, 1);
  const [richiesta] = chiamate.preambolo;
  assert.deepEqual([richiesta.cartella, richiesta.permesso, richiesta.modello, richiesta.piattaforma], [cartellaStore, null, null, process.platform]);
  assert.deepEqual(await richiesta.creaFiltro('C:/progetto'), { argomento: { radice: 'C:/progetto' } });
  // AL CONTRARIO: una proposta non è un obiettivo
  await attendiScritture({ cartellaStore });
  assert.deepEqual(registro.statoObiettivo(MADRE), { ok: true, obiettivo: null });
  assert.deepEqual(righeObiettivo(cartellaStore, MADRE), []);
  assert.equal(giri.length, giriPrima);
  // e confermata così com'è diventa il contratto dell'obiettivo
  const confermato = await registro.impostaObiettivo(MADRE, 'rendi verdi i test del login', { criteri: r.data.proposta.criteri });
  assert.equal(confermato.ok, true, JSON.stringify(confermato));
  assert.deepEqual(confermato.obiettivo.contratto.criteri, r.data.proposta.criteri);
}));

test('PROP-HTTP-02 — AL CONTRARIO: a proposal that does not come is the FLOOR, declared with its reason — never an error, never made up', async (t) => conStore(t, async (cartellaStore) => {
  const casi = [
    { rete: async () => rispostaModello('', { ok: false, status: 500 }), atteso: { motivo: 'proposal-failed', errore: 'PROVIDER_RUNTIME_UNAVAILABLE' }, modello: null },
    { rete: async () => { throw new Error(`connection reset by ${CHIAVE}`); }, atteso: { motivo: 'proposal-failed', errore: 'PROVIDER_RUNTIME_UNAVAILABLE' }, modello: null },
    { rete: async () => rispostaModello('Non saprei, dipende dal progetto.'), atteso: { motivo: 'proposal-unreadable' }, modello: 'z-ai/glm-5.3-flash' },
    { rete: async () => rispostaModello('{"criteria": []}'), atteso: { motivo: 'proposal-empty' }, modello: 'z-ai/glm-5.3-flash' },
  ];
  let rete = casi[0].rete;
  const { proponi } = await banco(t, cartellaStore, { rete: (...a) => rete(...a) });
  for (const caso of casi) {
    rete = caso.rete;
    const r = await proponi(MADRE, { testo: 'rendi verdi i test del login' });
    assert.equal(r.stato, 200, `${caso.atteso.motivo}: ${JSON.stringify(r.error)}`);
    assert.deepEqual(r.data.proposta, { pavimento: true, criteri: [], scartati: [], ...caso.atteso });
    assert.equal(r.data.modello, caso.modello);
    assert.equal(r.grezzo.includes(CHIAVE), false, 'the key never comes back, not even inside an error');
  }
}));

test('PROP-HTTP-03 — the project preamble is a plus: when it cannot be built the proposal is made without it, and says so', async (t) => conStore(t, async (cartellaStore) => {
  let preambolo = async () => { throw new Error('gitignore illeggibile'); };
  const { chiamate, proponi } = await banco(t, cartellaStore, { preambolo: (...a) => preambolo(...a) });
  const senza = await proponi(MADRE, { testo: 'rendi verdi i test' });
  assert.equal(senza.stato, 200, JSON.stringify(senza.error));
  assert.equal(senza.data.progetto, false);
  assert.equal(senza.data.proposta.pavimento, false);
  assert.equal(JSON.parse(JSON.parse(chiamate.rete[0].opzioni.body).messages[1].content).project_context, null);
  preambolo = async () => ({ testo: '' });
  const vuoto = await proponi(MADRE, { testo: 'rendi verdi i test' });
  assert.equal(vuoto.data.progetto, false, 'an empty preamble is no preamble');
  preambolo = async () => ({ testo: PREAMBOLO });
  assert.equal((await proponi(MADRE, { testo: 'rendi verdi i test' })).data.progetto, true);
}));

test('PROP-HTTP-04 — a LOCAL session proposes on its engine and never touches the network; a missing engine is the floor', async (t) => conStore(t, async (cartellaStore) => {
  const pezzi = [RISPOSTA_BUONA.slice(0, 40), RISPOSTA_BUONA.slice(40)];
  const ricevuti = [];
  const localRuntimes = { llama: { async *generateStream(richiesta) { ricevuti.push(richiesta); for (const value of pezzi) yield { type: 'text', value }; } } };
  const { chiamate, proponi } = await banco(t, cartellaStore, { localRuntimes, madre: { provider: 'local', runtimeId: 'llama', modelId: 'qwen-locale', modello: 'qwen-locale' } });
  const r = await proponi(MADRE, { testo: 'rendi verdi i test' });
  assert.equal(r.stato, 200, JSON.stringify(r.error));
  assert.deepEqual([r.data.modello, r.data.fornitore], ['qwen-locale', 'llama']);
  assert.equal(r.data.proposta.criteri.length, 2);
  assert.equal(chiamate.rete.length, 0, 'a local session never touches the network');
  assert.equal(ricevuti[0].modelId, 'qwen-locale');
  assert.equal(ricevuti[0].maxTokens, 16384, 'a local model that reasons needs the same room');
  assert.match(ricevuti[0].runId, /^proposta-obiettivo-/u);
  assert.deepEqual(ricevuti[0].messages[0], { role: 'system', content: SISTEMA_PROPOSTA });

  delete localRuntimes.llama;
  const senzaMotore = await proponi(MADRE, { testo: 'rendi verdi i test' });
  assert.deepEqual(senzaMotore.data.proposta, { pavimento: true, motivo: 'proposal-failed', criteri: [], scartati: [], errore: 'RUNTIME_NOT_AVAILABLE' });
  assert.equal(chiamate.rete.length, 0);
}));

test('PROP-HTTP-05 — AL CONTRARIO: a wrong question never reaches the model nor the disk walk', async (t) => conStore(t, async (cartellaStore) => {
  const { chiamate, proponi } = await banco(t, cartellaStore);
  for (const corpo of [{}, { testo: 3 }, { testo: 'x', criteri: [] }, [], 'null']) {
    const r = await proponi(MADRE, corpo);
    assert.deepEqual([r.stato, r.error?.code], [400, 'QUERY_INVALID'], JSON.stringify(corpo));
  }
  const rifiuti = [
    [FIGLIA, { testo: 'x' }, 422, 'GOAL_NOT_ALLOWED', 'goal-on-sub-agent'],
    [PASSO, { testo: 'x' }, 422, 'GOAL_NOT_ALLOWED', 'goal-on-workflow-step'],
    [MADRE, { testo: '   ' }, 400, 'GOAL_TEXT_INVALID', 'goal-text-empty'],
    ['dddddddd-4444-4444-8444-dddddddddddd', { testo: 'x' }, 404, 'NOT_FOUND', undefined],
  ];
  for (const [sessionId, corpo, stato, code, reason] of rifiuti) {
    const r = await proponi(sessionId, corpo);
    assert.deepEqual([r.stato, r.error?.code], [stato, code], `${sessionId.slice(0, 8)} ${JSON.stringify(corpo)}`);
    if (reason) assert.equal(r.error.reason, reason);
  }
  const conDomanda = await proponi(MADRE, { testo: 'x' }, { percorso: '/goal/proposta?subito=1' });
  assert.equal(conDomanda.stato, 400);
  const leggere = await proponi(MADRE, null, { metodo: 'GET' });
  assert.equal(leggere.stato, 405, 'the door exists only as POST');
  assert.deepEqual([chiamate.rete.length, chiamate.preambolo.length], [0, 0]);
}));

test('PROP-HTTP-06 — the reasoning asked is adapted to the model’s catalog like a turn’s, never dearer; AL CONTRARIO «improve the prompt» on the same road still sends its request of always', async (t) => conStore(t, async (cartellaStore) => {
  let migliorata = null;
  const { chiamate, proponi, base } = await banco(t, cartellaStore, {
    // la voce vera di glm-5.3-flash (misurata dalla sessione mobile il 24/09, `runtime-owner-adapter.mjs:409`): niente `medium`
    capacita: async (modello) => (modello === 'z-ai/glm-5.3-flash' ? { id: modello, reasoning: { supportedEfforts: ['max', 'high', 'low'], defaultEffort: 'max', mandatory: true } } : null),
    migliora: async (indirizzo, opzioni) => {
      migliorata = JSON.parse(opzioni.body);
      return rispostaModello(JSON.stringify({ enhanced_prompt: 'Obiettivo chiaro.', summary: 'ok', applied_principles: [] }));
    },
  });
  const r = await proponi(MADRE, { testo: 'rendi verdi i test' });
  assert.equal(r.stato, 200, JSON.stringify(r.error));
  const inviato = JSON.parse(chiamate.rete[0].opzioni.body);
  assert.deepEqual(inviato.reasoning, { effort: 'low' }, '«medium» is not in the catalog of glm-5.3-flash: the nearest WEAKER one, never max');
  assert.equal(inviato.max_tokens, 16384);

  const m = await fetch(`${base}/${MADRE}/migliora-prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'sistema il test' }) });
  assert.equal(m.status, 200);
  assert.equal(migliorata.max_tokens, 2048, 'improve-prompt keeps its cap');
  assert.equal('reasoning' in migliorata, false, 'improve-prompt sends no reasoning field, as always');
}));

test('PROP-HTTP-07 — the reasoning field goes ONLY to OpenRouter: a direct provider and the ChatGPT plan never receive it, the cap they do', async () => {
  const messaggi = [{ role: 'system', content: 'Proponi.' }, { role: 'user', content: '{}' }];
  const corpi = [];
  const raccogli = async (indirizzo, opzioni) => { corpi.push({ indirizzo: String(indirizzo), corpo: JSON.parse(opzioni.body) }); return rispostaModello('{"criteria":[]}'); };
  // OpenRouter: sì
  await chiediMiglioramentoAlProvider({ modello: 'z-ai/glm-5.3-flash', messaggi, providerStore: portachiavi(), fetchFn: raccogli, maxTokens: 16384, reasoning: { effort: 'low' } });
  // un fornitore diretto (la stessa forma di BC-15-13): no
  await chiediMiglioramentoAlProvider({
    modello: 'deepseek:deepseek-chat', messaggi, fetchFn: raccogli, maxTokens: 16384, reasoning: { effort: 'low' },
    providerStore: { getKey: (p) => (p === 'deepseek' ? 'sk-deepseek-solo-test' : null), getRuntime: (p) => (p === 'deepseek' ? { provider: p, endpoint: 'https://deepseek.example', endpointConfigured: true, timeoutSeconds: 60 } : null) },
  });
  assert.deepEqual(corpi.map((c) => [c.indirizzo, c.corpo.max_tokens, c.corpo.reasoning ?? null]), [
    [corpi[0].indirizzo, 16384, { effort: 'low' }],
    ['https://deepseek.example/chat/completions', 16384, null],
  ]);
  assert.match(corpi[0].indirizzo, /openrouter/u);
  // il piano ChatGPT (la stessa forma di MIGLIORA-PIANO-01): il corpo che parte è quello del piano, e il nostro campo non c'è
  const pianoInviati = [];
  const flusso = new Response('event: response.completed\ndata: {"type":"response.completed","response":{"id":"r","status":"completed","model":"gpt-6-sol","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } });
  await chiediMiglioramentoAlProvider({
    modello: 'chatgpt:gpt-6-sol', messaggi, maxTokens: 16384, reasoning: { effort: 'low', segnaPiano: true },
    providerStore: createProviderCredentialStore({ env: { OPENAI_API_KEY: 'sk-non-deve-pagare' } }),
    leggiTokenDelPiano: async () => 'TOKEN-DEL-PIANO',
    fetchFn: async (indirizzo, opzioni) => { pianoInviati.push(JSON.parse(opzioni.body)); return flusso; },
  }).catch(() => null);
  assert.equal(pianoInviati.length, 1, 'premise: the plan request left');
  assert.equal(JSON.stringify(pianoInviati[0]).includes('segnaPiano'), false, 'our reasoning object never reaches the plan');
});

/*
 * ⭐⭐⭐ BC-15 — «Migliora il prompt», la rotta.
 *
 * Il comportamento è preso dal mobile, che ce l'ha già:
 *   `AVM/mobile/src/lib/chat/promptEnhancement.ts:187-262` — il giro completo
 *   `AVM/mobile/src/lib/chat/promptEnhancerDepth.ts:39-62` — i tre livelli in fondo al sistema
 *
 * ⛔ Ogni cura è provata ANCHE AL VERSO CONTRARIO: che il modello chiamato sia quello della
 *   SESSIONE (non uno scelto dalla rotta), che una risposta fuori formato NON diventi un prompt
 *   finto, che la chiave non esca mai in un messaggio d'errore, e che una sessione locale non
 *   tocchi la rete nemmeno una volta.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp, PROMPT_ENHANCER_MAX_CARATTERI } from '../src/http-app.mjs';

const CHIAVE = 'sk-or-v1-segretissima-0000';

function registroCon(contesto) {
  return { leggiSessioneContesto: (id) => (id === 'sessione-1' ? contesto : null) };
}

function portachiaviCon(chiave = CHIAVE) {
  return {
    getKey: (provider) => (provider === 'openrouter' ? chiave : null),
    getRuntime: () => ({ provider: 'openrouter', endpoint: 'https://openrouter.example/api/v1', endpointConfigured: false, timeoutSeconds: 60 }),
  };
}

/** Una risposta del fornitore finta, con dentro il testo che il modello avrebbe prodotto. */
function rispostaModello(contenuto, { ok = true, status = 200 } = {}) {
  const corpo = { choices: [{ message: { content: contenuto } }] };
  return { ok, status, json: async () => corpo, text: async () => JSON.stringify(corpo) };
}

const CORPO_BUONO = JSON.stringify({
  enhanced_prompt: 'Obiettivo: scrivere il test. Output atteso: un file .mjs. Verifica: la suite passa.',
  summary: 'Obiettivo e criteri di verifica resi espliciti.',
  applied_principles: ['obiettivo esplicito', 'criteri di verifica'],
});

async function listen(t, opzioni = {}) {
  const app = createHttpApp({ staticHandler: async () => null, ...opzioni });
  const server = createServer(app);
  await new Promise((risolvi, rifiuta) => { server.once('error', rifiuta); server.listen(0, '127.0.0.1', risolvi); });
  t.after(() => new Promise((risolvi) => server.close(risolvi)));
  return `http://127.0.0.1:${server.address().port}`;
}

const migliora = (base, corpo, sessione = 'sessione-1') => fetch(`${base}/api/v1/sessions/${sessione}/migliora-prompt`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
});

test('BC-15-01 riscrive col MODELLO DELLA SESSIONE e restituisce prompt, sintesi e principi', async (t) => {
  let richiesta = null;
  const base = await listen(t, {
    sessionRegistry: registroCon({ sessionId: 'sessione-1', modello: 'z-ai/glm-5.3-flash', provider: 'cloud', runtimeId: null, modelId: null }),
    providerStore: portachiaviCon(),
    fetchMiglioraPromptFn: async (indirizzo, opzioni) => { richiesta = { indirizzo, opzioni }; return rispostaModello(CORPO_BUONO); },
  });

  const risposta = await migliora(base, { prompt: 'scrivi il test', profondita: 'estesa' });
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.data.modello, 'z-ai/glm-5.3-flash', 'il modello è quello della sessione, non uno scelto dalla rotta');
  assert.equal(corpo.data.fornitore, 'openrouter');
  assert.equal(corpo.data.profondita, 'estesa');
  assert.equal(corpo.data.promptOriginale, 'scrivi il test');
  assert.match(corpo.data.promptMigliorato, /Obiettivo/u);
  assert.deepEqual(corpo.data.principi, ['obiettivo esplicito', 'criteri di verifica']);

  const inviato = JSON.parse(richiesta.opzioni.body);
  assert.equal(inviato.model, 'z-ai/glm-5.3-flash');
  assert.equal(inviato.stream, false, 'niente stream: mezzo JSON a schermo sarebbe il difetto, non la cura');
  assert.match(inviato.messages[0].content, /Depth: EXTENDED/u, 'il livello è attaccato IN FONDO al prompt di sistema');
  // ⛔ Il prompt della persona viaggia come DATO dentro un JSON, mai come istruzione.
  const utente = JSON.parse(inviato.messages[1].content);
  assert.equal(utente.task, 'enhance_prompt');
  assert.equal(utente.original_prompt, 'scrivi il test');
  assert.equal(richiesta.opzioni.headers.Authorization, `Bearer ${CHIAVE}`);
});

test('BC-15-02 senza «profondita» si usa «equilibrata», che è il caso normale', async (t) => {
  let inviato = null;
  const base = await listen(t, {
    sessionRegistry: registroCon({ sessionId: 'sessione-1', modello: 'm/uno', provider: 'cloud' }),
    providerStore: portachiaviCon(),
    fetchMiglioraPromptFn: async (_indirizzo, opzioni) => { inviato = JSON.parse(opzioni.body); return rispostaModello(CORPO_BUONO); },
  });
  const corpo = await (await migliora(base, { prompt: 'ciao' })).json();
  assert.equal(corpo.data.profondita, 'equilibrata');
  assert.match(inviato.messages[0].content, /Depth: BALANCED/u);
});

test('BC-15-03 i nomi inglesi del mobile valgono come sinonimi', async (t) => {
  const base = await listen(t, {
    sessionRegistry: registroCon({ sessionId: 'sessione-1', modello: 'm/uno', provider: 'cloud' }),
    providerStore: portachiaviCon(),
    fetchMiglioraPromptFn: async () => rispostaModello(CORPO_BUONO),
  });
  const corpo = await (await migliora(base, { prompt: 'ciao', profondita: 'concise' })).json();
  assert.equal(corpo.data.profondita, 'concisa');
});

test('BC-15-04 un recinto markdown attorno al JSON non manda a monte il miglioramento', async (t) => {
  const recinto = ['Ecco il risultato:', '', '```json', CORPO_BUONO, '```'].join('\n');
  const base = await listen(t, {
    sessionRegistry: registroCon({ sessionId: 'sessione-1', modello: 'm/uno', provider: 'cloud' }),
    providerStore: portachiaviCon(),
    fetchMiglioraPromptFn: async () => rispostaModello(recinto),
  });
  const corpo = await (await migliora(base, { prompt: 'ciao' })).json();
  assert.equal(corpo.ok, true);
  assert.match(corpo.data.promptMigliorato, /Obiettivo/u);
});

test('BC-15-05 VERSO CONTRARIO: una risposta fuori formato NON diventa un prompt finto', async (t) => {
  const base = await listen(t, {
    sessionRegistry: registroCon({ sessionId: 'sessione-1', modello: 'm/uno', provider: 'cloud' }),
    providerStore: portachiaviCon(),
    fetchMiglioraPromptFn: async () => rispostaModello('Certo! Ecco un prompt migliore per te.'),
  });
  const risposta = await migliora(base, { prompt: 'ciao' });
  assert.equal(risposta.status, 503);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, false);
  assert.equal(corpo.error.code, 'PROVIDER_RUNTIME_UNAVAILABLE');
});

test('BC-15-06 VERSO CONTRARIO: la chiave non compare MAI in un messaggio di errore', async (t) => {
  const base = await listen(t, {
    sessionRegistry: registroCon({ sessionId: 'sessione-1', modello: 'm/uno', provider: 'cloud' }),
    providerStore: portachiaviCon(),
    // Il fornitore rimanda indietro la chiave dentro il messaggio: capita, e non deve uscire di qui.
    fetchMiglioraPromptFn: async () => { throw new Error(`connessione rifiutata con Authorization: Bearer ${CHIAVE}`); },
  });
  const risposta = await migliora(base, { prompt: 'ciao' });
  assert.equal(risposta.status, 503);
  const testo = await risposta.text();
  assert.ok(!testo.includes(CHIAVE), 'la chiave non deve comparire nella risposta');
  assert.ok(!testo.includes('sk-or-v1'), 'nemmeno un pezzo riconoscibile');
});

test('BC-15-07 senza chiave OpenRouter si dice cosa manca, e non si bussa al fornitore', async (t) => {
  let chiamate = 0;
  const base = await listen(t, {
    sessionRegistry: registroCon({ sessionId: 'sessione-1', modello: 'm/uno', provider: 'cloud' }),
    providerStore: portachiaviCon(null),
    fetchMiglioraPromptFn: async () => { chiamate += 1; return rispostaModello(CORPO_BUONO); },
  });
  const risposta = await migliora(base, { prompt: 'ciao' });
  assert.equal(risposta.status, 422);
  assert.equal((await risposta.json()).error.code, 'PROVIDER_KEY_REQUIRED');
  assert.equal(chiamate, 0, 'non si bussa a un fornitore senza avere di che presentarsi');
});

test('BC-15-08 una sessione LOCALE gira sul motore di questo computer e non tocca la rete', async (t) => {
  let chiamateDiRete = 0;
  let ricevuto = null;
  const runtimeLocale = {
    async *generateStream(richiesta) {
      ricevuto = richiesta;
      yield { type: 'text', value: CORPO_BUONO.slice(0, 40) };
      yield { type: 'text', value: CORPO_BUONO.slice(40) };
      yield { type: 'done' };
    },
  };
  const base = await listen(t, {
    sessionRegistry: registroCon({ sessionId: 'sessione-1', modello: 'local:qwen', provider: 'local', runtimeId: 'llama.cpp', modelId: 'qwen3-0.6b' }),
    providerStore: portachiaviCon(),
    localRuntimes: { 'llama.cpp': runtimeLocale },
    fetchMiglioraPromptFn: async () => { chiamateDiRete += 1; return rispostaModello(CORPO_BUONO); },
  });
  const risposta = await migliora(base, { prompt: 'ciao' });
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.data.modello, 'qwen3-0.6b');
  assert.equal(corpo.data.fornitore, 'llama.cpp');
  assert.equal(chiamateDiRete, 0, 'senza rete e senza costo: è il senso di un modello locale');
  assert.equal(ricevuto.modelId, 'qwen3-0.6b');
  assert.match(ricevuto.messages[0].content, /TALOS Prompt Enhancer/u);
});

test('BC-15-09 sessione locale col motore spento: lo dice, non finge', async (t) => {
  const base = await listen(t, {
    sessionRegistry: registroCon({ sessionId: 'sessione-1', modello: 'local:qwen', provider: 'local', runtimeId: 'llama.cpp', modelId: 'qwen3-0.6b' }),
    providerStore: portachiaviCon(),
    localRuntimes: {},
  });
  const risposta = await migliora(base, { prompt: 'ciao' });
  assert.equal(risposta.status, 503);
  assert.equal((await risposta.json()).error.code, 'RUNTIME_NOT_AVAILABLE');
});

test('BC-15-10 testo vuoto, testo smisurato, livello inventato e chiave di troppo: quattro 400', async (t) => {
  const base = await listen(t, {
    sessionRegistry: registroCon({ sessionId: 'sessione-1', modello: 'm/uno', provider: 'cloud' }),
    providerStore: portachiaviCon(),
    fetchMiglioraPromptFn: async () => rispostaModello(CORPO_BUONO),
  });
  const casi = [
    { prompt: '   ' },
    { prompt: 'a'.repeat(PROMPT_ENHANCER_MAX_CARATTERI + 1) },
    { prompt: 'ciao', profondita: 'fortissima' },
    { prompt: 'ciao', extra: 1 },
  ];
  for (const corpo of casi) {
    const risposta = await migliora(base, corpo);
    assert.equal(risposta.status, 400, `atteso 400 per ${JSON.stringify(Object.keys(corpo))}`);
    assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
  }
});

test('BC-15-11 una sessione che non esiste è 404, non un miglioramento a vuoto', async (t) => {
  const base = await listen(t, {
    sessionRegistry: registroCon({ sessionId: 'sessione-1', modello: 'm/uno', provider: 'cloud' }),
    providerStore: portachiaviCon(),
    fetchMiglioraPromptFn: async () => rispostaModello(CORPO_BUONO),
  });
  const risposta = await migliora(base, { prompt: 'ciao' }, 'non-esiste');
  assert.equal(risposta.status, 404);
});

test('BC-15-12 il fornitore che risponde male diventa un errore ritentabile, non un testo', async (t) => {
  const base = await listen(t, {
    sessionRegistry: registroCon({ sessionId: 'sessione-1', modello: 'm/uno', provider: 'cloud' }),
    providerStore: portachiaviCon(),
    fetchMiglioraPromptFn: async () => rispostaModello('', { ok: false, status: 429 }),
  });
  const risposta = await migliora(base, { prompt: 'ciao' });
  assert.equal(risposta.status, 503);
  assert.equal((await risposta.json()).error.code, 'PROVIDER_RUNTIME_UNAVAILABLE');
});

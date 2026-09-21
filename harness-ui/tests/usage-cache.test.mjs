import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizzaUsage,
  percorsiDiCacheDichiarati,
  scontoDaCache,
  tokenDaCache,
  tokenNonDaCache,
  tokenScrittiInCache,
} from '../src/usage-cache.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';

test('PD-CACHE — Z.AI: assente o null significa non misurato, zero solo se esplicito', () => {
  for (const value of [undefined, null, '', ' ', false, true, [], {}, -1]) {
    const usage = { prompt_tokens: 1200, prompt_tokens_details: { cached_tokens: value } };
    assert.equal(tokenDaCache(usage, 'openai-chat'), null);
    assert.equal(tokenDaCache(usage, 'zai'), null);
    assert.equal(normalizzaUsage(usage, 'zai'), usage);
  }
  // Fonte: https://docs.z.ai/guides/capabilities/cache, letta 12/09/2026.
  assert.equal(tokenDaCache({ prompt_tokens: 1200, prompt_tokens_details: { cached_tokens: 800 } }, 'zai'), 800);
  assert.equal(tokenDaCache({ prompt_tokens_details: { cached_tokens: 0 } }, 'zai'), 0);
  assert.equal(tokenDaCache({ prompt_tokens: 1200 }, 'zai'), null);
});

/*
 * ⛔⛔⛔ P-B — «QUANTI TOKEN VENGONO DALLA CACHE?», CHIESTO A CHI RISPONDE IN SEI MODI DIVERSI.
 *
 * Misurato il 22/8 sul banco: **87 token in ingresso per ogni token in uscita**, il **93% del
 * costo è rileggere lo stesso prefisso**. La lezione di quel giorno
 * (`la-cache-vale-sei-volte-e-non-la-contavamo`) diceva che la cura non era nell'agente: era che
 * **due lettori non conoscevano il nome del campo**.
 *
 * ## Le fixture: da dove viene ognuna
 *
 * ⛔ Nessuna è inventata. Ogni forma qui sotto porta l'URL della documentazione primaria e la data
 *   di lettura — se una di queste API cambia nome a un campo, questo test resta il posto dove si
 *   vede che cosa avevamo letto e quando. ⛔ E nessuna di queste prove chiama un fornitore vero:
 *   sono oggetti, e la fetch è iniettata.
 */

// ── Le fixture, una per forma ─────────────────────────────────────────────────────────────────

/* 🌐 https://api-docs.deepseek.com/api/create-chat-completion (letto 12/09/2026):
   «prompt_tokens … It equals prompt_cache_hit_tokens + prompt_cache_miss_tokens». */
const DEEPSEEK = Object.freeze({
  prompt_tokens: 16_811,
  completion_tokens: 192,
  total_tokens: 17_003,
  prompt_cache_hit_tokens: 16_768,
  prompt_cache_miss_tokens: 43,
});

/* La stessa risposta DeepSeek quando porta ANCHE il nome canonico — la documentazione del 12/09
   dichiara `prompt_tokens_details.cached_tokens` nella stessa `usage`. I due devono concordare. */
const DEEPSEEK_CON_CANONICO = Object.freeze({
  ...DEEPSEEK,
  prompt_tokens_details: Object.freeze({ cached_tokens: 16_768 }),
});

/* 🌐 https://platform.kimi.ai/docs/api/chat (letto 12/09/2026): `cached_tokens` — «Number of
   tokens served from cache» — al PRIMO livello di `usage`. */
const KIMI = Object.freeze({ prompt_tokens: 64_000, completion_tokens: 120, total_tokens: 64_120, cached_tokens: 62_080 });

/* 🌐 https://openrouter.ai/docs/features/prompt-caching (letto 12/09/2026): `cached_tokens` e
   `cache_write_tokens` dentro `prompt_tokens_details`; `cache_discount` al livello del CORPO. */
const OPENROUTER_CORPO = Object.freeze({
  choices: [Object.freeze({ index: 0, message: Object.freeze({ role: 'assistant', content: 'ok' }) })],
  usage: Object.freeze({ prompt_tokens: 11_000, completion_tokens: 80, prompt_tokens_details: Object.freeze({ cached_tokens: 10_318, cache_write_tokens: 0 }) }),
  cache_discount: 0.0084,
});

/* 🌐 https://platform.claude.com/docs/en/build-with-claude/prompt-caching (letto 12/09/2026):
   `total_input = cache_read + cache_creation + input`. ⛔ Il totale NON li include. */
const ANTHROPIC = Object.freeze({ input_tokens: 214, output_tokens: 60, cache_read_input_tokens: 18_000, cache_creation_input_tokens: 1_024 });

/* La forma del wire Responses (OpenAI, e ogni gateway che lo imita). */
const RESPONSES = Object.freeze({ input_tokens: 9_000, output_tokens: 300, input_tokens_details: Object.freeze({ cached_tokens: 8_704, cache_write_tokens: 0 }) });

// ── 1. Una forma per riga, letta dal nome giusto ──────────────────────────────────────────────

test('CACHE-01 — ogni forma nota si legge, e il valore è quello del fornitore', () => {
  assert.equal(tokenDaCache(DEEPSEEK, 'deepseek'), 16_768, 'DeepSeek: prompt_cache_hit_tokens');
  assert.equal(tokenDaCache(DEEPSEEK_CON_CANONICO, 'deepseek'), 16_768, 'DeepSeek: i due nomi devono dare lo stesso numero');
  assert.equal(tokenDaCache(KIMI, 'openai-chat'), 62_080, 'Kimi: cached_tokens al primo livello');
  assert.equal(tokenDaCache(OPENROUTER_CORPO.usage, 'openrouter'), 10_318, 'OpenRouter: prompt_tokens_details.cached_tokens');
  assert.equal(tokenDaCache(ANTHROPIC, 'anthropic'), 18_000, 'Anthropic: cache_read_input_tokens');
  assert.equal(tokenDaCache(RESPONSES, 'openai'), 8_704, 'Responses: input_tokens_details.cached_tokens');

  assert.equal(tokenScrittiInCache(ANTHROPIC, 'anthropic'), 1_024, 'le SCRITTURE hanno un nome loro e costano di più');
  assert.equal(tokenScrittiInCache(OPENROUTER_CORPO.usage, 'openrouter'), 0);
});

test('CACHE-02 — «non dichiarato» resta null, e non diventa MAI zero', () => {
  /*
   * ⛔ È la riga che `session-registry.mjs:930` dice già a parole: «il fornitore non ha dichiarato
   *   quanti token venissero dalla cache, e "non dichiarato" non è "nessuno"». Uno zero inventato
   *   fa sembrare che la cache non stia prendendo, e manda a cercare una cura per un difetto che
   *   non c'è.
   */
  assert.equal(tokenDaCache({ prompt_tokens: 100 }, 'deepseek'), null);
  assert.equal(tokenDaCache(null, 'deepseek'), null);
  assert.equal(tokenDaCache(undefined, 'openrouter'), null);
  assert.equal(tokenDaCache({ prompt_tokens: 100 }, 'ollama'), null, 'un motore locale non dichiara cache: null, non 0');
  assert.equal(tokenDaCache(DEEPSEEK, 'fornitore-che-non-esiste'), null, 'un wire sconosciuto non legge a caso');
  /* ⛔ E uno zero DICHIARATO resta zero: è un fatto, non un'assenza. */
  assert.equal(tokenDaCache({ prompt_tokens_details: { cached_tokens: 0 } }, 'openrouter'), 0);
  /* ⛔ Un valore che non è un conteggio non diventa un conteggio. */
  assert.equal(tokenDaCache({ prompt_cache_hit_tokens: -5 }, 'deepseek'), null);
  assert.equal(tokenDaCache({ prompt_cache_hit_tokens: 'molti' }, 'deepseek'), null);
});

test('CACHE-03 — NON si sommano: il totale DeepSeek contiene già gli hit', () => {
  /*
   * ⛔⛔ La trappola numerica, provata con i numeri della documentazione:
   *   16.768 hit + 43 miss = 16.811 prompt_tokens. Chi sommasse gli hit al totale direbbe 33.579
   *   token di ingresso — il doppio — su una richiesta che ne ha usati 16.811.
   */
  assert.equal(DEEPSEEK.prompt_cache_hit_tokens + DEEPSEEK.prompt_cache_miss_tokens, DEEPSEEK.prompt_tokens);
  assert.equal(tokenNonDaCache(DEEPSEEK, 'deepseek'), 43, 'sul wire OpenAI i cached si SOTTRAGGONO dal totale');
  assert.equal(tokenNonDaCache(OPENROUTER_CORPO.usage, 'openrouter'), 11_000 - 10_318);
  /*
   * ⛔⛔ E l'opposto, sul wire Anthropic: `input_tokens` è GIÀ il solo residuo. Sottrarre di nuovo
   *   darebbe 0 su una richiesta che ne ha pagati 214 a prezzo pieno.
   */
  assert.equal(tokenNonDaCache(ANTHROPIC, 'anthropic'), 214);
});

test('CACHE-04 — lo sconto è DENARO: non entra in nessun conteggio di token', () => {
  assert.equal(scontoDaCache(OPENROUTER_CORPO, 'openrouter'), 0.0084);
  assert.equal(tokenDaCache(OPENROUTER_CORPO, 'openrouter'), null, 'il corpo non è un usage: nessun token si legge da lì');
  /* ⛔ Solo chi lo dichiara nel record lo espone: nessun altro fornitore inventa un campo. */
  assert.equal(scontoDaCache({ cache_discount: 9 }, 'deepseek'), null);
  /* 🌐 «Some providers, like Anthropic, will have a negative discount on cache writes»: si legge
     anche quando è negativo, perché è una spesa vera. */
  assert.equal(scontoDaCache({ cache_discount: -0.002 }, 'openrouter'), -0.002);
});

test('CACHE-05 — normalizzare AGGIUNGE il nome canonico e non toglie niente', () => {
  const normalizzato = normalizzaUsage(DEEPSEEK, 'deepseek');
  assert.equal(normalizzato.prompt_tokens_details.cached_tokens, 16_768);
  assert.equal(normalizzato.prompt_cache_hit_tokens, 16_768, 'il campo nativo resta dov’era');
  assert.equal(normalizzato.prompt_cache_miss_tokens, 43);
  assert.equal(normalizzato.prompt_tokens, DEEPSEEK.prompt_tokens);

  /* ⛔ Se non c'è niente da aggiungere l'oggetto torna IDENTICO: nessuna copia inutile, e chi
     chiama può usare l'identità per non ricostruire un corpo che non è cambiato. */
  assert.equal(normalizzaUsage(OPENROUTER_CORPO.usage, 'openrouter'), OPENROUTER_CORPO.usage);
  assert.equal(normalizzaUsage({ prompt_tokens: 5 }, 'ollama').prompt_tokens, 5);
  assert.equal(normalizzaUsage(null, 'deepseek'), null);
});

test('CACHE-06 — ogni fornitore del registro dichiara i suoi percorsi, e i tre wire coprono le sei forme', () => {
  const percorsi = percorsiDiCacheDichiarati();
  assert.ok(percorsi.deepseek.includes('prompt_cache_hit_tokens'), 'DeepSeek senza il suo nome nativo torna a riportare 0');
  assert.ok(percorsi.deepseek.includes('cached_tokens'), 'la forma Kimi arriva dal wire: il giorno che lo aggiungiamo il lettore c’è già');
  assert.ok(percorsi.anthropic.includes('cache_read_input_tokens'));
  assert.ok(percorsi.openai.includes('input_tokens_details.cached_tokens'));
  assert.ok(percorsi.gemini.includes('usageMetadata.cachedContentTokenCount'));
  assert.deepEqual(percorsi.local, [], 'il motore locale non ha una cache da dichiarare: meglio niente che un nome sbagliato');
});

// ── 2. Fino al bordo: la risposta che arriva al kernel porta il nome canonico ──────────────────

test('CACHE-07 — una risposta DeepSeek non in streaming esce con `cached_tokens` leggibile', async () => {
  /*
   * ⭐ Il giro vero, con una fetch iniettata: nessuna chiamata a un fornitore, nessuna chiave.
   *   È il punto in cui P-B smette di essere una funzione pura e diventa un numero sul record
   *   `tempi-giro` e sulla Board — quelli leggono `prompt_tokens_details.cached_tokens`, e prima
   *   di oggi su DeepSeek trovavano `undefined`.
   */
  let indirizzo = null;
  const fetchDiRete = async (url, opzioni) => {
    indirizzo = String(url);
    return new Response(JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }], usage: DEEPSEEK }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const fetchMulti = creaFetchMultiProvider(fetchDiRete, {
    dipendenze: {
      leggiChiave: () => 'chiave-finta',
      leggiRuntime: () => ({ endpoint: 'https://api.deepseek.test' }),
    },
  });
  const risposta = await fetchMulti('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ model: 'deepseek:deepseek-flash', messages: [{ role: 'user', content: 'ciao' }], stream: false }),
  });
  const corpo = await risposta.json();
  assert.equal(indirizzo, 'https://api.deepseek.test/chat/completions');
  assert.equal(corpo.usage.prompt_tokens_details.cached_tokens, 16_768, 'il lettore canonico deve trovare il numero');
  assert.equal(corpo.usage.prompt_cache_hit_tokens, 16_768, 'e il campo nativo non deve sparire');
  assert.equal(corpo.choices[0].message.content, 'ok', 'il resto della risposta non si tocca');
});

test('CACHE-08 (verso contrario) — un flusso SSE e una risposta d’errore passano INTATTI', async () => {
  /*
   * ⛔ È il limite dichiarato di P-B, e va provato come si prova una funzione: riscrivere un
   *   `text/event-stream` che non abbiamo prodotto costerebbe più del difetto che curerebbe (il
   *   kernel, sul giro in streaming, legge già tre nomi da sé). ⇒ Qui si pretende che la risposta
   *   esca **la stessa**, non una copia rimontata — un flusso ricostruito male è peggio di un
   *   campo mancante.
   */
  const sse = new Response('data: {"choices":[{"delta":{"content":"ciao"}}]}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const errore = new Response('{"error":"nope"}', { status: 429, headers: { 'content-type': 'application/json' } });
  const dipendenze = { leggiChiave: () => 'k', leggiRuntime: () => ({ endpoint: 'https://api.deepseek.test' }) };

  for (const attesa of [sse, errore]) {
    /* 17/09: il guardiano dell'inattività (P0 · punto 7) rimonta la Response per costruzione (pipeThrough);
       qui si prova il contratto della CACHE, quindi il guardiano è l'identità — il vero si prova in P0-D-20. */
    const fetchMulti = creaFetchMultiProvider(async () => attesa, { dipendenze, sorvegliaCorpo: r => r });
    const risposta = await fetchMulti('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'deepseek:deepseek-flash', messages: [], stream: true }),
    });
    assert.equal(risposta, attesa, 'la risposta deve essere LA STESSA, non una ricostruita');
  }
});

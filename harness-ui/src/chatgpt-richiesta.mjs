/**
 * «Continue with ChatGPT» — le richieste conformi alle regole del piano.
 *
 * Il piano passa dallo stesso `POST /v1/responses` di OpenAI, ma accetta MENO cose di una chiave API
 * (developers.openai.com/siwc/token-sharing-open-source/preview-limitations, riletta l'11/10/2026):
 *   · «Set `store: false` and `stream: true`» su ogni richiesta;
 *   · campi da omettere: `background, conversation, max_output_tokens, max_tool_calls, metadata, moderation, multi_agent, prompt,
 *     prompt_cache_retention, safety_identifier, temperature, top_logprobs, top_p, truncation, user`; niente `previous_response_id`;
 *   · «Explicit system message items are rejected»: il contesto va in `instructions` o in messaggi `developer`.
 *
 * Misurato l'11/10/2026 su che cosa manda l'SDK `ai` per questo fornitore (`scratchpad/chatgpt/cattura-corpo.mjs`): il sistema
 * esce già come `developer` e `store` è già `false`; restano da togliere `max_output_tokens` (l'adattatore lo mette sempre) e da
 * accendere `stream` quando chi chiama non lo voleva. ⇒ La cura sta sul FILO, in un solo posto, invece che in ogni chiamante:
 * una `fetch` che sistema il corpo prima dell'invio e, se chi chiama voleva una risposta intera, legge il flusso fino a
 * `response.completed` e gliela restituisce com'è fatta una risposta non in flusso (l'oggetto `response` dell'evento finale).
 *
 * «Treat inference as successful only after receiving `response.completed`» (`models-and-inference`): un flusso che finisce
 * senza quell'evento è un errore, mai una risposta corta.
 */

import { createHash } from 'node:crypto';

import { leggiAttesaRichiestaDalFornitore } from './provider-retry.mjs';

/*
 * Il limite d'uso del piano, come Claude Code (letto nel suo eseguibile 2.1.296 l'11/10/2026): «Usage limit reached · continuing
 *   automatically {when} · esc to cancel»; il giro aspetta e riparte da solo, «Automatic continue stopped · the usage limit now resets
 *   more than 24 hours out» oltre un giorno, e si ferma dopo troppi tentativi di fila. Il servizio di OpenAI non dichiara l'ora del
 *   reset su questa strada (prova dal vivo dell'11/10, PIANO §10): se un giorno la manda in `retry-after`, vale quella; sennò ogni
 *   30 minuti (decisione owner 11/10). I tentativi sono quelli del kernel (`TALOS_MAX_RETRIES`, 10 di serie): 5 ore a 30 minuti,
 *   la finestra del piano Plus. La persona smette quando vuole con «Ferma», che cancella l'attesa subito.
 */
export const ATTESA_LIMITE_DEL_PIANO_MS = 30 * 60 * 1000;
export const ATTESA_LIMITE_DEL_PIANO_MASSIMA_MS = 24 * 60 * 60 * 1000;
/** Quanto aspettare prima di riprovare, o `null` se l'attesa dichiarata supera le 24 ore (allora il giro si ferma). */
export function attesaDelLimiteDelPiano(intestazioni) {
  let dichiarata = null;
  try { dichiarata = intestazioni ? leggiAttesaRichiestaDalFornitore(intestazioni instanceof Headers ? intestazioni : new Headers(intestazioni)) : null; } catch { dichiarata = null; }
  if (dichiarata === null) return ATTESA_LIMITE_DEL_PIANO_MS;
  return dichiarata > ATTESA_LIMITE_DEL_PIANO_MASSIMA_MS ? null : Math.max(dichiarata, 1000);
}

export const CAMPI_VIETATI_DAL_PIANO = Object.freeze(['background', 'conversation', 'max_output_tokens', 'max_tool_calls', 'metadata', 'moderation',
  'multi_agent', 'prompt', 'prompt_cache_retention', 'safety_identifier', 'temperature', 'top_logprobs', 'top_p', 'truncation', 'user', 'previous_response_id']);

/*
 * LA CHIAVE DELLA CACHE DEL PROMPT (11/10/2026). Dal vivo il secondo giro di una chat sul piano tornava con `cached_tokens: 0`: ogni
 *   giro ripagava l'intero prefisso dal limite d'uso della persona. OpenAI sceglie la macchina della cache per `prompt_cache_key`
 *   («requests are routed to a machine based on prompt_cache_key»; guida «Prompt caching», developers.openai.com/api/docs/guides/
 *   prompt-caching, letta l'11/10/2026); il piano la ammette (fra i campi vietati c'è solo `prompt_cache_retention`).
 *   Concorrenti letti nel codice: Pi la manda anche col piano (`pi-openai-responses.ts:334`, tetto di 64 caratteri in
 *   `openai-prompt-cache.ts:1`); OpenCode manda le intestazioni di sessione di Codex (`chatgpt.ts:276-279`).
 * ⇒ Qui la chiave è l'IMPRONTA del prefisso stabile della conversazione — modello, istruzioni, attrezzi, e i messaggi fino al primo
 *   della persona compreso — così ogni giro della stessa chat la ritrova senza che il trasporto debba conoscere la sessione (il
 *   motore apre ogni giro con un id nuovo). Una chiave messa da chi chiama resta sua.
 */
export const LUNGHEZZA_MASSIMA_CHIAVE_CACHE = 64;
export function chiaveDellaCacheDelPiano(corpo) {
  const input = Array.isArray(corpo?.input) ? corpo.input.map((voce) => (voce && voce.role === 'system' ? { ...voce, role: 'developer' } : voce)) : [];
  const primoDellaPersona = input.findIndex((voce) => voce?.role === 'user');
  const prefisso = primoDellaPersona >= 0 ? input.slice(0, primoDellaPersona + 1) : input.slice(0, 1);
  const impronta = createHash('sha256').update(JSON.stringify([corpo?.model ?? null, corpo?.instructions ?? null, corpo?.tools ?? null, prefisso])).digest('hex');
  return `talos-${impronta}`.slice(0, LUNGHEZZA_MASSIMA_CHIAVE_CACHE);
}

/** Il corpo come il piano lo accetta. Torna `{ corpo, volevaIlFlusso, tolti }`; non tocca l'oggetto ricevuto. */
export function adattaCorpoAlPiano(corpo) {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw Object.assign(new Error('The request for the ChatGPT plan has no body.'), { code: 'CHATGPT_RICHIESTA_INCOMPLETA' });
  const nuovo = { ...corpo };
  const tolti = CAMPI_VIETATI_DAL_PIANO.filter((campo) => Object.hasOwn(nuovo, campo));
  for (const campo of tolti) delete nuovo[campo];
  // un messaggio `system` esplicito viene rifiutato: è lo stesso contenuto, detto come `developer`
  if (Array.isArray(nuovo.input)) nuovo.input = nuovo.input.map((voce) => (voce && voce.role === 'system' ? { ...voce, role: 'developer' } : voce));
  const volevaIlFlusso = corpo.stream === true;
  nuovo.store = false;
  nuovo.stream = true;
  if (typeof nuovo.prompt_cache_key !== 'string' || nuovo.prompt_cache_key === '') nuovo.prompt_cache_key = chiaveDellaCacheDelPiano(nuovo);
  return { corpo: nuovo, volevaIlFlusso, tolti };
}

/**
 * Legge un flusso SSE di Responses fino in fondo e torna l'ultimo evento terminale: `{ tipo, risposta }` o `null`.
 * ⛔ 11/10/2026, dal vivo col piano: l'evento `response.completed` può portare `output` VUOTO, e gli elementi della risposta
 *   stanno negli eventi `response.output_item.done` («Migliora prompt» riceveva una risposta senza testo). Come Codex
 *   (`codex-api/src/sse/responses.rs:358` e `:498`) si raccolgono lungo il flusso, nell'ordine di `output_index`; se l'evento
 *   finale ne porta di suoi valgono i suoi, così niente si raddoppia.
 */
export async function eventoFinaleDelFlusso(testoOStream) {
  const testo = typeof testoOStream === 'string' ? testoOStream : await new Response(testoOStream).text();
  let finale = null;
  const elementi = [];
  for (const blocco of testo.split(/\r?\n\r?\n/u)) {
    const dati = blocco.split(/\r?\n/u).filter((riga) => riga.startsWith('data:')).map((riga) => riga.slice(5).trimStart()).join('\n');
    if (!dati || dati === '[DONE]') continue;
    let evento;
    try { evento = JSON.parse(dati); } catch { continue; }
    if (evento?.type === 'response.output_item.done' && evento.item && typeof evento.item === 'object') elementi.push({ indice: Number.isInteger(evento.output_index) ? evento.output_index : elementi.length, item: evento.item });
    else if (['response.completed', 'response.failed', 'response.incomplete'].includes(evento?.type)) finale = { tipo: evento.type, risposta: evento.response ?? null };
    else if (evento?.type === 'error') finale = { tipo: 'error', risposta: { error: evento.error ?? { code: evento.code ?? null, message: evento.message ?? null } } };
  }
  if (finale?.tipo === 'response.completed' && finale.risposta && !(Array.isArray(finale.risposta.output) && finale.risposta.output.length > 0) && elementi.length > 0) {
    finale = { ...finale, risposta: { ...finale.risposta, output: elementi.sort((a, b) => a.indice - b.indice).map((e) => e.item) } };
  }
  return finale;
}

const STATO_PER_CODICE = Object.freeze({ subscription_sharing_usage_limit_exceeded: 429, subscription_sharing_usage_unavailable: 503, subscription_sharing_user_unavailable: 503,
  subscription_sharing_user_not_eligible: 403, subscription_sharing_route_not_supported: 403, subscription_sharing_unsupported_capability: 400,
  subscription_sharing_invalid_user: 401 });

/**
 * La `fetch` per il fornitore del piano. Solo le richieste a `/responses` con un corpo JSON vengono sistemate; il resto passa
 * com'è (l'elenco dei modelli è una GET). Gli errori HTTP del servizio tornano intatti: stato, corpo e request id servono a chi
 * li spiega alla persona.
 */
export function creaFetchDelPiano(fetchDiRete = globalThis.fetch) {
  return async function fetchDelPiano(indirizzo, opzioni = {}) {
    const url = String(typeof indirizzo === 'string' || indirizzo instanceof URL ? indirizzo : indirizzo?.url ?? '');
    const metodo = String(opzioni.method ?? 'GET').toUpperCase();
    if (metodo !== 'POST' || !/\/responses(?:\?|$)/u.test(url) || typeof opzioni.body !== 'string') return fetchDiRete(indirizzo, opzioni);
    let originale;
    try { originale = JSON.parse(opzioni.body); } catch { return fetchDiRete(indirizzo, opzioni); }
    const { corpo, volevaIlFlusso } = adattaCorpoAlPiano(originale);
    const risposta = await fetchDiRete(indirizzo, { ...opzioni, body: JSON.stringify(corpo) });
    if (volevaIlFlusso || !risposta.ok) return risposta;
    const intestazioni = new Headers(risposta.headers);
    intestazioni.set('content-type', 'application/json');
    intestazioni.delete('content-length'); intestazioni.delete('content-encoding');
    const finale = await eventoFinaleDelFlusso(risposta.body);
    if (finale?.tipo === 'response.completed' && finale.risposta) return new Response(JSON.stringify(finale.risposta), { status: 200, headers: intestazioni });
    // un flusso che non arriva a `response.completed` non è una risposta: si restituisce l'errore del servizio, col suo codice
    const errore = finale?.risposta?.error ?? (finale?.tipo === 'response.incomplete'
      ? { code: 'response_incomplete', message: `The response stopped before completing (${finale.risposta?.incomplete_details?.reason ?? 'unknown reason'}).` }
      : { code: 'stream_interrupted', message: 'The response stream ended before completing.' });
    return new Response(JSON.stringify({ error: errore }), { status: STATO_PER_CODICE[errore?.code] ?? 502, headers: intestazioni });
  };
}

/** I codici di TALOS per gli errori del piano, da `errors-and-recovery` (riletta l'11/10/2026). `transitorio` = ha senso riprovare. */
export const ERRORI_DEL_PIANO = Object.freeze({
  subscription_sharing_usage_limit_exceeded: { code: 'CHATGPT_LIMITE_DEL_PIANO', transitorio: false, messaggio: 'The ChatGPT plan usage limit was reached. Check ChatGPT Settings → Usage.' },
  subscription_sharing_user_not_eligible: { code: 'CHATGPT_PIANO_NON_AMMESSO', transitorio: false, messaggio: 'Using the ChatGPT plan is not available for this account, workspace or policy.' },
  subscription_sharing_unsupported_capability: { code: 'CHATGPT_RICHIESTA_NON_AMMESSA', transitorio: false, messaggio: 'This request uses something the ChatGPT plan does not support.' },
  subscription_sharing_route_not_supported: { code: 'CHATGPT_RICHIESTA_NON_AMMESSA', transitorio: false, messaggio: 'The ChatGPT plan does not support this route.' },
  subscription_sharing_invalid_user: { code: 'CHATGPT_ACCESSO_NON_VALIDO', transitorio: false, messaggio: 'The ChatGPT connection was not accepted.' },
  chatpass_v2_scope_not_authorized: { code: 'CHATGPT_PIANO_NON_ABILITATO', transitorio: false, messaggio: 'Using the ChatGPT plan is not enabled for this sign-in.' },
  chatpass_v2_invalid_authorization_context: { code: 'CHATGPT_PIANO_NON_ABILITATO', transitorio: false, messaggio: 'Using the ChatGPT plan is not enabled for this sign-in.' },
  subscription_sharing_usage_unavailable: { code: 'CHATGPT_SERVIZIO_NON_DISPONIBILE', transitorio: true, messaggio: 'ChatGPT plan usage cannot be checked right now. Try again later.' },
  subscription_sharing_user_unavailable: { code: 'CHATGPT_SERVIZIO_NON_DISPONIBILE', transitorio: true, messaggio: 'ChatGPT plan usage is temporarily unavailable. Try again later.' },
});

/**
 * Riconduce un guasto della strada del piano a un errore con un codice di TALOS. Tiene stato HTTP, codice del servizio,
 * `error.param` e request id («preserve the HTTP status, body shape, error code if present, and request ID»).
 * Un errore che ha già un codice `CHATGPT_…` (accesso scaduto, piano non abilitato…) passa com'è.
 * ⛔ Il corpo grezzo del servizio non entra nel messaggio: solo la frase del codice.
 */
export function erroreDelPiano(guasto) {
  if (typeof guasto?.code === 'string' && guasto.code.startsWith('CHATGPT_')) return guasto;
  if (guasto?.name === 'AbortError' || guasto?.name === 'TimeoutError') return guasto;
  const stato = Number.isInteger(guasto?.statusCode) ? guasto.statusCode : Number.isInteger(guasto?.status) ? guasto.status : Number.isInteger(guasto?.stato) ? guasto.stato : null;
  let corpo = guasto?.data ?? null;
  if (!corpo && typeof guasto?.responseBody === 'string') { try { corpo = JSON.parse(guasto.responseBody); } catch { corpo = null; } }
  const codiceOpenAi = typeof corpo?.error?.code === 'string' ? corpo.error.code : null;
  // su questa strada un 429 è il limite d'uso del piano (errors-and-recovery: l'unico codice 429 del piano)
  const noto = ERRORI_DEL_PIANO[codiceOpenAi] ?? (stato === 429 ? ERRORI_DEL_PIANO.subscription_sharing_usage_limit_exceeded : stato === 401 ? ERRORI_DEL_PIANO.subscription_sharing_invalid_user
    : stato === 403 ? ERRORI_DEL_PIANO.subscription_sharing_user_not_eligible
    : stato === 503 ? ERRORI_DEL_PIANO.subscription_sharing_usage_unavailable : null);
  const intestazioni = guasto?.responseHeaders ?? null;
  const idRichiesta = intestazioni ? (intestazioni['x-oai-request-id'] ?? intestazioni['x-request-id'] ?? null) : null;
  return Object.assign(new Error(noto?.messaggio ?? 'The request to the ChatGPT plan did not complete.'), {
    code: noto?.code ?? 'CHATGPT_ERRORE', transitorio: noto ? noto.transitorio : (stato === null || stato >= 500),
    stato, codiceOpenAi, parametro: typeof corpo?.error?.param === 'string' ? corpo.error.param : null, idRichiesta, fornitore: 'chatgpt',
    ...(intestazioni ? { intestazioni } : {}),
  });
}

/**
 * Una risposta in flusso NON dice subito se il servizio ha rifiutato: l'SDK trasforma il 429 in un errore DENTRO il flusso
 * (`native-provider-adapter.mjs`, ramo `streamText`), e il giro lo scopre leggendo, quando ormai non può più ritentare.
 * Qui si legge il PRIMO pezzo prima di consegnare la risposta: se il flusso parte, la risposta torna intera (primo pezzo
 * compreso); se fallisce, l'errore esce da qui e chi chiama lo tratta come un rifiuto (`erroreDelPiano`). Costa solo l'attesa
 * del primo pezzo, che il giro aspetterebbe comunque. Misurato l'11/10/2026: senza, il limite d'uso fermava il giro al primo
 * tentativo (INSTRADA-07).
 */
export async function conPrimoPezzo(risposta) {
  /* 12/10/2026 — da F-H-002 (r4 `1841f81ce`) l'adattatore nativo non mette più un errore HTTP del servizio DENTRO il flusso: risponde
     direttamente con quello stato, le sue intestazioni e il suo corpo. Per la strada del piano è lo stesso rifiuto di prima: si lancia
     con i campi che `erroreDelPiano` legge (come un `APICallError`), così il limite d'uso resta «limite-del-piano» e si aspetta. */
  if (risposta && !risposta.ok) {
    let corpo = '';
    try { corpo = await risposta.text(); } catch { /* resta lo stato */ }
    throw Object.assign(new Error(`The ChatGPT plan answered HTTP ${risposta.status}.`), {
      statusCode: risposta.status, responseBody: corpo, responseHeaders: Object.fromEntries(risposta.headers),
    });
  }
  if (!risposta?.body) return risposta;
  const lettore = risposta.body.getReader();
  const primo = await lettore.read(); // lancia se il flusso fallisce subito
  const flusso = new ReadableStream({
    start(controller) { if (!primo.done) controller.enqueue(primo.value); else controller.close(); },
    async pull(controller) {
      if (primo.done) return;
      try { const { value, done } = await lettore.read(); if (done) controller.close(); else controller.enqueue(value); }
      catch (errore) { controller.error(errore); }
    },
    cancel(motivo) { return lettore.cancel(motivo); },
  });
  return new Response(flusso, { status: risposta.status, statusText: risposta.statusText, headers: risposta.headers });
}

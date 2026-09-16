/**
 * Adapter verso il runtime proprietario configurato dall'operatore.
 *
 * Il desktop non importa più moduli da checkout fratelli a tempo di build o
 * di avvio. Se serve il runtime completo, il server deve indicare un modulo
 * assoluto con `TALOS_OWNER_RUNTIME_MODULE`; il caricamento resta ritardato e
 * fallisce in modo esplicito quando la dipendenza non è disponibile. Le
 * funzioni pure minime per la compattazione restano qui, per mantenere il
 * comportamento già coperto dai test senza nascondere una dipendenza.
 */
import { pathToFileURL, fileURLToPath } from 'node:url';
import { isAbsolute } from 'node:path';
import { statSync } from 'node:fs';
import { createParser } from 'eventsource-parser';
import { eseguiFlowForgeLocale, FORGE_PREFISSO_NOME_TOOL, validaManifestForgeLocale } from './forge-contract.mjs';
import { parseRuntimeOwnerSnapshot } from './runtime-owner-contract.mjs';
import { risolviDestinazioneModello, separaFonteModello, FONTI_MODELLO, validaFallbackProviders } from './model-destination.mjs';
import { REGISTRO_FORNITORI } from './provider-registry.mjs';
import { classificaErroreDiCorsa } from './research-orchestrator.mjs';
import { normalizzaUsage, scontoDaCache } from './usage-cache.mjs'; // 12/09, P-B: i nomi della cache sono uno per fornitore, il lettore uno solo
import { nativeProviderResponse, stripNativeMetadata } from './native-provider-adapter.mjs';
import { preparaRichiestaCompatibile, OpenAiCompatibleRuntimeError } from './openai-compatible-runtime.mjs'; // P-D (12/09): Z.AI accetta solo alcuni livelli di ragionamento
// P-L · ponte locale senza listener, sessione esterna posseduta dalla Response.
import { rispostaAgenteAcp } from './acp-agent.mjs';
// P-L · fine import instradamento.
// BC-48 A · sezioni di progetto nel canale degli originali, prima della richiesta.
import { trovaIstruzioniDiProgetto, trovaRadiceProgetto } from './istruzioni-di-progetto.mjs';
import { collegaSezioniAiContextHooks } from './context-provider-adapter.mjs';
// P0 · punto 7 (16/09): il failsafe di inattività e il dispatcher stanno in una porta sola.
import {
  SilenzioDelFornitoreError,
  dispatcherDiGenerazione,
  leggiInattivitaGenerazioneMs,
  sorvegliaCorpoDiGenerazione,
  sorvegliaInattivita,
} from './generation-idle.mjs';

const ENDPOINT_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';
const RICHIESTA_DI_RIASSUNTO = 'Riassumi la conversazione mantenendo decisioni, file e risultati utili al lavoro.';
const GIRI_PRIMA_DI_COMPATTARE = 12;
const OPENROUTER_IDLE_MS_PREDEFINITO = 60_000;
const SSE_BUFFER_MASSIMO = 1_048_576;
const SCHEMA_DESCRIZIONE_COMANDO = Object.freeze({
  type: 'string',
  description: 'Breve descrizione in italiano, al presente e comprensibile all’utente, dell’obiettivo di questo comando. Non copiare il comando tecnico.',
  minLength: 3,
  maxLength: 120,
});

export class OwnerRuntimeUnavailableError extends Error {
  constructor(message, code = 'OWNER_RUNTIME_NOT_CONFIGURED', options = {}) {
    super(message);
    this.name = 'OwnerRuntimeUnavailableError';
    this.code = code;
    if (options.cause) this.cause = options.cause;
  }
}

class OpenRouterIdleTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`OpenRouter non ha inviato attività per ${Math.max(1, Math.round(timeoutMs / 1_000))} secondi.`);
    this.name = 'OpenRouterIdleTimeoutError';
    this.code = 'OPENROUTER_IDLE_TIMEOUT';
  }
}

class OpenRouterStreamError extends Error {
  constructor(error) {
    const message = typeof error?.message === 'string' && error.message.trim()
      ? error.message.trim()
      : 'OpenRouter ha interrotto la risposta in corso.';
    super(message);
    this.name = 'OpenRouterStreamError';
    this.code = error?.code ?? error?.metadata?.error_type ?? 'OPENROUTER_STREAM_ERROR';
    this.providerError = error ?? null;
  }
}

function rispostaRitentabile(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function attesaEsponenziale(tentativo) {
  return Math.min(2_000, 200 * (2 ** tentativo));
}

/**
 * Chiamata testuale OpenRouter usata solo dal riassuntore locale. Il runtime
 * principale, quando configurato, resta la fonte autoritativa per il ciclo
 * agente e per i tool.
 */
export async function chiamaConRitentaLocale({
  modello, chiave, messaggi, attrezzi, tentativiMassimi = 4,
  fetchDiRete = fetch, dormi = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  let ultimoStato = null;
  let ultimoTesto = '';
  for (let tentativo = 0; tentativo < tentativiMassimi; tentativo += 1) {
    const risposta = await fetchDiRete(ENDPOINT_OPENROUTER, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modello, messages: messaggi, tools: attrezzi, tool_choice: 'auto' }),
      /*
       * ⛔ P0 · punto 7 (16/09/2026) — anche il riassuntore locale aveva i suoi 180 s scritti a mano.
       * Un riassunto è una chiamata al MODELLO come le altre: se il contesto da comprimere è enorme,
       * il prefill può tacere per minuti (ggml-org/llama.cpp#22997). Il numero non si alza: si usa
       * lo STESSO failsafe di tutto il resto, così esiste UNA soglia da conoscere invece di quattro.
       */
      signal: AbortSignal.timeout(leggiInattivitaGenerazioneMs() || 1_800_000),
    });
    if (risposta.ok) {
      const corpo = await risposta.json();
      const scelta = corpo?.choices?.[0]?.message;
      if (!scelta) throw new Error('Il fornitore non ha restituito una risposta utilizzabile.');
      return { scelta, usage: corpo?.usage ?? null, tentativi: tentativo + 1 };
    }
    ultimoStato = risposta.status;
    ultimoTesto = typeof risposta.text === 'function' ? String(await risposta.text()).slice(0, 300) : '';
    if (!rispostaRitentabile(risposta.status)) break;
    if (tentativo < tentativiMassimi - 1) await dormi(attesaEsponenziale(tentativo));
  }
  const errore = new Error(`Il fornitore non risponde (stato ${ultimoStato ?? 'sconosciuto'}). ${ultimoTesto}`.trim());
  errore.stato = ultimoStato;
  errore.limitatoDalFornitore = rispostaRitentabile(ultimoStato);
  throw errore;
}

export async function compattaConversazioneLocale(messaggi, chiamaModello) {
  let risposta;
  let usage = null;
  try {
    ({ scelta: risposta, usage } = await chiamaModello([...messaggi, { role: 'user', content: RICHIESTA_DI_RIASSUNTO }]));
  } catch {
    return { messaggi, compattato: false, usage: null };
  }
  const riassunto = String(risposta?.content ?? '').trim();
  if (!riassunto) return { messaggi, compattato: false, usage };
  return {
    messaggi: [
      messaggi[0],
      messaggi[1],
      { role: 'user', content: `[conversazione compattata al giro ${GIRI_PRIMA_DI_COMPATTARE}: quanto segue è un riassunto, non la cronologia originale]\n\n${riassunto}` },
    ],
    compattato: true,
    usage,
  };
}

function normalizzaModuloPath(modulePath) {
  if (modulePath === null || modulePath === undefined || modulePath === '') return null;
  if (typeof modulePath !== 'string' || !isAbsolute(modulePath) || modulePath.includes('\0')) {
    throw new OwnerRuntimeUnavailableError('Il modulo runtime deve essere un percorso assoluto.', 'OWNER_RUNTIME_PATH_INVALID');
  }
  return pathToFileURL(modulePath).href;
}

/**
 * Il runtime owner resta read-only e provider-neutral. Sul confine desktop
 * arricchiamo soltanto il tool AVM `shell`: un comando arbitrario non ha un
 * titolo umano ricavabile senza inventarne l'intento, quindi lo deve fornire
 * il modello nello stesso JSON della tool-call. Gli schemi MCP/plugin/Forge
 * non vengono mai toccati: possono essere strict e rifiutare campi estranei.
 *
 * @param {unknown} body
 * @returns {unknown}
 */
export function adattaRichiestaConDescrizioneComando(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.tools)) return body;
  let modificata = false;
  const tools = body.tools.map((tool) => {
    const funzione = tool?.type === 'function' ? tool.function : null;
    const parametri = funzione?.name === 'shell' ? funzione.parameters : null;
    if (!parametri || typeof parametri !== 'object' || parametri.type !== 'object') return tool;
    const proprieta = parametri.properties && typeof parametri.properties === 'object' ? parametri.properties : {};
    const richiesti = Array.isArray(parametri.required) ? parametri.required : [];
    const descrizione = proprieta.descrizione ?? SCHEMA_DESCRIZIONE_COMANDO;
    const required = richiesti.includes('descrizione') ? richiesti : [...richiesti, 'descrizione'];
    if (proprieta.descrizione === descrizione && required === richiesti) return tool;
    modificata = true;
    return {
      ...tool,
      function: {
        ...funzione,
        parameters: {
          ...parametri,
          properties: { ...proprieta, descrizione },
          required,
        },
      },
    };
  });
  return modificata ? { ...body, tools } : body;
}

/**
 * Adatta il body JSON senza cambiare trasporto, credenziali, signal o forma
 * della Response. Un body non JSON/non-tool attraversa il confine invariato.
 *
 * @param {typeof fetch} fetchDiRete
 * @returns {typeof fetch}
 */
export function creaFetchConDescrizioneComando(fetchDiRete = fetch) {
  if (typeof fetchDiRete !== 'function') throw new TypeError('fetchDiRete deve essere una funzione.');
  return async (url, init = undefined) => {
    if (typeof init?.body !== 'string') return fetchDiRete(url, init);
    let body;
    try { body = JSON.parse(init.body); } catch { return fetchDiRete(url, init); }
    const adattato = adattaRichiestaConDescrizioneComando(body);
    if (adattato === body) return fetchDiRete(url, init);
    return fetchDiRete(url, { ...init, body: JSON.stringify(adattato) });
  };
}

/**
 * ⛔⛔ P0 · punto 7 (16/09/2026) — I 300 SECONDI CHE NESSUNO AVEVA DICHIARATO.
 *
 * Sotto `fetch` c'è undici, con `headersTimeout` e `bodyTimeout` a **300 s di serie**: togliere i
 * tetti dal nostro codice senza toccare questo lascerebbe il muro dov'era, solo più difficile da
 * vedere (è la firma di openai/codex#23807: stalli di ESATTAMENTE 300 s). Misurato con `grep`:
 * `setGlobalDispatcher` non compare in nessun file del repository.
 *
 * ⛔ Si aggiunge SOLO sulle chiamate ai fornitori, mai globalmente: ricerca web, hub dei modelli,
 *   proxy delle immagini e MCP devono restare impazienti. E il dispatcher globale avrebbe voluto
 *   il pacchetto npm `undici`, che NON è una dipendenza dichiarata di harness-ui.
 * ⭐ Un oggetto vuoto quando non si può costruire: la chiamata parte identica a prima, e il
 *   `README` dice cosa resta in quel caso. Nessun silenzio.
 */
function dispatcherDiRichiesta(inattivitaMs) {
  const dispatcher = dispatcherDiGenerazione({ limiteMs: inattivitaMs });
  return dispatcher ? { dispatcher } : {};
}

function urlOpenRouterChat(url) {
  try {
    const parsed = new URL(typeof url === 'string' || url instanceof URL ? url : url?.url);
    return parsed.hostname === 'openrouter.ai' && parsed.pathname.endsWith('/chat/completions');
  } catch {
    return false;
  }
}

function capabilityReasoning(capability) {
  const reasoning = capability?.reasoning;
  return reasoning && typeof reasoning === 'object' ? reasoning : null;
}

/**
 * Applica esclusivamente capacità dichiarate dal catalogo OpenRouter. Non
 * inventa effort: se un modello mandatory non espone un valore utilizzabile,
 * rimuove `none` e abilita il ragionamento lasciando la scelta al provider.
 */
export function normalizzaReasoningPerModello(reasoning, capability) {
  const regole = capabilityReasoning(capability);
  if (!regole) return reasoning;
  const supported = Array.isArray(regole.supportedEfforts)
    ? regole.supportedEfforts.filter((value) => typeof value === 'string' && value !== 'none')
    : null;
  const defaultEffort = typeof regole.defaultEffort === 'string' && regole.defaultEffort !== 'none'
    && (!supported || supported.includes(regole.defaultEffort))
    ? regole.defaultEffort
    : supported?.[0] ?? null;
  if (reasoning == null) {
    if (regole.mandatory !== true) return reasoning;
    return defaultEffort ? { effort: defaultEffort } : { enabled: true };
  }
  if (typeof reasoning !== 'object' || Array.isArray(reasoning)) return reasoning;
  const result = { ...reasoning };
  const effort = typeof result.effort === 'string' ? result.effort : null;
  const nonSupportato = effort && effort !== 'none' && supported && !supported.includes(effort);
  if ((regole.mandatory === true && effort === 'none') || nonSupportato) {
    if (defaultEffort) result.effort = defaultEffort;
    else delete result.effort;
  }
  if (regole.mandatory === true && !('effort' in result) && !('enabled' in result)) result.enabled = true;
  return result;
}

function statusPerErroreStream(error) {
  const numeric = Number(error?.code);
  if (Number.isInteger(numeric) && numeric >= 400 && numeric <= 599) return numeric;
  const tipo = String(error?.metadata?.error_type ?? error?.code ?? '').toLowerCase();
  if (tipo.includes('timeout')) return 408;
  if (tipo.includes('rate_limit')) return 429;
  if (tipo.includes('overloaded') || tipo.includes('unavailable') || tipo.includes('server')) return 503;
  if (tipo.includes('authentication')) return 401;
  return 502;
}

function rispostaErrore(status, error) {
  const message = typeof error?.message === 'string' && error.message.trim()
    ? error.message.trim()
    : 'Il fornitore non ha completato la risposta.';
  return new Response(JSON.stringify({ error: { code: status, message } }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * ⛔ P0 · punto 7 (16/09/2026) — UNA SOLA IMPLEMENTAZIONE DEL GUARDIANO.
 *
 * Il corpo di questa funzione è diventato `sorvegliaInattivita` in `generation-idle.mjs`: era già
 * il guardiano GIUSTO (inattività, non durata), ma esisteva solo per OpenRouter, e nessun altro
 * fornitore — né il motore locale — poteva usarlo. Qui resta la firma che il trasporto OpenRouter
 * usa già, con l'errore che QUESTO strato deve produrre (`OpenRouterIdleTimeoutError` → 408).
 * ⛔ Due guardiani con due corpi diversi divergono al primo tocco: uno solo, e iniettabile.
 */
function promessaConInattivita(promise, { timeoutMs, controller, userSignal, creaErrore }) {
  return sorvegliaInattivita(promise, {
    limiteMs: timeoutMs,
    controller,
    userSignal,
    creaErrore: creaErrore ?? ((ms) => new OpenRouterIdleTimeoutError(ms)),
  });
}

function eventoConOutput(packet) {
  const delta = packet?.choices?.[0]?.delta;
  if (!delta || typeof delta !== 'object') return false;
  return Boolean(delta.content || delta.reasoning || delta.reasoning_content || (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0));
}

/*
 * ⛔ P0 · punto 7 (16/09/2026): qui il limite NON è più `timeoutMs` (il tempo del fornitore) ma
 * `inattivitaMs`, il failsafe di generazione. Dopo gli header il tempo del fornitore ha finito il
 * suo mestiere; da lì in poi conta solo da quanto tempo il canale TACE. Il conteggio si azzera a
 * ogni `reader.read()` che porta byte — commenti SSE compresi, che infatti il parser riemette.
 */
async function preparaRispostaSse(response, { inattivitaMs, controller, userSignal }) {
  if (!response.body || typeof response.body.getReader !== 'function') return response;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const pending = [];
  let outputVisibile = false;
  let earlyError = null;
  let streamController = null;
  let streamError = null;
  let done = false;

  const emetti = (text) => {
    const bytes = encoder.encode(text);
    if (streamController) streamController.enqueue(bytes);
    else pending.push(bytes);
  };
  const parser = createParser({
    maxBufferSize: SSE_BUFFER_MASSIMO,
    onComment(comment) {
      emetti(`:${comment}\n\n`);
    },
    onEvent(event) {
      if (event.data === '[DONE]') {
        emetti('data: [DONE]\n\n');
        return;
      }
      let packet;
      try { packet = JSON.parse(event.data); } catch {
        emetti(`data: ${event.data}\n\n`);
        return;
      }
      if (packet?.error) {
        if (!outputVisibile) earlyError = packet.error;
        else streamError = new OpenRouterStreamError(packet.error);
        return;
      }
      if (eventoConOutput(packet)) outputVisibile = true;
      emetti(`data: ${event.data}\n\n`);
    },
    onError(error) {
      streamError = error;
    },
  });

  const leggi = async () => {
    const result = await promessaConInattivita(reader.read(), {
      timeoutMs: inattivitaMs, controller, userSignal,
      creaErrore: (ms) => new SilenzioDelFornitoreError(ms),
    });
    if (result.done) {
      done = true;
      parser.reset({ consume: true });
      return;
    }
    parser.feed(decoder.decode(result.value, { stream: true }));
  };

  try {
    while (!outputVisibile && !earlyError && !streamError && !done) await leggi();
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    if (userSignal?.aborted) throw userSignal.reason ?? error;
    /* ⛔ Il silenzio NON si traveste da risposta HTTP: deve arrivare a `classificaGuasto` col suo
       codice, o diventerebbe un «502» generico e perderebbe la classe `rete` che lo rende ripreso. */
    if (error instanceof SilenzioDelFornitoreError) throw error;
    if (error instanceof OpenRouterIdleTimeoutError) return rispostaErrore(408, { message: 'OpenRouter è rimasto inattivo oltre il limite configurato.' });
    return rispostaErrore(502, { message: error instanceof Error ? error.message : String(error) });
  }

  if (earlyError) {
    await reader.cancel(new OpenRouterStreamError(earlyError)).catch(() => {});
    return rispostaErrore(statusPerErroreStream(earlyError), earlyError);
  }
  if (streamError && !outputVisibile) {
    await reader.cancel(streamError).catch(() => {});
    return rispostaErrore(502, { message: streamError.message });
  }

  const body = new ReadableStream({
    start(controllerOut) {
      streamController = controllerOut;
      for (const bytes of pending.splice(0)) controllerOut.enqueue(bytes);
      if (streamError) {
        controllerOut.error(streamError);
        return;
      }
      if (done) {
        controllerOut.close();
        return;
      }
      void (async () => {
        try {
          while (!done) {
            await leggi();
            if (streamError) throw streamError;
          }
          controllerOut.close();
        } catch (error) {
          await reader.cancel(error).catch(() => {});
          controllerOut.error(userSignal?.aborted ? (userSignal.reason ?? error) : error);
        }
      })();
    },
    cancel(reason) {
      controller.abort(reason);
      return reader.cancel(reason);
    },
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

/**
 * Trasporto OpenRouter desktop: sostituisce il timeout totale hard-coded del
 * runtime owner con un limite di inattività osservabile sullo stream SSE.
 * Il fetch resta provider-specifico e confinato in questo adapter.
 */
export function creaFetchOpenRouterResiliente(fetchDiRete = fetch, {
  timeoutMsFn = () => OPENROUTER_IDLE_MS_PREDEFINITO,
  /*
   * ⛔ P0 · punto 7 (16/09/2026) — DUE tempi, non uno. `timeoutMsFn` è il tempo del fornitore e
   * vale fino agli header; `inattivitaMsFn` è il failsafe di generazione e vale sul flusso. Prima
   * erano lo stesso numero, e bastava che l'operatore scrivesse 60 s nella scheda Fornitori perché
   * un ragionamento lungo di OpenRouter morisse dopo un minuto di silenzio legittimo.
   */
  inattivitaMsFn = () => leggiInattivitaGenerazioneMs(),
  modelCapabilityFn = async () => null,
  userSignal = null,
} = {}) {
  if (typeof fetchDiRete !== 'function') throw new TypeError('fetchDiRete deve essere una funzione.');
  return async (url, init = undefined) => {
    if (!urlOpenRouterChat(url)) return fetchDiRete(url, init);
    const timeoutCandidate = Number(await timeoutMsFn());
    const timeoutMs = Number.isFinite(timeoutCandidate) && timeoutCandidate > 0
      ? Math.max(1, Math.round(timeoutCandidate))
      : OPENROUTER_IDLE_MS_PREDEFINITO;
    const inattivitaCandidata = Number(await inattivitaMsFn());
    const inattivitaMs = Number.isFinite(inattivitaCandidata) && inattivitaCandidata >= 0
      ? Math.round(inattivitaCandidata)
      : leggiInattivitaGenerazioneMs();
    let nextInit = init;
    if (typeof init?.body === 'string') {
      try {
        const body = JSON.parse(init.body);
        const capability = typeof body?.model === 'string'
          ? await Promise.resolve(modelCapabilityFn(body.model)).catch(() => null)
          : null;
        const reasoning = normalizzaReasoningPerModello(body?.reasoning, capability);
        if (reasoning !== body?.reasoning) nextInit = { ...init, body: JSON.stringify({ ...body, reasoning }) };
      } catch {
        // Body non JSON: il confine Fetch resta trasparente.
      }
    }
    const controller = new AbortController();
    try {
      /* Fino agli header comanda il tempo del FORNITORE; dal corpo in poi, il failsafe. */
      const response = await promessaConInattivita(
        fetchDiRete(url, { ...nextInit, signal: controller.signal, ...dispatcherDiRichiesta(inattivitaMs) }),
        { timeoutMs, controller, userSignal },
      );
      const contentType = response.headers?.get?.('content-type') ?? '';
      if (!response.ok || !contentType.toLowerCase().includes('text/event-stream')) return response;
      return preparaRispostaSse(response, { inattivitaMs, controller, userSignal });
    } catch (error) {
      if (userSignal?.aborted) throw userSignal.reason ?? error;
      if (error instanceof SilenzioDelFornitoreError) throw error;
      if (error instanceof OpenRouterIdleTimeoutError) return rispostaErrore(408, { message: 'OpenRouter è rimasto inattivo oltre il limite configurato.' });
      return rispostaErrore(502, { message: error instanceof Error ? error.message : String(error) });
    }
  };
}

/**
 * @param {{modulePath?:string|null, importFn?:Function}} [options]
 */

/**
 * ⭐⭐⭐ 03/9 — I MODELLI DI OGNI PROVIDER, FATTI GIRARE DAVVERO.
 *
 * Owner: «se non riesco ad aggiungere più provider oltre a OpenRouter e
 * soprattutto usare i modelli locali, l'applicazione è spacciata». E, sulla
 * mia risposta precedente: «non è un limite quello che mi hai detto tu, è un
 * finto limite». Aveva ragione.
 *
 * ## Perché QUI e non nel kernel
 *
 * Il kernel ha UNA riga cablata su OpenRouter — misurato: riga 406 della copia
 * che il desktop carica, 392 di quella mobile. Ma prende `fetchDiRete` come
 * dipendenza, e questo adattatore gliela costruisce già a strati
 * (`creaFetchConDescrizioneComando` → `creaFetchOpenRouterResiliente`).
 *
 * ⇒ Il varco giusto era già lì. Il kernel dice «fai un completamento per il
 * modello X»; DOVE vive X è una decisione del trasporto, non sua. Così:
 *  · zero righe modificate nei kernel — e sono DUE file diversi, 3.203 e
 *    6.226 righe, in due repository, che divergerebbero al primo tocco;
 *  · zero collisione con la sessione mobile, che sullo stesso file sta
 *    lavorando in queste ore;
 *  · un posto solo da provare, in questo repository.
 *
 * ## Cosa fa, esattamente
 *
 * Guarda il `model` del corpo uscente. Senza prefisso di fonte non tocca
 * NIENTE — la richiesta parte come è sempre partita, e nessuna sessione
 * esistente cambia comportamento. Con un prefisso (`local:`, `ollama:`,
 * `openai:`, `deepseek:`) riscrive indirizzo e intestazioni, e rimette nel
 * corpo il nome vero del modello senza prefisso: il provider non deve sapere
 * niente della nostra convenzione.
 *
 * ⛔ Se la fonte non è servibile — chiave mancante, motore locale spento,
 * provider che vuole un altro formato — NON parte nessuna richiesta: si
 * solleva l'errore con il motivo vero. Partire e prendersi un 404 farebbe
 * sembrare rotta una credenziale che è buona.
 */
function creaFetchInstradata(fetchDiRete = fetch, { risolvi = risolviDestinazioneModello, dipendenze = null, onAvviso = null, instradaOpenRouter = false, inattivitaGenerazioneMs = null } = {}) {
  if (!dipendenze) return fetchDiRete;
  return async function fetchMultiProvider(url, opzioni = {}) {
    let corpo = null;
    try {
      corpo = typeof opzioni.body === 'string' ? JSON.parse(opzioni.body) : null;
    } catch {
      corpo = null;
    }
    /*
     * ⛔ Si interviene solo su una richiesta di completamento riconoscibile:
     * il kernel usa questa stessa fetch anche per la ricerca web e per gli
     * attrezzi, e dirottare quelle sarebbe un guasto silenzioso.
     */
    if (!corpo || typeof corpo.model !== 'string' || !String(url).includes('/chat/completions')) {
      return fetchDiRete(url, opzioni);
    }
    /*
     * ⭐⭐⭐ 3/9 — owner, dal vivo: «[internal-error] Il motore locale non è
     * acceso: caricalo dal Laboratorio modelli prima di usarlo in chat…
     * non è così che si deve fare». Ricerca fatta (LM Studio: JIT loading,
     * "you don't need to manually load the model first… it'll be loaded
     * before your request returns", ON di default dalle nuove
     * installazioni; Ollama: "the platform loads the specified model into
     * memory" alla prima richiesta, nessun passo separato — c'è ancora chi
     * non lo risolve e richiede Ollama configurato a mano: qui lo
     * battiamo). Owner: «deve partire tutto in automatico, anche con un
     * loading nella chat o qualcosa del genere».
     *
     * ⇒ Nessun nuovo canale di eventi per il "loading": questa fetch è già
     * dentro la richiesta di completamento che il kernel sta aspettando —
     * la ruota "in attesa di risposta" che la chat mostra già copre
     * l'attesa dell'avvio, non serve altro. Un solo tentativo di avvio
     * automatico, poi si riprova UNA volta sola: se fallisce anche dopo
     * l'avvio, l'errore vero (disco pieno, GGUF corrotto…) deve arrivare
     * all'utente, non un secondo giro silenzioso all'infinito.
     */
    let destinazione;
    try {
      destinazione = risolvi(corpo.model, dipendenze);
    } catch (erroreRisoluzione) {
      if (erroreRisoluzione?.code !== 'LOCAL_RUNTIME_NOT_READY' || typeof dipendenze.avviaLocale !== 'function') throw erroreRisoluzione;
      const { modelloRemoto } = separaFonteModello(corpo.model);
      await dipendenze.avviaLocale(modelloRemoto); // ⛔ se l'avvio stesso fallisce, il SUO errore (non quello generico "non acceso") arriva a chi ha chiamato
      destinazione = risolvi(corpo.model, dipendenze); // dopo un avvio riuscito questo non deve più lanciare: se lancia ancora, è un errore vero da mostrare, non da inghiottire
    }
    /*
     * ⛔⛔⛔ P0 · punto 7 (16/09/2026) — IL FAILSAFE, IN UN PUNTO SOLO PER TUTTI I FORNITORI.
     *
     * Dichiarato QUI, sopra tutti i rami, perché è il solo confine che vede ogni destinazione di un
     * completamento: gli SDK nativi, i cloud, deepseek/z.ai/openai, e soprattutto il motore LOCALE,
     * che passa dal ponte del supervisore e non da una `fetch` nuda (quindi nessun `bodyTimeout` di
     * undici lo coprirebbe). Una regola sola invece di cinque copie che divergono.
     *
     * ⛔ DUE eccezioni, ed è giusto dirle per nome invece di lasciar credere che non ci siano:
     *   · **OpenRouter** — il suo trasporto resiliente sorveglia già il flusso e ne riemette i
     *     commenti; una seconda guardia sopra la prima non aggiunge niente e raddoppierebbe i
     *     lettori sullo stesso corpo.
     *   · **l'agente esterno ACP** — non è un flusso di byte HTTP ma un protocollo a messaggi con
     *     la sua cancellazione e la sua scadenza (`acp-agent.mjs`). Trasformarla in inattività
     *     vuole toccare il ciclo delle notifiche, che è fuori da questa corsia.
     *
     * ⛔ Il conteggio si azzera sui BYTE, non sui token: i commenti SSE contano come vita.
     */
    const failsafe = Number.isFinite(inattivitaGenerazioneMs) ? inattivitaGenerazioneMs : leggiInattivitaGenerazioneMs();
    const sorveglia = (risposta) => (destinazione.fonte === 'openrouter'
      ? risposta
      : sorvegliaCorpoDiGenerazione(risposta, { limiteMs: failsafe, userSignal: opzioni.signal ?? null }));
    const conDispatcher = dispatcherDiRichiesta(failsafe);

    // P-L · il corpo del kernel incontra ACP solo qui; stop e chiusura seguono la risposta.
    if (destinazione.esterno) return rispostaAgenteAcp({ runtime: destinazione.runtime, body: corpo, signal: opzioni.signal });
    // P-L · fine instradamento agente esterno.
    if (destinazione.native) return sorveglia(await nativeProviderResponse({ provider: destinazione.fonte, model: destinazione.modelloRemoto, apiKey: destinazione.apiKey, baseURL: destinazione.baseURL, body: corpo, fetchFn: fetchDiRete, signal: opzioni.signal }));
    if (corpo.messages?.some(m => m.talos_provider_state)) {
      corpo = { ...corpo, messages: stripNativeMetadata(corpo.messages) };
      opzioni = { ...opzioni, body: JSON.stringify(corpo) };
    }
    if (destinazione.fonte === 'openrouter' && !instradaOpenRouter) return fetchDiRete(url, opzioni);
    if (destinazione.fonte === 'openai' && corpo.reasoning) {
      const { reasoning, ...resto } = corpo;
      corpo = { ...resto, ...(typeof reasoning.effort === 'string' ? { reasoning_effort: reasoning.effort } : {}) };
    }
    /* P-D (12/09, Astra): il traduttore del fornitore toglie ciò che il fornitore non accetta (es.
       `reasoning_effort: low` per Z.AI, che ammette solo high e max) e lo DICE. Senza un canale per
       dirlo (`onAvviso`) si preferisce fermarsi prima della rete con una frase in italiano, invece di
       spedire in silenzio una richiesta diversa da quella chiesta (fail-closed, come nel rapporto). */
    const adattata = preparaRichiestaCompatibile(destinazione.fonte, { ...corpo, model: destinazione.modelloRemoto });
    for (const avviso of adattata.avvisi) {
      if (typeof onAvviso !== 'function') throw new OpenAiCompatibleRuntimeError(avviso, 'PROVIDER_REASONING_UNSUPPORTED');
      await onAvviso(avviso);
    }
    const corpoRiscritto = JSON.stringify(adattata.corpo);
    /*
     * ⛔ Il motore locale si chiama attraverso il SUO supervisore, non con una
     * fetch nuda: llama-server parte con `--api-key randomBytes(32)` e quella
     * chiave vive solo dentro il supervisore (`status()` non la espone,
     * perché quella risposta arriva al browser). Misurato costruendo l'URL a
     * mano: HTTP 401 «Invalid API Key» in 4 ms.
     */
    if (destinazione.locale) {
      if (typeof dipendenze.chiamaLocale !== 'function') {
        const errore = new Error('Il motore locale non è collegato a questo server.');
        errore.code = 'LOCAL_RUNTIME_NOT_READY';
        throw errore;
      }
      return sorveglia(await dipendenze.chiamaLocale(destinazione.percorso, { ...opzioni, ...conDispatcher, headers: { 'Content-Type': 'application/json' }, body: corpoRiscritto }));
    }
    /*
     * ⛔⛔⛔ 16/09/2026, GIRO DI RIPARAZIONE — L'ORDINE DI QUESTE DUE FUNZIONI È LA CURA.
     *
     * Prima era `sorveglia(conCacheDichiarata(await fetch(...)))`, e aveva DUE difetti in una riga:
     *   1. `conCacheDichiarata` è `async` ⇒ `sorveglia` riceveva una **Promise**, non una
     *      `Response`, e la restituiva intatta: il failsafe non era attaccato a niente su
     *      deepseek / z.ai / openai / cloud, in streaming e non (ora `sorvegliaCorpoDiGenerazione`
     *      LANCIA se gli si passa una Promise, così non può più succedere in silenzio);
     *   2. anche con l'`await` al posto giusto, `conCacheDichiarata` legge il corpo
     *      (`risposta.clone().text()`) per dichiarare la cache: sorvegliare DOPO vuol dire
     *      sorvegliare un corpo già bevuto, e su una risposta `stream:false` che si pianta a metà
     *      JSON quella lettura non finisce mai.
     *
     * ⇒ Si sorveglia PRIMA e si dichiara la cache DOPO: `conCacheDichiarata` clona un corpo già
     *   sorvegliato, quindi anche la sua lettura è coperta. Misurato il 16/09/2026 con un fornitore
     *   che manda gli header e poi tace: prima **1506 ms** e sempre `UND_ERR_BODY_TIMEOUT` (cioè il
     *   trasporto a 1,2×, mai il guardiano) o nessuna uscita affatto senza dispatcher; dopo
     *   `PROVIDER_SILENCE` al limite chiesto. Prove `P0-D-15`/`P0-D-16`/`P0-D-17`.
     */
    // P-K — nessun redirect con credenziali cloud, anche senza pool collegato.
    if (destinazione.cloud) return conCacheDichiarata(sorveglia(await inviaCloudProtetta(fetchDiRete, destinazione.url, {
      ...opzioni, ...conDispatcher, headers: { ...destinazione.headers }, body: corpoRiscritto, redirect: 'error',
    })), destinazione.fonte);
    // P-K — fine
    return conCacheDichiarata(sorveglia(await fetchDiRete(destinazione.url, {
      ...opzioni,
      ...conDispatcher,
      headers: { ...destinazione.headers },
      body: corpoRiscritto,
    })), destinazione.fonte);
  };
}

// P-K — errori upstream non attendibili: il testo non deve attraversare il confine pubblico.
async function inviaCloudProtetta(rete, url, opzioni) {
  let risposta;
  try { risposta = await rete(url, opzioni); }
  catch {
    if (opzioni.signal?.aborted) {
      const errore = new Error('La richiesta al fornitore è stata interrotta.');
      errore.name = opzioni.signal.reason?.name === 'TimeoutError' ? 'TimeoutError' : 'AbortError';
      throw errore;
    }
    throw Object.assign(new Error('Non è stato possibile raggiungere il fornitore.'), { code: 'PROVIDER_NETWORK_ERROR' });
  }
  if (risposta.ok) return risposta;
  await risposta.body?.cancel().catch(() => {});
  const stato = risposta.status;
  const message = stato === 401 ? 'Credenziale non accettata dal fornitore.'
    : stato === 403 ? 'Accesso negato: controlla i permessi della credenziale e del modello.'
    : stato === 404 ? 'Modello o indirizzo non trovato: controlla la configurazione del fornitore.'
    : `Il fornitore ha risposto HTTP ${stato}.`;
  return new Response(JSON.stringify({ error: { message } }), { status: stato, headers: { 'Content-Type': 'application/json' } });
}
// P-K — fine

function erroreFornitorePubblico(classificazione, stato = null) {
  const messaggi = {
    traffico: 'Troppo traffico presso il fornitore.', credenziale: 'Credenziale rifiutata dal fornitore.',
    credito: 'Credito non disponibile presso il fornitore.', rete: 'Connessione con il fornitore interrotta.',
    'timeout-fornitore': 'Il fornitore ha superato il tempo massimo.', 'guasto-fornitore': 'Il fornitore non risponde.',
    'flusso-interrotto': 'La risposta del fornitore si è interrotta.',
  };
  const e = new Error(messaggi[classificazione.classe] ?? 'Il fornitore non ha accettato la richiesta.');
  return Object.assign(e, { code: 'PROVIDER_REQUEST_ERROR', stato, ...classificazione, limitatoDalFornitore: classificazione.classe === 'traffico' });
}

/**
 * ⛔⛔ P0 · punto 7 (16/09/2026) — LA SCADENZA ALLA PRIMA RISPOSTA.
 *
 * Un `AbortSignal.timeout` non si può disarmare: una volta acceso conta fino in fondo, e dopo gli
 * header continua a contare sul corpo. Qui il timer è NOSTRO, e si spegne appena la risposta
 * arriva — è la differenza fra «il fornitore non risponde» (un guasto vero) e «il modello sta
 * pensando» (il lavoro).
 *
 * ⛔ Il segnale composto resta quello passato dal chiamante: lo STOP della persona continua ad
 *   attraversare la fetch e il corpo, esattamente come prima.
 * ⛔ Il motivo dell'aborto porta un `code` PROPRIO invece di affidarsi alla parola «timeout»
 *   dentro un messaggio: un filtro che riconosce la menzione non riconosce la cosa.
 *
 * @param {number|undefined} timeoutSeconds
 * @param {AbortSignal|undefined} segnaleUtente
 */
function scadenzaPrimaRisposta(timeoutSeconds, segnaleUtente) {
  const ms = Number(timeoutSeconds) > 0 ? Math.round(Number(timeoutSeconds) * 1_000) : 0;
  if (!ms) return { signal: segnaleUtente, disarma: () => {} };
  const controllore = new AbortController();
  const timer = setTimeout(() => controllore.abort(Object.assign(
    new Error(`Il fornitore non ha risposto entro ${Math.round(ms / 1_000)} secondi.`),
    { name: 'TimeoutError', code: 'PROVIDER_FIRST_RESPONSE_TIMEOUT' },
  )), ms);
  timer.unref?.();
  return {
    signal: segnaleUtente ? AbortSignal.any([segnaleUtente, controllore.signal]) : controllore.signal,
    disarma: () => clearTimeout(timer),
  };
}

/**
 * ⛔ I guasti del TRASPORTO hanno un codice, e il codice si legge per primo.
 *
 * `classificaErroreDiCorsa` (BC-44) resta l'unica tabella, ma legge il MESSAGGIO: i suoi segni sono
 * in inglese (`idle timeout`, `terminated`…) e non possono riconoscere né il nostro silenzio né i
 * codici di undici. Indovinare dal testo sarebbe la «cura che passa da un filtro di menzione».
 * ⭐ `PROVIDER_SILENCE` e `UND_ERR_BODY_TIMEOUT` sono `rete` — «la connessione con il fornitore è
 *   caduta» — e NON `timeout-fornitore`: quando scattano il canale è morto, non lento.
 */
const CLASSI_PER_CODICE_DI_TRASPORTO = new Map([
  ['PROVIDER_SILENCE', 'rete'],
  ['UND_ERR_BODY_TIMEOUT', 'rete'],
  ['UND_ERR_HEADERS_TIMEOUT', 'timeout-fornitore'],
  ['PROVIDER_FIRST_RESPONSE_TIMEOUT', 'timeout-fornitore'],
]);

/**
 * ⛔ 16/09/2026 — i due modi in cui un corpo può NON FINIRE MAI, per nome.
 *
 * `PROVIDER_SILENCE` è il nostro failsafe di inattività; `UND_ERR_BODY_TIMEOUT` è la rete di
 * sicurezza del trasporto (undici: un timer fra un chunk e il successivo, 300 s di serie —
 * documentazione `Client.md`, letta il 16/09/2026). Chi legge un corpo per misurarlo deve
 * RILANCIARE questi due invece di degradare, o il guasto arriva senza il suo nome.
 */
const CODICI_DI_CORPO_MAI_FINITO = new Set(['PROVIDER_SILENCE', 'UND_ERR_BODY_TIMEOUT']);

function classificaGuasto(error, stato = null) {
  // BC-44 rimane l'unica tabella. Si normalizzano solo i campi strutturati del trasporto.
  const codice = String(error?.code ?? error?.cause?.code ?? '');
  /*
   * ⛔ 16/09/2026 — `causaDiTrasporto` VIAGGIA fino all'errore pubblico, e non è un dettaglio da
   *   collezionisti: `PROVIDER_SILENCE` e `UND_ERR_BODY_TIMEOUT` producono la stessa classe
   *   (`rete`) e la stessa frase in chat, ma sono DUE STRATI diversi — il nostro guardiano a 1,0×
   *   il failsafe, il trasporto a 1,2×. Senza questo campo, chi legge un registro (o un test) non
   *   può distinguere «la mia guardia ha funzionato» da «la mia guardia era staccata e mi ha
   *   salvato undici»: è esattamente l'inganno in cui questa corsia è caduta al primo giro.
   */
  if (CLASSI_PER_CODICE_DI_TRASPORTO.has(codice)) return { classe: CLASSI_PER_CODICE_DI_TRASPORTO.get(codice), transitorio: true, causaDiTrasporto: codice };
  const messaggio = `${codice} ${error?.name ?? ''} ${error?.message ?? ''} ${error?.cause?.message ?? ''} ${stato ? `HTTP ${stato}` : ''}`;
  const esito = classificaErroreDiCorsa({ codice, messaggio });
  if (esito.classe !== 'ignoto' || !(stato >= 500 && stato <= 599)) return esito;
  return classificaErroreDiCorsa({ messaggio: 'upstream error' });
}

function consumoPubblico(usage) {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null;
  const risultato = {};
  const copiaNumeri = (da, campi) => Object.fromEntries(campi.filter(k => typeof da?.[k] === 'number' && Number.isFinite(da[k]) && da[k] >= 0).map(k => [k, da[k]]));
  Object.assign(risultato, copiaNumeri(usage, ['prompt_tokens','completion_tokens','total_tokens','input_tokens','output_tokens','cost','cache_read_input_tokens','cache_creation_input_tokens','prompt_cache_hit_tokens','prompt_cache_miss_tokens']));
  for (const [campo, campi] of Object.entries({prompt_tokens_details:['cached_tokens','cache_write_tokens'],completion_tokens_details:['reasoning_tokens']})) {
    const v = copiaNumeri(usage[campo], campi); if (Object.keys(v).length) risultato[campo] = v;
  }
  if (typeof usage.cache_discount === 'number' && Number.isFinite(usage.cache_discount)) risultato.cache_discount = usage.cache_discount;
  return Object.keys(risultato).length ? risultato : null;
}

/** P-H: la fetch conosce la chiave; il kernel resta proprietario dei ritentativi.
 * eseguiConFallback avvolge UNA chiamata del kernel, mai il ciclo degli attrezzi.
 * I callback del cambio e del consumo devono essere durabili prima della nuova chiamata.
 */
export function creaFetchMultiProvider(fetchDiRete = fetch, {
  risolvi = risolviDestinazioneModello, dipendenze = null, onAvviso = null,
  providerStore = null, fallbackProviders = [], onCambioFornitore = null, onConsumoFornitore = null,
  modelloSessione = null,
  /* P0 · punto 7 (16/09): iniettabile perché una prova non deve aspettare mezz'ora per provarla. */
  inattivitaGenerazioneMs = null,
} = {}) {
  const catena = validaFallbackProviders(fallbackProviders);
  if (!providerStore && !catena.length) return creaFetchInstradata(fetchDiRete, { risolvi, dipendenze, onAvviso, inattivitaGenerazioneMs });
  if (!dipendenze || (catena.length && (!providerStore || typeof onCambioFornitore !== 'function' || typeof onConsumoFornitore !== 'function'))) {
    throw new OwnerRuntimeUnavailableError('Per continuare con un altro fornitore occorrono accessi, avvisi in chat e registrazione dei consumi.', 'PROVIDER_FALLBACK_NOT_CONNECTED');
  }
  let effettivo = null, indice = -1, occupato = false;

  async function invia(url, opzioni = {}, contesto = {}) {
    let corpo;
    try { corpo = typeof opzioni.body === 'string' ? JSON.parse(opzioni.body) : null; } catch { /* altre fetch intatte */ }
    if (!corpo || typeof corpo.model !== 'string' || !String(url).includes('/chat/completions')) return fetchDiRete(url, opzioni);
    opzioni.signal?.throwIfAborted();
    const { fonte } = separaFonteModello(corpo.model);
    const record = REGISTRO_FORNITORI[fonte];
    const scelta = record.credenziale ? providerStore?.scegliChiave(fonte) : null;
    if (providerStore && !scelta && record.chiaveObbligatoria) {
      if (!providerStore.hasKey(fonte)) throw new OwnerRuntimeUnavailableError('Manca la chiave del fornitore scelto.', 'PROVIDER_KEY_MISSING');
      const panchina = providerStore.elencaPool(fonte).find(v => v.causa);
      const classificazione = classificaErroreDiCorsa({ messaggio: ({traffico:'HTTP 429',credenziale:'HTTP 401',credito:'insufficient credit',rete:'network', 'timeout-fornitore':'timeout', 'guasto-fornitore':'upstream error', 'flusso-interrotto':'unexpected eof'})[panchina?.causa] ?? '' });
      contesto.errore = erroreFornitorePubblico(classificazione, classificazione.classe === 'traffico' ? 429 : classificazione.transitorio ? 503 : 401);
      return new Response(contesto.errore.message, { status: contesto.errore.stato });
    }
    contesto.errore = null;
    contesto.scelta = scelta; contesto.fonte = fonte;
    const segnala = async (classificazione, headers, stato) => {
      contesto.errore = erroreFornitorePubblico(classificazione, stato);
      if (scelta) providerStore.mettiInPanchina(fonte, scelta.impronta, { classe: classificazione.classe, headers });
      if (classificazione.classe === 'credenziale' && typeof onAvviso === 'function') {
        await onAvviso(`Una chiave di ${record.etichetta} è stata rifiutata: controlla Fornitori e accessi.`);
      }
    };
    const rete = async (target, init) => {
      try {
        /*
         * ⛔⛔⛔ P0 · punto 7 (16/09/2026) — QUI C'ERA UNA DEADLINE TOTALE, ED È STATA TOLTA.
         *
         * Prima: `AbortSignal.timeout(timeoutSeconds * 1000)` composto con `init.signal` e passato
         * alla fetch. Quel segnale non smette di contare quando la risposta arriva: continua
         * mentre il modello STA PARLANDO, e al minuto esatto uccide lo stream.
         * Misurato il 16/09/2026 con un fornitore finto che emette un token ogni 2 s per 90 s, col
         * default di 60 s: **tagliata a 60.002 ms, ultimo token a 58.023 ms** — cioè il canale era
         * vivo due secondi prima, e l'errore diceva «Il fornitore ha superato il tempo massimo».
         * Verso OpenRouter non si vedeva (il trasporto resiliente scarta `init.signal`), verso
         * deepseek / z.ai / openai / cloud / motore LOCALE sì.
         *
         * ⇒ `timeoutSeconds` CAMBIA SEMANTICA, non sparisce: è il tempo massimo alla **prima
         *   risposta** — cioè fino agli header. Un valore salvato ieri continua a proteggere dal
         *   fornitore che non risponde affatto, e non può più tagliare un ragionamento in corso.
         *   Dopo gli header comanda il solo failsafe di INATTIVITÀ (`generation-idle.mjs`).
         */
        const scadenza = scadenzaPrimaRisposta(providerStore?.getRuntime(fonte)?.timeoutSeconds, init.signal);
        let response;
        try { response = await fetchDiRete(target, { ...init, signal: scadenza.signal }); }
        finally { scadenza.disarma(); }
        if (response.ok) return response;
        // Il corpo originale non viene mai restituito al logger/kernel: può contenere la chiave.
        let testo = '';
        try { testo = (await response.text()).slice(0, 16_384); } catch { /* lo stato resta disponibile */ }
        const classificazione = classificaGuasto({ message: testo }, response.status);
        await segnala(classificazione, response.headers, response.status);
        return new Response(JSON.stringify({ error: { message: contesto.errore.message } }), { status: response.status, headers: { 'Content-Type': 'application/json' } });
      } catch (error) {
        if (opzioni.signal?.aborted && opzioni.signal.reason?.name !== 'TimeoutError') throw opzioni.signal.reason;
        const classificazione = classificaGuasto(error);
        await segnala(classificazione, null, classificazione.transitorio ? 503 : null);
        if (!classificazione.transitorio) throw contesto.errore;
        return new Response(contesto.errore.message, { status: 503 });
      }
    };
    const instradata = creaFetchInstradata(rete, { risolvi, dipendenze: {
      ...dipendenze, leggiChiave: p => p === fonte && scelta ? scelta.chiave : dipendenze.leggiChiave(p),
    }, onAvviso, instradaOpenRouter: true, inattivitaGenerazioneMs });
    try { return await instradata(url, opzioni); }
    catch (error) {
      // P-K — token scaduto o involucro malformato: panchina senza partire in rete.
      if (record.cloud && scelta && ['PROVIDER_CLOUD_TOKEN_EXPIRED', 'PROVIDER_CLOUD_CREDENTIAL_INVALID'].includes(error?.code)) {
        providerStore.mettiInPanchina(fonte, scelta.impronta, { classe: 'credenziale' });
      }
      // P-K — fine
      // Gli SDK nativi lanciano sugli HTTP non riusciti: ricondurli alla stessa
      // risposta permette al kernel di esaurire il proprio budget anche qui.
      if (contesto.errore?.stato) return new Response(contesto.errore.message, { status: contesto.errore.stato });
      if (contesto.errore) throw contesto.errore;
      throw error;
    }
  }

  const fetchMultiProvider = (url, opzioni) => invia(url, opzioni);
  fetchMultiProvider.eseguiConFallback = async (chiama, opzioni = {}) => {
    if (modelloSessione && JSON.stringify(separaFonteModello(opzioni.modello)) !== JSON.stringify(separaFonteModello(modelloSessione))) {
      return chiama({ fetchDiRete: fetchMultiProvider });
    }
    if (occupato) throw new OwnerRuntimeUnavailableError('Una chiamata di questa sessione è già in corso.', 'PROVIDER_FALLBACK_BUSY');
    occupato = true;
    try {
      const iniziale = separaFonteModello(opzioni.modello);
      let destinazione = effettivo ?? { provider: iniziale.fonte, model: iniziale.modelloRemoto };
      const usaAttrezzi = Boolean(opzioni.attrezzi?.length || opzioni.messaggi?.some(m => m.role === 'tool' || m.tool_calls?.length));
      while (true) {
        opzioni.segnaleStop?.throwIfAborted();
        const contesto = {};
        let rispostaInterrotta = false;
        const fetchTentativo = (url, init) => invia(url, init, contesto);
        let risultato;
        try {
          risultato = await chiama({
            modello: `${destinazione.provider}:${destinazione.model}`, fetchDiRete: fetchTentativo,
            ...(opzioni.onDelta ? { onDelta: (...args) => { rispostaInterrotta = true; return opzioni.onDelta(...args); } } : {}),
          });
        } catch (error) {
          if (opzioni.segnaleStop?.aborted || error?.fermatoSuRichiesta || error?.name === 'AbortError') {
            /*
             * ⛔ 14/09, giro vero della coda (banco 5475): 7 invii, 6 fermati, e la sessione diceva «1 giro». Una chiamata già
             *   PARTITA verso il fornitore e poi fermata non lasciava nessuna traccia, perché qui si rilanciava prima del deposito:
             *   i token di uno stream interrotto non arrivano (li porta l'ultimo pezzo), ma la chiamata c'è stata. Si deposita con
             *   `usage: null` e `esito: 'fermato'` — nessun numero inventato. Stessa forma di Codex, dove `TurnAbortedEvent` porta
             *   motivo e orari e i token restano `Option` (codex-rs/protocol/src/protocol.rs:4154 e :2318, clone 728cb12).
             * ⛔ Solo se la richiesta è partita (`contesto.scelta`): uno stop prima della rete non è un giro. E un deposito che
             *   fallisce non deve coprire lo stop.
             */
            if (contesto.scelta && typeof onConsumoFornitore === 'function') {
              try { await onConsumoFornitore({ tipo: 'consumo-fornitore', ...destinazione, usage: null, costoDichiarato: null, esito: 'fermato' }); } catch { /* lo stop resta lo stop */ }
            }
            throw error;
          }
          const classificazione = contesto.errore ?? classificaGuasto(error, error?.stato ?? error?.statusCode);
          const pulito = erroreFornitorePubblico(classificazione, error?.stato ?? contesto.errore?.stato);
          if (!contesto.errore && contesto.scelta) providerStore.mettiInPanchina(destinazione.provider, contesto.scelta.impronta, { classe: classificazione.classe });
          if (typeof onConsumoFornitore === 'function') await onConsumoFornitore({ tipo: 'consumo-fornitore', ...destinazione, usage: null, costoDichiarato: null, esito: classificazione.classe === 'traffico' ? 'traffico' : 'interrotto' });
          if (!classificazione.transitorio) throw pulito;
          let prossima = null;
          while (++indice < catena.length) {
            const candidata = catena[indice];
            if (candidata.provider === destinazione.provider || !providerStore.scegliChiave(candidata.provider)) continue;
            try { validaFallbackProviders([candidata], { usaAttrezzi }); } catch { continue; }
            prossima = candidata; break;
          }
          if (!prossima) throw pulito;
          const messaggio = classificazione.classe === 'traffico'
            ? `Il fornitore ${REGISTRO_FORNITORI[destinazione.provider].etichetta} limita il traffico: continuo con ${REGISTRO_FORNITORI[prossima.provider].etichetta} · modello ${prossima.model}`
            : `Il fornitore ${REGISTRO_FORNITORI[destinazione.provider].etichetta} non risponde: continuo con ${REGISTRO_FORNITORI[prossima.provider].etichetta} · modello ${prossima.model}`;
          await onCambioFornitore({ tipo: 'cambio-fornitore', precedente: destinazione, effettivo: prossima, classe: classificazione.classe, rispostaInterrotta, messaggio });
          opzioni.segnaleStop?.throwIfAborted();
          destinazione = prossima; effettivo = prossima;
          continue;
        }
        // Un errore nel deposito della prova non deve provocare un'altra chiamata pagabile.
        const usage = consumoPubblico(risultato?.usage);
        const costoDichiarato = typeof usage?.cost === 'number' && Number.isFinite(usage.cost) && usage.cost >= 0 ? usage.cost : null;
        if (typeof onConsumoFornitore === 'function') await onConsumoFornitore({ tipo: 'consumo-fornitore', ...destinazione, usage, costoDichiarato, esito: 'completato' });
        return { ...risultato, usage, fornitoreEffettivo: destinazione.provider, modelloEffettivo: destinazione.model };
      }
    } finally { occupato = false; }
  };
  return fetchMultiProvider;
}

/**
 * ⭐⭐⭐ 12/09 — P-B: LA CACHE CHE IL FORNITORE DICHIARA CON UN ALTRO NOME.
 *
 * DeepSeek chiama i token letti dalla cache `prompt_cache_hit_tokens`, Kimi li mette in
 * `usage.cached_tokens` al primo livello, OpenRouter aggiunge un `cache_discount` che è **denaro**.
 * Chi legge a valle conosce il solo nome canonico `prompt_tokens_details.cached_tokens`: su quei
 * fornitori riporterebbe zero — e «zero da cache» su un agente che rilegge lo stesso prefisso 24
 * volte non è un dettaglio del pannello costi, è **non sapere quanto stiamo spendendo**
 * (misurato il 22/8: 87 token dentro per ogni 1 fuori, il 93% del costo).
 *
 * ⛔ Si aggiunge il nome canonico, NON si toglie niente: i campi nativi restano dove sono, e chi
 *   già li conosce (il kernel ne legge tre) continua a leggerli. Se non c'è niente da dichiarare
 *   la risposta torna **identica**, senza essere nemmeno letta.
 * ⛔ SOLO le risposte JSON non in streaming. Una risposta SSE si lascia passare intatta: riscrivere
 *   un flusso che non abbiamo prodotto, per un campo che il kernel sa già leggere in tre forme,
 *   costerebbe più del difetto che cura. ⇒ Sul giro in streaming il valore resta quello che il
 *   kernel estrae; qui si coprono compattazione, banco e ogni chiamata `stream:false`.
 *   Dichiarato come NON coperto nel rapporto, non risolto in silenzio.
 */
async function conCacheDichiarata(risposta, fonte) {
  try {
    if (!risposta?.ok) return risposta;
    const tipo = risposta.headers?.get?.('content-type') ?? '';
    if (!tipo.includes('json')) return risposta; // un `text/event-stream` esce di qui senza essere toccato
    const testo = await risposta.clone().text();
    const corpo = JSON.parse(testo);
    const normalizzato = normalizzaUsage(corpo?.usage, fonte);
    const sconto = scontoDaCache(corpo, fonte);
    if (normalizzato === corpo?.usage && sconto === null) return risposta;
    const nuovo = { ...corpo, usage: { ...normalizzato, ...(sconto !== null ? { cache_discount: sconto } : {}) } };
    return new Response(JSON.stringify(nuovo), { status: risposta.status, statusText: risposta.statusText, headers: risposta.headers });
  } catch (errore) {
    /*
     * ⛔⛔ 16/09/2026 — IL CATCH DICE QUALE GUASTO COPRE, E RILANCIA GLI ALTRI.
     *
     * Quello che copre: «il corpo non è quello che credevamo» (JSON malformato, campi assenti).
     * Lì una misura che non si scrive non deve rompere un giro — è la disciplina di
     * `persistiTempiDelGiro`.
     *
     * ⛔ Quello che NON deve coprire: un corpo che **non finisce mai**. Qui si sta leggendo
     *   `risposta.clone().text()`: se il fornitore tace a metà JSON, a interrompere quella lettura
     *   è il failsafe di inattività (o, dietro di lui, il `bodyTimeout` del trasporto). Ingoiare
     *   quell'errore e restituire la risposta com'era vorrebbe dire consegnare al kernel un corpo
     *   già rotto e far scoprire il guasto a qualcun altro, più tardi e senza il suo nome.
     * ⇒ Gli errori di CONTRATTO si rilanciano: [[il-catch-giusto-nasconde-il-bug-sbagliato]].
     */
    if (CODICI_DI_CORPO_MAI_FINITO.has(String(errore?.code ?? errore?.cause?.code ?? ''))) throw errore;
    return risposta;
  }
}

/**
 * ⛔⛔⛔ 10/09 — IL SERVER DELL'OWNER E' RIMASTO SENZA KERNEL DOPO UN RIAVVIO.
 *
 * Sintomo: ogni giro moriva con «Il runtime agente non è configurato per questa installazione.»
 * (`RunError`, `code: internal-error`), e in chat compariva «Il giro si è interrotto per un
 * errore». Misurato leggendo il registro della sessione: `RunStarted → ToolCallStart →
 * ToolCallArgs → RunError`, con zero eventi in mezzo.
 *
 * CAUSA: qui il modulo del kernel si leggeva SOLO da `process.env.TALOS_OWNER_RUNTIME_MODULE`,
 * e `scripts/aggiorna-4174.ps1` ha smesso di forzarla. Senza variabile: `null` ⇒ nessun runtime.
 * ⛔ Il ripiego esisteva già nel repo, in un altro file: `config.mjs` ha `kernelNelRepo()`, che
 *   quando la variabile manca torna il kernel versionato — cioè il progetto aveva già DECISO che
 *   il kernel nel repo è il default. Questo file semplicemente non lo sapeva. (È la regola «prima
 *   di cercare fuori, cerca nel tuo codebase»: la risposta era a due file di distanza.)
 * ⇒ Stessa decisione, un posto solo in più. Chi imposta la variabile continua a vincere, byte per
 *   byte: il ripiego vale SOLO quando la variabile non c'è.
 */
function kernelNelRepo() {
  try {
    const percorso = fileURLToPath(new URL('kernel/talosHarness.mjs', import.meta.url));
    return statSync(percorso).isFile() ? percorso : null;
  } catch {
    return null;
  }
}

export function createOwnerRuntimeAdapter({
  modulePath = process.env.TALOS_OWNER_RUNTIME_MODULE ?? kernelNelRepo(),
  importFn = (specifier) => import(specifier),
  openRouterRuntimeFn = () => ({ timeoutSeconds: OPENROUTER_IDLE_MS_PREDEFINITO / 1_000 }),
  modelCapabilityFn = async () => null,
  /**
   * ⭐ 03/9 — da dove si leggono chiave, indirizzo e motore locale per
   * instradare un modello non-OpenRouter. ⛔ Assente = comportamento di
   * sempre, byte per byte: chi non le passa non cambia di una virgola.
   */
  destinazioneModelloDeps = null,
  providerStore = null,
  resolveImagesFn = null,
} = {}) {
  const specifier = normalizzaModuloPath(modulePath);
  let moduloPromise = null;
  const carica = async () => {
    if (!specifier) throw new OwnerRuntimeUnavailableError('Il runtime agente non è configurato per questa installazione.');
    if (!moduloPromise) {
      moduloPromise = Promise.resolve(importFn(specifier)).catch((error) => {
        moduloPromise = null;
        throw new OwnerRuntimeUnavailableError('Il runtime agente non è disponibile. Controlla la configurazione del server.', 'OWNER_RUNTIME_LOAD_FAILED', { cause: error });
      });
    }
    return moduloPromise;
  };
  const richiama = async (nome, ...argomenti) => {
    const runtime = await carica();
    if (typeof runtime[nome] !== 'function') {
      throw new OwnerRuntimeUnavailableError(`Il runtime agente non espone l’operazione richiesta (${nome}).`, 'OWNER_RUNTIME_CONTRACT_INVALID');
    }
    return runtime[nome](...argomenti);
  };
  return Object.freeze({
    /*
     * ⛔⛔⛔ 06/9, owner, due volte e in maiuscolo: «IL MODELLO DEVE LEGGERE LA PAGINA DOVE VADO IO,
     * DEVE AVERE GLI OCCHI SULLA SEZIONE BROWSER ANCHE SE SONO IO A NAVIGARCI DENTRO».
     * Una pagina di un'altra origine dentro una cornice NON si legge dal JavaScript della pagina che
     * la ospita — è il confine di origine del browser, e non c'è trucco che lo aggiri (ricerca
     * 06/09/2026: browser-use «Leaving Playwright for CDP», microsoft/playwright #21780). Chi ci
     * riesce lo fa fuori dalla pagina: qui la legge il SERVER, con la stessa funzione dell'attrezzo
     * `naviga` — cioè con la stessa validazione già scritta e già provata contro gli indirizzi
     * interni (SSRF: allowlist di schema, niente indirizzi privati, catena di redirect limitata),
     * invece di scrivere una seconda validazione che diverge dalla prima.
     * ⛔ Il server non ha i cookie della persona: di un sito dietro login vede la versione pubblica.
     * Va detto a schermo, non nascosto.
     */
    async leggiPagina(url) {
      const runtime = await carica();
      if (typeof runtime.leggiPaginaSicura !== 'function') {
        throw new OwnerRuntimeUnavailableError('Il runtime agente non espone la lettura di una pagina.', 'OWNER_RUNTIME_CONTRACT_INVALID');
      }
      const pagina = await runtime.leggiPaginaSicura(String(url ?? ''));
      return { url: String(pagina?.url ?? url ?? ''), stato: Number(pagina?.stato ?? 0) || 0, corpo: String(pagina?.corpo ?? '') };
    },
    async runtimeSnapshot() {
      if (!specifier) return parseRuntimeOwnerSnapshot(null);
      const runtime = await carica();
      if (typeof runtime.runtimeSnapshot !== 'function') {
        return parseRuntimeOwnerSnapshot({ status: 'unavailable', items: null, reason: 'runtime_snapshot_not_exposed', observedAt: null });
      }
      return parseRuntimeOwnerSnapshot(await runtime.runtimeSnapshot());
    },
    async taskCatalogProvider() {
      if (!specifier) return null;
      const runtime = await carica();
      if (typeof runtime.listaTaskDisponibili !== 'function' || typeof runtime.preparaEsecuzione !== 'function') {
        throw new OwnerRuntimeUnavailableError('Il runtime agente non espone il catalogo task richiesto.', 'OWNER_RUNTIME_CONTRACT_INVALID');
      }
      return Object.freeze({
        list: () => runtime.listaTaskDisponibili(),
        prepare: (taskId) => runtime.preparaEsecuzione(taskId),
      });
    },
    /**
     * ⭐⭐⭐ O-01 (04/9) — GLI ATTREZZI VERI, CHIESTI AL KERNEL.
     *
     * Il Capability hub («+» del composer) elencava SETTE nomi scritti a mano
     * dentro una stringa di template, sotto l'etichetta «Attrezzi
     * dell'harness · sempre offerti al modello». Il kernel ne offre 43 (7
     * base + i 36 di `strumentiEstesi`, session-registry.mjs): 36 attrezzi
     * VERI — `web_search`, `document_create`, `generate_image`,
     * `delega_sottotask`, tutta Libreria/Notes/Tasks/Memory/Research/Forge —
     * non comparivano da nessuna parte. Un inventario incompleto presentato
     * come completo è uno stato inventato, esattamente come un contatore
     * inventato.
     *
     * ⛔ La cura non è allungare la lista a mano (invecchierebbe di nuovo, e
     * in silenzio): si LEGGE dal kernel, che è l'unico posto dove quei nomi
     * e quelle descrizioni esistono davvero. Nessuna copia, nessun secondo
     * elenco da tenere allineato.
     *
     * `tokenSchemaStimati` è una STIMA dichiarata (caratteri del JSON / 4,
     * l'euristica affermata) sul JSON che va davvero sul filo, non un numero
     * inventato: serve a rispondere «quanto mi costa avere questi attrezzi
     * offerti a ogni giro» — la stessa domanda a cui lo stato dell'arte
     * risponde col suo «schema token estimate» per server MCP, qui estesa a
     * OGNI attrezzo, MCP compresi quando ci saranno.
     *
     * @returns {Promise<{base: Array<{nome:string,descrizione:string,tokenSchemaStimati:number}>, estesi: Array}>}
     */
    async attrezziKernel() {
      const runtime = await carica();
      const leggi = (elenco, dove) => {
        if (!Array.isArray(elenco)) {
          throw new OwnerRuntimeUnavailableError(`Il runtime agente non espone l’elenco degli attrezzi (${dove}).`, 'OWNER_RUNTIME_CONTRACT_INVALID');
        }
        return elenco.map((voce) => {
          const f = voce?.function ?? voce ?? {};
          return {
            nome: String(f.name ?? ''),
            descrizione: String(f.description ?? ''),
            // ⛔ Misurato sul JSON reale della dichiarazione, non su un valore per attrezzo scritto altrove.
            tokenSchemaStimati: Math.ceil(JSON.stringify(voce ?? {}).length / 4),
          };
        }).filter((a) => a.nome);
      };
      return {
        base: leggi(runtime.ATTREZZI_OPENAI, 'ATTREZZI_OPENAI'),
        estesi: leggi(runtime.ATTREZZI_ESTESI_OPENAI, 'ATTREZZI_ESTESI_OPENAI'),
      };
    },
    async talosLavora(input) {
      const fallbackProviders = validaFallbackProviders(input?.fallbackProviders ?? []);
      if (fallbackProviders.length) {
        const runtime = await carica();
        if (runtime.SUPPORTA_FALLBACK_FORNITORI !== 1) {
          throw new OwnerRuntimeUnavailableError('Il motore di questa installazione non collega ancora il cambio di fornitore alla conversazione.', 'PROVIDER_FALLBACK_CONTRACT_REQUIRED');
        }
      }
      const fetchOriginale = typeof input?.fetchDiRete === 'function' ? input.fetchDiRete : fetch;
      const fetchConDescrizione = creaFetchConDescrizioneComando(fetchOriginale);
      const fetchResiliente = creaFetchOpenRouterResiliente(fetchConDescrizione, {
        timeoutMsFn: async () => {
          const runtime = await Promise.resolve(openRouterRuntimeFn()).catch(() => null);
          return Number(runtime?.timeoutSeconds) * 1_000;
        },
        modelCapabilityFn,
        userSignal: input?.segnaleStop ?? null,
      });
      /*
       * ⛔ L'ORDINE conta: il multi-provider sta PIÙ ESTERNO della resilienza
       * OpenRouter, così le ritentate e i timeout di quella restano applicati
       * alla richiesta finale, qualunque sia la sua destinazione. Metterlo
       * dentro avrebbe fatto ritentare su OpenRouter una chiamata già
       * dirottata altrove.
       */
      const fetchInstradata = creaFetchMultiProvider(fetchResiliente, {
        /* P0 · punto 7 (16/09): il failsafe della sessione, letto una volta e passato a valle. */
        inattivitaGenerazioneMs: leggiInattivitaGenerazioneMs(),
        dipendenze: destinazioneModelloDeps, providerStore, fallbackProviders, modelloSessione: input?.modello,
        onAvviso: input?.onAvviso, onCambioFornitore: input?.onCambioFornitore, onConsumoFornitore: input?.onConsumoFornitore,
      });
      const fetchConImmagini = async (url, init = {}, successiva = fetchInstradata) => {
        // BC-48 C-bis: GLM via OpenRouter usa cache implicita (fonti nel rapporto
        // del 12/09/2026). Il kernel sposta il marcatore all'ultimo sistema:
        // alla ripresa il preambolo diventava stringa dopo essere stato array.
        // Normalizziamo solo la forma esatta prodotta dal kernel; testo, immagini
        // e forme estese restano integri. Nessuna mutazione della storia salvata.
        if (String(url).includes('/chat/completions') && typeof init.body === 'string') {
          let corpo;
          try { corpo = JSON.parse(init.body); } catch { /* Il trasporto gestisce il JSON malformato. */ }
          if (typeof corpo?.model === 'string' && separaFonteModello(corpo.model).fonte === 'openrouter'
              && /^z-ai\/glm-/.test(separaFonteModello(corpo.model).modelloRemoto) && Array.isArray(corpo.messages)) {
            let cambiato = false;
            const messages = corpo.messages.map(m => {
              const p = Array.isArray(m?.content) && m.content.length === 1 ? m.content[0] : null;
              if (m?.role !== 'system' || p?.type !== 'text' || typeof p.text !== 'string'
                  || Object.keys(p).length !== 3 || p.cache_control?.type !== 'ephemeral'
                  || p.cache_control.ttl !== '1h' || Object.keys(p.cache_control).length !== 2) return m;
              cambiato = true;
              return { ...m, content: p.text };
            });
            if (cambiato) init = { ...init, body: JSON.stringify({ ...corpo, messages }) };
          }
        }
        // BC-48 C-bis: fine della normalizzazione per la cache implicita GLM.
        if (input?.contextHooks && String(url).includes('/chat/completions') && typeof init.body === 'string') {
          let body;
          try { body = JSON.parse(init.body); } catch { /* Preserve the existing malformed-body path. */ }
          if (typeof body?.model === 'string' && separaFonteModello(body.model).fonte === 'openrouter') {
            const plugins = (Array.isArray(body.plugins) ? body.plugins : []).filter(plugin => plugin?.id !== 'context-compression');
            init = { ...init, body: JSON.stringify({ ...body, plugins: [...plugins, { id: 'context-compression', enabled: false }] }) };
          }
        }
        if (!resolveImagesFn || !String(url).includes('/chat/completions') || typeof init.body !== 'string') return successiva(url, init);
        let body;
        try { body = JSON.parse(init.body); } catch { return successiva(url, init); }
        if (!Array.isArray(body.messages)) return successiva(url, init);
        const hasImages = body.messages.some(m => Array.isArray(m.content) && m.content.some(p => p?.type === 'image_url'));
        if (hasImages) {
          const capability = await Promise.resolve(modelCapabilityFn(body.model)).catch(() => null);
          if (capability?.inputModalities?.length && !capability.inputModalities.includes('image')) {
            throw new OwnerRuntimeUnavailableError('Il modello selezionato non accetta immagini. Scegli un modello con visione.', 'MODEL_IMAGE_NOT_SUPPORTED');
          }
        }
        const messages = await resolveImagesFn(body.messages);
        return successiva(url, { ...init, body: JSON.stringify({ ...body, messages }) });
      };
      if (fetchInstradata.eseguiConFallback) {
        // Anche il tentativo passato al kernel deve conservare il risolutore delle immagini.
        fetchConImmagini.eseguiConFallback = (chiama, opzioni) => fetchInstradata.eseguiConFallback(aggiunte =>
          chiama({ ...aggiunte, fetchDiRete: (url, init) => fetchConImmagini(url, init, aggiunte.fetchDiRete) }), opzioni);
      }
      // BC-48 A: lo stesso confine di fetchConImmagini, ma PRIMA della serializzazione:
      // una modifica soltanto del body non resterebbe nello storico della sessione.
      // Gli hook legacy non vengono inventati: ciò disabiliterebbe la loro compattazione.
      let contextHooks = input?.contextHooks;
      if (contextHooks && input?.cartella && !input?.mobile) {
        const [file, radice] = await Promise.all([
          trovaIstruzioniDiProgetto(input.cartella), trovaRadiceProgetto(input.cartella),
        ]);
        contextHooks = collegaSezioniAiContextHooks({ contextHooks, file, cartella: input.cartella, radice: radice ?? input.cartella });
      }
      return richiama('talosLavora', { ...input, contextHooks, fetchDiRete: fetchConImmagini });
      // BC-48 A · fine collegamento.
    },
    /** One bounded summary request through the same provider adapters as chat. */
    async callContextModel({ provider, model, messages, maxOutputTokens, signal, fetchDiRete = fetch }) {
      const fail = (code, message, usage) => { throw Object.assign(new Error(message), { code, ...(usage !== undefined ? { usage } : {}) }); };
      if (!FONTI_MODELLO.includes(provider) || typeof model !== 'string' || !model.trim() || !Array.isArray(messages) || !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1) fail('CTX_MODEL_INVALID', 'Richiesta di sintesi non valida.');
      if (!destinazioneModelloDeps) fail('CTX_TRANSPORT_UNAVAILABLE', 'Il trasporto del modello non è collegato al compattatore.');
      signal?.throwIfAborted();
      const routed = creaFetchMultiProvider(fetchDiRete, { dipendenze: destinazioneModelloDeps });
      const key = provider === 'openrouter' ? destinazioneModelloDeps.leggiChiave?.('openrouter') : null;
      if (provider === 'openrouter' && !key) fail('CTX_TOKEN_AUTH', 'La chiave del provider selezionato non è disponibile.');
      /*
       * ⛔ 09/09/2026 — trovato dal giro vero D1 (z-ai/glm-5.3-flash via OpenRouter): la sintesi tornava
       *   SENZA testo, perché il modello ragiona per difetto e il ragionamento si mangiava il budget della
       *   risposta. Spegnerlo non si può («Reasoning is mandatory for this endpoint and cannot be
       *   disabled», HTTP 400, misurato). Misurato con quattro chiamate: senza campo reasoning 133 token
       *   di ragionamento e a volte `finish_reason: length`; con `reasoning.effort: 'low'` ZERO token di
       *   ragionamento, `finish_reason: stop`, costo più basso. Una sintesi non ha bisogno di pensare a
       *   lungo: chiede poco, nel rispetto delle capacità del catalogo (`normalizzaReasoningPerModello`
       *   toglie un effort che il modello non supporta, mai `none` a chi lo vieta).
       *   Fonte 09/09/2026: openrouter.ai/docs/use-cases/reasoning-tokens — «low: approximately 20% of
       *   max_tokens», `effort: 'none'` disabilita e va evitato sui modelli «mandatory».
       */
      const capability = provider === 'openrouter' ? await Promise.resolve(modelCapabilityFn(model)).catch(() => null) : null;
      const reasoning = provider === 'openrouter' ? normalizzaReasoningPerModello({ effort: 'low' }, capability) : undefined;
      const response = await routed(ENDPOINT_OPENROUTER, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({ model: provider === 'openrouter' ? model : `${provider}:${model}`, messages: structuredClone(messages), tools: [], max_tokens: maxOutputTokens, stream: false, ...(reasoning ? { reasoning } : {}), ...(provider === 'openrouter' ? { transforms: [], plugins: [{ id: 'context-compression', enabled: false }] } : {}) }),
        /*
         * ⛔ P0 · punto 7 (16/09/2026) — la compattazione del contesto aveva anch'essa 180 s fissi.
         * È la chiamata che si fa proprio quando la conversazione è DIVENTATA GRANDE: il caso in cui
         * il modello ci mette di più è esattamente quello per cui serve. Stesso failsafe del resto,
         * e lo `signal` del chiamante (che porta lo Stop) resta il primo a poter chiudere.
         */
        signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(leggiInattivitaGenerazioneMs() || 1_800_000)]),
      });
      if (!response.ok) {
        await response.body?.cancel();
        fail('CTX_SUMMARY_HTTP', `Il modello di sintesi ha risposto con HTTP ${response.status}.`);
      }
      let result;
      try { result = await response.json(); } catch { fail('CTX_SUMMARY_RESPONSE_INVALID', 'Risposta di sintesi non leggibile.'); }
      const choice = result?.choices?.[0];
      const usage = result?.usage;
      if (choice?.message?.tool_calls?.length) fail('CTX_SUMMARY_TOOLS', 'La sintesi non può eseguire strumenti.', usage);
      // 09/09 — il caso visto dal vivo: niente testo ma token di ragionamento spesi. Non è una risposta
      //   «invalida» da guardare nel codice: è un budget finito nel pensiero, e va detto in quelle parole.
      const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens;
      if (typeof choice?.message?.content !== 'string' && Number.isSafeInteger(reasoningTokens) && reasoningTokens > 0) {
        fail('CTX_TRUNCATED_SUMMARY', `Il modello ha speso ${reasoningTokens} token nel ragionamento e non ha lasciato spazio alla sintesi.`, usage);
      }
      if (typeof choice?.message?.content !== 'string' || typeof choice?.finish_reason !== 'string') fail('CTX_SUMMARY_RESPONSE_INVALID', 'La sintesi non dichiara testo e stato finale.', usage);
      return { text: choice.message.content, finishReason: choice.finish_reason, usage };
    },
    async eseguiComandoSandboxato(...args) { return richiama('eseguiComandoSandboxato', ...args); },
    async eseguiFlowForge(...args) {
      if (specifier) return richiama('eseguiFlowForge', ...args);
      return eseguiFlowForgeLocale(...args);
    },
    validaManifestForge(manifest) { return validaManifestForgeLocale(manifest); },
    async chiamaConRitenta(options) {
      if (specifier) return richiama('chiamaConRitenta', options);
      return chiamaConRitentaLocale(options);
    },
    async compattaConversazione(messaggi, chiamaModello) {
      if (specifier) return richiama('compattaConversazione', messaggi, chiamaModello);
      return compattaConversazioneLocale(messaggi, chiamaModello);
    },
    forgeToolPrefix: FORGE_PREFISSO_NOME_TOOL,
  });
}

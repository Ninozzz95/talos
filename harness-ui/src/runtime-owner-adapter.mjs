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
import { pathToFileURL } from 'node:url';
import { isAbsolute } from 'node:path';
import { createParser } from 'eventsource-parser';
import { eseguiFlowForgeLocale, FORGE_PREFISSO_NOME_TOOL, validaManifestForgeLocale } from './forge-contract.mjs';
import { parseRuntimeOwnerSnapshot } from './runtime-owner-contract.mjs';
import { risolviDestinazioneModello, separaFonteModello } from './model-destination.mjs';

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
      signal: AbortSignal.timeout(180_000),
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

function promessaConInattivita(promise, { timeoutMs, controller, userSignal }) {
  return new Promise((resolve, reject) => {
    let conclusa = false;
    const pulisci = () => {
      clearTimeout(timer);
      userSignal?.removeEventListener('abort', fermaUtente);
    };
    const chiudi = (azione, valore) => {
      if (conclusa) return;
      conclusa = true;
      pulisci();
      azione(valore);
    };
    const fermaUtente = () => {
      const reason = userSignal.reason ?? new DOMException('Fermato dall’utente', 'AbortError');
      controller.abort(reason);
      chiudi(reject, reason);
    };
    const timer = setTimeout(() => {
      const error = new OpenRouterIdleTimeoutError(timeoutMs);
      controller.abort(error);
      chiudi(reject, error);
    }, timeoutMs);
    if (userSignal?.aborted) {
      fermaUtente();
      return;
    }
    userSignal?.addEventListener('abort', fermaUtente, { once: true });
    Promise.resolve(promise).then((value) => chiudi(resolve, value), (error) => chiudi(reject, error));
  });
}

function eventoConOutput(packet) {
  const delta = packet?.choices?.[0]?.delta;
  if (!delta || typeof delta !== 'object') return false;
  return Boolean(delta.content || delta.reasoning || delta.reasoning_content || (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0));
}

async function preparaRispostaSse(response, { timeoutMs, controller, userSignal }) {
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
    const result = await promessaConInattivita(reader.read(), { timeoutMs, controller, userSignal });
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
      const response = await promessaConInattivita(
        fetchDiRete(url, { ...nextInit, signal: controller.signal }),
        { timeoutMs, controller, userSignal },
      );
      const contentType = response.headers?.get?.('content-type') ?? '';
      if (!response.ok || !contentType.toLowerCase().includes('text/event-stream')) return response;
      return preparaRispostaSse(response, { timeoutMs, controller, userSignal });
    } catch (error) {
      if (userSignal?.aborted) throw userSignal.reason ?? error;
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
export function creaFetchMultiProvider(fetchDiRete = fetch, { risolvi = risolviDestinazioneModello, dipendenze = null } = {}) {
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
     * memory" alla prima richiesta, nessun passo separato — Hermes stesso
     * NON lo risolve ancora, richiede Ollama configurato a mano: qui lo
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
    if (destinazione.fonte === 'openrouter') return fetchDiRete(url, opzioni);
    const corpoRiscritto = JSON.stringify({ ...corpo, model: destinazione.modelloRemoto });
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
      return dipendenze.chiamaLocale(destinazione.percorso, { ...opzioni, headers: { 'Content-Type': 'application/json' }, body: corpoRiscritto });
    }
    return fetchDiRete(destinazione.url, {
      ...opzioni,
      headers: { ...destinazione.headers },
      body: corpoRiscritto,
    });
  };
}

export function createOwnerRuntimeAdapter({
  modulePath = process.env.TALOS_OWNER_RUNTIME_MODULE ?? null,
  importFn = (specifier) => import(specifier),
  openRouterRuntimeFn = () => ({ timeoutSeconds: OPENROUTER_IDLE_MS_PREDEFINITO / 1_000 }),
  modelCapabilityFn = async () => null,
  /**
   * ⭐ 03/9 — da dove si leggono chiave, indirizzo e motore locale per
   * instradare un modello non-OpenRouter. ⛔ Assente = comportamento di
   * sempre, byte per byte: chi non le passa non cambia di una virgola.
   */
  destinazioneModelloDeps = null,
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
     * offerti a ogni giro» — la stessa domanda a cui Hermes Agent v0.21
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
      const fetchInstradata = creaFetchMultiProvider(fetchResiliente, { dipendenze: destinazioneModelloDeps });
      return richiama('talosLavora', { ...input, fetchDiRete: fetchInstradata });
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

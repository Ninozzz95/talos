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
import { REGISTRO_FORNITORI, ID_MOTORI_LOCALI_OPENAI, idPerWire } from './provider-registry.mjs';
import { classificaErroreDiCorsa } from './research-orchestrator.mjs';
import { leggiAttesaRichiestaDalFornitore, leggiAttesaResetDalCorpo, erroreEsitoProviderIncerto, consumoPubblico, marcaRifiutoProvider } from './provider-retry.mjs';
import { normalizzaUsage, scontoDaCache } from './usage-cache.mjs'; // 12/09, P-B: i nomi della cache sono uno per fornitore, il lettore uno solo
import { nativeProviderResponse, stripNativeMetadata } from './native-provider-adapter.mjs';
import { preparaRichiestaCompatibile, OpenAiCompatibleRuntimeError, aliasGrafiaRagionamento, livelloRagionamentoMinimo, livelloRagionamentoPiuVicino } from './openai-compatible-runtime.mjs'; // P-D (12/09): Z.AI accetta solo alcuni livelli di ragionamento — BUG-18 gen.2: alias, minimo e clamp in UNA scala condivisa (D5)
import { opzioniRagionamentoPerSintesi } from './context-token-counters.mjs'; // F3 (24/09): le stesse opzioni del corpo contato, fuori OpenRouter
// P-L · ponte locale senza listener, sessione esterna posseduta dalla Response.
import { rispostaAgenteAcp } from './acp-agent.mjs';
// P-L · fine import instradamento.
// BC-48 A · sezioni di progetto nel canale degli originali, prima della richiesta.
import { trovaIstruzioniDiProgetto, trovaRadiceProgetto } from './istruzioni-di-progetto.mjs';
import { collegaSezioniAiContextHooks } from './context-provider-adapter.mjs';
// ⭐ 06/10/2026 — la ricarica della memoria post-compact (opzione A + C-b, ricerca 5×5×5×5 §6.4): la
// compattazione LOCALE riceve lo stesso punto di aggancio del kernel, con lo stesso blocco di fatti.
import { PREFISSO_SINTESI_RECINTATA, costruisciBloccoFatti } from './kernel/ricarica-post-compact.mjs';
// P0 · punto 7 (16/09): il failsafe di inattività e il dispatcher stanno in una porta sola.
import {
  SilenzioDelFornitoreError,
  dispatcherDiGenerazione,
  leggiInattivitaGenerazioneMs,
  sorvegliaCorpoDiGenerazione,
  sorvegliaInattivita,
} from './generation-idle.mjs';

const ENDPOINT_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';
/* ⭐ 06/10/2026 — C-a della cura post-compact (ricerca 5×5×5×5 §6.4, zero-cost): le stesse regole verbatim
 * del kernel, qui su una riga. Le richieste pendenti e le azioni irreversibili (commit/push CON hash) NON
 * si affidano al caso del riassunto (opencode `summary.txt:10-11`; prompt di codex `compact/prompt.md`). */
const RICHIESTA_DI_RIASSUNTO = [
  'Summarize the conversation, keeping the decisions, files and results that matter for the work.',
  'Any question left unanswered to the person must be quoted VERBATIM; every irreversible action taken',
  '(commit, push, publish, delete) must be named VERBATIM with its identifier — the full commit hash.',
].join('\n');
const GIRI_PRIMA_DI_COMPATTARE = 12;
const OPENROUTER_IDLE_MS_PREDEFINITO = 60_000;
const SSE_BUFFER_MASSIMO = 1_048_576;
const SCHEMA_DESCRIZIONE_COMANDO = Object.freeze({
  type: 'string',
  /* Revisione K3 (03/10/2026): la descrizione resta IN ITALIANO come prima (la lingua del testo a schermo è una decisione
     dell'owner, chiesta a parte); cambia solo la lingua dell'istruzione, che è per il modello. */
  description: 'Short description of the goal of this command, in Italian, in the present tense and understandable to the user. Do not copy the technical command.',
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
    super(`OpenRouter sent no activity for ${Math.max(1, Math.round(timeoutMs / 1_000))} seconds.`);
    this.name = 'OpenRouterIdleTimeoutError';
    this.code = 'OPENROUTER_IDLE_TIMEOUT';
  }
}

function rispostaRitentabile(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

/**
 * ⛔⛔⛔ BC-79.2 (17/09/2026) — LE FONTI CHE GIRANO SU QUESTO COMPUTER, DERIVATE DAL REGISTRO.
 *
 * Non è un elenco: è una domanda fatta al registro dei fornitori. `idPerWire('locale')` è il ponte
 * del supervisore llama-server (`local`, la cui `--api-key` non esce di lì), `ID_MOTORI_LOCALI_OPENAI`
 * sono quelli che girano in casa e parlano il wire OpenAI (`ollama`, `lmstudio`). Misurato il
 * 17/09/2026: `["local","ollama","lmstudio"]`.
 *
 * ⛔ Scriverli a mano sarebbe la quattordicesima copia dello stesso insieme — è il difetto che
 *   `provider-registry.mjs` esiste per chiudere, e che `fonteLocaleDelRuntime` (BC-76) ha già
 *   chiuso per il registro delle sessioni. Un motore locale aggiunto domani entra qui da solo.
 */
export const FONTI_DI_MOTORE_LOCALE = Object.freeze(new Set([...idPerWire('locale'), ...ID_MOTORI_LOCALI_OPENAI]));

/**
 * L'unica frase che chi legge vedrà: dice che cosa cambia per LEI, non che cosa è successo al
 * protocollo. ⛔ Nessun nome tecnico (`tools`, `--jinja`, `HTTP`), nessun modello «consigliato» e
 * nessun elenco di modelli che reggono gli attrezzi (owner 11/09: «non forziamo nulla»).
 */
/* ⛔ BUG-7 cura2, revisore C2-2 (05/10/2026): esportato perché la prova di cablaggio (tests/bc79-2) asserisca
   l'IDENTITÀ del messaggio, non una copia fragile del suo testo. K4b: frase inglese + chiave per la persona. */
export const AVVISO_MOTORE_SENZA_ATTREZZI = Object.freeze({ testo: 'This model does not use tools: this remains a chat. It can answer, but it cannot read files or run commands.', testoChiave: 'server.runtime.notice.noTools' });

/**
 * ⛔⛔⛔ BC-79.2 — LA RIPROVA SENZA ATTREZZI, E PERCHÉ NON SI LEGGE IL TESTO DELL'ERRORE.
 *
 * ## Il difetto, MISURATO sulla base `f29c8e91` prima di scrivere
 *
 * Un motore locale che risponde 400 a una richiesta con `tools` arrivava a schermo come
 * `[internal-error] HTTP 400 dopo 4 tentativi: {…grezzo del server…}`. Misurato con una sonda
 * sulla strada vera (registro, kernel, adattatore, motore finto su 127.0.0.1) contando le
 * richieste che il motore riceve davvero: **1** per 400/401/404, **4** per 429/503.
 * ⇒ I quattro tentativi NON ESISTEVANO: `siRitenta` (kernel) escludeva già i 4xx-risposta. A
 *   mentire era il MESSAGGIO, che stampava la costante `tentativiMassimi` invece dei tentativi
 *   fatti — «una misura che non può smentirti», corretta nel kernel nella sola riga del ritento.
 *
 * ## La cura, e i suoi confini
 *
 * Solo per una fonte di MOTORE LOCALE, solo su un **400**, solo se la richiesta portava `tools`:
 * UNA riprova identica senza `tools` né `tool_choice`.
 *  · riesce ⇒ il giro prosegue come chat, si dice UNA volta con una frase umana, e per il resto
 *    del giro di sessione `tools` non si manda più. ⛔ Questa memoria non è un ottimizzazione: la
 *    ricerca del 17/09 dice che *«simply retrying without changes will loop»* — senza memoria ogni
 *    giro rifarebbe il suo 400 e la riprova diventerebbe il doppio delle chiamate, per sempre.
 *  · fallisce anche senza ⇒ l'errore ORIGINALE con un codice SUO e una frase umana; il grezzo resta
 *    sull'errore (`dettaglio`) e non arriva a schermo.
 *
 * ⛔ MAI sul cloud: un fornitore remoto che rifiuta gli attrezzi è un errore da dire, non da
 *   aggirare togliendo metà del prodotto a chi non l'ha chiesto.
 * ⛔ MAI dal TESTO dell'errore. Un 400 con `tools` nel corpo ha altre cause (una regex PCRE che
 *   llama.cpp non compila in GBNF, un template che lancia sull'ordine dei messaggi, il formato
 *   dell'esito di un attrezzo): un filtro sulla frase «does not support tools» riconoscerebbe la
 *   MENZIONE invece della cosa, e lascerebbe morire tutti gli altri. Si riconosce dal
 *   COMPORTAMENTO — la stessa richiesta senza `tools` riesce. Prova: BC79-03.
 * ⛔ Nessun secondo esecutore di attrezzi, nessun modello «consigliato», nessun template forzato.
 */
class MotoreLocaleRifiutaError extends Error {
  constructor(stato, dettaglio, tentativi = [{ stato, dettaglio }]) {
    super('The local engine did not accept this request, not even as a plain chat.');
    this.name = 'MotoreLocaleRifiutaError';
    this.code = 'LOCAL_ENGINE_REJECTED_REQUEST';
    this.stato = stato;
    /* ⛔ Il grezzo del server si CONSERVA (serve a chi apre una segnalazione) ma non viaggia nel
       messaggio: `agent-service` mette il solo `message` dentro `RunError`, e lì finisce a schermo. */
    this.dettaglio = dettaglio;
    // Diagnostica interna: non entra nella serializzazione pubblica dell'errore.
    Object.defineProperty(this, 'tentativi', { value: Object.freeze(tentativi.map(t => Object.freeze({ ...t }))) });
  }
}

/*
 * ⛔⛔⛔ 25/09/2026 sera — IL CONTESTO PIENO NON È UN RIFIUTO DEGLI ATTREZZI. Sessione VERA dell'owner (5233facd, MiniCPM5 sul
 *   4174): «Questo modello non usa gli attrezzi» dopo VENTIDUE chiamate di attrezzi riuscite. La finestra era di 16.384 token,
 *   la conversazione l'ha superata e llama-server ha risposto 400 `exceed_context_size_error`; la riprova di BC-79.2 senza
 *   attrezzi accorcia il prompt (misurato su b10517: 2.777 → 2.086 token con UN attrezzo, con 45 sono migliaia) e «riesce»:
 *   il comportamento che BC-79.2 usa come prova era falsato proprio in questo caso.
 * ⇒ Si riconosce dal campo STRUTTURATO `error.type` del corpo (non dalla frase, la stessa regola di BC-79.2), prima di ogni
 *   riprova, e sale col suo codice: il kernel lo classifica come contesto pieno (`compattazione-desktop.mjs`), comprime e
 *   riprova una volta — ciò che fa Hermes (`agent/error_classifier.py` `context_overflow`, `should_compress=True`, clone
 *   65ad529 del 23/09/2026). Se non basta, resta questa frase coi numeri del motore. Gli attrezzi non si toccano.
 */
class ContestoLocalePienoError extends Error {
  constructor(promptToken, finestraToken, dettaglio) {
    const quanti = (n) => (Number.isSafeInteger(n) && n > 0 ? ` (${n} tokens)` : '');
    super(`The conversation${quanti(promptToken)} does not fit in the local model’s window${quanti(finestraToken)}.`);
    this.name = 'ContestoLocalePienoError';
    this.code = 'LOCAL_CONTEXT_EXCEEDED';
    this.stato = 400;
    this.promptToken = Number.isSafeInteger(promptToken) ? promptToken : null;
    this.finestraToken = Number.isSafeInteger(finestraToken) ? finestraToken : null;
    this.dettaglio = dettaglio;
  }
}

/** Il 400 di llama-server per un prompt più lungo della finestra, dal suo campo `type`; null se è un altro 400. */
function contestoLocalePieno(dettaglio) {
  let corpo = null;
  try { corpo = JSON.parse(dettaglio); } catch { return null; }
  const errore = corpo?.error;
  if (errore?.type !== 'exceed_context_size_error') return null;
  return new ContestoLocalePienoError(Number(errore.n_prompt_tokens), Number(errore.n_ctx), dettaglio);
}

/** Legge soltanto il prefisso diagnostico, poi rilascia il corpo della risposta. */
async function leggiDettaglioRifiuto(risposta, limite = 2_000) {
  const reader = risposta.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let testo = '', letti = 0, concluso = false;
  try {
    while (letti < limite) {
      const { done, value } = await reader.read();
      if (done) { concluso = true; break; }
      const parte = value.subarray(0, limite - letti);
      testo += decoder.decode(parte, { stream: true });
      letti += parte.byteLength;
    }
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError' || error?.code === 'PROVIDER_SILENCE') throw error;
    // Per un corpo danneggiato restano disponibili status e prefisso già letto.
  } finally {
    if (!concluso) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return testo + decoder.decode();
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
      if (!scelta) throw new Error('The provider did not return a usable response.');
      return { scelta, usage: corpo?.usage ?? null, tentativi: tentativo + 1 };
    }
    ultimoStato = risposta.status;
    ultimoTesto = typeof risposta.text === 'function' ? String(await risposta.text()).slice(0, 300) : '';
    if (!rispostaRitentabile(risposta.status)) break;
    if (tentativo < tentativiMassimi - 1) await dormi(attesaEsponenziale(tentativo));
  }
  const errore = new Error(`The provider is not responding (status ${ultimoStato ?? 'unknown'}). ${ultimoTesto}`.trim());
  errore.stato = ultimoStato;
  errore.limitatoDalFornitore = rispostaRitentabile(ultimoStato);
  throw errore;
}

export async function compattaConversazioneLocale(messaggi, chiamaModello, fontiRicarica = null) {
  let risposta;
  let usage = null;
  try {
    ({ scelta: risposta, usage } = await chiamaModello([...messaggi, { role: 'user', content: RICHIESTA_DI_RIASSUNTO }]));
  } catch {
    return { messaggi, compattato: false, usage: null };
  }
  const riassunto = String(risposta?.content ?? '').trim();
  if (!riassunto) return { messaggi, compattato: false, usage };
  /* ⭐ 06/10/2026 — opzione A: come `compattaConversazione` del kernel, stesso recinto e stesso blocco di
   * fatti fusi nello STESSO messaggio (un solo cache-break). Fail-soft per costruzione: senza fonti il
   * messaggio resta quello di prima (contratto K3); con fonti che falliscono, il blocco lo dice onesto. */
  let corpo = riassunto;
  if (fontiRicarica) {
    let blocco = null;
    try {
      blocco = await costruisciBloccoFatti(fontiRicarica);
    } catch (errore) {
      blocco = { testo: `(post-compaction facts block unavailable: ${String(errore?.message ?? errore ?? 'unknown').slice(0, 160)})`, fontiLette: [], fontiNonLette: [] };
    }
    corpo = `${PREFISSO_SINTESI_RECINTATA}\n\n${riassunto}\n\n${blocco.testo}`;
  }
  return {
    messaggi: [
      messaggi[0],
      messaggi[1],
      { role: 'user', content: `[conversation compacted at turn ${GIRI_PRIMA_DI_COMPATTARE}: what follows is a summary, not the original history]\n\n${corpo}` },
    ],
    compattato: true,
    usage,
  };
}

function normalizzaModuloPath(modulePath) {
  if (modulePath === null || modulePath === undefined || modulePath === '') return null;
  if (typeof modulePath !== 'string' || !isAbsolute(modulePath) || modulePath.includes('\0')) {
    throw new OwnerRuntimeUnavailableError('The runtime module must be an absolute path.', 'OWNER_RUNTIME_PATH_INVALID');
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
/*
 * ⭐ K3b (03/10/2026), decisione owner «Lingua dell'interfaccia»: la descrizione che il modello scrive sotto ogni comando è
 *   nella lingua dell'INTERFACCIA. `lingua` arriva dal giro (`input.linguaInterfaccia`); senza, resta l'italiano di prima.
 */
const SCHEMA_DESCRIZIONE_COMANDO_EN = Object.freeze({
  ...SCHEMA_DESCRIZIONE_COMANDO,
  description: 'Short description of the goal of this command, in English, in the present tense and understandable to the user. Do not copy the technical command.',
});
export function schemaDescrizioneComando(lingua) {
  return lingua === 'en' ? SCHEMA_DESCRIZIONE_COMANDO_EN : SCHEMA_DESCRIZIONE_COMANDO;
}

export function adattaRichiestaConDescrizioneComando(body, { lingua } = {}) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.tools)) return body;
  let modificata = false;
  const tools = body.tools.map((tool) => {
    const funzione = tool?.type === 'function' ? tool.function : null;
    const parametri = funzione?.name === 'shell' ? funzione.parameters : null;
    if (!parametri || typeof parametri !== 'object' || parametri.type !== 'object') return tool;
    const proprieta = parametri.properties && typeof parametri.properties === 'object' ? parametri.properties : {};
    const richiesti = Array.isArray(parametri.required) ? parametri.required : [];
    const descrizione = proprieta.descrizione ?? schemaDescrizioneComando(lingua);
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
export function creaFetchConDescrizioneComando(fetchDiRete = fetch, { lingua } = {}) {
  if (typeof fetchDiRete !== 'function') throw new TypeError('fetchDiRete must be a function.');
  return async (url, init = undefined) => {
    if (typeof init?.body !== 'string') return fetchDiRete(url, init);
    let body;
    try { body = JSON.parse(init.body); } catch { return fetchDiRete(url, init); }
    const adattato = adattaRichiestaConDescrizioneComando(body, { lingua });
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

/*
 * ⛔ 24/09/2026 notte — MAI UN COSTO PIÙ ALTO DI QUELLO SCELTO (owner: «Sì, come il mobile», dopo la segnalazione della sessione
 *   mobile). Prima, su un modello a ragionamento obbligatorio, «none» e ogni livello non supportato diventavano il
 *   `default_effort` del catalogo: per `z-ai/glm-5.3-flash` (`supported_efforts: [max, high, low]`, `default_effort: max`,
 *   misurato dalla sessione mobile il 24/09 su `GET /api/v1/models`) «Off» → max e «medium» → max, cioè il più CARO.
 * ⇒ La regola di Hermes Agent `clamp_effort` (`agent/reasoning_effort.py:120-160`, PR #90350 del 20/08/2026, letta nel
 *   clone del 24/09): un livello supportato passa com'è; altrimenti il più vicino PIÙ DEBOLE; se non c'è niente di più
 *   debole, il minimo supportato; «none» non è mai la meta di un degrado. «Off» su un modello obbligatorio → il minimo
 *   supportato (OpenRouter, «Reasoning tokens», letta il 24/09: «When `true`, hide disable controls and do not send
 *   `effort: "none"` — the model rejects it»; un livello non supportato prende un 400).
 *   Nessun `reasoning` nella richiesta resta come prima: il `default_effort` del catalogo (la stessa scelta del mobile,
 *   commit `bf3a42c00` su `lane/talos-mobile-allineamento`). Un nome fuori dalla scala resta sul default, come prima.
 */
const SCALA_RAGIONAMENTO = Object.freeze(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
/** Il livello supportato più vicino e mai più caro di quello chiesto (Hermes `clamp_effort`); `null` se non si può dire.
 *  ⛔ BUG-18 gen.2 (revisore D5): alias, minimo e clamp vivono in UNA funzione condivisa con
 *  openai-compatible-runtime.mjs (`aliasGrafiaRagionamento` / `livelloRagionamentoMinimo` /
 *  `livelloRagionamentoPiuVicino`) — le due scale gemelle non devono poter più divergere. */
export function livelloRagionamentoSenzaSalire(chiesto, supportati) {
  if (!SCALA_RAGIONAMENTO.includes(chiesto)) return null;
  const livelli = (supportati ?? []).filter((l) => typeof l === 'string' && l !== 'none' && SCALA_RAGIONAMENTO.includes(l));
  if (!livelli.length) return null;
  if (chiesto === 'none') return livelloRagionamentoMinimo(livelli);
  return livelloRagionamentoPiuVicino(chiesto, livelli);
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
    // mai più caro: il più vicino più debole, o il minimo supportato; senza un elenco dichiarato resta il default del catalogo
    const livello = livelloRagionamentoSenzaSalire(effort, supported) ?? defaultEffort;
    if (livello) result.effort = livello;
    else delete result.effort;
  }
  if (regole.mandatory === true && !('effort' in result) && !('enabled' in result)) result.enabled = true;
  return result;
}

function rispostaErrore(status, error) {
  const message = typeof error?.message === 'string' && error.message.trim()
    ? error.message.trim()
    : 'The provider did not complete the response.';
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
        // HTTP200 already accepted the generation: let the kernel handle its error,
        // including any subsequent usage, without synthesizing a retryable HTTP status.
        outputVisibile = true;
      }
      if (eventoConOutput(packet)) outputVisibile = true;
      emetti(`data: ${event.data}\n\n`);
    },
    onError(error) {
      if (error.type === 'max-buffer-size-exceeded') streamError = error;
    },
  });

  const leggi = async () => {
    const result = await promessaConInattivita(reader.read(), {
      timeoutMs: inattivitaMs, controller, userSignal,
      creaErrore: (ms) => new SilenzioDelFornitoreError(ms),
    });
    if (result.done) {
      done = true;
      parser.reset();
      return;
    }
    parser.feed(decoder.decode(result.value, { stream: true }));
  };

  try {
    while (!outputVisibile && !streamError && !done) await leggi();
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    if (userSignal?.aborted) throw userSignal.reason ?? error;
    /* ⛔ Il silenzio NON si traveste da risposta HTTP: deve arrivare a `classificaGuasto` col suo
       codice, o diventerebbe un «502» generico e perderebbe la classe `rete` che lo rende ripreso. */
    if (error instanceof SilenzioDelFornitoreError) throw error;
    throw erroreEsitoProviderIncerto(error);
  }

  if (streamError && !outputVisibile) {
    await reader.cancel(streamError).catch(() => {});
    throw erroreEsitoProviderIncerto(streamError);
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
 * Decisione 14: `provider.ignore` con l'elenco degli esclusi aggiunto a quello che la richiesta portava già (unione, senza doppioni).
 * Lo STESSO oggetto se non c'è niente da aggiungere: chi confronta per identità vede che il corpo non è cambiato.
 */
export function unisciEsclusi(provider, esclusi) {
  const lista = Array.isArray(esclusi) ? esclusi.filter((s) => typeof s === 'string' && s) : [];
  if (!lista.length) return provider;
  const base = provider && typeof provider === 'object' && !Array.isArray(provider) ? provider : {};
  const gia = Array.isArray(base.ignore) ? base.ignore.filter((s) => typeof s === 'string') : [];
  const ignore = [...new Set([...gia, ...lista])];
  if (ignore.length === gia.length && Array.isArray(base.ignore) && provider === base) return provider;
  return { ...base, ignore };
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
  /*
   * ⛔ Decisione 14 dell'owner (08/10/2026 sera): i fornitori a valle che la persona ha escluso, mandati a OpenRouter come
   *   `provider.ignore` (docs «Provider Routing», 08/10). Solo QUI, il trasporto di OpenRouter: un altro fornitore non conosce
   *   il campo (Hermes lo mette solo nel suo plugin OpenRouter, `plugins/model-providers/openrouter/__init__.py:140`). Letti a
   *   ogni richiesta: un'esclusione appena aggiunta vale dalla chiamata dopo, senza riavviare niente.
   */
  esclusiFn = async () => [],
} = {}) {
  if (typeof fetchDiRete !== 'function') throw new TypeError('fetchDiRete must be a function.');
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
        const esclusi = await Promise.resolve(esclusiFn()).catch(() => []);
        const provider = unisciEsclusi(body?.provider, esclusi);
        if (reasoning !== body?.reasoning || provider !== body?.provider) {
          nextInit = { ...init, body: JSON.stringify({ ...body, reasoning, ...(provider ? { provider } : {}) }) };
        }
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
      if (error?.esitoIncerto) throw error;
      if (error instanceof SilenzioDelFornitoreError) throw error;
      if (error instanceof OpenRouterIdleTimeoutError) return rispostaErrore(408, { message: 'OpenRouter stayed idle past the configured limit.' });
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
/*
 * ⛔ 17/09 — `sorvegliaCorpo` è INIETTABILE, e non per comodità: due contratti veri si contraddicono
 *   per costruzione. Il guardiano dell'inattività (P0 · punto 7) deve VEDERE i byte che passano, e
 *   l'unico modo che la piattaforma dà è `body.pipeThrough(...)` dentro una `Response` nuova — il
 *   corpo è un getter di sola lettura e il piping «locks the stream for the duration of the pipe»
 *   (MDN, «ReadableStream: pipeThrough() method» e «Using readable streams», lette il 17/09/2026).
 *   Lo strato della cache (P-B) promette invece che un flusso SSE o un errore escano «LA STESSA
 *   risposta, non una ricostruita» (PG-12, CACHE-08): quel contratto vale per la CACHE, che non deve
 *   rimontare un flusso che non ha prodotto — non per il guardiano, che lo attraversa intatto
 *   (P0-D-20: stessi byte, stesso stato, stessi header). ⇒ Le prove della cache iniettano il
 *   guardiano identità e misurano il loro contratto; il guardiano vero si prova da solo (P0-D-15/16).
 */
function creaFetchInstradata(fetchDiRete = fetch, { risolvi = risolviDestinazioneModello, dipendenze = null, onAvviso = null, instradaOpenRouter = false, inattivitaGenerazioneMs = null, sorvegliaCorpo = sorvegliaCorpoDiGenerazione,
  /*
   * BC-79.2 — la memoria del giro di sessione, CONDIVISA e non di questa chiusura: sulla strada del
   * multi-provider `creaFetchInstradata` viene ricostruita a OGNI richiesta (`invia`), quindi una
   * variabile locale ricorderebbe per un solo giro e il 400 tornerebbe a ogni turno. Chi non la
   * passa (nessuno oggi, oltre ai test) ottiene il comportamento di prima, byte per byte.
   */
  memoriaAttrezzi = { rifiutati: false } } = {}) {
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
      await dipendenze.avviaLocale(modelloRemoto); // ⛔ se l'avvio stesso fallisce, il SUO errore (non quello generico non acceso) arriva a chi ha chiamato
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
      : sorvegliaCorpo(risposta, { limiteMs: failsafe, userSignal: opzioni.signal ?? null }));
    const conDispatcher = dispatcherDiRichiesta(failsafe);

    // Recovery provenance belongs to the local journal, never to a provider or ACP.
    // Keep native provider state here: the native adapter still needs it.
    if (corpo.messages?.some(m => m.talos_recovery)) {
      corpo = { ...corpo, messages: corpo.messages.map(({ talos_recovery, ...message }) => message) };
      opzioni = { ...opzioni, body: JSON.stringify(corpo) };
    }
    // P-L · il corpo del kernel incontra ACP solo qui; stop e chiusura seguono la risposta.
    if (destinazione.esterno) return rispostaAgenteAcp({ runtime: destinazione.runtime, body: corpo, signal: opzioni.signal, onAvviso });
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
    for (const [indice, avviso] of adattata.avvisi.entries()) {
      const frase = adattata.frasiAvvisi?.[indice];
      if (typeof onAvviso !== 'function') {
        const errore = new OpenAiCompatibleRuntimeError(avviso, 'PROVIDER_REASONING_UNSUPPORTED');
        if (frase?.testoChiave) { errore.chiave = frase.testoChiave; errore.params = frase.testoParams; }
        throw errore;
      }
      await onAvviso(frase ?? avviso);
    }
    /* ⛔ BUG-18 (05/10, owner): le NOTE di normalizzazione (livelli adattati, campi non inviati)
       sono telemetria locale: al journal della sessione con `{ nota: true }`, MAI in bolla in
       chat. L'onestà resta: il testo è lo stesso che prima compariva a schermo. Senza onAvviso
       una nota si perde in silenzio (telemetria opzionale), un avviso resta fail-closed. */
    for (const nota of adattata.note ?? []) {
      if (typeof onAvviso === 'function') await onAvviso(nota, { nota: true });
    }
    /*
     * ⛔⛔⛔ BC-79.2 (17/09/2026) — LA RIPROVA SENZA ATTREZZI VIVE QUI, e il kernel non la conosce.
     * La doc per esteso sta su `MotoreLocaleRifiutaError`, sopra: qui restano i tre fatti che
     * decidono se questo blocco morde — la fonte gira su questo computer, la richiesta portava
     * `tools`, la risposta è un 400. Manca uno dei tre ⇒ la riga qui sotto è quella di sempre.
     */
    const motoreLocale = FONTI_DI_MOTORE_LOCALE.has(destinazione.fonte);
    const portavaAttrezzi = Array.isArray(adattata.corpo?.tools) && adattata.corpo.tools.length > 0;
    const corpoSenzaAttrezzi = () => {
      const { tools: _tools, tool_choice: _toolChoice, ...resto } = adattata.corpo;
      return JSON.stringify(resto);
    };
    /* ⛔ Già saputo che questo motore li rifiuta: non si rimanda `tools` per poi riprendersi lo
       stesso 400 — è il «retrying without changes will loop» della ricerca. */
    const giaSenzaAttrezzi = motoreLocale && portavaAttrezzi && memoriaAttrezzi?.rifiutati === true;
    const corpoRiscritto = giaSenzaAttrezzi ? corpoSenzaAttrezzi() : JSON.stringify(adattata.corpo);

    /*
     * ⛔ Il motore locale si chiama attraverso il SUO supervisore, non con una
     * fetch nuda: llama-server parte con `--api-key randomBytes(32)` e quella
     * chiave vive solo dentro il supervisore (`status()` non la espone,
     * perché quella risposta arriva al browser). Misurato costruendo l'URL a
     * mano: HTTP 401 «Invalid API Key» in 4 ms.
     */
    const spedisci = async (corpo) => {
      if (destinazione.locale) {
        if (typeof dipendenze.chiamaLocale !== 'function') {
          const errore = new Error('The local engine is not connected to this server.');
          errore.code = 'LOCAL_RUNTIME_NOT_READY';
          throw errore;
        }
        return sorveglia(await dipendenze.chiamaLocale(destinazione.percorso, { ...opzioni, ...conDispatcher, headers: { 'Content-Type': 'application/json' }, body: corpo }));
      }
      return spedisciAltrove(corpo);
    };

    /*
     * ⛔ BC-79.2: la destinazione non locale resta ESATTAMENTE quella di prima, spostata dentro una
     *   funzione perché la riprova senza attrezzi deve poter spedire due volte lo stesso corpo su
     *   qualunque strada. `ollama:` e `lmstudio:` passano di qui — sono motori locali con un
     *   indirizzo, non col ponte del supervisore — e quindi la cura li copre senza un secondo ramo.
     */
    async function spedisciAltrove(corpo) {
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
        ...opzioni, ...conDispatcher, headers: { ...destinazione.headers }, body: corpo, redirect: 'error',
      })), destinazione.fonte);
      // P-K — fine
      return conCacheDichiarata(sorveglia(await fetchDiRete(destinazione.url, {
        ...opzioni,
        ...conDispatcher,
        headers: { ...destinazione.headers },
        body: corpo,
      })), destinazione.fonte);
    }

    if (motoreLocale && portavaAttrezzi && !giaSenzaAttrezzi) {
      const prima = await spedisci(corpoRiscritto);
      if (prima.status !== 400) return prima;
      /* Il grezzo si legge ORA: dopo la riprova questa risposta non serve più, e il suo corpo
         resterebbe aperto. Serve solo come dettaglio dell'errore, mai a schermo. */
      const dettaglio = await leggiDettaglioRifiuto(prima);
      // 25/09 sera: il contesto pieno non è un rifiuto degli attrezzi — nessuna riprova senza (vedi `ContestoLocalePienoError`)
      const pieno = contestoLocalePieno(dettaglio);
      if (pieno) throw pieno;
      const seconda = await spedisci(corpoSenzaAttrezzi());
      if (!seconda.ok) {
        const dettaglioSecondo = await leggiDettaglioRifiuto(seconda);
        throw new MotoreLocaleRifiutaError(prima.status, dettaglio, [
          { stato: prima.status, dettaglio }, { stato: seconda.status, dettaglio: dettaglioSecondo },
        ]);
      }
      /* ⛔ Prima la memoria, poi l'avviso: se `onAvviso` lancia, il giro deve comunque smettere di
         mandare `tools` — altrimenti si tornerebbe a un 400 per giro con in più un'eccezione. */
      if (memoriaAttrezzi) memoriaAttrezzi.rifiutati = true;
      /* ⛔ BUG-7-cura2, revisore C2-2/M1 (05/10/2026): RIPETIBILE di proposito. La memoria `rifiutati` vive quanto la
         catena fetch (una per `talosLavora`, vedi BC-79.2): a un CAMBIO FORNITORE la catena si ricostruisce e il motore
         può rifiutare di nuovo — la seconda volta è una notizia operativa, non la stessa bolla. Non riapre il sintomo
         BUG-7 «bolla a ogni giro»: dentro un giro la memoria è appiccicosa, l'avviso non può ripetersi se non dopo
         una ricostruzione vera. Stessa scelta della «chiave rifiutata» qui sotto. */
      if (typeof onAvviso === 'function') await onAvviso(AVVISO_MOTORE_SENZA_ATTREZZI, { ripetibile: true });
      return seconda;
    }
    const risposta = await spedisci(corpoRiscritto);
    /* 25/09 sera: anche senza attrezzi nel corpo (o già tolti) il contesto pieno del motore locale sale col suo codice, invece
       di arrivare al kernel come un 400 qualunque che il ripiego classificherebbe «richiesta non valida». */
    if (!motoreLocale || risposta.status !== 400) return risposta;
    const dettaglio = await leggiDettaglioRifiuto(risposta);
    const pieno = contestoLocalePieno(dettaglio);
    if (pieno) throw pieno;
    return new Response(dettaglio, { status: risposta.status, statusText: risposta.statusText, headers: risposta.headers });
  };
}

// P-K — errori upstream non attendibili: il testo non deve attraversare il confine pubblico.
async function inviaCloudProtetta(rete, url, opzioni) {
  let risposta;
  try { risposta = await rete(url, opzioni); }
  catch {
    if (opzioni.signal?.aborted) {
      const errore = new Error('The request to the provider was interrupted.');
      errore.name = opzioni.signal.reason?.name === 'TimeoutError' ? 'TimeoutError' : 'AbortError';
      throw errore;
    }
    throw Object.assign(new Error('The provider could not be reached.'), { code: 'PROVIDER_NETWORK_ERROR' });
  }
  if (risposta.ok) return risposta;
  await risposta.body?.cancel().catch(() => {});
  const stato = risposta.status;
  const message = stato === 401 ? 'Credential not accepted by the provider.'
    : stato === 403 ? 'Access denied: check the permissions of the credential and of the model.'
    : stato === 404 ? 'Model or address not found: check the provider configuration.'
    : `The provider answered HTTP ${stato}.`;
  return new Response(JSON.stringify({ error: { message } }), { status: stato, headers: { 'Content-Type': 'application/json' } });
}
// P-K — fine

/*
 * ⛔⛔⛔ 25/09/2026 sera — sessione VERA dell'owner (65d5683b, un GGUF locale, «ciao»): due volte «Il fornitore non ha
 *   accettato la richiesta.» senza che nessun fornitore fosse chiamato. Il server non aveva il motore llama.cpp
 *   (`localeConfigurato: false`), l'avvio automatico lanciava `LOCAL_RUNTIME_NOT_CONFIGURED`, e il catch di
 *   `eseguiConFallback` lo classificava `ignoto`: una diagnosi falsa, una ricevuta «interrotto» per una chiamata mai
 *   partita, e la persona mandata a cambiare fornitore.
 * ⇒ Questi codici nascono PRIMA della rete — risolvere la destinazione (`model-destination.mjs`), accendere il motore
 *   (`server.mjs` `avviaLocale`, `llama-server-supervisor.mjs`) — e hanno già una frase loro: si rilanciano come sono,
 *   senza classificarli, senza panchina, senza consumo e senza fornitore di riserva (lo stesso trattamento di
 *   `PROVIDER_KEY_MISSING`, CLI-REQ-03). Un elenco CHIUSO e non un prefisso: un errore dell'HTTP del motore
 *   (`RUNTIME_HTTP_ERROR`) o una connessione caduta a metà restano alla classificazione di sempre.
 * Fonti: NousResearch/hermes-agent #7512 (il ripiego copre l'errore originale del modello locale); il classificatore di
 *   Hermes tiene sempre il messaggio originale (`agent/error_classifier.py:1442-1445`, clone 65ad529 del 23/09/2026).
 */
const CONDIZIONI_PRIMA_DELLA_RETE = new Set([
  'LOCAL_RUNTIME_NOT_CONFIGURED', 'LOCAL_RUNTIME_NOT_READY',
  'RUNTIME_PROCESS_FAILED', 'RUNTIME_OUT_OF_MEMORY', 'RUNTIME_ARCH_UNSUPPORTED', 'RUNTIME_HEALTH_TIMEOUT', 'RUNTIME_ALREADY_RUNNING', 'RUNTIME_START_CANCELLED',
  'RUNTIME_NOT_READY', 'RUNTIME_MISCONFIGURED', 'RUNTIME_INVALID',
  'PROVIDER_RUNTIME_INVALID', 'MODEL_DESTINATION_INVALID',
]);

// OpenRouter's structured pre-provider rejection; messages and hints are untrusted prose.
function classificaLimiteOpenRouter(testo) {
  const sconosciuto = { code: 'PROVIDER_PAYMENT_REQUIRED', classe: 'limite-credito', transitorio: false };
  if (Buffer.byteLength(testo, 'utf8') >= 16_384) return sconosciuto;
  const oggetto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  let corpo;
  try { corpo = JSON.parse(testo); } catch { return sconosciuto; }
  if (!oggetto(corpo) || !oggetto(corpo.error) || corpo.error.code !== 402 || !oggetto(corpo.error.metadata)) return sconosciuto;
  const { limit_source: fonte, reason } = corpo.error.metadata;
  if (fonte === 'openrouter_in_flight_budget' && reason === 'in_flight_budget_exhausted') {
    return { code: 'PROVIDER_BUDGET_OCCUPIED', classe: 'budget-occupato', transitorio: true };
  }
  if (fonte === 'openrouter_key_limit') return { code: 'PROVIDER_KEY_SPEND_LIMIT', classe: 'limite-chiave', transitorio: false };
  if (fonte === 'openrouter_credits') return reason === 'weight_exceeds_budget'
    ? { code: 'PROVIDER_REQUEST_BUDGET', classe: 'richiesta-costosa', transitorio: false }
    : { code: 'PROVIDER_CREDIT_LIMIT', classe: 'credito', transitorio: false };
  return sconosciuto;
}

/*
 * ⛔ Decisione 14, nota 2 della review del bugfixer (08/10/2026 notte) — ESCLUSI TUTTI I FORNITORI DI UN MODELLO.
 *   Misurato con la chiave vera: con `provider.ignore` che copre i 30 fornitori di z-ai/glm-5.3-flash OpenRouter risponde
 *   404 `{"error":{"message":"All providers have been ignored…","metadata":{"failed_routing_step":"Filter by Ignored
 *   Providers"}}}`, e la persona leggeva «The provider did not accept the request.»: niente le diceva che la causa era il SUO
 *   elenco. ⇒ Si riconosce dal dato STRUTTURATO (il passo d'instradamento fallito), mai dalla prosa, come i 402 qui sopra.
 *   Non è colpa della chiave (niente panchina) né transitorio (niente ritenti, niente riserva): si rimedia nelle impostazioni.
 */
function classificaTuttiEsclusiOpenRouter(testo) {
  if (Buffer.byteLength(testo, 'utf8') >= 16_384) return null;
  let corpo;
  try { corpo = JSON.parse(testo); } catch { return null; }
  return corpo?.error?.metadata?.failed_routing_step === 'Filter by Ignored Providers'
    ? { code: 'OPENROUTER_ALL_PROVIDERS_EXCLUDED', classe: 'tutti-esclusi', transitorio: false }
    : null;
}

function erroreFornitorePubblico(classificazione, stato = null) {
  const messaggi = {
    traffico: 'Too much traffic at the provider.', credenziale: 'Credential rejected by the provider.',
    accesso: stato === 401
      ? 'The endpoint requires you to sign in: check the configured address and access.'
      : 'Access denied by the provider or the model: check the permissions.',
    credito: 'Credit not available at the provider.', rete: 'Connection with the provider interrupted.',
    'timeout-fornitore': 'The provider exceeded the maximum time.', 'guasto-fornitore': 'The provider is not responding.',
    'flusso-interrotto': 'The provider response was cut off.',
    'budget-occupato': 'The budget is temporarily taken by requests in progress or just finished.',
    'limite-chiave': 'The spending limit of the key has been reached.',
    'richiesta-costosa': 'The estimated cost of the request exceeds the available budget.',
    'limite-credito': 'The service rejected the request because of an unspecified spending limit.',
    'tutti-esclusi': 'Every provider of this model is in your excluded list on OpenRouter.',
  };
  const e = new Error(messaggi[classificazione.classe] ?? 'The provider did not accept the request.');
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
    new Error(`The provider did not respond within ${Math.round(ms / 1_000)} seconds.`),
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
  /* 17/09: il guardiano del corpo, iniettabile per le prove dello strato cache (vedi `creaFetchInstradata`). */
  sorvegliaCorpo = sorvegliaCorpoDiGenerazione,
} = {}) {
  const catena = validaFallbackProviders(fallbackProviders);
  /*
   * ⛔ BC-79.2 — la memoria «questo motore rifiuta gli attrezzi» nasce QUI, una per giro di
   *   sessione (una chiamata a `talosLavora`), e non dentro `creaFetchInstradata`: là sotto, sulla
   *   strada del multi-provider, la fetch instradata si ricostruisce a ogni richiesta.
   * ⛔ Dichiarato e non risolto in silenzio: la memoria vive quanto il GIRO DI SESSIONE, non quanto
   *   la sessione persistente. Una ripresa (`resume`) ricomincia da capo — un 400 e una riprova —
   *   perché l'adattatore non riceve nessun handle di sessione. È il confine di questa riga.
   */
  const memoriaAttrezzi = { rifiutati: false };
  if (!providerStore && !catena.length) return creaFetchInstradata(fetchDiRete, { risolvi, dipendenze, onAvviso, inattivitaGenerazioneMs, sorvegliaCorpo, memoriaAttrezzi });
  if (!dipendenze || (catena.length && (!providerStore || typeof onCambioFornitore !== 'function' || typeof onConsumoFornitore !== 'function'))) {
    throw new OwnerRuntimeUnavailableError('To continue with another provider, access, chat notices and usage recording are needed.', 'PROVIDER_FALLBACK_NOT_CONNECTED');
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
      /*
       * ⛔ CLI-REQ-03 (17/09): il NOME UMANO del fornitore, non il suo id — chi legge deve sapere
       *   QUALE chiave collegare. «per», non «di»: è la preposizione che il progetto usa già in
       *   tutti gli altri `PROVIDER_KEY_MISSING` (`model-destination.mjs`, `native-provider-adapter.mjs`,
       *   `provider-auth-cloud.mjs`), e due frasi diverse per lo stesso guasto sono due guasti
       *   diversi per chi legge.
       * ⛔ E l'errore porta anche l'ID: il nome serve a chi legge, l'id serve alla UI per aprire
       *   «Fornitori e accessi» SU QUEL fornitore invece che sull'elenco.
       */
      if (!providerStore.hasKey(fonte)) {
        throw Object.assign(
          new OwnerRuntimeUnavailableError(`The key for ${record.etichetta} is missing.`, 'PROVIDER_KEY_MISSING'),
          { fornitore: fonte, etichettaFornitore: record.etichetta },
        );
      }
      const panchina = providerStore.elencaPool(fonte).find(v => v.causa);
      const classificazione = classificaErroreDiCorsa({ messaggio: ({traffico:'HTTP 429',credenziale:'HTTP 401',credito:'insufficient credit',rete:'network', 'timeout-fornitore':'timeout', 'guasto-fornitore':'upstream error', 'flusso-interrotto':'unexpected eof'})[panchina?.causa] ?? '' });
      /* ⛔⛔ BUG-25 (06/10/2026) — QUI NASCEVA IL SINTOMO DELL'OWNER. Il fast-fail della panchina
       * sintetizzava `transitorio ? 503 : 401`: per il credito usciva un 401 che a valle
       * `classificaErroreDiCorsa` rileggeva come `credenziale` — «la chiave non è valida» — per
       * un credito esaurito che NON invalida nulla. Lo stato è la causa, per nome:
       * credito⇒402, traffico⇒429, credenziale⇒401 (vero), altro⇒503. */
      contesto.errore = erroreFornitorePubblico(classificazione, classificazione.classe === 'traffico' ? 429
        : classificazione.classe === 'credito' ? 402 : classificazione.transitorio ? 503 : 401);
      return new Response(contesto.errore.message, { status: contesto.errore.stato });
    }
    contesto.errore = null;
    contesto.rispostaAccettata = false;
    contesto.headersRitenta = {};
    contesto.scelta = scelta; contesto.fonte = fonte;
    const segnala = async (classificatoDalTesto, headers, stato, attesaCorpo = null) => {
      /* P2 (ledger Codex 28/09, `SUBENTRO-KERNEL-P2-2026-09-28`; riportata sulla base di RETRY01-09 il 30/09 col sì
       * dell'owner). Un 401 senza chiave inviata, o un 403 con una chiave FACOLTATIVA, non dicono che una chiave è stata
       * rifiutata: diventano «accesso», non transitorio, senza avviso di chiave e senza panchina. Fonti rilette il
       * 30/09/2026: Ollama «The local API at http://localhost:11434 does not require authentication»
       * (docs.ollama.com/api/authentication); RFC 9110 §15.5.4, un 403 può non dipendere dalle credenziali. */
      const classificazione = (stato === 401 && !scelta) || (stato === 403 && !record.chiaveObbligatoria)
        ? { classe: 'accesso', transitorio: false }
        : classificatoDalTesto;
      contesto.errore = erroreFornitorePubblico(classificazione, stato);
      const attesa = leggiAttesaRichiestaDalFornitore(headers) ?? attesaCorpo; // G02-10: retry-after-ms vince su retry-after; BUG-25: poi la grammatica del corpo
      if (attesa !== null) {
        // Only a normalized delay leaves the adapter; never arbitrary provider headers. The milliseconds travel too.
        const limitata = Math.min(attesa, Number.MAX_SAFE_INTEGER);
        contesto.headersRitenta = { 'Retry-After': String(Math.ceil(limitata / 1000)), 'Retry-After-Ms': String(Math.round(limitata)) };
      }
      // A spending limit does not invalidate a credential. Never rotate keys to bypass it.
      if (fonte === 'openrouter' && stato === 402) return;
      // Nemmeno l'elenco degli esclusi della persona: la chiave è sana, e ruotarla o sospenderla non cambierebbe niente.
      if (classificazione.classe === 'tutti-esclusi') return;
      /* ⛔ BUG-25 (06/10/2026) — il credito con una scadenza DICHIARATA (header o corpo) diventa un
       * rifiuto marcato che il kernel ritenta sulla STESSA chiave (parity Claude Code: header-driven,
       * attesa dichiarata vince; il marker non tocca OpenRouter-402 strutturato, RETRY09 resta fermo). */
      contesto.creditoDichiarato = classificazione.classe === 'credito' && attesa !== null;
      const altreChiaviDisponibili = scelta && providerStore.elencaPool(fonte)
        .some(v => v.impronta !== scelta.impronta && v.stato === 'disponibile');
      const guastoHttp = contesto.guastiHttp && headers && (
        (stato >= 500 && stato <= 599 && classificazione.classe === 'guasto-fornitore')
        || (stato === 429 && classificazione.classe === 'traffico' && !altreChiaviDisponibili));
      if (scelta && guastoHttp) {
        // The kernel owns the retry budget; suspending its last key would turn retries into local errors.
        contesto.guastiHttp.set(scelta.impronta, (contesto.guastiHttp.get(scelta.impronta) ?? 0) + 1);
      } else if (scelta && classificazione.classe !== 'accesso'
        /* ⛔ BUG-25 — la panchina a metà giro è SOLO rotazione: con un'altra chiave disponibile
         * serve (il ritento del kernel userà quella); a chiave unica il credito NON panchina mai
         * qui — il giro esaurisce il SUO budget contro il fornitore vero e la panchina (se il
         * fornitore dichiara una scadenza) arriva post-giro in `eseguiConFallback`. Benching ora
         * trasformava il ritento successivo del kernel in una risposta LOCALE inventata (il 401
         * finto «la chiave non è valida»: il sintomo dell'owner). */
        && !(classificazione.classe === 'credito' && !altreChiaviDisponibili)) {
        providerStore.mettiInPanchina(fonte, scelta.impronta, { classe: classificazione.classe, headers });
      }
      if (scelta && classificazione.classe === 'credenziale' && typeof onAvviso === 'function') {
        /* ⛔ BUG-7-cura2 (04/10/2026): RIPETIBILE di proposito — la dedup degli avvisi ora dura tutta la
           sessione (agent-service, Set su consensiSessione), ma due chiavi DIVERSE dello stesso pool
           rifiutate in giri diversi sono due notizie operative, non la stessa notizia. */
        await onAvviso({ testo: `A ${record.etichetta} key was rejected: check Providers and access.`, testoChiave: 'server.runtime.notice.keyRejected', testoParams: { provider: record.etichetta } }, { ripetibile: true });
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
        if (response.ok) { contesto.rispostaAccettata = true; return response; }
        // Il corpo originale non viene mai restituito al logger/kernel: può contenere la chiave.
        let testo = '';
        try { testo = await leggiDettaglioRifiuto(response, 16_385); } catch { /* lo stato resta disponibile */ }
        const classificazione = fonte === 'openrouter' && response.status === 402
          ? classificaLimiteOpenRouter(testo)
          : (fonte === 'openrouter' && response.status === 404 && classificaTuttiEsclusiOpenRouter(testo)) || classificaGuasto({ message: testo }, response.status);
        // BUG-25: gli header dicono per primi; solo se tacciono, le grammatiche di reset nel corpo (parity Hermes).
        await segnala(classificazione, response.headers, response.status, leggiAttesaResetDalCorpo(testo));
        return new Response(JSON.stringify({ error: { message: contesto.errore.message } }), { status: response.status, headers: { 'Content-Type': 'application/json', ...contesto.headersRitenta } });
      } catch (error) {
        if (opzioni.signal?.aborted && opzioni.signal.reason?.name !== 'TimeoutError') throw opzioni.signal.reason;
        if (error === contesto.errore) throw error;
        const classificazione = classificaGuasto(error);
        // No HTTP rejection was received. A POST may already have been processed.
        contesto.errore = erroreEsitoProviderIncerto(classificazione);
        throw contesto.errore;
      }
    };
    const instradata = creaFetchInstradata(rete, { risolvi, dipendenze: {
      ...dipendenze, leggiChiave: p => p === fonte && scelta ? scelta.chiave : dipendenze.leggiChiave(p),
    }, onAvviso, instradaOpenRouter: true, inattivitaGenerazioneMs, sorvegliaCorpo, memoriaAttrezzi });
    try {
      const risposta = await instradata(url, opzioni);
      /* ⛔ BUG-25 — il rifiuto-credito CON scadenza dichiarata NON si lancia come eccezione: si
       * restituisce marcato, perché il kernel (che possiede il budget di retry) lo ritenta sulla
       * STESSA chiave onorando l'attesa dichiarata. Senza dichiarazione la strada resta quella di
       * sempre: eccezione onesta, nessun retry, nessuna panchina (parity Hermes: non si bruciano
       * richieste — e comunque il credito non invalida la chiave). */
      if (contesto.guastiHttp && !risposta.ok && contesto.errore?.transitorio === false && !contesto.creditoDichiarato) throw contesto.errore;
      const motivoRifiuto = contesto.creditoDichiarato ? 'credito'
        : contesto.errore?.classe && contesto.errore.classe !== 'credito' ? contesto.errore.classe : null;
      return marcaRifiutoProvider(risposta, motivoRifiuto);
    }
    catch (error) {
      /*
       * ⛔ BC-79.2 — un motore locale che rifiuta la richiesta ANCHE senza attrezzi non è un guasto
       *   del fornitore da riclassificare: ha già il suo codice e la sua frase, ed è stato deciso
       *   a valle con due misure (400 con attrezzi, 400 senza). Passarlo per `classificaGuasto`
       *   lo trasformerebbe in «Il fornitore non ha accettato la richiesta» — la frase generica che
       *   questa riga esiste per togliere. Stessa forma di `PROVIDER_KEY_MISSING` più sotto.
       */
      if (error?.code === 'LOCAL_ENGINE_REJECTED_REQUEST') throw error;
      // P-K — token scaduto o involucro malformato: panchina senza partire in rete.
      if (record.cloud && scelta && ['PROVIDER_CLOUD_TOKEN_EXPIRED', 'PROVIDER_CLOUD_CREDENTIAL_INVALID'].includes(error?.code)) {
        providerStore.mettiInPanchina(fonte, scelta.impronta, { classe: 'credenziale' });
      }
      // P-K — fine
      // Gli SDK nativi lanciano sugli HTTP non riusciti: ricondurli alla stessa
      // risposta permette al kernel di esaurire il proprio budget anche qui.
      if (contesto.guastiHttp && contesto.errore?.transitorio === false && !contesto.creditoDichiarato) throw contesto.errore;
      if (contesto.errore?.stato) return marcaRifiutoProvider(new Response(contesto.errore.message,
        { status: contesto.errore.stato, headers: contesto.headersRitenta }),
      contesto.creditoDichiarato ? 'credito'
        : contesto.errore.classe === 'credito' ? null : contesto.errore.classe);
      if (contesto.errore) throw contesto.errore;
      throw error;
    }
  }

  const fetchMultiProvider = (url, opzioni) => invia(url, opzioni);
  fetchMultiProvider.eseguiConFallback = async (chiama, opzioni = {}) => {
    if (modelloSessione && JSON.stringify(separaFonteModello(opzioni.modello)) !== JSON.stringify(separaFonteModello(modelloSessione))) {
      return chiama({ fetchDiRete: fetchMultiProvider });
    }
    if (occupato) throw new OwnerRuntimeUnavailableError('A call of this session is already in progress.', 'PROVIDER_FALLBACK_BUSY');
    occupato = true;
    try {
      const iniziale = separaFonteModello(opzioni.modello);
      let destinazione = effettivo ?? { provider: iniziale.fonte, model: iniziale.modelloRemoto };
      const usaAttrezzi = Boolean(opzioni.attrezzi?.length || opzioni.messaggi?.some(m => m.role === 'tool' || m.tool_calls?.length));
      while (true) {
        opzioni.segnaleStop?.throwIfAborted();
        const contesto = { guastiHttp: new Map() };
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
          /*
           * ⛔⛔⛔ CLI-REQ-03 (17/09/2026) — LA CHIAVE CHE MANCA NON È UN RIFIUTO DEL FORNITORE.
           *
           * Misurato prima della cura, su questa strada (`eseguiConFallback`, store senza chiavi,
           * modello `zai:glm-5.3-flash`): usciva `PROVIDER_REQUEST_ERROR` «Il fornitore non ha
           * accettato la richiesta.» (classe `ignoto`) con **0 chiamate di rete** e **1 consumo
           * scritto** (`esito: 'interrotto'`). Due bugie in una: si accusava il fornitore di aver
           * rifiutato una richiesta che non gli è mai arrivata, e si depositava la ricevuta di una
           * chiamata mai partita. Sulla fetch nuda l'errore usciva già giusto: il difetto era
           * SOLO qui, nel catch del ripiego, che classifica ogni eccezione come un guasto di rete.
           *
           * ⇒ `PROVIDER_KEY_MISSING` nasce PRIMA della rete (`invia`, sopra), è una condizione di
           *   configurazione e non un guasto: si rilancia com'è, senza classificarlo, senza
           *   metterlo in panchina e senza scrivere consumi. Non è nemmeno transitorio, quindi non
           *   ha senso cercargli un fornitore di riserva: la riserva vorrebbe la stessa chiave che
           *   non c'è. È la «pre-validation» che la ricerca del 17/09 indica come cura standard
           *   (aden-hive/hive #4391, OpenHands/software-agent-sdk #4867, DataQ #1849/#1853).
           */
          if (error?.code === 'PROVIDER_KEY_MISSING') throw error;
          /* ⛔ BC-79.2 — e nemmeno il rifiuto di un motore locale: non è transitorio, non è colpa di
             una chiave, e un fornitore di riserva non c'entra niente con un GGUF che sta in casa. */
          if (error?.code === 'LOCAL_ENGINE_REJECTED_REQUEST') throw error;
          /* ⛔ 25/09/2026 — né un motore locale che non c'è o non parte, né una destinazione mal configurata: condizioni
             nate PRIMA della rete, con una frase loro. Vedi `CONDIZIONI_PRIMA_DELLA_RETE`. */
          if (CONDIZIONI_PRIMA_DELLA_RETE.has(error?.code)) throw error;
          /* ⛔ 25/09/2026 sera — e nemmeno il contesto pieno del motore locale: non è transitorio, un fornitore di riserva non
             c'entra, e mascherato da «richiesta non valida» il kernel non potrebbe più comprimere (`ContestoLocalePienoError`). */
          if (error?.code === 'LOCAL_CONTEXT_EXCEEDED') throw error;
          const classificazione = contesto.errore ?? classificaGuasto(error, error?.stato ?? error?.statusCode);
          const incerto = error?.esitoIncerto === true || contesto.errore?.esitoIncerto === true
            || contesto.rispostaAccettata || rispostaInterrotta || Boolean(error?.parziale);
          const pulito = incerto ? erroreEsitoProviderIncerto({ ...classificazione, code: error?.code, causaDiTrasporto: error?.causaDiTrasporto ?? classificazione.causaDiTrasporto, usage: error?.usage })
            : erroreFornitorePubblico(classificazione, error?.stato ?? contesto.errore?.stato);
          // Keep partial text for explicit recovery; changing providers must never replay this request.
          if (error?.parziale) pulito.parziale = error.parziale;
          if (!incerto && ['guasto-fornitore', 'traffico'].includes(classificazione.classe) && contesto.scelta
            && (contesto.guastiHttp.get(contesto.scelta.impronta) ?? 0) >= 2) {
            providerStore.mettiInPanchina(destinazione.provider, contesto.scelta.impronta, {
              classe: classificazione.classe, headers: new Headers(contesto.headersRitenta),
            });
          }
          if (!incerto && !contesto.errore && contesto.scelta) providerStore.mettiInPanchina(destinazione.provider, contesto.scelta.impronta, { classe: classificazione.classe });
          /* ⛔ BUG-25 — la panchina-credito CON scadenza DICHIARATA arriva POST-giro (mai inventare
           * risposte locali a giro in corso) e vale fino allo scadere dichiarato, anche a chiave
           * unica: è un fatto del fornitore, non una stima (parity Hermes «reset_at overrides»).
           * ⛔ SOLO per il credito ONESTO (non-strutturato): `creditoDichiarato` resta falso per
           * OpenRouter-402 strutturato (RETRY09: limiti permanenti, niente panchina, niente retry).
           * Senza dichiarazione NESSUNA panchina: l'errore si ripete onesto e la chiave resta
           * utilizzabile. */
          if (!incerto && classificazione.classe === 'credito' && contesto.creditoDichiarato === true
            && contesto.scelta && contesto.headersRitenta['Retry-After-Ms']) {
            providerStore.mettiInPanchina(destinazione.provider, contesto.scelta.impronta, { classe: 'credito', headers: new Headers(contesto.headersRitenta) });
          }
          const usage = consumoPubblico(pulito.usage);
          if (typeof onConsumoFornitore === 'function') await onConsumoFornitore({ tipo: 'consumo-fornitore', ...destinazione, usage, costoDichiarato: usage?.cost ?? null, esito: classificazione.classe === 'traffico' ? 'traffico' : 'interrotto' });
          // BUG-25: la scadenza dichiarata dal fornitore viaggia con l'errore onesto (scheda quota, bottone «riprendi»).
          if (Number.isFinite(error?.retryAfterMs)) pulito.retryAfterMs = error.retryAfterMs;
          else if (contesto.creditoDichiarato === true && contesto.headersRitenta['Retry-After-Ms']) pulito.retryAfterMs = Number(contesto.headersRitenta['Retry-After-Ms']);
          if (incerto || !classificazione.transitorio || (destinazione.provider === 'openrouter' && contesto.errore?.stato === 402)) throw pulito;
          let prossima = null;
          while (++indice < catena.length) {
            const candidata = catena[indice];
            if (candidata.provider === destinazione.provider || !providerStore.scegliChiave(candidata.provider)) continue;
            try { validaFallbackProviders([candidata], { usaAttrezzi }); } catch { continue; }
            prossima = candidata; break;
          }
          if (!prossima) throw pulito;
          const messaggio = classificazione.classe === 'traffico'
            ? `Provider ${REGISTRO_FORNITORI[destinazione.provider].etichetta} is limiting traffic: continuing with ${REGISTRO_FORNITORI[prossima.provider].etichetta} · model ${prossima.model}`
            : `Provider ${REGISTRO_FORNITORI[destinazione.provider].etichetta} is not responding: continuing with ${REGISTRO_FORNITORI[prossima.provider].etichetta} · model ${prossima.model}`;
          await onCambioFornitore({ tipo: 'cambio-fornitore', precedente: destinazione, effettivo: prossima, classe: classificazione.classe, rispostaInterrotta, messaggio, messaggioChiave: classificazione.classe === 'traffico' ? 'server.runtime.notice.trafficFallback' : 'server.runtime.notice.unavailableFallback', messaggioParams: { provider: REGISTRO_FORNITORI[destinazione.provider].etichetta, nextProvider: REGISTRO_FORNITORI[prossima.provider].etichetta, model: prossima.model } });
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
    if (!specifier) throw new OwnerRuntimeUnavailableError('The agent runtime is not configured for this installation.');
    if (!moduloPromise) {
      moduloPromise = Promise.resolve(importFn(specifier)).catch((error) => {
        moduloPromise = null;
        throw new OwnerRuntimeUnavailableError('The agent runtime is not available. Check the server configuration.', 'OWNER_RUNTIME_LOAD_FAILED', { cause: error });
      });
    }
    return moduloPromise;
  };
  const richiama = async (nome, ...argomenti) => {
    const runtime = await carica();
    if (typeof runtime[nome] !== 'function') {
      throw new OwnerRuntimeUnavailableError(`The agent runtime does not expose the requested operation (${nome}).`, 'OWNER_RUNTIME_CONTRACT_INVALID');
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
        throw new OwnerRuntimeUnavailableError('The agent runtime does not expose page reading.', 'OWNER_RUNTIME_CONTRACT_INVALID');
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
        throw new OwnerRuntimeUnavailableError('The agent runtime does not expose the requested task catalog.', 'OWNER_RUNTIME_CONTRACT_INVALID');
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
          throw new OwnerRuntimeUnavailableError(`The agent runtime does not expose the tool list (${dove}).`, 'OWNER_RUNTIME_CONTRACT_INVALID');
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
      if (typeof input?.readProcessOutputFn === 'function' && (await carica()).SUPPORTA_LETTURA_OUTPUT_PROCESSI !== 1) {
        throw new OwnerRuntimeUnavailableError('The engine of this installation does not read retained outputs yet.', 'PROCESS_OUTPUT_READ_CONTRACT_REQUIRED');
      }
      if (typeof input?.captureProcessFn === 'function') {
        const runtime = await carica();
        if (runtime.SUPPORTA_OUTPUT_PROCESSI !== 1 || runtime.SUPPORTA_METADATA_OUTPUT_PROCESSI !== 1) {
          throw new OwnerRuntimeUnavailableError('The engine of this installation does not retain command outputs yet.', 'PROCESS_OUTPUT_CONTRACT_REQUIRED');
        }
      }
      if (typeof input?.ambienteComandiFn === 'function') {
        const runtime = await carica();
        if (runtime.SUPPORTA_AMBIENTE_COMANDI !== 1) {
          throw new OwnerRuntimeUnavailableError('The engine of this installation does not apply the command environment choice yet.', 'COMMAND_ENVIRONMENT_CONTRACT_REQUIRED');
        }
      }
      /* G02 (dalla lane CLI): chi passa una barriera prima delle modifiche (il checkpoint della CLI) non la perde in silenzio. */
      if (typeof input?.primaDiMutazioneFn === 'function' && (await carica()).SUPPORTA_BARRIERA_MUTAZIONI !== 1) {
        throw new OwnerRuntimeUnavailableError('The engine of this installation does not apply the barrier before changes yet.', 'PRE_MUTATION_CONTRACT_REQUIRED');
      }
      /* G02 (dalla lane CLI): chi porta il suo esecutore per la shell del modello (il broker della CLI) non torna in silenzio sull'host. */
      if (typeof input?.eseguiComandoSandboxatoFn === 'function' && (await carica()).SUPPORTA_ESECUTORE_COMANDI_OSPITE !== 1) {
        throw new OwnerRuntimeUnavailableError('The engine of this installation does not use the host command executor yet.', 'COMMAND_EXECUTOR_CONTRACT_REQUIRED');
      }
      const fallbackProviders = validaFallbackProviders(input?.fallbackProviders ?? []);
      if (fallbackProviders.length) {
        const runtime = await carica();
        if (runtime.SUPPORTA_FALLBACK_FORNITORI !== 1) {
          throw new OwnerRuntimeUnavailableError('The engine of this installation does not connect the provider change to the conversation yet.', 'PROVIDER_FALLBACK_CONTRACT_REQUIRED');
        }
      }
      const fetchOriginale = typeof input?.fetchDiRete === 'function' ? input.fetchDiRete : fetch;
      const fetchConDescrizione = creaFetchConDescrizioneComando(fetchOriginale, { lingua: input?.linguaInterfaccia }); // K3b
      const fetchResiliente = creaFetchOpenRouterResiliente(fetchConDescrizione, {
        timeoutMsFn: async () => {
          const runtime = await Promise.resolve(openRouterRuntimeFn()).catch(() => null);
          return Number(runtime?.timeoutSeconds) * 1_000;
        },
        modelCapabilityFn,
        userSignal: input?.segnaleStop ?? null,
        esclusiFn: async () => { // decisione 14: gli esclusi si leggono a ogni richiesta, dalla stessa preferenza del tempo massimo
          const runtime = await Promise.resolve(openRouterRuntimeFn()).catch(() => null);
          return Array.isArray(runtime?.esclusi) ? runtime.esclusi : [];
        },
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
            throw new OwnerRuntimeUnavailableError('The selected model does not accept images. Choose a model with vision.', 'MODEL_IMAGE_NOT_SUPPORTED');
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
      if (!FONTI_MODELLO.includes(provider) || typeof model !== 'string' || !model.trim() || !Array.isArray(messages) || !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1) fail('CTX_MODEL_INVALID', 'Invalid summary request.');
      if (!destinazioneModelloDeps) fail('CTX_TRANSPORT_UNAVAILABLE', 'The model transport is not connected to the compactor.');
      signal?.throwIfAborted();
      const routed = creaFetchMultiProvider(fetchDiRete, { dipendenze: destinazioneModelloDeps });
      const key = provider === 'openrouter' ? destinazioneModelloDeps.leggiChiave?.('openrouter') : null;
      if (provider === 'openrouter' && !key) fail('CTX_TOKEN_AUTH', 'The key of the selected provider is not available.');
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
      /*
       * ⭐ F3, onda 2 di F2 (24/09/2026) — FUORI da OpenRouter il corpo INVIATO porta le stesse opzioni di
       *   ragionamento del corpo CONTATO (`context-token-counters.mjs::opzioniRagionamentoPerSintesi`, rapporto F4
       *   punto 4): `reasoning_effort:'low'` per OpenAI/DeepSeek, `'none'` per un motore locale, niente per chi non si
       *   conosce. Prima qui c'era `undefined` e i due corpi divergevano su questo campo. Fonti F4 (24/09/2026):
       *   OpenAI «Reasoning» guide (`none` ⇒ 400 su GPT-6 Astra, quindi mai `none` a OpenAI), llama.cpp
       *   `tools/server/README.md` («If `none`, reasoning/thinking is disabled»).
       */
      const opzioniSintesi = provider === 'openrouter' ? {} : (opzioniRagionamentoPerSintesi(provider) ?? {});
      const response = await routed(ENDPOINT_OPENROUTER, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({ model: provider === 'openrouter' ? model : `${provider}:${model}`, messages: structuredClone(messages), tools: [], max_tokens: maxOutputTokens, stream: false, ...(reasoning ? { reasoning } : {}), ...opzioniSintesi, ...(provider === 'openrouter' ? { transforms: [], plugins: [{ id: 'context-compression', enabled: false }] } : {}) }),
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
        fail('CTX_SUMMARY_HTTP', `The summary model answered with HTTP ${response.status}.`);
      }
      let result;
      try { result = await response.json(); } catch { fail('CTX_SUMMARY_RESPONSE_INVALID', 'Unreadable summary response.'); }
      const choice = result?.choices?.[0];
      const usage = result?.usage;
      if (choice?.message?.tool_calls?.length) fail('CTX_SUMMARY_TOOLS', 'The summary cannot run tools.', usage);
      // 09/09 — il caso visto dal vivo: niente testo ma token di ragionamento spesi. Non è una risposta
      //   «invalida» da guardare nel codice: è un budget finito nel pensiero, e va detto in quelle parole.
      const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens;
      if (typeof choice?.message?.content !== 'string' && Number.isSafeInteger(reasoningTokens) && reasoningTokens > 0) {
        fail('CTX_TRUNCATED_SUMMARY', `The model spent ${reasoningTokens} tokens on reasoning and left no room for the summary.`, usage);
      }
      if (typeof choice?.message?.content !== 'string' || typeof choice?.finish_reason !== 'string') fail('CTX_SUMMARY_RESPONSE_INVALID', 'The summary does not declare text and final state.', usage);
      return { text: choice.message.content, finishReason: choice.finish_reason, usage };
    },
    async eseguiComandoSandboxato(...args) {
      if (typeof args[2]?.onBytes === 'function') {
        const runtime = await carica();
        if (runtime.SUPPORTA_OUTPUT_PROCESSI !== 1 || runtime.SUPPORTA_METADATA_OUTPUT_PROCESSI !== 1) {
          throw new OwnerRuntimeUnavailableError('The engine of this installation does not retain command outputs yet.', 'PROCESS_OUTPUT_CONTRACT_REQUIRED');
        }
      }
      return richiama('eseguiComandoSandboxato', ...args);
    },
    async eseguiFlowForge(...args) {
      if (specifier) return richiama('eseguiFlowForge', ...args);
      return eseguiFlowForgeLocale(...args);
    },
    validaManifestForge(manifest) { return validaManifestForgeLocale(manifest); },
    async chiamaConRitenta(options) {
      if (specifier) return richiama('chiamaConRitenta', options);
      return chiamaConRitentaLocale(options);
    },
    /* ⭐ 06/10/2026 — la ricarica post-compact (opzione A, ricerca 5×5×5×5 §6.4): il TERZO argomento
     * opzionale (le fonti dichiarate per il blocco di fatti freschi) passa a ENTRAMBI i rami. Ramo
     * motore: `richiama` è una chiamata JS diretta, un runtime che non conosce il terzo argomento
     * lo ignora — additive, il contratto a due argomenti resta byte per byte valido. */
    async compattaConversazione(messaggi, chiamaModello, fontiRicarica = null) {
      if (specifier) return richiama('compattaConversazione', messaggi, chiamaModello, fontiRicarica);
      return compattaConversazioneLocale(messaggi, chiamaModello, fontiRicarica);
    },
    forgeToolPrefix: FORGE_PREFISSO_NOME_TOOL,
  });
}

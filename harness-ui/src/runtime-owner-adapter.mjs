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
import { senzaCampoImmagini } from './kernel/immagine-da-guardare.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { statSync } from 'node:fs';
import { createParser } from 'eventsource-parser';
import { FRASE_CATALOGO_ASSENTE, FRASE_RUNTIME_NON_CARICATO } from './frasi-runtime-owner.mjs'; // 15/10: le frasi che il Doctor riconosce
import { eseguiFlowForgeLocale, FORGE_PREFISSO_NOME_TOOL, validaManifestForgeLocale } from './forge-contract.mjs';
import { parseRuntimeOwnerSnapshot } from './runtime-owner-contract.mjs';
import { risolviDestinazioneModello, separaFonteModello, FONTI_MODELLO, validaFallbackProviders } from './model-destination.mjs';
import { REGISTRO_FORNITORI, ID_MOTORI_LOCALI_OPENAI, idPerWire } from './provider-registry.mjs';
import { classificaErroreDiCorsa } from './research-orchestrator.mjs';
import { creaRilevatoreZai } from './zai-indirizzo.mjs';
import { leggiAttesaRichiestaDalFornitore, leggiAttesaResetDalCorpo, erroreEsitoProviderIncerto, codiceDiRichiestaNonPartita, consumoPubblico, marcaRifiutoProvider } from './provider-retry.mjs';
import { normalizzaUsage, scontoDaCache } from './usage-cache.mjs'; // 12/09, P-B: i nomi della cache sono uno per fornitore, il lettore uno solo
import { nativeProviderResponse, stripNativeMetadata } from './native-provider-adapter.mjs';
import { ATTESA_LIMITE_DEL_PIANO_MASSIMA_MS, attesaDelLimiteDelPiano, conPrimoPezzo, creaFetchDelPiano, erroreDelPiano } from './chatgpt-richiesta.mjs';
import { attesaFinoAlRipristino, leggiLimitiDelPiano, nomiVisti } from './chatgpt-limiti.mjs';
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
import { classificaErroreFornitore, numeriDelContestoPieno } from './kernel/compattazione-desktop.mjs';
import { rifiutoDelMotoreOspite } from './accesso-locale-ospite.mjs'; // 18/10/2026: il motore dell'app occupato o chiuso, detto per nome
import { conUtentiUniti } from './kernel/utenti-uniti.mjs'; // riga del bugfixer 10/10: due `user` di fila, solo verso un motore locale
import { eRifiutoDelTemplate, piegaMessaggiDiSistema, sondaFormaDeiSistemi, piegaNoteInCoda } from './kernel/sistema-piegato.mjs'; // L1 1.1, 26/10; decisione 166 (R2) e 194
import { notaDegliAccorciatiComeUtente } from './kernel/avviso-accorciato.mjs'; // REV-M2-PIEGA (05/11): dove non si piega, la nota M2 resta la `user` di prima
import { valoreConsumoDiServizio } from './kernel/consumo-di-servizio.mjs'; // spesa di servizio, parte 2 A (owner 30/10)
import { immaginiPerUnModelloSenzaVista } from './immagini-senza-vista.mjs'; // Desktop 01/11: una foto vecchia non uccide più la chat
// P0 · punto 7 (16/09): il failsafe di inattività e il dispatcher stanno in una porta sola.
import {
  SilenzioDelFornitoreError,
  dispatcherDiGenerazione,
  leggiInattivitaGenerazioneMs,
  sorvegliaCorpoDiGenerazione,
  sorvegliaInattivita,
} from './generation-idle.mjs';

const ENDPOINT_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';
/* L1 1.1 (26/10/2026): `fonte|modello` → 'libera' | 'piegata' | 'sconosciuta' (la sonda non si può fare: resta la rete reattiva). */
const FORME_DEI_SISTEMI = new Map();
const SONDA_DEI_SISTEMI_MS = 15_000; // `/apply-template` rende e basta, non genera: oltre, la forma resta «sconosciuta» (rete reattiva)
/** Aspetta `promessa`, ma una richiesta fermata smette di aspettare subito, col motivo del suo segnale. */
function aspettaOFerma(promessa, segnale) {
  if (!segnale) return promessa;
  segnale.throwIfAborted();
  return new Promise((risolvi, rifiuta) => {
    const ferma = () => rifiuta(segnale.reason);
    segnale.addEventListener('abort', ferma, { once: true });
    promessa.then(
      (valore) => { segnale.removeEventListener('abort', ferma); risolvi(valore); },
      (errore) => { segnale.removeEventListener('abort', ferma); rifiuta(errore); },
    );
  });
}
const SONDE_IN_VOLO = new Map(); // `fonte|modello` → la sonda che sta girando, condivisa da chi arriva nel frattempo
/* ⭐ 06/10/2026 — C-a della cura post-compact (ricerca 5×5×5×5 §6.4, zero-cost): le stesse regole verbatim
 * del kernel, qui su una riga. Le richieste pendenti e le azioni irreversibili (commit/push CON hash) NON
 * si affidano al caso del riassunto (opencode `summary.txt:10-11`; prompt di codex `compact/prompt.md`). */
const RICHIESTA_DI_RIASSUNTO = [
  'Summarize the conversation, keeping the decisions, files and results that matter for the work.',
  'Any question left unanswered to the person must be quoted VERBATIM; every irreversible action taken',
  '(commit, push, publish, delete) must be named VERBATIM with its identifier — the full commit hash.',
].join('\n');
const GIRI_PRIMA_DI_COMPATTARE = 12;
/**
 * Dove va una chiamata secondaria. Di serie sul fornitore ATTIVO del giro (`effettivo`, se la catena ha già cambiato fornitore), come
 * prima. ⛔ 22/10/2026 (CLI, revisione 3 della 0.6.13, S2-1): un riassunto sul modello LEGGERO (`modelloProprio`) va al SUO modello —
 * dopo un cambio di fornitore finiva sul modello di riserva del giro, cioè non era più il riassunto che la persona aveva scelto.
 */
export function destinazioneDellaSecondaria({ effettivo = null, modello, modelloProprio = false } = {}) {
  const iniziale = separaFonteModello(modello);
  const proprio = { provider: iniziale.fonte, model: iniziale.modelloRemoto };
  return modelloProprio ? proprio : (effettivo ?? proprio);
}

/** La chiamata secondaria (il riassunto preparato in sottofondo): la richiesta e UN ritentativo (IST2-REV-02, vedi `eseguiConFallback`). */
const TENTATIVI_DELLA_SECONDARIA = 2;
/** IST3-REV-01 (16/10): un `Retry-After: 3600` teneva il riassunto «in volo» un'ora, e all'emergenza il giro aspettava lui. Se il
    fornitore chiede di aspettare più di così, la secondaria smette (`chiamaConRitentaBase`, `attesaRitentaMassimaMs`): il riassunto non è
    pronto e il giro compatta da sé quando gli serve. */
const ATTESA_MASSIMA_DELLA_SECONDARIA_MS = 30_000;
/* OWN-01 (09/10/2026, owner «10 minuti»): il tempo alla prima risposta di riserva è lo stesso predefinito dell'archivio (600 s). */
const OPENROUTER_IDLE_MS_PREDEFINITO = 600_000;
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
/** REV-M2-PIEGA (05/11/2026): il corpo con la nota M2 nella forma `user` <talos-note> di prima; LO STESSO corpo se non c'è. */
const conNotaDegliAccorciatiDiPrima = (corpo) => {
  if (!Array.isArray(corpo?.messages)) return corpo;
  const messaggi = notaDegliAccorciatiComeUtente(corpo.messages);
  return messaggi === corpo.messages ? corpo : { ...corpo, messages: messaggi };
};

/**
 * L'unica frase che chi legge vedrà: dice che cosa cambia per LEI, non che cosa è successo al
 * protocollo. ⛔ Nessun nome tecnico (`tools`, `--jinja`, `HTTP`), nessun modello «consigliato» e
 * nessun elenco di modelli che reggono gli attrezzi (owner 11/09: «non forziamo nulla»).
 */
/* ⛔ BUG-7 cura2, revisore C2-2 (05/10/2026): esportato perché la prova di cablaggio (tests/bc79-2) asserisca
   l'IDENTITÀ del messaggio, non una copia fragile del suo testo. K4b: frase inglese + chiave per la persona. */
/** L1 1.3 (26/10/2026): la riga «finestra allargata» (testo completo per chi non conosce l'evento `talos.finestra-locale`). */
export function avvisoFinestraAllargata({ dopo }) {
  return { testo: `Window enlarged to ${Number(dopo).toLocaleString('en-US')} tokens to fit the conversation.`, testoChiave: 'server.runtime.notice.windowEnlarged', testoParams: { n: dopo } };
}
/**
 * Router mode of the local engine (owner 26/10/2026 night, decision 2): the router could not load the model and today's engine took it.
 * The same notice shape as the others (`testo` + key + params); the reason itself goes to the log (`llama-router-supervisor.mjs`).
 */
export function avvisoRipiegoRouter({ modelId }) {
  return { testo: 'Opened with the other engine', testoChiave: 'server.runtime.notice.routerFallback', testoParams: { model: modelId } };
}
/**
 * L1 1.3 — «Chiedimi» (Impostazioni → Modelli): la finestra si potrebbe allargare, ma la persona ha scelto di decidere ogni volta.
 * ⛔ Codice SUO, non LOCAL_CONTEXT_EXCEEDED: il kernel riconosce il contesto pieno e riassumerebbe da solo (`classificaErroreFornitore`),
 *   cioè proprio ciò che la persona ha chiesto di non fare senza di lei. Questo sale come guasto non transitorio con la sua carta
 *   (`errori.js`, «Enlarge the window» / «Summarise»), e i numeri per dirla prima del clic.
 */
export class FinestraLocaleDaChiedereError extends Error {
  constructor({ promptToken, prima, dopo, memoriaInPiu = null, modelId }) {
    super(`The conversation (${promptToken} tokens) does not fit in the local model’s window (${prima} tokens). It can be reopened with ${dopo} tokens, or the older part can be summarised: you chose to decide each time.`);
    this.name = 'FinestraLocaleDaChiedereError';
    this.code = 'LOCAL_WINDOW_ASK';
    this.classe = 'finestra-da-scegliere';
    this.transitorio = false;
    this.stato = 409;
    this.promptToken = promptToken;
    this.finestraToken = prima;
    this.finestraProposta = dopo;
    this.memoriaInPiu = memoriaInPiu;
    this.modelId = modelId;
  }
}
/* Una richiesta allarga UNA volta sola: se anche la finestra nuova non basta, si torna al riassunto (`compattazione-desktop.mjs`). */
const RICHIESTE_GIA_ALLARGATE = new WeakSet();

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
 * 01/11/2026, vista locale (misura 1, `MISURE-VISTA-LOCALE-2026-11-01.md`): un'immagine a un modello aperto SENZA la sua parte per le
 *   immagini (mmproj) e llama-server (b11960) risponde **500** `{"error":{"code":500,"message":"image input is not supported - hint: if
 *   this is unexpected, you may need to provide the mmproj","type":"server_error"}}`. Un 500 sembra un guasto del motore, il ripiego lo
 *   tratterebbe da transitorio e la persona leggerebbe un errore interno. ⇒ Diventa un 400 col suo codice e una frase che dice cosa
 *   succede (Desktop, 01/11). ⛔ Qui NON c'è un campo strutturato (`type` è il generico `server_error`): si riconosce dalla frase del
 *   motore, unica eccezione alla regola di BC-79.2, e solo sul motore di questo PC.
 */
const FRASE_IMMAGINE_SENZA_PROIETTORE = /image input is not supported/iu;
export class ModelloLocaleNonVedeError extends Error {
  constructor(dettaglio) {
    super('This local model cannot see images: it was opened without the part that reads them. Send the message without the image, or use a model that sees images.');
    this.name = 'ModelloLocaleNonVedeError';
    this.code = 'LOCAL_MODEL_NO_VISION';
    this.stato = 400;
    this.transitorio = false;
    this.dettaglio = dettaglio;
  }
}
/** The refusal of a local engine for an image it cannot read (500 or 400 with that sentence); null for anything else. */
export function motoreLocaleNonVede(stato, dettaglio) {
  if (stato !== 500 && stato !== 400) return null;
  let corpo = null;
  try { corpo = JSON.parse(dettaglio); } catch { return null; }
  const messaggio = corpo?.error?.message;
  return typeof messaggio === 'string' && FRASE_IMMAGINE_SENZA_PROIETTORE.test(messaggio) ? new ModelloLocaleNonVedeError(dettaglio) : null;
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
    /* 21/10/2026 sera: la classe del guasto come il «contesto pieno» dei compatibili (F1 della CLI 0.6.8, `erroreFornitorePubblico`):
       sul disco e per un passo di Workflow (`agent-service.mjs`, F3-41a) si legge «contesto», non un guasto senza nome. Il marcatore
       per chi riprova resta il CODICE (`LOCAL_CONTEXT_EXCEEDED`, `classificaErroreFornitore`): la frase resta quella che la carta
       traduce (`errori.kernel.*`), che un marcatore in coda non riconoscerebbe più. */
    this.classe = 'contesto';
    this.transitorio = false;
    this.stato = 400;
    this.promptToken = Number.isSafeInteger(promptToken) ? promptToken : null;
    this.finestraToken = Number.isSafeInteger(finestraToken) ? finestraToken : null;
    this.dettaglio = dettaglio;
  }
}

/*
 * 21/10/2026 sera (dal vivo sul Pad, sessione lunga del Mobile, motore dell'APP con LFM2.5): il motore ospite risponde PRIMA di generare
 *   `400 {"error":{"code":"CONTEXT_LENGTH_EXCEEDED","message":"The conversation does not fit in the on-device model's context window.",
 *   "type":"server_error"}}`. Il suo `type` è generico, il campo che lo dice è `code`: senza leggerlo la riprova di BC-79.2 partiva
 *   senza attrezzi, «riusciva» col prompt più corto e la persona leggeva «This model does not use tools» dopo otto passi con gli
 *   attrezzi — lo stesso inganno del 25/09. ⇒ Anche `error.code` (il motore ospite, e la forma OpenAI `context_length_exceeded`)
 *   è un campo STRUTTURATO: vale come contesto pieno, mai dalla frase (la regola di BC-79.2).
 */
const CODICI_DEL_CONTESTO_PIENO = Object.freeze(['context_length_exceeded']);

/** Il 400 di un motore locale per un prompt più lungo della finestra, dai suoi campi strutturati (`type` di llama-server, `code` del
 *  motore dell'app); null se è un altro 400. */
function contestoLocalePieno(dettaglio) {
  let corpo = null;
  try { corpo = JSON.parse(dettaglio); } catch { return null; }
  const errore = corpo?.error;
  const perCodice = typeof errore?.code === 'string' && CODICI_DEL_CONTESTO_PIENO.includes(errore.code.toLowerCase());
  if (errore?.type !== 'exceed_context_size_error' && !perCodice) return null;
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

/**
 * Il corpo INTERO di una risposta d'errore, fino a `limite` byte, senza aspettare oltre `silenzioMs` fra un pezzo e l'altro.
 * ⛔ Revisione blocco 2 (R1): la cura N1 leggeva una COPIA (`clone()`) e restituiva l'originale intatto. Ma in un `tee` la
 *   cancellazione della copia si risolve solo quando si chiude anche l'originale, e un motore che si pianta a metà errore teneva ferma
 *   la richiesta fino al guardiano d'inattività (30 minuti di serie); prima della cura tornava subito coi primi 2.000 byte. Ora si
 *   legge una volta sola: l'errore torna intero se finisce, e tagliato (come prima, ma a 64 KB) se tace o è troppo lungo.
 * @returns {Promise<{ testo: string, intero: boolean }>}
 */
async function leggiCorpoDErrore(risposta, { limite = 65_536, silenzioMs = 2_000 } = {}) {
  const reader = risposta.body?.getReader();
  if (!reader) return { testo: '', intero: true };
  const decoder = new TextDecoder();
  let testo = '', letti = 0, intero = false, timer;
  try {
    while (letti < limite) {
      const silenzio = new Promise((risolvi) => { timer = setTimeout(() => risolvi(null), silenzioMs); });
      const pezzo = await Promise.race([reader.read(), silenzio]);
      clearTimeout(timer);
      if (pezzo === null) break; // tace: si tiene ciò che è arrivato
      if (pezzo.done) { intero = true; break; }
      const parte = pezzo.value.subarray(0, limite - letti);
      testo += decoder.decode(parte, { stream: true });
      letti += parte.byteLength;
    }
  } catch (error) {
    clearTimeout(timer);
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError' || error?.code === 'PROVIDER_SILENCE') throw error;
  } finally {
    if (!intero) reader.cancel().catch(() => {}); // non si aspetta: un corpo piantato non deve tenere ferma la risposta
    reader.releaseLock();
  }
  return { testo: testo + decoder.decode(), intero };
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
      body: JSON.stringify({ model: modello, messages: senzaCampoImmagini(messaggi), tools: attrezzi, tool_choice: 'auto' }), // view_image: il campo interno non parte mai
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

/*
 * ⛔ Owner 27/10/2026 — IL RAGIONAMENTO QUANDO CAMBIA IL MODELLO, deciso UNA volta nel server per PC, dispositivo e CLI (prima il
 *   PC teneva «Medio» su GLM 5.3 Flash che non lo ha, il dispositivo lo abbassava da sé: due risposte diverse, viste dal vivo).
 *   Scelte dell'owner: «Come Codex, uguale ovunque», poi «Codex, ma mai più caro». Codex (`codex-rs/tui/src/app/
 *   config_persistence.rs:1121-1134`, clone 16/10): il livello configurato resta se il modello nuovo lo supporta
 *   (`configured_effort.filter(|effort| supported.iter().any(...))`), altrimenti il `default_reasoning_effort` del modello.
 *   Il nostro in più: il predefinito vale solo se non costa più di quello scelto — per GLM 5.3 Flash il catalogo dichiara
 *   `default_effort: max` — altrimenti il più vicino più debole, la regola del 24/09 qui sopra (Hermes `clamp_effort`).
 *   «none» su un modello non obbligatorio è «spento», non un livello: resta com'è.
 */
export function reasoningAlCambioDiModello(reasoning, capability) {
  const regole = capabilityReasoning(capability);
  if (!regole || !reasoning || typeof reasoning !== 'object' || Array.isArray(reasoning)) return reasoning;
  const effort = typeof reasoning.effort === 'string' ? reasoning.effort : null;
  if (!effort || !SCALA_RAGIONAMENTO.includes(effort)) return reasoning;
  if (effort === 'none' && regole.mandatory !== true) return reasoning;
  const supportati = Array.isArray(regole.supportedEfforts)
    ? regole.supportedEfforts.filter((l) => typeof l === 'string' && l !== 'none' && SCALA_RAGIONAMENTO.includes(l))
    : [];
  if (!supportati.length || supportati.includes(effort)) return reasoning;
  const costo = (livello) => SCALA_RAGIONAMENTO.indexOf(livello);
  const predefinito = typeof regole.defaultEffort === 'string' && supportati.includes(regole.defaultEffort) ? regole.defaultEffort : null;
  const livello = predefinito && costo(predefinito) <= costo(effort) ? predefinito : livelloRagionamentoSenzaSalire(effort, supportati);
  return livello ? { ...reasoning, effort: livello } : reasoning;
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

/*
 * Banco di Performance sulla candidata (04/11/2026, OK di CLI, Mobile e Performance): con `low` deepseek-v4.1-flash-1017 ragionava
 *   1.231-2.000 token su `max_tokens: 2000` e 4 sintesi su 4 morivano troncate. Il catalogo lo dichiara spegnibile (`mandatory:
 *   false`, `supported_efforts` con `none`); OpenRouter, «Reasoning tokens» (letta il 04/11): `effort: "none"` «Disables reasoning
 *   entirely», mai a un modello `mandatory`. Hermes spegne il pensiero nella sua corsia veloce dei riassunti
 *   (`agent/auxiliary_client.py:6215-6228`, clone 2026-11-01). ⇒ La SINTESI chiede `none` solo lì; ogni altro modello riceve byte
 *   per byte quello di prima (`low` col clamp). Un 400 su `none` (Performance) mette il modello in `SINTESI_SENZA_NONE`: il
 *   ritentativo e ogni conteggio dopo usano `low`. Una funzione sola: la usano chi invia (`callContextModel`) e chi conta.
 */
export const SINTESI_SENZA_NONE = new Set();
export function ragionamentoPerSintesiOpenRouter(capability, model) {
  const regole = capabilityReasoning(capability);
  const spegnibile = regole && regole.mandatory !== true && Array.isArray(regole.supportedEfforts) && regole.supportedEfforts.includes('none');
  return spegnibile && !SINTESI_SENZA_NONE.has(model) ? { effort: 'none' } : normalizzaReasoningPerModello({ effort: 'low' }, capability);
}

/**
 * ⛔ A9, seguito OpenRouter (09/10/2026) — la mappa A9 (`filoRagionamentoDiretti`) copre solo le sessioni dirette, e l'owner
 * usa `z-ai/glm-5.3-flash` via OpenRouter: lì la pillola mostrava «Spento» e «Molto alto» mentre sul filo partivano «low» e
 * «max». Qui la stessa mappa per ogni voce del catalogo con un oggetto `reasoning`, calcolata con
 * `normalizzaReasoningPerModello`: lo STESSO clamp che il fetch OpenRouter applica prima della rete, con la voce del catalogo
 * dallo STESSO id esatto (`modelCapabilityFn(body.model)`, server.mjs `readModelCapabilities`). Mai una seconda copia delle regole.
 * Misurato sul catalogo vivo del 4174 (469 modelli, 336 col ragionamento): glm-5.3-flash none→low, xhigh→max;
 * gpt-5-nano none→minimal, xhigh/max→high; claude-opus-5 identità.
 * Forma: `{ 'z-ai/glm-5.3-flash': { none: 'low', …, xhigh: 'max' }, … }`; `null` = nessun livello sul filo (decide il
 * fornitore). OpenRouter, «Reasoning tokens» (letta il 09/10/2026): `supported_efforts` null = ogni livello accettato.
 */
export function filoRagionamentoCatalogo(modelli) {
  const mappa = {};
  for (const voce of Array.isArray(modelli) ? modelli : []) {
    if (typeof voce?.id !== 'string' || !voce.id || !capabilityReasoning(voce)) continue;
    const perLivello = {};
    for (const chiesto of SCALA_RAGIONAMENTO) {
      const filo = normalizzaReasoningPerModello({ effort: chiesto }, voce);
      perLivello[chiesto] = typeof filo?.effort === 'string' ? filo.effort : null;
    }
    /* Owner 09/10/2026 («Automatico + riga»): e SENZA una scelta che cosa parte. Un modello col ragionamento obbligatorio riceve il
       predefinito del catalogo (glm-5.3-flash: «max», il più caro) mentre la pillola diceva «Automatico» con la tacca «Alto» accesa.
       Lo stesso clamp, con `null` come fa il kernel quando la sessione non ha scelto. `null` = non parte niente (decide il fornitore). */
    const senzaScelta = normalizzaReasoningPerModello(null, voce);
    perLivello.auto = typeof senzaScelta?.effort === 'string' ? senzaScelta.effort : null;
    mappa[voce.id] = Object.freeze(perLivello);
  }
  return mappa;
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
 * Instradamento per modello (CLI, owner 08/10/2026): i campi del `provider` di OpenRouter scelti per QUEL modello (only, ignore, order, quantizations,
 * require_parameters, allow_fallbacks, sort) uniti a quelli che la richiesta portava già: `ignore` è un'unione, gli altri campi del modello vincono.
 * Lo STESSO valore se non c'è niente da unire (come `unisciEsclusi`). Gli esclusi della decisione 14 si uniscono DOPO, sempre su `ignore`.
 * Misura che l'ha fatto nascere (08/10/2026, 0.5.0 pubblicata, richieste identiche con 56 attrezzi): `z-ai/glm-5.3-flash` instradato di serie a
 * OpenInference (fp4) non chiamava gli attrezzi (0/2 fissato, 0/2 libero), Z.AI fp8 3/3, DeepInfra fp4 2/2. Hermes (`_provider_preferences_for_agent`,
 * agent/chat_completion_helpers.py:469-487) e Pi (`compat.openRouterRouting`) mettono lo stesso oggetto nella richiesta, per modello.
 */
export function unisciInstradamento(provider, instradamento) {
  if (!instradamento || typeof instradamento !== 'object' || Array.isArray(instradamento) || !Object.keys(instradamento).length) return provider;
  const base = provider && typeof provider === 'object' && !Array.isArray(provider) ? provider : {};
  const unito = { ...base, ...instradamento };
  /* Decisione 193 (condizione della CLI, 04/11/2026): l'`ignore` che porta il corpo è quello automatico del nucleo (fornitori che hanno perso
     la cache due volte). Un fornitore che la persona ha messo nel suo `order` o `only` per questo modello non si esclude in automatico: la
     sua scelta vince. Si confronta lo slug di BASE (la parte prima di «/»): `order: ['deepinfra']` protegge anche `deepinfra/fp8`, e al contrario. */
  const baseDi = (s) => s.split('/')[0].trim().toLowerCase();
  const scelti = new Set([...(Array.isArray(instradamento.order) ? instradamento.order : []), ...(Array.isArray(instradamento.only) ? instradamento.only : [])]
    .filter((s) => typeof s === 'string' && s).map(baseDi));
  const gia = (Array.isArray(base.ignore) ? base.ignore.filter((s) => typeof s === 'string') : []).filter((s) => !scelti.has(baseDi(s)));
  if (Array.isArray(instradamento.ignore)) {
    unito.ignore = [...new Set([...gia, ...instradamento.ignore.filter((s) => typeof s === 'string' && s)])];
  } else if (Array.isArray(base.ignore)) {
    if (gia.length) unito.ignore = gia;
    else delete unito.ignore;
  }
  return unito;
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
  /* Instradamento per modello (CLI, 08/10/2026): `(modello) => campi del provider | null`, letto a ogni richiesta. Assente = il corpo di sempre. */
  instradamentoFn = async () => null,
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
        const instradamento = await Promise.resolve(instradamentoFn(body?.model)).catch(() => null);
        const provider = unisciEsclusi(unisciInstradamento(body?.provider, instradamento), esclusi);
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
      if (error?.richiestaNonPartita === true) throw error; // 04/11: mai partita, non un 502 inventato da ritentare dieci volte
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
function creaFetchInstradata(fetchDiRete = fetch, { risolvi = risolviDestinazioneModello, dipendenze = null, onAvviso = null, instradaOpenRouter = false, inattivitaGenerazioneMs = null, sorvegliaCorpo = sorvegliaCorpoDiGenerazione, chiaveDiSessione = null, sessioneDelGiro = null, fasciaDiServizioFn = null,
  /*
   * BC-79.2 — la memoria del giro di sessione, CONDIVISA e non di questa chiusura: sulla strada del
   * multi-provider `creaFetchInstradata` viene ricostruita a OGNI richiesta (`invia`), quindi una
   * variabile locale ricorderebbe per un solo giro e il 400 tornerebbe a ogni turno. Chi non la
   * passa (nessuno oggi, oltre ai test) ottiene il comportamento di prima, byte per byte.
   */
  memoriaAttrezzi = { rifiutati: false },
  /* L1 1.1 (26/10/2026): la forma dei messaggi di sistema per ogni modello locale, decisa una volta dalla sonda o da un rifiuto.
     Di serie quella del processo, come la memoria del motore: un modello si sonda una volta sola finché il server vive. */
  formeDeiSistemi = FORME_DEI_SISTEMI,
  /* L1 1.3, revisione blocco 5 (A-4): giro senza la persona davanti ⇒ sul rifiuto del motore locale si riassume, mai si riapre. */
  senzaPersona = false,
  /* Decisione 116 C (owner 04/11/2026): chi chiama sa con QUALE token del piano è partita questa richiesta (il rinnovo dopo un rifiuto dice
     quale token è stato rifiutato, e la riga «rinnovato» nasce quando cambia fra due richieste dello stesso giro). Mai scritto altrove. */
  tokenUsato = null } = {}) {
  /* ⛔ FETCH-MULTIPROVIDER-01: senza dipendenze si ridà la fetch STESSA, come sempre (nessuna installazione esistente cambia). Il segno
     della spesa di servizio passa allora intatto: la fetch di Node e `new Request` scartano le chiavi che non conoscono, quindi non arriva
     al fornitore; e senza dipendenze non c'è nemmeno una riga di spesa da spostare. */
  if (!dipendenze) return fetchDiRete;
  return async function fetchMultiProvider(url, opzioniInArrivo = {}) {
    // spesa di servizio, parte 2 A: il segno non va mai in rete (CLI). ⛔ `let`: più sotto il corpo si riscrive (`opzioni = {...}`)
    let opzioni = toltoIlSegnoDiServizio(opzioniInArrivo);
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
    /* owner 01/11/2026, «Fila vera» (`attesa-turno.mjs`): il motore locale deve sapere di chi è la richiesta. Chi non guarda il secondo argomento non cambia. */
    const dipendenzeDelGiro = sessioneDelGiro && typeof dipendenze?.localePronto === 'function'
      ? { ...dipendenze, localePronto: (modello) => dipendenze.localePronto(modello, { sessione: sessioneDelGiro }) } : dipendenze;
    let destinazione;
    try {
      destinazione = risolvi(corpo.model, dipendenzeDelGiro);
    } catch (erroreRisoluzione) {
      /* 18/10/2026: un modello del motore dell'APP (`ospite`) non si accende da qui — vive nel telefono, e il llama-server del PC
         coprirebbe il motivo vero con «non configurato» */
      if (erroreRisoluzione?.code !== 'LOCAL_RUNTIME_NOT_READY' || erroreRisoluzione?.ospite === true || typeof dipendenze.avviaLocale !== 'function') throw erroreRisoluzione;
      const { modelloRemoto } = separaFonteModello(corpo.model);
      const avviato = await dipendenze.avviaLocale(modelloRemoto, { signal: opzioni?.signal, sessione: sessioneDelGiro }); // 01/11/2026: lo Stop del giro annulla l'apertura · ⛔ se l'avvio stesso fallisce, il SUO errore (non quello generico non acceso) arriva a chi ha chiamato
      /* Router mode (27/10/2026, decision 2): the line in the chat when today's engine took a model the router could not load. Today's
         supervisor never says `ripiegoRouter`: with the switch OFF nothing is said. */
      if (avviato?.ripiegoRouter?.modelId && typeof onAvviso === 'function') {
        try { await onAvviso(avvisoRipiegoRouter(avviato.ripiegoRouter), { riga: 'ripiego-locale', dati: { modello: avviato.ripiegoRouter.modelId } }); } catch { /* the line is news: it never stops the answer */ }
      }
      destinazione = risolvi(corpo.model, dipendenzeDelGiro); // dopo un avvio riuscito questo non deve più lanciare: se lancia ancora, è un errore vero da mostrare, non da inghiottire
    }
    /* 01/11/2026, «Memoria delle conversazioni»: prima di una richiesta al motore di questo PC, la scheda della conversazione torna dal disco
       se un'altra l'aveva presa (`foto-conversazioni.mjs`); una richiesta senza conversazione la segna occupata. Mai un errore per il giro. */
    if (destinazione?.locale === true && !destinazione.ospite && typeof dipendenze.primaDellaRichiestaLocale === 'function') {
      try { await dipendenze.primaDellaRichiestaLocale(sessioneDelGiro ?? null, { modello: destinazione.modelloRemoto ?? null, signal: opzioni?.signal }); }
      catch { /* una foto che non torna vuol dire solo rileggere la conversazione */ }
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
    /* Decisione 193: `provider` (gli evitati del nucleo, `provider.ignore`) è un campo di OpenRouter. Il nucleo lo mette solo per un modello di
       OpenRouter, ma una riserva su un altro fornitore (`eseguiConFallback`) rifà la stessa chiamata con un altro modello: lì non parte mai. */
    if (destinazione.fonte !== 'openrouter' && Object.hasOwn(corpo, 'provider')) {
      const { provider: _soloOpenRouter, ...senza } = corpo;
      corpo = senza;
      opzioni = { ...opzioni, body: JSON.stringify(corpo) };
    }
    // P-L · il corpo del kernel incontra ACP solo qui; stop e chiusura seguono la risposta.
    /* REV-M2-PIEGA (05/11/2026): l'agente esterno riceve la storia come testo e non piega: la nota M2 gli arriva nella forma di prima. */
    if (destinazione.esterno) return rispostaAgenteAcp({ runtime: destinazione.runtime, body: conNotaDegliAccorciatiDiPrima(corpo), signal: opzioni.signal, onAvviso });
    // P-L · fine instradamento agente esterno.
    if (destinazione.native) {
      /* 11/10/2026, «Continue with ChatGPT» — il token del piano si prende ADESSO (si rinnova da solo se sta per scadere) e la
         richiesta passa dal filtro che la rende conforme alle regole del piano (`chatgpt-richiesta.mjs`). Senza il canale del
         token non si spedisce niente: mai un ripiego sulla chiave API, che è un'altra strada di pagamento. */
      let apiKeyNativa = destinazione.apiKey;
      let fetchNativa = fetchDiRete;
      if (destinazione.tokenDelPiano) {
        if (typeof dipendenze?.leggiTokenDelPiano !== 'function') throw Object.assign(new Error('No ChatGPT account is connected.'), { code: 'CHATGPT_NON_COLLEGATO' });
        apiKeyNativa = await dipendenze.leggiTokenDelPiano(destinazione.fonte);
        if (typeof tokenUsato === 'function') await tokenUsato(apiKeyNativa);
        fetchNativa = creaFetchDelPiano(fetchDiRete, { fasciaDiServizioFn, collegamenti: opzioni.talosSenzaCollegamento === true ? null : dipendenze?.collegamentiDelPiano ?? null, onRisposta: (intestazioni, stato) => {
          if (typeof dipendenze?.registraLimitiDelPiano !== 'function') return;
          dipendenze.registraLimitiDelPiano({ limiti: leggiLimitiDelPiano(intestazioni), nomi: nomiVisti(intestazioni), stato });
        } });
      }
      return sorveglia(await nativeProviderResponse({ provider: destinazione.fonte, model: destinazione.modelloRemoto, apiKey: apiKeyNativa, baseURL: destinazione.baseURL, body: corpo, fetchFn: fetchNativa, signal: opzioni.signal }));
    }
    if (corpo.messages?.some(m => m.talos_provider_state)) {
      corpo = { ...corpo, messages: stripNativeMetadata(corpo.messages) };
      opzioni = { ...opzioni, body: JSON.stringify(corpo) };
    }
    /* Decisione 166, seconda forma (revisione del blocco UI R2; Performance 04/11 sera: «OpenRouter piegato SUBITO»): verso OpenRouter e ogni
       compatibile in cloud la nota dello Stop parte come testo `user` al suo posto. Cosa farebbe il router di un `system` sparso verso Claude o
       Gemini non è misurato; un `user` al suo posto non sposta mai la testa, qualunque cosa faccia. I motori di questo PC e del telefono
       restano com'erano (template severo: piega di `piegaMessaggiDiSistema`, più sotto; gli altri reggono il system al suo posto). */
    if (Array.isArray(corpo.messages) && !FONTI_DI_MOTORE_LOCALE.has(destinazione.fonte) && destinazione.locale !== true && destinazione.ospite !== true) {
      /* Decisione 194: OGNI nota dopo la testa, non più solo quella dello Stop. Il template di DeepSeek V4 raccoglie tutti i system in testa
         (`llama.cpp-2026-11-01/models/templates/deepseek-ai-DeepSeek-V4.jinja:22-48`): una nota sparsa cambiava la testa al fornitore a valle. */
      const piegati = piegaNoteInCoda(corpo.messages);
      if (piegati !== corpo.messages) { corpo = { ...corpo, messages: piegati }; opzioni = { ...opzioni, body: JSON.stringify(corpo) }; }
    } else if (!FONTI_DI_MOTORE_LOCALE.has(destinazione.fonte)) {
      /* REV-M2-PIEGA (05/11/2026): un locale o un ospite fuori dall'elenco dei motori non passa da nessuna piega: la nota M2 resta quella di prima. */
      const diPrima = conNotaDegliAccorciatiDiPrima(corpo);
      if (diPrima !== corpo) { corpo = diPrima; opzioni = { ...opzioni, body: JSON.stringify(corpo) }; }
    }
    if (destinazione.fonte === 'openrouter' && !instradaOpenRouter) return fetchDiRete(url, opzioni);
    if (destinazione.fonte === 'openai' && corpo.reasoning) {
      const { reasoning, ...resto } = corpo;
      corpo = { ...resto, ...(typeof reasoning.effort === 'string' ? { reasoning_effort: reasoning.effort } : {}) };
    }
    /* L1 del motore locale (20/10/2026): sul llama.cpp che spediamo, «ragionamento spento» non spegneva niente. Misurato su
       b10517 con LFM2.5-24B-A2B (il template dichiara `supports_reasoning_effort: false`): `reasoning_effort:'none'`,
       `reasoning_budget:0` e `chat_template_kwargs.enable_thinking:false` ⇒ 474 pezzi di ragionamento, come senza niente; il
       campo per richiesta `thinking_budget_tokens: 0` ⇒ 0 (`llama-server --help`: «--reasoning-budget N … 0 for immediate end»).
       Per questo i riassunti uscivano troncati: il ragionamento si mangiava tutto `max_tokens` (sessione e00ae242).
       ⛔ Solo per la fonte `local` (il nostro motore, versione nota), MAI dal nome del modello: un server compatibile scelto
       dalla persona (vLLM, LM Studio) potrebbe rifiutare il campo con un 400 (Hermes riconosce quel rifiuto apposta,
       `agent/error_classifier.py:509-519`). */
    if (destinazione.fonte === 'local' && chiedeRagionamentoSpento(corpo) && corpo.thinking_budget_tokens === undefined) {
      corpo = { ...corpo, thinking_budget_tokens: 0 };
    }
    /* P-D (12/09, Astra): il traduttore del fornitore toglie ciò che il fornitore non accetta (es.
       `reasoning_effort: low` per Z.AI, che ammette solo high e max) e lo DICE. Senza un canale per
       dirlo (`onAvviso`) si preferisce fermarsi prima della rete con una frase in italiano, invece di
       spedire in silenzio una richiesta diversa da quella chiesta (fail-closed, come nel rapporto). */
    /* Revisione O1 (21/10/2026): verso chi dichiara `instradamento.campo: 'session_id'` (OpenRouter) la chiave è quella della SESSIONE,
       come Hermes (`plugins/model-providers/openrouter/__init__.py:126-133`), non l'impronta del prefisso: l'impronta cambia quando
       cambiano gli attrezzi (un server MCP che parte, Piano/Normale) o dopo un riassunto, e ogni volta l'instradamento «sticky» e la
       vista Sessions dei log ripartivano da capo. Senza sessione (riassunti, chiamate di contorno) resta l'impronta del traduttore. */
    const corpoDaTradurre = chiaveDiSessione && REGISTRO_FORNITORI[destinazione.fonte]?.instradamento?.campo === 'session_id' && corpo.session_id === undefined
      ? { ...corpo, session_id: chiaveDiSessione } : corpo;
    const adattata = preparaRichiestaCompatibile(destinazione.fonte, { ...corpoDaTradurre, model: destinazione.modelloRemoto });
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
    /* Riga del bugfixer (10/10/2026): i template jinja dei motori locali (`llama-server --jinja`: Mistral, Gemma) alzano
       «Conversation roles must alternate» davanti a due `user` di fila (l'avviso C06 prima del messaggio della persona, o due
       messaggi in coda dopo un risultato). Qui, e solo qui, si uniscono — come Hermes; la storia resta com'è (`utenti-uniti.mjs`). */
    /* ⭐ L1 1.1 (owner 26/10/2026, «never break user space»; `kernel/sistema-piegato.mjs` per il perché e le misure): i system si
       piegano SOLO per un modello il cui template li rifiuta o li perde. La sonda gira una volta per modello sul motore che lo
       serve (`POST /apply-template`, non genera); dove non si può fare (Ollama, LM Studio, un motore dell'app senza la rotta) la
       forma resta «sconosciuta» e copre la rete reattiva più sotto. Un errore di RETE della sonda non si ricorda: riprova al giro
       dopo. Per ogni modello che regge i system la richiesta resta byte per byte quella di prima. */
    const chiaveForma = `${destinazione.fonte}|${destinazione.modelloRemoto}`;
    let formaDeiSistemi = motoreLocale ? formeDeiSistemi.get(chiaveForma) : undefined;
    if (motoreLocale && formaDeiSistemi === undefined && Array.isArray(adattata.corpo?.messages)) {
      /* La sonda passa da una porta SUA (`applicaTemplateLocale`/`applicaTemplateOspite`, date da `server.mjs`), non da `chiamaLocale`:
         chi non la dà (i motori finti delle prove, un ospite più vecchio) non vede nessuna richiesta in più, e la forma resta
         «sconosciuta» come prima di questa riga. */
      const via = destinazione.ospite ? dipendenze.applicaTemplateOspite : destinazione.locale ? dipendenze.applicaTemplateLocale : null;
      if (typeof via !== 'function') {
        formeDeiSistemi.set(chiaveForma, 'sconosciuta');
        formaDeiSistemi = 'sconosciuta';
      } else {
        /* ⛔ Revisione blocco 2 (R2, R3): la sonda condivisa girava col segnale della PRIMA richiesta. Fermare la seconda non la
           fermava (aspettava la sonda della prima), e fermare la prima faceva partire la seconda senza piega (con gpt-oss: tre system
           invece di uno, persi in silenzio). Ora la sonda ha il SUO tempo massimo, e ogni richiesta l'aspetta col PROPRIO Stop. */
        /* Revisione avversaria 26/10: S1, due richieste insieme sullo stesso modello facevano due sonde ⇒ una sola, condivisa;
           S2, un 503 (motore occupato) o un 5xx di passaggio si ricordava «sconosciuta» per tutto il processo ⇒ si ricorda soltanto
           ciò che dice qualcosa sul template: la forma trovata, o una rotta che non c'è (404/405). Il resto si riprova al giro dopo. */
        let sonda = SONDE_IN_VOLO.get(chiaveForma);
        if (!sonda) {
          sonda = (async () => {
            let ricordare = true;
            const forma = await sondaFormaDeiSistemi(async (messages, tools) => {
              let risposta;
              try {
                risposta = await via({ method: 'POST', signal: AbortSignal.timeout(SONDA_DEI_SISTEMI_MS), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, tools }) });
              } catch (errore) { ricordare = false; throw errore; }
              if (risposta.ok) return { ok: true, prompt: (await risposta.json().catch(() => ({})))?.prompt };
              const delTemplate = eRifiutoDelTemplate(await leggiDettaglioRifiuto(risposta));
              if (!delTemplate && risposta.status !== 404 && risposta.status !== 405) ricordare = false;
              return { ok: false, rifiutoDelTemplate: delTemplate };
            });
            if (forma || ricordare) formeDeiSistemi.set(chiaveForma, forma ?? 'sconosciuta');
            return forma ?? 'sconosciuta';
          })().finally(() => SONDE_IN_VOLO.delete(chiaveForma));
          SONDE_IN_VOLO.set(chiaveForma, sonda);
        }
        formaDeiSistemi = await aspettaOFerma(sonda, opzioni.signal);
      }
    }
    /* REV-M2-PIEGA (revisione avversaria del 05/11/2026): la nota M2 nasce `system`. Il template severo la piega col segno intatto (era
       `‹talos-note>`, come una nota contraffatta); per tutti gli altri torna la `user` <talos-note> di prima, stessi byte. La rete reattiva
       più sotto ripiega da `messaggiPrimaDellaPiega`, cioè dalla nota `system`: anche lì il segno resta. */
    const conLaFormaGiusta = (messaggi, forma) => conUtentiUniti(forma === 'piegata' ? piegaMessaggiDiSistema(messaggi) : notaDegliAccorciatiComeUtente(messaggi));
    const messaggiPrimaDellaPiega = Array.isArray(adattata.corpo?.messages) ? adattata.corpo.messages : null;
    if (motoreLocale && messaggiPrimaDellaPiega) adattata.corpo = { ...adattata.corpo, messages: conLaFormaGiusta(messaggiPrimaDellaPiega, formaDeiSistemi) };
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
      /* 18/10/2026 — il motore dell'APP: la chiave e il socket li ha l'accesso (`accesso-locale-ospite.mjs`), come il supervisore qui
         sotto. Un 503 col suo codice (la chat sta generando, o nessun modello aperto) diventa un rifiuto leggibile, non un guasto da
         ritentare né un fornitore di riserva (richiesta della sessione mobile). */
      if (destinazione.ospite) {
        if (typeof dipendenze.chiamaLocaleOspite !== 'function') {
          throw Object.assign(new Error('No local model is open in the app: open one from the model picker.'), { code: 'LOCAL_RUNTIME_NOT_READY' });
        }
        const risposta = await dipendenze.chiamaLocaleOspite(destinazione.percorso, { ...opzioni, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo });
        const rifiuto = await rifiutoDelMotoreOspite(risposta);
        if (rifiuto) { try { await risposta.body?.cancel(); } catch { /* già chiusa */ } throw rifiuto; }
        return sorveglia(risposta);
      }
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

    /* ⭐ L1 1.1, la rete reattiva: se il template rifiuta la richiesta (sonda impossibile, o un template che la sonda non ha
       previsto) si riprova UNA volta piegata, e la forma si ricorda solo se quel tentativo riesce. Un altro 400/500 torna com'era,
       col suo dettaglio, a chi lo legge sotto (contesto pieno, attrezzi rifiutati). */
    const spedisciPiegandoSeServe = async (corpo) => {
      const risposta = await spedisci(corpo);
      if (!motoreLocale || formaDeiSistemi === 'piegata' || !messaggiPrimaDellaPiega || (risposta.status !== 400 && risposta.status !== 500)) return risposta;
      /* Revisione avversaria 26/10 (N1): un errore che non viene dal template torna INTERO a chi lo legge sotto, non tagliato ai
         2.000 byte; revisione blocco 2 (R1): letto una volta sola, senza copie (vedi `leggiCorpoDErrore`). */
      const { testo: dettaglio } = await leggiCorpoDErrore(risposta);
      const comEra = () => new Response(dettaglio, { status: risposta.status, statusText: risposta.statusText, headers: risposta.headers });
      if (!eRifiutoDelTemplate(dettaglio.slice(0, 2_000))) return comEra();
      let piegato;
      try { piegato = JSON.stringify({ ...JSON.parse(corpo), messages: conLaFormaGiusta(messaggiPrimaDellaPiega, 'piegata') }); } catch { return comEra(); }
      const seconda = await spedisci(piegato);
      if (seconda.ok) { formaDeiSistemi = 'piegata'; formeDeiSistemi.set(chiaveForma, 'piegata'); }
      return seconda;
    };

    /*
     * ⭐ L1 1.3 (owner 26/10/2026: «allarga, poi riassume», bozzetto approvato) — la conversazione non entra nella finestra di un
     *   modello LOCALE di questo PC: prima di lasciare che il kernel riassuma, si chiede al server di riaprire il motore con una
     *   finestra più grande (`src/finestra-che-cresce.mjs`: massimo addestrato, memoria, motore libero, scelta della persona) e la
     *   STESSA richiesta riparte da capo, una volta sola. La riga di stato la scrive `onAvviso` (evento `talos.finestra-locale`).
     *   Se non si può, `null`: l'errore sale com'era e il riassunto automatico fa quello che fa oggi.
     * ⛔ Mai il motore dell'app (`ospite`) né Ollama/LM Studio: non li riapre questo server. E chi non dà la dipendenza (la CLI, le
     *   prove) resta byte per byte com'era.
     */
    const allargaERimanda = async (pieno) => {
      if (senzaPersona || destinazione.fonte !== 'local' || destinazione.ospite || typeof dipendenze?.allargaFinestraLocale !== 'function') return null;
      if (RICHIESTE_GIA_ALLARGATE.has(opzioni) || !Number.isSafeInteger(pieno?.promptToken) || pieno.promptToken <= 0) return null;
      RICHIESTE_GIA_ALLARGATE.add(opzioni);
      let esito = null;
      /* ⛔ Revisione blocco 4 (A-6): uno Stop durante la riapertura del motore (decine di secondi su un modello grande) ferma la richiesta
         SUBITO, col suo motivo; la riapertura finisce da sé, e il motore resta pronto per la prossima. */
      try {
        opzioni?.signal?.throwIfAborted(); // già fermata: nessuna riapertura
        const riapertura = Promise.resolve(dipendenze.allargaFinestraLocale({ modelId: destinazione.modelloRemoto, servono: pieno.promptToken }));
        riapertura.catch(() => { /* dopo uno Stop nessuno la aspetta più: un suo guasto non deve diventare un rifiuto senza gestore */ });
        esito = await aspettaOFerma(riapertura, opzioni?.signal);
      }
      catch (errore) {
        if (opzioni?.signal?.aborted) throw errore;
        return null;
      }
      if (esito?.ok !== true && esito?.motivo === 'chiedi') {
        throw new FinestraLocaleDaChiedereError({ promptToken: pieno.promptToken, prima: esito.prima, dopo: esito.dopo, memoriaInPiu: esito.memoriaInPiu, modelId: destinazione.modelloRemoto });
      }
      if (esito?.ok !== true) return null;
      if (!esito.giaAllargata && typeof onAvviso === 'function') {
        const dati = { prima: esito.prima, dopo: esito.dopo, massimo: esito.massimo ?? null, memoriaInPiu: esito.memoriaInPiu ?? null, modello: esito.nome ?? destinazione.modelloRemoto };
        try { await onAvviso(avvisoFinestraAllargata(esito), { riga: 'finestra-locale', dati }); } catch { /* la riga è una notizia: non ferma la risposta */ }
      }
      return fetchMultiProvider(url, opzioni);
    };

    /*
     * Owner 26/10 e 01/11/2026, attrezzi per i modelli che non li hanno (`attrezzi-emulati.mjs`, spento di serie). Solo il motore di questo PC: quello dell'app non ha
     * `/completion` (Mobile, 01/11). Questo file non legge il modulo: la dipendenza esiste solo se `server.mjs` la dà. Risponde null per tutto ciò che non è suo, e si va
     * come oggi. Lo Stop e il tetto del giro sono il segnale della richiesta; `sorveglia` è lo stesso guardiano del silenzio.
     */
    if (destinazione.locale === true && !destinazione.ospite && portavaAttrezzi && !giaSenzaAttrezzi && typeof dipendenze.attrezziEmulati === 'function') {
      const emulata = await dipendenze.attrezziEmulati(adattata.corpo, { signal: opzioni?.signal, ...conDispatcher });
      if (emulata) return sorveglia(emulata);
    }
    /* 01/11/2026: un'immagine che il modello locale non può leggere sale col suo codice (`ModelloLocaleNonVedeError`); il resto torna intatto */
    const seNonVede = async (risposta) => {
      /* Suite del treno 02/11 (PIEGA-19): qui si leggevano 2.000 byte e si restituivano quelli, così un 500 del motore che non c'entra con le immagini
         (fuori memoria, per esempio) arrivava tagliato a chi lo legge. Si legge intero una volta sola; si decide sui primi 2.000. */
      const { testo: dettaglioImmagine } = await leggiCorpoDErrore(risposta);
      const nonVede = motoreLocaleNonVede(risposta.status, dettaglioImmagine.slice(0, 2_000));
      if (nonVede) throw nonVede;
      return new Response(dettaglioImmagine, { status: risposta.status, statusText: risposta.statusText, headers: risposta.headers });
    };
    if (motoreLocale && portavaAttrezzi && !giaSenzaAttrezzi) {
      const prima = await spedisciPiegandoSeServe(corpoRiscritto);
      if (prima.status === 500) return seNonVede(prima);
      if (prima.status !== 400) return prima;
      /* Il grezzo si legge ORA: dopo la riprova questa risposta non serve più, e il suo corpo
         resterebbe aperto. Serve solo come dettaglio dell'errore, mai a schermo. */
      const dettaglio = await leggiDettaglioRifiuto(prima);
      const nonVedeConAttrezzi = motoreLocaleNonVede(prima.status, dettaglio);
      if (nonVedeConAttrezzi) throw nonVedeConAttrezzi; // un 400 per l'immagine non è un rifiuto degli attrezzi
      // 25/09 sera: il contesto pieno non è un rifiuto degli attrezzi — nessuna riprova senza (vedi `ContestoLocalePienoError`)
      const pieno = contestoLocalePieno(dettaglio);
      if (pieno) {
        const rimandata = await allargaERimanda(pieno);
        if (rimandata) return rimandata;
        throw pieno;
      }
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
    const risposta = await spedisciPiegandoSeServe(corpoRiscritto);
    /* 25/09 sera: anche senza attrezzi nel corpo (o già tolti) il contesto pieno del motore locale sale col suo codice, invece
       di arrivare al kernel come un 400 qualunque che il ripiego classificherebbe «richiesta non valida». */
    if (motoreLocale && risposta.status === 500) return seNonVede(risposta);
    if (!motoreLocale || risposta.status !== 400) return risposta;
    const dettaglio = await leggiDettaglioRifiuto(risposta);
    const nonVede = motoreLocaleNonVede(risposta.status, dettaglio);
    if (nonVede) throw nonVede;
    const pieno = contestoLocalePieno(dettaglio);
    if (pieno) {
      const rimandata = await allargaERimanda(pieno);
      if (rimandata) return rimandata;
      throw pieno;
    }
    return new Response(dettaglio, { status: risposta.status, statusText: risposta.statusText, headers: risposta.headers });
  };
}

// P-K — errori upstream non attendibili: il testo non deve attraversare il confine pubblico.
/* Spesa di servizio (parte 2 A; CLI 30/10): `talosServizio` è un dato NOSTRO — non arriva mai al fornitore né ai registri di rete. */
function toltoIlSegnoDiServizio(opzioni) {
  if (!opzioni || typeof opzioni !== 'object' || !('talosServizio' in opzioni)) return opzioni;
  const { talosServizio: _segno, ...perLaRete } = opzioni;
  return perLaRete;
}

/** CONTRATTO-R30-R31 (Performance, 30/10/2026): il max_tokens inviato in QUESTA chiamata, additivo nel conto dei consumi. */
function tettoInviatoNelConsumo(contesto) {
  return Number.isSafeInteger(contesto?.maxTokensInviato) ? { maxTokensInviato: contesto.maxTokensInviato } : {};
}

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
  /* 26/10/2026: il socket del motore dell'app non risponde (D-0146-1). Nessuna generazione è partita: nessun consumo, nessun fornitore
     di riserva — si dice, e al prossimo invio l'app ha già rifatto il motore. */
  'LOCAL_GUEST_UNREACHABLE',
  /* 18/10/2026: il motore dell'app è occupato dalla chat (un giro alla volta). Arriva DALLA rete del socket, ma prima di ogni
     generazione: nessun consumo, e un fornitore di riserva non è la risposta — si dice e si riprova quando la chat ha finito. */
  'LOCAL_ENGINE_BUSY',
  'LOCAL_MODEL_CHANGED', // 18/10/2026: nell'app è aperto un altro modello (409 del Mobile), si sceglie di nuovo
  'RUNTIME_PROCESS_FAILED', 'RUNTIME_OUT_OF_MEMORY', 'RUNTIME_ARCH_UNSUPPORTED', 'RUNTIME_HEALTH_TIMEOUT', 'RUNTIME_ALREADY_RUNNING', 'RUNTIME_START_CANCELLED',
  /* 27/10/2026 (G-R6): the router mode's engine could not be stopped and nothing was loaded beside it — the memory must be freed first */
  'RUNTIME_ROUTER_NOT_STOPPED',
  'RUNTIME_NOT_READY', 'RUNTIME_MISCONFIGURED', 'RUNTIME_INVALID',
  'PROVIDER_RUNTIME_INVALID', 'MODEL_DESTINATION_INVALID',
  'PROVIDER_ENDPOINT_NOT_CHOSEN', // owner 14/10/2026: l'indirizzo della chiave non è ancora scelto (`model-destination.mjs`)
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
  /* 01/11/2026, banco di chiusura: la stessa forma quando il limite è una restrizione del CONTO OpenRouter, non l'elenco della persona in TALOS.
     Stessa classe (niente ritenti, niente panchina, niente riserva), codice e frase suoi: si cambia in un altro posto. */
  const passo = corpo?.error?.metadata?.failed_routing_step;
  if (passo === 'Filter by Guardrails') return { code: 'OPENROUTER_GUARDRAIL_BLOCKED', classe: 'tutti-esclusi', transitorio: false };
  return passo === 'Filter by Ignored Providers'
    ? { code: 'OPENROUTER_ALL_PROVIDERS_EXCLUDED', classe: 'tutti-esclusi', transitorio: false }
    : null;
}

/*
 * Riverifica del bugfixer (16/10/2026, CP-REV-01): un 429 è un limite di traffico per definizione (RFC 6585 §4, «Too Many Requests»),
 * anche quando dice «Too many tokens, please wait» (i token al minuto di AWS Bedrock). La tabella BC-44 guarda i segni del contesto prima
 * di quelli del traffico e lo chiamava `contesto`, non transitorio: niente attesa, niente ritento — e da F1 la frase avrebbe detto
 * «finestra di contesto». Qui, dove lo stato HTTP c'è, torna `traffico`.
 */
/*
 * 18/10/2026 — due rifiuti di Google che la tabella BC-44 leggeva male (misurati sul servizio vero con la quota gratuita):
 * · un 429 `RESOURCE_EXHAUSTED` col `RetryInfo` (quota al MINUTO, «limit: 15») dice «check your plan and billing details» e diventava
 *   `credito`, non transitorio: nessuna attesa, nessun ritento, e la persona leggeva «Credit not available». È traffico: come Hermes
 *   (`agent/error_classifier.py:145-148` e `:640`, `resource_exhausted` → rate limit), e l'attesa la dà Google (`provider-retry.mjs`);
 * · un 404 di un modello ritirato o chiuso agli account nuovi («no longer available», «is not found for API version», `model_not_found`)
 *   usciva come «The provider did not accept the request.». Come Hermes (`_MODEL_NOT_FOUND_PATTERNS`, `:273`) ha un codice suo, non si
 *   ritenta, e la frase dice di scegliere un altro modello; in più di Hermes si riconosce la frase del ritiro di Google.
 */
function classificaRifiutoNoto(testo, stato) {
  if (typeof testo !== 'string' || Buffer.byteLength(testo, 'utf8') >= 16_384) return null;
  if (stato === 429 && /RESOURCE_EXHAUSTED|"retryDelay"|PerMinute|\bretry\s+in\s+\d/iu.test(testo)) return { classe: 'traffico', transitorio: true };
  /* «is not a valid model ID»: il 400 di OpenRouter per un modello che non esiste (sonda sul servizio vero, 01/11/2026). Con «ID» scritto: senza,
     un parametro rifiutato («… is not a valid model parameter») fermava il modello per 15 minuti e diceva di sceglierne un altro (D9, revisione di fine fase). */
  if ((stato === 404 || stato === 400) && /no longer available|model_not_found|is not found for API version|the model `[^`]*` does not exist|\bno such model\b|\bunknown model\b|\bis not a valid model id\b/iu.test(testo)) {
    return { code: 'PROVIDER_MODEL_UNAVAILABLE', classe: 'modello-non-disponibile', transitorio: false };
  }
  return null;
}

function limiteNonContesto(classificazione, stato) {
  return stato === 429 && classificazione?.classe === 'contesto' ? { classe: 'traffico', transitorio: true } : classificazione;
}

/*
 * ⛔ R10-2 della revisione 10 della CLI (23/10/2026, S2): il corpo del fornitore non esce mai da qui (può contenere la chiave), e con lui
 *   se ne andavano i NUMERI del «contesto pieno» — quanti token ha contato, qual è la finestra, quanta uscita ha messo nel conto. Il
 *   kernel li legge dalla frase (`numeriDelContestoPieno`): senza, il bersaglio era sempre il 70/50/35%, la regola N sul rifiuto non
 *   scattava mai e nemmeno la linea certa (Z-K3). Misurato dalla CLI attraverso l'adattatore vero: `contestoPieno` sempre senza `numeri`.
 *   ⇒ Si leggono qui, dal testo che solo questo adattatore vede, e passano come tre interi in una frase nostra, che il kernel riconosce
 *   (`compattazione-desktop.mjs`, la prima delle `FORME_NUMERI_CONTESTO_PIENO`). Del corpo esce solo questo: tre numeri.
 */
const frasePienoConNumeri = (numeri) => (numeri
  ? ` (context_length_exceeded): ${numeri.richiesti} input tokens requested, ${numeri.massimo} maximum${Number.isSafeInteger(numeri.uscita) ? `, ${numeri.uscita} output tokens` : ''}.`
  : ' (context_length_exceeded).');

function erroreFornitorePubblico(classificazione, stato = null, numeri = null) {
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
    'modello-non-disponibile': 'The provider no longer offers this model to this account: choose another model.',
    /* F1 della CLI (prima revisione della 0.6.8, 16/10/2026): la frase porta il marcatore `context_length_exceeded`, così chi riprova
       dopo un «contesto pieno» (K8 del legacy, il guscio e il servizio del contesto: `classificaErroreFornitore`) lo riconosce anche
       dietro questo adattatore, che il corpo del fornitore non lo lascia mai passare. */
    // la classe è quella che la tabella BC-44 (`classificaErroreDiCorsa`) dava già al contesto pieno, ma senza una frase sua
    contesto: `The request is larger than the model context window${frasePienoConNumeri(numeri)}`,
  };
  const e = new Error(classificazione.code === 'OPENROUTER_GUARDRAIL_BLOCKED' ? 'A guardrail on your OpenRouter account blocks every provider of this model.'
    : classificazione.richiestaNonPartita === true ? 'The provider could not be reached.' // la frase di `inviaCloudProtetta`, già tradotta (`errori.kernel.fornitoreIrraggiungibile`)
    : messaggi[classificazione.classe] ?? 'The provider did not accept the request.');
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
  /* `data.type` è il tipo che il fornitore dichiara nell'evento (`billing_error`): lo stato di un errore del flusso lo deduce l'SDK, e dice 400 anche sul credito finito */
  const messaggio = `${codice} ${error?.name ?? ''} ${error?.message ?? ''} ${error?.cause?.message ?? ''} ${typeof error?.data?.type === 'string' ? error.data.type : ''} ${stato ? `HTTP ${stato}` : ''}`;
  const esito = classificaErroreDiCorsa({ codice, messaggio });
  if (esito.classe !== 'ignoto' || !(stato >= 500 && stato <= 599)) return esito;
  return classificaErroreDiCorsa({ messaggio: 'upstream error' });
}

/** L1 del motore locale (20/10/2026): il corpo chiede il ragionamento SPENTO? Solo `none` o `enabled:false`, mai un livello. */
export function chiedeRagionamentoSpento(corpo) {
  const sforzo = corpo?.reasoning_effort ?? corpo?.reasoning?.effort;
  return (typeof sforzo === 'string' && sforzo.trim().toLowerCase() === 'none') || corpo?.reasoning?.enabled === false;
}

/** P-H: la fetch conosce la chiave; il kernel resta proprietario dei ritentativi.
 * eseguiConFallback avvolge UNA chiamata del kernel, mai il ciclo degli attrezzi.
 * I callback del cambio e del consumo devono essere durabili prima della nuova chiamata.
 */
/* L'SDK avvolge in `AI_APICallError` un flusso che cade mentre legge i primi eventi: la caduta sta nella sua causa. */
function flussoDelPianoCaduto(errore) {
  for (let voce = errore, passi = 0; voce && passi < 4; voce = voce.cause, passi += 1) if (voce.code === 'PROVIDER_STREAM_INCOMPLETE') return true;
  return false;
}

/*
 * Il servizio ha DETTO errore dentro il flusso, e dice che riprovare non serve: è un esito noto, non una caduta, e non si ripete. L'SDK (`ai`,
 * `normalizeStreamProviderError`) consegna ogni errore del flusso come `AI_StreamProviderError`. Un sovraccarico porta `isRetryable: true` e si ritenta.
 */
export function erroreDichiaratoNelFlusso(errore) {
  return errore?.name === 'AI_StreamProviderError' && errore.isRetryable === false;
}

/* Decisione 116 C: le frasi delle righe (inglese; lo schermo le dice nella sua lingua dall'esito, queste restano per chi non conosce
   l'evento), il tetto dei rinnovi dopo un rifiuto per giro, e l'attesa del rinnovo che «Ferma» interrompe subito. */
const FRASE_RINNOVO_IN_CORSO = 'Renewing your ChatGPT sign-in';
const FRASE_ACCESSO_RINNOVATO = 'ChatGPT sign-in renewed, continuing';
const FRASE_ACCESSO_RIPRESO = 'The ChatGPT sign-in had expired: renewed, picking up from here';
export const RINNOVI_DOPO_RIFIUTO_PER_GIRO = 3;
function conSegnaleDiStop(promessa, signal) {
  if (!signal) return promessa;
  if (signal.aborted) return Promise.reject(signal.reason instanceof Error && signal.reason.name === 'AbortError' ? signal.reason : new DOMException('The request was stopped.', 'AbortError'));
  return new Promise((risolvi, rifiuta) => {
    const alStop = () => rifiuta(signal.reason instanceof Error && signal.reason.name === 'AbortError' ? signal.reason : new DOMException('The request was stopped.', 'AbortError'));
    signal.addEventListener('abort', alStop, { once: true });
    promessa.then((v) => { signal.removeEventListener('abort', alStop); risolvi(v); }, (e) => { signal.removeEventListener('abort', alStop); rifiuta(e); });
  });
}

export function creaFetchMultiProvider(fetchDiRete = fetch, {
  risolvi = risolviDestinazioneModello, dipendenze = null, onAvviso = null,
  providerStore = null, fallbackProviders = [], onCambioFornitore = null, onConsumoFornitore = null,
  /* Spesa di servizio (owner 30/10/2026, parte 2 A): la porta per le chiamate col segno `talosServizio` (il riassunto nel giro). Senza la
     porta quelle chiamate restano `consumo-fornitore` come oggi (compatibilità: lo scopre la prova di ogni ospite, condizione del Mobile). */
  onConsumoDiServizio = null,
  modelloSessione = null,
  /* Modalità veloce (owner 31/10/2026): la fascia della conversazione, letta a ogni richiesta. Le chiamate di servizio non la prendono: restano al consumo normale. */
  fasciaDiServizioFn = null,
  /* 14/10/2026 (owner): la chiave Z.AI solo all'indirizzo scelto (`zai-indirizzo.mjs`, `soloIndirizzo`). Di serie come prima. */
  zaiSoloIndirizzo = false,
  /* P0 · punto 7 (16/09): iniettabile perché una prova non deve aspettare mezz'ora per provarla. */
  inattivitaGenerazioneMs = null,
  /* 17/09: il guardiano del corpo, iniettabile per le prove dello strato cache (vedi `creaFetchInstradata`). */
  sorvegliaCorpo = sorvegliaCorpoDiGenerazione,
  /* Revisione O1 (21/10/2026): la chiave d'instradamento della sessione (vedi `creaFetchInstradata`), già ridotta a impronta. */
  chiaveDiSessione = null,
  /* owner 01/11/2026: l'id della sessione, solo per il motore locale di questo processo: non esce mai verso un fornitore */
  sessioneDelGiro = null,
  /* L1 1.3, revisione blocco 5 (A-4; owner 26/10 notte): un giro senza la persona davanti (automazione, passo di Workflow, sotto-agente).
     Sul rifiuto del motore locale NON si riapre e NON si chiede: si riassume come prima. Chi cresce senza la persona è il registro, alla
     soglia, e solo se nessun'altra conversazione usa il motore. */
  senzaPersona = false,
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
  /*
   * ⭐ Decisione 116, variante C (owner 04/11/2026; forma `FORMA-116-RINNOVO-C-2026-11-04.md`) — il rinnovo dell'accesso col piano ChatGPT
   *   a metà giro, con la sua memoria PER GIRO (come quella degli attrezzi): quanti rinnovi dopo un rifiuto (tetto 3), se la riga quieta
   *   è già stata detta, l'ultimo token visto, l'impronta dell'ultimo token rifiutato (calcolata una volta per token: Performance).
   *   Fonti: OpenAI, «Codex CI/CD auth» (developers.openai.com/codex/auth/ci-cd-auth, letta il 04/11/2026: su un 401 Codex rinnova e
   *   ripete una volta); spacedriveapp/spacebot PR 254 (rinnovo forzato su 401/403 e UNA ripetizione, poi errore di riaccesso);
   *   openai/codex issue 7144 (rilettura con rinnovo forzato, un tentativo). Nessun token, stato o codice nelle righe.
   */
  const rinnovoDelGiro = { rinnovi: 0, ripreso: false, rinnovato: false, ultimoToken: null, impronta: null };
  if (!providerStore && !catena.length) return creaFetchInstradata(fetchDiRete, { risolvi, dipendenze, sessioneDelGiro, onAvviso, inattivitaGenerazioneMs, sorvegliaCorpo, memoriaAttrezzi, senzaPersona, fasciaDiServizioFn });
  if (!dipendenze || (catena.length && (!providerStore || typeof onCambioFornitore !== 'function' || typeof onConsumoFornitore !== 'function'))) {
    throw new OwnerRuntimeUnavailableError('To continue with another provider, access, chat notices and usage recording are needed.', 'PROVIDER_FALLBACK_NOT_CONNECTED');
  }
  let effettivo = null, indice = -1, occupato = false;
  // Owner 09/10/2026: l'indirizzo di Z.AI (piano GLM o saldo) per chiave, uno per fetch come la memoria degli attrezzi.
  const rilevatoreZai = typeof providerStore?.indirizzoRilevato === 'function'
    ? creaRilevatoreZai({ providerStore, fetchFn: fetchDiRete, onAvviso, soloIndirizzo: zaiSoloIndirizzo === true }) : null;

  /* Spesa di servizio (parte 2 A): una sola strada per la riga di spesa. Col segno del kernel e la porta nuova ⇒ `consumo-di-servizio`
     (stesso costruttore della parte 1); altrimenti `consumo-fornitore`, come sempre. Mai tutte e due: SPOSTATA, mai doppia (Performance). */
  async function deposita(contesto, valore) {
    const servizio = contesto?.servizio;
    if (servizio && typeof onConsumoDiServizio === 'function') {
      /* Mobile (30/10): un guasto della riga di servizio non fa mai fallire una chiamata che il fornitore ha già servito e pagato.
         Due guasti diversi (CLI, 30/10):
         - il COSTRUTTORE lancia (uno scopo o un esito che non conosce) ⇒ nessuna riga è nata: la spesa si conta come richiesta;
         - la PORTA lancia ⇒ non si sa se la riga è già scritta (un lettore a valle può lanciare DOPO il broadcast): si scrive nel log e
           basta — un ripiego qui contarebbe lo stesso uso due volte, una per nome, e la seconda finirebbe nell'«ultima richiesta». */
      let riga = null;
      try {
        riga = valoreConsumoDiServizio({ scopo: servizio.scopo, inPrimoPiano: servizio.inPrimoPiano === true,
          fonte: valore.provider, modelloRemoto: valore.model, usage: valore.usage, costoDichiarato: valore.costoDichiarato ?? undefined,
          esito: valore.esito, maxTokensInviato: valore.maxTokensInviato,
          ...(Number.isSafeInteger(servizio.richiestaDelGiro) && servizio.richiestaDelGiro >= 0 ? { richiestaDelGiro: servizio.richiestaDelGiro } : {}),
          ...(typeof servizio.idRiassunto === 'string' ? { idRiassunto: servizio.idRiassunto } : {}), // spesa dei riassunti (30/10 sera)
          ...(Number.isFinite(contesto.inizioTentativo) ? { durataMs: Date.now() - contesto.inizioTentativo } : {}) });
      } catch (errore) {
        console.warn('[talos] riga di spesa di servizio non costruita, contata come richiesta:', errore?.message ?? errore);
      }
      if (riga) {
        try { await onConsumoDiServizio(riga); }
        catch (errore) { console.warn('[talos] porta della spesa di servizio in errore (la riga può essere già scritta):', errore?.message ?? errore); }
        return;
      }
    }
    if (typeof onConsumoFornitore === 'function') await onConsumoFornitore(valore);
  }

  /* Decisione 116 C: una riga è una notizia, mai la causa di un guasto della richiesta (come la finestra locale) */
  async function rigaDelRinnovo(frase, opzioni) {
    if (typeof onAvviso !== 'function') return;
    try { await onAvviso(frase, opzioni); } catch { /* la riga è una notizia: non ferma la richiesta */ }
  }
  function improntaDelToken(token) {
    if (rinnovoDelGiro.impronta?.token !== token) rinnovoDelGiro.impronta = { token, valore: createHash('sha256').update(token).digest('hex').slice(0, 16) };
    return rinnovoDelGiro.impronta.valore;
  }
  /* Stato 1: il token cambia fra due richieste dello stesso giro senza un rifiuto (rinnovato in anticipo dalla custodia, o spinto
     dall'app) ⇒ una riga quieta per giro; dopo un «ripreso» nessuna. La ripetizione dopo un rifiuto cambia token per costruzione: non conta. */
  async function notaTokenDelGiro(token, contesto) {
    const prima = rinnovoDelGiro.ultimoToken;
    rinnovoDelGiro.ultimoToken = token;
    if (contesto?.rinnovatoDopoRifiuto || prima === null || prima === token || rinnovoDelGiro.rinnovato || rinnovoDelGiro.ripreso) return;
    rinnovoDelGiro.rinnovato = true;
    await rigaDelRinnovo(FRASE_ACCESSO_RINNOVATO, { riga: 'accesso-chatgpt', dati: { esito: 'rinnovato', allInvio: false } });
  }

  async function invia(url, opzioniInArrivo = {}, contesto = {}) {
    /* Spesa di servizio (parte 2 A; CLI e Performance): il segno del kernel passa nel CONTESTO della chiamata e si toglie dalle opzioni,
       così non arriva mai al fornitore né ai registri di rete; e il tentativo si cronometra da qui (la durata di QUESTO tentativo). */
    let opzioni = opzioniInArrivo;
    if (opzioni && typeof opzioni === 'object' && 'talosServizio' in opzioni) {
      const { talosServizio, ...perLaRete } = opzioni;
      if (contesto && typeof contesto === 'object' && talosServizio && typeof talosServizio === 'object') contesto.servizio = talosServizio;
      opzioni = perLaRete;
    }
    if (contesto && typeof contesto === 'object') contesto.inizioTentativo = Date.now();
    let corpo;
    try { corpo = typeof opzioni.body === 'string' ? JSON.parse(opzioni.body) : null; } catch { /* altre fetch intatte */ }
    if (!corpo || typeof corpo.model !== 'string' || !String(url).includes('/chat/completions')) return fetchDiRete(url, opzioni);
    // CONTRATTO-R30-R31 (Performance): il max_tokens davvero inviato, per il conto di questa chiamata
    if (contesto && typeof contesto === 'object' && Number.isSafeInteger(corpo.max_tokens)) contesto.maxTokensInviato = corpo.max_tokens;
    opzioni.signal?.throwIfAborted();
    const { fonte, modelloRemoto } = separaFonteModello(corpo.model);
    const record = REGISTRO_FORNITORI[fonte];
    /* 11/10/2026, «Continue with ChatGPT» — un fornitore con accesso dall'account non passa dalla macchina delle chiavi (pool,
       panchine, rotazione, ripieghi): non ha chiavi, e la sua strada di pagamento non si cambia mai da soli. Va diritto
       all'instradamento, e i suoi guasti tornano col codice del piano (`erroreDelPiano`) invece che riclassificati. */
    if (record?.auth?.tipo === 'oauth-pkce') {
      const tokenUsato = async (token) => {
        if (typeof token !== 'string' || !token) return;
        if (contesto && typeof contesto === 'object') contesto.tokenUsato = token;
        await notaTokenDelGiro(token, contesto);
      };
      try { return await conPrimoPezzo(await creaFetchInstradata(fetchDiRete, { risolvi, dipendenze, sessioneDelGiro, onAvviso, inattivitaGenerazioneMs, sorvegliaCorpo, memoriaAttrezzi, senzaPersona, fasciaDiServizioFn: contesto?.servizio ? null : fasciaDiServizioFn, tokenUsato })(url, opzioni)); }
      catch (guasto) {
        /* Il collegamento è caduto prima che arrivasse un solo pezzo: al giro non è stato consegnato niente, si rifà la stessa richiesta, una volta, con l'input intero. */
        if (flussoDelPianoCaduto(guasto)) {
          if (!contesto || contesto.ripetutaDopoCaduta) throw guasto;
          contesto.ripetutaDopoCaduta = true;
          return invia(url, opzioni, contesto);
        }
        const errore = erroreDelPiano(guasto);
        /*
         * ⭐ Decisione 116 C, stato 2 — un 401 del piano: si rinnova SUBITO (sul PC la custodia nostra col rinnovo forzato, sul telefono
         *   r4 chiede il token all'app e lo aspetta ≤10 s) e si rifà la STESSA richiesta, una volta, con lo stesso corpo. Una sola volta
         *   per richiesta, al massimo tre per giro. La riga viva dice «Rinnovo l'accesso…» mentre si aspetta; la riga quieta «ripreso»
         *   una volta per giro, solo se la ripetizione è partita. Il rinnovo che fallisce lancia il SUO codice (rete, accesso scaduto),
         *   che lo schermo trasforma nella scheda giusta. «Ferma» durante il rinnovo ferma subito, senza ripetere. Senza la dipendenza
         *   (la forma della CLI) non cambia niente: il 401 resta com'era.
         */
        if (errore.stato === 401 && typeof dipendenze?.rinnovaTokenDelPiano === 'function' && contesto && typeof contesto === 'object'
          && !contesto.rinnovatoDopoRifiuto && rinnovoDelGiro.rinnovi < RINNOVI_DOPO_RIFIUTO_PER_GIRO) {
          contesto.rinnovatoDopoRifiuto = true;
          rinnovoDelGiro.rinnovi += 1;
          const rifiutato = typeof contesto.tokenUsato === 'string' ? contesto.tokenUsato : null;
          const dallApp = dipendenze.rinnovoDelPianoDallApp === true;
          const comuni = { requestId: randomUUID(), tentativo: 1, tentativiMassimi: 1,
            ...(dallApp ? { chiedeTokenAllApp: true, ...(rifiutato ? { impronta: improntaDelToken(rifiutato) } : {}) } : {}) };
          await rigaDelRinnovo(FRASE_RINNOVO_IN_CORSO, { riga: 'rinnovo-accesso', dati: { fase: 'invio', ...comuni, at: Date.now() } });
          try {
            await conSegnaleDiStop(dipendenze.rinnovaTokenDelPiano({ rifiutato, signal: opzioni.signal }), opzioni.signal);
          } catch (nonRinnovato) {
            if (nonRinnovato?.name === 'AbortError' || opzioni.signal?.aborted) throw nonRinnovato;
            throw erroreDelPiano(nonRinnovato);
          } finally {
            await rigaDelRinnovo(FRASE_RINNOVO_IN_CORSO, { riga: 'rinnovo-accesso', dati: { fase: 'fine', ...comuni, at: Date.now() } });
          }
          const ripresa = await invia(url, opzioni, contesto);
          /* D3 di R116 (forma §5, R12): righe quiete ≤1 per giro — dopo un «rinnovato» dello stesso giro il «ripreso» non si scrive */
          if (!rinnovoDelGiro.ripreso) {
            rinnovoDelGiro.ripreso = true;
            if (!rinnovoDelGiro.rinnovato) await rigaDelRinnovo(FRASE_ACCESSO_RIPRESO, { riga: 'accesso-chatgpt', dati: { esito: 'ripreso', allInvio: false } });
          }
          return ripresa;
        }
        /* D1 di R116 (forma §8): la richiesta ripetuta DOPO il rinnovo è rifiutata di nuovo ⇒ l'accesso collegato non vale; lo si dice alla
           custodia (solo il PC dà il gancio), così `chatgpt_account` `sign_in` torna a mettere la carta invece di «Nothing to do».
           C2 della revisione del blocco chat (04/11): lo stesso quando il rinnovo è saltato SOLO per il tetto del giro (il giro finisce in
           «Accedi»); un 401 senza il gancio di rinnovo (la forma della CLI) resta senza segno, come prima. */
        if (errore.stato === 401 && (contesto?.rinnovatoDopoRifiuto || (typeof dipendenze?.rinnovaTokenDelPiano === 'function' && rinnovoDelGiro.rinnovi >= RINNOVI_DOPO_RIFIUTO_PER_GIRO))
          && typeof dipendenze?.segnaAccessoRifiutato === 'function') {
          try { dipendenze.segnaAccessoRifiutato(); } catch { /* un segno, mai la causa di un guasto */ }
        }
        /* 18/10/2026, custode nell'app (`chatgpt-accesso-ospite.mjs`): un 401 vuol dire che il token spinto dall'app non vale più. r4 non
           lo rinnova (non ha un refresh token): lo dimentica e lo DICE con `CHATGPT_TOKEN_DA_RINNOVARE`, l'app rinnova e riprova.
           Senza il gancio (desktop, custodia nostra) il 401 resta `CHATGPT_ACCESSO_NON_VALIDO`, come prima. */
        if (errore.stato === 401 && typeof dipendenze?.suTokenDelPianoRifiutato === 'function') {
          const altro = dipendenze.suTokenDelPianoRifiutato(errore);
          if (altro) throw altro;
        }
        /* Il limite d'uso: il kernel aspetta e rifà la STESSA richiesta (come Claude Code), mostrando quando; «Ferma» annulla. */
        if (errore.code === 'CHATGPT_LIMITE_DEL_PIANO') {
          /* 12/10/2026, owner «come Codex»: se il servizio dichiara QUANDO torna il limite finito, si aspetta fino a lì (oltre 24 ore il
             giro si ferma, come prima); sennò resta il ritento ogni 30 minuti */
          const finoAlRipristino = attesaFinoAlRipristino(leggiLimitiDelPiano(errore.intestazioni));
          const attesa = finoAlRipristino === null ? attesaDelLimiteDelPiano(errore.intestazioni)
            : (finoAlRipristino > ATTESA_LIMITE_DEL_PIANO_MASSIMA_MS ? null : finoAlRipristino);
          if (attesa !== null) {
            return marcaRifiutoProvider(new Response(JSON.stringify({ error: { code: errore.codiceOpenAi ?? 'subscription_sharing_usage_limit_exceeded', message: errore.message } }),
              { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After-Ms': String(Math.round(attesa)), 'Retry-After': String(Math.ceil(attesa / 1000)) } }), 'limite-del-piano');
          }
        }
        /* ⛔ 12/10/2026 (trascritto dell'owner, sessione ef697840): cinque sotto-agenti partiti insieme col piano, due morti alla
           PRIMA richiesta con «ChatGPT plan usage cannot be checked right now» (`subscription_sharing_usage_unavailable`, 503).
           La tabella degli errori li dichiara passeggeri (`transitorio: true`), ma qui si lanciava subito: un guasto lanciato non
           passa dai ritentativi del kernel, che li fa solo su una RISPOSTA con stato. Ora un guasto passeggero del servizio (5xx, o
           uno dei due codici «unavailable») torna come risposta col suo stato: il kernel rifà la STESSA richiesta sulla STESSA
           strada del piano, con le sue attese (e `Retry-After` se il servizio lo dice). Nessun cambio di strada di pagamento
           («Do not silently switch billing paths on failure»); finiti i tentativi il giro si ferma col codice del piano, più sotto.
           Un guasto senza stato (rete caduta) resta com'era: lo tratta già la strada dell'esito incerto. */
        if (errore.transitorio === true && Number.isInteger(errore.stato) && errore.stato >= 500) {
          const dopo = errore.intestazioni?.['retry-after'];
          return new Response(JSON.stringify({ error: { code: errore.codiceOpenAi ?? 'service_unavailable', message: errore.message } }),
            { status: errore.stato, headers: { 'Content-Type': 'application/json', ...(typeof dopo === 'string' && dopo ? { 'Retry-After': dopo } : {}) } });
        }
        throw errore;
      }
    }
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
    const segnala = async (classificatoDalTesto, headers, stato, attesaCorpo = null, numeri = null) => {
      /* P2 (ledger Codex 28/09, `SUBENTRO-KERNEL-P2-2026-09-28`; riportata sulla base di RETRY01-09 il 30/09 col sì
       * dell'owner). Un 401 senza chiave inviata, o un 403 con una chiave FACOLTATIVA, non dicono che una chiave è stata
       * rifiutata: diventano «accesso», non transitorio, senza avviso di chiave e senza panchina. Fonti rilette il
       * 30/09/2026: Ollama «The local API at http://localhost:11434 does not require authentication»
       * (docs.ollama.com/api/authentication); RFC 9110 §15.5.4, un 403 può non dipendere dalle credenziali. */
      const classificazione = (stato === 401 && !scelta) || (stato === 403 && !record.chiaveObbligatoria)
        ? { classe: 'accesso', transitorio: false }
        : classificatoDalTesto;
      contesto.errore = erroreFornitorePubblico(classificazione, stato, numeri); // R10-2 (i numeri ci sono solo sul contesto pieno)
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
      // F1: nemmeno il contesto pieno — la chiave è sana, è la richiesta a essere troppo grande
      if (classificazione.classe === 'contesto') return;
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
      /* Owner 09/10/2026 («deve essere dinamica»): Z.AI fattura il piano GLM solo su un suo indirizzo. Senza un indirizzo scelto
         dalla persona, la richiesta va a quello rilevato per questa chiave, piano per primo (zai-indirizzo.mjs). */
      if (rilevatoreZai && fonte === 'zai' && scelta) target = await rilevatoreZai.indirizzoPer(target, scelta, modelloRemoto);
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
        /* 01/11/2026, vista locale: QUI il corpo vero c'è ancora (sotto viene sostituito dal messaggio pubblico, e chi lo legge dopo non
           può più riconoscerlo — preso dalla prova VSP-6). Un'immagine che il modello locale non può leggere sale col suo codice. */
        const nonVede = FONTI_DI_MOTORE_LOCALE.has(fonte) ? motoreLocaleNonVede(response.status, testo) : null;
        if (nonVede) { contesto.errore = nonVede; throw nonVede; }
        /* F1 della CLI (16/10/2026): un «contesto pieno» del fornitore (413, o il suo testo) usciva come «The provider did not accept
           the request.» e nessuno lo riprovava — né K8, né il ritentativo di «Non aspettare se entra». Si riconosce QUI, dal testo che
           solo questo adattatore vede, con lo stesso classificatore di chi riprova. */
        const contestoPieno = classificaErroreFornitore({ message: testo, status: response.status }) === 'contesto-pieno';
        const classificazione = contestoPieno ? { classe: 'contesto', transitorio: false }
          : fonte === 'openrouter' && response.status === 402
          ? classificaLimiteOpenRouter(testo)
          : (fonte === 'openrouter' && response.status === 404 && classificaTuttiEsclusiOpenRouter(testo)) || classificaRifiutoNoto(testo, response.status)
            || limiteNonContesto(classificaGuasto({ message: testo }, response.status), response.status);
        /* Owner 09/10/2026 («Riprova sull'altro e lo dice»): «credito finito» da Z.AI ⇒ una sonda sola senza l'indirizzo appena
           rifiutato; se un altro risponde la stessa richiesta riparte lì (non è un ritento: il primo invio è stato rifiutato). */
        if (rilevatoreZai && fonte === 'zai' && scelta && classificazione.classe === 'credito' && !contesto.zaiCambiato) {
          const altrove = await rilevatoreZai.dopoCredito(target, scelta, modelloRemoto);
          if (altrove) { contesto.zaiCambiato = true; return rete(altrove, init); }
        }
        // BUG-25: gli header dicono per primi; solo se tacciono, le grammatiche di reset nel corpo (parity Hermes).
        await segnala(classificazione, response.headers, response.status, leggiAttesaResetDalCorpo(testo),
          contestoPieno ? numeriDelContestoPieno({ message: testo }) : null); // R10-2: i tre numeri, mai il corpo
        return new Response(JSON.stringify({ error: { message: contesto.errore.message } }), { status: response.status, headers: { 'Content-Type': 'application/json', ...contesto.headersRitenta } });
      } catch (error) {
        if (opzioni.signal?.aborted && opzioni.signal.reason?.name !== 'TimeoutError') throw opzioni.signal.reason;
        if (error === contesto.errore) throw error;
        const classificazione = classificaGuasto(error);
        /* 04/11/2026: la connessione non si è aperta (rifiutata, nome sconosciuto, nessuna strada): niente è partito, niente si paga.
           Il codice che c'era già per «fornitore irraggiungibile» (`inviaCloudProtetta`, `PROVIDER_NETWORK_ERROR`, tradotto nelle carte e
           `transient_network` nei flussi), classe `rete` transitoria, e il segno che chi riprova o cambia fornitore lo fa senza doppio costo. */
        const codiceDiRete = codiceDiRichiestaNonPartita(error);
        if (codiceDiRete) {
          contesto.errore = erroreFornitorePubblico({ ...classificazione, code: 'PROVIDER_NETWORK_ERROR', classe: 'rete', transitorio: true, richiestaNonPartita: true, codiceDiRete });
          throw contesto.errore;
        }
        // No HTTP rejection was received. A POST may already have been processed.
        contesto.errore = erroreEsitoProviderIncerto(classificazione);
        throw contesto.errore;
      }
    };
    const instradata = creaFetchInstradata(rete, { risolvi, dipendenze: {
      ...dipendenze, leggiChiave: p => p === fonte && scelta ? scelta.chiave : dipendenze.leggiChiave(p),
    }, onAvviso, instradaOpenRouter: true, inattivitaGenerazioneMs, sorvegliaCorpo, memoriaAttrezzi, chiaveDiSessione, sessioneDelGiro, senzaPersona });
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
    /*
     * ⛔⛔ 15/10/2026 notte, giro vero sulla 4177 (glm-5.3-flash) — LA CHIAMATA SECONDARIA. La compattazione istantanea prepara il
     *   riassunto IN SOTTOFONDO mentre il giro va avanti: è per costruzione una seconda chiamata della sessione in contemporanea, e il
     *   guardiano qui sotto (una chiamata per volta, perché la catena dei fornitori è uno stato condiviso) la scambiava per un errore:
     *   la richiesta del giro riceveva `PROVIDER_FALLBACK_BUSY` e il giro FALLIVA, due volte su due. Le prove con la rete finta non
     *   lo potevano vedere: lì l'involucro non c'è.
     * ⇒ `secondaria: true` = una richiesta a parte, come quella speculativa di Codex (`core/src/session/async_compaction.rs`, «Holds the
     *   current speculative request»): un solo tentativo, sul fornitore ATTIVO, senza toccare la catena — niente guardiano, niente
     *   cambio di fornitore, niente panchina. Fallisce ⇒ lancia, e chi l'ha chiesta (il riassunto in sottofondo) resta senza. Il suo
     *   `consumo-fornitore` si deposita comunque: il costo del riassunto entra nel conto della sessione (IST-REV-01 del bugfixer).
     */
    /* Revisione del bugfixer, 16/10/2026 (IST2-REV-02): «un solo tentativo» qui sopra non lo era — il riassunto passava per i ritentativi
       del giro (`ritentativiDiSerie`, 10 come Claude Code): su un 429 11 richieste e ~160 s di attese sullo STESSO fornitore limitato,
       mentre il giro gli chiede le sue, e all'emergenza il giro aspetta proprio quella promessa. Un ritentativo basta a un guasto di
       passaggio; oltre, il riassunto non è pronto e il giro compatta da sé quando gli serve. */
    if (opzioni.secondaria === true) {
      const destinazione = destinazioneDellaSecondaria({ effettivo, modello: opzioni.modello, modelloProprio: opzioni.modelloProprio === true });
      const contesto = { guastiHttp: new Map() };
      let risultato;
      try {
        risultato = await chiama({ modello: `${destinazione.provider}:${destinazione.model}`, fetchDiRete: (url, init) => invia(url, init, contesto), tentativiMassimi: TENTATIVI_DELLA_SECONDARIA, attesaRitentaMassimaMs: ATTESA_MASSIMA_DELLA_SECONDARIA_MS });
      } catch (error) {
        if (contesto.scelta && (typeof onConsumoFornitore === 'function' || typeof onConsumoDiServizio === 'function')) {
          const fermato = Boolean(opzioni.segnaleStop?.aborted || error?.fermatoSuRichiesta || error?.name === 'AbortError');
          const usage = fermato ? null : consumoPubblico(error?.usage);
          try {
            await deposita(contesto, { tipo: 'consumo-fornitore', ...destinazione, ...tettoInviatoNelConsumo(contesto), usage, costoDichiarato: usage?.cost ?? null, esito: fermato ? 'fermato' : 'interrotto' });
          } catch { /* il deposito non copre l'errore vero */ }
        }
        throw error;
      }
      const usage = consumoPubblico(risultato?.usage);
      const costoDichiarato = typeof usage?.cost === 'number' && Number.isFinite(usage.cost) && usage.cost >= 0 ? usage.cost : null;
      await deposita(contesto, { tipo: 'consumo-fornitore', ...destinazione, ...tettoInviatoNelConsumo(contesto), usage, costoDichiarato, esito: 'completato' });
      if (REGISTRO_FORNITORI[destinazione.provider]?.auth?.tipo === 'oauth-pkce' && typeof dipendenze?.registraUsoDelPiano === 'function') {
        try { await dipendenze.registraUsoDelPiano({ esito: 'completato', usage }); } catch { /* il conteggio è un di più */ }
      }
      return { ...risultato, usage, fornitoreEffettivo: destinazione.provider, modelloEffettivo: destinazione.model };
    }
    /* ⛔ Revisione 3 della CLI sulla 0.6.13 (22/10/2026, S2-1) — un modello DIVERSO da quello della sessione (il modello leggero del
       riassunto, un titolo) usa la stessa chiave della sessione. Prima questa uscita stava IN TESTA: il riassunto col modello proprio
       non arrivava mai al ramo `secondaria` qui sopra (niente tetto di due tentativi né di 30 s d'attesa), e `invia`
       girava senza contesto, quindi un 429 a chiave unica mandava in PANCHINA la chiave della sessione per tutto il Retry-After: la
       richiesta successiva del giro aspettava ~Retry-After + 10 s dietro un modello che non era il suo (misura della CLI, banco
       OpenRouter a Retry-After 90). Ora: la secondaria passa prima dal suo ramo, e qui un guasto di passaggio a chiave unica si CONTA
       e non si panchina — come per la richiesta del giro (`guastoHttp`), che decide la panchina solo dopo i suoi ritentativi. */
    if (modelloSessione && JSON.stringify(separaFonteModello(opzioni.modello)) !== JSON.stringify(separaFonteModello(modelloSessione))) {
      return chiama({ fetchDiRete: (url, init) => invia(url, init, { guastiHttp: new Map() }) });
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
            if (contesto.scelta && (typeof onConsumoFornitore === 'function' || typeof onConsumoDiServizio === 'function')) {
              try { await deposita(contesto, { tipo: 'consumo-fornitore', ...destinazione, ...tettoInviatoNelConsumo(contesto), usage: null, costoDichiarato: null, esito: 'fermato' }); } catch { /* lo stop resta lo stop */ }
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
          /* 11/10/2026, «Continue with ChatGPT» — i guasti del piano (accesso mancante o scaduto, piano non abilitato, limite
             d'uso, richiesta non ammessa) hanno già il loro codice e la loro frase (`erroreDelPiano`). Non si riclassificano e,
             soprattutto, non si cerca un fornitore di riserva: «Do not silently switch billing paths on failure»
             (developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery, riletta l'11/10/2026). */
          if (typeof error?.code === 'string' && error.code.startsWith('CHATGPT_')) throw error;
          // tentativi del limite finiti: il giro si ferma col codice del piano, non con un «troppo traffico» generico
          if (REGISTRO_FORNITORI[destinazione.provider]?.auth?.tipo === 'oauth-pkce') {
            /* Un flusso caduto a metà risposta non ha uno stato: non è un rifiuto del piano, è un esito incerto, e il ritento del kernel vale anche qui. Prima il giro moriva con
               `CHATGPT_ERRORE`, una caduta del collegamento aperto a 19 minuti su H (31/10/2026). Stessa strada di pagamento: si rifà la stessa richiesta, mai un altro fornitore. */
            const delPiano = erroreDelPiano(error);
            const senzaRifiuto = delPiano.code === 'CHATGPT_ERRORE' && !delPiano.dichiarato && (delPiano.stato === null || delPiano.stato === 200);
            if (!flussoDelPianoCaduto(error) && !(senzaRifiuto && error?.parziale)) {
              /* Detto dal servizio a flusso partito: il testo già arrivato resta, e il segno dice al kernel di non ripetere. */
              if (error?.parziale) Object.assign(delPiano, { parziale: error.parziale, causaDiTrasporto: 'PROVIDER_STREAM_ERROR' });
              throw delPiano;
            }
          }
          /* ⛔ BC-79.2 — e nemmeno il rifiuto di un motore locale: non è transitorio, non è colpa di
             una chiave, e un fornitore di riserva non c'entra niente con un GGUF che sta in casa. */
          if (error?.code === 'LOCAL_ENGINE_REJECTED_REQUEST') throw error;
          /* ⛔ 25/09/2026 — né un motore locale che non c'è o non parte, né una destinazione mal configurata: condizioni
             nate PRIMA della rete, con una frase loro. Vedi `CONDIZIONI_PRIMA_DELLA_RETE`. */
          if (CONDIZIONI_PRIMA_DELLA_RETE.has(error?.code)) throw error;
          /* ⛔ 25/09/2026 sera — e nemmeno il contesto pieno del motore locale: non è transitorio, un fornitore di riserva non
             c'entra, e mascherato da «richiesta non valida» il kernel non potrebbe più comprimere (`ContestoLocalePienoError`). */
          if (error?.code === 'LOCAL_CONTEXT_EXCEEDED') throw error;
          // L1 1.3: la carta «Chiedimi» della finestra locale piena — la decide la persona, non un fornitore di riserva
          if (error?.code === 'LOCAL_WINDOW_ASK') throw error;
          // riverifica del bugfixer (CP-REV-02): anche un 429 LANCIATO (gli SDK nativi) che dice «too many tokens» è traffico
          const statoLanciato = error?.stato ?? error?.statusCode;
          const classificazione = contesto.errore ?? limiteNonContesto(classificaGuasto(error, statoLanciato), Number(statoLanciato));
          const incerto = error?.esitoIncerto === true || contesto.errore?.esitoIncerto === true
            || contesto.rispostaAccettata || rispostaInterrotta || Boolean(error?.parziale) || flussoDelPianoCaduto(error);
          /* Un rifiuto detto dal fornitore a flusso partito è un esito noto: esce come un rifiuto HTTP, con la sua classe e la sua frase, mai come «risposta
             interrotta». `PROVIDER_STREAM_ERROR` è il segno che il kernel conosce: un errore esplicito non si ritenta da solo (BUG-16, R-44). */
          const dichiarato = erroreDichiaratoNelFlusso(error);
          /* Cura 324, giro 12 (sonda V15 dei fornitori): la finestra piena che il kernel ha letto DENTRO il flusso (`finestraPiena`) è un esito
             noto anche a risposta accettata: esce come il contesto pieno dell'HTTP, coi numeri, mai come «risposta interrotta» che nessuno
             compatta. Resta `incerto` per il resto (niente panchina, niente riserva), come ogni flusso partito. */
          const pienaNelFlusso = error?.finestraPiena === true && classificazione.classe === 'contesto';
          const pulito = incerto && !dichiarato && !pienaNelFlusso ? erroreEsitoProviderIncerto({ ...classificazione, code: error?.code, causaDiTrasporto: error?.causaDiTrasporto ?? classificazione.causaDiTrasporto, usage: error?.usage })
            : erroreFornitorePubblico(classificazione, error?.stato ?? contesto.errore?.stato,
              classificazione.classe === 'contesto' ? numeriDelContestoPieno(contesto.errore ?? error) : null); // R10-2: i numeri restano
          // Keep partial text for explicit recovery; changing providers must never replay this request.
          if (dichiarato) Object.assign(pulito, { dichiarato: true, transitorio: false, causaDiTrasporto: 'PROVIDER_STREAM_ERROR' });
          if (error?.parziale) pulito.parziale = error.parziale;
          // Cura 324, giro 11: il codice del pacchetto d'errore nel flusso, prima di ogni testo (campo opzionale del kernel)
          if (error?.statoNelFlusso) pulito.statoNelFlusso = error.statoNelFlusso;
          /* Giro 12: il ragionamento già trasmesso (il prefill era entrato) e il tipo del pacchetto, un nome corto; il messaggio del fornitore
             resta qui come ogni suo testo (R10-2) */
          if (error?.ragionamentoNelFlusso === true) pulito.ragionamentoNelFlusso = true;
          if (typeof error?.tipoDelFornitore === 'string' && /^[\w.-]{1,64}$/u.test(error.tipoDelFornitore)) pulito.tipoDelFornitore = error.tipoDelFornitore;
          if (contesto.ripetutaDopoCaduta) pulito.inviiInPiu = 1; // il rilancio della caduta prima del primo pezzo conta nel tetto dei reinvii
          /* Cura 324, giro 10: chi ha dato l'errore, come l'esito porta chi ha risposto (campi opzionali, il contratto resta). Dopo un cambio dentro
             la stessa chiamata è la riserva: il kernel ricorda il rifiuto del prefill su di lei (Hermes `agent/message_sanitization.py:953-961`) */
          Object.assign(pulito, { fornitoreEffettivo: destinazione.provider, modelloEffettivo: destinazione.model });
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
          await deposita(contesto, { tipo: 'consumo-fornitore', ...destinazione, ...tettoInviatoNelConsumo(contesto), usage, costoDichiarato: usage?.cost ?? null, esito: classificazione.classe === 'traffico' ? 'traffico' : 'interrotto' });
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
        await deposita(contesto, { tipo: 'consumo-fornitore', ...destinazione, ...tettoInviatoNelConsumo(contesto), usage, costoDichiarato, esito: 'completato' });
        /* 11/10/2026 — il conteggio nostro del piano ChatGPT (`chatgpt-uso.mjs`): una riga per richiesta COMPLETATA col piano, coi
           soli token. Mai il token d'accesso, mai il testo. Un guasto del registro non tocca la risposta già arrivata. */
        if (REGISTRO_FORNITORI[destinazione.provider]?.auth?.tipo === 'oauth-pkce' && typeof dipendenze?.registraUsoDelPiano === 'function') {
          try { await dipendenze.registraUsoDelPiano({ esito: 'completato', usage }); } catch { /* il conteggio è un di più */ }
        }
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
  /* Instradamento per modello su OpenRouter (CLI, 08/10/2026): `(modello) => campi del provider | null`. Assente = il comportamento di sempre. */
  openRouterRoutingFn = null,
  /* 14/10/2026 (owner): la chiave Z.AI solo all'indirizzo scelto, passato a `creaFetchMultiProvider`. Assente = come prima. */
  zaiSoloIndirizzo = false,
} = {}) {
  const specifier = normalizzaModuloPath(modulePath);
  let moduloPromise = null;
  const carica = async () => {
    if (!specifier) throw new OwnerRuntimeUnavailableError('The agent runtime is not configured for this installation.');
    if (!moduloPromise) {
      moduloPromise = Promise.resolve(importFn(specifier)).catch((error) => {
        moduloPromise = null;
        throw new OwnerRuntimeUnavailableError(FRASE_RUNTIME_NON_CARICATO, 'OWNER_RUNTIME_LOAD_FAILED', { cause: error });
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
        throw new OwnerRuntimeUnavailableError(FRASE_CATALOGO_ASSENTE, 'OWNER_RUNTIME_CONTRACT_INVALID');
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
        ...(typeof openRouterRoutingFn === 'function' ? { instradamentoFn: openRouterRoutingFn } : {}), // instradamento per modello (CLI, 08/10/2026)
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
        dipendenze: destinazioneModelloDeps, providerStore, fallbackProviders, modelloSessione: input?.modello, zaiSoloIndirizzo,
        onAvviso: input?.onAvviso, onCambioFornitore: input?.onCambioFornitore, onConsumoFornitore: input?.onConsumoFornitore,
        onConsumoDiServizio: input?.onConsumoDiServizio, // spesa di servizio, parte 2 A
        /* O1: l'id della sessione non esce in chiaro verso il fornitore, solo la sua impronta (64 caratteri, sotto i 256 di OpenRouter) */
        chiaveDiSessione: typeof input?.checkpointSessionId === 'string' && input.checkpointSessionId
          ? `talos-s-${createHash('sha256').update(input.checkpointSessionId).digest('hex')}`.slice(0, 64) : null,
        sessioneDelGiro: typeof input?.checkpointSessionId === 'string' && input.checkpointSessionId ? input.checkpointSessionId : null,
        /* L1 1.3, revisione blocco 5 (A-4): automazione, passo di Workflow o sotto-agente ⇒ sul rifiuto del motore locale si riassume. */
        senzaPersona: input?.senzaPersona === true,
        fasciaDiServizioFn: typeof input?.fasciaDiServizioFn === 'function' ? input.fasciaDiServizioFn : null,
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
            /* Owner 28/10/2026 (cache, punto 1): ora il nucleo mette fino a quattro marcatori, su ogni ruolo, da un'ora o da cinque minuti.
               Si toglie SOLO il marcatore nella forma che produce il nucleo; un pezzo di testo solo torna la stringa che era. */
            /* La forma del nucleo (`conMarcatoreDiCache`): il marcatore sta SOLO sull'ultimo pezzo, e quel pezzo è un testo o
               un'immagine senza altri campi. Un blocco esteso, un marcatore altrove o una direttiva estesa non sono nostri e restano. */
            const eNostro = (c) => c?.type === 'ephemeral' && (Object.keys(c).length === 1 || (Object.keys(c).length === 2 && c.ttl === '1h'));
            const parteDelNucleo = (p) => Object.keys(p).length === 3 && ((p.type === 'text' && typeof p.text === 'string') || (p.type === 'image_url' && !!p.image_url));
            const messages = corpo.messages.map(m => {
              const c = m?.content;
              const ultimo = Array.isArray(c) && c.length > 0 ? c[c.length - 1] : null;
              if (!ultimo || typeof ultimo !== 'object' || !eNostro(ultimo.cache_control) || !parteDelNucleo(ultimo)
                  || c.slice(0, -1).some(p => p && typeof p === 'object' && Object.hasOwn(p, 'cache_control'))) return m;
              cambiato = true;
              const { cache_control: _c, ...resto } = ultimo;
              return { ...m, content: c.length === 1 && resto.type === 'text' ? resto.text : [...c.slice(0, -1), resto] };
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
        /* C1 (owner 10/10/2026, scheda Contesto): chi lancia il giro può ricevere il corpo che parte DAVVERO verso il fornitore —
           dopo le normalizzazioni qui sopra, prima della risoluzione delle immagini (che resterebbero byte enormi). Facoltativo:
           senza `onRichiestaSpedita` nulla cambia; un suo errore non ferma mai la richiesta. */
        if (typeof input?.onRichiestaSpedita === 'function' && String(url).includes('/chat/completions') && typeof init.body === 'string') {
          try {
            const spedito = JSON.parse(init.body);
            if (Array.isArray(spedito?.messages)) input.onRichiestaSpedita({ messages: spedito.messages, tools: Array.isArray(spedito.tools) ? spedito.tools : [], model: spedito.model ?? null });
          } catch { /* la cattura è per guardare: non cambia mai la richiesta */ }
        }
        if (!resolveImagesFn || !String(url).includes('/chat/completions') || typeof init.body !== 'string') return successiva(url, init);
        let body;
        try { body = JSON.parse(init.body); } catch { return successiva(url, init); }
        if (!Array.isArray(body.messages)) return successiva(url, init);
        let inUscita = body.messages;
        const immagini = immaginiPerUnModelloSenzaVista(body.messages);
        if (immagini.immagini) {
          const capability = await Promise.resolve(modelCapabilityFn(body.model)).catch(() => null);
          if (capability?.inputModalities?.length && !capability.inputModalities.includes('image')) {
            /* Desktop 01/11/2026, the phone's rule (owner 27/07): only an image in the input sent NOW is refused; older ones become a line */
            if (immagini.nuove) throw new OwnerRuntimeUnavailableError('The selected model does not accept images. Choose a model with vision.', 'MODEL_IMAGE_NOT_SUPPORTED');
            inUscita = immagini.messaggi;
          }
        }
        const messages = await resolveImagesFn(inUscita);
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
      if (contextHooks && input?.cartella && !input?.mobile && input?.senzaIstruzioniDelProgetto !== true) {
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
      /* revisione blocco 6 (A-R5): il riassunto del motore del contesto è una chiamata di servizio — mai una riapertura, mai una carta */
      const routed = creaFetchMultiProvider(fetchDiRete, { dipendenze: destinazioneModelloDeps, senzaPersona: true });
      const key = provider === 'openrouter' ? destinazioneModelloDeps.leggiChiave?.('openrouter') : null;
      if (provider === 'openrouter' && !key) throw Object.assign(new Error('The key of the selected provider is not available.'), { code: 'CTX_TOKEN_AUTH', senzaChiave: true });
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
      let reasoning = provider === 'openrouter' ? ragionamentoPerSintesiOpenRouter(capability, model) : undefined;
      /*
       * ⭐ F3, onda 2 di F2 (24/09/2026) — FUORI da OpenRouter il corpo INVIATO porta le stesse opzioni di
       *   ragionamento del corpo CONTATO (`context-token-counters.mjs::opzioniRagionamentoPerSintesi`, rapporto F4
       *   punto 4): `reasoning_effort:'low'` per OpenAI/DeepSeek, `'none'` per un motore locale, niente per chi non si
       *   conosce. Prima qui c'era `undefined` e i due corpi divergevano su questo campo. Fonti F4 (24/09/2026):
       *   OpenAI «Reasoning» guide (`none` ⇒ 400 su GPT-6 Astra, quindi mai `none` a OpenAI), llama.cpp
       *   `tools/server/README.md` («If `none`, reasoning/thinking is disabled»).
       */
      const opzioniSintesi = provider === 'openrouter' ? {} : (opzioniRagionamentoPerSintesi(provider) ?? {});
      const invia = () => routed(ENDPOINT_OPENROUTER, {
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
      let response = await invia();
      /* 04/11 (condizione di Performance): un 400 sulla sintesi col pensiero spento si ritenta UNA volta con `low`, lo stesso clamp di prima */
      const ripiego = reasoning?.effort === 'none' && response.status === 400;
      if (ripiego) {
        await response.body?.cancel();
        SINTESI_SENZA_NONE.add(model);
        reasoning = ragionamentoPerSintesiOpenRouter(capability, model);
        response = await invia();
      }
      if (!response.ok) {
        /* Banco del 01/11: senza lo stato la catena del riassunto non riconosceva questo errore, e sulla strada del motore niente riserva né
           avviso. Il limite del piano si legge dal corpo, a tetto, e viaggia in `classe` (`eLimiteDiAccount`), mai nel testo: il messaggio
           finisce a schermo (Mobile, 01/11). Vale anche per una riserva sullo stesso fornitore. Un 400 o 404 di un modello che non c'è passa
           dalla stessa tabella della chat: lo stato da solo non lo distingue da una richiesta sbagliata.
           D6 (revisione di fine fase, 01/11/2026): il 402 di OpenRouter (credito finito, tetto della chiave) passa dalla stessa tabella della chat, a tetto
           suo: senza classe la catena non lo leggeva, e col credito finito la riserva su un altro fornitore non partiva. */
        const del402 = provider === 'openrouter' && response.status === 402;
        const corpo = del402 ? await leggiDettaglioRifiuto(response, 16_385)
          : [400, 404, 429].includes(response.status) ? await leggiDettaglioRifiuto(response) : (await response.body?.cancel(), '');
        const attesa = leggiAttesaRichiestaDalFornitore(response.headers);
        const classe = del402 ? classificaLimiteOpenRouter(corpo).classe
          : /subscription_sharing_usage_limit_exceeded/u.test(corpo) ? 'limite-credito' : classificaRifiutoNoto(corpo, response.status)?.classe;
        throw Object.assign(new Error(`The summary model answered with HTTP ${response.status}.`), { code: 'CTX_SUMMARY_HTTP', httpStatus: response.status,
          ...(Number.isFinite(attesa) ? { retryAt: Date.now() + attesa } : {}),
          ...(classe ? { classe } : {}) });
      }
      let result;
      try { result = await response.json(); } catch { fail('CTX_SUMMARY_RESPONSE_INVALID', 'Unreadable summary response.'); }
      const choice = result?.choices?.[0];
      const usage = result?.usage;
      /* Banco del 01/11: su `claude-haiku-5.5`, coi file del banco, 9 `/compact` su 15 tornavano rifiutati dal modello, una risposta NORMALE senza
         testo, e uscivano come «risposta illeggibile». Il rifiuto riguarda questa conversazione, non il modello: va alla riserva, senza fermare lo scelto
         (platform.claude.com/docs/en/build-with-claude/refusals-and-fallback, letta il 01/11; Hermes `context_compressor.py:208-216`: il rifiuto
         dichiarato vince anche se c'è del testo). Il testo del fornitore parla agli integratori: non va a schermo. */
      const rifiutoDichiarato = typeof choice?.message?.refusal === 'string' && choice.message.refusal.trim() !== '';
      if (rifiutoDichiarato || choice?.finish_reason === 'content_filter') {
        throw Object.assign(new Error('The summary model declined this conversation.'), { code: 'CTX_SUMMARY_REFUSED', classe: 'rifiuto-del-modello', ...(usage !== undefined ? { usage } : {}) });
      }
      if (choice?.message?.tool_calls?.length) fail('CTX_SUMMARY_TOOLS', 'The summary cannot run tools.', usage);
      // 09/09 — il caso visto dal vivo: niente testo ma token di ragionamento spesi. Non è una risposta
      //   «invalida» da guardare nel codice: è un budget finito nel pensiero, e va detto in quelle parole.
      const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens;
      if (typeof choice?.message?.content !== 'string' && Number.isSafeInteger(reasoningTokens) && reasoningTokens > 0) {
        fail('CTX_TRUNCATED_SUMMARY', `The model spent ${reasoningTokens} tokens on reasoning and left no room for the summary.`, usage);
      }
      if (typeof choice?.message?.content !== 'string' || typeof choice?.finish_reason !== 'string') fail('CTX_SUMMARY_RESPONSE_INVALID', 'The summary does not declare text and final state.', usage);
      return { text: choice.message.content, finishReason: choice.finish_reason, usage, ...(ripiego ? { tentativi: 2 } : {}) };
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
    /* /goal G3 (14/10/2026): le prove del contratto passano dallo STESSO cancello dei permessi dell'attrezzo shell, quello del
       motore che gira la sessione. Un motore che non lo espone fa negare la prova («non verificabile»), mai passare. */
    async verificaPermessoScrittura(...args) {
      return richiama('verificaPermessoScrittura', ...args);
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

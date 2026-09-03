import {
  accessSync,
  constants,
  realpathSync,
  statSync,
} from 'node:fs';
import { createPrivateKey } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 4174;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

/**
 * ⛔⛔ ALLOWLIST: TALOS_HARNESS_UI_MODEL può solo SCEGLIERE fra questi, mai introdurne uno
 * nuovo — la regola dell'owner (20/8, "mai modelli di punta, sempre flash")
 * si applica qui a livello di configurazione, non come convenzione da
 * ricordare a ogni chiamata. Entrambi già usati in questo stesso ecosistema:
 * `z-ai/glm-4.7-flash` (candidato Stadio B, dossier 24/8), `qwen/qwen3.7-flash`
 * (`provaTalos.mjs`) — non nomi nuovi, valori già misurati.
 */
export const MODELLI_AMMESSI = Object.freeze(['z-ai/glm-4.7-flash', 'qwen/qwen3.7-flash']);

export class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigurationError';
    this.code = 'CONFIG_INVALID';
  }
}

function fail(message) {
  throw new ConfigurationError(message);
}

function parseModello(raw) {
  if (raw === undefined || raw === '') return MODELLI_AMMESSI[0];
  if (typeof raw !== 'string' || !MODELLI_AMMESSI.includes(raw)) {
    fail(`TALOS_HARNESS_UI_MODEL deve essere uno fra: ${MODELLI_AMMESSI.join(', ')}`);
  }
  return raw;
}

/**
 * ⭐⭐⭐ 27/8, owner: "rendi il composer funzionante al 100%... poter
 * scegliere almeno tutti i modelli openrouter e deepseek, per testare, poi
 * estendiamo a tutti i provider supportati, nessuna eccezione".
 *
 * ⛔ Diversa da `MODELLI_AMMESSI`/`parseModello` sopra apposta: quelli
 * restano il DEFAULT del server (whitelist stretta, la regola "mai modelli
 * di punta" applicata al valore di partenza quando nessuno ha scelto
 * niente). Questa valida una scelta ESPLICITA dell'owner per una singola
 * sessione — "nessuna eccezione" vuol dire qualunque ID modello
 * OpenRouter valido, non un elenco scritto a mano che invecchia. TALOS
 * chiama SEMPRE `https://openrouter.ai/api/v1/chat/completions`
 * (`talosHarness.mjs`), che instrada già DeepSeek (`deepseek/...`) e
 * decine di altri vendor allo stesso endpoint — non serve un secondo
 * adattatore per "OpenRouter e DeepSeek insieme", solo smettere di
 * limitare quale ID si può chiedere.
 *
 * Il pattern è quello reale degli ID OpenRouter: `vendor/nome`, con
 * varianti tipo `:free`/`:beta` ammesse dopo il nome. Non un whitelist di
 * vendor — un controllo di FORMA, per escludere iniezioni/spazi/righe
 * vuote, mai di CONTENUTO.
 *
 * ⛔⛔ 27/8 — trovato dalla pipeline QA visiva (scripts/qa-visual-pipeline.mjs),
 * non ipotizzato: 12 dei 417 modelli VERI di OpenRouter oggi sono alias
 * "sempre l'ultima versione" con un prefisso `~` (es.
 * `~anthropic/claude-sonnet-latest`, `~deepseek/deepseek-v4-flash-latest`)
 * — verificato con GET https://openrouter.ai/api/v1/models. Senza il `~?`
 * opzionale, scegliere uno di questi nel picker produceva SEMPRE un 400
 * su /api/v1/sessions/custom: la regola "tutti i modelli OpenRouter,
 * nessuna eccezione" (owner, 27/8 mattina) era rotta esattamente sugli
 * alias più comodi da scegliere.
 */
/*
 * ⛔⛔⛔ 03/9 — IL CANCELLO CHE AVREBBE FERMATO I MODELLI LOCALI.
 *
 * Owner: «bisogna far girare davvero i modelli di diversi provider… se non
 * riesco a usare i modelli locali, l'applicazione è spacciata».
 *
 * Trovato provando, non leggendo: la convenzione di fonte `local:qwen3-0.6b…`
 * veniva RESPINTA QUI, con un 400 su /api/v1/sessions, molto prima di
 * arrivare al kernel o all'instradamento. Questo formato pretende `autore/
 * nome` — lo slash — perché nasce dagli id OpenRouter, e un modello locale
 * non ha un autore: ha un nome e basta.
 *
 * ⇒ Si ammette un prefisso di FONTE opzionale, e solo per le fonti vere
 * (`local:`, `ollama:`, `openai:`, `deepseek:`, `openrouter:`, `anthropic:`,
 * `gemini:` — le stesse di `model-destination.mjs`). Dopo il prefisso lo
 * slash diventa facoltativo, perché `local:qwen3-0.6b-q2-k` è un nome intero.
 * ⛔ Senza prefisso NIENTE cambia: resta esattamente il formato di prima, e
 * nessuna sessione salvata si comporta diversamente.
 */
const FONTI_AMMESSE_MODELLO = 'local|ollama|openai|deepseek|openrouter|anthropic|gemini';
/** Il formato OpenRouter di sempre: `vendor/nome`, con `~` e `:variante`. INVARIATO. */
const FORMA_OPENROUTER = '~?[a-z0-9](?:[a-z0-9._-]{0,63}[a-z0-9])?\/[a-z0-9](?:[a-z0-9._:-]{0,63}[a-z0-9])?';
/**
 * Con un prefisso di fonte lo slash diventa FACOLTATIVO — e solo lì.
 *
 * ⛔ La prima stesura lo rendeva facoltativo dappertutto, e ha fatto cadere
 * quattro test che presidiavano il contratto giusto: «senza slash non è un id
 * OpenRouter». Avevano ragione loro. Un id senza prefisso deve continuare a
 * essere rifiutato esattamente come prima, byte per byte: rilassare un
 * cancello più del necessario è il modo tipico di far passare, mesi dopo,
 * qualcosa che nessuno voleva.
 */
const FORMA_CON_FONTE = `(?:${FONTI_AMMESSE_MODELLO}):[a-z0-9](?:[a-z0-9._:/-]{0,127}[a-z0-9])?`;
const FORMATO_MODELLO_RICHIESTA = new RegExp(`^(?:${FORMA_OPENROUTER}|${FORMA_CON_FONTE})$`, 'i');

/**
 * Pura — nessun throw, chi chiama decide il `code`/status HTTP giusto per
 * il proprio contesto (stesso principio delle `require*Body` di
 * `http-app.mjs`, che tengono `QUERY_INVALID` locale a quel file).
 */
export function modelloRichiestaValido(raw) {
  return typeof raw === 'string' && FORMATO_MODELLO_RICHIESTA.test(raw);
}

/*
 * ⭐⭐⭐ 27/8, R1 — valori VERI di OpenRouter (docs.ag-ui.com/openrouter,
 * verificato via WebSearch nel piano, sezione "RICOGNIZIONE COMPETITIVA"),
 * non inventati: `effort` controlla il budget di token di ragionamento,
 * `summary` la verbosità di quanto ne viene mostrato.
 */
const EFFORT_AMMESSI = new Set(['xhigh', 'high', 'medium', 'low', 'minimal', 'none']);
const SUMMARY_AMMESSI = new Set(['auto', 'concise', 'detailed']);

/** Stesso principio di modelloRichiestaValido: pura, nessun throw. */
export function reasoningRichiestaValido(raw) {
  if (raw === null || raw === undefined) return true; // assente è sempre valido: nessun reasoning richiesto
  if (typeof raw !== 'object' || Array.isArray(raw)) return false;
  const chiavi = Object.keys(raw);
  if (chiavi.length === 0 || !chiavi.every((k) => k === 'effort' || k === 'summary')) return false;
  if ('effort' in raw && !EFFORT_AMMESSI.has(raw.effort)) return false;
  if ('summary' in raw && !SUMMARY_AMMESSI.has(raw.summary)) return false;
  return true;
}

/*
 * ⭐⭐⭐ 28/8 — LA PILLOLA PERMESSI, owner: "read only/workspace write/on
 * request/full access". Le stesse quattro stringhe già usate dal foglio
 * decorativo del frontend (`sheetTemplates.permissions`, app.js, scritto
 * il 27/8) — una grammatica sola, non una seconda tradotta qui (stessa
 * disciplina di `permissions-single-global-grammar.md` in memoria).
 * `undefined`/assente è sempre valido: significa "Workspace write", il
 * comportamento di sempre, mai un valore inventato quando il client non
 * sceglie esplicitamente.
 */
const PERMESSI_AMMESSI = new Set(['Read only', 'Workspace write', 'On request', 'Full access']);

/** Stesso principio di reasoningRichiestaValido: pura, nessun throw. */
export function permessiRichiestaValido(raw) {
  return raw === undefined || raw === null || (typeof raw === 'string' && PERMESSI_AMMESSI.has(raw));
}

/*
 * ⭐⭐⭐ FASE B (28/8) — permesso PER-ATTREZZO, un override più specifico
 * di `permessi` sopra. Le chiavi ammesse sono i 4 nomi attrezzo che
 * chiamano DAVVERO `verificaPermessoScrittura` nel kernel (verificato
 * leggendo talosHarness.mjs, non i 3 di `AZIONI_MUTANTI_PER_HOOK`, un
 * perimetro diverso) — un nome REALE ma fuori da questi 4 (es. `leggi`)
 * sarebbe comunque un override che il gate ignora sempre in silenzio,
 * stesso difetto di un nome INVENTATO: entrambi rifiutati qui, mai solo
 * il secondo.
 */
// ⭐ 29/8 — FASE H: `generate_image` aggiunto, quinto attrezzo con ricevuta nel kernel (talosHarness.mjs, ATTREZZI_CON_RICEVUTA) — stesso trattamento degli altri quattro.
const ATTREZZI_CON_PERMESSO_PER_ATTREZZO = new Set(['scrivi', 'prova', 'shell', 'document_create', 'generate_image']);
const VALORI_PERMESSO_PER_ATTREZZO = new Set(['sempre', 'chiedi', 'nega']);

/** Stesso principio di reasoningRichiestaValido: pura, nessun throw. */
export function permessiPerAttrezzoRichiestaValido(raw) {
  if (raw === undefined || raw === null) return true; // assente è sempre valido: nessun override, comportamento di oggi
  if (typeof raw !== 'object' || Array.isArray(raw)) return false;
  const chiavi = Object.keys(raw);
  if (chiavi.length === 0) return false; // {} esplicito non ha senso: si omette il campo, non si manda vuoto
  return chiavi.every((k) => ATTREZZI_CON_PERMESSO_PER_ATTREZZO.has(k) && VALORI_PERMESSO_PER_ATTREZZO.has(raw[k]));
}

/**
 * ⭐⭐⭐ 27/8 — una cartella libera (non il corpus benchmark) su cui far
 * girare un compito VERO, DIRETTAMENTE. Come i competitor verificati,
 * l’installazione parte dalla workspace del progetto che ospita il server:
 * l’utente non deve preparare variabili prima di poter aprire "Nuova
 * sessione". `TALOS_HARNESS_UI_PROJECT_DIRS` resta l’estensione esplicita
 * per aggiungere altre cartelle.
 *
 * Elenco separato da `;` (come PATH su Windows, mai virgola: un percorso
 * reale può contenerne una). Ogni percorso deve esistere, essere una
 * directory, leggibile E scrivibile — un agente che ci scrive davvero
 * su una cartella non scrivibile fallirebbe a metà lavoro, meglio
 * scoprirlo all’avvio del server che a sessione già in corso.
 */
function parseCartelleProgetto(raw, defaultProjectDir) {
  const richiesti = typeof raw === 'string'
    ? raw.split(';').map((valore) => valore.trim()).filter((valore) => valore.length > 0)
    : [];
  if (raw === undefined || raw === '' || richiesti.length === 0) {
    if (!defaultProjectDir) return Object.freeze([]);
    let percorso;
    try {
      percorso = realpathSync(defaultProjectDir);
      if (!statSync(percorso).isDirectory()) fail('La workspace predefinita non è una directory');
      accessSync(percorso, constants.R_OK | constants.W_OK);
    } catch (error) {
      if (error instanceof ConfigurationError) throw error;
      fail('La workspace predefinita non esiste o non è leggibile/scrivibile');
    }
    return Object.freeze([{ id: 'default', percorso, nome: percorso.split(/[\\/]/).pop() || percorso }]);
  }
  if (typeof raw !== 'string') fail('TALOS_HARNESS_UI_PROJECT_DIRS non valida');
  const cartelle = richiesti.map((percorsoInput, indice) => {
    if (!isAbsolute(percorsoInput)) fail(`TALOS_HARNESS_UI_PROJECT_DIRS[${indice}] deve essere assoluta: ${percorsoInput}`);
    let percorso;
    try {
      percorso = realpathSync(percorsoInput);
      if (!statSync(percorso).isDirectory()) fail(`TALOS_HARNESS_UI_PROJECT_DIRS[${indice}] non è una directory: ${percorsoInput}`);
      accessSync(percorso, constants.R_OK | constants.W_OK);
    } catch (error) {
      if (error instanceof ConfigurationError) throw error;
      fail(`TALOS_HARNESS_UI_PROJECT_DIRS[${indice}] non esiste o non è leggibile/scrivibile: ${percorsoInput}`);
    }
    return Object.freeze({ id: String(indice), percorso, nome: percorso.split(/[\\/]/).pop() || percorso });
  });

  const duplicati = new Set();
  for (const { percorso } of cartelle) {
    if (duplicati.has(percorso)) fail(`TALOS_HARNESS_UI_PROJECT_DIRS ripete la stessa cartella: ${percorso}`);
    duplicati.add(percorso);
  }
  return Object.freeze(cartelle);
}

function parsePort(raw) {
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    fail('TALOS_HARNESS_UI_PORT non valida');
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    fail('TALOS_HARNESS_UI_PORT fuori intervallo');
  }
  return port;
}

function parseLlamaServerPath(raw, moduleUrl) {
  if (typeof raw === 'string' && raw.trim() !== '') return resolve(raw.trim());
  /*
   * ⭐⭐⭐ 03/9 — SI PREFERISCE LA BUILD CON LA GPU, se c'è.
   *
   * ⛔ Debito che stavo per lasciare aperto: la GPU l'avevo accesa passando
   * il percorso a mano, quindi al primo riavvio normale il server sarebbe
   * tornato sulla build CPU-only — e nessuno se ne sarebbe accorto, perché
   * funziona lo stesso, solo lentissimo. Una cura che vive in una variabile
   * d'ambiente digitata una volta non è una cura.
   *
   * MISURATO: `llama-b10517-bin-win-cpu-x64` risponde «Available devices:
   * (none)»; la variante Vulkan della stessa versione elenca la scheda con
   * la sua VRAM, e su un 27B porta da «non finisce» a 7,7 token/s.
   *
   * ⛔ L'ordine conta: prima la variante accelerata, poi quella di sempre.
   * E resta solo un DEFAULT: `TALOS_LLAMA_SERVER_PATH` continua a vincere,
   * perché chi sa cosa sta facendo deve poter scegliere.
   */
  for (const cartella of ['.local-runtime/b10517-vulkan/', '.local-runtime/b10517/']) {
    try {
      const candidate = fileURLToPath(new URL(`${cartella}llama-server.exe`, moduleUrl));
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // The official runtime is optional during development and in clean clones.
    }
  }
  return undefined;
}

/**
 * ⭐⭐⭐ 02/9 — dove vivono le sessioni persistite. Fino a oggi era CABLATO
 * in `server.mjs` (`.sessions-store/` accanto al file), senza modo di
 * spostarlo: conseguenza misurata, la suite Playwright — che punta al
 * 4174 dell'owner — girava sulle sue sessioni VERE, e lo stesso codice
 * dava 21 rossi a un giro e 19 al successivo. Un conteggio così non è un
 * cancello (vedi LEDGER-STREAMING-SCROLL-TERMINALE-2026-09-02.md).
 *
 * ⭐ Ricerca 02/9 — tutti e tre i concorrenti rendono la cartella di stato
 * sovrascrivibile da ambiente, esattamente per non toccare i dati veri
 * dell'utente durante i test: **Codex** `CODEX_HOME` ("isolates the eval
 * from any personal Codex configuration on the machine"), **Hermes**
 * `HERMES_HOME` (fixture caricate da una home isolata; ogni profilo ha
 * session database proprio), **Claude Code** `CLAUDE_CONFIG_DIR`
 * ("keeping your real config untouched"). Questa variabile è la nostra.
 *
 * ⛔ Nessun `fail()` se manca e nessuna creazione qui: assente = il
 * comportamento di sempre, la cartella accanto a `server.mjs`. Un
 * percorso relativo si risolve sulla cwd, come ogni altro percorso di
 * questo file.
 */
function parseCartellaStore(raw, moduleUrl) {
  if (typeof raw === 'string' && raw.trim() !== '') return resolve(raw.trim());
  return fileURLToPath(new URL('.sessions-store/', moduleUrl));
}

function parseOwnerRuntimeModule(raw) {
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string' || raw.trim() === '' || !isAbsolute(raw.trim())) {
    fail('TALOS_OWNER_RUNTIME_MODULE deve essere un file assoluto');
  }
  const percorso = resolve(raw.trim());
  try {
    if (!statSync(percorso).isFile()) fail('TALOS_OWNER_RUNTIME_MODULE non è un file');
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    fail('TALOS_OWNER_RUNTIME_MODULE non esiste o non è leggibile');
  }
  return percorso;
}

export function loadConfig(
  env,
  moduleUrl = new URL('../server.mjs', import.meta.url),
) {
  if (!env || typeof env !== 'object') fail('Configurazione ambiente non valida');

  const host = env.TALOS_HARNESS_UI_HOST || DEFAULT_HOST;
  if (typeof host !== 'string' || !LOOPBACK_HOSTS.has(host)) {
    fail('TALOS_HARNESS_UI_HOST deve essere loopback');
  }

  /*
   * ⛔⛔⛔ 02/09 — CORRETTO, il commento sotto era rimasto FALSO per due
   * giorni: descriveva ancora DEC-053 (26/8, `mobile/public/harness-ui/`
   * canonico) mentre il codice, dal commit `16677c48` (31/8, "chiude i
   * tre blocchi runtime desktop"), risolve `./public/` — verificato dal
   * vivo (il server serve `app.js` da 530.197 byte, combacia con
   * `harness-ui/public/`, non con `mobile/public/harness-ui/` che è
   * rimasto fermo al 31/8 ore 14:52, ~95KB indietro). Il cambio non era
   * un refuso: nello STESSO commit sono arrivati `harness-ui/public/talos/
   * brand/` (font e logo propri del desktop) e `harness-ui/scripts/
   * build-ui.mjs`/`verify-ui-manifest.mjs`, che hanno `harness-ui/public`
   * come sorgente esplicita e cablata (`SOURCE = ... join(ROOT, 'public')`,
   * `manifest.json` dichiara `source: 'harness-ui/public'`). ⇒ Il desktop
   * ha un bundle proprio (font/logo/pipeline di build+verifica dedicati),
   * non più preso in prestito dal mobile — una direzione ragionevole per
   * un prodotto desktop maturo. Non è mai stato scritto un successore
   * dichiarato a DEC-053: questo commento lo è.
   *
   * ⛔ Aperto, non deciso qui: DEC-053 esisteva ANCHE per servire lo stesso
   * bundle al telefono via `adb reverse` (piano §3, mai implementato).
   * Se quell'intento è ancora vivo, va ripensato esplicitamente (il
   * telefono aggancerebbe un bundle desktop-specifico, non più condiviso)
   * — decisione dell'owner, non presa qui. `mobile/public/harness-ui/`
   * resta sul disco, stantio, non cancellato: nessuno l'ha dichiarato
   * morto per iscritto.
   *
   * Override via env solo per i test, mai per uso normale (nessun fail()
   * se assente: resta il default).
   */
  let publicDir;
  try {
    publicDir = env.TALOS_HARNESS_UI_PUBLIC_DIR
      ? resolve(String(env.TALOS_HARNESS_UI_PUBLIC_DIR))
      : resolve(fileURLToPath(new URL('./public/', moduleUrl)));
  } catch {
    fail('Percorso modulo non valido');
  }

  return Object.freeze({
    host,
    port: parsePort(env.TALOS_HARNESS_UI_PORT),
    publicDir,
    modello: parseModello(env.TALOS_HARNESS_UI_MODEL),
    // Come Claude/Codex/Hermes: in assenza di elenco esplicito la prima
    // workspace è la radice del progetto desktop che contiene il server.
    cartelleProgetto: parseCartelleProgetto(
      env.TALOS_HARNESS_UI_PROJECT_DIRS,
      resolve(fileURLToPath(new URL('../', moduleUrl))),
    ),
    /*
     * ⛔ Nessun fail() se manca: Harness UI resta usabile in sola lettura
     * (campagne, elenco task) anche senza una chiave configurata — è
     * session-registry.avvia() a rifiutare per-richiesta con CONFIG_INVALID
     * quando si prova davvero ad avviare una sessione, non l'avvio del
     * server. Stesso nome env di TALOS-BANCO/provaTalos.mjs: una chiave
     * sola, non una copia con un nome diverso che potrebbe disallinearsi.
     */
    chiaveApi: typeof env.OPENROUTER_API_KEY === 'string' ? env.OPENROUTER_API_KEY : undefined,
    hfToken: typeof env.HF_TOKEN === 'string' && env.HF_TOKEN.trim() ? env.HF_TOKEN.trim() : undefined,
    cartellaStore: parseCartellaStore(env.TALOS_HARNESS_UI_SESSIONS_DIR, moduleUrl),
    llamaServerPath: parseLlamaServerPath(env.TALOS_LLAMA_SERVER_PATH, moduleUrl),
    ownerRuntimeModule: parseOwnerRuntimeModule(env.TALOS_OWNER_RUNTIME_MODULE),
    ricercaWeb: parseRicercaWeb(env),
    firmaRicevute: parseFirmaRicevute(env),
    immagine: parseImmagine(env),
  });
}

/**
 * ⭐⭐⭐ 29/8, FASE D — la firma Ed25519 delle ricevute
 * (`talosHarness.mjs`, `creaRicevutaOperazione`/`firma`). Stesso principio
 * onesto di `parseRicercaWeb` due funzioni sotto: `undefined` quando non
 * configurata, il server resta usabile — le ricevute restano non firmate,
 * comportamento di sempre, mai un errore che blocca l'avvio per una
 * funzione opzionale. Provisioning: `node src/harness-receipt-keypair.mjs
 * --env-file <path>` (vedi quel file — stesso pattern di
 * `browser-action-keypair.mjs`, AVM, con l'algoritmo giusto per una
 * ricevuta d'audit permanente, non un token con scadenza).
 *
 * ⛔ Validato qui, non solo passato: una chiave malformata configurata a
 * metà (solo l'id, senza la chiave — o viceversa) fallisce l'avvio con
 * ConfigurationError invece di firmare silenziosamente con un valore
 * rotto e produrre ricevute che nessuno può verificare.
 */
function parseFirmaRicevute(env) {
  const keyId = typeof env.TALOS_HARNESS_RECEIPT_KEY_ID === 'string' ? env.TALOS_HARNESS_RECEIPT_KEY_ID.trim() : '';
  const privateKeyB64 = typeof env.TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64 === 'string'
    ? env.TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64.trim()
    : '';
  if (!keyId && !privateKeyB64) return undefined;
  if (!keyId || !privateKeyB64) {
    fail('TALOS_HARNESS_RECEIPT_KEY_ID e TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64 vanno configurate insieme, mai una sola');
  }

  let chiavePrivata;
  try {
    chiavePrivata = Buffer.from(privateKeyB64, 'base64').toString('utf8');
    const keyObject = createPrivateKey(chiavePrivata);
    if (keyObject.asymmetricKeyType !== 'ed25519') fail('TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64 non è una chiave Ed25519');
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    fail('TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64 non è una chiave privata PKCS8 valida in base64');
  }

  return Object.freeze({ chiavePrivata, keyId });
}

/*
 * ⭐⭐⭐ 29/8 — FASE H, `generate_image`. A differenza di `parseRicercaWeb`
 * sotto: ZERO nuova credenziale (il ONE-UP dichiarato su Hermes/Codex,
 * vedi il piano madre) — `image-generator.mjs` riusa `chiaveApi` sopra,
 * mai una seconda chiave. Il DEFAULT è un modello DEDICATO reale e
 * verificato dal vivo il 29/8 (`GET /api/v1/images/models`, non
 * presunto): funziona sempre, senza che l'owner debba configurare
 * niente. `TALOS_HARNESS_UI_IMMAGINE_NATIVA=1` dichiara che il modello
 * scelto è invece un modello NATIVO (chat/completions+modalities) — un
 * fatto sul MODELLO, non deducibile da questo file (vedi la doc in
 * image-generator.mjs sul perché non si chiama un catalogo per
 * scoprirlo a runtime).
 */
const IMMAGINE_MODELLO_DEDICATO_DEFAULT = 'bytedance-seed/seedream-4.5';

function parseImmagine(env) {
  const modello = typeof env.TALOS_HARNESS_UI_IMMAGINE_MODELLO === 'string' && env.TALOS_HARNESS_UI_IMMAGINE_MODELLO.trim()
    ? env.TALOS_HARNESS_UI_IMMAGINE_MODELLO.trim()
    : IMMAGINE_MODELLO_DEDICATO_DEFAULT;
  const nativo = String(env.TALOS_HARNESS_UI_IMMAGINE_NATIVA ?? '').trim() === '1';
  return Object.freeze({ modello, nativo });
}

const PROVIDER_RICERCA_AMMESSI = new Set(['tavily', 'brave', 'searxng', 'custom']);

/**
 * ⭐⭐⭐ 28/8, owner: "l'harness desktop diventa l'unica chat, con tutti i
 * tool come... la ricerca web" — stesso quattro-fonti già scelto per il
 * mobile (`ATTREZZI_ESTESI` in talosHarness.mjs, D1 24/8: Tavily prima
 * porta). `undefined` quando non configurato — stesso principio onesto di
 * `chiaveApi`: il server resta usabile, il tool `web_search` dichiara "not
 * configured" invece di tentare una chiamata senza credenziali (vedi il
 * dispatcher in talosHarness.mjs).
 */
function parseRicercaWeb(env) {
  const provider = typeof env.TALOS_HARNESS_SEARCH_PROVIDER === 'string' && env.TALOS_HARNESS_SEARCH_PROVIDER.trim()
    ? env.TALOS_HARNESS_SEARCH_PROVIDER.trim().toLowerCase()
    : 'tavily';
  const apiKey = typeof env.TALOS_HARNESS_SEARCH_API_KEY === 'string' && env.TALOS_HARNESS_SEARCH_API_KEY.trim()
    ? env.TALOS_HARNESS_SEARCH_API_KEY.trim()
    : undefined;
  const endpoint = typeof env.TALOS_HARNESS_SEARCH_ENDPOINT === 'string' && env.TALOS_HARNESS_SEARCH_ENDPOINT.trim()
    ? env.TALOS_HARNESS_SEARCH_ENDPOINT.trim()
    : undefined;
  // Nessuna credenziale/endpoint: web_search resta offerto (parità di attrezzi) ma il dispatcher del kernel lo dichiara onestamente non configurato — nessun tentativo di rete.
  if (!apiKey && !endpoint) return undefined;
  if (!PROVIDER_RICERCA_AMMESSI.has(provider)) {
    fail(`TALOS_HARNESS_SEARCH_PROVIDER deve essere uno fra: ${[...PROVIDER_RICERCA_AMMESSI].join(', ')}`);
  }
  return Object.freeze({ provider, ...(apiKey ? { apiKey } : {}), ...(endpoint ? { endpoint } : {}) });
}

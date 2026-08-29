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
export const INITIAL_CAMPAIGNS = Object.freeze([
  'esiti-22ago-progetti',
  'esiti-22ago-storia',
]);

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

/**
 * ⛔⛔ ALLOWLIST, stesso principio di INITIAL_CAMPAIGNS due righe sopra:
 * TALOS_HARNESS_UI_MODEL può solo SCEGLIERE fra questi, mai introdurne uno
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

function parseCampaigns(raw) {
  if (raw === undefined || raw === '') return [...INITIAL_CAMPAIGNS];
  if (typeof raw !== 'string') fail('TALOS_HARNESS_UI_CAMPAIGNS non valida');

  const requested = raw.split(',').map((value) => value.trim());
  if (requested.length === 0 || requested.some((value) => value === '')) {
    fail('TALOS_HARNESS_UI_CAMPAIGNS non valida');
  }

  const unique = new Set(requested);
  if ([...unique].some((campaign) => !INITIAL_CAMPAIGNS.includes(campaign))) {
    fail('TALOS_HARNESS_UI_CAMPAIGNS può solo restringere la allowlist');
  }

  return INITIAL_CAMPAIGNS.filter((campaign) => unique.has(campaign));
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
const FORMATO_MODELLO_RICHIESTA = /^~?[a-z0-9](?:[a-z0-9._-]{0,63}[a-z0-9])?\/[a-z0-9](?:[a-z0-9._:-]{0,63}[a-z0-9])?$/i;

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
const ATTREZZI_CON_PERMESSO_PER_ATTREZZO = new Set(['scrivi', 'prova', 'shell', 'document_create']);
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
 * ⭐⭐⭐ 27/8 — owner: "per adesso un allowlist per testare, ma in futuro
 * esattamente come i competitor, accesso libero, con limiti estremi" — una
 * cartella libera (non il corpus benchmark) su cui far girare un compito
 * VERO, DIRETTAMENTE (non una copia usa-e-getta come `task-catalog.mjs`:
 * qui l'obiettivo dichiarato è vedere l'effetto su un progetto reale,
 * esattamente come un Claude Code/Pi/Hermes puntato su una cartella).
 *
 * ⛔ Fail-closed per costruzione: `TALOS_HARNESS_UI_PROJECT_DIRS` assente =
 * ZERO cartelle libere ammesse, non "qualunque cartella passi" — stesso
 * principio già in uso per `TASK_NOT_ALLOWED` in `task-catalog.mjs`.
 * L'"accesso libero" del futuro è un lavoro SUO, con la sua ricerca sui
 * limiti dei competitor (owner l'ha chiesta esplicitamente) — non
 * anticipato qui scrivendo un percorso a piacere dal browser.
 *
 * Elenco separato da `;` (come PATH su Windows, mai virgola: un percorso
 * reale può contenerne una). Ogni percorso deve esistere, essere una
 * directory, leggibile E scrivibile — un agente che ci scrive davvero
 * su una cartella non scrivibile fallirebbe a metà lavoro, meglio
 * scoprirlo all'avvio del server che a sessione già in corso.
 */
function parseCartelleProgetto(raw) {
  if (raw === undefined || raw === '') return Object.freeze([]);
  if (typeof raw !== 'string') fail('TALOS_HARNESS_UI_PROJECT_DIRS non valida');

  const richiesti = raw.split(';').map((valore) => valore.trim()).filter((valore) => valore.length > 0);
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

export function loadConfig(
  env,
  moduleUrl = new URL('../server.mjs', import.meta.url),
) {
  if (!env || typeof env !== 'object') fail('Configurazione ambiente non valida');

  const bancoInput = env.TALOS_BANCO_DIR;
  if (typeof bancoInput !== 'string' || bancoInput.trim() === '') {
    fail('TALOS_BANCO_DIR obbligatoria');
  }
  if (!isAbsolute(bancoInput)) fail('TALOS_BANCO_DIR deve essere assoluta');

  let bancoDir;
  try {
    bancoDir = realpathSync(bancoInput);
    if (!statSync(bancoDir).isDirectory()) fail('TALOS_BANCO_DIR non è una directory');
    accessSync(bancoDir, constants.R_OK);
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    fail('TALOS_BANCO_DIR non esiste o non è leggibile');
  }

  const host = env.TALOS_HARNESS_UI_HOST || DEFAULT_HOST;
  if (typeof host !== 'string' || !LOOPBACK_HOSTS.has(host)) {
    fail('TALOS_HARNESS_UI_HOST deve essere loopback');
  }

  /*
   * ⭐⭐⭐ 26/8 — DEC-053: il bundle canonico non è più `./public/` (la copia
   * desktop originale, mai riconciliata con l'integrazione mobile) ma
   * `mobile/public/harness-ui/`, dentro lo stesso worktree
   * (`lane/harness-desktop`) — quello con la pipeline AG-UI di consumo
   * eventi già portata, verificata con test e in un browser vero. Un solo
   * bundle, servito sia a chi apre questa pagina standalone in Chrome sul
   * PC sia — quando esisterà il tunnel `adb reverse` (piano §3) — al
   * telefono, senza differenza di codice. Override via env solo per i
   * test, mai per uso normale (nessun fail() se assente: resta il default).
   */
  let publicDir;
  try {
    publicDir = env.TALOS_HARNESS_UI_PUBLIC_DIR
      ? resolve(String(env.TALOS_HARNESS_UI_PUBLIC_DIR))
      : resolve(fileURLToPath(new URL('../mobile/public/harness-ui/', moduleUrl)));
  } catch {
    fail('Percorso modulo non valido');
  }

  return Object.freeze({
    bancoDir,
    campaigns: Object.freeze(parseCampaigns(env.TALOS_HARNESS_UI_CAMPAIGNS)),
    host,
    port: parsePort(env.TALOS_HARNESS_UI_PORT),
    publicDir,
    modello: parseModello(env.TALOS_HARNESS_UI_MODEL),
    cartelleProgetto: parseCartelleProgetto(env.TALOS_HARNESS_UI_PROJECT_DIRS),
    /*
     * ⛔ Nessun fail() se manca: Harness UI resta usabile in sola lettura
     * (campagne, elenco task) anche senza una chiave configurata — è
     * session-registry.avvia() a rifiutare per-richiesta con CONFIG_INVALID
     * quando si prova davvero ad avviare una sessione, non l'avvio del
     * server. Stesso nome env di TALOS-BANCO/provaTalos.mjs: una chiave
     * sola, non una copia con un nome diverso che potrebbe disallinearsi.
     */
    chiaveApi: typeof env.OPENROUTER_API_KEY === 'string' ? env.OPENROUTER_API_KEY : undefined,
    ricercaWeb: parseRicercaWeb(env),
    firmaRicevute: parseFirmaRicevute(env),
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

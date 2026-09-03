import {
  accessSync,
  constants,
  realpathSync,
  statSync,
} from 'node:fs';
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

/**
 * ⭐ 30/8, porta canonico (desktop, FASE H) — il modello dedicato di
 * default per `generate_image` quando `TALOS_HARNESS_UI_IMMAGINE_MODELLO`
 * non è impostata. A differenza di `MODELLI_AMMESSI` sopra (testo, mai
 * modelli di punta) questo non è un'allowlist: `generate_image` non ha
 * una credenziale propria da mancare — riusa `chiaveApi` — quindi il
 * server resta SEMPRE pronto a offrirlo, mai `undefined`.
 */
const IMMAGINE_MODELLO_DEDICATO_DEFAULT = 'bytedance-seed/seedream-4.5';

/*
 * ⭐⭐⭐ 29/8, porta canonico (6c37f8d5) — LA PILLOLA PERMESSI, owner: "read
 * only/workspace write/on request/full access". Le stesse quattro
 * stringhe già usate dal foglio decorativo del frontend
 * (`sheetTemplates.permissions`, app.js) — una grammatica sola, non una
 * seconda tradotta qui (stessa disciplina di
 * `permissions-single-global-grammar.md` in memoria). `undefined`/assente
 * è sempre valido: significa "Workspace write", il comportamento di
 * sempre, mai un valore inventato quando il client non sceglie
 * esplicitamente.
 */
const PERMESSI_AMMESSI = new Set(['Read only', 'Workspace write', 'On request', 'Full access']);

/** Pura, nessun throw. */
export function permessiRichiestaValido(raw) {
  return raw === undefined || raw === null || (typeof raw === 'string' && PERMESSI_AMMESSI.has(raw));
}

export class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigurationError';
    this.code = 'CONFIG_INVALID';
  }
}

/**
 * ⭐ 29/8 — portata dal canonico (AVM-harness-desktop/harness-ui/src/config.mjs)
 * nella copia standalone imbarcata nell'APK: LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md
 * §11.5. Verbatim, zero adattamento — stessa validazione a ogni riga.
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

/**
 * ⭐⭐⭐ 30/8, porta canonico (desktop, FASE H) — SEMPRE definito (mai
 * `undefined` come `chiaveApi`/`ricercaWeb`): `generate_image` non ha
 * una credenziale propria da mancare, riusa `chiaveApi` già richiesta
 * per far girare il modello di chat. `nativo` sceglie il percorso
 * (dedicato `POST /images` vs nativo `POST /chat/completions` con
 * `modalities`), decisa a monte — vedi `image-generator.mjs`.
 */
function parseImmagine(env) {
  const modello = typeof env.TALOS_HARNESS_UI_IMMAGINE_MODELLO === 'string' && env.TALOS_HARNESS_UI_IMMAGINE_MODELLO.trim()
    ? env.TALOS_HARNESS_UI_IMMAGINE_MODELLO.trim()
    : IMMAGINE_MODELLO_DEDICATO_DEFAULT;
  const nativo = String(env.TALOS_HARNESS_UI_IMMAGINE_NATIVA ?? '').trim() === '1';
  return Object.freeze({ modello, nativo });
}

/**
 * ⭐⭐⭐ 03/9 — le credenziali degli ALTRI provider (model-destination.mjs),
 * lette con lo STESSO principio di `chiaveApi`: nessun fail() se mancano —
 * un server senza queste variabili resta usabile esattamente come prima,
 * rifiuta solo la richiesta che le chiede davvero (PROVIDER_KEY_MISSING),
 * non l'avvio. Nomi ESATTI concordati con la lane desktop (stesso schema
 * di `OPENROUTER_API_KEY`, mai un nome inventato qui).
 */
function parseChiaviProvider(env) {
  const stringaONull = (raw) => (typeof raw === 'string' && raw.trim() !== '' ? raw : null);
  return Object.freeze({
    openrouter: stringaONull(env.OPENROUTER_API_KEY),
    openai: stringaONull(env.OPENAI_API_KEY),
    deepseek: stringaONull(env.DEEPSEEK_API_KEY),
    anthropic: stringaONull(env.ANTHROPIC_API_KEY),
    gemini: stringaONull(env.GEMINI_API_KEY),
  });
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

  /*
   * ⭐⭐⭐ 2/9 — R1, review esterna (Fable): una cartella FUORI dall'albero
   * che il lancio Android cancella e rispinge ad ogni avvio (vedi
   * TalosTerminalPlugin.kt, AREA_STATO_REMOTO) — `.sessions-store/`/
   * `.automations/` stavano ACCANTO a server.mjs, dentro quell'albero, ed
   * è per questo che una sessione con cronologia vera spariva ad ogni
   * riavvio dell'app (LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md §44/§48).
   * Opzionale: assente ⇒ undefined, e i chiamanti restano sul
   * comportamento di sempre — "accanto a questo file" — per chi esegue
   * questo server fuori dal ponte Android (dev locale, desktop).
   */
  let cartellaStato;
  try {
    cartellaStato = typeof env.TALOS_HARNESS_UI_STATE_DIR === 'string' && env.TALOS_HARNESS_UI_STATE_DIR.trim() !== ''
      ? resolve(env.TALOS_HARNESS_UI_STATE_DIR)
      : undefined;
  } catch {
    fail('TALOS_HARNESS_UI_STATE_DIR non valida');
  }

  return Object.freeze({
    bancoDir,
    campaigns: Object.freeze(parseCampaigns(env.TALOS_HARNESS_UI_CAMPAIGNS)),
    host,
    port: parsePort(env.TALOS_HARNESS_UI_PORT),
    publicDir,
    modello: parseModello(env.TALOS_HARNESS_UI_MODEL),
    cartelleProgetto: parseCartelleProgetto(env.TALOS_HARNESS_UI_PROJECT_DIRS),
    cartellaStato,
    /*
     * ⛔ Nessun fail() se manca: Harness UI resta usabile in sola lettura
     * (campagne, elenco task) anche senza una chiave configurata — è
     * session-registry.avvia() a rifiutare per-richiesta con CONFIG_INVALID
     * quando si prova davvero ad avviare una sessione, non l'avvio del
     * server. Stesso nome env di TALOS-BANCO/provaTalos.mjs: una chiave
     * sola, non una copia con un nome diverso che potrebbe disallinearsi.
     */
    chiaveApi: typeof env.OPENROUTER_API_KEY === 'string' ? env.OPENROUTER_API_KEY : undefined,
    immagine: parseImmagine(env),
    // ⭐⭐⭐ 03/9 — model-destination.mjs: le altre credenziali + l'indirizzo Ollama (nessun account, nessuna chiave — vedi providerEndpointStore.ts lato client).
    chiaviProvider: parseChiaviProvider(env),
    endpointOllama: typeof env.OLLAMA_ENDPOINT === 'string' && env.OLLAMA_ENDPOINT.trim() !== '' ? env.OLLAMA_ENDPOINT.trim() : null,
  });
}

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
    /*
     * ⛔ Nessun fail() se manca: Harness UI resta usabile in sola lettura
     * (campagne, elenco task) anche senza una chiave configurata — è
     * session-registry.avvia() a rifiutare per-richiesta con CONFIG_INVALID
     * quando si prova davvero ad avviare una sessione, non l'avvio del
     * server. Stesso nome env di TALOS-BANCO/provaTalos.mjs: una chiave
     * sola, non una copia con un nome diverso che potrebbe disallinearsi.
     */
    chiaveApi: typeof env.OPENROUTER_API_KEY === 'string' ? env.OPENROUTER_API_KEY : undefined,
  });
}

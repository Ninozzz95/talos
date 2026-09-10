/**
 * Credenziali provider del server locale.
 *
 * Il browser può inviare una chiave solo a questo boundary: il valore vive nel
 * portachiavi del sistema operativo (o arriva da ambiente all'avvio) e non entra
 * mai in una risposta, in una sessione o in una preferenza web. Le preferenze
 * non segrete (indirizzo e timeout) possono essere ripristinate da un file
 * locale dedicato; le chiavi non entrano mai in quel file.
 */

import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';

export const PROVIDER_IDS = Object.freeze([
  'openai', 'deepseek', 'anthropic', 'gemini', 'openrouter', 'ollama', 'huggingface',
]);

export const PROVIDER_DEFINITIONS = Object.freeze({
  openai: Object.freeze({ id: 'openai', label: 'OpenAI', keyEnv: ['OPENAI_API_KEY'], defaultEndpoint: 'https://api.openai.com/v1', supportsEndpoint: true, supportsTimeout: true, requiresKey: true, execution: 'collegato' }),
  deepseek: Object.freeze({ id: 'deepseek', label: 'DeepSeek', keyEnv: ['DEEPSEEK_API_KEY'], defaultEndpoint: 'https://api.deepseek.com', supportsEndpoint: true, supportsTimeout: true, requiresKey: true, execution: 'in preparazione' }),
  anthropic: Object.freeze({ id: 'anthropic', label: 'Anthropic', keyEnv: ['ANTHROPIC_API_KEY'], defaultEndpoint: 'https://api.anthropic.com/v1', supportsEndpoint: false, supportsTimeout: true, requiresKey: true, execution: 'collegato' }),
  gemini: Object.freeze({ id: 'gemini', label: 'Google Gemini', keyEnv: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta', supportsEndpoint: false, supportsTimeout: true, requiresKey: true, execution: 'collegato' }),
  openrouter: Object.freeze({ id: 'openrouter', label: 'OpenRouter', keyEnv: ['OPENROUTER_API_KEY'], defaultEndpoint: 'https://openrouter.ai/api/v1', supportsEndpoint: true, supportsTimeout: true, requiresKey: true, execution: 'collegato' }),
  ollama: Object.freeze({ id: 'ollama', label: 'Ollama Local', keyEnv: ['OLLAMA_API_KEY'], defaultEndpoint: 'http://127.0.0.1:11434', endpointEnv: ['OLLAMA_BASE_URL'], supportsEndpoint: true, supportsTimeout: true, requiresKey: false, execution: 'runtime locale' }),
  huggingface: Object.freeze({ id: 'huggingface', label: 'Hugging Face', keyEnv: ['HF_TOKEN', 'HUGGINGFACE_HUB_TOKEN'], defaultEndpoint: null, supportsEndpoint: false, supportsTimeout: false, requiresKey: false, execution: 'catalogo e download' }),
});

const KEYRING_SERVICE = 'talos-harness-provider';
const DEFAULT_TIMEOUT_SECONDS = 60;
const MIN_TIMEOUT_SECONDS = 5;
const MAX_TIMEOUT_SECONDS = 300;
const MAX_KEY_LENGTH = 4096;

const MESSAGE_BY_CODE = Object.freeze({
  PROVIDER_INVALID: 'Provider non riconosciuto',
  PROVIDER_KEY_REQUIRED: 'Inserisci una chiave prima di salvarla',
  PROVIDER_KEY_INVALID: 'La chiave inserita non è valida',
  PROVIDER_STORE_UNAVAILABLE: 'Il portachiavi del computer non è disponibile: controlla Doctor',
  PROVIDER_RUNTIME_INVALID: 'Controlla indirizzo e tempo massimo del provider',
  PROVIDER_RUNTIME_UNAVAILABLE: 'Non è stato possibile salvare le preferenze del provider: controlla Doctor',
});

export class ProviderCredentialError extends Error {
  constructor(code, details = '') {
    super(MESSAGE_BY_CODE[code] || 'Configurazione provider non disponibile');
    this.name = 'ProviderCredentialError';
    this.code = code;
    this.details = details;
  }
}

function definitionFor(provider) {
  const definition = PROVIDER_DEFINITIONS[provider];
  if (!definition) throw new ProviderCredentialError('PROVIDER_INVALID');
  return definition;
}

function readEnvironment(env, names) {
  for (const name of names || []) {
    const value = env?.[name];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

export function normalizeProviderEndpoint(provider, rawEndpoint) {
  const definition = definitionFor(provider);
  if (!definition.supportsEndpoint) throw new ProviderCredentialError('PROVIDER_RUNTIME_INVALID');
  if (typeof rawEndpoint !== 'string' || rawEndpoint.trim() === '') throw new ProviderCredentialError('PROVIDER_RUNTIME_INVALID');
  let parsed;
  try { parsed = new URL(rawEndpoint.trim()); } catch { throw new ProviderCredentialError('PROVIDER_RUNTIME_INVALID'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash || !parsed.hostname) {
    throw new ProviderCredentialError('PROVIDER_RUNTIME_INVALID');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/u, '') || '';
  return parsed.toString().replace(/\/$/u, '');
}

function normalizeTimeout(value) {
  if (!Number.isInteger(value) || value < MIN_TIMEOUT_SECONDS || value > MAX_TIMEOUT_SECONDS) {
    throw new ProviderCredentialError('PROVIDER_RUNTIME_INVALID');
  }
  return value;
}

function noSecretLogger(logger, message) {
  try { if (typeof logger === 'function') logger(message); } catch { /* diagnosi non deve interrompere il server */ }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readRuntimePreferences(runtimeFile, runtimes, logger) {
  if (typeof runtimeFile !== 'string' || runtimeFile.trim() === '' || !existsSync(runtimeFile)) return;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(runtimeFile, 'utf8'));
    if (parsed?.version !== 1 || !isRecord(parsed.providers)) throw new Error('schema');
  } catch {
    noSecretLogger(logger, 'Preferenze provider ignorate: file non leggibile');
    return;
  }
  for (const provider of PROVIDER_IDS) {
    const definition = PROVIDER_DEFINITIONS[provider];
    if (!definition.supportsTimeout) continue;
    const row = parsed.providers[provider];
    if (!isRecord(row)) continue;
    try {
      const timeout = normalizeTimeout(row.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS);
      if (!definition.supportsEndpoint || row.endpointConfigured === false) {
        runtimes.set(provider, { endpoint: null, endpointConfigured: false, timeoutSeconds: timeout });
        continue;
      }
      const endpoint = normalizeProviderEndpoint(provider, row.endpoint);
      runtimes.set(provider, { endpoint, endpointConfigured: true, timeoutSeconds: timeout });
    } catch {
      noSecretLogger(logger, `Preferenza provider ${provider} ignorata: valore non valido`);
    }
  }
}

function writeRuntimePreferences(runtimeFile, runtimes) {
  if (typeof runtimeFile !== 'string' || runtimeFile.trim() === '') return;
  const providers = {};
  for (const [provider, value] of runtimes.entries()) {
    const definition = PROVIDER_DEFINITIONS[provider];
    if (!definition?.supportsTimeout) continue;
    providers[provider] = {
      endpoint: definition.supportsEndpoint && value.endpointConfigured ? value.endpoint : null,
      endpointConfigured: definition.supportsEndpoint && value.endpointConfigured === true,
      timeoutSeconds: value.timeoutSeconds,
    };
  }
  const temporary = `${runtimeFile}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify({ version: 1, providers }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(temporary, runtimeFile);
  } catch {
    try { if (existsSync(temporary)) unlinkSync(temporary); } catch { /* best effort */ }
    throw new ProviderCredentialError('PROVIDER_RUNTIME_UNAVAILABLE');
  }
}

/**
 * @param {{env?:Record<string,string|undefined>, keyring?:{get:Function,set:Function,remove:Function}|null, runtimeFile?:string|null, logger?:(message:string)=>void}} options
 */
export function createProviderCredentialStore({ env = process.env, keyring = null, runtimeFile = null, logger = () => {} } = {}) {
  const keys = new Map();
  /* ⛔ PO-01 — i provider la cui chiave viene dal PORTACHIAVI. Senza questo insieme l'origine si
     potrebbe solo indovinare, perché `keys` non ricorda da dove è arrivato ogni valore. */
  const daPortachiavi = new Set();
  const runtimes = new Map();
  for (const provider of PROVIDER_IDS) {
    const definition = PROVIDER_DEFINITIONS[provider];
    const key = readEnvironment(env, definition.keyEnv);
    if (key) keys.set(provider, key);
    if (definition.supportsEndpoint) {
      const endpoint = readEnvironment(env, definition.endpointEnv);
      if (endpoint) {
        try { runtimes.set(provider, { endpoint: normalizeProviderEndpoint(provider, endpoint), endpointConfigured: true, timeoutSeconds: DEFAULT_TIMEOUT_SECONDS }); }
        catch { noSecretLogger(logger, `Endpoint ${provider} ignorato: formato non valido`); }
      }
    }
  }
  readRuntimePreferences(runtimeFile, runtimes, logger);

  function requireProvider(provider) { return definitionFor(provider); }
  function getKey(provider) { requireProvider(provider); return keys.get(provider) ?? null; }
  function hasKey(provider) { return Boolean(getKey(provider)); }
  function keyringOperation(operation, provider, value) {
    if (!keyring || typeof keyring[operation] !== 'function') throw new ProviderCredentialError('PROVIDER_STORE_UNAVAILABLE');
    try { return operation === 'set' ? keyring.set(KEYRING_SERVICE, provider, value) : keyring.remove(KEYRING_SERVICE, provider); }
    catch { throw new ProviderCredentialError('PROVIDER_STORE_UNAVAILABLE'); }
  }
  function setKey(provider, value) {
    requireProvider(provider);
    if (typeof value !== 'string' || value.trim() === '') throw new ProviderCredentialError('PROVIDER_KEY_REQUIRED');
    const normalized = value.trim();
    if (normalized.length > MAX_KEY_LENGTH) throw new ProviderCredentialError('PROVIDER_KEY_INVALID');
    keyringOperation('set', provider, normalized);
    keys.set(provider, normalized);
    daPortachiavi.add(provider); // appena salvata lì: l'accesso e il campo «incolla» finiscono nello stesso posto
    return { provider, keyConfigured: true };
  }
  function clearKey(provider) {
    requireProvider(provider);
    keyringOperation('remove', provider);
    keys.delete(provider);
    daPortachiavi.delete(provider);
    return { provider, keyConfigured: false };
  }
  function loadFromKeyring() {
    if (!keyring || typeof keyring.get !== 'function') return { loaded: 0, available: false };
    let loaded = 0;
    for (const provider of PROVIDER_IDS) {
      try {
        const value = keyring.get(KEYRING_SERVICE, provider);
        if (typeof value === 'string' && value.trim() !== '' && value.length <= MAX_KEY_LENGTH) { keys.set(provider, value.trim()); daPortachiavi.add(provider); loaded += 1; }
      } catch { noSecretLogger(logger, `Chiave ${provider} non leggibile dal portachiavi`); }
    }
    return { loaded, available: true };
  }
  function getRuntime(provider) {
    const definition = requireProvider(provider);
    const saved = runtimes.get(provider);
    return { provider, endpoint: saved?.endpoint ?? definition.defaultEndpoint, endpointConfigured: saved?.endpointConfigured === true, timeoutSeconds: saved?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS };
  }
  function setRuntime(provider, { endpoint, timeoutSeconds = DEFAULT_TIMEOUT_SECONDS } = {}) {
    const definition = requireProvider(provider);
    const timeout = normalizeTimeout(timeoutSeconds);
    const previous = runtimes.get(provider);
    if (!definition.supportsEndpoint) {
      if (!definition.supportsTimeout) throw new ProviderCredentialError('PROVIDER_RUNTIME_INVALID');
      runtimes.set(provider, { endpoint: null, endpointConfigured: false, timeoutSeconds: timeout });
      try { writeRuntimePreferences(runtimeFile, runtimes); }
      catch (error) { if (previous) runtimes.set(provider, previous); else runtimes.delete(provider); throw error; }
      return getRuntime(provider);
    }
    const normalized = normalizeProviderEndpoint(provider, endpoint);
    runtimes.set(provider, { endpoint: normalized, endpointConfigured: true, timeoutSeconds: timeout });
    try { writeRuntimePreferences(runtimeFile, runtimes); }
    catch (error) { if (previous) runtimes.set(provider, previous); else runtimes.delete(provider); throw error; }
    return getRuntime(provider);
  }
  function resetEndpoint(provider) {
    const definition = requireProvider(provider);
    if (!definition.supportsEndpoint) throw new ProviderCredentialError('PROVIDER_RUNTIME_INVALID');
    const current = runtimes.get(provider);
    runtimes.set(provider, { endpoint: null, endpointConfigured: false, timeoutSeconds: current?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS });
    try { writeRuntimePreferences(runtimeFile, runtimes); }
    catch (error) { if (current) runtimes.set(provider, current); else runtimes.delete(provider); throw error; }
    return getRuntime(provider);
  }
  function listPublic() {
    return PROVIDER_IDS.map((provider) => {
      const definition = PROVIDER_DEFINITIONS[provider];
      const runtime = getRuntime(provider);
      return {
        id: provider,
        label: definition.label,
        requiresKey: definition.requiresKey,
        keyConfigured: hasKey(provider),
        supportsEndpoint: definition.supportsEndpoint,
        endpoint: runtime.endpoint,
        endpointConfigured: runtime.endpointConfigured,
        timeoutSeconds: runtime.timeoutSeconds,
        execution: definition.execution,
        /*
         * ⛔ PO-01 (10/09) — la guardia della UI: il pulsante «Accedi con …» compare solo dove il
         *   server sa servire il flusso. Un pulsante che apre un accesso inesistente è peggio di
         *   nessun pulsante.
         */
        supportsOAuth: provider === 'openrouter',
        /*
         * ⛔ Da DOVE viene la chiave in uso. Il portachiavi VINCE sull'ambiente (l'ambiente semina
         *   la mappa alla partenza, `loadFromKeyring` la sovrascrive), e questo campo lo dice
         *   invece di lasciarlo scoprire: senza, «Rimuovi chiave» sembra rotto quando la chiave
         *   dall'ambiente continua a funzionare dopo.
         */
        origineChiave: daPortachiavi.has(provider) ? 'custodia' : (hasKey(provider) ? 'ambiente' : null),
      };
    });
  }

  return Object.freeze({ getKey, getKeySync: getKey, hasKey, setKey, clearKey, loadFromKeyring, getRuntime, setRuntime, resetEndpoint, listPublic });
}

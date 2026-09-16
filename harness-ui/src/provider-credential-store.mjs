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
import { createHash } from 'node:crypto';

import { ID_CON_CREDENZIALE, REGISTRO_FORNITORI } from './provider-registry.mjs';
// P-K
import { normalizzaRuntimeCloud } from './provider-auth-cloud.mjs';
// P-K-bis/P-L-bis: preferenze pubbliche, separate dall'universo del portachiavi.
import { validaRuntimeAgenteEsterno } from './acp-agent.mjs';

/*
 * ⛔⛔ 12/09 — P-A: QUESTE DUE COSTANTI ERANO IL PRIMO DEI TREDICI ELENCHI PARALLELI.
 *
 * Erano scritte a mano, e dicevano cose che altri file smentivano: `deepseek` con
 * `execution: 'in preparazione'` mentre `model-destination.mjs` lo instradava da sempre, e
 * `lmstudio` assente benché fosse già sondato e caricabile. Adesso sono una PROIEZIONE del
 * registro: aggiungere un fornitore qui non è più possibile, e non deve esserlo.
 *
 * ⛔ I nomi dei campi restano quelli di prima (`label`, `keyEnv`, `supportsEndpoint`…): questa è
 *   la forma che la rotta `/api/v1/providers` e il componente `provider-card.js` già leggono, e
 *   il registro non è una scusa per rompere un contratto verso il browser. La traduzione avviene
 *   QUI, in un posto solo, e il test di parità la presidia.
 */
export const PROVIDER_IDS = ID_CON_CREDENZIALE;

export const PROVIDER_DEFINITIONS = Object.freeze(Object.fromEntries(PROVIDER_IDS.map((id) => {
  const record = REGISTRO_FORNITORI[id];
  return [id, Object.freeze({
    id,
    label: record.etichetta,
    keyEnv: record.auth.nomeVariabile,
    defaultEndpoint: record.baseUrl,
    ...(record.envIndirizzo.length ? { endpointEnv: record.envIndirizzo } : {}),
    supportsEndpoint: record.indirizzoModificabile === true,
    supportsTimeout: record.limiti.tempoMassimoModificabile === true,
    requiresKey: record.chiaveObbligatoria === true,
    execution: record.esecuzione,
    /* ⛔ La guardia della UI: il pulsante «Accedi con …» esiste solo dove il record dichiara un
       flusso. Prima era un `provider === 'openrouter'` scritto dentro `listPublic()`. */
    supportsOAuth: Boolean(record.oauth),
  })];
})));

const KEYRING_SERVICE = 'talos-harness-provider';
const DEFAULT_TIMEOUT_SECONDS = 60;
const MIN_TIMEOUT_SECONDS = 5;
const MAX_TIMEOUT_SECONDS = 300;
const MAX_KEY_LENGTH = 4096;
const POOL_SERVICE = 'talos-harness-provider-pool';
const POOL_INDEX_SERVICE = 'talos-harness-provider-pool-index';
const MAX_POOL_KEYS = 8;
export const PANCHINE_PROVIDER_MS = Object.freeze({
  traffico: 3_600_000, credenziale: 300_000, credito: 3_600_000,
  rete: 60_000, 'timeout-fornitore': 60_000, 'guasto-fornitore': 60_000, 'flusso-interrotto': 60_000,
});

function normalizzaChiave(value) {
  if (typeof value !== 'string' || !value.trim()) throw new ProviderCredentialError('PROVIDER_KEY_REQUIRED');
  const normalized = value.trim();
  if (normalized.length > MAX_KEY_LENGTH || /[\r\n\0]/u.test(normalized)) throw new ProviderCredentialError('PROVIDER_KEY_INVALID');
  return normalized;
}
function voceChiave(value, priorita = 0, origine = 'custodia') {
  if (!Number.isSafeInteger(priorita) || Math.abs(priorita) > 1000) throw new ProviderCredentialError('PROVIDER_KEY_INVALID');
  const chiave = normalizzaChiave(value);
  return { chiave, impronta: createHash('sha256').update(chiave).digest('hex'), priorita, origine, inPanchinaFino: null, causa: null };
}
function istanteAssoluto(value) {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/u.test(value))) {
    const n = Number(value); return n > 0 ? (n < 1e12 ? n * 1000 : n) : null;
  }
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT/u.test(value) ? Date.parse(value) : null;
}
function durataReset(value) {
  if (typeof value !== 'string' || !/^(?:\d+(?:\.\d+)?(?:ms|s|m|h))+$/u.test(value)) return null;
  return [...value.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/gu)].reduce((s, m) => s + Number(m[1]) * ({ms:1,s:1000,m:60000,h:3600000}[m[2]]), 0);
}

/** RFC 9110; OpenAI durate, Anthropic RFC3339. Nessun reset dedotto dal testo libero. */
export function leggiScadenzaFornitore(provider, { headers, resetAt } = {}, ora = Date.now()) {
  const h = headers instanceof Headers ? headers : new Headers(headers || {});
  const validi = [];
  const aggiungi = n => { if (Number.isFinite(n) && n >= ora && n <= 8.64e15) validi.push(n); };
  if (resetAt != null) aggiungi(istanteAssoluto(resetAt));
  const retry = h.get('retry-after');
  if (retry != null) aggiungi(/^\d+$/u.test(retry) ? ora + Number(retry) * 1000 : /^[A-Za-z]{3}, /u.test(retry) ? Date.parse(retry) : null);
  // P-J — le scadenze seguono il wire anche per Z.AI e MiniMax, nello stesso pool P-H.
  const prefisso = provider === 'openai' ? 'x-ratelimit-' : REGISTRO_FORNITORI[provider]?.wire === 'anthropic-messages' ? 'anthropic-ratelimit-' : null;
  if (prefisso) for (const dimensione of ['requests', 'tokens', 'project-tokens', 'input-tokens', 'output-tokens']) {
    const reset = h.get(provider === 'openai' ? `${prefisso}reset-${dimensione}` : `${prefisso}${dimensione}-reset`);
    const remaining = h.get(provider === 'openai' ? `${prefisso}remaining-${dimensione}` : `${prefisso}${dimensione}-remaining`);
    if (reset == null || (remaining != null && Number(remaining) > 0)) continue;
    const valore = provider === 'openai' ? durataReset(reset) : istanteAssoluto(reset);
    if (valore != null) aggiungi(provider === 'openai' ? ora + valore : valore);
  }
  return validi.length ? Math.max(...validi) : null;
}

const MESSAGE_BY_CODE = Object.freeze({
  PROVIDER_INVALID: 'Provider non riconosciuto',
  PROVIDER_KEY_REQUIRED: 'Inserisci una chiave prima di salvarla',
  PROVIDER_KEY_INVALID: 'La chiave inserita non è valida',
  PROVIDER_STORE_UNAVAILABLE: 'Il portachiavi del computer non è disponibile: controlla Doctor',
  PROVIDER_RUNTIME_INVALID: 'Controlla i campi del collegamento: indirizzo, modelli, comando e tempo massimo',
  PROVIDER_RUNTIME_UNAVAILABLE: 'Non è stato possibile salvare le preferenze del provider: controlla Doctor',
  PROVIDER_POOL_FULL: 'Sono già presenti otto chiavi per questo fornitore',
  PROVIDER_KEY_NOT_FOUND: 'La chiave non è più presente: aggiorna il pannello',
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
  // P-K — il contratto HTTP resta endpoint + timeout, nessuna migrazione.
  if (REGISTRO_FORNITORI[provider].cloud) {
    try { return normalizzaRuntimeCloud(provider, { endpoint: rawEndpoint }).endpoint; }
    catch { throw new ProviderCredentialError('PROVIDER_RUNTIME_INVALID'); }
  }
  // P-K — fine
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

// P-K-bis: soltanto identità, mai dichiarazioni di capacità o valori di credenziali.
function normalizzaModelli(provider, value, segreti = []) {
  const invalido = () => { throw new ProviderCredentialError('PROVIDER_RUNTIME_INVALID'); };
  if (!REGISTRO_FORNITORI[provider]?.cloud || !Array.isArray(value) || value.length > 50) invalido();
  const visti = new Set();
  return value.map(m => {
    if (!isRecord(m) || Object.keys(m).some(k => !['id', 'nome'].includes(k))
      || typeof m.id !== 'string' || m.id.length > 200 || !/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/u.test(m.id)
      || m.id.includes('://') || m.id.split('/').some(p => !p || p === '.' || p === '..')
      || (provider === 'azure' && !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(m.id))
      || PROVIDER_IDS.some(p => m.id.startsWith(`${p}:`)) || visti.has(m.id)
      || (Object.hasOwn(m, 'nome') && (typeof m.nome !== 'string' || !m.nome.trim() || m.nome.length > 120 || /[\p{Cc}\p{Cf}<>]/u.test(m.nome)))
      || segreti.some(s => s && [m.id, m.nome ?? ''].some(v => v.includes(s)))) invalido();
    visti.add(m.id);
    return { id: m.id, ...(m.nome === undefined ? {} : { nome: m.nome.trim() }) };
  });
}
function normalizzaAgente(value, env, segreti = []) {
  try {
    const agente = validaRuntimeAgenteEsterno(value, { env });
    if (segreti.some(s => s && [agente.comando, agente.cwd, ...agente.argomenti].some(v => v.includes(s)))) throw new Error('credenziale');
    return agente;
  }
  catch { throw new ProviderCredentialError('PROVIDER_RUNTIME_INVALID'); }
}

function readRuntimePreferences(runtimeFile, runtimes, logger, env, segreti) {
  if (typeof runtimeFile !== 'string' || runtimeFile.trim() === '' || !existsSync(runtimeFile)) return;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(runtimeFile, 'utf8'));
    if (parsed?.version !== 1 || !isRecord(parsed.providers)) throw new Error('schema');
  } catch {
    noSecretLogger(logger, 'Preferenze provider ignorate: file non leggibile');
    return;
  }
  for (const provider of [...PROVIDER_IDS, 'esterno']) {
    if (provider === 'esterno') {
      const row = parsed.providers.esterno;
      if (row === undefined) continue;
      try {
        if (!isRecord(row) || Object.keys(row).some(k => k !== 'agente')) throw new Error('schema');
        runtimes.set(provider, { agente: normalizzaAgente(row.agente, env, segreti) });
      } catch { noSecretLogger(logger, 'Preferenza agente esterno ignorata: valore non valido'); }
      continue;
    }
    const definition = PROVIDER_DEFINITIONS[provider];
    if (!definition.supportsTimeout) continue;
    const row = parsed.providers[provider];
    if (!isRecord(row)) continue;
    try {
      const timeout = normalizeTimeout(row.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS);
      const extra = Object.hasOwn(row, 'modelli') ? { modelli: normalizzaModelli(provider, row.modelli, segreti) } : {};
      if (!definition.supportsEndpoint || row.endpointConfigured === false) {
        runtimes.set(provider, { endpoint: null, endpointConfigured: false, timeoutSeconds: timeout, ...extra });
        continue;
      }
      const endpoint = normalizeProviderEndpoint(provider, row.endpoint);
      runtimes.set(provider, { endpoint, endpointConfigured: true, timeoutSeconds: timeout, ...extra });
    } catch {
      noSecretLogger(logger, `Preferenza provider ${provider} ignorata: valore non valido`);
    }
  }
}

function writeRuntimePreferences(runtimeFile, runtimes) {
  if (typeof runtimeFile !== 'string' || runtimeFile.trim() === '') return;
  const providers = {};
  for (const [provider, value] of runtimes.entries()) {
    if (provider === 'esterno') { providers.esterno = { agente: value.agente }; continue; }
    const definition = PROVIDER_DEFINITIONS[provider];
    if (!definition?.supportsTimeout) continue;
    providers[provider] = {
      endpoint: definition.supportsEndpoint && value.endpointConfigured ? value.endpoint : null,
      endpointConfigured: definition.supportsEndpoint && value.endpointConfigured === true,
      timeoutSeconds: value.timeoutSeconds,
      ...(value.modelli ? { modelli: value.modelli } : {}),
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
 * @param {{env?:Record<string,string|undefined>, keyring?:{get:Function,set:Function,remove:Function}|null, runtimeFile?:string|null, logger?:(message:string)=>void, ignoraSemiAmbiente?:boolean}} options
 */
export function createProviderCredentialStore({ env = process.env, keyring = null, runtimeFile = null, logger = () => {}, ora = Date.now, ignoraSemiAmbiente = false } = {}) {
  const pools = new Map();
  const conIndice = new Set();
  /* ⛔ PO-01 — i provider la cui chiave viene dal PORTACHIAVI. Senza questo insieme l'origine si
     potrebbe solo indovinare, perché `keys` non ricorda da dove è arrivato ogni valore. */
  const daPortachiavi = new Set();
  const runtimes = new Map();
  for (const provider of PROVIDER_IDS) {
    const definition = PROVIDER_DEFINITIONS[provider];
    /*
     * ⛔ (16/09/2026) — con lo scope desktop l'app installata NON legge semi di chiavi
     *   dall'ambiente: le sue chiavi arrivano SOLO dalla UI (o dal portachiavi `-desktop` riletto
     *   a ogni boot). Il dev continua a seminare da ambiente: default falso. Gli ENDPOINT da
     *   ambiente restano per entrambi — sono configurazione, non segreti, e non fanno comparire
     *   schede «collegate» (quella è `keyConfigured`, falso finché nessuno salva una chiave).
     */
    if (!ignoraSemiAmbiente) {
      const key = readEnvironment(env, definition.keyEnv);
      try {
        const rawPool = readEnvironment(env, [`${definition.keyEnv[0]}_POOL`]);
        const elenco = rawPool ? JSON.parse(rawPool) : [];
        if (!Array.isArray(elenco) || elenco.length > MAX_POOL_KEYS) throw new Error('schema');
        const righe = [...(key ? [voceChiave(key, 0, 'ambiente')] : []), ...elenco.map((v, i) => voceChiave(typeof v === 'string' ? v : v?.key, typeof v === 'string' ? i + 1 : v?.priorita ?? i + 1, 'ambiente'))];
        const viste = new Set();
        const uniche = righe.filter(v => { if (viste.has(v.impronta)) return false; viste.add(v.impronta); return true; });
        if (uniche.length > MAX_POOL_KEYS) throw new Error('schema');
        pools.set(provider, uniche);
      } catch {
        noSecretLogger(logger, `Elenco chiavi ${provider} ignorato: formato non valido`);
        try { if (key) pools.set(provider, [voceChiave(key, 0, 'ambiente')]); } catch { /* nessun segreto in diagnosi */ }
      }
    }
    if (definition.supportsEndpoint) {
      const endpoint = readEnvironment(env, definition.endpointEnv);
      if (endpoint) {
        try { runtimes.set(provider, { endpoint: normalizeProviderEndpoint(provider, endpoint), endpointConfigured: true, timeoutSeconds: DEFAULT_TIMEOUT_SECONDS }); }
        catch { noSecretLogger(logger, `Endpoint ${provider} ignorato: formato non valido`); }
      }
    }
  }
  const segretiRuntime = () => [...pools.values()].flat().map(v => v.chiave);
  readRuntimePreferences(runtimeFile, runtimes, logger, env, segretiRuntime());

  function requireProvider(provider) { return definitionFor(provider); }
  function righe(provider) { requireProvider(provider); return [...(pools.get(provider) || [])].sort((a,b) => a.priorita - b.priorita); }
  function pubblica(v, i = 0) {
    const inPanchina = v.inPanchinaFino > ora();
    return { impronta: v.impronta, nome: `Chiave ${i + 1}`, priorita: v.priorita, origine: v.origine,
      stato: inPanchina ? 'in-panchina' : 'disponibile', inPanchinaFino: inPanchina ? v.inPanchinaFino : null,
      causa: inPanchina ? v.causa : null };
  }
  function elencaPool(provider) { return righe(provider).map(pubblica); }
  function scegliChiave(provider, { escluse = [] } = {}) {
    const v = righe(provider).find(v => !(v.inPanchinaFino > ora()) && !escluse.includes(v.impronta));
    // Il segreto serve solo al trasporto; JSON/log dell'oggetto non lo enumerano.
    return v ? Object.defineProperty(pubblica(v), 'chiave', { value: v.chiave }) : null;
  }
  function getKey(provider) { return scegliChiave(provider)?.chiave ?? null; }
  function hasKey(provider) { return righe(provider).length > 0; }
  /*
   * ⭐ (16/09/2026) — le due porte della MIGRAZIONE (`src/migrazione-chiavi.mjs`, scope desktop):
   * copiare una chiave dal namespace senza suffisso a quello `-desktop`. I segreti che esportano
   * restano DENTRO il server: mai in una risposta HTTP, mai in un log — la migrazione li passa
   * dritti al portachiavi di destinazione, non li registra.
   */
  function esportaPool(provider) {
    return righe(provider).map((v) => ({ chiave: v.chiave, priorita: v.priorita }));
  }
  /* Qualunque traccia nel portachiavi — chiave reale o tombstone dell'indice vuoto lasciato da
     `clearKey` — vieta la copia: senza, una chiave eliminata dall'utente ripartirebbe dal
     namespace vecchio al prossimo giro di migrazione. */
  function tracciaInCustodia(provider) {
    requireProvider(provider);
    return daPortachiavi.has(provider);
  }
  function keyringOperation(operation, provider, value, service = KEYRING_SERVICE) {
    if (!keyring || typeof keyring[operation] !== 'function') throw new ProviderCredentialError('PROVIDER_STORE_UNAVAILABLE');
    try { return operation === 'set' ? keyring.set(service, provider, value) : keyring.remove(service, provider); }
    catch { throw new ProviderCredentialError('PROVIDER_STORE_UNAVAILABLE'); }
  }
  function salvaPool(provider, nuove) {
    const precedenti = righe(provider), aggiunte = [];
    try {
      for (const v of nuove) {
        if (conIndice.has(provider) && precedenti.some(p => p.impronta === v.impronta)) continue;
        keyringOperation('set', `${provider}:${v.impronta}`, v.chiave, POOL_SERVICE);
        aggiunte.push(v.impronta);
      }
      // L'indice si pubblica per ultimo. Un indice vuoto impedisce di resuscitare ambiente/legacy.
      keyringOperation('set', `${provider}:indice`, JSON.stringify({ version: 1, chiavi: nuove.map(v => [v.impronta, v.priorita, v.inPanchinaFino, v.causa]) }), POOL_INDEX_SERVICE);
    } catch (error) {
      for (const id of aggiunte) { try { keyringOperation('remove', `${provider}:${id}`, null, POOL_SERVICE); } catch { noSecretLogger(logger, 'Pulizia del portachiavi incompleta: controlla Doctor'); } }
      throw error;
    }
    pools.set(provider, nuove.map(v => ({ ...v, origine: 'custodia' })));
    conIndice.add(provider); daPortachiavi.add(provider);
    for (const v of precedenti) if (!nuove.some(n => n.impronta === v.impronta)) {
      keyringOperation('remove', `${provider}:${v.impronta}`, null, POOL_SERVICE);
    }
    // L'account singolo resta leggibile dai consumatori legacy finché la sua
    // credenziale appartiene al pool. Una rimozione esplicita cancella entrambe le copie.
    let legacy;
    try { legacy = keyring.get?.(KEYRING_SERVICE, provider); } catch { throw new ProviderCredentialError('PROVIDER_STORE_UNAVAILABLE'); }
    if (!nuove.some(v => v.chiave === legacy?.trim())) keyringOperation('remove', provider);
  }
  function aggiungiChiave(provider, value, { priorita } = {}) {
    const attuali = righe(provider), nuova = voceChiave(value, priorita ?? Math.min(1000, Math.max(-1, ...attuali.map(v => v.priorita)) + 1));
    const esistente = attuali.find(v => v.impronta === nuova.impronta);
    if (esistente) return pubblica(esistente, attuali.indexOf(esistente));
    if (attuali.length >= MAX_POOL_KEYS) throw new ProviderCredentialError('PROVIDER_POOL_FULL');
    salvaPool(provider, [...attuali, nuova]);
    return elencaPool(provider).find(v => v.impronta === nuova.impronta);
  }
  function rimuoviChiave(provider, impronta) {
    const attuali = righe(provider);
    if (!attuali.some(v => v.impronta === impronta)) throw new ProviderCredentialError('PROVIDER_KEY_NOT_FOUND');
    salvaPool(provider, attuali.filter(v => v.impronta !== impronta));
    return { provider, keyConfigured: hasKey(provider), pool: elencaPool(provider) };
  }
  function mettiInPanchina(provider, impronta, { classe, headers, resetAt } = {}) {
    const attuali = righe(provider), v = attuali.find(v => v.impronta === impronta);
    if (!v) return null; // rimossa durante una richiesta in volo
    if (!Object.hasOwn(PANCHINE_PROVIDER_MS, classe)) return pubblica(v);
    const stima = classe === 'traffico' && attuali.length === 1 ? 60_000 : PANCHINE_PROVIDER_MS[classe];
    const nuova = { ...v, inPanchinaFino: leggiScadenzaFornitore(provider, { headers, resetAt }, ora()) ?? ora() + stima, causa: classe };
    const nuove = attuali.map(r => r === v ? nuova : r);
    // Le panchine ambientali restano in memoria: nessuna scrittura segreta non richiesta.
    if (daPortachiavi.has(provider)) {
      try { salvaPool(provider, nuove); }
      catch { pools.set(provider, nuove); noSecretLogger(logger, `Panchina ${provider} attiva in memoria: salvataggio non disponibile`); }
    } else pools.set(provider, nuove);
    if (classe === 'credenziale') noSecretLogger(logger, `Credenziale rifiutata da ${PROVIDER_DEFINITIONS[provider].label}: controlla gli accessi`);
    return pubblica(nuova);
  }
  function setKey(provider, value) {
    requireProvider(provider);
    const normalized = normalizzaChiave(value);
    if (conIndice.has(provider)) {
      const attuali = righe(provider), nuova = voceChiave(normalized, attuali[0]?.priorita ?? 0);
      salvaPool(provider, [nuova, ...attuali.slice(1).filter(v => v.impronta !== nuova.impronta)]);
    } else {
      keyringOperation('set', provider, normalized);
      pools.set(provider, [voceChiave(normalized)]);
    }
    daPortachiavi.add(provider); // appena salvata lì: l'accesso e il campo «incolla» finiscono nello stesso posto
    return { provider, keyConfigured: true };
  }
  function clearKey(provider) {
    requireProvider(provider);
    salvaPool(provider, []);
    daPortachiavi.delete(provider);
    return { provider, keyConfigured: false };
  }
  function loadFromKeyring() {
    if (!keyring || typeof keyring.get !== 'function') return { loaded: 0, available: false };
    let loaded = 0;
    for (const provider of PROVIDER_IDS) {
      try {
        const indice = keyring.get(POOL_INDEX_SERVICE, `${provider}:indice`);
        if (indice != null) {
          // Un indice danneggiato NON autorizza la vecchia credenziale o l'ambiente.
          pools.set(provider, []); conIndice.add(provider); daPortachiavi.add(provider);
          const dati = JSON.parse(indice);
          if (dati?.version !== 1 || !Array.isArray(dati.chiavi) || dati.chiavi.length > MAX_POOL_KEYS) throw new Error('schema');
          const viste = new Set();
          const nuove = dati.chiavi.map(r => {
            if (!Array.isArray(r) || r.length !== 4 || !/^[a-f0-9]{64}$/u.test(r[0]) || viste.has(r[0])) throw new Error('schema');
            viste.add(r[0]);
            const v = voceChiave(keyring.get(POOL_SERVICE, `${provider}:${r[0]}`), r[1]);
            if (v.impronta !== r[0] || (r[2] !== null && (!Number.isSafeInteger(r[2]) || r[2] < 0 || r[2] > 8.64e15)) || (r[3] !== null && !Object.hasOwn(PANCHINE_PROVIDER_MS, r[3]))) throw new Error('schema');
            return { ...v, inPanchinaFino: r[2], causa: r[3] };
          });
          pools.set(provider, nuove); if (nuove.length) loaded += 1;
          continue;
        }
        const value = keyring.get(KEYRING_SERVICE, provider);
        if (typeof value === 'string' && value.trim() !== '' && value.length <= MAX_KEY_LENGTH) { pools.set(provider, [voceChiave(value)]); daPortachiavi.add(provider); loaded += 1; }
      } catch { noSecretLogger(logger, `Chiave ${provider} non leggibile dal portachiavi`); }
    }
    return { loaded, available: true };
  }
  function getRuntime(provider) {
    if (provider === 'esterno') return { provider, agente: structuredClone(runtimes.get(provider)?.agente ?? null) };
    const definition = requireProvider(provider);
    const saved = runtimes.get(provider);
    const endpoint = saved?.endpoint ?? definition.defaultEndpoint;
    // P-K — campi non segreti derivati dalla stessa preferenza anche dopo riavvio.
    const cloud = REGISTRO_FORNITORI[provider].cloud && endpoint ? normalizzaRuntimeCloud(provider, { endpoint }) : null;
    return { provider, endpoint, endpointConfigured: saved?.endpointConfigured === true, timeoutSeconds: saved?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS, ...(cloud ?? {}),
      ...(REGISTRO_FORNITORI[provider].cloud ? { modelli: structuredClone(saved?.modelli ?? []) } : {}) };
    // P-K — fine
  }
  function setRuntime(provider, value = {}) {
    // P-K-bis: la whitelist vale anche fuori da HTTP; validare tutto prima di scrivere.
    if (!isRecord(value) || Object.keys(value).some(k => !(provider === 'esterno' ? ['agente'] : ['endpoint', 'timeoutSeconds', 'modelli']).includes(k))) {
      throw new ProviderCredentialError('PROVIDER_RUNTIME_INVALID');
    }
    if (provider === 'esterno') {
      const previous = runtimes.get(provider);
      const agente = normalizzaAgente(value.agente, env, segretiRuntime());
      runtimes.set(provider, { agente });
      try { writeRuntimePreferences(runtimeFile, runtimes); }
      catch (error) { if (previous) runtimes.set(provider, previous); else runtimes.delete(provider); throw error; }
      return getRuntime(provider);
    }
    const { endpoint, timeoutSeconds = (REGISTRO_FORNITORI[provider]?.cloud ? runtimes.get(provider)?.timeoutSeconds : null) ?? DEFAULT_TIMEOUT_SECONDS } = value;
    const definition = requireProvider(provider);
    const timeout = normalizeTimeout(timeoutSeconds);
    const previous = runtimes.get(provider);
    const extra = Object.hasOwn(value, 'modelli') ? { modelli: normalizzaModelli(provider, value.modelli, segretiRuntime()) }
      : previous?.modelli ? { modelli: previous.modelli } : {};
    if (!definition.supportsEndpoint) {
      if (!definition.supportsTimeout) throw new ProviderCredentialError('PROVIDER_RUNTIME_INVALID');
      runtimes.set(provider, { endpoint: null, endpointConfigured: false, timeoutSeconds: timeout });
      try { writeRuntimePreferences(runtimeFile, runtimes); }
      catch (error) { if (previous) runtimes.set(provider, previous); else runtimes.delete(provider); throw error; }
      return getRuntime(provider);
    }
    const parzialeCloud = REGISTRO_FORNITORI[provider].cloud && !Object.hasOwn(value, 'endpoint');
    const normalized = parzialeCloud ? previous?.endpoint ?? null : normalizeProviderEndpoint(provider, endpoint);
    runtimes.set(provider, { endpoint: normalized, endpointConfigured: parzialeCloud ? previous?.endpointConfigured === true : true, timeoutSeconds: timeout, ...extra });
    try { writeRuntimePreferences(runtimeFile, runtimes); }
    catch (error) { if (previous) runtimes.set(provider, previous); else runtimes.delete(provider); throw error; }
    return getRuntime(provider);
  }
  function resetEndpoint(provider) {
    const definition = requireProvider(provider);
    if (!definition.supportsEndpoint) throw new ProviderCredentialError('PROVIDER_RUNTIME_INVALID');
    const current = runtimes.get(provider);
    runtimes.set(provider, { ...current, endpoint: null, endpointConfigured: false, timeoutSeconds: current?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS });
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
        pool: elencaPool(provider),
        modelliDiRiserva: REGISTRO_FORNITORI[provider].modelliDiRiserva ?? [],
        supportsEndpoint: definition.supportsEndpoint,
        endpoint: runtime.endpoint,
        endpointConfigured: runtime.endpointConfigured,
        timeoutSeconds: runtime.timeoutSeconds,
        // P-K — schema e aiuto per i soli campi pubblici del pannello.
        ...(REGISTRO_FORNITORI[provider].cloud ? { cloud: REGISTRO_FORNITORI[provider].cloud,
          modelli: runtime.modelli,
          regione: runtime.regione ?? null, progetto: runtime.progetto ?? null,
          endpointRisorsa: runtime.endpointRisorsa ?? null, versioneApi: runtime.versioneApi ?? 'v1' } : {}),
        // P-K — fine
        execution: definition.execution,
        /*
         * ⛔ PO-01 (10/09) — la guardia della UI: il pulsante «Accedi con …» compare solo dove il
         *   server sa servire il flusso. Un pulsante che apre un accesso inesistente è peggio di
         *   nessun pulsante.
         */
        supportsOAuth: definition.supportsOAuth === true,
        /*
         * ⛔ Da DOVE viene la chiave in uso. Il portachiavi VINCE sull'ambiente (l'ambiente semina
         *   la mappa alla partenza, `loadFromKeyring` la sovrascrive), e questo campo lo dice
         *   invece di lasciarlo scoprire: senza, «Rimuovi chiave» sembra rotto quando la chiave
         *   dall'ambiente continua a funzionare dopo.
         */
        origineChiave: daPortachiavi.has(provider) ? 'custodia' : (hasKey(provider) ? 'ambiente' : null),
      };
    }).concat({ id: 'esterno', label: REGISTRO_FORNITORI.esterno.etichetta, requiresKey: false,
      keyConfigured: false, pool: [], modelliDiRiserva: [], supportsEndpoint: false, supportsOAuth: false,
      origineChiave: null, execution: getRuntime('esterno').agente ? 'configurato' : 'da configurare',
      agente: getRuntime('esterno').agente });
  }

  return Object.freeze({ getKey, getKeySync: getKey, hasKey, setKey, clearKey, loadFromKeyring, getRuntime, setRuntime, resetEndpoint, listPublic,
    aggiungiChiave, rimuoviChiave, elencaPool, scegliChiave, mettiInPanchina, esportaPool, tracciaInCustodia });
}

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
import { eseguiFlowForgeLocale, FORGE_PREFISSO_NOME_TOOL, validaManifestForgeLocale } from './forge-contract.mjs';
import { parseRuntimeOwnerSnapshot } from './runtime-owner-contract.mjs';

const ENDPOINT_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';
const RICHIESTA_DI_RIASSUNTO = 'Riassumi la conversazione mantenendo decisioni, file e risultati utili al lavoro.';
const GIRI_PRIMA_DI_COMPATTARE = 12;

export class OwnerRuntimeUnavailableError extends Error {
  constructor(message, code = 'OWNER_RUNTIME_NOT_CONFIGURED', options = {}) {
    super(message);
    this.name = 'OwnerRuntimeUnavailableError';
    this.code = code;
    if (options.cause) this.cause = options.cause;
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
 * @param {{modulePath?:string|null, importFn?:Function}} [options]
 */
export function createOwnerRuntimeAdapter({ modulePath = process.env.TALOS_OWNER_RUNTIME_MODULE ?? null, importFn = (specifier) => import(specifier) } = {}) {
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
    async talosLavora(input) { return richiama('talosLavora', input); },
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

/**
 * library-policy-store.mjs — FASE N (29/8), il tool `library_context_policy_update`
 * (l'8° e ultimo tool mobile della Libreria). Owner: "procedi con la
 * prima [voce di 'cosa manca'] e ricordati la ricerca" — letto per
 * intero `libraryContextPolicyTools.ts`/`libraryPolicy.ts` (mobile),
 * non presunto, dopo averlo inizialmente deferito senza leggerlo.
 *
 * ⛔⛔⛔ Cosa governa DAVVERO questo tool, verificato alla fonte: quale
 * delle QUATTRO modalità di iniezione automatica del contenuto
 * Libreria nel contesto è attiva — `broad_compat_v1` (inietta
 * ampiamente), `smart_relevant_v1` (inietta solo il rilevante),
 * `ask_before_use_v1` (chiede consenso prima), `agentic_on_demand_v1`
 * (MAI iniettato d'ufficio — solo `library_search`/`library_read`
 * chiamati esplicitamente dal modello). Il desktop, per OGNI tipo di
 * contenuto dinamico (MCP/skill/plugin/Libreria), ha costruito SOLO
 * l'ultima — nessuna iniezione automatica esiste da nessuna parte nel
 * kernel o nel backend. ⇒ `mode` su questo harness ha UN SOLO valore
 * possibile oggi: tentare le altre tre torna un rifiuto onesto, non
 * un no-op silenzioso — mai un tool che finge di poter fare qualcosa
 * che non può.
 *
 * `enabled`/`included`/`excluded_file_ids` restano invece
 * GENUINAMENTE utili anche sotto l'unica modalità che esiste:
 * `enabled:false` è un interruttore reale ("il modello non vede più
 * la Libreria di questo progetto", verificato dai 4 tool di lettura
 * che leggono questa politica prima di rispondere) — non un campo
 * morto in attesa di un'infrastruttura futura.
 *
 * Storage per-progetto, dentro `.harness-ui-library/` (stessa cartella
 * delle voci — è la POLITICA di QUELLA Libreria, non una preferenza
 * globale del server): `.harness-ui-library/policy.json`.
 *
 * ⛔ Un solo scope, non i tre di mobile (`global`/`chat`/`turn`): quella
 * gerarchia esiste sul mobile perché l'iniezione automatica avviene
 * PER TURNO e serve un modo di scavalcarla per un turno solo — un
 * meccanismo che qui non c'è. Un solo livello per-progetto è la
 * semplificazione onesta, non un taglio: non c'è nient'altro da
 * scavalcare.
 */
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { CARTELLA_LIBRERIA } from './library-store.mjs';

export class LibraryPolicyError extends Error {
  constructor(message, code = 'LIBRARY_POLICY_INVALID') {
    super(message);
    this.name = 'LibraryPolicyError';
    this.code = code;
  }
}

export class LibraryPolicyConflictError extends Error {
  constructor(revisioneAttesa, revisioneAttuale) {
    super(`Library policy changed before this update (expected revision ${revisioneAttesa}, current revision ${revisioneAttuale}).`);
    this.name = 'LibraryPolicyConflictError';
    this.code = 'LIBRARY_POLICY_CONFLICT';
    this.revisioneAttesa = revisioneAttesa;
    this.revisioneAttuale = revisioneAttuale;
  }
}

const NOME_FILE_POLITICA = 'policy.json';
// ⛔ L'UNICA modalità che questo harness implementa davvero — vedi la doc del modulo sul perché. Elencata comunque per intero: il tool deve poter dire "chiesto X, supportato solo Y", mai fingere che X non esista come concetto.
export const MODALITA_SUPPORTATE = Object.freeze(['agentic_on_demand_v1']);
export const MODALITA_CONOSCIUTE = Object.freeze(['broad_compat_v1', 'smart_relevant_v1', 'ask_before_use_v1', 'agentic_on_demand_v1']);
const MAX_RICEVUTE = 32;

function politicaDefault() {
  return { revision: 0, enabled: true, mode: 'agentic_on_demand_v1', includedFileIds: [], excludedFileIds: [] };
}

function normalizzaListaId(valori) {
  return [...new Set((Array.isArray(valori) ? valori : []).map((v) => String(v).trim()).filter(Boolean))].slice(0, 64);
}

/**
 * Legge la politica corrente — `.harness-ui-library/policy.json`
 * assente è uno stato VALIDO (il default: abilitata, l'unica modalità
 * esistente, nessun override), mai un errore. Un file presente ma
 * malformato FERMA la lettura con un errore dichiarato — stesso
 * principio "gli stati sono tre" di `library-store.mjs`.
 */
export async function leggiPolitica({ cartella }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const percorso = join(cartella, CARTELLA_LIBRERIA, NOME_FILE_POLITICA);
  let testo;
  try {
    testo = await readFileFn(percorso, 'utf8');
  } catch (errore) {
    if (errore?.code === 'ENOENT') return politicaDefault();
    throw new LibraryPolicyError(`Impossibile leggere ${NOME_FILE_POLITICA}: ${errore.message}`, 'LIBRARY_POLICY_READ_FAILED');
  }
  let politica;
  try {
    politica = JSON.parse(testo);
  } catch {
    throw new LibraryPolicyError(`${NOME_FILE_POLITICA} non è JSON valido`, 'LIBRARY_POLICY_MALFORMED');
  }
  if (!Number.isSafeInteger(politica.revision) || politica.revision < 0) {
    throw new LibraryPolicyError(`${NOME_FILE_POLITICA} ha una "revision" non valida`, 'LIBRARY_POLICY_MALFORMED');
  }
  return {
    revision: politica.revision,
    enabled: typeof politica.enabled === 'boolean' ? politica.enabled : true,
    mode: MODALITA_CONOSCIUTE.includes(politica.mode) ? politica.mode : 'agentic_on_demand_v1',
    includedFileIds: normalizzaListaId(politica.includedFileIds),
    excludedFileIds: normalizzaListaId(politica.excludedFileIds),
  };
}

/**
 * Scrive una nuova politica — concorrenza ottimistica: `revisioneAttesa`
 * deve combaciare con la revisione VERA sul disco in questo istante,
 * altrimenti `LibraryPolicyConflictError` (mai una scrittura silenziosa
 * su un cambiamento nel frattempo — porto diretto del contratto mobile,
 * `TalosLibraryPolicyConflictError`).
 */
export async function scriviPolitica({ cartella, valore, revisioneAttesa }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  const attuale = await leggiPolitica({ cartella }, { readFileFn });
  if (attuale.revision !== revisioneAttesa) {
    throw new LibraryPolicyConflictError(revisioneAttesa, attuale.revision);
  }
  const cartellaLibreria = join(cartella, CARTELLA_LIBRERIA);
  await mkdirFn(cartellaLibreria, { recursive: true });
  const aggiornata = {
    revision: attuale.revision + 1,
    enabled: typeof valore.enabled === 'boolean' ? valore.enabled : attuale.enabled,
    mode: valore.mode ?? attuale.mode,
    includedFileIds: normalizzaListaId(valore.includedFileIds ?? attuale.includedFileIds),
    excludedFileIds: normalizzaListaId(valore.excludedFileIds ?? attuale.excludedFileIds),
    aggiornatoIl: new Date().toISOString(),
  };
  await writeFileFn(join(cartellaLibreria, NOME_FILE_POLITICA), JSON.stringify(aggiornata, null, 2), 'utf8');
  return aggiornata;
}

/**
 * Una Map nuova per sessione — stessa vita di `creaCursoriLibreria`
 * (un'istanza per run, un `receipt_id` non sopravvive a un resume:
 * `undo` con un id di un run precedente torna onestamente "non
 * trovato", mai un crash — mobile stesso lo prevede come esito
 * normale, "missing, expired, already used").
 */
export function creaRicevutePolitica() {
  return new Map();
}

/** Ricorda una ricevuta di undo — FIFO, tetto MAX_RICEVUTE, stesso schema di eviction di `impaginaVoci`/mobile. */
export function ricordaRicevutaPolitica(ricevute, ricevuta) {
  ricevute.delete(ricevuta.receiptId);
  ricevute.set(ricevuta.receiptId, ricevuta);
  while (ricevute.size > MAX_RICEVUTE) {
    const piuVecchia = ricevute.keys().next().value;
    if (piuVecchia === undefined) break;
    ricevute.delete(piuVecchia);
  }
}

/** Costruisce una ricevuta pronta per `ricordaRicevutaPolitica` — id nuovo generato qui, mai passato dal chiamante. */
export function creaRicevutaPolitica({ azione, prima, revisionePrima, revisioneDopo }, deps = {}) {
  const randomUUIDFn = deps.randomUUIDFn ?? randomUUID;
  return {
    receiptId: `libpol-${randomUUIDFn()}`,
    azione,
    prima,
    revisionePrima,
    revisioneDopo,
    creatoIl: new Date().toISOString(),
  };
}

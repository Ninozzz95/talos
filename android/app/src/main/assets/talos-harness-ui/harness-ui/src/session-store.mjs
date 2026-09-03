/**
 * session-store.mjs — FASE L (30/8), porta canonico (3e03f9d3) verbatim —
 * zero adattamento, il modulo non dipende da niente di specifico al
 * desktop (solo node:fs/node:path).
 *
 * Owner: "ricerca web competitor" sulla domanda "un riavvio del
 * processo perde una sessione in corso, è mai successo per davvero?".
 *
 * ⛔⛔⛔ La ricerca ha RIDEFINITO la fase, non solo risposto alla domanda.
 * Verificato alla fonte (non presunto): `session-registry.mjs` dichiara
 * fin dalla sua prima riga "solo in memoria, deliberato... non ancora
 * aperto" — un riavvio del server perde OGNI sessione, non solo quelle
 * in corso, e non è mai stato diversamente.
 *
 * Cosa fanno DAVVERO i concorrenti (Codex, il più ricercato):
 * transcript JSONL append-only come fonte di verità per il replay
 * ("rollout files"), un indice separato (SQLite, solo per liste
 * veloci — non necessario alla scala di questo prodotto). ⭐⭐⭐ Anche
 * Codex, onestamente: "if a transport failure occurs early enough...
 * no resumable artefacts may be written" — un ripristino a metà turno
 * non è mai garantito, nemmeno lì. Il ripristino VERO che offrono è
 * "rilettura della trascrizione", non "il modello riprende da dove
 * stava" — lo stesso confine onesto che questo modulo dichiara.
 *
 * ⛔ Trovato durante la ricerca, non ipotetico: Hermes Agent ha un bug
 * APERTO (#8029, "non-atomic transcript rewrite causes data loss on
 * crash") — riscrivere l'intero file invece di solo accodare è la
 * classe di errore che questo modulo evita per costruzione: MAI un
 * `writeFile` che sostituisce il file intero, solo `appendFile`. Una
 * riga JSONL è atomica sui filesystem POSIX: un crash a metà riga
 * lascia al più UNA riga corrotta, mai le precedenti.
 *
 * ⛔ Nessun fsync esplicito dopo ogni riga (differenza dichiarata dal
 * pattern "production-hardened" trovato in ricerca): a differenza di
 * un ledger finanziario, questo è uno strumento locale owner-only — la
 * finestra di perdita è quella del buffer del sistema operativo (tipicamente
 * pochi millisecondi), non l'intera sessione. Scelta esplicita, non
 * un taglio silenzioso.
 */
import { promises as fsp, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

export class SessionStoreError extends Error {
  constructor(message, code = 'SESSION_STORE_FAILED') {
    super(message);
    this.name = 'SessionStoreError';
    this.code = code;
  }
}

const ESTENSIONE = '.jsonl';

function percorsoDi(cartellaStore, sessionId) {
  // ⛔ sessionId è sempre un randomUUID() generato da questo stesso processo (mai testo esterno) — nessuna sanificazione di percorso richiesta, a differenza di un nome file scelto dal modello (vedi library-store.mjs, non portato qui).
  return join(cartellaStore, `${sessionId}${ESTENSIONE}`);
}

/**
 * Accoda UNA riga — mai una riscrittura del file intero (la classe di
 * bug di Hermes #8029). `record` è già serializzabile (un evento AG-UI,
 * o l'intestazione, o il record `messaggiFinali`) — questo modulo non
 * sa cosa contiene, solo che va in coda.
 */
export async function registraRiga({ cartellaStore, sessionId, record }, deps = {}) {
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const appendFileFn = deps.appendFileFn ?? fsp.appendFile;
  await mkdirFn(cartellaStore, { recursive: true });
  await appendFileFn(percorsoDi(cartellaStore, sessionId), `${JSON.stringify(record)}\n`, 'utf8');
}

/**
 * ⭐⭐⭐ FASE L, trovato dalla verifica DAL VIVO (30/8) — non ipotizzato: un
 * server VERO, una sessione VERA, uccisa (`child.kill()`, TerminateProcess
 * su Windows — un crash vero, nessun handler di spegnimento gira) **6 ms**
 * dopo aver ricevuto il sessionId dal client. `ripristina()` sul riavvio:
 * "114/115" — la sessione appena creata non c'era proprio, perché la SUA
 * riga di intestazione (`registraRiga`, fire-and-forget) non aveva ancora
 * toccato il disco quando il processo è morto. Non un dato corrotto: la
 * sessione non è mai esistita per `ripristina()`, un buco onesto ma
 * evitabile — un crash nella manciata di millisecondi dopo la creazione
 * perde l'intera sessione, in silenzio.
 *
 * ⛔ La cura NON è rendere `avvia()`/`avviaLibero()` asincrone (~110
 * call-site di test, l'intero contratto sincrono di `session-registry.mjs`
 * — sproporzionato per una finestra di pochi millisecondi, stessa strada
 * già scartata per lo stesso motivo in FASE E). La cura è che la SOLA
 * intestazione — una scrittura piccola, una volta per sessione, mai per
 * ogni evento — usi l'API fs SINCRONA: `avvia()` può restare sincrona e
 * il client non riceve MAI un sessionId la cui intestazione non sia già
 * durevole sul disco. Gli eventi/messaggiFinali successivi restano
 * fire-and-forget (`registraRiga` sopra, invariata) — quella finestra
 * resta (dichiarata nel commento di testa del modulo, "pochi
 * millisecondi... scelta esplicita"), ma non può più cancellare
 * l'ESISTENZA stessa della sessione.
 */
export function registraRigaSync({ cartellaStore, sessionId, record }, deps = {}) {
  const mkdirSyncFn = deps.mkdirSyncFn ?? mkdirSync;
  const appendFileSyncFn = deps.appendFileSyncFn ?? appendFileSync;
  mkdirSyncFn(cartellaStore, { recursive: true });
  appendFileSyncFn(percorsoDi(cartellaStore, sessionId), `${JSON.stringify(record)}\n`, 'utf8');
}

/**
 * Elenca gli id delle sessioni persistite — per la ricostruzione
 * all'avvio del server. Cartella assente ⇒ `[]`, mai un errore (un
 * primo avvio non ha ancora nessuna sessione salvata).
 */
export async function elencaSessioniPersistite({ cartellaStore }, deps = {}) {
  const readdirFn = deps.readdirFn ?? fsp.readdir;
  let voci;
  try {
    voci = await readdirFn(cartellaStore, { withFileTypes: true });
  } catch (errore) {
    if (errore?.code === 'ENOENT') return [];
    throw new SessionStoreError(`Impossibile leggere ${cartellaStore}: ${errore.message}`, 'SESSION_STORE_READ_FAILED');
  }
  return voci
    .filter((v) => v.isFile() && v.name.endsWith(ESTENSIONE))
    .map((v) => v.name.slice(0, -ESTENSIONE.length));
}

/**
 * Legge un registro per intero — una riga JSON per riga del file.
 * ⭐⭐⭐ L'ULTIMA riga, se non è JSON valido, viene SCARTATA in silenzio
 * (mai un errore che perde l'intero file): è esattamente il caso di
 * un crash a metà scrittura, l'unica corruzione che l'append-only
 * ammette per costruzione — "una riga rotta non invalida le
 * precedenti", verificato in ricerca, non presunto. Una riga NON
 * ultima malformata è invece un errore dichiarato: quello indica un
 * file danneggiato in un altro modo, non un crash a metà append.
 */
export async function leggiRegistro({ cartellaStore, sessionId }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  let testo;
  try {
    testo = await readFileFn(percorsoDi(cartellaStore, sessionId), 'utf8');
  } catch (errore) {
    if (errore?.code === 'ENOENT') return null;
    throw new SessionStoreError(`Impossibile leggere la sessione ${sessionId}: ${errore.message}`, 'SESSION_STORE_READ_FAILED');
  }
  const righe = testo.split('\n').filter((r) => r.trim() !== '');
  const record = [];
  for (let i = 0; i < righe.length; i++) {
    try {
      record.push(JSON.parse(righe[i]));
    } catch {
      if (i === righe.length - 1) break; // ultima riga, possibile crash a metà scrittura: scartata, non fatale
      throw new SessionStoreError(`La sessione ${sessionId} ha una riga corrotta (non l'ultima): il file non è un crash a metà append, è danneggiato altrove.`, 'SESSION_STORE_CORRUPT');
    }
  }
  return record;
}

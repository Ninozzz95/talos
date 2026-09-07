/**
 * session-store.mjs — FASE L (30/8), piano `elegant-spinning-dongarra.md`.
 * Owner: "ricerca web competitor" sulla domanda "un riavvio del
 * processo perde una sessione in corso, è mai successo per davvero?".
 *
 * ⛔⛔⛔ La ricerca ha RIDEFINITO la fase, non solo risposto alla domanda.
 * Verificato alla fonte (non presunto): `session-registry.mjs` dichiara
 * fin dalla sua prima riga "solo in memoria, deliberato... non ancora
 * aperto" — un riavvio del server perde OGNI sessione, non solo quelle
 * in corso, e non è mai stato diversamente (`.sessions/` su disco che
 * un piano precedente citava non esiste in questo file — verificato
 * con una ricerca diretta, zero riscontri).
 *
 * Cosa fa davvero lo stato dell'arte in questo spazio: transcript JSONL
 * append-only come fonte di verità per il replay
 * ("rollout files"), un indice separato (SQLite, solo per liste
 * veloci — non necessario alla scala di questo prodotto). ⭐⭐⭐ Onestamente
 * ammesso altrove: "if a transport failure occurs early enough...
 * no resumable artefacts may be written" — un ripristino a metà turno
 * non è mai garantito, nemmeno lì. Il ripristino VERO che si offre in
 * questi casi è
 * "rilettura della trascrizione", non "il modello riprende da dove
 * stava" — lo stesso confine onesto che questo modulo dichiara.
 *
 * ⛔ Trovato durante la ricerca, non ipotetico: riscrivere l'intero file
 * invece di solo accodare è una classe di bug nota (perdita di dati su
 * crash per una riscrittura non atomica della trascrizione) — la
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
  // ⛔ sessionId è sempre un randomUUID() generato da questo stesso processo (mai testo esterno) — nessuna sanificazione di percorso richiesta, a differenza di un nome file scelto dal modello (vedi library-store.mjs).
  return join(cartellaStore, `${sessionId}${ESTENSIONE}`);
}

/**
 * Accoda UNA riga — mai una riscrittura del file intero (la classe di
 * bug vista in ricerca, vedi la testa del file). `record` è già serializzabile (un evento AG-UI,
 * o l'intestazione, o il record `messaggiFinali`) — questo modulo non
 * sa cosa contiene, solo che va in coda.
 */
/*
 * ⭐⭐⭐ 04/9 — W0-07: UNA CODA PER FILE. `fsp.appendFile` non è atomica per
 * un record più grande di una singola scrittura di sistema: il contenuto
 * viene spezzato, e un secondo append concorrente sullo stesso file si
 * infila in mezzo. Il risultato è una riga JSONL illeggibile — cioè una
 * sessione che `ripristina()` scarta per sempre, in silenzio.
 *
 * ⛔ Non è teoria: nello store dell'owner il file `b7b1b7d2…` (31/08) aveva
 * 4 righe rotte, la prima spezzata a **1.572.866 byte, esattamente 1,5
 * MiB**, e le successive iniziavano a metà percorso pur finendo con
 * `_sequenza` coerenti. Erano `WorkspaceChanged` da 1-1,5 MB l'uno (il
 * workspace era `C:\` intero). Quella conversazione — vera, conclusa con
 * successo — è stata invisibile per quattro giorni; l'ho recuperata a mano
 * il 04/09 buttando solo le righe illeggibili.
 *
 * ⇒ Le scritture dello STESSO file si mettono in fila. File diversi non si
 * aspettano fra loro (la chiave della coda è il percorso), quindi una
 * sessione lenta non rallenta le altre. Un errore su una scrittura non
 * blocca la coda: la successiva parte comunque.
 *
 * ⭐ Ricerca web del 04/09 (obbligo dell'owner, fatta PRIMA di considerare
 * chiusa questa cura): `O_APPEND` è atomico **per singola chiamata di
 * scrittura** — due scrittori non si sovrappongono finché ogni record entra
 * in UNA chiamata; un payload grande viene però spezzato in più chiamate, ed
 * è lì che si intrecciano. La forma raccomandata è esattamente questa: «le
 * scritture concorrenti sullo stesso file si mettono in coda e si
 * serializzano con le Promise, mentre file diversi restano in parallelo».
 * Due cose che la ricerca aggiunge e che qui NON sono risolte, registrate
 * come debito nel ledger: (a) per un log si consiglia uno stream persistente
 * invece di aprire e chiudere il file a ogni evento; (b) una scrittura
 * riuscita vive nella cache del kernel finché non c'è un `fsync`, quindi un
 * crash può perdere gli ultimi eventi — l'invariante da tenere è non
 * trattare mai come record dei byte di coda non validati, e `ripristina()`
 * già distingue l'ultima riga spezzata (crash a metà append) da una riga
 * rotta in mezzo (danno vero).
 */
const codeDiScrittura = new Map();

export async function registraRiga({ cartellaStore, sessionId, record }, deps = {}) {
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const appendFileFn = deps.appendFileFn ?? fsp.appendFile;
  const percorso = percorsoDi(cartellaStore, sessionId);
  // ⛔ Serializzato SUBITO, non dentro la coda: `record` potrebbe cambiare mentre questa scrittura aspetta il suo turno.
  const riga = `${JSON.stringify(record)}\n`;
  const precedente = codeDiScrittura.get(percorso) ?? Promise.resolve();
  const corrente = precedente.catch(() => {}).then(async () => {
    await mkdirFn(cartellaStore, { recursive: true });
    await appendFileFn(percorso, riga, 'utf8');
  });
  codeDiScrittura.set(percorso, corrente);
  // La mappa non deve crescere per sempre: chi è l'ultimo della fila la ripulisce.
  corrente.catch(() => {}).finally(() => {
    if (codeDiScrittura.get(percorso) === corrente) codeDiScrittura.delete(percorso);
  });
  return corrente;
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
 * ⭐⭐⭐ 30/8, QA visiva (Task 14) — trovato dal vivo: nessun modo di
 * eliminare una sessione, né qui né lato client. 144+ sessioni
 * accumulate in un solo giro di QA senza possibilità di pulizia.
 * Rimuove il file persistito — `ENOENT` è un esito onesto (già
 * cancellato, o mai persistito perché senza `cartellaStore`), non un
 * errore: stesso principio di `leggiRegistro` sopra.
 */
export async function eliminaSessionePersistita({ cartellaStore, sessionId }, deps = {}) {
  const unlinkFn = deps.unlinkFn ?? fsp.unlink;
  try {
    await unlinkFn(percorsoDi(cartellaStore, sessionId));
  } catch (errore) {
    if (errore?.code === 'ENOENT') return;
    throw new SessionStoreError(`Impossibile eliminare la sessione ${sessionId}: ${errore.message}`, 'SESSION_STORE_DELETE_FAILED');
  }
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

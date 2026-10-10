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
import { randomUUID } from 'node:crypto';
import { promises as fsp, constants as fsConstants, createReadStream, createWriteStream, mkdirSync, appendFileSync, closeSync, existsSync, linkSync, openSync, readFileSync, readSync, statSync, truncateSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as attendiMs } from 'node:timers/promises';

import { creaAffittiArchivio, fraseDetentore } from './session-lease.mjs';

export class SessionStoreError extends Error {
  constructor(message, code = 'SESSION_STORE_FAILED', dettaglio = null) {
    super(message);
    this.name = 'SessionStoreError';
    this.code = code;
    if (dettaglio?.chiave) { this.chiave = dettaglio.chiave; if (dettaglio.params) this.params = dettaglio.params; }
  }
}

const ESTENSIONE = '.jsonl';

function percorsoDi(cartellaStore, sessionId) {
  // ⛔ sessionId è sempre un randomUUID() generato da questo stesso processo (mai testo esterno) — nessuna sanificazione di percorso richiesta, a differenza di un nome file scelto dal modello (vedi library-store.mjs).
  return join(cartellaStore, `${sessionId}${ESTENSIONE}`);
}

/*
 * ⭐⭐⭐ 10/10/2026 — L'AFFITTO FRA PROCESSI (owner 09/10: «Affitto come Hermes»; il perché e Hermes letto nel codice stanno in
 *   `session-lease.mjs`). Uno per archivio e per processo: lo accende chi apre l'archivio da server vero (`attivaAffittiArchivio`,
 *   dal registro con `affittoFraProcessi`); senza, ogni funzione qui sotto si comporta come prima (i test con cartelle
 *   temporanee non lo vedono). Con l'affitto acceso:
 *   · ogni SCRITTURA in un giornale prende l'affitto della sua sessione: tenuto da un altro processo vivo ⇒ `SESSION_LEASED`
 *     (frase inglese che dice chi: etichetta, pid, da quando — CLI 10/10); giornale cambiato da quando questo processo l'ha
 *     letto ⇒ `SESSION_CHANGED_ELSEWHERE`, finché il registro non lo rilegge (owner 10/10: «Ricaricarla da sola»);
 *   · la RIPARAZIONE della coda si fa solo con l'affitto in mano: una coda a metà di un altro processo vivo è la sua scrittura in
 *     corso, non un crash, e non si tocca (né si «avvelena» il percorso: le scritture le ferma già l'affitto).
 *   ⛔ Se il meccanismo stesso fallisce (cartella illeggibile, errore inatteso) la SCRITTURA passa, come Hermes
 *     (`cli.py:933-935`: «Failed to claim active session slot» → `return True`): la chat non si blocca per l'affitto. La
 *     RIPARAZIONE invece no: senza affitto non si ripara mai.
 */
const affittiPerArchivio = new Map();
let uscitaAffittiRegistrata = false;

export function attivaAffittiArchivio(cartellaStore, opzioni = {}) {
  const chiave = resolve(cartellaStore);
  const esistente = affittiPerArchivio.get(chiave);
  if (esistente) return esistente;
  const affitti = creaAffittiArchivio({ ...opzioni, cartellaStore, percorsoGiornale: (sessionId) => percorsoDi(cartellaStore, sessionId) });
  // con scritture in coda l'affitto non si rilascia: la coda è attività di questo processo
  affitti.aggiungiInUso((sessionId) => codeDiScrittura.has(percorsoDi(cartellaStore, sessionId)));
  affittiPerArchivio.set(chiave, affitti);
  if (!uscitaAffittiRegistrata) {
    uscitaAffittiRegistrata = true;
    process.once('exit', () => { for (const a of affittiPerArchivio.values()) { try { a.chiudi(); } catch { /* si esce comunque */ } } });
  }
  return affitti;
}

export function affittiDellArchivio(cartellaStore) {
  if (typeof cartellaStore !== 'string' || !cartellaStore) return null;
  return affittiPerArchivio.get(resolve(cartellaStore)) ?? null;
}

/** Spegne l'affitto di un archivio (rilascia tutto). Per i test e per chi chiude l'archivio. */
export function disattivaAffittiArchivio(cartellaStore) {
  const chiave = resolve(cartellaStore);
  const affitti = affittiPerArchivio.get(chiave);
  if (!affitti) return false;
  affittiPerArchivio.delete(chiave);
  affitti.chiudi();
  return true;
}

function erroreAffittata(sessionId, detentore) {
  const pubblico = { pid: detentore?.pid ?? null, etichetta: detentore?.etichetta ?? null, presoIl: detentore?.presoIl ?? null };
  const errore = new SessionStoreError(fraseDetentore(sessionId, detentore), 'SESSION_LEASED', { chiave: 'server.sessionStore.leased', params: { sessionId, ...pubblico } });
  errore.detentore = pubblico;
  return errore;
}

function garantisciAffittoPerScrittura(cartellaStore, sessionId) {
  const affitti = affittiDellArchivio(cartellaStore);
  if (!affitti) return;
  let esito;
  try { esito = affitti.prendi(sessionId); }
  catch { return; } // come Hermes: il meccanismo che fallisce non blocca la scrittura (vedi sopra)
  if (!esito.preso) throw erroreAffittata(sessionId, esito.detentore);
  if (affitti.daRicaricare(sessionId)) {
    throw new SessionStoreError(`Session ${sessionId} was changed by another TALOS process since it was loaded here: it must be reloaded before writing.`, 'SESSION_CHANGED_ELSEWHERE', { chiave: 'server.sessionStore.changedElsewhere', params: { sessionId } });
  }
  affitti.tocca(sessionId);
}

/* Riparare: SOLO con l'affitto in mano (mai «come Hermes» qui: la riparazione riscrive il giornale). */
function puoRiparare(cartellaStore, sessionId) {
  const affitti = affittiDellArchivio(cartellaStore);
  if (!affitti) return true;
  try { return affitti.prendi(sessionId).preso === true; }
  catch { return false; }
}

/*
 * Politica di taglio di `naviga` (owner 01/10/2026, «Come Hermes» + «per sessione, come Claude Code»): le pagine web
 * tagliate si salvano intere qui, una cartella per sessione, e se ne vanno con lei (`eliminaSessionePersistita`).
 * Claude Code fa lo stesso con `<progetto>/<sessione>/tool-results/`. ⛔ Una SOTTOcartella del negozio, non un file
 * accanto ai journal: `elencaSessioniPersistite` guarda solo i FILE `.jsonl`, e una cartella non diventa mai una sessione.
 */
export function cartellaPagineWebDi(cartellaStore, sessionId) {
  return join(cartellaStore, 'pagine-web', sessionId);
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
const percorsiConCodaIncerta = new Set();

/*
 * ⭐⭐⭐ 24/09/2026 — F2, il WRITER SINCRONO E LA CODA (J3, i due RED di Codex `CTX-STORE-SYNC-LEAPFROGS-QUEUED`
 * e `CTX-STORE-SYNC-DURING-PARTIAL-ASYNC`, 0/2 sulla base `e2eb2a5ce`). `registraRigaSync` guardava solo
 * l'ultimo byte del file, mai `codeDiScrittura`: scavalcava un append asincrono già prenotato (le righe
 * finivano invertite) e, se lo trovava a metà, AVVELENAVA il percorso per tutta la vita del processo (J1).
 *
 * ⛔ Perché una POLITICA e non una guardia fissa: il ledger Codex (`docs/CTX-JOURNAL-SINGLE-WRITER-2026-09-23.md`)
 *   aveva misurato una guardia BUSY isolata sul sync incompatibile coi chiamanti del registro (390 test): 5
 *   `registraRigaSyncFn` + 9 `durableSync` in `session-registry.mjs` non sanno gestire un rifiuto. L'onda 1
 *   va sul 4174 PRIMA che l'onda 2 migri quei chiamanti ⇒ il default resta `'scavalca'` (il comportamento di
 *   oggi, riga per riga) e il writer unico si chiede: `impostaPoliticaScritturaSync('busy')` — oppure
 *   `TALOS_SESSION_STORE_SYNC=busy` nell'ambiente, che serve all'onda 2 per CONTARE i chiamanti che cadono
 *   senza toccare il registro. Con `'busy'` un sync che trova una coda in volo lancia `SESSION_STORE_BUSY`
 *   PRIMA di toccare il disco e senza avvelenare niente: la coda è viva, non incerta.
 * ⭐ Forma vista nei concorrenti (letti nel codice, 24/09/2026): Claude Code scrive il trascritto JSONL da un
 *   solo processo per sessione e dichiara che «If you resume the same session in two terminals without
 *   forking, messages from both interleave into one transcript» (doc «Manage sessions») — il writer unico è
 *   una disciplina del chiamante, non del formato; Hermes tiene la verità in SQLite («many reader threads,
 *   one writer», `hermes_state.py`) e ricade su un JSONL in append (`hermes_state.py:421-436`) solo se il
 *   database sparisce sotto un processo vivo.
 */
const POLITICHE_SYNC = new Set(['scavalca', 'busy']);
let politicaSync = process.env.TALOS_SESSION_STORE_SYNC === 'busy' ? 'busy' : 'scavalca';

/** Imposta la politica del writer sincrono ('scavalca' | 'busy'); ritorna quella precedente. */
export function impostaPoliticaScritturaSync(politica) {
  if (!POLITICHE_SYNC.has(politica)) {
    throw new SessionStoreError(`Unknown synchronous writer policy: ${String(politica)} (allowed: scavalca, busy).`, 'SESSION_STORE_BAD_POLICY');
  }
  const precedente = politicaSync;
  politicaSync = politica;
  return precedente;
}

export function politicaScritturaSync() {
  return politicaSync;
}

function rifiutaSeCodaInVolo(percorso) {
  if (politicaSync === 'busy' && codeDiScrittura.has(percorso)) {
    throw new SessionStoreError("The journal has a write in progress: synchronous writing was rejected; try again when the queue is empty.", 'SESSION_STORE_BUSY');
  }
}

/*
 * ⭐⭐⭐ 24/09/2026 — F2, TRANSITORIO ≠ AVVELENATO. Prima, QUALUNQUE errore dell'append aggiungeva il percorso a
 * `percorsiConCodaIncerta`: un EBUSY/EPERM dell'antivirus o di un lettore concorrente (Windows Defender
 * «opens files as they're written… the target may still be held open by the scanner», npm/write-file-atomic#227;
 * graceful-fs ritenta EACCES/EPERM/EBUSY) bloccava la sessione per sempre, con ZERO byte scritti.
 * ⇒ Il discriminante non è il codice: è la DIMENSIONE del file prima/dopo. Se non è cambiata, il file è
 *   intatto e l'errore si propaga senza avvelenare; se è cambiata (append parziale), o non si può misurare,
 *   la coda è incerta come prima. I codici transitori restano annotati sull'errore (`transitorio: true`) per
 *   chi vuole ritentare.
 */
const CODICI_TRANSITORI = new Set(['EBUSY', 'EPERM', 'EAGAIN', 'EACCES', 'EMFILE', 'ENFILE']);

function avvelenaSeIlFileECambiato(percorso, dimensionePrima, errore) {
  let dopo;
  try { dopo = dimensioneOZero(percorso); }
  catch { percorsiConCodaIncerta.add(percorso); return; }
  if (dopo !== dimensionePrima) { percorsiConCodaIncerta.add(percorso); return; }
  if (errore && typeof errore === 'object' && CODICI_TRANSITORI.has(errore.code)) errore.transitorio = true;
}

function erroreCodaIncerta() {
  return new SessionStoreError("The journal queue cannot be verified: stop writing and check the journal before trying again.", 'SESSION_STORE_AMBIGUOUS');
}

function rifiutaCodaIncerta(percorso) {
  if (percorsiConCodaIncerta.has(percorso)) throw erroreCodaIncerta();
}

function dimensioneOZero(percorso) {
  try { return statSync(percorso).size; }
  catch (errore) { if (errore?.code === 'ENOENT') return 0; throw errore; }
}

function leggiByteDa(percorso, posizione, lunghezza) {
  const bytes = Buffer.alloc(lunghezza);
  const fd = openSync(percorso, 'r');
  try {
    let letti = 0;
    while (letti < lunghezza) {
      const n = readSync(fd, bytes, letti, lunghezza - letti, posizione + letti);
      if (n === 0) throw erroreCodaIncerta();
      letti += n;
    }
    return bytes;
  } finally {
    closeSync(fd);
  }
}

function verificaCodaAppendibile(percorso) {
  rifiutaCodaIncerta(percorso);
  const dimensione = dimensioneOZero(percorso);
  if (dimensione === 0) return;
  let ultimoByte;
  try { ultimoByte = leggiByteDa(percorso, dimensione - 1, 1)[0]; }
  catch (errore) {
    if (errore?.code === 'SESSION_STORE_AMBIGUOUS') percorsiConCodaIncerta.add(percorso);
    throw errore;
  }
  if (ultimoByte !== 10) {
    percorsiConCodaIncerta.add(percorso);
    throw erroreCodaIncerta();
  }
}

export async function registraRiga({ cartellaStore, sessionId, record, durable = false }, deps = {}) {
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const appendFileFn = deps.appendFileFn ?? fsp.appendFile;
  const percorso = percorsoDi(cartellaStore, sessionId);
  // ⛔ Serializzato SUBITO, non dentro la coda: `record` potrebbe cambiare mentre questa scrittura aspetta il suo turno.
  const riga = `${JSON.stringify(record)}\n`;
  const precedente = codeDiScrittura.get(percorso) ?? Promise.resolve();
  const corrente = precedente.catch(() => {}).then(async () => {
    garantisciAffittoPerScrittura(cartellaStore, sessionId);
    await mkdirFn(cartellaStore, { recursive: true });
    verificaCodaAppendibile(percorso);
    const prima = dimensioneOZero(percorso);
    try {
      await appendFileFn(percorso, riga, durable ? { encoding: 'utf8', flush: true } : 'utf8');
    } catch (errore) {
      avvelenaSeIlFileECambiato(percorso, prima, errore); // 24/09/2026: zero byte scritti ⇒ nessun veleno
      throw errore;
    }
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
  const percorso = percorsoDi(cartellaStore, sessionId);
  // 24/09/2026 — con politica 'busy' una coda in volo è un rifiuto pulito, PRIMA di guardare il disco
  // (l'ultimo byte di un append a metà non dice niente sulla coda: dice solo che è a metà).
  rifiutaSeCodaInVolo(percorso);
  garantisciAffittoPerScrittura(cartellaStore, sessionId);
  mkdirSyncFn(cartellaStore, { recursive: true });
  verificaCodaAppendibile(percorso);
  const prima = dimensioneOZero(percorso);
  try {
    appendFileSyncFn(percorso, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (errore) {
    avvelenaSeIlFileECambiato(percorso, prima, errore); // 24/09/2026: zero byte scritti ⇒ nessun veleno
    throw errore;
  }
}

/*
 * ⭐⭐⭐ 24/09/2026 — F2, IL FLUSH DEL NEGOZIO. `codeDiScrittura` era privata e nessuno poteva aspettarla:
 * lo shutdown del server (`server.mjs`) non svuotava la coda, `aggiorna-4174.ps1` uccideva con `-Force`, e
 * `tests/temp-nessun-residuo.test.mjs` tollerava 2 cartelle «rinate» per il registro proprio per questo.
 * ⭐ Forma dei concorrenti (letta nel codice, 24/09/2026): Hermes allo spegnimento SVUOTA ciò che ha in
 *   sospeso su disco (`gateway/shutdown_flush.py:81-91` `flush_pending_to_file`, `os.fsync` della cartella
 *   alla `:55-62`) e lo rigioca al riavvio (`recover_pending_to_db`, `:209`); Claude Code «saves continuously
 *   to local transcript files» (doc «Manage sessions»). Qui la coda è in memoria: il flush aspetta che si
 *   svuoti, e RIPETE, perché una scrittura può accodarne un'altra dentro la propria continuazione.
 * ⛔ Tetto di giri dichiarato: una sessione che continua a scrivere non si svuota mai; oltre `giriMassimi`
 *   l'errore lo dice (`SESSION_STORE_FLUSH_EXHAUSTED`) invece di appendere lo shutdown per sempre. Il
 *   «fence» (smettere di accettare scritture nuove) è del chiamante — onda 2, `chiudi()` del registro.
 */
const GIRI_MASSIMI_FLUSH = 1000;

function percorsoSottoCartella(percorso, cartella) {
  const radice = resolve(cartella);
  const p = resolve(percorso);
  return p === radice || p.startsWith(radice.endsWith(sep) ? radice : radice + sep);
}

/**
 * Attende che le scritture in coda si svuotino: tutte, quelle di una cartella, o quelle di una sessione.
 * Ritorna `{ giri, scrittureAttese, percorsi }`; lancia `SESSION_STORE_FLUSH_EXHAUSTED` se dopo
 * `giriMassimi` giri la coda non è ancora vuota. Non fallisce mai per una scrittura fallita (allSettled):
 * chi ha accodato ha già il suo errore.
 */
export async function attendiScritture({ cartellaStore, sessionId, giriMassimi = GIRI_MASSIMI_FLUSH } = {}) {
  const bersaglio = cartellaStore && sessionId ? resolve(percorsoDi(cartellaStore, sessionId)) : null;
  const inAmbito = (percorso) => {
    if (bersaglio) return resolve(percorso) === bersaglio;
    if (cartellaStore) return percorsoSottoCartella(percorso, cartellaStore);
    return true;
  };
  const percorsi = new Set();
  let giri = 0;
  let scrittureAttese = 0;
  for (;;) {
    const fotografia = [...codeDiScrittura.entries()].filter(([percorso]) => inAmbito(percorso));
    if (fotografia.length === 0) return { giri, scrittureAttese, percorsi: [...percorsi] };
    giri += 1;
    if (giri > giriMassimi) {
      throw new SessionStoreError(`The session store did not drain after ${giriMassimi} waiting cycles: ${fotografia.length} write(s) still queued (${fotografia.map(([p]) => p).join(', ')}).`, 'SESSION_STORE_FLUSH_EXHAUSTED');
    }
    for (const [percorso] of fotografia) percorsi.add(percorso);
    scrittureAttese += fotografia.length;
    await Promise.allSettled(fotografia.map(([, promessa]) => promessa));
    // La pulizia della mappa (`finally` di chi ha accodato) corre nei microtask successivi al settle:
    // un giro dell'event loop lascia anche entrare le scritture accodate dalle continuazioni.
    await new Promise((r) => setImmediate(r));
  }
}

/*
 * ⭐⭐⭐ 23/09/2026 — EXFAT, decisione owner «ripiego sicuro» (sostituisce il «rifiuto» del ledger
 * `docs/CTX-JOURNAL-SINGLE-WRITER-2026-09-23.md:39`). Ricerca 10×4 del 23/09/2026 in
 * `scratchpad/RICERCA-10x4-EXFAT-SESSIONI.md`, fonti primarie lette quel giorno:
 * - `CreateHardLinkW` «only supported on the NTFS file system», ReFS «No» (Microsoft Learn,
 *   aggiornato 01/07/2025): su exFAT/FAT32 e su ReFS/Dev Drive NESSUNA sessione poteva nascere;
 * - su exFAT `fs.link` fallisce con **EISDIR** su un file regolare (libuv traduce
 *   ERROR_INVALID_FUNCTION; nodejs/node#65817, 05/09/2026) — Netcatty PR #3484 (22/09/2026) ricade
 *   su EISDIR/EPERM/EACCES/EXDEV/ENOTSUP/ENOSYS;
 * - Node non dice il tipo di file system su Windows (`statfsSync().type === 0`, misurato): la
 *   capacità si PROVA, non si legge. La prova è il primo link vero, sul file di staging, nella
 *   cartella dell'archivio; l'esito si memorizza per cartella (forma di Hermes
 *   `hermes_state_wal.py:255-265`: prova la modalità forte, ricadi, dillo UNA volta);
 * - il ripiego è `writeFileSync(finale, …, { flag: 'wx', flush: true })`: 'wx' = O_CREAT|O_EXCL =
 *   `CREATE_NEW` su Windows, «fails if the path exists» (doc Node v24 fs, letta il 23/09/2026 via
 *   ctx7 `/websites/nodejs_latest-v24_x_api`); `flush: true` = `fsyncSync` dopo la scrittura.
 *   ⛔ MAI `rename`: libuv lo chiama con MOVEFILE_REPLACE_EXISTING e sovrascrive (misurato);
 * - ⛔ su exFAT l'identità `dev`+`ino` non regge (openclaw/fs-safe PR #235: 42 rename su 48
 *   cambiano identità): nel ripiego la conferma è sui BYTE riletti, mai sull'identità.
 * ⛔ Promessa abbassata e dichiarata: exFAT non ha giornale (TexFAT è solo Windows CE, spec
 *   Microsoft), quindi un crash a metà scrittura può lasciare un finale vuoto o una riga spezzata.
 *   Il replay li tratta già come «vuota» (l'ultima riga non valida non è mai un record, sopra).
 * ⛔ Un EPERM/EACCES transitorio (antivirus) su NTFS porta la cartella nel ripiego per la vita del
 *   processo: direzione sicura (niente sovrascrittura, byte verificati), promessa sul crash più debole.
 */
const CODICI_LINK_NON_SUPPORTATO = new Set(['EISDIR', 'EPERM', 'EACCES', 'EXDEV', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EINVAL']);
const modalitaPerCartella = new Map();

/** 'link' | 'senza-link' | null (non ancora provata in questo processo). Per il Doctor. */
export function modalitaPubblicazioneIntestazione(cartellaStore) {
  return modalitaPerCartella.get(resolve(cartellaStore)) ?? null;
}

function causaDa(codice) {
  if (codice === 'ENOSPC' || codice === 'EDQUOT') return 'spazio';
  if (codice === 'EROFS') return 'sola-lettura';
  if (codice === 'EACCES' || codice === 'EPERM') return 'permessi';
  if (['ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EISDIR', 'EINVAL'].includes(codice)) return 'non-supportato';
  return 'io';
}

const TESTO_CAUSA = Object.freeze({
  spazio: "the session folder disk is full",
  'sola-lettura': "the session folder disk is read-only",
  permessi: "the system denied file creation in the session folder",
  'non-supportato': "the session folder file system supports neither links nor exclusive file creation",
  io: "the session folder disk returned a read or write error",
  'verifica-byte': "the disk did not return the bytes just written",
});

function erroreConCausa(causa, codiceOriginale, testo = TESTO_CAUSA[causa]) {
  const code = causa === 'non-supportato' ? 'SESSION_STORE_FS_UNSUPPORTED' : 'SESSION_STORE_HEADER_FAILED';
  const errore = new SessionStoreError(`Session not started: ${testo}${codiceOriginale ? ` (${codiceOriginale})` : ''}.`, code);
  errore.causa = causa;
  if (codiceOriginale) errore.codiceOriginale = codiceOriginale;
  return errore;
}

/** Pubblica la sola intestazione nuova senza rendere visibile un prefisso parziale al replay. */
export function registraIntestazioneSync({ cartellaStore, sessionId, record }, deps = {}) {
  const mkdirSyncFn = deps.mkdirSyncFn ?? mkdirSync;
  const writeFileSyncFn = deps.writeFileSyncFn ?? writeFileSync;
  const linkSyncFn = deps.linkSyncFn ?? linkSync;
  const unlinkSyncFn = deps.unlinkSyncFn ?? unlinkSync;
  const existsSyncFn = deps.existsSyncFn ?? existsSync;
  const readFileSyncFn = deps.readFileSyncFn ?? readFileSync;
  const statSyncFn = deps.statSyncFn ?? statSync;
  const logger = deps.logger ?? console;
  const chiaveCartella = resolve(cartellaStore);
  const finale = percorsoDi(cartellaStore, sessionId);
  const staging = join(cartellaStore, `.${sessionId}.${randomUUID()}.pending`);
  const attesi = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
  garantisciAffittoPerScrittura(cartellaStore, sessionId);
  let conservaStaging = false;
  let stagingRimosso = false;

  /*
   * Il finale del ripiego è NOSTRO solo se l'abbiamo creato con 'wx' (CREATE_NEW): nessun altro
   * può averlo creato dopo. Se non si riesce a toglierlo, un marcatore `.quarantena` lo esclude
   * dal replay (l'identità `ino` qui non vale, vedi sopra).
   */
  function togliFinaleNostroOIsolalo() {
    let rimosso = false;
    try { unlinkSyncFn(finale); rimosso = true; }
    catch {
      try { statSyncFn(finale); } catch (verifica) { if (verifica?.code === 'ENOENT') rimosso = true; }
    }
    if (rimosso) return;
    percorsiConCodaIncerta.add(finale);
    try { writeFileSyncFn(join(cartellaStore, `.${sessionId}.${randomUUID()}.quarantena`), '', { flag: 'wx', flush: true }); }
    catch { /* il disco rifiuta anche il marcatore: resta il blocco in memoria sugli append */ }
  }

  function pubblicaSenzaLink() {
    try { writeFileSyncFn(finale, attesi, { flag: 'wx', flush: true }); }
    catch (errore) {
      if (errore?.code === 'EEXIST') {
        throw new SessionStoreError("The session already has a persisted journal.", 'SESSION_STORE_HEADER_EXISTS');
      }
      // Creato e poi scrittura fallita: ciò che c'è è un prefisso NOSTRO. Byte diversi dal
      // prefisso = non nostro (mai toccato); illeggibile = incerto, quindi isolato.
      let presenti = null;
      let incerto = false;
      try { presenti = readFileSyncFn(finale); }
      catch (lettura) { if (lettura?.code !== 'ENOENT') incerto = true; }
      if (incerto || (presenti && presenti.length <= attesi.length && presenti.equals(attesi.subarray(0, presenti.length)))) {
        togliFinaleNostroOIsolalo();
      }
      throw erroreConCausa(causaDa(errore?.code), errore?.code);
    }
    let riletti = null;
    try { riletti = readFileSyncFn(finale); } catch { riletti = null; }
    if (riletti && riletti.equals(attesi)) return;
    togliFinaleNostroOIsolalo();
    throw erroreConCausa('verifica-byte', null, riletti
      ? "the session file bytes read back do not match the bytes written"
      : "the session file bytes could not be read back");
  }

  function annunciaSenzaLink(codice) {
    if (modalitaPerCartella.get(chiaveCartella) === 'senza-link') return;
    modalitaPerCartella.set(chiaveCartella, 'senza-link');
    try {
      logger?.warn?.(`[session-store] the session folder is on a file system without links (${codice}): `
        + "new sessions are published through exclusive creation and byte readback; a crash midway through writing may leave an empty file, discarded during restore.");
    } catch { /* un logger guasto non cambia l'esito */ }
  }

  function statoFinale() {
    try {
      const origine = statSyncFn(staging, { bigint: true });
      let pubblicato;
      try { pubblicato = statSyncFn(finale, { bigint: true }); }
      catch (errore) { return errore?.code === 'ENOENT' ? 'assente' : 'ignoto'; }
      if (!origine.isFile() || !pubblicato.isFile() || origine.ino === 0n) return 'ignoto';
      return origine.dev === pubblicato.dev && origine.ino === pubblicato.ino ? 'proprio' : 'estraneo';
    } catch { return 'ignoto'; }
  }

  function finaleCompletoEProprio() {
    try {
      if (statoFinale() !== 'proprio') return false;
      if (statSyncFn(finale, { bigint: true }).size !== BigInt(attesi.length)) return false;
      return readFileSyncFn(finale).equals(attesi);
    } catch { return false; }
  }

  function annullaPubblicazioneSePropria() {
    if (statoFinale() === 'proprio') {
      try { unlinkSyncFn(finale); } catch { /* verificare lo stato reale sotto */ }
    }
    const stato = statoFinale();
    if (stato === 'proprio' || stato === 'ignoto') conservaStaging = true;
  }

  mkdirSyncFn(cartellaStore, { recursive: true });
  if (existsSyncFn(finale)) {
    throw new SessionStoreError("The session already has a persisted journal.", 'SESSION_STORE_HEADER_EXISTS');
  }
  // Cartella già provata senza collegamenti: niente staging, niente alias `.pending`.
  if (modalitaPerCartella.get(chiaveCartella) === 'senza-link') return pubblicaSenzaLink();
  let ripiega = false;
  try {
    writeFileSyncFn(staging, attesi, { flag: 'wx', flush: true });
    if (!readFileSyncFn(staging).equals(attesi)) {
      throw new SessionStoreError("The header write cannot be verified.", 'SESSION_STORE_HEADER_FAILED');
    }
    let erroreLink = null;
    try { linkSyncFn(staging, finale); }
    catch (errore) { erroreLink = errore; }
    // La prova del link: fallito con un codice «non supportato» e nessun finale creato ⇒ il file
    // system non ha i collegamenti. Lo staging (senza alias) deve sparire PRIMA del ripiego: una
    // sua copia della testata accanto al finale non sarebbe distinguibile per `ino` su exFAT.
    if (erroreLink && CODICI_LINK_NON_SUPPORTATO.has(erroreLink.code) && statoFinale() === 'assente') {
      try { unlinkSyncFn(staging); stagingRimosso = true; }
      catch {
        try { statSyncFn(staging); } catch (verifica) { if (verifica?.code === 'ENOENT') stagingRimosso = true; }
      }
      if (!stagingRimosso) {
        conservaStaging = true; // residuo di diagnosi senza journal, escluso dal replay
        throw erroreConCausa('io', erroreLink.code, 'the temporary file of the link test was not deleted');
      }
      annunciaSenzaLink(erroreLink.code);
      ripiega = true;
    } else {
      // Anche se linkSync lancia DOPO avere creato il nome, solo byte completi
      // e la stessa identità NTFS sono una conferma. Altrimenti il pending
      // conserva la quarantena finché il finale proprio non è eliminato.
      if (!finaleCompletoEProprio()) {
        annullaPubblicazioneSePropria();
        throw erroreLink ?? new SessionStoreError("The header publication cannot be verified.", 'SESSION_STORE_HEADER_FAILED');
      }
      // Un .pending rimasto sarebbe un secondo hard link alla conversazione:
      // deve sparire PRIMA di avviare il modello o confermare la sessione.
      try { unlinkSyncFn(staging); }
      catch (errore) {
        try { statSyncFn(staging, { bigint: true }); }
        catch (verifica) { if (verifica?.code === 'ENOENT') stagingRimosso = true; }
        if (!stagingRimosso) {
          annullaPubblicazioneSePropria();
          throw new SessionStoreError("The temporary link was not removed.", 'SESSION_STORE_HEADER_FAILED');
        }
      }
      stagingRimosso = true;
      if (!modalitaPerCartella.has(chiaveCartella)) modalitaPerCartella.set(chiaveCartella, 'link');
    }
  } finally {
    if (!conservaStaging && !stagingRimosso) {
      try { unlinkSyncFn(staging); }
      catch { /* senza finale proprio, residuo di diagnosi escluso dal replay */ }
    }
  }
  if (ripiega) pubblicaSenzaLink();
}

/**
 * Accoda una riga manuale sullo stesso serializzatore degli eventi. Il ritorno
 * conferma i byte effettivi, anche se la primitiva ha lanciato dopo l'append.
 * Una coda diversa dal solo prefisso atteso non viene mai troncata.
 */
export function registraRigaConfermata({ cartellaStore, sessionId, record, puoAccodareFn, confermaFn }, deps = {}) {
  const percorso = percorsoDi(cartellaStore, sessionId);
  const bytesAttesi = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
  const appendFileSyncFn = deps.appendFileSyncFn ?? appendFileSync;
  const truncateSyncFn = deps.truncateSyncFn ?? truncateSync;
  const precedente = codeDiScrittura.get(percorso) ?? Promise.resolve();
  const corrente = precedente.catch(() => {}).then(() => {
    garantisciAffittoPerScrittura(cartellaStore, sessionId);
    rifiutaCodaIncerta(percorso);
    if (typeof puoAccodareFn === 'function' && !puoAccodareFn()) {
      throw new SessionStoreError("The state changed before the record was written.", 'SESSION_STORE_PRECONDITION_FAILED');
    }
    mkdirSync(cartellaStore, { recursive: true });
    let prima;
    try {
      verificaCodaAppendibile(percorso);
      prima = dimensioneOZero(percorso);
    } catch (errore) {
      percorsiConCodaIncerta.add(percorso);
      throw errore?.code === 'SESSION_STORE_AMBIGUOUS' ? errore : erroreCodaIncerta();
    }
    let erroreScrittura = null;
    try { appendFileSyncFn(percorso, bytesAttesi, { flush: true }); }
    catch (errore) { erroreScrittura = errore; }
    try {
      const delta = dimensioneOZero(percorso) - prima;
      if (delta < 0 || delta > bytesAttesi.length) throw erroreCodaIncerta();
      const coda = delta ? leggiByteDa(percorso, prima, delta) : Buffer.alloc(0);
      if (delta === bytesAttesi.length && coda.equals(bytesAttesi)) {
        if (typeof confermaFn === 'function') {
          try { confermaFn(); }
          catch { throw erroreCodaIncerta(); }
        }
        return;
      }
      if (delta === 0) {
        if (erroreScrittura) throw erroreScrittura;
        throw erroreCodaIncerta();
      }
      if (delta < bytesAttesi.length && coda.equals(bytesAttesi.subarray(0, delta))) {
        truncateSyncFn(percorso, prima);
        if (dimensioneOZero(percorso) !== prima) throw erroreCodaIncerta();
        if (erroreScrittura) throw erroreScrittura;
        throw new SessionStoreError("The write was partial; the prefix was removed.", 'SESSION_STORE_WRITE_FAILED');
      }
      throw erroreCodaIncerta();
    } catch (errore) {
      if (errore === erroreScrittura) throw errore;
      if (errore?.code === 'SESSION_STORE_WRITE_FAILED') throw errore;
      percorsiConCodaIncerta.add(percorso);
      throw errore?.code === 'SESSION_STORE_AMBIGUOUS' ? errore : erroreCodaIncerta();
    }
  });
  codeDiScrittura.set(percorso, corrente);
  corrente.catch(() => {}).finally(() => {
    if (codeDiScrittura.get(percorso) === corrente) codeDiScrittura.delete(percorso);
  });
  return corrente;
}

/**
 * Elenca gli id delle sessioni persistite — per la ricostruzione
 * all'avvio del server. Cartella assente ⇒ `[]`, mai un errore (un
 * primo avvio non ha ancora nessuna sessione salvata).
 */
export async function elencaSessioniPersistite({ cartellaStore, conDiagnostica = false }, deps = {}) {
  const readdirFn = deps.readdirFn ?? fsp.readdir;
  const statFn = deps.statFn ?? fsp.stat;
  let voci;
  try {
    voci = await readdirFn(cartellaStore, { withFileTypes: true });
  } catch (errore) {
    if (errore?.code === 'ENOENT') return conDiagnostica ? { sessionIds: [], quarantined: [] } : [];
    throw new SessionStoreError(`Cannot read ${cartellaStore}: ${errore.message}`, 'SESSION_STORE_READ_FAILED');
  }
  const sessionIdsTutti = voci.filter((v) => v.isFile() && v.name.endsWith(ESTENSIONE))
    .map((v) => v.name.slice(0, -ESTENSIONE.length));
  const sessionIdsSet = new Set(sessionIdsTutti);
  const candidati = [];
  const pendingSenzaJournal = new Set();
  const nomePending = /^\.(.+)\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.pending$/iu;
  // 23/09/2026, EXFAT: marcatore del ripiego senza link (`registraIntestazioneSync`), scritto solo
  // quando un finale non verificato non si è potuto togliere. Senza identità affidabile vale il nome.
  const nomeQuarantena = /^\.(.+)\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.quarantena$/iu;
  const inQuarantena = new Set();
  for (const voce of voci) {
    if (!voce.isFile()) continue;
    const marcatore = nomeQuarantena.exec(voce.name);
    if (marcatore) {
      if (sessionIdsSet.has(marcatore[1])) inQuarantena.add(marcatore[1]);
      continue;
    }
    const match = nomePending.exec(voce.name);
    if (!match) continue;
    if (sessionIdsSet.has(match[1])) candidati.push({ sessionId: match[1], nome: voce.name });
    else pendingSenzaJournal.add(match[1]);
  }
  // Scansione lineare e stat con concorrenza limitata: 5.000 sessioni logiche
  // non devono generare un prodotto cartesiano né migliaia di I/O simultanei.
  for (let i = 0; i < candidati.length; i += 16) {
    const risultati = await Promise.all(candidati.slice(i, i + 16).map(async ({ sessionId, nome }) => {
      try {
        const [pending, finale] = await Promise.all([
          statFn(join(cartellaStore, nome), { bigint: true }),
          statFn(percorsoDi(cartellaStore, sessionId), { bigint: true }),
        ]);
        if (!pending.isFile() || !finale.isFile()) return null;
        if (pending.ino === 0n) return sessionId; // identità non verificabile: fail-closed
        return pending.dev === finale.dev && pending.ino === finale.ino ? sessionId : null;
      } catch (errore) {
        return errore?.code === 'ENOENT' ? null : sessionId; // errore I/O: non caricare un possibile ghost
      }
    }));
    for (const sessionId of risultati) if (sessionId) inQuarantena.add(sessionId);
  }
  const sessionIds = sessionIdsTutti.filter((id) => !inQuarantena.has(id));
  if (!conDiagnostica) return sessionIds;
  return { sessionIds, quarantined: [
    ...[...inQuarantena].map((sessionId) => ({ sessionId, motivo: 'intestazione-in-quarantena' })),
    ...[...pendingSenzaJournal].map((sessionId) => ({ sessionId, motivo: 'intestazione-pendente-senza-journal' })),
  ] };
}

/** Verify journal presence without following links; uncertainty is never absence. */
export async function esisteSessionePersistita({ cartellaStore, sessionId }, deps = {}) {
  // Store IDs are database keys, not necessarily filesystem-safe session IDs.
  // Recovery must never turn a forged key or an unreadable journal into "absent".
  if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]{1,256}$/.test(sessionId)) {
    throw new SessionStoreError("Invalid session identifier for recovery.", 'SESSION_STORE_INSPECTION_FAILED');
  }
  try {
    const info = await (deps.lstatFn ?? fsp.lstat)(percorsoDi(cartellaStore, sessionId));
    if (!info.isFile() || info.isSymbolicLink()) throw new SessionStoreError("The session journal is not a regular file.", 'SESSION_STORE_INSPECTION_FAILED');
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw new SessionStoreError("Cannot verify whether the session journal exists.", 'SESSION_STORE_INSPECTION_FAILED');
  }
}

/**
 * ⭐⭐⭐ 30/8, QA visiva (Task 14) — trovato dal vivo: nessun modo di
 * eliminare una sessione, né qui né lato client. 144+ sessioni
 * accumulate in un solo giro di QA senza possibilità di pulizia.
 * Rimuove il file persistito — `ENOENT` è un esito onesto (già
 * cancellato, o mai persistito perché senza `cartellaStore`), non un
 * errore: stesso principio di `leggiRegistro` sopra.
 */
function liberaAffittoDiUnaEliminata(cartellaStore, sessionId) {
  const affitti = affittiDellArchivio(cartellaStore);
  if (!affitti) return;
  affitti.rilascia(sessionId, { dimensione: 0 });
  affitti.dimentica(sessionId);
}

export async function eliminaSessionePersistita({ cartellaStore, sessionId }, deps = {}) {
  const unlinkFn = deps.unlinkFn ?? fsp.unlink;
  const rmFn = deps.rmFn ?? fsp.rm;
  const percorso = percorsoDi(cartellaStore, sessionId);
  const precedente = codeDiScrittura.get(percorso) ?? Promise.resolve();
  const corrente = precedente.catch(() => {}).then(async () => {
    garantisciAffittoPerScrittura(cartellaStore, sessionId); // eliminare è la scrittura più grande: mai sotto un altro processo
    try {
      /*
       * Le pagine web salvate della sessione (owner 01/10/2026, «per sessione, come Claude Code») se ne vanno con lei, e
       * PRIMA del journal: se non si possono togliere la sessione resta intera, e il registro la rimette com'era.
       * ⛔ `fs.rm` ricorsivo stacca un collegamento o una giunzione senza entrarci (lezione robocopy del 17/09: la
       *   cartella a cui punta non si svuota — NAV-STORE-02 lo prova con una giunzione vera).
       */
      await rmFn(cartellaPagineWebDi(cartellaStore, sessionId), { recursive: true, force: true, maxRetries: 3 });
      await unlinkFn(percorso);
    } catch (errore) {
      if (errore?.code === 'ENOENT') { liberaAffittoDiUnaEliminata(cartellaStore, sessionId); return; }
      throw new SessionStoreError(`Cannot delete session ${sessionId}: ${errore.message}`, 'SESSION_STORE_DELETE_FAILED');
    }
    liberaAffittoDiUnaEliminata(cartellaStore, sessionId);
  });
  codeDiScrittura.set(percorso, corrente);
  corrente.catch(() => {}).finally(() => {
    if (codeDiScrittura.get(percorso) === corrente) codeDiScrittura.delete(percorso);
  });
  return corrente;
}

/*
 * ⭐⭐⭐ 24/09/2026 — F2, LA RIPARAZIONE DELLA CODA SPEZZATA (J1, decisione owner 7 del 24/09/2026: «riparazione
 * automatica al riavvio: backup `.bak` + troncamento all'ultimo `\n`, dichiarata, mai silenziosa»).
 * Prima, una coda incerta avvelenava la sessione per tutta la vita del processo E di nuovo a ogni riavvio
 * (`percorsiConCodaIncerta` non aveva un solo `.delete`): il `resume` rispondeva «riprova» a chi non poteva
 * riuscire. Il caso più comune è il riavvio del 4174 con `-Force` a metà append (J2).
 *
 * Cosa fa, nell'ordine — e ogni passo è quello che si può disfare:
 *   1. legge i byte e trova la coda: ciò che segue l'ultimo `\n`;
 *   2. ⛔ una coda che è un JSON VALIDO non è spezzata: è un record a cui manca solo il `\n` (un crash fra
 *      i byte del record e il terminatore). Si COMPLETA appendendo `\n`, niente si scarta, niente backup;
 *   3. una coda non parsabile (o, a coda vuota, un'ULTIMA riga terminata ma non parsabile — la forma
 *      `{"tipo":\n` di un append fallito) si scarta: PRIMA la copia `<file>.jsonl.bak-<iso>` con
 *      `COPYFILE_EXCL` (mai sopra un backup esistente), POI il prefisso sano su un temporaneo
 *      `<file>.jsonl.<uuid>.riparazione` con `flush:true`, POI `rename` sopra il journal — mai un
 *      `truncate` in-place: se il processo muore in mezzo, il journal è o intero o riparato, e il backup c'è.
 *      ⛔ Qui `rename` sopra un file esistente è VOLUTO: doc Node v24 `fs.rename` (ctx7, 24/09/2026) «In the
 *      case that newPath already exists, it will be overwritten». Il divieto exFAT del 23/09 vale per la
 *      NASCITA della testata, dove sovrascrivere era il difetto.
 *      Ritentativi su EPERM/EBUSY/EACCES del rename (antivirus che tiene il file: npm/write-file-atomic#227,
 *      forma di graceful-fs), pochi e brevi.
 *   4. una riga rotta NON ultima non si tocca mai: è `SESSION_STORE_CORRUPT` (danno altrove, non crash).
 * ⭐ Forma dei concorrenti (nel codice, 24/09/2026): Hermes legge i JSONL altrui saltando la riga non parsabile
 *   (`hermes_cli/foreign_sessions.py:51-55`, `except ValueError: continue`) — qui si fa lo stesso in lettura
 *   e in più si RIPARA il file perché gli append tornino possibili, tenendo i byte originali.
 */
const RITENTATIVI_RENAME = [0, 20, 60, 120, 250];

function marcaTemporale() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function esitoNonRiparato(extra = {}) {
  return { riparato: false, righeScartate: 0, byteScartati: 0, backup: null, ...extra };
}

/*
 * ⭐⭐⭐ 24/09/2026 — F2-bis, corsia A: LA RIPARAZIONE RESTA A STREAM. La prima stesura (F2, stessa mattina)
 * leggeva il file INTERO in un Buffer (`readFile`) e riscriveva il prefisso sano da quel Buffer: sul journal
 * di una sessione lunga (963 MiB a 300 turni, banco F2 §2.7) è lo stesso muro del replay — `fs.readFile`
 * rifiuta oltre 2 GiB (`ERR_FS_FILE_TOO_LARGE`, doc Node v24 `errors`, letta il 24/09/2026 via ctx7
 * `/websites/nodejs_latest-v24_x_api`: «consider using fs.createReadStream() to read the file in chunks»)
 * e prima ancora tiene in RAM un file che non serve tenere. Della riparazione servono solo DUE cose:
 *   · la coda: i byte dopo l'ultimo `\n` e l'ultima riga terminata ⇒ si leggono ALL'INDIETRO a blocchi di
 *     64 KiB (`leggiCodaAllIndietro`) finché si sono visti due `\n` o l'inizio del file — la memoria è al
 *     più due record più un blocco, qualunque sia la taglia del journal;
 *   · il prefisso sano ⇒ si COPIA a stream, `createReadStream(percorso, { end: fineSana - 1 })` →
 *     `createWriteStream(temporaneo, { flags: 'wx', flush: true })` con `stream.pipeline` (`end` è
 *     inclusivo, doc Node v24 `fs.createReadStream`; `flush` «the underlying file descriptor is flushed
 *     prior to closing it», supportata da v21.0.0/v20.10.0 — doc `fs.createWriteStream`, letta il
 *     24/09/2026). Mai un Buffer del prefisso.
 * Il resto (backup `COPYFILE_EXCL`, `rename` sopra il journal coi ritentativi, mai `truncate` in-place)
 * è quello di F2, invariato.
 */
const BLOCCO_CODA = 64 * 1024;

/**
 * Legge la fine del file all'indietro, a blocchi, finché ha visto due `\n` (o l'inizio del file).
 * Ritorna `{ base, coda }`: `coda` sono gli ultimi byte del file e `base` la loro posizione nel file.
 */
function leggiCodaAllIndietro(percorso, dimensione) {
  const fd = openSync(percorso, 'r');
  const pezzi = [];
  let fine = dimensione;
  let newline = 0;
  try {
    while (fine > 0 && newline < 2) {
      const inizio = Math.max(0, fine - BLOCCO_CODA);
      const pezzo = Buffer.alloc(fine - inizio);
      let letti = 0;
      while (letti < pezzo.length) {
        const n = readSync(fd, pezzo, letti, pezzo.length - letti, inizio + letti);
        if (n === 0) throw erroreCodaIncerta();
        letti += n;
      }
      for (let i = pezzo.indexOf(10); i !== -1; i = pezzo.indexOf(10, i + 1)) newline += 1;
      pezzi.unshift(pezzo);
      fine = inizio;
    }
  } finally {
    closeSync(fd);
  }
  return { base: fine, coda: Buffer.concat(pezzi) };
}

async function riparaCodaSpezzataInterna(percorso, deps = {}) {
  const copyFileFn = deps.copyFileFn ?? fsp.copyFile;
  const renameFn = deps.renameFn ?? fsp.rename;
  const appendFileFn = deps.appendFileFn ?? fsp.appendFile;
  const unlinkFn = deps.unlinkFn ?? fsp.unlink;
  const createReadStreamFn = deps.createReadStreamFn ?? createReadStream;
  const createWriteStreamFn = deps.createWriteStreamFn ?? createWriteStream;
  let dimensione;
  try { dimensione = statSync(percorso).size; }
  catch (errore) {
    if (errore?.code === 'ENOENT') return esitoNonRiparato({ motivo: 'assente' });
    throw errore;
  }
  if (dimensione === 0) return esitoNonRiparato({ motivo: 'vuoto' });

  // `bytes` sono SOLO gli ultimi byte del file: un offset locale `i` sta nel file a `base + i`.
  const { base, coda: bytes } = leggiCodaAllIndietro(percorso, dimensione);
  const ultimoNl = bytes.lastIndexOf(10);
  let fineSana;     // lunghezza (nel file) del prefisso da conservare
  let byteScartati; // i byte da scartare
  if (ultimoNl !== bytes.length - 1) {
    const coda = bytes.subarray(ultimoNl + 1); // senza `\n` nella coda letta si è arrivati all'inizio del file
    let valido = false;
    try { JSON.parse(coda.toString('utf8')); valido = true; } catch { /* spezzata */ }
    if (valido) {
      // Caso 2: record intero senza terminatore — si completa, non si scarta.
      await appendFileFn(percorso, '\n', { flush: true });
      percorsiConCodaIncerta.delete(percorso);
      return { riparato: true, completata: true, righeScartate: 0, byteScartati: 0, backup: null, byteConservati: dimensione + 1 };
    }
    fineSana = base + ultimoNl + 1;
    byteScartati = coda.length;
  } else {
    // Coda vuota: l'ultima riga TERMINATA è parsabile? Se no (append fallito con newline), si scarta lei sola.
    const inizioUltima = ultimoNl === 0 ? 0 : bytes.lastIndexOf(10, ultimoNl - 1) + 1;
    const ultima = bytes.subarray(inizioUltima, ultimoNl);
    if (ultima.length === 0) return esitoNonRiparato({ motivo: 'sano' });
    try { JSON.parse(ultima.toString('utf8')); return esitoNonRiparato({ motivo: 'sano' }); }
    catch { /* rotta e terminata */ }
    fineSana = base + inizioUltima;
    byteScartati = bytes.length - inizioUltima;
  }

  const backup = `${percorso}.bak-${marcaTemporale()}`;
  await copyFileFn(percorso, backup, fsConstants.COPYFILE_EXCL);
  const temporaneo = `${percorso}.${randomUUID()}.riparazione`;
  try {
    await pipeline(
      fineSana > 0 ? createReadStreamFn(percorso, { end: fineSana - 1 }) : Readable.from([]),
      createWriteStreamFn(temporaneo, { flags: 'wx', flush: true }),
    );
    let ultimoErrore = null;
    for (const pausa of RITENTATIVI_RENAME) {
      if (pausa) await attendiMs(pausa);
      try { await renameFn(temporaneo, percorso); ultimoErrore = null; break; }
      catch (errore) {
        ultimoErrore = errore;
        if (!CODICI_TRANSITORI.has(errore?.code)) break;
      }
    }
    if (ultimoErrore) throw ultimoErrore;
  } catch (errore) {
    try { await unlinkFn(temporaneo); } catch { /* il temporaneo ha un nome unico e non è mai letto dal replay */ }
    throw errore;
  }
  percorsiConCodaIncerta.delete(percorso);
  return { riparato: true, completata: false, righeScartate: 1, byteScartati, backup, byteConservati: fineSana };
}

/**
 * Ripara ESPLICITAMENTE la coda spezzata di un journal (`{ percorso }` oppure `{ cartellaStore, sessionId }`),
 * in fila con le altre operazioni su quel file. Ritorna il record di riparazione:
 * `{ riparato, completata, righeScartate, byteScartati, backup, byteConservati }` — `riparato:false` su un
 * file sano, vuoto o assente (con `motivo`). Lancia se il backup o la riscrittura falliscono: in quel caso
 * il journal è INTATTO e la coda resta incerta.
 */
export function riparaCodaSpezzata({ percorso, cartellaStore, sessionId }, deps = {}) {
  const bersaglio = percorso ?? percorsoDi(cartellaStore, sessionId);
  const precedente = codeDiScrittura.get(bersaglio) ?? Promise.resolve();
  const corrente = precedente.catch(() => {}).then(() => {
    if (cartellaStore && sessionId && !puoRiparare(cartellaStore, sessionId)) {
      const affitti = affittiDellArchivio(cartellaStore);
      throw erroreAffittata(sessionId, affitti?.detentoreAltrui(sessionId) ?? null);
    }
    return riparaCodaSpezzataInterna(bersaglio, deps);
  });
  codeDiScrittura.set(bersaglio, corrente);
  corrente.catch(() => {}).finally(() => {
    if (codeDiScrittura.get(bersaglio) === corrente) codeDiScrittura.delete(bersaglio);
  });
  return corrente;
}

/*
 * ⭐⭐⭐ 24/09/2026 — F2-bis, corsia A: IL JOURNAL SI LEGGE A STREAM, RIGA PER RIGA. Fino a stamattina
 * `leggiRegistro` faceva `readFile(percorso, 'utf8')` + `split('\n')`: TUTTO il file in una stringa, poi tutte
 * le righe, poi tutti i record, vivi insieme (RSS 4,4× la taglia del file, banco F2 §2.7). E una stringa V8
 * non supera 2^29-24 caratteri (~512 MiB): col formato di oggi il replay MORIVA a ~218 turni con
 * «Invalid string length» (3 giri su 3 a 300 turni, banco F2 §2.7) e il riavvio del 4174 perdeva la sessione
 * («lettura-fallita» in `ripristina`), senza che nessun test lo dicesse. Oltre c'era il muro di `fs.readFile`
 * a 2 GiB (`ERR_FS_FILE_TOO_LARGE`; doc Node v24 `errors`, letta il 24/09/2026 via ctx7
 * `/websites/nodejs_latest-v24_x_api`: «consider using fs.createReadStream() to read the file in chunks»).
 *
 * ⇒ Qui una sola strada per tutti: `leggiRegistroAStream` (la porta per il registro, corsia B) consegna ogni
 *   record a `perRiga` appena la sua riga è parsata e lo lascia andare; `leggiRegistro` è la stessa lettura
 *   con un `perRiga` che accumula — stesso contratto di prima (array, `riparazione` non enumerabile), ma il
 *   muro della stringa non c'è più. Forma presa dalla doc Node v24 `readline` (letta il 24/09/2026 via ctx7):
 *   `createInterface({ input: createReadStream(...), crlfDelay: Infinity })` + evento `'line'` + attesa
 *   della chiusura — «Performance is not on par with the traditional 'line' event API. Use 'line' instead for
 *   performance-sensitive applications» (§ `rl[Symbol.asyncIterator]()`), e «The 'line' event is also emitted
 *   if new data has been read from a stream and that stream ends without a final end-of-line marker» — per
 *   questo l'ultima riga spezzata ARRIVA come riga, e la coda incerta si riconosce dall'ultimo byte del file
 *   letto PRIMA di aprire lo stream, non dal lettore. ⛔ La doc dice anche che «Errors in the input stream are
 *   not forwarded» dall'iteratore: qui l'errore dello stream si ascolta a mano e diventa `SESSION_STORE_READ_FAILED`.
 * ⛔ Lo stream si apre con `end: dimensione - 1` (inclusivo): la lettura vede la fotografia del file al via,
 *   coerente con l'ultimo byte già guardato, anche se qualcosa lo allunga nel frattempo.
 * ⭐ Lo stesso nei concorrenti (letti nel codice, 24/09/2026): Hermes legge i JSONL di Claude/Codex riga per
 *   riga (`hermes_cli/foreign_sessions.py:49-56` `for line in f: … json.loads(line)`), mai il file intero.
 *
 * Contratto di `perRiga(record, { indice, byte })`: SINCRONA (il ritorno si guarda solo per `false` =
 * «fermati qui», che chiude lo stream e ritorna `interrotta:true`); `byte` è la taglia della riga in UTF-8
 * SENZA il fine riga; un'eccezione di `perRiga` ferma la lettura e arriva al chiamante così com'è, senza
 * toccare il file. Un errore lo si lancia; un lavoro asincrono lo si accumula e lo si fa dopo.
 * ⛔ `readline` tratta anche un `\r` solo come fine riga: nel journal non può comparire (JSON.stringify lo
 *   scrive `\\r`), e `\r\n` con `crlfDelay: Infinity` è UNA riga — parità con lo `split('\n')` di prima.
 */
function inCodaDelPercorso(percorso, lavoro) {
  const precedente = codeDiScrittura.get(percorso) ?? Promise.resolve();
  const corrente = precedente.catch(() => {}).then(lavoro);
  codeDiScrittura.set(percorso, corrente);
  corrente.catch(() => {}).finally(() => {
    if (codeDiScrittura.get(percorso) === corrente) codeDiScrittura.delete(percorso);
  });
  return corrente;
}

async function leggiAStreamInterna(percorso, sessionId, perRiga, deps = {}, cartellaStore = null) {
  const createReadStreamFn = deps.createReadStreamFn ?? createReadStream;
  const erroreDiLettura = (errore) => new SessionStoreError(`Cannot read session ${sessionId}: ${errore?.message ?? String(errore)}`, 'SESSION_STORE_READ_FAILED', { chiave: 'server.sessionStore.readFailed', params: { sessionId, detail: errore?.message ?? String(errore) } });
  let dimensione;
  try { dimensione = statSync(percorso).size; }
  catch (errore) {
    if (errore?.code === 'ENOENT') return null;
    throw erroreDiLettura(errore);
  }
  if (dimensione === 0) return { record: 0, byte: 0, riparazione: null, interrotta: false };
  let terminato;
  try { terminato = leggiByteDa(percorso, dimensione - 1, 1)[0] === 10; }
  catch (errore) { throw erroreDiLettura(errore); }

  let indice = 0;
  let letti = 0;
  let rottaPendente = false; // una riga non parsabile: è un crash a metà append solo se resta l'ULTIMA
  let fermata = null;        // { errore } | { interrotta: true }
  const input = createReadStreamFn(percorso, { encoding: 'utf8', end: dimensione - 1 });
  const rl = createInterface({ input, crlfDelay: Infinity });
  const ferma = (esito) => {
    if (fermata) return;
    fermata = esito;
    rl.close();
    input.destroy();
  };
  rl.on('line', (riga) => {
    if (fermata) return; // `rl.close()` non ferma le righe già in un blocco: si ignorano
    if (riga.trim() === '') return;
    if (rottaPendente) {
      ferma({ errore: new SessionStoreError(`Session ${sessionId} has a corrupt line (not the last one): the file is not a crash midway through an append; it is damaged elsewhere.`, 'SESSION_STORE_CORRUPT', { chiave: 'server.sessionStore.corrupt', params: { sessionId } }) });
      return;
    }
    let record;
    try { record = JSON.parse(riga); }
    catch { rottaPendente = true; return; }
    letti += 1;
    let esito;
    try { esito = perRiga(record, { indice: indice++, byte: Buffer.byteLength(riga, 'utf8') }); }
    catch (errore) { ferma({ errore }); return; }
    if (esito === false) ferma({ interrotta: true });
  });
  await new Promise((resolve) => {
    input.on('error', (errore) => { if (!fermata) fermata = { errore: erroreDiLettura(errore) }; rl.close(); });
    // La chiusura dello STREAM (fd chiuso) è il segnale completo: arriva dopo l'ultima riga, anche su
    // errore (autoClose) e dopo `destroy()`. Il `close` di readline arriverebbe prima, a fd ancora aperto.
    input.on('close', resolve);
  });
  if (fermata?.errore) throw fermata.errore;

  let riparazione = null;
  const codaIncerta = !terminato || (rottaPendente && !fermata);
  /*
   * Affitto (10/10/2026): una coda a metà mentre un ALTRO processo vivo tiene l'affitto è la sua scrittura in corso. Non si
   *   ripara e non si avvelena il percorso: si dice (`codaAltrui`) e la si lascia a lui. I record consegnati sono quelli interi.
   */
  if (codaIncerta && cartellaStore && !puoRiparare(cartellaStore, sessionId)) {
    return { record: letti, byte: dimensione, riparazione: null, interrotta: Boolean(fermata?.interrotta), codaAltrui: true };
  }
  if (codaIncerta) {
    percorsiConCodaIncerta.add(percorso);
    // Siamo già dentro la coda di questo percorso: la riparazione va chiamata INTERNA, mai l'esportata
    // (si accoderebbe dietro se stessa). I record consegnati sono già giusti: l'ultima riga scartata dal
    // parse è la stessa che la riparazione toglie dal file; quella valida senza `\n` è stata consegnata.
    try { riparazione = await riparaCodaSpezzataInterna(percorso, deps); }
    catch (errore) {
      percorsiConCodaIncerta.add(percorso);
      riparazione = esitoNonRiparato({ errore: `${errore?.code ? `${errore.code}: ` : ''}${errore?.message ?? String(errore)}` });
    }
  }
  return { record: letti, byte: dimensione, riparazione, interrotta: Boolean(fermata?.interrotta) };
}

/**
 * Legge un registro A STREAM, riga per riga: `perRiga(record, { indice, byte })` per ogni record, in fila
 * con le altre operazioni sul file. Ritorna `null` se il journal non esiste, altrimenti
 * `{ record, byte, riparazione, interrotta }`: `record` quanti ne ha consegnati, `byte` la taglia del file al
 * via, `riparazione` come `riparaCodaSpezzata` (o `null` se la coda era sana), `interrotta` se `perRiga` ha
 * ritornato `false`. Una riga rotta NON ultima ⇒ `SESSION_STORE_CORRUPT` (i record prima sono già stati
 * consegnati); un errore del disco ⇒ `SESSION_STORE_READ_FAILED`; un'eccezione di `perRiga` ⇒ la stessa.
 */
export function leggiRegistroAStream({ cartellaStore, sessionId, perRiga }, deps = {}) {
  if (typeof perRiga !== 'function') {
    throw new SessionStoreError("leggiRegistroAStream requires perRiga(record, { indice, byte }).", 'SESSION_STORE_BAD_ARGUMENT');
  }
  const percorso = percorsoDi(cartellaStore, sessionId);
  return inCodaDelPercorso(percorso, () => leggiAStreamInterna(percorso, sessionId, perRiga, deps, cartellaStore));
}

/**
 * ⭐ LONG-CHAT «prima la coda», tappa B (07/10/2026 notte, owner: «solo opzioni additive nel kernel e patch al desktop») — la SOLA
 * PRIMA riga di un journal, cioè la sua intestazione. Serve a `ripristina({ soloSessioni })` per sapere di quale famiglia fa parte
 * ogni sessione dell'archivio SENZA leggerne i corpi (Codex `rollout/src/list.rs:136` legge le prime 10 righe di ogni file per
 * l'elenco; Pi `session-manager.ts:606-760` scansiona l'intestazione con un buffer da 4 KiB e un tetto da 1 MiB, e se il tetto
 * scatta ricade sul caricamento completo, «autorevole»: stessa regola qui — chi riceve `troppo-grande`/`illeggibile`/`non-intestazione`
 * non può provare l'estraneità e deve ripristinare).
 * ⛔ SOLA LETTURA, fuori dalla coda di scrittura del percorso: `leggiRegistroAStream` RIPARA una coda spezzata (riscrive il file) anche
 * se la lettura si ferma alla prima riga; guardare l'elenco delle sessioni non deve mai cambiare un file di una sessione non aperta.
 * @returns {Promise<{stato:'ok', intestazione:object}|{stato:'assente'|'illeggibile'|'troppo-grande'|'non-intestazione', dettaglio?:string}>}
 */
export const TETTO_INTESTAZIONE_BYTE = 1024 * 1024;
export async function leggiIntestazioneSessione({ cartellaStore, sessionId }, deps = {}) {
  const tetto = Number.isSafeInteger(deps.tettoByte) && deps.tettoByte > 0 ? deps.tettoByte : TETTO_INTESTAZIONE_BYTE;
  const percorso = percorsoDi(cartellaStore, sessionId);
  let fd;
  try { fd = await fsp.open(percorso, 'r'); }
  catch (errore) {
    if (errore?.code === 'ENOENT') return { stato: 'assente' };
    return { stato: 'illeggibile', dettaglio: errore?.code ?? String(errore?.message ?? errore) };
  }
  try {
    const pezzi = [];
    let letti = 0;
    let completa = false;
    let finito = false;
    const buffer = Buffer.allocUnsafe(16 * 1024);
    while (letti < tetto && !completa) {
      const { bytesRead } = await fd.read(buffer, 0, Math.min(buffer.length, tetto - letti), letti);
      if (bytesRead === 0) { finito = true; break; }
      const parte = buffer.subarray(0, bytesRead);
      /* le righe vuote prima dell'intestazione si saltano, come fa la lettura completa */
      let da = 0;
      for (;;) {
        const fine = parte.indexOf(10, da);
        if (fine < 0) { pezzi.push(Buffer.from(parte.subarray(da))); break; }
        pezzi.push(Buffer.from(parte.subarray(da, fine)));
        if (Buffer.concat(pezzi).toString('utf8').trim() !== '') { completa = true; break; }
        pezzi.length = 0;
        da = fine + 1;
      }
      letti += bytesRead;
    }
    const testo = Buffer.concat(pezzi).toString('utf8').trim();
    if (!completa && !finito) return { stato: 'troppo-grande', dettaglio: `la prima riga supera ${tetto} byte` };
    if (testo === '') return { stato: 'illeggibile', dettaglio: 'file vuoto' };
    let record;
    try { record = JSON.parse(testo); }
    catch { return { stato: 'illeggibile', dettaglio: 'la prima riga non è JSON' }; }
    if (!record || typeof record !== 'object' || record.tipo !== 'intestazione') return { stato: 'non-intestazione' };
    return { stato: 'ok', intestazione: record };
  } catch (errore) {
    return { stato: 'illeggibile', dettaglio: errore?.code ?? String(errore?.message ?? errore) };
  } finally {
    await fd.close().catch(() => {});
  }
}

/**
 * Legge un registro per intero — una riga JSON per riga del file — e ritorna l'array dei record.
 * ⭐ 24/09/2026 (F2-bis): è `leggiRegistroAStream` con un `perRiga` che accumula — mai il file in una stringa.
 * ⭐ 24/09/2026 (F2): se trova la coda incerta la RIPARA da sola (vedi `riparaCodaSpezzataInterna`) e lo
 * dichiara: il risultato è l'array dei record con una proprietà NON enumerabile `riparazione` — additiva,
 * invisibile a `deepEqual`/`JSON.stringify`/spread — che il registro legge per dirlo nella chat
 * («recuperata, N righe scartate»). Se la riparazione fallisce la lettura resta valida, la coda resta
 * incerta (append vietati, come prima) e `riparazione.riparato` è `false` con `errore`.
 * ⭐⭐⭐ L'ULTIMA riga, se non è JSON valido, viene SCARTATA in silenzio
 * (mai un errore che perde l'intero file): è esattamente il caso di
 * un crash a metà scrittura, l'unica corruzione che l'append-only
 * ammette per costruzione — "una riga rotta non invalida le
 * precedenti", verificato in ricerca, non presunto. Una riga NON
 * ultima malformata è invece un errore dichiarato: quello indica un
 * file danneggiato in un altro modo, non un crash a metà append.
 */
export function leggiRegistro({ cartellaStore, sessionId }, deps = {}) {
  const percorso = percorsoDi(cartellaStore, sessionId);
  return inCodaDelPercorso(percorso, async () => {
    const record = [];
    const esito = await leggiAStreamInterna(percorso, sessionId, (r) => { record.push(r); }, deps, cartellaStore);
    if (esito === null) return null;
    if (esito.riparazione) {
      Object.defineProperty(record, 'riparazione', { value: esito.riparazione, enumerable: false, configurable: true, writable: true });
    }
    return record;
  });
}

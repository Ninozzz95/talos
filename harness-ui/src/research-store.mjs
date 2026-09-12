/**
 * research-store.mjs — FASE N, ottavo sistema, "Fetta onesta" di Deep
 * Research (owner, AskUserQuestion 30/8: "Fetta onesta (consigliato)").
 * Letto alla fonte PRIMA di disegnare questa fetta: `mobile/src/lib/
 * research/*` (21 file, macchina a stati event-sourced — `researchRun.ts`
 * — con verifica/indipendenza/citazioni/approvazione piano) e il
 * CONTRATTO vero del tool, `mobile/src/lib/tools/researchTools.ts` (8
 * tool, letti verbatim, non presunti). L'owner ha scelto esplicitamente
 * la fetta scoperta: stesso CONTRATTO (nomi/schema/semantica dei tool),
 * esecuzione riusando la macchina GIÀ COSTRUITA di Harness Desktop
 * (talosLavora via avviaESegui, l'abort già usato da ferma() per la
 * pausa, resume() per la ripresa, library-store.mjs per il rapporto
 * finale) invece del motore event-sourced mobile (pianificazione a più
 * linee di indagine, verifica/indipendenza/citazioni/approvazione piano)
 * — dichiarato debito, non perso in silenzio.
 *
 * ⭐⭐⭐ Deep Research è PER-PROGETTO, non GLOBALE come Notes/Tasks/Memory
 * — decisione DIVERSA dagli ultimi tre sistemi, verificata non presunta:
 * il tool mobile stesso dice "i rapporti di ricerca SONO file di
 * Libreria" (`library_list` li trova, li elenca come documenti — vedi
 * il commento di testa di researchTools.ts) — e la Libreria desktop è
 * PER-PROGETTO (FASE N, prima fetta: `.harness-ui-library/` dentro il
 * workspace, mai cross-chat come sul mobile). Una ricerca avviata
 * mentre si lavora sul progetto C deve finire nella Libreria di QUEL
 * progetto, raggiungibile dalle sessioni future sullo STESSO progetto —
 * non in un limbo globale che nessun `library_list` di progetto
 * vedrebbe mai. Storage quindi accanto a `.harness-ui-library/`, dentro
 * il workspace: `.harness-ui-research/<id>/`, una CARTELLA per ricerca
 * dall'11/09/2026 (era `<id>.json`, un file solo: vedi il blocco «L4 —
 * DA UN FILE A UNA CARTELLA» più sotto per cosa c'è dentro adesso e per
 * come si leggono ancora le ricerche nate nella forma vecchia). Mai un
 * array riscritto — la classe di bug già evitata altrove.
 *
 * ⛔⛔⛔ Deliberatamente SENZA lo stato "sta girando ORA" come campo:
 * mobile stesso separa "il giornale" (`sources.list()`) da "sta girando
 * adesso" (`sources.isRunning(id)`, calcolato al volo — vedi
 * `TalosResearchToolSources.isRunning` in researchTools.ts) — questo
 * store tiene SOLO `terminata` (null finché non è definitivamente
 * conclusa: 'done'|'failed'|'cancelled'). "In corso" vs "in pausa" si
 * derivano DAL VIVO in research-orchestrator.mjs confrontando
 * `terminata` con lo stato reale della sessione in session-registry —
 * per costruzione non può disallinearsi, mai duplicato qui.
 *
 * Stile DI: stesso pattern di library-store.mjs/notes-store.mjs —
 * funzioni async con `deps` opzionali per i test, mai un vero
 * filesystem mockato altrove.
 */
import { createHash, randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

export class ResearchStoreError extends Error {
  constructor(message, code = 'RESEARCH_INVALID') {
    super(message);
    this.name = 'ResearchStoreError';
    this.code = code;
  }
}

export const CARTELLA_RICERCA = '.harness-ui-research';

/*
 * ⭐⭐⭐ L2 (11/09/2026) — GLI STATI TERMINALI DI UNA RICERCA, e il perché ce ne vogliono sei.
 *
 * Prima di oggi erano tre (`done`/`failed`/`cancelled`) e `done` si calcolava da `comeFinita`
 * del kernel: cioè dal PROCESSO («la corsa è finita da sola»), mai dal PRODOTTO («c'è un
 * rapporto»). Sulla sessione `d2a453a8` del 11/09 le due cose divergevano — corsa riuscita,
 * rapporto inesistente — e la sezione mostrava un timbro verde su una scusa di 290 byte.
 *
 * ⛔ `failed` da solo non bastava per la ragione opposta: metteva sotto una parola sola tre
 *   guasti che si curano in modo DIVERSO. «Bloccata dal permesso» si cura cambiando il
 *   permesso (ed è il guasto di stasera), «giri esauriti» si cura alzando i giri o
 *   snellendo il contesto (è un guasto già noto e misurato sul banco), «senza rapporto» si
 *   cura ri-chiedendo il deposito. Un nome solo per tre cure diverse non è azionabile.
 *
 * ⛔ E i valori vivono QUI, non in una stringa sparsa per il codice: il frontend li legge
 *   come contratto (`stato` di ogni voce), e una lista scritta due volte è una lista che
 *   diverge.
 */
export const STATI_TERMINATI = Object.freeze([
  'done',
  'failed',
  'cancelled',
  'senza-rapporto',
  'bloccata-dal-permesso',
  'giri-esauriti',
]);

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * L4 (11/09/2026) — DA UN FILE A UNA CARTELLA, E IL GIORNALE CHE LA RENDE RIPRENDIBILE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Prima di oggi una ricerca era UN file: `.harness-ui-research/<id>.json`, riscritto per intero
 * a ogni aggiornamento. Va bene per quattro campi; non va bene per una cosa che costa denaro e
 * che si deve poter RIPRENDERE dopo un riavvio, perché un file riscritto sopra sé stesso dice
 * cosa crede sia vero adesso e non dice mai che un passo era finito prima che il processo
 * morisse (`src/research/run.mjs`, testa del file: «la differenza fra pagare una ricerca una
 * volta e pagarla due»).
 *
 * ⇒ La forma di §6.2 del disegno:
 *
 *     .harness-ui-research/<id>/
 *       ├── meta.json        la voce (era `<id>.json`) — riscritta, ma SEMPRE in modo atomico
 *       ├── giornale.jsonl   gli eventi del motore — SOLO append, mai riscritto
 *       ├── piano.json       il piano approvato — riscritto in modo atomico
 *       ├── fonti/<sha256>.txt  il testo TENUTO di una fonte — scritto UNA volta, mai sopra
 *       └── rapporto.md      il rapporto depositato da `research_deposit` (già qui da L1)
 *
 * ⛔⛔ IL VINCOLO CHE COMANDA TUTTO: ciò che è costato denaro non si sovrascrive mai. Lezione
 *   già pagata in questo repo — il rilancio che ha distrutto 56 righe e $2,64 con un
 *   `writeFileSync(dove,'')` riuscito, senza un errore da nessuna parte.
 *   ⇒ due regole, non una: (a) il giornale è **solo append**; (b) tutto il resto si scrive su
 *   un temporaneo e poi si `rename`, così un crash a metà lascia il file PRECEDENTE intatto.
 *
 * ⭐ RICERCA WEB PRIMA DI SCRIVERE (obbligo owner) — `WebSearch` era esaurito (200/200, come per
 *   L1-L3), quindi fonti primarie via `WebFetch`, lette l'11/09/2026:
 *
 *   - **LWN, «Ensuring data reaches disk»** (<https://lwn.net/Articles/457667/>): la sequenza
 *     sicura è **cinque** passi, non due — «1. create a new temp file (on the same file
 *     system!) 2. write data to the temp file 3. fsync() the temp file 4. rename the temp file
 *     to the appropriate name 5. fsync() the containing directory». I due `fsync` fanno lavori
 *     diversi: il primo porta i DATI su disco prima del rename, il secondo la VOCE di
 *     directory. ⇒ `scriviAtomico` qui sotto fa 1-2-3-4; il punto 5 è dichiarato e **non
 *     fatto**, vedi sotto il perché su Windows.
 *   - **`rename(2)`** (<https://man7.org/linux/man-pages/man2/rename.2.html>): «If newpath
 *     already exists, it will be atomically replaced, so that there is no point at which
 *     another process attempting to access newpath will find it missing». È la garanzia su cui
 *     poggia tutto: un lettore vede il vecchio o il nuovo, mai mezzo file.
 *   - **`MoveFileExW` / `MOVEFILE_REPLACE_EXISTING`**
 *     (<https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw>) +
 *     **libuv `src/win/fs.c`** (letto alla fonte: `fs__rename` chiama
 *     `MoveFileExW(..., MOVEFILE_REPLACE_EXISTING)`, e `fs__fsync` chiama `FlushFileBuffers`).
 *     ⛔ **Questo è il vincolo che NON conoscevo e che la ricerca ha aggiunto**: la pagina
 *     Windows promette che il contenuto viene **sostituito** «provided that security
 *     requirements regarding ACLs are met» — NON usa mai la parola «atomically» come fa POSIX,
 *     e non c'è modo di fare l'`fsync` della *directory* (su Windows non si apre una directory
 *     come file descriptor). ⇒ il punto 5 di LWN qui non è disponibile, e lo scrivo invece di
 *     lasciar credere che la ricetta sia applicata per intero. Ciò che resta garantito su
 *     entrambe le piattaforme è quello che serve davvero al vincolo: **se il rename non
 *     riesce, il file vecchio è ancora intatto** — ed è la prova che il test «crash fra
 *     temporaneo e rename» misura.
 *   - **GraphFlow** — [arXiv:2605.14968](https://arxiv.org/abs/2605.14968), 14/05/2026: «a
 *     durable engine records outcomes in an **append-only event log** and can enforce contracts
 *     at system boundaries, **supporting replay, retries, and audit**». ⇒ conferma la forma, e
 *     nomina le tre cose che il giornale compra insieme: ripresa, ritentativi e verificabilità.
 *   - **Verified Detection … in Multi-Agent LLM Systems** —
 *     [arXiv:2606.17182](https://arxiv.org/abs/2606.17182), 15/06/2026: le macchine a esecuzione
 *     durevole impongono la semantica «by **deterministic replay**». ⇒ è la ragione per cui il
 *     giornale porta SOLO fatti (`resultRef`, non il carico) e per cui rigiocare due volte lo
 *     stesso file deve dare lo stesso stato — provato, non dichiarato.
 *
 * ⭐ E dentro il PROPRIO codebase, prima ancora che fuori (lezione 06/09 «chi guarda da fuori
 *   inventa quello che dentro aveva già»): `session-store.mjs` ha già il giornale JSONL con la
 *   coda per percorso (W0-07, 04/09 — due `appendFile` concorrenti intrecciati su un record da
 *   1,5 MiB) e la lettura che tollera l'ultima riga spezzata; `local-model-store.mjs`,
 *   `harness-receipt-keypair.mjs` e `generated-image-store.mjs` hanno già temporaneo+`rename`.
 *   Qui NON si inventa un sesto modo: si riusa la stessa forma, con le due differenze
 *   dichiarate più sotto (`flush` sempre acceso; una riga rotta **in mezzo** si salta invece di
 *   far fallire la lettura).
 */

/** La voce di metadata, dentro la cartella della ricerca. Era `<id>.json` accanto ad essa. */
export const NOME_META = 'meta.json';
/** Il giornale degli eventi — SOLO append. */
export const NOME_GIORNALE = 'giornale.jsonl';
/** Il piano approvato. */
export const NOME_PIANO = 'piano.json';
/** La cartella del testo TENUTO delle fonti, indirizzato dal contenuto. */
export const CARTELLA_FONTI = 'fonti';
/**
 * ⭐⭐⭐ L9 (12/09/2026) — L'INDICE url → `fonti/<sha256>.txt`, e perché serve un file in più.
 *
 * `fonti/` è indirizzata dal CONTENUTO: è la proprietà che rende impossibile sovrascrivere una
 * pagina già pagata, ed è quella che vogliamo tenere. Ma un'impronta non dice da quale indirizzo
 * quel testo venga, e la verifica ha esattamente quella domanda: «l'affermazione cita
 * <https://…>: dov'è il testo di quella pagina?». Finché il processo vive la risposta sta in
 * memoria; dopo un riavvio non c'è più — e una ricerca ripresa consegnerebbe affermazioni «non
 * verificate» per un motivo che non è vero (il testo c'è, non si sa solo di chi sia).
 *
 * ⛔ Non si mette l'URL nel NOME del file: un indirizzo non è un nome di file (lunghezza,
 *   caratteri vietati su Windows, due indirizzi che normalizzano uguale) e si perderebbe
 *   l'indirizzamento per contenuto. Un indice a parte costa una scrittura atomica e non tocca
 *   niente di ciò che già funziona.
 * ⛔ E l'indice è un RISPARMIO, non una prova: se manca, la verifica lo dice invece di
 *   inventare — mai il contrario.
 */
export const NOME_INDICE_FONTI = 'indice-fonti.json';

/**
 * ⭐ Il numero di formato vive sulla VOCE, non su un file a parte, e serve a una cosa sola: dire
 * se una ricerca è nata prima o dopo il record recintato. `2` = nata con la cartella e col
 * giornale; assente o `1` = migrata da `<id>.json`, cioè una ricerca il cui rapporto può essere
 * solo prosa perché il record recintato non esisteva quando è stata fatta. Il cancello di
 * consegna (`research-orchestrator.mjs`) legge questo campo per decidere se il **ripiego** sulla
 * forma minima è lecito — mai per decidere se lo stato è `done`.
 */
export const FORMATO_CORRENTE = 2;

/** La voce, nella forma di oggi: `<progetto>/.harness-ui-research/<id>/meta.json`. */
export function percorsoMeta(cartella, id) {
  return join(cartella, CARTELLA_RICERCA, id, NOME_META);
}

/** La voce, nella forma di ieri: `<progetto>/.harness-ui-research/<id>.json`. Si legge ancora. */
export function percorsoVoceLegacy(cartella, id) {
  return join(cartella, CARTELLA_RICERCA, `${id}.json`);
}

export function percorsoGiornale(cartella, id) {
  return join(cartella, CARTELLA_RICERCA, id, NOME_GIORNALE);
}

export function percorsoPiano(cartella, id) {
  return join(cartella, CARTELLA_RICERCA, id, NOME_PIANO);
}

export function cartellaDelleFonti(cartella, id) {
  return join(cartella, CARTELLA_RICERCA, id, CARTELLA_FONTI);
}

export function percorsoIndiceFonti(cartella, id) {
  return join(cartella, CARTELLA_RICERCA, id, NOME_INDICE_FONTI);
}

/**
 * ⭐⭐⭐ LA SCRITTURA CHE NON PUÒ DISTRUGGERE QUELLA DI PRIMA.
 *
 * Temporaneo **nella stessa cartella** (LWN: «on the same file system!» — un temporaneo in
 * `%TEMP%` renderebbe il `rename` una copia, che non è atomica), `flush:true` per portare i byte
 * su disco prima del rename (LWN passo 3; su Node è `FlushFileBuffers`/`fsync` sotto), poi
 * `rename`.
 *
 * ⛔ Il `catch` **non degrada in silenzio**: pulisce il temporaneo e **rilancia**. Un temporaneo
 *   lasciato lì sporcherebbe la cartella della ricerca a ogni guasto, e un errore inghiottito
 *   qui vorrebbe dire «salvato» su una voce mai salvata — la bugia esatta che L2 ha tolto dallo
 *   stato. (Lezione 10/09: «il catch GIUSTO nasconde il bug SBAGLIATO».)
 *
 * ⛔ Il punto 5 di LWN (`fsync` della directory) **non c'è**, ed è dichiarato: su Windows non si
 *   apre una directory per farne il flush, e questo prodotto gira lì. Conseguenza onesta: dopo
 *   un crash del SISTEMA (non del processo) la voce di directory potrebbe non essere ancora
 *   durevole. Il file vecchio resta comunque intatto: nessuna perdita di ciò che era già pagato.
 */
/*
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔⛔⛔ 12/09/2026 — SU WINDOWS UN LETTORE FA FALLIRE IL RENAME. IL RITENTO.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Il difetto, **riprodotto** (non dedotto) eseguendo la suite intera e poi isolato in sei righe:
 *
 *   const h = fs.openSync(meta, 'r');       // un LETTORE qualunque, in sola lettura
 *   fs.renameSync(tmp, meta);               // → EPERM: operation not permitted, rename
 *
 * Senza il lettore aperto, lo stesso rename **riesce**. ⇒ non è il disco, non è un permesso:
 * è la contesa. Su Windows `MoveFileExW` non può sostituire una destinazione che qualcun altro
 * tiene aperta, e libuv apre i file **senza** `FILE_SHARE_DELETE`.
 *
 * ⛔ E chi era il lettore, in produzione? **La sezione Ricerca**, che interroga l'elenco e la
 *   scheda **mentre** la ricerca gira. Quando la ricerca finiva, `onConclusioneRicerca` chiamava
 *   `aggiornaRicerca` → qui → EPERM → l'eccezione usciva e la voce restava **`running` sul disco
 *   per sempre**: una ricerca conclusa e pagata che a schermo non finiva mai. Visto in due corse
 *   su tre della suite intera; mai eseguendo il file da solo (è una gara, e la vince chi ha il
 *   disco più lento).
 *
 * ── Ricerca web PRIMA di scrivere (fonte + data) ────────────────────────────────────────────
 *  · **graceful-fs, `polyfills.js`** (isaacs) — letto il 12/09/2026. È il pattern di riferimento,
 *    quello che npm usa da anni: ritenta il `rename` su **`EACCES`, `EPERM`, `EBUSY`**, perché
 *    «on Windows, A/V software can lock the directory, causing this to fail with an EACCES or
 *    EPERM if the directory contains newly created files».
 *    ⛔ **Il vincolo che non conoscevo e che ha cambiato il codice**: si aspetta con `setTimeout`
 *      e mai con un ciclo stretto, perché «Windows scheduling gives CPU to a busy looping
 *      process, which can cause the program causing the lock contention to be **starved of CPU**
 *      by node, so the contention doesn't resolve». Un ritento che gira a vuoto **impedisce** al
 *      lettore di chiudere il suo handle: la cura diventerebbe la causa.
 *    ⛔ **E una cosa di graceful-fs che NON si copia**: prima di ogni ritento lui controlla che la
 *      destinazione non esista e, se esiste, si ferma. Serve al caso di npm, dove la
 *      destinazione **non deve** esserci. Qui la destinazione esiste **sempre** (stiamo
 *      sostituendo `meta.json`): copiarlo farebbe uscire ogni ritento al primo giro, cioè non
 *      ritentare affatto.
 *    ⛔ La sua finestra è di **60 secondi** (pensata per Parity bit9, che «may lock files for up
 *      to a minute»). Qui no: questa scrittura sta **dentro una richiesta HTTP** e dentro la
 *      conclusione di una ricerca. Dieci tentativi, attese 20→200 ms, **1,3 s** in tutto.
 *  · **MoveFileExW / `MOVEFILE_REPLACE_EXISTING`** — <https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw>,
 *    riletta il 12/09/2026: sostituisce «provided that security requirements regarding access
 *    control lists (ACLs) are met», e «to delete or rename a file, you must have either delete
 *    permission on the file or delete child permission in the parent directory». ⛔ **Va detto
 *    quello che NON dice**: la pagina non nomina gli handle aperti né l'errore che ne esce. Il
 *    legame «lettore aperto ⇒ EPERM» qui non viene da lei: viene dalla **riproduzione** qui
 *    sopra e dal test che la esegue su disco vero.
 *  · **Node, `fs.rename`/`fsPromises.rename`** — <https://nodejs.org/docs/latest/api/fs.html>:
 *    ⚠️ lettura **NON riuscita**. La pagina è tornata troncata da `WebFetch` due volte e le
 *    sezioni dei due metodi non si sono lette alla lettera. Segnato come lettura mancata, non
 *    come lettura fatta: il comportamento su cui poggia questo codice è **misurato**, non citato.
 */
const RENAME_TENTATIVI = 10;
const RENAME_ATTESA_INIZIALE_MS = 20;
const RENAME_ATTESA_MASSIMA_MS = 200;
/** ⛔ I tre di graceful-fs, e nessuno in più: un `ENOSPC` o un `EROFS` ritentati sono 1,3 s buttati. */
const CODICI_DI_CONTESA = new Set(['EPERM', 'EBUSY', 'EACCES']);
/** Il nome DICHIARATO che prende un temporaneo quando il rename non riesce mai. Vedi `scriviAtomico`. */
export const SUFFISSO_NON_RINOMINATO = '.non-rinominato';

/**
 * Il `rename`, ritentato finché la contesa non passa.
 *
 * ⛔ Torna **quanti ritenti sono serviti** invece di `undefined`: una cura che non si può contare
 *   è una cura di cui nessuno saprà mai se è servita. Il test se ne serve, e domani una sonda
 *   potrà dirlo all'owner.
 * ⛔ Un codice che non è di contesa **non si ritenta**: si rilancia subito. Aspettare 1,3 secondi
 *   per un disco pieno è tempo rubato a chi sta guardando lo schermo.
 *
 * @returns {Promise<number>} quanti ritenti sono serviti (0 = è andata al primo colpo)
 */
export async function rinominaConRitento(temporaneo, percorso, deps = {}) {
  const renameFn = deps.renameFn ?? fsp.rename;
  // ⛔ `setTimeout`, MAI un ciclo stretto: vedi graceful-fs sopra — un ciclo affamerebbe di CPU
  //   proprio il processo che tiene il file aperto, e la contesa non si scioglierebbe mai.
  const attendiFn = deps.attendiFn ?? ((ms) => new Promise((risolvi) => { setTimeout(risolvi, ms); }));
  const tentativi = Number.isSafeInteger(deps.tentativiRename) && deps.tentativiRename > 0
    ? deps.tentativiRename
    : RENAME_TENTATIVI;

  for (let tentativo = 0; ; tentativo += 1) {
    try {
      await renameFn(temporaneo, percorso);
      return tentativo;
    } catch (errore) {
      if (!CODICI_DI_CONTESA.has(errore?.code) || tentativo >= tentativi - 1) throw errore;
      // 20, 40, 80, 160, poi 200 fisso: 1,3 s in tutto su dieci tentativi.
      await attendiFn(Math.min(RENAME_ATTESA_INIZIALE_MS * (2 ** tentativo), RENAME_ATTESA_MASSIMA_MS));
    }
  }
}

export async function scriviAtomico(percorso, contenuto, deps = {}) {
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  const rmFn = deps.rmFn ?? fsp.rm;
  const renameFn = deps.renameFn ?? fsp.rename;
  const randomUUIDFn = deps.randomUUIDFn ?? randomUUID;
  await mkdirFn(dirname(percorso), { recursive: true });
  const temporaneo = `${percorso}.tmp-${process.pid}-${randomUUIDFn()}`;

  try {
    await writeFileFn(temporaneo, contenuto, { encoding: 'utf8', flush: true });
  } catch (errore) {
    /* ⛔ Qui il temporaneo SI PULISCE, ed è l'unico caso in cui è giusto: una scrittura fallita
       lascia byte a metà, e dei byte a metà non si salva niente. */
    try { await rmFn(temporaneo, { force: true }); } catch { /* può non essere mai nato: pulire è un di più, non una condizione. */ }
    throw errore;
  }

  try {
    await rinominaConRitento(temporaneo, percorso, { ...deps, renameFn });
  } catch (errore) {
    /*
     * ⛔⛔⛔ QUI IL TEMPORANEO NON SI BUTTA PIÙ, ed è un cambio di contratto voluto (12/09).
     *
     * Fino a stamattina questo ramo faceva `rm` del temporaneo, col motivo scritto accanto: «una
     * cartella di ricerca piena di `.tmp-` è il segno di un guasto inghiottito». Il motivo era
     * buono, la conclusione no: a questo punto la scrittura è **riuscita** — i byte sono interi e
     * già sul disco — ed è solo il rename a non essere passato. Cancellarli butta lavoro **già
     * pagato** per tenere pulita una cartella, che è esattamente lo scambio che il vincolo di
     * questo file vieta («ciò che è costato denaro non si sovrascrive mai»).
     * ⛔ E la cura al disordine non è buttare: è **dare un nome**. Il file resta accanto come
     *   `<nome>.non-rinominato` — dichiarato, riconoscibile, e **uno solo**: un secondo guasto
     *   sovrascrive quello di prima invece di accumulare scorie con un UUID diverso ogni volta.
     * ⛔ Se anche il parcheggio fallisce (la cartella intera è bloccata) non si lancia da qui: si
     *   tiene il nome casuale e lo si **dice**. Un errore di recupero che copre l'errore vero è
     *   il difetto che questo repo ha già pagato («il catch giusto nasconde il bug sbagliato»).
     */
    let dove = temporaneo;
    try {
      await renameFn(temporaneo, `${percorso}${SUFFISSO_NON_RINOMINATO}`);
      dove = `${percorso}${SUFFISSO_NON_RINOMINATO}`;
    } catch { /* resta col nome casuale, e il messaggio qui sotto lo dice per esteso. */ }
    /* ⛔ Si ARRICCHISCE l'errore originale invece di crearne uno nuovo: `code`, `errno`, `path` e
       la pila appartengono al guasto vero, e un chiamante che filtra sul codice deve continuare
       a vederlo. */
    errore.message = `${errore.message} — il file vecchio è intatto e il nuovo contenuto NON è perso: sta in ${dove}`;
    throw errore;
  }

  return percorso;
}

/**
 * @returns {Promise<Array<object>>} — [] se la cartella non esiste ancora
 * (mai un errore: nessuna ricerca avviata su questo progetto è uno
 * stato onesto, non un guasto). Più recenti prime, come `research_list`
 * mobile ("«che ricerche ho fatto» quasi sempre vuol dire «le ultime»").
 */
export async function elencaRicerche({ cartella }, deps = {}) {
  const readdirFn = deps.readdirFn ?? fsp.readdir;
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const cartellaRicerca = join(cartella, CARTELLA_RICERCA);
  let voci;
  try {
    voci = await readdirFn(cartellaRicerca, { withFileTypes: true });
  } catch {
    return [];
  }
  /*
   * ⭐ L4 — DUE FORME SULLO STESSO DISCO, e l'elenco le vede entrambe.
   * ⛔ La chiave è l'ID, non il file: durante una migrazione interrotta (meta.json già scritto,
   *   `<id>.json` non ancora tolto) la stessa ricerca esiste in due posti, e mostrarla due volte
   *   sarebbe un elenco che mente. Vince la CARTELLA — è la forma nuova, ed è quella che l'ultima
   *   scrittura ha prodotto.
   */
  const perId = new Map();
  for (const voce of voci) {
    const nome = typeof voce === 'string' ? voce : voce.name;
    const eCartella = typeof voce === 'string' ? false : voce.isDirectory();
    const percorso = eCartella ? join(cartellaRicerca, nome, NOME_META) : join(cartellaRicerca, nome);
    if (!eCartella && !nome.endsWith('.json')) continue;
    const id = eCartella ? nome : nome.slice(0, -'.json'.length);
    if (!eCartella && perId.has(id)) continue; // la cartella, già letta, vince sul file legacy.
    try {
      const letta = JSON.parse(await readFileFn(percorso, 'utf8'));
      if (eCartella || !perId.has(id)) perId.set(id, letta);
    } catch {
      // ⛔ una voce corrotta (o una cartella senza meta.json: una ricerca nuova può avere solo
      // il rapporto se la metadata non è ancora stata migrata) non impedisce di vedere le altre
      // — stesso principio di leggiRegistro (session-store.mjs) su un'ultima riga tollerata.
    }
  }
  const ricerche = [...perId.values()];
  ricerche.sort((a, b) => String(b.avviataAlle || '').localeCompare(String(a.avviataAlle || '')));
  return ricerche;
}

/**
 * ⭐ L4 — legge la voce nella forma di oggi (`<id>/meta.json`) e, se non c'è, in quella di ieri
 * (`<id>.json`). **Leggere non migra**: la migrazione costa una scrittura, e una scrittura su
 * venti voci solo per disegnare un elenco sarebbe esattamente la migrazione «in blocco» che il
 * disegno vieta. Si migra al primo tocco che scrive — vedi `migraRicerca`.
 *
 * @returns {Promise<object|null>} — null se l'id non esiste in nessuna delle due forme.
 */
export async function leggiRicerca({ cartella, id }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  for (const percorso of [percorsoMeta(cartella, id), percorsoVoceLegacy(cartella, id)]) {
    let grezzo;
    try {
      grezzo = await readFileFn(percorso, 'utf8');
    } catch (errore) {
      // ⛔ Non solo ENOENT: su Windows chiedere `<id>/meta.json` quando `<id>` è un FILE dà
      //   ENOTDIR/ENOENT a seconda del punto, e su POSIX dà ENOTDIR. Entrambi vogliono dire «in
      //   questa forma non c'è», non «il disco è rotto»: si prova l'altra forma.
      if (errore?.code === 'ENOENT' || errore?.code === 'ENOTDIR') continue;
      throw new ResearchStoreError(`${id}: metadata presente ma illeggibile: ${errore.message}`, 'RESEARCH_READ_FAILED');
    }
    return JSON.parse(grezzo);
  }
  return null;
}

/**
 * Crea la voce di metadata — chiamata da research-orchestrator.mjs SUBITO
 * dopo che avviaESegui ha già assegnato un sessionId: l'id di una
 * ricerca È il sessionId della sessione che la esegue (nessuna doppia
 * mappatura ricerca→sessione, un solo spazio di identità, mai
 * disallineabile).
 */
export async function creaRicerca({ cartella, id, domanda, profondita, padreId = null, nome = null, modello = null, modelloGiudice = null }, deps = {}) {
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  if (typeof id !== 'string' || id.length === 0) {
    throw new ResearchStoreError('Una ricerca vuole un id', 'RESEARCH_INVALID');
  }
  if (typeof domanda !== 'string' || domanda.trim().length === 0) {
    throw new ResearchStoreError('Una ricerca vuole una domanda', 'RESEARCH_INVALID');
  }
  if (!idRicercaValido(id)) {
    // ⛔ L4 — l'id è diventato un NOME DI CARTELLA: quello che prima poteva al più sporcare un
    //   nome di file adesso può attraversare il disco. Il controllo c'era già a valle (nel
    //   kernel, per il deposito); qui è a monte, sul dato, dove nasce.
    throw new ResearchStoreError(`id di ricerca non valido: ${String(id)}`, 'RESEARCH_INVALID');
  }
  const cartellaRicerca = cartellaDellaRicerca(cartella, id);
  await mkdirFn(cartellaRicerca, { recursive: true });
  const adesso = new Date().toISOString();
  const voce = {
    id, domanda: domanda.trim(), profondita: profondita || 'deep',
    titolo: null, avviataAlle: adesso, aggiornataAlle: adesso,
    terminata: null, reportLibraryId: null,
    /*
     * ⭐ L4 — il numero di formato. `2` = nata nella cartella, col giornale. Una voce senza
     * questo campo è nata prima dell'11/09 e il suo rapporto non può contenere il record
     * recintato: è l'unico caso in cui il cancello accetta il ripiego sulla forma minima.
     */
    formato: FORMATO_CORRENTE,
    /*
     * ⭐ L1/§6.6 (11/09) — DUE campi nuovi, entrambi `null` per ogni voce nata prima di oggi
     * (il lettore li normalizza, vedi `research-orchestrator.elenca`): non serve nessuna
     * migrazione, e nessuna riga già pagata viene riscritta.
     *
     * `padreId`: la sessione che ha chiamato `research_start`. Il 11/09 la ricerca
     * `d2a453a8` risultava `padreId:null` e all'owner è sembrata «una sessione nuova»: lo
     * era davvero, anche nel registro. Qui il legame è persistito ANCHE sulla metadata della
     * ricerca, non solo sulla voce di sessione, perché la sezione «Ricerca approfondita» la
     * legge dal disco anche dopo un riavvio, quando la voce di sessione non c'è più.
     *
     * `nome`: la domanda troncata — l'etichetta umana della riga in elenco. Stessa ragione:
     * il nome della SESSIONE vive in memoria (`voce.nome`), questo sopravvive al riavvio.
     */
    padreId: typeof padreId === 'string' && padreId.length > 0 ? padreId : null,
    nome: typeof nome === 'string' && nome.trim().length > 0 ? nome.trim() : null,
    /*
     * ⭐⭐⭐ L8 (12/09/2026) — CON QUALE MODELLO È STATA FATTA. Scritto qui e non dedotto.
     *
     * Il 12/09 la ricerca `3029dea2` è partita con `z-ai/glm-4.7-flash` mentre la chat che
     * l'aveva ordinata girava con `z-ai/glm-5.3-flash` (intestazioni delle due sessioni nello
     * store: `modello` riga 1 di ciascun `.jsonl`). Nessuno poteva accorgersene dalla sezione,
     * perché la voce della ricerca non diceva con che cosa fosse stata fatta — e due ricerche
     * fatte con due modelli diversi non sono confrontabili.
     *
     * ⛔ `null` per ogni voce nata prima di oggi: onesto, mai il modello di oggi attribuito a
     *   una corsa di ieri. E sulla METADATA, non solo sulla voce di sessione, perché la voce
     *   di sessione vive in memoria e la sezione legge dal disco anche dopo un riavvio.
     */
    modello: typeof modello === 'string' && modello.trim().length > 0 ? modello.trim() : null,
    /*
     * ⭐⭐⭐ L9 (12/09/2026) — CHI GIUDICHERÀ, scelto alla NASCITA e non al deposito.
     *
     * ⛔ Perché qui e non dopo: la scelta del giudice è «chiunque tranne l'autore»
     *   (`verification.mjs:talosResearchPickJudge`), e l'autore è il modello di QUESTA corsa.
     *   Deciderlo al momento del deposito vorrebbe dire rileggere quale modello fosse
     *   configurato allora — cioè un'altra ora, un'altra impostazione, un altro giudice, e un
     *   rapporto che non sa dire chi l'ha controllato. Scritto alla nascita, sopravvive a un
     *   riavvio come tutto il resto della metadata.
     * ⛔ `null` è una risposta VERA e frequente: nessun altro modello ammesso oltre all'autore.
     *   Allora il rapporto esce con `judge: null` e lo DICE («nessun giudice indipendente
     *   disponibile: l'autore non può verificare sé stesso»), invece di far timbrare al modello
     *   le proprie affermazioni. La misura che lo vieta è vecchia e netta: Panickssery, Bowman
     *   e Feng, «LLM Evaluators Recognize and Favor Their Own Generations» (arXiv:2404.13076,
     *   15/04/2024, letta il 12/09/2026) — «a linear correlation between self-recognition
     *   capability and the strength of self-preference bias».
     */
    modelloGiudice: typeof modelloGiudice === 'string' && modelloGiudice.trim().length > 0 ? modelloGiudice.trim() : null,
  };
  // ⛔ L4 — atomica anche alla nascita: una voce scritta a metà è una ricerca che l'elenco non
  //   vede più, e la sessione che la esegue sta già spendendo denaro.
  await scriviAtomico(percorsoMeta(cartella, id), JSON.stringify(voce, null, 2), { ...deps, writeFileFn, mkdirFn });
  return voce;
}

/**
 * ⭐⭐⭐ L4 — LA MIGRAZIONE, AL PRIMO TOCCO CHE SCRIVE. Mai in blocco.
 *
 * Una ricerca vecchia vive in `<id>.json`. Quando qualcosa la aggiorna (e solo allora) la voce
 * passa in `<id>/meta.json`, e il file vecchio si toglie **dopo** che il nuovo è sul disco.
 *
 * ⛔ L'ordine non è arbitrario ed è tutto il punto: se il processo muore fra le due operazioni,
 *   sul disco ci sono ENTRAMBE le copie — `elencaRicerche` dà la precedenza alla cartella,
 *   quindi la ricerca appare una volta sola e con i dati NUOVI. L'ordine opposto (togliere prima
 *   di scrivere) avrebbe una finestra in cui la ricerca non esiste: è la classe di guasto di
 *   `writeFileSync(dove,'')`, e non si ripete.
 * ⛔ `formato` resta **assente** su ciò che è migrato, e non è una dimenticanza: quella voce è
 *   nata quando il record recintato non esisteva, e il cancello di consegna deve continuare a
 *   saperlo per sempre. Un `formato: 2` messo qui trasformerebbe una migrazione di contenitore
 *   in una promessa sul contenuto.
 *
 * @returns {Promise<object|null>} — la voce migrata, o `null` se non c'era niente da migrare.
 */
export async function migraRicerca({ cartella, id }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const rmFn = deps.rmFn ?? fsp.rm;
  if (!idRicercaValido(id)) return null;
  const legacy = percorsoVoceLegacy(cartella, id);
  let grezzo;
  try {
    grezzo = await readFileFn(legacy, 'utf8');
  } catch {
    return null; // niente forma vecchia: o è già migrata, o non è mai esistita.
  }
  let voce;
  try {
    voce = JSON.parse(grezzo);
  } catch (errore) {
    // ⛔ Un `<id>.json` illeggibile NON si cancella e NON si sostituisce: è l'unica copia di
    //   qualcosa che è costato denaro. Si dice, e si lascia dov'è.
    throw new ResearchStoreError(`${id}: la voce da migrare è illeggibile, lasciata dov'era: ${errore.message}`, 'RESEARCH_READ_FAILED');
  }
  await scriviAtomico(percorsoMeta(cartella, id), JSON.stringify({ ...voce, migrataDa: `${id}.json` }, null, 2), deps);
  await rmFn(legacy, { force: true });
  return { ...voce, migrataDa: `${id}.json` };
}

/**
 * Aggiorna campi (titolo/terminata/reportLibraryId) — `null` se l'id non
 * esiste. `undefined` per un campo significa "non toccarlo" (mai
 * confuso con `null`, un valore esplicito — stesso principio già
 * imparato sul clamping di `limit` in Notes: non trattare "assente"
 * come "falso"). Mai il campo "in corso": si deriva dal vivo (vedi la
 * doc di testa), questa funzione non può farlo disallineare.
 *
 * ⭐⭐⭐ L2 (11/09) — `terminata` non è più solo `'done'|'failed'|'cancelled'`: vedi
 * `STATI_TERMINATI` qui sotto. Questa funzione NON valida il valore, di proposito — è lo
 * stesso principio già in uso per `titolo`: lo store scrive ciò che il chiamante decide, e
 * la macchina degli stati vive tutta in `research-orchestrator.mjs`, in un posto solo.
 */
export async function aggiornaRicerca({ cartella, id, titolo, terminata, reportLibraryId, conclusaAlle, ultimoMessaggio, motivoDettaglio }, deps = {}) {
  /*
   * ⭐⭐⭐ L4 — QUESTO È «IL PRIMO TOCCO». Un aggiornamento è una scrittura: se la voce è ancora
   * nella forma vecchia, qui si migra — una volta, per quella ricerca, e solo perché stavamo
   * comunque per scrivere. Nessun costo aggiunto a chi legge.
   */
  await migraRicerca({ cartella, id }, deps);
  const voce = await leggiRicerca({ cartella, id }, deps);
  if (!voce) return null;
  const aggiornata = {
    ...voce,
    titolo: titolo !== undefined ? titolo : voce.titolo,
    terminata: terminata !== undefined ? terminata : voce.terminata,
    reportLibraryId: reportLibraryId !== undefined ? reportLibraryId : voce.reportLibraryId,
    /*
     * ⭐ L2 (11/09) — TRE campi nuovi, stessa disciplina «undefined = non toccarlo» degli altri.
     * `conclusaAlle`: l'istante in cui la ricerca è finita DAVVERO. Prima si leggeva
     *   `aggiornataAlle`, che però si muove a ogni rinomina: una ricerca rinominata sembrava
     *   essersi conclusa il giorno della rinomina.
     * `ultimoMessaggio`: ciò che il modello ha detto alla fine — un ALLEGATO, mai il rapporto.
     * `motivoDettaglio`: il pezzo variabile della frase umana (es. «il rapporto non elenca
     *   nessuna fonte»), perché la frase la compone il lettore e il dettaglio lo sa solo chi ha
     *   riletto il file in quel momento.
     */
    conclusaAlle: conclusaAlle !== undefined ? conclusaAlle : (voce.conclusaAlle ?? null),
    ultimoMessaggio: ultimoMessaggio !== undefined ? ultimoMessaggio : (voce.ultimoMessaggio ?? null),
    motivoDettaglio: motivoDettaglio !== undefined ? motivoDettaglio : (voce.motivoDettaglio ?? null),
    aggiornataAlle: new Date().toISOString(),
  };
  await scriviAtomico(percorsoMeta(cartella, id), JSON.stringify(aggiornata, null, 2), deps);
  return aggiornata;
}

/**
 * Elimina SOLO la metadata — il rapporto in Libreria (se esiste) è
 * responsabilità del CHIAMANTE (research-orchestrator.mjs, che conosce
 * `reportLibraryId` PRIMA di chiamare questa funzione e compone le due
 * cancellazioni, stesso principio "questo file non sa COME" già in uso
 * altrove). `null` se l'id non esiste già (idempotente, mai
 * un'eccezione — stesso principio di `eliminaVoce` in library-store.mjs,
 * "It may already be gone").
 */
export async function eliminaRicerca({ cartella, id }, deps = {}) {
  const rmFn = deps.rmFn ?? fsp.rm;
  if (!idRicercaValido(id)) return null;
  const esistente = await leggiRicerca({ cartella, id }, deps);
  if (!esistente) return null;
  /*
   * ⭐ L4 — adesso una ricerca è una CARTELLA: si toglie tutta (giornale, piano, fonti,
   * rapporto), non solo la voce. ⛔ Ed è una cancellazione CHIESTA da una persona (o dal
   * modello via `research_delete`), non un effetto collaterale: è l'unico posto di questo file
   * dove qualcosa di pagato sparisce, e sparisce perché qualcuno l'ha ordinato.
   * ⛔ Si toglie anche il `<id>.json` di una ricerca mai migrata: altrimenti l'elenco
   *   continuerebbe a mostrare una ricerca dichiarata eliminata.
   */
  await rmFn(cartellaDellaRicerca(cartella, id), { recursive: true, force: true });
  await rmFn(percorsoVoceLegacy(cartella, id), { force: true });
  return { id };
}

/*
 * ─────────────────────────────────────────────────────────────────────────
 * L1+L2 (11/09/2026) — LA CARTELLA DELLA RICERCA, IL RAPPORTO E LA SUA FORMA
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ⛔ Perché esiste, riprodotto sui dati veri (sessione `d2a453a8-67e3-4c7a-85a0-c3e1dbe10b35`
 *   del 4174, 11/09, ore 18:56-19:00): la ricerca partiva `permessi:'Read only'`
 *   (`research-orchestrator.mjs:170`, scritto a mano), `document_create` le veniva offerto lo
 *   stesso e negato a runtime (`REFUSED. la sessione è in sola lettura…`, due volte), e «il
 *   rapporto» era l'ULTIMO MESSAGGIO con del testo — cioè 290 byte di scusa, salvati in
 *   Libreria come `Research - ….md` e timbrati `terminata:'done'`. 9 `web_search`, 14 `naviga`,
 *   484.171 token di ingresso pagati, e il documento permanente era la frase con cui il modello
 *   si giustificava per non averlo scritto. Nessun errore da nessuna parte.
 *
 * ⇒ Il rapporto smette di essere «l'ultima frase» e diventa un ARTEFATTO su disco, depositato
 *   da un attrezzo dedicato (`research_deposit`) dentro la cartella della ricerca. Questo file
 *   sa DOVE vive e CHE FORMA MINIMA deve avere; non sa chi lo scrive.
 *
 * ⭐ Ricerca web PRIMA di scrivere (obbligo owner), fonte + data:
 *   - «Agent Safety Is Action Alignment», Li & Zhao — arXiv:2606.28739, 27/06/2026: il minimo
 *     privilegio va imposto «outside the model at the action boundary», non con l'allineamento
 *     del modello. ⇒ il confine è il cancello del kernel; la forma del rapporto qui sotto è un
 *     controllo di PRODOTTO, mai il confine di sicurezza.
 *   - «When Lower Privileges Suffice: Investigating Over-Privileged Tool Selection in LLM
 *     Agents», Yang, Bu, Yi et al. — arXiv:2606.20023, 18/06/2026 (v2 07/07): la scelta di un
 *     attrezzo a privilegio più alto quando ne basterebbe uno più basso è comune «and is further
 *     amplified by transient failures». ⇒ è ESATTAMENTE la corsa di stasera: dopo il primo
 *     REFUSED il modello ha insistito con `document_create` invece di cercare una via più
 *     stretta. La cura non è un prompt migliore («prompt-level controls provide only limited
 *     mitigation»): è togliere dalla lista l'attrezzo più largo e offrirne uno più stretto.
 */

/** La cartella di UNA ricerca: `<progetto>/.harness-ui-research/<id>/`. Mai l'id nudo dal modello — vedi `idRicercaValido`. */
export function cartellaDellaRicerca(cartella, id) {
  return join(cartella, CARTELLA_RICERCA, id);
}

/** Il rapporto di UNA ricerca. Un nome solo, deciso qui: chi scrive e chi rilegge non possono divergere. */
export const NOME_RAPPORTO = 'rapporto.md';

export function percorsoRapporto(cartella, id) {
  return join(cartellaDellaRicerca(cartella, id), NOME_RAPPORTO);
}

/**
 * ⛔ Un id di ricerca è UN SOLO segmento di percorso, e solo caratteri che non possono
 * attraversare una cartella: niente `/`, niente backslash, niente `:`, niente `.`/`..`. È la
 * stessa disciplina di `resolve`+`startsWith` che il kernel applica al percorso finale, ma
 * spostata a monte, sul DATO — due controlli indipendenti sullo stesso confine, non uno
 * ripetuto. (Gli UUID di `randomUUID()` passano; qualunque tentativo di uscire no.)
 */
export function idRicercaValido(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

/**
 * `resolve` + `startsWith(radice + sep)` — la STESSA forma del controllo di
 * `livello-scrittura-area` nel kernel (`talosHarness.mjs`), scritta una volta sola qui perché
 * la usano sia il deposito sia i test. ⛔ `radice` assente non è un «vince tutto»: senza una
 * radice da controllare un percorso non è verificabile, quindi è FUORI.
 */
export function dentroLaRadice(radice, percorso) {
  if (typeof radice !== 'string' || radice.length === 0) return false;
  if (typeof percorso !== 'string' || percorso.length === 0) return false;
  const r = resolve(radice);
  const p = resolve(percorso);
  return p === r || p.startsWith(r + sep);
}

/**
 * Salva il rapporto di una ricerca — usato dall'attrezzo `research_deposit`.
 * ⛔ Il percorso NON viene mai dal modello: si ricostruisce qui da `cartella` (del progetto) e
 * `id` (della ricerca, che il server conosce). Il controllo `dentroLaRadice` resta comunque,
 * in seconda battuta: un cancello si prova anche quando la prima difesa dovrebbe bastare.
 * @returns {Promise<{percorso:string, byte:number}>}
 */
export async function scriviRapporto({ cartella, id, testo }, deps = {}) {
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  if (!idRicercaValido(id)) throw new ResearchStoreError(`id di ricerca non valido: ${String(id)}`, 'RESEARCH_INVALID');
  if (typeof testo !== 'string' || testo.trim().length === 0) {
    throw new ResearchStoreError('Un rapporto vuole del testo', 'RESEARCH_INVALID');
  }
  const radice = cartellaDellaRicerca(cartella, id);
  const percorso = percorsoRapporto(cartella, id);
  if (!dentroLaRadice(radice, percorso)) {
    throw new ResearchStoreError(`${percorso} non risolve dentro ${radice}`, 'RESEARCH_INVALID');
  }
  await mkdirFn(radice, { recursive: true });
  // ⛔ L4 — atomica: un rapporto è il prodotto per cui la ricerca è stata pagata. Se la scrittura
  //   muore a metà, quello che c'era prima (un deposito precedente) resta leggibile.
  await scriviAtomico(percorso, testo, { ...deps, mkdirFn, writeFileFn });
  return { percorso, byte: Buffer.byteLength(testo, 'utf8') };
}

/** @returns {Promise<string|null>} — il testo del rapporto, `null` se non esiste (mai un'eccezione per un'assenza). */
export async function leggiRapporto({ cartella, id }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  if (!idRicercaValido(id)) return null;
  try {
    return await readFileFn(percorsoRapporto(cartella, id), 'utf8');
  } catch {
    return null;
  }
}

/**
 * ⭐⭐⭐ LA FORMA MINIMA DI UN RAPPORTO — il cancello di consegna del disegno §6.5.
 *
 * ⛔ È DICHIARATAMENTE MINIMA, e il perché sta scritto qui invece che in una nota: il record
 *   recintato vero (piano, linee, affermazioni con verdetto, fonti con citazione) arriva da
 *   `src/research/report.mjs`, che un altro agente sta portando dal mobile in parallelo. Fino
 *   ad allora questa funzione controlla TRE cose sole, e `research-orchestrator.mjs` accetta un
 *   `rileggiRapportoFn` iniettabile perché il giorno in cui quel record esiste si cambia il
 *   PUNTO DI INNESTO, non la macchina degli stati.
 *
 * Le tre cose, e perché proprio queste:
 *   1. un'INTESTAZIONE (una riga che comincia con `#`) — un rapporto ha un titolo; una scusa no;
 *   2. almeno un'AFFERMAZIONE — una riga di prosa fuori dalla sezione fonti;
 *   3. almeno una FONTE — un URL http(s) dentro una sezione fonti/sources/riferimenti.
 *
 * ⛔ Il punto 3 è quello che la scusa di stasera non poteva superare in nessun modo, ed è anche
 *   quello che la ricerca accademica indica come la misura da mostrare: «Sci-MMR»
 *   (arXiv:2609.11243, 10/09/2026) misura che l'accuratezza della risposta supera di oltre 20
 *   punti il recupero completo delle PROVE — cioè si risponde bene senza avere le prove. Un
 *   rapporto senza una fonte non è un rapporto corto: è un rapporto senza il pezzo che conta.
 *
 * ⛔ NON controlla la lunghezza minima e NON giudica la qualità: un rapporto breve ma
 *   documentato passa, ed è giusto così. Il cancello dice «c'è un artefatto rileggibile», non
 *   «è un buon artefatto» — confonderli produrrebbe la bugia opposta.
 *
 * @returns {{ok:boolean, intestazione:string|null, affermazioni:number, fonti:string[], motivo:string|null}}
 */
export function rileggiRapportoMinimo(testo) {
  if (typeof testo !== 'string' || testo.trim().length === 0) {
    return { ok: false, intestazione: null, affermazioni: 0, fonti: [], motivo: 'il rapporto è vuoto' };
  }
  const righe = testo.split(/\r?\n/);
  const rigaTitolo = righe.find((r) => /^#{1,6}\s+\S/.test(r.trim()));
  const intestazione = rigaTitolo ? rigaTitolo.trim().replace(/^#{1,6}\s+/, '') : null;
  /*
   * ⛔ «Dentro la sezione fonti» si decide riga per riga, non cercando gli URL ovunque: un URL
   * citato in mezzo alla prosa è una citazione, non la bibliografia — e un rapporto che elenca
   * le sue fonti è esattamente ciò che «Cited but Not Verified» (arXiv:2605.06635, 07/05/2026)
   * misura come il pezzo che gli agenti di ricerca profonda sbagliano di più: la fonte sostiene
   * davvero l'affermazione solo il 39-77% delle volte. Verificarle richiede prima di AVERLE.
   */
  const INTESTAZIONE_FONTI = /^#{1,6}\s*(fonti|sources|riferimenti|references|bibliografia)\b/i;
  let inFonti = false;
  const fonti = [];
  let affermazioni = 0;
  for (const grezza of righe) {
    const riga = grezza.trim();
    if (/^#{1,6}\s+\S/.test(riga)) {
      inFonti = INTESTAZIONE_FONTI.test(riga);
      continue;
    }
    if (riga.length === 0) continue;
    if (inFonti) {
      const url = riga.match(/https?:\/\/[^\s)<>\]"']+/g);
      if (url) fonti.push(...url);
      continue;
    }
    // una riga di prosa: non un separatore orizzontale, non una riga vuota.
    if (/^[-*_=\s|]+$/.test(riga)) continue;
    affermazioni += 1;
  }
  if (!intestazione) return { ok: false, intestazione: null, affermazioni, fonti, motivo: 'il rapporto non ha un\'intestazione' };
  if (affermazioni === 0) return { ok: false, intestazione, affermazioni, fonti, motivo: 'il rapporto non contiene nessuna affermazione' };
  if (fonti.length === 0) return { ok: false, intestazione, affermazioni, fonti, motivo: 'il rapporto non elenca nessuna fonte' };
  return { ok: true, intestazione, affermazioni, fonti, motivo: null };
}

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * L4 — IL GIORNALE, IL PIANO E LE FONTI TENUTE
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * ⭐⭐⭐ LA CODA PER PERCORSO — copiata, non reinventata, da `session-store.mjs` (W0-07, 04/09).
 *
 * ⛔ Perché serve, e non è prudenza teorica: nello store dell'owner il file `b7b1b7d2…` (31/08)
 *   aveva quattro righe rotte, la prima spezzata a **1.572.866 byte, esattamente 1,5 MiB**,
 *   perché due `appendFile` concorrenti si erano intrecciati. `O_APPEND` è atomico per SINGOLA
 *   chiamata di scrittura: un record grande viene spezzato in più chiamate, ed è lì che due
 *   scrittori si infilano l'uno dentro l'altro. ⇒ le scritture sullo STESSO file si mettono in
 *   fila; file diversi non si aspettano (la chiave è il percorso), così una ricerca lenta non
 *   rallenta le altre.
 * ⛔ Un errore su una scrittura non blocca la coda: la successiva parte comunque.
 */
const codeDelGiornale = new Map();

/**
 * ⭐⭐⭐ UN EVENTO NEL GIORNALE — SOLO APPEND, MAI UNA RISCRITTURA.
 *
 * `evento` è uno degli undici che `src/research/run.mjs` conosce (`TalosResearchEvent`): questo
 * file non li interpreta, li mette a registro. ⛔ Il giornale porta FATTI e RIFERIMENTI, mai il
 * carico: il testo di una pagina sta in `fonti/<sha256>.txt` e nel giornale ne compare il nome
 * (`resultRef`). Un giornale che porta cento kilobyte per riga è un giornale che nessuno
 * rigioca.
 *
 * ⭐ `flush: true` di default — ed è la DIFFERENZA dichiarata rispetto a `session-store.mjs`,
 *   che di proposito non fa `fsync` a ogni riga. La ragione è che le due cose non hanno lo
 *   stesso valore: là ogni riga è un evento di interfaccia fra migliaia, qui una riga è un passo
 *   di ricerca PAGATO, e sono pochi per corsa. La ricerca del 04/09 lo diceva già e allora era
 *   restato debito: «una scrittura riuscita vive nella cache del kernel finché non c'è un
 *   `fsync`». Qui il debito si chiude, perché qui si può permettere.
 *
 * @returns {Promise<void>}
 */
export async function accodaEvento({ cartella, id, evento, durevole = true }, deps = {}) {
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const appendFileFn = deps.appendFileFn ?? fsp.appendFile;
  if (!idRicercaValido(id)) throw new ResearchStoreError(`id di ricerca non valido: ${String(id)}`, 'RESEARCH_INVALID');
  if (!evento || typeof evento !== 'object' || typeof evento.kind !== 'string' || evento.kind.length === 0) {
    throw new ResearchStoreError('Un evento del giornale vuole un `kind`', 'RESEARCH_INVALID');
  }
  const percorso = percorsoGiornale(cartella, id);
  // ⛔ Serializzato SUBITO, non dentro la coda: `evento` potrebbe cambiare mentre aspetta il turno.
  const riga = `${JSON.stringify(evento)}\n`;
  const precedente = codeDelGiornale.get(percorso) ?? Promise.resolve();
  const corrente = precedente.catch(() => {}).then(async () => {
    await mkdirFn(dirname(percorso), { recursive: true });
    await appendFileFn(percorso, riga, durevole ? { encoding: 'utf8', flush: true } : 'utf8');
  });
  codeDelGiornale.set(percorso, corrente);
  corrente.catch(() => {}).finally(() => {
    if (codeDelGiornale.get(percorso) === corrente) codeDelGiornale.delete(percorso);
  });
  return corrente;
}

/**
 * ⭐⭐⭐ IL GIORNALE RILETTO — E NON SI RIFIUTA MAI DI CARICARE.
 *
 * ⛔ Una riga illeggibile si **salta**, ovunque sia, e si conta. È una deviazione VOLUTA da
 *   `session-store.leggiRegistro`, che invece lancia su una riga rotta che non sia l'ultima, e
 *   il motivo è scritto nella testa di `src/research/run.mjs`: «l'unica cosa che non deve fare
 *   mai è rifiutarsi di caricare: un giro che non si può rigiocare è un giro il cui lavoro
 *   pagato è perso». Là il file è una trascrizione da mostrare; qui è la prova di ciò che è
 *   stato speso, e perderla tutta per una riga è il guasto peggiore dei due.
 * ⛔ `righeSaltate` non è decorazione: senza quel numero «il giornale si è caricato» e «il
 *   giornale si è caricato per intero» sarebbero la stessa frase, e non lo sono.
 *
 * @returns {Promise<{eventi: object[], righeSaltate: number, byte: number}>}
 */
export async function leggiGiornale({ cartella, id }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const vuoto = { eventi: [], righeSaltate: 0, byte: 0 };
  if (!idRicercaValido(id)) return vuoto;
  let testo;
  try {
    testo = await readFileFn(percorsoGiornale(cartella, id), 'utf8');
  } catch {
    return vuoto; // nessun giornale è uno stato onesto: una ricerca vecchia non ne ha mai avuto uno.
  }
  const eventi = [];
  let righeSaltate = 0;
  for (const riga of testo.split('\n')) {
    if (riga.trim() === '') continue;
    try {
      const letto = JSON.parse(riga);
      if (letto && typeof letto === 'object' && typeof letto.kind === 'string') eventi.push(letto);
      else righeSaltate += 1;
    } catch {
      righeSaltate += 1; // riga mozzata da un processo morto a metà `appendFile`, o rumore: si salta.
    }
  }
  return { eventi, righeSaltate, byte: Buffer.byteLength(testo, 'utf8') };
}

/** Il piano approvato, scritto atomicamente. `piano` è `TalosResearchBranch[]` (vedi `run.mjs`). */
export async function scriviPiano({ cartella, id, piano }, deps = {}) {
  if (!idRicercaValido(id)) throw new ResearchStoreError(`id di ricerca non valido: ${String(id)}`, 'RESEARCH_INVALID');
  await scriviAtomico(percorsoPiano(cartella, id), JSON.stringify(piano, null, 2), deps);
  return percorsoPiano(cartella, id);
}

/** @returns {Promise<object|null>} — `null` se non c'è (o è illeggibile): un piano assente non è un guasto. */
export async function leggiPiano({ cartella, id }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  if (!idRicercaValido(id)) return null;
  try {
    return JSON.parse(await readFileFn(percorsoPiano(cartella, id), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * ⭐⭐⭐ IL TESTO TENUTO DI UNA FONTE, INDIRIZZATO DAL CONTENUTO.
 *
 * Il nome del file è lo `sha256` del testo. Tre cose vengono gratis, e nessuna è un vezzo:
 *  1. **due linee d'indagine che leggono la stessa pagina la tengono una volta sola** — è il
 *     caso normale (§6.2, e la cache del fetch di L6 punta allo stesso risparmio);
 *  2. **niente si sovrascrive mai**: stesso contenuto ⇒ stesso nome ⇒ la seconda scrittura non
 *     ha niente da cambiare, e si salta. È il vincolo «ciò che è costato denaro» applicato
 *     senza dover ricordare di applicarlo;
 *  3. il `resultRef` del giornale è un nome **stabile e verificabile**: chi rilegge può
 *     ricalcolare l'impronta e accorgersi se il file è stato manomesso.
 *
 * @returns {Promise<{ref:string, percorso:string, byte:number, giaPresente:boolean}>}
 */
export async function scriviFonte({ cartella, id, testo }, deps = {}) {
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const statFn = deps.statFn ?? fsp.stat;
  if (!idRicercaValido(id)) throw new ResearchStoreError(`id di ricerca non valido: ${String(id)}`, 'RESEARCH_INVALID');
  if (typeof testo !== 'string' || testo.length === 0) {
    throw new ResearchStoreError('Una fonte tenuta vuole del testo', 'RESEARCH_INVALID');
  }
  const impronta = createHash('sha256').update(testo, 'utf8').digest('hex');
  const ref = `${CARTELLA_FONTI}/${impronta}.txt`;
  const percorso = join(cartellaDelleFonti(cartella, id), `${impronta}.txt`);
  await mkdirFn(cartellaDelleFonti(cartella, id), { recursive: true });
  try {
    await statFn(percorso);
    return { ref, percorso, byte: Buffer.byteLength(testo, 'utf8'), giaPresente: true };
  } catch { /* non c'è ancora: si scrive. */ }
  await scriviAtomico(percorso, testo, deps);
  return { ref, percorso, byte: Buffer.byteLength(testo, 'utf8'), giaPresente: false };
}

/**
 * Rilegge una fonte tenuta dal suo `ref` (`fonti/<sha256>.txt`).
 *
 * ⛔ Il `ref` arriva dal giornale, cioè da un file su disco che qualcuno potrebbe aver
 *   modificato: si accetta **solo** la forma esatta `fonti/<64 esadecimali>.txt`, e in più il
 *   percorso risolto si ricontrolla con `dentroLaRadice`. Due difese indipendenti sullo stesso
 *   confine, come già per il deposito del rapporto (L1) — mai una sola.
 *
 * @returns {Promise<string|null>}
 */
export async function leggiFonte({ cartella, id, ref }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  if (!idRicercaValido(id)) return null;
  const combacia = typeof ref === 'string' ? ref.match(/^fonti\/([0-9a-f]{64})\.txt$/) : null;
  if (!combacia) return null;
  const percorso = join(cartellaDelleFonti(cartella, id), `${combacia[1]}.txt`);
  if (!dentroLaRadice(cartellaDellaRicerca(cartella, id), percorso)) return null;
  try {
    return await readFileFn(percorso, 'utf8');
  } catch {
    return null;
  }
}

/**
 * ⭐⭐⭐ L9 — L'INDICE delle fonti tenute: url → ref, più ciò che la fonte dichiara di sé.
 *
 * ⛔ Si riscrive per intero e in modo ATOMICO, mai in append: è una mappa, non un registro, e
 *   una mappa scritta a pezzi può finire con due voci per lo stesso indirizzo che si
 *   contraddicono. Il registro solo-append è il giornale, e ha un altro mestiere.
 * ⛔ Una voce nuova NON cancella una vecchia con lo stesso url a meno che non sia più FORTE:
 *   `page` batte `snippet`, e mai il contrario — una prova più debole non deve poter
 *   sostituire una più forte (`raccolta-viva.mjs` fa la stessa scelta in memoria).
 *
 * @param {{cartella: string, id: string, voci: readonly object[]}} input
 */
export async function scriviIndiceFonti({ cartella, id, voci }, deps = {}) {
  if (!idRicercaValido(id)) throw new ResearchStoreError(`id di ricerca non valido: ${String(id)}`, 'RESEARCH_INVALID');
  const elenco = Array.isArray(voci) ? voci : [];
  await scriviAtomico(percorsoIndiceFonti(cartella, id), JSON.stringify(elenco, null, 2), deps);
  return percorsoIndiceFonti(cartella, id);
}

/** @returns {Promise<readonly object[]>} — `[]` se non c'è o è illeggibile: un indice assente non è un guasto. */
export async function leggiIndiceFonti({ cartella, id }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  if (!idRicercaValido(id)) return [];
  try {
    const letto = JSON.parse(await readFileFn(percorsoIndiceFonti(cartella, id), 'utf8'));
    return Array.isArray(letto) ? letto : [];
  } catch {
    return [];
  }
}

/** I `ref` delle fonti tenute, in ordine stabile. `[]` se non ce ne sono (mai un errore). */
export async function elencaFonti({ cartella, id }, deps = {}) {
  const readdirFn = deps.readdirFn ?? fsp.readdir;
  if (!idRicercaValido(id)) return [];
  try {
    const nomi = await readdirFn(cartellaDelleFonti(cartella, id));
    return nomi.filter((n) => /^[0-9a-f]{64}\.txt$/.test(n)).sort().map((n) => `${CARTELLA_FONTI}/${n}`);
  } catch {
    return [];
  }
}

/**
 * ⭐ L4 — L'IMPRONTA DEL RAPPORTO, per la cache dell'elenco.
 *
 * `elenca()` adesso rilegge il rapporto di ogni voce `done` (la lista mentiva: mostrava
 * «Conclusa» dove il dettaglio diceva «senza rapporto»). Venti letture a ogni apertura della
 * sezione però si pagano, e si pagherebbero anche quando non è cambiato niente: questa funzione
 * dà `mtimeMs` e `size`, che sono la chiave con cui il lettore sa se può riusare il giudizio già
 * dato. ⛔ `null` se il rapporto non c'è: un'assenza non è un guasto, ed è essa stessa una
 * risposta valida da mettere in cache.
 *
 * @returns {Promise<{mtimeMs:number, size:number}|null>}
 */
export async function statRapporto({ cartella, id }, deps = {}) {
  const statFn = deps.statFn ?? fsp.stat;
  if (!idRicercaValido(id)) return null;
  try {
    const s = await statFn(percorsoRapporto(cartella, id));
    return { mtimeMs: Number(s.mtimeMs), size: Number(s.size) };
  } catch {
    return null;
  }
}

/** L'istantanea della cache del fetch, accanto al giornale. */
export const NOME_CACHE_FETCH = 'cache.json';

export function percorsoCacheFetch(cartella, id) {
  return join(cartella, CARTELLA_RICERCA, id, NOME_CACHE_FETCH);
}

/**
 * ⭐⭐⭐ L4 + L6 — L'ISTANTANEA DELLA CACHE DEL FETCH, SU DISCO.
 *
 * `src/research/fetch-cache.mjs` produce con `snapshot()` un oggetto JSON-serializzabile e
 * dichiara, nella sua stessa doc, che «questo modulo non scrive niente su disco»: la scrittura
 * è di chi persiste, cioè di qui. ⛔ Atomica come tutto il resto — un'istantanea scritta a metà
 * farebbe ripagare pagine già pagate, che è esattamente il costo che esiste per evitare.
 */
export async function scriviIstantaneaCache({ cartella, id, istantanea }, deps = {}) {
  if (!idRicercaValido(id)) throw new ResearchStoreError(`id di ricerca non valido: ${String(id)}`, 'RESEARCH_INVALID');
  await scriviAtomico(percorsoCacheFetch(cartella, id), JSON.stringify(istantanea), deps);
  return percorsoCacheFetch(cartella, id);
}

/**
 * @returns {Promise<object|null>} — `null` se non c'è o non è JSON.
 * ⛔ Non valida la VERSIONE: quella la controlla `restore()` nel modulo che la possiede, e
 *   duplicare qui il numero di versione creerebbe due posti che divergono. Qui si dice solo se
 *   c'è qualcosa di leggibile; il giudizio su cosa farne è di chi sa cos'è.
 */
export async function leggiIstantaneaCache({ cartella, id }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  if (!idRicercaValido(id)) return null;
  try {
    return JSON.parse(await readFileFn(percorsoCacheFetch(cartella, id), 'utf8'));
  } catch {
    return null;
  }
}

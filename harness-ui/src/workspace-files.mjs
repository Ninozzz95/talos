/**
 * workspace-files.mjs — le azioni sul singolo file dell'albero workspace
 * che oggi mancano (piano `elegant-spinning-dongarra.md`, owner 27/8:
 * "Non ha nessun'opzione per rinominare i file, per aprire i file, per
 * aprirli nel visualizza file explorer di Windows. Non ha opzioni per
 * eliminarlo, per allegarlo nella chat").
 *
 * ⛔ Deliberatamente FUORI da `talosHarness.mjs`: queste sono azioni
 * dell'OWNER sull'albero (mai un tool-call del modello), quindi non
 * hanno bisogno di passare dal kernel benchmarkato — `discoNode` espone
 * solo `elenca`/`leggi`/`scrivi` (verificato leggendo il sorgente prima
 * di scrivere questo file, non presunto), niente rinomina/elimina.
 * Aggiungerle lì avrebbe richiesto un'altra ri-misura TALOS-BANCO per
 * un bisogno che non tocca affatto il banco.
 *
 * ⛔⛔ Stessa disciplina di path-policy.mjs/workspace-tree.mjs: ogni
 * percorso arriva da una richiesta HTTP, non da un modello cooperativo
 * — `isPathInside` (path-policy.mjs, riusato non duplicato) valida
 * SEMPRE il percorso REALE (dopo aver risolto eventuali symlink) contro
 * la radice reale della sessione, mai la stringa grezza.
 */
import { promises as fsp, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

import { isPathInside } from './path-policy.mjs';
import { createProcessPolicy } from './process-policy.mjs';

const EXPLORER_PROCESS_POLICY = createProcessPolicy({ allowedExecutables: ['explorer.exe', 'explorer'] });

export class WorkspaceFileError extends Error {
  constructor(message, code = 'QUERY_INVALID') {
    super(message);
    this.name = 'WorkspaceFileError';
    this.code = code;
  }
}

/** ⛔ 512 KB: un'anteprima, non un editor — file più grandi si dichiarano troppo grandi invece di essere troncati in silenzio. */
const DIMENSIONE_MASSIMA_ANTEPRIMA = 512 * 1024;

function risolviPercorsoEsistente(cartella, percorso, { realpathSyncFn = realpathSync } = {}) {
  if (typeof percorso !== 'string' || percorso.length === 0 || percorso.includes('\0') || isAbsolute(percorso)) {
    throw new WorkspaceFileError('Percorso non valido');
  }
  const radiceReale = realpathSyncFn(cartella);
  let reale;
  try {
    reale = realpathSyncFn(join(cartella, percorso));
  } catch {
    throw new WorkspaceFileError('File non trovato', 'FILE_NOT_FOUND');
  }
  if (!isPathInside(radiceReale, reale) || reale === radiceReale) {
    // ⛔ reale === radiceReale: nessuna delle azioni di questo file ha senso sulla RADICE della sessione stessa (rinominarla/eliminarla è un disastro diverso, fuori scope qui)
    throw new WorkspaceFileError('Percorso fuori dalla cartella della sessione, o è la radice stessa');
  }
  return { radiceReale, reale };
}

/**
 * "Apri" — il contenuto di un file, in sola lettura. Non passa da
 * `disco.leggi` del kernel (che tronca a MAX_BYTE_LETTI per un motivo
 * diverso, il contesto del modello): qui l'anteprima ha il suo proprio
 * tetto, dichiarato esplicitamente se superato.
 */
export async function leggiContenutoFile({ cartella, percorso }, deps = {}) {
  const { reale } = risolviPercorsoEsistente(cartella, percorso, deps);
  const stat = await (deps.statFn ?? fsp.stat)(reale);
  if (!stat.isFile()) throw new WorkspaceFileError('Non è un file — apri una cartella dall\'albero, non da qui');
  if (stat.size > DIMENSIONE_MASSIMA_ANTEPRIMA) {
    throw new WorkspaceFileError(`File troppo grande per l'anteprima (${Math.round(stat.size / 1024)} KB, tetto ${DIMENSIONE_MASSIMA_ANTEPRIMA / 1024} KB)`, 'FILE_TOO_LARGE');
  }
  const contenuto = await (deps.readFileFn ?? fsp.readFile)(reale, 'utf8');
  return { contenuto, dimensione: stat.size };
}

/*
 * ⛔⛔ PO-05, owner: «ogni file generato deve avere un collegamento diretto per scaricarlo con un
 * clic; nome, formato, dimensione e disponibilità REALI». Fino a oggi un documento generato finiva nel
 * workspace e in Libreria, e in chat arrivava la riga `[binary docx file, 7714 bytes]`: vera, ma non
 * cliccabile. Questa è la metà del server.
 *
 * ⛔ Perché non basta `leggiContenutoFile`, che è qui sopra: quella legge in **utf8** — un `.docx` è
 *   uno zip, e passarlo da `readFile(…, 'utf8')` lo corrompe irreparabilmente (ogni byte non valido
 *   diventa U+FFFD e non torna più indietro) — e ha il tetto dell'ANTEPRIMA (512 KB), che per un
 *   allegato è la misura sbagliata. Qui i byte restano byte.
 * ⛔ La difesa NON si riscrive: è la stessa `risolviPercorsoEsistente` delle sorelle (canonicalizza
 *   con `realpath` e confina dentro la cartella della sessione, quindi né `..` né un collegamento
 *   simbolico portano fuori). Una difesa copiata è una difesa che un giorno diverge.
 *
 * Ricerca 09-10/09/2026, prima di scrivere:
 *  · IETF RFC 6266 (`Use of the Content-Disposition Header Field in HTTP`): «attachment» dice al
 *    destinatario di proporre il salvataggio; il parametro `filename*` estende `filename` alle
 *    codifiche oltre l'ASCII e, quando ci sono entrambi, **`filename*` ha la precedenza** ⇒ si
 *    mandano TUTTI E DUE: `filename` come ripiego ASCII e `filename*` in UTF-8. UTF-8 è la codifica
 *    raccomandata perché almeno un'implementazione diffusa non ne conosce altre.
 *  · MDN, `Content-Disposition` (letto 10/09/2026): stessa regola, e l'avvertenza che un agente che
 *    non conosce RFC 5987 mostrerebbe la sequenza percent-encoded — da cui il doppio parametro.
 * ⛔ Il nome che finisce nell'intestazione è il **nome del file sul disco**, non un testo scelto da
 *   chi chiama: niente a capo né virgolette che possano spezzare l'intestazione (una risposta HTTP
 *   con un'intestazione spezzata è una vulnerabilità, non un nome brutto).
 */
/* ⛔ Esportato il 10/09/2026: lo scarico di una voce di Libreria (`library-store.mjs`) ha lo
   STESSO tetto, e due numeri scritti in due file un giorno dicono due cose diverse. */
export const DIMENSIONE_MASSIMA_SCARICO = 64 * 1024 * 1024;

/** Il nome, ridotto a ciò che può stare in un'intestazione HTTP senza spezzarla. Puro. */
export function nomeSicuroPerIntestazione(nome) {
  const pulito = String(nome ?? '').replace(/[\r\n\0]/g, '').trim();
  return pulito.length > 0 ? pulito : 'file';
}

/**
 * Le due forme del nome per `Content-Disposition`, secondo RFC 6266: `ascii` è il ripiego (i
 * caratteri fuori ASCII diventano `_`, le virgolette e la barra rovescia spariscono), `utf8` è il
 * valore percent-encoded per `filename*`. Puro, così si prova senza un server.
 */
export function nomiPerContentDisposition(nome) {
  const sicuro = nomeSicuroPerIntestazione(nome);
  const ascii = sicuro.replace(/["\\]/g, '').replace(/[^\x20-\x7E]/g, '_');
  return { ascii: ascii.trim() || 'file', utf8: encodeURIComponent(sicuro) };
}

/**
 * Un file del workspace, in BYTE, per essere scaricato. Stessa difesa delle sorelle.
 * @returns {Promise<{bytes:Buffer, dimensione:number, nome:string}>}
 */
export async function leggiFilePerScarico({ cartella, percorso }, deps = {}) {
  const { reale } = risolviPercorsoEsistente(cartella, percorso, deps);
  const stat = await (deps.statFn ?? fsp.stat)(reale);
  if (!stat.isFile()) throw new WorkspaceFileError('Non è un file: una cartella non si scarica');
  if (stat.size > DIMENSIONE_MASSIMA_SCARICO) {
    throw new WorkspaceFileError(
      `File troppo grande da scaricare (${Math.round(stat.size / 1024 / 1024)} MB, tetto ${DIMENSIONE_MASSIMA_SCARICO / 1024 / 1024} MB)`,
      'FILE_TOO_LARGE',
    );
  }
  const bytes = await (deps.readFileFn ?? fsp.readFile)(reale);
  return { bytes, dimensione: stat.size, nome: reale.split(/[\\/]/).pop() };
}

/**
 * "Rinomina" — `nuovoNome` è un NOME, non un percorso: niente `/`, `\`,
 * `..` — sposta il file nella STESSA cartella, non altrove (rinominare
 * ≠ spostare, stessa distinzione che fa ogni file manager reale).
 */
export async function rinominaFile({ cartella, percorso, nuovoNome }, deps = {}) {
  const { radiceReale, reale } = risolviPercorsoEsistente(cartella, percorso, deps);
  if (
    typeof nuovoNome !== 'string' || nuovoNome.length === 0 || nuovoNome.length > 255
    || nuovoNome.includes('/') || nuovoNome.includes('\\') || nuovoNome.includes('\0')
    || nuovoNome === '.' || nuovoNome === '..'
  ) {
    throw new WorkspaceFileError('Nuovo nome non valido — un nome di file, non un percorso');
  }
  const destinazione = join(dirname(reale), nuovoNome);
  if (!isPathInside(radiceReale, destinazione)) throw new WorkspaceFileError('Destinazione fuori dalla cartella della sessione');
  const accessFn = deps.accessFn ?? fsp.access;
  const esisteGia = await accessFn(destinazione).then(() => true, () => false);
  if (esisteGia) throw new WorkspaceFileError('Esiste già un file con questo nome', 'FILE_EXISTS');
  await (deps.renameFn ?? fsp.rename)(reale, destinazione);
  const nuovoPercorso = relative(radiceReale, destinazione).split(sep).join('/');
  return { nuovoPercorso };
}

/**
 * "Elimina" — DISTRUTTIVA. La conferma vive nel frontend (un dialogo
 * vero, non un `confirm()` del browser — stessa disciplina "hard to
 * reverse actions get confirmed" del resto del prodotto): questa
 * funzione esegue e basta, non chiede nulla lei stessa.
 */
export async function eliminaFile({ cartella, percorso }, deps = {}) {
  const { reale } = risolviPercorsoEsistente(cartella, percorso, deps);
  const stat = await (deps.statFn ?? fsp.stat)(reale);
  await (deps.rmFn ?? fsp.rm)(reale, { recursive: stat.isDirectory(), force: false });
  return { eliminato: true };
}

/*
 * ⛔⛔⛔ BC-11, 11/09/2026 — IL TETTO DI UNA SCRITTURA SI DICHIARA, non lo si scopre sbattendoci.
 *
 * Misurato sulla sessione `8dde6bff` dell'owner («genera un file html di almeno 1000 righe»):
 * `creaFileWorkspace` accettava **41.943.040 byte in 12 ms senza un solo controllo**, e con
 * `bytes: undefined` non rispondeva niente di utile — rilanciava il `TypeError` di Node
 * (`ERR_INVALID_ARG_TYPE: The "data" argument must be of type string or an instance of Buffer…`),
 * cioè un errore di sistema operativo consegnato a un modello che non ha modo di agirci sopra.
 * ⇒ Regola dell'owner per BC-11: «ogni attrezzo deve DIRE al modello i suoi limiti quando li
 *   supera, invece di restituire un errore di sistema operativo».
 *
 * ⛔ Perché 32 MB e non di più: è la stessa taglia d'ordine dello scarico (64 MB, qui sopra) ma
 *   dimezzata, perché QUESTI byte hanno attraversato una risposta del modello — nessun documento
 *   generato da un giro è legittimamente più grande, e un numero più alto non proteggerebbe da
 *   niente. È un tetto DICHIARATO nel messaggio, non una soglia muta.
 *
 * Ricerca 11/09/2026, prima di scrivere (regola owner: si cerca PRIMA, soprattutto quando sembra
 * ovvio — quello che manca non è la soluzione, sono i vincoli):
 *  · Anthropic, «Text editor tool» (platform.claude.com, letto 11/09/2026): i comandi sono
 *    `view`/`create`/`str_replace`/`insert`/`undo_edit` — `insert` esiste APPOSTA per aggiungere
 *    testo dopo una riga, cioè per non dover riscrivere un file intero a ogni aggiunta.
 *  · anthropics/claude-quickstarts#348 (letto 11/09/2026): «The `EditTool20250728` class expects
 *    `new_str` for the insert command, but Claude actually outputs `insert_text`. This causes
 *    insert commands to fail» ⇒ il nome sbagliato di un argomento è una classe di errore REALE
 *    anche nell'implementazione di riferimento del fornitore, non una stranezza del nostro
 *    modello: un attrezzo che accetta un solo nome trasforma un errore di forma in un guasto.
 *  · Nous Research, hermes-agent v0.21, `tools/file_tools.py:2729` (WRITE_FILE_SCHEMA): «Use this
 *    instead of echo/cat heredoc in terminal… OVERWRITES the entire file — use 'patch' for
 *    targeted edits», e `registry.register(…, max_result_size_chars=100_000)` — il tetto è un dato
 *    dichiarato accanto all'attrezzo, non un comportamento scoperto a valle.
 *  · cline, `apps/vscode/src/sdk/sdk-diff-edit-coordinator.ts:401` — l'errore stesso insegna il
 *    valore giusto: «insert_line must be a positive one-based boundary line in the range 1-N.
 *    **Use N to append at EOF.**»
 *  · Node.js `fs` (nodejs.org, letto 11/09/2026): `appendFile` usa il flag `'a'`; su Windows
 *    `flock` non c'è, e `writeFile` con `'w'` / `appendFile` con `'a'` sono la via per una
 *    scrittura o un'aggiunta atomica per singola chiamata. ⇒ qui si accoda con `appendFile`, MAI
 *    leggendo-concatenando-riscrivendo (che perderebbe la scrittura di chiunque altro in mezzo).
 */
export const DIMENSIONE_MASSIMA_CREAZIONE = 32 * 1024 * 1024;

/**
 * "Crea" — scrive BYTE nuovi alla radice del workspace (`document_create`,
 * piano elegant-spinning-dongarra.md, 28/8). Diversa dalle altre azioni
 * di questo file: qui il file NON esiste ancora, quindi
 * `risolviPercorsoEsistente` (che richiede `realpathSync` sul
 * bersaglio) non si applica — si valida solo che `nome` sia un NOME
 * piatto (stessa grammatica di `nuovoNome` in `rinominaFile`: niente
 * `/`, `\`, `..`), mai un percorso con sottocartelle. Scope
 * deliberatamente stretto (radice del workspace, non un percorso
 * arbitrario) — un generatore di documenti scrive dove l'utente lo
 * vede subito nell'albero, non in una sottocartella indovinata.
 *
 * ⛔⛔⛔ BC-11 — `modalita` è la seconda metà della cura, e nasce da un numero: nella sessione
 *   `8dde6bff` il modello ha speso **119 chiamate `shell` contro 23 `scrivi`** (e nella `37e10d21`
 *   **99 contro 6**) per scrivere UN file, perché nessun attrezzo sa AGGIUNGERE: un file più lungo
 *   di una risposta obbligava a inventarsi `_p2.html`, `_p3.html`, `_p4.html`, `_p5.html` e poi un
 *   passo di «assemblaggio» — cioè almeno due giri in più per ogni pezzo.
 *  · `'nuovo'` (default): ESATTAMENTE il comportamento di sempre — un nome già preso viene
 *    rifiutato, mai sovrascritto in silenzio (prova `workspace-files.test.mjs:240`, che resta vera).
 *  · `'accoda'`: aggiunge in coda se il file c'è, lo crea se non c'è. È un'OPZIONE ESPLICITA di chi
 *    chiama, non un ripiego automatico: una sovrascrittura involontaria e un'aggiunta involontaria
 *    sono due danni diversi, e nessuno dei due deve poter succedere per distrazione.
 * ⛔ Accodare a una CARTELLA è esattamente il guasto che BC-11 è venuto a curare (`EISDIR:
 *   illegal operation on a directory`): qui si guarda cosa c'è PRIMA e si risponde a parole.
 *
 * @param {{cartella:string, nome:string, bytes:Uint8Array|Buffer|string, modalita?:'nuovo'|'accoda'}} input
 */
export async function creaFileWorkspace({ cartella, nome, bytes, modalita = 'nuovo' }, deps = {}) {
  if (modalita !== 'nuovo' && modalita !== 'accoda') {
    throw new WorkspaceFileError('Modalità non valida: "nuovo" (rifiuta un nome già preso) o "accoda" (aggiunge in coda)');
  }
  if (
    typeof nome !== 'string' || nome.length === 0 || nome.length > 255
    || nome.includes('/') || nome.includes('\\') || nome.includes('\0')
    || nome === '.' || nome === '..'
  ) {
    throw new WorkspaceFileError('Nome file non valido — un nome, non un percorso');
  }
  /*
   * ⛔ BC-11 — il TIPO prima del tetto, e detto a parole. Senza questo controllo `fsp.writeFile`
   *   lancia `ERR_INVALID_ARG_TYPE` (riprodotto l'11/09/2026), che per chi legge il risultato
   *   dell'attrezzo è indistinguibile da un guasto del disco.
   */
  const byteValidi = typeof bytes === 'string' || ArrayBuffer.isView(bytes) || bytes instanceof ArrayBuffer;
  if (!byteValidi) {
    throw new WorkspaceFileError(
      'Contenuto mancante o non valido: servono byte o testo, e ne è arrivato '
      + `${bytes === undefined ? 'nessuno' : typeof bytes}. Rimanda la chiamata con il contenuto.`,
      'CONTENT_INVALID',
    );
  }
  const dimensione = typeof bytes === 'string' ? Buffer.byteLength(bytes, 'utf8') : bytes.byteLength;
  if (dimensione > DIMENSIONE_MASSIMA_CREAZIONE) {
    throw new WorkspaceFileError(
      `Contenuto troppo grande (${Math.round(dimensione / 1024 / 1024)} MB, tetto `
      + `${DIMENSIONE_MASSIMA_CREAZIONE / 1024 / 1024} MB). Scrivilo in più pezzi, aggiungendo ogni pezzo in coda.`,
      'CONTENT_TOO_LARGE',
    );
  }
  const radiceReale = (deps.realpathSyncFn ?? realpathSync)(cartella);
  const destinazione = join(radiceReale, nome);
  if (!isPathInside(radiceReale, destinazione)) throw new WorkspaceFileError('Destinazione fuori dalla cartella del workspace');
  const accessFn = deps.accessFn ?? fsp.access;
  const esisteGia = await accessFn(destinazione).then(() => true, () => false);
  if (esisteGia && modalita === 'nuovo') throw new WorkspaceFileError('Esiste già un file con questo nome', 'FILE_EXISTS');
  if (esisteGia) {
    /*
     * ⛔ La domanda «è un file?» si fa PRIMA di aprire: `appendFile` su una cartella darebbe
     *   `EISDIR` — lo stesso errore di sistema operativo che l'owner ha visto cinque volte nella
     *   sessione `8dde6bff` e che nessuno poteva leggere.
     */
    const stat = await (deps.statFn ?? fsp.stat)(destinazione);
    if (!stat.isFile()) throw new WorkspaceFileError('Esiste già una cartella con questo nome: non ci si può accodare', 'NOT_A_FILE');
    if (stat.size + dimensione > DIMENSIONE_MASSIMA_CREAZIONE) {
      throw new WorkspaceFileError(
        `Il file arriverebbe a ${Math.round((stat.size + dimensione) / 1024 / 1024)} MB, oltre il tetto di `
        + `${DIMENSIONE_MASSIMA_CREAZIONE / 1024 / 1024} MB.`,
        'CONTENT_TOO_LARGE',
      );
    }
    // ⛔ `appendFile` (flag 'a'), MAI leggi-concatena-riscrivi: quest'ultima perderebbe in silenzio
    //    ciò che qualcun altro ha scritto fra la lettura e la riscrittura.
    await (deps.appendFileFn ?? fsp.appendFile)(destinazione, bytes);
    return { percorso: nome, accodato: true, byteTotali: stat.size + dimensione };
  }
  await (deps.writeFileFn ?? fsp.writeFile)(destinazione, bytes);
  return { percorso: nome, ...(modalita === 'accoda' ? { accodato: false, byteTotali: dimensione } : {}) };
}

/**
 * "Sposta" — drag&drop (piano `elegant-spinning-dongarra.md`, owner:
 * "nella lista files devo poter draggare i file"). Sposta un file/
 * cartella in un'ALTRA cartella dello stesso workspace, mantenendo il
 * nome — `cartellaDestinazione` è un percorso relativo ('' = radice)
 * che deve esistere ED essere una cartella. Non sovrascrive mai un
 * nome già occupato nella destinazione. `isPathInside(reale,
 * destinazioneCartellaReale)` copre da sola sia "dentro se stessa" sia
 * "dentro un proprio discendente" (torna true anche a parità di
 * percorso — verificato leggendo path-policy.mjs, non presunto): senza
 * questa guardia una cartella spostata dentro se stessa lascerebbe
 * `fs.rename` fallire a metà con un errore di sistema operativo
 * travestito da azione riuscita.
 */
export async function spostaFile({ cartella, percorso, cartellaDestinazione }, deps = {}) {
  const { radiceReale, reale } = risolviPercorsoEsistente(cartella, percorso, deps);
  const realpathSyncFn = deps.realpathSyncFn ?? realpathSync;
  let destinazioneCartellaReale;
  if (cartellaDestinazione === '') {
    destinazioneCartellaReale = radiceReale;
  } else {
    if (typeof cartellaDestinazione !== 'string' || isAbsolute(cartellaDestinazione)) {
      throw new WorkspaceFileError('Cartella di destinazione non valida');
    }
    try {
      destinazioneCartellaReale = realpathSyncFn(join(cartella, cartellaDestinazione));
    } catch {
      throw new WorkspaceFileError('Cartella di destinazione non trovata', 'FILE_NOT_FOUND');
    }
    if (!isPathInside(radiceReale, destinazioneCartellaReale)) {
      throw new WorkspaceFileError('Destinazione fuori dalla cartella della sessione');
    }
  }
  const statDestinazione = await (deps.statFn ?? fsp.stat)(destinazioneCartellaReale).catch(() => null);
  if (!statDestinazione || !statDestinazione.isDirectory()) {
    throw new WorkspaceFileError('La destinazione non è una cartella');
  }
  if (isPathInside(reale, destinazioneCartellaReale)) {
    throw new WorkspaceFileError('Non puoi spostare un elemento dentro se stesso o un suo discendente');
  }
  const nome = reale.split(sep).pop();
  const destinazione = join(destinazioneCartellaReale, nome);
  const accessFn = deps.accessFn ?? fsp.access;
  const esisteGia = await accessFn(destinazione).then(() => true, () => false);
  if (esisteGia) throw new WorkspaceFileError('Esiste già un elemento con questo nome nella destinazione', 'FILE_EXISTS');
  await (deps.renameFn ?? fsp.rename)(reale, destinazione);
  const nuovoPercorso = relative(radiceReale, destinazione).split(sep).join('/');
  return { nuovoPercorso };
}

/**
 * "Copia" — owner: "non esiste il comando copia". Duplica un file/
 * cartella nella STESSA posizione, con un nome tipo "nome (copia).ext"
 * (pattern Explorer/Finder — verificato via ricerca web, non inventato:
 * è la convenzione standard di ogni file manager desktop). Se anche
 * quello esiste già, prova "nome (copia 2).ext" e così via, fino a un
 * tetto dichiarato — mai un ciclo infinito su un caso patologico.
 */
export async function copiaFile({ cartella, percorso }, deps = {}) {
  const { reale } = risolviPercorsoEsistente(cartella, percorso, deps);
  const accessFn = deps.accessFn ?? fsp.access;
  const cartellaGenitore = dirname(reale);
  const nomeOriginale = reale.split(sep).pop();
  const stat = await (deps.statFn ?? fsp.stat)(reale);
  const puntoEstensione = nomeOriginale.lastIndexOf('.');
  // niente estensione separata per una cartella, o per un file che INIZIA con un punto (es. ".gitignore" resta intero in "base")
  const haEstensione = !stat.isDirectory() && puntoEstensione > 0;
  const base = haEstensione ? nomeOriginale.slice(0, puntoEstensione) : nomeOriginale;
  const estensione = haEstensione ? nomeOriginale.slice(puntoEstensione) : '';

  const TETTO_TENTATIVI = 1000;
  let destinazione = null;
  for (let n = 1; n <= TETTO_TENTATIVI; n += 1) {
    const suffisso = n === 1 ? ' (copia)' : ` (copia ${n})`;
    const candidato = join(cartellaGenitore, `${base}${suffisso}${estensione}`);
    const esisteGia = await accessFn(candidato).then(() => true, () => false);
    if (!esisteGia) { destinazione = candidato; break; }
  }
  if (!destinazione) throw new WorkspaceFileError('Troppe copie già esistenti con questo nome');

  await (deps.cpFn ?? fsp.cp)(reale, destinazione, { recursive: true, errorOnExist: true });
  const radiceReale = realpathSync(cartella);
  const nuovoPercorso = relative(radiceReale, destinazione).split(sep).join('/');
  return { nuovoPercorso };
}

/**
 * "Nuovo file"/"Nuova cartella" — CRUD manuale dell'owner ("comandi
 * crud in generale"), in QUALSIASI punto dell'albero — a differenza di
 * `creaFileWorkspace` sopra, che resta vincolata alla radice per
 * `document_create` (un bisogno diverso, dell'AGENTE, non toccato qui).
 * `percorsoBase` è la cartella dove creare ('' = radice); deve
 * esistere ED essere una cartella se non vuoto.
 */
export async function creaVoceWorkspace({ cartella, percorsoBase, nome, tipo }, deps = {}) {
  if (tipo !== 'file' && tipo !== 'cartella') {
    throw new WorkspaceFileError('Tipo non valido: "file" o "cartella"');
  }
  if (
    typeof nome !== 'string' || nome.length === 0 || nome.length > 255
    || nome.includes('/') || nome.includes('\\') || nome.includes('\0')
    || nome === '.' || nome === '..'
  ) {
    throw new WorkspaceFileError('Nome non valido — un nome, non un percorso');
  }
  const realpathSyncFn = deps.realpathSyncFn ?? realpathSync;
  const radiceReale = realpathSyncFn(cartella);
  let cartellaBaseReale = radiceReale;
  if (percorsoBase) {
    if (typeof percorsoBase !== 'string' || isAbsolute(percorsoBase)) {
      throw new WorkspaceFileError('Cartella base non valida');
    }
    try {
      cartellaBaseReale = realpathSyncFn(join(cartella, percorsoBase));
    } catch {
      throw new WorkspaceFileError('Cartella base non trovata', 'FILE_NOT_FOUND');
    }
    if (!isPathInside(radiceReale, cartellaBaseReale)) {
      throw new WorkspaceFileError('Cartella base fuori dal workspace della sessione');
    }
    const statBase = await (deps.statFn ?? fsp.stat)(cartellaBaseReale).catch(() => null);
    if (!statBase || !statBase.isDirectory()) throw new WorkspaceFileError('La cartella base non è una cartella');
  }
  const destinazione = join(cartellaBaseReale, nome);
  if (!isPathInside(radiceReale, destinazione)) throw new WorkspaceFileError('Destinazione fuori dal workspace della sessione');
  const accessFn = deps.accessFn ?? fsp.access;
  const esisteGia = await accessFn(destinazione).then(() => true, () => false);
  if (esisteGia) throw new WorkspaceFileError('Esiste già un elemento con questo nome', 'FILE_EXISTS');
  if (tipo === 'cartella') await (deps.mkdirFn ?? fsp.mkdir)(destinazione);
  else await (deps.writeFileFn ?? fsp.writeFile)(destinazione, '');
  const percorso = relative(radiceReale, destinazione).split(sep).join('/');
  return { percorso };
}

/**
 * "Rivela in Esplora File" — SOLO Windows (`explorer.exe`), dichiarato
 * non simulato altrove. Un SOLO argomento argv (`/select,<percorso>`,
 * verificato via ricerca web la sintassi esatta — niente spazio dopo la
 * virgola): `execFile` non passa da una shell, quindi zero rischio di
 * injection anche con un percorso pieno di caratteri strani.
 *
 * ⛔ `explorer.exe` torna quasi sempre un codice di uscita diverso da
 * zero ANCHE quando ha aperto la finestra correttamente (comportamento
 * noto, non un guasto di questo codice) — l'unico fallimento vero da
 * segnalare è `execFile` che non trova l'eseguibile affatto.
 */
/*
 * ⛔⛔ 10/09/2026 — «APRI», l'azione Windows che mancava. Owner: «con CRUD completo e AZIONI
 * WINDOWS», e poi «fai in modo che le azioni e i pulsanti della libreria funzionino a schermo».
 *
 * Il problema, misurato: la rotta che serve i byte manda `Content-Disposition: attachment` e
 * `application/octet-stream` — giusto per uno SCARICO, ma vuol dire che un pulsante «Apri» agganciato
 * lì farebbe scaricare il file una seconda volta invece di aprirlo. Su Windows «aprire» ha un
 * significato preciso e diverso: lo apre il programma associato all'estensione (Word per un .docx,
 * il visualizzatore foto per un .jpg).
 *
 * ⛔ `explorer.exe <percorso>` è la stessa porta già usata da `rivelaInEsploraFile` qui sotto, senza
 *   `/select`: con il percorso di un FILE, Explorer lo apre col programma associato. Riusa la stessa
 *   politica di processo (`EXPLORER_PROCESS_POLICY`), che ammette solo `explorer.exe`: nessun
 *   eseguibile nuovo, nessuna shell, e il percorso resta un ARGOMENTO — mai una stringa di comando,
 *   che con un nome contenente `&` o `"` sarebbe un'iniezione.
 * ⛔ E come la sorella: fuori da Windows non finge, dichiara che non è disponibile.
 */
export async function apriFileConProgrammaPredefinito({ cartella, percorso }, deps = {}) {
  const { reale } = risolviPercorsoEsistente(cartella, percorso, deps);
  if ((deps.platform ?? process.platform) !== 'win32') {
    throw new WorkspaceFileError('Disponibile solo su Windows', 'PLATFORM_UNSUPPORTED');
  }
  const stat = await (deps.statFn ?? fsp.stat)(reale);
  /* ⛔ Una cartella si «rivela», non si «apre col programma»: due azioni diverse, due bottoni diversi. */
  if (!stat.isFile()) throw new WorkspaceFileError('Non è un file: usa «Mostra nella cartella»');
  /*
   * ⛔⛔ 10/09/2026 — QUESTA RIGA NON HA MAI FUNZIONATO CON LA POLITICA VERA, e nessun test se n'era
   *   accorto. Il wrapper dichiarava `(comando, argomenti, opzioni, callback)` ma qui sotto veniva
   *   chiamato con TRE argomenti: la funzione di richiamo finiva nel posto delle OPZIONI, e
   *   `callback` restava `undefined` ⇒ `execFile` non richiamava nessuno, la promessa non si
   *   risolveva mai, e la richiesta HTTP restava appesa per sempre.
   * ⛔ Misurato dal vivo il 10/09 premendo il bottone sul 4174: la rotta non rispondeva entro 15
   *   secondi, e `curl` chiudeva con «0 bytes received». Fuori dal server, la funzione restava appesa
   *   oltre gli 8 secondi. Con `execFile` diretto, invece, il richiamo arriva in **126 ms**.
   * ⛔ Perché i test erano verdi: iniettavano un finto a TRE parametri `(comando, argomenti, cb)`,
   *   cioè con la forma sbagliata — un finto che non imita il vero misura il finto. Ora il wrapper
   *   accetta entrambe le forme, e una prova nuova chiama con QUATTRO argomenti come fa il codice.
   */
  const politica = (comando, argomenti, opzioni, callback) => EXPLORER_PROCESS_POLICY.execFile(comando, argomenti, {
    ...opzioni,
    cwd: opzioni?.cwd ?? cartella,
  }, callback);
  const grezza = deps.execFileFn ?? politica;
  /* Chi inietta un finto a tre parametri continua a funzionare: l'ultimo argomento è il richiamo. */
  const execFileFn = (comando, argomenti, opzioni, callback) => (
    grezza.length <= 3
      ? grezza(comando, argomenti, callback)
      : grezza(comando, argomenti, opzioni, callback)
  );
  await new Promise((ok, no) => {
    execFileFn('explorer.exe', [reale], {}, (errore) => {
      if (errore && errore.code === 'ENOENT') { no(errore); return; }
      ok(); // ⛔ explorer.exe esce con codici non-zero anche quando ha funzionato: è noto, e non è un guasto
    });
  });
  return { aperto: true };
}

export async function rivelaInEsploraFile({ cartella, percorso }, deps = {}) {
  const { reale } = risolviPercorsoEsistente(cartella, percorso, deps);
  if ((deps.platform ?? process.platform) !== 'win32') {
    throw new WorkspaceFileError('Disponibile solo su Windows', 'PLATFORM_UNSUPPORTED');
  }
  /* ⛔ Stesso wrapper della funzione qui sopra, e per lo stesso motivo: chiamato con tre argomenti
     il richiamo finiva nel posto delle opzioni e la promessa non si risolveva mai. Vedi là la storia. */
  const politica = (comando, argomenti, opzioni, callback) => EXPLORER_PROCESS_POLICY.execFile(comando, argomenti, {
    ...opzioni,
    cwd: opzioni?.cwd ?? cartella,
  }, callback);
  const grezza = deps.execFileFn ?? politica;
  const execFileFn = (comando, argomenti, opzioni, callback) => (
    grezza.length <= 3
      ? grezza(comando, argomenti, callback)
      : grezza(comando, argomenti, opzioni, callback)
  );
  await new Promise((ok, no) => {
    execFileFn('explorer.exe', [`/select,${reale}`], {}, (errore) => {
      if (errore && errore.code === 'ENOENT') { no(errore); return; }
      ok(); // qualunque altro codice di uscita: comportamento noto di explorer.exe, non un fallimento
    });
  });
  return { rivelato: true };
}

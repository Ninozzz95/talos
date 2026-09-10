/**
 * library-store.mjs — FASE N del piano `elegant-spinning-dongarra.md`
 * (29/8): port dal mobile, owner testuale: "iniziamo da library,
 * ricordati che sul mobile esistono già da tempo tutte queste
 * funzioni... è tutto già fatto". Stesso CONTRATTO (schema/semantica)
 * degli 8 tool mobile — letti alla fonte il 29/8, non presunti:
 * `mobile/src/lib/tools/readTools.ts` righe 320-650 (i 4 tool di
 * lettura) e `mobile/src/lib/vaultLibrary.ts` (il modello dati) —
 * storage DIVERSO: file su disco per-progetto (decisione già presa
 * nel ledger FASE N: "storage per-progetto dentro il workspace"), non
 * SQLCipher cross-chat come sul mobile.
 *
 * Prima fetta: SOLO i 4 tool di lettura (list/search/read/file_origin)
 * — come sul mobile, dove sono arrivati per primi (domanda 2 del
 * ledger FASE N, risolta con la convenzione già stabilita per
 * E/F/G/H: registry+tool prima, mutazioni/UI dopo). `salvaVoce` esiste
 * già qui — serve per seminare/testare questa stessa fetta dal vivo
 * (senza scrittura non c'è nulla da leggere) ed è la base pronta per
 * la seconda fetta — ma non è ancora esposta come tool al modello.
 *
 * ⛔⛔⛔ Deliberatamente SENZA il concetto mobile di `contentOrigin`/A8
 * (la provenienza dinamica "peggiore fra N risultati", usata sul
 * mobile per la difesa da prompt injection): verificato il 29/8
 * leggendo `talosHarness.mjs` per intero — non ha NESSUN equivalente,
 * in nessun nome. La sua trifecta (`SICUREZZA_PER_ATTREZZO`) è un
 * vocabolario DIVERSO — booleano, STATICO per nome di attrezzo, e
 * limitato ai soli 5 "ATTREZZI_CON_RICEVUTA" (scrivi/prova/shell/
 * document_create/generate_image); perfino `naviga` (che legge
 * contenuto web non fidato) ne è fuori oggi. I 4 tool di lettura qui
 * sotto ricevono lo STESSO trattamento non censito di
 * elenca/cerca/leggi/naviga: nessuna voce in SICUREZZA_PER_ATTREZZO,
 * il default `{readsPrivateData:false, readsUntrustedContent:false,
 * canTransmit:false}` si applica — coerente col precedente stabilito,
 * non un buco nuovo introdotto da questa fase.
 *
 * Stile DI: stesso pattern di `skill-registry.mjs`/`frequent-dirs.mjs`
 * (letti come precedenti diretti) — funzioni async con `deps` opzionali
 * per i test, mai un vero filesystem mockato altrove.
 */
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// ⛔ Il tetto dello scarico è UNO SOLO per tutto il prodotto: vedi `leggiBytesVoce` in fondo.
import { DIMENSIONE_MASSIMA_SCARICO } from './workspace-files.mjs';

export class LibraryStoreError extends Error {
  constructor(message, code = 'LIBRARY_INVALID') {
    super(message);
    this.name = 'LibraryStoreError';
    this.code = code;
  }
}

export const CARTELLA_LIBRERIA = '.harness-ui-library';
const NOME_FILE_META = 'meta.json';
const NOME_FILE_CONTENUTO = 'contenuto';
const MAX_VOCI_PAGINA = 20;
const MAX_RISULTATI_RICERCA = 20;
// Stesso ordine di grandezza di MAX_LIBRARY_LIST_CURSORS mobile (readTools.ts riga 247, valore 128).
const MAX_CURSORI_VIVI = 128;

/**
 * @returns {'image'|'document'} — derivato dal mediaType, come
 * `talosLibraryFileType` mobile (vaultLibrary.ts righe 66-71). Niente
 * `'link'`: l'archiviazione di pagine web nella Libreria è una
 * capacità mobile (ricerca approfondita che salva le fonti) che il
 * desktop non ha ancora — il valore resta nello schema del filtro
 * (per parità di contratto) ma non produce mai risultati, onestamente.
 */
export function tipoFileLibreria(mediaType) {
  return String(mediaType || '').startsWith('image/') ? 'image' : 'document';
}

/**
 * Una Map nuova per sessione — stessa vita di `libraryListCursors`
 * mobile (un'istanza per chat, chiusa nella factory di `defineTalosTool`).
 * Qui il chiamante (agent-service.mjs, una volta per sessione) la crea
 * e la passa a `impaginaVoci` ad ogni chiamata di `library_list`.
 */
export function creaCursoriLibreria() {
  return new Map();
}

/*
 * ⛔⛔⛔ 10/09/2026 — L'ID DI UNA VOCE NON È PIÙ SOLO UNA COSA DEL MODELLO.
 *
 * Fino a oggi ogni `id` arrivava da `impaginaVoci`/`cercaVoci`, cioè da un elenco che questo
 * file aveva appena letto dal disco. Da oggi arriva anche da un SEGMENTO DI INDIRIZZO HTTP
 * (`/api/v1/sessions/:id/library/:voceId/...`), cioè da fuori: un id `..%2f..` diventerebbe
 * `join(cartella, '.harness-ui-library', '..', '..')` e uscirebbe dalla cartella del progetto,
 * e `leggiVoce`/`rinominaVoce`/`eliminaVoce` lo avrebbero seguito senza fiatare. La stessa porta
 * era già aperta dalla parte del modello (`agent-service.mjs` passa `argomenti?.id ?? ''` così
 * com'è): la difesa sta QUI, nel magazzino, così vale per tutti e due i chiamanti e non c'è una
 * seconda copia che un giorno diverge.
 *
 * Ricerca 10/09/2026, prima di scrivere (Microsoft Learn, «Naming Files, Paths, and Namespaces»;
 * npm `sanitize-filename` e la sua tabella di casi): un nome di file sicuro non è «una stringa
 * senza `..`» — sono vietati anche i separatori, i caratteri di controllo, i punti e gli spazi
 * in coda, e i nomi riservati di Windows (CON, PRN, AUX, NUL, COM1-9, LPT1-9) perfino con
 * un'estensione appiccicata dietro. Qui il tetto è più stretto di quell'elenco, e per questo non
 * serve ricopiarlo: un id di Libreria lo genera SEMPRE `salvaVoce` nella forma `lib-<uuid>` (mai
 * il chiamante), e `randomUUID` produce solo cifre esadecimali e trattini ⇒ un'allowlist di
 * lettere, cifre, punto, trattino e trattino basso accetta tutto ciò che esiste davvero sul disco
 * e rifiuta tutto il resto.
 *
 * ⛔ Un id fuori grammatica torna `null` — «questa voce non c'è», non un'eccezione: è vero (un id
 *   con una barra dentro non può nominare nessuna voce) e non cambia il contratto delle funzioni
 *   qui sotto, che per un id sconosciuto rispondono già `null`. Un'eccezione nuova, invece,
 *   sarebbe arrivata in faccia al modello per una chiamata che oggi si chiude con un «non trovato».
 */
export function idVoceLibreriaValido(id) {
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id);
}

/**
 * Il percorso RELATIVO (dalla cartella del progetto) del file di una voce — la sola forma in cui
 * la disposizione interna della Libreria esce da questo file. `null` se l'id non è valido.
 * Serve a «rivela in Esplora file», che vuole un percorso dentro il workspace: farlo comporre al
 * chiamante vorrebbe dire scrivere `.harness-ui-library/<id>/contenuto` in due posti, cioè tenere
 * due mappe della stessa cartella — e quando la Libreria cambierà forma se ne aggiornerà una sola.
 */
export function percorsoContenutoVoce(id) {
  if (!idVoceLibreriaValido(id)) return null;
  return `${CARTELLA_LIBRERIA}/${id}/${NOME_FILE_CONTENUTO}`;
}

/** La cartella di UNA voce, o `null` se l'id non è un nome piatto (vedi `idVoceLibreriaValido`). */
function cartellaDellaVoce(cartella, id) {
  if (!idVoceLibreriaValido(id)) return null;
  return join(cartella, CARTELLA_LIBRERIA, id);
}

function meta2voce(id, meta) {
  const creatoIl = typeof meta.creatoIl === 'string' ? meta.creatoIl : new Date(0).toISOString();
  return {
    id,
    nome: meta.nome,
    mediaType: typeof meta.mediaType === 'string' ? meta.mediaType : 'application/octet-stream',
    fileType: tipoFileLibreria(meta.mediaType),
    // Fail-closed come `parseVaultOrigin` mobile: qualunque cosa non sia esplicitamente 'generated' è trattata come un upload.
    origine: meta.origine === 'generated' ? 'generated' : 'uploaded',
    creatoIl,
    aggiornatoIl: typeof meta.aggiornatoIl === 'string' ? meta.aggiornatoIl : creatoIl,
    modello: typeof meta.modello === 'string' ? meta.modello : null,
    provider: typeof meta.provider === 'string' ? meta.provider : null,
  };
}

async function leggiMeta(percorsoMeta, readFileFn, id) {
  let testo;
  try {
    testo = await readFileFn(percorsoMeta, 'utf8');
  } catch (errore) {
    if (errore?.code === 'ENOENT') return undefined; // assente: non un errore, un "non c'è" onesto
    throw new LibraryStoreError(`Impossibile leggere ${id}/${NOME_FILE_META}: ${errore.message}`, 'LIBRARY_READ_FAILED');
  }
  let meta;
  try {
    meta = JSON.parse(testo);
  } catch {
    throw new LibraryStoreError(`${id}/${NOME_FILE_META} non è JSON valido`, 'LIBRARY_MALFORMED');
  }
  if (typeof meta.nome !== 'string' || meta.nome.length === 0) {
    throw new LibraryStoreError(`${id}/${NOME_FILE_META} manca di "nome"`, 'LIBRARY_MALFORMED');
  }
  return meta;
}

/**
 * Legge OGNI voce (solo metadata, MAI il contenuto) sotto
 * `<cartella>/.harness-ui-library/`. Cartella assente ⇒ `[]`, mai un
 * errore — un progetto senza Libreria è uno stato valido, stesso
 * principio "gli stati sono tre" di caricaHooks/caricaSkill. Una
 * sottocartella senza `meta.json` è saltata (non è una voce, non è un
 * errore); un `meta.json` malformato FERMA il caricamento con un
 * errore dichiarato — mai una voce fantasma letta a metà.
 */
export async function elencaVoci({ cartella }, deps = {}) {
  const readdirFn = deps.readdirFn ?? fsp.readdir;
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const cartellaLibreria = join(cartella, CARTELLA_LIBRERIA);
  let voci;
  try {
    voci = await readdirFn(cartellaLibreria, { withFileTypes: true });
  } catch (errore) {
    if (errore?.code === 'ENOENT') return [];
    throw new LibraryStoreError(`Impossibile leggere ${CARTELLA_LIBRERIA}: ${errore.message}`, 'LIBRARY_READ_FAILED');
  }
  const entries = [];
  for (const voce of voci) {
    if (!voce.isDirectory()) continue; // un file sciolto dentro .harness-ui-library/ non è una voce
    const meta = await leggiMeta(join(cartellaLibreria, voce.name, NOME_FILE_META), readFileFn, voce.name);
    if (meta === undefined) continue;
    entries.push(meta2voce(voce.name, meta));
  }
  return entries;
}

/**
 * Come `elencaVoci`, ma legge ANCHE il testo estratto di ogni voce
 * non-immagine — stessa separazione deliberata di mobile
 * (`listLibraryEntries` "metadata-only", `listLibraryDocs` "complete
 * extracted text, loaded only by an explicit search call", doc in
 * readTools.ts riga 85-88): un `library_list` non paga il costo I/O
 * di leggere ogni contenuto, solo `library_search` lo fa.
 */
export async function elencaVociConTesto({ cartella }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const entries = await elencaVoci({ cartella }, deps);
  const conTesto = [];
  for (const entry of entries) {
    if (entry.fileType === 'image') {
      conTesto.push({ ...entry, testoEstratto: '' });
      continue;
    }
    let testoEstratto = '';
    try {
      testoEstratto = await readFileFn(join(cartella, CARTELLA_LIBRERIA, entry.id, NOME_FILE_CONTENUTO), 'utf8');
    } catch {
      // ⛔ contenuto mancante/illeggibile: la voce resta cercabile per nome, mai un errore che blocca l'intera ricerca per una voce sola.
    }
    conTesto.push({ ...entry, testoEstratto });
  }
  return conTesto;
}

function confrontaVoci(a, b) {
  // Più recente per aggiornamento, poi creazione, poi id — stesso ordine di `compareLibraryListEntries` mobile (readTools.ts righe 250-257).
  return b.aggiornatoIl.localeCompare(a.aggiornatoIl)
    || b.creatoIl.localeCompare(a.creatoIl)
    || b.id.localeCompare(a.id);
}

function primaDelCursore(voce, dopo) {
  if (voce.aggiornatoIl !== dopo.aggiornatoIl) return voce.aggiornatoIl < dopo.aggiornatoIl;
  if (voce.creatoIl !== dopo.creatoIl) return voce.creatoIl < dopo.creatoIl;
  return voce.id < dopo.id;
}

/**
 * Pagina l'elenco — PURA (nessun I/O): filtro origine/tipo, ordine
 * più-recente-prima, cursore opaco (token → stato, nella Map passata
 * dal chiamante — vedi `creaCursoriLibreria`). Un `pageToken`
 * sconosciuto/scaduto torna `{errore:'CURSOR_INVALID'}`; un
 * `pageToken` con filtri diversi da quelli della pagina precedente
 * torna `{errore:'FILTER_DRIFT'}` — stessi due esiti onesti di
 * `library_list` mobile (readTools.ts righe 339-365), mai un salto
 * silenzioso a una pagina qualunque.
 */
export function impaginaVoci(voci, { origine = 'all', fileType = 'all', pageSize = 10, pageToken } = {}, cursori) {
  const taglia = Math.max(1, Math.min(MAX_VOCI_PAGINA, pageSize));
  let cursore;
  if (pageToken) {
    cursore = cursori.get(pageToken);
    if (!cursore) return { errore: 'CURSOR_INVALID' };
    if (cursore.origine !== origine || cursore.fileType !== fileType) return { errore: 'FILTER_DRIFT' };
  }
  const filtrate = voci
    .filter((v) => origine === 'all' || v.origine === origine)
    .filter((v) => fileType === 'all' || v.fileType === fileType)
    .slice()
    .sort(confrontaVoci);
  const candidate = cursore ? filtrate.filter((v) => primaDelCursore(v, cursore.dopo)) : filtrate;
  const pagina = candidate.slice(0, taglia);
  const vistiPrima = cursore?.visti ?? 0;
  const vistiDopo = vistiPrima + pagina.length;
  const altre = candidate.length > pagina.length;
  const ultima = pagina.at(-1);
  let nextPageToken = null;
  if (altre && ultima) {
    while (cursori.size >= MAX_CURSORI_VIVI) {
      const piuVecchio = cursori.keys().next().value;
      if (piuVecchio === undefined) break;
      cursori.delete(piuVecchio); // FIFO — stesso schema di eviction di issueLibraryListCursor mobile (readTools.ts righe 308-318)
    }
    nextPageToken = randomUUID();
    cursori.set(nextPageToken, {
      origine, fileType, visti: vistiDopo,
      dopo: { aggiornatoIl: ultima.aggiornatoIl, creatoIl: ultima.creatoIl, id: ultima.id },
    });
  }
  return { pagina, totale: filtrate.length, vistiPrima, vistiDopo, nextPageToken };
}

function punteggioRicerca(voce, query) {
  const parole = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (parole.length === 0) return 0;
  const nome = voce.nome.toLowerCase();
  const corpo = (voce.testoEstratto || '').toLowerCase();
  let punti = 0;
  for (const parola of parole) {
    if (nome.includes(parola)) punti += 3;
    if (corpo.includes(parola)) punti += 1;
  }
  return punti;
}

/**
 * Cerca fra le voci (richiede `testoEstratto`, cioè il risultato di
 * `elencaVociConTesto` — mai `elencaVoci`, che non lo porta). PURA.
 *
 * ⛔ Punteggio semplice per la prima fetta — non porta l'euristica
 * esatta di `rankLibraryDocs` mobile: fuori scala per un porting
 * "stesso contratto, storage diverso", dove ciò che conta per la
 * parità è lo SCHEMA (solo punteggio>0 è un match, offset paginato),
 * non l'algoritmo di ranking interno. Nome pesa più del corpo, parole
 * della query, case-insensitive.
 */
export function cercaVoci(vociConTesto, { query, limit = 5, offset = 0 } = {}) {
  const taglia = Math.max(1, Math.min(MAX_RISULTATI_RICERCA, limit));
  const puntati = vociConTesto
    .map((v) => ({ voce: v, punteggio: punteggioRicerca(v, query) }))
    // Un punteggio zero non è entrato: dire il contrario contaminerebbe la ricerca con voci a caso — stesso principio di `matching.filter(({score}) => score > 0)` mobile.
    .filter(({ punteggio }) => punteggio > 0)
    .sort((a, b) => b.punteggio - a.punteggio || b.voce.aggiornatoIl.localeCompare(a.voce.aggiornatoIl));
  const pagina = puntati.slice(offset, offset + taglia);
  const nextOffset = offset + pagina.length < puntati.length ? offset + pagina.length : null;
  return { pagina: pagina.map((r) => r.voce), totale: puntati.length, nextOffset };
}

/**
 * Legge UNA voce per intero (metadata + contenuto). Mai un id
 * indovinato dal chiamante: sempre ottenuto da `impaginaVoci`/
 * `cercaVoci` prima — stesso principio di `library_read` mobile.
 * `null` se l'id non esiste (mai un'eccezione per un id sbagliato:
 * è un esito onesto, non un guasto).
 */
export async function leggiVoce({ cartella, id }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const cartellaVoce = cartellaDellaVoce(cartella, id);
  if (!cartellaVoce) return null;
  const meta = await leggiMeta(join(cartellaVoce, NOME_FILE_META), readFileFn, id);
  if (meta === undefined) return null;
  const voce = meta2voce(id, meta);
  const percorsoContenuto = join(cartellaVoce, NOME_FILE_CONTENUTO);
  if (voce.fileType === 'image') {
    let bytes;
    try {
      bytes = await readFileFn(percorsoContenuto);
    } catch (errore) {
      throw new LibraryStoreError(`${id}: metadata presente ma contenuto illeggibile: ${errore.message}`, 'LIBRARY_READ_FAILED');
    }
    return { nome: voce.nome, mediaType: voce.mediaType, origine: voce.origine, immagineBase64: bytes.toString('base64') };
  }
  let testo;
  try {
    testo = await readFileFn(percorsoContenuto, 'utf8');
  } catch (errore) {
    throw new LibraryStoreError(`${id}: metadata presente ma contenuto illeggibile: ${errore.message}`, 'LIBRARY_READ_FAILED');
  }
  return { nome: voce.nome, mediaType: voce.mediaType, origine: voce.origine, testo };
}


/**
 * I BYTE di una voce, per essere SCARICATA — sorella di `leggiVoce` qui sopra, con una differenza
 * che non è un dettaglio: `leggiVoce` legge in `utf8` tutto ciò che non è un'immagine, e un `.docx`
 * (che è uno zip) o un `.pdf` passati da lì tornano CORROTTI in modo irreversibile — ogni byte non
 * valido diventa U+FFFD e non torna più indietro. Quella porta serve al modello, che vuole del
 * testo; questa serve alla persona che clicca «scarica», e qui i byte restano byte.
 *
 * ⛔ Il tetto dei 64 MB non è un numero nuovo: è `DIMENSIONE_MASSIMA_SCARICO`, lo stesso identico
 *   dello scarico di un file del workspace (`workspace-files.mjs`) — importato, non ricopiato,
 *   perché due tetti scritti in due posti sono due tetti che un giorno diranno numeri diversi.
 *   Serve davvero: qui i byte finiscono TUTTI in memoria prima di partire.
 * @returns {Promise<{bytes:Buffer, dimensione:number, nome:string, mediaType:string}|null>} `null`
 *   se l'id non nomina nessuna voce (id sconosciuto o fuori grammatica).
 */
export async function leggiBytesVoce({ cartella, id }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const statFn = deps.statFn ?? fsp.stat;
  const cartellaVoce = cartellaDellaVoce(cartella, id);
  if (!cartellaVoce) return null;
  const meta = await leggiMeta(join(cartellaVoce, NOME_FILE_META), readFileFn, id);
  if (meta === undefined) return null;
  const voce = meta2voce(id, meta);
  const percorsoContenuto = join(cartellaVoce, NOME_FILE_CONTENUTO);
  let stat;
  try {
    stat = await statFn(percorsoContenuto);
  } catch (errore) {
    // ⛔ La scheda c'è e il file no: uno stato ROTTO, non un «non trovato» — dirlo è il solo modo perché qualcuno lo ripari.
    throw new LibraryStoreError(`${id}: la scheda c'è, il file no (${errore.message})`, 'LIBRARY_READ_FAILED');
  }
  if (stat.size > DIMENSIONE_MASSIMA_SCARICO) {
    throw new LibraryStoreError(
      `File troppo grande da scaricare (${Math.round(stat.size / 1024 / 1024)} MB, tetto ${DIMENSIONE_MASSIMA_SCARICO / 1024 / 1024} MB)`,
      'LIBRARY_TOO_LARGE',
    );
  }
  const bytes = await readFileFn(percorsoContenuto);
  return { bytes, dimensione: stat.size, nome: voce.nome, mediaType: voce.mediaType };
}

/**
 * Solo la provenienza — MAI il contenuto: la stessa "seconda porta"
 * di `library_file_origin` mobile (owner: "ogni funzione ha DUE
 * porte, la stazione e l'attrezzo" — qui l'attrezzo che risponde "chi
 * ha fatto questo file" senza dover leggerlo). `null` se l'id non
 * esiste.
 */
export async function origineVoce({ cartella, id }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const cartellaVoce = cartellaDellaVoce(cartella, id);
  if (!cartellaVoce) return null;
  const meta = await leggiMeta(join(cartellaVoce, NOME_FILE_META), readFileFn, id);
  if (meta === undefined) return null;
  const voce = meta2voce(id, meta);
  return { nome: voce.nome, origine: voce.origine, modello: voce.modello, provider: voce.provider, creatoIl: voce.creatoIl };
}

/**
 * Un nome di Libreria non è testo libero: è un'etichetta. Porto diretto
 * di `talosSafeLibraryName` mobile (`libraryWriteTools.ts` righe 48-58)
 * — tolti separatori di percorso e caratteri di controllo, perché
 * questo nome finisce in un file VERO su disco (`library_export`,
 * seconda fetta) dove una barra smetterebbe di essere una lettera e
 * diventerebbe una cartella. ⛔ Non porta `talosStripPromptEnvelope`
 * (mobile la applica prima: rimuove un involucro di prompt-injection
 * specifico del suo formato di messaggio) — il desktop non ha quel
 * concetto, e sanificare qui i soli caratteri strutturalmente
 * pericolosi resta sufficiente per un nome file.
 */
export function sanificaNomeLibreria(valore) {
  return String(valore ?? '')
    .normalize('NFKC')
    .replace(/[ --]/g, ' ')
    .replace(/[/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+\s*/, '')
    .trim();
}

/**
 * Risolve un riferimento del modello (id ESATTO o nome visibile
 * ESATTO) a UNA voce — porto diretto della logica di `library_export`
 * mobile (`libraryExportTools.ts` righe 62-79): mai un fuzzy-match sul
 * nome (case/spazi normalizzati sì, un sinonimo o un troncamento no).
 * Più di un nome uguale ⇒ `{ambiguo:true}` (mai una scelta a caso: il
 * modello deve chiedere); nessuna corrispondenza ⇒ `null`.
 */
export function trovaVoce(voci, reference) {
  const perId = voci.find((v) => v.id === reference);
  if (perId) return perId;
  const cercato = String(reference ?? '').normalize('NFKC').trim().toLowerCase();
  const perNome = voci.filter((v) => v.nome.normalize('NFKC').trim().toLowerCase() === cercato);
  if (perNome.length > 1) return { ambiguo: true };
  return perNome[0] ?? null;
}

/**
 * Rinomina una voce — SOLO i metadata, mai il contenuto. `null` se
 * l'id non esiste; il nome nuovo è sanificato QUI (non fidato dal
 * chiamante), e un nome vuoto DOPO la sanificazione è un errore
 * dichiarato — mai un file rinominato al vuoto.
 */
export async function rinominaVoce({ cartella, id, nome }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  const nomeSicuro = sanificaNomeLibreria(nome);
  if (!nomeSicuro) {
    throw new LibraryStoreError('Il nome è vuoto una volta tolti i caratteri di percorso — scegline uno semplice.', 'LIBRARY_NAME_EMPTY');
  }
  const cartellaVoce = cartellaDellaVoce(cartella, id);
  if (!cartellaVoce) return null;
  const meta = await leggiMeta(join(cartellaVoce, NOME_FILE_META), readFileFn, id);
  if (meta === undefined) return null;
  const nomePrima = meta.nome;
  const aggiornato = { ...meta, nome: nomeSicuro, aggiornatoIl: new Date().toISOString() };
  await writeFileFn(join(cartellaVoce, NOME_FILE_META), JSON.stringify(aggiornato, null, 2), 'utf8');
  return { id, nomePrima, nomeDopo: nomeSicuro };
}

/**
 * Elimina una voce PER INTERO (metadata + contenuto) — la cartella
 * `<id>/` sparisce dal disco. `null` se l'id non esiste (mai
 * un'eccezione per un id già sparito: è un esito onesto, "già andato",
 * non un guasto — stesso principio di `library_delete` mobile,
 * `libraryWriteTools.ts` riga 191 "It may already be gone").
 */
export async function eliminaVoce({ cartella, id }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const rmFn = deps.rmFn ?? fsp.rm;
  const cartellaVoce = cartellaDellaVoce(cartella, id);
  if (!cartellaVoce) return null;
  const meta = await leggiMeta(join(cartellaVoce, NOME_FILE_META), readFileFn, id);
  if (meta === undefined) return null;
  await rmFn(cartellaVoce, { recursive: true, force: true });
  return { id, nome: meta.nome };
}

/**
 * ⛔ NON un tool del modello — primitivo interno per seminare/testare
 * (e per la futura auto-archiviazione di document_create/generate_image
 * nella Libreria, non ancora decisa). Un id non si passa mai dal
 * chiamante: è sempre generato qui, stesso principio di ogni id in
 * questo progetto.
 */
export async function salvaVoce({ cartella, nome, mediaType, origine = 'uploaded', testo, base64, modello, provider }, deps = {}) {
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  const randomUUIDFn = deps.randomUUIDFn ?? randomUUID;
  if (typeof nome !== 'string' || nome.trim().length === 0) {
    throw new LibraryStoreError('Un file di Libreria vuole un nome', 'LIBRARY_INVALID');
  }
  if (typeof testo !== 'string' && typeof base64 !== 'string') {
    throw new LibraryStoreError('Un file di Libreria vuole un contenuto (testo o base64)', 'LIBRARY_INVALID');
  }
  const id = `lib-${randomUUIDFn()}`;
  const cartellaVoce = join(cartella, CARTELLA_LIBRERIA, id);
  await mkdirFn(cartellaVoce, { recursive: true });
  const adesso = new Date().toISOString();
  const origineEffettiva = origine === 'generated' ? 'generated' : 'uploaded';
  const meta = {
    nome: nome.trim(),
    mediaType: mediaType || 'text/plain',
    origine: origineEffettiva,
    creatoIl: adesso,
    aggiornatoIl: adesso,
    ...(origineEffettiva === 'generated' && modello ? { modello } : {}),
    ...(origineEffettiva === 'generated' && provider ? { provider } : {}),
  };
  await writeFileFn(join(cartellaVoce, NOME_FILE_META), JSON.stringify(meta, null, 2), 'utf8');
  if (typeof base64 === 'string') {
    await writeFileFn(join(cartellaVoce, NOME_FILE_CONTENUTO), Buffer.from(base64, 'base64'));
  } else {
    await writeFileFn(join(cartellaVoce, NOME_FILE_CONTENUTO), testo, 'utf8');
  }
  return id;
}

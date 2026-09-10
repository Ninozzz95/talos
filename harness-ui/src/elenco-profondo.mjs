/**
 * elenco-profondo.mjs — P-13: il COSTRUTTORE dell'elenco profondo dei file.
 *
 * ⛔ Perché esiste, misurato (non da rifare): l'attrezzo di elenco del kernel arriva a
 * profondità 2. I 106 percorsi dei task del corpus `storia` stanno a profondità 4-6, ZERO a
 * profondità ≤ 2, e 35 consegne su 35 non nominano nessun file. TALOS non può risolverne
 * nessuno — e non per bravura del modello: non li VEDE. Pass-rate oggi 0 su 35.
 * Su questo repo, con potatura: profondità 2 → 336 file (~3.400 token) · tutto l'albero, con
 * fuori anche ciò che `git` ignora → 717 file (~7.900 token). Il costo della vista completa è
 * ~4.500 token: si paga. (Misurato con questo modulo il 10/09/2026, e non combacia al file con
 * la stima che me l'ha commissionato — 333 e 676 — perché quella non contava `frontend/`.)
 *
 * ⛔ PURA rispetto alla configurazione: il filesystem si inietta (`fs`), come in
 * `local-model-store.mjs` (`fsImpl`) e `workspace-disk.mjs` (`readdirFn`). Nessuna decisione
 * presa leggendo l'ambiente: tutto arriva dagli argomenti.
 *
 * ── LE QUATTRO DECISIONI, con le loro fonti ──────────────────────────────────────────────
 *
 * (1) COSA SI POTA. La lista non è inventata qui: è l'unione di quelle che questo repo ha già
 *     — `src/workspace-info.mjs:40` (la più ampia) e `src/workspace-context.mjs:25` — più
 *     `bower_components`, che è l'altra metà del default di VS Code («search.exclude» di
 *     serie esclude `node_modules` e `bower_components` a ogni livello, microsoft/vscode
 *     #84619 e #8934, letti il 10/09/2026). Prima di cercare fuori ho cercato dentro: la lezione
 *     `chi-guarda-da-fuori-inventa-quello-che-dentro-aveva-gia` dice esattamente questo.
 *     ⛔ `dist`, `build`, `out`, `target`, `vendor` a volte contengono codice VERO (il
 *     `vendor/` di Go è sorgente). Si potano lo stesso — sono grandi, generati e non si
 *     modificano — ma la potatura è un ARGOMENTO (`escludiCartelle`), non una legge: chi
 *     lavora su un progetto Go passa la sua lista.
 *
 * (2) QUALI ESTENSIONI TENERE — e perché una DENYLIST, non una allowlist.
 *     Gli strumenti veri non decidono per estensione: ripgrep chiama binario un file se e
 *     solo se contiene un byte NUL, guardando i primi kilobyte (BurntSushi/ripgrep
 *     discussion #2050 e la guida ufficiale, letti il 10/09/2026). Qui la firma NON si usa,
 *     per due ragioni misurabili: (a) questo elenco è fatto di NOMI, non di contenuti —
 *     leggere i primi byte di 676 file sono 676 `open`+`read` in più per rispondere a una
 *     domanda che non riguarda il contenuto; (b) non risolverebbe il caso vero: un `.png` da
 *     4 MB è legittimamente binario, la firma lo confermerebbe e basta.
 *     ⛔ E il verso della lista conta più della lista: una ALLOWLIST («tieni solo .js e .md»)
 *     invecchiando fa sparire un file che esiste — `.astro`, `.zig`, `Dockerfile`, `Makefile`
 *     (che estensione non ha), il linguaggio nato il mese scorso — e il modello concluderebbe
 *     che non c'è: è la BUGIA che questo modulo esiste per non dire. Una DENYLIST che
 *     invecchia produce al massimo una riga di rumore. I due errori non costano uguale, e si
 *     sceglie il verso che sbaglia dalla parte del rumore.
 *
 * (3) L'ORDINE — deterministico, e imposto DURANTE la camminata, non solo alla fine.
 *     La cache del prefisso si aggancia solo se i byte sono IDENTICI: il suo indice è il
 *     rendering esatto fino al punto di taglio, e un solo byte diverso alla posizione N
 *     invalida tutto da lì in poi; chi assembla da un dizionario o da un insieme deve
 *     ordinare per nome, altrimenti la cache si azzera in silenzio (documentazione Claude
 *     «Prompt caching» e la guida `anthropics/skills` prompt-caching.md, letti il
 *     10/09/2026). In memoria è già misurato: la cache costa 1/6 e prende dalla terza
 *     chiamata — l'87% dei token entra e non esce.
 *     ⇒ Tre conseguenze, tutte e tre nel codice qui sotto:
 *       · le voci di ogni cartella si ordinano PRIMA di scendere — `readdir` non promette
 *         nessun ordine (su ext4 è per hash del nome), quindi ordinare solo alla fine
 *         renderebbe deterministico l'elenco COMPLETO ma non quello TRONCATO: il tetto
 *         taglierebbe file diversi a ogni giro;
 *       · si confronta per unità di codice (`<`), MAI con `localeCompare`: l'ordine locale
 *         dipende dai dati ICU compilati dentro Node, e su un ambiente senza ICU completo
 *         cambia. È la stessa trappola già scritta in `src/workspace-info.mjs:29`;
 *       · si cammina in AMPIEZZA (un livello alla volta): se il tetto morde, ciò che
 *         sopravvive è la roba vicina alla radice — `package.json`, `src/`, `tests/` — non il
 *         primo sottoalbero incontrato fino in fondo.
 *
 * (4) IL TETTO — 1.500, non 4.000. Il 4.000 di partenza non era una misura. La misura, fatta
 *     con questo stesso modulo su questo repo il 10/09/2026:
 *       · albero intero, sola potatura di serie ...... 1.700 file · 4.718 esclusi per estensione
 *       · togliendo ciò che `git` già ignora ......... 717 file · 27.640 caratteri · ~7.900 token
 *       · costo per percorso .......................... ~11 token (per il codice il rapporto
 *         carattere/token scende a ~3-3,5 contro i ~4 della prosa, regola confermata il
 *         10/09/2026: nomi lunghi e separatori pagano più della prosa)
 *     A ~11-17 token per riga, 4.000 file sono 44.000-67.000 token di sola lista dentro un
 *     prompt che si paga a ogni giro (scontato dalla cache, non gratis). 1.500 file sono
 *     ~16.000-25.000 token nel caso peggiore misurato: abbastanza per mostrare per intero un
 *     repo grande, poco abbastanza da non mangiare il contesto.
 *     ⛔ Misurato lo stesso giorno, e vale per chi aggancia: SENZA il filtro del `.gitignore`
 *     il tetto morde già qui, e non per colpa del codice — 944 dei 1.700 file sono artefatti di
 *     una cartella di esiti che `git` ignora. Col filtro attaccato restano 717 file e il tetto
 *     non si avvicina nemmeno. Il filtro non è un abbellimento: è ciò che rende il tetto raro.
 *     ⛔ E resta un tetto GREZZO: la moneta vera sono i token, e il contatore vero è già in
 *     `src/context-token-counters.mjs`. Chi aggancia questo modulo decida se tagliare lì.
 */
import { readdir, realpath, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

export class ElencoProfondoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ElencoProfondoError';
    this.code = 'ELENCO_INVALIDO';
  }
}

/** Vedi decisione (1). Unione di `workspace-info.mjs:40` + `workspace-context.mjs:25` + il default di VS Code. */
export const CARTELLE_ESCLUSE_PREDEFINITE = Object.freeze([
  // controllo di versione
  '.git', '.hg', '.svn',
  // dipendenze scaricate
  'node_modules', 'bower_components', 'vendor', '.pnpm-store', '.yarn',
  // prodotti della compilazione
  'dist', 'build', 'out', 'target', '.next', '.nuxt', '.svelte-kit', '.output',
  // cache e prodotti degli strumenti
  '.cache', '.turbo', '.parcel-cache', '.gradle', 'coverage', '.nyc_output',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox',
  // ambienti virtuali
  '.venv', 'venv', 'virtualenv',
]);

/** Vedi decisione (2): denylist corta e sostituibile, mai una allowlist. */
export const ESTENSIONI_ESCLUSE_PREDEFINITE = Object.freeze([
  // immagini e media (`.svg` NO: è testo, e dice com'è fatta la UI)
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.avif', '.tiff', '.psd',
  '.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.mp4', '.mov', '.avi', '.mkv', '.webm',
  // archivi e pacchetti
  '.zip', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar', '.tar', '.jar', '.war', '.apk', '.aab',
  '.iso', '.dmg',
  // eseguibili e oggetti
  '.exe', '.dll', '.so', '.dylib', '.bin', '.o', '.a', '.lib', '.pdb', '.obj', '.class',
  '.pyc', '.pyo', '.node', '.wasm',
  // caratteri tipografici
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  // pesi dei modelli: questo repo ne scarica, e sono i file più grandi del disco
  '.gguf', '.safetensors', '.onnx', '.pt', '.pth', '.npz', '.h5', '.ckpt',
  // basi di dati e mappe sorgente generate
  '.db', '.sqlite', '.sqlite3', '.mdb', '.map',
]);

/** File senza estensione che nessuno ha scritto: li lascia il sistema operativo. */
const NOMI_ESCLUSI = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);

export const TETTO_FILE_PREDEFINITO = 1500;
export const PROFONDITA_PREDEFINITA = 8;

/**
 * Ordine totale, stabile e indipendente dall'ambiente (decisione 3).
 * Si confronta segmento per segmento — così un sottoalbero resta unito invece di essere
 * spezzato dal separatore — e a parità di cartella i file vengono prima delle sottocartelle:
 * chi legge vede cosa c'è QUI prima di scendere.
 * ⛔ Mai `localeCompare`: dipende da ICU, e un ordine che cambia da una macchina all'altra
 * rompe il prefisso della cache.
 */
export function confrontaPercorsi(a, b) {
  const sa = String(a).split('/');
  const sb = String(b).split('/');
  const comuni = Math.min(sa.length, sb.length);
  for (let i = 0; i < comuni; i += 1) {
    if (sa[i] === sb[i]) continue;
    const ultimoA = i === sa.length - 1;
    const ultimoB = i === sb.length - 1;
    if (ultimoA !== ultimoB) return ultimoA ? -1 : 1;
    return sa[i] < sb[i] ? -1 : 1;
  }
  return sa.length - sb.length;
}

function insiemeMinuscolo(valore, predefinito) {
  const grezzo = valore === undefined || valore === null ? predefinito : valore;
  const voci = grezzo instanceof Set ? [...grezzo] : Array.isArray(grezzo) ? grezzo : [grezzo];
  return new Set(voci.filter((v) => typeof v === 'string').map((v) => v.toLowerCase()));
}

function estensioneDi(nome) {
  const punto = nome.lastIndexOf('.');
  // `.gitignore` non ha estensione: è un nome che comincia col punto
  return punto > 0 ? nome.slice(punto).toLowerCase() : '';
}

function ordinaVoci(voci) {
  return [...voci].sort((a, b) => (a.name === b.name ? 0 : a.name < b.name ? -1 : 1));
}

/**
 * Cammina l'albero e restituisce i percorsi dei file, potati e ordinati.
 *
 * @param {object} input
 * @param {string} input.radice — cartella da cui partire (assoluta o relativa a chi chiama)
 * @param {number} [input.profonditaMax=8] — quanti segmenti può avere il percorso di un file:
 *   `README.md` è 1, `src/a.mjs` è 2, `a/b/c/d/e/f.txt` è 6. Con 2 si riproduce esattamente la
 *   vista di oggi, quella che non vede nessuno dei 106 percorsi del corpus.
 * @param {number} [input.tettoFile=1500] — vedi decisione (4)
 * @param {string[]|Set<string>} [input.escludiCartelle] — nomi di cartella da non aprire
 * @param {string[]|Set<string>} [input.escludiEstensioni] — estensioni da non elencare
 * @param {object} [input.fs] — `{readdir, realpath, stat}`; si inietta, come negli altri moduli
 * @param {(percorsoRelativo: string, info?: {cartella: boolean}) => boolean} [input.filtro]
 *   true = tieni. Riceve SIA i file SIA le cartelle (una cartella negata non si apre: è così
 *   che un `.gitignore` pota un sottoalbero intero senza camminarlo). Il secondo argomento
 *   dice quale dei due è; una funzione a un solo argomento continua a funzionare.
 * @returns {Promise<{percorsi: string[], troncato: boolean, cartelleSaltate: number,
 *   fileEsclusi: number, dettaglio: object}>}
 */
export async function costruisciElencoProfondo({
  radice,
  profonditaMax = PROFONDITA_PREDEFINITA,
  tettoFile = TETTO_FILE_PREDEFINITO,
  escludiCartelle,
  escludiEstensioni,
  fs,
  filtro,
} = {}) {
  if (typeof radice !== 'string' || radice.length === 0 || radice.includes('\0')) {
    throw new ElencoProfondoError('La cartella di partenza non è valida');
  }
  if (filtro !== undefined && typeof filtro !== 'function') {
    throw new ElencoProfondoError('Il filtro deve essere una funzione');
  }

  const disco = { readdir, realpath, stat, ...(fs ?? {}) };
  const cartelleEscluse = insiemeMinuscolo(escludiCartelle, CARTELLE_ESCLUSE_PREDEFINITE);
  const estensioniEscluse = insiemeMinuscolo(escludiEstensioni, ESTENSIONI_ESCLUSE_PREDEFINITE);
  const tetto = Number.isFinite(tettoFile) ? Math.max(0, Math.trunc(tettoFile)) : TETTO_FILE_PREDEFINITO;
  const profondita = Number.isFinite(profonditaMax) ? Math.trunc(profonditaMax) : PROFONDITA_PREDEFINITA;
  const tieni = (percorso, cartella) => (filtro ? filtro(percorso, { cartella }) !== false : true);

  const percorsi = [];
  const dettaglio = { perNome: 0, perProfondita: 0, perFiltro: 0, perCiclo: 0, illeggibili: 0, perEstensione: 0, fileFiltrati: 0 };
  let troncato = false;
  let fileEsclusi = 0;

  /*
   * ⛔ Anello simbolico: seguire un link a una cartella genitore fa camminare per sempre — è un
   * modo noto di piantare un processo (nodejs/node #51749 sulla `readdir` ricorsiva; la cura
   * standard è confrontare i percorsi REALI, non quelli costruiti, letto il 10/09/2026). Qui si
   * paga una `realpath` per cartella: una syscall contro una `readdir` intera, e l'unica
   * alternativa — fidarsi del percorso costruito — non regge un link.
   *
   * ⛔ Ma si guarda la CATENA DEGLI ANTENATI, non un insieme globale di «già viste». La prima
   * versione teneva un insieme globale, e la prova `ELENCO-ANELLO-05` l'ha bocciata: con due
   * strade diverse verso la stessa cartella (un collegamento `scorciatoia` → `vera`) vinceva
   * quella incontrata per prima in ordine alfabetico, e `vera/dentro.txt` — un percorso che sul
   * disco funziona — spariva dall'elenco. Cioè esattamente la bugia che questo modulo esiste per
   * non dire, prodotta dalla guardia contro i cicli. Un ciclo è tornare su un ANTENATO del
   * proprio cammino; due rami che finiscono nello stesso posto non lo sono, e il cammino resta
   * finito. Il prezzo è che una cartella raggiungibile per due strade si elenca due volte: è la
   * verità sul disco, e costa qualche riga invece di un file invisibile.
   */
  const radiceReale = await disco.realpath(radice).catch(() => radice);

  const coda = [{ assoluto: radice, relativo: '', livello: 0, antenati: [radiceReale] }];
  while (coda.length > 0 && !troncato) {
    const corrente = coda.shift();
    let voci;
    try {
      voci = await disco.readdir(corrente.assoluto, { withFileTypes: true });
    } catch {
      // Una cartella che non si lascia leggere (permessi, sparita nel frattempo) si salta e si
      // CONTA: tacere qui vorrebbe dire dichiarare completo un elenco che non lo è.
      dettaglio.illeggibili += 1;
      continue;
    }

    for (const voce of ordinaVoci(voci)) {
      const nome = typeof voce === 'string' ? voce : voce.name;
      const relativo = corrente.relativo ? `${corrente.relativo}/${nome}` : nome;
      const assoluto = join(corrente.assoluto, nome);

      let eCartella = Boolean(voce.isDirectory?.());
      let eFile = Boolean(voce.isFile?.());
      if (voce.isSymbolicLink?.()) {
        // Un link non dice da solo cosa c'è dall'altra parte: si guarda.
        const informazioni = await disco.stat(assoluto).catch(() => null);
        if (!informazioni) { dettaglio.illeggibili += 1; continue; } // link rotto: onesto, non fatale
        eCartella = Boolean(informazioni.isDirectory?.());
        eFile = Boolean(informazioni.isFile?.());
      }

      if (eCartella) {
        if (cartelleEscluse.has(nome.toLowerCase())) { dettaglio.perNome += 1; continue; }
        if (!tieni(relativo, true)) { dettaglio.perFiltro += 1; continue; }
        // Si apre solo se i file che contiene starebbero dentro la profondità chiesta.
        if (corrente.livello + 2 > profondita) { dettaglio.perProfondita += 1; continue; }
        const reale = await disco.realpath(assoluto).catch(() => assoluto);
        if (corrente.antenati.includes(reale)) { dettaglio.perCiclo += 1; continue; }
        coda.push({ assoluto, relativo, livello: corrente.livello + 1, antenati: [...corrente.antenati, reale] });
        continue;
      }

      if (!eFile) continue; // socket, fifo, dispositivo: non è un file da nominare a nessuno

      if (NOMI_ESCLUSI.has(nome.toLowerCase())) { fileEsclusi += 1; dettaglio.perEstensione += 1; continue; }
      if (estensioniEscluse.has(estensioneDi(nome))) { fileEsclusi += 1; dettaglio.perEstensione += 1; continue; }
      if (!tieni(relativo, false)) { fileEsclusi += 1; dettaglio.fileFiltrati += 1; continue; }

      if (percorsi.length >= tetto) { troncato = true; break; }
      percorsi.push(relativo);
    }
  }

  percorsi.sort(confrontaPercorsi);
  const cartelleSaltate = dettaglio.perNome + dettaglio.perProfondita + dettaglio.perFiltro
    + dettaglio.perCiclo + dettaglio.illeggibili;
  return { percorsi, troncato, cartelleSaltate, fileEsclusi, dettaglio };
}

/**
 * Il testo da mettere nel prompt, con la sua intestazione.
 *
 * ⛔ Se il tetto ha morso, lo DICE — in testa e in coda. In testa perché sia la prima cosa
 * letta; in coda perché dopo millecinquecento righe la prima riga è lontana, e l'ultima cosa
 * letta prima della domanda è quella che pesa. Un elenco tagliato che sembra completo è
 * peggio di nessun elenco: porta a concludere che un file non esiste.
 *
 * ⛔ Nell'intestazione va il NOME della cartella, mai il percorso intero: un percorso assoluto
 * contiene il nome della persona e questo testo finisce dentro un prompt, cioè fuori dalla
 * macchina. È la lezione `cancello-4-non-guardava-tutto-mobile` — un percorso personale
 * pubblicato in chiaro perché nessuno aveva guardato dove finiva.
 *
 * @param {string[]} percorsi
 * @param {{troncato?: boolean, radice?: string, fileEsclusi?: number}} [stato] — accetta
 *   direttamente il risultato di `costruisciElencoProfondo`
 * @returns {string}
 */
export function testoElenco(percorsi = [], { troncato = false, radice = '', fileEsclusi = 0 } = {}) {
  const elenco = Array.isArray(percorsi) ? percorsi.filter((p) => typeof p === 'string') : [];
  const nome = basename(String(radice ?? '').replace(/[\\/]+$/, '')) || 'la cartella di lavoro';

  if (elenco.length === 0) {
    return troncato
      ? `Nessun file da mostrare per «${nome}»: l'elenco si è fermato prima di raccoglierne uno.`
      : `Nessun file da mostrare per «${nome}».`;
  }

  const righe = [];
  if (troncato) {
    righe.push(`⚠ ELENCO INCOMPLETO — mi sono fermato a ${elenco.length} percorsi, l'albero ne ha altri.`);
  }
  righe.push(`File di «${nome}» — ${elenco.length} percorsi, dalla cartella principale in giù.`);
  if (fileEsclusi > 0) {
    righe.push(`(${fileEsclusi} file non compaiono: immagini, archivi, pesi dei modelli e simili.)`);
  }
  righe.push('');
  righe.push(...elenco);
  if (troncato) {
    righe.push('');
    righe.push('⚠ Fine di un elenco INCOMPLETO: se un file non compare qui sopra non vuol dire che non esista — cercalo prima di dire che manca.');
  }
  return righe.join('\n');
}

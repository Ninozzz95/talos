/*
 * ⭐⭐⭐ ATLAS F3 (27/09/2026) — LA CARD DELLA LIBRERIA È QUELLA DEL MOBILE.
 *
 * Owner, 27/09/2026: «le carte devono essere identiche alla versione mobile, non negoziabile». Questo file è la parte
 * PURA di quella card, tradotta dal codice del mobile alla fonte (ramo `lane/talos-mobile-allineamento`, v0.1.38):
 *   · `mobile/src/lib/libraryFilePresentation.ts` → `presentazioneFileLibreria` (l'estensione e la famiglia del glifo);
 *   · `mobile/src/lib/library/libraryThumbnails.ts` → `genereAnteprimaLibreria`, `anteprimaTipografica`,
 *     `titoloAnteprima` (che cosa si mostra nel riquadro in alto, e come si accorcia il titolo).
 * ⛔ Stesse regole, stessi numeri: se il mobile cambia una soglia, questa copia va rifatta con lui. Il mobile non si
 *   tocca da qui (ownership per sessione): si legge e si porta.
 */

/** @typedef {'image'|'pdf'|'word'|'spreadsheet'|'presentation'|'code'|'data'|'archive'|'text'|'file'} FamigliaFile */

import { t as traduci } from './lingua.js';
const ESTENSIONI_IMMAGINE = new Set(['avif', 'bmp', 'gif', 'heic', 'heif', 'jpeg', 'jpg', 'png', 'svg', 'tif', 'tiff', 'webp']);
const ESTENSIONI_WORD = new Set(['doc', 'docx', 'odt', 'rtf']);
const ESTENSIONI_FOGLIO = new Set(['csv', 'ods', 'tsv', 'xls', 'xlsx']);
const ESTENSIONI_PRESENTAZIONE = new Set(['odp', 'ppt', 'pptx']);
const ESTENSIONI_CODICE = new Set([
  'bash', 'c', 'cpp', 'cs', 'css', 'go', 'h', 'hpp', 'htm', 'html', 'java',
  'js', 'jsx', 'kt', 'kts', 'php', 'ps1', 'py', 'rb', 'rs', 'scss', 'sh',
  'sql', 'swift', 'ts', 'tsx', 'vue', 'zsh',
]);
const ESTENSIONI_DATI = new Set(['ini', 'json', 'toml', 'xml', 'yaml', 'yml']);
const ESTENSIONI_ARCHIVIO = new Set(['7z', 'bz2', 'gz', 'rar', 'tar', 'xz', 'zip']);
const ESTENSIONI_TESTO = new Set(['log', 'markdown', 'md', 'txt']);

const ESTENSIONE_DA_TIPO = Object.freeze({
  'application/gzip': 'GZ',
  'application/json': 'JSON',
  'application/pdf': 'PDF',
  'application/rtf': 'RTF',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.ms-powerpoint': 'PPT',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/x-7z-compressed': '7Z',
  'application/xml': 'XML',
  'application/zip': 'ZIP',
  'image/avif': 'AVIF',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/svg+xml': 'SVG',
  'image/webp': 'WEBP',
  'text/csv': 'CSV',
  'text/html': 'HTML',
  'text/markdown': 'MD',
  'text/plain': 'TXT',
});

function estensioneDalNome(nome) {
  const foglia = String(nome ?? '').trim().split(/[\\/]/).at(-1) ?? '';
  const trovata = foglia.match(/\.([a-z0-9][a-z0-9+_-]{0,11})$/i);
  return trovata?.[1]?.toLowerCase() ?? null;
}

function famigliaDaEstensione(estensione) {
  if (ESTENSIONI_IMMAGINE.has(estensione)) return 'image';
  if (estensione === 'pdf') return 'pdf';
  if (ESTENSIONI_WORD.has(estensione)) return 'word';
  if (ESTENSIONI_FOGLIO.has(estensione)) return 'spreadsheet';
  if (ESTENSIONI_PRESENTAZIONE.has(estensione)) return 'presentation';
  if (ESTENSIONI_CODICE.has(estensione)) return 'code';
  if (ESTENSIONI_DATI.has(estensione)) return 'data';
  if (ESTENSIONI_ARCHIVIO.has(estensione)) return 'archive';
  if (ESTENSIONI_TESTO.has(estensione)) return 'text';
  return null;
}

function famigliaDaTipo(tipo) {
  if (tipo.startsWith('image/')) return 'image';
  if (tipo === 'application/pdf') return 'pdf';
  if (tipo.includes('wordprocessingml') || tipo === 'application/msword') return 'word';
  if (tipo.includes('spreadsheetml') || tipo.includes('excel') || tipo === 'text/csv') return 'spreadsheet';
  if (tipo.includes('presentationml') || tipo.includes('powerpoint')) return 'presentation';
  if (tipo.includes('zip') || tipo.includes('gzip') || tipo.includes('compressed')) return 'archive';
  if (tipo.includes('json') || tipo.includes('xml') || tipo.includes('yaml')) return 'data';
  if (tipo.includes('javascript') || tipo.includes('typescript') || tipo === 'text/css' || tipo === 'text/html') return 'code';
  if (tipo.startsWith('text/')) return 'text';
  return 'file';
}

/**
 * L'estensione che si legge sulla card e la famiglia del glifo. Come sul mobile, il suffisso del nome è l'indizio
 * principale (è ciò che la persona vede) e il tipo dichiarato è solo il ripiego per i file senza suffisso; nessuno dei
 * due decide niente di sicurezza.
 * @returns {{ estensione: string, famiglia: FamigliaFile }}
 */
export function presentazioneFileLibreria(nome, mediaType) {
  const tipo = String(mediaType ?? '').trim().toLowerCase().split(';', 1)[0] ?? '';
  const estensione = estensioneDalNome(nome);
  const famiglia = estensione ? (famigliaDaEstensione(estensione) ?? famigliaDaTipo(tipo)) : famigliaDaTipo(tipo);
  return {
    estensione: estensione?.toUpperCase() ?? ESTENSIONE_DA_TIPO[tipo] ?? (famiglia === 'file' ? 'FILE' : famiglia.toUpperCase()),
    famiglia,
  };
}

/*
 * ⛔ Le immagini che si mostrano come immagini. SVG no, ed è deliberato (mobile, stessa regola): un SVG è un documento
 *   eseguibile e un file della Libreria può arrivare da una pagina web letta da TALOS. HEIC/HEIF nemmeno: il browser non
 *   li decodifica. Prendono il glifo, come ogni formato senza anteprima.
 */
const TIPI_IMMAGINE_APRIBILI = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif']);
/* Le famiglie la cui anteprima è il TESTO che contengono: le stesse del glifo, quindi un file che mostra l'icona «testo»
   non può ritrovarsi con un'anteprima di un'altra famiglia. */
const FAMIGLIE_TIPOGRAFICHE = new Set(['text', 'code', 'data', 'spreadsheet']);

/*
 * ⛔ DIFFERENZA DAL MOBILE, misurata: l'elenco della Libreria che il desktop riceve (`session-registry.mjs`,
 *   `elencaLibreria`) NON porta `mediaType` — porta `fileType` («image»/«document», ricavato dal server proprio da
 *   `mediaType`, `library-store.mjs` `tipoFileLibreria`) e il nome. Il mobile decide sul tipo dichiarato; qui, quando il
 *   tipo non c'è, lo si ricava dall'estensione — per le immagini SOLO se il server dice anche «image». Nessuno dei due
 *   decide niente di sicurezza: un'immagine o un PDF che non si aprono cadono sul glifo, e lo dicono in console.
 */
const TIPO_DA_ESTENSIONE = Object.freeze({
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif',
  pdf: 'application/pdf',
});

function tipoDellaVoce(voce) {
  const dichiarato = String(voce?.mediaType ?? '').trim().toLowerCase().split(';', 1)[0] ?? '';
  if (dichiarato) return dichiarato;
  const dedotto = TIPO_DA_ESTENSIONE[estensioneDalNome(voce?.nome) ?? ''] ?? '';
  if (dedotto.startsWith('image/') && voce?.fileType !== 'image') return '';
  return dedotto;
}

/*
 * ⛔ DIFFERENZA DAL MOBILE, dichiarata (revisione Codex 27/09, rilievo 11): i fogli di calcolo BINARI (XLSX, XLS, ODS,
 *   Numbers) sul mobile mostrano il testo che il vault ne ha ESTRATTO; il desktop non ha un'estrazione, e leggerne i byte
 *   come testo disegnava «PK…��…» nel mini-documento. Prendono il glifo del formato. CSV e TSV restano testo.
 */
const FOGLI_BINARI = new Set(['xls', 'xlsx', 'ods', 'numbers']);
function eFoglioBinario(voce) {
  const tipo = String(voce?.mediaType ?? '').toLowerCase();
  if (tipo.includes('spreadsheetml') || tipo.includes('ms-excel') || tipo.includes('opendocument.spreadsheet')) return true;
  return FOGLI_BINARI.has(estensioneDalNome(voce?.nome) ?? '');
}

/** @returns {'image'|'pdf'|'typographic'|'none'} che cosa va nel riquadro in alto della card. */
export function genereAnteprimaLibreria(voce) {
  if (!voce?.id) return 'none';
  const tipo = tipoDellaVoce(voce);
  if (TIPI_IMMAGINE_APRIBILI.has(tipo)) return 'image';
  if (tipo === 'application/pdf') return 'pdf';
  const { famiglia } = presentazioneFileLibreria(voce.nome, voce.mediaType);
  if (famiglia === 'spreadsheet' && eFoglioBinario(voce)) return 'none';
  if (FAMIGLIE_TIPOGRAFICHE.has(famiglia)) return 'typographic';
  return 'none';
}

/**
 * I byte dell'inizio di un file di testo, decodificati. UTF-16 col suo BOM si riconosce; il resto è UTF-8 (il BOM UTF-8 lo
 * toglie il decodificatore). ⛔ Un contenuto che SEMBRA binario (un NUL, o più del 2% di caratteri sostitutivi — esclusi
 * quelli in coda, che sono solo il taglio a 16 KB in mezzo a un carattere) torna `null`: niente mini-documento con spazzatura.
 */
export function decodificaInizioDelTesto(byte) {
  const b = byte instanceof Uint8Array ? byte : new Uint8Array(byte ?? []);
  let testo;
  if (b[0] === 0xFF && b[1] === 0xFE) testo = new TextDecoder('utf-16le').decode(b.subarray(2));
  else if (b[0] === 0xFE && b[1] === 0xFF) testo = new TextDecoder('utf-16be').decode(b.subarray(2));
  else testo = new TextDecoder('utf-8', { fatal: false }).decode(b);
  const senzaCoda = testo.replace(/�+$/u, '');
  if (senzaCoda.includes('\u0000')) return null;
  const sostitutivi = (senzaCoda.match(/�/gu) || []).length;
  if (senzaCoda.length > 0 && sostitutivi / senzaCoda.length > 0.02) return null;
  return testo;
}

const RIGHE_ANTEPRIMA = 4;
const LARGHEZZA_RIFERIMENTO = 60;

/**
 * Il «mini-documento» del mockup mobile: il titolo VERO (la prima riga del contenuto, ripulita dai segni del Markdown —
 * non il nome del file, che sta già scritto sotto) e le lunghezze relative delle righe 2-5 da disegnare come barre.
 * Senza contenuto torna `null` e la card cade sul glifo: un riquadro col titolo e quattro trattini finti direbbe che c'è
 * del testo dove non c'è.
 * @returns {{ titolo: string, righe: number[] } | null}
 */
export function anteprimaTipografica(testo) {
  if (typeof testo !== 'string') return null;
  const righe = testo
    .split(/\r?\n/)
    .map((riga) => riga.replace(/^[#>\s*_\-=|]+/, '').replace(/[|*_`]+/g, '').trim())
    .filter((riga) => riga.length > 0);
  if (righe.length === 0) return null;
  const titolo = righe[0].slice(0, 60);
  /* Le barre partono dalla SECONDA riga; un file di una riga sola ne disegna comunque quattro corte — la forma di un
     foglio quasi vuoto è un'informazione. Mai sotto un terzo: una barra da due pixel si legge come un difetto. */
  const corpo = righe.slice(1, 1 + RIGHE_ANTEPRIMA);
  const quote = [];
  for (let indice = 0; indice < RIGHE_ANTEPRIMA; indice += 1) {
    const riga = corpo[indice];
    const quota = riga ? Math.min(riga.length, LARGHEZZA_RIFERIMENTO) / LARGHEZZA_RIFERIMENTO : 0.3;
    quote.push(Math.max(0.34, Math.min(1, quota)));
  }
  return { titolo, righe: quote };
}

/* ─────────────────────────────────────────────────────────────────── la card: glifo, riga, anteprima (DOM) */

/* Le icone del glifo, le STESSE del mobile (`TalosMobileLibraryFileGlyph.vue`, lucide), nello sprite come `i-lib-*`. */
const ICONA_DELLA_FAMIGLIA = Object.freeze({
  image: 'i-lib-file-image', pdf: 'i-lib-file-badge', word: 'i-lib-file-type', spreadsheet: 'i-lib-file-spreadsheet',
  presentation: 'i-lib-presentation', code: 'i-lib-file-code', data: 'i-lib-braces', archive: 'i-lib-file-archive',
  text: 'i-lib-file-text', file: 'i-lib-file',
});

function nodo(doc, tag, classe = '', testo = '') {
  const el = doc.createElement(tag);
  if (classe) el.className = classe;
  if (testo) el.textContent = testo;
  return el;
}

export function iconaSprite(doc, id, classe = 'i') {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', classe);
  svg.setAttribute('aria-hidden', 'true');
  const uso = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
  uso.setAttribute('href', `#${id}`);
  svg.append(uso);
  return svg;
}

/** Il glifo del formato quando non c'è un'anteprima: l'icona della famiglia e, sotto, l'estensione in monospazio. */
export function creaGlifoFormato(doc, voce) {
  const { estensione, famiglia } = presentazioneFileLibreria(voce?.nome, voce?.mediaType);
  const glifo = nodo(doc, 'span', 'td-lib-glifo');
  glifo.dataset.famiglia = famiglia;
  glifo.setAttribute('aria-hidden', 'true');
  glifo.append(iconaSprite(doc, ICONA_DELLA_FAMIGLIA[famiglia] || 'i-lib-file'), nodo(doc, 'span', 'td-lib-estensione', estensione));
  return glifo;
}

/**
 * La riga sotto il nome, come sul mobile: `Generato · MD`. «Generato» in accento, e solo lui: un file caricato dalla
 * persona non ha niente da dire (il mobile scrive soltanto l'eccezione). La chat d'origine e «Escluso dal contesto» il
 * mobile li aggiunge in casi che sul desktop non esistono (raggruppamento per chat, esclusione dal contesto).
 */
export function creaRigaDettaglio(doc, voce) {
  const riga = nodo(doc, 'small', 'td-lib-dettaglio');
  const pezzi = [];
  if (voce?.origine === 'generated') pezzi.push(nodo(doc, 'span', 'td-lib-generato', traduci('sezioni.library.origin.generated')));
  pezzi.push(nodo(doc, 'span', '', presentazioneFileLibreria(voce?.nome, voce?.mediaType).estensione));
  pezzi.forEach((pezzo, i) => {
    if (i > 0) { const sep = nodo(doc, 'span', '', ' · '); sep.setAttribute('aria-hidden', 'true'); riga.append(sep); }
    riga.append(pezzo);
  });
  return riga;
}

/*
 * L'ANTEPRIMA, pigra come quella del mobile (`TalosMobileLibraryArt.vue`, cinque stati: immagine · caricamento ·
 * mini-documento · glifo; il quinto, «link», il desktop non ce l'ha). Tre cose del desktop che il mobile non ha:
 *  · il testo non è già estratto in un database: si legge dal file (`GET /library/:id/file`, la rotta del lettore) SOLO
 *    quando la card entra in vista, e solo i primi 16 KB — un log da 9 MB non si scarica per disegnare quattro barre;
 *  · il PDF si disegna con pdf.js (owner 27/09: «prima pagina con pdf.js») e si tiene come immagine `data:`, perché il
 *    CSP della pagina (`img-src 'self' data:`) non ammette `blob:`;
 *  · la card si ridisegna a ogni filtro o scelta (l'impianto `td-*` rifà l'elenco): quindi ciò che si è letto resta in
 *    memoria per voce (sessione, id, data di modifica) e il ridisegno è istantaneo. Al massimo TRE letture insieme.
 */
/*
 * La memoria delle anteprime (revisione Codex 27/09, rilievi 7, 8, 9, 10): una mappa in ordine d'uso con un TETTO (le prime
 * pagine dei PDF sono immagini `data:` da decine di KB: una sessione lunga non deve trattenerle tutte per la vita della
 * pagina); ci entrano solo gli esiti VERI — un errore di rete non diventa un glifo per sempre; «Aggiorna» la svuota per la
 * sessione (un file cambiato fuori da TALOS non cambia la sua data nella Libreria).
 */
const MEMORIA_ANTEPRIME = new Map();
const MEMORIA_MASSIMA = 240;
const IN_VOLO = new Map();
const LETTURE_MASSIME = 3;
/* ⛔ Il tetto di una lettura (rilievo 5): senza, tre letture appese (rete ferma, un PDF che non finisce di disegnarsi)
   tenevano occupati tutti i posti della coda, per sempre e per tutte le sessioni. Non nasconde una corsa: è il failsafe di
   una rete che non risponde, e libera il posto. */
const TEMPO_MASSIMO_LETTURA_MS = 20_000;
const BYTE_TESTO = 16_384;
const BYTE_PDF_MASSIMI = 25 * 1024 * 1024;
/* Una pagina lunghissima (rilievo 3) si disegna solo fino a quattro volte la larghezza: il riquadro della card ne mostra la
   testa, e la tela non diventa una superficie da centinaia di megapixel. Le immagini DENTRO il PDF oltre i 40 megapixel
   pdf.js non le decodifica (`maxImageSize`, api.js). */
const ALTEZZA_MASSIMA_IN_LARGHEZZE = 4;
const PIXEL_IMMAGINE_PDF_MASSIMI = 40_000_000;
const RADICE_PDFJS = '/vendor/pdfjs/';
let lettureAttive = 0;
const codaLetture = [];

function richiamaAnteprima(chiave) {
  if (!MEMORIA_ANTEPRIME.has(chiave)) return undefined;
  const esito = MEMORIA_ANTEPRIME.get(chiave);
  MEMORIA_ANTEPRIME.delete(chiave);
  MEMORIA_ANTEPRIME.set(chiave, esito);
  return esito;
}

function ricordaAnteprima(chiave, esito) {
  MEMORIA_ANTEPRIME.delete(chiave);
  MEMORIA_ANTEPRIME.set(chiave, esito);
  while (MEMORIA_ANTEPRIME.size > MEMORIA_MASSIMA) MEMORIA_ANTEPRIME.delete(MEMORIA_ANTEPRIME.keys().next().value);
}

function inCoda(lavoro) {
  return new Promise((risolvi, rifiuta) => {
    const parti = () => {
      lettureAttive += 1;
      const controllo = new AbortController();
      let timer;
      const scadenza = new Promise((_, scaduta) => {
        timer = setTimeout(() => {
          controllo.abort();
          scaduta(new Error(`no response in ${TEMPO_MASSIMO_LETTURA_MS / 1000} s`)); // diagnostica per la console, mai a schermo
        }, TEMPO_MASSIMO_LETTURA_MS);
      });
      Promise.race([Promise.resolve().then(() => lavoro(controllo.signal)), scadenza]).then(risolvi, rifiuta).finally(() => {
        clearTimeout(timer);
        lettureAttive -= 1;
        codaLetture.shift()?.();
      });
    };
    if (lettureAttive < LETTURE_MASSIME) parti(); else codaLetture.push(parti);
  });
}

export function chiaveAnteprima(sessionId, voce) {
  return `${sessionId}|${voce?.id ?? ''}|${voce?.aggiornatoIl ?? ''}`;
}

/** Dimentica le anteprime: di una sessione («Aggiorna»), o tutte (senza argomento, per le prove). */
export function dimenticaAnteprime(sessionId) {
  if (sessionId == null) { MEMORIA_ANTEPRIME.clear(); IN_VOLO.clear(); return; }
  const prefisso = `${sessionId}|`;
  for (const chiave of [...MEMORIA_ANTEPRIME.keys()]) if (chiave.startsWith(prefisso)) MEMORIA_ANTEPRIME.delete(chiave);
}

async function leggiInizioDelTesto(indirizzo, rete, segnale) {
  const risposta = await rete(indirizzo, { signal: segnale });
  if (!risposta?.ok) throw new Error(`HTTP ${risposta?.status ?? '—'}`);
  const lettore = risposta.body?.getReader?.();
  if (!lettore) return decodificaInizioDelTesto(new Uint8Array((await risposta.arrayBuffer()).slice(0, BYTE_TESTO)));
  const pezzi = [];
  let letti = 0;
  while (letti < BYTE_TESTO) {
    const { done, value } = await lettore.read();
    if (done) break;
    pezzi.push(value);
    letti += value.byteLength;
  }
  await lettore.cancel().catch(() => {});
  const tutto = new Uint8Array(Math.min(letti, BYTE_TESTO));
  let posto = 0;
  for (const pezzo of pezzi) {
    const quanto = Math.min(pezzo.byteLength, tutto.byteLength - posto);
    tutto.set(pezzo.subarray(0, quanto), posto);
    posto += quanto;
    if (posto >= tutto.byteLength) break;
  }
  return decodificaInizioDelTesto(tutto);
}

/* La larghezza in pixel della prima pagina: quella vera della card per la densità (mai oltre 2), fra 160 e 1024 — gli
   stessi estremi del mobile (`talosThumbnailWidthPx`). */
function larghezzaAnteprimaPx(larghezzaCss, densita) {
  const d = Number.isFinite(densita) && densita > 0 ? Math.min(densita, 2) : 1;
  const w = Number.isFinite(larghezzaCss) && larghezzaCss > 0 ? larghezzaCss * d : 0;
  return Math.round(Math.max(160, Math.min(1024, w)));
}

async function disegnaPrimaPagina(indirizzo, rete, larghezzaPx, importa, segnale) {
  const risposta = await rete(indirizzo, { signal: segnale });
  if (!risposta?.ok) throw new Error(`HTTP ${risposta?.status ?? '—'}`);
  const dichiarati = Number(risposta.headers?.get?.('content-length'));
  if (Number.isFinite(dichiarati) && dichiarati > BYTE_PDF_MASSIMI) return null;
  const byte = new Uint8Array(await risposta.arrayBuffer());
  if (byte.byteLength > BYTE_PDF_MASSIMI) return null;
  const pdfjs = await importa(`${RADICE_PDFJS}pdf.min.mjs`);
  pdfjs.GlobalWorkerOptions.workerSrc = `${RADICE_PDFJS}pdf.worker.min.mjs`;
  /*
   * Owner 27/09: «aggiungi le risorse» (rilievo 2 di Codex): il mobile disegna la pagina col motore nativo di Android, che
   * ha tutto; qui pdf.js ha bisogno delle CMap (testi CJK con font non incorporati), dei font standard e dei decodificatori
   * JPEG2000/JBIG2. `useWasm:false`: i decodificatori nella versione JS che pdf.js porta apposta (`_noWasmFilename`), perché
   * il wasm vorrebbe 'wasm-unsafe-eval' nella CSP. Opzioni: `src/display/api.js` DocumentInitParameters, Context7 27/09/2026.
   */
  const compito = pdfjs.getDocument({
    data: byte,
    cMapUrl: `${RADICE_PDFJS}cmaps/`,
    standardFontDataUrl: `${RADICE_PDFJS}standard_fonts/`,
    wasmUrl: `${RADICE_PDFJS}wasm/`,
    useWasm: false,
    maxImageSize: PIXEL_IMMAGINE_PDF_MASSIMI,
  });
  const interrompi = () => { compito.destroy().catch(() => {}); };
  segnale?.addEventListener?.('abort', interrompi, { once: true });
  /* ⛔ Il `try` comincia PRIMA di aspettare il documento (rilievo 4): un PDF corrotto o cifrato rifiuta qui, e la pulizia
     del compito — che chiude trasporto e worker — deve girare lo stesso. */
  try {
    const documento = await compito.promise;
    const pagina = await documento.getPage(1);
    const base = pagina.getViewport({ scale: 1 });
    const vista = pagina.getViewport({ scale: larghezzaPx / base.width });
    const tela = globalThis.document.createElement('canvas');
    tela.width = Math.max(1, Math.floor(vista.width));
    tela.height = Math.max(1, Math.min(Math.floor(vista.height), Math.floor(larghezzaPx * ALTEZZA_MASSIMA_IN_LARGHEZZE)));
    await pagina.render({ canvas: tela, viewport: vista }).promise;
    return tela.toDataURL('image/webp', 0.85);
  } finally {
    segnale?.removeEventListener?.('abort', interrompi);
    /* ⛔ In pdf.js 6 il documento non ha più `destroy()`: si libera col compito di caricamento (`src/display/api.js`,
       `PDFDocumentLoadingTask.destroy`, letto il 27/09/2026). La pulizia non può sostituire il risultato. */
    try { await compito.destroy(); } catch { /* il documento è già disegnato: una pulizia mancata non lo cambia */ }
  }
}

function riempiAnteprima(doc, riquadro, voce, esito) {
  if (esito?.tipo === 'tipografica') {
    riquadro.dataset.art = 'typographic';
    const foglio = nodo(doc, 'span', 'td-lib-mini');
    foglio.setAttribute('aria-hidden', 'true');
    foglio.append(nodo(doc, 'span', 'td-lib-mini-segno'), nodo(doc, 'b', 'td-lib-mini-titolo', titoloAnteprima(esito.anteprima.titolo)));
    for (const quota of esito.anteprima.righe) {
      const barra = nodo(doc, 'span', 'td-lib-mini-riga');
      barra.style.width = `${Math.round(quota * 100)}%`;
      foglio.append(barra);
    }
    riquadro.replaceChildren(foglio);
    return;
  }
  if (esito?.tipo === 'immagine' && esito.src) {
    riquadro.dataset.art = 'image';
    const img = nodo(doc, 'img', 'td-lib-immagine');
    img.alt = '';
    img.decoding = 'async';
    img.loading = 'lazy';
    img.src = esito.src;
    img.addEventListener('error', () => riempiAnteprima(doc, riquadro, voce, null), { once: true });
    riquadro.replaceChildren(img);
    return;
  }
  riquadro.dataset.art = 'glyph';
  riquadro.replaceChildren(creaGlifoFormato(doc, voce));
}

/*
 * UN osservatore per documento (rilievo 6): prima ogni card ne aveva uno, staccato solo quando la card entrava in vista —
 * filtri, ricerca e selezione rifanno l'elenco, e gli osservatori delle card tolte restavano vivi coi loro riferimenti.
 * Adesso chi non è più nel documento esce, a ogni ridisegno (in microtask: le card nuove nascono prima di essere appese).
 * ⛔ `scrollMargin` oltre a `rootMargin`: la Libreria scorre dentro un suo contenitore, e `rootMargin` allarga solo la
 *   finestra — le card appena sotto il bordo del contenitore non si preparavano in anticipo (misurato sul 4174 a 1024: la
 *   terza fila restava «in caricamento» finché non entrava). MDN `IntersectionObserver.prototype.scrollMargin` («adds a margin to all nested scroll containers»), `mdn/content`
 *   via Context7, 27/09/2026.
 */
const OSSERVATORI = new WeakMap();
function osservaQuandoEntra(doc, elemento, azione) {
  const Osservatore = doc.defaultView?.IntersectionObserver;
  if (typeof Osservatore !== 'function') { azione(); return; }
  let registro = OSSERVATORI.get(doc);
  if (!registro) {
    const azioni = new Map();
    const osservatore = new Osservatore((voci) => {
      for (const v of voci) {
        if (!v.isIntersecting) continue;
        const fai = azioni.get(v.target);
        osservatore.unobserve(v.target);
        azioni.delete(v.target);
        fai?.();
      }
    }, { rootMargin: '200px 0px', scrollMargin: '200px 0px' });
    registro = { osservatore, azioni, pulizia: false };
    OSSERVATORI.set(doc, registro);
  }
  registro.azioni.set(elemento, azione);
  registro.osservatore.observe(elemento);
  if (!registro.pulizia) {
    registro.pulizia = true;
    queueMicrotask(() => {
      registro.pulizia = false;
      for (const vecchio of [...registro.azioni.keys()]) {
        if (!vecchio.isConnected) { registro.osservatore.unobserve(vecchio); registro.azioni.delete(vecchio); }
      }
    });
  }
}

/** Quante card aspettano di entrare in vista (per le prove: devono calare quando l'elenco si rifà). */
export function anteprimeInAttesa(doc) {
  return OSSERVATORI.get(doc)?.azioni.size ?? 0;
}

/**
 * Il riquadro in alto della card. Sincrono quando la risposta è già in memoria; altrimenti mostra «in caricamento» e
 * legge quando la card entra in vista.
 * @param {{ sessionId: string, indirizzoFile: (sessionId: string, id: string) => string, rete?: Function, importa?: Function }} opzioni
 */
export function creaAnteprimaScheda(doc, voce, { sessionId = '', indirizzoFile, rete = globalThis.fetch, importa = (indirizzo) => import(indirizzo) } = {}) {
  const riquadro = nodo(doc, 'div', 'td-lib-art');
  const genere = genereAnteprimaLibreria(voce);
  const indirizzo = typeof indirizzoFile === 'function' ? indirizzoFile(sessionId, voce?.id) : '';
  const chiave = chiaveAnteprima(sessionId, voce);
  riquadro.dataset.chiave = chiave;
  if (genere === 'none' || !indirizzo || typeof rete !== 'function') { riempiAnteprima(doc, riquadro, voce, null); return riquadro; }
  /* L'immagine vera non ha bisogno di niente: stessa origine, e `loading="lazy"` la chiede quando serve. */
  if (genere === 'image') { riempiAnteprima(doc, riquadro, voce, { tipo: 'immagine', src: indirizzo }); return riquadro; }
  const pronta = richiamaAnteprima(chiave);
  if (pronta !== undefined) { riempiAnteprima(doc, riquadro, voce, pronta); return riquadro; }

  riquadro.dataset.art = 'loading';
  const segnaposto = nodo(doc, 'span', 'td-lib-caricamento');
  segnaposto.setAttribute('role', 'status');
  segnaposto.setAttribute('aria-label', traduci("sezioni.library.card.loadingPreview"));
  riquadro.replaceChildren(segnaposto);

  const riempiIVivi = (esito) => {
    /* La card può essere stata ridisegnata mentre si leggeva: si riempiono i riquadri VIVI con questa chiave. */
    for (const vivo of doc.querySelectorAll('.td-lib-art[data-art="loading"]')) {
      if (vivo.dataset.chiave === chiave) riempiAnteprima(doc, vivo, voce, esito);
    }
  };
  const carica = () => {
    /* ⛔ Rilievo 7: fra la creazione della card e il suo ingresso in vista la lettura può essere già finita (un'altra card
       con la stessa chiave): si guarda la memoria prima di rileggere. */
    const giaPronta = richiamaAnteprima(chiave);
    if (giaPronta !== undefined) { riempiIVivi(giaPronta); return; }
    if (!IN_VOLO.has(chiave)) {
      const lavoro = genere === 'typographic'
        ? (segnale) => leggiInizioDelTesto(indirizzo, rete, segnale).then((testo) => {
          const anteprima = anteprimaTipografica(testo);
          return anteprima ? { tipo: 'tipografica', anteprima } : null;
        })
        : (segnale) => disegnaPrimaPagina(indirizzo, rete, larghezzaAnteprimaPx(riquadro.clientWidth, globalThis.devicePixelRatio), importa, segnale)
          .then((src) => (src ? { tipo: 'immagine', src } : null));
      /* ⛔ Il ripiego sul glifo è giusto (un'anteprima che non riesce non è un errore della persona), ma DICE che cosa ha
         coperto: un catch muto qui ha già nascosto un guasto vero. E un errore NON si ricorda (rilievo 8): alla prossima
         apertura, o con «Aggiorna», si riprova. */
      IN_VOLO.set(chiave, inCoda(lavoro)
        .then((esito) => { ricordaAnteprima(chiave, esito); return esito; }, (errore) => {
          doc.defaultView?.console?.warn?.(`Library: preview of «${voce?.nome ?? voce?.id}» not drawn (${genere}): ${errore?.message ?? errore}`);
          return null;
        })
        .finally(() => IN_VOLO.delete(chiave)));
    }
    IN_VOLO.get(chiave).then(riempiIVivi);
  };
  osservaQuandoEntra(doc, riquadro, carica);
  return riquadro;
}

/** Owner 14/09/2026 (sul mobile): il titolo dentro l'anteprima non supera 35 caratteri. */
export const TITOLO_ANTEPRIMA_MAX = 35;

/**
 * Il titolo che entra nel mini-documento, accorciato A PAROLA e chiuso da «…»: dentro un riquadro alto quanto la card il
 * `line-clamp` lascerebbe a vista una riga tagliata a metà altezza (css-tricks.com/line-clampin, letto dal mobile il
 * 14/09/2026). Sotto metà lunghezza la parola è una sola e lunghissima: meglio tagliarla che lasciare due lettere.
 */
export function titoloAnteprima(titolo, massimo = TITOLO_ANTEPRIMA_MAX) {
  const pulito = String(titolo ?? '').replace(/\s+/g, ' ').trim();
  if (pulito.length <= massimo) return pulito;
  const spazio = massimo - 1;
  const taglio = pulito.slice(0, spazio);
  const ultimoSpazio = taglio.lastIndexOf(' ');
  const base = ultimoSpazio >= Math.floor(spazio / 2) ? taglio.slice(0, ultimoSpazio) : taglio;
  return `${base.replace(/[\s.,;:!?\-–—]+$/u, '')}…`;
}

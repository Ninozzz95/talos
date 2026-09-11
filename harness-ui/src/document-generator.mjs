/**
 * document-generator.mjs — porto di mobile/src/lib/documents/documentGenerator.ts
 * (letto per intero il 28/8, piano elegant-spinning-dongarra.md,
 * "document_create") — adattato al backend Node, non incollato
 * verbatim: la pipeline `generate → verify` è identica, cambia SOLO
 * dove il mobile doveva evitare il peso del bundle browser/webview
 * (D11 mobile, "il primo paint della chat non deve mai portare
 * queste librerie") — un vincolo che qui non esiste per costruzione:
 * questo è un processo server locale, senza bundle, senza first
 * paint, mai spedito a un utente. Owner, 28/8: "sì, aggiungile" alle
 * sette dipendenze npm SOLO in questo backend, mai nel bundle
 * frontend — vedi `harness-ui/package.json`.
 *
 * ⛔⛔ Differenza deliberata dal mobile, non un buco: qui NON esiste
 * "salva nella Libreria" (il desktop non ha oggi un sistema Libreria
 * — colonna C dell'inventario 74 attrezzi). Questo modulo si ferma a
 * `{format, fileName, mediaType, bytes}` + la verifica — DOVE il file
 * finisce (il workspace vero, stesso trattamento di `scrivi`) è
 * deciso da chi chiama, non qui — stessa separazione già presente sul
 * mobile fra `documentGenerator.ts` (genera) e `documentTools.ts`
 * (salva), solo con una destinazione diversa.
 *
 * ⛔ pdfmake: la doc ufficiale (ctx7, 28/8) conferma che il pacchetto
 * Node (`import pdfmake from 'pdfmake'`, non il build browser
 * `pdfmake/build/pdfmake.min.js` che usa il mobile) accetta `setFonts`
 * con PERCORSI FILE VERI — mai serve una VFS base64 lato server, e
 * quindi mai serve il sub-setting Python (`build-pdf-fonts.mjs`
 * mobile) che esiste solo per il peso di un APK distribuito. I
 * quattro Roboto già dentro `node_modules/pdfmake` bastano.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { talosSafeFileStem } from './document-filename.mjs';

const require = createRequire(import.meta.url);

export const TALOS_SOURCE_TEXT_FORMATS = [
  'txt', 'json', 'xml',
  'js', 'jsx', 'ts', 'tsx', 'vue',
  'css', 'scss', 'php', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts',
  'swift', 'c', 'h', 'cpp', 'hpp', 'cs',
  'sh', 'bash', 'zsh', 'ps1', 'sql',
  'yaml', 'yml', 'toml', 'ini',
];

export const TALOS_DOCUMENT_FORMATS = [
  'md', 'csv', 'html', 'docx', 'xlsx', 'pptx', 'pdf',
  ...TALOS_SOURCE_TEXT_FORMATS,
];

const SOURCE_MEDIA_TYPES = {
  txt: 'text/plain', json: 'application/json', xml: 'application/xml',
  js: 'text/javascript', jsx: 'text/javascript', ts: 'text/plain', tsx: 'text/plain', vue: 'text/plain',
  css: 'text/css', scss: 'text/plain', php: 'text/plain', py: 'text/plain', rb: 'text/plain',
  go: 'text/plain', rs: 'text/plain', java: 'text/plain', kt: 'text/plain', kts: 'text/plain',
  swift: 'text/plain', c: 'text/plain', h: 'text/plain', cpp: 'text/plain', hpp: 'text/plain', cs: 'text/plain',
  sh: 'text/plain', bash: 'text/plain', zsh: 'text/plain', ps1: 'text/plain', sql: 'application/sql',
  yaml: 'application/yaml', yml: 'application/yaml', toml: 'application/toml', ini: 'text/plain',
};

const MEDIA_TYPES = {
  md: 'text/markdown',
  csv: 'text/csv',
  html: 'text/html',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
  ...SOURCE_MEDIA_TYPES,
};

const SOURCE_TEXT_FORMAT_SET = new Set(TALOS_SOURCE_TEXT_FORMATS);

function isTalosSourceTextFormat(format) {
  return SOURCE_TEXT_FORMAT_SET.has(format);
}

function encode(text) {
  return new TextEncoder().encode(text);
}

function verifyUtf8Text(bytes) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (errore) {
    return { ok: false, detail: `non è UTF-8 valido: ${errore instanceof Error ? errore.message : String(errore)}` };
  }
  if (text.trim() === '') return { ok: false, detail: 'il file è vuoto' };
  return { ok: true, detail: `${text.length} caratteri, ${text.split('\n').length} righe` };
}

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** RFC 4180: un campo con virgola, apice o a-capo va fra virgolette. */
function csvField(value) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function rowsOf(spec) {
  return spec.rows?.length ? spec.rows : [['Content'], [spec.body ?? '']];
}

/** Un titolo non è un nome file: può contenere qualunque cosa una persona digiti. */
function safeFileName(title, format) {
  const trimmed = title.trim();
  const suffix = `.${format}`;
  const stemSource = trimmed.toLowerCase().endsWith(suffix) ? trimmed.slice(0, -suffix.length) : title;
  const base = talosSafeFileStem(stemSource, 60, 'document');
  return `${base}.${format}`;
}

/**
 * Lo spec semplice `body`/`rows`, promosso a report — porta VERBATIM
 * la stessa conversione riga-per-riga del mobile (documentGenerator.ts,
 * `specToReport`): titoli `#`/`##`/`###`, elenchi `-`/`*`, paragrafi
 * separati da riga vuota, `rows` come tabella vera.
 */
function specToReport(spec) {
  const blocks = [{ t: 'h', lvl: 1, x: spec.title }];
  const body = (spec.body ?? '').replace(/\r\n/g, '\n');

  let paragraph = [];
  let bullets = [];
  const flush = () => {
    if (bullets.length) { blocks.push({ t: 'list', items: bullets }); bullets = []; }
    if (paragraph.length) { blocks.push({ t: 'p', x: paragraph.join(' ') }); paragraph = []; }
  };

  for (const line of body.split('\n')) {
    const text = line.trim();
    if (text === '') { flush(); continue; }
    const heading = /^(#{1,3})\s+(.*)$/.exec(text);
    if (heading) {
      flush();
      blocks.push({ t: 'h', lvl: heading[1].length, x: heading[2].trim() });
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(text);
    if (bullet) {
      if (paragraph.length) { blocks.push({ t: 'p', x: paragraph.join(' ') }); paragraph = []; }
      bullets.push(bullet[1]);
      continue;
    }
    if (bullets.length) { blocks.push({ t: 'list', items: bullets }); bullets = []; }
    paragraph.push(text);
  }
  flush();

  if (spec.rows?.length) {
    const [head, ...rest] = spec.rows;
    blocks.push({ t: 'table', head, rows: rest });
  }

  return { meta: { title: spec.title }, theme: 'report', blocks };
}

let pdfMakeInstance = null;
/**
 * pdfmake è un singleton stateful (`setFonts` muta un'istanza
 * condivisa) — caricato pigramente una sola volta, riusato da ogni
 * chiamata successiva, esattamente come il mobile lo carica una sola
 * volta per sessione di chat (lì per il peso, qui per non rifare il
 * lookup dei percorsi font ad ogni PDF).
 */
async function pdfMakeConSuoiFont() {
  if (pdfMakeInstance) return pdfMakeInstance;
  const { default: pdfmake } = await import('pdfmake');
  const roboto = dirname(require.resolve('pdfmake/build/fonts/Roboto/Roboto-Regular.ttf'));
  /*
   * ⛔⛔ Trovato dal vivo (smoke test, non ipotizzato): la policy locale
   * di pdfmake governa OGNI accesso a file — anche il caricamento dei
   * font stessi, non solo un'eventuale immagine referenziata dal
   * contenuto. Un `() => false` totale rompeva il caricamento di
   * Roboto. ⇒ Allowlist scoped alla SOLA cartella dei font: nessun
   * blocco del nostro schema (cover/h/p/note/list/kpi/table/chart/
   * spacer/pb — document-report.mjs) referenzia mai un'immagine per
   * URL o percorso, quindi tutto il resto resta negato per davvero.
   */
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy((percorso) => percorso.startsWith(roboto));
  pdfmake.setFonts({
    Roboto: {
      normal: join(roboto, 'Roboto-Regular.ttf'),
      bold: join(roboto, 'Roboto-Medium.ttf'),
      italics: join(roboto, 'Roboto-Italic.ttf'),
      // Nessun peso bold-italic dedicato spedito qui — puntarlo al
      // medium evita un lancio se uno stile lo chiedesse mai, stessa
      // scelta del mobile.
      bolditalics: join(roboto, 'Roboto-Medium.ttf'),
    },
  });
  pdfMakeInstance = pdfmake;
  return pdfmake;
}

export async function generateTalosDocument(spec) {
  if (spec.report && spec.format !== 'pdf') {
    throw new Error(
      `TALOS_DOCUMENT_REPORT_PDF_ONLY: \`report\` descrive un PDF impaginato. Per ${spec.format}, usa `
      + '`body` (prosa) o `rows` (una tabella).',
    );
  }

  if (isTalosSourceTextFormat(spec.format) && (spec.body ?? '').trim() === '') {
    throw new Error('TALOS_DOCUMENT_SOURCE_BODY_REQUIRED: un file sorgente richiede `body` non vuoto.');
  }

  const hasContent = (spec.body ?? '').trim() !== ''
    || (spec.rows?.length ?? 0) > 0
    || (spec.slides?.length ?? 0) > 0
    || (spec.format === 'pdf' && (spec.report?.blocks.length ?? 0) > 0);
  if (!hasContent) {
    throw new Error('TALOS_DOCUMENT_EMPTY: non c\'è niente da scrivere.');
  }

  const fileName = safeFileName(spec.title, spec.format);
  const common = { format: spec.format, fileName, mediaType: MEDIA_TYPES[spec.format] };

  if (isTalosSourceTextFormat(spec.format)) {
    return { ...common, bytes: encode(spec.body) };
  }

  switch (spec.format) {
    case 'md':
      return { ...common, bytes: encode(spec.body ?? spec.title) };

    case 'csv':
      return { ...common, bytes: encode(rowsOf(spec).map((row) => row.map(csvField).join(',')).join('\r\n')) };

    /*
     * ⛔⛔⛔ BC-11, 11/09/2026 — `format:'html'` NON POTEVA SCRIVERE UNA PAGINA HTML.
     *
     * Riprodotto: `html` non e' nei `TALOS_SOURCE_TEXT_FORMATS` (`:39`), quindi finiva SEMPRE qui,
     * e qui ogni blocco passa da `escapeHtml`. Un `<section id="x">` scritto dal modello arrivava
     * sul disco come `&lt;section id="x"&gt;` dentro un `<p>`. ⇒ Per il compito dell'owner
     * «genera un file html di almeno 1000 righe» non esisteva NESSUN attrezzo capace: restavano
     * `scrivi` (che allora voleva tutto in una risposta) e la shell (che ha il tetto della riga di
     * comando, misurato: 23.941 caratteri → «La riga di comando e' troppo lunga»). Il «giro
     * assurdo» del modello — `_p2.html`, `_p3.html`, `_p4.html`, `_p5.html` — non era una sua
     * bizzarria: era l'unica strada rimasta.
     *
     * ⛔ PERCHE' NON UN CAMPO `raw:true`. Era l'altra forma possibile, ed e' stata scartata per due
     *   ragioni, non per gusto:
     *   1. un parametro in piu' e' un parametro che il modello deve SCOPRIRE. arXiv:2608.26130
     *      «Agents Don't Paginate: First-Chunk Selection for LLM Tool Responses» (letto
     *      11/09/2026) misura su log di produzione di un middleware MCP **zero** richieste del
     *      secondo pezzo, pur essendo la paginazione disponibile in tutti i protocolli: un agente
     *      non va a cercare l'opzione giusta, usa la prima strada che gli riesce. Un `raw:true`
     *      dimenticato riporta esattamente al difetto di oggi.
     *   2. avvolgere un documento GIA' COMPLETO non e' mai la risposta giusta: `<!doctype html>`
     *      dentro un `<p>` dentro un altro `<!doctype html>` non e' un caso limite discutibile, e'
     *      sempre un file rotto. Non c'e' un falso positivo da temere nella direzione che conta.
     * ⇒ Nessun campo nuovo: se il `body` E' GIA' un documento, si scrive com'e'; se e' prosa,
     *   resta avvolto esattamente come prima. E il modello lo sa DALLO SCHEMA, non sbattendoci:
     *   la descrizione di `format` nel kernel (`talosHarness.mjs`, attrezzo `document_create`) lo
     *   dice in una riga.
     *
     * ⛔ Cosa fanno gli altri, letto nel codice dei cloni: nessuno dei nove ha un generatore che
     *   riformatta — il loro attrezzo di scrittura mette sul disco i byte che riceve
     *   (opencode `tool/write.ts`: solo `content` e `filePath`; Hermes `file_tools.py:2729`:
     *   solo `path` e `content`). L'idea di un «generatore di documenti» che conosce il formato e'
     *   nostra, ed e' un vantaggio per `docx`/`xlsx`/`pptx`/`pdf`; su `html` era diventata una
     *   gabbia, perche' l'HTML e' l'unico di quei formati che il modello sa scrivere da solo.
     */
    case 'html': {
      const corpo = spec.body ?? '';
      // Un BOM o spazi davanti non cambiano la risposta: e' comunque un documento completo.
      if (/^﻿?\s*<(!doctype\s+html|html[\s>])/i.test(corpo)) return { ...common, bytes: encode(corpo) };
      return {
        ...common,
        bytes: encode([
          '<!doctype html>',
          '<html><head><meta charset="utf-8">',
          `<title>${escapeHtml(spec.title)}</title></head><body>`,
          `<h1>${escapeHtml(spec.title)}</h1>`,
          ...corpo.split('\n\n').map((block) => `<p>${escapeHtml(block)}</p>`),
          '</body></html>',
        ].join('\n')),
      };
    }

    case 'docx': {
      const { Document, Packer, Paragraph, HeadingLevel } = await import('docx');
      const paragraphs = [
        new Paragraph({ text: spec.title, heading: HeadingLevel.HEADING_1 }),
        ...(spec.body ?? '').split('\n').map((line) => new Paragraph({ text: line })),
      ];
      const document = new Document({ sections: [{ children: paragraphs }] });
      // ⭐ Node: Packer.toBuffer torna un Buffer (già un Uint8Array),
      // niente giro Blob→arrayBuffer (quello serve solo in browser —
      // ctx7 confermato 28/8).
      const buffer = await Packer.toBuffer(document);
      return { ...common, bytes: new Uint8Array(buffer) };
    }

    case 'xlsx': {
      const xlsx = await import('xlsx');
      const sheet = xlsx.utils.aoa_to_sheet(rowsOf(spec));
      const book = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(book, sheet, 'Sheet1');
      const written = xlsx.write(book, { type: 'array', bookType: 'xlsx' });
      return { ...common, bytes: new Uint8Array(written) };
    }

    case 'pptx': {
      const { default: PptxGenJS } = await import('pptxgenjs');
      const deck = new PptxGenJS();
      const slides = spec.slides?.length
        ? spec.slides
        : [{ title: spec.title, bullets: (spec.body ?? '').split('\n').filter(Boolean) }];
      for (const entry of slides) {
        const slide = deck.addSlide();
        slide.addText(entry.title, { x: 0.5, y: 0.4, w: 9, h: 0.8, fontSize: 28, bold: true });
        if (entry.bullets.length) {
          slide.addText(
            entry.bullets.map((text) => ({ text, options: { bullet: true } })),
            { x: 0.6, y: 1.4, w: 8.8, h: 4, fontSize: 16 },
          );
        }
      }
      const written = await deck.write({ outputType: 'arraybuffer' });
      return { ...common, bytes: new Uint8Array(written) };
    }

    case 'pdf': {
      const [pdfmake, { buildTalosReportDefinition }] = await Promise.all([
        pdfMakeConSuoiFont(),
        import('./document-report.mjs'),
      ]);
      const definition = buildTalosReportDefinition(
        spec.report ? { ...spec.report, meta: { title: spec.title } } : specToReport(spec),
      );
      const buffer = await pdfmake.createPdf(definition).getBuffer();
      return { ...common, bytes: new Uint8Array(buffer) };
    }

    default:
      throw new Error(`TALOS_DOCUMENT_FORMAT_UNKNOWN: ${spec.format}`);
  }
}

/**
 * Riapre il file e riporta cosa c'è VERAMENTE dentro — non un
 * checksum (prova che abbiamo scritto quello che intendevamo, non la
 * domanda giusta): la domanda è se il file che una persona apre è
 * integro.
 */
export async function verifyTalosDocument(document) {
  try {
    if (isTalosSourceTextFormat(document.format)) return verifyUtf8Text(document.bytes);

    switch (document.format) {
      case 'md':
      case 'csv':
      case 'html':
        return verifyUtf8Text(document.bytes);

      case 'docx': {
        const parts = await openOoxml(document.bytes);
        const body = parts['word/document.xml'];
        if (!body) return { ok: false, detail: 'nessuna parte documento dentro il file' };
        const paragraphs = (body.match(/<w:p[ >]/g) ?? []).length;
        if (paragraphs === 0) return { ok: false, detail: 'il documento non ha paragrafi' };
        return { ok: true, detail: `riaperto: ${paragraphs} paragrafi` };
      }

      case 'xlsx': {
        const xlsx = await import('xlsx');
        const book = xlsx.read(document.bytes, { type: 'array' });
        const names = book.SheetNames;
        if (!names.length) return { ok: false, detail: 'nessun foglio dentro il file' };
        const first = book.Sheets[names[0]];
        const rows = xlsx.utils.sheet_to_json(first, { header: 1 });
        return { ok: rows.length > 0, detail: `riaperto: ${names.length} fogli, ${rows.length} righe` };
      }

      case 'pptx': {
        const parts = await openOoxml(document.bytes);
        const slides = Object.keys(parts).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
        if (slides.length === 0) return { ok: false, detail: 'nessuna slide dentro il file' };
        return { ok: true, detail: `riaperto: ${slides.length} slide` };
      }

      case 'pdf': {
        const { PDFDocument } = await import('pdf-lib');
        const pdf = await PDFDocument.load(document.bytes);
        const pages = pdf.getPageCount();
        if (pages === 0) return { ok: false, detail: 'il pdf non ha pagine' };
        return { ok: true, detail: `riaperto: ${pages} pagine` };
      }

      default:
        return { ok: false, detail: `formato sconosciuto: ${document.format}` };
    }
  } catch (errore) {
    const detail = errore instanceof Error ? errore.message : String(errore);
    return { ok: false, detail: `non si è potuto riaprire: ${detail}` };
  }
}

/** Rilegge il contenitore OOXML, così un archivio troncato fallisce qui. */
async function openOoxml(bytes) {
  const { default: JSZip } = await import('jszip');
  const archive = await JSZip.loadAsync(bytes);
  const parts = {};
  for (const [name, entry] of Object.entries(archive.files)) {
    if (entry.dir) continue;
    // Solo le parti ISPEZIONATE vengono decompresse — una presentazione
    // piena di immagini non va decodificata in memoria solo per contare le slide.
    parts[name] = /\.xml$/.test(name) && /document\.xml$|presentation\.xml$/.test(name)
      ? await entry.async('string')
      : '';
  }
  return parts;
}

/**
 * F5 File reader (26/09/2026) — CHE COSA È un file, dal nome E dai byte.
 *
 * ⛔ Il tipo non si decide mai dall'etichetta salvata (`mediaType` della voce di Libreria): l'ha scritta chi ha salvato il
 *   file, spesso il modello, e nessuno l'ha verificata sui byte (stessa regola della rotta PDF in linea,
 *   `http-app.mjs:3502`). Qui votano due testimoni: l'ESTENSIONE del nome vero e la FIRMA dei primi byte.
 * ⛔ Quando si contraddicono vince la firma per i formati che una firma ce l'hanno (un `.pdf` che comincia con i byte di
 *   un PNG È un'immagine), e lo si DICE (`avviso`): mostrare un PNG col lettore PDF darebbe una pagina bianca senza
 *   spiegazione. Un formato binario senza la sua firma è un file rotto, non un file di testo: resta `binario` e lo si dice.
 *
 * Firme dallo standard WHATWG MIME Sniffing (mimesniff.spec.whatwg.org, letto il 26/09/2026): §6.1 immagini (ICO, CUR,
 * BMP, GIF87a/89a, WEBP, PNG, JPEG), §6.4 ZIP `50 4B 03 04`, §7.1 PDF `25 50 44 46 2D`. Il contenitore dei vecchi Office
 * (`.doc/.xls/.ppt`) è il Compound File Binary di Microsoft, firma `D0 CF 11 E0 A1 B1 1A E1` ([MS-CFB] §2.2).
 * AVIF non ha un pattern WHATWG: è un ISO BMFF con `ftyp` al byte 4 e marca `avif`/`avis` al byte 8.
 *
 * Tipi: `markdown · tabella · testo · html · immagine · pdf · documento · foglio · presentazione · binario`.
 */

const ESTENSIONI = new Map();
const registra = (tipo, elenco) => { for (const e of elenco) ESTENSIONI.set(e, tipo); };
registra('markdown', ['md', 'markdown', 'mdown', 'mkd']);
registra('tabella', ['csv', 'tsv']);
registra('html', ['html', 'htm', 'xhtml']);
registra('immagine', ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif']);
registra('pdf', ['pdf']);
registra('documento', ['docx', 'docm']);
registra('foglio', ['xlsx', 'xlsm', 'xls', 'ods']);
registra('presentazione', ['pptx', 'pptm']);
// l'elenco del testo è quello di `libreria-anteprima.js` meno ciò che ora ha una resa sua (html, htm, svg)
registra('testo', [
  'txt', 'text', 'json', 'jsonl', 'ndjson', 'xml', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'log', 'css', 'scss',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh',
  'bash', 'zsh', 'bat', 'cmd', 'ps1', 'sql', 'env', 'patch', 'diff', 'gitignore', 'properties', 'srt', 'vtt',
]);

/** I vecchi Office e gli ODF senza lettore: si riconoscono per poterlo DIRE, non per aprirli. */
const OFFICE_SENZA_LETTORE = new Map([
  ['doc', 'Word precedente al 2007'], ['ppt', 'PowerPoint precedente al 2007'],
  ['odt', 'OpenDocument di testo'], ['odp', 'OpenDocument di presentazione'],
]);
const CON_MACRO = new Set(['docm', 'xlsm', 'pptm']);

/** Il tipo con il suo articolo, per le frasi che spiegano una contraddizione fra nome e contenuto. */
const CON_ARTICOLO = new Map([
  ['markdown', 'un file Markdown'], ['tabella', 'una tabella CSV'], ['testo', 'un file di testo'], ['html', 'una pagina HTML'],
  ['immagine', 'un\'immagine'], ['pdf', 'un PDF'], ['documento', 'un documento Word'], ['foglio', 'un foglio di calcolo'],
  ['presentazione', 'una presentazione PowerPoint'],
]);

/** L'estensione del nome, minuscola; `''` se il nome non ne ha (anche `.gitignore` conta: è il nome intero). */
export function estensioneDi(nome) {
  const intero = String(nome ?? '').trim().split(/[\\/]/).pop().toLowerCase();
  const punto = intero.lastIndexOf('.');
  if (punto < 0) return '';
  if (punto === 0) return intero.slice(1); // `.gitignore`, `.env`
  return intero.slice(punto + 1);
}

/** Il tipo che dice il NOME, senza guardare i byte. */
export function tipoDaNome(nome) {
  const estensione = estensioneDi(nome);
  return { tipo: ESTENSIONI.get(estensione) ?? 'binario', estensione, macro: CON_MACRO.has(estensione) };
}

const confronta = (byte, schema, maschera = null, da = 0) => {
  if (byte.length < da + schema.length) return false;
  for (let i = 0; i < schema.length; i += 1) {
    const m = maschera ? maschera[i] : 0xff;
    if ((byte[da + i] & m) !== schema[i]) return false;
  }
  return true;
};
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));

/** La firma dei primi byte, o `null` se non è una di quelle che conosciamo. */
export function firmaDeiByte(dati) {
  const byte = dati instanceof Uint8Array ? dati : new Uint8Array(dati ?? []);
  if (confronta(byte, ascii('%PDF-'))) return 'pdf';
  if (confronta(byte, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (confronta(byte, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (confronta(byte, ascii('GIF87a')) || confronta(byte, ascii('GIF89a'))) return 'gif';
  if (confronta(byte, [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50],
    [0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])) return 'webp';
  if (confronta(byte, ascii('ftyp'), null, 4) && (confronta(byte, ascii('avif'), null, 8) || confronta(byte, ascii('avis'), null, 8))) return 'avif';
  if (confronta(byte, [0x00, 0x00, 0x01, 0x00]) || confronta(byte, [0x00, 0x00, 0x02, 0x00])) return 'ico';
  if (confronta(byte, [0x42, 0x4d])) return 'bmp';
  if (confronta(byte, [0x50, 0x4b, 0x03, 0x04])) return 'zip';
  if (confronta(byte, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'ole';
  return null;
}

const IMMAGINI = new Set(['png', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp']);
const TIPI_OOXML = new Set(['documento', 'foglio', 'presentazione']);

/**
 * Testo o no? UTF-8 valido e niente byte di controllo che un file di testo non ha (NUL, e i controlli C0 esclusi
 * tabulazione, a capo, ritorno, avanzamento pagina ed escape). Si guardano i primi 8 KiB: bastano per un file di testo,
 * e un binario si tradisce subito.
 */
export function sembraTesto(dati) {
  const byte = (dati instanceof Uint8Array ? dati : new Uint8Array(dati ?? [])).subarray(0, 8192);
  for (const b of byte) if (b < 0x20 && ![0x09, 0x0a, 0x0c, 0x0d, 0x1b].includes(b)) return false;
  try {
    // l'ultimo carattere può essere tagliato a metà dal limite degli 8 KiB: `stream` lo lascia in sospeso invece di sbagliare
    new TextDecoder('utf-8', { fatal: true }).decode(byte, { stream: true });
    return true;
  } catch { return false; }
}

const parolaFirma = (firma) => (IMMAGINI.has(firma) ? `un'immagine ${firma.toUpperCase()}` : firma === 'pdf' ? 'un PDF' : firma === 'zip' ? 'un archivio ZIP' : 'un file Office precedente al 2007');
const senzaLettore = (estensione) => `I file ${OFFICE_SENZA_LETTORE.get(estensione)} non si mostrano qui: si aprono con l'app del sistema.`;

/**
 * Il tipo del file: il nome e i primi byte (bastano i primi 8 KiB; anche meno, se il file è corto).
 * @returns {{tipo:string, estensione:string, firma:string|null, macro:boolean, avviso:string|null}}
 */
export function tipoDelFile({ nome, byte }) {
  const { tipo: daNome, estensione, macro } = tipoDaNome(nome);
  const dati = byte instanceof Uint8Array ? byte : new Uint8Array(byte ?? []);
  const firma = firmaDeiByte(dati);
  const esito = (tipo, avviso = null) => ({ tipo, estensione, firma, macro: macro && TIPI_OOXML.has(tipo), avviso });
  // una contraddizione si dice solo se il nome AVEVA detto qualcosa: un file senza estensione non ha promesso niente
  const contraddice = (tipo, frase) => (daNome === tipo || daNome === 'binario' ? null : frase);

  if (firma && IMMAGINI.has(firma)) return esito('immagine', contraddice('immagine', `Il nome indica ${CON_ARTICOLO.get(daNome)}, ma il contenuto è ${parolaFirma(firma)}.`));
  if (firma === 'pdf') return esito('pdf', contraddice('pdf', `Il nome indica ${CON_ARTICOLO.get(daNome)}, ma il contenuto è un PDF.`));
  if (firma === 'zip') {
    // un Office moderno È uno zip: il sottotipo lo dice il nome (SheetJS legge anche un xlsx chiamato .xls)
    if (TIPI_OOXML.has(daNome)) return esito(daNome);
    // un .zip, un .jar, un .epub, un OpenDocument di testo: archivi che questa finestra non apre, detti per nome se si può
    return esito('binario', OFFICE_SENZA_LETTORE.has(estensione) ? senzaLettore(estensione) : null);
  }
  if (firma === 'ole') {
    if (estensione === 'xls') return esito('foglio'); // SheetJS legge il BIFF dei vecchi Excel
    if (OFFICE_SENZA_LETTORE.has(estensione)) return esito('binario', senzaLettore(estensione));
    return esito('binario', 'Il contenuto è un file Office precedente al 2007: si apre con l\'app del sistema.');
  }

  // nessuna firma conosciuta
  if (OFFICE_SENZA_LETTORE.has(estensione)) return esito('binario', senzaLettore(estensione));
  if (['pdf', 'documento', 'foglio', 'presentazione'].includes(daNome) || (daNome === 'immagine' && estensione !== 'svg')) {
    return esito('binario', `Il nome indica ${CON_ARTICOLO.get(daNome)}, ma il contenuto non lo è: il file è rotto o ha il nome sbagliato.`);
  }
  if (daNome === 'binario') {
    // senza estensione conosciuta: testo solo se i byte lo dimostrano, mai byte ignoti stampati in un <pre>
    return dati.length > 0 && sembraTesto(dati) ? esito('testo') : esito('binario');
  }
  // markdown, tabella, testo, html, svg: sono testo, e devono sembrarlo
  if (!sembraTesto(dati)) return esito('binario', `Il nome indica ${CON_ARTICOLO.get(daNome)}, ma il contenuto non è testo.`);
  return esito(daNome);
}

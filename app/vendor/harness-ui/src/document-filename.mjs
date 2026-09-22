/**
 * document-filename.mjs — porto di mobile/src/lib/fileNamePolicy.ts
 * (letto per intero il 28/8), la parte che serve qui:
 * `talosSafeFileStem`. Stessa libreria (`unicode-segmenter`), stessa
 * logica: una stringa JS è indicizzata in unità UTF-16, ma i
 * fornitori di storage ricevono nomi codificati e le persone vedono
 * grafemi — un `slice()` grezzo sbaglia il confine due volte (può
 * creare UTF-16 malformato E spezzare un glifo visibile a metà).
 */
import { splitGraphemes } from 'unicode-segmenter/grapheme';

const UTF8 = new TextEncoder();
const FORBIDDEN_FILE_CHARACTERS = new Set(['/', '\\', ':', '"', '*', '?', '<', '>', '|']);

function unsafeFileNameCodePoint(code) {
  if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  if (code >= 0xd800 && code <= 0xdfff) return true;
  if (code === 0x00ad || code === 0x200b || code === 0xfeff) return true;
  if (code === 0x200e || code === 0x200f) return true;
  if (code >= 0x202a && code <= 0x202e) return true;
  return code >= 0x2066 && code <= 0x2069;
}

function sanitizeFileStem(value) {
  let safe = '';
  for (const character of value.normalize('NFKC')) {
    const code = character.codePointAt(0) ?? 0;
    if (unsafeFileNameCodePoint(code)) continue;
    safe += FORBIDDEN_FILE_CHARACTERS.has(character) ? ' ' : character;
  }
  return safe.replace(/\s+/gu, ' ').trim();
}

function appendWithinUtf8Budget(current, next, budget) {
  const candidate = `${current}${next}`;
  return UTF8.encode(candidate).byteLength <= budget ? candidate : null;
}

/** Torna uno STEM di nome file sicuro sotto un tetto di byte UTF-8. L'estensione è del chiamante, aggiunta dopo questo confine. */
/*
 * ⛔ 10/09/2026 — visto nella FOTO di un giro vero: il modello ha generato un'immagine e il file si
 * chiamava «Un gatto rosso (arancione) che dorme, rannicchiato e tranquillo, in un comodo an.jpg».
 * Il taglio cadeva a metà di «angolo», perché qui si aggiungeva un carattere alla volta finché il
 * budget di byte reggeva e poi ci si fermava, ovunque si fosse arrivati.
 *
 * Ricerca 10/09/2026, prima di scrivere: PatternFly (design system di Red Hat), pagina «Truncation» —
 * si sceglie DOVE tagliare in base a dove sta la parte che distingue, e ⛔ «distinct but lengthy names
 * may become identical after truncation if distinguishing features are located toward the end» (è lo
 * stesso difetto che ieri rendeva indistinguibili due righe di delega nella barra); sadiqbd.com,
 * «Text Truncation Edge Cases» — si arretra all'ultimo confine di parola prima del limite, con un
 * ripiego per quando un confine NON esiste (un indirizzo web, una parola composta lunghissima);
 * PatternFly, ancora: si evita di tagliare a ridosso della punteggiatura.
 *
 * ⇒ Qui si arretra all'ultimo spazio — ma solo se resta abbastanza nome. Un titolo di una parola sola
 *   più lunga del budget non ha nessun confine a cui arretrare: in quel caso il taglio duro è giusto,
 *   e togliere metà nome per eleganza sarebbe peggio del taglio.
 */
const QUOTA_MINIMA_DOPO_IL_TAGLIO = 0.6;

/** Arretra all'ultimo confine di parola, se ne resta abbastanza. Puro, e non tocca la punteggiatura in coda. */
export function tagliaSuConfineDiParola(troncato, budget = null) {
  /* ⛔ Il budget si calcola DOPO aver normalizzato: come valore di default leggeva `.length` su
     ciò che arriva, e con `null` lanciava prima ancora di entrare nella funzione. */
  const testo = String(troncato ?? '');
  const tetto = Number.isSafeInteger(budget) && budget > 0 ? budget : testo.length;
  const ultimoSpazio = testo.lastIndexOf(' ');
  if (ultimoSpazio <= 0) return testo; // nessun confine: il taglio duro resta l'unica scelta onesta
  if (ultimoSpazio < Math.floor(tetto * QUOTA_MINIMA_DOPO_IL_TAGLIO)) return testo; // arretrare costerebbe troppo nome
  return testo.slice(0, ultimoSpazio).replace(/[\s.,;:!?\-–—]+$/u, '');
}

export function talosSafeFileStem(value, maxUtf8Bytes, fallback) {
  if (!Number.isSafeInteger(maxUtf8Bytes) || maxUtf8Bytes < 1) {
    throw new RangeError('TALOS_FILENAME_BUDGET_INVALID');
  }

  const safeFallback = sanitizeFileStem(fallback) || 'file';
  const source = sanitizeFileStem(value) || safeFallback;
  let bounded = '';

  for (const grapheme of splitGraphemes(source)) {
    const candidate = appendWithinUtf8Budget(bounded, grapheme, maxUtf8Bytes);
    if (candidate === null) break;
    bounded = candidate;
  }
  bounded = bounded.trimEnd();
  /* ⛔ Solo se abbiamo davvero tagliato: un nome che ci stava tutto non si tocca. */
  if (bounded && bounded.length < source.length) bounded = tagliaSuConfineDiParola(bounded, bounded.length);
  if (bounded) return bounded;

  for (const grapheme of splitGraphemes(safeFallback)) {
    const candidate = appendWithinUtf8Budget(bounded, grapheme, maxUtf8Bytes);
    if (candidate === null) break;
    bounded = candidate;
  }
  return bounded.trimEnd() || 'f';
}

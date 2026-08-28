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
  if (bounded) return bounded;

  for (const grapheme of splitGraphemes(safeFallback)) {
    const candidate = appendWithinUtf8Budget(bounded, grapheme, maxUtf8Bytes);
    if (candidate === null) break;
    bounded = candidate;
  }
  return bounded.trimEnd() || 'f';
}

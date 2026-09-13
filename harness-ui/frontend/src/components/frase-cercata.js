/*
 * ⛔ 07/09/2026, O-60 — owner (screenshot): il composer suggeriva
 *   «Trova di più su ""GLM-5.3" "SAO" "IndexShare" "slime""».
 *   Le virgolette erano DOPPIE perché la query del modello ne ha già le sue (le frasi esatte sono un
 *   operatore di ricerca) e `bersaglioAttrezzoNudo` la riavvolgeva in altre virgolette. Il
 *   suggerimento è una frase che la persona può premere Invio e mandare: deve leggersi come una
 *   domanda, non come la riga che è andata al motore di ricerca.
 * ⇒ Qui la query si legge come cerca una persona: via gli operatori (ricerca 07/09/2026, GreenGeeks
 *   «Google Search Operators»: `site:`, `filetype:`, `intitle:`, `inurl:`, `related:`, `cache:`,
 *   l'esclusione con `-` e gli `OR`/`AND` sono i più usati, e nel 2026 ne funzionano una
 *   venticinquina), via le virgolette delle frasi esatte, e i termini rimasti si uniscono come si
 *   direbbero a voce.
 * @param {string} query la query grezza mandata al motore
 * @param {number} massimo quanti caratteri al massimo
 * @returns {string} vuoto se non resta niente di sensato: meglio nessun suggerimento che uno goffo
 */
export function fraseCercata(query, massimo = 60) {
  const grezza = String(query || '').trim();
  if (!grezza) return '';
  // le frasi fra virgolette valgono come un termine solo: si prendono per prime, senza le virgolette
  const frasi = [...grezza.matchAll(/"([^"]{1,200})"/g)].map((m) => m[1].trim()).filter(Boolean);
  const resto = grezza
    .replace(/"[^"]*"/g, ' ')
    .replace(/\b(?:site|filetype|intitle|inurl|allintitle|allinurl|related|cache|define|link|source|before|after|ext):\S+/gi, ' ')
    .replace(/(^|\s)[-+]\S+/g, ' ')
    .replace(/\b(?:OR|AND)\b/g, ' ')
    .replace(/[|()*~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const termini = [...frasi, ...(resto ? resto.split(' ') : [])].filter(Boolean);
  if (!termini.length) return '';
  // due o più termini si leggono come una lista parlata: «a, b e c»
  const uniti = termini.length === 1
    ? termini[0]
    : `${termini.slice(0, -1).join(', ')} e ${termini[termini.length - 1]}`;
  return uniti.length > massimo ? `${uniti.slice(0, massimo - 1)}…` : uniti;
}
// prova del cancello

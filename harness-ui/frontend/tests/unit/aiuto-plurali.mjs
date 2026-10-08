/*
 * LINGUA-7 (08/10/2026, bugfixer) — le frasi inglesi che mettono un NUMERO davanti a un plurale fisso («{n} lines»): con 1
 * dicono «1 lines», e la frase italiana gemella «1 righe». Il plurale lo sceglie `tn()` (Intl.PluralRules) fra due voci
 * `…One`/`…Many`, come fa Hermes con una funzione per lingua (`apps/desktop/src/i18n/en.ts:4120`,
 * `` lines: count => `${count} line${count === 1 ? '' : 's'}` ``).
 * ⛔ È una regola di FORMA, non di significato: una parola in -s dopo un segnaposto. Coglie anche numeri che non possono valere 1
 *   (i plurali veri restano giusti); per questo il cancello è un cricchetto sul debito di oggi, non un divieto assoluto.
 */
const NON_PLURALI = new Set(['is', 'was', 'has', 'its', 'this', 'as', 'us', 'yes', 'less', 'process', 'access', 'status', 'focus',
  'bonus', 'always', 'across', 'progress', 'address', 'success', 'class', 'alias', 'news', 'press', 'canvas', 'lens', 'gas', 'plus',
  'minus', 'thus', 'ms', 's']);

export function chiaviPluraleFisso(testiInglesi) {
  return Object.entries(testiInglesi)
    .filter(([chiave, valore]) => typeof valore === 'string' && !/(One|Many|Few|Other|Zero)$|\.(one|many|few|other|zero)$/.test(chiave)
      && [...valore.matchAll(/\{(\w+)\}\s+([A-Za-z]+)/g)].some(([, , parola]) => /s$/i.test(parola) && !NON_PLURALI.has(parola.toLowerCase())))
    .map(([chiave]) => chiave)
    .sort();
}

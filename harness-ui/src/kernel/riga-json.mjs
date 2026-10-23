/*
 * 22/10/2026 — UNA riga JSON, per i protocolli e i giornali a righe (il giornale delle sessioni, il canale della casa Linux).
 *
 * U+2028 e U+2029 (LINE/PARAGRAPH SEPARATOR) sono validi DENTRO una stringa JSON e `JSON.stringify` li lascia crudi; ma `readline` di
 * Node li prende per fine riga (`lib/internal/readline/interface.js`, `lineEnding = /\r?\n|\r(?!\n)|\u2028|\u2029/g`). Un testo che li
 * contiene — una risposta del modello copiata da una pagina, un file letto — spezzava la sua riga in due pezzi che non si leggono:
 * il giornale diventava «corrotto» al riavvio, e una chiamata alla casa Linux restava appesa. Qui si sfuggono (`\u2028`, `\u2029`): JSON
 * valido, identico alla rilettura, e una riga sola per chiunque legga.
 */
export function rigaJson(valore) {
  return `${JSON.stringify(valore).replace(/[\u2028\u2029]/gu, (c) => (c === '\u2028' ? '\\u2028' : '\\u2029'))}\n`;
}

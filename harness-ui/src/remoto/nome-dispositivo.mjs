/*
 * Il NOME che un dispositivo dà a sé stesso, pulito una volta dove si salva (revisione del blocco 10, E-R1; accordo con la CLI del
 * 27/10/2026). Il nome lo sceglie il telefono, quindi è testo di fuori: i caratteri di controllo e di formato (`\p{Cc}`, `\p{Cf}`: un
 * U+202E rovescia il testo a schermo, un U+0007 suona nel terminale) e i separatori di riga U+2028/U+2029 diventano uno spazio, gli
 * spazi si stringono, e si taglia a 64 punti di codice (mai a metà di un carattere). ⛔ IDENTICO al filtro della CLI
 * (`cli/src/remote/device-name.ts`, `cleanDeviceName`): finestra, telefono e terminale mostrano lo stesso nome.
 * I due separatori si scrivono con `String.fromCharCode`: scritti come caratteri dentro una regex letterale, per JavaScript sono un a capo.
 */
const SEPARATORI = String.fromCharCode(0x2028, 0x2029);
const DA_TOGLIERE = new RegExp(`[\\p{Cc}\\p{Cf}${SEPARATORI}]`, 'gu');

/** Il nome pulito, o '' se non resta niente. */
export function pulisciNomeDispositivo(grezzo, massimo = 64) {
  if (typeof grezzo !== 'string') return '';
  const pulito = grezzo.replace(DA_TOGLIERE, ' ').replace(/\s+/gu, ' ').trim();
  return Array.from(pulito).slice(0, massimo).join('').trim();
}

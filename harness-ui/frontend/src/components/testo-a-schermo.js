/*
 * I CARATTERI CHE A SCHERMO INGANNANO — una classe sola, la stessa del server.
 *
 * Un testo scritto dal modello (la consegna di un agente, un percorso) può portare caratteri che non si vedono e cambiano ciò che
 * si legge: i controlli (C0, DEL, C1) e quelli che cambiano il VERSO della scrittura (U+061C, U+200E e U+200F, da U+202A a
 * U+202E, da U+2066 a U+2069). Con un U+202E fra «foto» e «gpj.exe» a schermo si legge «fotoexe.jpg», e l'inversione non si chiude
 * alla fine del nome: capovolge anche le parole del prodotto che seguono (seconda passata del bugfixer, 13/10/2026, foto in
 * `bugfixer/lotto3/seconda/`).
 *
 * Il server ha già questa regola per i percorsi dei passi (`harness-ui/src/attivita-figlia.mjs`, `CARATTERI_CHE_INGANNANO` e
 * `percorsoDaMostrare`: un percorso così «non si mostra»). Qui la stessa classe serve a ciò che arriva a schermo comunque — il
 * nome di un agente, un file toccato davvero, che è un fatto e non può sparire: si mostra SENZA quei caratteri, e il valore vero
 * resta dov'era (per aprire il file, per cercare). Che le due classi restino uguali lo controlla
 * `tests/unit/testo-a-schermo.test.mjs`, leggendo il sorgente del server.
 *
 * ⛔ La classe è costruita dai NUMERI dei caratteri, mai scritta coi caratteri crudi: in un sorgente non si vedono (e i servizi
 * che ospitano il codice segnalano i file che li contengono).
 */
const car = (codice) => String.fromCodePoint(codice);
const intervallo = (da, a) => `${car(da)}-${car(a)}`;
export const CODICI_CHE_INGANNANO = Object.freeze([[0x0000, 0x001F], [0x007F, 0x009F], [0x061C, 0x061C], [0x200E, 0x200F], [0x202A, 0x202E], [0x2066, 0x2069]]);
export const CARATTERI_CHE_INGANNANO = new RegExp(`[${CODICI_CHE_INGANNANO.map(([da, a]) => (da === a ? car(da) : intervallo(da, a))).join('')}]`, 'gu');

/** Il testo com'è, senza i caratteri che ingannano. Chi vuole tenere gli a capo come spazi li riduce PRIMA (sono controlli anche loro). */
export function senzaInganni(testo) {
  return typeof testo === 'string' ? testo.replace(CARATTERI_CHE_INGANNANO, '') : '';
}

/** Un testo che a schermo sta su UNA riga (un nome): spazi e a capo ridotti a uno spazio, poi via i caratteri che ingannano. */
export function suUnaRiga(testo) {
  return typeof testo === 'string' ? senzaInganni(testo.replace(/\s+/gu, ' ')).replace(/ {2,}/gu, ' ').trim() : '';
}

/** Un testo su PIÙ righe (una consegna intera): a capo e tabulazioni restano — sono la sua struttura — il resto della classe no. */
const STRUTTURA = new Set([0x09, 0x0A, 0x0D]);
export function senzaInganniSuPiuRighe(testo) {
  return typeof testo === 'string' ? testo.replace(CARATTERI_CHE_INGANNANO, (c) => (STRUTTURA.has(c.codePointAt(0)) ? c : '')) : '';
}

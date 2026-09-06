/*
 * IL PLURALE ITALIANO, IN UN POSTO SOLO.
 *
 * ⛔ Difetto BH-12 della caccia del 06/09/2026: nove componenti concatenavano
 * numero + sostantivo senza guardare il numero, e a schermo comparivano
 * «**1 ricordi**», «**1 attrezzi** · 1 abilitato», «1 file». Nella stessa
 * stringa la seconda metà il singolare lo faceva — cioè si sapeva, e si
 * sbagliava lo stesso perché il plurale viveva in nove posti.
 *
 * Ricerca 06/09/2026 — perché una tabella e non `Intl.PluralRules`:
 * `Intl.PluralRules('it')` dice quale CATEGORIA usare (`one` · `other`), non
 * quale parola: la forma flessa la deve fornire chi scrive
 * (MDN, «Intl.PluralRules» — «this does not return the plural form itself»).
 * L'italiano poi ha irregolari che nessuna regola meccanica azzecca —
 * «attività» invariabile, «file» invariabile perché è un prestito. Quindi:
 * la categoria la chiede a Intl, le due forme stanno qui, dichiarate.
 */

const CATEGORIA = new Intl.PluralRules('it-IT');
const NUMERO = new Intl.NumberFormat('it-IT');

/**
 * Le coppie singolare → plurale usate dalle superfici-luogo.
 * ⛔ Gli invariabili ci sono per ESTESO, non per omissione: scrivere due volte
 * «attività» dichiara che è voluto, mentre lasciarlo fuori sembra una svista.
 */
export const FORME = Object.freeze({
  ricordo: ['ricordo', 'ricordi'],
  attrezzo: ['attrezzo', 'attrezzi'],
  file: ['file', 'file'],
  nota: ['nota', 'note'],
  attività: ['attività', 'attività'],
  rapporto: ['rapporto', 'rapporti'],
  sessione: ['sessione', 'sessioni'],
  modello: ['modelli', 'modelli'],
  controllo: ['controllo', 'controlli'],
  automazione: ['automazione', 'automazioni'],
  giro: ['giro', 'giri'],
  chiamata: ['chiamata', 'chiamate'],
  riga: ['riga', 'righe'],
});

/**
 * La sola parola, flessa sul numero.
 * @param {number} quanti
 * @param {string} chiave una chiave di FORME, oppure il singolare
 * @param {string} [plurale] il plurale, se la parola non sta in FORME
 */
export function parola(quanti, chiave, plurale) {
  const forme = FORME[chiave] || [chiave, plurale ?? `${chiave}i`];
  return CATEGORIA.select(Number(quanti) || 0) === 'one' ? forme[0] : forme[1];
}

/**
 * Numero e parola insieme: `plurale(1,'ricordo')` → «1 ricordo».
 * ⛔ Lo ZERO in italiano prende il PLURALE («0 ricordi»), e `Intl` lo sa:
 * `select(0)` torna `other`. È il motivo per cui non basta `n === 1`.
 */
export function plurale(quanti, chiave, plurale2) {
  const n = Number(quanti);
  const sicuro = Number.isFinite(n) ? n : 0;
  return `${NUMERO.format(sicuro)} ${parola(sicuro, chiave, plurale2)}`;
}

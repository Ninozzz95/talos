/*
 * FE-051, carta del rifiuto del modello (owner 01/11/2026, bozzetto `bozzetto-rifiuto-modello`). Che cosa dice la carta e quale tasto porta, dati i fatti.
 * Decisioni dell'owner: mai un tasto «Riprova» (ridà lo stesso rifiuto e può costare); dopo la scelta di un altro modello un clic solo, senza partire
 * da sola né riempire il compositore; dopo l'invio dice con che modello è ripartito.
 * Puro: il tasto vero, l'invio e gli agganci stanno in `legacy/app.js`.
 */
import { t } from './lingua.js';

/**
 * @param {object} fatti
 * @param {string} fatti.perche la frase della famiglia, finché il modello è quello che ha rifiutato
 * @param {string|null} fatti.modelloCheHaRifiutato
 * @param {string|null} fatti.modelloOra
 * @param {string} [fatti.testo] il messaggio da rimandare; vuoto se il giro non è partito da un messaggio della persona
 * @param {string|null} [fatti.inviataCon] il modello con cui è già ripartito
 * @param {(modello:string)=>string} [fatti.nome] il nome da mostrare
 * @returns {{perche:string, azione:{tipo:'scegli'|'invia', testo:string}|null}}
 */
export function vistaCartaRifiuto({ perche, modelloCheHaRifiutato, modelloOra, testo = '', inviataCon = null, nome = (m) => m }) {
  if (inviataCon) return { perche: t('errori.turno.rifiuto.fatto', { modello: nome(inviataCon) }), azione: null };
  /* senza un modello in uso non si può dire «hai scelto»: resta la carta di partenza */
  if (!modelloOra || modelloOra === modelloCheHaRifiutato) return { perche, azione: { tipo: 'scegli', testo: t('errori.turno.rifiuto.scegli') } };
  const modello = nome(modelloOra);
  if (!String(testo).trim()) return { perche: t('errori.turno.rifiuto.mano', { modello }), azione: null };
  return { perche: t('errori.turno.rifiuto.scelto', { modello }), azione: { tipo: 'invia', testo: t('errori.turno.rifiuto.invia', { modello }) } };
}

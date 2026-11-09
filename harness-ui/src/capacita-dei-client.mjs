/*
 * ⛔ R-34 parte 2 (owner 30/10/2026; PROPOSTA-R34-PARTE-2-2026-10-30.md, sì di Desktop, CLI, Mobile e Performance) — le CAPACITÀ dei
 *   client. Una carta con `semprePersona` (la chiamata che un modello locale ha scritto come testo) la vede SOLO un client che ha
 *   dichiarato di saperla mostrare: un client vecchio (un telefono 0.1.47 in controllo remoto) la disegnerebbe cieca, «vuole cambiare
 *   qualcosa» senza nome né argomenti. La capacità si dichiara con `?capacita=` iscrivendosi agli eventi e leggendo `pending`, con lo
 *   stesso nome; vive per ascoltatore, in memoria, mai sul disco. Lista CHIUSA: un valore sconosciuto si ignora.
 *   ⛔ CLI: un ponte INOLTRA la capacità del client remoto, non la aggiunge mai.
 */
export const CAPACITA_DEI_CLIENT = Object.freeze(['chiamata-dal-testo']);

/** Le capacità dichiarate (elenco o stringa separata da virgole), filtrate sulla lista chiusa. */
export function capacitaDichiarate(valori) {
  const elenco = Array.isArray(valori) ? valori : typeof valori === 'string' ? valori.split(',') : [];
  return new Set(elenco.map((v) => String(v).trim()).filter((v) => CAPACITA_DEI_CLIENT.includes(v)));
}

/** La capacità che serve per vedere un evento, o `null`. */
export function capacitaRichiesta(evento) {
  if (evento?.type === 'ApprovalRequested' && evento.azione?.semprePersona === true) return 'chiamata-dal-testo';
  return null;
}

/** Un evento si consegna a chi ha le capacità che chiede. */
export function eventoVisibileCon(evento, capacita) {
  const serve = capacitaRichiesta(evento);
  return !serve || Boolean(capacita?.has?.(serve));
}

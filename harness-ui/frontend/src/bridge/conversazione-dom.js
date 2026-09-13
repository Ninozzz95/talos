import { contenitoreCheScorre } from '../components/cronologia.js';

/**
 * BC-43, 12/09/2026: id e classe restano compatibili con il ponte e le sonde.
 * La colonna contiene i messaggi; lo scorrevole espone la viewport e lo scroll.
 * Si riusa la risalita già verificata da BC-08, senza un secondo selettore.
 */
export function colonnaConversazione(radice = globalThis.document) {
  return radice?.querySelector('#conversation') || null;
}

/** Accetta anche il vecchio DOM, dove colonna e scorrevole coincidevano. */
export function scorrevoleConversazione(colonna = colonnaConversazione()) {
  return contenitoreCheScorre(colonna);
}

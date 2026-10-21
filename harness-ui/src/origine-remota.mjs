/*
 * L'ORIGINE «dal telefono X» di un messaggio (18/10/2026, controllo remoto; mockup v5: «Tu · 12:43 · dal telefono "Pad di Nino"»,
 * ELENCO-AZIONI §6 «il DATO dell'origine negli eventi è una funzione nuova»).
 *
 * ⛔ È un dato che la conversazione mostra come VERO, quindi nessun client può scriverlo: il corpo HTTP che porta una `bolla.origine`
 *   la perde al confine (`separaBolla` in http-app.mjs), e l'origine la mette SOLO la chiamata in processo del modulo remoto
 *   (`remoto/chiamata-interna.mjs`), attaccando all'oggetto della richiesta questo simbolo. Un simbolo non viaggia su una rete né
 *   in un'intestazione: da fuori non si falsifica.
 * Solo per la vista, come la bolla (C09): il modello non la vede mai.
 */

export const ORIGINE_REMOTA = Symbol('talos.origine-remota');

/** La forma che si conserva: `{ tipo: 'telefono', nome }`, nome tagliato. Altro → null. */
export function origineValida(grezza) {
  if (!grezza || typeof grezza !== 'object' || grezza.tipo !== 'telefono') return null;
  const nome = typeof grezza.nome === 'string' ? grezza.nome.trim().slice(0, 64) : '';
  return { tipo: 'telefono', nome: nome || null };
}

/** La bolla con l'origine della richiesta, se la richiesta viene dal telefono; senza bolla, quella del solo testo. */
export function bollaConOrigine(bolla, origine, testo) {
  const o = origineValida(origine);
  if (!o) return bolla;
  if (bolla) return { ...bolla, origine: o };
  const t = typeof testo === 'string' ? testo.trim() : '';
  return t ? { testo: t, allegati: [], origine: o } : bolla;
}

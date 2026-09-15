/*
 * La SCIA del cursore: la parte percorsa, a sinistra del pallino.
 *
 * ⛔⛔ 07/09/2026, owner: «manca la scia dorata dello slider — quando lo sposti su "Alto" dovrebbe
 * coprire spento, basso e medio. Prima c'era, adesso no». Ed era colpa di una mia cura di poche ore
 * prima: per togliere il cursore di Windows ho messo `appearance:none` e disegnato pista e pomello
 * a mano, e con `accent-color` se n'è andata anche la scia — che il browser disegnava da sé.
 *
 * ⛔ Il vincolo che rende necessario questo file (ricerca 07/09/2026 — MDN `::-moz-range-progress`,
 * nerdy.dev «Add a rad gradient progress fill to a range input», CSS Portal «Style Input Range»):
 * **Firefox ha uno pseudo-elemento per la parte percorsa, Chrome e Safari NO**. Non esiste un modo
 * di disegnarla in solo CSS che valga ovunque: la via cross-browser è un gradiente sulla pista, con
 * la percentuale portata da una variabile che qualcuno aggiorna mentre il cursore si muove.
 * ⇒ Questo file è quel «qualcuno», ed è tutto qui: nessuno stato, nessun ascoltatore per cursore.
 */

/** Il nome della variabile che il CSS legge. Sta qui perché il CSS e il JS non divergano. */
export const VARIABILE_SCIA = '--talos-range-riempimento';

/**
 * Quanta pista è percorsa, in percentuale, per un cursore con questi tre numeri.
 * ⛔ Pura, e difensiva sui casi che a schermo non si vedono ma esistono: `min === max` (una scala
 *   senza escursione: nessuna scia, non una divisione per zero), valori fuori scala, testo al posto
 *   di un numero.
 * @returns {number} da 0 a 100
 */
export function percentualeRange(valore, min = 0, max = 100) {
  const v = Number(valore);
  const a = Number(min);
  const b = Number(max);
  if (!Number.isFinite(v) || !Number.isFinite(a) || !Number.isFinite(b) || b === a) return 0;
  const quota = ((v - a) / (b - a)) * 100;
  return Math.max(0, Math.min(100, Math.round(quota * 10) / 10));
}

/** Scrive la percentuale sull'elemento: il CSS la legge da lì e disegna il gradiente. */
export function aggiornaScia(input) {
  if (!input || input.type !== 'range') return 0;
  const p = percentualeRange(input.value, input.min || 0, input.max || 100);
  input.style.setProperty(VARIABILE_SCIA, `${p}%`);
  return p;
}

/** Tutti i cursori dentro una radice, aggiornati adesso. Serve quando un velo si apre. */
export function aggiornaTutteLeScie(radice = globalThis.document) {
  if (!radice?.querySelectorAll) return 0;
  const cursori = radice.querySelectorAll('input[type="range"]');
  for (const c of cursori) aggiornaScia(c);
  return cursori.length;
}

/**
 * Aggancia la scia una volta sola, sulla RADICE: i cursori nascono e muoiono coi veli, e un
 * ascoltatore per cursore morirebbe con lui — o, peggio, resterebbe a moltiplicarsi.
 * @param {Document|Element} radice
 */
export function collegaScia(radice = globalThis.document) {
  if (!radice?.addEventListener || radice.__talosSciaCollegata) return false;
  radice.__talosSciaCollegata = true;
  const suEvento = (evento) => {
    const input = evento.target;
    if (input?.type === 'range') aggiornaScia(input);
  };
  // `input` mentre si trascina, `change` per la tastiera e per chi imposta il valore da codice
  radice.addEventListener('input', suEvento, true);
  radice.addEventListener('change', suEvento, true);
  aggiornaTutteLeScie(radice.ownerDocument || radice);
  return true;
}

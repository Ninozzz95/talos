/*
 * FE-039 (bozzetto del Context Manager, «Se il modello non va: scritto prima che serva»): nella pagina Impostazioni della finestra la stessa frase della carta in
 * Impostazioni → Memoria (FE-053), con le stesse parole. La scelta di modello e riserva resta una sola, in quella carta: qui si legge e ci si arriva.
 * Una lettura che non è arrivata non scrive niente.
 */
import { letturaDellaCatena } from './carta-compattazione.js';

/**
 * @param {{testo: HTMLElement, avviso: HTMLElement}} nodi
 * @param {{catena?: Array}|null|undefined} stato `GET /api/v1/context-settings`
 */
export function disegnaCatenaContesto({ testo, avviso }, stato) {
  const { frase, avviso: daDire } = letturaDellaCatena(stato?.catena);
  testo.textContent = frase ?? '';
  testo.hidden = !frase;
  avviso.textContent = daDire?.testo ?? '';
  avviso.hidden = !daDire;
}

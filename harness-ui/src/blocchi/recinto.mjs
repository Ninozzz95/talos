/*
 * Decisione 142 (owner 04/11/2026): il sorgente di un blocco, con o senza il recinto ```talos-blocco. PURO e senza dipendenze di Node:
 * lo usano il server (`in-libreria.mjs`, il salvataggio in Libreria e la seconda porta) e il PC (`frontend/.../blocchi/aggancio.js`,
 * il blocco riaperto dalla Libreria), così le due parti tolgono il recinto allo stesso modo.
 */
import { LINGUA_DEL_RECINTO } from './catalogo.mjs';

const RECINTO = new RegExp(`^\\s*\`\`\`${LINGUA_DEL_RECINTO}[^\\n]*\\n([\\s\\S]*?)\\n?\`\`\`\\s*$`, 'u');

/** Il sorgente del blocco: senza il recinto ```talos-blocco se c'è, senza righe vuote attorno. */
export function sorgenteDelBlocco(testo) {
  const s = String(testo ?? '');
  const dentro = RECINTO.exec(s);
  return (dentro ? dentro[1] : s).replace(/^\s*\n/u, '').replace(/\s+$/u, '');
}

/** Sembra il sorgente di un blocco (il recinto del catalogo, o la radice `root =`)? Serve alla seconda porta per non toccare l'HTML. */
export function sembraUnBlocco(testo) {
  const s = String(testo ?? '');
  return RECINTO.test(s) || /^\s*root\s*=/u.test(s);
}

/*
 * Il disegnatore di `chiave-valore` (interfaccia generativa, catalogo v1). Copiato dal bozzetto approvato
 * (`bozzetto-ui-generativa/pc3.js:45`, «Chiave e valore», pezzo vero `talos-kv`): le righe `talos-kv` di casa, chiave a sinistra in
 * grigio, valore a destra. Un valore lungo va a capo col carattere dell'interfaccia (`talos-kv__v--a-capo`, `index.css:2096-2098`).
 * Lo `stato` si dice col pallino E con la parola (mai solo col colore): il pallino d'attenzione è quello di casa
 * (`talos-kv__v--avviso`, `index.css:1797-1798`), ok ed errore lo stesso segno sui loro token; la parola sta per i lettori di schermo.
 */
import { t } from '../lingua.js';
import { el, lista, testoDelValore } from './comune.js';

const PAROLA = { ok: 'blocchi.status.ok', attenzione: 'blocchi.status.attenzione', errore: 'blocchi.status.errore' };
const LUNGO = 40;

/**
 * @param {object} blocco l'albero del lettore (`tipo: 'chiave-valore'`), anche parziale
 * @param {{ document: Document }} opzioni
 */
export function disegnaChiaveValore(blocco, { document: doc } = {}) {
  const radice = el(doc, 'div', 'gu-kv');
  for (const r of lista(blocco.righe)) {
    const riga = el(doc, 'div', 'talos-kv');
    if (r.stato) riga.dataset.stato = r.stato;
    const valore = testoDelValore(r.valore, typeof r.valore === 'number' ? 'numero' : undefined);
    const v = el(doc, 'span', 'talos-kv__v');
    if (r.stato) v.classList.add('talos-kv__v--avviso', `gu-kv--${r.stato}`);
    if (typeof r.valore === 'string' && r.valore.length > LUNGO) v.classList.add('talos-kv__v--a-capo', 'gu-kv__frase');
    v.append(el(doc, 'span', '', valore));
    if (r.stato && PAROLA[r.stato]) v.append(el(doc, 'span', 'sr-only', ` (${t(PAROLA[r.stato])})`));
    riga.append(el(doc, 'span', 'talos-kv__k', r.chiave ?? ''), v);
    radice.append(riga);
  }
  return radice;
}

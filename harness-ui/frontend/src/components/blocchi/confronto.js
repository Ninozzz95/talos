/*
 * Il disegnatore di `confronto` (interfaccia generativa, catalogo v2, scena 9, ledger G-C UIG-9): da due a quattro colonne affiancate,
 * ognuna col suo nome, i punti a favore e quelli contro. Disegno del bozzetto approvato (`.gu-confronto`).
 * ⛔ A favore e contro si dicono con l'intestazione a parole (mai solo col colore).
 */
import { t } from '../lingua.js';
import { el, lista } from './comune.js';

function elenco(doc, voci, classe, titolo) {
  const parte = el(doc, 'div', 'gu-confronto__parte');
  parte.classList.add(classe); // a template with a space passed to el() reads as on-screen text to the language gate
  parte.append(el(doc, 'div', 'gu-confronto__titolo', titolo));
  const ul = el(doc, 'ul', 'gu-confronto__lista');
  for (const v of voci) ul.append(el(doc, 'li', '', v));
  parte.append(ul);
  return parte;
}

/**
 * @param {object} blocco l'albero del lettore (`tipo: 'confronto'`), anche parziale
 * @param {{ document: Document }} opzioni
 */
export function disegnaConfronto(blocco, { document: doc } = {}) {
  const colonne = lista(blocco.colonne);
  const radice = el(doc, 'div', 'gu-confronto');
  radice.dataset.colonne = String(Math.min(Math.max(colonne.length, 1), 4)); // la griglia la decide il CSS, nessuno stile in linea
  for (const c of colonne) {
    const col = el(doc, 'section', 'gu-confronto__colonna');
    col.append(el(doc, 'h4', 'gu-confronto__nome', c.nome ?? ''));
    if (lista(c.pro).length) col.append(elenco(doc, lista(c.pro), 'gu-confronto__pro', t('blocchi.compare.pros')));
    if (lista(c.contro).length) col.append(elenco(doc, lista(c.contro), 'gu-confronto__contro', t('blocchi.compare.cons')));
    radice.append(col);
  }
  return radice;
}

/*
 * Il disegnatore di `passi` (interfaccia generativa, catalogo v1). Copiato dalla «Linea del tempo» del bozzetto approvato
 * (`bozzetto-ui-generativa/pc3.js:23`, `stile-pc3.css:40-45`): un elenco ordinato con la linea a sinistra, il pallino del passo
 * (fatto in verde, ora in accento con l'alone, da fare in grigio), il «quando» in cifre e il titolo.
 * È davvero una sequenza, quindi `ol`. Lo stato si dice anche a parole per i lettori di schermo (mai solo col colore).
 */
import { t } from '../lingua.js';
import { el, lista } from './comune.js';

const PAROLA = { fatto: 'blocchi.steps.fatto', ora: 'blocchi.steps.ora', 'da-fare': 'blocchi.steps.daFare' };
/* il bozzetto chiama «dopo» il passo da fare: `data-stato` resta quello del CSS copiato */
const STATO_DEL_CSS = { fatto: 'fatto', ora: 'ora', 'da-fare': 'dopo' };

/**
 * @param {object} blocco l'albero del lettore (`tipo: 'passi'`), anche parziale
 * @param {{ document: Document }} opzioni
 */
export function disegnaPassi(blocco, { document: doc } = {}) {
  const radice = el(doc, 'ol', 'gc-linea gu-passi');
  for (const v of lista(blocco.voci)) {
    const li = el(doc, 'li');
    li.dataset.stato = STATO_DEL_CSS[v.stato] || 'dopo';
    if (v.stato === 'ora') li.setAttribute('aria-current', 'step');
    li.append(el(doc, 'span', 'gc-linea__ora', v.quando ?? ''));
    li.append(el(doc, 'span', 'gu-passi__titolo', v.titolo ?? ''));
    if (v.stato && PAROLA[v.stato]) li.append(el(doc, 'span', 'sr-only', ` (${t(PAROLA[v.stato])})`));
    radice.append(li);
  }
  return radice;
}

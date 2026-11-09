/*
 * Il disegnatore di `avviso` (interfaccia generativa, catalogo v1). Copiato dal bozzetto approvato
 * (`bozzetto-ui-generativa/pc3.js:44`, «Avviso», pezzo vero `talos-callout`): il riquadro di casa. Il tono `attenzione` è il
 * `talos-callout` di serie (`index.css:2737`), `errore` la sua variante `talos-callout--pericolo` (`index.css:2849`); `info` usa gli
 * stessi gradini sui token dell'informazione (`blocchi.css`). Il testo può avere più righe (il lettore tiene gli a capo).
 * Il tono si dice anche a parole per i lettori di schermo (mai solo col colore).
 */
import { t } from '../lingua.js';
import { el } from './comune.js';

const CLASSE = { info: 'talos-callout gu-avviso gu-avviso--info', attenzione: 'talos-callout gu-avviso', errore: 'talos-callout talos-callout--pericolo gu-avviso' };
const PAROLA = { info: 'blocchi.tone.info', attenzione: 'blocchi.tone.attenzione', errore: 'blocchi.tone.errore' };

/**
 * @param {object} blocco l'albero del lettore (`tipo: 'avviso'`), anche parziale
 * @param {{ document: Document }} opzioni
 */
export function disegnaAvviso(blocco, { document: doc } = {}) {
  const tono = CLASSE[blocco.tono] ? blocco.tono : 'info';
  const radice = el(doc, 'div', CLASSE[tono]);
  radice.setAttribute('role', 'note');
  radice.dataset.tono = tono;
  radice.append(el(doc, 'span', 'sr-only', `${t(PAROLA[tono])}: `));
  radice.append(el(doc, 'p', 'gu-avviso__testo', blocco.testo ?? ''));
  return radice;
}

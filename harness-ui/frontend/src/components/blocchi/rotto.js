/*
 * Il blocco «rotto» (interfaccia generativa, catalogo v1). Copiato dal bozzetto approvato (`bozzetto-ui-generativa/pc.js:46`,
 * `stile-pc.css:50-52`): una frase onesta che dice cosa non è andato e che il resto della risposta è a posto, e «Mostra il testo» che
 * apre il recinto così com'è arrivato, nel blocco di codice della chat.
 * Il motivo arriva dal lettore come codice stabile (`CODICI_DEL_ROTTO`, `harness-ui/src/blocchi/catalogo.mjs`): qui diventa una di
 * quattro frasi semplici, senza nomi tecnici a schermo. Le parole della CLI («This block could not be read») e del Mobile («Rotto» con le
 * parole del PC) vengono da qui.
 */
import { t } from '../lingua.js';
import { el, tasto } from './comune.js';

const META = new Set(['bloccoIncompleto']);
const FUORI = new Set(['interazioneDaFonteEsterna']);
const GRANDE = new Set(['oltreIlLimite', 'troppoGrande', 'troppoAnnidato']);

/** La frase del perché, dal codice del lettore. */
export function perche(codice) {
  if (META.has(codice)) return t('blocchi.broken.reasonHalfway');
  if (FUORI.has(codice)) return t('blocchi.broken.reasonExternal');
  if (GRANDE.has(codice)) return t('blocchi.broken.reasonTooBig');
  return t('blocchi.broken.reasonForm');
}

/** Il recinto grezzo quando l'ospite non passa il blocco di codice della chat: un `pre` di testo, come `bloccoCodiceNudo`. */
function codiceNudo(doc, testo) {
  const pre = el(doc, 'pre', 'code-block-nudo');
  pre.setAttribute('tabindex', '0');
  pre.setAttribute('aria-label', t('blocchi.broken.codeLabel'));
  pre.append(el(doc, 'code', '', testo));
  return pre;
}

/**
 * @param {{ codice: string }} motivo il motivo del lettore
 * @param {{ document: Document, testo?: string, bloccoCodice?: (testo: string) => Node }} opzioni
 *   `testo`: il corpo del recinto così come è arrivato; `bloccoCodice`: il blocco di codice della chat (`creaBloccoCodice`), dall'aggancio
 */
export function disegnaRotto(motivo, { document: doc, testo = '', bloccoCodice } = {}) {
  const radice = el(doc, 'div', 'gu-rotto-blocco');
  radice.dataset.codice = String(motivo?.codice ?? '');
  radice.append(el(doc, 'p', 'gu-rotto', t('blocchi.broken.text', { perche: perche(motivo?.codice) })));
  if (testo) {
    const riga = el(doc, 'p', 'gu-rotto__azioni');
    const mostra = tasto(doc, t('blocchi.broken.showText'));
    mostra.setAttribute('aria-expanded', 'false');
    const grezzo = el(doc, 'div', 'gu-rotto__testo');
    grezzo.hidden = true;
    let disegnato = false;
    mostra.addEventListener('click', () => {
      if (!disegnato) { grezzo.append(typeof bloccoCodice === 'function' ? bloccoCodice(testo) : codiceNudo(doc, testo)); disegnato = true; }
      grezzo.hidden = !grezzo.hidden;
      mostra.setAttribute('aria-expanded', String(!grezzo.hidden));
      mostra.textContent = grezzo.hidden ? t('blocchi.broken.showText') : t('blocchi.broken.hideText');
    });
    riga.append(mostra);
    radice.append(riga, grezzo);
  }
  return radice;
}

/*
 * FE-003 (decisione del 31/10: il blocco si apre «a lato o a tutto schermo»): le due viste di un blocco, copiate dal bozzetto (`bozzetto-ui-generativa/pc.js:77-96`).
 *
 * Una vista è lo stesso blocco ridisegnato con le stesse opzioni, quindi con lo stesso stato (`statoDelBlocco`): filtro e ordine valgono in tutti i posti, e il primo gesto
 * vale per tutti. A lato sta in un livello sopra le schede della colonna: le schede sotto non si toccano e tornano alla chiusura. A tutto schermo è una finestra di dialogo
 * dentro TALOS, Esc esce e il fuoco torna al pulsante da cui si è partiti (W3C APG «Dialog (Modal)»: fuoco dentro, Tab non esce).
 * Senza colonna a disposizione «Apri a lato» porta allo schermo intero: la vista larga è quella che si chiedeva.
 */
import { t } from '../lingua.js';
import { el, tasto } from './comune.js';
import { disegnaBlocco } from './guscio.js';

const FOCALIZZABILI = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]';

/**
 * @param {{ document: Document, colonna: () => HTMLElement|null, apriColonna: () => void }} o
 * @returns {{ lato: Function, schermo: Function, chiudi: () => void }}
 */
export function creaVisteDelBlocco({ document: doc, colonna, apriColonna }) {
  let lato = null;
  let schermo = null;

  /* le opzioni sono quelle del blocco in chat, stato compreso: cambia solo che le azioni non riaprono la vista in cui si è già */
  const corpo = ({ risultato, opzioni }) => disegnaBlocco(risultato, { ...opzioni, azioni: {}, senzaTitolo: true });

  function chiudiLato() {
    lato?.frase?.remove();
    lato?.nodo.remove();
    lato = null;
  }
  function esci() {
    if (!schermo) return;
    const { nodo, ritorno } = schermo;
    schermo = null;
    nodo.remove();
    if (ritorno?.isConnected) ritorno.focus();
  }

  function apriLato(blocco, contesto) {
    const posto = colonna();
    if (!posto) { apriSchermo(blocco, contesto); return; }
    esci();
    chiudiLato();
    const nodo = el(doc, 'div', 'gu-lato');
    nodo.dataset.latoAperto = blocco.id;
    const testa = el(doc, 'div', 'gu-lato__testa');
    const aSchermo = tasto(doc, t('blocchi.actions.fullScreen'));
    aSchermo.addEventListener('click', () => apriSchermo(blocco, contesto));
    const chiudi = tasto(doc, t('chat.common.close'));
    chiudi.addEventListener('click', chiudiLato);
    testa.append(el(doc, 'h2', '', blocco.titolo || ''), aSchermo, chiudi);
    const dentro = el(doc, 'div', 'gu-lato__corpo');
    dentro.append(corpo(contesto));
    nodo.append(testa, dentro);
    let frase = null;
    const sotto = contesto.nodo?.querySelector?.('.gu__sotto');
    if (blocco.tipo === 'tabella' && sotto) {
      frase = el(doc, 'span', 'gu-qui', t('blocchi.side.shared'));
      sotto.append(frase);
    }
    posto.append(nodo);
    lato = { nodo, frase };
    apriColonna();
  }

  function apriSchermo(blocco, contesto) {
    const ritorno = schermo ? schermo.ritorno : doc.activeElement;
    if (schermo) { schermo.nodo.remove(); schermo = null; }
    const nodo = el(doc, 'div', 'gu-schermo');
    nodo.tabIndex = -1;
    nodo.dataset.schermoAperto = blocco.id;
    nodo.setAttribute('role', 'dialog');
    nodo.setAttribute('aria-modal', 'true');
    nodo.setAttribute('aria-label', blocco.titolo || t('blocchi.actions.fullScreen'));
    const testa = el(doc, 'div', 'gu-schermo__testa');
    const aLato = tasto(doc, t('blocchi.actions.side'));
    aLato.addEventListener('click', () => apriLato(blocco, contesto));
    const uscita = tasto(doc, t('blocchi.actions.exit'));
    uscita.addEventListener('click', esci);
    testa.append(el(doc, 'h2', '', blocco.titolo || ''), aLato, uscita);
    const dentro = el(doc, 'div', 'gu-schermo__corpo');
    dentro.append(corpo(contesto));
    nodo.append(testa, dentro);
    nodo.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); esci(); return; }
      if (e.key !== 'Tab') return;
      const fermate = nodo.querySelectorAll(FOCALIZZABILI);
      const prima = fermate[0];
      const ultima = fermate[fermate.length - 1];
      if (!prima) return;
      if (e.shiftKey && (doc.activeElement === prima || doc.activeElement === nodo)) { e.preventDefault(); ultima.focus(); }
      else if (!e.shiftKey && doc.activeElement === ultima) { e.preventDefault(); prima.focus(); }
    });
    doc.body.append(nodo);
    schermo = { nodo, ritorno };
    uscita.focus();
  }

  return { lato: apriLato, schermo: apriSchermo, chiudi() { schermo = schermo && { ...schermo, ritorno: null }; esci(); chiudiLato(); } };
}

/*
 * Il disegnatore di `scelte` (interfaccia generativa, catalogo v1). Copiato dal bozzetto approvato
 * (`bozzetto-ui-generativa/pc.js:32`, `stile-pc.css:41-43`): una fila di `talos-button--secondary talos-button--sm` e sotto la frase
 * che dice cosa succede al clic. Il testo mandato è identico a quello del pulsante (`TABELLA-PEZZI.md`, telefono, riga «Scelte»).
 * Dopo il primo clic il blocco si blocca: la scelta resta segnata (`aria-pressed`), le altre spente.
 */
import { t } from '../lingua.js';
import { creaAzione, agisci, osservaAzione, statoAzione } from './azione.js';
import { el, lista } from './comune.js';

/**
 * @param {object} blocco l'albero del lettore (`tipo: 'scelte'`), anche parziale
 * @param {{ document: Document, interattivo?: boolean, stato?: { azione: object|null }, origine?: string,
 *   quandoScelto?: (azione: object) => void, soloLettura?: boolean }} opzioni
 *   `interattivo`: vero SOLO a blocco completo e senza `fonte` (lo decide il guscio con `puoAgire`)
 */
export function disegnaScelte(blocco, { document: doc, interattivo = false, stato = statoAzione(), origine, quandoScelto, soloLettura = false } = {}) {
  const attivo = interattivo && !blocco.fonte;
  const radice = el(doc, 'div', 'gu-scelte-blocco');
  if (blocco.domanda) radice.append(el(doc, 'p', 'gu-scelte__domanda', blocco.domanda));
  const fila = el(doc, 'div', 'gu-scelte');
  const tasti = lista(blocco.opzioni).map((o) => {
    const b = el(doc, 'button', 'talos-button talos-button--secondary talos-button--sm', o.testo);
    b.type = 'button';
    b.dataset.scelta = o.testo;
    return b;
  });
  /*
   * G-G2, UIG-5.6 (06/11/2026): spento con `aria-disabled`, MAI `disabled`. Su un controllo disabilitato l'HTML vieta i clic (§4.10.19.5)
   * e Chrome non garantisce gli altri eventi del mouse (chromestatus 6128674512830464, «In development»): il tasto destro su un'opzione
   * già usata deve aprire il menu del blocco, non quello del sistema. Il clic lo ferma la guardia qui sotto; il lettore di schermo legge
   * `aria-disabled`. Senza gesto (il blocco riacceso da un nome giusto) `aria-pressed` se ne va.
   */
  /* Cura BG3 round 7: an answer whose send failed is taken back by the hook (`riapri`): the block opens again and this sentence says the
     choice was not sent (the failure toast stays the only notice, decision 375). Hermes keeps a clarify card answerable after a failed
     send (`apps/desktop/src/store/clarify.ts:366-389`). In read-only mode there is no sentence at all (revisione J, D4). */
  const nota = soloLettura ? null : el(doc, 'p', 'gu-scelte__nota', t('blocchi.choices.note'));
  nota?.setAttribute('aria-live', 'polite');
  const segna = () => {
    /* cura BG3 round 8 (C5): an aria-live region is read at every write; the sentence is written only when it changes */
    /* decision 398 (owner 08/11): an answered block says so, and a second click is no longer silent. Hermes answers a second response
       to the same prompt with `already_resolved` (`gateway/session_pending_controls.py:71`). */
    const frase = t(stato.azione ? 'blocchi.choices.sent' : (stato.nonInviata ? 'blocchi.choices.notSent' : 'blocchi.choices.note'));
    if (nota && nota.textContent !== frase) nota.textContent = frase;
    const scelto = stato.azione?.valore;
    for (const b of tasti) {
      b.disabled = false;
      if (!attivo || stato.azione) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
      if (stato.azione) b.setAttribute('aria-pressed', String(b.dataset.scelta === scelto)); else b.removeAttribute('aria-pressed');
    }
  };
  for (const b of tasti) {
    b.addEventListener('click', () => {
      if (!attivo || stato.azione) return;
      agisci(stato, creaAzione(blocco, b.dataset.scelta, origine), quandoScelto);
      segna();
    });
  }
  segna();
  osservaAzione(stato, segna);
  fila.append(...tasti);
  radice.append(fila);
  /* revisione J, D4 (04/11): in sola lettura (il blocco riaperto dalla Libreria) un clic non manda niente: la frase non lo promette */
  if (nota) radice.append(nota);
  return radice;
}

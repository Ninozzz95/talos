/*
 * Il disegnatore del `modulo` (interfaccia generativa, catalogo v1). Copiato dalla «domanda generata» del bozzetto approvato
 * (`bozzetto-ui-generativa/pc2.js:36-46`, `stile-pc.css:76-87`): un `fieldset.gq-campo` per domanda, le opzioni come `talos-chip`
 * con `role="radio"` (una) o `role="checkbox"` (più d'una), sotto il blocco il tasto del modello in `talos-button--primary`, «Scrivo io»
 * e la frase «un clic, un messaggio solo». I campi liberi usano il campo di casa `talos-field__input` (`pc3.js`, «Campo di testo»):
 * niente controlli nativi (niente spin dei numeri, niente calendario del sistema).
 * ⛔ Diverso dal bozzetto, apposta: nessuna opzione già scelta. Nel bozzetto la prima era accesa per mostrare il disegno; in un
 *   modulo scritto dal modello una scelta già fatta partirebbe con un clic distratto.
 * Un invio = UN oggetto `talos.blocco.azione.v1` e il blocco si blocca (come `scelte`).
 */
import { t } from '../lingua.js';
import { creaAzione, agisci, osservaAzione, statoAzione } from './azione.js';
import { el, lista, tasto } from './comune.js';

/**
 * @param {object} blocco l'albero del lettore (`tipo: 'modulo'`), anche parziale
 * @param {{ document: Document, interattivo?: boolean, stato?: { azione: object|null }, origine?: string,
 *   quandoInviato?: (azione: object) => void, scrivoIo?: () => void, soloLettura?: boolean }} opzioni
 * @returns {HTMLElement} il corpo; `azioniDelBlocco` porta i tasti che il guscio mette sotto il blocco
 */
export function disegnaModulo(blocco, { document: doc, interattivo = false, stato = statoAzione(), origine, quandoInviato, scrivoIo, soloLettura = false } = {}) {
  const attivo = interattivo && !blocco.fonte;
  const radice = el(doc, 'div', 'gq gu-modulo');
  const controlli = [];
  const letture = [];
  lista(blocco.campi).forEach((c) => {
    if (c.tipo === 'scelta' || c.tipo === 'piu-scelte') {
      const multi = c.tipo === 'piu-scelte';
      const campo = el(doc, 'fieldset', 'gq-campo');
      campo.append(el(doc, 'legend', '', c.etichetta));
      const voci = el(doc, 'div', 'gq-voci');
      voci.setAttribute('role', multi ? 'group' : 'radiogroup');
      const chip = lista(c.opzioni).map((o) => {
        const b = el(doc, 'button', 'talos-chip', o.testo);
        b.type = 'button';
        b.setAttribute('role', multi ? 'checkbox' : 'radio');
        b.setAttribute('aria-checked', 'false');
        b.dataset.valore = o.testo;
        b.addEventListener('click', () => {
          if (!attivo || stato.azione) return;
          if (multi) b.setAttribute('aria-checked', String(b.getAttribute('aria-checked') !== 'true'));
          else for (const x of chip) x.setAttribute('aria-checked', String(x === b));
        });
        controlli.push(b);
        return b;
      });
      voci.append(...chip);
      campo.append(voci);
      radice.append(campo);
      letture.push([c, () => {
        const scelti = chip.filter((x) => x.getAttribute('aria-checked') === 'true').map((x) => x.dataset.valore);
        return multi ? (scelti.length ? scelti : null) : (scelti[0] ?? null);
      }]);
      return;
    }
    const campo = el(doc, 'label', 'gq-campo gq-campo--testo');
    campo.append(el(doc, 'span', 'gq-etichetta', c.etichetta));
    const input = el(doc, 'input', 'talos-field__input');
    input.type = 'text';
    input.setAttribute('autocomplete', 'off');
    if (c.tipo === 'numero') input.setAttribute('inputmode', 'decimal');
    if (c.tipo === 'data') input.setAttribute('placeholder', t('blocchi.form.datePlaceholder'));
    input.dataset.campo = c.id;
    campo.append(input);
    controlli.push(input);
    radice.append(campo);
    letture.push([c, () => (input.value.trim() ? input.value.trim() : null)]);
  });

  const invia = tasto(doc, blocco.invia ?? '', 'primary');
  invia.dataset.inviaModulo = '';
  controlli.push(invia);
  const azioni = [invia];
  if (typeof scrivoIo === 'function') {
    const io = tasto(doc, t('blocchi.form.writeMyself'));
    io.addEventListener('click', () => { if (attivo && !stato.azione) scrivoIo(); });
    controlli.push(io);
    azioni.push(io);
  }
  /* revisione J, D4 (04/11): in sola lettura (il blocco riaperto dalla Libreria) «Un clic, un messaggio solo» sarebbe falso */
  /* Cura BG3 round 7: a send that failed opens the form again, values kept, and this sentence says it was not sent (see `scelte.js`) */
  const nota = soloLettura ? null : el(doc, 'span', 'gu__fonte gq-nota', t('blocchi.form.note'));
  nota?.setAttribute('aria-live', 'polite');
  if (nota) azioni.push(nota);

  /* G-G2, UIG-5.6: i tasti spenti con `aria-disabled` (il tasto destro apre il menu del blocco, vedi `scelte.js`); i campi di testo restano `disabled` */
  const segna = () => {
    const frase = t(stato.nonInviata && !stato.azione ? 'blocchi.form.notSent' : 'blocchi.form.note'); // BG3 round 8 (C5): see `scelte.js`
    if (nota && nota.textContent !== frase) nota.textContent = frase;
    const spento = !attivo || Boolean(stato.azione);
    for (const x of controlli) {
      if (x.tagName === 'INPUT') { x.disabled = spento; continue; }
      x.disabled = false;
      if (spento) x.setAttribute('aria-disabled', 'true'); else x.removeAttribute('aria-disabled');
    }
  };
  invia.addEventListener('click', () => {
    if (!attivo || stato.azione) return;
    const valore = {};
    let qualcosa = false;
    for (const [c, leggi] of letture) { valore[c.id] = leggi(); if (valore[c.id] !== null) qualcosa = true; }
    if (!qualcosa) { controlli[0]?.focus?.(); return; } // un modulo vuoto non diventa un messaggio vuoto
    agisci(stato, creaAzione(blocco, valore, origine), quandoInviato);
    segna();
  });
  segna();
  osservaAzione(stato, segna);
  radice.azioniDelBlocco = azioni;
  return radice;
}

/** Il testo del messaggio della persona per un invio: «Etichetta: valore · …» (come il bozzetto, `pc2.js:46`). */
export function testoDelModulo(blocco, valore) {
  return lista(blocco.campi)
    .filter((c) => valore?.[c.id] !== null && valore?.[c.id] !== undefined)
    .map((c) => `${c.etichetta}: ${Array.isArray(valore[c.id]) ? valore[c.id].join(', ') : valore[c.id]}`)
    .join(' · ');
}

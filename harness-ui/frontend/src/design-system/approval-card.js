import { defineComponent } from '../ui/component.js';

/*
 * ApprovalCard — la richiesta di permesso: cosa vuole fare, PERCHE', e cosa
 * cambia se dici di si'.
 *
 * ⛔ Non e' una voce del log. La conversazione e' `role="log"`, quindi
 * `aria-live="polite"`: un annuncio educato aspetta che chi ascolta finisca, e
 * una richiesta che blocca il lavoro non puo' aspettare. Qui la card e'
 * `role="group"` con un nome proprio, riceve il FOCUS quando compare, e
 * l'annuncio passa dalla regione dedicata invece che dal log.
 * Fonte: w3.org/WAI/WCAG21/Techniques/aria/ARIA23 (role=log e' per gli
 * aggiornamenti sequenziali, non per le decisioni)
 *
 * ⛔ E il PERCHE' e' obbligatorio (decisione E9): senza motivo, l'unica difesa
 * di chi legge e' dire di no a tutto. Il componente non si monta senza.
 */
export const createApprovalCard = defineComponent('ApprovalCard', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const card = documentObj.createElement('section');
  const testa = documentObj.createElement('div');
  const titolo = documentObj.createElement('span');
  const perche = documentObj.createElement('p');
  const corpo = documentObj.createElement('div');
  const piede = documentObj.createElement('div');
  const scadenza = documentObj.createElement('span');
  card.className = 'talos-approval';
  testa.className = 'talos-approval__head';
  titolo.className = 'talos-approval__title';
  perche.className = 'talos-approval__why';
  piede.className = 'talos-approval__foot';
  scadenza.className = 'talos-approval__foot-note';
  card.setAttribute('role', 'group');
  card.tabIndex = -1;
  testa.append(titolo);
  card.append(testa, perche, corpo, piede);

  let props = { presented: false, ...initialProps };
  let azioniCorrenti = [];
  let annunciata = false;

  function render() {
    if (!props.title) throw new TypeError('ApprovalCard richiede un titolo');
    if (!props.reason) throw new TypeError('ApprovalCard richiede il PERCHE\': senza motivo l\'unica difesa e\' dire di no a tutto');
    if (!Array.isArray(props.actions) || !props.actions.length) throw new TypeError('ApprovalCard richiede almeno un\'azione');
    titolo.textContent = String(props.title);
    perche.textContent = String(props.reason);
    card.setAttribute('aria-label', String(props.title));
    const contenuto = Array.isArray(props.content) ? props.content : [props.content].filter(Boolean);
    corpo.replaceChildren(...contenuto);
    corpo.hidden = !contenuto.length;
    const azioni = [...props.actions, ...(props.expiry ? [scadenza] : [])];
    if (azioni.length !== azioniCorrenti.length || azioni.some((n, i) => n !== azioniCorrenti[i])) {
      piede.replaceChildren(...azioni);
      azioniCorrenti = azioni;
    }
    scadenza.textContent = props.expiry ? String(props.expiry) : '';
    if (props.testId) card.dataset.testid = props.testId;

    /*
     * Compare: prende il focus e si annuncia UNA volta sola. Un annuncio
     * ripetuto e' rumore, e il rumore porta a spegnere gli avvisi.
     */
    if (props.presented && !annunciata) {
      annunciata = true;
      if (typeof card.focus === 'function') card.focus();
      if (typeof props.announce === 'function') props.announce(`${props.title}. ${props.reason}`);
    }
  }

  render();
  return {
    element: card,
    focus(options) { card.focus(options); },
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { card.remove(); },
  };
});

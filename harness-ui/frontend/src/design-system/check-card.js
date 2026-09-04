import { defineComponent } from '../ui/component.js';

/*
 * CheckCard — un controllo del Doctor: severita', cosa e' successo, e cosa
 * fare (decisioni H1-H5).
 *
 * ⛔ La severita' non e' la striscia colorata: e' una PAROLA. Una striscia
 * arancione non arriva a chi ascolta, e non arriva nemmeno a chi non
 * distingue i colori. `severityLabel` e' obbligatorio, e finisce in un badge
 * di testo accanto al titolo.
 *
 * ⛔ Un avviso o un guasto senza RIMEDIO non si monta: «la riga di rimedio e'
 * la cosa migliore del loro Doctor», e un problema senza rimedio e' solo una
 * brutta notizia. Le note e gli «ok» possono non averlo — non c'e' niente da
 * fare.
 */
const SEVERITA = new Set(['ok', 'info', 'warning', 'danger']);
const RICHIEDONO_RIMEDIO = new Set(['warning', 'danger']);

export const createCheckCard = defineComponent('CheckCard', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const carta = documentObj.createElement('section');
  const striscia = documentObj.createElement('span');
  const corpo = documentObj.createElement('div');
  const testa = documentObj.createElement('div');
  const titolo = documentObj.createElement('span');
  const gravita = documentObj.createElement('span');
  const testo = documentObj.createElement('p');
  const rimedio = documentObj.createElement('div');
  striscia.className = 'talos-check-card__stripe';
  striscia.setAttribute('aria-hidden', 'true');
  corpo.className = 'talos-check-card__body';
  testa.className = 'talos-check-card__head';
  titolo.className = 'talos-check-card__title';
  testo.className = 'talos-check-card__text';
  rimedio.className = 'talos-check-card__actions';
  testa.append(titolo, gravita);
  corpo.append(testa, testo, rimedio);
  carta.append(striscia, corpo);

  let props = { severity: 'ok', ...initialProps };
  let azioniCorrenti = [];

  function render() {
    if (!SEVERITA.has(props.severity)) throw new TypeError(`severita' non valida: ${props.severity}`);
    if (!props.title) throw new TypeError('CheckCard richiede un titolo');
    if (!props.severityLabel) throw new TypeError('CheckCard richiede il NOME della severita\': una striscia colorata non arriva a chi ascolta');
    const azioni = Array.isArray(props.actions) ? props.actions : [];
    if (RICHIEDONO_RIMEDIO.has(props.severity) && !azioni.length) {
      throw new TypeError('un avviso o un guasto richiede un rimedio: un problema senza rimedio e\' solo una brutta notizia');
    }
    carta.className = `talos-card talos-check-card talos-check-card--${props.severity}`;
    titolo.textContent = String(props.title);
    gravita.textContent = String(props.severityLabel);
    gravita.className = `talos-badge talos-badge--sm talos-badge--${props.severity === 'ok' ? 'success' : props.severity}`;
    testo.textContent = props.text ? String(props.text) : '';
    testo.hidden = !props.text;
    if (azioni.length !== azioniCorrenti.length || azioni.some((n, i) => n !== azioniCorrenti[i])) {
      rimedio.replaceChildren(...azioni);
      azioniCorrenti = azioni;
    }
    rimedio.hidden = !azioni.length;
    if (props.testId) carta.dataset.testid = props.testId;
  }

  render();
  return {
    element: carta,
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { carta.remove(); },
  };
});

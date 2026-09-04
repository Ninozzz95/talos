import { defineComponent } from '../ui/component.js';

/*
 * SessionItem — la riga della cronologia: titolo, stato, modello, ora, giri.
 *
 * ⛔ `aria-current="true"`, non `"page"`: la sessione aperta e' l'elemento
 * corrente di un insieme, non un luogo dove si naviga. Sono valori diversi con
 * significati diversi, e usarli a caso fa annunciare «pagina corrente» a una
 * riga che pagina non e' (ricerca 04/09/2026, a11y-collective.com/blog/aria-current/).
 *
 * ⛔ Lo stato non e' solo un pallino colorato: il suo NOME («in corso»,
 * «aspetta te», «giri finiti») e' testo vero nella riga, quindi lo legge sia
 * chi guarda sia chi ascolta, e sopravvive alla traduzione.
 *
 * ⛔ E l'ora e i giri hanno la loro unita' per chi ascolta: «7 giri», non «7».
 */
const STATI = new Set(['live', 'waiting', 'done', 'error', 'interrupted']);
const TONO_DELLO_STATO = new Map([
  ['live', 'live'], ['waiting', 'warning'], ['done', 'success'], ['error', 'danger'], ['interrupted', 'neutral'],
]);

export const createSessionItem = defineComponent('SessionItem', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const li = documentObj.createElement('li');
  const button = documentObj.createElement('button');
  const testo = documentObj.createElement('span');
  const titolo = documentObj.createElement('span');
  const sotto = documentObj.createElement('span');
  const pallino = documentObj.createElement('span');
  const statoTesto = documentObj.createElement('span');
  const aside = documentObj.createElement('span');
  const quando = documentObj.createElement('span');
  const giri = documentObj.createElement('span');
  const giriValore = documentObj.createElement('span');
  const giriUnita = documentObj.createElement('span');

  button.type = 'button';
  button.className = 'talos-session-item';
  titolo.className = 'talos-session-item__title';
  sotto.className = 'talos-session-item__sub';
  aside.className = 'talos-session-item__aside';
  giriUnita.className = 'sr-only';
  pallino.setAttribute('aria-hidden', 'true');
  sotto.append(pallino, statoTesto);
  testo.append(titolo, sotto);
  // Valore e unita' come due nodi: vedi la nota in `nav-item.js`.
  giri.append(giriValore, giriUnita);
  aside.append(quando, giri);
  button.append(testo, aside);
  li.append(button);

  let props = { status: 'done', current: false, turnsUnit: 'giri', ...initialProps };
  const onClick = (event) => { if (typeof props.onPress === 'function') props.onPress(event); };
  button.addEventListener('click', onClick);

  function render() {
    if (!props.title) throw new TypeError('SessionItem richiede un titolo');
    if (!STATI.has(props.status)) throw new TypeError(`stato sessione non valido: ${props.status}`);
    if (!props.statusLabel) throw new TypeError('SessionItem richiede il nome dello stato, non solo il suo colore');

    titolo.textContent = String(props.title);
    pallino.className = `talos-dot talos-dot--sm talos-dot--${TONO_DELLO_STATO.get(props.status)}`;
    statoTesto.textContent = props.model ? `${props.statusLabel} · ${props.model}` : String(props.statusLabel);
    quando.textContent = props.when ? String(props.when) : '';
    if (props.turns !== undefined && props.turns !== null) {
      giriValore.textContent = String(props.turns);
      giriUnita.textContent = ` ${props.turnsUnit}`;
    } else {
      giriValore.textContent = '';
      giriUnita.textContent = '';
    }
    // Corrente in un insieme, non una pagina.
    if (props.current) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
    if (props.testId) button.dataset.testid = props.testId;
  }

  render();
  return {
    element: li,
    focus(options) { button.focus(options); },
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { button.removeEventListener('click', onClick); li.remove(); },
  };
});

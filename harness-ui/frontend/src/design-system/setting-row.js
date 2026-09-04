import { defineComponent } from '../ui/component.js';

/*
 * SettingRow — una riga delle impostazioni, e la cosa che oggi manca: QUANDO
 * la modifica morde (decisione D6).
 *
 * ⛔ «vale da subito» / «vale dalle sessioni nuove» e' obbligatorio. Oggi
 * nell'app non si capisce mai se una modifica tocca la sessione aperta, e chi
 * la cambia resta col dubbio o la prova a caso. Renderlo un campo obbligatorio
 * e' l'unico modo perche' non sparisca alla prima riga scritta di fretta.
 *
 * ⛔ Il controllo e' legato alla sua etichetta con `aria-labelledby` — verso
 * il testo VISIBILE — invece che con un `aria-label` duplicato, che i browser
 * non traducono.
 */
let contatore = 0;

export const createSettingRow = defineComponent('SettingRow', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const riga = documentObj.createElement('div');
  const testo = documentObj.createElement('div');
  const etichetta = documentObj.createElement('span');
  const portata = documentObj.createElement('span');
  const zonaControllo = documentObj.createElement('div');
  contatore += 1;
  etichetta.id = initialProps.id || `talos-setting-${contatore}`;
  riga.className = 'talos-setting';
  etichetta.className = 'talos-setting__label';
  portata.className = 'talos-setting__scope';
  zonaControllo.className = 'talos-setting__control';
  testo.append(etichetta, portata);
  riga.append(testo, zonaControllo);

  let props = { ...initialProps };
  let controlloCorrente = null;

  function render() {
    if (!props.label) throw new TypeError('SettingRow richiede un\'etichetta');
    if (!props.scope) throw new TypeError('SettingRow richiede la PORTATA: quando la modifica morde («vale da subito», «vale dalle sessioni nuove»)');
    if (!props.control) throw new TypeError('SettingRow richiede il suo controllo');
    etichetta.textContent = String(props.label);
    portata.textContent = String(props.scope);
    if (props.control !== controlloCorrente) {
      zonaControllo.replaceChildren(props.control);
      controlloCorrente = props.control;
      // Il controllo prende il nome dall'etichetta visibile, non da un attributo.
      const bersaglio = typeof props.control.querySelector === 'function'
        ? (props.control.querySelector('input, select, button') || props.control)
        : props.control;
      bersaglio.setAttribute?.('aria-labelledby', etichetta.id);
    }
    if (props.testId) riga.dataset.testid = props.testId;
  }

  render();
  return {
    element: riga,
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { riga.remove(); },
  };
});

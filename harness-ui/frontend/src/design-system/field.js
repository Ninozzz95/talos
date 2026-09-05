import { defineComponent } from '../ui/component.js';

/*
 * Field — il campo di testo con la sua icona (ricerca nella sidebar, nelle
 * impostazioni, in Capability, nel selettore di cartella).
 *
 * ⛔ Ricerca del 04/09/2026: «usa gli elementi nativi quando esprimono la
 * semantica; ARIA e' una riparazione». Quindi qui c'e' un `<input>` vero con
 * una `<label>` vera, non un `div` con `role="textbox"`. La label e'
 * `sr-only` quando il disegno non la mostra: resta testo tradotto e
 * annunciato, mentre un `aria-label` non verrebbe tradotto dal browser.
 * Fonti: web-accessibility-checker.com/en/blog/aria-labels-best-practices ·
 * ratedwithai.com/blog/aria-labels-accessibility-guide-2026
 */
const SIZES = new Set(['sm', 'md']);
let contatore = 0;

export const createField = defineComponent('Field', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const wrap = documentObj.createElement('div');
  const label = documentObj.createElement('label');
  const input = documentObj.createElement('input');
  const errore = documentObj.createElement('p');
  contatore += 1;
  input.id = initialProps.id || `talos-field-${contatore}`;
  label.setAttribute('for', input.id);
  /*
   * ⛔ L'elemento del messaggio ESISTE SEMPRE, anche vuoto, e `aria-describedby`
   * lo nomina fin dal montaggio: l'associazione resta stabile e non va
   * ricablata quando un errore compare. E' la forma raccomandata (ricerca del
   * 05/09/2026, smashingmagazine.com/2023/02/guide-accessible-form-validation/
   * · webaim.org/techniques/formvalidation/ ·
   * w3.org/WAI/WCAG22/working-examples/aria-invalid-data-format).
   *
   * ⛔ E NON e' una regione live: un campo che grida a ogni tasto e'
   * inservibile. Chi valida decide QUANDO (alla perdita del fuoco, o dopo una
   * pausa) e il fuoco che si sposta basta a far annunciare il messaggio.
   */
  errore.id = `${input.id}-errore`;
  errore.className = 'talos-field__error';
  input.setAttribute('aria-describedby', errore.id);
  wrap.append(label, input, errore);

  let props = { size: 'md', type: 'search', labelVisible: false, ...initialProps };
  let iconaCorrente = null;
  const onInput = (event) => { if (typeof props.onInput === 'function') props.onInput(event.target.value, event); };
  input.addEventListener('input', onInput);

  function render() {
    if (!SIZES.has(props.size)) throw new TypeError(`dimensione campo non valida: ${props.size}`);
    if (!props.label) throw new TypeError('Field richiede una label: un campo senza nome non e\' usabile');
    wrap.className = `talos-field${props.size === 'sm' ? ' talos-field--sm' : ''}`;
    label.textContent = String(props.label);
    label.className = props.labelVisible ? 'talos-field__label' : 'sr-only';
    input.className = 'talos-field__input';
    input.type = props.type;
    if (props.placeholder) input.placeholder = String(props.placeholder);
    else input.removeAttribute('placeholder');
    if (props.value !== undefined && input.value !== props.value) input.value = String(props.value);
    if (props.disabled) input.setAttribute('disabled', '');
    else input.removeAttribute('disabled');
    // `aria-invalid` SOLO quando c'e' davvero un errore: dichiararlo sempre
    // renderebbe il campo permanentemente sbagliato per chi ascolta.
    const messaggio = props.error ? String(props.error) : '';
    errore.textContent = messaggio;
    errore.hidden = !messaggio;
    if (messaggio) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    if (props.icon && props.icon !== iconaCorrente) {
      if (iconaCorrente && typeof iconaCorrente.remove === 'function') iconaCorrente.remove();
      props.icon.classList?.add('talos-field__icon');
      props.icon.setAttribute?.('aria-hidden', 'true');
      wrap.insertBefore(props.icon, input);
      iconaCorrente = props.icon;
    }
    if (props.testId) wrap.dataset.testid = props.testId;
  }

  render();
  return {
    element: wrap,
    focus(options) { input.focus(options); },
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { input.removeEventListener('input', onInput); wrap.remove(); },
  };
});

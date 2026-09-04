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
  contatore += 1;
  input.id = initialProps.id || `talos-field-${contatore}`;
  label.setAttribute('for', input.id);
  wrap.append(label, input);

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

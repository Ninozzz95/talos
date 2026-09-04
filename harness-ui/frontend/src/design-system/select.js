import { defineComponent } from '../ui/component.js';

/*
 * Select — la scelta fra poche opzioni: modello, permesso per attrezzo, tema.
 *
 * Elemento nativo, per la stessa ragione di `Field`: un `<select>` porta
 * gratis la tastiera, il tocco, la ricerca per lettera e il widget del
 * sistema operativo. Una tendina rifatta a mano dovrebbe riconquistarli uno a
 * uno, e di solito ne perde qualcuno per strada.
 */
const SIZES = new Set(['sm', 'md']);
let contatore = 0;

export const createSelect = defineComponent('Select', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const wrap = documentObj.createElement('div');
  const label = documentObj.createElement('label');
  const select = documentObj.createElement('select');
  contatore += 1;
  select.id = initialProps.id || `talos-select-${contatore}`;
  label.setAttribute('for', select.id);
  wrap.append(label, select);

  let props = { size: 'md', options: [], labelVisible: false, ...initialProps };
  const onChange = (event) => { if (typeof props.onChange === 'function') props.onChange(event.target.value, event); };
  select.addEventListener('change', onChange);

  function render() {
    if (!SIZES.has(props.size)) throw new TypeError(`dimensione select non valida: ${props.size}`);
    if (!props.label) throw new TypeError('Select richiede una label');
    if (!Array.isArray(props.options) || !props.options.length) throw new TypeError('Select richiede almeno un\'opzione');
    wrap.className = 'talos-select-field';
    label.textContent = String(props.label);
    label.className = props.labelVisible ? 'talos-field__label' : 'sr-only';
    select.className = `talos-select${props.size === 'sm' ? ' talos-select--sm' : ''}`;
    select.replaceChildren(...props.options.map((opzione) => {
      const o = documentObj.createElement('option');
      const valore = typeof opzione === 'string' ? opzione : opzione.value;
      o.value = String(valore);
      o.textContent = String(typeof opzione === 'string' ? opzione : (opzione.label ?? opzione.value));
      if (props.value !== undefined && String(props.value) === String(valore)) o.selected = true;
      return o;
    }));
    if (props.value !== undefined) select.value = String(props.value);
    if (props.disabled) select.setAttribute('disabled', '');
    else select.removeAttribute('disabled');
    if (props.testId) wrap.dataset.testid = props.testId;
  }

  render();
  return {
    element: wrap,
    focus(options) { select.focus(options); },
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { select.removeEventListener('change', onChange); wrap.remove(); },
  };
});

import { defineComponent } from '../ui/component.js';

/*
 * StatusDot — lo stato codificato nella forma, non solo nel colore.
 *
 * Un pallino colorato da solo non e' leggibile da chi non distingue i colori e
 * non e' leggibile affatto da un lettore di schermo. Qui il tono guida il
 * colore; il NOME dello stato, quando serve, e' testo vero in uno
 * `<span class="sr-only">` — non un `aria-label`, che le traduzioni del
 * browser saltano (ricerca 04/09/2026, vedi `measure.js`).
 *
 * Senza `label` il pallino e' decorazione e sparisce alle tecnologie
 * assistive: l'informazione sta gia' nel testo accanto, e ripeterla e' rumore.
 */
const TONES = new Set(['neutral', 'success', 'warning', 'danger', 'live']);
const SIZES = new Set(['sm', 'md']);

export const createStatusDot = defineComponent('StatusDot', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const dot = documentObj.createElement('span');
  const nome = documentObj.createElement('span');
  nome.className = 'sr-only';
  dot.append(nome);

  let props = { tone: 'neutral', size: 'md', ...initialProps };

  function render() {
    if (!TONES.has(props.tone)) throw new TypeError(`tono pallino non valido: ${props.tone}`);
    if (!SIZES.has(props.size)) throw new TypeError(`dimensione pallino non valida: ${props.size}`);
    dot.className = `talos-dot talos-dot--${props.tone}${props.size === 'sm' ? ' talos-dot--sm' : ''}`;
    dot.dataset.tone = props.tone;
    nome.textContent = props.label ? String(props.label) : '';
    if (props.label) dot.removeAttribute('aria-hidden');
    else dot.setAttribute('aria-hidden', 'true');
    if (props.testId) dot.dataset.testid = props.testId;
  }

  render();
  return {
    element: dot,
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { dot.remove(); },
  };
});

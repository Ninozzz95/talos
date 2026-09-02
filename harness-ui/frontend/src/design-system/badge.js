import { defineComponent } from '../ui/component.js';

const TONES = new Set(['neutral', 'accent', 'success', 'warning', 'danger', 'info']);

export const createBadge = defineComponent('Badge', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const badge = documentObj.createElement('span');
  let props = { tone: 'neutral', live: false, ...initialProps };
  function render() {
    if (!TONES.has(props.tone)) throw new TypeError(`tono badge non valido: ${props.tone}`);
    badge.className = `talos-badge talos-badge--${props.tone}`;
    badge.textContent = String(props.label || '');
    badge.dataset.tone = props.tone;
    if (props.live) badge.setAttribute('role', 'status');
    else badge.removeAttribute('role');
    if (props.ariaLabel) badge.setAttribute('aria-label', props.ariaLabel);
    else badge.removeAttribute('aria-label');
    if (props.testId) badge.dataset.testid = props.testId;
  }
  render();
  return {
    element: badge,
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { badge.remove(); },
  };
});


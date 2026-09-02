import { defineComponent } from '../ui/component.js';

const VARIANTS = new Set(['primary', 'secondary', 'ghost', 'danger']);
const SIZES = new Set(['sm', 'md', 'lg']);

function normalize(props, iconOnly = false) {
  const next = { variant: 'secondary', size: 'md', disabled: false, ...props };
  if (!VARIANTS.has(next.variant)) throw new TypeError(`variante button non valida: ${next.variant}`);
  if (!SIZES.has(next.size)) throw new TypeError(`dimensione button non valida: ${next.size}`);
  if (iconOnly && !String(next.label || '').trim()) throw new TypeError('IconButton richiede un nome accessibile');
  return next;
}

function createButtonFactory(iconOnly) {
  return defineComponent(iconOnly ? 'IconButton' : 'Button', (initialProps = {}) => {
    const documentObj = initialProps.document || globalThis.document;
    if (!documentObj?.createElement) throw new TypeError('documento Button non disponibile');
    const button = documentObj.createElement('button');
    button.type = 'button';
    let props = normalize(initialProps, iconOnly);
    const onClick = (event) => {
      if (props.disabled) return;
      props.onPress?.(event);
    };
    button.addEventListener('click', onClick);

    function render() {
      button.className = `talos-button talos-button--${props.variant} talos-button--${props.size}${iconOnly ? ' talos-icon-button' : ''}`;
      button.disabled = Boolean(props.disabled);
      button.dataset.variant = props.variant;
      if (props.testId) button.dataset.testid = props.testId;
      else delete button.dataset.testid;
      if (props.describedBy) button.setAttribute('aria-describedby', props.describedBy);
      else button.removeAttribute('aria-describedby');
      if (iconOnly) {
        button.setAttribute('aria-label', props.label);
        button.replaceChildren(props.icon || '•');
      } else {
        button.removeAttribute('aria-label');
        button.textContent = String(props.label || '');
      }
    }
    render();
    return {
      element: button,
      update(nextProps = {}) { props = normalize({ ...props, ...nextProps }, iconOnly); render(); },
      destroy() { button.removeEventListener('click', onClick); button.remove(); },
      focus(options) { button.focus(options); },
    };
  });
}

export const createButton = createButtonFactory(false);
export const createIconButton = createButtonFactory(true);


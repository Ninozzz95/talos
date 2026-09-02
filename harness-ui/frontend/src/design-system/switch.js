import { defineComponent } from '../ui/component.js';

export const createSwitch = defineComponent('Switch', (initialProps = {}) => {
  const documentObj = initialProps.document || globalThis.document;
  const control = documentObj.createElement('button');
  control.type = 'button';
  control.className = 'talos-switch';
  control.setAttribute('role', 'switch');
  const thumb = documentObj.createElement('span');
  thumb.className = 'talos-switch__thumb';
  thumb.setAttribute('aria-hidden', 'true');
  control.append(thumb);
  let props = { checked: false, disabled: false, ...initialProps };
  const onClick = () => { if (!props.disabled) props.onChange?.(!props.checked); };
  control.addEventListener('click', onClick);
  function render() {
    if (!String(props.label || '').trim()) throw new TypeError('Switch richiede un nome accessibile stabile');
    control.setAttribute('aria-label', props.label);
    control.setAttribute('aria-checked', String(Boolean(props.checked)));
    control.disabled = Boolean(props.disabled);
    control.dataset.state = props.checked ? 'checked' : 'unchecked';
    if (props.testId) control.dataset.testid = props.testId;
  }
  render();
  return {
    element: control,
    update(nextProps = {}) { props = { ...props, ...nextProps }; render(); },
    destroy() { control.removeEventListener('click', onClick); control.remove(); },
    focus(options) { control.focus(options); },
  };
});


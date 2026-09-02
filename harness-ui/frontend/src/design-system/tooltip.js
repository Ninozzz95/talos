import { createFloatingPositioner } from './floating-position.js';

let tooltipSequence = 0;

export function createTooltip({ trigger, content, placement = 'top', delayMs = 260 }) {
  if (!trigger?.ownerDocument) throw new TypeError('trigger Tooltip non valido');
  const documentObj = trigger.ownerDocument;
  const root = documentObj.createElement('span');
  root.className = 'talos-tooltip-anchor';
  const tooltip = documentObj.createElement('span');
  tooltip.id = `talos-tooltip-${++tooltipSequence}`;
  tooltip.className = 'talos-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.textContent = String(content || '');
  tooltip.hidden = true;
  const previousDescription = trigger.getAttribute('aria-describedby');
  trigger.setAttribute('aria-describedby', [previousDescription, tooltip.id].filter(Boolean).join(' '));
  root.append(trigger, tooltip);
  const positioner = createFloatingPositioner({ reference: trigger, floating: tooltip, placement });
  let timer = null;
  let open = false;
  let destroyed = false;
  function clearTimer() { if (timer !== null) clearTimeout(timer); timer = null; }
  function show() {
    clearTimer();
    if (destroyed || open) return;
    timer = setTimeout(() => {
      timer = null;
      if (destroyed) return;
      open = true;
      tooltip.hidden = false;
      tooltip.dataset.state = 'open';
      positioner.start();
      void positioner.update();
    }, delayMs);
  }
  function hide() {
    clearTimer();
    if (!open) return;
    open = false;
    positioner.stop();
    tooltip.hidden = true;
    tooltip.dataset.state = 'closed';
  }
  const onKeyDown = (event) => { if (event.key === 'Escape') hide(); };
  trigger.addEventListener('focus', show);
  trigger.addEventListener('blur', hide);
  trigger.addEventListener('pointerenter', show);
  trigger.addEventListener('pointerleave', hide);
  documentObj.addEventListener('keydown', onKeyDown, true);
  return Object.freeze({
    element: root,
    open: show,
    close: hide,
    update(next = {}) { if ('content' in next) tooltip.textContent = String(next.content || ''); },
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      hide();
      positioner.destroy();
      trigger.removeEventListener('focus', show);
      trigger.removeEventListener('blur', hide);
      trigger.removeEventListener('pointerenter', show);
      trigger.removeEventListener('pointerleave', hide);
      documentObj.removeEventListener('keydown', onKeyDown, true);
      if (previousDescription) trigger.setAttribute('aria-describedby', previousDescription);
      else trigger.removeAttribute('aria-describedby');
      root.remove();
      return true;
    },
  });
}


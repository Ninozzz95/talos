export function createOverlayManager({ root, focusManager, announce = () => {}, inertExempt = () => false }) {
  if (!root || typeof root.append !== 'function') throw new TypeError('radice overlay non valida');
  if (typeof inertExempt !== 'function') throw new TypeError('inertExempt deve essere una funzione');
  const documentObj = root.ownerDocument || globalThis.document;
  const stack = [];
  const backgroundState = new WeakMap();
  let destroyed = false;

  const onKeyDown = (event) => {
    const current = stack.at(-1);
    if (!current) return;
    if (event.key === 'Escape' && current.closeOnEscape) {
      event.preventDefault();
      current.close('escape');
      return;
    }
    if (current.modal) focusManager.trap(event, current.element);
  };
  documentObj.addEventListener('keydown', onKeyDown, true);

  function syncInert() {
    const activeModal = [...stack].reverse().find((entry) => entry.modal);
    for (const child of root.children) {
      const suppressed = Boolean(activeModal && activeModal.layer !== child && !inertExempt(child));
      if (suppressed) {
        if (!backgroundState.has(child)) {
          backgroundState.set(child, {
            inert: child.inert,
            hasAriaHidden: child.hasAttribute('aria-hidden'),
            ariaHidden: child.getAttribute('aria-hidden'),
          });
        }
        child.inert = true;
        child.setAttribute('aria-hidden', 'true');
        continue;
      }
      const previous = backgroundState.get(child);
      if (!previous) continue;
      child.inert = previous.inert;
      if (previous.hasAriaHidden) child.setAttribute('aria-hidden', previous.ariaHidden);
      else child.removeAttribute('aria-hidden');
      backgroundState.delete(child);
    }
  }

  function open({ element, modal = true, invoker = documentObj.activeElement, closeOnEscape = true, initialFocus, onClose = () => {} }) {
    if (destroyed) throw new Error('overlay manager distrutto');
    if (!element || element.nodeType !== 1) throw new TypeError('elemento overlay non valido');
    const layer = documentObj.createElement('div');
    layer.className = modal ? 'overlay-layer overlay-layer--modal' : 'overlay-layer';
    layer.dataset.overlayLayer = '';
    layer.append(element);
    root.append(layer);
    let closed = false;
    const entry = {
      element, layer, modal, invoker, closeOnEscape,
      close(reason = 'programmatic') {
        if (closed) return false;
        if (stack.at(-1) !== entry) return false;
        closed = true;
        stack.pop();
        layer.remove();
        syncInert();
        const errors = [];
        try { onClose(reason); } catch (error) { errors.push(error); }
        try { focusManager.restore(invoker); } catch (error) { errors.push(error); }
        if (errors.length) throw new AggregateError(errors, 'Chiusura overlay non riuscita');
        return true;
      },
    };
    stack.push(entry);
    syncInert();
    focusManager.focusInitial(element, initialFocus);
    announce(element.getAttribute('aria-label') || element.textContent?.trim() || 'Dialogo aperto');
    return Object.freeze({ element, close: entry.close, focus: () => focusManager.focusInitial(element, initialFocus) });
  }

  return Object.freeze({
    open,
    closeTop(reason) { return stack.at(-1)?.close(reason) || false; },
    get size() { return stack.length; },
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      const errors = [];
      while (stack.length) {
        try { stack.at(-1).close('destroy'); } catch (error) { errors.push(error); }
      }
      try { documentObj.removeEventListener('keydown', onKeyDown, true); } catch (error) { errors.push(error); }
      if (errors.length) throw new AggregateError(errors, 'Distruzione overlay manager non riuscita');
      return true;
    },
  });
}

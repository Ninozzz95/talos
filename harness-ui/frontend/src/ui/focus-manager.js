const TABBABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isVisible(element) {
  if (!element || element.hidden || element.closest?.('[inert]')) return false;
  const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
  return !style || (style.display !== 'none' && style.visibility !== 'hidden');
}

export function createFocusManager(documentLike = globalThis.document) {
  if (!documentLike || typeof documentLike.querySelectorAll !== 'function' && !documentLike.createElement) throw new TypeError('documento focus non valido');
  const tabbable = (container) => [...container.querySelectorAll(TABBABLE_SELECTOR)].filter((element) => element.tabIndex >= 0 && isVisible(element));
  return Object.freeze({
    tabbable,
    capture() { return documentLike.activeElement || null; },
    restore(element) {
      if (!element || element.isConnected === false || typeof element.focus !== 'function') return false;
      element.focus({ preventScroll: true });
      return true;
    },
    focusInitial(container, preferred) {
      const target = preferred || container.querySelector?.('[autofocus]') || tabbable(container)[0] || container;
      if (typeof target?.focus !== 'function') return false;
      if (target === container && container.tabIndex < 0) container.tabIndex = -1;
      target.focus({ preventScroll: true });
      return true;
    },
    trap(event, container) {
      if (event.key !== 'Tab') return false;
      const candidates = tabbable(container);
      if (candidates.length === 0) {
        event.preventDefault();
        container.focus?.();
        return true;
      }
      const current = documentLike.activeElement;
      const index = candidates.indexOf(current);
      const nextIndex = event.shiftKey
        ? (index <= 0 ? candidates.length - 1 : index - 1)
        : (index < 0 || index === candidates.length - 1 ? 0 : index + 1);
      event.preventDefault();
      candidates[nextIndex].focus();
      return true;
    },
  });
}


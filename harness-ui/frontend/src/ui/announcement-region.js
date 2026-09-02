export function createAnnouncementRegion({ document: documentObj = globalThis.document, root }) {
  if (!documentObj || !root || typeof root.append !== 'function') throw new TypeError('radice annunci non valida');
  const polite = documentObj.createElement('div');
  polite.className = 'sr-only';
  polite.setAttribute('role', 'status');
  polite.setAttribute('aria-live', 'polite');
  polite.setAttribute('aria-atomic', 'true');
  const assertive = documentObj.createElement('div');
  assertive.className = 'sr-only';
  assertive.setAttribute('role', 'alert');
  assertive.setAttribute('aria-live', 'assertive');
  assertive.setAttribute('aria-atomic', 'true');
  root.append(polite, assertive);
  let last = '';
  let destroyed = false;
  return Object.freeze({
    owns(element) {
      return element === polite || element === assertive;
    },
    announce(message, { urgent = false } = {}) {
      if (destroyed) return false;
      const value = String(message || '').trim();
      if (!value || value === last) return false;
      last = value;
      (urgent ? assertive : polite).textContent = value;
      return true;
    },
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      polite.remove();
      assertive.remove();
      return true;
    },
  });
}

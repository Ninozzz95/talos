let sheetSequence = 0;

export function createSheet({ document: documentObj = globalThis.document, overlayManager, title, description = '', content, actions = [] }) {
  if (!overlayManager?.open) throw new TypeError('Sheet richiede overlayManager');
  const panel = documentObj.createElement('section');
  panel.className = 'talos-sheet';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  const id = `talos-sheet-${++sheetSequence}`;
  const heading = documentObj.createElement('h2');
  heading.id = `${id}-title`;
  heading.className = 'talos-sheet__title';
  heading.textContent = String(title || 'Dettagli');
  panel.setAttribute('aria-labelledby', heading.id);
  const close = documentObj.createElement('button');
  close.type = 'button';
  close.className = 'talos-button talos-button--ghost talos-button--sm talos-sheet__close';
  close.textContent = 'Chiudi';
  const header = documentObj.createElement('header');
  header.className = 'talos-sheet__header';
  header.append(heading, close);
  const body = documentObj.createElement('div');
  body.className = 'talos-sheet__body';
  if (description) {
    const copy = documentObj.createElement('p');
    copy.id = `${id}-description`;
    copy.className = 'talos-sheet__description';
    copy.textContent = description;
    panel.setAttribute('aria-describedby', copy.id);
    body.append(copy);
  }
  if (typeof content === 'string') body.append(content);
  else if (content) body.append(content);
  const footer = documentObj.createElement('footer');
  footer.className = 'talos-sheet__footer';
  footer.append(...actions);
  panel.append(header, body, footer);
  let current = null;
  let destroyed = false;
  const closeSheet = (reason = 'button') => current?.close(reason) || false;
  const onCloseButton = () => closeSheet('button');
  close.addEventListener('click', onCloseButton);
  return Object.freeze({
    element: panel,
    open(invoker) {
      if (destroyed) throw new Error('Sheet distrutto');
      if (current) return false;
      current = overlayManager.open({
        element: panel,
        invoker,
        initialFocus: close,
        onClose: () => { current = null; },
      });
      panel.parentElement?.classList.add('talos-sheet-layer');
      return true;
    },
    close: closeSheet,
    update(next = {}) {
      if ('title' in next) heading.textContent = String(next.title || 'Dettagli');
    },
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      if (current) closeSheet('destroy');
      close.removeEventListener('click', onCloseButton);
      panel.remove();
      return true;
    },
  });
}


import { createAnnouncementRegion } from '../../src/ui/announcement-region.js';
import { createFocusManager } from '../../src/ui/focus-manager.js';
import { createOverlayManager } from '../../src/ui/overlay-manager.js';

export function mountFocusOverlayLab(root) {
  const documentObj = root.ownerDocument;
  const surface = documentObj.createElement('section');
  surface.className = 'lab-surface';
  const eyebrow = documentObj.createElement('p');
  eyebrow.className = 'foundation-eyebrow';
  eyebrow.textContent = 'Fase 2 · focus e overlay';
  const heading = documentObj.createElement('h1');
  heading.textContent = 'Un dialogo che possiede davvero il focus';
  const copy = documentObj.createElement('p');
  copy.className = 'foundation-copy';
  copy.textContent = 'Tab resta nel dialogo, Escape chiude e il focus torna al pulsante di partenza.';
  const invoker = documentObj.createElement('button');
  invoker.className = 'lab-primary-button';
  invoker.type = 'button';
  invoker.textContent = 'Apri dialogo';
  surface.append(eyebrow, heading, copy, invoker);
  root.replaceChildren(surface);
  const announcements = createAnnouncementRegion({ document: documentObj, root });
  const focusManager = createFocusManager(documentObj);
  const overlays = createOverlayManager({
    root,
    focusManager,
    announce: (message) => announcements.announce(message),
    inertExempt: (element) => announcements.owns(element),
  });
  let current = null;
  const open = () => {
    const dialog = documentObj.createElement('section');
    dialog.className = 'lab-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'focus-dialog-title');
    const title = documentObj.createElement('h2');
    title.id = 'focus-dialog-title';
    title.textContent = 'Conferma operazione';
    const description = documentObj.createElement('p');
    description.textContent = 'Questa prova non modifica alcun dato.';
    const actions = documentObj.createElement('div');
    actions.className = 'lab-dialog-actions';
    const confirm = documentObj.createElement('button');
    confirm.type = 'button';
    confirm.textContent = 'Conferma';
    const cancel = documentObj.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Annulla';
    actions.append(confirm, cancel);
    dialog.append(title, description, actions);
    current = overlays.open({ element: dialog, invoker, initialFocus: confirm });
    confirm.addEventListener('click', () => current?.close('confirm'), { once: true });
    cancel.addEventListener('click', () => current?.close('cancel'), { once: true });
  };
  invoker.addEventListener('click', open);
  documentObj.documentElement.dataset.visualReady = 'true';
  return () => {
    invoker.removeEventListener('click', open);
    overlays.destroy();
    announcements.destroy();
    surface.remove();
  };
}

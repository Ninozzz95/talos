import { registeredOverlayManager } from '../design-system/overlays/manager.ts';
export function urlImmagineValida(url) { return typeof url === 'string' && /^\/api\/v1\/chat-images\/[a-f0-9]{64}$/.test(url); }

export function payloadImmagini(allegati = []) {
  return allegati.filter(a => a.tipo === 'immagine').map(a => {
    if (!/^[a-f0-9]{64}$/.test(a.id || '')) throw new Error('L’immagine non è stata caricata. Allegala di nuovo prima di inviare.');
    return { id: a.id };
  });
}

export function creaAnteprimaImmagine(image, { compatta = false, document: doc = globalThis.document, apiBase = '' } = {}) {
  if (!urlImmagineValida(image?.url)) return null;
  const card = doc.createElement('button');
  card.type = 'button';
  card.className = 'talos-image-card' + (compatta ? ' talos-image-card--compact' : '');
  card.setAttribute('aria-label', `Apri immagine: ${image.nome}`);
  const picture = doc.createElement('img');
  picture.src = apiBase + image.url;
  picture.alt = image.nome;
  picture.loading = 'lazy';
  const caption = doc.createElement('span');
  caption.className = 'talos-image-card__caption';
  caption.textContent = image.nome;
  card.append(picture, caption);
  card.addEventListener('click', () => {
    const dialog = doc.createElement('dialog');
    dialog.className = 'talos-image-viewer';
    dialog.setAttribute('aria-label', `Immagine: ${image.nome}`);
    const header = doc.createElement('div');
    header.className = 'talos-image-viewer__header';
    const title = doc.createElement('span');
    title.textContent = image.nome;
    const close = doc.createElement('button');
    close.type = 'button'; close.textContent = 'Chiudi';
    close.addEventListener('click', () => dialog.close());
    header.append(title, close);
    const large = doc.createElement('img');
    large.src = picture.src; large.alt = image.nome;
    dialog.append(header, large);
    const manager = registeredOverlayManager(doc);
    dialog.addEventListener('keydown', e => { if (e.key === 'Escape') e.stopPropagation(); });
    dialog.addEventListener('close', () => { manager?.deactivate(dialog); dialog.remove(); if (!manager) card.focus(); }, { once: true });
    doc.body.append(dialog); dialog.showModal();
    if (manager) manager.activate(dialog, { opener: card, initialFocus: close, requestClose: () => dialog.close() });
    else close.focus();
  });
  return card;
}

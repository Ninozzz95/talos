import { t } from './lingua.js';
import { registeredOverlayManager } from '../design-system/overlays/manager.ts';
export function urlImmagineValida(url) { return typeof url === 'string' && /^\/api\/v1\/chat-images\/[a-f0-9]{64}$/.test(url); }

export function payloadImmagini(allegati = []) {
  return allegati.filter(a => a.tipo === 'immagine').map(a => {
    if (!/^[a-f0-9]{64}$/.test(a.id || '')) throw new Error(t('chat.image.notUploaded'));
    return { id: a.id };
  });
}

export function creaAnteprimaImmagine(image, { compatta = false, document: doc = globalThis.document, apiBase = '' } = {}) {
  if (!urlImmagineValida(image?.url)) return null;
  const card = doc.createElement('button');
  card.type = 'button';
  card.className = 'talos-image-card' + (compatta ? ' talos-image-card--compact' : '');
  card.setAttribute('aria-label', t('chat.image.open', { nome: image.nome }));
  const picture = doc.createElement('img');
  picture.src = apiBase + image.url;
  picture.alt = image.nome;
  picture.loading = 'lazy';
  /* 27/10/2026 (view_image, ricerca dello stesso giorno: web.dev «Image performance», debugbear «Avoid large layout shifts»): le misure
     vere, quando si sanno, così il riquadro ha già la sua forma; la decodifica fuori dal filo principale. Dentro un pannello chiuso
     `loading="lazy"` scarica solo quando lo si apre. */
  picture.decoding = 'async';
  if (Number.isSafeInteger(image.larghezza) && image.larghezza > 0 && Number.isSafeInteger(image.altezza) && image.altezza > 0) {
    picture.width = image.larghezza;
    picture.height = image.altezza;
  }
  const caption = doc.createElement('span');
  caption.className = 'talos-image-card__caption';
  caption.textContent = image.nome;
  card.append(picture, caption);
  /* Come Hermes (`fallback-vision-image.test.tsx`, «says so when the image cannot be read instead of silently dropping the preview»): se
     l'immagine non arriva lo si dice nel riquadro, e il riquadro non apre una finestra vuota. */
  picture.addEventListener('error', () => {
    card.classList.add('talos-image-card--rotta');
    card.disabled = true;
    caption.textContent = t('chat.image.loadFailed', { nome: image.nome });
  }, { once: true });
  card.addEventListener('click', () => {
    const dialog = doc.createElement('dialog');
    dialog.className = 'talos-image-viewer';
    dialog.setAttribute('aria-label', t('chat.image.label', { nome: image.nome }));
    const header = doc.createElement('div');
    header.className = 'talos-image-viewer__header';
    const title = doc.createElement('span');
    title.textContent = image.nome;
    const close = doc.createElement('button');
    close.type = 'button'; close.textContent = t('chat.common.close');
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

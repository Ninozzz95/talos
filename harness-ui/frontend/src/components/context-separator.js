import { t, linguaCorrenteDiT } from './lingua.js';

function identity(event) {
  if (!event?.sessionId || !event.versionId || (event.state && event.state !== 'committed')) return null;
  return JSON.stringify([event.sessionId, event.versionId]);
}

/** Persistence belongs to the event/version archive. Replaying it reconstructs the separator. */
export function creaSeparatoreContesto(event, { document: doc = globalThis.document, onOpen } = {}) {
  const key = identity(event); if (!key) return null;
  const row = doc.createElement('div'); row.className = 'talos-context-separator';
  row.dataset.contextSeparator = key; row.dataset.contextVersion = event.versionId; row.dataset.contextSession = event.sessionId;
  row.setAttribute('role', 'group');
  const restored = event.kind?.includes('restor');
  const label = linguaCorrenteDiT() === 'en' ? (restored ? 'Context restored' : 'Context compacted') : t(restored ? 'Contesto ripristinato' : 'Contesto compattato');
  row.setAttribute('aria-label', label);
  const text = doc.createElement('span'); text.textContent = label; row.append(text);
  if (onOpen) { const button = doc.createElement('button'); button.type = 'button'; button.className = 'talos-button talos-button--ghost talos-button--sm'; button.textContent = linguaCorrenteDiT() === 'en' ? 'View context' : t('Vedi contesto'); button.addEventListener('click', () => onOpen(event)); row.append(button); }
  return row;
}

export function aggiornaSeparatoreContesto(container, events = [], { sessionId, ...options } = {}) {
  if (!container || !sessionId) return [];
  const current = new Map();
  for (const node of container.querySelectorAll('[data-context-separator]')) {
    if (node.dataset.contextSession !== sessionId) node.remove();
    else current.set(node.dataset.contextSeparator, node);
  }
  const nodes = [];
  for (const event of events) {
    if (event.sessionId !== sessionId) continue;
    const key = identity(event); if (!key) continue;
    let node = current.get(key);
    if (!node) { node = creaSeparatoreContesto(event, options); container.append(node); current.set(key, node); }
    if (!nodes.includes(node)) nodes.push(node);
  }
  return nodes;
}

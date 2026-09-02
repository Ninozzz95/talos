import { createVirtualList } from '../../src/ui/virtual-list.js';

export function mountVirtualListLab(root) {
  const documentObj = root.ownerDocument;
  const surface = documentObj.createElement('section');
  surface.className = 'lab-surface';
  const eyebrow = documentObj.createElement('p');
  eyebrow.className = 'foundation-eyebrow';
  eyebrow.textContent = 'Fase 2 · lista misurata';
  const heading = documentObj.createElement('h1');
  heading.textContent = 'Diecimila elementi, soltanto quelli visibili';
  const copy = documentObj.createElement('p');
  copy.className = 'foundation-copy';
  copy.textContent = 'Il DOM resta limitato mentre la lista conserva identità e posizione.';
  const listRoot = documentObj.createElement('div');
  listRoot.dataset.component = 'VirtualList';
  listRoot.className = 'virtual-list-lab';
  surface.append(eyebrow, heading, copy, listRoot);
  root.replaceChildren(surface);
  const items = Array.from({ length: 10_000 }, (_, index) => ({ id: `item-${index}`, label: `Item ${index}` }));
  const list = createVirtualList({
    container: listRoot,
    items,
    estimateHeight: 46,
    overscan: 6,
    key: (item) => item.id,
    renderItem(item) {
      const row = documentObj.createElement('div');
      row.className = 'virtual-row-card';
      row.textContent = item.label;
      return row;
    },
  });
  documentObj.documentElement.dataset.visualReady = 'true';
  return () => { list.destroy(); surface.remove(); };
}


import {
  Virtualizer,
  elementScroll,
  measureElement,
  observeElementOffset,
  observeElementRect,
} from '@tanstack/virtual-core';

function normalizeMounted(value, documentObj) {
  if (value?.element?.nodeType === 1) return value;
  if (value?.nodeType === 1) return { element: value, update() {}, destroy() {} };
  const fallback = documentObj.createElement('span');
  fallback.textContent = String(value ?? '');
  return { element: fallback, update() {}, destroy() {} };
}

export function createVirtualList({
  container,
  items = [],
  estimateHeight = 48,
  overscan = 6,
  key = (item, index) => item?.id ?? index,
  renderItem,
  anchorTo = 'start',
} = {}) {
  if (!container || typeof container.append !== 'function') throw new TypeError('contenitore virtuale non valido');
  if (!Array.isArray(items)) throw new TypeError('items virtuali non validi');
  if (typeof renderItem !== 'function') throw new TypeError('renderItem obbligatorio');
  const documentObj = container.ownerDocument || globalThis.document;
  const scroll = documentObj.createElement('div');
  scroll.dataset.virtualScroll = '';
  scroll.tabIndex = 0;
  const content = documentObj.createElement('div');
  content.dataset.virtualContent = '';
  scroll.append(content);
  container.append(scroll);

  let currentItems = items;
  let records = new Map();
  let frame = 0;
  let disposed = false;
  const requestFrame = documentObj.defaultView?.requestAnimationFrame?.bind(documentObj.defaultView) || globalThis.requestAnimationFrame?.bind(globalThis);
  const cancelFrame = documentObj.defaultView?.cancelAnimationFrame?.bind(documentObj.defaultView) || globalThis.cancelAnimationFrame?.bind(globalThis);

  const virtualizer = new Virtualizer({
    count: currentItems.length,
    getScrollElement: () => scroll,
    estimateSize: () => estimateHeight,
    getItemKey: (index) => key(currentItems[index], index),
    overscan,
    anchorTo,
    observeElementRect,
    observeElementOffset,
    scrollToFn: elementScroll,
    measureElement,
    initialRect: { width: scroll.clientWidth || 800, height: scroll.clientHeight || 420 },
    onChange: () => scheduleRender(),
  });

  function destroyRecord(record) {
    record.mounted.destroy?.();
    record.row.remove();
  }

  function render() {
    frame = 0;
    if (disposed) return;
    content.style.height = `${virtualizer.getTotalSize()}px`;
    const next = new Map();
    for (const virtualItem of virtualizer.getVirtualItems()) {
      const item = currentItems[virtualItem.index];
      const itemKey = virtualItem.key;
      let record = records.get(itemKey);
      if (!record) {
        const row = documentObj.createElement('div');
        row.dataset.virtualRow = '';
        row.style.position = 'absolute';
        row.style.left = '0';
        row.style.top = '0';
        row.style.width = '100%';
        const mounted = normalizeMounted(renderItem(item, virtualItem.index), documentObj);
        row.append(mounted.element);
        record = { row, mounted };
      } else {
        record.mounted.update?.(item, virtualItem.index);
      }
      record.row.dataset.index = String(virtualItem.index);
      record.row.style.transform = `translateY(${virtualItem.start}px)`;
      content.append(record.row);
      virtualizer.measureElement(record.row);
      next.set(itemKey, record);
    }
    for (const [itemKey, record] of records) {
      if (!next.has(itemKey)) destroyRecord(record);
    }
    records = next;
  }

  function scheduleRender() {
    if (disposed || frame) return;
    if (requestFrame) frame = requestFrame(render);
    else render();
  }

  const unmountVirtualizer = virtualizer._didMount();
  virtualizer._willUpdate();
  render();

  return Object.freeze({
    element: container,
    scrollElement: scroll,
    virtualizer,
    update(next) {
      if (disposed) return;
      currentItems = Array.isArray(next) ? next : next?.items;
      if (!Array.isArray(currentItems)) throw new TypeError('items virtuali non validi');
      virtualizer.setOptions({ ...virtualizer.options, count: currentItems.length, getItemKey: (index) => key(currentItems[index], index) });
      virtualizer._willUpdate();
      scheduleRender();
    },
    focus(options) { scroll.focus(options); },
    destroy() {
      if (disposed) return false;
      disposed = true;
      if (frame && cancelFrame) cancelFrame(frame);
      frame = 0;
      unmountVirtualizer();
      for (const record of records.values()) destroyRecord(record);
      records.clear();
      scroll.remove();
      return true;
    },
  });
}


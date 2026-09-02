export function reconcileKeys(previous, items, key, create, destroy, update = () => {}) {
  if (!(previous instanceof Map)) throw new TypeError('mappa keyed non valida');
  if (!Array.isArray(items)) throw new TypeError('items deve essere un array');
  const next = new Map();
  items.forEach((item, index) => {
    const itemKey = key(item, index);
    if (next.has(itemKey)) throw new TypeError(`chiave duplicata: ${String(itemKey)}`);
    const record = previous.get(itemKey) || create(item, index, itemKey);
    if (previous.has(itemKey)) update(record, item, index, itemKey);
    next.set(itemKey, record);
  });
  for (const [itemKey, record] of previous) {
    if (!next.has(itemKey)) destroy(record, itemKey);
  }
  return next;
}

export function createKeyedList({ container, key, create, update = (record, item) => record.update?.(item), destroy = (record) => record.destroy?.() }) {
  if (!container || typeof container.append !== 'function') throw new TypeError('contenitore keyed non valido');
  let records = new Map();
  let disposed = false;
  return Object.freeze({
    update(items) {
      if (disposed) return;
      records = reconcileKeys(records, items, key, create, destroy, update);
      for (const record of records.values()) {
        if (!record?.element) throw new TypeError('record keyed senza elemento');
        container.append(record.element);
      }
    },
    destroy() {
      if (disposed) return false;
      disposed = true;
      for (const record of records.values()) destroy(record);
      records.clear();
      return true;
    },
  });
}


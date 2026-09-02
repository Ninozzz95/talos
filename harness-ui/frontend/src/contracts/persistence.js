export const TALOS_STORAGE_KEYS = Object.freeze({
  modalSizes: 'talos-harness-modal-sizes-v1',
  panelWidths: 'talos-harness-panel-widths',
  settingsSection: 'talos.harness.desktop.settings.section.v1',
  settings: 'talos.harness.desktop.settings.v1',
});
const ALLOWED_KEYS = new Set(Object.values(TALOS_STORAGE_KEYS));

function assertKey(key) {
  if (!ALLOWED_KEYS.has(key)) throw new TypeError('Chiave di persistenza non consentita');
}

export function createPersistence({ storage = globalThis.localStorage } = {}) {
  if (!storage) throw new TypeError('Storage non disponibile');
  return Object.freeze({
    read(key, fallback = null) {
      assertKey(key);
      const value = storage.getItem(key);
      if (value === null) return fallback;
      try { return JSON.parse(value); } catch { storage.removeItem(key); return fallback; }
    },
    write(key, value) {
      assertKey(key);
      storage.setItem(key, JSON.stringify(value));
      return value;
    },
    remove(key) { assertKey(key); storage.removeItem(key); },
  });
}

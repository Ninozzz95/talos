/** K03: JSON preference storage, never keyring. Reads do not erase corrupt data. */
export interface PreferenceStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; }
export type PreferenceRead =
  | { readonly kind: 'ready'; readonly value: unknown }
  | { readonly kind: 'missing' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'unavailable' };
export type PreferenceWrite = { readonly kind: 'saved' } | { readonly kind: 'unavailable' } | { readonly kind: 'invalid' };
export function createPreferences({ storage, allowedKeys }: { storage: () => PreferenceStorage | null; allowedKeys: readonly string[] }) {
  const allowed = new Set(allowedKeys);
  const check = (key: string) => { if (!allowed.has(key)) throw new TypeError('Chiave di preferenza non autorizzata'); };
  return Object.freeze({
    read(key: string): PreferenceRead {
      check(key);
      let raw: string | null;
      try { const port = storage(); if (!port) return { kind: 'unavailable' }; raw = port.getItem(key); }
      catch { return { kind: 'unavailable' }; }
      if (raw === null) return { kind: 'missing' };
      try { return { kind: 'ready', value: JSON.parse(raw) }; }
      catch { return { kind: 'invalid' }; }
    },
    write(key: string, value: unknown): PreferenceWrite {
      check(key);
      let raw: string | undefined;
      try { raw = JSON.stringify(value); } catch { return { kind: 'invalid' }; }
      if (raw === undefined) return { kind: 'invalid' };
      try { const port = storage(); if (!port) return { kind: 'unavailable' }; port.setItem(key, raw); return { kind: 'saved' }; }
      catch { return { kind: 'unavailable' }; }
    },
    remove(key: string): PreferenceWrite {
      check(key);
      try { const port = storage(); if (!port) return { kind: 'unavailable' }; port.removeItem(key); return { kind: 'saved' }; }
      catch { return { kind: 'unavailable' }; }
    },
  });
}

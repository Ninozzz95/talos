/** CORE-04: additive, observable preferences. Content and credentials are never migrated here. */
export const WORKSPACE_PREFERENCES_KEY = 'talos.desktop.workspace.v2';
/*
 * ⛔ 18/09/2026 — LA «DISPOSIZIONE DEL WORKSPACE» (i preset) È STATA ELIMINATA. Ordine dell'owner
 * («eliminalo»), dopo che il suo unico comando a schermo era uscito con la barra della workspace.
 * Via: `PRESETS`, il tipo `Preset`, il campo `presets` del record, `isPreset`, `presetFor`,
 * `setPreset`, gli elenchi in `features/navigation/presets.ts` (file cancellato) e le due regole
 * CSS che leggevano `data-workspace-preset`.
 * ⛔ Un `presets` già salvato nei profili esistenti non si legge più e **sparisce da solo alla prima
 * scrittura** (il record viene ricomposto senza quel campo): nessun bump di versione, che avrebbe
 * fatto leggere il profilo come «di una versione futura» alle build precedenti e bloccato le
 * modifiche (ricerca 18/09/2026: «migrare prima, cancellare dopo», e «una chiave mancante non deve
 * sembrare un ritorno ai valori di serie» — preferences.live «Migrating Legacy User Preferences»;
 * Mozilla XULStore D248884, che scarta gli attributi non più usati).
 */
export type Density = 'comfortable' | 'compact';
export type PersistenceProblem = 'unavailable' | 'recovery-required' | 'future-version' | 'recovery-full' | 'write-failed' | null;
export interface WorkspacePreferences {
  version: 2; density: Density; restoreWorkspace: boolean; lastSession: string | null;
}
export interface PreferenceStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const validId = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 2048
  && !v.includes('\0') && !['__proto__', 'constructor', 'prototype'].includes(v);
export function normalizeWorkspacePreferences(raw: unknown): WorkspacePreferences {
  /* ⛔ 18/09/2026 — il record non porta più `presets`: un profilo che lo ha ancora viene letto senza
     quel campo e riscritto senza alla prima modifica (vedi il blocco in testa al file). */
  const defaults: WorkspacePreferences = { version: 2, density: 'comfortable', restoreWorkspace: true, lastSession: null };
  if (!record(raw) || raw.version !== 2) return defaults;
  return { ...defaults, density: raw.density === 'compact' ? 'compact' : 'comfortable', restoreWorkspace: raw.restoreWorkspace !== false,
    lastSession: validId(raw.lastSession) ? raw.lastSession : null };
}
/*
 * ⛔ 18/09/2026 — E QUI C'ERA `workspacePreferenceKey`, USCITA CON I PRESET.
 * Serviva a una cosa sola: dare ai preset una chiave per workspace o per sessione. Con la funzione
 * dei preset eliminata, nessuno la chiama più — e in questo progetto «una funzione coi test e
 * nessun chiamante» è un difetto già trovato e curato una volta (la voce omonima in memoria), non
 * una cosa da lasciare in piedi «per sicurezza». La sua prova è uscita con lei.
 */
function inspect(raw: string | null): { kind: 'missing' | 'supported' | 'future' | 'corrupt'; value?: unknown } {
  if (raw === null) return { kind: 'missing' };
  try {
    const value: unknown = JSON.parse(raw);
    if (record(value) && typeof value.version === 'number' && value.version > 2) return { kind: 'future' };
    return record(value) && value.version === 2 ? { kind: 'supported', value } : { kind: 'corrupt' };
  } catch { return { kind: 'corrupt' }; }
}
export function createWorkspacePreferences(getStorage: () => PreferenceStorage | undefined = () => globalThis.localStorage) {
  let state = normalizeWorkspacePreferences(null);
  let problem: PersistenceProblem = null;
  let lastRaw: string | null = null;
  let mayAdoptLegacyDensity = false;
  const listeners = new Set<() => void>();
  try {
    const storage = getStorage();
    if (!storage) problem = 'unavailable';
    else {
      lastRaw = storage.getItem(WORKSPACE_PREFERENCES_KEY);
      const existing = inspect(lastRaw);
      mayAdoptLegacyDensity = existing.kind === 'missing';
      if (existing.kind === 'supported') state = normalizeWorkspacePreferences(existing.value);
      if (existing.kind === 'future') problem = 'future-version';
      if (existing.kind === 'corrupt') problem = 'recovery-required';
    }
  } catch { problem = 'unavailable'; }
  const notify = () => { for (const listener of [...listeners]) { try { listener(); } catch { /* Other consumers must still synchronize. */ } } };
  function update(patch: Partial<Omit<WorkspacePreferences, 'version'>> | ((latest: WorkspacePreferences) => Partial<Omit<WorkspacePreferences, 'version'>>)): WorkspacePreferences {
    let storage: PreferenceStorage | undefined;
    let stored: string | null = null;
    let writable = false;
    try {
      storage = getStorage();
      if (!storage) problem = 'unavailable';
      else {
        stored = storage.getItem(WORKSPACE_PREFERENCES_KEY);
        const current = inspect(stored);
        if (current.kind === 'future') problem = 'future-version';
        else {
          if (stored !== lastRaw && current.kind === 'supported') state = normalizeWorkspacePreferences(current.value);
          writable = true;
          if (current.kind === 'corrupt') {
            // Preserve the exact bytes before replacement; bounded recovery slots never overwrite old backups.
            writable = false;
            for (let i = 0; i < 8; i++) {
              const key = `${WORKSPACE_PREFERENCES_KEY}.recovery.${i}`;
              const previous = storage.getItem(key);
              if (previous === stored) { writable = true; break; }
              if (previous === null) { storage.setItem(key, stored!); writable = true; break; }
            }
            if (!writable) problem = 'recovery-full';
          }
        }
      }
    } catch { problem = 'unavailable'; writable = false; }
    state = normalizeWorkspacePreferences({ ...state, ...(typeof patch === 'function' ? patch(structuredClone(state)) : patch), version: 2 });
    mayAdoptLegacyDensity = false;
    if (storage && writable) {
      try { const next = JSON.stringify(state); storage.setItem(WORKSPACE_PREFERENCES_KEY, next); lastRaw = next; problem = null; }
      catch { problem = 'write-failed'; }
    }
    notify(); return structuredClone(state);
  }
  return {
    read: (): WorkspacePreferences => structuredClone(state),
    get persistent(): boolean { return problem === null; },
    get persistenceProblem(): PersistenceProblem { return problem; },
    subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
    update,
    adoptLegacyDensity(value: unknown): void {
      if (!mayAdoptLegacyDensity || !['comoda', 'compatta'].includes(String(value))) return;
      state.density = value === 'compatta' ? 'compact' : 'comfortable'; mayAdoptLegacyDensity = false;
      // Only visual preference in memory; no writes or synthetic migration-complete marker at startup.
    },
  };
}

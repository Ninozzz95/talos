/** CORE-04: additive, observable preferences. Content and credentials are never migrated here. */
export const WORKSPACE_PREFERENCES_KEY = 'talos.desktop.workspace.v2';
export const PRESETS = ['development', 'research', 'documents', 'focus'] as const;
export type Preset = typeof PRESETS[number];
export type Density = 'comfortable' | 'compact';
export type PersistenceProblem = 'unavailable' | 'recovery-required' | 'future-version' | 'recovery-full' | 'write-failed' | null;
export interface WorkspacePreferences {
  version: 2; density: Density; restoreWorkspace: boolean; lastSession: string | null; presets: Record<string, Preset>;
}
export interface PreferenceStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
export const isPreset = (v: unknown): v is Preset => typeof v === 'string' && (PRESETS as readonly string[]).includes(v);
const validId = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 2048
  && !v.includes('\0') && !['__proto__', 'constructor', 'prototype'].includes(v);
export function normalizeWorkspacePreferences(raw: unknown): WorkspacePreferences {
  const defaults: WorkspacePreferences = { version: 2, density: 'comfortable', restoreWorkspace: true, lastSession: null, presets: {} };
  if (!record(raw) || raw.version !== 2) return defaults;
  const presets: Record<string, Preset> = {};
  if (record(raw.presets)) for (const [key, value] of Object.entries(raw.presets).slice(-64))
    if (validId(key) && isPreset(value)) presets[key] = value;
  return { ...defaults, density: raw.density === 'compact' ? 'compact' : 'comfortable', restoreWorkspace: raw.restoreWorkspace !== false,
    lastSession: validId(raw.lastSession) ? raw.lastSession : null, presets };
}
/** Use the real workspace path when known. Unknown paths do not conflate distinct sessions. */
export function workspacePreferenceKey(path: unknown, sessionId: unknown): string {
  if (validId(path)) {
    const normalized = /^[a-z]:[\\/]/i.test(path) || path.startsWith('\\\\')
      ? path.replace(/\//g, '\\').replace(/^([a-z]):/i, (_, drive: string) => `${drive.toUpperCase()}:`).replace(/\\+$/, '') : path.replace(/\/+$/, '') || '/';
    return `workspace:${normalized}`;
  }
  return validId(sessionId) ? `session:${sessionId}` : 'global';
}
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
    presetFor(key: string, fallbackKeys: readonly string[] = []): Preset {
      for (const candidate of [key, ...fallbackKeys, 'global'])
        if (Object.hasOwn(state.presets, candidate) && isPreset(state.presets[candidate])) return state.presets[candidate];
      return 'development';
    },
    setPreset(key: string, preset: Preset): void {
      if (!validId(key) || !isPreset(preset)) return;
      update(latest => ({ presets: Object.fromEntries([...Object.entries(latest.presets).filter(([k]) => k !== key).slice(-63), [key, preset]]) }));
    },
  };
}

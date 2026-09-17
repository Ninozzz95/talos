/** CORE-04: additive preferences. Never overwrites legacy settings, content or credentials. */
export const WORKSPACE_PREFERENCES_KEY = 'talos.desktop.workspace.v2';
export const PRESETS = ['development', 'research', 'documents', 'focus'] as const;
export type Preset = typeof PRESETS[number];
export type Density = 'comfortable' | 'compact';
export interface WorkspacePreferences {
  version: 2;
  density: Density;
  restoreWorkspace: boolean;
  lastSession: string | null;
  presets: Record<string, Preset>;
}
export interface PreferenceStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
export const isPreset = (v: unknown): v is Preset => typeof v === 'string' && (PRESETS as readonly string[]).includes(v);
const validId = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 2048 && !v.includes('\0') && !['__proto__', 'constructor', 'prototype'].includes(v);
export function normalizeWorkspacePreferences(raw: unknown): WorkspacePreferences {
  const defaults: WorkspacePreferences = { version: 2, density: 'comfortable', restoreWorkspace: true, lastSession: null, presets: {} };
  if (!record(raw) || raw.version !== 2) return defaults;
  const presets: Record<string, Preset> = {};
  if (record(raw.presets)) {
    for (const [key, value] of Object.entries(raw.presets).slice(-64)) if (validId(key) && isPreset(value)) presets[key] = value;
  }
  return { ...defaults, density: raw.density === 'compact' ? 'compact' : 'comfortable', restoreWorkspace: raw.restoreWorkspace !== false,
    lastSession: validId(raw.lastSession) ? raw.lastSession : null, presets };
}
export function createWorkspacePreferences(getStorage: () => PreferenceStorage | undefined = () => globalThis.localStorage) {
  let state = normalizeWorkspacePreferences(null);
  let persistent = true;
  try { const storage = getStorage(); persistent = Boolean(storage); const raw = storage?.getItem(WORKSPACE_PREFERENCES_KEY); if (raw) state = normalizeWorkspacePreferences(JSON.parse(raw)); }
  catch { persistent = false; }
  return {
    read: (): WorkspacePreferences => structuredClone(state),
    get persistent(): boolean { return persistent; },
    update(patch: Partial<Omit<WorkspacePreferences, 'version'>>): WorkspacePreferences {
      state = normalizeWorkspacePreferences({ ...state, ...patch, version: 2 });
      try { const storage = getStorage(); if (!storage) persistent = false; else { storage.setItem(WORKSPACE_PREFERENCES_KEY, JSON.stringify(state)); persistent = true; } }
      catch { persistent = false; }
      return structuredClone(state);
    },
    presetFor(key: string): Preset { return state.presets[key] || 'development'; },
    setPreset(key: string, preset: Preset): void {
      if (!validId(key) || !isPreset(preset)) return;
      const entries = Object.entries(state.presets).filter(([k]) => k !== key).slice(-63);
      this.update({ presets: Object.fromEntries([...entries, [key, preset]]) });
    },
  };
}

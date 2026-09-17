/**
 * BOOT-03 / D21. Pure startup decision, used by the actual application adapter.
 * Non legge storage, non invia richieste e non concede permessi. The adapter validates availability before applying the decision.
 * Gli identificativi vengono verificati sintatticamente; esistenza e autorizzazione
 * del workspace devono essere già accertate dal servizio che prepara lo snapshot.
 */
export type Target =
  | { readonly kind: 'home' }
  | { readonly kind: 'workspace'; readonly id: string }
  | { readonly kind: 'session'; readonly workspaceId: string; readonly id: string }
  | { readonly kind: 'settings'; readonly section: 'providers' | 'appearance' | 'permissions' }
  | { readonly kind: 'doctor' };

export type Availability =
  | { readonly status: 'available'; readonly target: unknown }
  | { readonly status: 'missing' | 'unavailable' };

export interface StartupInput {
  readonly mode: 'standalone' | 'embedded';
  readonly currentNavigation?: unknown;
  readonly explicitLaunch?: Availability;
  readonly lastWorkspace?: Availability;
  readonly restoreWorkspace: boolean;
}

export type StartupDecision =
  | { readonly action: 'delegate-to-host'; readonly sideEffects: readonly [] }
  | {
      readonly action: 'navigate';
      readonly target: Target;
      readonly reason: 'user-navigation' | 'explicit-launch' | 'restore-workspace' | 'home' | 'launch-unavailable';
      readonly notice: 'destination-unavailable' | null;
      readonly sideEffects: readonly [];
    };

const id = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 2048 && !value.includes('\0');
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Copia soltanto i campi del contratto; non propaga flag di esecuzione o consenso. */
export function normalizeTarget(value: unknown): Target | null {
  if (!object(value)) return null;
  switch (value.kind) {
    case 'home': return { kind: 'home' };
    case 'doctor': return { kind: 'doctor' };
    case 'workspace': return id(value.id) ? { kind: 'workspace', id: value.id } : null;
    case 'session': return id(value.id) && id(value.workspaceId)
      ? { kind: 'session', id: value.id, workspaceId: value.workspaceId } : null;
    case 'settings': return value.section === 'providers' || value.section === 'appearance' || value.section === 'permissions'
      ? { kind: 'settings', section: value.section } : null;
    default: return null;
  }
}

export function decideStartup(input: StartupInput): StartupDecision {
  if (input.mode === 'embedded') return { action: 'delegate-to-host', sideEffects: [] };
  const current = normalizeTarget(input.currentNavigation);
  if (current) return { action: 'navigate', target: current, reason: 'user-navigation', notice: null, sideEffects: [] };

  // Una destinazione esplicita non disponibile non viene sostituita silenziosamente
  // con un altro progetto: la home ne mostra il motivo senza aprire un wizard.
  if (input.explicitLaunch) {
    const explicit = input.explicitLaunch.status === 'available'
      ? normalizeTarget(input.explicitLaunch.target) : null;
    return explicit
      ? { action: 'navigate', target: explicit, reason: 'explicit-launch', notice: null, sideEffects: [] }
      : { action: 'navigate', target: { kind: 'home' }, reason: 'launch-unavailable', notice: 'destination-unavailable', sideEffects: [] };
  }

  const previous = input.restoreWorkspace && input.lastWorkspace?.status === 'available'
    ? normalizeTarget(input.lastWorkspace.target) : null;
  if (previous?.kind === 'workspace') {
    return { action: 'navigate', target: previous, reason: 'restore-workspace', notice: null, sideEffects: [] };
  }
  return { action: 'navigate', target: { kind: 'home' }, reason: 'home', notice: null, sideEffects: [] };
}

/** Il caller incrementa navigationRevision a OGNI navigazione intenzionale. */
export function shouldCommitStartup(issuedRevision: number, currentRevision: number, disposed: boolean): boolean {
  return !disposed && Number.isSafeInteger(issuedRevision) && issuedRevision >= 0
    && Number.isSafeInteger(currentRevision) && currentRevision === issuedRevision;
}

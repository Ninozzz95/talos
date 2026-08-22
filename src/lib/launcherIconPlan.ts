/**
 * Pure decision for the per-theme Android launcher icon (owner 2026-07-24).
 *
 * Switching the launcher alias needs a process restart, so we never apply it
 * silently — this resolver decides *whether to prompt* from state alone, keeping
 * the side-effecting store/native bridge trivially testable around it.
 */
export interface LauncherIconState {
    /** The opt-in Appearance toggle (shell.launcher_icon_follows_theme). */
    featureEnabled: boolean
    /** Running on a native platform — no launcher aliases exist on web. */
    native: boolean
    /** The active in-app theme preset id. */
    themePreset: string
    /** The theme id the currently-enabled launcher alias represents. */
    appliedPreset: string
}

export type LauncherIconPlan =
    | { kind: 'idle' }
    | { kind: 'prompt'; target: string }

export function resolveLauncherIconPlan(state: LauncherIconState): LauncherIconPlan {
    if (!state.native || !state.featureEnabled) return { kind: 'idle' }
    if (state.themePreset === state.appliedPreset) return { kind: 'idle' }
    return { kind: 'prompt', target: state.themePreset }
}

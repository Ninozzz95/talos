/**
 * System-Back navigation model (owner 2026-07-24). The sidebar is the MAIN MENU:
 * stations and the Settings Center are opened FROM it, so hardware Back at a
 * station top must return to the sidebar — not close everything to chat. Back
 * walks the stack top-down: the account wizard, then the sidebar drawer, then a
 * Settings sub-view (one level), then a station top (→ back to the sidebar),
 * then the chat base (browser history / app exit).
 *
 * Pure resolver: the native Back handler isn't triggerable in the web/e2e
 * harness, so the DECISION lives here where it can be unit-tested; App.vue only
 * maps each action to its effect.
 */
export type TalosBackAction =
    | 'dismiss-wizard'
    | 'close-sidebar'
    | 'sheet-subview-back'
    | 'station-to-sidebar'
    | 'history'
    | 'exit'

export interface TalosBackState {
    wizardOpen: boolean
    sidebarOpen: boolean
    hasSheetSubView: boolean
    isStation: boolean
    canGoBack: boolean
}

export function resolveTalosBackAction(state: TalosBackState): TalosBackAction {
    if (state.wizardOpen) return 'dismiss-wizard'
    if (state.sidebarOpen) return 'close-sidebar'
    if (state.hasSheetSubView) return 'sheet-subview-back'
    if (state.isStation) return 'station-to-sidebar'
    return state.canGoBack ? 'history' : 'exit'
}

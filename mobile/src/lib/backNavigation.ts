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
    | 'close-overlay'
    | 'dismiss-wizard'
    | 'close-sidebar'
    | 'sheet-subview-back'
    | 'station-subpage-parent'
    | 'station-to-sidebar'
    | 'history'
    | 'exit'

export interface TalosBackState {
    /** A composer bottom-sheet / drawer (the "+" tool drawer, model/effort,
     *  enhancer) is open — the TOP-most overlay, closed first. */
    composerOverlayOpen: boolean
    wizardOpen: boolean
    sidebarOpen: boolean
    hasSheetSubView: boolean
    /**
     * The current ROUTE is a page inside a station — a report, a claim, a source
     * — rather than the station's own top. Checked before `isStation`, which is
     * true for both.
     */
    isStationSubPage: boolean
    isStation: boolean
    canGoBack: boolean
}

export function resolveTalosBackAction(state: TalosBackState): TalosBackAction {
    if (state.composerOverlayOpen) return 'close-overlay'
    if (state.wizardOpen) return 'dismiss-wizard'
    if (state.sidebarOpen) return 'close-sidebar'
    if (state.hasSheetSubView) return 'sheet-subview-back'
    /**
     * Inside a station, Back is TEMPORAL: it undoes the last move, it does not
     * climb a tree. Android has separate ideas for these and the hardware
     * button is the temporal one — so a person who reached a claim FROM a
     * source page goes back to that source, not to the report the hierarchy
     * would name.
     *
     * The declared parent is the safety net, not the rule: with no in-app
     * history there is nothing to undo — a link opened cold, or a page reached
     * by `replace` after starting a research — and popping the platform stack
     * there would leave the app instead of going up one level.
     */
    if (state.isStationSubPage) return state.canGoBack ? 'history' : 'station-subpage-parent'
    if (state.isStation) return 'station-to-sidebar'
    return state.canGoBack ? 'history' : 'exit'
}

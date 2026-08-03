import { describe, expect, it } from 'vitest'
import { resolveTalosBackAction, type TalosBackState } from '@/lib/backNavigation'

// Owner 2026-07-24: the sidebar is the MAIN MENU — stations/Settings are opened
// from it, so system Back at a station top must return to the sidebar, not jump
// to chat. Back walks the stack: wizard → sidebar → sheet sub-view → station →
// history/exit. Pure resolver so the (native-only) Back decision is testable.
function state(patch: Partial<TalosBackState> = {}): TalosBackState {
    return { composerOverlayOpen: false, wizardOpen: false, sidebarOpen: false, hasSheetSubView: false, isStationSubPage: false, isStation: false, canGoBack: false, ...patch }
}

describe('resolveTalosBackAction', () => {
    it('closes a composer overlay/drawer FIRST (top-most; owner: back must not exit the app)', () => {
        expect(resolveTalosBackAction(state({ composerOverlayOpen: true, wizardOpen: true, isStation: true }))).toBe('close-overlay')
    })

    it('dismisses the wizard next (top-most surface below overlays)', () => {
        expect(resolveTalosBackAction(state({ wizardOpen: true, sidebarOpen: true, isStation: true }))).toBe('dismiss-wizard')
    })

    it('closes an open sidebar before anything else below it', () => {
        expect(resolveTalosBackAction(state({ sidebarOpen: true, isStation: true }))).toBe('close-sidebar')
    })

    it('walks a settings sub-view up one level before leaving the station', () => {
        expect(resolveTalosBackAction(state({ hasSheetSubView: true, isStation: true }))).toBe('sheet-subview-back')
    })

    it('returns a station TOP to the sidebar (owner: the main menu), not to chat', () => {
        expect(resolveTalosBackAction(state({ isStation: true }))).toBe('station-to-sidebar')
    })

    /**
     * Reported on the phone 2026-08-03 and reproduced on the tablet: Back from
     * /research/:id landed on / with the main menu open. `isStation` is true
     * for a report just as much as for the list, so the report matched the
     * station-top rule and the person was thrown out of the station entirely.
     */
    it('leaves a page INSIDE a station one level at a time, never out to the menu', () => {
        expect(resolveTalosBackAction(state({ isStationSubPage: true, isStation: true, canGoBack: true })))
            .toBe('history')
        expect(resolveTalosBackAction(state({ isStationSubPage: true, isStation: true, canGoBack: false })))
            .toBe('station-subpage-parent')
    })

    it('undoes the last move rather than climbing the tree', () => {
        // Android separates Up from Back and the hardware button is Back — so
        // someone who reached a claim FROM a source returns to that source. The
        // declared parent is the safety net for a cold link, not the rule.
        expect(resolveTalosBackAction(state({ isStationSubPage: true, canGoBack: true }))).toBe('history')
    })

    it('still lets the overlays and the menu win over a sub-page', () => {
        // The sub-page rule is a new rung in the ladder, not a new top of it.
        expect(resolveTalosBackAction(state({ isStationSubPage: true, sidebarOpen: true, canGoBack: true })))
            .toBe('close-sidebar')
        expect(resolveTalosBackAction(state({ isStationSubPage: true, hasSheetSubView: true, canGoBack: true })))
            .toBe('sheet-subview-back')
    })

    it('falls through to history/exit on the chat base', () => {
        expect(resolveTalosBackAction(state({ canGoBack: true }))).toBe('history')
        expect(resolveTalosBackAction(state({ canGoBack: false }))).toBe('exit')
    })
})

import { describe, expect, it } from 'vitest'
import { resolveTalosBackAction, type TalosBackState } from '@/lib/backNavigation'

// Owner 2026-07-24: the sidebar is the MAIN MENU — stations/Settings are opened
// from it, so system Back at a station top must return to the sidebar, not jump
// to chat. Back walks the stack: wizard → sidebar → sheet sub-view → station →
// history/exit. Pure resolver so the (native-only) Back decision is testable.
function state(patch: Partial<TalosBackState> = {}): TalosBackState {
    return { wizardOpen: false, sidebarOpen: false, hasSheetSubView: false, isStation: false, canGoBack: false, ...patch }
}

describe('resolveTalosBackAction', () => {
    it('dismisses the wizard first (top-most surface)', () => {
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

    it('falls through to history/exit on the chat base', () => {
        expect(resolveTalosBackAction(state({ canGoBack: true }))).toBe('history')
        expect(resolveTalosBackAction(state({ canGoBack: false }))).toBe('exit')
    })
})

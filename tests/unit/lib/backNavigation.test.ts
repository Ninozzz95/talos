import { describe, expect, it } from 'vitest'
import {
    resolveTalosBackAction,
    TALOS_FINESTRA_USCITA_MS,
    talosUscitaConConferma,
    talosStationEntryAfter,
    talosStationExit,
    type TalosBackState,
} from '@/lib/backNavigation'

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

    /**
     * Owner 2026-08-03: «se la pagina ricerca si apre dalla sidebar, se torno
     * indietro perché mi chiude la sidebar e mi torna alla chat? un po' di buon
     * senso». Back at a station top used to run `navigate('chat')` and force the
     * drawer open whatever had come before — so a station opened FROM the
     * Settings Center took the Settings Center with it on the way out.
     *
     * The 2026-07-24 rule lives inside the new one rather than being reversed:
     * a station opened from the main menu still returns to the main menu,
     * because that is what undoing the move means when the move started there.
     */
    it('leaves a station TOP the way it was entered, whatever that was', () => {
        expect(resolveTalosBackAction(state({ isStation: true }))).toBe('leave-station')
        // Still true with in-app history to pop: leaving is not a history move,
        // because the drawer is state and popping a route cannot restore it.
        expect(resolveTalosBackAction(state({ isStation: true, canGoBack: true }))).toBe('leave-station')
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

/**
 * How the station was entered, and what Back does with it.
 *
 * Owner 2026-08-03: «se la pagina ricerca si apre dalla sidebar, se torno
 * indietro perché mi chiude la sidebar e mi torna alla chat? un po' di buon
 * senso». The old answer ran `navigate('chat')` and forced the drawer open no
 * matter what had come before, so a station opened from the Settings Center
 * took the Settings Center with it on the way out.
 */
describe('leaving a station the way you came into it', () => {
    it('remembers the door, so the main menu comes back with you', () => {
        const entry = talosStationEntryAfter(null, { to: 'research', from: 'chat', viaSidebar: true })
        expect(talosStationExit(entry)).toEqual({ route: 'chat', sidebar: true })
    })

    it('does not throw away what was underneath', () => {
        // Settings open, research opened from the menu over the top of it.
        const entry = talosStationEntryAfter(null, { to: 'research', from: 'settings', viaSidebar: true })
        expect(talosStationExit(entry)).toEqual({ route: 'settings', sidebar: true })
    })

    it('leaves the menu shut when the menu was not the door', () => {
        // Reached from the chat's own composer rather than from the drawer.
        const entry = talosStationEntryAfter(null, { to: 'library', from: 'chat', viaSidebar: false })
        expect(talosStationExit(entry)).toEqual({ route: 'chat', sidebar: false })
    })

    it('ignores moves INSIDE one station, which are not an entrance', () => {
        // The list, a report, a claim and a source are one place to the person.
        // Recording these would make Back navigate the list to itself.
        const door = talosStationEntryAfter(null, { to: 'research', from: 'chat', viaSidebar: true })
        let entry = talosStationEntryAfter(door, { to: 'research-report', from: 'research', viaSidebar: false })
        entry = talosStationEntryAfter(entry, { to: 'research-claim', from: 'research-report', viaSidebar: false })
        entry = talosStationEntryAfter(entry, { to: 'research', from: 'research-claim', viaSidebar: false })
        expect(entry).toEqual(door)
        expect(talosStationExit(entry).route).toBe('chat')
    })

    it('forgets the door once you are back on the chat', () => {
        const door = talosStationEntryAfter(null, { to: 'research', from: 'chat', viaSidebar: true })
        expect(talosStationEntryAfter(door, { to: 'chat', from: 'research', viaSidebar: false })).toBeNull()
    })

    it('falls back to the main menu when nothing was recorded at all', () => {
        // A cold start straight into a station: the 2026-07-24 rule stands,
        // because a station IS opened from the main menu.
        expect(talosStationExit(null)).toEqual({ route: 'chat', sidebar: true })
    })
})

describe('uscire dall app vuole DUE colpi', () => {
    /*
     * ⛔ Il difetto, misurato sul Pad il 2026-08-09: dalla chat appena aperta
     * (`history.length = 1`) un SOLO indietro faceva sparire TALOS. Nessun
     * avviso, e la conversazione che stavi scrivendo se ne andava con lui.
     *
     * Owner: toast in basso, finestra di 2 secondi.
     */
    it('il PRIMO colpo avvisa e basta', () => {
        expect(talosUscitaConConferma({ ora: 10_000, ultimaRichiesta: null })).toBe('avvisa')
    })

    it('il SECONDO colpo dentro la finestra esce', () => {
        expect(talosUscitaConConferma({ ora: 11_000, ultimaRichiesta: 10_000 })).toBe('esci')
    })

    /*
     * ⛔ IL VERSO CONTRARIO, e qui e' doppio.
     *
     * Il primo: passata la finestra si ricomincia da capo — altrimenti un
     * indietro dato ora e uno dato fra mezz'ora chiuderebbero l'app insieme,
     * cioe' l'avviso non varrebbe niente.
     *
     * Il secondo: il confine ESATTO. `<=` e non `<`, perche' al millisecondo
     * della scadenza il colpo vale ancora: una finestra che rifiuta il caso
     * limite e' «due secondi meno un istante», e chi la manca non capisce.
     */
    it('passata la finestra si ricomincia da capo', () => {
        expect(talosUscitaConConferma({ ora: 10_000 + TALOS_FINESTRA_USCITA_MS + 1, ultimaRichiesta: 10_000 }))
            .toBe('avvisa')
    })

    it('al millisecondo esatto della scadenza il colpo vale ancora', () => {
        expect(talosUscitaConConferma({ ora: 10_000 + TALOS_FINESTRA_USCITA_MS, ultimaRichiesta: 10_000 }))
            .toBe('esci')
    })
})

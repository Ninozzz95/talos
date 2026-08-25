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
import { talosMobileStationOf } from '@/lib/mobileRoutes'

export type TalosBackAction =
    | 'close-overlay'
    | 'dismiss-wizard'
    | 'close-sidebar'
    | 'sheet-subview-back'
    | 'station-subpage-parent'
    | 'leave-station'
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
    /**
     * Leave the station the way you came into it.
     *
     * This used to be `navigate('chat')` plus "open the drawer", unconditional,
     * and the cost was everything that had been underneath. Owner 2026-08-03:
     * «se la pagina ricerca si apre dalla sidebar, se torno indietro perché mi
     * chiude la sidebar e mi torna alla chat? un po' di buon senso». Quite.
     *
     * The 2026-07-24 rule survives inside this one rather than being reversed:
     * a station opened FROM the main menu still returns to the main menu — that
     * is what undoing the move means when the move started there. What no
     * longer happens is a station opened from anywhere else dropping you on the
     * chat and throwing away the Settings Center you had open.
     */
    if (state.isStation) return 'leave-station'
    return state.canGoBack ? 'history' : 'exit'
}

/**
 * What "the way you came in" was, kept across moves.
 *
 * The drawer is component state rather than a route, so the platform's own
 * history cannot answer this: popping back to the chat would lose the menu the
 * person opened the station from. This is the smallest thing worth remembering
 * — where they were, and whether the menu was the door.
 */
export interface TalosStationEntry {
    readonly from: string
    /** Dynamic segments of the exact route that was underneath the station. */
    readonly fromParams: Readonly<Record<string, string | string[]>>
    readonly viaSidebar: boolean
}

/**
 * Recorded when the STATION changes, never when you move inside one.
 *
 * The distinction is the whole point: the research list, a report, a claim and
 * a source are one place to the person, and treating the list-to-report move as
 * "entering a station" would make Back navigate the list to itself.
 */
export function talosStationEntryAfter(
    previous: TalosStationEntry | null,
    move: {
        readonly to: string
        readonly from: string
        readonly fromParams?: Readonly<Record<string, string | string[]>>
        readonly viaSidebar: boolean
    },
): TalosStationEntry | null {
    if (move.to === 'chat') return null
    if (talosMobileStationOf(move.to) === talosMobileStationOf(move.from)) return previous
    return {
        from: move.from,
        fromParams: move.fromParams ?? {},
        viaSidebar: move.viaSidebar,
    }
}

/** Where Back lands, and whether the main menu comes back with it. */
export function talosStationExit(entry: TalosStationEntry | null): {
    route: string
    params: Readonly<Record<string, string | string[]>>
    sidebar: boolean
} {
    // With nothing recorded — a cold start straight into a station — the
    // 2026-07-24 answer stands: a station is opened from the main menu, so the
    // main menu is where leaving it goes.
    return {
        route: entry?.from ?? 'chat',
        params: entry?.fromParams ?? {},
        sidebar: entry?.viaSidebar ?? true,
    }
}

/**
 * ⛔⭐ USCIRE DALL'APP VUOLE DUE COLPI, NON UNO.
 *
 * ## Il difetto, misurato sul Pad il 2026-08-09
 *
 * Dalla chat, con l'app appena aperta:
 *
 *     partenza    pathname = "/"   history.length = 1
 *     un indietro → la WebView sparisce: TALOS e' USCITO
 *
 * Un solo tocco del tasto piu' usato di Android, e la conversazione che stavi
 * scrivendo non c'e' piu'. Nessun avviso, nessuna seconda possibilita'.
 *
 * ⛔ E c'e' un dettaglio che lo rende peggiore: `history.length = 1` significa
 * che la chat non lascia traccia. Non esiste una pila da risalire — l'indietro
 * dalla radice non ha nessun altro posto dove andare se non fuori.
 *
 * ## La cura, scelta dall'owner
 *
 * Il modello Android classico: il primo colpo avvisa, il secondo entro una
 * breve finestra esce. Owner 2026-08-09: «toast in basso, 2 secondi».
 *
 * Si riconosce senza impararlo, non aggiunge un passo a chi vuole uscire
 * davvero (due tocchi rapidi sono un gesto solo), e sopra ogni cosa non chiede
 * una risposta a chi voleva solo chiudere un pannello.
 *
 * ## Perche' e' una funzione pura
 *
 * Perche' la parte che sbaglia e' il CONFRONTO FRA DUE ISTANTI, e un confronto
 * di tempi dentro un componente si puo' solo guardare. Qui si prova: due colpi
 * vicini escono, due lontani no, e il secondo verso e' quello che il difetto
 * occupava.
 */
export const TALOS_FINESTRA_USCITA_MS = 2_000

export function talosUscitaConConferma(input: {
    /** Adesso, in millisecondi. Passato da fuori: il tempo non si inventa qui. */
    readonly ora: number
    /** Quando e' stato chiesto l'ultimo indietro dalla radice, o null. */
    readonly ultimaRichiesta: number | null
    readonly finestraMs?: number
}): 'avvisa' | 'esci' {
    const finestra = input.finestraMs ?? TALOS_FINESTRA_USCITA_MS
    if (input.ultimaRichiesta === null) return 'avvisa'
    /*
     * ⛔ `<=` e non `<`: al millisecondo esatto della scadenza il secondo colpo
     * vale ancora. Un confine che rifiuta il caso limite trasforma una finestra
     * di due secondi in «due secondi meno un istante», e chi la manca non
     * capisce perche'.
     */
    return input.ora - input.ultimaRichiesta <= finestra ? 'esci' : 'avvisa'
}

/**
 * F6 — tablet resizable sidebar width contract (Claude split-view pattern).
 * ONE source of truth for bounds: the settings parser, the drag divider and
 * the App shell all clamp through here so a hostile persisted value or a
 * runaway drag can never break the layout.
 */
export const TALOS_TABLET_SIDEBAR_MIN = 260
export const TALOS_TABLET_SIDEBAR_MAX = 480
export const TALOS_TABLET_SIDEBAR_DEFAULT = 320
/** Harness keeps global navigation reachable while its session list is folded. */
export const TALOS_TABLET_HARNESS_RAIL_COLLAPSED = 72

export type TalosTabletSidebarVariant = 'chat' | 'harness'

/**
 * Tablet layout engages at the md breakpoint (shared with Tailwind's md:).
 * SF6-F6: the min-height guard keeps landscape PHONES (~915×412) on the phone
 * layout — a 320px panel on a 412px-tall screen is not a split view.
 */
export const TALOS_TABLET_WIDTH_MEDIA_QUERY = '(min-width: 768px)'
export const TALOS_TABLET_MEDIA_QUERY = `${TALOS_TABLET_WIDTH_MEDIA_QUERY} and (min-height: 500px)`

export function clampTalosTabletSidebarWidth(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return TALOS_TABLET_SIDEBAR_DEFAULT
    return Math.min(TALOS_TABLET_SIDEBAR_MAX, Math.max(TALOS_TABLET_SIDEBAR_MIN, Math.round(value)))
}

export function talosTabletSidebarEffectiveWidth(
    savedWidth: unknown,
    variant: TalosTabletSidebarVariant,
    collapsed: boolean,
): number {
    if (variant === 'harness' && collapsed) return TALOS_TABLET_HARNESS_RAIL_COLLAPSED
    return clampTalosTabletSidebarWidth(savedWidth)
}

/**
 * ⛔⛔ LISTA-DOPPIA-01 — la stessa lista, disegnata due volte, affiancata.
 *
 * FOTOGRAFATO dall'owner il 2026-08-20: tablet in verticale, a sinistra la
 * barra laterale con l'elenco delle chat, a destra — dove va la conversazione —
 * **lo stesso identico elenco**, con la sua intestazione «Chat» e la sua
 * freccia indietro. Venti righe a sinistra, le stesse venti a destra.
 *
 * Sul tablet la barra laterale **è** l'elenco: c'è sempre. La rotta `chats`
 * disegna quell'elenco nel riquadro principale, e sul telefono è giusto — lì
 * la barra non c'è. Sul tablet le due cose si sommano.
 *
 * ⛔ Il codice lo sapeva già: all'avvio, se la stazione ricordata era `chats` e
 * il dispositivo è un tablet, non la ripristinava, col commento «sheet right
 * next to the identical panel». Ma quella guardia copre **solo l'avvio a
 * freddo**. Ci si arriva anche a caldo: dal telefono si tocca «Tutte le chat»,
 * poi si ruota o si allarga la finestra, ed eccole due.
 *
 * ⇒ La domanda è una sola e va risposta in un posto solo. Qui, pura, così la
 * si può provare senza montare la shell.
 */
export function talosTabletLeavesChatsRoute(
    isTablet: boolean,
    routeName: string | null | undefined,
): boolean {
    // ⛔ Un nome assente non decide: durante il primo giro del router il nome
    // può ancora non esserci, e una redirezione presa lì porterebbe via da una
    // pagina che la persona non ha nemmeno visto.
    if (!routeName) return false
    return isTablet && routeName === 'chats'
}

/**
 * Stessa domanda di `talosTabletLeavesChatsRoute`, per Harness — nata dal
 * refactor della sidebar del 24/8: la barra laterale ora è CONTESTUALE
 * (TalosTabletSidebar.vue mostra la lista di Harness invece della chat
 * quando la stazione è Harness), quindi mostra già l'elenco delle sessioni.
 * Restare sulla rotta-elenco nuda nel riquadro principale la disegnerebbe
 * una seconda volta, affiancata a se stessa — esattamente LISTA-DOPPIA-01,
 * un'altra stazione.
 */
export function talosTabletLeavesHarnessListRoute(
    isTablet: boolean,
    routeName: string | null | undefined,
): boolean {
    if (!routeName) return false
    return isTablet && routeName === 'harness'
}

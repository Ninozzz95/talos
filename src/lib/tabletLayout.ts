/**
 * F6 — tablet resizable sidebar width contract (Claude split-view pattern).
 * ONE source of truth for bounds: the settings parser, the drag divider and
 * the App shell all clamp through here so a hostile persisted value or a
 * runaway drag can never break the layout.
 */
export const TALOS_TABLET_SIDEBAR_MIN = 260
export const TALOS_TABLET_SIDEBAR_MAX = 480
export const TALOS_TABLET_SIDEBAR_DEFAULT = 320

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

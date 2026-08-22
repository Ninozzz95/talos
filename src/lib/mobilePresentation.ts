export type TalosMobilePresentation = 'drawer' | 'fullscreen'

export const DEFAULT_MOBILE_PRESENTATION: TalosMobilePresentation = 'drawer'

/** Tablet-width boundary (dp) above which modules default to fullscreen. */

export function isTalosMobilePresentation(value: unknown): value is TalosMobilePresentation {
    return value === 'drawer' || value === 'fullscreen'
}

/**
 * An explicit user preference always wins. With no preference, narrow phone
 * viewports use the drawer and tablet-width viewports use fullscreen.
 */

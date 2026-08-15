/**
 * Owner 2026-07-25: "il font size DEVE impattare anche il font dei menù e di
 * tutto il sistema non solo chat."
 *
 * One runtime variable — `--talos-ui-scale` on <html> — multiplies every
 * Tailwind interface text token (see the `@theme inline` block in style.css),
 * so a single write reaches menus, settings, header, sheets, toasts, composer,
 * and message-adjacent controls. Message prose is deliberately rooted at the
 * independent `chat_layout.bubble_scale` boundary.
 *
 * Standards research (W3C CSS Values/Cascade, WCAG 2.2, Android 14 font
 * scaling; refreshed 2026-07-28) supports separate root-relative message sizing
 * rather than multiplying the two app-level controls together.
 *
 * Deliberately typography-only: spacing and hit targets stay put, so the
 * largest step cannot push controls off a small screen (Android splits the same
 * way — "Font size" vs "Display size").
 */
export const TALOS_FONT_SCALES = ['small', 'default', 'large', 'xlarge'] as const

export type TalosFontScale = (typeof TALOS_FONT_SCALES)[number]

// Owner 2026-07-25: ships at `large` — the system type is deliberately bigger
// than the chat body, which he wants small.
export const TALOS_DEFAULT_FONT_SCALE: TalosFontScale = 'large'

const FACTORS: Record<TalosFontScale, number> = {
    small: 0.9,
    default: 1,
    large: 1.15,
    xlarge: 1.3,
}

export const TALOS_FONT_SCALE_OPTIONS: Array<{ value: TalosFontScale; label: string }> = [
    { value: 'small', label: 'Small' },
    { value: 'default', label: 'Default' },
    { value: 'large', label: 'Large' },
    { value: 'xlarge', label: 'Extra large' },
]

/** Fail-safe: anything unrecognised reads as the default, never as 0. */
export function parseTalosFontScale(value: unknown): TalosFontScale {
    return TALOS_FONT_SCALES.includes(value as TalosFontScale)
        ? value as TalosFontScale
        : TALOS_DEFAULT_FONT_SCALE
}

export function talosFontScaleFactor(scale: TalosFontScale): number {
    return FACTORS[scale] ?? 1
}

/**
 * SF: the persisted setting lives in Capacitor Preferences, whose native bridge
 * resolves AFTER the first frames are painted — measured 3 frames of text at
 * the wrong size on a warm web preview, longer on device. A synchronous mirror
 * lets boot apply the scale before mount, exactly as main.ts already does for
 * the theme preset. Preferences stays the source of truth; this is a cache.
 */
const MIRROR_KEY = 'talos.ui_font_scale.v1'

/** Writes the multiplier every `--text-*` token reads. */
export function applyTalosFontScale(
    scale: TalosFontScale,
    target: HTMLElement | null = typeof document === 'undefined' ? null : document.documentElement,
): void {
    target?.style.setProperty('--talos-ui-scale', String(talosFontScaleFactor(scale)))
    try {
        globalThis.localStorage?.setItem(MIRROR_KEY, scale)
    } catch {
        // A blocked/absent storage must never break the shell: the async
        // hydration still applies the real value a moment later.
    }
}

/** The scale to paint the FIRST frame with, before Preferences resolves. */
export function readRememberedTalosFontScale(): TalosFontScale {
    try {
        return parseTalosFontScale(globalThis.localStorage?.getItem(MIRROR_KEY))
    } catch {
        return TALOS_DEFAULT_FONT_SCALE
    }
}

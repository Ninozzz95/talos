import type {
    TalosChatBubbleScale,
    TalosChatLayoutPreferences,
    TalosMessageStyle,
    TalosMobileWindowPresentation,
} from './talosTypes'

/**
 * Chat message size in root-relative rem.
 *
 * The sizes used to live in a nested ternary inside the message list's inline
 * style. Owner asked for a fourth step on 2026-07-26 ("extra small"), and a
 * four-way ternary is where that expression stops being readable and starts
 * being a place bugs hide — so the steps are a map, declared once, and the
 * component reads it. Adding a fifth step is now a line, not a rewrite.
 */
export const TALOS_CHAT_TEXT_SCALE_REM: Record<TalosChatBubbleScale, number> = {
    xcompact: 0.875,
    compact: 0.9375,
    balanced: 1.0625,
    expanded: 1.1875,
}

export const TALOS_CHAT_BUBBLE_SCALE_OPTIONS: Array<{
    value: TalosChatBubbleScale
    label: string
}> = [
    { value: 'xcompact', label: 'Extra small' },
    { value: 'compact', label: 'Small' },
    { value: 'balanced', label: 'Default' },
    { value: 'expanded', label: 'Large' },
]

/**
 * The rendered message-prose size for a step.
 *
 * Deliberately independent from `--talos-ui-scale`: Appearance "Font size"
 * owns interface chrome, while "Chat message size" owns message prose.
 */
export function talosChatTextSize(scale: TalosChatBubbleScale | undefined): string {
    const rem = TALOS_CHAT_TEXT_SCALE_REM[scale ?? 'balanced'] ?? TALOS_CHAT_TEXT_SCALE_REM.balanced
    return `${rem}rem`
}


export const TALOS_CHAT_MESSAGE_STYLE_OPTIONS: Array<{
    value: TalosMessageStyle
    label: string
}> = [
    { value: 'sections', label: 'Sections' },
    { value: 'bubbles', label: 'Bubbles' },
]

export const TALOS_MOBILE_WINDOW_PRESENTATION_OPTIONS: Array<{
    value: TalosMobileWindowPresentation
    label: string
}> = [
    { value: 'drawer', label: 'Drawer' },
    { value: 'fullscreen', label: 'Fullscreen modal' },
]

export const TALOS_DEFAULT_CHAT_LAYOUT: TalosChatLayoutPreferences = {
    bubble_scale: 'balanced',
    message_style: 'sections',
    mobile_window_presentation: 'drawer',
}

export function sanitizeTalosChatLayout(value: unknown): TalosChatLayoutPreferences {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { ...TALOS_DEFAULT_CHAT_LAYOUT }
    }

    const layout = value as Record<string, unknown>

    return {
        // Reads from the option list, so a step added above is accepted here
        // without a second edit — the previous form named each value twice and
        // silently rejected any new one.
        bubble_scale: TALOS_CHAT_BUBBLE_SCALE_OPTIONS
            .some((option) => option.value === layout.bubble_scale)
            ? layout.bubble_scale as TalosChatBubbleScale
            : 'balanced',
        message_style: layout.message_style === 'bubbles' ? 'bubbles' : 'sections',
        mobile_window_presentation: layout.mobile_window_presentation === 'fullscreen' ? 'fullscreen' : 'drawer',
    }
}

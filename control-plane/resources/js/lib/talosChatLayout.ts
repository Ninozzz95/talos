import type {
    TalosChatBubbleScale,
    TalosChatLayoutPreferences,
    TalosComposerMode,
    TalosMobileWindowPresentation,
} from './talosTypes'

export const TALOS_CHAT_BUBBLE_SCALE_OPTIONS: Array<{
    value: TalosChatBubbleScale
    label: string
}> = [
    { value: 'compact', label: 'Compact' },
    { value: 'balanced', label: 'Balanced' },
    { value: 'expanded', label: 'Expanded' },
]

export const TALOS_CHAT_COMPOSER_MODE_OPTIONS: Array<{
    value: TalosComposerMode
    label: string
}> = [
    { value: 'full', label: 'Full controls' },
    { value: 'minimal', label: 'Icon controls' },
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
    composer_mode: 'full',
    advanced_rail_expanded: false,
    mobile_window_presentation: 'drawer',
}

export function sanitizeTalosChatLayout(value: unknown): TalosChatLayoutPreferences {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { ...TALOS_DEFAULT_CHAT_LAYOUT }
    }

    const layout = value as Record<string, unknown>

    return {
        bubble_scale: layout.bubble_scale === 'compact'
            || layout.bubble_scale === 'expanded'
            ? layout.bubble_scale
            : 'balanced',
        composer_mode: layout.composer_mode === 'minimal' ? 'minimal' : 'full',
        advanced_rail_expanded: layout.advanced_rail_expanded === true,
        mobile_window_presentation: layout.mobile_window_presentation === 'fullscreen' ? 'fullscreen' : 'drawer',
    }
}

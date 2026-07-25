import type {
    TalosChatBubbleScale,
    TalosChatLayoutPreferences,
    TalosMessageStyle,
    TalosMobileWindowPresentation,
} from './talosTypes'

export const TALOS_CHAT_BUBBLE_SCALE_OPTIONS: Array<{
    value: TalosChatBubbleScale
    label: string
}> = [
    { value: 'compact', label: 'Small' },
    { value: 'balanced', label: 'Default' },
    { value: 'expanded', label: 'Large' },
]


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
        bubble_scale: layout.bubble_scale === 'compact'
            || layout.bubble_scale === 'expanded'
            ? layout.bubble_scale
            : 'balanced',
        message_style: layout.message_style === 'bubbles' ? 'bubbles' : 'sections',
        mobile_window_presentation: layout.mobile_window_presentation === 'fullscreen' ? 'fullscreen' : 'drawer',
    }
}

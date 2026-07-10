import type {
    TalosChatBubbleScale,
    TalosChatLayoutPreferences,
    TalosComposerMode,
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
    { value: 'minimal', label: 'Minimal' },
]

export const TALOS_DEFAULT_CHAT_LAYOUT: TalosChatLayoutPreferences = {
    bubble_scale: 'balanced',
    composer_mode: 'full',
    advanced_rail_expanded: false,
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
    }
}

import type {
    TalosThemeAreaTokenKey,
    TalosThemeDensity,
    TalosThemeFont,
    TalosThemeRadius,
} from '../../../../lib/talosThemes'
import type { TalosChatLayoutPreferences } from '../../../../lib/talosTypes'

export type ThemeCustomizationForm = {
    background: string
    panel: string
    text: string
    accent: string
    secondary: string
    border: string
    font: TalosThemeFont
    density: TalosThemeDensity
    radius: TalosThemeRadius
    scrollbar_track: string
    scrollbar_thumb: string
    scrollbar_thumb_hover: string
    scrollbar_width: number
}

export type AreaTokenForm = Record<TalosThemeAreaTokenKey, string>

export type ThemeLayoutPreview = Pick<TalosChatLayoutPreferences, 'bubble_scale' | 'composer_mode'>

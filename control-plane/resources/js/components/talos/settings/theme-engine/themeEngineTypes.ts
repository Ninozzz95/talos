import type {
    TalosBackgroundEffect,
    TalosThemeAreaTokenKey,
    TalosThemeDensity,
    TalosThemeFont,
    TalosThemeRadius,
    TalosUiAnimationEasing,
    TalosUiAnimationFeedback,
    TalosUiAnimationHover,
    TalosUiAnimationOpenClose,
    TalosUiAnimationProfile,
    TalosUiAnimationSurfaceTransition,
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
    effect: TalosBackgroundEffect
    effect_intensity: number
    scrollbar_track: string
    scrollbar_thumb: string
    scrollbar_thumb_hover: string
    scrollbar_width: number
}

export type UiAnimationForm = {
    open_close: TalosUiAnimationOpenClose
    surface_transition: TalosUiAnimationSurfaceTransition
    feedback: TalosUiAnimationFeedback
    hover: TalosUiAnimationHover
    duration_scale: number
    intensity: number
    easing: TalosUiAnimationEasing
    stagger: number
}

export type AreaTokenForm = Record<TalosThemeAreaTokenKey, string>

export type ThemeLayoutPreview = Pick<TalosChatLayoutPreferences, 'bubble_scale' | 'composer_mode'>

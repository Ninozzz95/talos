import {
    TALOS_CHAT_BUBBLE_SCALE_OPTIONS,
    TALOS_CHAT_COMPOSER_MODE_OPTIONS,
    TALOS_DEFAULT_CHAT_LAYOUT,
    sanitizeTalosChatLayout,
} from '../../../../lib/talosChatLayout'
import {
    validateTalosThemeAreaContrast,
    validateTalosThemeStateContrast,
} from '../../../../lib/talosThemeValidation'
import {
    TALOS_BACKGROUND_EFFECTS,
    TALOS_THEME_AREA_OPTIONS,
    TALOS_THEME_AREA_TOKEN_OPTIONS,
    TALOS_THEME_DENSITY_OPTIONS,
    TALOS_THEME_FONT_OPTIONS,
    TALOS_THEME_MODE_OPTIONS,
    TALOS_THEME_MOTION_OPTIONS,
    TALOS_THEME_RADIUS_OPTIONS,
    TALOS_UI_ANIMATION_EASING_OPTIONS,
    TALOS_UI_ANIMATION_FEEDBACK_OPTIONS,
    TALOS_UI_ANIMATION_HOVER_OPTIONS,
    TALOS_UI_ANIMATION_OPEN_CLOSE_OPTIONS,
    TALOS_UI_ANIMATION_PROFILE_OPTIONS,
    TALOS_UI_ANIMATION_SURFACE_OPTIONS,
    isTalosThemeId,
    parseTalosThemeExport,
    validateTalosThemeCustomizationContrast,
    type TalosNamedTheme,
    type TalosThemeId,
    type TalosThemeMode,
    type TalosThemeMotionMode,
    type TalosUiAnimationProfile,
} from '../../../../lib/talosThemes'

export type ThemePreferences = Record<string, unknown>

type NamedThemePreferenceOptions = {
    themeMode?: TalosThemeMode
    motionMode?: TalosThemeMotionMode
    uiAnimationProfile?: TalosUiAnimationProfile
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
    const allowed = new Set(keys)
    return Object.keys(value).every((key) => allowed.has(key))
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i
const ISO_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/
const THEME_CUSTOMIZATION_KEYS = [
    'background', 'panel', 'text', 'accent', 'secondary', 'border', 'font', 'density', 'radius', 'effect',
    'effect_intensity', 'scrollbar_track', 'scrollbar_thumb', 'scrollbar_thumb_hover', 'scrollbar_width',
] as const
const UI_ANIMATION_KEYS = ['open_close', 'surface_transition', 'feedback', 'hover', 'duration_scale', 'intensity', 'easing', 'stagger'] as const
const CHAT_LAYOUT_KEYS = ['bubble_scale', 'composer_mode', 'advanced_rail_expanded'] as const
const COLOR_CUSTOMIZATION_KEYS = new Set(['background', 'panel', 'text', 'accent', 'secondary', 'border', 'scrollbar_track', 'scrollbar_thumb', 'scrollbar_thumb_hover'])
const values = <T extends { value: string }>(options: readonly T[]) => new Set(options.map((option) => option.value))
const FONT_VALUES = values(TALOS_THEME_FONT_OPTIONS)
const DENSITY_VALUES = values(TALOS_THEME_DENSITY_OPTIONS)
const RADIUS_VALUES = values(TALOS_THEME_RADIUS_OPTIONS)
const EFFECT_VALUES = values(TALOS_BACKGROUND_EFFECTS)
const MODE_VALUES = values(TALOS_THEME_MODE_OPTIONS)
const MOTION_VALUES = values(TALOS_THEME_MOTION_OPTIONS)
const AREA_VALUES = values(TALOS_THEME_AREA_OPTIONS)
const AREA_TOKEN_VALUES = values(TALOS_THEME_AREA_TOKEN_OPTIONS)
const UI_PROFILE_VALUES = values(TALOS_UI_ANIMATION_PROFILE_OPTIONS)
const UI_OPEN_VALUES = values(TALOS_UI_ANIMATION_OPEN_CLOSE_OPTIONS)
const UI_SURFACE_VALUES = values(TALOS_UI_ANIMATION_SURFACE_OPTIONS)
const UI_FEEDBACK_VALUES = values(TALOS_UI_ANIMATION_FEEDBACK_OPTIONS)
const UI_HOVER_VALUES = values(TALOS_UI_ANIMATION_HOVER_OPTIONS)
const UI_EASING_VALUES = values(TALOS_UI_ANIMATION_EASING_OPTIONS)
const BUBBLE_VALUES = values(TALOS_CHAT_BUBBLE_SCALE_OPTIONS)
const COMPOSER_VALUES = values(TALOS_CHAT_COMPOSER_MODE_OPTIONS)

function strictInteger(value: unknown, min: number, max: number) {
    return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function strictThemeCustomization(value: unknown) {
    if (!isRecord(value) || !hasOnlyKeys(value, THEME_CUSTOMIZATION_KEYS)) return false

    for (const [key, token] of Object.entries(value)) {
        if (COLOR_CUSTOMIZATION_KEYS.has(key)) {
            if (typeof token !== 'string' || !HEX_COLOR.test(token.trim())) return false
        } else if (key === 'font' && (typeof token !== 'string' || !FONT_VALUES.has(token))) return false
        else if (key === 'density' && (typeof token !== 'string' || !DENSITY_VALUES.has(token))) return false
        else if (key === 'radius' && (typeof token !== 'string' || !RADIUS_VALUES.has(token))) return false
        else if (key === 'effect' && (typeof token !== 'string' || !EFFECT_VALUES.has(token))) return false
        else if (key === 'effect_intensity' && !strictInteger(token, 0, 100)) return false
        else if (key === 'scrollbar_width' && !strictInteger(token, 6, 18)) return false
    }

    return true
}

function strictAreaTokens(value: unknown) {
    if (value === undefined) return true
    if (!isRecord(value)) return false

    for (const [area, tokens] of Object.entries(value)) {
        if (!AREA_VALUES.has(area) || !isRecord(tokens)) return false
        for (const [key, token] of Object.entries(tokens)) {
            if (!AREA_TOKEN_VALUES.has(key) || typeof token !== 'string' || !HEX_COLOR.test(token.trim())) return false
        }
    }

    return true
}

function strictUiAnimationCustomization(value: unknown) {
    if (value === undefined) return true
    if (!isRecord(value) || !hasOnlyKeys(value, UI_ANIMATION_KEYS)) return false

    for (const [key, token] of Object.entries(value)) {
        if (key === 'open_close' && (typeof token !== 'string' || !UI_OPEN_VALUES.has(token))) return false
        if (key === 'surface_transition' && (typeof token !== 'string' || !UI_SURFACE_VALUES.has(token))) return false
        if (key === 'feedback' && (typeof token !== 'string' || !UI_FEEDBACK_VALUES.has(token))) return false
        if (key === 'hover' && (typeof token !== 'string' || !UI_HOVER_VALUES.has(token))) return false
        if (key === 'easing' && (typeof token !== 'string' || !UI_EASING_VALUES.has(token))) return false
        if (key === 'duration_scale' && !strictInteger(token, 50, 150)) return false
        if (key === 'intensity' && !strictInteger(token, 0, 100)) return false
        if (key === 'stagger' && !strictInteger(token, 0, 120)) return false
    }

    return true
}

function strictChatLayout(value: unknown) {
    if (value === undefined) return true
    if (!isRecord(value) || !hasOnlyKeys(value, CHAT_LAYOUT_KEYS)) return false

    return (value.bubble_scale === undefined || (typeof value.bubble_scale === 'string' && BUBBLE_VALUES.has(value.bubble_scale)))
        && (value.composer_mode === undefined || (typeof value.composer_mode === 'string' && COMPOSER_VALUES.has(value.composer_mode)))
        && (value.advanced_rail_expanded === undefined || typeof value.advanced_rail_expanded === 'boolean')
}

function strictTimestamp(value: unknown) {
    if (value === undefined) return true
    if (typeof value !== 'string' || value.length > 64) return false

    const match = value.match(ISO_TIMESTAMP)
    if (!match) return false

    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const hour = Number(match[4])
    const minute = Number(match[5])
    const second = Number(match[6])
    const offsetHour = match[10] === undefined ? 0 : Number(match[10])
    const offsetMinute = match[11] === undefined ? 0 : Number(match[11])
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

    return year > 0
        && month >= 1
        && month <= 12
        && day >= 1
        && day <= daysInMonth[month - 1]
        && hour <= 23
        && minute <= 59
        && second <= 59
        && offsetHour <= 23
        && offsetMinute <= 59
}

function strictThemePayload(value: Record<string, unknown>) {
    return typeof value.id === 'string'
        && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(value.id)
        && typeof value.name === 'string'
        && value.name.trim().length > 0
        && value.name.trim().length <= 80
        && isTalosThemeId(value.base_theme)
        && strictThemeCustomization(value.tokens)
        && strictAreaTokens(value.area_tokens)
        && (value.theme_mode === undefined || (typeof value.theme_mode === 'string' && MODE_VALUES.has(value.theme_mode)))
        && (value.motion === undefined || (typeof value.motion === 'string' && MOTION_VALUES.has(value.motion)))
        && (value.ui_animation_profile === undefined || (typeof value.ui_animation_profile === 'string' && UI_PROFILE_VALUES.has(value.ui_animation_profile)))
        && strictUiAnimationCustomization(value.ui_animation_customization)
        && strictChatLayout(value.chat_layout)
        && strictTimestamp(value.created_at)
        && strictTimestamp(value.updated_at)
}

export function applyTalosNamedThemePreferences(
    preferences: ThemePreferences,
    theme: TalosNamedTheme,
    options: NamedThemePreferenceOptions = {},
): ThemePreferences {
    return {
        ...preferences,
        theme: theme.base_theme,
        theme_mode: theme.theme_mode ?? options.themeMode ?? preferences.theme_mode ?? 'system',
        theme_customization: theme.tokens,
        theme_area_tokens: theme.area_tokens ?? {},
        theme_motion: theme.motion ?? options.motionMode ?? preferences.theme_motion ?? 'system',
        ui_animation_profile: theme.ui_animation_profile ?? options.uiAnimationProfile ?? preferences.ui_animation_profile ?? 'preset',
        ui_animation_customization: theme.ui_animation_customization ?? {},
        chat_layout: sanitizeTalosChatLayout(theme.chat_layout ?? preferences.chat_layout ?? TALOS_DEFAULT_CHAT_LAYOUT),
        active_custom_theme_id: theme.id,
    }
}

export function resetTalosThemePreferences(preferences: ThemePreferences): ThemePreferences {
    return {
        ...preferences,
        theme_customization: {},
        theme_area_tokens: {},
        theme_mode: 'system',
        theme_motion: 'system',
        theme_motion_disabled: false,
        theme_simple_animation: true,
        theme_background_disabled: false,
        ui_animation_profile: 'preset',
        ui_animation_customization: {},
        active_custom_theme_id: null,
        chat_layout: { ...TALOS_DEFAULT_CHAT_LAYOUT },
    }
}

export function resetTalosCustomizationPreferences(preferences: ThemePreferences): ThemePreferences {
    return {
        ...preferences,
        theme_customization: {},
        active_custom_theme_id: null,
    }
}

export function validateTalosThemeForSave(value: unknown, baseTheme?: TalosThemeId) {
    return baseTheme
        ? validateTalosThemeCustomizationContrast(value, baseTheme)
        : validateTalosThemeCustomizationContrast(value)
}

export const validateTalosThemeAreaForSave = validateTalosThemeAreaContrast
export const validateTalosThemeStateForSave = validateTalosThemeStateContrast

export type StrictTalosThemeImportResult = {
    theme: TalosNamedTheme | null
    error: string | null
}

const REJECTED_IMPORT_ERROR = 'TALOS rejected this theme import.'

function rejectedImport(error = REJECTED_IMPORT_ERROR): StrictTalosThemeImportResult {
    return { theme: null, error }
}

export function inspectStrictTalosThemeImport(value: unknown): StrictTalosThemeImportResult {
    if (!isRecord(value) || !hasOnlyKeys(value, ['schema', 'exported_at', 'theme'])) {
        return rejectedImport()
    }

    if (value.schema !== 'talos_theme_export_v1'
        || typeof value.exported_at !== 'string'
        || !strictTimestamp(value.exported_at)
        || !isRecord(value.theme)
        || !hasOnlyKeys(value.theme, [
            'id',
            'name',
            'base_theme',
            'theme_mode',
            'tokens',
            'area_tokens',
            'motion',
            'ui_animation_profile',
            'ui_animation_customization',
            'chat_layout',
            'created_at',
            'updated_at',
        ])) {
        return rejectedImport()
    }

    if (typeof value.theme.id !== 'string'
        || value.theme.id.trim() === ''
        || typeof value.theme.name !== 'string'
        || value.theme.name.trim() === '') {
        return rejectedImport()
    }

    if (!isTalosThemeId(value.theme.base_theme)) {
        return rejectedImport('Theme import requires theme.base_theme to name a supported base preset.')
    }

    if (!isRecord(value.theme.tokens)) {
        return rejectedImport('Theme import requires theme.tokens to be an object.')
    }

    if (value.theme.area_tokens !== undefined && !isRecord(value.theme.area_tokens)) {
        return rejectedImport()
    }

    if (value.theme.ui_animation_customization !== undefined && !isRecord(value.theme.ui_animation_customization)) {
        return rejectedImport()
    }

    if (value.theme.chat_layout !== undefined && !isRecord(value.theme.chat_layout)) {
        return rejectedImport()
    }

    if (!strictThemePayload(value.theme)) {
        return rejectedImport()
    }

    const theme = parseTalosThemeExport(value)
    if (!theme) {
        return rejectedImport()
    }

    const contrast = validateTalosThemeStateForSave({
        baseTheme: theme.base_theme,
        customization: theme.tokens,
        areaTokens: theme.area_tokens,
    })
    if (!contrast.valid) {
        return rejectedImport(`Theme import contrast rejected: ${contrast.errors[0]?.message ?? 'normal-text contrast is unsafe.'}`)
    }

    return { theme, error: null }
}

export function parseStrictTalosThemeImport(value: unknown): TalosNamedTheme | null {
    return inspectStrictTalosThemeImport(value).theme
}

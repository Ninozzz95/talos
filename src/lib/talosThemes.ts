import type { TalosChatLayoutPreferences } from './talosTypes'
import { sanitizeTalosChatLayout } from './talosChatLayout'
import {
    talosContrastRatio,
    talosNormalTextPairsFromStyle,
    talosReadableForeground,
    validateTalosNormalTextPairs,
    type TalosContrastValidationResult,
} from './talosContrast'
import { parseTalosMotionV6Preferences, type TalosMotionV6Preferences } from '../motion-v6/contracts'
import { createDefaultTalosMotionV6Preferences } from '../motion-v6/defaults'
import {
    TALOS_COMPONENT_RADIUS_SCALE,
    TALOS_LAYOUT_DENSITY_SCALE,
} from '@talos-mobile/design-tokens'

export const TALOS_THEME_IDS = [
    'forge',
    'paper',
    'terminal',
    'aurora',
    'glacier',
    'ember',
    'atlas',
    'noir',
    'signal',
    'violet',
    'claudius',
    'basicus',
    'telemetry',
    'calm',
] as const

export type TalosThemeId = typeof TALOS_THEME_IDS[number]

export type TalosThemePreset = {
    id: TalosThemeId
    label: string
    shortLabel: string
    description: string
    mood: string
    motion: string
    defaultDensity: TalosThemeDensity
    defaultRadius: TalosThemeRadius
    defaultMotion: Exclude<TalosThemeMotionMode, 'system' | 'off'>
    isLight: boolean
    fontUi: string
    fontMono: string
    preview: {
        background: string
        accent: string
        secondary: string
        line: string
    }
    poster: string
    defaultEffect: TalosBackgroundEffect
}

export type TalosBackgroundEffect = 'dag-flow' | 'kahn-grid' | 'trace-rain' | 'signal-mesh' | 'none'
export type TalosThemeFont = 'inter' | 'manrope' | 'mono' | 'system' | 'display' | 'serif'
export type TalosThemeDensity = 'compact' | 'comfortable' | 'spacious'
export type TalosThemeRadius = 'sharp' | 'balanced' | 'soft'
export type TalosThemeMode = 'system' | 'light' | 'dark'
export type TalosResolvedThemeMode = Exclude<TalosThemeMode, 'system'>
export type TalosThemeMotionMode = 'system' | 'off' | 'subtle' | 'normal' | 'cinematic'
export type TalosUiAnimationProfile = 'preset' | 'minimal' | 'expressive' | 'custom' | 'off'
export type TalosUiAnimationOpenClose = 'instant' | 'standard' | 'depth' | 'terminal-snap' | 'soft-fade'
export type TalosUiAnimationSurfaceTransition = 'fade' | 'slide-fade' | 'scale-fade' | 'scanline' | 'axis-shift'
export type TalosUiAnimationFeedback = 'none' | 'pulse' | 'trace' | 'edge-flash' | 'status-lock'
export type TalosUiAnimationHover = 'none' | 'lift' | 'edge-glow' | 'underline' | 'node-glow'
export type TalosUiAnimationEasing = 'precise' | 'soft' | 'elastic-light' | 'linear' | 'cinematic'
export type TalosThemeAreaId = 'sidebar' | 'chat' | 'composer' | 'window' | 'header' | 'button' | 'card' | 'code'
export type TalosThemeAreaTokenKey = 'background' | 'surface' | 'text' | 'muted' | 'border' | 'accent'

export type TalosThemeCustomization = {
    background?: string
    panel?: string
    text?: string
    accent?: string
    secondary?: string
    border?: string
    font?: TalosThemeFont
    density?: TalosThemeDensity
    radius?: TalosThemeRadius
    effect?: TalosBackgroundEffect
    effect_intensity?: number
    scrollbar_track?: string
    scrollbar_thumb?: string
    scrollbar_thumb_hover?: string
    scrollbar_width?: number
}

export type TalosThemeAreaTokens = Partial<Record<TalosThemeAreaId, Partial<Record<TalosThemeAreaTokenKey, string>>>>

export type TalosUiAnimationCustomization = {
    open_close?: TalosUiAnimationOpenClose
    surface_transition?: TalosUiAnimationSurfaceTransition
    feedback?: TalosUiAnimationFeedback
    hover?: TalosUiAnimationHover
    duration_scale?: number
    intensity?: number
    easing?: TalosUiAnimationEasing
    stagger?: number
}

export type TalosNamedTheme = {
    id: string
    name: string
    base_theme: TalosThemeId
    theme_mode?: TalosThemeMode
    tokens: TalosThemeCustomization
    area_tokens?: TalosThemeAreaTokens
    motion?: TalosThemeMotionMode
    motion_v6?: TalosMotionV6Preferences
    ui_animation_profile?: TalosUiAnimationProfile
    ui_animation_customization?: TalosUiAnimationCustomization
    chat_layout?: TalosChatLayoutPreferences
    created_at?: string
    updated_at?: string
}

export type TalosThemeExportV1 = {
    schema: 'talos_theme_export_v1'
    exported_at: string
    theme: TalosNamedTheme
}

export type TalosThemeExportV2 = {
    schema: 'talos_theme_export_v2'
    exported_at: string
    theme: Omit<TalosNamedTheme, 'motion' | 'ui_animation_profile' | 'ui_animation_customization'> & {
        motion_v6: TalosMotionV6Preferences
    }
}

export const TALOS_DEFAULT_THEME: TalosThemeId = 'calm'











export const TALOS_THEME_AREA_TOKEN_OPTIONS: Array<{ value: TalosThemeAreaTokenKey; label: string }> = [
    { value: 'background', label: 'Background' },
    { value: 'surface', label: 'Surface' },
    { value: 'text', label: 'Text' },
    { value: 'muted', label: 'Muted text' },
    { value: 'border', label: 'Border' },
    { value: 'accent', label: 'Accent' },
]

export const TALOS_THEME_FONT_OPTIONS: Array<{ value: TalosThemeFont; label: string }> = [
    { value: 'inter', label: 'Instrument Sans' },
    { value: 'manrope', label: 'Manrope' },
    { value: 'mono', label: 'Operator mono' },
    { value: 'system', label: 'System UI' },
    { value: 'display', label: 'Sora Display' },
    { value: 'serif', label: 'Source Serif 4' },
]

export const TALOS_THEME_DENSITY_OPTIONS: Array<{ value: TalosThemeDensity; label: string }> = [
    { value: 'compact', label: 'Compact' },
    { value: 'comfortable', label: 'Comfortable' },
    { value: 'spacious', label: 'Spacious' },
]

export const TALOS_THEME_RADIUS_OPTIONS: Array<{ value: TalosThemeRadius; label: string }> = [
    { value: 'sharp', label: 'Sharp' },
    { value: 'balanced', label: 'Balanced' },
    { value: 'soft', label: 'Soft' },
]

function themePoster(theme: TalosThemeId) {
    return `/talos/backgrounds/${theme}-poster.webp`
}

export const TALOS_THEME_PRESETS: TalosThemePreset[] = [
    {
        id: 'forge',
        label: 'AVM Forge',
        shortLabel: 'Forge',
        description: 'Industrial control surface for execution, traces and recovery.',
        mood: 'Graphite, amber, cyan',
        motion: 'DAG pulse',
        defaultDensity: 'compact',
        defaultRadius: 'balanced',
        defaultMotion: 'normal',
        isLight: false,
        fontUi: 'Instrument Sans',
        fontMono: 'JetBrains Mono',
        preview: { background: '#080b11', accent: '#c98b32', secondary: '#6ad4d4', line: '#27313e' },
        poster: themePoster('forge'),
        defaultEffect: 'dag-flow',
    },
    {
        id: 'paper',
        label: 'Paper Review',
        shortLabel: 'Paper',
        description: 'Bright review mode for reports, audit trails and long reading.',
        mood: 'Ivory, ink, copper',
        motion: 'Calm grid',
        defaultDensity: 'spacious',
        defaultRadius: 'balanced',
        defaultMotion: 'subtle',
        isLight: true,
        fontUi: 'Source Serif 4',
        fontMono: 'JetBrains Mono',
        preview: { background: '#f8fafc', accent: '#a96617', secondary: '#2f6f7d', line: '#d7dee8' },
        poster: themePoster('paper'),
        defaultEffect: 'kahn-grid',
    },
    {
        id: 'terminal',
        label: 'Terminal Operator',
        shortLabel: 'Terminal',
        description: 'Shell-first mode with mono typography and low-noise scanlines.',
        mood: 'Black, green, phosphor',
        motion: 'Scanline drift',
        defaultDensity: 'compact',
        defaultRadius: 'sharp',
        defaultMotion: 'cinematic',
        isLight: false,
        fontUi: 'JetBrains Mono',
        fontMono: 'JetBrains Mono',
        preview: { background: '#020403', accent: '#63f08e', secondary: '#d6ff72', line: '#163821' },
        poster: themePoster('terminal'),
        defaultEffect: 'trace-rain',
    },
    {
        id: 'aurora',
        label: 'Aurora Research',
        shortLabel: 'Aurora',
        description: 'Exploratory workspace for research, synthesis and creative branching.',
        mood: 'Teal, magenta, midnight',
        motion: 'Soft ribbons',
        defaultDensity: 'comfortable',
        defaultRadius: 'soft',
        defaultMotion: 'normal',
        isLight: false,
        fontUi: 'Manrope',
        fontMono: 'JetBrains Mono',
        preview: { background: '#071113', accent: '#42e7c7', secondary: '#ff6bb5', line: '#233742' },
        poster: themePoster('aurora'),
        defaultEffect: 'signal-mesh',
    },
    {
        id: 'glacier',
        label: 'Glacier Desk',
        shortLabel: 'Glacier',
        description: 'Cold-light enterprise theme with sharp contrast and spacious review.',
        mood: 'Ice, cobalt, orange',
        motion: 'Minimal mist',
        defaultDensity: 'spacious',
        defaultRadius: 'sharp',
        defaultMotion: 'subtle',
        isLight: true,
        fontUi: 'Instrument Sans',
        fontMono: 'JetBrains Mono',
        preview: { background: '#f4f9fb', accent: '#2367d1', secondary: '#ef7d30', line: '#c9d7e3' },
        poster: themePoster('glacier'),
        defaultEffect: 'kahn-grid',
    },
    {
        id: 'ember',
        label: 'Ember Incident',
        shortLabel: 'Ember',
        description: 'Incident-response mode for failures, risks and high-signal alerts.',
        mood: 'Carbon, red, gold',
        motion: 'Heat markers',
        defaultDensity: 'compact',
        defaultRadius: 'sharp',
        defaultMotion: 'cinematic',
        isLight: false,
        fontUi: 'Instrument Sans',
        fontMono: 'JetBrains Mono',
        preview: { background: '#10090a', accent: '#ff5c62', secondary: '#ffbd5c', line: '#3b2224' },
        poster: themePoster('ember'),
        defaultEffect: 'trace-rain',
    },
    {
        id: 'atlas',
        label: 'Atlas Enterprise',
        shortLabel: 'Atlas',
        description: 'Boardroom-grade cockpit with measured color and calm density.',
        mood: 'Navy, copper, emerald',
        motion: 'Map grid',
        defaultDensity: 'comfortable',
        defaultRadius: 'balanced',
        defaultMotion: 'subtle',
        isLight: false,
        fontUi: 'Manrope',
        fontMono: 'JetBrains Mono',
        preview: { background: '#07101f', accent: '#d49a52', secondary: '#57d49c', line: '#243146' },
        poster: themePoster('atlas'),
        defaultEffect: 'signal-mesh',
    },
    {
        id: 'noir',
        label: 'Noir Contrast',
        shortLabel: 'Noir',
        description: 'High-contrast inspection surface for dense operational review.',
        mood: 'Black, white, red',
        motion: 'Hard edges',
        defaultDensity: 'compact',
        defaultRadius: 'sharp',
        defaultMotion: 'subtle',
        isLight: false,
        fontUi: 'Instrument Sans',
        fontMono: 'JetBrains Mono',
        preview: { background: '#050505', accent: '#f2f2f2', secondary: '#ff405a', line: '#333333' },
        poster: themePoster('noir'),
        defaultEffect: 'trace-rain',
    },
    {
        id: 'signal',
        label: 'Signal Command',
        shortLabel: 'Signal',
        description: 'Command-center theme for fast triage, live status and action.',
        mood: 'Charcoal, coral, lime',
        motion: 'Telemetry lines',
        defaultDensity: 'compact',
        defaultRadius: 'balanced',
        defaultMotion: 'cinematic',
        isLight: false,
        fontUi: 'Manrope',
        fontMono: 'JetBrains Mono',
        preview: { background: '#091011', accent: '#ff6f61', secondary: '#b4f06f', line: '#213236' },
        poster: themePoster('signal'),
        defaultEffect: 'signal-mesh',
    },
    {
        id: 'violet',
        label: 'Violet Lab',
        shortLabel: 'Violet',
        description: 'Deep-research lab mode with softer focus and experimental tone.',
        mood: 'Indigo, violet, mint',
        motion: 'Particle field',
        defaultDensity: 'comfortable',
        defaultRadius: 'soft',
        defaultMotion: 'normal',
        isLight: false,
        fontUi: 'Sora',
        fontMono: 'JetBrains Mono',
        preview: { background: '#0d0a19', accent: '#b794f6', secondary: '#6ee7b7', line: '#2f2848' },
        poster: themePoster('violet'),
        defaultEffect: 'dag-flow',
    },
    {
        id: 'claudius',
        label: 'Claudius Review',
        shortLabel: 'Claudius',
        description: 'Warm document-first assistant surface inspired by Claude-style review flows.',
        mood: 'Cod gray, pampas, clay',
        motion: 'Soft proof grid',
        defaultDensity: 'spacious',
        defaultRadius: 'soft',
        defaultMotion: 'subtle',
        isLight: true,
        fontUi: 'Source Serif 4',
        fontMono: 'JetBrains Mono',
        preview: { background: '#faf9f5', accent: '#d97757', secondary: '#6a9bcc', line: '#e8e6dc' },
        poster: themePoster('claudius'),
        defaultEffect: 'kahn-grid',
    },
    {
        id: 'basicus',
        label: 'Basicus Material',
        shortLabel: 'Basicus',
        description: 'Generic Material-style baseline for familiar enterprise forms and predictable controls.',
        mood: 'Paper, Roboto, blue',
        motion: 'System grid',
        defaultDensity: 'comfortable',
        defaultRadius: 'sharp',
        defaultMotion: 'normal',
        isLight: true,
        fontUi: 'Instrument Sans',
        fontMono: 'JetBrains Mono',
        preview: { background: '#fafafa', accent: '#1976d2', secondary: '#9c27b0', line: '#e0e0e0' },
        poster: themePoster('basicus'),
        defaultEffect: 'kahn-grid',
    },
    {
        id: 'telemetry',
        label: 'Telemetry',
        shortLabel: 'Telemetry',
        description: 'v7 instrument deck: mono chrome, cyan rules and tabular readouts.',
        mood: 'Graphite, instrument cyan, signal green',
        motion: 'Rule sweep',
        defaultDensity: 'comfortable',
        defaultRadius: 'sharp',
        defaultMotion: 'subtle',
        isLight: false,
        fontUi: 'Instrument Sans',
        fontMono: 'JetBrains Mono',
        preview: { background: '#0b0f11', accent: '#6ad4d4', secondary: '#63f08e', line: '#1f3238' },
        poster: themePoster('telemetry'),
        defaultEffect: 'signal-mesh',
    },
    {
        // Ribrand-soft default (F1-T2): quiet surfaces, refined TALOS gold as
        // a sparing signature accent, no procedural decoration by default.
        // R1 (owner): backgrounds shifted from warm charcoal to NEUTRAL GREY —
        // gold stays accent-only; the launcher icon bg mirrors this seed.
        id: 'calm',
        label: 'Calm',
        shortLabel: 'Calm',
        description: 'Quiet grey surfaces, typography-led hierarchy, gold kept as a sparing signature.',
        mood: 'Grey paper, graphite, refined bronze',
        motion: 'Subtle micro-motion',
        defaultDensity: 'comfortable',
        defaultRadius: 'soft',
        defaultMotion: 'subtle',
        isLight: false,
        fontUi: 'Instrument Sans',
        fontMono: 'JetBrains Mono',
        preview: { background: '#1e1f22', accent: '#c08b3c', secondary: '#8e9095', line: '#36373b' },
        poster: themePoster('calm'),
        defaultEffect: 'none',
    },
]

const THEME_BY_ID = new Map(TALOS_THEME_PRESETS.map((theme) => [theme.id, theme]))

export function isTalosThemeId(value: unknown): value is TalosThemeId {
    return typeof value === 'string' && TALOS_THEME_IDS.includes(value as TalosThemeId)
}

export function normalizeTalosTheme(value: unknown): TalosThemeId {
    if (value === 'dark') {
        return 'forge'
    }

    if (value === 'light') {
        return 'paper'
    }

    return isTalosThemeId(value) ? value : TALOS_DEFAULT_THEME
}

export function talosThemeClass(theme: TalosThemeId) {
    return `talos-theme-${theme}`
}

export function talosThemePreset(theme: TalosThemeId): TalosThemePreset {
    return THEME_BY_ID.get(theme) ?? TALOS_THEME_PRESETS[0]
}

export function talosThemeIsLight(theme: TalosThemeId) {
    return talosThemePreset(theme).isLight
}

export function resolveTalosThemeMode(value: unknown): TalosThemeMode {
    return MODE_VALUES.has(value as TalosThemeMode) ? value as TalosThemeMode : 'system'
}

export function effectiveTalosThemeMode(
    theme: TalosThemeId,
    mode: TalosThemeMode,
    systemPrefersDark: boolean | null | undefined,
): TalosResolvedThemeMode {
    if (mode === 'dark' || mode === 'light') {
        return mode
    }

    if (typeof systemPrefersDark === 'boolean') {
        return systemPrefersDark ? 'dark' : 'light'
    }

    return talosThemeIsLight(theme) ? 'light' : 'dark'
}

function mixColor(color: string, amount: number, target: string) {
    return `color-mix(in srgb, ${color} ${amount}%, ${target})`
}

function accessibleAccentHover(accent: string) {
    const foreground = talosReadableForeground(accent)
    const target = foreground === '#ffffff' ? '#000000' : '#ffffff'

    for (const amount of [90, 84, 78]) {
        const candidate = mixColor(accent, amount, target)
        if (talosContrastRatio(candidate, foreground) >= 4.5) return candidate
    }

    return accent
}

function accessibleFocusRing(accent: string, surface: string) {
    if (talosContrastRatio(accent, surface) >= 3) return accent

    const darkRatio = talosContrastRatio('#000000', surface)
    const lightRatio = talosContrastRatio('#ffffff', surface)
    return darkRatio >= lightRatio ? '#000000' : '#ffffff'
}

function fontFamily(value: string, fallback: string) {
    const name = value.includes(' ') ? `"${value}"` : value
    return `${name}, ${fallback}`
}

function talosThemeFontStyle(preset: TalosThemePreset): Record<string, string> {
    return {
        '--talos-font-ui': fontFamily(preset.fontUi, 'ui-sans-serif, system-ui, sans-serif'),
        '--talos-font-display': fontFamily(preset.fontUi, 'ui-sans-serif, system-ui, sans-serif'),
        '--talos-font-mono': fontFamily(preset.fontMono, 'ui-monospace, monospace'),
    }
}

function talosStatusStyle(mode: TalosResolvedThemeMode, background: string): Record<string, string> {
    const light = mode === 'light'
    const surfaceTarget = light ? '#ffffff' : background
    const successSoft = mixColor(light ? '#16a34a' : '#22c55e', light ? 10 : 15, surfaceTarget)
    const warningSoft = mixColor('#f59e0b', light ? 12 : 16, surfaceTarget)
    const dangerSoft = mixColor(light ? '#dc2626' : '#ef4444', light ? 10 : 15, surfaceTarget)
    const infoSoft = mixColor(light ? '#2563eb' : '#60a5fa', light ? 10 : 15, surfaceTarget)
    const borderTarget = light ? '#d7dee8' : '#111827'
    const borderWeight = light ? 44 : 45
    const success = talosReadableForeground(successSoft, '#14532d', '#dcfce7')
    const warning = talosReadableForeground(warningSoft, '#713f12', '#fef3c7')
    const danger = talosReadableForeground(dangerSoft, '#7f1d1d', '#fee2e2')
    const info = talosReadableForeground(infoSoft, '#1e3a8a', '#dbeafe')

    return {
        '--talos-success': success,
        '--talos-success-soft': successSoft,
        '--talos-success-border': mixColor(light ? '#16a34a' : '#22c55e', borderWeight, borderTarget),
        '--talos-warning': warning,
        '--talos-warning-soft': warningSoft,
        '--talos-warning-border': mixColor('#f59e0b', light ? 46 : 48, borderTarget),
        '--talos-danger': danger,
        '--talos-danger-soft': dangerSoft,
        '--talos-danger-border': mixColor(light ? '#dc2626' : '#ef4444', borderWeight, borderTarget),
        '--talos-info': info,
        '--talos-info-soft': infoSoft,
        '--talos-info-border': mixColor(light ? '#2563eb' : '#60a5fa', borderWeight, borderTarget),
        '--talos-system': warningSoft,
        '--talos-system-text': warning,
        '--talos-chat-error': dangerSoft,
        '--talos-chat-error-text': danger,
    }
}

function talosEffectiveAreaFallbackStyle(style: Record<string, string>) {
    const tokenMap: Record<string, string> = {
        background: '--talos-background',
        sidebar: '--talos-sidebar',
        header: '--talos-header',
        panel: '--talos-panel',
        'panel-soft': '--talos-panel-soft',
        card: '--talos-card',
        'window-background': '--talos-window-bg',
        'chat-background': '--talos-chat-bg',
        'composer-background': '--talos-composer-bg',
        'composer-surface': '--talos-composer-surface',
        'composer-text': '--talos-composer-text',
        text: '--talos-text',
        muted: '--talos-muted',
        border: '--talos-border',
        'border-strong': '--talos-border-strong',
        accent: '--talos-accent',
        'accent-text': '--talos-accent-text',
        secondary: '--talos-secondary',
        active: '--talos-active',
        'code-background': '--talos-code-bg',
        'code-surface': '--talos-code-surface',
        'code-text': '--talos-code-text',
        'code-border': '--talos-code-border',
    }
    const fallbacks = Object.fromEntries(Object.entries(tokenMap).flatMap(([name, token]) => (
        style[token] ? [[`--talos-effective-${name}`, style[token]]] : []
    )))

    return { ...style, ...fallbacks }
}

export function talosThemeModeVariantStyle(theme: TalosThemeId, mode: TalosResolvedThemeMode): Record<string, string> {
    const preset = talosThemePreset(theme)
    const accent = preset.preview.accent
    const secondary = preset.preview.secondary
    const line = preset.preview.line

    if (mode === 'light') {
        // R1 (owner): calm light surfaces are NEUTRAL grey-white — the generic
        // accent tint would warm them back toward cream.
        const background = preset.isLight
            ? preset.preview.background
            : preset.id === 'calm' ? '#f1f2f4' : mixColor(accent, 5, '#f8fafc')
        const panel = mixColor(background, 92, '#ffffff')
        const text = '#111827'
        const muted = mixColor(text, 68, background)
        const user = mixColor(accent, 88, '#ffffff')

        return talosEffectiveAreaFallbackStyle({
            ...talosThemeFontStyle(preset),
            ...talosStatusStyle(mode, background),
            '--talos-background': background,
            '--talos-sidebar': mixColor(background, 92, '#ffffff'),
            '--talos-header': mixColor(background, 88, '#ffffff'),
            '--talos-panel': panel,
            '--talos-panel-soft': mixColor(background, 78, '#ffffff'),
            '--talos-card': mixColor(panel, 96, '#ffffff'),
            '--talos-window-bg': mixColor(panel, 96, '#ffffff'),
            '--talos-chat-bg': background,
            '--talos-composer-bg': mixColor(panel, 95, '#ffffff'),
            '--talos-composer-surface': panel,
            '--talos-composer-text': text,
            '--talos-text': text,
            '--talos-muted': muted,
            '--talos-border': mixColor(line, 72, '#d7dee8'),
            '--talos-border-strong': mixColor(line, 86, '#9aa7b8'),
            '--talos-input': mixColor(line, 82, '#cbd5e1'),
            '--talos-active': mixColor(accent, 10, '#ffffff'),
            '--talos-secondary': mixColor(secondary, 16, '#ffffff'),
            '--talos-accent': accent,
            '--talos-accent-border': mixColor(accent, 74, '#1f2937'),
            '--talos-accent-hover': accessibleAccentHover(accent),
            '--talos-accent-soft': mixColor(accent, 13, background),
            '--talos-accent-text': talosReadableForeground(accent),
            '--talos-ring': accessibleFocusRing(accent, panel),
            '--talos-ring-soft': mixColor(accessibleFocusRing(accent, panel), 22, 'transparent'),
            '--talos-user': user,
            '--talos-user-text': talosReadableForeground(user, '#000000'),
            '--talos-assistant': mixColor(panel, 96, '#ffffff'),
            '--talos-assistant-text': text,
            '--talos-code-bg': mixColor(background, 74, '#ffffff'),
            '--talos-code-surface': mixColor(panel, 92, '#ffffff'),
            '--talos-code-text': text,
            '--talos-code-border': mixColor(line, 70, '#d7dee8'),
            '--talos-workspace-glow-a': mixColor(secondary, 10, 'transparent'),
            '--talos-workspace-glow-b': mixColor(accent, 8, 'transparent'),
            '--talos-grid-color': mixColor(line, 18, 'transparent'),
            '--talos-line-a': mixColor(secondary, 34, 'transparent'),
            '--talos-line-b': mixColor(accent, 32, 'transparent'),
            '--talos-node': mixColor(secondary, 54, 'transparent'),
        })
    }

    const background = preset.isLight ? mixColor(accent, 10, '#06080d') : preset.preview.background
    const panel = mixColor(background, 86, '#141a24')
    const text = '#edf2f7'
    const user = mixColor(accent, 84, '#f8fbff')

    return talosEffectiveAreaFallbackStyle({
        ...talosThemeFontStyle(preset),
        ...talosStatusStyle(mode, background),
        '--talos-background': background,
        '--talos-sidebar': mixColor(background, 92, '#02060b'),
        '--talos-header': mixColor(background, 90, '#02060b'),
        '--talos-panel': panel,
        '--talos-panel-soft': mixColor(panel, 74, '#05070b'),
        '--talos-card': mixColor(panel, 88, '#05070b'),
        '--talos-window-bg': mixColor(panel, 92, '#05070b'),
        '--talos-chat-bg': background,
        '--talos-composer-bg': mixColor(panel, 84, '#05070b'),
        '--talos-composer-surface': panel,
        '--talos-composer-text': text,
        '--talos-text': text,
        '--talos-muted': mixColor(text, 68, background),
        '--talos-border': mixColor(line, 74, '#111827'),
        '--talos-border-strong': mixColor(line, 82, '#dce7f5'),
        '--talos-input': mixColor(line, 76, '#111827'),
        '--talos-active': mixColor(accent, 14, background),
        '--talos-secondary': mixColor(secondary, 16, background),
        '--talos-accent': accent,
        '--talos-accent-border': mixColor(accent, 78, '#05070b'),
        '--talos-accent-hover': accessibleAccentHover(accent),
        '--talos-accent-soft': mixColor(accent, 18, background),
        '--talos-accent-text': talosReadableForeground(accent),
        '--talos-ring': accessibleFocusRing(accent, panel),
        '--talos-ring-soft': mixColor(accessibleFocusRing(accent, panel), 22, 'transparent'),
        '--talos-user': user,
        '--talos-user-text': talosReadableForeground(user, '#000000'),
        '--talos-assistant': mixColor(panel, 94, '#05070b'),
        '--talos-assistant-text': text,
        '--talos-code-bg': mixColor(background, 84, '#05070b'),
        '--talos-code-surface': mixColor(panel, 92, '#05070b'),
        '--talos-code-text': text,
        '--talos-code-border': mixColor(line, 64, '#111827'),
        '--talos-workspace-glow-a': mixColor(secondary, 10, 'transparent'),
        '--talos-workspace-glow-b': mixColor(accent, 8, 'transparent'),
        '--talos-grid-color': mixColor(line, 16, 'transparent'),
        '--talos-line-a': mixColor(secondary, 34, 'transparent'),
        '--talos-line-b': mixColor(accent, 36, 'transparent'),
        '--talos-node': mixColor(secondary, 58, 'transparent'),
    })
}

export function talosThemeNormalTextContrast(
    theme: TalosThemeId,
    mode: TalosResolvedThemeMode,
): TalosContrastValidationResult {
    const style = talosThemeModeVariantStyle(theme, mode)
    return validateTalosNormalTextPairs(talosNormalTextPairsFromStyle(style), style)
}

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i
const BACKGROUND_EFFECTS = new Set<TalosBackgroundEffect>(['dag-flow', 'kahn-grid', 'trace-rain', 'signal-mesh', 'none'])
const FONT_VALUES = new Set(TALOS_THEME_FONT_OPTIONS.map((font) => font.value))
const DENSITY_VALUES = new Set(TALOS_THEME_DENSITY_OPTIONS.map((density) => density.value))
const RADIUS_VALUES = new Set(TALOS_THEME_RADIUS_OPTIONS.map((radius) => radius.value))
const MODE_VALUES = new Set<TalosThemeMode>(['system', 'dark', 'light'])
const MOTION_VALUES = new Set<TalosThemeMotionMode>(['system', 'off', 'subtle', 'normal', 'cinematic'])
const UI_ANIMATION_PROFILE_VALUES = new Set<TalosUiAnimationProfile>(['preset', 'minimal', 'expressive', 'custom', 'off'])
const UI_ANIMATION_OPEN_CLOSE_VALUES = new Set<TalosUiAnimationOpenClose>(['instant', 'standard', 'depth', 'terminal-snap', 'soft-fade'])
const UI_ANIMATION_SURFACE_VALUES = new Set<TalosUiAnimationSurfaceTransition>(['fade', 'slide-fade', 'scale-fade', 'scanline', 'axis-shift'])
const UI_ANIMATION_FEEDBACK_VALUES = new Set<TalosUiAnimationFeedback>(['none', 'pulse', 'trace', 'edge-flash', 'status-lock'])
const UI_ANIMATION_HOVER_VALUES = new Set<TalosUiAnimationHover>(['none', 'lift', 'edge-glow', 'underline', 'node-glow'])
const UI_ANIMATION_EASING_VALUES = new Set<TalosUiAnimationEasing>(['precise', 'soft', 'elastic-light', 'linear', 'cinematic'])
const AREA_VALUES = new Set<TalosThemeAreaId>(['sidebar', 'chat', 'composer', 'window', 'header', 'button', 'card', 'code'])
const AREA_TOKEN_VALUES = new Set(TALOS_THEME_AREA_TOKEN_OPTIONS.map((token) => token.value))

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeHex(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined
    }

    const normalized = value.trim()

    return HEX_COLOR_PATTERN.test(normalized) ? normalized.toLowerCase() : undefined
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>): T | undefined {
    return typeof value === 'string' && allowed.has(value as T) ? value as T : undefined
}

function clampIntensity(value: unknown): number | undefined {
    const numeric = typeof value === 'number' ? value : Number(value)

    if (!Number.isFinite(numeric)) {
        return undefined
    }

    return Math.min(100, Math.max(0, Math.round(numeric)))
}

function clampInteger(value: unknown, min: number, max: number): number | undefined {
    const numeric = typeof value === 'number' ? value : Number(value)

    if (!Number.isFinite(numeric)) {
        return undefined
    }

    return Math.min(max, Math.max(min, Math.round(numeric)))
}

function cleanThemeId(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined
    }

    const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

    return cleaned || undefined
}

export function sanitizeTalosThemeCustomization(value: unknown): TalosThemeCustomization {
    if (!isRecord(value)) {
        return {}
    }

    const customization: TalosThemeCustomization = {}
    const colorKeys = ['background', 'panel', 'text', 'accent', 'secondary', 'border'] as const

    for (const key of colorKeys) {
        const color = normalizeHex(value[key])
        if (color) {
            customization[key] = color
        }
    }

    const font = enumValue(value.font, FONT_VALUES)
    if (font) {
        customization.font = font
    }

    const density = enumValue(value.density, DENSITY_VALUES)
    if (density) {
        customization.density = density
    }

    const radius = enumValue(value.radius, RADIUS_VALUES)
    if (radius) {
        customization.radius = radius
    }

    const effect = enumValue(value.effect, BACKGROUND_EFFECTS)
    if (effect) {
        customization.effect = effect
    }

    const intensity = clampIntensity(value.effect_intensity)
    if (intensity !== undefined) {
        customization.effect_intensity = intensity
    }

    const scrollbarTrack = normalizeHex(value.scrollbar_track)
    if (scrollbarTrack) {
        customization.scrollbar_track = scrollbarTrack
    }

    const scrollbarThumb = normalizeHex(value.scrollbar_thumb)
    if (scrollbarThumb) {
        customization.scrollbar_thumb = scrollbarThumb
    }

    const scrollbarThumbHover = normalizeHex(value.scrollbar_thumb_hover)
    if (scrollbarThumbHover) {
        customization.scrollbar_thumb_hover = scrollbarThumbHover
    }

    const scrollbarWidth = clampInteger(value.scrollbar_width, 6, 18)
    if (scrollbarWidth !== undefined) {
        customization.scrollbar_width = scrollbarWidth
    }

    return customization
}

export function resolveTalosUiAnimationProfile(value: unknown): TalosUiAnimationProfile {
    return enumValue(value, UI_ANIMATION_PROFILE_VALUES) ?? 'preset'
}

export function sanitizeTalosUiAnimationCustomization(value: unknown): TalosUiAnimationCustomization {
    if (!isRecord(value)) {
        return {}
    }

    const customization: TalosUiAnimationCustomization = {}
    const openClose = enumValue(value.open_close, UI_ANIMATION_OPEN_CLOSE_VALUES)
    const surfaceTransition = enumValue(value.surface_transition, UI_ANIMATION_SURFACE_VALUES)
    const feedback = enumValue(value.feedback, UI_ANIMATION_FEEDBACK_VALUES)
    const hover = enumValue(value.hover, UI_ANIMATION_HOVER_VALUES)
    const easing = enumValue(value.easing, UI_ANIMATION_EASING_VALUES)
    const durationScale = clampInteger(value.duration_scale, 50, 150)
    const intensity = clampInteger(value.intensity, 0, 100)
    const stagger = clampInteger(value.stagger, 0, 120)

    if (openClose) {
        customization.open_close = openClose
    }

    if (surfaceTransition) {
        customization.surface_transition = surfaceTransition
    }

    if (feedback) {
        customization.feedback = feedback
    }

    if (hover) {
        customization.hover = hover
    }

    if (durationScale !== undefined) {
        customization.duration_scale = durationScale
    }

    if (intensity !== undefined) {
        customization.intensity = intensity
    }

    if (easing) {
        customization.easing = easing
    }

    if (stagger !== undefined) {
        customization.stagger = stagger
    }

    return customization
}

export function sanitizeTalosThemeAreaTokens(value: unknown): TalosThemeAreaTokens {
    if (!isRecord(value)) {
        return {}
    }

    const areaTokens: TalosThemeAreaTokens = {}

    for (const [area, tokens] of Object.entries(value)) {
        if (!AREA_VALUES.has(area as TalosThemeAreaId) || !isRecord(tokens)) {
            continue
        }

        const safeTokens: Partial<Record<TalosThemeAreaTokenKey, string>> = {}
        for (const [key, tokenValue] of Object.entries(tokens)) {
            if (!AREA_TOKEN_VALUES.has(key as TalosThemeAreaTokenKey)) {
                continue
            }

            const color = normalizeHex(tokenValue)
            if (color) {
                safeTokens[key as TalosThemeAreaTokenKey] = color
            }
        }

        if (Object.keys(safeTokens).length > 0) {
            areaTokens[area as TalosThemeAreaId] = safeTokens
        }
    }

    return areaTokens
}

export function resolveTalosMotionMode(value: unknown): TalosThemeMotionMode {
    return enumValue(value, MOTION_VALUES) ?? 'system'
}

export function sanitizeTalosNamedTheme(value: unknown): TalosNamedTheme | null {
    if (!isRecord(value)) {
        return null
    }

    const id = cleanThemeId(value.id)
    const name = typeof value.name === 'string' ? value.name.trim().slice(0, 80) : ''

    if (!id || !name) {
        return null
    }

    const theme: TalosNamedTheme = {
        id,
        name,
        base_theme: normalizeTalosTheme(value.base_theme),
        tokens: sanitizeTalosThemeCustomization(value.tokens),
    }

    const areaTokens = sanitizeTalosThemeAreaTokens(value.area_tokens)
    if (Object.keys(areaTokens).length > 0) {
        theme.area_tokens = areaTokens
    }

    const themeMode = enumValue(value.theme_mode, MODE_VALUES)
    if (themeMode) {
        theme.theme_mode = themeMode
    }

    const motion = enumValue(value.motion, MOTION_VALUES)
    if (motion) {
        theme.motion = motion
    }

    if (Object.hasOwn(value, 'motion_v6')) {
        const parsedMotion = parseTalosMotionV6Preferences(value.motion_v6)
        if (!parsedMotion.success) return null
        theme.motion_v6 = parsedMotion.value
    }

    const uiAnimationProfile = enumValue(value.ui_animation_profile, UI_ANIMATION_PROFILE_VALUES)
    if (uiAnimationProfile) {
        theme.ui_animation_profile = uiAnimationProfile
    }

    const uiAnimationCustomization = sanitizeTalosUiAnimationCustomization(value.ui_animation_customization)
    if (Object.keys(uiAnimationCustomization).length > 0) {
        theme.ui_animation_customization = uiAnimationCustomization
    }

    if (isRecord(value.chat_layout)) {
        theme.chat_layout = sanitizeTalosChatLayout(value.chat_layout)
    }

    if (typeof value.created_at === 'string') {
        theme.created_at = value.created_at
    }

    if (typeof value.updated_at === 'string') {
        theme.updated_at = value.updated_at
    }

    return theme
}

export function sanitizeTalosThemeLibrary(value: unknown): TalosNamedTheme[] {
    if (!Array.isArray(value)) {
        return []
    }

    const seen = new Set<string>()
    const library: TalosNamedTheme[] = []

    for (const item of value) {
        const theme = sanitizeTalosNamedTheme(item)
        if (!theme || seen.has(theme.id)) {
            continue
        }

        seen.add(theme.id)
        library.push(theme)
    }

    return library
}

export function parseTalosThemeExport(value: unknown): TalosNamedTheme | null {
    if (
        !isRecord(value)
        || !Object.hasOwn(value, 'schema')
        || (value.schema !== 'talos_theme_export_v1' && value.schema !== 'talos_theme_export_v2')
        || !Object.hasOwn(value, 'theme')
        || !isRecord(value.theme)
    ) {
        return null
    }

    if (value.schema === 'talos_theme_export_v2' && !Object.hasOwn(value.theme, 'motion_v6')) return null

    if (
        !Object.hasOwn(value.theme, 'base_theme')
        || !isTalosThemeId(value.theme.base_theme)
        || !Object.hasOwn(value.theme, 'tokens')
        || !isRecord(value.theme.tokens)
    ) {
        return null
    }

    const theme = sanitizeTalosNamedTheme(value.theme)
    if (!theme || !validateTalosThemeCustomizationContrast(theme.tokens, theme.base_theme).valid) {
        return null
    }

    return theme
}

export function buildTalosThemeExport(theme: TalosNamedTheme): TalosThemeExportV2 {
    const motionV6 = theme.motion_v6
        ? parseTalosMotionV6Preferences(theme.motion_v6)
        : { success: true as const, value: createDefaultTalosMotionV6Preferences() }
    if (!motionV6.success) throw new TypeError('Cannot export an invalid Motion V6 theme payload.')
    const {
        motion: _legacyMotion,
        ui_animation_profile: _legacyUiProfile,
        ui_animation_customization: _legacyUiCustomization,
        ...portableTheme
    } = theme
    return {
        schema: 'talos_theme_export_v2',
        exported_at: new Date().toISOString(),
        theme: { ...portableTheme, motion_v6: motionV6.value },
    }
}

export function talosThemeAreaTokenStyle(areaTokens: TalosThemeAreaTokens): Record<string, string> {
    const style: Record<string, string> = {}

    for (const [area, tokens] of Object.entries(areaTokens) as Array<[TalosThemeAreaId, Partial<Record<TalosThemeAreaTokenKey, string>>]>) {
        for (const [key, value] of Object.entries(tokens) as Array<[TalosThemeAreaTokenKey, string]>) {
            style[`--talos-area-${area}-${key}`] = value
            if (key === 'accent') style[`--talos-area-${area}-accent-text`] = talosReadableForeground(value)
        }
    }

    return style
}

export function talosThemeCustomizationStyle(customization: TalosThemeCustomization): Record<string, string> {
    const style: Record<string, string> = {}

    if (customization.background) {
        style['--talos-background'] = customization.background
        style['--talos-sidebar'] = customization.background
        style['--talos-header'] = `color-mix(in srgb, ${customization.background} 88%, black)`
        style['--talos-effective-background'] = style['--talos-background']
        style['--talos-effective-sidebar'] = style['--talos-sidebar']
        style['--talos-effective-header'] = style['--talos-header']
    }

    if (customization.panel) {
        style['--talos-panel'] = customization.panel
        style['--talos-card'] = customization.panel
        style['--talos-panel-soft'] = customization.background
            ? `color-mix(in srgb, ${customization.panel} 72%, ${customization.background})`
            : `color-mix(in srgb, ${customization.panel} 84%, black)`
        style['--talos-secondary'] = `color-mix(in srgb, ${customization.panel} 78%, ${customization.accent ?? '#c98b32'})`
        style['--talos-effective-panel'] = style['--talos-panel']
        style['--talos-effective-card'] = style['--talos-card']
        style['--talos-effective-panel-soft'] = style['--talos-panel-soft']
        style['--talos-effective-secondary'] = style['--talos-secondary']
    }

    if (customization.text) {
        style['--talos-text'] = customization.text
        style['--talos-muted'] = `color-mix(in srgb, ${customization.text} 68%, ${customization.background ?? 'var(--talos-background)'})`
        style['--talos-effective-text'] = style['--talos-text']
        style['--talos-effective-muted'] = style['--talos-muted']
    }

    if (customization.accent) {
        style['--talos-accent'] = customization.accent
        style['--talos-accent-text'] = talosReadableForeground(customization.accent)
        style['--talos-accent-border'] = `color-mix(in srgb, ${customization.accent} 78%, black)`
        style['--talos-accent-hover'] = accessibleAccentHover(customization.accent)
        style['--talos-accent-soft'] = `color-mix(in srgb, ${customization.accent} 18%, ${customization.background ?? 'var(--talos-background)'})`
        style['--talos-ring'] = customization.accent
        style['--talos-ring-soft'] = `color-mix(in srgb, ${customization.accent} 22%, transparent)`
        style['--talos-line-b'] = `color-mix(in srgb, ${customization.accent} 42%, transparent)`
        style['--talos-effective-accent'] = style['--talos-accent']
        style['--talos-effective-accent-text'] = style['--talos-accent-text']
    }

    if (customization.secondary) {
        style['--talos-line-a'] = `color-mix(in srgb, ${customization.secondary} 42%, transparent)`
        style['--talos-node'] = `color-mix(in srgb, ${customization.secondary} 68%, transparent)`
        style['--talos-workspace-glow-a'] = `color-mix(in srgb, ${customization.secondary} 12%, transparent)`
        style['--talos-grid-color'] = `color-mix(in srgb, ${customization.secondary} 12%, transparent)`
    }

    if (customization.border) {
        style['--talos-border'] = customization.border
        style['--talos-border-strong'] = `color-mix(in srgb, ${customization.border} 72%, ${customization.text ?? 'white'})`
        style['--talos-input'] = customization.border
        style['--talos-effective-border'] = style['--talos-border']
        style['--talos-effective-border-strong'] = style['--talos-border-strong']
    }

    if (customization.font === 'inter') {
        style['--talos-font-ui'] = '"Instrument Sans", ui-sans-serif, system-ui, sans-serif'
        style['--talos-font-display'] = '"Instrument Sans", ui-sans-serif, system-ui, sans-serif'
    } else if (customization.font === 'manrope') {
        style['--talos-font-ui'] = 'Manrope, "Instrument Sans", ui-sans-serif, sans-serif'
        style['--talos-font-display'] = 'Manrope, "Instrument Sans", ui-sans-serif, sans-serif'
    } else if (customization.font === 'mono') {
        style['--talos-font-ui'] = '"JetBrains Mono", ui-monospace, monospace'
        style['--talos-font-display'] = '"JetBrains Mono", ui-monospace, monospace'
    } else if (customization.font === 'system') {
        style['--talos-font-ui'] = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        style['--talos-font-display'] = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    } else if (customization.font === 'display') {
        style['--talos-font-ui'] = 'Sora, ui-sans-serif, system-ui, sans-serif'
        style['--talos-font-display'] = 'Sora, ui-sans-serif, system-ui, sans-serif'
    } else if (customization.font === 'serif') {
        style['--talos-font-ui'] = '"Source Serif 4", "Instrument Sans", ui-serif, serif'
        style['--talos-font-display'] = '"Source Serif 4", "Instrument Sans", ui-serif, serif'
    }

    if (customization.density) {
        const layout = TALOS_LAYOUT_DENSITY_SCALE[customization.density]
        style['--talos-space-page'] = layout.page
        style['--talos-space-section'] = layout.section
        style['--talos-space-card'] = layout.card
        style['--talos-space-control'] = layout.control
        style['--talos-space-inline'] = layout.inline
        style['--talos-icon-size'] = layout.icon
        style['--talos-touch-target'] = layout.touchTarget
    }

    if (customization.radius) {
        const radius = TALOS_COMPONENT_RADIUS_SCALE[customization.radius]
        style['--talos-radius-card'] = radius.radiusCard
        style['--talos-radius-control'] = radius.radiusControl
    }

    if (customization.scrollbar_track) {
        style['--talos-scrollbar-track'] = customization.scrollbar_track
    }

    if (customization.scrollbar_thumb) {
        style['--talos-scrollbar-thumb'] = customization.scrollbar_thumb
    }

    if (customization.scrollbar_thumb_hover) {
        style['--talos-scrollbar-thumb-hover'] = customization.scrollbar_thumb_hover
    }

    if (customization.scrollbar_width !== undefined) {
        style['--talos-scrollbar-width'] = `${customization.scrollbar_width}px`
    }

    return style
}

export function validateTalosThemeCustomizationContrast(
    value: unknown,
    baseTheme: TalosThemeId = TALOS_DEFAULT_THEME,
): TalosContrastValidationResult {
    const customization = sanitizeTalosThemeCustomization(value)
    const errors = (['light', 'dark'] as const).flatMap((mode) => {
        const style = {
            ...talosThemeModeVariantStyle(baseTheme, mode),
            ...talosThemeCustomizationStyle(customization),
        }

        const pairs = [
            ...talosNormalTextPairsFromStyle(style),
            {
                field: 'accent-hover-text',
                foreground: style['--talos-accent-text'],
                background: style['--talos-accent-hover'],
            },
            {
                field: 'focus-ring-on-composer',
                foreground: style['--talos-ring'],
                background: style['--talos-composer-surface'],
                minimum: 3,
            },
        ]

        return validateTalosNormalTextPairs(pairs, style).errors.map((error) => ({
            ...error,
            field: `${mode}/${error.field}`,
            message: `${mode}: ${error.message}`,
        }))
    })

    return { valid: errors.length === 0, errors }
}

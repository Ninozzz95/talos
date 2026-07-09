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
] as const

export type TalosThemeId = typeof TALOS_THEME_IDS[number]

export type TalosThemePreset = {
    id: TalosThemeId
    label: string
    shortLabel: string
    description: string
    mood: string
    motion: string
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
export type TalosThemeFont = 'inter' | 'mono' | 'system' | 'display'
export type TalosThemeDensity = 'compact' | 'comfortable' | 'spacious'
export type TalosThemeRadius = 'sharp' | 'balanced' | 'soft'
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
    tokens: TalosThemeCustomization
    area_tokens?: TalosThemeAreaTokens
    motion?: TalosThemeMotionMode
    ui_animation_profile?: TalosUiAnimationProfile
    ui_animation_customization?: TalosUiAnimationCustomization
    created_at?: string
    updated_at?: string
}

export type TalosThemeExportV1 = {
    schema: 'talos_theme_export_v1'
    exported_at: string
    theme: TalosNamedTheme
}

export const TALOS_DEFAULT_THEME: TalosThemeId = 'forge'

export const TALOS_BACKGROUND_EFFECTS: Array<{ value: TalosBackgroundEffect; label: string; description: string }> = [
    { value: 'dag-flow', label: 'DAG Flow', description: 'Execution graph pulses for normal AVM work.' },
    { value: 'kahn-grid', label: 'Kahn Grid', description: 'Layered scheduling bands for topological planning.' },
    { value: 'trace-rain', label: 'Trace Rain', description: 'Vertical trace streams for replay and telemetry.' },
    { value: 'signal-mesh', label: 'Signal Mesh', description: 'Low-noise node mesh for command-center mode.' },
    { value: 'none', label: 'Solid', description: 'Static background with no procedural motion.' },
]

export const TALOS_THEME_MOTION_OPTIONS: Array<{ value: TalosThemeMotionMode; label: string; description: string }> = [
    { value: 'system', label: 'System', description: 'Follow browser and workspace reduced-motion settings.' },
    { value: 'off', label: 'Off', description: 'Disable procedural background motion.' },
    { value: 'subtle', label: 'Subtle', description: 'Low-intensity motion for long sessions.' },
    { value: 'normal', label: 'Normal', description: 'Default TALOS motion intensity.' },
    { value: 'cinematic', label: 'Cinematic', description: 'High-contrast motion for demos and review rooms.' },
]

export const TALOS_UI_ANIMATION_PROFILE_OPTIONS: Array<{ value: TalosUiAnimationProfile; label: string; description: string }> = [
    { value: 'preset', label: 'Preset', description: 'Use the motion personality attached to the active theme.' },
    { value: 'minimal', label: 'Minimal', description: 'Short fades and almost no transform for long sessions.' },
    { value: 'expressive', label: 'Expressive', description: 'Higher-depth motion for demos while staying bounded.' },
    { value: 'custom', label: 'Custom', description: 'Use the controls below for panels, commands, feedback and focus.' },
    { value: 'off', label: 'Off', description: 'Disable nonessential interface action motion.' },
]

export const TALOS_UI_ANIMATION_OPEN_CLOSE_OPTIONS: Array<{ value: TalosUiAnimationOpenClose; label: string }> = [
    { value: 'instant', label: 'Instant' },
    { value: 'standard', label: 'Standard' },
    { value: 'depth', label: 'Depth' },
    { value: 'terminal-snap', label: 'Terminal snap' },
    { value: 'soft-fade', label: 'Soft fade' },
]

export const TALOS_UI_ANIMATION_SURFACE_OPTIONS: Array<{ value: TalosUiAnimationSurfaceTransition; label: string }> = [
    { value: 'fade', label: 'Fade' },
    { value: 'slide-fade', label: 'Slide fade' },
    { value: 'scale-fade', label: 'Scale fade' },
    { value: 'scanline', label: 'Scanline' },
    { value: 'axis-shift', label: 'Axis shift' },
]

export const TALOS_UI_ANIMATION_FEEDBACK_OPTIONS: Array<{ value: TalosUiAnimationFeedback; label: string }> = [
    { value: 'none', label: 'None' },
    { value: 'pulse', label: 'Pulse' },
    { value: 'trace', label: 'Trace' },
    { value: 'edge-flash', label: 'Edge flash' },
    { value: 'status-lock', label: 'Status lock' },
]

export const TALOS_UI_ANIMATION_HOVER_OPTIONS: Array<{ value: TalosUiAnimationHover; label: string }> = [
    { value: 'none', label: 'None' },
    { value: 'lift', label: 'Lift' },
    { value: 'edge-glow', label: 'Edge glow' },
    { value: 'underline', label: 'Underline' },
    { value: 'node-glow', label: 'Node glow' },
]

export const TALOS_UI_ANIMATION_EASING_OPTIONS: Array<{ value: TalosUiAnimationEasing; label: string }> = [
    { value: 'precise', label: 'Precise' },
    { value: 'soft', label: 'Soft' },
    { value: 'elastic-light', label: 'Elastic light' },
    { value: 'linear', label: 'Linear' },
    { value: 'cinematic', label: 'Cinematic' },
]

export const TALOS_THEME_AREA_OPTIONS: Array<{ value: TalosThemeAreaId; label: string }> = [
    { value: 'sidebar', label: 'Sidebar' },
    { value: 'chat', label: 'Chat' },
    { value: 'composer', label: 'Composer' },
    { value: 'window', label: 'Floating windows' },
    { value: 'header', label: 'Header' },
    { value: 'button', label: 'Buttons' },
    { value: 'card', label: 'Cards and panels' },
    { value: 'code', label: 'Code blocks' },
]

export const TALOS_THEME_AREA_TOKEN_OPTIONS: Array<{ value: TalosThemeAreaTokenKey; label: string }> = [
    { value: 'background', label: 'Background' },
    { value: 'surface', label: 'Surface' },
    { value: 'text', label: 'Text' },
    { value: 'muted', label: 'Muted text' },
    { value: 'border', label: 'Border' },
    { value: 'accent', label: 'Accent' },
]

export const TALOS_THEME_FONT_OPTIONS: Array<{ value: TalosThemeFont; label: string }> = [
    { value: 'inter', label: 'Inter / Geist' },
    { value: 'mono', label: 'Operator mono' },
    { value: 'system', label: 'System UI' },
    { value: 'display', label: 'Display' },
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
        isLight: false,
        fontUi: 'Inter',
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
        isLight: true,
        fontUi: 'Inter',
        fontMono: 'IBM Plex Mono',
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
        isLight: false,
        fontUi: 'IBM Plex Mono',
        fontMono: 'IBM Plex Mono',
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
        isLight: true,
        fontUi: 'DM Sans',
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
        isLight: false,
        fontUi: 'Source Sans 3',
        fontMono: 'IBM Plex Mono',
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
        isLight: false,
        fontUi: 'Aptos',
        fontMono: 'Cascadia Mono',
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
        isLight: false,
        fontUi: 'Arial',
        fontMono: 'Cascadia Mono',
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
        isLight: false,
        fontUi: 'Geist',
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
        isLight: false,
        fontUi: 'Sora',
        fontMono: 'JetBrains Mono',
        preview: { background: '#0d0a19', accent: '#b794f6', secondary: '#6ee7b7', line: '#2f2848' },
        poster: themePoster('violet'),
        defaultEffect: 'dag-flow',
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

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i
const BACKGROUND_EFFECTS = new Set(TALOS_BACKGROUND_EFFECTS.map((effect) => effect.value))
const FONT_VALUES = new Set(TALOS_THEME_FONT_OPTIONS.map((font) => font.value))
const DENSITY_VALUES = new Set(TALOS_THEME_DENSITY_OPTIONS.map((density) => density.value))
const RADIUS_VALUES = new Set(TALOS_THEME_RADIUS_OPTIONS.map((radius) => radius.value))
const MOTION_VALUES = new Set(TALOS_THEME_MOTION_OPTIONS.map((motion) => motion.value))
const UI_ANIMATION_PROFILE_VALUES = new Set(TALOS_UI_ANIMATION_PROFILE_OPTIONS.map((profile) => profile.value))
const UI_ANIMATION_OPEN_CLOSE_VALUES = new Set(TALOS_UI_ANIMATION_OPEN_CLOSE_OPTIONS.map((option) => option.value))
const UI_ANIMATION_SURFACE_VALUES = new Set(TALOS_UI_ANIMATION_SURFACE_OPTIONS.map((option) => option.value))
const UI_ANIMATION_FEEDBACK_VALUES = new Set(TALOS_UI_ANIMATION_FEEDBACK_OPTIONS.map((option) => option.value))
const UI_ANIMATION_HOVER_VALUES = new Set(TALOS_UI_ANIMATION_HOVER_OPTIONS.map((option) => option.value))
const UI_ANIMATION_EASING_VALUES = new Set(TALOS_UI_ANIMATION_EASING_OPTIONS.map((option) => option.value))
const AREA_VALUES = new Set(TALOS_THEME_AREA_OPTIONS.map((area) => area.value))
const AREA_TOKEN_VALUES = new Set(TALOS_THEME_AREA_TOKEN_OPTIONS.map((token) => token.value))

const TALOS_THEME_UI_ANIMATION_PRESETS: Record<TalosThemeId, Required<TalosUiAnimationCustomization>> = {
    forge: {
        open_close: 'standard',
        surface_transition: 'slide-fade',
        feedback: 'status-lock',
        hover: 'edge-glow',
        duration_scale: 100,
        intensity: 70,
        easing: 'precise',
        stagger: 40,
    },
    paper: {
        open_close: 'soft-fade',
        surface_transition: 'fade',
        feedback: 'none',
        hover: 'underline',
        duration_scale: 85,
        intensity: 25,
        easing: 'soft',
        stagger: 12,
    },
    terminal: {
        open_close: 'terminal-snap',
        surface_transition: 'scanline',
        feedback: 'trace',
        hover: 'underline',
        duration_scale: 70,
        intensity: 55,
        easing: 'linear',
        stagger: 16,
    },
    aurora: {
        open_close: 'depth',
        surface_transition: 'scale-fade',
        feedback: 'pulse',
        hover: 'node-glow',
        duration_scale: 115,
        intensity: 80,
        easing: 'soft',
        stagger: 56,
    },
    glacier: {
        open_close: 'standard',
        surface_transition: 'slide-fade',
        feedback: 'edge-flash',
        hover: 'edge-glow',
        duration_scale: 95,
        intensity: 45,
        easing: 'precise',
        stagger: 28,
    },
    ember: {
        open_close: 'standard',
        surface_transition: 'scale-fade',
        feedback: 'edge-flash',
        hover: 'edge-glow',
        duration_scale: 90,
        intensity: 75,
        easing: 'elastic-light',
        stagger: 24,
    },
    atlas: {
        open_close: 'standard',
        surface_transition: 'axis-shift',
        feedback: 'trace',
        hover: 'node-glow',
        duration_scale: 100,
        intensity: 65,
        easing: 'precise',
        stagger: 48,
    },
    noir: {
        open_close: 'soft-fade',
        surface_transition: 'fade',
        feedback: 'status-lock',
        hover: 'underline',
        duration_scale: 95,
        intensity: 40,
        easing: 'cinematic',
        stagger: 20,
    },
    signal: {
        open_close: 'depth',
        surface_transition: 'slide-fade',
        feedback: 'trace',
        hover: 'node-glow',
        duration_scale: 90,
        intensity: 85,
        easing: 'precise',
        stagger: 36,
    },
    violet: {
        open_close: 'depth',
        surface_transition: 'scale-fade',
        feedback: 'pulse',
        hover: 'edge-glow',
        duration_scale: 120,
        intensity: 90,
        easing: 'cinematic',
        stagger: 60,
    },
}

const TALOS_UI_ANIMATION_MINIMAL: Required<TalosUiAnimationCustomization> = {
    open_close: 'soft-fade',
    surface_transition: 'fade',
    feedback: 'none',
    hover: 'underline',
    duration_scale: 70,
    intensity: 18,
    easing: 'soft',
    stagger: 0,
}

const TALOS_UI_ANIMATION_EXPRESSIVE: Required<TalosUiAnimationCustomization> = {
    open_close: 'depth',
    surface_transition: 'scale-fade',
    feedback: 'pulse',
    hover: 'node-glow',
    duration_scale: 120,
    intensity: 88,
    easing: 'cinematic',
    stagger: 68,
}

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

    const motion = enumValue(value.motion, MOTION_VALUES)
    if (motion) {
        theme.motion = motion
    }

    const uiAnimationProfile = enumValue(value.ui_animation_profile, UI_ANIMATION_PROFILE_VALUES)
    if (uiAnimationProfile) {
        theme.ui_animation_profile = uiAnimationProfile
    }

    const uiAnimationCustomization = sanitizeTalosUiAnimationCustomization(value.ui_animation_customization)
    if (Object.keys(uiAnimationCustomization).length > 0) {
        theme.ui_animation_customization = uiAnimationCustomization
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
    if (!isRecord(value) || value.schema !== 'talos_theme_export_v1') {
        return null
    }

    return sanitizeTalosNamedTheme(value.theme)
}

export function buildTalosThemeExport(theme: TalosNamedTheme): TalosThemeExportV1 {
    return {
        schema: 'talos_theme_export_v1',
        exported_at: new Date().toISOString(),
        theme,
    }
}

export function talosBackgroundEffectFromCustomization(
    customization: TalosThemeCustomization,
    preset: TalosThemePreset,
    backgroundDisabled = false,
): TalosBackgroundEffect {
    if (backgroundDisabled) {
        return 'none'
    }

    return customization.effect ?? preset.defaultEffect
}

export function talosThemeMotionStyle(motionMode: TalosThemeMotionMode): Record<string, string> {
    if (motionMode === 'off') {
        return {
            '--talos-effect-opacity': '0.64',
            '--talos-trace-duration-a': '1s',
            '--talos-trace-duration-b': '1s',
            '--talos-trace-duration-c': '1s',
            '--talos-grid-duration': '1s',
            '--talos-node-duration-a': '1s',
            '--talos-node-duration-b': '1s',
        }
    }

    if (motionMode === 'subtle') {
        return {
            '--talos-effect-opacity': '0.42',
            '--talos-trace-duration-a': '9.8s',
            '--talos-trace-duration-b': '12s',
            '--talos-trace-duration-c': '11s',
            '--talos-grid-duration': '20s',
            '--talos-node-duration-a': '9s',
            '--talos-node-duration-b': '10s',
        }
    }

    if (motionMode === 'cinematic') {
        return {
            '--talos-effect-opacity': '0.94',
            '--talos-trace-duration-a': '3.8s',
            '--talos-trace-duration-b': '4.6s',
            '--talos-trace-duration-c': '4.2s',
            '--talos-grid-duration': '8s',
            '--talos-node-duration-a': '3.9s',
            '--talos-node-duration-b': '4.4s',
        }
    }

    return {
        '--talos-effect-opacity': '0.72',
        '--talos-trace-duration-a': '5.8s',
        '--talos-trace-duration-b': '7.4s',
        '--talos-trace-duration-c': '6.6s',
        '--talos-grid-duration': '12s',
        '--talos-node-duration-a': '5.8s',
        '--talos-node-duration-b': '6.4s',
    }
}

function resolvedTalosUiAnimation(
    theme: TalosThemeId,
    profile: TalosUiAnimationProfile,
    customization: TalosUiAnimationCustomization = {},
): Required<TalosUiAnimationCustomization> {
    if (profile === 'minimal') {
        return TALOS_UI_ANIMATION_MINIMAL
    }

    if (profile === 'expressive') {
        return TALOS_UI_ANIMATION_EXPRESSIVE
    }

    const preset = TALOS_THEME_UI_ANIMATION_PRESETS[theme] ?? TALOS_THEME_UI_ANIMATION_PRESETS[TALOS_DEFAULT_THEME]

    if (profile === 'custom') {
        return {
            ...preset,
            ...sanitizeTalosUiAnimationCustomization(customization),
        }
    }

    return preset
}

function easingValue(easing: TalosUiAnimationEasing) {
    if (easing === 'soft') {
        return 'cubic-bezier(0.16, 1, 0.3, 1)'
    }

    if (easing === 'elastic-light') {
        return 'cubic-bezier(0.2, 0.9, 0.24, 1.16)'
    }

    if (easing === 'linear') {
        return 'linear'
    }

    if (easing === 'cinematic') {
        return 'cubic-bezier(0.19, 1, 0.22, 1)'
    }

    return 'cubic-bezier(0.2, 0.8, 0.2, 1)'
}

function openTransform(openClose: TalosUiAnimationOpenClose) {
    if (openClose === 'instant') {
        return 'none'
    }

    if (openClose === 'depth') {
        return 'translateY(12px) scale(0.965)'
    }

    if (openClose === 'terminal-snap') {
        return 'translateY(-2px) scale(0.995)'
    }

    if (openClose === 'soft-fade') {
        return 'translateY(4px) scale(1)'
    }

    return 'translateY(8px) scale(0.985)'
}

function surfaceTransform(surface: TalosUiAnimationSurfaceTransition) {
    if (surface === 'scale-fade') {
        return 'scale(0.985)'
    }

    if (surface === 'scanline') {
        return 'translateY(-4px)'
    }

    if (surface === 'axis-shift') {
        return 'translateX(-8px)'
    }

    if (surface === 'slide-fade') {
        return 'translateY(6px)'
    }

    return 'none'
}

function scaledMs(base: number, scale: number) {
    return `${Math.round(base * (scale / 100))}ms`
}

export function talosUiAnimationStyle(
    theme: TalosThemeId,
    profile: TalosUiAnimationProfile,
    motionMode: TalosThemeMotionMode,
    motionDisabled: boolean,
    customization: TalosUiAnimationCustomization = {},
): Record<string, string> {
    if (motionDisabled || motionMode === 'off' || profile === 'off') {
        return {
            '--talos-motion-open-duration': '0ms',
            '--talos-motion-close-duration': '0ms',
            '--talos-motion-surface-duration': '0ms',
            '--talos-motion-feedback-duration': '0ms',
            '--talos-motion-stagger': '0ms',
            '--talos-motion-intensity': '0',
            '--talos-motion-ease': 'linear',
            '--talos-motion-open-transform': 'none',
            '--talos-motion-surface-transform': 'none',
            '--talos-motion-open-style': 'off',
            '--talos-motion-surface-style': 'off',
            '--talos-motion-feedback-style': 'none',
            '--talos-motion-hover-style': 'none',
        }
    }

    const resolved = resolvedTalosUiAnimation(theme, profile, customization)

    return {
        '--talos-motion-open-duration': scaledMs(160, resolved.duration_scale),
        '--talos-motion-close-duration': scaledMs(120, resolved.duration_scale),
        '--talos-motion-surface-duration': scaledMs(180, resolved.duration_scale),
        '--talos-motion-feedback-duration': scaledMs(700, resolved.duration_scale),
        '--talos-motion-stagger': `${resolved.stagger}ms`,
        '--talos-motion-intensity': String(resolved.intensity / 100),
        '--talos-motion-ease': easingValue(resolved.easing),
        '--talos-motion-open-transform': openTransform(resolved.open_close),
        '--talos-motion-surface-transform': surfaceTransform(resolved.surface_transition),
        '--talos-motion-open-style': resolved.open_close,
        '--talos-motion-surface-style': resolved.surface_transition,
        '--talos-motion-feedback-style': resolved.feedback,
        '--talos-motion-hover-style': resolved.hover,
    }
}

const AREA_STYLE_MAP: Record<TalosThemeAreaId, Partial<Record<TalosThemeAreaTokenKey, string[]>>> = {
    sidebar: {
        background: ['--talos-sidebar'],
        surface: ['--talos-panel-soft'],
        text: ['--talos-text'],
        muted: ['--talos-muted'],
        border: ['--talos-border'],
        accent: ['--talos-accent'],
    },
    chat: {
        background: ['--talos-chat-bg'],
        surface: ['--talos-panel'],
        text: ['--talos-text'],
        muted: ['--talos-muted'],
        border: ['--talos-border'],
        accent: ['--talos-accent'],
    },
    composer: {
        background: ['--talos-composer-bg'],
        surface: ['--talos-composer-surface'],
        text: ['--talos-composer-text'],
        muted: ['--talos-muted'],
        border: ['--talos-composer-border'],
        accent: ['--talos-accent'],
    },
    window: {
        background: ['--talos-window-bg'],
        surface: ['--talos-card'],
        text: ['--talos-text'],
        muted: ['--talos-muted'],
        border: ['--talos-border'],
        accent: ['--talos-accent'],
    },
    header: {
        background: ['--talos-header'],
        surface: ['--talos-panel'],
        text: ['--talos-text'],
        muted: ['--talos-muted'],
        border: ['--talos-border'],
        accent: ['--talos-accent'],
    },
    button: {
        background: ['--talos-secondary'],
        surface: ['--talos-active'],
        text: ['--talos-text'],
        muted: ['--talos-muted'],
        border: ['--talos-border'],
        accent: ['--talos-accent'],
    },
    card: {
        background: ['--talos-card'],
        surface: ['--talos-panel'],
        text: ['--talos-text'],
        muted: ['--talos-muted'],
        border: ['--talos-border'],
        accent: ['--talos-accent'],
    },
    code: {
        background: ['--talos-code-bg'],
        surface: ['--talos-code-surface'],
        text: ['--talos-code-text'],
        muted: ['--talos-muted'],
        border: ['--talos-code-border'],
        accent: ['--talos-code-accent'],
    },
}

export function talosThemeAreaTokenStyle(areaTokens: TalosThemeAreaTokens): Record<string, string> {
    const style: Record<string, string> = {}

    for (const [area, tokens] of Object.entries(areaTokens) as Array<[TalosThemeAreaId, Partial<Record<TalosThemeAreaTokenKey, string>>]>) {
        const mapping = AREA_STYLE_MAP[area]
        if (!mapping) {
            continue
        }

        for (const [key, value] of Object.entries(tokens) as Array<[TalosThemeAreaTokenKey, string]>) {
            const variables = mapping[key] ?? []
            for (const variable of variables) {
                style[variable] = value
            }
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
    }

    if (customization.panel) {
        style['--talos-panel'] = customization.panel
        style['--talos-card'] = customization.panel
        style['--talos-panel-soft'] = customization.background
            ? `color-mix(in srgb, ${customization.panel} 72%, ${customization.background})`
            : `color-mix(in srgb, ${customization.panel} 84%, black)`
        style['--talos-secondary'] = `color-mix(in srgb, ${customization.panel} 78%, ${customization.accent ?? '#c98b32'})`
    }

    if (customization.text) {
        style['--talos-text'] = customization.text
        style['--talos-muted'] = `color-mix(in srgb, ${customization.text} 62%, transparent)`
    }

    if (customization.accent) {
        style['--talos-accent'] = customization.accent
        style['--talos-accent-border'] = `color-mix(in srgb, ${customization.accent} 78%, black)`
        style['--talos-accent-hover'] = `color-mix(in srgb, ${customization.accent} 82%, white)`
        style['--talos-accent-soft'] = `color-mix(in srgb, ${customization.accent} 18%, ${customization.background ?? 'var(--talos-background)'})`
        style['--talos-ring'] = customization.accent
        style['--talos-ring-soft'] = `color-mix(in srgb, ${customization.accent} 22%, transparent)`
        style['--talos-line-b'] = `color-mix(in srgb, ${customization.accent} 42%, transparent)`
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
    }

    if (customization.font === 'inter') {
        style['--talos-font-ui'] = 'Inter, Geist, ui-sans-serif, system-ui, sans-serif'
        style['--talos-font-display'] = 'Inter, Geist, ui-sans-serif, system-ui, sans-serif'
    } else if (customization.font === 'mono') {
        style['--talos-font-ui'] = '"IBM Plex Mono", "Cascadia Mono", ui-monospace, monospace'
        style['--talos-font-display'] = '"IBM Plex Mono", "Cascadia Mono", ui-monospace, monospace'
    } else if (customization.font === 'system') {
        style['--talos-font-ui'] = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        style['--talos-font-display'] = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    } else if (customization.font === 'display') {
        style['--talos-font-ui'] = 'Orbitron, Inter, ui-sans-serif, system-ui, sans-serif'
        style['--talos-font-display'] = 'Orbitron, Inter, ui-sans-serif, system-ui, sans-serif'
    }

    if (customization.radius === 'sharp') {
        style['--talos-radius-card'] = '4px'
        style['--talos-radius-control'] = '3px'
    } else if (customization.radius === 'balanced') {
        style['--talos-radius-card'] = '8px'
        style['--talos-radius-control'] = '6px'
    } else if (customization.radius === 'soft') {
        style['--talos-radius-card'] = '12px'
        style['--talos-radius-control'] = '10px'
    }

    if (customization.effect_intensity !== undefined) {
        style['--talos-effect-opacity'] = String(customization.effect_intensity / 100)
    }

    return style
}

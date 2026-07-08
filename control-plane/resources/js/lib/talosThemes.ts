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
    defaultEffect: TalosBackgroundEffect
}

export type TalosBackgroundEffect = 'dag-flow' | 'kahn-grid' | 'trace-rain' | 'signal-mesh' | 'none'
export type TalosThemeFont = 'inter' | 'mono' | 'system' | 'display'
export type TalosThemeDensity = 'compact' | 'comfortable' | 'spacious'
export type TalosThemeRadius = 'sharp' | 'balanced' | 'soft'

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

export const TALOS_DEFAULT_THEME: TalosThemeId = 'forge'

export const TALOS_BACKGROUND_EFFECTS: Array<{ value: TalosBackgroundEffect; label: string; description: string }> = [
    { value: 'dag-flow', label: 'DAG Flow', description: 'Execution graph pulses for normal AVM work.' },
    { value: 'kahn-grid', label: 'Kahn Grid', description: 'Layered scheduling bands for topological planning.' },
    { value: 'trace-rain', label: 'Trace Rain', description: 'Vertical trace streams for replay and telemetry.' },
    { value: 'signal-mesh', label: 'Signal Mesh', description: 'Low-noise node mesh for command-center mode.' },
    { value: 'none', label: 'Solid', description: 'Static background with no procedural motion.' },
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

export function talosBackgroundEffectFromCustomization(
    customization: TalosThemeCustomization,
    preset: TalosThemePreset,
    reducedMotion: boolean,
): TalosBackgroundEffect {
    if (reducedMotion) {
        return 'none'
    }

    return customization.effect ?? preset.defaultEffect
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

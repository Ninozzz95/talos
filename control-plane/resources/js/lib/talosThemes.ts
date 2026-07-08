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
    background?: {
        webm: string
        mp4: string
        poster: string
    }
}

export const TALOS_DEFAULT_THEME: TalosThemeId = 'forge'

function themeBackground(id: Exclude<TalosThemeId, 'violet'>): TalosThemePreset['background'] {
    return {
        webm: `/talos/backgrounds/${id}-background.webm`,
        mp4: `/talos/backgrounds/${id}-background.mp4`,
        poster: `/talos/backgrounds/${id}-poster.webp`,
    }
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
        background: themeBackground('forge'),
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
        background: themeBackground('paper'),
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
        background: themeBackground('terminal'),
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
        background: themeBackground('aurora'),
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
        background: themeBackground('glacier'),
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
        background: themeBackground('ember'),
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
        background: themeBackground('atlas'),
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
        background: themeBackground('noir'),
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
        background: themeBackground('signal'),
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

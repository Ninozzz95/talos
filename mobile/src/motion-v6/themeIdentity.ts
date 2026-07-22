import {
    TALOS_THEME_PRESETS,
    isTalosThemeId,
    talosThemeModeVariantStyle,
    type TalosThemeDensity,
    type TalosThemeId,
    type TalosThemeRadius,
} from '../lib/talosThemes'
import { talosCanonicalOpaqueColor } from '../lib/talosContrast'

export const TALOS_THEME_IDENTITY_SCHEMA_VERSION = 1 as const

export const TALOS_THEME_IDENTITY_PALETTE_ROLES = Object.freeze([
    'background',
    'surface',
    'surface_muted',
    'surface_elevated',
    'text',
    'text_muted',
    'border',
    'border_strong',
    'accent',
    'accent_text',
    'secondary',
    'success',
    'warning',
    'danger',
    'info',
    'focus',
] as const)

type TalosThemeIdentityPaletteRole = typeof TALOS_THEME_IDENTITY_PALETTE_ROLES[number]

export type TalosThemeIdentityPalette = Record<TalosThemeIdentityPaletteRole, string>

export type TalosThemeTypographyFace = {
    family: string
    fallback_families: string[]
    provenance: 'local'
}

export type TalosThemeIdentity = {
    schema_version: typeof TALOS_THEME_IDENTITY_SCHEMA_VERSION
    id: TalosThemeId
    semantic_palette: {
        light: TalosThemeIdentityPalette
        dark: TalosThemeIdentityPalette
    }
    typography: {
        ui: TalosThemeTypographyFace
        display: TalosThemeTypographyFace
        mono: TalosThemeTypographyFace
        fallback_metadata: {
            strategy: 'ordered'
            system_ui: string
            system_mono: string
        }
    }
    density: TalosThemeDensity
    radius: TalosThemeRadius
    assets: {
        poster: {
            id: string
            path: string
            provenance: 'local'
        }
    }
    motion_intents: {
        ambient: string
        surface_enter: string
        surface_exit: string
        attention: string
        confirmation: string
    }
    accessibility: {
        defaults: {
            reduced_motion: 'respect'
            min_text_contrast_ratio: 4.5
            min_non_text_contrast_ratio: 3
            focus_indicator: 'visible'
            status_communication: 'text-and-color'
        }
    }
}

type IdentityRecord = Record<string, unknown>

const IDENTITY_KEYS = [
    'schema_version',
    'id',
    'semantic_palette',
    'typography',
    'density',
    'radius',
    'assets',
    'motion_intents',
    'accessibility',
] as const

const PALETTE_KEYS = [...TALOS_THEME_IDENTITY_PALETTE_ROLES]
const PALETTE_TOKENS: Record<TalosThemeIdentityPaletteRole, string> = {
    background: '--talos-background',
    surface: '--talos-panel',
    surface_muted: '--talos-panel-soft',
    surface_elevated: '--talos-window-bg',
    text: '--talos-text',
    text_muted: '--talos-muted',
    border: '--talos-border',
    border_strong: '--talos-border-strong',
    accent: '--talos-accent',
    accent_text: '--talos-accent-text',
    secondary: '--talos-secondary',
    success: '--talos-success',
    warning: '--talos-warning',
    danger: '--talos-danger',
    info: '--talos-info',
    focus: '--talos-ring',
}
const TYPOGRAPHY_KEYS = ['ui', 'display', 'mono', 'fallback_metadata'] as const
const FACE_KEYS = ['family', 'fallback_families', 'provenance'] as const
const FALLBACK_METADATA_KEYS = ['strategy', 'system_ui', 'system_mono'] as const
const ASSETS_KEYS = ['poster'] as const
const POSTER_KEYS = ['id', 'path', 'provenance'] as const
const MOTION_INTENT_KEYS = ['ambient', 'surface_enter', 'surface_exit', 'attention', 'confirmation'] as const
const ACCESSIBILITY_KEYS = ['defaults'] as const
const ACCESSIBILITY_DEFAULT_KEYS = [
    'reduced_motion',
    'min_text_contrast_ratio',
    'min_non_text_contrast_ratio',
    'focus_indicator',
    'status_communication',
] as const
const MAX_METADATA_LENGTH = 128
const MAX_FALLBACK_FAMILIES = 8
const MAX_CANONICAL_DEPTH = 12
const MAX_CANONICAL_NODES = 2048
const MAX_CANONICAL_KEYS = 64
const CANONICAL_COLOR = /^#[0-9a-f]{6}$/
const SAFE_METADATA = /^[\x20-\x7e]+$/

export function isTalosThemeIdentityCanonicalColor(value: unknown): value is string {
    return typeof value === 'string' && CANONICAL_COLOR.test(value)
}

function jsonObjectPrototype(value: object): boolean {
    try {
        const prototype = Reflect.getPrototypeOf(value)
        return prototype === Object.prototype || prototype === null
    } catch {
        return false
    }
}

function strictRecord(value: unknown, expectedKeys: readonly string[]): IdentityRecord | null {
    if (typeof value !== 'object' || value === null) return null
    try {
        if (Array.isArray(value)) return null
    } catch {
        return null
    }
    if (!jsonObjectPrototype(value)) return null

    let ownKeys: PropertyKey[]
    try {
        ownKeys = Reflect.ownKeys(value)
    } catch {
        return null
    }

    const expected = new Set(expectedKeys)
    if (ownKeys.length !== expectedKeys.length) return null
    if (ownKeys.some((key) => typeof key === 'symbol' || !expected.has(key as string))) return null

    const result: IdentityRecord = Object.create(null)
    for (const key of expectedKeys) {
        let descriptor: PropertyDescriptor | undefined
        try {
            descriptor = Reflect.getOwnPropertyDescriptor(value, key)
        } catch {
            return null
        }
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return null
        result[key] = descriptor.value
    }
    return result
}

function safeMetadata(value: unknown): value is string {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= MAX_METADATA_LENGTH
        && SAFE_METADATA.test(value)
}

function strictStringArray(value: unknown): string[] | null {
    try {
        if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) return null
    } catch {
        return null
    }

    let lengthDescriptor: PropertyDescriptor | undefined
    try {
        lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, 'length')
    } catch {
        return null
    }
    if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value')) return null
    const length = lengthDescriptor.value
    if (!Number.isInteger(length) || length < 1 || length > MAX_FALLBACK_FAMILIES) return null

    let ownKeys: PropertyKey[]
    try {
        ownKeys = Reflect.ownKeys(value)
    } catch {
        return null
    }
    if (ownKeys.length !== length + 1) return null
    for (const key of ownKeys) {
        if (typeof key === 'symbol') return null
        if (key === 'length') continue
        const index = Number(key)
        if (!Number.isInteger(index) || index < 0 || index >= length || String(index) !== key) return null
    }

    const result: string[] = []
    for (let index = 0; index < length; index += 1) {
        let descriptor: PropertyDescriptor | undefined
        try {
            descriptor = Reflect.getOwnPropertyDescriptor(value, String(index))
        } catch {
            return null
        }
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || !safeMetadata(descriptor.value)) {
            return null
        }
        result.push(descriptor.value)
    }
    return result
}

function parsePalette(value: unknown): TalosThemeIdentityPalette | null {
    const record = strictRecord(value, PALETTE_KEYS)
    if (!record || !PALETTE_KEYS.every((key) => isTalosThemeIdentityCanonicalColor(record[key]))) {
        return null
    }
    return Object.fromEntries(PALETTE_KEYS.map((key) => [key, record[key]])) as TalosThemeIdentityPalette
}

function parseFace(value: unknown): TalosThemeTypographyFace | null {
    const record = strictRecord(value, FACE_KEYS)
    const fallbackFamilies = record && strictStringArray(record.fallback_families)
    if (!record || !safeMetadata(record.family) || !fallbackFamilies || record.provenance !== 'local') return null
    return {
        family: record.family,
        fallback_families: fallbackFamilies,
        provenance: 'local',
    }
}

function parseIdentityStructure(value: unknown): TalosThemeIdentity | null {
    const record = strictRecord(value, IDENTITY_KEYS)
    if (!record || record.schema_version !== TALOS_THEME_IDENTITY_SCHEMA_VERSION || !isTalosThemeId(record.id)) return null
    const id = record.id

    const paletteRecord = strictRecord(record.semantic_palette, ['light', 'dark'])
    const light = paletteRecord && parsePalette(paletteRecord.light)
    const dark = paletteRecord && parsePalette(paletteRecord.dark)
    if (!light || !dark) return null

    const typographyRecord = strictRecord(record.typography, TYPOGRAPHY_KEYS)
    if (!typographyRecord) return null
    const ui = parseFace(typographyRecord.ui)
    const display = parseFace(typographyRecord.display)
    const mono = parseFace(typographyRecord.mono)
    const fallbackMetadata = strictRecord(typographyRecord.fallback_metadata, FALLBACK_METADATA_KEYS)
    if (!ui || !display || !mono || !fallbackMetadata
        || fallbackMetadata.strategy !== 'ordered'
        || !safeMetadata(fallbackMetadata.system_ui)
        || !safeMetadata(fallbackMetadata.system_mono)) return null

    if (!['compact', 'comfortable', 'spacious'].includes(record.density as string)) return null
    if (!['sharp', 'balanced', 'soft'].includes(record.radius as string)) return null

    const assets = strictRecord(record.assets, ASSETS_KEYS)
    const poster = assets && strictRecord(assets.poster, POSTER_KEYS)
    if (!poster
        || poster.id !== `${id}-poster`
        || poster.path !== `/talos/backgrounds/${id}-poster.webp`
        || poster.provenance !== 'local') return null

    const intents = strictRecord(record.motion_intents, MOTION_INTENT_KEYS)
    if (!intents || !MOTION_INTENT_KEYS.every((key) => safeMetadata(intents[key]))) return null

    const accessibility = strictRecord(record.accessibility, ACCESSIBILITY_KEYS)
    const defaults = accessibility && strictRecord(accessibility.defaults, ACCESSIBILITY_DEFAULT_KEYS)
    if (!defaults
        || defaults.reduced_motion !== 'respect'
        || defaults.min_text_contrast_ratio !== 4.5
        || defaults.min_non_text_contrast_ratio !== 3
        || defaults.focus_indicator !== 'visible'
        || defaults.status_communication !== 'text-and-color') return null

    return {
        schema_version: TALOS_THEME_IDENTITY_SCHEMA_VERSION,
        id,
        semantic_palette: { light, dark },
        typography: {
            ui,
            display,
            mono,
            fallback_metadata: {
                strategy: 'ordered',
                system_ui: fallbackMetadata.system_ui,
                system_mono: fallbackMetadata.system_mono,
            },
        },
        density: record.density as TalosThemeDensity,
        radius: record.radius as TalosThemeRadius,
        assets: {
            poster: {
                id: poster.id,
                path: poster.path,
                provenance: 'local',
            },
        },
        motion_intents: {
            ambient: intents.ambient as string,
            surface_enter: intents.surface_enter as string,
            surface_exit: intents.surface_exit as string,
            attention: intents.attention as string,
            confirmation: intents.confirmation as string,
        },
        accessibility: {
            defaults: {
                reduced_motion: 'respect',
                min_text_contrast_ratio: 4.5,
                min_non_text_contrast_ratio: 3,
                focus_indicator: 'visible',
                status_communication: 'text-and-color',
            },
        },
    }
}

function paletteFromTheme(id: TalosThemeId, mode: 'light' | 'dark'): TalosThemeIdentityPalette {
    const style = talosThemeModeVariantStyle(id, mode)
    return Object.fromEntries(PALETTE_KEYS.map((role) => [role, talosCanonicalOpaqueColor(style[PALETTE_TOKENS[role]], style)])) as TalosThemeIdentityPalette
}

function cloneFace(face: TalosThemeTypographyFace): TalosThemeTypographyFace {
    return {
        family: face.family,
        fallback_families: [...face.fallback_families],
        provenance: face.provenance,
    }
}

function clonePalette(palette: TalosThemeIdentityPalette): TalosThemeIdentityPalette {
    return Object.fromEntries(PALETTE_KEYS.map((key) => [key, palette[key]])) as TalosThemeIdentityPalette
}

function cloneIdentity(identity: TalosThemeIdentity): TalosThemeIdentity {
    return {
        schema_version: identity.schema_version,
        id: identity.id,
        semantic_palette: {
            light: clonePalette(identity.semantic_palette.light),
            dark: clonePalette(identity.semantic_palette.dark),
        },
        typography: {
            ui: cloneFace(identity.typography.ui),
            display: cloneFace(identity.typography.display),
            mono: cloneFace(identity.typography.mono),
            fallback_metadata: { ...identity.typography.fallback_metadata },
        },
        density: identity.density,
        radius: identity.radius,
        assets: { poster: { ...identity.assets.poster } },
        motion_intents: { ...identity.motion_intents },
        accessibility: { defaults: { ...identity.accessibility.defaults } },
    }
}

function identityFromPreset(preset: (typeof TALOS_THEME_PRESETS)[number]): TalosThemeIdentity {
    const ui = {
        family: preset.fontUi,
        fallback_families: ['ui-sans-serif', 'system-ui', 'sans-serif'],
        provenance: 'local' as const,
    }
    const mono = {
        family: preset.fontMono,
        fallback_families: ['ui-monospace', 'monospace'],
        provenance: 'local' as const,
    }

    return {
        schema_version: TALOS_THEME_IDENTITY_SCHEMA_VERSION,
        id: preset.id,
        semantic_palette: {
            light: paletteFromTheme(preset.id, 'light'),
            dark: paletteFromTheme(preset.id, 'dark'),
        },
        typography: {
            ui,
            display: { ...ui, fallback_families: [...ui.fallback_families] },
            mono,
            fallback_metadata: {
                strategy: 'ordered',
                system_ui: 'ui-sans-serif, system-ui, sans-serif',
                system_mono: 'ui-monospace, monospace',
            },
        },
        density: preset.defaultDensity,
        radius: preset.defaultRadius,
        assets: {
            poster: {
                id: `${preset.id}-poster`,
                path: `/talos/backgrounds/${preset.id}-poster.webp`,
                provenance: 'local',
            },
        },
        motion_intents: {
            ambient: `${preset.id}.ambient`,
            surface_enter: `${preset.id}.surface-enter`,
            surface_exit: `${preset.id}.surface-exit`,
            attention: `${preset.id}.attention`,
            confirmation: `${preset.id}.confirmation`,
        },
        accessibility: {
            defaults: {
                reduced_motion: 'respect',
                min_text_contrast_ratio: 4.5,
                min_non_text_contrast_ratio: 3,
                focus_indicator: 'visible',
                status_communication: 'text-and-color',
            },
        },
    }
}

export function deepFreezeTalosCanonical<T>(value: T): T {
    const seen = new Set<object>()
    let nodes = 0

    const visit = (current: unknown, depth: number): void => {
        if (typeof current !== 'object' || current === null || seen.has(current)) return
        if (depth > MAX_CANONICAL_DEPTH || nodes >= MAX_CANONICAL_NODES) {
            throw new TypeError('Canonical TALOS value exceeds freeze bounds.')
        }
        nodes += 1
        seen.add(current)

        const prototype = Reflect.getPrototypeOf(current)
        if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) {
            throw new TypeError('Canonical TALOS value must use a JSON-like prototype.')
        }
        const keys = Reflect.ownKeys(current)
        if (keys.length > MAX_CANONICAL_KEYS) throw new TypeError('Canonical TALOS value has too many keys.')
        for (const key of keys) {
            const descriptor = Reflect.getOwnPropertyDescriptor(current, key)
            if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
                throw new TypeError('Canonical TALOS value must contain only data properties.')
            }
            visit(descriptor.value, depth + 1)
        }
        Object.freeze(current)
    }

    visit(value, 0)
    return value
}

export const TALOS_THEME_IDENTITIES_V6 = deepFreezeTalosCanonical(
    TALOS_THEME_PRESETS.map(identityFromPreset),
)

function canonicalIdentity(value: unknown): TalosThemeIdentity | null {
    const parsed = parseIdentityStructure(value)
    if (!parsed) return null
    const preset = TALOS_THEME_PRESETS.find((candidate) => candidate.id === parsed.id)
    if (!preset) return null
    const canonical = identityFromPreset(preset)
    return JSON.stringify(parsed) === JSON.stringify(canonical) ? parsed : null
}

export function exportTalosThemeIdentity(identity: TalosThemeIdentity): TalosThemeIdentity {
    const canonical = canonicalIdentity(identity)
    if (!canonical) throw new TypeError('Cannot export a non-canonical TALOS theme identity.')
    return cloneIdentity(canonical)
}

export function importTalosThemeIdentity(value: unknown): TalosThemeIdentity | null {
    const canonical = canonicalIdentity(value)
    return canonical ? cloneIdentity(canonical) : null
}

export const serializeTalosThemeIdentity = exportTalosThemeIdentity
export const parseTalosThemeIdentity = importTalosThemeIdentity

export function getTalosThemeIdentityV6(value: unknown): TalosThemeIdentity | null {
    if (!isTalosThemeId(value)) return null
    const identity = TALOS_THEME_IDENTITIES_V6.find((candidate) => candidate.id === value)
    return identity ? cloneIdentity(identity) : null
}

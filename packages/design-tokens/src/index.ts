/**
 * TALOS portable theme identity contract.
 *
 * The shape mirrors the desktop-owned TalosThemeIdentity V6 boundary. Mobile
 * may render it differently, but it cannot invent another identity vocabulary
 * or inherit desktop Canvas/DOM/FPS/DPR configuration.
 */

export const TALOS_MOBILE_DESIGN_TOKENS_SCHEMA_VERSION = 1

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

export type TalosThemeIdentityPaletteRole = typeof TALOS_THEME_IDENTITY_PALETTE_ROLES[number]
export type TalosThemeIdentityPalette = Record<TalosThemeIdentityPaletteRole, string>
export type TalosThemeDensity = 'compact' | 'comfortable' | 'spacious'
export type TalosThemeRadius = 'sharp' | 'balanced' | 'soft'

export interface TalosLayoutDensityTokens {
    readonly page: string
    readonly section: string
    readonly card: string
    readonly control: string
    readonly inline: string
    readonly icon: string
    /** Accessibility floor: density may compress whitespace, never the target. */
    readonly touchTarget: '3rem'
}

export interface TalosComponentRadiusTokens {
    readonly radiusCard: string
    readonly radiusControl: string
}

export const TALOS_LAYOUT_DENSITY_SCALE: Readonly<Record<TalosThemeDensity, TalosLayoutDensityTokens>> = Object.freeze({
    compact: Object.freeze({
        page: '0.75rem',
        section: '0.75rem',
        card: '0.625rem',
        control: '0.625rem',
        inline: '0.375rem',
        icon: '1rem',
        touchTarget: '3rem',
    }),
    comfortable: Object.freeze({
        page: '1rem',
        section: '1rem',
        card: '0.75rem',
        control: '0.75rem',
        inline: '0.5rem',
        icon: '1rem',
        touchTarget: '3rem',
    }),
    spacious: Object.freeze({
        page: '1.25rem',
        section: '1.25rem',
        card: '1rem',
        control: '0.875rem',
        inline: '0.625rem',
        icon: '1.125rem',
        touchTarget: '3rem',
    }),
})

export const TALOS_COMPONENT_RADIUS_SCALE: Readonly<Record<TalosThemeRadius, TalosComponentRadiusTokens>> = Object.freeze({
    sharp: Object.freeze({ radiusCard: '0rem', radiusControl: '0rem' }),
    balanced: Object.freeze({ radiusCard: '0.5rem', radiusControl: '0.375rem' }),
    soft: Object.freeze({ radiusCard: '0.75rem', radiusControl: '0.75rem' }),
})

export function talosLayoutTokensFor(
    density: TalosThemeDensity,
    radius: TalosThemeRadius,
): TalosLayoutDensityTokens & TalosComponentRadiusTokens {
    return {
        ...TALOS_LAYOUT_DENSITY_SCALE[density],
        ...TALOS_COMPONENT_RADIUS_SCALE[radius],
    }
}

export interface TalosThemeTypographyFace {
    family: string
    fallback_families: string[]
    provenance: 'local'
}

export interface TalosMobileDesignTokens {
    schema_version: 1
    id: string
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

export type TalosDesignTokenErrorCode =
    | 'invalid_shape'
    | 'unknown_schema_version'
    | 'unknown_field'
    | 'desktop_renderer_field'

export class TalosDesignTokenError extends Error {
    readonly code: TalosDesignTokenErrorCode

    constructor(code: TalosDesignTokenErrorCode, message: string) {
        super(message)
        this.name = 'TalosDesignTokenError'
        this.code = code
    }
}

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
]
const TYPOGRAPHY_KEYS = ['ui', 'display', 'mono', 'fallback_metadata']
const FACE_KEYS = ['family', 'fallback_families', 'provenance']
const FALLBACK_METADATA_KEYS = ['strategy', 'system_ui', 'system_mono']
const POSTER_KEYS = ['id', 'path', 'provenance']
const MOTION_INTENT_KEYS = ['ambient', 'surface_enter', 'surface_exit', 'attention', 'confirmation']
const ACCESSIBILITY_DEFAULT_KEYS = [
    'reduced_motion',
    'min_text_contrast_ratio',
    'min_non_text_contrast_ratio',
    'focus_indicator',
    'status_communication',
]
const THEME_ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/
const CANONICAL_COLOR = /^#[0-9a-f]{6}$/
const SAFE_METADATA = /^[\x20-\x7e]+$/
const MAX_METADATA_LENGTH = 128
const MAX_FALLBACK_FAMILIES = 8

/** Desktop-only renderer vocabulary, matched as complete key words. */
export const TALOS_DESKTOP_RENDERER_FIELD_WORDS: readonly string[] = [
    'canvas',
    'dom',
    'renderer',
    'fps',
    'dpr',
]

function tokenWords(key: string): string[] {
    return key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[\s\-_.]+/)
        .map((word) => word.toLowerCase())
        .filter((word) => word.length > 0)
}

function assertNoDesktopRendererField(path: string, key: string): void {
    for (const word of tokenWords(key)) {
        if (TALOS_DESKTOP_RENDERER_FIELD_WORDS.includes(word)) {
            throw new TalosDesignTokenError(
                'desktop_renderer_field',
                `field "${path}.${key}" is desktop renderer configuration ("${word}") and is not portable theme identity`,
            )
        }
    }
}

function readExactRecord(value: unknown, expectedKeys: readonly string[], path: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TalosDesignTokenError('invalid_shape', `${path} must be a JSON object`)
    }
    try {
        const prototype = Reflect.getPrototypeOf(value)
        if (prototype !== Object.prototype && prototype !== null) {
            throw new TalosDesignTokenError('invalid_shape', `${path} must use a JSON object prototype`)
        }
    } catch (error) {
        if (error instanceof TalosDesignTokenError) throw error
        throw new TalosDesignTokenError('invalid_shape', `${path} cannot be inspected safely`)
    }

    let keys: PropertyKey[]
    try {
        keys = Reflect.ownKeys(value)
    } catch {
        throw new TalosDesignTokenError('invalid_shape', `${path} cannot be inspected safely`)
    }

    for (const key of keys) {
        if (typeof key !== 'string') {
            throw new TalosDesignTokenError('invalid_shape', `${path} must contain only JSON string keys`)
        }
        if (!expectedKeys.includes(key)) {
            assertNoDesktopRendererField(path, key)
            throw new TalosDesignTokenError('unknown_field', `${path} contains unknown field "${key}"`)
        }
    }

    const result: Record<string, unknown> = Object.create(null)
    for (const key of expectedKeys) {
        let descriptor: PropertyDescriptor | undefined
        try {
            descriptor = Reflect.getOwnPropertyDescriptor(value, key)
        } catch {
            throw new TalosDesignTokenError('invalid_shape', `${path}.${key} cannot be inspected safely`)
        }
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
            throw new TalosDesignTokenError('invalid_shape', `${path}.${key} is required as an enumerable data property`)
        }
        result[key] = descriptor.value
    }
    return result
}

function parseMetadata(value: unknown, path: string): string {
    if (typeof value !== 'string'
        || value.trim().length === 0
        || value.length > MAX_METADATA_LENGTH
        || !SAFE_METADATA.test(value)) {
        throw new TalosDesignTokenError('invalid_shape', `${path} must be bounded printable ASCII metadata`)
    }
    return value
}

function parseFallbackFamilies(value: unknown, path: string): string[] {
    if (!Array.isArray(value) || value.length < 1 || value.length > MAX_FALLBACK_FAMILIES) {
        throw new TalosDesignTokenError('invalid_shape', `${path} must contain 1-${MAX_FALLBACK_FAMILIES} font families`)
    }
    const result = value.map((family, index) => parseMetadata(family, `${path}.${index}`))
    if (new Set(result).size !== result.length) {
        throw new TalosDesignTokenError('invalid_shape', `${path} cannot contain duplicate font families`)
    }
    return result
}

function parsePalette(value: unknown, path: string): TalosThemeIdentityPalette {
    const record = readExactRecord(value, TALOS_THEME_IDENTITY_PALETTE_ROLES, path)
    const palette: Partial<TalosThemeIdentityPalette> = {}
    for (const role of TALOS_THEME_IDENTITY_PALETTE_ROLES) {
        const color = record[role]
        if (typeof color !== 'string' || !CANONICAL_COLOR.test(color)) {
            throw new TalosDesignTokenError('invalid_shape', `${path}.${role} must be a lowercase #rrggbb color`)
        }
        palette[role] = color
    }
    return palette as TalosThemeIdentityPalette
}

function parseFace(value: unknown, path: string): TalosThemeTypographyFace {
    const record = readExactRecord(value, FACE_KEYS, path)
    if (record.provenance !== 'local') {
        throw new TalosDesignTokenError('invalid_shape', `${path}.provenance must be "local"`)
    }
    return {
        family: parseMetadata(record.family, `${path}.family`),
        fallback_families: parseFallbackFamilies(record.fallback_families, `${path}.fallback_families`),
        provenance: 'local',
    }
}

/** Validate and clone one portable canonical TALOS theme identity. */
export function parseTalosMobileDesignTokens(value: unknown): TalosMobileDesignTokens {
    const identity = readExactRecord(value, IDENTITY_KEYS, 'theme_identity')
    if (identity.schema_version !== TALOS_MOBILE_DESIGN_TOKENS_SCHEMA_VERSION) {
        throw new TalosDesignTokenError(
            'unknown_schema_version',
            `unsupported schema_version ${String(identity.schema_version)}; supported: ${TALOS_MOBILE_DESIGN_TOKENS_SCHEMA_VERSION}`,
        )
    }
    if (typeof identity.id !== 'string' || !THEME_ID_PATTERN.test(identity.id)) {
        throw new TalosDesignTokenError('invalid_shape', 'theme_identity.id must be a canonical theme slug')
    }
    const id = identity.id

    const paletteRecord = readExactRecord(identity.semantic_palette, ['light', 'dark'], 'theme_identity.semantic_palette')
    const semanticPalette = {
        light: parsePalette(paletteRecord.light, 'theme_identity.semantic_palette.light'),
        dark: parsePalette(paletteRecord.dark, 'theme_identity.semantic_palette.dark'),
    }

    const typographyRecord = readExactRecord(identity.typography, TYPOGRAPHY_KEYS, 'theme_identity.typography')
    const fallback = readExactRecord(
        typographyRecord.fallback_metadata,
        FALLBACK_METADATA_KEYS,
        'theme_identity.typography.fallback_metadata',
    )
    if (fallback.strategy !== 'ordered') {
        throw new TalosDesignTokenError('invalid_shape', 'theme_identity.typography.fallback_metadata.strategy must be "ordered"')
    }

    if (!['compact', 'comfortable', 'spacious'].includes(identity.density as string)) {
        throw new TalosDesignTokenError('invalid_shape', 'theme_identity.density is not supported')
    }
    if (!['sharp', 'balanced', 'soft'].includes(identity.radius as string)) {
        throw new TalosDesignTokenError('invalid_shape', 'theme_identity.radius is not supported')
    }

    const assets = readExactRecord(identity.assets, ['poster'], 'theme_identity.assets')
    const poster = readExactRecord(assets.poster, POSTER_KEYS, 'theme_identity.assets.poster')
    if (poster.id !== `${id}-poster`
        || poster.path !== `/talos/backgrounds/${id}-poster.webp`
        || poster.provenance !== 'local') {
        throw new TalosDesignTokenError(
            'invalid_shape',
            'theme_identity.assets.poster must use the canonical local poster id/path/provenance',
        )
    }

    const intents = readExactRecord(identity.motion_intents, MOTION_INTENT_KEYS, 'theme_identity.motion_intents')
    const expectedIntents: Record<string, string> = {
        ambient: `${id}.ambient`,
        surface_enter: `${id}.surface-enter`,
        surface_exit: `${id}.surface-exit`,
        attention: `${id}.attention`,
        confirmation: `${id}.confirmation`,
    }
    const motionIntents = Object.fromEntries(
        MOTION_INTENT_KEYS.map((key) => {
            const intent = parseMetadata(intents[key], `theme_identity.motion_intents.${key}`)
            if (intent !== expectedIntents[key]) {
                throw new TalosDesignTokenError(
                    'invalid_shape',
                    `theme_identity.motion_intents.${key} must be "${expectedIntents[key]}"`,
                )
            }
            return [key, intent]
        }),
    ) as TalosMobileDesignTokens['motion_intents']

    const accessibility = readExactRecord(identity.accessibility, ['defaults'], 'theme_identity.accessibility')
    const defaults = readExactRecord(
        accessibility.defaults,
        ACCESSIBILITY_DEFAULT_KEYS,
        'theme_identity.accessibility.defaults',
    )
    if (defaults.reduced_motion !== 'respect'
        || defaults.min_text_contrast_ratio !== 4.5
        || defaults.min_non_text_contrast_ratio !== 3
        || defaults.focus_indicator !== 'visible'
        || defaults.status_communication !== 'text-and-color') {
        throw new TalosDesignTokenError('invalid_shape', 'theme_identity.accessibility.defaults does not match the canonical accessibility contract')
    }

    return {
        schema_version: 1,
        id,
        semantic_palette: semanticPalette,
        typography: {
            ui: parseFace(typographyRecord.ui, 'theme_identity.typography.ui'),
            display: parseFace(typographyRecord.display, 'theme_identity.typography.display'),
            mono: parseFace(typographyRecord.mono, 'theme_identity.typography.mono'),
            fallback_metadata: {
                strategy: 'ordered',
                system_ui: parseMetadata(fallback.system_ui, 'theme_identity.typography.fallback_metadata.system_ui'),
                system_mono: parseMetadata(fallback.system_mono, 'theme_identity.typography.fallback_metadata.system_mono'),
            },
        },
        density: identity.density as TalosThemeDensity,
        radius: identity.radius as TalosThemeRadius,
        assets: {
            poster: {
                id: poster.id as string,
                path: poster.path as string,
                provenance: 'local',
            },
        },
        motion_intents: motionIntents,
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

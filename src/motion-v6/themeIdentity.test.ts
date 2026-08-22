import { describe, expect, it } from 'vitest'
import {
    TALOS_THEME_IDENTITIES_V6,
    TALOS_THEME_IDENTITY_PALETTE_ROLES,
    TALOS_THEME_IDENTITY_SCHEMA_VERSION,
    exportTalosThemeIdentity,
    getTalosThemeIdentityV6,
    importTalosThemeIdentity,
    isTalosThemeIdentityCanonicalColor,
    type TalosThemeIdentity,
} from './themeIdentity'
import { TALOS_THEME_PRESETS, talosThemeModeVariantStyle } from '../lib/talosThemes'
import { talosCanonicalOpaqueColor } from '../lib/talosContrast'
import chromiumColorFixture from '../../tests/fixtures/talos-theme-identity-chromium-colors-v1.json'

const EXPECTED_THEME_IDS = [
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
    // F1-T2 calm refactor (mobile design-lead): 14th preset; desktop adopts the
    // same row + this contract update at style alignment (see backport ledger).
    'calm',
] as const

const EXPECTED_PALETTE_TOKENS = {
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
} as const

const FORBIDDEN_IDENTITY_TERMS = [
    'canvas',
    'dom',
    'css',
    'selector',
    'keyframe',
    'talosbackgroundeffect',
    'effect',
    'scene_factory',
    'fps',
    'dpr',
    'quality',
    'geometry_cache',
    'viewport',
]

type MutableRecord = Record<string, any>

type ChromiumColorFixture = {
    schema: string
    provenance: { engine: string; chromium_version: string; source: string; channel_space: string }
    ids: string[]
    roles: string[]
    colors: Record<string, Record<'light' | 'dark', Record<string, [number, number, number]>>>
}

function canonicalHexChannels(value: string): [number, number, number] {
    return [1, 3, 5].map((start) => Number.parseInt(value.slice(start, start + 2), 16) / 255) as [number, number, number]
}

function collectKeys(value: unknown, path = '$'): string[] {
    if (typeof value !== 'object' || value === null) return []
    return Object.entries(value).flatMap(([key, child]) => [
        `${path}.${key}`,
        ...collectKeys(child, `${path}.${key}`),
    ])
}

function identityPayload(id: typeof EXPECTED_THEME_IDS[number] = 'forge'): TalosThemeIdentity {
    const identity = getTalosThemeIdentityV6(id)
    if (!identity) throw new Error(`Missing identity ${id}.`)
    return identity
}

function valueAtPath(root: MutableRecord, path: readonly string[]): MutableRecord {
    return path.reduce((value, key) => value[key], root)
}

function nullObjectPrototypes(value: unknown): void {
    if (typeof value !== 'object' || value === null) return
    if (Array.isArray(value)) {
        for (const item of value) nullObjectPrototypes(item)
        return
    }
    for (const child of Object.values(value)) nullObjectPrototypes(child)
    Object.setPrototypeOf(value, null)
}

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
    if (typeof value !== 'object' || value === null || seen.has(value)) return
    seen.add(value)
    expect(Object.isFrozen(value)).toBe(true)
    for (const child of Object.values(value)) expectDeepFrozen(child, seen)
}

describe('TALOS shared theme identity V6', () => {
    it('exposes one strict lowercase canonical color authority', () => {
        expect(isTalosThemeIdentityCanonicalColor('#abcdef')).toBe(true)
        expect(isTalosThemeIdentityCanonicalColor('#ABCDEF')).toBe(false)
        expect(isTalosThemeIdentityCanonicalColor('#abc')).toBe(false)
        expect(isTalosThemeIdentityCanonicalColor('url(/unsafe.svg)')).toBe(false)
        expect(isTalosThemeIdentityCanonicalColor('var(--talos-accent)')).toBe(false)
    })

    it('uses the independent literal list of exactly fourteen preset IDs', () => {
        expect(EXPECTED_THEME_IDS).toHaveLength(14)
        expect(new Set(EXPECTED_THEME_IDS)).toHaveLength(14)
        expect(TALOS_THEME_PRESETS.map((preset) => preset.id)).toEqual(EXPECTED_THEME_IDS)
        expect(TALOS_THEME_IDENTITIES_V6.map((identity) => identity.id)).toEqual(EXPECTED_THEME_IDS)
    })

    it('matches the independent Chromium computed-style oracle within one sRGB channel step', () => {
        const fixture = chromiumColorFixture as ChromiumColorFixture
        expect(fixture.schema).toBe('talos_theme_identity_chromium_colors_v1')
        expect(fixture.provenance).toMatchObject({
            engine: 'Chromium',
            chromium_version: '149.0.7827.55',
            source: 'getComputedStyle(element).color',
            channel_space: 'srgb-normalized',
        })
        expect(fixture.ids).toEqual(EXPECTED_THEME_IDS.filter((id) => id !== 'calm'))
        expect(fixture.roles).toEqual(Object.keys(EXPECTED_PALETTE_TOKENS))
        expect(TALOS_THEME_IDENTITY_PALETTE_ROLES).toEqual(Object.keys(EXPECTED_PALETTE_TOKENS))

        // The Chromium oracle snapshot covers the 13 legacy presets; `calm`
        // (F1 mobile design-lead) gets its oracle entry at desktop alignment.
        const oracleIds = EXPECTED_THEME_IDS.filter((id) => id in fixture.colors)
        expect(oracleIds).toHaveLength(13)
        expect(oracleIds).not.toContain('calm')

        let channelComparisons = 0
        let mismatchCount = 0
        let maxDelta = 0
        for (const id of oracleIds) {
            const identity = identityPayload(id)
            for (const mode of ['light', 'dark'] as const) {
                const style = talosThemeModeVariantStyle(id, mode)
                for (const [role, token] of Object.entries(EXPECTED_PALETTE_TOKENS)) {
                    const canonical = talosCanonicalOpaqueColor(style[token], style)
                    expect(identity.semantic_palette[mode][role as keyof typeof EXPECTED_PALETTE_TOKENS]).toBe(canonical)
                    const projected = canonicalHexChannels(canonical)
                    const browser = fixture.colors[id][mode][role]

                    for (let channel = 0; channel < 3; channel += 1) {
                        const delta = Math.abs(projected[channel] - browser[channel])
                        channelComparisons += 1
                        maxDelta = Math.max(maxDelta, delta)
                        if (delta > (1 / 255)) mismatchCount += 1
                    }
                }
            }
        }

        expect({
            channel_comparisons: channelComparisons,
            mismatch_count: mismatchCount,
            max_delta: Number(maxDelta.toFixed(6)),
        }).toEqual({
            channel_comparisons: 1248,
            mismatch_count: 0,
            max_delta: 0.001961,
        })
    })

    it('emits only canonical opaque six-digit lowercase palette colors', () => {
        for (const identity of TALOS_THEME_IDENTITIES_V6) {
            for (const mode of ['light', 'dark'] as const) {
                for (const color of Object.values(identity.semantic_palette[mode])) {
                    expect(color, `${identity.id}/${mode}`).toMatch(/^#[0-9a-f]{6}$/)
                }
            }
        }
    })

    it('provides complete local typography, assets, semantic intents, and accessibility defaults', () => {
        expect(TALOS_THEME_IDENTITY_SCHEMA_VERSION).toBe(1)
        for (const identity of TALOS_THEME_IDENTITIES_V6) {
            expect(identity.schema_version).toBe(1)
            for (const face of [identity.typography.ui, identity.typography.display, identity.typography.mono]) {
                expect(face.family).toBeTruthy()
                expect(face.fallback_families.length).toBeGreaterThan(0)
                expect(face.provenance).toBe('local')
            }
            expect(identity.assets.poster).toEqual({
                id: `${identity.id}-poster`,
                path: `/talos/backgrounds/${identity.id}-poster.webp`,
                provenance: 'local',
            })
            expect(Object.values(identity.motion_intents).every((intent) => intent.startsWith(`${identity.id}.`))).toBe(true)
            expect(identity.accessibility.defaults.reduced_motion).toBe('respect')
        }
    })

    it('does not encode renderer, effect, viewport, or desktop implementation details', () => {
        for (const identity of TALOS_THEME_IDENTITIES_V6) {
            const keys = collectKeys(identity).map((key) => key.toLowerCase())
            expect(keys.filter((key) => FORBIDDEN_IDENTITY_TERMS.some((term) => key.includes(term))), identity.id).toEqual([])
        }
    })

    it.each([
        'https://cdn.example.test/forge-poster.webp',
        '../forge-poster.webp',
        '/talos/backgrounds/paper-poster.webp',
        '/talos/backgrounds/forge-poster.webp?cache=1',
    ])('rejects non-canonical poster path %s', (path) => {
        const payload = identityPayload() as MutableRecord
        payload.assets.poster.path = path
        expect(importTalosThemeIdentity(payload)).toBeNull()
        expect(() => exportTalosThemeIdentity(payload as TalosThemeIdentity)).toThrow(TypeError)
    })

    it('rejects a poster ID belonging to another preset', () => {
        const payload = identityPayload() as MutableRecord
        payload.assets.poster.id = 'paper-poster'
        expect(importTalosThemeIdentity(payload)).toBeNull()
    })

    it('rejects custom prototypes at every object level and on fallback arrays', () => {
        const objectPaths = [
            [],
            ['semantic_palette'],
            ['semantic_palette', 'light'],
            ['semantic_palette', 'dark'],
            ['typography'],
            ['typography', 'ui'],
            ['typography', 'display'],
            ['typography', 'mono'],
            ['typography', 'fallback_metadata'],
            ['assets'],
            ['assets', 'poster'],
            ['motion_intents'],
            ['accessibility'],
            ['accessibility', 'defaults'],
        ] as const

        for (const path of objectPaths) {
            const payload = identityPayload() as MutableRecord
            Object.setPrototypeOf(valueAtPath(payload, path), { inherited: true })
            expect(importTalosThemeIdentity(payload), path.join('.') || '$').toBeNull()
        }

        const arrayPayload = identityPayload() as MutableRecord
        Object.setPrototypeOf(arrayPayload.typography.ui.fallback_families, [])
        expect(importTalosThemeIdentity(arrayPayload)).toBeNull()
    })

    it('accepts JSON-like objects with null prototypes', () => {
        const payload = identityPayload() as MutableRecord
        nullObjectPrototypes(payload)
        expect(importTalosThemeIdentity(payload)).toEqual(identityPayload())
    })

    it('rejects nested accessors without invoking them', () => {
        for (const [target, key] of [
            [(payload: MutableRecord) => payload.semantic_palette.light, 'accent'],
            [(payload: MutableRecord) => payload.typography.ui.fallback_families, '0'],
        ] as const) {
            const payload = identityPayload() as MutableRecord
            let reads = 0
            Object.defineProperty(target(payload), key, {
                configurable: true,
                enumerable: true,
                get() {
                    reads += 1
                    return '#ffffff'
                },
            })
            expect(importTalosThemeIdentity(payload)).toBeNull()
            expect(reads).toBe(0)
        }
    })

    it('rejects sparse and huge fallback arrays without proportional allocation', () => {
        const sparse = identityPayload() as MutableRecord
        sparse.typography.ui.fallback_families = Object.assign(new Array(3), { 0: 'system-ui' })
        expect(importTalosThemeIdentity(sparse)).toBeNull()

        const huge = identityPayload() as MutableRecord
        huge.typography.ui.fallback_families = new Array(1_000_000_000)
        const originalArrayFrom = Array.from
        let arrayFromCalls = 0
        let result: TalosThemeIdentity | null | undefined
        let thrown: unknown
        Array.from = ((...args: Parameters<typeof Array.from>) => {
            arrayFromCalls += 1
            throw new Error(`Array.from must not inspect huge input: ${args.length}`)
        }) as typeof Array.from
        try {
            result = importTalosThemeIdentity(huge)
        } catch (error) {
            thrown = error
        } finally {
            Array.from = originalArrayFrom
        }

        expect(thrown).toBeUndefined()
        expect(result).toBeNull()
        expect(arrayFromCalls).toBe(0)
    })

    it('rejects overlong, unsafe, and non-canonical metadata or colors', () => {
        const mutations: Array<(payload: MutableRecord) => void> = [
            (payload) => { payload.typography.ui.family = 'x'.repeat(129) },
            (payload) => { payload.typography.ui.fallback_families = Array(9).fill('system-ui') },
            (payload) => { payload.typography.ui.fallback_families[0] = 'system-ui\nunsafe' },
            (payload) => { payload.motion_intents.ambient = 'forge.ambient\u0000unsafe' },
            (payload) => { payload.semantic_palette.light.background = 'color-mix(in srgb, #fff, #000)' },
            (payload) => { payload.semantic_palette.light.background = '#fff' },
        ]

        for (const mutate of mutations) {
            const payload = identityPayload() as MutableRecord
            mutate(payload)
            expect(importTalosThemeIdentity(payload)).toBeNull()
        }
    })

    it('accepts only the canonical identity associated with the preset ID', () => {
        const mutations: Array<(payload: MutableRecord) => void> = [
            (payload) => { payload.typography.ui.family = 'Manrope' },
            (payload) => { payload.motion_intents.ambient = 'paper.ambient' },
            (payload) => { payload.semantic_palette.dark.accent = '#000000' },
            (payload) => { payload.density = 'spacious' },
        ]

        for (const mutate of mutations) {
            const payload = identityPayload() as MutableRecord
            mutate(payload)
            expect(importTalosThemeIdentity(payload)).toBeNull()
            expect(() => exportTalosThemeIdentity(payload as TalosThemeIdentity)).toThrow(TypeError)
        }
    })

    it('round-trips without coercion, mutation, or nested aliases', () => {
        const source = identityPayload()
        const before = structuredClone(source)
        const exported = exportTalosThemeIdentity(source)
        const imported = importTalosThemeIdentity(exported)

        expect(source).toEqual(before)
        expect(imported).toEqual(source)
        expect(imported).not.toBe(source)
        expect(imported?.semantic_palette).not.toBe(source.semantic_palette)
        expect(imported?.typography.ui.fallback_families).not.toBe(source.typography.ui.fallback_families)

        if (!imported) throw new Error('Expected a valid identity import.')
        imported.semantic_palette.light.background = '#000000'
        expect(source.semantic_palette.light.background).not.toBe('#000000')

        for (const malformed of [
            { ...exported, schema_version: 2 },
            { ...exported, extra: true },
            { ...exported, id: 42 },
            { ...exported, semantic_palette: { ...exported.semantic_palette, light: [] } },
        ]) {
            expect(importTalosThemeIdentity(malformed)).toBeNull()
        }
    })

    it('deep-freezes canonical identities and isolates getters and exports from mutation attempts', () => {
        expectDeepFrozen(TALOS_THEME_IDENTITIES_V6)
        const canonical = TALOS_THEME_IDENTITIES_V6[0]
        const before = JSON.stringify(exportTalosThemeIdentity(canonical))

        expect(() => {
            ;(canonical.semantic_palette.light as MutableRecord).background = '#000000'
        }).toThrow(TypeError)
        expect(() => {
            ;(canonical.typography.ui.fallback_families as string[]).push('unsafe')
        }).toThrow(TypeError)

        expect(JSON.stringify(exportTalosThemeIdentity(canonical))).toBe(before)
        expect(JSON.stringify(getTalosThemeIdentityV6('forge'))).toBe(before)
    })
})

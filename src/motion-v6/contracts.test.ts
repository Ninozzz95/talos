import { describe, expect, it } from 'vitest'
import {
    TALOS_INTERFACE_EASINGS,
    TALOS_INTERFACE_PROFILES,
    TALOS_MOTION_DPR_CAPS,
    TALOS_MOTION_FPS_CAPS,
    TALOS_MOTION_MAX_ISSUES,
    TALOS_MOTION_QUALITY_LEVELS,
    TALOS_MOTION_RANGES,
    TALOS_MOTION_RENDERER_MODES,
    TALOS_MOTION_SCENE_IDS,
    parseTalosMotionV6Preferences,
} from './contracts'
import {
    TALOS_MOTION_V6_DEFAULTS,
    createDefaultTalosMotionV6Preferences,
} from './defaults'

const TOP_LEVEL_KEYS = [
    'schema_version',
    'mode',
    'background_enabled',
    'interface_enabled',
    'scene_override',
    'speed',
    'intensity',
    'glow_intensity',
    'density',
    'depth',
    'trails',
    'contrast',
    'parallax',
    'quality',
    'fps_cap',
    'dpr_cap',
    'pause_when_hidden',
    'respect_data_saver',
    'interface',
] as const

const INTERFACE_KEYS = [
    'profile',
    'duration_scale',
    'intensity',
    'easing',
    'stagger',
    'categories',
] as const

const CATEGORY_KEYS = [
    'windows',
    'surfaces',
    'navigation',
    'composer',
    'messages',
    'feedback',
] as const

const EXPECTED_DEFAULTS = {
    schema_version: 1,
    mode: 'off',
    background_enabled: true,
    interface_enabled: true,
    scene_override: null,
    speed: 100,
    intensity: 20,
    glow_intensity: 10,
    density: 100,
    depth: 92,
    trails: 50,
    contrast: 80,
    parallax: 20,
    quality: 'adaptive',
    fps_cap: 30,
    dpr_cap: 1.25,
    pause_when_hidden: true,
    respect_data_saver: true,
    interface: {
        profile: 'preset',
        duration_scale: 50,
        intensity: 65,
        easing: 'precise',
        stagger: 40,
        categories: {
            windows: true,
            surfaces: true,
            navigation: true,
            composer: true,
            messages: true,
            feedback: true,
        },
    },
} as const

type MutableRecord = Record<string, any>

function defaultPayload(): MutableRecord {
    return createDefaultTalosMotionV6Preferences() as MutableRecord
}

function expectSuccess(payload: unknown) {
    const result = parseTalosMotionV6Preferences(payload)
    expect(result.success).toBe(true)
    if (!result.success) {
        throw new Error(result.issues.map((issue) => issue.message).join('; '))
    }
    return result.value
}

function expectFailure(payload: unknown, path?: string, code?: string) {
    const result = parseTalosMotionV6Preferences(payload)
    expect(result.success).toBe(false)
    if (result.success) {
        throw new Error('Expected the payload to be rejected.')
    }
    if (path !== undefined || code !== undefined) {
        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ path, code }),
        ]))
    }
    return result.issues
}

function expectFailClosed(payload: unknown, path: string, code: string) {
    let result: ReturnType<typeof parseTalosMotionV6Preferences> | undefined

    expect(() => {
        result = parseTalosMotionV6Preferences(payload)
    }).not.toThrow()
    expect(result).toBeDefined()
    if (!result) {
        throw new Error('Expected a typed parser result.')
    }
    expect(result.success).toBe(false)
    if (result.success) {
        throw new Error('Expected the payload to be rejected.')
    }
    expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path, code }),
    ]))

    return result.issues
}

describe('TALOS Theme Motion Engine V6 contract', () => {
    it('accepts every renderer mode, quality, interface profile, and easing allowlist value', () => {
        for (const mode of TALOS_MOTION_RENDERER_MODES) {
            expectSuccess({ ...defaultPayload(), mode })
        }
        for (const quality of TALOS_MOTION_QUALITY_LEVELS) {
            expectSuccess({ ...defaultPayload(), quality })
        }
        for (const profile of TALOS_INTERFACE_PROFILES) {
            expectSuccess({ ...defaultPayload(), interface: { ...defaultPayload().interface, profile } })
        }
        for (const easing of TALOS_INTERFACE_EASINGS) {
            expectSuccess({ ...defaultPayload(), interface: { ...defaultPayload().interface, easing } })
        }
    })

    it('accepts both edges of every bounded integer range', () => {
        const payload = defaultPayload()
        const topLevelFields = ['speed', 'intensity', 'glow_intensity', 'density', 'depth', 'trails', 'contrast', 'parallax'] as const
        const interfaceFields = ['duration_scale', 'intensity', 'stagger'] as const

        for (const field of topLevelFields) {
            const range = TALOS_MOTION_RANGES[field]
            expectSuccess({ ...payload, [field]: range.min })
            expectSuccess({ ...payload, [field]: range.max })
        }
        for (const field of interfaceFields) {
            const range = TALOS_MOTION_RANGES[`interface_${field}`]
            expectSuccess({
                ...payload,
                interface: { ...payload.interface, [field]: range.min },
            })
            expectSuccess({
                ...payload,
                interface: { ...payload.interface, [field]: range.max },
            })
        }
    })

    it('rejects one value below and above every bounded integer range', () => {
        const payload = defaultPayload()
        const topLevelFields = ['speed', 'intensity', 'glow_intensity', 'density', 'depth', 'trails', 'contrast', 'parallax'] as const
        const interfaceFields = ['duration_scale', 'intensity', 'stagger'] as const

        for (const field of topLevelFields) {
            const range = TALOS_MOTION_RANGES[field]
            expectFailure({ ...payload, [field]: range.min - 1 }, field, 'out_of_range')
            expectFailure({ ...payload, [field]: range.max + 1 }, field, 'out_of_range')
        }
        for (const field of interfaceFields) {
            const range = TALOS_MOTION_RANGES[`interface_${field}`]
            expectFailure({
                ...payload,
                interface: { ...payload.interface, [field]: range.min - 1 },
            }, `interface.${field}`, 'out_of_range')
            expectFailure({
                ...payload,
                interface: { ...payload.interface, [field]: range.max + 1 },
            }, `interface.${field}`, 'out_of_range')
        }
    })

    it('accepts every FPS and DPR cap and rejects non-allowlisted values', () => {
        for (const fps_cap of TALOS_MOTION_FPS_CAPS) {
            expectSuccess({ ...defaultPayload(), fps_cap })
        }
        for (const dpr_cap of TALOS_MOTION_DPR_CAPS) {
            expectSuccess({ ...defaultPayload(), dpr_cap })
        }
        expectFailure({ ...defaultPayload(), fps_cap: 25 }, 'fps_cap', 'invalid_value')
        expectFailure({ ...defaultPayload(), dpr_cap: 1.1 }, 'dpr_cap', 'invalid_value')
    })

    it.each([
        ['schema_version', Number.NaN],
        ['schema_version', Number.POSITIVE_INFINITY],
        ['fps_cap', Number.NaN],
        ['fps_cap', Number.POSITIVE_INFINITY],
        ['dpr_cap', Number.NaN],
        ['dpr_cap', Number.NEGATIVE_INFINITY],
    ])('reports non-finite numeric allowlist value at %s', (field, value) => {
        expectFailure({ ...defaultPayload(), [field]: value }, field, 'not_finite')
    })

    it('keeps the complete frozen default payload exact', () => {
        expect(TALOS_MOTION_V6_DEFAULTS).toEqual(EXPECTED_DEFAULTS)
        expect(createDefaultTalosMotionV6Preferences()).toEqual(EXPECTED_DEFAULTS)
        expect(TALOS_MOTION_V6_DEFAULTS).toMatchObject({
            mode: 'off',
            background_enabled: true,
            interface_enabled: true,
        })
        expect(Object.keys(TALOS_MOTION_V6_DEFAULTS)).toEqual(TOP_LEVEL_KEYS)
        expect(Object.keys(TALOS_MOTION_V6_DEFAULTS.interface)).toEqual(INTERFACE_KEYS)
        expect(Object.keys(TALOS_MOTION_V6_DEFAULTS.interface.categories)).toEqual(CATEGORY_KEYS)
        expect(Object.isFrozen(TALOS_MOTION_V6_DEFAULTS)).toBe(true)
        expect(Object.isFrozen(TALOS_MOTION_V6_DEFAULTS.interface)).toBe(true)
        expect(Object.isFrozen(TALOS_MOTION_V6_DEFAULTS.interface.categories)).toBe(true)
    })

    it('returns deeply independent defaults from every factory call', () => {
        const first = createDefaultTalosMotionV6Preferences()
        const second = createDefaultTalosMotionV6Preferences()

        expect(first).not.toBe(second)
        expect(first.interface).not.toBe(second.interface)
        expect(first.interface.categories).not.toBe(second.interface.categories)

        first.interface.categories.windows = false
        first.interface.duration_scale = 120

        expect(second.interface.categories.windows).toBe(true)
        expect(second.interface.duration_scale).toBe(50)
    })

    it('preserves an explicitly saved interface duration scale', () => {
        const payload = defaultPayload()
        payload.interface.duration_scale = 100

        expect(expectSuccess(payload).interface.duration_scale).toBe(100)
    })

    it('accepts a legacy V6 payload without glow intensity and canonicalizes it off', () => {
        const payload = defaultPayload()
        delete payload.glow_intensity

        const parsed = expectSuccess(payload)

        expect(parsed.glow_intensity).toBe(0)
        expect(Object.keys(parsed)).toEqual(TOP_LEVEL_KEYS)
    })

    it('rejects missing and unknown keys at every strict object level', () => {
        const unknownTopLevel = defaultPayload()
        unknownTopLevel.extra = true
        expectFailure(unknownTopLevel, 'extra', 'unknown_key')

        const missingTopLevel = defaultPayload()
        delete missingTopLevel.mode
        expectFailure(missingTopLevel, 'mode', 'missing_key')

        const unknownInterface = defaultPayload()
        unknownInterface.interface.extra = true
        expectFailure(unknownInterface, 'interface.extra', 'unknown_key')

        const missingInterface = defaultPayload()
        delete missingInterface.interface.easing
        expectFailure(missingInterface, 'interface.easing', 'missing_key')

        const unknownCategories = defaultPayload()
        unknownCategories.interface.categories.extra = true
        expectFailure(unknownCategories, 'interface.categories.extra', 'unknown_key')

        const missingCategory = defaultPayload()
        delete missingCategory.interface.categories.feedback
        expectFailure(missingCategory, 'interface.categories.feedback', 'missing_key')
    })

    it('never invokes an alternating getter or accepts its post-validation value', () => {
        const payload = defaultPayload()
        let reads = 0
        Object.defineProperty(payload, 'speed', {
            configurable: true,
            enumerable: true,
            get() {
                reads += 1
                return reads === 1 ? 100 : 'invalid-after-validation'
            },
        })

        expectFailClosed(payload, 'speed', 'invalid_property')
        expect(reads).toBe(0)
    })

    it('turns a throwing getter into a typed issue without invoking it', () => {
        const payload = defaultPayload()
        let reads = 0
        Object.defineProperty(payload.interface, 'duration_scale', {
            configurable: true,
            enumerable: true,
            get() {
                reads += 1
                throw new Error('getter must not execute')
            },
        })

        expectFailClosed(payload, 'interface.duration_scale', 'invalid_property')
        expect(reads).toBe(0)
    })

    it.each([
        ['ownKeys', new Proxy(defaultPayload(), {
            ownKeys() {
                throw new Error('ownKeys failed')
            },
        }), '$'],
        ['getOwnPropertyDescriptor', new Proxy(defaultPayload(), {
            getOwnPropertyDescriptor() {
                throw new Error('descriptor failed')
            },
        }), 'schema_version'],
    ] as const)('fails closed when the %s Proxy trap throws', (_trap, payload, path) => {
        expectFailClosed(payload, path, 'uninspectable_object')
    })

    it.each([
        ['non-enumerable', (payload: MutableRecord) => {
            Object.defineProperty(payload, 'quality', {
                configurable: true,
                enumerable: false,
                value: 'adaptive',
                writable: true,
            })
        }, 'quality'],
        ['accessor-backed', (payload: MutableRecord) => {
            Object.defineProperty(payload.interface.categories, 'feedback', {
                configurable: true,
                enumerable: true,
                get: () => true,
            })
        }, 'interface.categories.feedback'],
    ] as const)('rejects %s canonical fields as non-JSON properties', (_kind, alter, path) => {
        const payload = defaultPayload()
        alter(payload)

        const issues = expectFailure(payload, path, 'invalid_property')
        expect(issues).toEqual(expect.arrayContaining([
            expect.objectContaining({
                path,
                message: expect.stringContaining('enumerable own data property'),
            }),
        ]))
    })

    it('continues to accept a complete JSON.parse payload', () => {
        expectSuccess(JSON.parse(JSON.stringify(defaultPayload())))
    })

    it('rejects wrong types without coercing numeric or boolean strings', () => {
        const cases: Array<[string, MutableRecord]> = [
            ['speed', { ...defaultPayload(), speed: '100' }],
            ['glow_intensity', { ...defaultPayload(), glow_intensity: '0' }],
            ['background_enabled', { ...defaultPayload(), background_enabled: 'true' }],
            ['scene_override', { ...defaultPayload(), scene_override: 1 }],
            ['interface', { ...defaultPayload(), interface: [] }],
            ['interface.categories', { ...defaultPayload(), interface: { ...defaultPayload().interface, categories: [] } }],
            ['interface.categories.windows', {
                ...defaultPayload(),
                interface: {
                    ...defaultPayload().interface,
                    categories: { ...defaultPayload().interface.categories, windows: 'false' },
                },
            }],
        ]

        for (const [path, payload] of cases) {
            expectFailure(payload, path, 'invalid_type')
        }
        expectFailure({ ...defaultPayload(), speed: 100.5 }, 'speed', 'not_integer')
        expectFailure({ ...defaultPayload(), speed: Number.NaN }, 'speed', 'not_finite')
        expectFailure({ ...defaultPayload(), speed: Number.POSITIVE_INFINITY }, 'speed', 'not_finite')
    })

    it('rejects arrays and non-object root payloads', () => {
        for (const payload of [null, [], 'motion-v6', 1, true]) {
            expectFailure(payload, '$', 'invalid_type')
        }
    })

    it('accepts the complete scene registry and rejects invalid scene IDs', () => {
        for (const scene_override of TALOS_MOTION_SCENE_IDS) {
            expectSuccess({ ...defaultPayload(), scene_override })
        }
        expectSuccess({ ...defaultPayload(), scene_override: null })
        expectFailure({ ...defaultPayload(), scene_override: 'unknown-scene' }, 'scene_override', 'invalid_value')
    })

    it('requires exactly the six category booleans', () => {
        expect(Object.keys(defaultPayload().interface.categories)).toEqual(CATEGORY_KEYS)

        const missing = defaultPayload()
        delete missing.interface.categories.windows
        expectFailure(missing, 'interface.categories.windows', 'missing_key')

        const unknown = defaultPayload()
        unknown.interface.categories.extra = false
        expectFailure(unknown, 'interface.categories.extra', 'unknown_key')

        const wrongType = defaultPayload()
        wrongType.interface.categories.messages = 1
        expectFailure(wrongType, 'interface.categories.messages', 'invalid_type')
    })

    it('does not mutate input and does not alias nested output objects', () => {
        const input = defaultPayload()
        const before = structuredClone(input)
        const value = expectSuccess(input)

        expect(input).toEqual(before)
        expect(value).not.toBe(input)
        expect(value.interface).not.toBe(input.interface)
        expect(value.interface.categories).not.toBe(input.interface.categories)

        input.interface.categories.windows = false
        expect(value.interface.categories.windows).toBe(true)

        value.interface.categories.feedback = false
        expect(input.interface.categories.feedback).toBe(true)
    })

    it('returns deterministic issues with stable paths and codes under the bounded issue limit', () => {
        const malformed = defaultPayload()
        for (let index = 99; index >= 0; index -= 1) {
            malformed[`unknown_${index}`] = index
        }

        const first = parseTalosMotionV6Preferences(malformed)
        const second = parseTalosMotionV6Preferences(malformed)

        expect(first.success).toBe(false)
        expect(second.success).toBe(false)
        if (first.success || second.success) {
            throw new Error('Expected the malformed payloads to be rejected.')
        }
        expect(first.issues).toEqual(second.issues)
        expect(first.issues).toHaveLength(TALOS_MOTION_MAX_ISSUES)
        expect(first.issues.every((issue) => issue.code === 'unknown_key')).toBe(true)
        expect(first.issues[0]).toMatchObject({
            path: 'unknown_0',
            code: 'unknown_key',
            message: expect.stringContaining('Remove'),
        })
    })
})

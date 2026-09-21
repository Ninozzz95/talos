import { readFileSync } from 'node:fs'
import sceneRegistrySourceRaw from './sceneRegistry.ts?raw'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
    ABSOLUTE_MOTION_CLOCK_MAX_DELTA_MS,
    DEFAULT_MOTION_CLOCK_MAX_DELTA_MS,
} from './clock'
import {
    TALOS_MOTION_SCENE_IDS,
} from './contracts'
import { TALOS_MOTION_RUNTIME_QUALITY_TIERS } from './runtimePolicy'
import {
    SCENE_REGISTRY_MAX_ASSETS,
    SCENE_REGISTRY_MAX_DELTA_MS,
    SCENE_REGISTRY_MAX_ENTRIES,
    SCENE_REGISTRY_MAX_PALETTE_KEYS,
    SCENE_REGISTRY_MAX_STRING_LENGTH,
    SceneRegistryError,
    type ComplexSceneRegistration,
    createSceneRegistry,
    createSceneRegistryBuilder,
    type SceneInput,
    type SceneInstance,
    type SceneRegistration,
} from './sceneRegistry'

const PALETTE_KEYS = [
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
] as const

type MutableRecord = Record<string, any>

function palette(seed: string): MutableRecord {
    const color = seed === 'fff' ? '#ffffff' : '#000000'
    return Object.fromEntries(PALETTE_KEYS.map((key) => [key, color]))
}

function input(): SceneInput {
    return {
        colorMode: 'dark',
        palette: {
            light: palette('fff') as SceneInput['palette']['light'],
            dark: palette('000') as SceneInput['palette']['dark'],
        },
        viewport: { width: 1440, height: 900, pixelRatio: 1 },
        seed: 42,
        logicalTimeMs: 100,
        deltaMs: 16,
        parameters: {
            speed: 100,
            intensity: 65,
            density: 100,
            depth: 50,
            trails: 35,
            contrast: 60,
            parallax: 20,
        },
        effectiveQuality: {
            tier: 'balanced',
            fpsCap: 30,
            dprCap: 1.25,
            densityScale: 1,
        },
    }
}


function instance(kind: 'static' | 'simple' | 'complex', calls: string[] = []): SceneInstance<typeof kind> {
    return {
        kind,
        mount: () => calls.push('mount'),
        renderOrUpdate: () => calls.push('renderOrUpdate'),
        resize: () => calls.push('resize'),
        pause: () => calls.push('pause'),
        resume: () => calls.push('resume'),
        dispose: () => calls.push('dispose'),
    }
}

function registration(
    id: string = 'forge',
    kind: 'static' | 'simple' | 'complex' = 'static',
    factory: SceneRegistration['factory'] = () => instance(kind),
): SceneRegistration {
    return { id, kind, factory, assets: [] } as SceneRegistration
}

function expectCode(action: () => unknown, code: SceneRegistryError['code']): SceneRegistryError {
    try {
        action()
        throw new Error('Expected SceneRegistryError.')
    } catch (error) {
        expect(error).toBeInstanceOf(SceneRegistryError)
        expect((error as SceneRegistryError).code).toBe(code)
        return error as SceneRegistryError
    }
}

describe('Theme Motion Engine V6 scene registry foundation', () => {
    it('accepts an empty registry and returns an immutable empty snapshot', () => {
        const registry = createSceneRegistry()

        expect(registry.lookup('forge', 'static')).toBeNull()
        expect(registry.snapshot()).toEqual([])
        expect(Object.isFrozen(registry.snapshot())).toBe(true)
    })

    it('keeps Simple, Complex, and Static registrations strictly typed by kind', () => {
        const simple = registration('forge', 'simple')
        const complex = registration('paper', 'complex')
        const staticFrame = registration('terminal', 'static')
        const registry = createSceneRegistry([simple, complex, staticFrame])

        expect(registry.lookup('forge', 'simple')?.kind).toBe('simple')
        expect(registry.lookup('paper', 'complex')?.kind).toBe('complex')
        expect(registry.lookup('terminal', 'static')?.kind).toBe('static')
        expect(registry.lookup('forge', 'complex')).toBeNull()
        expectTypeOf(registry.lookup('forge', 'complex')).toEqualTypeOf<ComplexSceneRegistration | null>()
        expectTypeOf(registry.create('forge', 'complex', input())).toEqualTypeOf<SceneInstance<'complex'> | null>()
    })

    it('uses canonical scene IDs and permits one registration per kind and ID', () => {
        for (const id of TALOS_MOTION_SCENE_IDS) {
            const registry = createSceneRegistry([
                registration(id, 'simple'),
                registration(id, 'complex'),
                registration(id, 'static'),
            ])
            expect(registry.lookup(id, 'simple')?.id).toBe(id)
            expect(registry.lookup(id, 'complex')?.id).toBe(id)
            expect(registry.lookup(id, 'static')?.id).toBe(id)
        }

        const builder = createSceneRegistryBuilder()
        builder.register(registration('forge', 'simple'))
        builder.register(registration('forge', 'complex'))
        builder.register(registration('forge', 'static'))

        expectCode(() => builder.register(registration('forge', 'simple')), 'duplicate_scene_id')
        expectCode(() => createSceneRegistry([registration('future-scene')]), 'invalid_scene_id')
    })

    it('fails closed for an absent ID and an invalid kind lookup', () => {
        const registry = createSceneRegistry([registration('forge', 'static')])

        expect(registry.lookup('missing', 'static')).toBeNull()
        expect(registry.lookup('forge', 'complex')).toBeNull()
        expect(registry.lookup('forge', 'unknown' as never)).toBeNull()
    })

    it('returns a complete deeply immutable snapshot with copied asset data', () => {
        const assets = [{ id: 'poster', path: '/talos/posters/forge.webp', provenance: 'local' as const }]
        const registry = createSceneRegistry([{
            ...registration('forge', 'static'),
            assets,
        } as SceneRegistration])
        const snapshot = registry.snapshot()

        expect(Object.isFrozen(snapshot)).toBe(true)
        expect(Object.isFrozen(snapshot[0])).toBe(true)
        expect(Object.isFrozen(snapshot[0].assets)).toBe(true)
        expect(Object.isFrozen(snapshot[0].assets[0])).toBe(true)
        expect(snapshot[0].assets[0]).toEqual(assets[0])
        expect(snapshot[0].assets).not.toBe(assets)
        expect(() => (snapshot as MutableRecord).push(registration('other'))).toThrow(TypeError)
        expect(() => ((snapshot[0].assets[0] as MutableRecord).path = '/tampered')).toThrow(TypeError)

        assets[0].path = '/changed-after-registration'
        expect(snapshot[0].assets[0].path).toBe('/talos/posters/forge.webp')
    })

    it('normalizes and owns deterministic scene inputs before factory and lifecycle calls', () => {
        const received: SceneInput[] = []
        const calls: string[] = []
        const registry = createSceneRegistry([registration('forge', 'complex', (value) => {
            received.push(value)
            return {
                ...instance('complex', calls),
                renderOrUpdate: (nextInput) => {
                    calls.push('renderOrUpdate')
                    received.push(nextInput)
                },
            }
        })])
        const source = input() as MutableRecord
        const scene = registry.create('forge', 'complex', source as SceneInput)

        expect(scene).not.toBeNull()
        expect(received[0]).not.toBe(source)
        expect(Object.isFrozen(received[0])).toBe(true)
        expect(Object.isFrozen(received[0].palette)).toBe(true)
        expect(Object.isFrozen(received[0].palette.light)).toBe(true)
        expect(Object.isFrozen(received[0].parameters)).toBe(true)
        expect(Object.isFrozen(received[0].effectiveQuality)).toBe(true)

        source.parameters.intensity = 1
        source.viewport.width = 320
        expect(received[0].parameters.intensity).toBe(65)
        expect(received[0].viewport.width).toBe(1440)
        expect(scene).not.toBeNull()
        scene?.mount({ kind: 'complex', target: {} })
        scene?.renderOrUpdate(source as SceneInput)
        expect(received).toHaveLength(2)
        expect(received[1].parameters.intensity).toBe(1)
        expect(calls).toEqual(['mount', 'renderOrUpdate'])
    })

    it('enforces the lifecycle and invokes dispose exactly once', () => {
        const calls: string[] = []
        const registry = createSceneRegistry([registration('forge', 'static', () => instance('static', calls))])
        const scene = registry.create('forge', 'static', input())
        if (!scene) throw new Error('Expected scene instance.')

        expectCode(() => scene.renderOrUpdate(input()), 'scene_not_mounted')
        scene.mount({ kind: 'static', target: {} })
        scene.pause()
        scene.pause()
        scene.resume()
        scene.resume()
        scene.resize(input().viewport)
        scene.dispose()
        scene.dispose()

        expect(calls).toEqual(['mount', 'pause', 'resume', 'resize', 'dispose'])
        expectCode(() => scene.renderOrUpdate(input()), 'scene_disposed')
        expectCode(() => scene.mount({ kind: 'static', target: {} }), 'scene_disposed')
    })

    it.each([
        'https://example.test/scene.webp',
        '//cdn.example.test/scene.webp',
        'data:image/png;base64,abc',
        'blob:https://example.test/id',
        'javascript:alert(1)',
        '/talos/../private/scene.webp',
        '/talos/scenes/./scene.webp',
        '/talos/scenes\\scene.webp',
    ])('rejects unsafe asset path %s', (path) => {
        const definition = { ...registration('forge'), assets: [{ id: 'asset', path, provenance: 'local' }] }
        expectCode(() => createSceneRegistry([definition as SceneRegistration]), 'invalid_asset')
    })

    it('rejects malformed assets, excessive assets, and excessive strings', () => {
        expectCode(() => createSceneRegistry([{
            ...registration('forge'),
            assets: [{ id: 'asset', path: '/talos/a.webp', provenance: 'remote' }],
        } as SceneRegistration]), 'invalid_asset')
        expectCode(() => createSceneRegistry([{
            ...registration('paper'),
            assets: Array.from({ length: SCENE_REGISTRY_MAX_ASSETS + 1 }, (_, index) => ({
                id: `asset-${index}`,
                path: `/talos/${index}.webp`,
                provenance: 'local',
            })),
        } as SceneRegistration]), 'asset_limit_exceeded')
        expectCode(() => createSceneRegistry([registration('x'.repeat(SCENE_REGISTRY_MAX_STRING_LENGTH + 1))]), 'invalid_scene_id')
    })

    it.each([
        '#FFFFFF',
        '#fff',
        'rgb(255 255 255)',
        'url(/talos/unsafe.svg)',
        'var(--talos-accent)',
    ])('rejects non-canonical palette color %s', (color) => {
        const invalid = input() as MutableRecord
        invalid.palette.light.background = color

        expectCode(() => createSceneRegistry([registration('forge')])
            .create('forge', 'static', invalid as SceneInput), 'invalid_input')
    })

    it('uses the shared clock delta and runtime quality authorities', () => {
        expect(SCENE_REGISTRY_MAX_DELTA_MS).toBe(ABSOLUTE_MOTION_CLOCK_MAX_DELTA_MS)
        expect(SCENE_REGISTRY_MAX_DELTA_MS).toBeGreaterThan(DEFAULT_MOTION_CLOCK_MAX_DELTA_MS)
        for (const tier of TALOS_MOTION_RUNTIME_QUALITY_TIERS) {
            const candidate = input() as MutableRecord
            candidate.effectiveQuality.tier = tier
            expect(() => createSceneRegistry([registration('forge')])
                .create('forge', 'static', candidate as SceneInput)).not.toThrow()
        }
    })

    it.each([undefined, 'system', 'auto', true])('rejects invalid active color mode %s', (colorMode) => {
        const invalid = input() as MutableRecord
        if (colorMode === undefined) delete invalid.colorMode
        else invalid.colorMode = colorMode
        expectCode(() => createSceneRegistry([registration('forge')])
            .create('forge', 'static', invalid as SceneInput), 'invalid_input')
    })

    it('rejects hostile getters, proxies, sparse arrays, and custom prototypes without invoking getters', () => {
        let getterReads = 0
        const hostile = registration('hostile') as MutableRecord
        Object.defineProperty(hostile, 'id', {
            configurable: true,
            enumerable: true,
            get: () => {
                getterReads += 1
                return 'forge'
            },
        })
        expectCode(() => createSceneRegistry([hostile as SceneRegistration]), 'invalid_registration')
        expect(getterReads).toBe(0)

        const throwingProxy = new Proxy({}, {
            ownKeys: () => { throw new Error('blocked') },
        })
        expectCode(() => createSceneRegistry([throwingProxy as SceneRegistration]), 'invalid_registration')

        const sparse = new Array(1) as unknown as SceneRegistration[]
        expectCode(() => createSceneRegistry(sparse), 'invalid_registration')

        const customPrototype = registration('custom-prototype') as MutableRecord
        Object.setPrototypeOf(customPrototype, { inherited: true })
        expectCode(() => createSceneRegistry([customPrototype as SceneRegistration]), 'invalid_registration')

        const tooManyPaletteKeys = input() as MutableRecord
        tooManyPaletteKeys.palette.light = Object.fromEntries(
            Array.from({ length: SCENE_REGISTRY_MAX_PALETTE_KEYS + 1 }, (_, index) => [`key-${index}`, '#ffffff']),
        )
        expectCode(() => createSceneRegistry([registration('forge', 'static', () => instance('static'))])
            .create('forge', 'static', tooManyPaletteKeys as SceneInput), 'palette_limit_exceeded')
    })

    it('rejects invalid input bounds before invoking the factory', () => {
        const factory = vi.fn(() => instance('static'))
        const registry = createSceneRegistry([registration('forge', 'static', factory)])
        const invalid = input() as MutableRecord
        invalid.viewport.width = 0
        expectCode(() => registry.create('forge', 'static', invalid as SceneInput), 'invalid_input')
        expect(factory).not.toHaveBeenCalled()
    })

    it('fails closed for factory throws and invalid factory instances', () => {
        const factoryError = new Error('factory exploded')
        const throwingRegistry = createSceneRegistry([registration('forge', 'static', () => {
            throw factoryError
        })])
        const failure = expectCode(() => throwingRegistry.create('forge', 'static', input()), 'factory_failed')
        expect(failure.cause).toBe(factoryError)

        const invalidRegistry = createSceneRegistry([registration('forge', 'static', () => ({
            kind: 'static',
        } as never))])
        expectCode(() => invalidRegistry.create('forge', 'static', input()), 'invalid_instance')
    })

    it('makes a mount failure terminal and attempts cleanup exactly once', () => {
        const mountError = new Error('mount exploded')
        const disposeError = new Error('dispose exploded')
        const calls: string[] = []
        const registry = createSceneRegistry([registration('forge', 'complex', () => ({
            ...instance('complex', calls),
            mount: () => {
                calls.push('mount')
                throw mountError
            },
            dispose: () => {
                calls.push('dispose')
                throw disposeError
            },
        }))])
        const scene = registry.create('forge', 'complex', input())
        if (!scene) throw new Error('Expected scene instance.')

        const failure = expectCode(() => scene.mount({ kind: 'complex', target: {} }), 'mount_failed')
        expect(failure.cause).toBe(mountError)
        expect(failure.cleanupCause).toBe(disposeError)
        expectCode(() => scene.mount({ kind: 'complex', target: {} }), 'scene_disposed')
        expectCode(() => scene.renderOrUpdate(input()), 'scene_disposed')
        scene.dispose()
        expect(calls).toEqual(['mount', 'dispose'])
    })

    it('keeps normalization errors distinct from raw plugin errors', () => {
        const calls: string[] = []
        const pluginError = new SceneRegistryError('invalid_input', 'plugin rejected render data')
        const raw = instance('complex', calls) as MutableRecord
        raw.renderOrUpdate = () => {
            calls.push('renderOrUpdate')
            throw pluginError
        }
        raw.resize = () => {
            calls.push('resize')
            throw pluginError
        }
        const registry = createSceneRegistry([registration('forge', 'complex', () => raw as SceneInstance<'complex'>)])
        const scene = registry.create('forge', 'complex', input())
        if (!scene) throw new Error('Expected scene instance.')
        scene.mount({ kind: 'complex', target: {} })

        const renderFailure = expectCode(() => scene.renderOrUpdate(input()), 'render_failed')
        const resizeFailure = expectCode(() => scene.resize(input().viewport), 'resize_failed')
        expect(renderFailure.cause).toBe(pluginError)
        expect(resizeFailure.cause).toBe(pluginError)
        expect(calls).toEqual(['mount', 'renderOrUpdate', 'resize'])

        const invalidInput = input() as MutableRecord
        invalidInput.viewport.width = 0
        expectCode(() => scene.renderOrUpdate(invalidInput as SceneInput), 'invalid_input')
        expectCode(() => scene.resize(invalidInput.viewport), 'invalid_input')
        expect(calls).toEqual(['mount', 'renderOrUpdate', 'resize'])
    })

    it('rejects a wrong mount kind before invoking the plugin and remains usable', () => {
        const calls: string[] = []
        const registry = createSceneRegistry([registration('forge', 'complex', () => instance('complex', calls))])
        const scene = registry.create('forge', 'complex', input())
        if (!scene) throw new Error('Expected scene instance.')

        expectCode(() => scene.mount({ kind: 'simple', target: {} } as never), 'invalid_input')
        expect(calls).toEqual([])
        scene.mount({ kind: 'complex', target: {} })
        expect(calls).toEqual(['mount'])
    })

    it.each([
        ['mount', 'mount_failed'],
        ['renderOrUpdate', 'render_failed'],
        ['resize', 'resize_failed'],
        ['pause', 'pause_failed'],
        ['resume', 'resume_failed'],
        ['dispose', 'dispose_failed'],
    ] as const)('wraps %s lifecycle faults with stable error semantics', (operation, code) => {
        const calls: string[] = []
        const raw = instance('static', calls) as MutableRecord
        raw[operation] = () => {
            calls.push(operation)
            throw new Error(`${operation} exploded`)
        }
        const registry = createSceneRegistry([registration('forge', 'static', () => raw as SceneInstance<'static'>)])
        const scene = registry.create('forge', 'static', input())
        if (!scene) throw new Error('Expected scene instance.')

        if (operation === 'mount') {
            expectCode(() => scene.mount({ kind: 'static', target: {} }), code)
        } else if (operation === 'renderOrUpdate') {
            scene.mount({ kind: 'static', target: {} })
            expectCode(() => scene.renderOrUpdate(input()), code)
        } else if (operation === 'resize') {
            scene.mount({ kind: 'static', target: {} })
            expectCode(() => scene.resize(input().viewport), code)
        } else if (operation === 'pause') {
            scene.mount({ kind: 'static', target: {} })
            expectCode(() => scene.pause(), code)
        } else if (operation === 'resume') {
            scene.mount({ kind: 'static', target: {} })
            raw.pause = () => calls.push('pause')
            scene.pause()
            expectCode(() => scene.resume(), code)
        } else {
            expectCode(() => scene.dispose(), code)
        }
        const count = calls.filter((call) => call === operation).length
        expect(count).toBe(1)
    })

    it('does not depend on ambient DOM, wall-clock, or random APIs', () => {
        const source = sceneRegistrySourceRaw

        expect(source).not.toMatch(/\bwindow\b|\bdocument\b|Date\.now|Math\.random/)
    })

    it('keeps the registry bounded and rejects overflow', () => {
        const builder = createSceneRegistryBuilder()
        for (const id of TALOS_MOTION_SCENE_IDS) {
            for (const kind of ['static', 'simple', 'complex'] as const) {
                builder.register(registration(id, kind))
            }
        }
        expectCode(() => builder.register(registration('forge', 'static')), 'registry_limit_exceeded')
    })
})

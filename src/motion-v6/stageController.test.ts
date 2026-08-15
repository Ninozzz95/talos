import { describe, expect, it, vi } from 'vitest'
import {
    createSceneRegistry,
    type SceneFactory,
    type SceneId,
    type SceneInput,
    type SceneInstance,
    type SceneKind,
    type SceneRegistration,
    type SceneRegistry,
    type SceneViewport,
} from './sceneRegistry'
import {
    createTalosMotionStageController,
    type TalosMotionStageControllerOptions,
    type TalosMotionStageFaultReason,
} from './stageController'

type MutableRecord = Record<string, unknown>

const palette = {
    background: '#101820',
    surface: '#18252f',
    surfaceRaised: '#20313d',
    text: '#f4f7f8',
    textMuted: '#aebbc2',
    border: '#49606c',
    accent: '#d49a52',
    accentStrong: '#f1b96f',
    accentSoft: '#5b4225',
    info: '#72b9d4',
    success: '#6fc69a',
    warning: '#e3b866',
    danger: '#dd7f7f',
    scrim: '#000000',
} as const

function input(viewport: SceneViewport = { width: 800, height: 500, pixelRatio: 1 }): SceneInput {
    return {
        colorMode: 'dark',
        palette: { light: palette, dark: palette },
        viewport,
        seed: 7,
        logicalTimeMs: 0,
        deltaMs: 0,
        parameters: {
            speed: 100,
            intensity: 60,
            density: 80,
            depth: 50,
            trails: 20,
            contrast: 50,
            parallax: 30,
        },
        effectiveQuality: {
            tier: 'balanced',
            fpsCap: 30,
            dprCap: 1.25,
            densityScale: 1,
        },
    }
}

function canonicalRegistryInput(): SceneInput {
    const roles = [
        'background', 'surface', 'surface_muted', 'surface_elevated',
        'text', 'text_muted', 'border', 'border_strong',
        'accent', 'accent_text', 'secondary', 'success',
        'warning', 'danger', 'info', 'focus',
    ] as const
    const resolved = Object.fromEntries(roles.map((role) => [role, '#101820'])) as SceneInput['palette']['light']
    return {
        ...input(),
        palette: { light: { ...resolved }, dark: { ...resolved } },
    }
}

function instance(kind: SceneKind, calls: string[], overrides: Partial<SceneInstance> = {}): SceneInstance {
    return {
        kind,
        mount: () => calls.push(`${kind}:mount`),
        renderOrUpdate: () => calls.push(`${kind}:render`),
        resize: () => calls.push(`${kind}:resize`),
        pause: () => calls.push(`${kind}:pause`),
        resume: () => calls.push(`${kind}:resume`),
        dispose: () => calls.push(`${kind}:dispose`),
        ...overrides,
    } as SceneInstance
}

function registryFor(
    factories: Partial<Record<SceneKind, SceneFactory>> = {},
    hooks: { lookup?: (id: string, kind: SceneKind) => SceneRegistration | null } = {},
): SceneRegistry {
    const registrations = new Map<string, SceneRegistration>()
    for (const kind of ['complex', 'simple', 'static'] as const) {
        const factory = factories[kind]
        if (factory) {
            registrations.set(`${kind}:forge`, {
                id: 'forge',
                kind,
                factory,
                assets: [],
            } as SceneRegistration)
        }
    }

    return {
        lookup: (id, kind) => hooks.lookup?.(id, kind) as never ?? registrations.get(`${kind}:${id}`) as never ?? null,
        create: (id, kind, sceneInput) => {
            const registration = registrations.get(`${kind}:${id}`)
            if (!registration) return null
            return registration.factory(sceneInput) as SceneInstance<typeof kind>
        },
        snapshot: () => [...registrations.values()],
    }
}

function options(overrides: Partial<TalosMotionStageControllerOptions> = {}): TalosMotionStageControllerOptions {
    return {
        registry: registryFor({
            complex: () => instance('complex', []),
            simple: () => instance('simple', []),
            static: () => instance('static', []),
        }),
        requestedMode: 'complex',
        effectiveMode: 'complex',
        sceneId: 'forge',
        input: input(),
        target: { opaque: true },
        backgroundEnabled: true,
        paused: false,
        ...overrides,
    }
}

describe('TalosMotionStageController', () => {
    it('keeps one active instance and disposes old before creating a swapped scene', () => {
        const calls: string[] = []
        const controller = createTalosMotionStageController(options({
            registry: registryFor({
                complex: () => instance('complex', calls),
                simple: () => instance('simple', calls),
            }),
        }))

        controller.mount()
        controller.update({ effectiveMode: 'simple', requestedMode: 'simple' })

        expect(calls).toEqual(['complex:mount', 'complex:render', 'complex:dispose', 'simple:mount', 'simple:render'])
        expect(controller.snapshot()).toMatchObject({ activeKind: 'simple', activeId: 'forge', solidFallback: false })
    })

    it('reuses the same kind and id through renderOrUpdate', () => {
        const calls: string[] = []
        const create = vi.fn(() => instance('complex', calls))
        const controller = createTalosMotionStageController(options({
            registry: registryFor({ complex: create }),
        }))

        controller.mount()
        controller.update({ input: input({ width: 900, height: 500, pixelRatio: 1 }) })

        expect(create).toHaveBeenCalledTimes(1)
        expect(calls).toEqual(['complex:mount', 'complex:render', 'complex:render'])
    })

    it('fails closed without factory access for an impossible requested/effective pair', () => {
        const factory = vi.fn(() => instance('complex', []))
        const controller = createTalosMotionStageController(options({
            requestedMode: 'static',
            effectiveMode: 'complex',
            registry: registryFor({ complex: factory }),
        }))

        controller.mount()

        expect(factory).not.toHaveBeenCalled()
        expect(controller.snapshot()).toMatchObject({
            activeKind: null,
            fallbackReason: 'invalid_configuration',
            status: 'solid-fallback',
        })
    })

    it('applies initial and updated paused state exactly once', () => {
        const calls: string[] = []
        const controller = createTalosMotionStageController(options({
            requestedMode: 'static',
            effectiveMode: 'static',
            paused: true,
            registry: registryFor({ static: () => instance('static', calls) }),
        }))

        controller.mount()
        controller.update({ paused: true })
        controller.update({ paused: false })
        controller.update({ paused: false })

        expect(calls.filter((call) => call === 'static:pause')).toHaveLength(1)
        expect(calls.filter((call) => call === 'static:resume')).toHaveLength(1)
        expect(controller.snapshot()).toMatchObject({ paused: false, status: 'active' })
    })

    it('rejects hostile instance candidates without invoking getters or proxy traps', () => {
        let getterReads = 0
        const getterCandidate = instance('complex', []) as MutableRecord
        Object.defineProperty(getterCandidate, 'mount', {
            configurable: true,
            enumerable: true,
            get: () => {
                getterReads += 1
                return () => undefined
            },
        })
        const proxyCandidate = new Proxy(instance('complex', []) as object, {
            ownKeys: () => { throw new Error('blocked') },
        })
        const faults: TalosMotionStageFaultReason[] = []
        const controller = createTalosMotionStageController(options({
            registry: registryFor({
                complex: () => getterCandidate as never,
                simple: () => proxyCandidate as never,
                static: () => instance('static', []),
            }),
            onFault: ({ reason }) => faults.push(reason),
        }))

        expect(() => controller.mount()).not.toThrow()

        expect(getterReads).toBe(0)
        expect(faults).toEqual(['invalid_instance', 'invalid_instance'])
        expect(controller.snapshot()).toMatchObject({ activeKind: 'static', fallbackReason: 'invalid_instance' })
    })

    it('rejects a revoked Proxy instance as invalid_instance without throwing', () => {
        const revocable = Proxy.revocable(instance('complex', []), {})
        revocable.revoke()
        const faults: TalosMotionStageFaultReason[] = []
        const controller = createTalosMotionStageController(options({
            registry: registryFor({
                complex: () => revocable.proxy as never,
                simple: () => instance('simple', []),
            }),
            onFault: ({ reason }) => faults.push(reason),
        }))

        expect(() => controller.mount()).not.toThrow()
        expect(faults[0]).toBe('invalid_instance')
        expect(controller.snapshot().activeKind).toBe('simple')
    })

    it('keeps a recovered fallback active across input-only updates', () => {
        const calls: string[] = []
        const complexCreate = vi.fn(() => { throw new Error('complex') })
        const simpleCreate = vi.fn(() => instance('simple', calls))
        const controller = createTalosMotionStageController(options({
            registry: registryFor({ complex: complexCreate, simple: simpleCreate }),
        }))

        controller.mount()
        controller.update({ input: input({ width: 900, height: 500, pixelRatio: 1 }) })

        expect(complexCreate).toHaveBeenCalledTimes(1)
        expect(simpleCreate).toHaveBeenCalledTimes(1)
        expect(calls).toEqual(['simple:mount', 'simple:render', 'simple:render'])
        expect(controller.snapshot()).toMatchObject({ status: 'fallback', fallbackReason: 'create_failed', activeKind: 'simple' })
    })

    it('normalizes a fallback when the requested mode now matches the active rung', () => {
        const controller = createTalosMotionStageController(options({
            registry: registryFor({
                complex: () => { throw new Error('complex') },
                simple: () => instance('simple', []),
            }),
        }))

        controller.mount()
        controller.update({ requestedMode: 'simple', effectiveMode: 'simple' })

        expect(controller.snapshot()).toMatchObject({ status: 'active', fallbackReason: null, activeKind: 'simple' })
    })

    it('retries the chain for an explicit effective-mode change', () => {
        const calls: string[] = []
        const simpleCreate = vi.fn(() => instance('simple', calls))
        const controller = createTalosMotionStageController(options({
            registry: registryFor({
                complex: () => { throw new Error('complex') },
                simple: simpleCreate,
            }),
        }))

        controller.mount()
        controller.update({ effectiveMode: 'simple', requestedMode: 'simple' })

        expect(simpleCreate).toHaveBeenCalledTimes(2)
        expect(calls).toEqual(['simple:mount', 'simple:render', 'simple:dispose', 'simple:mount', 'simple:render'])
        expect(controller.snapshot()).toMatchObject({ status: 'active', fallbackReason: null })
    })

    it.each([
        ['lookup', 'lookup_failed'],
        ['create', 'create_failed'],
        ['instance', 'invalid_instance'],
        ['mount', 'mount_failed'],
        ['render', 'render_failed'],
        ['probe', 'blank_detected'],
    ] as const)('falls back from complex when %s fails', (failure, expectedReason) => {
        const calls: string[] = []
        const faults: TalosMotionStageFaultReason[] = []
        const complex = failure === 'instance'
            ? (() => ({ kind: 'complex' } as never))
            : (() => instance('complex', calls, {
                ...(failure === 'mount' ? { mount: () => { throw new Error('mount') } } : {}),
                ...(failure === 'render' ? { renderOrUpdate: () => { throw new Error('render') } } : {}),
            }))
        const controller = createTalosMotionStageController(options({
            registry: registryFor({
                complex: failure === 'create' ? () => { throw new Error('create') } : complex,
                simple: () => instance('simple', calls),
            }, {
                lookup: failure === 'lookup' ? (_id, kind) => {
                    if (kind === 'complex') throw new Error('lookup')
                    return null
                } : undefined,
            }),
            blankProbe: failure === 'probe' ? ({ kind }) => kind !== 'complex' : undefined,
            onFault: ({ reason }) => faults.push(reason),
        }))

        expect(() => controller.mount()).not.toThrow()
        expect(controller.snapshot()).toMatchObject({ activeKind: 'simple', fallbackReason: expectedReason })
        expect(faults).toContain(expectedReason)
        expect(calls.filter((call) => call.endsWith(':dispose'))).toHaveLength(failure === 'lookup' || failure === 'create' || failure === 'instance' ? 0 : 1)
    })

    it('falls back from static to solid when the blank probe fails', () => {
        const calls: string[] = []
        const controller = createTalosMotionStageController(options({
            requestedMode: 'static',
            effectiveMode: 'static',
            registry: registryFor({ static: () => instance('static', calls) }),
            blankProbe: () => false,
        }))

        expect(() => controller.mount()).not.toThrow()

        expect(controller.snapshot()).toMatchObject({
            activeKind: null,
            activeId: null,
            status: 'solid-fallback',
            solidFallback: true,
            fallbackReason: 'blank_detected',
        })
        expect(calls).toEqual(['static:mount', 'static:render', 'static:dispose'])
    })

    it.each([
        ['complex', 'simple'],
        ['simple', 'static'],
    ] as const)('treats missing %s registration as scene_unavailable before using %s', (first, fallback) => {
        const faults: TalosMotionStageFaultReason[] = []
        const fallbacks: string[] = []
        const controller = createTalosMotionStageController(options({
            effectiveMode: first,
            requestedMode: first,
            registry: registryFor({ [fallback]: () => instance(fallback, []) }),
            onFault: ({ reason, kind }) => faults.push(reason),
            onFallback: ({ from, to, reason }) => fallbacks.push(`${from}:${to}:${reason}`),
        }))

        expect(() => controller.mount()).not.toThrow()

        expect(controller.snapshot()).toMatchObject({ activeKind: fallback, status: 'fallback', fallbackReason: 'scene_unavailable' })
        expect(faults).toEqual(['scene_unavailable'])
        expect(fallbacks).toEqual([`${first}:${fallback}:scene_unavailable`])
    })

    it('reports scene_unavailable for every missing rung before solid fallback', () => {
        const faults: TalosMotionStageFaultReason[] = []
        const fallbacks: string[] = []
        const controller = createTalosMotionStageController(options({
            onFault: ({ reason }) => faults.push(reason),
            onFallback: ({ from, to, reason }) => fallbacks.push(`${from}:${to}:${reason}`),
            registry: {
                lookup: () => null,
                create: () => null,
                snapshot: () => [{ id: 'paper', kind: 'static', factory: () => instance('static', []), assets: [] }] as never,
            },
        }))

        controller.mount()

        expect(controller.snapshot()).toMatchObject({ status: 'solid-fallback', solidFallback: true, fallbackReason: 'scene_unavailable' })
        expect(faults).toEqual(['scene_unavailable', 'scene_unavailable', 'scene_unavailable'])
        expect(fallbacks).toEqual([
            'complex:simple:scene_unavailable',
            'simple:static:scene_unavailable',
            'static:null:scene_unavailable',
        ])
    })

    it.each([
        ['throws', () => { throw new Error('snapshot') }],
        ['returns a non-array', () => ({ invalid: true })],
    ] as const)('does not treat a snapshot that %s as an empty registry', (_label, snapshot) => {
        const faults: TalosMotionStageFaultReason[] = []
        const controller = createTalosMotionStageController(options({
            registry: {
                lookup: () => { throw new Error('lookup must not run') },
                create: () => null,
                snapshot,
            } as never,
            onFault: ({ reason }) => faults.push(reason),
        }))

        expect(() => controller.mount()).not.toThrow()
        expect(controller.snapshot()).toMatchObject({ status: 'solid-fallback', solidFallback: true })
        expect(controller.snapshot().faultCount).toBe(1)
        expect(faults).toEqual([_label === 'throws' ? 'lookup_failed' : 'invalid_configuration'])
    })

    it.each([
        ['resize', 'resize_failed'],
        ['pause', 'pause_failed'],
        ['resume', 'resume_failed'],
    ] as const)('handles %s faults without uncaught exceptions', (operation, reason) => {
        const calls: string[] = []
        let failed = true
        const broken = instance('complex', calls, {
            [operation]: () => {
                if (failed) throw new Error(operation)
                calls.push(`complex:${operation}`)
            },
        })
        const controller = createTalosMotionStageController(options({
            registry: registryFor({
                complex: () => broken,
                simple: () => instance('simple', calls),
            }),
            onFault: ({ reason: actual }) => expect(actual).toBe(reason),
        }))

        controller.mount()
        if (operation === 'resize') expect(() => controller.resize(input().viewport)).not.toThrow()
        if (operation === 'pause') expect(() => controller.pause()).not.toThrow()
        if (operation === 'resume') {
            failed = false
            controller.pause()
            failed = true
            expect(() => controller.resume()).not.toThrow()
        }

        expect(controller.snapshot().activeKind).toBe('simple')
        expect(calls.filter((call) => call === 'complex:dispose')).toHaveLength(1)
    })

    it.each([
        ['render', 'render_failed'],
        ['resize', 'resize_failed'],
        ['pause', 'pause_failed'],
        ['resume', 'resume_failed'],
    ] as const)('keeps truthful fallback status after a recovered %s fault', (operation, reason) => {
        const calls: string[] = []
        let renderCount = 0
        const complex = instance('complex', calls, {
            renderOrUpdate: () => {
                if (operation === 'render' && renderCount > 0) throw new Error('render')
                renderCount += 1
                calls.push('complex:render')
            },
            resize: () => {
                if (operation === 'resize') throw new Error('resize')
                calls.push('complex:resize')
            },
            pause: () => {
                if (operation === 'pause') throw new Error('pause')
                calls.push('complex:pause')
            },
            resume: () => {
                if (operation === 'resume') throw new Error('resume')
                calls.push('complex:resume')
            },
        })
        const controller = createTalosMotionStageController(options({
            registry: registryFor({
                complex: () => complex,
                simple: () => instance('simple', calls),
            }),
        }))

        controller.mount()
        if (operation === 'render') controller.update({ input: input({ width: 900, height: 500, pixelRatio: 1 }) })
        if (operation === 'resize') controller.resize(input().viewport)
        if (operation === 'pause') controller.pause()
        if (operation === 'resume') {
            controller.pause()
            controller.resume()
        }

        expect(controller.snapshot()).toMatchObject({
            activeKind: 'simple',
            fallbackReason: reason,
            status: 'fallback',
        })
    })

    it('integrates the real scene registry wrapper through complex fault cleanup and canonical simple fallback', () => {
        const source = canonicalRegistryInput()
        const received: SceneInput[] = []
        const complexDispose = vi.fn()
        const simpleDispose = vi.fn()
        const registry = createSceneRegistry([
            {
                id: 'forge',
                kind: 'complex',
                assets: [],
                factory: (factoryInput) => {
                    received.push(factoryInput)
                    return {
                        kind: 'complex',
                        mount: vi.fn(),
                        renderOrUpdate: (renderInput) => {
                            received.push(renderInput)
                            throw new Error('raw complex render fault')
                        },
                        resize: vi.fn(),
                        pause: vi.fn(),
                        resume: vi.fn(),
                        dispose: complexDispose,
                    }
                },
            },
            {
                id: 'forge',
                kind: 'simple',
                assets: [],
                factory: (factoryInput) => {
                    received.push(factoryInput)
                    return {
                        kind: 'simple',
                        mount: vi.fn(),
                        renderOrUpdate: (renderInput) => received.push(renderInput),
                        resize: vi.fn(),
                        pause: vi.fn(),
                        resume: vi.fn(),
                        dispose: simpleDispose,
                    }
                },
            },
        ] as readonly SceneRegistration[])
        const controller = createTalosMotionStageController(options({ registry, input: source }))

        expect(() => controller.mount()).not.toThrow()

        expect(controller.snapshot()).toMatchObject({
            activeKind: 'simple',
            fallbackReason: 'render_failed',
            status: 'fallback',
        })
        expect(complexDispose).toHaveBeenCalledTimes(1)
        expect(simpleDispose).not.toHaveBeenCalled()
        expect(received).toHaveLength(4)
        for (const canonical of received) {
            expect(canonical).not.toBe(source)
            expect(Object.isFrozen(canonical)).toBe(true)
            expect(Object.isFrozen(canonical.viewport)).toBe(true)
        }
    })

    it('ends in a safe solid surface for off, disabled background, and an empty registry', () => {
        for (const override of [
            { effectiveMode: 'off' as const },
            { backgroundEnabled: false },
            { registry: registryFor() },
        ]) {
            const factory = vi.fn()
            const controller = createTalosMotionStageController(options({
                registry: registryFor({ complex: factory }),
                ...override,
            }))

            expect(() => controller.mount()).not.toThrow()
            expect(controller.snapshot().solidFallback).toBe(true)
            expect(controller.snapshot().activeKind).toBeNull()
            expect(factory).not.toHaveBeenCalled()
        }
    })

    it('keeps snapshot immutable and unmount disposal exact-once', () => {
        const dispose = vi.fn()
        const controller = createTalosMotionStageController(options({
            registry: registryFor({ complex: () => instance('complex', [], { dispose }) }),
        }))

        controller.mount()
        const snapshot = controller.snapshot()
        expect(Object.isFrozen(snapshot)).toBe(true)
        controller.dispose()
        controller.dispose()

        expect(dispose).toHaveBeenCalledTimes(1)
        expect(controller.snapshot()).toMatchObject({ status: 'disposed', activeKind: null, solidFallback: true })
    })

    it('makes repeated mount idempotent and contains disposal, probe, and callback failures', () => {
        const dispose = vi.fn(() => { throw new Error('dispose') })
        const controller = createTalosMotionStageController(options({
            registry: registryFor({
                complex: () => instance('complex', [], { dispose }),
                simple: () => instance('simple', []),
            }),
            blankProbe: ({ kind }) => {
                if (kind === 'complex') throw new Error('probe')
                return true
            },
            onFault: () => { throw new Error('telemetry') },
            onFallback: () => { throw new Error('fallback telemetry') },
        }))

        expect(() => controller.mount()).not.toThrow()
        expect(() => controller.mount()).not.toThrow()
        expect(() => controller.dispose()).not.toThrow()
        expect(() => controller.dispose()).not.toThrow()
        expect(dispose).toHaveBeenCalledTimes(1)
        expect(controller.snapshot()).toMatchObject({ status: 'disposed', fallbackReason: 'blank_probe_failed' })
    })

    it('swallows invalid registry operations and reports no page error', () => {
        const controller = createTalosMotionStageController(options({
            registry: {
                lookup: () => { throw new Error('registry') },
                create: () => { throw new Error('registry') },
                snapshot: () => { throw new Error('registry') },
            } as unknown as SceneRegistry,
        }))

        expect(() => controller.mount()).not.toThrow()
        expect(controller.snapshot().status).toBe('solid-fallback')
    })
})

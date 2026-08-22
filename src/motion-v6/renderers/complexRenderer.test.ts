import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createSceneRegistry, SceneRegistryError, type SceneInput } from '../sceneRegistry'
import { createTalosMotionStageController } from '../stageController'
import {
    COMPLEX_PRIMITIVE_BUDGET,
    ComplexRendererError,
    createComplexSceneFactory,
    createDomComplexRendererPlatform,
    type ComplexRendererPlatform,
    type ComplexSceneDefinition,
} from './complexRenderer'

const roles = ['background','surface','surface_muted','surface_elevated','text','text_muted','border','border_strong','accent','accent_text','secondary','success','warning','danger','info','focus'] as const
const palette = (color: string) => Object.fromEntries(roles.map((role) => [role, color])) as SceneInput['palette']['light']

function input(tier: 'low'|'balanced'|'high' = 'balanced'): SceneInput {
    return {
        colorMode: 'dark',
        palette: { light: palette('#ffffff'), dark: palette('#101010') },
        viewport: { width: 1200, height: 800, pixelRatio: 2 },
        seed: 17,
        logicalTimeMs: 0,
        deltaMs: 0,
        parameters: { speed: 100, intensity: 65, density: 100, depth: 50, trails: 35, contrast: 60, parallax: 20 },
        effectiveQuality: { tier, fpsCap: 30, dprCap: 1.25, densityScale: 1 },
    }
}

function scheduler() {
    let nowMs = 0
    let nextId = 1
    const pending = new Map<number, () => void>()
    return {
        now: () => nowMs,
        requestFrame: (callback: () => void) => { const id = nextId++; pending.set(id, callback); return id },
        cancelFrame: (id: unknown) => { pending.delete(id as number) },
        step: (deltaMs: number) => {
            nowMs += deltaMs
            const callbacks = [...pending.values()]
            pending.clear()
            callbacks.forEach((callback) => callback())
        },
        consume: (durationMs: number) => { nowMs += durationMs },
        pendingCount: () => pending.size,
    }
}

function harness() {
    const frames = scheduler()
    const calls: string[] = []
    const context = { marker: '2d' }
    const platform: ComplexRendererPlatform = {
        scheduler: frames,
        createSurface: () => ({ id: 'canvas' }),
        appendSurface: () => calls.push('append'),
        resizeSurface: (_surface, viewport, dpr) => calls.push(`resize:${viewport.width}x${viewport.height}@${dpr}`),
        getContext: () => context,
        removeSurface: () => calls.push('remove'),
    }
    return { frames, calls, context, platform }
}

function definition(overrides: Partial<ComplexSceneDefinition<Record<string, unknown>, Record<string, unknown>>> = {}) {
    return {
        id: 'forge',
        createState: (seed: number) => ({ seed, ticks: 0 }),
        prepare: ({ input: value, invalidations }) => ({
            geometry: { width: value.viewport.width, accent: value.palette.dark.accent, intensity: value.parameters.intensity, invalidations },
            primitiveCount: 32,
        }),
        update: ({ state, stepMs }) => { state.ticks = Number(state.ticks) + stepMs },
        draw: ({ context, state, geometry }) => { void context; void state; void geometry },
        dispose: vi.fn(),
        ...overrides,
    } satisfies ComplexSceneDefinition<Record<string, unknown>, Record<string, unknown>>
}

function mounted(options: { animated?: boolean; scene?: ReturnType<typeof definition> } = {}) {
    const h = harness()
    const scene = options.scene ?? definition()
    const factory = createComplexSceneFactory(scene, h.platform, { animated: options.animated })
    const registry = createSceneRegistry([{ id: 'forge', kind: 'complex', factory, assets: [] }])
    const instance = registry.create('forge', 'complex', input())!
    instance.mount({ kind: 'complex', target: {} })
    instance.renderOrUpdate(input())
    return { ...h, scene, instance }
}

describe('Complex Renderer V6', () => {
    it('rejects malformed scene and platform contracts before factory creation', () => {
        expect(() => createComplexSceneFactory({ ...definition(), id: '' }, harness().platform)).toThrow(ComplexRendererError)
        expect(() => createComplexSceneFactory(definition(), { ...harness().platform, getContext: null } as never)).toThrow(ComplexRendererError)
    })

    it('initializes identical state from an identical deterministic seed', () => {
        const seeds: number[] = []
        const scene = definition({ createState: (seed) => { seeds.push(seed); return { seed } } })
        mounted({ scene }); mounted({ scene })
        expect(seeds).toEqual([17, 17])
    })

    it('uses a fixed timestep and caps rendered FPS', () => {
        const steps: number[] = []
        const draw = vi.fn()
        const { frames } = mounted({ scene: definition({ update: ({ stepMs }) => steps.push(stepMs), draw }) })
        expect(draw).toHaveBeenCalledTimes(1)
        frames.step(0)
        frames.step(16)
        frames.step(18)
        expect(steps).toEqual([1000 / 30])
        expect(draw).toHaveBeenCalledTimes(2)
    })

    it('reports the complete update plus draw cost for animated frames', () => {
        const h = harness()
        const metrics: Array<{ frameCostMs: number }> = []
        const scene = definition({
            update: () => h.frames.consume(8),
            draw: () => h.frames.consume(3),
        })
        const registry = createSceneRegistry([{
            id: 'forge',
            kind: 'complex',
            factory: createComplexSceneFactory(scene, h.platform, { onFrame: (metric) => metrics.push(metric) }),
            assets: [],
        }])
        const instance = registry.create('forge', 'complex', input())!
        instance.mount({ kind: 'complex', target: {} })
        instance.renderOrUpdate(input())
        metrics.length = 0

        h.frames.step(0)
        h.frames.step(34)

        expect(metrics).toHaveLength(1)
        expect(metrics[0].frameCostMs).toBe(11)
    })

    it('reports preparation and synchronous draw cost to the governor telemetry', () => {
        const h = harness()
        const metrics: Array<{ frameCostMs: number }> = []
        const scene = definition({
            prepare: (context) => {
                h.frames.consume(7)
                return definition().prepare(context)
            },
            draw: () => h.frames.consume(2),
        })
        const registry = createSceneRegistry([{
            id: 'forge',
            kind: 'complex',
            factory: createComplexSceneFactory(scene, h.platform, { animated: false, onFrame: (metric) => metrics.push(metric) }),
            assets: [],
        }])
        const instance = registry.create('forge', 'complex', input())!
        instance.mount({ kind: 'complex', target: {} })
        instance.renderOrUpdate(input())

        expect(metrics).toHaveLength(1)
        expect(metrics[0].frameCostMs).toBe(9)
    })

    it('resets accumulated time when the FPS quality profile changes', () => {
        const update = vi.fn()
        const { frames, instance } = mounted({ scene: definition({ update }) })
        frames.step(0)
        frames.step(20)
        const faster = input()
        faster.effectiveQuality.fpsCap = 60
        instance.renderOrUpdate(faster)
        frames.step(1)
        expect(update).not.toHaveBeenCalled()
        frames.step(16)
        expect(update).toHaveBeenCalledOnce()
        expect(update.mock.calls[0][0].stepMs).toBe(1000 / 60)
    })

    it.each([['low', 400], ['balanced', 1200], ['high', 2400]] as const)('enforces the %s primitive budget', (tier, budget) => {
        expect(COMPLEX_PRIMITIVE_BUDGET[tier]).toBe(budget)
        const h = harness()
        const scene = definition({ prepare: () => ({ geometry: {}, primitiveCount: budget + 1 }) })
        const registry = createSceneRegistry([{ id: 'forge', kind: 'complex', factory: createComplexSceneFactory(scene, h.platform), assets: [] }])
        const instance = registry.create('forge', 'complex', input(tier))!
        instance.mount({ kind: 'complex', target: {} })
        expect(() => instance.renderOrUpdate(input(tier))).toThrow(SceneRegistryError)
        expect(h.frames.pendingCount()).toBe(0)
    })

    it('caps DPR and resizes physical surface from explicit viewport data', () => {
        const { calls, instance } = mounted()
        expect(calls).toContain('resize:1200x800@1.25')
        instance.resize({ width: 640, height: 480, pixelRatio: 2 })
        expect(calls).toContain('resize:640x480@1.25')
    })

    it('caches geometry and invalidates only changed viewport, palette, parameters, quality or seed', () => {
        const prepare = vi.fn(definition().prepare)
        const { instance } = mounted({ scene: definition({ prepare }) })
        instance.renderOrUpdate(input())
        expect(prepare).toHaveBeenCalledTimes(1)

        const paletteChanged = input(); paletteChanged.palette.dark.accent = '#ff0000'
        instance.renderOrUpdate(paletteChanged)
        expect(prepare.mock.calls.at(-1)?.[0].invalidations).toEqual(['palette'])

        const parameterChanged = structuredClone(paletteChanged); parameterChanged.parameters.intensity = 10
        instance.renderOrUpdate(parameterChanged)
        expect(prepare.mock.calls.at(-1)?.[0].invalidations).toEqual(['parameters'])

        instance.resize({ width: 640, height: 480, pixelRatio: 1 })
        expect(prepare.mock.calls.at(-1)?.[0].invalidations).toEqual(['viewport'])

        const qualityChanged = structuredClone(parameterChanged); qualityChanged.effectiveQuality.densityScale = 0.75
        qualityChanged.viewport = { width: 640, height: 480, pixelRatio: 1 }
        instance.renderOrUpdate(qualityChanged)
        expect(prepare.mock.calls.at(-1)?.[0].invalidations).toEqual(['quality'])

        const seedChanged = structuredClone(qualityChanged); seedChanged.seed = 99
        instance.renderOrUpdate(seedChanged)
        expect(prepare.mock.calls.at(-1)?.[0].invalidations).toEqual(['seed'])
    })

    it('pauses and resumes scheduling without a temporal jump', () => {
        const update = vi.fn()
        const { frames, instance } = mounted({ scene: definition({ update }) })
        frames.step(0)
        instance.pause()
        expect(frames.pendingCount()).toBe(0)
        frames.step(5_000)
        instance.resume()
        frames.step(0)
        frames.step(34)
        expect(update).toHaveBeenCalledTimes(1)
    })

    it('draws exactly once in static mode and schedules no RAF', () => {
        const draw = vi.fn()
        const { frames } = mounted({ animated: false, scene: definition({ draw }) })
        expect(draw).toHaveBeenCalledOnce()
        expect(frames.pendingCount()).toBe(0)
    })

    it('disposes scheduler, scene state and surface exact-once', () => {
        const dispose = vi.fn()
        const { frames, calls, instance } = mounted({ scene: definition({ dispose }) })
        expect(frames.pendingCount()).toBe(1)
        instance.dispose(); instance.dispose()
        expect(frames.pendingCount()).toBe(0)
        expect(dispose).toHaveBeenCalledOnce()
        expect(calls.filter((call) => call === 'remove')).toHaveLength(1)
    })

    it('stores asynchronous scene faults and propagates them through the registry on the next stage update', () => {
        let fail = false
        const { frames, instance } = mounted({ scene: definition({ draw: () => { if (fail) throw new Error('draw failed') } }) })
        fail = true
        frames.step(0); frames.step(34)
        expect(() => instance.renderOrUpdate(input())).toThrowError(expect.objectContaining({ code: 'render_failed' }))
        expect(frames.pendingCount()).toBe(0)
    })

    it('allows the Stage fault boundary to degrade an asynchronous Complex fault to Simple', () => {
        const h = harness()
        let fail = false
        const complexFactory = createComplexSceneFactory(definition({ draw: () => { if (fail) throw new Error('frame failed') } }), h.platform)
        const simpleLifecycle = {
            kind: 'simple' as const,
            mount: vi.fn(), renderOrUpdate: vi.fn(), resize: vi.fn(), pause: vi.fn(), resume: vi.fn(), dispose: vi.fn(),
        }
        const registry = createSceneRegistry([
            { id: 'forge', kind: 'complex', factory: complexFactory, assets: [] },
            { id: 'forge', kind: 'simple', factory: () => ({ ...simpleLifecycle }), assets: [] },
        ])
        const stage = createTalosMotionStageController({
            registry,
            requestedMode: 'complex',
            effectiveMode: 'complex',
            sceneId: 'forge',
            input: input(),
            target: {},
            paused: false,
        })
        expect(stage.mount().activeKind).toBe('complex')
        fail = true
        h.frames.step(0); h.frames.step(34)
        const next = stage.update({ input: input() })
        expect(next.activeKind).toBe('simple')
        expect(next.fallbackReason).toBe('render_failed')
    })

    it('ships isolated Canvas CSS with a reduced-motion containment rule', () => {
        const css = readFileSync('src/css/talos-motion-v6-complex.css', 'utf8')
        expect(css).toContain('[data-talos-motion-stage] .talos-v6-complex-canvas')
        expect(css).toContain('pointer-events: none')
        expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    })

    it('provides a real DOM Canvas 2D adapter', () => {
        const context = { clearRect: vi.fn(), setTransform: vi.fn() }
        const canvas = {
            width: 0, height: 0,
            className: '',
            dataset: {} as Record<string, string>,
            style: { width: '', height: '' },
            getContext: vi.fn(() => context),
            remove: vi.fn(),
        }
        const documentLike = { createElement: vi.fn(() => canvas) }
        const target = { appendChild: vi.fn() }
        const frames = scheduler()
        const platform = createDomComplexRendererPlatform(frames, documentLike as never)
        const surface = platform.createSurface('forge')
        platform.appendSurface(target, surface)
        platform.resizeSurface(surface, { width: 320, height: 200, pixelRatio: 2 }, 1.5)
        expect(platform.getContext(surface)).toBe(context)
        expect(canvas.width).toBe(480)
        expect(canvas.height).toBe(300)
        expect(canvas.style.width).toBe('320px')
        expect(context.setTransform).toHaveBeenCalledWith(1.5, 0, 0, 1.5, 0, 0)
        expect(target.appendChild).toHaveBeenCalledWith(canvas)
        platform.removeSurface(surface)
        expect(canvas.remove).toHaveBeenCalledOnce()
    })
})

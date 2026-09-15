import { TALOS_MOTION_SCENE_IDS } from '../contracts'
import { createMotionClock, type MotionFrameScheduler } from '../clock'
import type { SceneFactory, SceneInput, SceneInstance, SceneViewport } from '../sceneRegistry'

export const COMPLEX_PRIMITIVE_BUDGET = Object.freeze({ low: 400, balanced: 1_200, high: 2_400 } as const)
export const COMPLEX_RENDERER_MAX_DPR = 2
export const COMPLEX_RENDERER_MAX_CATCH_UP_STEPS = 4

const DEFINITION_KEYS = ['id', 'createState', 'prepare', 'update', 'draw', 'dispose'] as const
const PLATFORM_KEYS = ['scheduler', 'createSurface', 'appendSurface', 'resizeSurface', 'getContext', 'removeSurface'] as const
const PREPARED_KEYS = ['geometry', 'primitiveCount'] as const

export class ComplexRendererError extends Error {
    readonly cause: unknown

    constructor(message: string, cause?: unknown) {
        super(message)
        this.name = 'ComplexRendererError'
        this.cause = cause
        Object.setPrototypeOf(this, new.target.prototype)
    }
}

export type ComplexSceneInvalidation = 'seed' | 'viewport' | 'palette' | 'parameters' | 'quality'
export type ComplexSurfaceHandle = Readonly<{ id: string }> & object

export type ComplexScenePrepareContext<State> = Readonly<{
    state: State
    input: SceneInput
    invalidations: readonly ComplexSceneInvalidation[]
}>

export type ComplexSceneFrameContext<State, Geometry> = Readonly<{
    state: State
    geometry: Geometry
    input: SceneInput
    logicalTimeMs: number
    stepMs: number
}>

export type ComplexSceneDrawContext<State, Geometry> = ComplexSceneFrameContext<State, Geometry> & Readonly<{
    context: unknown
}>

export type ComplexPreparedGeometry<Geometry> = Readonly<{
    geometry: Geometry
    primitiveCount: number
}>

export type ComplexSceneDefinition<State = unknown, Geometry = unknown> = Readonly<{
    id: string
    createState: (seed: number) => State
    prepare: (context: ComplexScenePrepareContext<State>) => ComplexPreparedGeometry<Geometry>
    update: (context: ComplexSceneFrameContext<State, Geometry>) => void
    draw: (context: ComplexSceneDrawContext<State, Geometry>) => void
    dispose?: (state: State) => void
}>

export type ComplexRendererPlatform = Readonly<{
    scheduler: MotionFrameScheduler
    createSurface: (sceneId: string) => ComplexSurfaceHandle
    appendSurface: (target: unknown, surface: ComplexSurfaceHandle) => void
    resizeSurface: (surface: ComplexSurfaceHandle, viewport: SceneViewport, effectiveDpr: number) => void
    getContext: (surface: ComplexSurfaceHandle) => unknown
    removeSurface: (surface: ComplexSurfaceHandle) => void
}>

export type ComplexRendererFrameMetric = Readonly<{
    timestampMs: number
    frameCostMs: number
    primitiveCount: number
}>

export type ComplexRendererOptions = Readonly<{
    animated?: boolean
    maxCatchUpSteps?: number
    onFrame?: (metric: ComplexRendererFrameMetric) => void
    onFault?: (fault: ComplexRendererError) => void
}>

type DataRecord = Record<string, unknown>

function fail(message: string, cause?: unknown): never {
    throw new ComplexRendererError(message, cause)
}

function strictRecord(value: unknown, allowed: readonly string[], required: readonly string[]): DataRecord {
    try {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('Expected a plain data object.')
        const prototype = Reflect.getPrototypeOf(value)
        if (prototype !== Object.prototype && prototype !== null) fail('Custom object prototypes are not allowed.')
        const keys = Reflect.ownKeys(value)
        if (keys.some((key) => typeof key !== 'string' || !allowed.includes(key))) fail('Unknown or symbolic property.')
        const record: DataRecord = Object.create(null)
        for (const key of required) {
            const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
            if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail(`Missing data property ${key}.`)
            record[key] = descriptor.value
        }
        for (const key of allowed) {
            if (Object.hasOwn(record, key)) continue
            const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
            if (!descriptor) continue
            if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail(`Invalid data property ${key}.`)
            record[key] = descriptor.value
        }
        return record
    } catch (error) {
        if (error instanceof ComplexRendererError) throw error
        throw new ComplexRendererError('Object could not be inspected safely.', error)
    }
}

function requiredFunction(value: unknown, key: string): ((...args: never[]) => unknown) {
    try {
        if (typeof value !== 'object' || value === null) fail(`Missing ${key}.`)
        const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function') fail(`Missing ${key}.`)
        return descriptor.value
    } catch (error) {
        if (error instanceof ComplexRendererError) throw error
        throw new ComplexRendererError(`Could not inspect ${key}.`, error)
    }
}

function signatures(input: SceneInput): Readonly<Record<ComplexSceneInvalidation, string>> {
    return Object.freeze({
        seed: String(input.seed),
        viewport: `${input.viewport.width}|${input.viewport.height}|${input.viewport.pixelRatio}`,
        palette: `${input.colorMode}::${Object.values(input.palette.light).join('|')}::${Object.values(input.palette.dark).join('|')}`,
        parameters: Object.values(input.parameters).join('|'),
        quality: Object.values(input.effectiveQuality).join('|'),
    })
}

function changedSignatures(
    previous: Readonly<Record<ComplexSceneInvalidation, string>> | null,
    next: Readonly<Record<ComplexSceneInvalidation, string>>,
): ComplexSceneInvalidation[] {
    const ordered: ComplexSceneInvalidation[] = ['seed', 'viewport', 'palette', 'parameters', 'quality']
    return previous === null ? ordered : ordered.filter((key) => previous[key] !== next[key])
}

function normalizePrepared<Geometry>(value: unknown, budget: number): ComplexPreparedGeometry<Geometry> {
    const prepared = strictRecord(value, PREPARED_KEYS, PREPARED_KEYS)
    if (typeof prepared.primitiveCount !== 'number' || !Number.isSafeInteger(prepared.primitiveCount) || prepared.primitiveCount < 0 || prepared.primitiveCount > budget) {
        fail('Complex scene primitive budget exceeded.')
    }
    return Object.freeze({ geometry: prepared.geometry as Geometry, primitiveCount: prepared.primitiveCount })
}

function normalizeConfiguration<State, Geometry>(
    definition: ComplexSceneDefinition<State, Geometry>,
    platform: ComplexRendererPlatform,
) {
    const scene = strictRecord(definition, DEFINITION_KEYS, ['id', 'createState', 'prepare', 'update', 'draw'])
    if (typeof scene.id !== 'string' || !(TALOS_MOTION_SCENE_IDS as readonly string[]).includes(scene.id)) fail('Invalid complex scene definition ID.')
    for (const key of ['createState', 'prepare', 'update', 'draw'] as const) {
        if (typeof scene[key] !== 'function') fail(`Complex scene definition requires ${key}.`)
    }
    if (scene.dispose !== undefined && typeof scene.dispose !== 'function') fail('Complex scene dispose must be a function.')

    const adapter = strictRecord(platform, PLATFORM_KEYS, PLATFORM_KEYS)
    for (const key of ['createSurface', 'appendSurface', 'resizeSurface', 'getContext', 'removeSurface'] as const) {
        if (typeof adapter[key] !== 'function') fail(`Complex renderer platform requires ${key}.`)
    }
    const scheduler = adapter.scheduler
    const now = requiredFunction(scheduler, 'now') as MotionFrameScheduler['now']
    const requestFrame = requiredFunction(scheduler, 'requestFrame') as MotionFrameScheduler['requestFrame']
    const cancelFrame = requiredFunction(scheduler, 'cancelFrame') as MotionFrameScheduler['cancelFrame']

    return Object.freeze({
        sceneId: scene.id as string,
        createState: scene.createState as ComplexSceneDefinition<State, Geometry>['createState'],
        prepare: scene.prepare as ComplexSceneDefinition<State, Geometry>['prepare'],
        update: scene.update as ComplexSceneDefinition<State, Geometry>['update'],
        draw: scene.draw as ComplexSceneDefinition<State, Geometry>['draw'],
        disposeState: scene.dispose as ComplexSceneDefinition<State, Geometry>['dispose'],
        scheduler: Object.freeze({
            now: () => now.call(scheduler),
            requestFrame: (callback: () => void) => requestFrame.call(scheduler, callback),
            cancelFrame: (handle: unknown) => cancelFrame.call(scheduler, handle),
        }) satisfies MotionFrameScheduler,
        createSurface: adapter.createSurface as ComplexRendererPlatform['createSurface'],
        appendSurface: adapter.appendSurface as ComplexRendererPlatform['appendSurface'],
        resizeSurface: adapter.resizeSurface as ComplexRendererPlatform['resizeSurface'],
        getContext: adapter.getContext as ComplexRendererPlatform['getContext'],
        removeSurface: adapter.removeSurface as ComplexRendererPlatform['removeSurface'],
    })
}

function maxCatchUpSteps(value: number | undefined): number {
    if (value === undefined) return COMPLEX_RENDERER_MAX_CATCH_UP_STEPS
    if (!Number.isSafeInteger(value) || value < 1) return COMPLEX_RENDERER_MAX_CATCH_UP_STEPS
    return Math.min(value, COMPLEX_RENDERER_MAX_CATCH_UP_STEPS)
}

export function createComplexSceneFactory<State, Geometry>(
    definition: ComplexSceneDefinition<State, Geometry>,
    platform: ComplexRendererPlatform,
    options: ComplexRendererOptions = {},
): SceneFactory<'complex'> {
    const config = normalizeConfiguration(definition, platform)
    const animated = options.animated !== false
    const maximumSteps = maxCatchUpSteps(options.maxCatchUpSteps)

    return (initialInput: SceneInput): SceneInstance<'complex'> => {
        let latestInput = initialInput
        let state = config.createState.call(definition, initialInput.seed)
        let prepared: ComplexPreparedGeometry<Geometry> | null = null
        let previousSignatures: Readonly<Record<ComplexSceneInvalidation, string>> | null = null
        let surface: ComplexSurfaceHandle | null = null
        let context: unknown
        let mounted = false
        let started = false
        let disposed = false
        let fault: ComplexRendererError | null = null
        let accumulatorMs = 0

        const effectiveDpr = (input: SceneInput): number => Math.min(
            COMPLEX_RENDERER_MAX_DPR,
            input.viewport.pixelRatio,
            input.effectiveQuality.dprCap,
        )

        const notifyFault = (error: ComplexRendererError): void => {
            fault = error
            try { options.onFault?.(error) } catch { /* Observability cannot mask renderer failure. */ }
        }

        const assertHealthy = (): void => {
            if (fault) throw fault
            if (disposed) fail('Complex renderer is disposed.')
        }

        const draw = (logicalTimeMs: number, stepMs: number, frameStartedAt = config.scheduler.now()): void => {
            if (!prepared) fail('Complex scene geometry is not prepared.')
            config.draw.call(definition, Object.freeze({
                context,
                state,
                geometry: prepared.geometry,
                input: latestInput,
                logicalTimeMs,
                stepMs,
            }))
            const finishedAt = config.scheduler.now()
            try {
                options.onFrame?.(Object.freeze({
                    timestampMs: Math.max(0, finishedAt),
                    frameCostMs: Math.max(0, finishedAt - frameStartedAt),
                    primitiveCount: prepared.primitiveCount,
                }))
            } catch {
                // Telemetry cannot fault the renderer.
            }
        }

        const prepare = (input: SceneInput, invalidations: readonly ComplexSceneInvalidation[]): void => {
            if (previousSignatures !== null && invalidations.includes('seed')) {
                try { config.disposeState?.call(definition, state) } catch (cause) { fail('Complex scene state disposal failed.', cause) }
                state = config.createState.call(definition, input.seed)
            }
            if ((invalidations.includes('viewport') || invalidations.includes('quality')) && surface) {
                config.resizeSurface.call(platform, surface, input.viewport, effectiveDpr(input))
            }
            prepared = normalizePrepared<Geometry>(
                config.prepare.call(definition, Object.freeze({ state, input, invalidations: Object.freeze([...invalidations]) })),
                COMPLEX_PRIMITIVE_BUDGET[input.effectiveQuality.tier],
            )
        }

        const onClockFrame = (sample: Readonly<{ logicalTimeMs: number; deltaMs: number }>): void => {
            try {
                assertHealthy()
                if (!prepared) return
                const stepMs = 1_000 / latestInput.effectiveQuality.fpsCap
                accumulatorMs += sample.deltaMs
                if (accumulatorMs + Number.EPSILON < stepMs) return
                const steps = Math.min(maximumSteps, Math.floor((accumulatorMs + Number.EPSILON) / stepMs))
                accumulatorMs -= steps * stepMs
                if (steps === maximumSteps && accumulatorMs >= stepMs) accumulatorMs %= stepMs
                const frameStartedAt = config.scheduler.now()
                for (let index = 0; index < steps; index += 1) {
                    config.update.call(definition, Object.freeze({
                        state,
                        geometry: prepared.geometry,
                        input: latestInput,
                        logicalTimeMs: sample.logicalTimeMs - ((steps - index - 1) * stepMs),
                        stepMs,
                    }))
                }
                draw(sample.logicalTimeMs, stepMs, frameStartedAt)
            } catch (cause) {
                const error = cause instanceof ComplexRendererError
                    ? cause
                    : new ComplexRendererError('Complex scene frame failed.', cause)
                notifyFault(error)
                throw error
            }
        }

        const clock = createMotionClock({
            scheduler: config.scheduler,
            onFrame: onClockFrame,
            onError: (clockFault) => {
                if (!fault) notifyFault(new ComplexRendererError(`Complex renderer clock failed: ${clockFault.code}.`, clockFault.cause))
            },
        })

        const renderOrUpdate = (input: SceneInput): void => {
            assertHealthy()
            if (!mounted || !surface) fail('Complex renderer must be mounted before rendering.')
            const nextSignatures = signatures(input)
            const invalidations = changedSignatures(previousSignatures, nextSignatures)
            latestInput = input
            if (invalidations.length > 0) {
                try {
                    const frameStartedAt = config.scheduler.now()
                    if (invalidations.includes('quality')) accumulatorMs = 0
                    prepare(input, invalidations)
                    draw(input.logicalTimeMs, 0, frameStartedAt)
                } catch (cause) {
                    const error = cause instanceof ComplexRendererError
                        ? cause
                        : new ComplexRendererError('Complex scene preparation failed.', cause)
                    notifyFault(error)
                    throw error
                }
                previousSignatures = nextSignatures
            }
            if (animated && !started) {
                started = true
                clock.start()
            }
        }

        return Object.freeze({
            kind: 'complex' as const,
            mount: (mountContext): void => {
                assertHealthy()
                if (mounted) fail('Complex renderer cannot mount twice.')
                surface = config.createSurface.call(platform, config.sceneId)
                config.appendSurface.call(platform, mountContext.target, surface)
                context = config.getContext.call(platform, surface)
                if (!context) fail('Complex renderer requires a Canvas 2D context.')
                mounted = true
            },
            renderOrUpdate,
            resize: (viewport: SceneViewport): void => renderOrUpdate(Object.freeze({ ...latestInput, viewport })),
            pause: (): void => clock.pause(),
            resume: (): void => clock.resume(),
            dispose: (): void => {
                if (disposed) return
                disposed = true
                clock.dispose()
                try { config.disposeState?.call(definition, state) } finally {
                    if (surface) config.removeSurface.call(platform, surface)
                    surface = null
                    prepared = null
                }
            },
        })
    }
}

type DomDocumentLike = Pick<Document, 'createElement'>

export function createDomComplexRendererPlatform(
    scheduler: MotionFrameScheduler,
    documentLike?: DomDocumentLike,
): ComplexRendererPlatform {
    const ownerDocument = documentLike ?? globalThis.document
    if (!ownerDocument || typeof ownerDocument.createElement !== 'function') fail('A DOM document is required for the complex renderer platform.')
    const canvases = new WeakMap<object, HTMLCanvasElement>()

    const canvasFor = (surface: ComplexSurfaceHandle): HTMLCanvasElement => {
        const canvas = canvases.get(surface)
        if (!canvas) fail('Unknown complex renderer surface.')
        return canvas
    }

    return Object.freeze({
        scheduler,
        createSurface: (sceneId: string): ComplexSurfaceHandle => {
            const canvas = ownerDocument.createElement('canvas')
            canvas.className = 'talos-v6-complex-canvas talos-procedural-canvas'
            canvas.dataset.talosMotionSceneId = sceneId
            canvas.dataset.testid = 'talos-procedural-canvas'
            const surface = Object.freeze({ id: sceneId })
            canvases.set(surface, canvas)
            return surface
        },
        appendSurface: (target: unknown, surface: ComplexSurfaceHandle): void => {
            if (typeof target !== 'object' || target === null || typeof (target as ParentNode).appendChild !== 'function') fail('Complex renderer target must accept DOM children.')
            ;(target as ParentNode).appendChild(canvasFor(surface))
        },
        resizeSurface: (surface: ComplexSurfaceHandle, viewport: SceneViewport, effectiveDpr: number): void => {
            const canvas = canvasFor(surface)
            canvas.width = Math.max(1, Math.round(viewport.width * effectiveDpr))
            canvas.height = Math.max(1, Math.round(viewport.height * effectiveDpr))
            canvas.style.width = `${viewport.width}px`
            canvas.style.height = `${viewport.height}px`
            canvas.getContext('2d')?.setTransform(effectiveDpr, 0, 0, effectiveDpr, 0, 0)
        },
        getContext: (surface: ComplexSurfaceHandle): CanvasRenderingContext2D | null => canvasFor(surface).getContext('2d'),
        removeSurface: (surface: ComplexSurfaceHandle): void => canvasFor(surface).remove(),
    })
}

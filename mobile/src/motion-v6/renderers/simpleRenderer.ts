import type { SceneFactory, SceneInput, SceneInstance, SceneViewport } from '../sceneRegistry'
import { TALOS_MOTION_SCENE_IDS } from '../contracts'

export const SIMPLE_LAYER_BUDGET = Object.freeze({ low: 12, balanced: 24, high: 36 } as const)
const MAX_STRING = 256
const SAFE_TEXT = /^[\x20-\x7e]+$/
const VARIABLE_NAME = /^--talos-v6-[a-z0-9-]+$/
const STYLE_KEYS = ['transform', 'opacity', 'variables'] as const
const LAYER_KEYS = ['id', 'role', 'style', 'motion'] as const
const MOTION_KEYS = ['keyframes', 'durationMs', 'easing', 'iterations'] as const
const DEFINITION_KEYS = ['id', 'resolve'] as const
const PLATFORM_KEYS = ['createLayer', 'appendLayer', 'removeLayer', 'applyStyle', 'animate'] as const

export class SimpleRendererError extends TypeError {
    constructor(message: string) {
        super(message)
        this.name = 'SimpleRendererError'
    }
}

export type SimpleLayerStyle = Readonly<{
    transform: string
    opacity: number
    variables?: Readonly<Record<string, string>>
}>

export type SimpleLayerMotion = Readonly<{
    keyframes: readonly SimpleLayerStyle[]
    durationMs: number
    easing: string
    iterations: number
}>

export type SimpleSceneLayer = Readonly<{
    id: string
    role: string
    style: SimpleLayerStyle
    motion?: SimpleLayerMotion
}>

export type SimpleSceneDefinition = {
    id: string
    resolve: (input: SceneInput) => readonly SimpleSceneLayer[]
}

export type SimpleLayerHandle = Readonly<{ id: string; role: string }> & object
export type SimpleAnimationHandle = Readonly<{
    pause: () => void
    play: () => void
    cancel: () => void
}>

export type SimpleRendererPlatform = Readonly<{
    createLayer: (id: string, role: string) => SimpleLayerHandle
    appendLayer: (target: unknown, layer: SimpleLayerHandle) => void
    removeLayer: (layer: SimpleLayerHandle) => void
    applyStyle: (layer: SimpleLayerHandle, style: SimpleLayerStyle) => void
    animate: (
        layer: SimpleLayerHandle,
        keyframes: readonly SimpleLayerStyle[],
        options: Readonly<{ durationMs: number; easing: string; iterations: number }>,
    ) => SimpleAnimationHandle
}>

export type SimpleRendererOptions = Readonly<{ animated?: boolean }>

type DomDocumentLike = Pick<Document, 'createElement'>
type DomAnimationLike = Pick<Animation, 'pause' | 'play' | 'cancel'>

type RecordValue = Record<string, unknown>

function fail(message: string): never { throw new SimpleRendererError(message) }

function strictRecord(value: unknown, allowed: readonly string[], required: readonly string[]): RecordValue {
    try {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('Expected a plain data object.')
        const prototype = Reflect.getPrototypeOf(value)
        if (prototype !== Object.prototype && prototype !== null) fail('Custom object prototypes are not allowed.')
        const keys = Reflect.ownKeys(value)
        if (keys.some((key) => typeof key !== 'string' || !allowed.includes(key))) fail('Unknown or symbolic property.')
        const record: RecordValue = Object.create(null)
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
        if (error instanceof SimpleRendererError) throw error
        throw new SimpleRendererError('Object could not be inspected safely.')
    }
}

function denseArray(value: unknown, maximum: number): unknown[] {
    try {
        if (!Array.isArray(value)) fail('Expected a dense layer array.')
        const length = value.length
        if (!Number.isSafeInteger(length) || length > maximum) fail('Layer budget exceeded.')
        const keys = Reflect.ownKeys(value)
        if (keys.length !== length + 1) fail('Sparse or decorated arrays are not allowed.')
        const output: unknown[] = []
        for (let index = 0; index < length; index += 1) {
            const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index))
            if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('Sparse layer array.')
            output.push(descriptor.value)
        }
        return output
    } catch (error) {
        if (error instanceof SimpleRendererError) throw error
        throw new SimpleRendererError('Layer array could not be inspected safely.')
    }
}

function safeString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_STRING && SAFE_TEXT.test(value)
        && !/url\s*\(|javascript:|expression\s*\(/i.test(value)
}

function normalizeVariables(value: unknown): Readonly<Record<string, string>> {
    if (value === undefined) return Object.freeze({})
    try {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('Variables must be a plain object.')
        const prototype = Reflect.getPrototypeOf(value)
        if (prototype !== Object.prototype && prototype !== null) fail('Variables must use a plain prototype.')
        const keys = Reflect.ownKeys(value)
        if (keys.length > 32) fail('Too many style variables.')
        const output: Record<string, string> = {}
        for (const key of keys) {
            if (typeof key !== 'string' || !VARIABLE_NAME.test(key)) fail('Unsafe style variable.')
            const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
            if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || !safeString(descriptor.value)) fail('Unsafe style variable.')
            output[key] = descriptor.value
        }
        return Object.freeze(output)
    } catch (error) {
        if (error instanceof SimpleRendererError) throw error
        throw new SimpleRendererError('Variables could not be inspected safely.')
    }
}

function normalizeStyle(value: unknown): SimpleLayerStyle {
    const record = strictRecord(value, STYLE_KEYS, ['transform', 'opacity'])
    if (!safeString(record.transform)) fail('Unsafe transform.')
    if (typeof record.opacity !== 'number' || !Number.isFinite(record.opacity) || record.opacity < 0 || record.opacity > 1) fail('Invalid opacity.')
    return Object.freeze({
        transform: record.transform,
        opacity: record.opacity,
        variables: normalizeVariables(record.variables),
    })
}

function normalizeMotion(value: unknown): SimpleLayerMotion | undefined {
    if (value === undefined) return undefined
    const record = strictRecord(value, MOTION_KEYS, MOTION_KEYS)
    const frames = denseArray(record.keyframes, 16).map(normalizeStyle)
    if (frames.length < 1) fail('Motion requires a keyframe.')
    if (typeof record.durationMs !== 'number' || !Number.isFinite(record.durationMs) || record.durationMs < 0 || record.durationMs > 60_000) fail('Invalid duration.')
    if (!safeString(record.easing)) fail('Invalid easing.')
    if (typeof record.iterations !== 'number' || (!Number.isFinite(record.iterations) && record.iterations !== Infinity) || record.iterations < 0) fail('Invalid iterations.')
    return Object.freeze({ keyframes: Object.freeze(frames), durationMs: record.durationMs, easing: record.easing, iterations: record.iterations })
}

function normalizeLayers(value: unknown, limit: number): readonly SimpleSceneLayer[] {
    const ids = new Set<string>()
    const layers = denseArray(value, limit).map((item) => {
        const record = strictRecord(item, LAYER_KEYS, ['id', 'role', 'style'])
        if (!safeString(record.id) || !/^[a-z][a-z0-9-]*$/.test(record.id)) fail('Invalid layer ID.')
        if (!safeString(record.role) || !/^[a-z][a-z0-9-]*$/.test(record.role)) fail('Invalid layer role.')
        if (ids.has(record.id)) fail('Duplicate layer ID.')
        ids.add(record.id)
        return Object.freeze({ id: record.id, role: record.role, style: normalizeStyle(record.style), motion: normalizeMotion(record.motion) })
    })
    if (layers.length === 0) fail('A simple scene must render at least one layer.')
    return Object.freeze(layers)
}

function styleSignature(style: SimpleLayerStyle): string {
    const variables = Object.entries(style.variables ?? {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, value]) => `${name}:${value}`)
        .join('|')
    return `${style.transform}\u0000${style.opacity}\u0000${variables}`
}

function motionSignature(motion: SimpleLayerMotion | undefined): string | null {
    if (!motion || motion.durationMs <= 0) return null
    return [
        motion.durationMs,
        motion.easing,
        motion.iterations,
        ...motion.keyframes.map(styleSignature),
    ].join('\u0001')
}

function normalizeFactoryConfiguration(
    definition: SimpleSceneDefinition,
    platform: SimpleRendererPlatform,
): Readonly<{
    resolve: SimpleSceneDefinition['resolve']
    createLayer: SimpleRendererPlatform['createLayer']
    appendLayer: SimpleRendererPlatform['appendLayer']
    removeLayer: SimpleRendererPlatform['removeLayer']
    applyStyle: SimpleRendererPlatform['applyStyle']
    animate: SimpleRendererPlatform['animate']
}> {
    const scene = strictRecord(definition, DEFINITION_KEYS, DEFINITION_KEYS)
    if (typeof scene.id !== 'string' || !(TALOS_MOTION_SCENE_IDS as readonly string[]).includes(scene.id)) fail('Invalid simple scene definition ID.')
    if (typeof scene.resolve !== 'function') fail('Simple scene definition requires a resolver.')

    const adapter = strictRecord(platform, PLATFORM_KEYS, PLATFORM_KEYS)
    for (const key of PLATFORM_KEYS) {
        if (typeof adapter[key] !== 'function') fail(`Simple renderer platform requires ${key}.`)
    }

    return Object.freeze({
        resolve: scene.resolve as SimpleSceneDefinition['resolve'],
        createLayer: adapter.createLayer as SimpleRendererPlatform['createLayer'],
        appendLayer: adapter.appendLayer as SimpleRendererPlatform['appendLayer'],
        removeLayer: adapter.removeLayer as SimpleRendererPlatform['removeLayer'],
        applyStyle: adapter.applyStyle as SimpleRendererPlatform['applyStyle'],
        animate: adapter.animate as SimpleRendererPlatform['animate'],
    })
}

export function createDomSimpleRendererPlatform(documentLike?: DomDocumentLike): SimpleRendererPlatform {
    const ownerDocument = documentLike ?? globalThis.document
    if (!ownerDocument || typeof ownerDocument.createElement !== 'function') fail('A DOM document is required for the simple renderer platform.')

    const elements = new WeakMap<object, HTMLElement>()
    const variableNames = new WeakMap<object, Set<string>>()

    const elementFor = (handle: SimpleLayerHandle): HTMLElement => {
        const element = elements.get(handle)
        if (!element) fail('Unknown simple renderer layer handle.')
        return element
    }

    return Object.freeze({
        createLayer: (id: string, role: string): SimpleLayerHandle => {
            const element = ownerDocument.createElement('div')
            element.className = 'talos-v6-simple-layer'
            element.dataset.talosMotionLayerId = id
            element.dataset.talosMotionLayerRole = role
            const handle = Object.freeze({ id, role })
            elements.set(handle, element)
            variableNames.set(handle, new Set())
            return handle
        },
        appendLayer: (target: unknown, handle: SimpleLayerHandle): void => {
            if (typeof target !== 'object' || target === null || typeof (target as ParentNode).appendChild !== 'function') fail('Simple renderer target must accept DOM children.')
            ;(target as ParentNode).appendChild(elementFor(handle))
        },
        removeLayer: (handle: SimpleLayerHandle): void => {
            elementFor(handle).remove()
        },
        applyStyle: (handle: SimpleLayerHandle, style: SimpleLayerStyle): void => {
            const element = elementFor(handle)
            element.style.setProperty('--talos-v6-transform', style.transform)
            element.style.setProperty('--talos-v6-opacity', String(style.opacity))
            const previous = variableNames.get(handle) ?? new Set<string>()
            const next = new Set(Object.keys(style.variables ?? {}))
            for (const name of previous) {
                if (!next.has(name)) element.style.removeProperty(name)
            }
            for (const [name, value] of Object.entries(style.variables ?? {})) element.style.setProperty(name, value)
            variableNames.set(handle, next)
        },
        animate: (handle: SimpleLayerHandle, keyframes: readonly SimpleLayerStyle[], options): SimpleAnimationHandle => {
            const element = elementFor(handle)
            if (typeof element.animate !== 'function') return Object.freeze({ pause: () => {}, play: () => {}, cancel: () => {} })
            const frames = keyframes.map((frame) => ({ transform: frame.transform, opacity: frame.opacity, ...(frame.variables ?? {}) }))
            const animation = element.animate(frames, {
                duration: options.durationMs,
                easing: options.easing,
                iterations: options.iterations,
                fill: 'both',
            }) as DomAnimationLike
            return Object.freeze({
                pause: () => animation.pause(),
                play: () => animation.play(),
                cancel: () => animation.cancel(),
            })
        },
    })
}

export function createSimpleSceneFactory(
    definition: SimpleSceneDefinition,
    platform: SimpleRendererPlatform,
    options: SimpleRendererOptions = {},
): SceneFactory<'simple'> {
    const adapter = normalizeFactoryConfiguration(definition, platform)
    const animated = options.animated !== false
    return (initialInput: SceneInput): SceneInstance<'simple'> => {
        let target: unknown
        let latestInput = initialInput
        let mounted = false
        let paused = false
        let disposed = false
        const handles = new Map<string, SimpleLayerHandle>()
        const roles = new Map<string, string>()
        const animations = new Map<string, SimpleAnimationHandle>()
        const animationSignatures = new Map<string, string>()

        const cancelAnimation = (id: string): void => {
            const animation = animations.get(id)
            if (!animation) return
            animations.delete(id)
            animationSignatures.delete(id)
            animation.cancel()
        }

        const render = (input: SceneInput): void => {
            let raw: unknown
            try { raw = adapter.resolve.call(definition, input) } catch (cause) { throw new SimpleRendererError(`Scene recipe failed: ${String(cause)}`) }
            const limit = SIMPLE_LAYER_BUDGET[input.effectiveQuality.tier]
            const layers = normalizeLayers(raw, limit)
            const nextIds = new Set(layers.map((layer) => layer.id))

            for (const [id, handle] of handles) {
                if (nextIds.has(id)) continue
                cancelAnimation(id)
                adapter.removeLayer.call(platform, handle)
                handles.delete(id)
                roles.delete(id)
            }
            for (const layer of layers) {
                let handle = handles.get(layer.id)
                if (handle && roles.get(layer.id) !== layer.role) {
                    cancelAnimation(layer.id)
                    adapter.removeLayer.call(platform, handle)
                    handles.delete(layer.id)
                    roles.delete(layer.id)
                    handle = undefined
                }
                if (!handle) {
                    handle = adapter.createLayer.call(platform, layer.id, layer.role)
                    handles.set(layer.id, handle)
                    roles.set(layer.id, layer.role)
                    adapter.appendLayer.call(platform, target, handle)
                }
                adapter.applyStyle.call(platform, handle, layer.style)
                const nextMotionSignature = animated ? motionSignature(layer.motion) : null
                const currentMotionSignature = animationSignatures.get(layer.id) ?? null
                if (nextMotionSignature === currentMotionSignature) continue
                cancelAnimation(layer.id)
                if (nextMotionSignature && layer.motion) {
                    const animation = adapter.animate.call(platform, handle, layer.motion.keyframes, {
                        durationMs: layer.motion.durationMs,
                        easing: layer.motion.easing,
                        iterations: layer.motion.iterations,
                    })
                    animations.set(layer.id, animation)
                    animationSignatures.set(layer.id, nextMotionSignature)
                    if (paused) animation.pause()
                }
            }
            latestInput = input
        }

        return {
            kind: 'simple',
            mount: (context) => { if (disposed || mounted) fail('Invalid mount lifecycle.'); target = context.target; mounted = true },
            renderOrUpdate: render,
            resize: (viewport: SceneViewport) => render({ ...latestInput, viewport }),
            pause: () => { if (paused) return; paused = true; for (const animation of animations.values()) animation.pause() },
            resume: () => { if (!paused) return; paused = false; for (const animation of animations.values()) animation.play() },
            dispose: () => {
                if (disposed) return
                disposed = true
                for (const id of [...animations.keys()]) cancelAnimation(id)
                for (const handle of handles.values()) adapter.removeLayer.call(platform, handle)
                handles.clear()
                roles.clear()
                animationSignatures.clear()
            },
        }
    }
}

import {
    isTalosMotionRuntimeModePair,
    type TalosMotionRuntimeEffectiveMode,
    type TalosMotionRuntimeRequestedMode,
} from './runtimePolicy'
import { TALOS_MOTION_SCENE_IDS } from './contracts'
import type {
    SceneId,
    SceneInput,
    SceneInstance,
    SceneKind,
    SceneRegistry,
    SceneViewport,
} from './sceneRegistry'

const STAGE_FAULT_LIMIT = 64
const INSTANCE_KEYS = ['kind', 'mount', 'renderOrUpdate', 'resize', 'pause', 'resume', 'dispose'] as const
const REGISTRY_KEYS = ['lookup', 'create', 'snapshot'] as const

export type TalosMotionStageStatus =
    | 'idle'
    | 'active'
    | 'fallback'
    | 'paused'
    | 'switching'
    | 'solid-fallback'
    | 'disposed'

export type TalosMotionStageFaultReason =
    | 'lookup_failed'
    | 'scene_unavailable'
    | 'create_failed'
    | 'invalid_instance'
    | 'mount_failed'
    | 'render_failed'
    | 'resize_failed'
    | 'pause_failed'
    | 'resume_failed'
    | 'blank_probe_failed'
    | 'blank_detected'
    | 'dispose_failed'
    | 'mode_off'
    | 'background_disabled'
    | 'registry_empty'
    | 'invalid_configuration'

export type TalosMotionStageFaultEvent = Readonly<{
    reason: TalosMotionStageFaultReason
    kind: SceneKind | null
    sceneId: SceneId
}>

export type TalosMotionStageFallbackEvent = Readonly<{
    from: SceneKind | null
    to: SceneKind | null
    reason: TalosMotionStageFaultReason
    sceneId: SceneId
}>

export type TalosMotionStageSnapshot = Readonly<{
    requestedMode: TalosMotionRuntimeRequestedMode
    effectiveMode: TalosMotionRuntimeEffectiveMode
    paused: boolean
    activeKind: SceneKind | null
    activeId: SceneId | null
    fallbackReason: TalosMotionStageFaultReason | null
    faultCount: number
    status: TalosMotionStageStatus
    solidFallback: boolean
}>

export type TalosMotionStageBlankProbe = (context: Readonly<{
    kind: SceneKind
    sceneId: SceneId
    input: SceneInput
    target: unknown
}>) => boolean

export type TalosMotionStageControllerOptions = Readonly<{
    registry: SceneRegistry
    requestedMode: TalosMotionRuntimeRequestedMode
    effectiveMode: TalosMotionRuntimeEffectiveMode
    sceneId: SceneId
    input: SceneInput
    target: unknown
    backgroundEnabled?: boolean
    paused: boolean
    blankProbe?: TalosMotionStageBlankProbe
    onFault?: (event: TalosMotionStageFaultEvent) => void
    onFallback?: (event: TalosMotionStageFallbackEvent) => void
}>

export type TalosMotionStageControllerUpdate = Readonly<Partial<Pick<
    TalosMotionStageControllerOptions,
    'requestedMode' | 'effectiveMode' | 'sceneId' | 'input' | 'backgroundEnabled' | 'paused'
>>>

export type TalosMotionStageController = Readonly<{
    mount: () => TalosMotionStageSnapshot
    update: (update: TalosMotionStageControllerUpdate) => TalosMotionStageSnapshot
    resize: (viewport: SceneViewport) => TalosMotionStageSnapshot
    pause: () => TalosMotionStageSnapshot
    resume: () => TalosMotionStageSnapshot
    dispose: () => TalosMotionStageSnapshot
    snapshot: () => TalosMotionStageSnapshot
}>

const SCENE_KINDS: readonly SceneKind[] = ['complex', 'simple', 'static']

function kindForMode(mode: TalosMotionRuntimeEffectiveMode): SceneKind | null {
    if (mode === 'complex' || mode === 'simple' || mode === 'static') return mode
    return null
}

function readStrictOwnDataProperties(
    value: unknown,
    keys: readonly string[],
): Record<string, unknown> | null {
    try {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
        const ownKeys = Reflect.ownKeys(value)
        if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))) return null

        const record = Object.create(null) as Record<string, unknown>
        for (const key of keys) {
            const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
            if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null
            record[key] = descriptor.value
        }
        return record
    } catch {
        return null
    }
}

function isSceneInstance(value: unknown, kind: SceneKind): value is SceneInstance {
    try {
        const candidate = readStrictOwnDataProperties(value, INSTANCE_KEYS)
        return candidate !== null
            && candidate.kind === kind
            && typeof candidate.mount === 'function'
            && typeof candidate.renderOrUpdate === 'function'
            && typeof candidate.resize === 'function'
            && typeof candidate.pause === 'function'
            && typeof candidate.resume === 'function'
            && typeof candidate.dispose === 'function'
    } catch {
        return false
    }
}

function frozenViewport(viewport: SceneViewport): SceneViewport {
    return Object.freeze({
        width: viewport.width,
        height: viewport.height,
        pixelRatio: viewport.pixelRatio,
    })
}

function nextInput(current: SceneInput, viewport: SceneViewport): SceneInput {
    return Object.freeze({
        ...current,
        viewport: frozenViewport(viewport),
    })
}

export function createTalosMotionStageController(
    options: TalosMotionStageControllerOptions,
): TalosMotionStageController {
    let requestedMode = options.requestedMode
    let effectiveMode = options.effectiveMode
    let sceneId = options.sceneId
    let sceneInput = options.input
    let backgroundEnabled = options.backgroundEnabled !== false
    let paused = options.paused === true
    let started = false
    let disposed = false
    let current: SceneInstance | null = null
    let currentKind: SceneKind | null = null
    let activeKind: SceneKind | null = null
    let activeId: SceneId | null = null
    let fallbackReason: TalosMotionStageFaultReason | null = null
    let faultCount = 0
    let fallbackCount = 0
    let activeChainMode: TalosMotionRuntimeEffectiveMode | null = null
    let activeChainSceneId: SceneId | null = null
    let activeChainBackground: boolean | null = null
    let status: TalosMotionStageStatus = 'idle'
    const disposedInstances = new WeakSet<object>()
    const registry = readStrictOwnDataProperties(options.registry, REGISTRY_KEYS)

    const snapshot = (): TalosMotionStageSnapshot => Object.freeze({
        requestedMode,
        effectiveMode,
        paused,
        activeKind,
        activeId,
        fallbackReason,
        faultCount,
        status,
        solidFallback: activeKind === null,
    })

    const safeFault = (
        reason: TalosMotionStageFaultReason,
        kind: SceneKind | null,
    ): void => {
        if (fallbackReason === null) fallbackReason = reason
        if (faultCount >= STAGE_FAULT_LIMIT) return
        faultCount += 1
        try {
            options.onFault?.(Object.freeze({ reason, kind, sceneId }))
        } catch {
            // Observability must never become a renderer fault.
        }
    }

    const safeFallback = (
        from: SceneKind | null,
        to: SceneKind | null,
        reason: TalosMotionStageFaultReason,
    ): void => {
        if (fallbackCount >= STAGE_FAULT_LIMIT) return
        fallbackCount += 1
        try {
            options.onFallback?.(Object.freeze({ from, to, reason, sceneId }))
        } catch {
            // Observability must never become a renderer fault.
        }
    }

    const disposeInstance = (instance: SceneInstance, kind: SceneKind | null): void => {
        if (disposedInstances.has(instance as object)) return
        disposedInstances.add(instance as object)
        try {
            instance.dispose()
        } catch {
            safeFault('dispose_failed', kind)
        }
    }

    const discardCurrent = (): void => {
        const previous = current
        const previousKind = currentKind
        current = null
        currentKind = null
        activeKind = null
        activeId = null
        activeChainMode = null
        activeChainSceneId = null
        activeChainBackground = null
        if (previous) disposeInstance(previous, previousKind)
    }

    const solid = (reason: TalosMotionStageFaultReason): TalosMotionStageSnapshot => {
        current = null
        currentKind = null
        activeKind = null
        activeId = null
        activeChainMode = null
        activeChainSceneId = null
        activeChainBackground = null
        status = disposed ? 'disposed' : 'solid-fallback'
        fallbackReason = fallbackReason ?? reason
        return snapshot()
    }

    const probe = (kind: SceneKind): TalosMotionStageFaultReason | null => {
        if (!options.blankProbe) return null
        try {
            return options.blankProbe({ kind, sceneId, input: sceneInput, target: options.target })
                ? null
                : 'blank_detected'
        } catch {
            return 'blank_probe_failed'
        }
    }

    const candidateKinds = (): SceneKind[] => {
        const first = kindForMode(effectiveMode)
        if (!first) return []
        const index = SCENE_KINDS.indexOf(first)
        return index < 0 ? [] : SCENE_KINDS.slice(index)
    }

    const activeStatus = (): TalosMotionStageStatus => {
        if (fallbackReason !== null) return 'fallback'
        return paused ? 'paused' : 'active'
    }

    const activate = (kinds: readonly SceneKind[], resetFallbackReason: boolean): TalosMotionStageSnapshot => {
        if (disposed) return snapshot()
        if (resetFallbackReason) fallbackReason = null
        status = 'switching'
        activeKind = null
        activeId = null

        if (!kinds.length) return solid(effectiveMode === 'off' ? 'mode_off' : 'invalid_configuration')

        if (!registry) {
            safeFault('invalid_configuration', null)
            return solid('invalid_configuration')
        }
        let registrySnapshot: unknown
        try {
            registrySnapshot = (registry.snapshot as SceneRegistry['snapshot'])()
            if (!Array.isArray(registrySnapshot)) {
                safeFault('invalid_configuration', null)
                return solid('invalid_configuration')
            }
            if (registrySnapshot.length === 0) return solid('registry_empty')
        } catch {
            safeFault('lookup_failed', null)
            return solid('lookup_failed')
        }

        let hadFault = false
        for (let index = 0; index < kinds.length; index += 1) {
            const kind = kinds[index]
            let registration: unknown
            try {
                registration = registry
                    ? (registry.lookup as SceneRegistry['lookup'])(sceneId, kind)
                    : undefined
            } catch {
                hadFault = true
                safeFault('lookup_failed', kind)
                const next = kinds[index + 1] ?? null
                safeFallback(kind, next, 'lookup_failed')
                continue
            }
            if (!registration) {
                hadFault = true
                safeFault('scene_unavailable', kind)
                const next = kinds[index + 1] ?? null
                safeFallback(kind, next, 'scene_unavailable')
                continue
            }

            let candidate: unknown
            try {
                candidate = registry
                    ? (registry.create as SceneRegistry['create'])(sceneId, kind, sceneInput)
                    : null
            } catch {
                hadFault = true
                safeFault('create_failed', kind)
                const next = kinds[index + 1] ?? null
                safeFallback(kind, next, 'create_failed')
                continue
            }
            if (!candidate) {
                hadFault = true
                safeFault('create_failed', kind)
                const next = kinds[index + 1] ?? null
                safeFallback(kind, next, 'create_failed')
                continue
            }
            if (!isSceneInstance(candidate, kind)) {
                hadFault = true
                safeFault('invalid_instance', kind)
                const next = kinds[index + 1] ?? null
                safeFallback(kind, next, 'invalid_instance')
                continue
            }

            current = candidate
            currentKind = kind
            let reason: TalosMotionStageFaultReason | null = null
            try {
                candidate.mount({ kind, target: options.target })
            } catch {
                reason = 'mount_failed'
            }
            if (!reason) {
                try {
                    candidate.renderOrUpdate(sceneInput)
                } catch {
                    reason = 'render_failed'
                }
            }
            if (!reason) reason = probe(kind)
            if (!reason && paused) {
                try {
                    candidate.pause()
                } catch {
                    reason = 'pause_failed'
                }
            }

            if (reason) {
                hadFault = true
                safeFault(reason, kind)
                discardCurrent()
                const next = kinds[index + 1] ?? null
                safeFallback(kind, next, reason)
                continue
            }

            activeKind = kind
            activeId = sceneId
            activeChainMode = effectiveMode
            activeChainSceneId = sceneId
            activeChainBackground = backgroundEnabled
            status = activeStatus()
            return snapshot()
        }

        return solid(hadFault ? (fallbackReason ?? 'scene_unavailable') : 'scene_unavailable')
    }

    const recoverAfterFault = (reason: TalosMotionStageFaultReason): TalosMotionStageSnapshot => {
        const failedKind = currentKind ?? activeKind
        const kinds = candidateKinds()
        const failedIndex = failedKind ? kinds.indexOf(failedKind) : -1
        safeFault(reason, failedKind)
        discardCurrent()
        const nextKinds = failedIndex >= 0 ? kinds.slice(failedIndex + 1) : kinds
        if (nextKinds.length) safeFallback(failedKind, nextKinds[0], reason)
        return activate(nextKinds, false)
    }

    const mount = (): TalosMotionStageSnapshot => {
        if (disposed || started) return snapshot()
        started = true
        if (!isTalosMotionRuntimeModePair(requestedMode, effectiveMode)) {
            return solid('invalid_configuration')
        }
        if (!(TALOS_MOTION_SCENE_IDS as readonly unknown[]).includes(sceneId)) {
            return solid('invalid_configuration')
        }
        if (!backgroundEnabled) return solid('background_disabled')
        if (effectiveMode === 'off') return solid('mode_off')
        discardCurrent()
        return activate(candidateKinds(), true)
    }

    const update = (next: TalosMotionStageControllerUpdate): TalosMotionStageSnapshot => {
        if (disposed) return snapshot()
        const wasPaused = paused
        if (next.requestedMode !== undefined) requestedMode = next.requestedMode
        if (next.effectiveMode !== undefined) effectiveMode = next.effectiveMode
        if (next.sceneId !== undefined) sceneId = next.sceneId
        if (next.input !== undefined) sceneInput = next.input
        if (next.backgroundEnabled !== undefined) backgroundEnabled = next.backgroundEnabled
        if (next.paused !== undefined) paused = next.paused === true
        if (!started) return mount()
        if (!isTalosMotionRuntimeModePair(requestedMode, effectiveMode)
            || !(TALOS_MOTION_SCENE_IDS as readonly unknown[]).includes(sceneId)) {
            discardCurrent()
            return solid('invalid_configuration')
        }
        if (!backgroundEnabled) {
            discardCurrent()
            fallbackReason = null
            return solid('background_disabled')
        }
        if (effectiveMode === 'off') {
            discardCurrent()
            fallbackReason = null
            return solid('mode_off')
        }
        const chainIsStable = activeChainMode === effectiveMode
            && activeChainSceneId === sceneId
            && activeChainBackground === backgroundEnabled
        if (current && activeKind && activeId === sceneId && chainIsStable) {
            try {
                current.renderOrUpdate(sceneInput)
                const reason = activeKind ? probe(activeKind) : null
                if (reason) return recoverAfterFault(reason)
                if (paused !== wasPaused) {
                    try {
                        if (paused) current.pause()
                        else current.resume()
                    } catch {
                        return recoverAfterFault(paused ? 'pause_failed' : 'resume_failed')
                    }
                }
                if (requestedMode === activeKind) {
                    fallbackReason = null
                }
                status = activeStatus()
                return snapshot()
            } catch {
                return recoverAfterFault('render_failed')
            }
        }
        discardCurrent()
        return activate(candidateKinds(), true)
    }

    const resize = (viewport: SceneViewport): TalosMotionStageSnapshot => {
        if (disposed || !current || !activeKind) return snapshot()
        try {
            current.resize(viewport)
            sceneInput = nextInput(sceneInput, viewport)
            const reason = probe(activeKind)
            if (reason) return recoverAfterFault(reason)
            return snapshot()
        } catch {
            return recoverAfterFault('resize_failed')
        }
    }

    const pause = (): TalosMotionStageSnapshot => {
        if (disposed || paused) return snapshot()
        paused = true
        if (!current || !activeKind) return snapshot()
        try {
            current.pause()
            status = activeStatus()
            return snapshot()
        } catch {
            return recoverAfterFault('pause_failed')
        }
    }

    const resume = (): TalosMotionStageSnapshot => {
        if (disposed || !paused) return snapshot()
        paused = false
        if (!current || !activeKind) return snapshot()
        try {
            current.resume()
            status = activeStatus()
            return snapshot()
        } catch {
            return recoverAfterFault('resume_failed')
        }
    }

    const dispose = (): TalosMotionStageSnapshot => {
        if (disposed) return snapshot()
        disposed = true
        status = 'disposed'
        discardCurrent()
        return snapshot()
    }

    return Object.freeze({ mount, update, resize, pause, resume, dispose, snapshot })
}

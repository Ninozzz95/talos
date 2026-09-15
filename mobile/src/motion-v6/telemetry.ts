import {
    TALOS_MOTION_FPS_CAPS,
    TALOS_MOTION_RENDERER_MODES,
    TALOS_MOTION_SCENE_IDS,
    type TalosMotionFpsCap,
    type TalosMotionRendererMode,
    type TalosMotionSceneId,
} from './contracts'

export const DEFAULT_MOTION_TELEMETRY_SAMPLE_WINDOW = 120
export const MOTION_TELEMETRY_SAMPLE_WINDOW_HARD_CAP = 600
export const MOTION_TELEMETRY_MAX_EFFECTIVE_DPR = 2
export const MOTION_TELEMETRY_EFFECTIVE_MODES = Object.freeze([
    'off',
    'static',
    'simple',
    'complex',
] as const)
export const MOTION_TELEMETRY_QUALITY_TIERS = Object.freeze([
    'low',
    'balanced',
    'high',
] as const)
export const MOTION_TELEMETRY_PERCENTILE_CONVENTION = Object.freeze({
    method: 'nearest-rank',
    rankFormula: 'ceil(p * n)',
    indexFormula: 'rank - 1',
} as const)

export type MotionTelemetryEffectiveMode = typeof MOTION_TELEMETRY_EFFECTIVE_MODES[number]
export type MotionTelemetryQualityTier = typeof MOTION_TELEMETRY_QUALITY_TIERS[number]

export type MotionTelemetryReason =
    | 'hidden'
    | 'manual'
    | 'data-saver'
    | 'unsupported'
    | 'budget'
    | 'fault'
    | 'unknown'

export type MotionTelemetryFrame = Readonly<{
    timestampMs: number
    frameCostMs: number
}>

export type MotionTelemetryTierChange = Readonly<{
    from: MotionTelemetryQualityTier
    to: MotionTelemetryQualityTier
    timestampMs: number
}>

type MotionTelemetryDoctorFields = {
    requestedMode: TalosMotionRendererMode
    effectiveMode: MotionTelemetryEffectiveMode
    sceneId: TalosMotionSceneId
    qualityTier: MotionTelemetryQualityTier
    fpsCap: TalosMotionFpsCap
    dpr: number
    primitiveCount: number
    layerCount: number
    pauseReason: MotionTelemetryReason | null
    fallbackReason: MotionTelemetryReason | null
    rendererFaultCount: number
    lastTierChange: MotionTelemetryTierChange | null
}

export type MotionTelemetryDoctorState = Readonly<MotionTelemetryDoctorFields>

export type MotionTelemetryDoctorPatch = {
    requestedMode?: TalosMotionRendererMode
    effectiveMode?: MotionTelemetryEffectiveMode
    sceneId?: TalosMotionSceneId
    qualityTier?: MotionTelemetryQualityTier
    fpsCap?: TalosMotionFpsCap
    dpr?: number
    primitiveCount?: number
    layerCount?: number
    pauseReason?: MotionTelemetryReason | null
    fallbackReason?: MotionTelemetryReason | null
    lastTierChange?: MotionTelemetryTierChange | null
}

export type MotionTelemetrySnapshot = Readonly<{
    sampleWindowSize: number
    sampleCount: number
    observedFps: number
    frameP50Ms: number | null
    frameP95Ms: number | null
    doctor: MotionTelemetryDoctorState
    disposed: boolean
}>

export type MotionTelemetryOptions = {
    maxSamples?: number
    doctor?: MotionTelemetryDoctorState
}

export type MotionTelemetry = {
    recordFrame: (frame: MotionTelemetryFrame) => boolean
    updateDoctor: (patch: MotionTelemetryDoctorPatch) => boolean
    recordRendererFault: (effectiveMode: MotionTelemetryEffectiveMode) => boolean
    snapshot: () => MotionTelemetrySnapshot
    reset: () => void
    dispose: () => void
}

const FRAME_KEYS = ['timestampMs', 'frameCostMs'] as const
const OPTIONS_KEYS = ['maxSamples', 'doctor'] as const
const DOCTOR_KEYS = [
    'requestedMode',
    'effectiveMode',
    'sceneId',
    'qualityTier',
    'fpsCap',
    'dpr',
    'primitiveCount',
    'layerCount',
    'pauseReason',
    'fallbackReason',
    'rendererFaultCount',
    'lastTierChange',
] as const
const DOCTOR_PATCH_KEYS = [
    'requestedMode',
    'effectiveMode',
    'sceneId',
    'qualityTier',
    'fpsCap',
    'dpr',
    'primitiveCount',
    'layerCount',
    'pauseReason',
    'fallbackReason',
    'lastTierChange',
] as const
const TIER_CHANGE_KEYS = ['from', 'to', 'timestampMs'] as const
const REASONS: readonly MotionTelemetryReason[] = [
    'hidden',
    'manual',
    'data-saver',
    'unsupported',
    'budget',
    'fault',
    'unknown',
]

type StoredFrame = {
    timestampMs: number
    frameCostMs: number
}

function dataProperties(
    value: unknown,
    allowedKeys: readonly string[],
    requireAll: boolean,
): Map<string, unknown> | null {
    if (typeof value !== 'object' || value === null) return null

    try {
        if (Array.isArray(value)) return null
        const ownKeys = Reflect.ownKeys(value)
        if (ownKeys.some((key) => typeof key !== 'string')) return null

        const stringKeys = ownKeys as string[]
        const allowed = new Set(allowedKeys)
        if (stringKeys.some((key) => !allowed.has(key))) return null
        if (requireAll && stringKeys.length !== allowedKeys.length) return null

        const values = new Map<string, unknown>()
        for (const key of stringKeys) {
            const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
            if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
                return null
            }
            values.set(key, descriptor.value)
        }

        if (requireAll && allowedKeys.some((key) => !values.has(key))) return null
        return values
    } catch {
        return null
    }
}

function exactDataProperties(value: unknown, keys: readonly string[]): Map<string, unknown> | null {
    return dataProperties(value, keys, true)
}

function closedDataProperties(value: unknown, keys: readonly string[]): Map<string, unknown> | null {
    return dataProperties(value, keys, false)
}

function finiteNonNegative(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function effectiveDpr(value: unknown): value is number {
    return typeof value === 'number'
        && Number.isFinite(value)
        && value > 0
        && value <= MOTION_TELEMETRY_MAX_EFFECTIVE_DPR
}

function nonNegativeInteger(value: unknown): value is number {
    return finiteNonNegative(value) && Number.isSafeInteger(value)
}

function oneOf<T>(value: unknown, values: readonly T[]): value is T {
    return values.includes(value as T)
}

function cloneTierChange(change: MotionTelemetryTierChange | null): MotionTelemetryTierChange | null {
    if (!change) return null
    return {
        from: change.from,
        to: change.to,
        timestampMs: change.timestampMs,
    }
}

function cloneDoctor(doctor: MotionTelemetryDoctorState): MotionTelemetryDoctorFields {
    return {
        requestedMode: doctor.requestedMode,
        effectiveMode: doctor.effectiveMode,
        sceneId: doctor.sceneId,
        qualityTier: doctor.qualityTier,
        fpsCap: doctor.fpsCap,
        dpr: doctor.dpr,
        primitiveCount: doctor.primitiveCount,
        layerCount: doctor.layerCount,
        pauseReason: doctor.pauseReason,
        fallbackReason: doctor.fallbackReason,
        rendererFaultCount: doctor.rendererFaultCount,
        lastTierChange: cloneTierChange(doctor.lastTierChange),
    }
}

function validateTierChange(value: unknown): MotionTelemetryTierChange | null | undefined {
    if (value === null) return null
    const values = exactDataProperties(value, TIER_CHANGE_KEYS)
    if (!values) return undefined
    const from = values.get('from')
    const to = values.get('to')
    const timestampMs = values.get('timestampMs')
    if (
        !oneOf(from, MOTION_TELEMETRY_QUALITY_TIERS)
        || !oneOf(to, MOTION_TELEMETRY_QUALITY_TIERS)
        || from === to
        || !finiteNonNegative(timestampMs)
    ) {
        return undefined
    }
    return { from, to, timestampMs }
}

function validateDoctor(value: unknown): MotionTelemetryDoctorFields | null {
    const values = exactDataProperties(value, DOCTOR_KEYS)
    if (!values) return null

    const tierChange = validateTierChange(values.get('lastTierChange'))
    if (tierChange === undefined) return null

    const state = {
        requestedMode: values.get('requestedMode'),
        effectiveMode: values.get('effectiveMode'),
        sceneId: values.get('sceneId'),
        qualityTier: values.get('qualityTier'),
        fpsCap: values.get('fpsCap'),
        dpr: values.get('dpr'),
        primitiveCount: values.get('primitiveCount'),
        layerCount: values.get('layerCount'),
        pauseReason: values.get('pauseReason'),
        fallbackReason: values.get('fallbackReason'),
        rendererFaultCount: values.get('rendererFaultCount'),
        lastTierChange: tierChange,
    }

    if (
        !oneOf(state.requestedMode, TALOS_MOTION_RENDERER_MODES)
        || !oneOf(state.effectiveMode, MOTION_TELEMETRY_EFFECTIVE_MODES)
        || !oneOf(state.sceneId, TALOS_MOTION_SCENE_IDS)
        || !oneOf(state.qualityTier, MOTION_TELEMETRY_QUALITY_TIERS)
        || !oneOf(state.fpsCap, TALOS_MOTION_FPS_CAPS)
        || !effectiveDpr(state.dpr)
        || !nonNegativeInteger(state.primitiveCount)
        || !nonNegativeInteger(state.layerCount)
        || !(state.pauseReason === null || oneOf(state.pauseReason, REASONS))
        || !(state.fallbackReason === null || oneOf(state.fallbackReason, REASONS))
        || !nonNegativeInteger(state.rendererFaultCount)
        || (state.fallbackReason === 'fault' && state.rendererFaultCount === 0)
        || (state.lastTierChange !== null && state.lastTierChange.to !== state.qualityTier)
    ) {
        return null
    }

    return state as MotionTelemetryDoctorFields
}

function defaultDoctor(): MotionTelemetryDoctorFields {
    return {
        requestedMode: 'adaptive',
        effectiveMode: 'off',
        sceneId: 'forge',
        qualityTier: 'balanced',
        fpsCap: 30,
        dpr: 1,
        primitiveCount: 0,
        layerCount: 0,
        pauseReason: null,
        fallbackReason: null,
        rendererFaultCount: 0,
        lastTierChange: null,
    }
}

function normalizeSampleWindow(value: unknown): number {
    if (!nonNegativeInteger(value) || value < 1) return DEFAULT_MOTION_TELEMETRY_SAMPLE_WINDOW
    return Math.min(value, MOTION_TELEMETRY_SAMPLE_WINDOW_HARD_CAP)
}

function nearestRankFromSorted(sortedValues: readonly number[], percentile: number): number | null {
    if (sortedValues.length === 0) return null
    const rank = Math.ceil(percentile * sortedValues.length)
    return sortedValues[rank - 1]
}

/**
 * Calculates a deterministic nearest-rank percentile. Valid percentiles are in
 * (0, 1]; rank is ceil(p * n), and the zero-based index is rank - 1.
 */
export function calculateMotionTelemetryPercentile(
    values: readonly number[],
    percentile: number,
): number | null {
    if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 1) return null

    try {
        const sortedValues = Array.from(values)
        if (sortedValues.some((value) => !finiteNonNegative(value))) return null
        sortedValues.sort((left, right) => left - right)
        return nearestRankFromSorted(sortedValues, percentile)
    } catch {
        return null
    }
}

function freezeDoctor(doctor: MotionTelemetryDoctorState): MotionTelemetryDoctorState {
    const copy = cloneDoctor(doctor)
    if (copy.lastTierChange) Object.freeze(copy.lastTierChange)
    return Object.freeze(copy)
}

export function createMotionTelemetry(options: MotionTelemetryOptions = {}): MotionTelemetry {
    const optionValues = closedDataProperties(options, OPTIONS_KEYS)
    const sampleWindowSize = normalizeSampleWindow(optionValues?.get('maxSamples'))
    let doctor = optionValues && optionValues.has('doctor')
        ? validateDoctor(optionValues.get('doctor')) ?? defaultDoctor()
        : defaultDoctor()
    const frames: StoredFrame[] = []
    let disposed = false

    const snapshot = (): MotionTelemetrySnapshot => {
        const sortedCosts = frames.map((item) => item.frameCostMs).sort((a, b) => a - b)
        const first = frames[0]
        const last = frames[frames.length - 1]
        const elapsedMs = first && last ? last.timestampMs - first.timestampMs : 0
        const observedFps = frames.length > 1 && elapsedMs > 0
            ? ((frames.length - 1) * 1_000) / elapsedMs
            : 0

        return Object.freeze({
            sampleWindowSize,
            sampleCount: frames.length,
            observedFps,
            frameP50Ms: nearestRankFromSorted(sortedCosts, 0.5),
            frameP95Ms: nearestRankFromSorted(sortedCosts, 0.95),
            doctor: freezeDoctor(doctor),
            disposed,
        })
    }

    return {
        recordFrame: (frame) => {
            if (disposed) return false
            const values = exactDataProperties(frame, FRAME_KEYS)
            if (!values) return false
            const timestampMs = values.get('timestampMs')
            const frameCostMs = values.get('frameCostMs')
            if (!finiteNonNegative(timestampMs) || !finiteNonNegative(frameCostMs)) return false
            const last = frames[frames.length - 1]
            if (last && timestampMs < last.timestampMs) return false

            frames.push({ timestampMs, frameCostMs })
            if (frames.length > sampleWindowSize) frames.shift()
            return true
        },
        updateDoctor: (patch) => {
            if (disposed) return false
            const values = closedDataProperties(patch, DOCTOR_PATCH_KEYS)
            if (!values) return false

            const next = cloneDoctor(doctor)
            for (const key of DOCTOR_PATCH_KEYS) {
                if (!values.has(key) || key === 'lastTierChange') continue
                const value = values.get(key)
                switch (key) {
                    case 'requestedMode':
                        if (!oneOf(value, TALOS_MOTION_RENDERER_MODES)) return false
                        next.requestedMode = value
                        break
                    case 'effectiveMode':
                        if (!oneOf(value, MOTION_TELEMETRY_EFFECTIVE_MODES)) return false
                        next.effectiveMode = value
                        break
                    case 'sceneId':
                        if (!oneOf(value, TALOS_MOTION_SCENE_IDS)) return false
                        next.sceneId = value
                        break
                    case 'qualityTier':
                        if (!oneOf(value, MOTION_TELEMETRY_QUALITY_TIERS)) return false
                        next.qualityTier = value
                        break
                    case 'fpsCap':
                        if (!oneOf(value, TALOS_MOTION_FPS_CAPS)) return false
                        next.fpsCap = value
                        break
                    case 'dpr':
                        if (!effectiveDpr(value)) return false
                        next.dpr = value
                        break
                    case 'primitiveCount':
                    case 'layerCount':
                        if (!nonNegativeInteger(value)) return false
                        next[key] = value
                        break
                    case 'pauseReason':
                    case 'fallbackReason':
                        if (value !== null && !oneOf(value, REASONS)) return false
                        next[key] = value
                        break
                }
            }

            const qualityTierChanged = next.qualityTier !== doctor.qualityTier
            const hasTierEvidence = values.has('lastTierChange')
            if (qualityTierChanged !== hasTierEvidence) return false
            if (hasTierEvidence) {
                const tierChange = validateTierChange(values.get('lastTierChange'))
                if (
                    !tierChange
                    || tierChange.from !== doctor.qualityTier
                    || tierChange.to !== next.qualityTier
                    || (doctor.lastTierChange !== null
                        && tierChange.timestampMs < doctor.lastTierChange.timestampMs)
                ) {
                    return false
                }
                next.lastTierChange = tierChange
            }

            if (next.fallbackReason === 'fault' && next.rendererFaultCount === 0) return false
            doctor = next
            return true
        },
        recordRendererFault: (effectiveMode) => {
            if (
                disposed
                || !oneOf(effectiveMode, MOTION_TELEMETRY_EFFECTIVE_MODES)
                || doctor.rendererFaultCount >= Number.MAX_SAFE_INTEGER
            ) {
                return false
            }

            doctor = {
                ...doctor,
                effectiveMode,
                fallbackReason: 'fault',
                rendererFaultCount: doctor.rendererFaultCount + 1,
            }
            return true
        },
        snapshot,
        reset: () => {
            if (disposed) return
            frames.length = 0
            doctor = defaultDoctor()
        },
        dispose: () => {
            if (disposed) return
            disposed = true
            frames.length = 0
        },
    }
}

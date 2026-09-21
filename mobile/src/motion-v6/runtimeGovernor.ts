import type { ComplexRendererFrameMetric } from './renderers/complexRenderer'
import {
    createTalosMotionRuntimePolicyController,
    type TalosMotionRuntimeEffectiveMode,
    type TalosMotionRuntimeEnvironment,
} from './runtimePolicy'
import { createMotionTelemetry } from './telemetry'
import type { TalosMotionV6Preferences } from './contracts'

export const TALOS_MOTION_RUNTIME_DEFAULT_FRAME_SAMPLE_WINDOW = 30
export const TALOS_MOTION_RUNTIME_MAX_PENDING_WINDOWS = 16
export const TALOS_MOTION_RUNTIME_RECOVERY_EVENT_LOOP_BUDGET_MS = 8

const MIN_FRAME_SAMPLE_WINDOW = 2
const MAX_FRAME_SAMPLE_WINDOW = 120
const FAULTABLE_MODES = Object.freeze(['complex', 'simple', 'static'] as const)

export type TalosMotionRuntimeFaultSignal = Readonly<{
    effectiveMode: Exclude<TalosMotionRuntimeEffectiveMode, 'off'>
    reason: 'renderer_fault' | 'stage_fault' | 'registry_fault'
}>

export type TalosMotionRuntimeStableWindowMetric = Readonly<{
    eventLoopDelayMs: number
}>

export type TalosMotionRuntimeGovernorOptions = Readonly<{
    frameSampleWindow?: number
}>

export type TalosMotionRuntimeGovernorSnapshot = Readonly<{
    frameSampleWindow: number
    frameSampleCount: number
    pendingPerformanceWindows: number
    degradationStage: number
    lastFrameP95Ms: number | null
    rendererFault: boolean
    failedEffectiveMode: Exclude<TalosMotionRuntimeEffectiveMode, 'off'> | null
    recoveryLocked: boolean
    disposed: boolean
}>

export type TalosMotionRuntimeGovernorResolution = TalosMotionRuntimeGovernorSnapshot & Readonly<{
    environment: TalosMotionRuntimeEnvironment
}>

export type TalosMotionRuntimeGovernor = Readonly<{
    recordFrame: (metric: ComplexRendererFrameMetric) => boolean
    recordStableWindow: (metric: TalosMotionRuntimeStableWindowMetric) => boolean
    recordRendererFault: (
        effectiveMode: Exclude<TalosMotionRuntimeEffectiveMode, 'off'>,
        configurationKey: string,
    ) => boolean
    resolve: (
        preferences: TalosMotionV6Preferences,
        environment: TalosMotionRuntimeEnvironment,
        configurationKey: string,
    ) => TalosMotionRuntimeGovernorResolution
    snapshot: () => TalosMotionRuntimeGovernorSnapshot
    reset: () => void
    dispose: () => void
}>

function sampleWindow(value: unknown): number {
    return typeof value === 'number'
        && Number.isSafeInteger(value)
        && value >= MIN_FRAME_SAMPLE_WINDOW
        && value <= MAX_FRAME_SAMPLE_WINDOW
        ? value
        : TALOS_MOTION_RUNTIME_DEFAULT_FRAME_SAMPLE_WINDOW
}

function strictFrameMetric(value: unknown): ComplexRendererFrameMetric | null {
    const keys = ['timestampMs', 'frameCostMs', 'primitiveCount'] as const
    try {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
        const ownKeys = Reflect.ownKeys(value)
        if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key as typeof keys[number]))) return null
        const result: Record<string, unknown> = Object.create(null)
        for (const key of keys) {
            const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
            if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null
            result[key] = descriptor.value
        }
        if (typeof result.timestampMs !== 'number' || !Number.isFinite(result.timestampMs) || result.timestampMs < 0) return null
        if (typeof result.frameCostMs !== 'number' || !Number.isFinite(result.frameCostMs) || result.frameCostMs < 0) return null
        if (typeof result.primitiveCount !== 'number' || !Number.isSafeInteger(result.primitiveCount) || result.primitiveCount < 0) return null
        return Object.freeze({
            timestampMs: result.timestampMs,
            frameCostMs: result.frameCostMs,
            primitiveCount: result.primitiveCount,
        })
    } catch {
        return null
    }
}

function validConfigurationKey(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= 2_048
}

function strictStableWindowMetric(value: unknown): TalosMotionRuntimeStableWindowMetric | null {
    try {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
        const keys = Reflect.ownKeys(value)
        if (keys.length !== 1 || keys[0] !== 'eventLoopDelayMs') return null
        const descriptor = Reflect.getOwnPropertyDescriptor(value, 'eventLoopDelayMs')
        if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null
        if (typeof descriptor.value !== 'number' || !Number.isFinite(descriptor.value) || descriptor.value < 0) return null
        return Object.freeze({ eventLoopDelayMs: descriptor.value })
    } catch {
        return null
    }
}

function environmentWithoutSamples(
    source: TalosMotionRuntimeEnvironment,
    faultMode: Exclude<TalosMotionRuntimeEffectiveMode, 'off'> | null,
): TalosMotionRuntimeEnvironment {
    return Object.freeze({
        workspaceBackgroundAllowed: source.workspaceBackgroundAllowed === true,
        workspaceInterfaceMotionAllowed: source.workspaceInterfaceMotionAllowed === true,
        prefersReducedMotion: source.prefersReducedMotion === true,
        documentHidden: source.documentHidden === true,
        saveData: source.saveData === true,
        rendererFault: faultMode !== null,
        failedEffectiveMode: faultMode,
        frameP95Ms: null,
        frameSampleSufficient: false,
    })
}

function environmentSignature(environment: TalosMotionRuntimeEnvironment): string {
    return [
        environment.workspaceBackgroundAllowed,
        environment.workspaceInterfaceMotionAllowed,
        environment.prefersReducedMotion,
        environment.documentHidden,
        environment.saveData,
        environment.rendererFault,
        environment.failedEffectiveMode ?? '',
    ].join(':')
}

function performanceContextUsable(
    preferences: TalosMotionV6Preferences,
    environment: TalosMotionRuntimeEnvironment,
): boolean {
    return preferences.background_enabled
        && preferences.mode !== 'off'
        && preferences.mode !== 'static'
        && environment.workspaceBackgroundAllowed
        && !environment.prefersReducedMotion
        && !(preferences.pause_when_hidden && environment.documentHidden)
        && !(preferences.respect_data_saver && environment.saveData)
        && !environment.rendererFault
}

export function createTalosMotionRuntimeGovernor(
    options: TalosMotionRuntimeGovernorOptions = {},
): TalosMotionRuntimeGovernor {
    const frameSampleWindow = sampleWindow(options.frameSampleWindow)
    const controller = createTalosMotionRuntimePolicyController()
    const telemetry = createMotionTelemetry({ maxSamples: frameSampleWindow })
    const pendingPerformanceWindows: Array<Readonly<{
        p95Ms: number
        source: 'renderer' | 'recovery_probe'
    }>> = []
    let lastFrameP95Ms: number | null = null
    let configurationKey: string | null = null
    let lastEnvironmentSignature: string | null = null
    let faultConfigurationKey: string | null = null
    let failedEffectiveMode: Exclude<TalosMotionRuntimeEffectiveMode, 'off'> | null = null
    let recoveryProbeStage: number | null = null
    let recoveryLocked = false
    let disposed = false

    const queuePerformanceWindow = (p95Ms: number, source: 'renderer' | 'recovery_probe'): void => {
        if (pendingPerformanceWindows.length >= TALOS_MOTION_RUNTIME_MAX_PENDING_WINDOWS) pendingPerformanceWindows.shift()
        pendingPerformanceWindows.push(Object.freeze({ p95Ms, source }))
        lastFrameP95Ms = p95Ms
    }

    const snapshot = (): TalosMotionRuntimeGovernorSnapshot => Object.freeze({
        frameSampleWindow,
        frameSampleCount: telemetry.snapshot().sampleCount,
        pendingPerformanceWindows: pendingPerformanceWindows.length,
        degradationStage: controller.snapshot().degradationStage,
        lastFrameP95Ms,
        rendererFault: failedEffectiveMode !== null,
        failedEffectiveMode,
        recoveryLocked,
        disposed,
    })

    const resetPerformance = (): void => {
        controller.reset()
        telemetry.reset()
        pendingPerformanceWindows.length = 0
        lastFrameP95Ms = null
        lastEnvironmentSignature = null
        recoveryProbeStage = null
        recoveryLocked = false
    }

    return Object.freeze({
        recordFrame: (rawMetric): boolean => {
            if (disposed) return false
            const metric = strictFrameMetric(rawMetric)
            if (!metric || !telemetry.recordFrame({ timestampMs: metric.timestampMs, frameCostMs: metric.frameCostMs })) return false
            const telemetrySnapshot = telemetry.snapshot()
            if (telemetrySnapshot.sampleCount < frameSampleWindow || telemetrySnapshot.frameP95Ms === null) return false
            queuePerformanceWindow(telemetrySnapshot.frameP95Ms, 'renderer')
            telemetry.reset()
            return true
        },
        recordStableWindow: (rawMetric): boolean => {
            const metric = strictStableWindowMetric(rawMetric)
            if (disposed
                || controller.snapshot().degradationStage <= 0
                || recoveryLocked
                || !metric
                || metric.eventLoopDelayMs > TALOS_MOTION_RUNTIME_RECOVERY_EVENT_LOOP_BUDGET_MS) return false
            queuePerformanceWindow(metric.eventLoopDelayMs, 'recovery_probe')
            return true
        },
        recordRendererFault: (effectiveMode, nextConfigurationKey): boolean => {
            if (disposed
                || !(FAULTABLE_MODES as readonly unknown[]).includes(effectiveMode)
                || !validConfigurationKey(nextConfigurationKey)
                || (failedEffectiveMode === effectiveMode && faultConfigurationKey === nextConfigurationKey)) {
                return false
            }
            resetPerformance()
            failedEffectiveMode = effectiveMode
            faultConfigurationKey = nextConfigurationKey
            return true
        },
        resolve: (preferences, sourceEnvironment, nextConfigurationKey): TalosMotionRuntimeGovernorResolution => {
            if (!validConfigurationKey(nextConfigurationKey)) nextConfigurationKey = 'invalid-configuration'
            if (configurationKey === null) {
                configurationKey = nextConfigurationKey
            } else if (configurationKey !== nextConfigurationKey) {
                resetPerformance()
                configurationKey = nextConfigurationKey
                if (faultConfigurationKey !== nextConfigurationKey) {
                    failedEffectiveMode = null
                    faultConfigurationKey = null
                }
            }

            const environment = environmentWithoutSamples(sourceEnvironment, failedEffectiveMode)
            const nextEnvironmentSignature = environmentSignature(environment)
            if (!performanceContextUsable(preferences, environment)) {
                pendingPerformanceWindows.length = 0
                telemetry.reset()
                controller.resolve(preferences, environment)
            } else if (pendingPerformanceWindows.length > 0) {
                for (const performanceWindow of pendingPerformanceWindows.splice(0)) {
                    const previousStage = controller.snapshot().degradationStage
                    controller.resolve(preferences, {
                        ...environment,
                        frameP95Ms: performanceWindow.p95Ms,
                        frameSampleSufficient: true,
                    })
                    const nextStage = controller.snapshot().degradationStage
                    if (performanceWindow.source === 'recovery_probe' && nextStage < previousStage) {
                        recoveryProbeStage = nextStage
                    } else if (performanceWindow.source === 'renderer' && recoveryProbeStage !== null) {
                        if (nextStage > previousStage) {
                            recoveryLocked = true
                            recoveryProbeStage = null
                        } else if (nextStage === 0) {
                            recoveryProbeStage = null
                            recoveryLocked = false
                        }
                    }
                }
            } else if (lastEnvironmentSignature !== nextEnvironmentSignature) {
                controller.resolve(preferences, environment)
            }
            lastEnvironmentSignature = nextEnvironmentSignature

            return Object.freeze({
                ...snapshot(),
                environment,
            })
        },
        snapshot,
        reset: (): void => {
            if (disposed) return
            resetPerformance()
            configurationKey = null
            faultConfigurationKey = null
            failedEffectiveMode = null
        },
        dispose: (): void => {
            if (disposed) return
            disposed = true
            controller.reset()
            telemetry.dispose()
            pendingPerformanceWindows.length = 0
            configurationKey = null
            faultConfigurationKey = null
            failedEffectiveMode = null
            lastFrameP95Ms = null
            lastEnvironmentSignature = null
            recoveryProbeStage = null
            recoveryLocked = false
        },
    })
}

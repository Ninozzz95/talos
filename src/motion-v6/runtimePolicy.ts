import {
    TALOS_MOTION_DPR_CAPS,
    TALOS_MOTION_FPS_CAPS,
    TALOS_MOTION_RENDERER_MODES,
    type TalosMotionV6Preferences,
} from './contracts'
import {
    MOTION_TELEMETRY_EFFECTIVE_MODES,
    MOTION_TELEMETRY_QUALITY_TIERS,
    type MotionTelemetryEffectiveMode,
} from './telemetry'

export const TALOS_MOTION_RUNTIME_REQUESTED_MODES = Object.freeze([
    ...TALOS_MOTION_RENDERER_MODES,
] as const)

export const TALOS_MOTION_RUNTIME_EFFECTIVE_MODES = Object.freeze([
    ...MOTION_TELEMETRY_EFFECTIVE_MODES,
] as const)

export const TALOS_MOTION_RUNTIME_QUALITY_TIERS = Object.freeze([
    ...MOTION_TELEMETRY_QUALITY_TIERS,
] as const)

export type TalosMotionRuntimeRequestedMode = typeof TALOS_MOTION_RUNTIME_REQUESTED_MODES[number]
export type TalosMotionRuntimeEffectiveMode = typeof TALOS_MOTION_RUNTIME_EFFECTIVE_MODES[number]
export type TalosMotionRuntimeQualityTier = typeof TALOS_MOTION_RUNTIME_QUALITY_TIERS[number]

export const TALOS_MOTION_RUNTIME_MODE_PAIR_MATRIX = Object.freeze({
    off: Object.freeze(['off'] as const),
    static: Object.freeze(['static', 'off'] as const),
    simple: Object.freeze(['simple', 'static', 'off'] as const),
    complex: Object.freeze(['complex', 'simple', 'static', 'off'] as const),
    adaptive: Object.freeze(['complex', 'simple', 'static', 'off'] as const),
}) satisfies Readonly<Record<TalosMotionRuntimeRequestedMode, readonly TalosMotionRuntimeEffectiveMode[]>>

export function isTalosMotionRuntimeModePair(
    requested: unknown,
    effective: unknown,
): boolean {
    if (typeof requested !== 'string'
        || typeof effective !== 'string'
        || !(TALOS_MOTION_RUNTIME_REQUESTED_MODES as readonly string[]).includes(requested)
        || !(TALOS_MOTION_RUNTIME_EFFECTIVE_MODES as readonly string[]).includes(effective)) {
        return false
    }
    return (TALOS_MOTION_RUNTIME_MODE_PAIR_MATRIX[requested as TalosMotionRuntimeRequestedMode] as readonly string[])
        .includes(effective)
}

export type TalosMotionRuntimeReason =
    | 'requested'
    | 'os_reduced_motion'
    | 'workspace_policy'
    | 'background_disabled'
    | 'hidden_document'
    | 'data_saver'
    | 'performance_degraded'
    | 'renderer_fault'

export type TalosMotionRuntimeEnvironment = Readonly<{
    workspaceBackgroundAllowed: boolean
    workspaceInterfaceMotionAllowed: boolean
    prefersReducedMotion: boolean
    documentHidden: boolean
    saveData: boolean
    rendererFault: boolean
    failedEffectiveMode: MotionTelemetryEffectiveMode | null
    frameP95Ms: number | null
    frameSampleSufficient: boolean
}>

export type TalosMotionRuntimeDecision = Readonly<{
    requestedMode: TalosMotionRuntimeRequestedMode
    effectiveMode: TalosMotionRuntimeEffectiveMode
    uiMotionEnabled: boolean
    backgroundEnabled: boolean
    reducedMotionApplied: boolean
    qualityTier: TalosMotionRuntimeQualityTier
    fpsCap: number
    dprCap: number
    densityScale: number
    paused: boolean
    reason: TalosMotionRuntimeReason
    degradationStage: number
}>

export type TalosMotionRuntimeControllerSnapshot = Readonly<{
    degradationStage: number
    overBudgetWindows: number
    stableWindows: number
}>

export type TalosMotionRuntimePolicyController = Readonly<{
    resolve: (
        preferences: TalosMotionV6Preferences,
        environment: TalosMotionRuntimeEnvironment,
    ) => TalosMotionRuntimeDecision
    reset: () => void
    snapshot: () => TalosMotionRuntimeControllerSnapshot
}>

type MutableDecision = {
    requestedMode: TalosMotionRuntimeRequestedMode
    effectiveMode: TalosMotionRuntimeEffectiveMode
    uiMotionEnabled: boolean
    backgroundEnabled: boolean
    reducedMotionApplied: boolean
    qualityTier: TalosMotionRuntimeQualityTier
    fpsCap: number
    dprCap: number
    densityScale: number
    paused: boolean
    reason: TalosMotionRuntimeReason
    degradationStage: number
}

const PROFILE_CAPS: Record<TalosMotionRuntimeQualityTier, Readonly<{
    fps: number
    dpr: number
    density: number
}>> = Object.freeze({
    low: Object.freeze({ fps: 20, dpr: 1, density: 0.55 }),
    balanced: Object.freeze({ fps: 30, dpr: 1.25, density: 1 }),
    high: Object.freeze({ fps: 45, dpr: 1.5, density: 1.25 }),
})

const PERFORMANCE_BUDGET_MS = 12
const DEGRADE_AFTER_WINDOWS = 3
const RECOVER_AFTER_WINDOWS = 8
const MAX_DEGRADATION_STAGE = 5

function lowerAllowlistedCap<T extends number>(
    values: readonly T[],
    current: number,
): number {
    let lower: number | undefined
    for (const value of values) {
        if (value < current && (lower === undefined || value > lower)) lower = value
    }
    return lower ?? current
}

function qualityTierFor(preferences: TalosMotionV6Preferences): TalosMotionRuntimeQualityTier {
    return preferences.quality === 'adaptive' ? 'balanced' : preferences.quality
}

function oneLevelLowerTier(tier: TalosMotionRuntimeQualityTier): TalosMotionRuntimeQualityTier {
    if (tier === 'high') return 'balanced'
    if (tier === 'balanced') return 'low'
    return 'low'
}

function adaptiveModeFor(
    requestedMode: TalosMotionRuntimeRequestedMode,
    qualityTier: TalosMotionRuntimeQualityTier,
): TalosMotionRuntimeEffectiveMode {
    if (requestedMode === 'off') return 'off'
    if (requestedMode === 'static') return 'static'
    if (requestedMode === 'simple') return 'simple'
    if (requestedMode === 'complex') return 'complex'
    return qualityTier === 'low' ? 'simple' : 'complex'
}

function rendererFallback(mode: MotionTelemetryEffectiveMode): TalosMotionRuntimeEffectiveMode {
    if (mode === 'complex') return 'simple'
    if (mode === 'simple') return 'static'
    if (mode === 'static') return 'off'
    return 'off'
}

function performanceRendererFallback(mode: TalosMotionRuntimeEffectiveMode): TalosMotionRuntimeEffectiveMode {
    if (mode === 'complex') return 'simple'
    if (mode === 'simple') return 'static'
    return mode
}

function validStage(value: number): number {
    if (!Number.isFinite(value)) return 0
    return Math.min(MAX_DEGRADATION_STAGE, Math.max(0, Math.trunc(value)))
}

function hasBackgroundMotion(mode: TalosMotionRuntimeEffectiveMode): boolean {
    return mode !== 'off'
}

function resolveWithStage(
    preferences: TalosMotionV6Preferences,
    environment: TalosMotionRuntimeEnvironment,
    requestedStage: number,
): TalosMotionRuntimeDecision {
    const requestedMode = preferences.mode
    const workspaceBackgroundAllowed = environment.workspaceBackgroundAllowed === true
    const workspaceInterfaceAllowed = environment.workspaceInterfaceMotionAllowed === true
    const workspacePolicyDenied = !workspaceBackgroundAllowed || !workspaceInterfaceAllowed
    const backgroundPreferenceEnabled = preferences.background_enabled && requestedMode !== 'off'
    const backgroundPolicyDenied = !workspaceBackgroundAllowed
    const backgroundDisabled = !preferences.background_enabled

    let qualityTier = qualityTierFor(preferences)
    let effectiveMode = adaptiveModeFor(requestedMode, qualityTier)
    let reducedMotionApplied = false
    const paused = preferences.pause_when_hidden && environment.documentHidden

    if (backgroundPolicyDenied || backgroundDisabled) {
        effectiveMode = 'off'
    } else if (requestedMode === 'off') {
        effectiveMode = 'off'
    } else if (environment.prefersReducedMotion) {
        effectiveMode = 'static'
        reducedMotionApplied = true
    } else if (!paused && preferences.respect_data_saver && environment.saveData) {
        qualityTier = 'low'
        if (effectiveMode === 'complex') effectiveMode = 'simple'
    } else if (!paused && environment.rendererFault) {
        const failedMode = environment.failedEffectiveMode ?? effectiveMode
        effectiveMode = rendererFallback(failedMode)
    }

    const stage = effectiveMode === 'off' || effectiveMode === 'static'
        ? 0
        : validStage(requestedStage)
    const baseTier = qualityTier
    if (stage >= 3) qualityTier = oneLevelLowerTier(baseTier)

    if (requestedMode === 'adaptive' && stage >= 3) {
        effectiveMode = adaptiveModeFor(requestedMode, qualityTier)
    }

    const profile = PROFILE_CAPS[qualityTier]
    const effectiveBaseFpsCap = qualityTier === 'high'
        ? preferences.fps_cap
        : Math.min(profile.fps, preferences.fps_cap)
    const effectiveBaseDprCap = qualityTier === 'high'
        ? preferences.dpr_cap
        : Math.min(profile.dpr, preferences.dpr_cap)
    let fpsCap = effectiveBaseFpsCap
    let dprCap = effectiveBaseDprCap
    const densityScale = stage >= 1
        ? Number((profile.density * 0.8).toFixed(2))
        : profile.density

    if (stage >= 2) {
        dprCap = lowerAllowlistedCap(TALOS_MOTION_DPR_CAPS, effectiveBaseDprCap)
    }
    if (stage >= 3) {
        fpsCap = lowerAllowlistedCap(TALOS_MOTION_FPS_CAPS, effectiveBaseFpsCap)
    }
    if (stage >= 4) effectiveMode = performanceRendererFallback(effectiveMode)
    if (stage >= 5 && effectiveMode !== 'off') effectiveMode = 'static'

    const uiMotionEnabled = workspaceInterfaceAllowed
        && preferences.interface_enabled
        && preferences.interface.profile !== 'off'
        && !environment.prefersReducedMotion
        && !paused
        && !(preferences.respect_data_saver && environment.saveData)

    const backgroundEnabled = backgroundPreferenceEnabled
        && workspaceBackgroundAllowed
        && hasBackgroundMotion(effectiveMode)

    let reason: TalosMotionRuntimeReason
    if (workspacePolicyDenied) reason = 'workspace_policy'
    else if (backgroundDisabled) reason = 'background_disabled'
    else if (requestedMode === 'off') reason = 'requested'
    else if (environment.prefersReducedMotion) reason = 'os_reduced_motion'
    else if (paused) reason = 'hidden_document'
    else if (preferences.respect_data_saver && environment.saveData) reason = 'data_saver'
    else if (environment.rendererFault) reason = 'renderer_fault'
    else if (stage > 0) reason = 'performance_degraded'
    else reason = 'requested'

    const decision: MutableDecision = {
        requestedMode,
        effectiveMode,
        uiMotionEnabled,
        backgroundEnabled,
        reducedMotionApplied,
        qualityTier,
        fpsCap,
        dprCap,
        densityScale,
        paused,
        reason,
        degradationStage: stage,
    }

    return Object.freeze({ ...decision })
}

export function resolveTalosMotionRuntimePolicy(
    preferences: TalosMotionV6Preferences,
    environment: TalosMotionRuntimeEnvironment,
    degradationStage = 0,
): TalosMotionRuntimeDecision {
    return resolveWithStage(preferences, environment, degradationStage)
}

function usableForPerformance(
    preferences: TalosMotionV6Preferences,
    environment: TalosMotionRuntimeEnvironment,
): string | null {
    if (!preferences.background_enabled
        || preferences.mode === 'off'
        || preferences.mode === 'static'
        || !environment.workspaceBackgroundAllowed
        || environment.prefersReducedMotion
        || (preferences.pause_when_hidden && environment.documentHidden)
        || (preferences.respect_data_saver && environment.saveData)
        || environment.rendererFault) {
        return null
    }

    const initial = resolveWithStage(preferences, environment, 0)
    if (initial.effectiveMode !== 'complex' && initial.effectiveMode !== 'simple') return null
    return `${preferences.mode}:${preferences.quality}:${initial.effectiveMode}`
}

export function createTalosMotionRuntimePolicyController(): TalosMotionRuntimePolicyController {
    let degradationStage = 0
    let overBudgetWindows = 0
    let stableWindows = 0
    let lastUsableSignature: string | null = null

    const snapshot = (): TalosMotionRuntimeControllerSnapshot => Object.freeze({
        degradationStage,
        overBudgetWindows,
        stableWindows,
    })

    const resolve = (
        preferences: TalosMotionV6Preferences,
        environment: TalosMotionRuntimeEnvironment,
    ): TalosMotionRuntimeDecision => {
        const usableSignature = usableForPerformance(preferences, environment)
        if (usableSignature === null) {
            degradationStage = 0
            overBudgetWindows = 0
            stableWindows = 0
            lastUsableSignature = null
            return resolveWithStage(preferences, environment, 0)
        }

        if (lastUsableSignature !== null && lastUsableSignature !== usableSignature) {
            degradationStage = 0
            overBudgetWindows = 0
            stableWindows = 0
        }
        lastUsableSignature = usableSignature

        if (environment.frameSampleSufficient
            && environment.frameP95Ms !== null
            && Number.isFinite(environment.frameP95Ms)
            && environment.frameP95Ms >= 0) {
            if (environment.frameP95Ms > PERFORMANCE_BUDGET_MS) {
                overBudgetWindows += 1
                stableWindows = 0
                if (overBudgetWindows >= DEGRADE_AFTER_WINDOWS) {
                    degradationStage = Math.min(MAX_DEGRADATION_STAGE, degradationStage + 1)
                    overBudgetWindows = 0
                }
            } else if (environment.frameP95Ms <= PERFORMANCE_BUDGET_MS) {
                stableWindows += 1
                overBudgetWindows = 0
                if (stableWindows >= RECOVER_AFTER_WINDOWS && degradationStage > 0) {
                    degradationStage -= 1
                    stableWindows = 0
                }
            }
        } else {
            overBudgetWindows = 0
            stableWindows = 0
        }

        return resolveWithStage(preferences, environment, degradationStage)
    }

    const reset = (): void => {
        degradationStage = 0
        overBudgetWindows = 0
        stableWindows = 0
        lastUsableSignature = null
    }

    return Object.freeze({ resolve, reset, snapshot })
}

import { describe, expect, it } from 'vitest'
import { createDefaultTalosMotionV6Preferences } from './defaults'
import {
    createTalosMotionRuntimeGovernor,
    type TalosMotionRuntimeGovernor,
} from './runtimeGovernor'
import { resolveTalosMotionRuntimePolicy, type TalosMotionRuntimeEnvironment } from './runtimePolicy'

const environment: TalosMotionRuntimeEnvironment = {
    workspaceBackgroundAllowed: true,
    workspaceInterfaceMotionAllowed: true,
    prefersReducedMotion: false,
    documentHidden: false,
    saveData: false,
    rendererFault: false,
    failedEffectiveMode: null,
    frameP95Ms: null,
    frameSampleSufficient: false,
}

function recordWindow(
    governor: TalosMotionRuntimeGovernor,
    startTimestamp: number,
    frameCostMs: number,
): void {
    expect(governor.recordFrame({ timestampMs: startTimestamp, frameCostMs, primitiveCount: 120 })).toBe(false)
    expect(governor.recordFrame({ timestampMs: startTimestamp + 1, frameCostMs, primitiveCount: 120 })).toBe(true)
}

describe('TALOS Motion V6 runtime governor', () => {
    it('degrades only after complete over-budget sample windows and recovers with longer hysteresis', () => {
        const preferences = createDefaultTalosMotionV6Preferences()
        preferences.mode = 'adaptive'
        preferences.quality = 'balanced'
        const governor = createTalosMotionRuntimeGovernor({ frameSampleWindow: 2 })

        for (let window = 0; window < 2; window += 1) {
            recordWindow(governor, window * 10, 13)
            expect(governor.resolve(preferences, environment, 'forge:adaptive').degradationStage).toBe(0)
        }
        recordWindow(governor, 20, 13)
        expect(governor.resolve(preferences, environment, 'forge:adaptive')).toMatchObject({
            degradationStage: 1,
            lastFrameP95Ms: 13,
        })

        for (let window = 0; window < 7; window += 1) {
            expect(governor.recordStableWindow({ eventLoopDelayMs: 2 })).toBe(true)
            expect(governor.resolve(preferences, environment, 'forge:adaptive').degradationStage).toBe(1)
        }
        expect(governor.recordStableWindow({ eventLoopDelayMs: 2 })).toBe(true)
        expect(governor.resolve(preferences, environment, 'forge:adaptive').degradationStage).toBe(0)
    })

    it('quarantines a failed renderer for the current configuration and retries only after configuration changes', () => {
        const preferences = createDefaultTalosMotionV6Preferences()
        preferences.mode = 'adaptive'
        const governor = createTalosMotionRuntimeGovernor({ frameSampleWindow: 2 })

        expect(governor.recordRendererFault('complex', 'forge:adaptive')).toBe(true)
        expect(governor.recordRendererFault('complex', 'forge:adaptive')).toBe(false)
        const failed = governor.resolve(preferences, environment, 'forge:adaptive')
        expect(failed).toMatchObject({
            degradationStage: 0,
            rendererFault: true,
            failedEffectiveMode: 'complex',
        })
        expect(resolveTalosMotionRuntimePolicy(preferences, failed.environment, failed.degradationStage)).toMatchObject({
            effectiveMode: 'simple',
            reason: 'renderer_fault',
        })

        const retried = governor.resolve(preferences, environment, 'signal:adaptive')
        expect(retried).toMatchObject({ rendererFault: false, failedEffectiveMode: null, degradationStage: 0 })
        expect(resolveTalosMotionRuntimePolicy(preferences, retried.environment, retried.degradationStage).effectiveMode).toBe('complex')
    })

    it('resets pending telemetry in unusable contexts and rejects work after disposal', () => {
        const preferences = createDefaultTalosMotionV6Preferences()
        const governor = createTalosMotionRuntimeGovernor({ frameSampleWindow: 2 })
        recordWindow(governor, 0, 13)

        const hidden = governor.resolve(preferences, { ...environment, documentHidden: true }, 'forge:adaptive')
        expect(hidden).toMatchObject({ degradationStage: 0, pendingPerformanceWindows: 0 })

        governor.dispose()
        expect(governor.recordFrame({ timestampMs: 2, frameCostMs: 1, primitiveCount: 1 })).toBe(false)
        expect(governor.recordStableWindow({ eventLoopDelayMs: 2 })).toBe(false)
        expect(governor.recordRendererFault('complex', 'forge:adaptive')).toBe(false)
        expect(governor.snapshot().disposed).toBe(true)
    })

    it('rejects malformed or overloaded recovery probes instead of treating elapsed time as stability', () => {
        const governor = createTalosMotionRuntimeGovernor({ frameSampleWindow: 2 })
        const preferences = createDefaultTalosMotionV6Preferences()
        preferences.mode = 'adaptive'
        for (let window = 0; window < 3; window += 1) {
            recordWindow(governor, window * 10, 13)
            governor.resolve(preferences, environment, 'forge:adaptive')
        }
        expect(governor.snapshot().degradationStage).toBe(1)

        expect(governor.recordStableWindow({ eventLoopDelayMs: 9 })).toBe(false)
        expect(governor.recordStableWindow({ eventLoopDelayMs: Number.NaN })).toBe(false)
        expect(governor.recordStableWindow({ eventLoopDelayMs: -1 })).toBe(false)
        expect(governor.recordStableWindow({ eventLoopDelayMs: 3 })).toBe(true)
        expect(governor.snapshot()).toMatchObject({ pendingPerformanceWindows: 1, lastFrameP95Ms: 3 })
    })

    it('locks automatic recovery after a measured probe falls back out of budget', () => {
        const governor = createTalosMotionRuntimeGovernor({ frameSampleWindow: 2 })
        const preferences = createDefaultTalosMotionV6Preferences()
        preferences.mode = 'adaptive'

        for (let window = 0; window < 12; window += 1) {
            recordWindow(governor, window * 10, 13)
            governor.resolve(preferences, environment, 'forge:adaptive')
        }
        expect(governor.snapshot()).toMatchObject({ degradationStage: 4, recoveryLocked: false })

        for (let window = 0; window < 8; window += 1) {
            expect(governor.recordStableWindow({ eventLoopDelayMs: 2 })).toBe(true)
            governor.resolve(preferences, environment, 'forge:adaptive')
        }
        expect(governor.snapshot()).toMatchObject({ degradationStage: 3, recoveryLocked: false })

        for (let window = 0; window < 3; window += 1) {
            recordWindow(governor, 200 + (window * 10), 13)
            governor.resolve(preferences, environment, 'forge:adaptive')
        }
        expect(governor.snapshot()).toMatchObject({ degradationStage: 4, recoveryLocked: true })
        expect(governor.recordStableWindow({ eventLoopDelayMs: 1 })).toBe(false)

        governor.resolve(preferences, environment, 'signal:adaptive')
        expect(governor.snapshot()).toMatchObject({ degradationStage: 0, recoveryLocked: false })
    })
})

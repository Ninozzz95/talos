import { describe, expect, it } from 'vitest'
import {
    createTalosMotionRuntimePolicyController,
    isTalosMotionRuntimeModePair,
    resolveTalosMotionRuntimePolicy,
    TALOS_MOTION_RUNTIME_EFFECTIVE_MODES,
    TALOS_MOTION_RUNTIME_MODE_PAIR_MATRIX,
    TALOS_MOTION_RUNTIME_REQUESTED_MODES,
    type TalosMotionRuntimeEnvironment,
} from './runtimePolicy'
import { createDefaultTalosMotionV6Preferences } from './defaults'
import type { TalosMotionV6Preferences } from './contracts'

function preferences(
    patch: Partial<TalosMotionV6Preferences> = {},
): TalosMotionV6Preferences {
    const base = createDefaultTalosMotionV6Preferences()
    return {
        ...base,
        ...patch,
        interface: {
            ...base.interface,
            ...patch.interface,
            categories: {
                ...base.interface.categories,
                ...patch.interface?.categories,
            },
        },
    }
}

function environment(
    patch: Partial<TalosMotionRuntimeEnvironment> = {},
): TalosMotionRuntimeEnvironment {
    return {
        workspaceBackgroundAllowed: true,
        workspaceInterfaceMotionAllowed: true,
        prefersReducedMotion: false,
        documentHidden: false,
        saveData: false,
        rendererFault: false,
        failedEffectiveMode: null,
        frameP95Ms: 8,
        frameSampleSufficient: true,
        ...patch,
    }
}

describe('V6 runtime policy', () => {
    it('exports the exhaustive requested/effective mode-pair authority', () => {
        const expected = {
            off: ['off'],
            static: ['static', 'off'],
            simple: ['simple', 'static', 'off'],
            complex: ['complex', 'simple', 'static', 'off'],
            adaptive: ['complex', 'simple', 'static', 'off'],
        } as const

        expect(TALOS_MOTION_RUNTIME_MODE_PAIR_MATRIX).toEqual(expected)
        for (const requested of TALOS_MOTION_RUNTIME_REQUESTED_MODES) {
            for (const effective of TALOS_MOTION_RUNTIME_EFFECTIVE_MODES) {
                expect(isTalosMotionRuntimeModePair(requested, effective), `${requested} -> ${effective}`)
                    .toBe((expected[requested] as readonly string[]).includes(effective))
            }
        }
        expect(isTalosMotionRuntimeModePair('invalid', 'off')).toBe(false)
        expect(isTalosMotionRuntimeModePair('complex', 'invalid')).toBe(false)
    })

    it.each([
        ['off', 'off'],
        ['static', 'static'],
        ['simple', 'simple'],
        ['complex', 'complex'],
    ] as const)('resolves requested %s', (mode, effectiveMode) => {
        const decision = resolveTalosMotionRuntimePolicy(preferences({ mode }), environment())

        expect(decision.requestedMode).toBe(mode)
        expect(decision.effectiveMode).toBe(effectiveMode)
        expect(decision.reason).toBe('requested')
    })

    it.each([
        ['low', 'simple'],
        ['balanced', 'complex'],
        ['high', 'complex'],
    ] as const)('maps adaptive quality %s to %s', (quality, effectiveMode) => {
        const decision = resolveTalosMotionRuntimePolicy(
            preferences({ mode: 'adaptive', quality }),
            environment(),
        )

        expect(decision.effectiveMode).toBe(effectiveMode)
        expect(decision.qualityTier).toBe(quality)
        expect(decision.effectiveMode).not.toBe('adaptive' as never)
        expect(decision.qualityTier).not.toBe('adaptive' as never)
    })

    it('normalizes adaptive quality to balanced without exposing adaptive output', () => {
        const decision = resolveTalosMotionRuntimePolicy(
            preferences({ mode: 'complex', quality: 'adaptive' }),
            environment(),
        )

        expect(decision.qualityTier).toBe('balanced')
        expect(decision.effectiveMode).not.toBe('adaptive' as never)
        expect(decision.qualityTier).not.toBe('adaptive' as never)
    })

    it('keeps background and interface capabilities independent', () => {
        const decision = resolveTalosMotionRuntimePolicy(
            preferences({ mode: 'complex', background_enabled: false, interface_enabled: true }),
            environment(),
        )

        expect(decision.effectiveMode).toBe('off')
        expect(decision.backgroundEnabled).toBe(false)
        expect(decision.uiMotionEnabled).toBe(true)
        expect(decision.reason).toBe('background_disabled')
    })

    it('disables only UI motion for interface off and profile off', () => {
        for (const patch of [
            { interface_enabled: false },
            { interface: { profile: 'off' } as TalosMotionV6Preferences['interface'] },
        ]) {
            const decision = resolveTalosMotionRuntimePolicy(
                preferences({ mode: 'complex', ...patch }),
                environment(),
            )

            expect(decision.effectiveMode).toBe('complex')
            expect(decision.backgroundEnabled).toBe(true)
            expect(decision.uiMotionEnabled).toBe(false)
        }
    })

    it('applies workspace capabilities independently and fail-closed', () => {
        const backgroundDenied = resolveTalosMotionRuntimePolicy(
            preferences({ mode: 'complex' }),
            environment({ workspaceBackgroundAllowed: false }),
        )
        const interfaceDenied = resolveTalosMotionRuntimePolicy(
            preferences({ mode: 'complex' }),
            environment({ workspaceInterfaceMotionAllowed: false }),
        )

        expect(backgroundDenied.effectiveMode).toBe('off')
        expect(backgroundDenied.backgroundEnabled).toBe(false)
        expect(backgroundDenied.uiMotionEnabled).toBe(true)
        expect(backgroundDenied.reason).toBe('workspace_policy')
        expect(interfaceDenied.effectiveMode).toBe('complex')
        expect(interfaceDenied.backgroundEnabled).toBe(true)
        expect(interfaceDenied.uiMotionEnabled).toBe(false)
        expect(interfaceDenied.reason).toBe('workspace_policy')
    })

    it('gives reduced motion priority over hidden, data saver and faults', () => {
        const decision = resolveTalosMotionRuntimePolicy(
            preferences({ mode: 'complex' }),
            environment({
                prefersReducedMotion: true,
                documentHidden: true,
                saveData: true,
                rendererFault: true,
                failedEffectiveMode: 'complex',
            }),
        )

        expect(decision.effectiveMode).toBe('static')
        expect(decision.uiMotionEnabled).toBe(false)
        expect(decision.reducedMotionApplied).toBe(true)
        expect(decision.paused).toBe(true)
        expect(decision.reason).toBe('os_reduced_motion')
    })

    it('pauses hidden documents only when pause_when_hidden is enabled', () => {
        const decision = resolveTalosMotionRuntimePolicy(
            preferences({ mode: 'complex', pause_when_hidden: true }),
            environment({ documentHidden: true }),
        )
        const notPaused = resolveTalosMotionRuntimePolicy(
            preferences({ mode: 'complex', pause_when_hidden: false }),
            environment({ documentHidden: true }),
        )

        expect(decision.paused).toBe(true)
        expect(decision.uiMotionEnabled).toBe(false)
        expect(decision.effectiveMode).toBe('complex')
        expect(decision.reason).toBe('hidden_document')
        expect(notPaused.paused).toBe(false)
        expect(notPaused.uiMotionEnabled).toBe(true)
        expect(notPaused.reason).toBe('requested')
    })

    it('applies data saver only when requested and caps adaptive complexity', () => {
        const ignored = resolveTalosMotionRuntimePolicy(
            preferences({ mode: 'adaptive', respect_data_saver: false }),
            environment({ saveData: true }),
        )
        const applied = resolveTalosMotionRuntimePolicy(
            preferences({ mode: 'adaptive', respect_data_saver: true }),
            environment({ saveData: true }),
        )

        expect(ignored.effectiveMode).toBe('complex')
        expect(ignored.uiMotionEnabled).toBe(true)
        expect(applied.effectiveMode).toBe('simple')
        expect(applied.qualityTier).toBe('low')
        expect(applied.uiMotionEnabled).toBe(false)
        expect(applied.reason).toBe('data_saver')
    })

    it.each([
        ['complex', 'complex', 'simple'],
        ['simple', 'simple', 'static'],
        ['static', 'static', 'off'],
        ['off', 'off', 'off'],
    ] as const)('falls back from %s on a renderer fault', (requestedMode, failedMode, fallback) => {
        const decision = resolveTalosMotionRuntimePolicy(
            preferences({ mode: requestedMode }),
            environment({ rendererFault: true, failedEffectiveMode: failedMode }),
        )

        expect(decision.effectiveMode).toBe(fallback)
        expect(decision.reason).toBe(requestedMode === 'off' ? 'requested' : 'renderer_fault')
    })

    it('uses profile caps and user caps by minimum', () => {
        const decision = resolveTalosMotionRuntimePolicy(
            preferences({ quality: 'high', fps_cap: 30, dpr_cap: 1.25 }),
            environment(),
        )

        expect(decision.qualityTier).toBe('high')
        expect(decision.fpsCap).toBe(30)
        expect(decision.dprCap).toBe(1.25)
    })

    it.each([
        ['low', 0, 0.55, 0.44],
        ['balanced', 0, 1, 0.8],
        ['high', 0, 1.25, 1],
    ] as const)('uses density profile %s and stage-one multiplier', (quality, stage, base, degraded) => {
        expect(resolveTalosMotionRuntimePolicy(
            preferences({ mode: 'complex', quality }),
            environment(),
            stage,
        ).densityScale).toBe(base)
        expect(resolveTalosMotionRuntimePolicy(
            preferences({ mode: 'complex', quality }),
            environment(),
            1,
        ).densityScale).toBe(degraded)
    })

    it('uses high advanced caps at stage zero and lowers exact allowlisted caps later', () => {
        const high = preferences({ mode: 'complex', quality: 'high', fps_cap: 60, dpr_cap: 2 })

        expect(resolveTalosMotionRuntimePolicy(high, environment())).toMatchObject({
            qualityTier: 'high',
            fpsCap: 60,
            dprCap: 2,
        })
        expect(resolveTalosMotionRuntimePolicy(high, environment(), 2)).toMatchObject({
            qualityTier: 'high',
            fpsCap: 60,
            dprCap: 1.5,
        })
        expect(resolveTalosMotionRuntimePolicy(high, environment(), 3)).toMatchObject({
            qualityTier: 'balanced',
            fpsCap: 24,
            dprCap: 1,
        })
    })

    it('keeps low and balanced target caps while adaptive remains balanced', () => {
        expect(resolveTalosMotionRuntimePolicy(
            preferences({ mode: 'complex', quality: 'low', fps_cap: 60, dpr_cap: 2 }),
            environment(),
        )).toMatchObject({ qualityTier: 'low', fpsCap: 20, dprCap: 1 })
        expect(resolveTalosMotionRuntimePolicy(
            preferences({ mode: 'complex', quality: 'balanced', fps_cap: 60, dpr_cap: 2 }),
            environment(),
        )).toMatchObject({ qualityTier: 'balanced', fpsCap: 30, dprCap: 1.25 })
        expect(resolveTalosMotionRuntimePolicy(
            preferences({ mode: 'complex', quality: 'adaptive', fps_cap: 60, dpr_cap: 2 }),
            environment(),
        )).toMatchObject({ qualityTier: 'balanced', fpsCap: 30, dprCap: 1.25 })
    })

    it('recalculates adaptive effective mode after a tier degradation', () => {
        const adaptiveBalanced = preferences({ mode: 'adaptive', quality: 'balanced' })
        const adaptiveHigh = preferences({ mode: 'adaptive', quality: 'high' })
        const manualComplex = preferences({ mode: 'complex', quality: 'balanced' })

        expect(resolveTalosMotionRuntimePolicy(adaptiveBalanced, environment(), 3)).toMatchObject({
            effectiveMode: 'simple',
            qualityTier: 'low',
        })
        expect(resolveTalosMotionRuntimePolicy(adaptiveHigh, environment(), 3)).toMatchObject({
            effectiveMode: 'complex',
            qualityTier: 'balanced',
        })
        expect(resolveTalosMotionRuntimePolicy(manualComplex, environment(), 3).effectiveMode)
            .toBe('complex')
        expect(resolveTalosMotionRuntimePolicy(manualComplex, environment(), 4).effectiveMode)
            .toBe('simple')
    })

    it.each([
        [0, 'complex', 'balanced', 1, 30, 1.25],
        [1, 'complex', 'balanced', 0.8, 30, 1.25],
        [2, 'complex', 'balanced', 0.8, 30, 1],
        [3, 'complex', 'low', 0.44, 20, 1],
        [4, 'simple', 'low', 0.44, 20, 1],
        [5, 'static', 'low', 0.44, 20, 1],
    ] as const)('manual complex stage table %s', (stage, effectiveMode, qualityTier, densityScale, fpsCap, dprCap) => {
        expect(resolveTalosMotionRuntimePolicy(
            preferences({ mode: 'complex', quality: 'balanced' }),
            environment(),
            stage,
        )).toMatchObject({ effectiveMode, qualityTier, densityScale, fpsCap, dprCap, degradationStage: stage })
    })

    it.each([
        [0, 'complex', 'balanced', 1, 30, 1.25],
        [1, 'complex', 'balanced', 0.8, 30, 1.25],
        [2, 'complex', 'balanced', 0.8, 30, 1],
        [3, 'simple', 'low', 0.44, 20, 1],
        [4, 'static', 'low', 0.44, 20, 1],
        [5, 'static', 'low', 0.44, 20, 1],
    ] as const)('adaptive balanced stage table %s', (stage, effectiveMode, qualityTier, densityScale, fpsCap, dprCap) => {
        const decision = resolveTalosMotionRuntimePolicy(
            preferences({ mode: 'adaptive', quality: 'balanced' }),
            environment(),
            stage,
        )

        expect(decision).toMatchObject({
            effectiveMode,
            qualityTier,
            densityScale,
            fpsCap,
            dprCap,
            degradationStage: stage,
        })
        expect(decision.effectiveMode).not.toBe('adaptive' as never)
        expect(decision.qualityTier).not.toBe('adaptive' as never)
    })

    it('degrades after exactly three valid over-budget windows', () => {
        const controller = createTalosMotionRuntimePolicyController()
        const input = environment({ frameP95Ms: 13 })

        expect(controller.resolve(preferences({ mode: 'complex' }), input).degradationStage).toBe(0)
        expect(controller.resolve(preferences({ mode: 'complex' }), input).degradationStage).toBe(0)
        expect(controller.resolve(preferences({ mode: 'complex' }), input).degradationStage).toBe(1)
        expect(controller.resolve(preferences({ mode: 'complex' }), input).reason).toBe('performance_degraded')
    })

    it('does not advance on insufficient or non-finite samples', () => {
        const controller = createTalosMotionRuntimePolicyController()
        const over = environment({ frameP95Ms: 13 })

        controller.resolve(preferences(), over)
        controller.resolve(preferences(), environment({ frameP95Ms: Number.NaN }))
        controller.resolve(preferences(), environment({ frameP95Ms: null }))
        controller.resolve(preferences(), environment({ frameP95Ms: 13, frameSampleSufficient: false }))
        expect(controller.resolve(preferences(), over).degradationStage).toBe(0)
    })

    it('rejects negative samples and interrupts over/stable streaks at every gap', () => {
        const controller = createTalosMotionRuntimePolicyController()
        const over = environment({ frameP95Ms: 13 })

        controller.resolve(preferences({ mode: 'complex' }), over)
        controller.resolve(preferences({ mode: 'complex' }), over)
        controller.resolve(preferences({ mode: 'complex' }), environment({ frameP95Ms: -1 }))
        expect(controller.resolve(preferences({ mode: 'complex' }), over).degradationStage).toBe(0)
        expect(controller.snapshot()).toMatchObject({ overBudgetWindows: 1, stableWindows: 0 })
    })

    it('resets stage and streaks when the performance base becomes unusable', () => {
        const controller = createTalosMotionRuntimePolicyController()
        const over = environment({ frameP95Ms: 13 })
        const contexts = [
            environment({ workspaceBackgroundAllowed: false }),
            environment({ prefersReducedMotion: true }),
            environment({ documentHidden: true }),
            environment({ saveData: true }),
            environment({ rendererFault: true, failedEffectiveMode: 'complex' }),
        ] as const

        for (const context of contexts) {
            const local = createTalosMotionRuntimePolicyController()
            for (let i = 0; i < 3; i += 1) local.resolve(preferences({ mode: 'complex' }), over)
            expect(local.snapshot().degradationStage).toBe(1)
            local.resolve(preferences({ mode: 'complex' }), context)
            expect(local.snapshot()).toEqual({
                degradationStage: 0,
                overBudgetWindows: 0,
                stableWindows: 0,
            })
        }
    })

    it('does not inherit stage across a mode change from off to complex', () => {
        const controller = createTalosMotionRuntimePolicyController()
        const over = environment({ frameP95Ms: 13 })

        for (let i = 0; i < 3; i += 1) controller.resolve(preferences({ mode: 'complex' }), over)
        expect(controller.snapshot().degradationStage).toBe(1)
        controller.resolve(preferences({ mode: 'off' }), environment({ frameP95Ms: 8 }))
        expect(controller.snapshot().degradationStage).toBe(0)
        expect(controller.resolve(preferences({ mode: 'complex' }), environment({ frameP95Ms: 8 })))
            .toMatchObject({ degradationStage: 0, effectiveMode: 'complex' })
    })

    it('degrades the background while UI capability or UI preference is off', () => {
        const cases = [
            { preferences: { interface_enabled: false }, environment: {} },
            { preferences: { interface: { profile: 'off' } as TalosMotionV6Preferences['interface'] }, environment: {} },
            { preferences: {}, environment: { workspaceInterfaceMotionAllowed: false } },
        ] as const

        for (const current of cases) {
            const controller = createTalosMotionRuntimePolicyController()
            const over = environment({ ...current.environment, frameP95Ms: 13 })
            const currentPreferences = preferences({ mode: 'complex', ...current.preferences })

            controller.resolve(currentPreferences, over)
            controller.resolve(currentPreferences, over)
            const third = controller.resolve(currentPreferences, over)

            expect(third).toMatchObject({
                effectiveMode: 'complex',
                backgroundEnabled: true,
                uiMotionEnabled: false,
                degradationStage: 1,
            })
        }
    })

    it('requires eight consecutive stable windows after a gap to recover', () => {
        const controller = createTalosMotionRuntimePolicyController()
        const over = environment({ frameP95Ms: 13 })
        const stable = environment({ frameP95Ms: 12 })

        for (let i = 0; i < 3; i += 1) controller.resolve(preferences({ mode: 'complex' }), over)
        for (let i = 0; i < 7; i += 1) controller.resolve(preferences({ mode: 'complex' }), stable)
        expect(controller.snapshot()).toMatchObject({ degradationStage: 1, stableWindows: 7 })
        controller.resolve(preferences({ mode: 'complex' }), environment({ frameP95Ms: null }))
        expect(controller.snapshot()).toMatchObject({ degradationStage: 1, stableWindows: 0 })
        expect(controller.resolve(preferences({ mode: 'complex' }), stable).degradationStage).toBe(1)
        for (let i = 0; i < 6; i += 1) controller.resolve(preferences({ mode: 'complex' }), stable)
        expect(controller.snapshot().degradationStage).toBe(1)
        expect(controller.resolve(preferences({ mode: 'complex' }), stable).degradationStage).toBe(0)
    })

    it.each([
        ['workspace_policy', {}, { workspaceInterfaceMotionAllowed: false }, 0],
        ['background_disabled', { background_enabled: false }, {
            prefersReducedMotion: true,
            documentHidden: true,
            saveData: true,
            rendererFault: true,
            failedEffectiveMode: 'complex',
        }, 0],
        ['requested', { mode: 'off' }, {
            prefersReducedMotion: true,
            documentHidden: true,
            saveData: true,
            rendererFault: true,
            failedEffectiveMode: 'complex',
        }, 0],
        ['os_reduced_motion', {}, {
            prefersReducedMotion: true,
            documentHidden: true,
            saveData: true,
            rendererFault: true,
            failedEffectiveMode: 'complex',
        }, 0],
        ['hidden_document', {}, {
            documentHidden: true,
            saveData: true,
            rendererFault: true,
            failedEffectiveMode: 'complex',
        }, 0],
        ['data_saver', {}, {
            saveData: true,
            rendererFault: true,
            failedEffectiveMode: 'complex',
        }, 0],
        ['renderer_fault', {}, {
            rendererFault: true,
            failedEffectiveMode: 'complex',
        }, 0],
        ['performance_degraded', {}, {}, 1],
        ['requested', {}, {}, 0],
    ] as const)('keeps frozen reason priority for simultaneous conditions: %s', (reason, preferencePatch, environmentPatch, stage) => {
        const decision = resolveTalosMotionRuntimePolicy(
            preferences({ mode: 'complex', ...preferencePatch }),
            environment(environmentPatch),
            stage,
        )

        expect(decision.reason).toBe(reason)
    })

    it('recovers one stage only after eight stable windows and in reverse order', () => {
        const controller = createTalosMotionRuntimePolicyController()
        const over = environment({ frameP95Ms: 13 })
        const stable = environment({ frameP95Ms: 12 })

        for (let i = 0; i < 9; i += 1) controller.resolve(preferences({ mode: 'complex' }), over)
        expect(controller.snapshot().degradationStage).toBe(3)
        for (let i = 0; i < 7; i += 1) controller.resolve(preferences({ mode: 'complex' }), stable)
        expect(controller.snapshot().degradationStage).toBe(3)
        expect(controller.resolve(preferences({ mode: 'complex' }), stable).degradationStage).toBe(2)
    })

    it('applies cumulative stages without degrading off or static beyond sense', () => {
        const controller = createTalosMotionRuntimePolicyController()
        const over = environment({ frameP95Ms: 13 })

        for (let i = 0; i < 15; i += 1) controller.resolve(preferences({ mode: 'off' }), over)
        expect(controller.resolve(preferences({ mode: 'off' }), over)).toMatchObject({
            effectiveMode: 'off',
            degradationStage: 0,
            densityScale: 1,
        })
        controller.reset()
        for (let i = 0; i < 15; i += 1) controller.resolve(preferences({ mode: 'static' }), over)
        expect(controller.resolve(preferences({ mode: 'static' }), over)).toMatchObject({
            effectiveMode: 'static',
            degradationStage: 0,
        })
    })

    it('degrades through all stages and recovers in reverse order', () => {
        const controller = createTalosMotionRuntimePolicyController()
        const over = environment({ frameP95Ms: 13 })
        const stable = environment({ frameP95Ms: 12 })

        for (let i = 0; i < 15; i += 1) controller.resolve(preferences({ mode: 'complex' }), over)
        expect(controller.resolve(preferences({ mode: 'complex' }), over)).toMatchObject({
            effectiveMode: 'static',
            degradationStage: 5,
            reason: 'performance_degraded',
        })

        for (let stage = 4; stage >= 0; stage -= 1) {
            for (let i = 0; i < 8; i += 1) {
                controller.resolve(preferences({ mode: 'complex' }), stable)
            }
            expect(controller.snapshot().degradationStage).toBe(stage)
        }
        expect(controller.resolve(preferences({ mode: 'complex' }), stable)).toMatchObject({
            effectiveMode: 'complex',
            degradationStage: 0,
        })
    })

    it('keeps fault fallback transient and does not mutate preferences', () => {
        const input = preferences({ mode: 'complex' })
        const before = structuredClone(input)
        const decision = resolveTalosMotionRuntimePolicy(
            input,
            environment({ rendererFault: true, failedEffectiveMode: 'complex' }),
        )

        expect(decision.effectiveMode).toBe('simple')
        expect(input).toEqual(before)
        expect(input).not.toBe(before)
    })

    it('returns detached decisions and has deterministic reason priority', () => {
        const input = preferences({ mode: 'complex' })
        const env = environment({ workspaceInterfaceMotionAllowed: false })
        const first = resolveTalosMotionRuntimePolicy(input, env)
        const second = resolveTalosMotionRuntimePolicy(input, env)

        expect(first).toEqual(second)
        expect(first.reason).toBe('workspace_policy')
        expect(first).not.toBe(second)
    })

    it('resets bounded controller state explicitly', () => {
        const controller = createTalosMotionRuntimePolicyController()
        const over = environment({ frameP95Ms: 13 })

        for (let i = 0; i < 3; i += 1) controller.resolve(preferences({ mode: 'complex' }), over)
        expect(controller.snapshot().degradationStage).toBe(1)
        controller.reset()
        expect(controller.snapshot()).toEqual({
            degradationStage: 0,
            overBudgetWindows: 0,
            stableWindows: 0,
        })
    })
})

import { describe, expect, it } from 'vitest'
import { createDefaultTalosMotionV6Preferences } from './defaults'
import { resolveTalosWorkspaceMotionV6 } from './workspaceRuntime'

const environment = {
    workspaceBackgroundAllowed: true,
    workspaceInterfaceMotionAllowed: true,
    prefersReducedMotion: false,
    documentHidden: false,
    saveData: false,
    rendererFault: false,
    failedEffectiveMode: null,
    frameP95Ms: null,
    frameSampleSufficient: false,
} as const

describe('TALOS workspace Motion V6 coordinator', () => {
    it('starts a preference-free workspace with background off and interface motion on', () => {
        const result = resolveTalosWorkspaceMotionV6({
            settingsPreferences: {},
            themeId: 'forge',
            colorMode: 'dark',
            environment,
        })

        expect(result).toMatchObject({ success: true, source: 'default' })
        expect(result.preferences).toMatchObject({
            mode: 'off',
            background_enabled: true,
            interface_enabled: true,
        })
        expect(result.decision).toMatchObject({
            effectiveMode: 'off',
            backgroundEnabled: false,
            uiMotionEnabled: true,
        })

        const reduced = resolveTalosWorkspaceMotionV6({
            settingsPreferences: {},
            themeId: 'forge',
            colorMode: 'dark',
            environment: { ...environment, prefersReducedMotion: true },
        })
        expect(reduced.decision).toMatchObject({ effectiveMode: 'off', uiMotionEnabled: false })
    })

    it('resolves canonical V6 settings into policy, scene identity and active palette', () => {
        const preferences = createDefaultTalosMotionV6Preferences()
        preferences.mode = 'complex'
        preferences.scene_override = 'signal'
        const result = resolveTalosWorkspaceMotionV6({
            settingsPreferences: { theme_motion_v6: preferences },
            themeId: 'forge',
            colorMode: 'light',
            environment,
        })
        expect(result).toMatchObject({ success: true, source: 'v6', sceneId: 'signal' })
        expect(result.decision).toMatchObject({ requestedMode: 'complex', effectiveMode: 'complex' })
        expect(result.sceneInput.colorMode).toBe('light')
        expect(result.sceneInput.palette.light.background).not.toBe(result.sceneInput.palette.dark.background)
    })

    it('migrates legacy preferences without writing and selects the theme scene', () => {
        const result = resolveTalosWorkspaceMotionV6({
            settingsPreferences: { theme_motion: 'subtle', theme_simple_animation: true },
            themeId: 'paper',
            colorMode: 'dark',
            environment,
        })
        expect(result).toMatchObject({ success: true, source: 'legacy', sceneId: 'paper' })
        expect(result.preferences.mode).toBe('simple')
    })

    it('fails closed to Static with UI motion off for an invalid persisted V6 payload', () => {
        const result = resolveTalosWorkspaceMotionV6({
            settingsPreferences: { theme_motion_v6: { mode: 'complex' } },
            themeId: 'forge',
            colorMode: 'dark',
            environment,
        })
        expect(result).toMatchObject({ success: false, source: 'invalid' })
        expect(result.preferences).toMatchObject({ mode: 'static', background_enabled: true, interface_enabled: false })
        expect(result.decision).toMatchObject({ effectiveMode: 'static', uiMotionEnabled: false })
        expect(result.issues.length).toBeGreaterThan(0)
    })

    it('makes OS reduced motion dominant and produces a static effective renderer', () => {
        const preferences = createDefaultTalosMotionV6Preferences()
        preferences.mode = 'complex'
        const result = resolveTalosWorkspaceMotionV6({
            settingsPreferences: { theme_motion_v6: preferences },
            themeId: 'aurora',
            colorMode: 'dark',
            environment: { ...environment, prefersReducedMotion: true },
        })
        expect(result.decision).toMatchObject({ effectiveMode: 'static', reducedMotionApplied: true, reason: 'os_reduced_motion' })
    })

    it('projects a governor-owned degradation stage into decision and scene quality without persisting it', () => {
        const preferences = createDefaultTalosMotionV6Preferences()
        preferences.mode = 'complex'
        const result = resolveTalosWorkspaceMotionV6({
            settingsPreferences: { theme_motion_v6: preferences },
            themeId: 'forge',
            colorMode: 'dark',
            environment,
            degradationStage: 4,
        })

        expect(result.decision).toMatchObject({
            effectiveMode: 'simple',
            degradationStage: 4,
            reason: 'performance_degraded',
        })
        expect(result.sceneInput.effectiveQuality).toMatchObject({ tier: 'low', densityScale: 0.44 })
        expect(result.preferences).toEqual(preferences)
    })

    it('is deterministic for seed and does not mutate caller settings', () => {
        const settings = { theme_motion_v6: createDefaultTalosMotionV6Preferences() }
        const before = structuredClone(settings)
        const first = resolveTalosWorkspaceMotionV6({ settingsPreferences: settings, themeId: 'claudius', colorMode: 'dark', environment })
        const second = resolveTalosWorkspaceMotionV6({ settingsPreferences: settings, themeId: 'claudius', colorMode: 'dark', environment })
        expect(first.sceneInput.seed).toBe(second.sceneInput.seed)
        expect(settings).toEqual(before)
    })
})

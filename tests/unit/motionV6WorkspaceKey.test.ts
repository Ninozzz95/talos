import { describe, expect, it } from 'vitest'
import { resolveTalosWorkspaceMotionV6 } from '@/motion-v6/workspaceRuntime'
import type { TalosMotionRuntimeEnvironment } from '@/motion-v6/runtimePolicy'

// T6.5 regression — the device defect "animated backgrounds never run": the
// background wrapper fed preferences under `motion_v6`, but the migration
// contract reads `theme_motion_v6` (desktop settings key). Wrong key silently
// resolved to the default (mode off) regardless of the user's settings.
const COMPLEX_PREFS = {
    schema_version: 1, mode: 'complex', background_enabled: true, interface_enabled: true,
    scene_override: null, speed: 100, intensity: 65, glow_intensity: 0, density: 100, depth: 50,
    trails: 35, contrast: 60, parallax: 20, quality: 'adaptive', fps_cap: 30, dpr_cap: 1.25,
    pause_when_hidden: true, respect_data_saver: true,
    interface: { profile: 'preset', duration_scale: 50, intensity: 65, easing: 'precise', stagger: 40,
        categories: { windows: true, surfaces: true, navigation: true, composer: true, messages: true, feedback: true } },
}

const ENV: TalosMotionRuntimeEnvironment = {
    workspaceBackgroundAllowed: true, workspaceInterfaceMotionAllowed: true,
    prefersReducedMotion: false, documentHidden: false, saveData: false,
    rendererFault: false, failedEffectiveMode: null, frameP95Ms: null, frameSampleSufficient: false,
}

describe('workspace motion preferences key (T6.5)', () => {
    it('honours user preferences under the canonical theme_motion_v6 key', () => {
        const motion = resolveTalosWorkspaceMotionV6({
            settingsPreferences: { theme_motion_v6: COMPLEX_PREFS },
            themeId: 'calm', colorMode: 'light', environment: ENV,
        })
        expect(motion.source).toBe('v6')
        expect(motion.decision.requestedMode).toBe('complex')
        expect(motion.decision.backgroundEnabled).toBe(true)
    })

    it('silently falls back to defaults when fed the WRONG key (the original defect)', () => {
        const motion = resolveTalosWorkspaceMotionV6({
            settingsPreferences: { motion_v6: COMPLEX_PREFS },
            themeId: 'calm', colorMode: 'light', environment: ENV,
        })
        expect(motion.source).toBe('default')
        expect(motion.decision.requestedMode).toBe('off')
    })
})

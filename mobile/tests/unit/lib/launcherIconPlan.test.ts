import { describe, expect, it } from 'vitest'
import { resolveLauncherIconPlan, type LauncherIconState } from '@/lib/launcherIconPlan'

// Owner 2026-07-24: the launcher icon follows the active theme, but applying it
// needs a restart, so the *decision* to prompt is a pure function of state.
const base: LauncherIconState = {
    featureEnabled: true, native: true, themePreset: 'noir', appliedPreset: 'calm',
}

describe('resolveLauncherIconPlan', () => {
    it('prompts to switch when the theme differs from the applied launcher icon', () => {
        expect(resolveLauncherIconPlan(base)).toEqual({ kind: 'prompt', target: 'noir' })
    })

    it('is idle when the launcher icon already matches the theme', () => {
        expect(resolveLauncherIconPlan({ ...base, appliedPreset: 'noir' })).toEqual({ kind: 'idle' })
    })

    it('is idle when the feature is disabled (opt-in) even if they differ', () => {
        expect(resolveLauncherIconPlan({ ...base, featureEnabled: false })).toEqual({ kind: 'idle' })
    })

    it('is idle off native (no launcher aliases to toggle on web)', () => {
        expect(resolveLauncherIconPlan({ ...base, native: false })).toEqual({ kind: 'idle' })
    })
})

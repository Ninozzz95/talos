import { describe, expect, it } from 'vitest'
import { TALOS_MOTION_SCENE_IDS } from '../contracts'
import { createDefaultTalosMotionV6Preferences } from '../defaults'
import { TALOS_INTERACTION_INTENTS } from './intents'
import {
    TALOS_INTERACTION_PROFILES_V6,
    getTalosInteractionProfileV6,
} from './profiles'
import { resolveTalosInteractionMotion } from './resolver'

describe('TALOS V6 interaction profiles', () => {
    it('defines exactly one complete immutable profile per preset', () => {
        expect(TALOS_INTERACTION_PROFILES_V6.map((profile) => profile.id)).toEqual(TALOS_MOTION_SCENE_IDS)
        for (const profile of TALOS_INTERACTION_PROFILES_V6) {
            expect(Object.keys(profile.specs)).toEqual(TALOS_INTERACTION_INTENTS)
            expect(Object.isFrozen(profile)).toBe(true)
            expect(Object.isFrozen(profile.specs)).toBe(true)
        }
    })

    it('makes every profile structurally and temporally distinct', () => {
        const fingerprints = TALOS_INTERACTION_PROFILES_V6.map((profile) => JSON.stringify(profile.specs))
        expect(new Set(fingerprints).size).toBe(14)
    })

    it.each(TALOS_INTERACTION_PROFILES_V6)('$id resolves every intent and its reduced-motion form', (profile) => {
        const preferences = createDefaultTalosMotionV6Preferences().interface
        for (const intent of TALOS_INTERACTION_INTENTS) {
            const active = resolveTalosInteractionMotion({ intent, profile, interfaceEnabled: true, reducedMotion: false, preferences })
            const reduced = resolveTalosInteractionMotion({ intent, profile, interfaceEnabled: true, reducedMotion: true, preferences })
            expect(active.enabled, `${profile.id}:${intent}`).toBe(true)
            expect(active.durationMs).toBeGreaterThan(0)
            expect(active.durationMs).toBeLessThanOrEqual(1_000)
            expect(reduced).toMatchObject({ enabled: false, reason: 'reduced_motion', durationMs: 0 })
        }
    })

    it('returns only canonical profiles and keeps unknown IDs fail-closed', () => {
        expect(getTalosInteractionProfileV6('forge')?.id).toBe('forge')
        expect(getTalosInteractionProfileV6('unknown')).toBeNull()
        expect(getTalosInteractionProfileV6({ toString: () => 'forge' })).toBeNull()
    })

    it('gives each preset a distinct window lifecycle grammar', () => {
        const fingerprints = TALOS_INTERACTION_PROFILES_V6.map((profile) => JSON.stringify({
            open: profile.specs['window-open'],
            close: profile.specs['window-close'],
            minimize: profile.specs['window-minimize'],
            restore: profile.specs['window-restore'],
            focus: profile.specs['window-focus'],
        }))
        expect(new Set(fingerprints).size).toBe(14)
    })

    it.each([
        ['window-open', 160],
        ['window-close', 120],
        ['window-minimize', 190],
        ['window-restore', 160],
    ] as const)('keeps %s perceptible at the default duration scale across every preset', (intent, minimumMs) => {
        const preferences = createDefaultTalosMotionV6Preferences().interface
        for (const profile of TALOS_INTERACTION_PROFILES_V6) {
            const plan = resolveTalosInteractionMotion({ intent, profile, interfaceEnabled: true, reducedMotion: false, preferences })
            expect(plan.durationMs, `${profile.id}:${intent}`).toBeGreaterThanOrEqual(minimumMs)
        }
    })

    it.each(['window-open', 'window-close', 'window-minimize', 'window-restore'] as const)(
        'keeps every preset timing identity for %s after applying perceptibility bounds',
        (intent) => {
            const durations = TALOS_INTERACTION_PROFILES_V6.map((profile) => profile.specs[intent].durationMs)
            expect(new Set(durations).size).toBe(TALOS_INTERACTION_PROFILES_V6.length)
        },
    )
})

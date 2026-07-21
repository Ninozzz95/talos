import { describe, expect, it } from 'vitest'
import {
    TALOS_MOBILE_MODEL_CATALOG,
    talosMobileModelProfiles,
} from '@/lib/mobileModelCatalog'

describe('mobileModelCatalog', () => {
    it('ships at least the Anthropic MVP models with valid effort ladders', () => {
        const anthropic = TALOS_MOBILE_MODEL_CATALOG.filter((seed) => seed.provider === 'anthropic')
        expect(anthropic.length).toBeGreaterThanOrEqual(3)
        for (const seed of TALOS_MOBILE_MODEL_CATALOG) {
            expect(seed.id).toBeTruthy()
            expect(seed.model).toBeTruthy()
            expect(seed.effort_levels.length).toBeGreaterThan(0)
        }
    })

    it('marks a profile has_secret + healthy only when its provider key is present', () => {
        const profiles = talosMobileModelProfiles((provider) => provider === 'anthropic')
        const anthropic = profiles.find((p) => p.provider === 'anthropic')!
        expect(anthropic.has_secret).toBe(true)
        expect(anthropic.status).toBe('healthy')
        expect(anthropic.show_in_composer).toBe(true)
    })

    it('marks a profile untested + no secret when the provider key is absent', () => {
        const profiles = talosMobileModelProfiles(() => false)
        expect(profiles.every((p) => p.has_secret === false)).toBe(true)
        expect(profiles.every((p) => p.status === 'untested')).toBe(true)
    })

    it('returns one profile view per catalog seed, preserving model + effort levels', () => {
        const profiles = talosMobileModelProfiles(() => true)
        expect(profiles).toHaveLength(TALOS_MOBILE_MODEL_CATALOG.length)
        const opus = profiles.find((p) => p.model === 'claude-opus-4-8')
        expect(opus?.effort_levels).toContain('high')
    })
})

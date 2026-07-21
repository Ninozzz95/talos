import { describe, expect, it } from 'vitest'
import { parseTalosMobileDesignTokens } from '@talos-mobile/design-tokens'
import { TALOS_IDENTITY_FIELD_DISPOSITION } from '@/theme/applyDesignTokens'
import identity from '@/theme/telemetry.identity.json'

describe('identity field disposition', () => {
    it('every design token field is consumed by a named boundary or explicitly deferred', () => {
        const parsed = parseTalosMobileDesignTokens(identity) as Record<string, unknown>
        for (const key of Object.keys(parsed)) {
            const disposition = TALOS_IDENTITY_FIELD_DISPOSITION[key as keyof typeof TALOS_IDENTITY_FIELD_DISPOSITION]
            expect(disposition, `field "${key}" must have a disposition`).toBeTruthy()
            expect(['consumed', 'deferred']).toContain(disposition.disposition)
            expect(disposition.boundary.length).toBeGreaterThan(0)
        }
    })

    it('motion_intents is the only deferred field and it never claims applied behavior', () => {
        expect(TALOS_IDENTITY_FIELD_DISPOSITION.motion_intents.disposition).toBe('deferred')
        const deferred = Object.entries(TALOS_IDENTITY_FIELD_DISPOSITION)
            .filter(([, value]) => value.disposition === 'deferred')
            .map(([key]) => key)
        expect(deferred).toEqual(['motion_intents'])
    })

    it('the disposition map covers exactly the identity keys', () => {
        const parsed = parseTalosMobileDesignTokens(identity) as Record<string, unknown>
        expect(Object.keys(TALOS_IDENTITY_FIELD_DISPOSITION).sort()).toEqual(Object.keys(parsed).sort())
    })
})

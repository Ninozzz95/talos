import { describe, expect, it } from 'vitest'
import {
    TALOS_DEFAULT_LOCAL_ENGINE_PROBE_PREFERENCES,
    parseTalosLocalEngineProbePreferences,
} from '@/lib/localEngineProbeConsent'

describe('localEngineProbeConsent', () => {
    it('starts unset — the automatic prompt has never been shown', () => {
        expect(TALOS_DEFAULT_LOCAL_ENGINE_PROBE_PREFERENCES).toEqual({ consent: 'unset' })
    })

    it('accepts each of the three real states', () => {
        expect(parseTalosLocalEngineProbePreferences({ consent: 'unset' })).toEqual({ consent: 'unset' })
        expect(parseTalosLocalEngineProbePreferences({ consent: 'granted' })).toEqual({ consent: 'granted' })
        expect(parseTalosLocalEngineProbePreferences({ consent: 'declined' })).toEqual({ consent: 'declined' })
    })

    it('falls back to unset on anything that is not one of the three words', () => {
        expect(parseTalosLocalEngineProbePreferences({ consent: 'no' })).toEqual({ consent: 'unset' })
        expect(parseTalosLocalEngineProbePreferences({ consent: '' })).toEqual({ consent: 'unset' })
        expect(parseTalosLocalEngineProbePreferences({ consent: true })).toEqual({ consent: 'unset' })
        expect(parseTalosLocalEngineProbePreferences({ consent: null })).toEqual({ consent: 'unset' })
    })

    it('falls back to unset on the wrong shape, never throws', () => {
        expect(parseTalosLocalEngineProbePreferences(null)).toEqual({ consent: 'unset' })
        expect(parseTalosLocalEngineProbePreferences(undefined)).toEqual({ consent: 'unset' })
        expect(parseTalosLocalEngineProbePreferences('granted')).toEqual({ consent: 'unset' })
        expect(parseTalosLocalEngineProbePreferences([])).toEqual({ consent: 'unset' })
        expect(parseTalosLocalEngineProbePreferences({})).toEqual({ consent: 'unset' })
    })

    it('rejects an extra key rather than silently dropping it', () => {
        // A record with a stray field is not "close enough" — it is a shape
        // this version does not recognise, and the fail-closed default wins.
        expect(parseTalosLocalEngineProbePreferences({ consent: 'granted', extra: true }))
            .toEqual({ consent: 'unset' })
    })

    /**
     * ⛔ The reverse of "declined suppresses the prompt": declined must never
     * collapse to the same handling as unset, or the "don't show again"
     * promise from §1-bis silently breaks the first time settings round-trip
     * through this parser.
     */
    it('declined survives a round trip distinctly from unset', () => {
        const declined = parseTalosLocalEngineProbePreferences({ consent: 'declined' })
        expect(declined.consent).not.toBe(TALOS_DEFAULT_LOCAL_ENGINE_PROBE_PREFERENCES.consent)
        expect(parseTalosLocalEngineProbePreferences(declined)).toEqual(declined)
    })
})

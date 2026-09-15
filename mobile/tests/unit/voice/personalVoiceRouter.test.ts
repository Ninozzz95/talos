import { describe, expect, it, vi } from 'vitest'
import { planTalosVoiceReading, resolveTalosVoiceRoute } from '@/lib/voice/personalVoiceRouter'
import type { TalosPersonalVoiceStatus } from '@/lib/voice/personalVoiceContracts'

const READY_STATUS: TalosPersonalVoiceStatus = { supported: true, installed: true, ready: true, active: false }
const NOT_SUPPORTED_STATUS: TalosPersonalVoiceStatus = { supported: false, installed: false, ready: false, active: false }
const NOT_READY_STATUS: TalosPersonalVoiceStatus = { supported: true, installed: true, ready: false, active: false }
const PROFILE_ID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'

// Blueprint §37.1 "Router" - each bullet of that list is one test here.
describe('personalVoiceRouter', () => {
    it('PVOICE-ROUTER-01 system selected never calls the personal plugin at all', async () => {
        const fetchStatus = vi.fn(async () => READY_STATUS)
        const route = await planTalosVoiceReading('system', PROFILE_ID, fetchStatus)
        expect(route).toEqual({ engine: 'system', profileId: null, fellBack: false })
        expect(fetchStatus).not.toHaveBeenCalled()
    })

    it('PVOICE-ROUTER-02 personal ready routes to personal with the chosen profile', async () => {
        const fetchStatus = vi.fn(async () => READY_STATUS)
        const route = await planTalosVoiceReading('personal', PROFILE_ID, fetchStatus)
        expect(route).toEqual({ engine: 'personal', profileId: PROFILE_ID, fellBack: false })
        expect(fetchStatus).toHaveBeenCalledTimes(1)
    })

    it('PVOICE-ROUTER-03 personal unavailable falls back to system, for every kind of unavailable', () => {
        expect(resolveTalosVoiceRoute('personal', PROFILE_ID, NOT_SUPPORTED_STATUS))
            .toEqual({ engine: 'system', profileId: null, fellBack: true, fallbackReason: 'notSupported' })
        expect(resolveTalosVoiceRoute('personal', PROFILE_ID, NOT_READY_STATUS))
            .toEqual({ engine: 'system', profileId: null, fellBack: true, fallbackReason: 'notReady' })
        expect(resolveTalosVoiceRoute('personal', null, READY_STATUS))
            .toEqual({ engine: 'system', profileId: null, fellBack: true, fallbackReason: 'noProfileSelected' })
    })

    /**
     * ⛔⛔⛔ Owner 11/09, QUARTA segnalazione di «codifico la voce e non si
     * sente nulla / in chat la riproduzione fallisce». `ready` risponde a
     * «esiste ALMENO un profilo compatibile», e con due profili la
     * preferenza poteva puntare a quello NON compatibile: il router diceva
     * `'personal'`, il nativo TROVAVA il file (quindi `speak()` risolveva
     * `accepted: true`, bruciando il ripiego pulito) e falliva dopo, a
     * sintesi iniziata. `'profileIncompatible'` era dichiarato nel tipo dal
     * primo giorno e non lo produceva NESSUNA riga.
     */
    it('PVOICE-ROUTER-06 il profilo SCELTO non compatibile ripiega sul sistema, anche se un ALTRO profilo lo e', () => {
        const altroProfiloPronto: TalosPersonalVoiceStatus = {
            supported: true, installed: true, ready: true, active: false,
            compatibleProfileIds: ['ffffffff-1111-4222-8333-444444444444'],
        }
        expect(resolveTalosVoiceRoute('personal', PROFILE_ID, altroProfiloPronto))
            .toEqual({ engine: 'system', profileId: null, fellBack: true, fallbackReason: 'profileIncompatible' })
    })

    /**
     * ⛔ La prova AL VERSO CONTRARIO, quella che deve continuare a fallire
     * se qualcuno «rinforza» il controllo di sopra: un profilo scelto che
     * E' nell'elenco dei compatibili non deve ripiegare, e un elenco
     * ASSENTE significa «non lo so» (chiamante che non elenca, ponte che
     * non ha risposto) — mai «nessuno». Trattarlo come vuoto spegnerebbe
     * la voce personale a tutti.
     */
    it('PVOICE-ROUTER-07 il profilo scelto compatibile resta personale, e un elenco ASSENTE non spegne niente', () => {
        const sceltoPronto: TalosPersonalVoiceStatus = {
            supported: true, installed: true, ready: true, active: false,
            compatibleProfileIds: [PROFILE_ID, 'ffffffff-1111-4222-8333-444444444444'],
        }
        expect(resolveTalosVoiceRoute('personal', PROFILE_ID, sceltoPronto))
            .toEqual({ engine: 'personal', profileId: PROFILE_ID, fellBack: false })
        // `READY_STATUS` non porta `compatibleProfileIds`: nessun ripiego.
        expect(resolveTalosVoiceRoute('personal', PROFILE_ID, READY_STATUS))
            .toEqual({ engine: 'personal', profileId: PROFILE_ID, fellBack: false })
    })

    it('PVOICE-ROUTER-04 a fallback never rewrites the user\'s stored choice - the same preference resolves personal again once ready', () => {
        // The router is pure: it has no settings-store handle to write
        // through in the first place. The real proof that matters is
        // behavioral - the SAME stored preference ('personal', PROFILE_ID)
        // produces a fallback when unready and 'personal' again once ready,
        // with nothing in between rewriting what was asked for.
        const fellBack = resolveTalosVoiceRoute('personal', PROFILE_ID, NOT_READY_STATUS)
        expect(fellBack.engine).toBe('system')
        const nowReady = resolveTalosVoiceRoute('personal', PROFILE_ID, READY_STATUS)
        expect(nowReady).toEqual({ engine: 'personal', profileId: PROFILE_ID, fellBack: false })
    })

    it('PVOICE-ROUTER-05 the resolved route is a fixed snapshot - re-resolving with new facts never mutates a route already handed to a caller', () => {
        const route = resolveTalosVoiceRoute('personal', PROFILE_ID, READY_STATUS)
        const snapshot = { ...route }
        // Simulate the world changing mid-reading (profile deleted, engine
        // switched) - a caller holding `route` from before must see it
        // unaffected, because nothing about this function's return value is
        // shared, cached, or later patched in place.
        resolveTalosVoiceRoute('system', null, NOT_SUPPORTED_STATUS)
        expect(route).toEqual(snapshot)
    })
})

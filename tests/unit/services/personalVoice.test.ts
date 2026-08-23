import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
    status: vi.fn(),
    profiles: vi.fn(),
    renameProfile: vi.fn(),
    deleteProfile: vi.fn(),
    speak: vi.fn(),
    stop: vi.fn(),
    buildEnrollmentProfile: vi.fn(),
    addListener: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
    registerPlugin: () => bridge,
}))

const {
    talosPersonalVoiceStatus,
    talosPersonalVoiceProfiles,
    talosBuildVoiceEnrollmentProfile,
    talosSpeakForReading,
} = await import('@/services/personalVoice')

const PROFILE_ID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
const READY_PROFILES = {
    profiles: [
        { id: PROFILE_ID, name: 'Antonino', language: 'it-IT', style: 'neutral', engineBuild: 'x'.repeat(64), compatible: true, createdAtEpochMs: 0, enrollmentDurationMs: 0 },
    ],
}

describe('personalVoice service', () => {
    beforeEach(() => {
        bridge.status.mockReset()
        bridge.profiles.mockReset()
        bridge.buildEnrollmentProfile.mockReset()
    })

    // §40's own contract: ready means installed AND at least one COMPATIBLE
    // profile - not just "the model files are there".
    it('PVOICE-STATUS-01 not ready when installed but every saved profile is incompatible', async () => {
        bridge.status.mockResolvedValue({ supported: true, installed: true })
        bridge.profiles.mockResolvedValue({
            profiles: [
                { id: 'a', name: 'A', language: 'it-IT', style: 'neutral', engineBuild: 'x', compatible: false, createdAtEpochMs: 0, enrollmentDurationMs: 0 },
            ],
        })
        const status = await talosPersonalVoiceStatus()
        expect(status).toEqual({ supported: true, installed: true, ready: false, active: false, failure: undefined })
    })

    it('PVOICE-STATUS-02 ready when at least one saved profile is compatible', async () => {
        bridge.status.mockResolvedValue({ supported: true, installed: true })
        bridge.profiles.mockResolvedValue({
            profiles: [
                { id: 'a', name: 'A', language: 'it-IT', style: 'neutral', engineBuild: 'x', compatible: false, createdAtEpochMs: 0, enrollmentDurationMs: 0 },
                { id: 'b', name: 'B', language: 'it-IT', style: 'neutral', engineBuild: 'y', compatible: true, createdAtEpochMs: 0, enrollmentDurationMs: 0 },
            ],
        })
        const status = await talosPersonalVoiceStatus()
        expect(status.ready).toBe(true)
    })

    it('PVOICE-STATUS-03 not installed short-circuits without a second bridge call', async () => {
        bridge.status.mockResolvedValue({ supported: false, installed: false, failure: 'model files missing' })
        const status = await talosPersonalVoiceStatus()
        expect(status).toEqual({ supported: false, installed: false, ready: false, active: false, failure: 'model files missing' })
        expect(bridge.profiles).not.toHaveBeenCalled()
    })

    it('PVOICE-STATUS-04 a thrown bridge error reads as fully unsupported, never as a crash', async () => {
        bridge.status.mockRejectedValue(new Error('bridge unavailable'))
        const status = await talosPersonalVoiceStatus()
        expect(status).toEqual({ supported: false, installed: false, ready: false, active: false })
    })

    it('PVOICE-STATUS-05 preserves every native Pocket verification field', async () => {
        bridge.status.mockResolvedValue({
            supported: true,
            installed: true,
            backend: 'pocket-v2',
            engineBuild: '58a6d00cf13d239b6748cb0769f35c580a8f606c',
            modelState: 'ready',
            verifiedFiles: 8,
            cacheHit: false,
            verificationDurationMs: 321.5,
        })
        bridge.profiles.mockResolvedValue(READY_PROFILES)

        await expect(talosPersonalVoiceStatus()).resolves.toEqual({
            supported: true,
            installed: true,
            ready: true,
            active: false,
            failure: undefined,
            backend: 'pocket-v2',
            engineBuild: '58a6d00cf13d239b6748cb0769f35c580a8f606c',
            modelState: 'ready',
            verifiedFiles: 8,
            cacheHit: false,
            verificationDurationMs: 321.5,
        })
    })

    it('PVOICE-PROFILES-01 a thrown bridge error reads as an empty list, not a crash', async () => {
        bridge.profiles.mockRejectedValue(new Error('bridge unavailable'))
        await expect(talosPersonalVoiceProfiles()).resolves.toEqual([])
    })

    it('PVOICE-ENROLL-01 returns the measured Pocket V2 build contract without MOSS quantizer fields', async () => {
        const measured = {
            backend: 'pocket-v2' as const,
            profileSchemaVersion: 2 as const,
            sourceSampleRate: 48_000,
            sourceSamples: 768_000,
            referenceSamples: 576_000,
            referenceDurationMs: 12_000,
            conditioningFrames: 150,
            conditioningDimension: 1_024,
            enrollmentDurationMs: 16_000,
            stages: [
                {
                    stage: 'mimi_encoder',
                    startedAtNs: 100,
                    durationNs: 25,
                    threadName: 'talos-voice-owner',
                    inputFrames: 576_000,
                    outputSamples: 150,
                },
            ],
        }
        bridge.buildEnrollmentProfile.mockResolvedValue(measured)

        const result = await talosBuildVoiceEnrollmentProfile({
            displayName: 'Antonino',
            language: 'it-IT',
            style: 'neutral',
            consentVersion: 1,
        })

        expect(result).toEqual(measured)
        expect(result).not.toHaveProperty('quantizerCount')
        expect(result).not.toHaveProperty('frameCount')
        expect(bridge.buildEnrollmentProfile).toHaveBeenCalledWith({
            displayName: 'Antonino',
            language: 'it-IT',
            style: 'neutral',
            consentVersion: 1,
        })
    })

    // talosSpeakForReading - the real router decision through to the real
    // bridge call, the piece useTalosSpeech.test.ts mocks away entirely so
    // THIS file is where that wiring actually gets exercised end to end.
    describe('talosSpeakForReading', () => {
        beforeEach(() => {
            bridge.speak.mockReset()
        })

        it('system engine never touches the bridge at all', async () => {
            const spoken = await talosSpeakForReading('system', PROFILE_ID, 'Ciao', { rate: 1, pitch: 1 })
            expect(spoken).toBe(false)
            expect(bridge.status).not.toHaveBeenCalled()
            expect(bridge.speak).not.toHaveBeenCalled()
        })

        it('personal engine with no chosen profile falls back without touching the bridge', async () => {
            const spoken = await talosSpeakForReading('personal', null, 'Ciao', { rate: 1, pitch: 1 })
            expect(spoken).toBe(false)
            expect(bridge.speak).not.toHaveBeenCalled()
        })

        it('personal engine not ready (no compatible profile) falls back, speak() never called', async () => {
            bridge.status.mockResolvedValue({ supported: true, installed: true })
            bridge.profiles.mockResolvedValue({ profiles: [] })
            const spoken = await talosSpeakForReading('personal', PROFILE_ID, 'Ciao', { rate: 1, pitch: 1 })
            expect(spoken).toBe(false)
            expect(bridge.speak).not.toHaveBeenCalled()
        })

        it('personal engine ready calls the real bridge speak() with the resolved profile and reports true', async () => {
            bridge.status.mockResolvedValue({ supported: true, installed: true })
            bridge.profiles.mockResolvedValue(READY_PROFILES)
            bridge.speak.mockResolvedValue({ accepted: true })
            const spoken = await talosSpeakForReading('personal', PROFILE_ID, 'Ciao', { rate: 1, pitch: 1 })
            expect(spoken).toBe(true)
            expect(bridge.speak).toHaveBeenCalledWith(expect.objectContaining({
                text: 'Ciao', profileId: PROFILE_ID, rate: 1, pitch: 1,
            }))
        })

        it('PVOICE-DIAG-01 preserves the immutable diagnostic route at the native production door', async () => {
            bridge.status.mockResolvedValue({ supported: true, installed: true })
            bridge.profiles.mockResolvedValue(READY_PROFILES)
            bridge.speak.mockResolvedValue({ accepted: true })

            const spoken = await talosSpeakForReading('personal', PROFILE_ID, 'Ciao', {
                rate: 1,
                pitch: 1,
                traceId: 'trace-0123456789abcdef',
                source: 'chat',
                locale: 'it-IT',
            })

            expect(spoken).toBe(true)
            expect(bridge.speak).toHaveBeenCalledWith(expect.objectContaining({
                profileId: PROFILE_ID,
                traceId: 'trace-0123456789abcdef',
                source: 'chat',
                locale: 'it-IT',
            }))
        })

        it('PVOICE-QUEUE-01 preserves one logical reading id and a unique queued utterance id at the bridge', async () => {
            bridge.status.mockResolvedValue({ supported: true, installed: true })
            bridge.profiles.mockResolvedValue(READY_PROFILES)
            bridge.speak.mockResolvedValue({ accepted: true })

            const spoken = await talosSpeakForReading('personal', PROFILE_ID, 'Seconda frase.', {
                rate: 0.95,
                pitch: 1.05,
                readingId: 'chat-reading-42',
                queue: 'add',
                source: 'chat',
                locale: 'it-IT',
            })

            expect(spoken).toBe(true)
            const request = bridge.speak.mock.calls[0]?.[0]
            expect(request).toEqual(expect.objectContaining({
                readingId: 'chat-reading-42',
                queue: 'add',
                source: 'chat',
                locale: 'it-IT',
            }))
            expect(request.utteranceId).toMatch(/^chat-reading-42-u-/)
            expect(request.utteranceId).not.toBe(request.readingId)
        })

        it('the reading id passed to the bridge is unique per call, so two readings never share a completion event', async () => {
            bridge.status.mockResolvedValue({ supported: true, installed: true })
            bridge.profiles.mockResolvedValue(READY_PROFILES)
            bridge.speak.mockResolvedValue({ accepted: true })
            await talosSpeakForReading('personal', PROFILE_ID, 'One', { rate: 1, pitch: 1 })
            await talosSpeakForReading('personal', PROFILE_ID, 'Two', { rate: 1, pitch: 1 })
            const [firstCall, secondCall] = bridge.speak.mock.calls
            expect(firstCall[0].readingId).not.toBe(secondCall[0].readingId)
        })

        /**
         * ⛔⛔⛔ 22/8, owner, riprodotto live: la preferenza salvata puntava a
         * un profilo che nel frattempo era stato rinominato/ricreato con un
         * id diverso. `status.ready` era comunque `true` (UN ALTRO profilo
         * compatibile esisteva), quindi il router sceglieva `'personal'` e
         * la chiamata al bridge arrivava con l'id VECCHIO - che il plugin
         * nativo rifiuta subito, sincrono (`accepted:false,
         * reason:"profileNotFound"`). Prima di questo test/fix, quel
         * rifiuto veniva trattato come "gestito" (tornava `true`), lasciando
         * SOLO il toast generico "La lettura non è partita" su una lettura
         * che aveva ancora un ripiego di sistema onesto disponibile.
         */
        it('PVOICE-SPEAK-01 a synchronous bridge rejection (stale/missing profile id) falls back, never calls onerror itself', async () => {
            bridge.status.mockResolvedValue({ supported: true, installed: true })
            bridge.profiles.mockResolvedValue(READY_PROFILES) // il router vede ALMENO un profilo pronto...
            bridge.speak.mockResolvedValue({ accepted: false, reason: 'profileNotFound' }) // ...ma QUESTO id specifico no
            const onerror = vi.fn()
            const spoken = await talosSpeakForReading(
                'personal',
                'ghost-0000-0000-0000-000000000000', // stantio: non è PROFILE_ID, il plugin lo rifiuta
                'Ciao',
                { rate: 1, pitch: 1, onerror },
            )
            expect(spoken).toBe(false) // ⛔ AL CONTRARIO del vecchio comportamento: false, non true
            expect(onerror).not.toHaveBeenCalled() // il chiamante ripiega da solo - nessun errore mostrato qui
        })

        it('AL CONTRARIO: a failure that arrives AFTER acceptance still reports true and reaches onerror via the completion event, not a fallback', async () => {
            bridge.status.mockResolvedValue({ supported: true, installed: true })
            bridge.profiles.mockResolvedValue(READY_PROFILES)
            bridge.speak.mockResolvedValue({ accepted: true }) // accettato SUBITO - la lettura è partita
            const onend = vi.fn()
            const onerror = vi.fn()
            const spoken = await talosSpeakForReading('personal', PROFILE_ID, 'Ciao', { rate: 1, pitch: 1, onend, onerror })
            expect(spoken).toBe(true) // gestito: nessun ripiego a metà lettura
            expect(bridge.addListener).toHaveBeenCalled() // il canale di completamento è armato per quando arriverà l'esito vero
        })
    })
})

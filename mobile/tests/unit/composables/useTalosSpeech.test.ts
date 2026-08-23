import { beforeEach, describe, expect, it, vi } from 'vitest'

// Owner 2026-07-24: per-message TTS toggle — one reply at a time, the button
// reflects "speaking this message" so it can toggle to Stop.
const svc = vi.hoisted(() => ({
    supported: true,
    speak: vi.fn(async (_t: string, opts?: { onend?: () => void }) => { svc._onend = opts?.onend }),
    stop: vi.fn(),
    _onend: undefined as undefined | (() => void),
}))
vi.mock('@/services/speech', () => ({
    useTalosSpeechService: () => ({ supported: () => svc.supported, speak: svc.speak, stop: svc.stop, voices: () => [] }),
}))

const voiceState = vi.hoisted(() => ({
    voice_uri: 'it-IT-a' as string | null,
    rate: 1.1,
    pitch: 0.9,
    engine: 'system' as 'system' | 'personal',
    personal_profile_id: null as string | null,
    personal_rate: 1,
    personal_pitch: 1,
}))
vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({ state: { voice: voiceState } }),
}))

const i18nState = vi.hoisted(() => ({ locale: { value: 'it-IT' } }))
vi.mock('@/i18n', () => ({
    useTalosI18n: () => ({ t: (key: string) => key, locale: i18nState.locale }),
}))

/**
 * Fase 4 block 5: `toggle`'s only remaining personal-voice responsibility
 * after the chunk-budget refactor is "call `talosSpeakForReading`, branch
 * on its boolean" - `talosSpeakForReading` itself now owns the router call
 * and the adapter selection (moved out of this composable to keep it out
 * of the chat screen's eager bundle: `TALOS_INITIAL_CHUNK_BUDGET_EXCEEDED`
 * caught the first draft at 610,498 of a 610,000-byte ceiling). Mocked
 * directly here at that exact boundary - its OWN internal wiring (router
 * decision -> adapter call) is `services/personalVoice.test.ts`'s job, not
 * this file's; mocking one function's internals by spreading
 * `importActual` and overriding its same-module siblings does not work
 * for a plain function call (ES module live bindings rewire the export
 * object, not calls already bound to local functions inside that file) -
 * measured here first, the wrong way round, before landing on this one.
 */
const personal = vi.hoisted(() => ({
    speakForReading: vi.fn(async (_engine: string, _profileId: string | null, _text: string, opts?: {
        onend?: () => void
        queue?: 'flush' | 'add'
        locale?: string
        source?: 'chat' | 'assistant' | 'manual' | 'preview' | 'instrumentation'
    }) => {
        personal._onend = opts?.onend
        return false
    }),
    stop: vi.fn(async () => {}),
    _onend: undefined as undefined | (() => void),
}))
vi.mock('@/services/personalVoice', () => ({
    talosSpeakForReading: personal.speakForReading,
    talosStopPersonalVoice: personal.stop,
}))

import { useTalosSpeech, __resetTalosSpeechForTests } from '@/composables/useTalosSpeech'

beforeEach(() => {
    __resetTalosSpeechForTests()
    svc.speak.mockClear(); svc.stop.mockClear(); svc._onend = undefined
    personal.speakForReading.mockClear(); personal.stop.mockClear(); personal._onend = undefined
    voiceState.engine = 'system'
    voiceState.personal_profile_id = null
    voiceState.personal_rate = 1
    voiceState.personal_pitch = 1
    i18nState.locale.value = 'it-IT'
})

describe('useTalosSpeech', () => {
    it('speaks a message with the persisted voice/rate/pitch and marks it speaking', async () => {
        const speech = useTalosSpeech()
        await speech.toggle('m1', 'Ciao')
        expect(svc.speak).toHaveBeenCalledWith('Ciao', expect.objectContaining({ voiceURI: 'it-IT-a', rate: 1.1, pitch: 0.9 }))
        expect(speech.speakingId.value).toBe('m1')
    })

    it('toggling the SAME message stops it', async () => {
        const speech = useTalosSpeech()
        await speech.toggle('m1', 'Ciao')
        await speech.toggle('m1', 'Ciao')
        expect(svc.stop).toHaveBeenCalledOnce()
        expect(speech.speakingId.value).toBeNull()
    })

    it('clears the speaking flag when the utterance ends', async () => {
        const speech = useTalosSpeech()
        await speech.toggle('m1', 'Ciao')
        expect(speech.speakingId.value).toBe('m1')
        svc._onend?.()
        expect(speech.speakingId.value).toBeNull()
    })

    it('switching to a different message speaks the new one', async () => {
        const speech = useTalosSpeech()
        await speech.toggle('m1', 'One')
        await speech.toggle('m2', 'Two')
        expect(speech.speakingId.value).toBe('m2')
        expect(svc.speak).toHaveBeenLastCalledWith('Two', expect.anything())
    })

    // Fase 4 block 5 - toggle()'s own responsibility: call talosSpeakForReading,
    // branch on its boolean, route stop() the same way. The router/adapter
    // logic INSIDE talosSpeakForReading has its own tests in
    // services/personalVoice.test.ts.
    describe('personal voice routing', () => {
        it('PVOICE-SPEECH-01 system selected never calls talosSpeakForReading at all - toggle() itself gates on it before even importing the module', async () => {
            voiceState.engine = 'system'
            const speech = useTalosSpeech()
            await speech.toggle('m1', 'Ciao')
            expect(personal.speakForReading).not.toHaveBeenCalled()
            expect(svc.speak).toHaveBeenCalled()
        })

        it('PVOICE-SPEECH-02 when talosSpeakForReading reports it spoke, the system speech service is never called', async () => {
            voiceState.engine = 'personal'
            voiceState.personal_profile_id = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
            voiceState.personal_rate = 1
            voiceState.personal_pitch = 1
            personal.speakForReading.mockImplementationOnce(async (_engine, _profileId, _text, opts) => {
                personal._onend = opts?.onend
                return true
            })

            const speech = useTalosSpeech()
            await speech.toggle('m1', 'Ciao')
            expect(personal.speakForReading).toHaveBeenCalledWith(
                'personal', 'a1b2c3d4-e5f6-4789-a012-3456789abcde', 'Ciao',
                expect.objectContaining({ rate: 1, pitch: 1, locale: 'it-IT', source: 'manual' }),
            )
            expect(svc.speak).not.toHaveBeenCalled()
            expect(speech.speakingId.value).toBe('m1')
        })

        it('PVOICE-SPEECH-03 when talosSpeakForReading reports false, toggle falls back to the system voice for this reading, without rewriting the stored preference', async () => {
            voiceState.engine = 'personal'
            voiceState.personal_profile_id = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
            // Default mock already resolves false - the "unavailable" case.

            const speech = useTalosSpeech()
            await speech.toggle('m1', 'Ciao')
            expect(personal.speakForReading).toHaveBeenCalled()
            expect(svc.speak).toHaveBeenCalledWith('Ciao', expect.anything())
            // The preference itself is untouched - this mock IS the store, and nothing wrote to it.
            expect(voiceState.engine).toBe('personal')
        })

        it('PVOICE-SPEECH-04 stopping a personal-voice reading calls the native stop, not the system one', async () => {
            voiceState.engine = 'personal'
            voiceState.personal_profile_id = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
            personal.speakForReading.mockImplementationOnce(async (_engine, _profileId, _text, opts) => {
                personal._onend = opts?.onend
                return true
            })

            const speech = useTalosSpeech()
            await speech.toggle('m1', 'Ciao')
            await speech.toggle('m1', 'Ciao') // same id -> stop
            expect(personal.stop).toHaveBeenCalledOnce()
            expect(svc.stop).not.toHaveBeenCalled()
            expect(speech.speakingId.value).toBeNull()
        })

        it('PVOICE-SPEECH-05 the personal reading clears speakingId when the native completion event fires', async () => {
            voiceState.engine = 'personal'
            voiceState.personal_profile_id = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
            personal.speakForReading.mockImplementationOnce(async (_engine, _profileId, _text, opts) => {
                personal._onend = opts?.onend
                return true
            })

            const speech = useTalosSpeech()
            await speech.toggle('m1', 'Ciao')
            expect(speech.speakingId.value).toBe('m1')
            personal._onend?.()
            expect(speech.speakingId.value).toBeNull()
        })
    })

    /**
     * ⛔⛔⛔ 22/8, owner, sentito dal vivo: «quando parlo nella chat e
     * nell'assistente si usa la voce sintetica ma non quella selezionata».
     * `seguiIlTesto` è esattamente `useTalosRispostaAVoce.ts` - "hai
     * parlato ⇒ ti risponde a voce" - e prima di questo fix ignorava
     * `engine:'personal'` di proposito, sempre. Zero copertura esisteva
     * su questa funzione prima di oggi.
     */
    describe('seguiIlTesto() con motore personale', () => {
        it('SEGUI-01 an in-progress chunk emits each complete sentence through the selected personal profile immediately', async () => {
            voiceState.engine = 'personal'
            voiceState.personal_profile_id = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
            personal.speakForReading.mockResolvedValueOnce(true)
            const speech = useTalosSpeech()
            expect(speech.apriLetturaDiVoce('turno', 'chat')).toBe(true)
            await speech.seguiIlTesto('turno', 'Prima frase completa. Sto scrivendo', false)
            expect(personal.speakForReading).toHaveBeenCalledWith(
                'personal', 'a1b2c3d4-e5f6-4789-a012-3456789abcde', 'Prima frase completa.',
                expect.objectContaining({ queue: 'flush', locale: 'it-IT', source: 'chat' }),
            )
            expect(svc.speak).not.toHaveBeenCalled()
        })

        it('SEGUI-02 later personal sentences are bounded and appended to the same native FIFO instead of replacing the first', async () => {
            voiceState.engine = 'personal'
            voiceState.personal_profile_id = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
            personal.speakForReading.mockResolvedValueOnce(true).mockResolvedValueOnce(true)
            const speech = useTalosSpeech()
            expect(speech.apriLetturaDiVoce('turno', 'assistant')).toBe(true)
            await speech.seguiIlTesto('turno', 'Prima frase. Seconda', false)
            await speech.seguiIlTesto('turno', 'Prima frase. Seconda frase.', true)
            expect(personal.speakForReading).toHaveBeenCalledTimes(2)
            expect(personal.speakForReading.mock.calls[0]?.[2]).toBe('Prima frase.')
            expect(personal.speakForReading.mock.calls[0]?.[3]).toEqual(expect.objectContaining({ queue: 'flush' }))
            expect(personal.speakForReading.mock.calls[1]?.[2]).toBe('Seconda frase.')
            expect(personal.speakForReading.mock.calls[1]?.[3]).toEqual(expect.objectContaining({ queue: 'add', locale: 'it-IT', source: 'assistant' }))
            expect(svc.speak).not.toHaveBeenCalled()
        })

        it('SEGUI-03 profile, locale, rate and pitch are immutable after the reading opens', async () => {
            const originalProfile = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
            voiceState.engine = 'personal'
            voiceState.personal_profile_id = originalProfile
            voiceState.personal_rate = 0.95
            voiceState.personal_pitch = 1.05
            i18nState.locale.value = 'it-IT'
            personal.speakForReading.mockResolvedValueOnce(true)
            const speech = useTalosSpeech()
            expect(speech.apriLetturaDiVoce('turno', 'chat')).toBe(true)

            voiceState.personal_profile_id = 'ffffffff-ffff-4fff-afff-ffffffffffff'
            voiceState.personal_rate = 1.4
            voiceState.personal_pitch = 0.7
            i18nState.locale.value = 'en-US'

            await speech.seguiIlTesto('turno', 'La rotta resta italiana.', true)
            expect(personal.speakForReading).toHaveBeenCalledWith(
                'personal', originalProfile, 'La rotta resta italiana.',
                expect.objectContaining({ rate: 0.95, pitch: 1.05, locale: 'it-IT', source: 'chat' }),
            )
        })

        it('AL CONTRARIO: if talosSpeakForReading refuses on the final chunk, it falls back to the system voice on the whole text', async () => {
            voiceState.engine = 'personal'
            voiceState.personal_profile_id = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
            // Default mock already resolves false.
            const speech = useTalosSpeech()
            expect(speech.apriLetturaDiVoce('turno', 'chat')).toBe(true)
            await speech.seguiIlTesto('turno', 'Unica frase.', true)
            expect(personal.speakForReading).toHaveBeenCalledOnce()
            expect(svc.speak).toHaveBeenCalledWith('Unica frase.', expect.anything())
        })

        it('a system-engine reading is unaffected - still speaks phrase by phrase as chunks arrive, exactly as before this fix', async () => {
            voiceState.engine = 'system'
            const speech = useTalosSpeech()
            expect(speech.apriLetturaDiVoce('turno', 'chat')).toBe(true)
            await speech.seguiIlTesto('turno', 'Prima frase completa. Ancora ', false)
            expect(personal.speakForReading).not.toHaveBeenCalled()
            expect(svc.speak).toHaveBeenCalledWith('Prima frase completa.', expect.anything())
        })
    })
})

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
    speakForReading: vi.fn(async (_engine: string, _profileId: string | null, _text: string, opts?: { onend?: () => void }) => {
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
                expect.objectContaining({ rate: 1, pitch: 1 }),
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
})

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
vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({ state: { voice: { voice_uri: 'it-IT-a', rate: 1.1, pitch: 0.9 } } }),
}))

import { useTalosSpeech, __resetTalosSpeechForTests } from '@/composables/useTalosSpeech'

beforeEach(() => {
    __resetTalosSpeechForTests()
    svc.speak.mockClear(); svc.stop.mockClear(); svc._onend = undefined
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
})

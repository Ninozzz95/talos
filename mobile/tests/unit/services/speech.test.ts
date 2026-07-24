import { describe, expect, it, vi } from 'vitest'
import { createTalosSpeechService, type TalosSpeechSynth } from '@/services/speech'

// Owner 2026-07-24: synthesize each assistant reply to voice, selectable
// voices (models) + rate/pitch (tones). Local-first — the device speech
// synthesizer, no backend, offline. The synth is injected for testing.
function fakeSynth(overrides: Partial<TalosSpeechSynth> = {}): {
    synth: TalosSpeechSynth
    spoken: Array<{ text: string; voiceURI?: string; rate: number; pitch: number }>
    cancelled: number
} {
    const spoken: Array<{ text: string; voiceURI?: string; rate: number; pitch: number }> = []
    let cancelled = 0
    const synth: TalosSpeechSynth = {
        getVoices: () => [
            { voiceURI: 'it-IT-a', name: 'Alice (Italian)', lang: 'it-IT' },
            { voiceURI: 'en-US-b', name: 'Bob (US English)', lang: 'en-US' },
        ],
        speak: (u) => { spoken.push({ text: u.text, voiceURI: u.voiceURI, rate: u.rate, pitch: u.pitch }); u.onend?.() },
        cancel: () => { cancelled += 1 },
        ...overrides,
    }
    return { synth, spoken, get cancelled() { return cancelled } }
}

describe('talosSpeechService', () => {
    it('reports supported honestly and lists device voices', () => {
        const { synth } = fakeSynth()
        const speech = createTalosSpeechService(synth)
        expect(speech.supported()).toBe(true)
        expect(speech.voices().map((v) => v.voiceURI)).toEqual(['it-IT-a', 'en-US-b'])
    })

    it('is unsupported when there is no synth (no fake voice)', () => {
        const speech = createTalosSpeechService(null)
        expect(speech.supported()).toBe(false)
        expect(speech.voices()).toEqual([])
    })

    it('speaks with the chosen voice, rate and pitch, cancelling any prior utterance', async () => {
        const fake = fakeSynth()
        const speech = createTalosSpeechService(fake.synth)
        await speech.speak('Ciao mondo', { voiceURI: 'it-IT-a', rate: 1.2, pitch: 0.9 })
        expect(fake.cancelled).toBe(1) // always cancel first so voices never overlap
        expect(fake.spoken).toEqual([{ text: 'Ciao mondo', voiceURI: 'it-IT-a', rate: 1.2, pitch: 0.9 }])
    })

    it('clamps rate and pitch into the safe range and skips empty text', async () => {
        const fake = fakeSynth()
        const speech = createTalosSpeechService(fake.synth)
        await speech.speak('   ', { rate: 5, pitch: -3 })
        expect(fake.spoken).toHaveLength(0) // nothing to say
        await speech.speak('Hi', { rate: 5, pitch: -3 })
        expect(fake.spoken[0]!.rate).toBe(2) // clamp 0.5..2
        expect(fake.spoken[0]!.pitch).toBe(0) // clamp 0..2
    })

    it('stop() cancels the synthesizer', () => {
        const fake = fakeSynth()
        const speech = createTalosSpeechService(fake.synth)
        speech.stop()
        expect(fake.cancelled).toBe(1)
    })
})

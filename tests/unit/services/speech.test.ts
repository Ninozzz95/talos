import { describe, expect, it, vi } from 'vitest'
import { createTalosSpeechService, talosTestoDaLeggere, type TalosSpeechSynth } from '@/services/speech'

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

/* -------------------------------------------------------------------------- *
 * ⛔⛔ IL DIFETTO: l'icona non compariva su NESSUN messaggio
 * -------------------------------------------------------------------------- */

describe('⛔ su Android il motore è il NATIVO, non la Web Speech API', () => {
    /*
     * Owner 2026-08-10: «ogni messaggio di risposta deve avere icona sound per
     * tts». Il pulsante c'era già, tradotto e testato — e non compariva mai.
     *
     * MISURATO nella WebView del Pad:
     *
     *     'speechSynthesis' in window          false
     *     typeof SpeechSynthesisUtterance      undefined
     *     Capacitor.Plugins.TalosSpeech.speak  function
     *
     * La WebView di Android non ha la Web Speech API. `supported()` era quindi
     * sempre falso e il `v-if` cancellava il pulsante, mentre il motore nativo
     * funzionava benissimo — provato lo stesso giorno, `{spoken:true}`.
     */

    it('con un motore c\'è il pulsante; senza NESSUN motore non si promette niente', () => {
        expect(createTalosSpeechService(fakeSynth().synth).supported()).toBe(true)
        expect(createTalosSpeechService(null).supported()).toBe(false)
    })

    it('⛔ il motivo del rifiuto ARRIVA a chi ha premuto, non si perde', async () => {
        /*
         * Col telefono in silenzioso il nativo risponde
         * `{spoken:false, reason:"silenced"}` — si comporta bene. Ma se il
         * motivo non arriva fino al pulsante, chi tocca vede NIENTE: identico a
         * un pulsante rotto.
         */
        const motivi: Array<string | undefined> = []
        const synth: TalosSpeechSynth = {
            getVoices: () => [],
            cancel: () => undefined,
            speak: (u) => { u.onerror?.('silenced') },
        }
        await createTalosSpeechService(synth).speak('ciao', {
            onerror: (reason) => motivi.push(reason),
        })
        expect(motivi, 'il motivo deve essere quello VERO, non un generico').toEqual(['silenced'])
    })

    it('⛔ e la fine della lettura riporta il pulsante indietro — il verso contrario', () => {
        // Senza `onend` l'icona resterebbe «ferma» per sempre: una funzione che
        // va in un verso solo è metà di una funzione.
        let finito = false
        const synth: TalosSpeechSynth = {
            getVoices: () => [],
            cancel: () => undefined,
            speak: (u) => { u.onend?.() },
        }
        void createTalosSpeechService(synth).speak('ciao', { onend: () => { finito = true } })
        expect(finito).toBe(true)
    })
})

describe('⛔ la voce legge il TESTO, non il Markdown', () => {
    /*
     * MISURATO sul Pad il 2026-08-10, spiando cosa arrivava al motore:
     *
     *   TalosSpeech.speak {"text":"Invio a mamma: **“ok”**."}
     *
     * `TextToSpeech` non conosce il Markdown: legge quello che gli dai. Chi
     * ascolta sente «asterisco asterisco ok asterisco asterisco».
     */
    it.each([
        ['**ok**', 'ok'],
        ['_forse_', 'forse'],
        ['`codice`', 'codice'],
        ['# Titolo', 'Titolo'],
        ['- primo', 'primo'],
        ['> citazione', 'citazione'],
        ['[TALOS](https://esempio.test/pagina)', 'TALOS'],
    ])('%s si legge «%s»', (grezzo, atteso) => {
        expect(talosTestoDaLeggere(grezzo)).toBe(atteso)
    })

    it('la frase vera del Pad perde gli asterischi e tiene le parole', () => {
        expect(talosTestoDaLeggere('Invio a mamma: **“ok”**.\n\nRisposto a mamma: **“ok”**.'))
            .toBe('Invio a mamma: “ok”.\n\nRisposto a mamma: “ok”.')
    })

    it('⛔ e il testo arriva al motore GIÀ ripulito, non ripulito altrove', () => {
        // Se la pulizia stesse nel componente, ogni nuovo punto di chiamata
        // dovrebbe ricordarsene — e uno se ne dimenticherebbe.
        const visti: string[] = []
        const synth: TalosSpeechSynth = {
            getVoices: () => [],
            cancel: () => undefined,
            speak: (u) => { visti.push(u.text) },
        }
        void createTalosSpeechService(synth).speak('**grassetto** e `codice`')
        expect(visti).toEqual(['grassetto e codice'])
    })

    it('⛔ senza motore si DICE, non si tace', () => {
        const motivi: Array<string | undefined> = []
        void createTalosSpeechService(null).speak('ciao', { onerror: (r) => motivi.push(r) })
        expect(motivi).toEqual(['unavailable'])
    })
})

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⛔⛔⛔ 22/8, owner, in due bug diversi sentiti DAL VIVO sul dispositivo,
 * entrambi dentro `talosNativeSpeechSynth()` - il wrapper del motore TTS di
 * SISTEMA nativo (`TalosSpeechPlugin`), che `speech.test.ts` non tocca
 * affatto (quel file inietta un `TalosSpeechSynth` finto, mai questa
 * funzione). Zero copertura esisteva su questo file prima di oggi.
 */
const bridge = vi.hoisted(() => ({
    voices: vi.fn(),
    setVoice: vi.fn(),
    speak: vi.fn(),
    stop: vi.fn(),
    addListener: vi.fn(async () => ({ remove: vi.fn(async () => {}) })),
}))

vi.mock('@capacitor/core', () => ({
    Capacitor: {
        isNativePlatform: () => true,
        isPluginAvailable: () => true,
    },
    registerPlugin: () => bridge,
}))

const { talosNativeSpeechSynth } = await import('@/services/speech')

const IT_LOCAL = { name: 'it-it-x-itc-local', locale: 'it-IT', quality: 400, latency: 200, network: false, notInstalled: false }
const IT_NETWORK = { name: 'it-it-x-itb-network', locale: 'it-IT', quality: 400, latency: 200, network: true, notInstalled: false }

beforeEach(() => {
    bridge.voices.mockReset()
    bridge.setVoice.mockReset()
    bridge.speak.mockReset().mockResolvedValue({ spoken: true })
    bridge.stop.mockReset()
    document.documentElement.lang = 'it-IT'
})

describe('talosNativeSpeechSynth() — il motore di sistema nativo', () => {
    /**
     * ⛔⛔⛔ Owner, sentito dal vivo: «ho sentito una voce di default, non
     * quella selezionata». MISURATO sul Pad: `plugin.voices().current` era
     * la generica mentre la preferenza salvata era una voce di rete
     * nominata - `setVoice` per una voce di rete può rifiutare, e l'esito
     * veniva scartato senza essere letto: `speak()` procedeva comunque
     * sulla voce rimasta impostata da PRIMA. Silenzioso, nessun errore.
     */
    it('SPEECH-VOICE-01 when setVoice refuses the chosen network voice, it retries once with a non-network fallback before speaking', async () => {
        bridge.voices.mockResolvedValue({ available: true, voices: [IT_LOCAL, IT_NETWORK], current: 'it-IT-language' })
        bridge.setVoice.mockResolvedValueOnce({ done: false, reason: 'refused' }) // la voce di rete scelta: RIFIUTATA
        bridge.setVoice.mockResolvedValueOnce({ done: true }) // il ripiego locale: accettato

        const synth = talosNativeSpeechSynth()
        expect(synth).not.toBeNull()
        synth!.speak({ text: 'Ciao', voiceURI: IT_NETWORK.name, rate: 1, pitch: 1 })
        // ⛔ `speak()` non chiama MAI onend/onerror da sola per un esito
        // riuscito (`{spoken:true}`) - quello arriva solo dall'evento
        // nativo `talosSpeechDone`, che questo mock non simula. Si aspetta
        // l'effetto osservabile vero (`bridge.speak` chiamato), non un
        // callback che in questo scenario non arriverebbe mai.
        await vi.waitFor(() => expect(bridge.speak).toHaveBeenCalled())

        expect(bridge.setVoice).toHaveBeenCalledTimes(2)
        expect(bridge.setVoice).toHaveBeenNthCalledWith(1, { name: IT_NETWORK.name }) // prova prima la scelta vera
        expect(bridge.setVoice).toHaveBeenNthCalledWith(2, { name: IT_LOCAL.name }) // poi il ripiego onesto, rete:false
        expect(bridge.speak).toHaveBeenCalledTimes(1) // parla comunque, una volta sola, dopo il ripiego
    })

    it('AL CONTRARIO: when setVoice succeeds on the first try, there is no second call - no superfluous fallback', async () => {
        bridge.voices.mockResolvedValue({ available: true, voices: [IT_LOCAL, IT_NETWORK], current: 'it-IT-language' })
        bridge.setVoice.mockResolvedValueOnce({ done: true })

        const synth = talosNativeSpeechSynth()
        synth!.speak({ text: 'Ciao', voiceURI: IT_NETWORK.name, rate: 1, pitch: 1 })
        await vi.waitFor(() => expect(bridge.speak).toHaveBeenCalled())

        expect(bridge.setVoice).toHaveBeenCalledTimes(1)
    })

    /**
     * ⛔⛔⛔ Owner, sentito dal vivo: «la voce di default si sente solo subito
     * dopo aver riaperto l'app; se resta aperta cambia al secondo
     * tentativo». MISURATO: il primo caricamento (`plugin.voices()`)
     * partiva senza che nessuno lo aspettasse - la primissima `speak()` di
     * ogni avvio poteva arrivare prima che si risolvesse, trovare l'elenco
     * ancora vuoto, e saltare `setVoice` del tutto.
     */
    it('SPEECH-VOICE-02 the very first speak() waits for the pending voice list before choosing, instead of running against an empty list', async () => {
        let risolviCaricamento!: (value: { available: boolean, voices: typeof IT_LOCAL[], current: string }) => void
        bridge.voices.mockReturnValue(new Promise((resolve) => { risolviCaricamento = resolve }))
        bridge.setVoice.mockResolvedValue({ done: true })

        const synth = talosNativeSpeechSynth()
        synth!.speak({ text: 'Ciao', voiceURI: IT_NETWORK.name, rate: 1, pitch: 1 })

        // ⛔ AL CONTRARIO, la prova che conta: finché il caricamento non è
        // risolto, `setVoice` non deve essere stato chiamato affatto - se lo
        // fosse già, vorrebbe dire che la scelta è avvenuta contro un elenco
        // vuoto, esattamente il difetto.
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
        expect(bridge.setVoice).not.toHaveBeenCalled()

        risolviCaricamento({ available: true, voices: [IT_LOCAL, IT_NETWORK], current: 'it-IT-language' })
        await vi.waitFor(() => expect(bridge.setVoice).toHaveBeenCalled())

        expect(bridge.setVoice).toHaveBeenCalledWith({ name: IT_NETWORK.name })
    })

    it('AL CONTRARIO: once the voice list has already loaded, a second speak() never re-awaits or reloads it', async () => {
        bridge.voices.mockResolvedValue({ available: true, voices: [IT_LOCAL, IT_NETWORK], current: 'it-IT-language' })
        bridge.setVoice.mockResolvedValue({ done: true })

        const synth = talosNativeSpeechSynth()
        synth!.speak({ text: 'Uno', voiceURI: IT_NETWORK.name, rate: 1, pitch: 1 })
        await vi.waitFor(() => expect(bridge.speak).toHaveBeenCalledTimes(1))
        synth!.speak({ text: 'Due', voiceURI: IT_NETWORK.name, rate: 1, pitch: 1 })
        await vi.waitFor(() => expect(bridge.speak).toHaveBeenCalledTimes(2))

        expect(bridge.voices).toHaveBeenCalledTimes(1)
    })
})

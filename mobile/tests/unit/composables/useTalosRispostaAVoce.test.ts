import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

const speech = vi.hoisted(() => ({
    speakingId: { value: null as string | null },
    open: vi.fn<(id: string, source: 'chat' | 'assistant') => boolean>(),
    follow: vi.fn(async () => {}),
    rename: vi.fn(),
    mark: vi.fn(),
}))

vi.mock('@/composables/useTalosSpeech', () => ({
    useTalosSpeech: () => ({
        speakingId: speech.speakingId,
        apriLetturaDiVoce: speech.open,
        seguiIlTesto: speech.follow,
        rinominaLettura: speech.rename,
        segnaLetta: speech.mark,
    }),
}))

const provenance = vi.hoisted(() => ({
    dettatura: vi.fn(),
    aggiornaBozza: vi.fn(),
    nataDiVoce: vi.fn(() => true),
    azzera: vi.fn(),
}))
vi.mock('@/lib/voice/provenienzaVoce', () => ({ talosProvenienzaVoce: () => provenance }))
vi.mock('@/services/dictationCasa', () => ({
    talosLingueDichiarate: vi.fn(async () => ({ preferred: 'it-IT', languages: ['it-IT'] })),
}))
vi.mock('@/lib/voice/lingueDaAscoltare', () => ({
    talosLingueDaAscoltare: vi.fn(() => ['it-IT']),
}))

import { useTalosRispostaAVoce } from '@/composables/useTalosRispostaAVoce'

beforeEach(() => {
    speech.speakingId.value = null
    speech.open.mockReset()
    speech.open.mockImplementation((id) => {
        speech.speakingId.value = id
        return true
    })
    speech.follow.mockClear()
    speech.rename.mockClear()
    speech.mark.mockClear()
    provenance.nataDiVoce.mockReturnValue(true)
})

describe('useTalosRispostaAVoce production source route', () => {
    for (const source of ['chat', 'assistant'] as const) {
        it(`VOICE-SOURCE-${source} preserves ${source} when opening the streamed reading`, async () => {
            const streaming = ref<string | null>(null)
            const response = useTalosRispostaAVoce({
                source,
                streaming: () => streaming.value,
                messaggi: () => [],
                interfaccia: () => 'it-IT',
            })
            expect(response.catturaInvio()).toBe(true)

            streaming.value = 'Prima frase italiana.'
            await nextTick()

            expect(speech.open).toHaveBeenCalledWith('voce:in-corso', source)
            expect(speech.follow).toHaveBeenCalledWith('voce:in-corso', 'Prima frase italiana.', false)
        })
    }
})

/**
 * ⛔ VOICE-BUFFERED — trovato dall'owner il 13/10/2026 sul Pad, nella barra dell'assistente: «la voce non parte
 * automaticamente, parte solo quando premo il pulsante». Riprodotto e strumentato dal vivo: la domanda era «nata di voce»,
 * ma la risposta (fornitore ChatGPT) arrivava TUTTA INSIEME, senza mai passare dal testo in arrivo — e la lettura
 * automatica si apriva solo su quello. Una risposta arrivata intera si legge lo stesso, appena il suo messaggio esiste.
 */
describe('useTalosRispostaAVoce: la risposta arrivata tutta insieme', () => {
    type Messaggio = { id: string; role: string; content?: string }

    it('VOICE-BUFFERED-01: senza testo in arrivo, il messaggio nuovo dell assistente si legge per intero', async () => {
        const streaming = ref<string | null>(null)
        const messaggi = ref<Messaggio[]>([{ id: 'a0', role: 'assistant', content: 'Risposta vecchia.' }])
        const voce = useTalosRispostaAVoce({ source: 'assistant', streaming: () => streaming.value, messaggi: () => messaggi.value, interfaccia: () => 'it-IT' })
        expect(voce.catturaInvio()).toBe(true)

        messaggi.value = [...messaggi.value, { id: 'u1', role: 'user', content: 'Che tempo fa?' }]
        await nextTick()
        expect(speech.open).not.toHaveBeenCalled()

        messaggi.value = [...messaggi.value, { id: 'a1', role: 'assistant', content: 'Domani a Messina piove.' }]
        await nextTick()
        expect(speech.open).toHaveBeenCalledWith('voce:in-corso', 'assistant')
        expect(speech.follow).toHaveBeenCalledWith('voce:in-corso', 'Domani a Messina piove.', true)
        expect(speech.mark).toHaveBeenCalledWith('a1')
        expect(speech.rename).toHaveBeenCalledWith('voce:in-corso', 'a1')

        // una volta sola: un altro messaggio dopo non riapre niente
        speech.speakingId.value = null
        speech.open.mockClear()
        messaggi.value = [...messaggi.value, { id: 'a2', role: 'assistant', content: 'Altro.' }]
        await nextTick()
        expect(speech.open).not.toHaveBeenCalled()
    })

    it('VOICE-BUFFERED-02 AL CONTRARIO: una domanda scritta non fa leggere niente, e una risposta già letta mentre arrivava non si rilegge', async () => {
        const streaming = ref<string | null>(null)
        const messaggi = ref<Messaggio[]>([])
        const voce = useTalosRispostaAVoce({ source: 'chat', streaming: () => streaming.value, messaggi: () => messaggi.value, interfaccia: () => 'it-IT' })

        provenance.nataDiVoce.mockReturnValue(false)
        expect(voce.catturaInvio()).toBe(false)
        messaggi.value = [{ id: 'a1', role: 'assistant', content: 'Scritta, non detta.' }]
        await nextTick()
        expect(speech.open).not.toHaveBeenCalled()

        provenance.nataDiVoce.mockReturnValue(true)
        expect(voce.catturaInvio()).toBe(true)
        streaming.value = 'Arrivo a pezzi.'
        await nextTick()
        expect(speech.open).toHaveBeenCalledTimes(1)
        messaggi.value = [...messaggi.value, { id: 'a2', role: 'assistant', content: 'Arrivo a pezzi.' }]
        streaming.value = null
        await nextTick()
        expect(speech.open).toHaveBeenCalledTimes(1)
        expect(speech.follow).not.toHaveBeenCalledWith('voce:in-corso', 'Arrivo a pezzi.', true, expect.anything())
        expect(speech.follow.mock.calls.filter((c) => (c as unknown[])[2] === true)).toHaveLength(1)
    })

    it('VOICE-BUFFERED-03: un messaggio dell assistente ancora senza testo (sta usando un attrezzo) non chiude l attesa', async () => {
        const messaggi = ref<Messaggio[]>([])
        const voce = useTalosRispostaAVoce({ source: 'assistant', streaming: () => null, messaggi: () => messaggi.value, interfaccia: () => 'it-IT' })
        expect(voce.catturaInvio()).toBe(true)
        messaggi.value = [{ id: 'a1', role: 'assistant', content: '   ' }]
        await nextTick()
        expect(speech.open).not.toHaveBeenCalled()
        messaggi.value = [...messaggi.value, { id: 'a2', role: 'assistant', content: 'Ecco la risposta.' }]
        await nextTick()
        expect(speech.follow).toHaveBeenCalledWith('voce:in-corso', 'Ecco la risposta.', true)
    })
})

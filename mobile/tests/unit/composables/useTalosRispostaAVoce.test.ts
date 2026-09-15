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

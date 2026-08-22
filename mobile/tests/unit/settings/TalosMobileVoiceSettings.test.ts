// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

// Cleanup pass 2026-07-24: the voice picker was the only Settings dropdown on a
// raw native <select>; it now uses the shared TalosThemedSelect for coherence.
// This locks that: no native <select>, the themed trigger renders the
// device-default label.
const service = vi.hoisted(() => ({
    supported: vi.fn(() => true),
    voices: vi.fn(() => [{ voiceURI: 'v1', name: 'Aria', lang: 'en-US' }]),
    speak: vi.fn(),
    stop: vi.fn(),
}))
const settings = vi.hoisted(() => ({
    state: {
        voice: {
            voice_uri: null as string | null,
            rate: 1,
            pitch: 1,
            dictation_language: 'system',
        },
    },
    setVoicePreferences: vi.fn(),
}))
vi.mock('@/services/speech', () => ({
    useTalosSpeechService: () => service,
}))
vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => settings,
}))

import TalosMobileVoiceSettings from '@/components/talos/settings/TalosMobileVoiceSettings.vue'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'

beforeEach(() => {
    service.supported.mockReturnValue(true)
    settings.state.voice.dictation_language = 'system'
    settings.setVoicePreferences.mockClear()
})

describe('TalosMobileVoiceSettings', () => {
    it('renders the voice section on a supported device with the shared themed select (no native <select>)', async () => {
        const wrapper = mount(TalosMobileVoiceSettings)
        await flushPromises()
        expect(wrapper.get('[data-testid="talos-voice-settings"]')).toBeTruthy()
        expect(wrapper.find('select').exists()).toBe(false)
        const trigger = wrapper.get(
            '[data-testid="talos-tts-controls"] [data-testid="talos-themed-select-trigger"]',
        )
        /*
         * ⛔ NON piu' «Device default» — owner 2026-08-11: «togli la voce
         * predefinita e mantieni solo la prima e l'ultima voce (rete)».
         *
         * Tolta quella riga, il menu' deve mostrare una VOCE VERA anche prima
         * che qualcuno scelga. ⛔ 2026-08-22: NON e' piu' «la prima delle
         * offerte» (`voiceItems[0]`, rete-dipendente) — quella era proprio il
         * Rilievo 3: online, poteva essere una voce di rete che il pulsante
         * play non avrebbe mai usato. Ora e' `voceDiRipiego`, calcolata con la
         * STESSA preferenza (`rete: false`) di `voceFissa()` in
         * `useTalosSpeech.ts`. Vedi `PVOICE-DEFAULT-01` sotto per la prova
         * della divergenza che c'era.
         */
        expect(trigger.text()).not.toContain('Device default')
        expect(trigger.text().trim().length).toBeGreaterThan(0)
    })

    it('DICT-UI-01 keeps dictation language available when speech synthesis is unsupported', () => {
        service.supported.mockReturnValueOnce(false)
        const wrapper = mount(TalosMobileVoiceSettings)
        expect(wrapper.find('[data-testid="talos-voice-settings"]').exists()).toBe(true)
        // ⛔ Si guardano le VOCI del menu', non il testo reso: il selettore
        // finto disegna solo l'etichetta scelta, e cercare li' dentro
        // proverebbe che c'e' un'etichetta — non QUALI scelte esistono.
        const voci = wrapper.findAllComponents(TalosThemedSelect)[0]?.props('items') as
            { value: string }[]
        expect(voci[0]?.value).toBe('auto')
        expect(wrapper.find('[data-testid="talos-voice-preview"]').exists()).toBe(false)

        wrapper.findAllComponents(TalosThemedSelect)[0]?.vm.$emit('update:modelValue', 'it-IT')
        expect(settings.setVoicePreferences).toHaveBeenCalledWith({ dictation_language: 'it-IT' })
    })

    /**
     * ⛔⛔ Rilievo 3, owner 2026-08-22: «parte di default una voce predefinita
     * che non è nella lista voci nel impostazioni della voce relative».
     *
     * MISURATO nel codice (non uno scenario inventato): `voiceItems` è
     * calcolato con `rete: navigator.onLine !== false` (online, la neurale
     * batte la locale — regola 2 di `talosVociOrdinate`), mentre
     * `voceFissa()` in `useTalosSpeech.ts` — quella che parla DAVVERO quando
     * si preme play su un messaggio — usa `rete: false` fisso apposta (voce
     * di rete = timbro che cambia a metà lettura). Con una voce nominata di
     * rete E una locale entrambe disponibili, online, il menù mostrava la
     * prima e il pulsante play ne diceva un'altra.
     */
    it('PVOICE-DEFAULT-01 the shown/previewed default is the SAME voice toggle() would speak (rete:false), never a network voice that only wins online', async () => {
        expect(navigator.onLine).not.toBe(false) // jsdom: online di default, come sul telefono con dati
        service.voices.mockReturnValueOnce([
            // Nominata di rete: vince l'ordinamento SOLO se rete:true.
            { voiceURI: 'it-it-x-itb-network', name: 'Itb · rete', lang: 'it-IT' },
            // Nominata locale: e' l'UNICA che sopravvive con rete:false.
            { voiceURI: 'it-it-x-itc-local', name: 'Itc', lang: 'it-IT' },
        ])
        document.documentElement.lang = 'it-IT'
        const wrapper = mount(TalosMobileVoiceSettings)
        await flushPromises()

        const trigger = wrapper.get(
            '[data-testid="talos-tts-controls"] [data-testid="talos-themed-select-trigger"]',
        )
        expect(trigger.text()).toContain('Itc')
        expect(trigger.text()).not.toContain('Itb')

        // L'anteprima deve parlare la stessa voce mostrata, non una terza.
        wrapper.get('[data-testid="talos-voice-preview"]').trigger('click')
        expect(service.speak).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ voiceURI: 'it-it-x-itc-local' }),
        )

        // La voce di rete resta SELEZIONABILE (una scelta esplicita puo'
        // ancora prenderla): solo il default non e' lei. Scoping su
        // "talos-tts-controls": l'indice [0] fra tutti i TalosThemedSelect
        // e' il selettore della LINGUA di dettatura, non quello delle voci.
        const voci = wrapper.get('[data-testid="talos-tts-controls"]')
            .findComponent(TalosThemedSelect).props('items') as { value: string }[]
        expect(voci.some((v) => v.value === 'it-it-x-itb-network')).toBe(true)
    })
})

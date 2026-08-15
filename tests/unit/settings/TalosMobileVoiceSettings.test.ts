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
         * che qualcuno scelga: la prima delle offerte, che e' esattamente
         * quella che il motore userebbe da solo. Un menu' vuoto sarebbe stato
         * il difetto introdotto dalla richiesta, e questa riga lo vieta.
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
})

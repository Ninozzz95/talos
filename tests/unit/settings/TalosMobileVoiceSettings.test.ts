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

/*
 * ⛔ Prima di Fase 5 Blocco 3c questo file non mockava
 * `@/services/personalVoice` per niente: il modulo VERO gira in jsdom,
 * `registerPlugin` non trova un ponte nativo, e il `try/catch` già dentro
 * `talosPersonalVoiceStatus` torna `supported:false` da solo — motivo per
 * cui ogni test qui ha sempre visto la sezione "non supportata" (ora:
 * "installa") senza che nessuno l'avesse deciso apposta. Il mock esplicito
 * rende ENTRAMBI gli stati controllabili invece di uno solo per caso.
 */
const personalVoice = vi.hoisted(() => ({
    status: vi.fn(async () => ({ supported: false, installed: false, ready: false, active: false })),
    profiles: vi.fn(async () => []),
    renameProfile: vi.fn(async () => undefined),
    deleteProfile: vi.fn(async () => undefined),
}))
vi.mock('@/services/personalVoice', () => ({
    talosPersonalVoiceStatus: personalVoice.status,
    talosPersonalVoiceProfiles: personalVoice.profiles,
    talosRenamePersonalVoiceProfile: personalVoice.renameProfile,
    talosDeletePersonalVoiceProfile: personalVoice.deleteProfile,
}))

const voiceModelInstall = vi.hoisted(() => ({
    install: vi.fn(),
}))
vi.mock('@/services/voiceModelInstall', () => ({
    talosInstallPersonalVoiceModel: voiceModelInstall.install,
}))

import TalosMobileVoiceSettings from '@/components/talos/settings/TalosMobileVoiceSettings.vue'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'

beforeEach(() => {
    service.supported.mockReturnValue(true)
    settings.state.voice.dictation_language = 'system'
    // ⛔ PVOICE-SELECT-01 lo valorizza per simulare una scelta esplicita: se
    // un test fallisse PRIMA della sua riga di reset in fondo, il valore
    // resterebbe sporco per ogni test dopo di lui nello stesso file.
    settings.state.voice.voice_uri = null
    settings.setVoicePreferences.mockClear()
    personalVoice.status.mockClear().mockResolvedValue({ supported: false, installed: false, ready: false, active: false })
    personalVoice.profiles.mockClear().mockResolvedValue([])
    voiceModelInstall.install.mockReset()
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

    /**
     * ⛔⛔ Rilievo 3 (seguito), owner 2026-08-22, ispezionato sullo schermo
     * reale: il trigger mostrava «Select an option» — non il placeholder per
     * mancanza di scelta, ma perché la voce SCELTA (esplicita, non il
     * ripiego) era stata esclusa dall'elenco offerto online. Diverso da
     * `PVOICE-DEFAULT-01` sopra: lì nessuno aveva ancora scelto, qui una
     * persona ha selezionato una voce locale a mano (`settings.state.voice.voice_uri`
     * valorizzato) e poi la rete si è accesa - `voiceItems` (rete-dipendente)
     * l'ha fatta cadere fuori dalle "prima e ultima delle prime tre".
     * `TalosThemedSelect` mostra onestamente il placeholder quando il suo
     * `modelValue` non è fra le `items` — il difetto stava nel non
     * ricostituire quella voce nell'elenco, non nel selettore.
     */
    it('PVOICE-SELECT-01 backfills an explicitly-chosen voice that online network-ordering pushed out of the offered list, instead of falling back to the placeholder', async () => {
        expect(navigator.onLine).not.toBe(false) // jsdom: online di default, come sul telefono con dati
        service.voices.mockReturnValueOnce([
            // Tre nominate di rete: con la rete accettata vincono tutte e tre
            // l'ordinamento (regola 2 di `talosVociOrdinate`), e
            // `talosVociOfferte` tiene solo prima e ultima delle prime tre -
            // la locale sotto resta fuori da ENTRAMBE.
            { voiceURI: 'it-it-x-itb-network', name: 'Itb · rete', lang: 'it-IT' },
            { voiceURI: 'it-it-x-itc-network', name: 'Itc · rete', lang: 'it-IT' },
            { voiceURI: 'it-it-x-itd-network', name: 'Itd · rete', lang: 'it-IT' },
            // La voce scelta ESPLICITAMENTE dalla persona, locale.
            { voiceURI: 'it-it-x-ite-local', name: 'Ite', lang: 'it-IT' },
        ])
        document.documentElement.lang = 'it-IT'
        settings.state.voice.voice_uri = 'it-it-x-ite-local'

        const wrapper = mount(TalosMobileVoiceSettings)
        await flushPromises()

        const trigger = wrapper.get(
            '[data-testid="talos-tts-controls"] [data-testid="talos-themed-select-trigger"]',
        )
        expect(trigger.text()).toContain('Ite')
        expect(trigger.text()).not.toContain('Select an option')

        const voci = wrapper.get('[data-testid="talos-tts-controls"]')
            .findComponent(TalosThemedSelect).props('items') as { value: string }[]
        expect(voci.some((v) => v.value === 'it-it-x-ite-local')).toBe(true)

        settings.state.voice.voice_uri = null
    })
})

/**
 * ⭐⭐⭐ FASE 5, BLOCCO 3c — il bottone che scarica il motore.
 *
 * Prima di questo blocco la sezione spariva del tutto quando
 * `personalVoiceSupported` era falso (nessun installer esisteva). Ora offre
 * di scaricarlo — questi test provano che lo fa davvero, segue
 * l'avanzamento, e non finge un successo che l'attivazione nativa ha
 * rifiutato.
 */
describe('TalosMobileVoiceSettings — installare il motore voce (Fase 5)', () => {
    it('shows the install button, not the create-voice button, when the model is not present', async () => {
        const wrapper = mount(TalosMobileVoiceSettings)
        await flushPromises()
        expect(wrapper.find('[data-testid="talos-personal-voice-install"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-personal-voice-install-start"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-personal-voice-create"]').exists()).toBe(false)
    })

    it('shows the create-voice button, not the install button, once the model IS present', async () => {
        personalVoice.status.mockResolvedValue({ supported: true, installed: true, ready: true, active: false })
        const wrapper = mount(TalosMobileVoiceSettings)
        await flushPromises()
        expect(wrapper.find('[data-testid="talos-personal-voice-install"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-personal-voice-create"]').exists()).toBe(true)
    })

    it('tapping install calls the real orchestrator, and follows its progress', async () => {
        let onProgress: ((p: unknown) => void) | undefined
        voiceModelInstall.install.mockImplementation(async (cb: (p: unknown) => void) => {
            onProgress = cb
            return new Promise(() => {}) // resta in corso per il resto del test
        })
        const wrapper = mount(TalosMobileVoiceSettings)
        await flushPromises()

        await wrapper.get('[data-testid="talos-personal-voice-install-start"]').trigger('click')
        await flushPromises()
        expect(voiceModelInstall.install).toHaveBeenCalledTimes(1)

        onProgress?.({ phase: 'downloading', haveBytes: 300, totalBytes: 1_000 })
        await flushPromises()
        expect(wrapper.get('[data-testid="talos-personal-voice-install-progress"]').text()).toContain('30')

        // ⛔ Il bottone deve dire «sto scaricando», e non essere ripremibile
        // - un secondo tocco avvierebbe un secondo download dello stesso
        // motore mentre il primo è ancora in corso.
        const button = wrapper.get('[data-testid="talos-personal-voice-install-start"]')
        expect((button.element as HTMLButtonElement).disabled).toBe(true)
        await button.trigger('click')
        expect(voiceModelInstall.install).toHaveBeenCalledTimes(1)
    })

    it('shows the activation message once the download itself is done', async () => {
        let onProgress: ((p: unknown) => void) | undefined
        voiceModelInstall.install.mockImplementation(async (cb: (p: unknown) => void) => {
            onProgress = cb
            return new Promise(() => {})
        })
        const wrapper = mount(TalosMobileVoiceSettings)
        await flushPromises()
        await wrapper.get('[data-testid="talos-personal-voice-install-start"]').trigger('click')
        // ⛔ `trigger('click')` aspetta solo il primo giro di reattività
        // dell'handler, non l'intera catena `await import()` +
        // `talosInstallPersonalVoiceModel(...)` che assegna `onProgress` —
        // un `flushPromises()` qui manca, `onProgress` è ancora `undefined`
        // al punto in cui il test lo chiamerebbe, e la chiamata sparisce in
        // silenzio dietro `?.()`. Trovato da questo stesso test in rosso.
        await flushPromises()
        onProgress?.({ phase: 'activating' })
        await flushPromises()
        // ⛔ Il locale di default in questa suite è l'inglese (vedi le altre
        // asserzioni testuali del file, es. "Device default" sopra) — non
        // l'italiano dei commenti.
        expect(wrapper.find('[data-testid="talos-personal-voice-install"]').text()).toContain('Last step')
    })

    /**
     * ⛔⛔ AL CONTRARIO — la sezione che conta di più: un download che
     * SPARISCE dalla lista dei trasferimenti senza che l'attivazione nativa
     * abbia davvero confermato i file non deve mai passare per un successo.
     */
    it('on failure keeps showing install (not create), with the error and a retry available', async () => {
        voiceModelInstall.install.mockResolvedValueOnce({ ok: false, reason: 'not-activated' })
        const wrapper = mount(TalosMobileVoiceSettings)
        await flushPromises()
        await wrapper.get('[data-testid="talos-personal-voice-install-start"]').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="talos-personal-voice-install-error"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-personal-voice-create"]').exists()).toBe(false)
        const button = wrapper.get('[data-testid="talos-personal-voice-install-start"]')
        expect((button.element as HTMLButtonElement).disabled).toBe(false)

        // Riprovare chiama di nuovo l'orchestratore vero, non un tocco morto.
        voiceModelInstall.install.mockResolvedValueOnce({ ok: true })
        await button.trigger('click')
        await flushPromises()
        expect(voiceModelInstall.install).toHaveBeenCalledTimes(2)
        expect(wrapper.find('[data-testid="talos-personal-voice-install"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-personal-voice-create"]').exists()).toBe(true)
    })

    it('a native/web plugin failure (a thrown rejection) shows the SAME honest error, not a crash', async () => {
        voiceModelInstall.install.mockRejectedValueOnce(new Error('plugin not implemented'))
        const wrapper = mount(TalosMobileVoiceSettings)
        await flushPromises()
        await wrapper.get('[data-testid="talos-personal-voice-install-start"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="talos-personal-voice-install-error"]').exists()).toBe(true)
    })
})

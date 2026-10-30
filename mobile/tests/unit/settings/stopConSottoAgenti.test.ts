// @vitest-environment jsdom

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { createTalosI18n } from '@/i18n'
import { __resetSettingsStoreForTests, useSettingsStore } from '@/stores/settings'
import { leggiPreferenzaStopR4 } from '@/lib/harness/r4/fermaTuttoR4'
import AiDefaults from '@/components/talos/settings/TalosMobileSettingsAiDefaultsPanel.vue'

/*
 * ⛔ «Ferma tutto» (owner 29/10/2026; scheda `mockup/ferma-tutto/pezzi/SCHEDA-DI-CONSEGNA.md`, voce 6; ledger, riga 16): la preferenza
 * `stopConSottoAgenti` del contratto, nelle preferenze del dispositivo come `shell.stop_con_sotto_agenti` ('chiedi' di serie), in
 * «Preferenze AI» dopo il tono col pezzo `TalosMobileSettingsStopAgenti`. Si salva e si rilegge riaprendo l'app; un valore rotto è «chiedi».
 */
vi.mock('@/stores/chatController', () => ({ useChatController: () => ({ selectedProfile: ref(null) }) }))

type Composer = { locale: { value: string } }
let lingua = 'en'
beforeAll(async () => {
    const global = (await createTalosI18n()).global as unknown as Composer
    lingua = global.locale.value
    global.locale.value = 'it'
})
afterAll(async () => {
    ((await createTalosI18n()).global as unknown as Composer).locale.value = lingua
})
const wrappers: VueWrapper[] = []
beforeEach(() => {
    localStorage.clear()
    __resetSettingsStoreForTests()
})
afterEach(() => {
    for (const w of wrappers.splice(0)) w.unmount()
    document.body.replaceChildren()
})

describe('FT-SET — «Stop con agenti al lavoro» nelle Preferenze AI', () => {
    it('FT-SET-01 di serie «chiedi»; la scelta si salva e resta riaprendo l\'app', async () => {
        const settings = useSettingsStore()
        expect(settings.state.shell.stop_con_sotto_agenti).toBe('chiedi')
        await settings.setShell({ stop_con_sotto_agenti: 'tutte' })
        expect(settings.state.shell.stop_con_sotto_agenti).toBe('tutte')
        __resetSettingsStoreForTests()
        await useSettingsStore().hydrate()
        expect(useSettingsStore().state.shell.stop_con_sotto_agenti).toBe('tutte')
    })

    it('FT-SET-02 un valore rotto sul disco è «chiedi», come `leggiPreferenzaStopR4`', async () => {
        for (const valore of ['solo-chat', 'tutte', 'chiedi', 'TUTTE', 'nessuna', 3, null, undefined]) {
            const settings = useSettingsStore()
            await settings.setShell({ stop_con_sotto_agenti: valore } as never)
            expect(settings.state.shell.stop_con_sotto_agenti, String(valore)).toBe(leggiPreferenzaStopR4(valore))
        }
    })

    it('FT-SET-03 il pannello mostra il gruppo radio dopo il tono, con la scelta salvata; un tocco la cambia', async () => {
        const settings = useSettingsStore()
        await settings.setShell({ stop_con_sotto_agenti: 'solo-chat' })
        const w = mount(AiDefaults, { attachTo: document.body, global: { stubs: { TalosThemedSelect: true } } })
        wrappers.push(w)
        await flushPromises()
        const gruppo = w.get('[data-testid="talos-settings-stop-agenti"]')
        expect(gruppo.text()).toContain('Stop con agenti al lavoro')
        const radio = gruppo.findAll('[role="radio"]')
        expect(radio.map((r) => r.attributes('aria-checked'))).toEqual(['false', 'false', 'true'])
        await radio[0]!.trigger('click')
        await flushPromises()
        expect(settings.state.shell.stop_con_sotto_agenti).toBe('chiedi')
        // dopo il tono: la sezione del tono viene prima nel pannello
        const html = w.html()
        expect(html.indexOf('talos-settings-stop-agenti')).toBeGreaterThan(html.indexOf(w.get('label').html().slice(0, 30)))
    })
})

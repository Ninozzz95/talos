// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useTalosGuardaChat } from '@/composables/useTalosGuardaChat'
import { __talosNovitaPerLeProve, talosChatGuardata, talosRegistroNovita } from '@/stores/chatNovita'

/**
 * A3-84 seconda parte (owner 25/09): la schermata della chat dice quale chat stai GUARDANDO, e ogni risposta che
 * arriva sotto i tuoi occhi la segna vista — così «nuova risposta» vale solo per ciò che è arrivato mentre eri altrove.
 */
function controllerFinto() {
    return {
        chat: {
            activeSession: ref<{ id: string } | null>({ id: 'a' }),
            messages: reactive([{ state: 'persisted' }] as Array<{ state: string }>),
            history: reactive([{ id: 'a' }, { id: 'b' }] as Array<{ id: string }>),
        },
    }
}

const visibile = ref(true)
function monta(controller: ReturnType<typeof controllerFinto>) {
    return mount(defineComponent({ setup() { useTalosGuardaChat(controller, visibile); return () => h('div') } }))
}

afterEach(() => { __talosNovitaPerLeProve(null); visibile.value = true })

describe('useTalosGuardaChat', () => {
    it('GUARDA-01 aprire la schermata segna la chat vista e la dice guardata; chiuderla smette di guardarla', async () => {
        const scritti: string[] = []
        __talosNovitaPerLeProve({ leggi: async () => null, scrivi: async (valore) => { scritti.push(valore) } })
        const controller = controllerFinto()
        const wrapper = monta(controller)
        await flushPromises()
        expect(talosChatGuardata.value).toBe('a')
        expect(talosRegistroNovita.value?.viste.a).toBeDefined()
        wrapper.unmount()
        await flushPromises()
        expect(talosChatGuardata.value).toBeNull()
    })

    it('GUARDA-02 una risposta che arriva mentre la guardi la segna di nuovo; cambiare chat segna la nuova', async () => {
        __talosNovitaPerLeProve({ leggi: async () => null, scrivi: async () => undefined })
        const controller = controllerFinto()
        const wrapper = monta(controller)
        await flushPromises()
        const prima = talosRegistroNovita.value!.viste.a!
        await new Promise((fine) => setTimeout(fine, 5))
        controller.chat.messages.push({ state: 'persisted' })
        await flushPromises()
        expect(Date.parse(talosRegistroNovita.value!.viste.a!)).toBeGreaterThan(Date.parse(prima))
        controller.chat.activeSession.value = { id: 'b' }
        await flushPromises()
        expect(talosChatGuardata.value).toBe('b')
        expect(talosRegistroNovita.value!.viste.b).toBeDefined()
        wrapper.unmount()
    })

    it('GUARDA-03 con l\'elenco ancora vuoto (avvio) non si pota niente: le chat viste non si perdono', async () => {
        __talosNovitaPerLeProve({
            leggi: async () => JSON.stringify({ base: '2026-09-01T00:00:00.000Z', viste: { vecchia: '2026-09-10T00:00:00.000Z' } }),
            scrivi: async () => undefined,
        })
        const controller = controllerFinto()
        controller.chat.history.splice(0)
        const wrapper = monta(controller)
        await flushPromises()
        expect(talosRegistroNovita.value!.viste.vecchia).toBe('2026-09-10T00:00:00.000Z')
        wrapper.unmount()
    })
})

/*
 * ⛔ GUARDA-REG-01 (Pad, 25/09/2026 10:46): la schermata della chat resta MONTATA sotto le altre pagine (`App.vue` la
 * tiene sempre; /chats le sta sopra). Mandata una domanda e tornati all'elenco, la risposta arrivata non diceva «nuova»:
 * la chat risultava ancora guardata. Guardare = la chat è la pagina aperta, non «il componente esiste».
 */
describe('useTalosGuardaChat — guardare è vederla', () => {
    it('GUARDA-REG-01 se la chat non è la pagina aperta nessuna chat è guardata; tornarci la segna vista', async () => {
        __talosNovitaPerLeProve({ leggi: async () => null, scrivi: async () => undefined })
        const controller = controllerFinto()
        const wrapper = monta(controller)
        await flushPromises()
        expect(talosChatGuardata.value).toBe('a')
        visibile.value = false
        await flushPromises()
        expect(talosChatGuardata.value).toBeNull()
        const prima = talosRegistroNovita.value!.viste.a!
        // Una risposta arriva mentre sei altrove: NON la segna vista.
        await new Promise((fine) => setTimeout(fine, 5))
        controller.chat.messages.push({ state: 'persisted' })
        await flushPromises()
        expect(talosRegistroNovita.value!.viste.a).toBe(prima)
        visibile.value = true
        await flushPromises()
        expect(talosChatGuardata.value).toBe('a')
        expect(Date.parse(talosRegistroNovita.value!.viste.a!)).toBeGreaterThan(Date.parse(prima))
        wrapper.unmount()
    })
})

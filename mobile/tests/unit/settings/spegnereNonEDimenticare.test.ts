// @vitest-environment jsdom

/**
 * ⛔⛔ SPEGNERE NON È DIMENTICARE.
 *
 * ## Come si è scoperto, il 2026-08-12, e cosa è costato
 *
 * Stavo provando **al verso contrario** l'avviso «manca un motore di ricerca»:
 * tolto il motore dal Pad, riletta la schermata degli strumenti, poi rimesso
 * Tavily per rimettere le cose come stavano. Il giro non era neutro. Prima la
 * schermata diceva «Chiave API · **una chiave è già salvata**»; dopo diceva
 * «**Serve ancora una chiave**». Il pulsante «Disattiva ricerca web» aveva
 * cancellato la chiave dell'owner dal deposito sicuro — una chiave che lui
 * aveva appena generato e incollato a mano.
 *
 * ⇒ I due gesti hanno costi di ritorno diversi di ordini di grandezza:
 * spegnere si annulla con un tocco, una chiave cancellata si rigenera sul sito
 * del servizio e si riscrive. Stavano dietro allo stesso pulsante, col nome del
 * più innocuo dei due.
 *
 * ## Perché questo test esiste in questa forma
 *
 * La metà «dimentica funziona» sarebbe passata anche col difetto dentro: era
 * proprio quello che il difetto faceva. Morde solo la metà **contraria** —
 * «spegnere NON tocca la chiave» — ed è quella che il vecchio codice non
 * passava. Vedi `provare-sempre-anche-il-verso-contrario`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const settings = vi.hoisted(() => ({
    state: {
        search: { source: 'tavily' as string | null, endpoint: null as string | null },
        tools: { read: 'allow', write: 'allow', outbound: 'allow' },
    },
    setSearchPreferences: vi.fn(async (patch: Record<string, unknown>) => {
        Object.assign(settings.state.search, patch)
    }),
    effectiveToolPermissions: () => settings.state.tools,
}))
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => settings }))

const deposito = vi.hoisted(() => ({
    hasProviderKey: vi.fn(async () => true),
    setProviderKey: vi.fn(async () => {}),
    clearProviderKey: vi.fn(async () => {}),
}))
vi.mock('@/services/secureKeyStore', () => deposito)
vi.mock('@/services/inAppBrowserService', () => ({ openTalosLinkOnce: vi.fn(async () => true) }))

import TalosMobileSearchSourcePanel from '@/components/talos/settings/TalosMobileSearchSourcePanel.vue'

beforeEach(() => {
    vi.clearAllMocks()
    settings.state.search.source = 'tavily'
    settings.state.search.endpoint = null
    deposito.hasProviderKey.mockResolvedValue(true)
})

async function apri() {
    const wrapper = mount(TalosMobileSearchSourcePanel)
    await flushPromises()
    return wrapper
}

describe('spegnere non è dimenticare', () => {
    it('⛔ DISATTIVARE non tocca la chiave: si riaccende con un tocco', async () => {
        const wrapper = await apri()

        await wrapper.get('[data-testid="talos-search-clear"]').trigger('click')
        await flushPromises()

        // La riga che ha cancellato la chiave dell'owner. Non deve più partire.
        expect(deposito.clearProviderKey).not.toHaveBeenCalled()
        expect(settings.state.search.source).toBeNull()
    })

    it('⛔ DISATTIVARE non butta nemmeno l’indirizzo dell’istanza', async () => {
        // Stessa famiglia: è configurazione, non lo stato acceso/spento. Chi ha
        // digitato l'indirizzo di un SearXNG in casa non deve riscriverlo per
        // aver spento la ricerca un minuto.
        settings.state.search.endpoint = 'https://searx.casa.example'
        const wrapper = await apri()

        await wrapper.get('[data-testid="talos-search-clear"]').trigger('click')
        await flushPromises()

        expect(settings.state.search.endpoint).toBe('https://searx.casa.example')
    })

    it('DIMENTICARE la chiave la toglie davvero, e spegne la fonte con sé', async () => {
        const wrapper = await apri()

        await wrapper.get('[data-testid="talos-search-forget-key"]').trigger('click')
        await flushPromises()

        expect(deposito.clearProviderKey).toHaveBeenCalledWith('search.tavily')
        // ⛔ La fonte si spegne INSIEME, perché il cancello del toolset guarda
        // solo la fonte: lasciarla scelta senza chiave offrirebbe al modello uno
        // strumento che fallisce quando lo usa.
        expect(settings.state.search.source).toBeNull()
    })

    it('il pulsante che dimentica NON esiste se non c’è niente da dimenticare', async () => {
        deposito.hasProviderKey.mockResolvedValue(false)

        const wrapper = await apri()

        expect(wrapper.find('[data-testid="talos-search-forget-key"]').exists()).toBe(false)
        // …mentre spegnere resta sempre possibile.
        expect(wrapper.find('[data-testid="talos-search-clear"]').exists()).toBe(true)
    })

    it('i due comandi si LEGGONO diversi: nessuno dei due nomi vale per l’altro', async () => {
        const wrapper = await apri()

        const spegni = wrapper.get('[data-testid="talos-search-clear"]').text()
        const dimentica = wrapper.get('[data-testid="talos-search-forget-key"]').text()

        expect(spegni).not.toBe(dimentica)
        expect(spegni.toLowerCase()).toContain('off')
        expect(dimentica.toLowerCase()).toContain('forget')
        // E nessuna chiave i18n grezza a schermo.
        expect(wrapper.text()).not.toContain('search.')
    })
})

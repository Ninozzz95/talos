// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'

/*
 * ⭐⭐⭐ N13 (owner 02/10/2026, con la foto dal Pad) — mentre la risposta arriva, la riga «Ricerca sul web…» stava SOPRA il
 * «Ragionamento». Deve stare SOTTO il ragionamento del suo giro, o sotto il testo scritto tra una chiamata e l'altra.
 */
const mock = vi.hoisted(() => ({
    state: null as unknown as Record<string, unknown>,
    toolActivity: { value: [] as Array<{ name: string; detail: string | null }> },
}))
vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        chat: { state: mock.state, activeSession: { value: { id: 's1', title: 'A' } } },
        toolActivity: mock.toolActivity,
    }),
}))
vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({ state: { shell: { streaming_animation: 'typewriter' } } }),
}))

import TalosMobileStreamingReply from '@/components/chat/TalosMobileStreamingReply.vue'

function monta(stato: Record<string, unknown>, attivi: Array<{ name: string; detail: string | null }>) {
    mock.state = reactive({ sending: true, streamingText: null, streamingReasoning: null, streamingConfini: null, streamingSessionId: 's1', ...stato })
    mock.toolActivity = reactive({ value: attivi })
    return mount(TalosMobileStreamingReply)
}

/** Ragionamento (R), righe degli attrezzi (A), nell'ordine del documento. */
function ordine(w: ReturnType<typeof monta>): string[] {
    // 22/10/2026 (owner: «ragionamento dentro il gruppo»): le righe a vista una per una, non i contenitori
    return [...w.element.querySelectorAll('[data-testid="talos-reasoning-block"], [data-voce="attrezzo"]')].map((nodo) =>
        nodo.matches('[data-voce="attrezzo"]') ? 'A' : 'R')
}

describe('N13 — l’ordine mentre la risposta arriva', () => {
    it('SEQ-LIVE-01 la riga dell’attrezzo sta SOTTO il ragionamento del suo giro, ed è «in corso»', async () => {
        const attivi = [{ name: 'web_search', detail: 'meteo Messina' }]
        const w = monta({
            streamingReasoning: 'Cerco il meteo.',
            streamingConfini: [{ testo: 0, ragionamento: 'Cerco il meteo.'.length, attrezzi: attivi }],
        }, attivi)
        await vi.waitFor(() => expect(w.find('[data-segmento="attrezzi"]').exists()).toBe(true))
        expect(ordine(w)).toEqual(['R', 'A'])
        expect(w.get('[data-testid="talos-tool-activity"]').text()).toContain('meteo Messina')
        expect(w.text()).not.toContain('web_search')
    })

    it('SEQ-LIVE-02 col ragionamento del giro dopo, la riga resta in mezzo e non è più «in corso»', async () => {
        const attivi = [{ name: 'web_search', detail: 'meteo Messina' }]
        const w = monta({
            streamingReasoning: 'Cerco il meteo.La pagina dice pioggia.',
            streamingConfini: [{ testo: 0, ragionamento: 'Cerco il meteo.'.length, attrezzi: attivi }],
        }, attivi)
        await vi.waitFor(() => expect(w.find('[data-segmento="attrezzi"]').exists()).toBe(true))
        await flushPromises()
        expect(ordine(w)).toEqual(['R', 'A', 'R'])
        // Il ragionamento vivo è solo quello del giro nuovo: il primo è già sopra la riga, non si ripete.
        const blocchi = w.findAll('[data-testid="talos-reasoning-block"]')
        expect(blocchi[1]!.text()).not.toContain('Cerco il meteo.')
        expect(w.find('[data-testid="talos-tool-activity"]').exists()).toBe(false)
        expect(w.find('[data-testid="talos-tool-trail"]').exists()).toBe(true)
    })

    // ⛔ SEQ-REG-PAD-01 (Pad, 11/10/2026): il modello locale ha chiesto un attrezzo senza nome e la riga «in corso» era vuota.
    it('SEQ-LIVE-03 un attrezzo senza nome non disegna una riga vuota, né nei giri né fra quelli in corso', async () => {
        const w = monta({
            streamingReasoning: 'Cerco.',
            streamingConfini: [{ testo: 0, ragionamento: 'Cerco.'.length, attrezzi: [{ name: '', detail: null }] }],
        }, [{ name: '', detail: null }])
        await vi.waitFor(() => expect(w.find('[data-testid="talos-reasoning-block"]').exists()).toBe(true))
        await flushPromises()
        expect(w.find('[data-segmento="attrezzi"]').exists()).toBe(false)

        const w2 = monta({}, [{ name: ' ', detail: null }, { name: 'web_search', detail: 'meteo Messina' }])
        await vi.waitFor(() => expect(w2.find('[data-segmento="attrezzi"]').exists()).toBe(true))
        const righe = w2.get('[data-segmento="attrezzi"]').element.children
        expect(righe).toHaveLength(1)
        expect(w2.get('[data-segmento="attrezzi"]').text()).toContain('meteo Messina')
    })
})

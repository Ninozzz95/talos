// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, reactive } from 'vue'

/**
 * ⛔ K3-B2 (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`; owner 15/10 «Stessi componenti della chat»): la coda in streaming
 * della chat serve anche al Codice. Oggi legge da sola il controller della chat; con una sorgente iniettata mostra il giro di chi
 * la fornisce (il Codice su r4), e senza resta quella della chat.
 */

const mock = vi.hoisted(() => ({ state: null as unknown as Record<string, unknown> }))
vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        chat: { state: mock.state, activeSession: { value: { id: 'chat-1', title: 'A' } } },
        toolActivity: { value: [] },
    }),
}))
vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({ state: { shell: { streaming_animation: 'fade' } } }),
}))

import TalosMobileStreamingReply from '@/components/chat/TalosMobileStreamingReply.vue'
import { TALOS_SORGENTE_STREAMING, type TalosSorgenteStreaming } from '@/lib/chat/sorgenteStreaming'

describe('la coda in streaming con una sorgente iniettata (K3-B2)', () => {
    it('SORG-01 mostra il giro della sorgente iniettata, anche se la chat non sta scrivendo', async () => {
        mock.state = reactive({ sending: false, streamingText: 'TESTO DELLA CHAT', streamingReasoning: null, streamingConfini: null, streamingSessionId: null })
        const giro = reactive({ testo: 'Leggo la nota del Codice', ragionamento: 'Penso al file.', confini: [], attivi: [{ name: 'leggi', detail: 'NOTA.md' }] })
        const sorgente: TalosSorgenteStreaming = {
            sending: computed(() => true),
            testo: computed(() => giro.testo),
            ragionamento: computed(() => giro.ragionamento),
            confini: computed(() => giro.confini),
            attivi: computed(() => giro.attivi),
        }
        const w = mount(TalosMobileStreamingReply, { global: { provide: { [TALOS_SORGENTE_STREAMING as symbol]: sorgente } } })
        // La riga dell'attrezzo e il ragionamento vengono SOLO dalla sorgente iniettata (il testo si rivela a fotogrammi).
        await vi.waitFor(() => expect(w.text()).toContain('NOTA.md'))
        expect(w.find('[data-testid="talos-reasoning-block"]').exists()).toBe(true)
        expect(w.text()).not.toContain('TESTO DELLA CHAT')
    })

    it('SORG-02 senza sorgente iniettata resta quella della chat: niente invio, niente coda', () => {
        mock.state = reactive({ sending: false, streamingText: 'TESTO DELLA CHAT', streamingReasoning: null, streamingConfini: null, streamingSessionId: null })
        const w = mount(TalosMobileStreamingReply)
        expect(w.text()).not.toContain('TESTO DELLA CHAT')
    })
})

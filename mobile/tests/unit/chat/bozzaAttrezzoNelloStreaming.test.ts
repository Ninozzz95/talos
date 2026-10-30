// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { createChatStore, type ChatCompletion } from '@/stores/chat'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { talosTestT } from '../../helpers/talosTestI18n'

/*
 * ⛔ Difetto 1 dell'owner (20/10/2026): «Cerco come si fa…» resta 52 s con lo spinner mentre il modello scrive già il documento.
 * Atteso: la riga dice l'attrezzo che il modello sta chiamando, con quanto è cresciuto; la riga di `tool_details` è conclusa.
 * Ledger: `.claude/ragionamento/LEDGER-RIGHE-ATTREZZI-2026-10-20.md`.
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

const DETTAGLI = [{ name: 'tool_details', detail: null }]

function monta(stato: Record<string, unknown>) {
    mock.state = reactive({ sending: true, streamingText: null, streamingReasoning: null, streamingConfini: null, streamingSessionId: 's1', ...stato })
    mock.toolActivity = reactive({ value: DETTAGLI })
    return mount(TalosMobileStreamingReply)
}

describe('difetto 1: la riga dice l’attrezzo che il modello sta scrivendo', () => {
    it('BZA-06 con la bozza di `artifact_create` la riga è sua, con la crescita; «Cerco come si fa» è conclusa', async () => {
        const w = monta({
            streamingConfini: [{ testo: 0, ragionamento: 0, attrezzi: DETTAGLI }],
            streamingBozze: [{ name: 'artifact_create', caratteri: 12_000 }],
        })
        await vi.waitFor(() => expect(w.find('[data-testid="talos-tool-draft"]').exists()).toBe(true))
        await flushPromises()
        const bozza = w.get('[data-testid="talos-tool-draft"]')
        expect(bozza.text()).toContain('Making an interactive visual…')
        expect(bozza.text()).toContain('11.7 KB written')
        expect(bozza.text()).not.toContain('artifact_create')
        // `tool_details` non è più «in corso»: è una riga conclusa del giro prima. ⛔ La riga sta nel turno, che si carica pigro e
        // non insieme alla bozza (ESITO-RIGA, 27/10: con le parole dell'esito arrivava dopo il primo sguardo): si aspetta anche lei.
        await vi.waitFor(() => expect(w.find('[data-testid="talos-tool-trail"]').exists()).toBe(true))
        expect(w.find('[data-testid="talos-tool-activity"]').exists()).toBe(false)
        expect(w.get('[data-testid="talos-tool-trail"]').text()).toContain('Looking up how to do that')
        // la bozza sta DOPO la riga conclusa, dove comparirà la riga vera
        const trail = w.get('[data-testid="talos-tool-trail"]').element
        expect(trail.compareDocumentPosition(bozza.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('BZA-06b AL CONTRARIO: senza bozza la riga del giro resta «in corso», come prima', async () => {
        const w = monta({ streamingConfini: [{ testo: 0, ragionamento: 0, attrezzi: DETTAGLI }], streamingBozze: null })
        await vi.waitFor(() => expect(w.find('[data-testid="talos-tool-activity"]').exists()).toBe(true))
        expect(w.find('[data-testid="talos-tool-draft"]').exists()).toBe(false)
    })

    it('BZA-06c la bozza del primo giro (nessun testo, nessun giro chiuso) basta a mostrare la risposta in arrivo', async () => {
        mock.state = reactive({ sending: true, streamingText: null, streamingReasoning: null, streamingConfini: null, streamingSessionId: 's1', streamingBozze: [{ name: 'web_search', caratteri: 0 }] })
        mock.toolActivity = reactive({ value: [] })
        const w = mount(TalosMobileStreamingReply)
        await vi.waitFor(() => expect(w.find('[data-testid="talos-tool-draft"]').exists()).toBe(true))
        expect(w.get('[data-testid="talos-tool-draft"]').text()).toContain('Searching the web…')
        // a zero caratteri non c'è niente da dire sulla crescita
        expect(w.get('[data-testid="talos-tool-draft"]').text()).not.toContain('KB')
    })

    it('BZA-05 lo store: le bozze arrivano in `streamingBozze`, il giro vero le sostituisce, un testo le ritira, la fine le azzera', async () => {
        const viste: unknown[] = []
        let store: ReturnType<typeof createChatStore>
        const complete: ChatCompletion = async (_turns, stream) => {
            stream?.onBozzeAttrezzi?.([{ name: 'artifact_create', caratteri: 2_048 }])
            viste.push(store.state.streamingBozze)
            stream?.onToolRound?.([{ name: 'artifact_create', detail: null }])
            viste.push(store.state.streamingBozze)
            stream?.onBozzeAttrezzi?.([{ name: 'web_search', caratteri: 10 }])
            stream?.onChunk('Ecco il documento.')
            viste.push(store.state.streamingBozze)
            stream?.onBozzeAttrezzi?.([{ name: 'web_search', caratteri: 10 }])
            return { text: 'Ecco il documento.', finishReason: 'stop' }
        }
        store = createChatStore(complete, { repository: createMemoryChatRepository(), translate: talosTestT('en') })
        await store.initialize()
        await store.send('fammi un documento')
        expect(viste[0]).toEqual([{ name: 'artifact_create', caratteri: 2_048 }])
        expect(viste[1]).toBeNull()
        expect(viste[2]).toBeNull()
        expect(store.state.streamingBozze).toBeNull()
    })
})

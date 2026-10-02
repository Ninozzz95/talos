// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        chat: {
            state: { sending: false, streamingText: null, streamingSessionId: null },
            activeSession: { value: { id: 's1', title: 'A' } },
        },
        toolActivity: { value: [] as Array<{ name: string; detail: string | null }> },
    }),
}))

import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'
import { TALOS_METADATA_COMPATTAZIONE, TALOS_METADATA_COMPATTAZIONE_ANNULLATA } from '@/lib/chat/compattazioneChiavi'

/*
 * ⭐⭐ P4-ter passo 2 (02/10/2026) — la riga di compattazione salvata nella storia si disegna come separatore (non come
 * avviso di sistema), una riga «annullata» successiva la spegne e non si vede, e durante il riassunto c'è la barra.
 */
function riga(id: string, role: TalosMobileMessageView['role'], content: string, metadata: Record<string, unknown> = {}): TalosMobileMessageView {
    return { id, role, content, state: 'persisted', created_at: '2026-10-02T12:00:00.000Z', model_profile_id: null, run_id: null, metadata }
}
const compattazione = riga('c1', 'system', 'Conversazione riassunta · 14.273 → 2526 token', {
    [TALOS_METADATA_COMPATTAZIONE]: { record: { at: 'a1', tokenPrima: 14_273, tokenDopo: 2_526 }, ultimoCoperto: 'm2', righeCoperte: 2 },
})
const base = [riga('m1', 'user', 'domanda'), riga('m2', 'assistant', 'risposta'), compattazione, riga('m3', 'user', 'ancora')]

describe('P4-ter passo 2 — la compattazione nella lista dei messaggi', () => {
    it('CHAT-COMP-UI-04 la riga salvata diventa il separatore con «Annulla» (che dice QUALE compattazione), non un avviso di sistema', async () => {
        const lista = mount(TalosMobileMessageList, { props: { messages: base, sending: false } })
        await flushPromises(); await vi.dynamicImportSettled(); await flushPromises()
        const separatori = lista.findAll('[data-testid="talos-compaction-row"]')
        expect(separatori).toHaveLength(1)
        expect(separatori[0]!.attributes('data-undone')).toBeUndefined()
        expect(lista.find('[data-testid="talos-mobile-controlled-fault"]').exists()).toBe(false)
        await lista.get('[data-testid="talos-compaction-undo"]').trigger('click')
        expect(lista.emitted('undoCompaction')).toEqual([['a1']])
    })

    it('CHAT-COMP-UI-05 una riga «annullata» più sotto spegne il separatore e non si disegna; durante il riassunto c\'è la barra', async () => {
        const lapide = riga('u1', 'system', 'Riassunto annullato · la conversazione intera torna al modello', { [TALOS_METADATA_COMPATTAZIONE_ANNULLATA]: { at: 'a1' } })
        const lista = mount(TalosMobileMessageList, { props: { messages: base, sending: false } })
        await lista.setProps({ messages: [...base, lapide] })
        await flushPromises(); await vi.dynamicImportSettled(); await flushPromises()
        expect(lista.get('[data-testid="talos-compaction-row"]').attributes('data-undone')).toBe('true')
        expect(lista.findAll('[data-testid="talos-compaction-undo"]')).toHaveLength(0)
        expect(lista.get('[data-message-id="u1"]').classes()).toContain('hidden')
        expect(lista.find('[data-testid="talos-compaction-progress"]').exists()).toBe(false)
        await lista.setProps({ compattazioneInCorso: true })
        await flushPromises(); await vi.dynamicImportSettled(); await flushPromises()
        expect(lista.find('[data-testid="talos-compaction-progress"]').exists()).toBe(true)
    })
})

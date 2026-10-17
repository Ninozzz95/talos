// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'

/*
 * ⛔ K3-B2 (Pad, 15/10/2026): riaperta una sessione del Codice su r4, sotto la bolla della persona si leggeva «Tu ·» con il
 * punto appeso e niente dopo. La storia rigiocata di r4 non porta l'ora del giro (chiesta a Nino1); finché un messaggio non ha
 * un'ora, la lista dice solo chi parla, senza separatore vuoto. Con l'ora, tutto come prima.
 */
function messaggio(created_at: string): TalosMobileMessageView {
    return { id: 'u1', role: 'user', content: 'Leggi NOTA.md', state: 'persisted', created_at, model_profile_id: null, run_id: null, metadata: {} }
}

async function meta(created_at: string): Promise<string> {
    const w = mount(TalosMobileMessageList, { props: { messages: [messaggio(created_at)], sending: false }, global: { stubs: { teleport: true } } })
    await vi.dynamicImportSettled()
    await flushPromises()
    const testo = w.get('[data-testid="talos-message-meta"]').text().replace(/\s+/gu, ' ').trim()
    w.unmount()
    return testo
}

describe('l\'ora del messaggio quando manca (K3-B2)', () => {
    it('ORA-01 senza ora: solo «You», nessun punto appeso', async () => {
        expect(await meta('')).toBe('You')
    })

    it('ORA-02 con l\'ora: «You · …» come sempre', async () => {
        expect(await meta(new Date().toISOString())).toMatch(/^You · \S/u)
    })
})

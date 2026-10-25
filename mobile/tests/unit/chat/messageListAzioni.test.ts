// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'

/*
 * ⛔ K3-B2 (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`, emendamento al punto 3): il Codice su r4 usa la stessa lista
 * della chat, ma r4 non ha riprova, cancellazione del turno, modifica né dettagli. Un pulsante che non fa niente è un pulsante
 * finto: la lista mostra solo le azioni che chi la monta sa davvero fare. «Copia» e «Ascolta» ci sono sempre.
 */
function messaggio(role: 'user' | 'assistant', id: string): TalosMobileMessageView {
    return {
        id, role, content: role === 'user' ? 'Leggi NOTA.md' : 'La nota dice **ciao**.', state: 'persisted',
        created_at: '2026-10-15T10:00:00.000Z', model_profile_id: null, run_id: null, metadata: {},
    }
}

async function lista(props: Record<string, unknown>) {
    const w = mount(TalosMobileMessageList, {
        attachTo: document.body,
        props: { messages: [messaggio('user', 'u1'), messaggio('assistant', 'a1')], sending: false, ...props },
        global: { stubs: { teleport: true } },
    })
    await vi.dynamicImportSettled()
    await flushPromises()
    return w
}

async function vociDelFoglio(w: Awaited<ReturnType<typeof lista>>, indice: number): Promise<string[]> {
    const altri = w.findAll('[data-testid="talos-message-overflow"]')
    if (!altri[indice]) return []
    await altri[indice].trigger('click')
    await flushPromises()
    const foglio = document.body.querySelector('[data-testid="talos-message-actions-sheet"]')
    const voci = [...(foglio?.querySelectorAll('[data-testid]') ?? [])].map((voce) => voce.getAttribute('data-testid') ?? '')
    return voci.filter((voce) => voce.startsWith('talos-message-') && voce !== 'talos-message-actions-sheet')
}

afterEach(() => { document.body.innerHTML = '' })

describe('le azioni del messaggio secondo chi monta la lista (K3-B2)', () => {
    it('AZM-01 senza la proprietà tutto come nella chat di oggi', async () => {
        const w = await lista({})
        for (const id of ['talos-message-edit', 'talos-message-retry', 'talos-message-save', 'talos-message-copy', 'talos-message-speak'])
            expect(w.find(`[data-testid="${id}"]`).exists(), id).toBe(true)
        expect(w.findAll('[data-testid="talos-message-overflow"]')).toHaveLength(2)
        w.unmount()
    })

    it('AZM-02 con «riutilizza» e «condividi»: in riga solo Copia e Ascolta, nel foglio solo quelle due', async () => {
        const w = await lista({ azioni: ['riutilizza', 'condividi'] })
        for (const id of ['talos-message-edit', 'talos-message-retry', 'talos-message-save'])
            expect(w.find(`[data-testid="${id}"]`).exists(), id).toBe(false)
        expect(w.findAll('[data-testid="talos-message-copy"]')).toHaveLength(2)
        expect(w.find('[data-testid="talos-message-speak"]').exists()).toBe(true)
        // owner 24/10/2026 «Come Happy»: «Seleziona testo» c'è sempre, come Copia e Ascolta
        expect(await vociDelFoglio(w, 0)).toEqual(['talos-message-select-text', 'talos-message-reuse'])
        w.unmount()
    })

    it('AZM-03 nel foglio della risposta solo Condividi, niente Dettagli né Elimina', async () => {
        const w = await lista({ azioni: ['riutilizza', 'condividi'] })
        expect(await vociDelFoglio(w, 1)).toEqual(['talos-message-select-text', 'talos-message-share'])
        w.unmount()
    })

    // Owner 24/10/2026 «Come Happy»: il foglio ha sempre «Seleziona testo», quindi «Altre azioni» c'è sempre; le voci di chi monta no
    it('AZM-04 senza voci di chi monta la lista resta solo «Seleziona testo» nel foglio', async () => {
        const w = await lista({ azioni: [] })
        expect(w.findAll('[data-testid="talos-message-overflow"]')).toHaveLength(2)
        expect(await vociDelFoglio(w, 0)).toEqual(['talos-message-select-text'])
        expect(w.findAll('[data-testid="talos-message-copy"]')).toHaveLength(2)
        w.unmount()
    })
})

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import { TALOS_METADATA_AZIONE_NON_ESEGUITA } from '@/lib/tools/tracciaAzione'

/*
 * ⭐⭐ P4-quinquies — la riga onesta sotto la risposta (owner 02/10/2026: «Riprova, poi avviso»). Il testo del modello
 * resta; la riga dice il fatto che il modello non poteva sapere: nessuno strumento è partito.
 */
function risposta(metadata: Record<string, unknown>) {
    return {
        id: 'm1',
        role: 'assistant',
        content: 'Salvato la nota ✅',
        createdAt: new Date('2026-10-02T10:00:00Z').toISOString(),
        status: 'complete',
        metadata,
    }
}

async function lista(metadata: Record<string, unknown>) {
    const w = mount(TalosMobileMessageList, {
        props: { messages: [risposta(metadata)] as never, sending: false },
        global: { stubs: { teleport: true } },
    })
    await vi.dynamicImportSettled()
    await flushPromises()
    return w
}

describe('P4-quinquies — «nessuno strumento è partito» sotto la risposta', () => {
    it('AZD-UI-01 col fatto nei metadati la riga compare, e la frase del modello resta', async () => {
        const w = await lista({ [TALOS_METADATA_AZIONE_NON_ESEGUITA]: true })
        const riga = w.find('[data-testid="talos-azione-non-eseguita"]')
        expect(riga.exists()).toBe(true)
        expect(riga.attributes('role')).toBe('note')
        expect(riga.text()).toBe('No tool ran: nothing was done.')
        expect(w.text()).toContain('Salvato la nota ✅')
    })

    it('AZD-UI-02 senza il fatto, nessuna riga', async () => {
        expect((await lista({})).find('[data-testid="talos-azione-non-eseguita"]').exists()).toBe(false)
        expect((await lista({ [TALOS_METADATA_AZIONE_NON_ESEGUITA]: false })).find('[data-testid="talos-azione-non-eseguita"]').exists()).toBe(false)
    })
})

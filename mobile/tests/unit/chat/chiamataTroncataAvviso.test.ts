// @vitest-environment jsdom
/**
 * ⛔⛔ TRONC-06 (D-LOC-1, owner 2026-10-23): quando il ciclo si chiude perché una CHIAMATA si è fermata al tetto due volte,
 * la riga sotto la risposta dice che un'azione si è interrotta e che non è stato eseguito nulla — non la frase generica
 * della risposta tagliata — e non offre «Continua», che rifarebbe lo stesso taglio. Pi mostra «Response was truncated before
 * completion.» (`assistant-message.ts:182-186`); qui si aggiunge il fatto che conta: niente è partito.
 */
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import { TALOS_METADATA_CHIAMATA_TRONCATA, TALOS_METADATA_TRONCATA } from '@/lib/tools/tracciaAzione'

async function lista(metadata: Record<string, unknown>) {
    const w = mount(TalosMobileMessageList, {
        props: {
            messages: [{
                id: 'm1',
                role: 'assistant',
                content: 'Ho immesso il tool corretto. Ora genero il file HTML completo del sito.',
                createdAt: new Date('2026-10-23T10:00:00Z').toISOString(),
                status: 'complete',
                metadata,
            }] as never,
            sending: false,
        },
        global: { stubs: { teleport: true } },
    })
    await vi.dynamicImportSettled()
    await flushPromises()
    return w
}

describe('TRONC-06 la chiamata interrotta dal tetto si dice per nome', () => {
    it('la riga dice che non è stato eseguito nulla, e niente «Continua»', async () => {
        const w = await lista({ [TALOS_METADATA_TRONCATA]: true, [TALOS_METADATA_CHIAMATA_TRONCATA]: true })
        const riga = w.get('[data-testid="talos-risposta-troncata"]')
        expect(riga.text()).toMatch(/nothing was run|non è stato eseguito nulla/i)
        expect(w.find('[data-testid="talos-continua-dopo-limite"]').exists()).toBe(false)
        expect(w.text()).toContain('Ho immesso il tool corretto')
    }, 30_000)

    it('una risposta di solo testo fermata dal tetto resta come prima: frase generica e «Continua»', async () => {
        const w = await lista({ [TALOS_METADATA_TRONCATA]: true })
        expect(w.get('[data-testid="talos-risposta-troncata"]').text()).not.toMatch(/nothing was run|non è stato eseguito/i)
        expect(w.find('[data-testid="talos-continua-dopo-limite"]').exists()).toBe(true)
    })
})

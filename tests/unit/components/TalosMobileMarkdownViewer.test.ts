// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

/**
 * ⭐⭐⭐ IL MARKDOWN SI APRE FORMATTATO — rilievo owner 22/8, stessa famiglia
 * del PDF (2026-08-17): «non è possibile cliccare sul file MD appena creato
 * dalla scheda chat» + «i file MD non sono formattati».
 *
 * ⛔ Stesso motivo del test del visualizzatore PDF: si mocka SOLO il confine
 * vero (`hydrateText`, la stessa via che il pannello media della chat già
 * usa per gli allegati) — il rendering Markdown è la `TalosMobileMessageContent`
 * REALE, non finta, perché è proprio quella la cosa da provare.
 */
vi.mock('@/i18n', () => ({
    useTalosI18n: () => ({
        t: (chiave: string) => ({
            'common.close': 'Chiudi',
            'common.loading': 'Caricamento…',
            'library.mdNonSiApre': 'Non sono riuscito ad aprire questo file.',
        }[chiave] ?? chiave),
    }),
}))

const hydrateText = vi.hoisted(() => vi.fn())
vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({ attachments: { hydrateText } }),
}))

import TalosMobileMarkdownViewer from '@/components/talos/library/TalosMobileMarkdownViewer.vue'

beforeEach(() => { hydrateText.mockReset() })

describe('TalosMobileMarkdownViewer', () => {
    it('renders the file as FORMATTED markdown, not raw text', async () => {
        hydrateText.mockResolvedValue('## Titolo\n\n- primo punto\n- secondo punto')
        const w = mount(TalosMobileMarkdownViewer, { props: { fileId: 'f1', nome: 'appunti.md' } })
        await flushPromises()
        expect(hydrateText).toHaveBeenCalledWith('f1')
        expect(w.find('h2').exists()).toBe(true)
        expect(w.get('h2').text()).toBe('Titolo')
        expect(w.findAll('li')).toHaveLength(2)
        // The raw markers must NOT survive - that would be Rilievo 5 again.
        expect(w.text()).not.toContain('##')
        expect(w.text()).not.toContain('- primo punto')
    })

    it('shows the real name in the header, and closes on request', async () => {
        hydrateText.mockResolvedValue('testo')
        const w = mount(TalosMobileMarkdownViewer, { props: { fileId: 'f1', nome: 'appunti.md' } })
        await flushPromises()
        expect(w.get('[data-testid="talos-markdown-viewer"]').text()).toContain('appunti.md')
        await w.get('[data-testid="talos-markdown-viewer-close"]').trigger('click')
        expect(w.emitted('chiudi')).toHaveLength(1)
    })

    /*
     * ⛔ AL CONTRARIO: `hydrateText` che torna `null` (il file non c'è più, o
     * non è leggibile) deve dire IL MOTIVO, non mostrare un riquadro vuoto -
     * stessa disciplina del visualizzatore PDF quando il render fallisce.
     */
    it('⛔ al contrario: un file che non si legge dice il motivo, non tace', async () => {
        hydrateText.mockResolvedValue(null)
        const w = mount(TalosMobileMarkdownViewer, { props: { fileId: 'f1', nome: 'sparito.md' } })
        await flushPromises()
        expect(w.find('[data-testid="talos-markdown-viewer-errore"]').exists()).toBe(true)
        expect(w.find('[data-testid="talos-mobile-message-content"]').exists()).toBe(false)
    })

    it('⛔ al contrario: un rifiuto della lettura (throw) NON resta un buco muto', async () => {
        hydrateText.mockRejectedValue(new Error('boom'))
        const w = mount(TalosMobileMarkdownViewer, { props: { fileId: 'f1', nome: 'sparito.md' } })
        await flushPromises()
        expect(w.find('[data-testid="talos-markdown-viewer-errore"]').exists()).toBe(true)
    })
})

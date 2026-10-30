// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({ attachments: { hydrateText: vi.fn(async () => 'dal vault'), previewBytes: vi.fn(async () => null) } }),
}))

import TalosMobileAttachmentPreviewSheet from '@/components/chat/TalosMobileAttachmentPreviewSheet.vue'
import type { AnteprimaDalPc } from '@/lib/remoto/fileRemoti'

/*
 * ⛔ Owner 26/10/2026: «dalla chat il file ordini dal pad si deve poter aprire se ci clicco sopra». Lo stesso foglio serve la chat (dal
 * vault) e la sessione del PC (`carica` = `ponte.anteprimaFile`): il testo, oppure una frase che dice perché no, mai un foglio muto.
 */
const allegato = {
    id: 'r4file:0:allegati/ordini-dal-pad-2.csv', vault_file_id: '', grant_id: '', display_name: 'ordini-dal-pad-2.csv',
    media_type: 'text/csv', size_bytes: 0, permissions: ['model.read'] as const, grant_status: 'active' as const,
}
function monta(carica: () => Promise<AnteprimaDalPc>) {
    return mount(TalosMobileAttachmentPreviewSheet, { attachTo: document.body, props: { attachment: allegato, carica }, global: { stubs: { teleport: true } } })
}

describe('TalosMobileAttachmentPreviewSheet, sessione del PC', () => {
    it('ALL-APRI-M13 il testo letto dal PC si mostra com\'è', async () => {
        const w = monta(async () => ({ esito: 'testo', testo: 'id,pezzi\n1,40\n', mime: 'text/csv' }))
        await flushPromises()
        expect(w.get('[data-testid="talos-message-attachment-preview-text"]').text()).toBe('id,pezzi\n1,40')
        w.unmount()
    })

    it('ALL-APRI-M14 un file che non c\'è più, uno da non mostrare o un guasto lo dicono, ognuno col suo perché', async () => {
        const assente = monta(async () => ({ esito: 'assente' }))
        await flushPromises()
        expect(assente.text()).toContain('This file is no longer on the computer.')
        assente.unmount()
        for (const esito of [async () => ({ esito: 'non-mostrabile' as const }), async () => ({ esito: 'ambiguo' as const }), async () => { throw new Error('DISCONNECTED') }]) {
            const w = monta(esito)
            await flushPromises()
            expect(w.text()).toContain('This file can’t be shown here. It stays on the computer.')
            w.unmount()
        }
    })
})

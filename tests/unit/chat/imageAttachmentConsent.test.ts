import { describe, expect, it, vi } from 'vitest'
import { useTalosMobileAttachments } from '@/composables/useTalosMobileAttachments'

/**
 * Owner 2026-08-04: «quando carichi una tua immagine questo potrebbe essere un
 * problema di sicurezza e bisogna fare scegliere l'utente tramite pop-up».
 *
 * TALOS è local-first, ma un allegato ESCE. Una foto è la cosa più sensibile
 * che una persona attacca — volti, luoghi, targhe, documenti — e finora partiva
 * come parte un file di testo, senza che nessuno lo dicesse.
 */
function picked(name: string, mediaType: string) {
    return {
        name,
        declaredMediaType: mediaType,
        sizeBytes: 1024,
        readBytes: async () => new Uint8Array([1, 2, 3]),
    } as never
}

function attachments(over: Record<string, unknown> = {}) {
    const vault = {
        reconcilePending: vi.fn(async () => {}),
        ingest: vi.fn(async () => ({ vaultFileId: 'v1', grantId: 'g1', permissions: [] })),
        listFiles: vi.fn(async () => []),
    }
    return useTalosMobileAttachments({
        picker: { pickFiles: async () => [picked('foto.jpg', 'image/jpeg')] } as never,
        vault: vault as never,
        translate: (key: string) => key,
        ...over,
    })
}

describe('un’immagine che sta per lasciare il telefono', () => {
    it('con «nega» non entra nemmeno nel Vault', async () => {
        /**
         * Il cancello sta PRIMA dell'ingestione: rifiutare dopo vorrebbe dire
         * aver già copiato la foto nell'archivio.
         */
        const ingest = vi.fn()
        const controller = attachments({
            imageConsent: () => 'deny',
            vault: {
                reconcilePending: vi.fn(async () => {}),
                ingest,
                listFiles: vi.fn(async () => []),
            } as never,
        })
        await controller.selectFiles()

        expect(ingest).not.toHaveBeenCalled()
        expect(controller.items).toHaveLength(0)
        expect(controller.error.value).toBe('chat.imageConsentDenied')
    })

    it('con «chiedi» la domanda viene posta, e un no ferma tutto', async () => {
        const ask = vi.fn(async () => 'deny' as const)
        const controller = attachments({ imageConsent: () => 'ask', askImageConsent: ask })
        await controller.selectFiles()

        expect(ask).toHaveBeenCalledWith(1)
        expect(controller.items).toHaveLength(0)
    })

    it('un file NON immagine non fa comparire nessuna domanda', async () => {
        // Il cartellino parla di foto: farlo uscire per un .txt lo renderebbe
        // rumore, e il rumore si impara a chiudere senza leggere.
        const ask = vi.fn(async () => 'once' as const)
        const controller = attachments({
            picker: { pickFiles: async () => [picked('note.txt', 'text/plain')] } as never,
            imageConsent: () => 'ask',
            askImageConsent: ask,
        })
        await controller.selectFiles()

        expect(ask).not.toHaveBeenCalled()
    })

    it('con «consenti» non chiede niente', async () => {
        const ask = vi.fn(async () => 'once' as const)
        const controller = attachments({ imageConsent: () => 'allow', askImageConsent: ask })
        await controller.selectFiles()
        expect(ask).not.toHaveBeenCalled()
    })
})

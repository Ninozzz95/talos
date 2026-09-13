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

/**
 * Owner 12/09/2026, misurato sul Pad: aggiungere un'IMMAGINE dalla Libreria
 * faceva comparire «Questa immagine esce dal telefono… TALOS la invia a
 * OpenRouter». Ma archiviare non manda niente a nessuno: il consenso appartiene
 * all'INVIO. Android, «App permissions best practices» (letto 12/09/2026):
 * «only prompt when a specific feature is required … only prompt for microphone
 * access when a user clicks on the microphone button» —
 * https://developer.android.com/training/permissions/usage-notes
 *
 * ⛔ Le due meta' si provano INSIEME, perche' una sola sarebbe una bugia: la
 * Libreria salta la domanda SOLO perche' non mette il file in coda per il
 * prossimo messaggio. Se il cartellino sparisse e la bozza restasse, la foto
 * uscirebbe senza che nessuno l'abbia mai chiesto.
 */
describe('l’ingresso in Libreria non e’ un invio', () => {
    function fixture(over: Record<string, unknown> = {}) {
        const revokeGrant = vi.fn(async () => {})
        const ingest = vi.fn(async () => ({
            file: { id: 'v1', media_type: 'image/jpeg', size_bytes: 1024 },
            grant: { id: 'g1', permissions: [] },
        }))
        const ask = vi.fn(async () => 'once' as const)
        const controller = useTalosMobileAttachments({
            picker: { pickFiles: async () => [picked('foto.jpg', 'image/jpeg')] } as never,
            vault: {
                reconcilePending: vi.fn(async () => {}),
                ingest,
                revokeGrant,
                listFiles: vi.fn(async () => []),
            } as never,
            translate: (key: string) => key,
            imageConsent: () => 'ask',
            askImageConsent: ask,
            ...over,
        })
        return { controller, ingest, revokeGrant, ask }
    }

    it('non chiede il consenso, e il file entra lo stesso', async () => {
        const { controller, ingest, ask } = fixture()
        await controller.selectFiles('library')

        expect(ask).not.toHaveBeenCalled()
        expect(ingest).toHaveBeenCalledOnce()
        expect(controller.error.value).toBeNull()
    })

    it('AL CONTRARIO: la stessa immagine verso la CHAT lo chiede come sempre', async () => {
        const { controller, ask } = fixture()
        await controller.selectFiles()

        expect(ask).toHaveBeenCalledWith(1)
        expect(controller.items).toHaveLength(1)
    })

    it('non lascia una bozza in coda al prossimo messaggio, e restituisce il permesso', async () => {
        const { controller, revokeGrant } = fixture()
        await controller.selectFiles('library')

        expect(controller.items).toHaveLength(0)
        expect(controller.bindings.value).toHaveLength(0)
        expect(revokeGrant).toHaveBeenCalledWith('g1')
    })

    it('AL CONTRARIO: verso la CHAT la bozza resta allegata e il permesso non si tocca', async () => {
        const { controller, revokeGrant } = fixture({ imageConsent: () => 'allow' })
        await controller.selectFiles()

        expect(controller.items).toHaveLength(1)
        expect(controller.bindings.value).toHaveLength(1)
        expect(revokeGrant).not.toHaveBeenCalled()
    })

    it('«non inviare mai le mie immagini» non impedisce di ARCHIVIARNE una', async () => {
        // Il «no» del cartellino e' un no all'invio. Se fermasse anche
        // l'archiviazione, una persona che l'ha detto una volta non potrebbe
        // piu' mettere una sola foto nella propria Libreria.
        const { controller, ingest } = fixture({ imageConsent: () => 'deny' })
        await controller.selectFiles('library')

        expect(ingest).toHaveBeenCalledOnce()
        expect(controller.error.value).toBeNull()
    })
})

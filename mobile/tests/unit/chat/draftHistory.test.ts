import { describe, expect, it, vi } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createChatStore } from '@/stores/chat'

/**
 * Owner 2026-09-13 — «Chat nuova con una bozza mai inviata: resta in cronologia,
 * marcata come bozza, finche' non la invii o la svuoti. Se e' vuota del tutto
 * sparisce come oggi. Il testo non si perde mai.»
 */
function clock(): () => string {
    let tick = 0
    return () => `2026-09-13T21:00:${String(tick++).padStart(2, '0')}.000Z`
}
function ids(): () => string {
    let n = 0
    return () => `id-${n++}`
}

describe('cronologia e bozza', () => {
    it('una chat vuota entra in cronologia con la bozza e ne esce quando si svuota', async () => {
        const now = clock()
        const repository = createMemoryChatRepository({ now })
        const store = createChatStore(vi.fn().mockResolvedValue({ text: 'unused', finishReason: 'stop' }), {
            repository,
            makeId: ids(),
            now,
        })
        await store.initialize()
        const session = await store.createSession()
        // ⛔ Il punto di partenza: vuota e senza bozza, non e' in cronologia.
        expect(store.history.map((item) => item.id)).not.toContain(session.id)

        await store.saveComposerDraft('una bozza', session.id)
        expect(store.history.map((item) => item.id)).toContain(session.id)
        expect(store.history.find((item) => item.id === session.id)?.has_draft).toBe(true)

        await store.saveComposerDraft('', session.id)
        expect(store.history.map((item) => item.id)).not.toContain(session.id)
    })

    it('gli allegati da soli bastano a tenerla, e il testo vuoto non la toglie', async () => {
        const now = clock()
        const repository = createMemoryChatRepository({ now })
        const store = createChatStore(vi.fn().mockResolvedValue({ text: 'unused', finishReason: 'stop' }), {
            repository,
            makeId: ids(),
            now,
        })
        await store.initialize()
        const session = await store.createSession()
        await store.saveComposerAttachments(session.id, [{
            id: 'a1', source: 'picker', displayName: 'foto.jpg', mediaType: 'image/jpeg', sizeBytes: 10,
            vaultFileId: 'v1', grantId: 'g1', bindingId: 'b1', permissions: ['read'],
        }])
        expect(store.history.map((item) => item.id)).toContain(session.id)
        await store.saveComposerDraft('', session.id)
        expect(store.history.map((item) => item.id)).toContain(session.id)
        await store.saveComposerAttachments(session.id, [])
        expect(store.history.map((item) => item.id)).not.toContain(session.id)
    })
})

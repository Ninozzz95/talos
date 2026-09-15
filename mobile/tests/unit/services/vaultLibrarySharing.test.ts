import { describe, expect, it, vi } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createTalosVaultService } from '@/services/talosVaultService'
import type { TalosAttachmentAnalysisClient } from '@/services/attachmentAnalysisClient'
import type { TalosAttachmentFileStore } from '@/services/attachmentFileStore'

/**
 * Debt S7, open since 2026-07-25: `metadata.library_shared` is honoured by the
 * injection path and by the tool suite, and was writable from nowhere. The
 * per-chat gallery (owner, 2026-07-26) is where the switch finally lives, so
 * the write path lands here.
 *
 * The trap this test exists for: `updateVaultFile` REPLACES `metadata`, it does
 * not merge (sqliteChatRepository.ts — `input.metadata === undefined ?
 * current.metadata : cloneJsonObject(input.metadata)`). A caller writing
 * `{ library_shared: false }` would erase `origin` and `origin_session_id` in
 * the same stroke: the document would lose the chat it came from, and
 * `parseVaultOrigin` fails closed to 'uploaded', so a TALOS-generated file
 * would quietly start looking like something the user had uploaded — and
 * become eligible for injection, which generated files must never be.
 *
 * Merging in the service means no caller can get this wrong.
 */
function service() {
    const repository = createMemoryChatRepository()
    const fileStore: TalosAttachmentFileStore = {
        copyToPrivate: vi.fn(async () => ({
            privateUri: 'talos-vault/files/vault-1.md',
            bytes: new TextEncoder().encode('totale 2196'),
        })),
        readPrivate: vi.fn(),
        deletePrivate: vi.fn(),
    }
    const analysisClient: TalosAttachmentAnalysisClient = {
        analyze: vi.fn(async () => ({
            mediaType: 'text/markdown',
            extension: 'md',
            sha256: 'b'.repeat(64),
            extractedText: 'totale 2196',
            pageCount: null,
        })),
    }
    return {
        repository,
        vault: createTalosVaultService({ repository, fileStore, analysisClient }),
    }
}

describe('per-document sharing switch', () => {
    it('withdraws a document from the model WITHOUT erasing where it came from', async () => {
        const { repository, vault } = service()
        const created = await vault.createGenerated(
            { name: 'Report.md', mediaType: 'text/markdown', text: 'totale 2196' },
            { sessionId: 'session-1', model: null, provider: null },
        )

        await vault.setFileShared(created.file.id, false)

        const stored = await repository.getVaultFile(created.file.id)
        expect(stored?.metadata).toMatchObject({
            library_shared: false,
            // The two that a naive replace would have destroyed.
            origin: 'generated',
            origin_session_id: 'session-1',
        })
    })

    it('puts it back, and the flag round-trips', async () => {
        const { repository, vault } = service()
        const created = await vault.createGenerated(
            { name: 'Report.md', mediaType: 'text/markdown', text: 'x' },
            { sessionId: 'session-1', model: null, provider: null },
        )
        await vault.setFileShared(created.file.id, false)
        await vault.setFileShared(created.file.id, true)

        const stored = await repository.getVaultFile(created.file.id)
        expect(stored?.metadata).toMatchObject({ library_shared: true, origin: 'generated' })
    })

    it('refuses a file that is not there rather than inventing a row', async () => {
        const { vault } = service()
        await expect(vault.setFileShared('nope', false)).rejects.toThrow()
    })
})

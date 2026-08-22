import { describe, expect, it, vi } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createTalosVaultService } from '@/services/talosVaultService'
import type { TalosAttachmentAnalysisClient } from '@/services/attachmentAnalysisClient'
import type { TalosAttachmentFileStore } from '@/services/attachmentFileStore'

/**
 * Owner's R39 trace named it at last: `TALOS_ATTACHMENT_ANALYSIS_FAILED`.
 *
 * The analysis exists to inspect files a USER brings in — refusing what cannot
 * be understood is the right answer for those. But a document TALOS generated
 * and then verified by REOPENING it goes through the same gate, and there a
 * failure to extract searchable text destroys the document over a
 * nice-to-have. Three times now he has been offered DOCX and HTML instead of
 * the PDF that was sitting on disk, correct, already checked.
 *
 * So: for a generated file, analysis DEGRADES. The file is saved, the reason is
 * recorded where the next trace will show it, and only the searchable text is
 * lost.
 */
function harness(analysisClient: TalosAttachmentAnalysisClient) {
    const repository = createMemoryChatRepository({ now: () => '2026-07-27T02:00:00.000Z' })
    const fileStore: TalosAttachmentFileStore = {
        copyToPrivate: vi.fn(async () => ({
            privateUri: 'talos-vault/files/vault-1.pdf',
            bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        })),
        readPrivate: vi.fn(),
        deletePrivate: vi.fn(),
    }
    const service = createTalosVaultService({
        repository,
        fileStore,
        analysisClient,
        idFactory: vi.fn().mockReturnValueOnce('vault-1').mockReturnValueOnce('grant-1'),
        now: () => '2026-07-27T02:00:00.000Z',
    })
    return { service, repository, fileStore }
}

const REPORT = {
    name: 'Report Annuale 2025.pdf',
    mediaType: 'application/pdf',
    bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
}

describe('a document TALOS made and already verified', () => {
    it('is saved even when the analysis of it fails', async () => {
        const analysisClient: TalosAttachmentAnalysisClient = {
            analyze: vi.fn(async () => { throw new Error('pdfjs blew up in the WebView') }),
        }
        const { service } = harness(analysisClient)

        const saved = await service.createGeneratedBinary(REPORT, { sessionId: 'session-1', model: null, provider: null })

        expect(saved.file.status).toBe('available')
        expect(saved.file.display_name).toBe('Report Annuale 2025.pdf')
        expect(saved.grant).toBeTruthy()
    })

    it('says WHY the text is missing instead of pretending there was none', async () => {
        const analysisClient: TalosAttachmentAnalysisClient = {
            analyze: vi.fn(async () => { throw new Error('TALOS_ATTACHMENT_ANALYSIS_FAILED') }),
        }
        const { service } = harness(analysisClient)

        const saved = await service.createGeneratedBinary(REPORT, { sessionId: 'session-1', model: null, provider: null })

        expect(saved.file.extracted_text).toBe('')
        // Recorded on the row, so the Library can say the document is not
        // searchable rather than silently returning nothing for every query.
        expect(saved.file.metadata).toMatchObject({
            analysis_failed: 'TALOS_ATTACHMENT_ANALYSIS_FAILED',
        })
    })

    it('still fingerprints the bytes it stored', async () => {
        // sha256 came out of the analysis. Losing it would leave a file nothing
        // could later verify it had not been swapped.
        const analysisClient: TalosAttachmentAnalysisClient = {
            analyze: vi.fn(async () => { throw new Error('nope') }),
        }
        const { service } = harness(analysisClient)

        const saved = await service.createGeneratedBinary(REPORT, { sessionId: 'session-1', model: null, provider: null })

        expect(saved.file.sha256).toMatch(/^[0-9a-f]{64}$/)
    })

    it('keeps refusing an UPLOAD it could not inspect', async () => {
        // The gate stays shut for files the user brings in: an attachment that
        // cannot be understood must not reach a model.
        const analysisClient: TalosAttachmentAnalysisClient = {
            analyze: vi.fn(async () => { throw new Error('TALOS_ATTACHMENT_SIGNATURE_UNKNOWN') }),
        }
        const { service } = harness(analysisClient)

        await expect(service.ingest({
            name: 'mistero.bin',
            declaredMediaType: 'application/octet-stream',
            sizeBytes: 4,
            source: { kind: 'native-uri', uri: 'content://picker/x' },
        })).rejects.toThrow()
    })
})

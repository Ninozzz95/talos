import { describe, expect, it, vi } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createTalosVaultService } from '@/services/talosVaultService'
import { parseTalosFileProvenance } from '@/lib/files/provenance'
import type { TalosAttachmentAnalysisClient } from '@/services/attachmentAnalysisClient'
import type { TalosAttachmentFileStore } from '@/services/attachmentFileStore'

/**
 * Found by an adversarial review, 2026-07-31, and it was mine.
 *
 * A generated file whose analysis fails is kept anyway — that is a deliberate
 * decision, taken after the owner lost three correct PDFs to a flaky extraction
 * worker. But that rescue path wrote its OWN metadata, and the anonymity rule
 * lived only in the path beside it. So a picture drawn in an incognito chat,
 * on a phone where extraction timed out, kept `origin_session_id: "tmp-…"` on
 * disk forever — while the chat it named was destroyed on exit, exactly as
 * promised.
 *
 * The trigger is not adversarial: the worker has a 15-second timeout and it has
 * fired on the owner's own device. And the same branch dropped the whole
 * provenance record for ORDINARY chats, so the feature quietly disappeared
 * whenever extraction flaked.
 *
 * The structural cause is the one this codebase keeps re-learning: the record
 * was BUILT TWICE and the rule was applied once.
 */
function harness(analysisClient: TalosAttachmentAnalysisClient) {
    const repository = createMemoryChatRepository({ now: () => '2026-07-31T15:00:00.000Z' })
    const fileStore: TalosAttachmentFileStore = {
        copyToPrivate: vi.fn(async () => ({
            privateUri: 'talos-vault/files/vault-1.png',
            bytes: new Uint8Array([1, 2, 3]),
        })),
        readPrivate: vi.fn(),
        deletePrivate: vi.fn(),
    }
    const service = createTalosVaultService({
        repository,
        fileStore,
        analysisClient,
        idFactory: vi.fn().mockReturnValueOnce('vault-1').mockReturnValueOnce('grant-1'),
        now: () => '2026-07-31T15:00:00.000Z',
    })
    return { service, repository }
}

/** What the owner's device actually did: the worker never answered. */
const TIMED_OUT: TalosAttachmentAnalysisClient = {
    analyze: vi.fn(async () => { throw new Error('TALOS_ATTACHMENT_ANALYSIS_TIMEOUT') }),
}

const IMAGE = { name: 'gatto.png', mediaType: 'image/png', bytes: new Uint8Array([1, 2, 3]) }

describe('when the analysis fails, the file is kept — and so are the promises', () => {
    it('leaves no thread back to an incognito chat', async () => {
        const { service, repository } = harness(TIMED_OUT)

        const saved = await service.createGeneratedBinary(IMAGE, {
            sessionId: 'tmp-abc', model: 'kimi-k3', provider: 'moonshotai',
        })

        const stored = await repository.getVaultFile(saved.file.id)
        const metadata = stored?.metadata ?? {}
        expect(metadata.origin_session_id ?? null).toBeNull()
        expect(parseTalosFileProvenance(metadata.provenance)).toBeNull()
        // The file itself survives: that is the whole point of the rescue path.
        expect(stored?.status).toBe('available')
    })

    /** Not even under another name: the id is self-describing. */
    it('writes the incognito id nowhere in the record at all', async () => {
        const { service, repository } = harness(TIMED_OUT)

        const saved = await service.createGeneratedBinary(IMAGE, {
            sessionId: 'tmp-8a1f', model: null, provider: null,
        })

        const stored = await repository.getVaultFile(saved.file.id)
        expect(JSON.stringify(stored?.metadata ?? {})).not.toContain('tmp-8a1f')
    })

    /**
     * The other half of the same defect: an ORDINARY chat lost its origin
     * record entirely whenever extraction flaked, so the feature vanished
     * exactly on the devices slow enough to need it.
     */
    it('still records where the file came from for an ordinary chat', async () => {
        const { service, repository } = harness(TIMED_OUT)

        const saved = await service.createGeneratedBinary(IMAGE, {
            sessionId: 'chat-7', model: 'kimi-k3', provider: 'moonshotai',
        })

        const stored = await repository.getVaultFile(saved.file.id)
        expect(stored?.metadata.origin_session_id).toBe('chat-7')
        expect(parseTalosFileProvenance(stored?.metadata.provenance)).toMatchObject({
            origin: 'generated', model: 'kimi-k3', provider: 'moonshotai', originSessionId: 'chat-7',
        })
    })

    it('keeps saying why the document is not searchable', async () => {
        const { service, repository } = harness(TIMED_OUT)

        const saved = await service.createGeneratedBinary(IMAGE, {
            sessionId: 'chat-7', model: null, provider: null,
        })

        const stored = await repository.getVaultFile(saved.file.id)
        expect(stored?.metadata.analysis_failed).toBeTruthy()
    })
})

import { describe, expect, it, vi } from 'vitest'
import { createTalosVaultService } from '@/services/talosVaultService'
import { parseTalosFileProvenance } from '@/lib/files/provenance'

/**
 * Owner 2026-07-31: «spegnere il libretto in modalità incognito, e tutto quello
 * che creeremo in futuro che potrà identificare la persona».
 *
 * The asymmetry that makes this necessary: a file OUTLIVES the chat that made
 * it. The conversation vanishes on purpose; the document is kept on purpose. So
 * a file made in a temporary chat must not carry that chat with it, or the
 * Library becomes the record of the conversation the user was told had gone.
 */
function service() {
    const written: Array<Record<string, unknown>> = []
    const repository = {
        createVaultFile: vi.fn(async (input: Record<string, unknown>) => ({
            ...input, id: 'file-1', status: 'pending', metadata: {},
        })),
        updateVaultFile: vi.fn(async (_id: string, input: Record<string, unknown>) => {
            written.push(input.metadata as Record<string, unknown>)
            return { id: 'file-1', ...input, metadata: input.metadata ?? {} }
        }),
        createFileAuthorityGrant: vi.fn(async () => ({ id: 'grant-1' })),
        getVaultFile: vi.fn(async () => ({ id: 'file-1', status: 'available', metadata: {} })),
        listVaultFiles: vi.fn(async () => []),
        deleteVaultFile: vi.fn(async () => {}),
    }
    const vault = createTalosVaultService({
        repository: repository as never,
        fileStore: {
            copyToPrivate: vi.fn(async () => ({ privateUri: 'talos-vault/files/a.png', bytes: new Uint8Array([1]) })),
            deletePrivate: vi.fn(async () => {}),
        } as never,
        analysisClient: {
            analyze: vi.fn(async () => ({
                sha256: 'a'.repeat(64), extractedText: null, extension: 'png', pageCount: null,
            })),
        } as never,
    })
    return { vault, written }
}

const PICKED = {
    name: 'foto.png',
    declaredMediaType: 'image/png',
    sizeBytes: 1,
    source: { kind: 'web-blob' as const, blob: new Blob([new Uint8Array([1])]) },
}

describe('a file made in a temporary chat', () => {
    it('keeps no thread back to the chat that made it', async () => {
        const { vault, written } = service()

        await vault.createGeneratedBinary(
            { name: 'foto.png', mediaType: 'image/png', bytes: new Uint8Array([1]) },
            { sessionId: 'tmp-abc', model: 'gemini-live', provider: 'gemini' },
        )

        const metadata = written.at(-1) ?? {}
        expect(metadata.origin_session_id ?? null).toBeNull()
        expect(parseTalosFileProvenance(metadata.provenance)).toBeNull()
    })

    it('still records everything for an ordinary chat', async () => {
        const { vault, written } = service()

        await vault.createGeneratedBinary(
            { name: 'foto.png', mediaType: 'image/png', bytes: new Uint8Array([1]) },
            { sessionId: 'chat-7', model: 'gemini-live', provider: 'gemini' },
        )

        const metadata = written.at(-1) ?? {}
        expect(metadata.origin_session_id).toBe('chat-7')
        expect(parseTalosFileProvenance(metadata.provenance)?.originSessionId).toBe('chat-7')
    })
})

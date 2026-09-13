import { describe, expect, it, vi } from 'vitest'
import { createTalosVaultService } from '@/services/talosVaultService'
import { parseTalosFileProvenance } from '@/lib/files/provenance'

/**
 * Famiglia B — the origin record, carrying what only the caller can know.
 *
 * The record already existed and was written with nulls where the interesting
 * facts belong: which model made this, on which provider, answering which
 * message. Those live in the chat controller, four layers above the write, and
 * "four layers above" is exactly where `{ ephemeral: true }` was silently
 * dropped twice this week.
 *
 * So the session id stops being a bare positional string and becomes an ORIGIN
 * bag with `model` and `provider` REQUIRED — nullable, but required. A caller
 * that does not know has to say so, and a layer that forgets to pass it on does
 * not compile. That is a stronger guarantee than any test here, and these tests
 * check the other half: that what is passed actually reaches the stored record.
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

const IMAGE = { name: 'gatto.png', mediaType: 'image/png', bytes: new Uint8Array([1]) }

describe('a file the model made', () => {
    it('records which model made it, and where', async () => {
        const { vault, written } = service()

        await vault.createGeneratedBinary(IMAGE, {
            sessionId: 'chat-7',
            model: 'gemini-3.1-flash-lite',
            provider: 'gemini',
            promptMessageId: 'msg-42',
            toolName: 'image_generate',
        })

        const record = parseTalosFileProvenance((written.at(-1) ?? {}).provenance)
        expect(record).toMatchObject({
            origin: 'generated',
            model: 'gemini-3.1-flash-lite',
            provider: 'gemini',
            originSessionId: 'chat-7',
            promptMessageId: 'msg-42',
            toolName: 'image_generate',
        })
    })

    /**
     * P-05: a REFERENCE to the message that carried the prompt, never a copy of
     * it. A copy would be a second body of personal text to encrypt twice,
     * delete twice and forget twice; a reference dies with the chat, which is
     * what a reader expects when they delete a conversation.
     */
    it('references the prompt without copying it', async () => {
        const { vault, written } = service()

        await vault.createGeneratedBinary(IMAGE, {
            sessionId: 'chat-7',
            model: 'gemini-3.1-flash-lite',
            provider: 'gemini',
            promptMessageId: 'msg-42',
        })

        const stored = JSON.stringify((written.at(-1) ?? {}).provenance)
        expect(stored).toContain('msg-42')
        expect(stored.toLowerCase()).not.toContain('prompt information')
    })

    /** A caller that genuinely does not know says so, and the record is honest. */
    it('leaves what nobody knew as null rather than inventing it', async () => {
        const { vault, written } = service()

        await vault.createGeneratedBinary(IMAGE, { sessionId: 'chat-7', model: null, provider: null })

        const record = parseTalosFileProvenance((written.at(-1) ?? {}).provenance)
        expect(record?.model).toBeNull()
        expect(record?.provider).toBeNull()
        expect(record?.originSessionId).toBe('chat-7')
    })

    /**
     * The incognito rule still wins over all of it: a file outlives the chat
     * that made it, so a temporary chat must leave no thread behind — not the
     * chat id, and not the model that was asked in it.
     */
    it('records nothing at all when the chat was incognito', async () => {
        const { vault, written } = service()

        await vault.createGeneratedBinary(IMAGE, {
            sessionId: 'tmp-abc',
            model: 'gemini-3.1-flash-lite',
            provider: 'gemini',
            promptMessageId: 'msg-42',
        })

        const metadata = written.at(-1) ?? {}
        expect(metadata.origin_session_id ?? null).toBeNull()
        expect(parseTalosFileProvenance(metadata.provenance)).toBeNull()
    })

    it('carries the same facts for a text document', async () => {
        const { vault, written } = service()

        await vault.createGenerated(
            { name: 'nota.md', mediaType: 'text/markdown', text: 'ciao' },
            { sessionId: 'chat-9', model: 'claude-opus-5', provider: 'anthropic' },
        )

        expect(parseTalosFileProvenance((written.at(-1) ?? {}).provenance)).toMatchObject({
            model: 'claude-opus-5', provider: 'anthropic', originSessionId: 'chat-9',
        })
    })
})

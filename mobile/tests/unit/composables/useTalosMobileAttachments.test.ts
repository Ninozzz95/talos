import { describe, expect, it, vi } from 'vitest'
import {
    useTalosMobileAttachments as createAttachments,
    type TalosMobileAttachmentsOptions,
} from '@/composables/useTalosMobileAttachments'
import { TALOS_MOBILE_ATTACHMENT_LIMITS } from '@/lib/chat/attachmentContracts'
import type { TalosLocalFileAuthorityGrant, TalosLocalVaultFile } from '@/repositories/chatRepository'
import type { TalosPickedFile } from '@/services/nativeFilePicker'
import type { TalosVaultService, TalosVaultTrayItem } from '@/services/talosVaultService'
import { talosTestT } from '../../helpers/talosTestI18n'

function useTalosMobileAttachments(options: Omit<TalosMobileAttachmentsOptions, 'translate'>) {
    return createAttachments({ ...options, translate: talosTestT('en') })
}

function picked(name = 'brief.txt', sizeBytes = 5): TalosPickedFile {
    return {
        name,
        declaredMediaType: 'text/plain',
        sizeBytes,
        source: { kind: 'web-blob', blob: new Blob(['brief'], { type: 'text/plain' }) },
    }
}

function vaultFile(id: string, name = 'brief.txt', sizeBytes = 5): TalosLocalVaultFile {
    return {
        id,
        display_name: name,
        media_type: 'text/plain',
        size_bytes: sizeBytes,
        private_uri: `talos-vault/files/${id}.txt`,
        status: 'available',
        trust: 'untrusted',
        sha256: 'a'.repeat(64),
        extracted_text: 'brief',
        failure_code: null,
        metadata: {},
        created_at: '2026-07-22T10:00:00.000Z',
        updated_at: '2026-07-22T10:00:00.000Z',
    }
}

function grant(id: string, fileId: string): TalosLocalFileAuthorityGrant {
    return {
        id,
        vault_file_id: fileId,
        permissions: ['browser.upload', 'model.read'],
        status: 'active',
        label: 'brief.txt',
        created_at: '2026-07-22T10:00:00.000Z',
        updated_at: '2026-07-22T10:00:00.000Z',
        revoked_at: null,
    }
}

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: unknown) => void
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
    })
    return { promise, resolve, reject }
}

function makeVault(overrides: Partial<TalosVaultService> = {}): TalosVaultService {
    return {
        ingest: vi.fn(async (file): Promise<TalosVaultTrayItem> => {
            const stored = vaultFile(`file-${file.name}`, file.name, file.sizeBytes)
            return { file: stored, grant: grant(`grant-${file.name}`, stored.id) }
        }),
        createGenerated: vi.fn(async (input): Promise<TalosVaultTrayItem> => {
            const stored = vaultFile(`gen-${input.name}`, input.name, input.text.length)
            return { file: stored, grant: grant(`grant-gen-${input.name}`, stored.id) }
        }),
        createGeneratedBinary: vi.fn(async (input): Promise<TalosVaultTrayItem> => {
            const stored = {
                ...vaultFile(`gen-${input.name}`, input.name, input.bytes.byteLength),
                media_type: input.mediaType,
            }
            return { file: stored, grant: grant(`grant-gen-${input.name}`, stored.id) }
        }),
        readFilePreview: vi.fn().mockResolvedValue(null),
        readFileText: vi.fn().mockResolvedValue(null),
        createGrant: vi.fn(async (fileId) => grant(`grant-${fileId}`, fileId)),
        revokeGrant: vi.fn().mockResolvedValue(undefined),
        resolveMessageParts: vi.fn().mockResolvedValue([]),
        listFiles: vi.fn().mockResolvedValue([]),
        // Boot path now reads summaries (bodies are hydrated on demand).
        listSummaries: vi.fn().mockResolvedValue([]),
        setFileShared: vi.fn().mockResolvedValue(undefined),
        deleteFile: vi.fn().mockResolvedValue(undefined),
        reconcilePending: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    }
}

describe('useTalosMobileAttachments', () => {
    it('exposes ingestion progress then creates one durable binding per granted file', async () => {
        const pending = deferred<TalosVaultTrayItem>()
        const service = makeVault({ ingest: vi.fn(() => pending.promise) })
        const picker = { pickFiles: vi.fn().mockResolvedValue([picked()]) }
        const ids = ['draft-1', 'binding-1']
        const attachments = useTalosMobileAttachments({
            picker,
            vault: service,
            idFactory: () => ids.shift()!,
        })

        const selecting = attachments.selectFiles()
        await Promise.resolve()

        expect(attachments.items).toEqual([expect.objectContaining({
            id: 'draft-1',
            displayName: 'brief.txt',
            status: 'ingesting',
        })])
        expect(attachments.blocking.value).toBe(true)

        const stored = vaultFile('vault-1')
        pending.resolve({ file: stored, grant: grant('grant-1', stored.id) })
        await selecting

        expect(attachments.items).toEqual([expect.objectContaining({
            id: 'draft-1',
            vaultFileId: 'vault-1',
            grantId: 'grant-1',
            bindingId: 'binding-1',
            permissions: ['browser.upload', 'model.read'],
            status: 'authorized',
        })])
        expect(attachments.bindings.value).toEqual([{
            id: 'binding-1',
            vault_file_id: 'vault-1',
            grant_id: 'grant-1',
        }])
        expect(attachments.hasAuthorized.value).toBe(true)
        expect(attachments.blocking.value).toBe(false)
    })

    it('AV-07 serializes a multi-file picker batch before writing local storage', async () => {
        let activeWrites = 0
        let maximumActiveWrites = 0
        const service = makeVault({
            ingest: vi.fn(async (file): Promise<TalosVaultTrayItem> => {
                activeWrites += 1
                maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites)
                await new Promise((resolve) => setTimeout(resolve, 1))
                activeWrites -= 1
                const stored = vaultFile(`file-${file.name}`, file.name, file.sizeBytes)
                return { file: stored, grant: grant(`grant-${file.name}`, stored.id) }
            }),
        })
        const attachments = useTalosMobileAttachments({
            picker: {
                pickFiles: vi.fn().mockResolvedValue([
                    picked('reference.png'),
                    picked('release-brief.txt'),
                ]),
            },
            vault: service,
        })

        await attachments.selectFiles()

        expect(maximumActiveWrites).toBe(1)
        expect(attachments.items).toHaveLength(2)
        expect(attachments.items.every((item) => item.status === 'authorized')).toBe(true)
    })

    it('rejects an over-budget picker result before reading or ingesting any file', async () => {
        const service = makeVault()
        const picker = {
            pickFiles: vi.fn().mockResolvedValue([
                picked('first.pdf', TALOS_MOBILE_ATTACHMENT_LIMITS.maxBytesPerMessage),
                picked('second.txt', 1),
            ]),
        }
        const attachments = useTalosMobileAttachments({ picker, vault: service })

        await attachments.selectFiles()

        expect(service.ingest).not.toHaveBeenCalled()
        expect(attachments.items).toHaveLength(0)
        expect(attachments.error.value).toContain('20 MB')
    })

    it('keeps failed ingestion visible and blocking until the user removes it', async () => {
        const service = makeVault({
            ingest: vi.fn().mockRejectedValue(new Error('TALOS_ATTACHMENT_SIGNATURE_MISMATCH')),
        })
        const attachments = useTalosMobileAttachments({
            picker: { pickFiles: vi.fn().mockResolvedValue([picked('spoofed.png')]) },
            vault: service,
            idFactory: () => 'draft-failed',
        })

        await attachments.selectFiles()

        expect(attachments.items).toEqual([expect.objectContaining({
            status: 'failed',
            // N1.5: the chip shows the FRIENDLY message, never the raw TALOS_* code.
            error: 'The file contents do not match the declared file type.',
        })])
        expect(attachments.blocking.value).toBe(true)
        await attachments.remove('draft-failed')
        expect(attachments.items).toHaveLength(0)
        expect(attachments.blocking.value).toBe(false)
    })

    it('revokes an unsent grant on remove but preserves grants after a successful send reset', async () => {
        const service = makeVault()
        const ids = ['draft-1', 'binding-1', 'draft-2', 'binding-2']
        const attachments = useTalosMobileAttachments({
            picker: { pickFiles: vi.fn().mockResolvedValue([picked()]) },
            vault: service,
            idFactory: () => ids.shift()!,
        })

        await attachments.selectFiles()
        await attachments.remove('draft-1')
        expect(service.revokeGrant).toHaveBeenCalledWith('grant-brief.txt')

        await attachments.selectFiles()
        attachments.clearSent()
        expect(attachments.items).toHaveLength(0)
        expect(service.revokeGrant).toHaveBeenCalledTimes(1)
    })

    it('attaches an existing Vault file with a fresh grant and prevents duplicate selection', async () => {
        const service = makeVault()
        const ids = ['draft-existing', 'binding-existing']
        const attachments = useTalosMobileAttachments({
            picker: { pickFiles: vi.fn().mockResolvedValue([]) },
            vault: service,
            idFactory: () => ids.shift()!,
        })
        const file = vaultFile('vault-existing')

        await expect(attachments.attachExisting(file)).resolves.toBe(true)
        await expect(attachments.attachExisting(file)).resolves.toBe(false)

        expect(service.createGrant).toHaveBeenCalledTimes(1)
        expect(attachments.items).toEqual([expect.objectContaining({
            source: 'vault',
            vaultFileId: 'vault-existing',
            status: 'authorized',
        })])
        expect(attachments.error.value).toContain('already attached')
    })

    it('saveGenerated stores a chat artifact, drops its pre-minted grant, and refreshes the Library', async () => {
        const stored = vaultFile('gen-1', 'summary.md', 10)
        const service = makeVault({
            createGenerated: vi.fn().mockResolvedValue({ file: stored, grant: grant('grant-gen', 'gen-1') }),
            listFiles: vi.fn().mockResolvedValue([stored]),
            listSummaries: vi.fn().mockResolvedValue([stored]),
        })
        const attachments = useTalosMobileAttachments({
            picker: { pickFiles: vi.fn().mockResolvedValue([]) },
            vault: service,
        })

        const file = await attachments.saveGenerated({ name: 'summary.md', mediaType: 'text/markdown', text: 'hello' }, { model: null, provider: null })

        expect(service.createGenerated).toHaveBeenCalledWith(
            { name: 'summary.md', mediaType: 'text/markdown', text: 'hello' },
            { sessionId: null, model: null, provider: null },
        )
        expect(service.revokeGrant).toHaveBeenCalledWith('grant-gen') // not attached → no lingering grant
        expect(file.id).toBe('gen-1')
        expect(attachments.vaultFiles.map((candidate) => candidate.id)).toContain('gen-1')
    })

    it('passes a multi-link search dossier through without flattening its metadata', async () => {
        const stored = vaultFile('search-1', 'Web search.md', 10)
        const service = makeVault({
            createGenerated: vi.fn().mockResolvedValue({
                file: stored,
                grant: grant('grant-search', 'search-1'),
            }),
            listSummaries: vi.fn().mockResolvedValue([stored]),
        })
        const attachments = useTalosMobileAttachments({
            picker: { pickFiles: vi.fn().mockResolvedValue([]) },
            vault: service,
            currentSessionId: () => 'session-web',
        })
        const input = {
            name: 'Web search.md',
            mediaType: 'text/markdown',
            text: '# Search',
            kind: 'web_source' as const,
            sourceUrl: null,
            sourceLinks: [{ url: 'https://example.com/a', title: 'A' }],
        }

        await attachments.saveGenerated(input, { model: null, provider: null })

        expect(service.createGenerated).toHaveBeenCalledWith(
            input,
            { sessionId: 'session-web', model: null, provider: null },
        )
        expect(service.revokeGrant).toHaveBeenCalledWith('grant-search')
    })

    it('P1-CTX-ISO-07 stamps generated artifacts with the captured owner instead of live navigation', async () => {
        const textFile = vaultFile('generated-owner-text', 'owner.md', 5)
        const binaryFile = vaultFile('generated-owner-binary', 'owner.pdf', 4)
        const service = makeVault({
            createGenerated: vi.fn().mockResolvedValue({
                file: textFile,
                grant: grant('grant-owner-text', textFile.id),
            }),
            createGeneratedBinary: vi.fn().mockResolvedValue({
                file: binaryFile,
                grant: grant('grant-owner-binary', binaryFile.id),
            }),
            listSummaries: vi.fn().mockResolvedValue([textFile, binaryFile]),
        })
        const attachments = useTalosMobileAttachments({
            picker: { pickFiles: vi.fn().mockResolvedValue([]) },
            vault: service,
            currentSessionId: () => 'navigated-chat',
        })

        await attachments.saveGenerated({
            name: 'owner.md',
            mediaType: 'text/markdown',
            text: 'owner',
        }, { sessionId: 'captured-owner-chat', model: 'claude-opus-5', provider: 'anthropic' })
        await attachments.saveGeneratedBinary({
            name: 'owner.pdf',
            mediaType: 'application/pdf',
            bytes: new Uint8Array([1, 2, 3, 4]),
        }, false, { sessionId: 'captured-owner-chat', model: 'claude-opus-5', provider: 'anthropic' })

        expect(service.createGenerated).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'owner.md' }),
            expect.objectContaining({
                sessionId: 'captured-owner-chat', model: 'claude-opus-5', provider: 'anthropic',
            }),
        )
        expect(service.createGeneratedBinary).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'owner.pdf' }),
            expect.objectContaining({
                sessionId: 'captured-owner-chat', model: 'claude-opus-5', provider: 'anthropic',
            }),
        )
    })

    it('IMAGE-DUR-04 retains only the grant used by a generated assistant attachment', async () => {
        const inline = {
            ...vaultFile('generated-inline', 'astronaut.png', 3),
            media_type: 'image/png',
        }
        const libraryOnly = {
            ...vaultFile('generated-library', 'report.pdf', 4),
            media_type: 'application/pdf',
        }
        const service = makeVault({
            createGeneratedBinary: vi.fn()
                .mockResolvedValueOnce({
                    file: inline,
                    grant: grant('grant-inline', inline.id),
                })
                .mockResolvedValueOnce({
                    file: libraryOnly,
                    grant: grant('grant-library', libraryOnly.id),
                }),
            listSummaries: vi.fn()
                .mockResolvedValueOnce([inline])
                .mockResolvedValueOnce([inline, libraryOnly]),
        })
        const attachments = useTalosMobileAttachments({
            picker: { pickFiles: vi.fn().mockResolvedValue([]) },
            vault: service,
            currentSessionId: () => 'chat-image',
        })

        const result = await attachments.saveGeneratedBinary({
            name: 'astronaut.png',
            mediaType: 'image/png',
            bytes: new Uint8Array([1, 2, 3]),
        }, true, { model: null, provider: null })

        expect(result).toEqual({
            file: inline,
            attachment: {
                id: 'grant-inline',
                vault_file_id: 'generated-inline',
                grant_id: 'grant-inline',
            },
        })
        expect(service.revokeGrant).not.toHaveBeenCalledWith('grant-inline')

        await attachments.saveGeneratedBinary({
            name: 'report.pdf',
            mediaType: 'application/pdf',
            bytes: new Uint8Array([1, 2, 3, 4]),
        }, false, { model: null, provider: null })
        expect(service.revokeGrant).toHaveBeenCalledWith('grant-library')
        // The session is still resolved from where you are when the caller does
        // not name one — it just travels inside the origin bag now.
        expect(service.createGeneratedBinary).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ name: 'astronaut.png' }),
            expect.objectContaining({ sessionId: 'chat-image' }),
        )
    })

    it('reconciles pending files and exposes the durable Vault catalog at startup', async () => {
        const files = [
            vaultFile('vault-new', 'new.txt'),
            { ...vaultFile('vault-failed', 'failed.pdf'), status: 'failed' as const, failure_code: 'TALOS_ATTACHMENT_ANALYSIS_FAILED' },
        ]
        const service = makeVault({ listFiles: vi.fn().mockResolvedValue(files), listSummaries: vi.fn().mockResolvedValue(files) })
        const attachments = useTalosMobileAttachments({
            picker: { pickFiles: vi.fn().mockResolvedValue([]) },
            vault: service,
        })

        await attachments.initialize()

        expect(service.reconcilePending).toHaveBeenCalledOnce()
        expect(service.listSummaries).toHaveBeenCalledOnce()
        expect(attachments.vaultFiles).toEqual(files)
        expect(attachments.vaultLoading.value).toBe(false)
        expect(attachments.vaultError.value).toBeNull()
    })

    it('deletes a Vault file only after storage confirms and removes its unsent binding', async () => {
        const file = vaultFile('vault-existing')
        const service = makeVault({
            listFiles: vi.fn()
                .mockResolvedValueOnce([file])
                .mockResolvedValueOnce([]),
            listSummaries: vi.fn()
                .mockResolvedValueOnce([file])
                .mockResolvedValueOnce([]),
        })
        const ids = ['draft-existing', 'binding-existing']
        const attachments = useTalosMobileAttachments({
            picker: { pickFiles: vi.fn().mockResolvedValue([]) },
            vault: service,
            idFactory: () => ids.shift()!,
        })
        await attachments.initialize()
        await attachments.attachExisting(file)

        await attachments.deleteVaultFile(file.id)

        expect(service.deleteFile).toHaveBeenCalledWith(file.id)
        expect(service.revokeGrant).not.toHaveBeenCalled()
        expect(attachments.items).toHaveLength(0)
        expect(attachments.vaultFiles).toHaveLength(0)
    })

    it('revokes every unsent authority grant before clearing attachments on an ownership change', async () => {
        const service = makeVault()
        const ids = ['draft-1', 'binding-1', 'draft-2', 'binding-2']
        const picker = {
            pickFiles: vi.fn()
                .mockResolvedValueOnce([picked('one.txt')])
                .mockResolvedValueOnce([picked('two.txt')]),
        }
        const attachments = useTalosMobileAttachments({
            picker,
            vault: service,
            idFactory: () => ids.shift()!,
        })
        await attachments.selectFiles()
        await attachments.selectFiles()

        await attachments.discardAll()

        expect(service.revokeGrant).toHaveBeenCalledWith('grant-one.txt')
        expect(service.revokeGrant).toHaveBeenCalledWith('grant-two.txt')
        expect(service.revokeGrant).toHaveBeenCalledTimes(2)
        expect(attachments.items).toHaveLength(0)
    })
})

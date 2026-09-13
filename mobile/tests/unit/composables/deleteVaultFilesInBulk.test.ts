import { describe, expect, it, vi } from 'vitest'
import {
    useTalosMobileAttachments as createAttachments,
    type TalosMobileAttachmentsOptions,
} from '@/composables/useTalosMobileAttachments'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'
import type { TalosVaultService } from '@/services/talosVaultService'
import { talosTestT } from '../../helpers/talosTestI18n'

function useTalosMobileAttachments(options: Omit<TalosMobileAttachmentsOptions, 'translate'>) {
    return createAttachments({ ...options, translate: talosTestT('en') })
}

/**
 * Owner 2026-07-26: deleting a chat must be able to take its documents with it,
 * and the Library needs a way to remove many files at once.
 *
 * Both are the same operation repeated, and repeating the SINGLE delete is the
 * wrong way to do it: it re-reads the whole vault after every file, so removing
 * twenty documents means twenty full list queries and twenty renders of a list
 * that is visibly disintegrating. Worse, it stops at the first failure, leaving
 * the deletion half done with no account of what survived.
 */
function vaultFile(id: string): TalosLocalVaultFile {
    return {
        id,
        display_name: `${id}.txt`,
        media_type: 'text/plain',
        size_bytes: 5,
        private_uri: `talos-vault/files/${id}.txt`,
        status: 'available',
        trust: 'untrusted',
        sha256: 'a'.repeat(64),
        extracted_text: 'brief',
        failure_code: null,
        metadata: {},
        created_at: '2026-07-26T10:00:00.000Z',
        updated_at: '2026-07-26T10:00:00.000Z',
    }
}

function makeVault(overrides: Partial<TalosVaultService> = {}): TalosVaultService {
    return {
        ingest: vi.fn(),
        createGenerated: vi.fn(),
        createGeneratedBinary: vi.fn(),
        createGrant: vi.fn(),
        revokeGrant: vi.fn().mockResolvedValue(undefined),
        resolveMessageParts: vi.fn().mockResolvedValue([]),
        listFiles: vi.fn().mockResolvedValue([]),
        listSummaries: vi.fn().mockResolvedValue([]),
        setFileShared: vi.fn().mockResolvedValue(undefined),
        readFileBytes: vi.fn().mockResolvedValue(null),
        hydrateText: vi.fn().mockResolvedValue(null),
        deleteFile: vi.fn().mockResolvedValue(undefined),
        reconcilePending: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    } as unknown as TalosVaultService
}

describe('removing several files at once', () => {
    it('deletes every one and re-reads the Library only once', async () => {
        const service = makeVault({
            listSummaries: vi.fn().mockResolvedValue([vaultFile('a'), vaultFile('b')]),
        })
        const attachments = useTalosMobileAttachments({
            picker: { pickFiles: vi.fn() },
            vault: service,
        })
        await attachments.initialize()
        const readsBefore = (service.listSummaries as ReturnType<typeof vi.fn>).mock.calls.length

        const failed = await attachments.deleteVaultFiles(['a', 'b'])

        expect(failed).toEqual([])
        expect(service.deleteFile).toHaveBeenCalledTimes(2)
        // One refresh for the whole batch, not one per file.
        const reads = service.listSummaries as ReturnType<typeof vi.fn>
        expect(reads.mock.calls.length + (service.listFiles as ReturnType<typeof vi.fn>).mock.calls.length)
            .toBe(readsBefore + 1)
    })

    it('keeps going past a failure and names what it could not remove', async () => {
        // One stubborn file must not strand the other nineteen.
        const service = makeVault({
            deleteFile: vi.fn(async (id: string) => {
                if (id === 'b') throw new Error('TALOS_ATTACHMENT_ANALYSIS_FAILED')
            }),
        })
        const attachments = useTalosMobileAttachments({
            picker: { pickFiles: vi.fn() },
            vault: service,
        })

        const failed = await attachments.deleteVaultFiles(['a', 'b', 'c'])

        expect(failed).toEqual(['b'])
        expect(service.deleteFile).toHaveBeenCalledTimes(3)
        // And the real cause survives, once: a permission error, a locked file
        // and a database fault are different problems.
        expect(attachments.takeDeleteFailure()).toBe('TALOS could not inspect this file.')
        expect(attachments.takeDeleteFailure()).toBeNull()
    })

    it('counts a file that was already gone as deleted, not as a failure', async () => {
        // SF-critic 2026-07-26: the vault throwing NOT_FOUND means the row is no
        // longer there — which is precisely what was asked for. Reporting it as
        // a failure taught the user to distrust a deletion that had worked.
        const service = makeVault({
            deleteFile: vi.fn(async () => { throw new Error('TALOS_VAULT_FILE_NOT_FOUND') }),
        })
        const attachments = useTalosMobileAttachments({
            picker: { pickFiles: vi.fn() },
            vault: service,
        })

        expect(await attachments.deleteVaultFiles(['ghost'])).toEqual([])
        expect(attachments.takeDeleteFailure()).toBeNull()
    })

    it('does nothing at all, quietly, when the list is empty', async () => {
        const service = makeVault()
        const attachments = useTalosMobileAttachments({
            picker: { pickFiles: vi.fn() },
            vault: service,
        })

        await expect(attachments.deleteVaultFiles([])).resolves.toEqual([])
        expect(service.deleteFile).not.toHaveBeenCalled()
        expect(service.listSummaries).not.toHaveBeenCalled()
    })
})

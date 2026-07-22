import { describe, expect, it, vi } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createTalosVaultService } from '@/services/talosVaultService'
import type { TalosAttachmentAnalysisClient } from '@/services/attachmentAnalysisClient'
import type { TalosAttachmentFileStore } from '@/services/attachmentFileStore'
import type { TalosPickedFile } from '@/services/nativeFilePicker'

const picked: TalosPickedFile = {
    name: 'report.txt',
    declaredMediaType: 'text/plain',
    sizeBytes: 5,
    source: { kind: 'native-uri', uri: 'content://picker/report' },
}

describe('createTalosVaultService', () => {
    it('AV-06 persists pending before copy and produces one available file plus exact grant', async () => {
        const repository = createMemoryChatRepository({
            now: () => '2026-07-22T10:00:04.000Z',
        })
        const calls: string[] = []
        const persistVaultFile = repository.createVaultFile.bind(repository)
        const createVaultFile = vi.spyOn(repository, 'createVaultFile').mockImplementation(async (input) => {
            calls.push(`db:${input.status}`)
            return persistVaultFile(input)
        })
        const fileStore: TalosAttachmentFileStore = {
            copyToPrivate: vi.fn().mockImplementation(async () => {
                calls.push('copy')
                return {
                    privateUri: 'talos-vault/files/vault-1.txt',
                    bytes: new TextEncoder().encode('hello'),
                }
            }),
            readPrivate: vi.fn(),
            deletePrivate: vi.fn(),
        }
        const analysisClient: TalosAttachmentAnalysisClient = {
            analyze: vi.fn().mockResolvedValue({
                mediaType: 'text/plain',
                extension: 'txt',
                sha256: 'a'.repeat(64),
                extractedText: 'hello',
                pageCount: null,
            }),
        }
        const service = createTalosVaultService({
            repository,
            fileStore,
            analysisClient,
            idFactory: vi.fn()
                .mockReturnValueOnce('vault-1')
                .mockReturnValueOnce('grant-1'),
            now: () => '2026-07-22T10:00:00.000Z',
        })

        const item = await service.ingest(picked)

        expect(calls).toEqual(['db:pending', 'copy'])
        expect(createVaultFile).toHaveBeenCalledBefore(vi.mocked(fileStore.copyToPrivate))
        expect(item).toMatchObject({
            file: { id: 'vault-1', status: 'available', extracted_text: 'hello' },
            grant: {
                id: 'grant-1',
                permissions: ['browser.upload', 'model.read'],
                status: 'active',
            },
        })
    })

    it('AV-06 removes partial bytes and records a bounded failed state', async () => {
        const repository = createMemoryChatRepository()
        const fileStore: TalosAttachmentFileStore = {
            copyToPrivate: vi.fn().mockResolvedValue({
                privateUri: 'talos-vault/files/vault-failed.txt',
                bytes: new TextEncoder().encode('hello'),
            }),
            readPrivate: vi.fn(),
            deletePrivate: vi.fn().mockResolvedValue(undefined),
        }
        const analysisClient: TalosAttachmentAnalysisClient = {
            analyze: vi.fn().mockRejectedValue(new Error('parser stack and private path')), 
        }
        const service = createTalosVaultService({
            repository,
            fileStore,
            analysisClient,
            idFactory: () => 'vault-failed',
            now: () => '2026-07-22T10:00:00.000Z',
        })

        await expect(service.ingest(picked)).rejects.toThrow('TALOS_ATTACHMENT_ANALYSIS_FAILED')
        expect(fileStore.deletePrivate).toHaveBeenCalledWith(
            'talos-vault/files/vault-failed.txt',
        )
        await expect(repository.getVaultFile('vault-failed')).resolves.toMatchObject({
            status: 'failed',
            failure_code: 'TALOS_ATTACHMENT_ANALYSIS_FAILED',
        })
    })
})

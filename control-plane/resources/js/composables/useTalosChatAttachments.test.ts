import { beforeEach, describe, expect, it, vi } from 'vitest'
import { talosFetch } from '../lib/api'
import { useTalosChatAttachments } from './useTalosChatAttachments'

vi.mock('../lib/api', async (importOriginal) => ({
    ...await importOriginal<typeof import('../lib/api')>(),
    talosFetch: vi.fn(),
}))

const talosFetchMock = vi.mocked(talosFetch)

function ingestedFile(id: string, name: string, status = 'available') {
    return {
        id,
        original_name: name,
        mime_type: 'text/markdown',
        size_bytes: 42,
        checksum: `sha-${id}`,
        status,
        failure_reason: status === 'failed' ? 'Unsupported file content.' : null,
    }
}

function fileGrant(id: string, fileId: string, name: string) {
    return {
        id,
        scope: 'file',
        label: name,
        permissions: ['model.read', 'browser.upload'],
        status: 'active',
        talos_session_id: null,
        files: [{
            id: fileId,
            original_name: name,
            mime_type: 'text/markdown',
            size_bytes: 42,
            checksum: `sha-${fileId}`,
            status: 'available',
        }],
        expires_at: null,
        revoked_at: null,
        last_used_at: null,
        created_at: '2026-07-17T00:00:00Z',
        updated_at: '2026-07-17T00:00:00Z',
    }
}

describe('useTalosChatAttachments', () => {
    beforeEach(() => {
        talosFetchMock.mockReset()
    })

    it('becomes ready only after an exact per-file grant and exposes correlated grant ids', async () => {
        talosFetchMock
            .mockResolvedValueOnce({ data: ingestedFile('file-1', 'notes.md') } as never)
            .mockResolvedValueOnce({ data: fileGrant('grant-1', 'file-1', 'notes.md') } as never)
        const tray = useTalosChatAttachments()

        await tray.attachFile(new File(['deploy notes'], 'notes.md', { type: 'text/markdown' }))

        expect(talosFetchMock).toHaveBeenNthCalledWith(2, '/api/talos/file-authority/grants', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
                scope: 'file',
                permissions: ['model.read', 'browser.upload'],
                file_ids: ['file-1'],
                label: 'notes.md',
            }),
        }))
        expect(tray.attachments.value[0]).toMatchObject({
            file_id: 'file-1',
            grant_id: 'grant-1',
            status: 'available',
        })
        expect(tray.readyFileIds.value).toEqual(['file-1'])
        expect(tray.readyGrantIds.value).toEqual(['grant-1'])
    })

    it('uploads a file through the real ingestion endpoint and exposes a ready Vault reference', async () => {
        talosFetchMock
            .mockResolvedValueOnce({ data: ingestedFile('file-1', 'notes.md') } as never)
            .mockResolvedValueOnce({ data: fileGrant('grant-1', 'file-1', 'notes.md') } as never)
        const tray = useTalosChatAttachments()

        await tray.attachFile(new File(['deploy notes'], 'notes.md', { type: 'text/markdown' }))

        expect(talosFetchMock).toHaveBeenCalledWith('/api/files/ingest', expect.objectContaining({ method: 'POST' }))
        const [, options] = talosFetchMock.mock.calls[0]
        expect(options?.body).toBeInstanceOf(FormData)
        expect(tray.attachments.value).toHaveLength(1)
        expect(tray.attachments.value[0]).toMatchObject({ file_id: 'file-1', grant_id: 'grant-1', name: 'notes.md', status: 'available' })
        expect(tray.readyFileIds.value).toEqual(['file-1'])
        expect(tray.hasPendingUpload.value).toBe(false)
    })

    it('keeps a failed ingestion as an actionable chip without a ready reference', async () => {
        talosFetchMock.mockRejectedValueOnce(new Error('TALOS rejected this file for ingestion.'))
        const tray = useTalosChatAttachments()

        await expect(tray.attachFile(new File(['x'], 'bad.bin'))).rejects.toBeInstanceOf(Error)

        expect(tray.attachments.value).toHaveLength(1)
        expect(tray.attachments.value[0]).toMatchObject({ status: 'failed', name: 'bad.bin' })
        expect(tray.attachments.value[0].failure_reason).toMatch(/rejected/i)
        expect(tray.readyFileIds.value).toEqual([])
    })

    it('marks the chip as uploading while ingestion is in flight', async () => {
        let resolveUpload: ((value: unknown) => void) | null = null
        talosFetchMock
            .mockImplementationOnce(() => new Promise((resolve) => { resolveUpload = resolve }))
            .mockResolvedValueOnce({ data: fileGrant('grant-slow', 'file-slow', 'slow.md') } as never)
        const tray = useTalosChatAttachments()

        const pending = tray.attachFile(new File(['x'], 'slow.md'))
        expect(tray.attachments.value[0]).toMatchObject({ status: 'uploading', name: 'slow.md' })
        expect(tray.hasPendingUpload.value).toBe(true)

        resolveUpload?.({ data: ingestedFile('file-slow', 'slow.md') })
        await pending

        expect(tray.attachments.value[0]).toMatchObject({ status: 'available', file_id: 'file-slow' })
        expect(tray.hasPendingUpload.value).toBe(false)
    })

    it('adds an existing Vault file as a ready reference without re-uploading', async () => {
        talosFetchMock.mockResolvedValueOnce({ data: fileGrant('grant-vault', 'vault-1', 'kb.md') } as never)
        const tray = useTalosChatAttachments()

        await tray.attachVaultFile({ id: 'vault-1', original_name: 'kb.md', status: 'available' } as never)

        expect(talosFetchMock).toHaveBeenCalledTimes(1)
        expect(tray.attachments.value[0]).toMatchObject({ file_id: 'vault-1', grant_id: 'grant-vault', name: 'kb.md', status: 'available' })
        expect(tray.readyFileIds.value).toEqual(['vault-1'])
    })

    it('refuses a Vault reference that is not available', async () => {
        const tray = useTalosChatAttachments()

        await expect(tray.attachVaultFile({ id: 'vault-x', original_name: 'broken.md', status: 'failed' } as never)).rejects.toThrow(/available/i)
        expect(tray.attachments.value).toHaveLength(0)
    })

    it('does not attach the same Vault file twice', async () => {
        talosFetchMock.mockResolvedValueOnce({ data: fileGrant('grant-vault', 'vault-1', 'kb.md') } as never)
        const tray = useTalosChatAttachments()

        await tray.attachVaultFile({ id: 'vault-1', original_name: 'kb.md', status: 'available' } as never)
        await tray.attachVaultFile({ id: 'vault-1', original_name: 'kb.md', status: 'available' } as never)

        expect(tray.attachments.value).toHaveLength(1)
    })

    it('removes a chip and resets on chat change', async () => {
        talosFetchMock
            .mockResolvedValueOnce({ data: ingestedFile('file-1', 'notes.md') } as never)
            .mockResolvedValueOnce({ data: fileGrant('grant-1', 'file-1', 'notes.md') } as never)
            .mockResolvedValueOnce({ data: fileGrant('grant-vault', 'vault-1', 'kb.md') } as never)
            .mockResolvedValueOnce({ data: { ...fileGrant('grant-1', 'file-1', 'notes.md'), status: 'revoked' } } as never)
        const tray = useTalosChatAttachments()
        await tray.attachFile(new File(['deploy notes'], 'notes.md'))
        await tray.attachVaultFile({ id: 'vault-1', original_name: 'kb.md', status: 'available' } as never)

        await tray.remove(tray.attachments.value[0].id)
        expect(tray.attachments.value).toHaveLength(1)

        tray.reset()
        expect(tray.attachments.value).toEqual([])
        expect(tray.readyFileIds.value).toEqual([])
    })
})

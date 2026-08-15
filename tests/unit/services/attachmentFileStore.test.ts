import { describe, expect, it, vi } from 'vitest'
import {
    createAttachmentFileStore,
    type TalosFilesystemPort,
} from '@/services/attachmentFileStore'
import type { TalosPickedFile } from '@/services/nativeFilePicker'

function filesystem(): TalosFilesystemPort {
    return {
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue({ data: 'aGVsbG8=' }),
        writeFile: vi.fn().mockResolvedValue(undefined),
        deleteFile: vi.fn().mockResolvedValue(undefined),
    }
}

describe('createAttachmentFileStore', () => {
    it('AV-04 copies a native URI to an app-generated private path', async () => {
        const fs = filesystem()
        const file: TalosPickedFile = {
            name: '../../customer-report.pdf',
            declaredMediaType: 'application/pdf',
            sizeBytes: 5,
            source: { kind: 'native-uri', uri: 'content://picker/customer-report' },
        }
        const store = createAttachmentFileStore({ filesystem: fs })

        const result = await store.copyToPrivate(file, 'vault-file-1')

        expect(result.privateUri).toBe('talos-vault/files/vault-file-1.pdf')
        expect([...result.bytes]).toEqual([...new TextEncoder().encode('hello')])
        expect(fs.readFile).toHaveBeenCalledWith({ path: 'content://picker/customer-report' })
        expect(fs.writeFile).toHaveBeenCalledWith(expect.objectContaining({
            path: 'talos-vault/files/vault-file-1.pdf',
            data: 'aGVsbG8=',
        }))
        expect(result.privateUri).not.toContain('customer-report')
    })

    it('AV-04 deletes a partial private file when the write fails', async () => {
        const fs = filesystem()
        vi.mocked(fs.writeFile).mockRejectedValue(new Error('disk full'))
        const store = createAttachmentFileStore({ filesystem: fs })
        const file: TalosPickedFile = {
            name: 'notes.txt',
            declaredMediaType: 'text/plain',
            sizeBytes: 5,
            source: { kind: 'native-uri', uri: 'content://picker/notes' },
        }

        await expect(store.copyToPrivate(file, 'vault-file-2')).rejects.toThrow('disk full')
        expect(fs.deleteFile).toHaveBeenCalledWith(expect.objectContaining({
            path: 'talos-vault/files/vault-file-2.txt',
        }))
    })

    it('AV-04 rejects an over-limit file before reading the source', async () => {
        const fs = filesystem()
        const store = createAttachmentFileStore({ filesystem: fs })
        const file: TalosPickedFile = {
            name: 'huge.pdf',
            declaredMediaType: 'application/pdf',
            sizeBytes: 10 * 1024 * 1024 + 1,
            source: { kind: 'native-uri', uri: 'content://picker/huge' },
        }

        await expect(store.copyToPrivate(file, 'vault-file-3'))
            .rejects.toThrow('TALOS_ATTACHMENT_FILE_TOO_LARGE')
        expect(fs.readFile).not.toHaveBeenCalled()
    })
})

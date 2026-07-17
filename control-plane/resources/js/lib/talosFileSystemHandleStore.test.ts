import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
    const db = {
        put: vi.fn(),
        get: vi.fn(),
        getAllKeys: vi.fn(),
        delete: vi.fn(),
    }

    return {
        db,
        openDB: vi.fn(async () => db),
    }
})

vi.mock('idb', () => ({ openDB: mocks.openDB }))

import {
    deleteDirectoryHandle,
    getDirectoryHandle,
    listDirectoryHandleGrantIds,
    putDirectoryHandle,
    queryReadPermission,
    requestReadPermission,
} from './talosFileSystemHandleStore'

function directoryHandle(permission: PermissionState = 'granted') {
    return {
        kind: 'directory',
        name: 'Evidence',
        queryPermission: vi.fn(async () => permission),
        requestPermission: vi.fn(async () => permission),
    } as unknown as FileSystemDirectoryHandle
}

describe('talosFileSystemHandleStore', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.db.get.mockResolvedValue(undefined)
        mocks.db.getAllKeys.mockResolvedValue([])
    })

    it('stores, retrieves and deletes a serializable directory handle by grant identity', async () => {
        const handle = directoryHandle()
        mocks.db.get.mockResolvedValueOnce({ grant_id: 'grant-1', handle, updated_at: '2026-07-17T00:00:00.000Z' })

        await putDirectoryHandle('grant-1', handle)
        await expect(getDirectoryHandle('grant-1')).resolves.toBe(handle)
        await deleteDirectoryHandle('grant-1')

        expect(mocks.openDB).toHaveBeenCalledWith('talos-file-authority', 1, expect.objectContaining({ upgrade: expect.any(Function) }))
        expect(mocks.db.put).toHaveBeenCalledWith('directory-handles', expect.objectContaining({ grant_id: 'grant-1', handle }))
        expect(mocks.db.get).toHaveBeenCalledWith('directory-handles', 'grant-1')
        expect(mocks.db.delete).toHaveBeenCalledWith('directory-handles', 'grant-1')
    })

    it('lists every persisted directory-handle grant identity for account reconciliation', async () => {
        mocks.db.getAllKeys.mockResolvedValueOnce(['grant-two', 'grant-one'])

        await expect(listDirectoryHandleGrantIds()).resolves.toEqual(['grant-one', 'grant-two'])

        expect(mocks.db.getAllKeys).toHaveBeenCalledWith('directory-handles')
    })

    it('queries and requests read permission through the upstream handle contract', async () => {
        const handle = directoryHandle('granted') as FileSystemDirectoryHandle & {
            queryPermission: ReturnType<typeof vi.fn>
            requestPermission: ReturnType<typeof vi.fn>
        }

        await expect(queryReadPermission(handle)).resolves.toBe('granted')
        await expect(requestReadPermission(handle)).resolves.toBe('granted')

        expect(handle.queryPermission).toHaveBeenCalledWith({ mode: 'read' })
        expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'read' })
    })

    it('fails closed for malformed identities, non-directory handles and unavailable permission methods', async () => {
        await expect(putDirectoryHandle('', directoryHandle())).rejects.toThrow(/identity/i)
        await expect(putDirectoryHandle('grant-1', { kind: 'file' } as FileSystemDirectoryHandle)).rejects.toThrow(/directory/i)

        const unsupported = { kind: 'directory', name: 'Unsupported' } as FileSystemDirectoryHandle
        await expect(queryReadPermission(unsupported)).resolves.toBe('denied')
        await expect(requestReadPermission(unsupported)).resolves.toBe('denied')
        expect(mocks.db.put).not.toHaveBeenCalled()
    })
})

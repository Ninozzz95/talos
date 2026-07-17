import { beforeEach, describe, expect, it, vi } from 'vitest'
import { talosFetch } from '../lib/api'
import {
    deleteDirectoryHandle,
    getDirectoryHandle,
    listDirectoryHandleGrantIds,
    putDirectoryHandle,
    queryReadPermission,
    requestReadPermission,
} from '../lib/talosFileSystemHandleStore'
import { useTalosFileAuthority } from './useTalosFileAuthority'

vi.mock('../lib/api', async (importOriginal) => ({
    ...await importOriginal<typeof import('../lib/api')>(),
    talosFetch: vi.fn(),
}))

vi.mock('../lib/talosFileSystemHandleStore', () => ({
    deleteDirectoryHandle: vi.fn(),
    getDirectoryHandle: vi.fn(),
    listDirectoryHandleGrantIds: vi.fn(),
    putDirectoryHandle: vi.fn(),
    queryReadPermission: vi.fn(),
    requestReadPermission: vi.fn(),
}))

const talosFetchMock = vi.mocked(talosFetch)
const deleteDirectoryHandleMock = vi.mocked(deleteDirectoryHandle)
const getDirectoryHandleMock = vi.mocked(getDirectoryHandle)
const listDirectoryHandleGrantIdsMock = vi.mocked(listDirectoryHandleGrantIds)
const putDirectoryHandleMock = vi.mocked(putDirectoryHandle)
const queryReadPermissionMock = vi.mocked(queryReadPermission)
const requestReadPermissionMock = vi.mocked(requestReadPermission)

function vaultFile(id: string, name: string) {
    return {
        id,
        original_name: name,
        mime_type: 'text/plain',
        size_bytes: 12,
        checksum: `sha-${id}`,
        status: 'available',
        created_at: '2026-07-17T00:00:00Z',
        updated_at: '2026-07-17T00:00:00Z',
    }
}

function grant(overrides: Record<string, unknown> = {}) {
    return {
        id: 'grant-1',
        scope: 'file',
        label: 'notes.txt',
        permissions: ['model.read', 'browser.upload'],
        status: 'active',
        talos_session_id: null,
        files: [vaultFile('file-1', 'notes.txt')],
        expires_at: null,
        revoked_at: null,
        last_used_at: null,
        created_at: '2026-07-17T00:00:00Z',
        updated_at: '2026-07-17T00:00:00Z',
        ...overrides,
    }
}

function directoryHandle(files: File[]) {
    return {
        kind: 'directory',
        name: 'Evidence',
        async *values() {
            for (const file of files) {
                yield {
                    kind: 'file',
                    name: file.name,
                    getFile: vi.fn(async () => file),
                }
            }
        },
    } as unknown as FileSystemDirectoryHandle
}

describe('useTalosFileAuthority', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.unstubAllGlobals()
        getDirectoryHandleMock.mockResolvedValue(null)
        listDirectoryHandleGrantIdsMock.mockResolvedValue([])
        queryReadPermissionMock.mockResolvedValue('denied')
        requestReadPermissionMock.mockResolvedValue('denied')
    })

    it('loads owner grants for the active session and available Vault files', async () => {
        talosFetchMock
            .mockResolvedValueOnce({ data: [grant()] } as never)
            .mockResolvedValueOnce({ data: [vaultFile('file-1', 'notes.txt')] } as never)
        const authority = useTalosFileAuthority()

        await authority.loadGrants('session one')
        await authority.loadVaultFiles()

        expect(talosFetchMock).toHaveBeenNthCalledWith(1, '/api/talos/file-authority/grants?session_id=session%20one')
        expect(talosFetchMock).toHaveBeenNthCalledWith(2, '/api/talos/files')
        expect(authority.grants.value).toHaveLength(1)
        expect(authority.grants.value[0]).toMatchObject({
            id: 'grant-1',
            scope: 'file',
            files: [{ id: 'file-1', original_name: 'notes.txt' }],
        })
        expect(authority.availableVaultFiles.value.map((file) => file.id)).toEqual(['file-1'])
    })

    it('keeps late grant responses from an obsolete chat session inert', async () => {
        let resolveObsolete!: (value: { data: unknown[] }) => void
        const obsoleteResponse = new Promise<{ data: unknown[] }>((resolve) => {
            resolveObsolete = resolve
        })
        talosFetchMock.mockImplementation((input) => {
            if (String(input).includes('session_id=obsolete')) return obsoleteResponse as never

            return Promise.resolve({
                data: [grant({ id: 'grant-current', label: 'current.txt' })],
            }) as never
        })
        const authority = useTalosFileAuthority()

        const obsoleteLoad = authority.loadGrants('obsolete')
        await authority.loadGrants('current')
        resolveObsolete({
            data: [grant({
                id: 'grant-obsolete-folder',
                scope: 'folder',
                label: 'Obsolete folder',
            })],
        })
        await obsoleteLoad

        expect(authority.grants.value.map((item) => item.id)).toEqual(['grant-current'])
        expect(authority.folderPermissionByGrant.value).toEqual({})
        expect(authority.loadingGrants.value).toBe(false)
        expect(authority.authorityError.value).toBeNull()
    })

    it('does not publish an obsolete grant-request failure after the current chat loaded', async () => {
        let rejectObsolete!: (reason: Error) => void
        const obsoleteResponse = new Promise<never>((_resolve, reject) => {
            rejectObsolete = reject
        })
        talosFetchMock.mockImplementation((input) => {
            if (String(input).includes('session_id=obsolete')) return obsoleteResponse

            return Promise.resolve({
                data: [grant({ id: 'grant-current', label: 'current.txt' })],
            }) as never
        })
        const authority = useTalosFileAuthority()

        const obsoleteLoad = authority.loadGrants('obsolete')
        await authority.loadGrants('current')
        rejectObsolete(new Error('obsolete request failed'))

        await expect(obsoleteLoad).resolves.toEqual(authority.grants.value)
        expect(authority.grants.value.map((item) => item.id)).toEqual(['grant-current'])
        expect(authority.loadingGrants.value).toBe(false)
        expect(authority.authorityError.value).toBeNull()
    })

    it('deletes persisted directory handles for revoked and expired folder grants', async () => {
        talosFetchMock.mockResolvedValueOnce({
            data: [
                grant({ id: 'grant-revoked', scope: 'folder', status: 'revoked' }),
                grant({ id: 'grant-expired', scope: 'folder', status: 'expired' }),
            ],
        } as never)
        const authority = useTalosFileAuthority()

        await authority.loadGrants('current')

        expect(deleteDirectoryHandleMock).toHaveBeenCalledTimes(2)
        expect(deleteDirectoryHandleMock).toHaveBeenCalledWith('grant-revoked')
        expect(deleteDirectoryHandleMock).toHaveBeenCalledWith('grant-expired')
        expect(getDirectoryHandleMock).not.toHaveBeenCalled()
        expect(authority.folderPermissionByGrant.value).toEqual({})
    })

    it('reconciles browser-local directory handles only after the newest authenticated grant response', async () => {
        let resolveObsolete!: (value: { data: unknown[] }) => void
        const obsoleteResponse = new Promise<{ data: unknown[] }>((resolve) => {
            resolveObsolete = resolve
        })
        talosFetchMock.mockImplementation((input) => {
            if (String(input).includes('session_id=obsolete')) return obsoleteResponse as never

            return Promise.resolve({
                data: [grant({ id: 'grant-current-folder', scope: 'folder', label: 'Current folder' })],
            }) as never
        })
        listDirectoryHandleGrantIdsMock.mockResolvedValueOnce([
            'grant-current-folder',
            'grant-previous-account',
        ])
        const authority = useTalosFileAuthority()

        const obsoleteLoad = authority.loadGrants('obsolete')
        await authority.loadGrants('current')
        resolveObsolete({ data: [] })
        await obsoleteLoad

        expect(listDirectoryHandleGrantIdsMock).toHaveBeenCalledTimes(1)
        expect(deleteDirectoryHandleMock).toHaveBeenCalledTimes(1)
        expect(deleteDirectoryHandleMock).toHaveBeenCalledWith('grant-previous-account')
        expect(deleteDirectoryHandleMock).not.toHaveBeenCalledWith('grant-current-folder')
        expect(authority.grants.value.map((item) => item.id)).toEqual(['grant-current-folder'])
    })

    it('does not reconcile browser-local directory handles when grant loading fails', async () => {
        talosFetchMock.mockRejectedValueOnce(new Error('network unavailable'))
        listDirectoryHandleGrantIdsMock.mockResolvedValueOnce(['grant-previous-account'])
        const authority = useTalosFileAuthority()

        await expect(authority.loadGrants('current')).rejects.toThrow('network unavailable')

        expect(listDirectoryHandleGrantIdsMock).not.toHaveBeenCalled()
        expect(deleteDirectoryHandleMock).not.toHaveBeenCalled()
    })

    it('creates an exact grant and revokes it while deleting any local folder handle', async () => {
        const created = grant({ id: 'grant-folder', scope: 'folder', label: 'Evidence' })
        const revoked = { ...created, status: 'revoked', revoked_at: '2026-07-17T01:00:00Z' }
        talosFetchMock
            .mockResolvedValueOnce({ data: created } as never)
            .mockResolvedValueOnce({ data: revoked } as never)
        const authority = useTalosFileAuthority()

        await authority.createGrant({
            scope: 'folder',
            label: 'Evidence',
            permissions: ['model.read'],
            file_ids: ['file-1'],
        })
        await authority.revokeGrant('grant-folder')

        expect(talosFetchMock).toHaveBeenNthCalledWith(1, '/api/talos/file-authority/grants', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
                scope: 'folder',
                label: 'Evidence',
                permissions: ['model.read'],
                file_ids: ['file-1'],
            }),
        }))
        expect(talosFetchMock).toHaveBeenNthCalledWith(2, '/api/talos/file-authority/grants/grant-folder', expect.objectContaining({ method: 'DELETE' }))
        expect(deleteDirectoryHandleMock).toHaveBeenCalledWith('grant-folder')
        expect(authority.grants.value[0]?.status).toBe('revoked')
    })

    it('imports a picked folder through Vault ingestion, creates a bounded folder grant and persists only the local handle', async () => {
        const first = new File(['alpha'], 'alpha.txt', { type: 'text/plain' })
        const second = new File(['beta'], 'beta.txt', { type: 'text/plain' })
        const handle = directoryHandle([first, second])
        vi.stubGlobal('showDirectoryPicker', vi.fn(async () => handle))
        const created = grant({
            id: 'grant-folder',
            scope: 'folder',
            label: 'Evidence',
            files: [vaultFile('file-a', 'alpha.txt'), vaultFile('file-b', 'beta.txt')],
        })
        talosFetchMock
            .mockResolvedValueOnce({ data: vaultFile('file-a', 'alpha.txt') } as never)
            .mockResolvedValueOnce({ data: vaultFile('file-b', 'beta.txt') } as never)
            .mockResolvedValueOnce({ data: created } as never)
        const authority = useTalosFileAuthority()

        await authority.pickFolder(['model.read', 'browser.upload'])

        expect(talosFetchMock.mock.calls.slice(0, 2).every(([url, options]) => (
            url === '/api/files/ingest' && options?.method === 'POST' && options.body instanceof FormData
        ))).toBe(true)
        expect(talosFetchMock).toHaveBeenNthCalledWith(3, '/api/talos/file-authority/grants', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
                scope: 'folder',
                label: 'Evidence',
                permissions: ['model.read', 'browser.upload'],
                file_ids: ['file-a', 'file-b'],
            }),
        }))
        expect(putDirectoryHandleMock).toHaveBeenCalledWith('grant-folder', handle)
        expect(authority.lastFolderImport.value).toEqual({ imported: 2, rejected: 0, truncated: false })
    })

    it('supports the directory-input fallback without pretending a reusable handle exists', async () => {
        const created = grant({ id: 'grant-fallback', scope: 'folder', label: 'Imported folder' })
        talosFetchMock
            .mockResolvedValueOnce({ data: vaultFile('file-1', 'fallback.txt') } as never)
            .mockResolvedValueOnce({ data: created } as never)
        const authority = useTalosFileAuthority()

        await authority.importFolderFiles(
            [new File(['fallback'], 'fallback.txt', { type: 'text/plain' })],
            ['model.read'],
            'Imported folder',
        )

        expect(putDirectoryHandleMock).not.toHaveBeenCalled()
        expect(authority.folderPermissionByGrant.value['grant-fallback']).toBe('unavailable')
    })

    it('reauthorizes only a persisted directory handle and fails closed when permission remains denied', async () => {
        const handle = directoryHandle([])
        getDirectoryHandleMock.mockResolvedValue(handle)
        queryReadPermissionMock.mockResolvedValueOnce('prompt')
        requestReadPermissionMock.mockResolvedValueOnce('granted')
        const authority = useTalosFileAuthority()

        await expect(authority.reauthorizeFolder('grant-folder')).resolves.toBe('granted')
        expect(queryReadPermissionMock).toHaveBeenCalledWith(handle)
        expect(requestReadPermissionMock).toHaveBeenCalledWith(handle)
        expect(authority.folderPermissionByGrant.value['grant-folder']).toBe('granted')

        getDirectoryHandleMock.mockResolvedValueOnce(null)
        await expect(authority.reauthorizeFolder('missing-grant')).resolves.toBe('unavailable')
    })

    it('requires the explicit global warning contract and revokes every active global grant when disabled', async () => {
        const globalGrant = grant({ id: 'global-1', scope: 'global', files: [] })
        talosFetchMock
            .mockResolvedValueOnce({ data: globalGrant } as never)
            .mockResolvedValueOnce({ data: { ...globalGrant, status: 'revoked' } } as never)
        const authority = useTalosFileAuthority()

        await authority.setGlobalAccess(true, ['model.read', 'browser.upload'])
        await authority.setGlobalAccess(false)

        expect(talosFetchMock).toHaveBeenNthCalledWith(1, '/api/talos/file-authority/grants', expect.objectContaining({
            body: JSON.stringify({
                scope: 'global',
                permissions: ['model.read', 'browser.upload'],
                warning_acknowledged: true,
            }),
        }))
        expect(talosFetchMock).toHaveBeenNthCalledWith(2, '/api/talos/file-authority/grants/global-1', expect.objectContaining({ method: 'DELETE' }))
    })
})

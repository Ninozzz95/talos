import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

const DATABASE_NAME = 'talos-file-authority'
const DATABASE_VERSION = 1
const DIRECTORY_HANDLE_STORE = 'directory-handles'

type StoredDirectoryHandle = {
    grant_id: string
    handle: FileSystemDirectoryHandle
    updated_at: string
}

interface TalosFileAuthorityDatabase extends DBSchema {
    'directory-handles': {
        key: string
        value: StoredDirectoryHandle
    }
}

type PermissionAwareDirectoryHandle = FileSystemDirectoryHandle & {
    queryPermission?: (descriptor: { mode: 'read' }) => Promise<PermissionState>
    requestPermission?: (descriptor: { mode: 'read' }) => Promise<PermissionState>
}

let databasePromise: Promise<IDBPDatabase<TalosFileAuthorityDatabase>> | null = null

function database() {
    databasePromise ??= openDB<TalosFileAuthorityDatabase>(DATABASE_NAME, DATABASE_VERSION, {
        upgrade(current) {
            if (!current.objectStoreNames.contains(DIRECTORY_HANDLE_STORE)) {
                current.createObjectStore(DIRECTORY_HANDLE_STORE, { keyPath: 'grant_id' })
            }
        },
    })

    return databasePromise
}

function grantIdentity(value: string) {
    const identity = value.trim()
    if (!identity || identity.length > 255) {
        throw new Error('Directory handle grant identity is invalid.')
    }

    return identity
}

function isDirectoryHandle(value: unknown): value is FileSystemDirectoryHandle {
    return Boolean(value)
        && typeof value === 'object'
        && (value as { kind?: unknown }).kind === 'directory'
}

export async function putDirectoryHandle(grantId: string, handle: FileSystemDirectoryHandle) {
    const identity = grantIdentity(grantId)
    if (!isDirectoryHandle(handle)) {
        throw new Error('Only a directory handle can be persisted for folder authority.')
    }

    await (await database()).put(DIRECTORY_HANDLE_STORE, {
        grant_id: identity,
        handle,
        updated_at: new Date().toISOString(),
    })
}

export async function getDirectoryHandle(grantId: string): Promise<FileSystemDirectoryHandle | null> {
    const identity = grantIdentity(grantId)
    const stored = await (await database()).get(DIRECTORY_HANDLE_STORE, identity)
    if (!stored) return null
    if (!isDirectoryHandle(stored.handle)) {
        await (await database()).delete(DIRECTORY_HANDLE_STORE, identity)
        return null
    }

    return stored.handle
}

export async function deleteDirectoryHandle(grantId: string) {
    await (await database()).delete(DIRECTORY_HANDLE_STORE, grantIdentity(grantId))
}

export async function listDirectoryHandleGrantIds(): Promise<string[]> {
    const keys = await (await database()).getAllKeys(DIRECTORY_HANDLE_STORE)

    return [...keys].sort((left, right) => left.localeCompare(right))
}

export async function queryReadPermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
    if (!isDirectoryHandle(handle)) return 'denied'
    const permissionHandle = handle as PermissionAwareDirectoryHandle
    if (typeof permissionHandle.queryPermission !== 'function') return 'denied'

    try {
        return await permissionHandle.queryPermission({ mode: 'read' })
    } catch {
        return 'denied'
    }
}

export async function requestReadPermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
    if (!isDirectoryHandle(handle)) return 'denied'
    const permissionHandle = handle as PermissionAwareDirectoryHandle
    if (typeof permissionHandle.requestPermission !== 'function') return 'denied'

    try {
        return await permissionHandle.requestPermission({ mode: 'read' })
    } catch {
        return 'denied'
    }
}

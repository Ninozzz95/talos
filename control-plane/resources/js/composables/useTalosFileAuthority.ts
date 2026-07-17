import { computed, ref } from 'vue'
import { talosFetch } from '../lib/api'
import {
    deleteDirectoryHandle,
    getDirectoryHandle,
    listDirectoryHandleGrantIds,
    putDirectoryHandle,
    queryReadPermission,
    requestReadPermission,
} from '../lib/talosFileSystemHandleStore'
import type {
    TalosFile,
    TalosFileAuthorityGrant,
    TalosFileAuthorityGrantFile,
    TalosFileAuthorityPermission,
    TalosFileAuthorityScope,
} from '../lib/talosTypes'

type ApiEnvelope<T> = { data: T }
type FolderPermission = PermissionState | 'unavailable'

export type TalosFileAuthorityGrantInput = {
    scope: TalosFileAuthorityScope
    permissions: TalosFileAuthorityPermission[]
    label?: string
    file_ids?: string[]
    session_id?: string | null
    warning_acknowledged?: boolean
    expires_at?: string | null
}

type DirectoryEntry = {
    kind: 'file' | 'directory'
    name: string
    getFile?: () => Promise<File>
    values?: () => AsyncIterable<DirectoryEntry>
}

const MAX_FOLDER_FILES = 64
const scopes = new Set<TalosFileAuthorityScope>(['file', 'folder', 'session', 'global'])
const permissions = new Set<TalosFileAuthorityPermission>(['model.read', 'browser.upload'])
const statuses = new Set(['active', 'revoked', 'expired'])

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

function requiredString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function nullableString(value: unknown) {
    return value === null || value === undefined ? null : requiredString(value)
}

function normalizeGrantFile(value: unknown): TalosFileAuthorityGrantFile | null {
    const data = record(value)
    const id = requiredString(data?.id)
    const originalName = requiredString(data?.original_name)
    const checksum = requiredString(data?.checksum)
    const status = requiredString(data?.status)
    const sizeBytes = data?.size_bytes
    const mimeType = nullableString(data?.mime_type)
    if (!id || !originalName || !checksum || !status || !Number.isInteger(sizeBytes) || (sizeBytes as number) < 0) return null

    return {
        id,
        original_name: originalName,
        mime_type: mimeType,
        size_bytes: sizeBytes as number,
        checksum,
        status,
    }
}

function normalizeGrant(value: unknown): TalosFileAuthorityGrant | null {
    const data = record(value)
    const id = requiredString(data?.id)
    const scope = requiredString(data?.scope)
    const label = requiredString(data?.label)
    const status = requiredString(data?.status)
    const grantPermissions = Array.isArray(data?.permissions)
        ? data.permissions.filter((item): item is TalosFileAuthorityPermission => typeof item === 'string' && permissions.has(item as TalosFileAuthorityPermission))
        : []
    const files = Array.isArray(data?.files) ? data.files.map(normalizeGrantFile).filter((file): file is TalosFileAuthorityGrantFile => file !== null) : []
    if (!id || !scope || !scopes.has(scope as TalosFileAuthorityScope) || !label
        || !status || !statuses.has(status) || grantPermissions.length === 0) return null

    return {
        id,
        scope: scope as TalosFileAuthorityScope,
        label,
        permissions: [...new Set(grantPermissions)],
        status: status as TalosFileAuthorityGrant['status'],
        talos_session_id: nullableString(data?.talos_session_id),
        files,
        expires_at: nullableString(data?.expires_at),
        revoked_at: nullableString(data?.revoked_at),
        last_used_at: nullableString(data?.last_used_at),
        created_at: nullableString(data?.created_at),
        updated_at: nullableString(data?.updated_at),
    }
}

function normalizeVaultFile(value: unknown): TalosFile | null {
    const data = record(value)
    const id = requiredString(data?.id)
    const originalName = requiredString(data?.original_name)
    const status = requiredString(data?.status)
    const checksum = requiredString(data?.checksum)
    const mimeType = nullableString(data?.mime_type) ?? 'application/octet-stream'
    const sizeBytes = data?.size_bytes
    const createdAt = nullableString(data?.created_at) ?? new Date(0).toISOString()
    const updatedAt = nullableString(data?.updated_at) ?? createdAt
    if (!id || !originalName || !status || !checksum || !Number.isInteger(sizeBytes) || (sizeBytes as number) < 0) return null

    return {
        id,
        original_name: originalName,
        mime_type: mimeType,
        size_bytes: sizeBytes as number,
        checksum,
        status: status as TalosFile['status'],
        created_at: createdAt,
        updated_at: updatedAt,
    }
}

function normalizedPermissions(value: TalosFileAuthorityPermission[]) {
    const result = [...new Set(value)].filter((permission) => permissions.has(permission))
    if (result.length === 0) throw new Error('Select at least one file authority permission.')
    return result
}

async function collectDirectoryFiles(handle: FileSystemDirectoryHandle) {
    const files: File[] = []
    let truncated = false

    async function visit(directory: DirectoryEntry): Promise<void> {
        if (typeof directory.values !== 'function') {
            throw new Error('This browser cannot enumerate the selected directory securely.')
        }
        for await (const entry of directory.values()) {
            if (files.length >= MAX_FOLDER_FILES) {
                truncated = true
                return
            }
            if (entry.kind === 'directory') {
                await visit(entry)
                if (truncated) return
                continue
            }
            if (entry.kind === 'file' && typeof entry.getFile === 'function') {
                files.push(await entry.getFile())
            }
        }
    }

    await visit(handle as unknown as DirectoryEntry)
    return { files, truncated }
}

export function useTalosFileAuthority() {
    const grants = ref<TalosFileAuthorityGrant[]>([])
    const vaultFiles = ref<TalosFile[]>([])
    const loadingGrants = ref(false)
    const loadingVaultFiles = ref(false)
    const pendingOperations = ref(0)
    const authorityError = ref<string | null>(null)
    const folderPermissionByGrant = ref<Record<string, FolderPermission>>({})
    const lastFolderImport = ref<{ imported: number; rejected: number; truncated: boolean } | null>(null)
    let grantsRequestVersion = 0

    const mutating = computed(() => pendingOperations.value > 0)
    const availableVaultFiles = computed(() => vaultFiles.value.filter((file) => file.status === 'available'))
    const activeGlobalGrant = computed(() => grants.value.find((grant) => grant.scope === 'global' && grant.status === 'active') ?? null)
    const folderPickerSupported = computed(() => typeof (globalThis as typeof globalThis & { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function')

    function report(error: unknown, fallback: string) {
        const message = error instanceof Error ? error.message : fallback
        authorityError.value = message
        return error instanceof Error ? error : new Error(message)
    }

    function mergeGrant(grant: TalosFileAuthorityGrant) {
        const index = grants.value.findIndex((candidate) => candidate.id === grant.id)
        grants.value = index === -1
            ? [grant, ...grants.value]
            : grants.value.map((candidate) => candidate.id === grant.id ? grant : candidate)
    }

    async function folderPermissionsFor(nextGrants: TalosFileAuthorityGrant[]) {
        const result: Record<string, FolderPermission> = {}
        for (const grant of nextGrants) {
            if (grant.scope !== 'folder') continue
            if (grant.status !== 'active') {
                await deleteDirectoryHandle(grant.id)
                continue
            }
            const handle = await getDirectoryHandle(grant.id)
            result[grant.id] = handle ? await queryReadPermission(handle) : 'unavailable'
        }

        return result
    }

    async function reconcileDirectoryHandles(nextGrants: TalosFileAuthorityGrant[], requestVersion: number) {
        const serverFolderGrantIds = new Set(
            nextGrants.filter((grant) => grant.scope === 'folder').map((grant) => grant.id),
        )
        const persistedGrantIds = await listDirectoryHandleGrantIds()
        if (requestVersion !== grantsRequestVersion) return

        for (const grantId of persistedGrantIds) {
            if (requestVersion !== grantsRequestVersion) return
            if (!serverFolderGrantIds.has(grantId)) await deleteDirectoryHandle(grantId)
        }
    }

    async function loadGrants(sessionId?: string | null) {
        const requestVersion = ++grantsRequestVersion
        loadingGrants.value = true
        authorityError.value = null
        try {
            const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''
            const response = await talosFetch<ApiEnvelope<unknown>>(`/api/talos/file-authority/grants${query}`)
            const normalized = Array.isArray(response.data)
                ? response.data.map(normalizeGrant).filter((grant): grant is TalosFileAuthorityGrant => grant !== null)
                : []
            if (requestVersion !== grantsRequestVersion) return grants.value
            await reconcileDirectoryHandles(normalized, requestVersion)
            if (requestVersion !== grantsRequestVersion) return grants.value
            const folderPermissions = await folderPermissionsFor(normalized)
            if (requestVersion !== grantsRequestVersion) return grants.value
            grants.value = normalized
            folderPermissionByGrant.value = folderPermissions
            return normalized
        } catch (error) {
            if (requestVersion !== grantsRequestVersion) return grants.value
            throw report(error, 'TALOS could not load file authority grants.')
        } finally {
            if (requestVersion === grantsRequestVersion) loadingGrants.value = false
        }
    }

    async function loadVaultFiles() {
        loadingVaultFiles.value = true
        authorityError.value = null
        try {
            const response = await talosFetch<ApiEnvelope<unknown>>('/api/talos/files')
            vaultFiles.value = Array.isArray(response.data)
                ? response.data.map(normalizeVaultFile).filter((file): file is TalosFile => file !== null)
                : []
            return vaultFiles.value
        } catch (error) {
            throw report(error, 'TALOS could not load Vault files for authority.')
        } finally {
            loadingVaultFiles.value = false
        }
    }

    async function createGrant(input: TalosFileAuthorityGrantInput) {
        pendingOperations.value += 1
        authorityError.value = null
        try {
            const payload = {
                ...input,
                permissions: normalizedPermissions(input.permissions),
            }
            const response = await talosFetch<ApiEnvelope<unknown>>('/api/talos/file-authority/grants', {
                method: 'POST',
                body: JSON.stringify(payload),
                validationMessage: 'TALOS rejected this file authority grant.',
            })
            const grant = normalizeGrant(response.data)
            if (!grant) throw new Error('TALOS returned a malformed file authority grant.')
            mergeGrant(grant)
            if (grant.scope === 'folder' && folderPermissionByGrant.value[grant.id] === undefined) {
                folderPermissionByGrant.value = { ...folderPermissionByGrant.value, [grant.id]: 'unavailable' }
            }
            return grant
        } catch (error) {
            throw report(error, 'TALOS could not create the file authority grant.')
        } finally {
            pendingOperations.value -= 1
        }
    }

    async function revokeGrant(grantId: string) {
        const id = grantId.trim()
        if (!id) throw new Error('File authority grant identity is required.')
        pendingOperations.value += 1
        authorityError.value = null
        try {
            const response = await talosFetch<ApiEnvelope<unknown>>(`/api/talos/file-authority/grants/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                validationMessage: 'TALOS could not revoke this file authority grant.',
            })
            const grant = normalizeGrant(response.data)
            if (!grant) throw new Error('TALOS returned a malformed revoked grant.')
            mergeGrant(grant)
            if (grant.scope === 'folder') await deleteDirectoryHandle(id)
            const permissionsByGrant = { ...folderPermissionByGrant.value }
            delete permissionsByGrant[id]
            folderPermissionByGrant.value = permissionsByGrant
            return grant
        } catch (error) {
            throw report(error, 'TALOS could not revoke the file authority grant.')
        } finally {
            pendingOperations.value -= 1
        }
    }

    async function ingestFolderFiles(files: File[], requestedPermissions: TalosFileAuthorityPermission[], label: string, handle?: FileSystemDirectoryHandle) {
        const selected = files.slice(0, MAX_FOLDER_FILES)
        const importedIds: string[] = []
        let rejected = 0
        for (const file of selected) {
            const body = new FormData()
            body.append('file', file)
            try {
                const response = await talosFetch<ApiEnvelope<unknown>>('/api/files/ingest', {
                    method: 'POST',
                    body,
                    validationMessage: `TALOS rejected ${file.name}.`,
                    networkMessage: 'TALOS could not reach the file ingestion endpoint.',
                })
                const imported = normalizeVaultFile(response.data)
                if (!imported || imported.status !== 'available') {
                    rejected += 1
                    continue
                }
                importedIds.push(imported.id)
                mergeVaultFile(imported)
            } catch {
                rejected += 1
            }
        }
        if (importedIds.length === 0) {
            throw new Error('No eligible file from the selected folder could be imported into the Vault.')
        }

        const grant = await createGrant({
            scope: 'folder',
            label: label.trim() || 'Imported folder',
            permissions: requestedPermissions,
            file_ids: importedIds,
        })
        if (handle) {
            try {
                await putDirectoryHandle(grant.id, handle)
                folderPermissionByGrant.value = { ...folderPermissionByGrant.value, [grant.id]: 'granted' }
            } catch (error) {
                folderPermissionByGrant.value = { ...folderPermissionByGrant.value, [grant.id]: 'unavailable' }
                authorityError.value = error instanceof Error ? error.message : 'The folder grant is active, but its local handle could not be persisted.'
            }
        }
        return { grant, imported: importedIds.length, rejected }
    }

    function mergeVaultFile(file: TalosFile) {
        vaultFiles.value = vaultFiles.value.some((candidate) => candidate.id === file.id)
            ? vaultFiles.value.map((candidate) => candidate.id === file.id ? file : candidate)
            : [file, ...vaultFiles.value]
    }

    async function pickFolder(requestedPermissions: TalosFileAuthorityPermission[] = ['model.read', 'browser.upload']) {
        const picker = (globalThis as typeof globalThis & {
            showDirectoryPicker?: (options?: { mode?: 'read' }) => Promise<FileSystemDirectoryHandle>
        }).showDirectoryPicker
        if (typeof picker !== 'function') {
            throw new Error('Directory picker is unavailable. Use the folder upload fallback.')
        }
        pendingOperations.value += 1
        authorityError.value = null
        try {
            const handle = await picker({ mode: 'read' })
            const collected = await collectDirectoryFiles(handle)
            const result = await ingestFolderFiles(collected.files, normalizedPermissions(requestedPermissions), handle.name, handle)
            lastFolderImport.value = { imported: result.imported, rejected: result.rejected, truncated: collected.truncated }
            return result.grant
        } catch (error) {
            throw report(error, 'TALOS could not import the selected folder.')
        } finally {
            pendingOperations.value -= 1
        }
    }

    async function importFolderFiles(
        files: File[],
        requestedPermissions: TalosFileAuthorityPermission[] = ['model.read', 'browser.upload'],
        label = 'Imported folder',
    ) {
        pendingOperations.value += 1
        authorityError.value = null
        try {
            const truncated = files.length > MAX_FOLDER_FILES
            const result = await ingestFolderFiles(files, normalizedPermissions(requestedPermissions), label)
            folderPermissionByGrant.value = { ...folderPermissionByGrant.value, [result.grant.id]: 'unavailable' }
            lastFolderImport.value = { imported: result.imported, rejected: result.rejected, truncated }
            return result.grant
        } catch (error) {
            throw report(error, 'TALOS could not import the selected folder.')
        } finally {
            pendingOperations.value -= 1
        }
    }

    async function reauthorizeFolder(grantId: string): Promise<FolderPermission> {
        const handle = await getDirectoryHandle(grantId)
        if (!handle) {
            folderPermissionByGrant.value = { ...folderPermissionByGrant.value, [grantId]: 'unavailable' }
            return 'unavailable'
        }
        let state = await queryReadPermission(handle)
        if (state === 'prompt') state = await requestReadPermission(handle)
        folderPermissionByGrant.value = { ...folderPermissionByGrant.value, [grantId]: state }
        return state
    }

    async function setGlobalAccess(enabled: boolean, requestedPermissions: TalosFileAuthorityPermission[] = ['model.read', 'browser.upload']) {
        if (enabled) {
            return createGrant({
                scope: 'global',
                permissions: requestedPermissions,
                warning_acknowledged: true,
            })
        }
        const active = grants.value.filter((grant) => grant.scope === 'global' && grant.status === 'active')
        for (const grant of active) await revokeGrant(grant.id)
        return null
    }

    return {
        grants,
        vaultFiles,
        availableVaultFiles,
        activeGlobalGrant,
        loadingGrants,
        loadingVaultFiles,
        mutating,
        authorityError,
        folderPermissionByGrant,
        folderPickerSupported,
        lastFolderImport,
        loadGrants,
        loadVaultFiles,
        createGrant,
        revokeGrant,
        pickFolder,
        importFolderFiles,
        reauthorizeFolder,
        setGlobalAccess,
    }
}

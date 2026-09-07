import {
    getCurrentScope,
    onScopeDispose,
    ref,
    watch,
    type Ref,
} from 'vue'
import { talosFetch } from '../lib/api'
import {
    parseTalosLibraryPage,
    parseTalosLibraryRemoval,
    parseTalosSessionMedia,
    type TalosLibraryItem,
    type TalosLibraryKind,
    type TalosLibraryOrigin,
    type TalosLibraryPage,
    type TalosSessionMedia,
} from '../lib/talosLibrary'

const VIEW_STORAGE_KEY = 'talos.library.view.v1'
const PAGE_LIMIT = 40

export type TalosLibraryLoadState = 'idle' | 'loading' | 'loaded' | 'error'
export type TalosLibraryViewMode = 'list' | 'grid'

export interface TalosLibraryRequest {
    kind: TalosLibraryKind | null
    origin: TalosLibraryOrigin | null
    search: string | null
    limit: number
    cursor: string | null
}

export interface TalosLibraryDependencies {
    authenticated: Readonly<Ref<boolean>>
    ownerKey: Readonly<Ref<string | null>>
    autoLoadLibrary?: boolean
    fetchPage?: (ownerKey: string, request: TalosLibraryRequest) => Promise<unknown>
    removeItems?: (ownerKey: string, ids: readonly string[]) => Promise<unknown>
    fetchSessionMedia?: (
        ownerKey: string,
        sessionId: string,
        kind: TalosLibraryKind | null,
    ) => Promise<unknown>
}

function initialViewMode(): TalosLibraryViewMode {
    try {
        return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'grid' ? 'grid' : 'list'
    } catch {
        return 'list'
    }
}

async function fetchLibraryPage(_ownerKey: string, request: TalosLibraryRequest): Promise<unknown> {
    const query = new URLSearchParams({ limit: String(request.limit) })
    if (request.kind) query.set('kind', request.kind)
    if (request.origin) query.set('origin', request.origin)
    if (request.search) query.set('search', request.search)
    if (request.cursor) query.set('cursor', request.cursor)

    return talosFetch<unknown>(`/api/talos/library?${query.toString()}`)
}

async function removeLibraryItems(_ownerKey: string, ids: readonly string[]): Promise<unknown> {
    return talosFetch<unknown>('/api/talos/library', {
        method: 'DELETE',
        body: JSON.stringify({ ids }),
        validationMessage: 'TALOS rejected this Library removal request.',
    })
}

async function fetchMedia(
    _ownerKey: string,
    sessionId: string,
    kind: TalosLibraryKind | null,
): Promise<unknown> {
    const query = new URLSearchParams()
    if (kind) query.set('kind', kind)
    const suffix = query.size > 0 ? `?${query.toString()}` : ''

    return talosFetch<unknown>(`/api/talos/sessions/${encodeURIComponent(sessionId)}/media${suffix}`)
}

function errorMessage(cause: unknown, fallback: string): string {
    return cause instanceof Error && cause.message.trim() !== '' ? cause.message : fallback
}

export function useTalosLibrary(dependencies: TalosLibraryDependencies) {
    const items = ref<TalosLibraryItem[]>([])
    const loadState = ref<TalosLibraryLoadState>('idle')
    const loadingMore = ref(false)
    const error = ref<string | null>(null)
    const kind = ref<TalosLibraryKind | null>(null)
    const origin = ref<TalosLibraryOrigin | null>(null)
    const search = ref<string | null>(null)
    const nextCursor = ref<string | null>(null)
    const selectedIds = ref<string[]>([])
    const viewMode = ref<TalosLibraryViewMode>(initialViewMode())
    const removing = ref(false)

    const sessionMedia = ref<TalosLibraryItem[]>([])
    const sessionMediaSessionId = ref<string | null>(null)
    const sessionMediaLoadState = ref<TalosLibraryLoadState>('idle')
    const sessionMediaError = ref<string | null>(null)

    const requestPage = dependencies.fetchPage ?? fetchLibraryPage
    const requestRemoval = dependencies.removeItems ?? removeLibraryItems
    const requestSessionMedia = dependencies.fetchSessionMedia ?? fetchMedia
    let requestRevision = 0
    let removalRevision = 0
    let mediaRevision = 0
    let disposed = false

    function currentOwner(): string | null {
        if (!dependencies.authenticated.value) return null
        const owner = dependencies.ownerKey.value?.trim()
        return owner || null
    }

    function request(): TalosLibraryRequest {
        return {
            kind: kind.value,
            origin: origin.value,
            search: search.value,
            limit: PAGE_LIMIT,
            cursor: null,
        }
    }

    function resetList() {
        items.value = []
        loadState.value = 'idle'
        loadingMore.value = false
        error.value = null
        nextCursor.value = null
        selectedIds.value = []
        removing.value = false
    }

    function resetMedia() {
        sessionMedia.value = []
        sessionMediaSessionId.value = null
        sessionMediaLoadState.value = 'idle'
        sessionMediaError.value = null
    }

    async function load(): Promise<TalosLibraryPage | null> {
        const owner = currentOwner()
        if (!owner || disposed) {
            resetList()
            return null
        }

        const revision = ++requestRevision
        const currentRequest = request()
        items.value = []
        selectedIds.value = []
        nextCursor.value = null
        loadingMore.value = false
        loadState.value = 'loading'
        error.value = null

        try {
            const page = parseTalosLibraryPage(await requestPage(owner, currentRequest))
            if (disposed || revision !== requestRevision || currentOwner() !== owner) return null

            items.value = [...page.data]
            nextCursor.value = page.meta.nextCursor
            loadState.value = 'loaded'
            return page
        } catch (cause) {
            if (disposed || revision !== requestRevision || currentOwner() !== owner) return null

            items.value = []
            nextCursor.value = null
            loadState.value = 'error'
            error.value = errorMessage(cause, 'TALOS could not load the Library.')
            return null
        }
    }

    async function loadMore(): Promise<TalosLibraryPage | null> {
        const owner = currentOwner()
        const cursor = nextCursor.value
        if (!owner || !cursor || loadingMore.value || disposed) return null

        const revision = ++requestRevision
        const currentRequest = { ...request(), cursor }
        loadingMore.value = true
        error.value = null

        try {
            const page = parseTalosLibraryPage(await requestPage(owner, currentRequest))
            if (disposed || revision !== requestRevision || currentOwner() !== owner) return null

            const existing = new Set(items.value.map((item) => item.id))
            items.value = [
                ...items.value,
                ...page.data.filter((item) => !existing.has(item.id)),
            ]
            nextCursor.value = page.meta.nextCursor
            loadState.value = 'loaded'
            return page
        } catch (cause) {
            if (disposed || revision !== requestRevision || currentOwner() !== owner) return null

            error.value = errorMessage(cause, 'TALOS could not load more Library items.')
            return null
        } finally {
            if (revision === requestRevision) loadingMore.value = false
        }
    }

    async function setFilters(next: {
        kind?: TalosLibraryKind | null
        origin?: TalosLibraryOrigin | null
        search?: string | null
    }): Promise<TalosLibraryPage | null> {
        if ('kind' in next) kind.value = next.kind ?? null
        if ('origin' in next) origin.value = next.origin ?? null
        if ('search' in next) {
            const normalized = next.search?.trim().replace(/\s+/g, ' ') ?? ''
            search.value = normalized || null
        }

        return load()
    }

    function setViewMode(next: TalosLibraryViewMode) {
        viewMode.value = next
        try {
            window.localStorage.setItem(VIEW_STORAGE_KEY, next)
        } catch {
            // Per-device preference remains in memory when storage is unavailable.
        }
    }

    function toggleSelected(id: string) {
        if (!items.value.some((item) => item.id === id)) return
        selectedIds.value = selectedIds.value.includes(id)
            ? selectedIds.value.filter((selected) => selected !== id)
            : [...selectedIds.value, id]
    }

    function clearSelection() {
        selectedIds.value = []
    }

    async function remove(ids: readonly string[]): Promise<number> {
        const owner = currentOwner()
        const uniqueIds = [...new Set(ids)]
        if (!owner || uniqueIds.length === 0 || removing.value || disposed) return 0

        const revision = ++removalRevision
        removing.value = true
        error.value = null
        try {
            const removal = parseTalosLibraryRemoval(await requestRemoval(owner, uniqueIds))
            if (disposed || revision !== removalRevision || currentOwner() !== owner) return 0

            const removed = new Set(uniqueIds)
            items.value = items.value.filter((item) => !removed.has(item.id))
            selectedIds.value = selectedIds.value.filter((id) => !removed.has(id))
            return removal.removedCount
        } catch (cause) {
            if (disposed || revision !== removalRevision || currentOwner() !== owner) return 0

            error.value = errorMessage(cause, 'TALOS could not remove the selected Library items.')
            return 0
        } finally {
            if (revision === removalRevision) removing.value = false
        }
    }

    async function removeSelected(): Promise<number> {
        return remove(selectedIds.value)
    }

    async function loadSessionMedia(
        sessionId: string | null,
        mediaKind: TalosLibraryKind | null = null,
    ): Promise<TalosSessionMedia | null> {
        const owner = currentOwner()
        const normalizedSessionId = sessionId?.trim() || null
        const revision = ++mediaRevision
        sessionMedia.value = []
        sessionMediaSessionId.value = normalizedSessionId
        sessionMediaError.value = null
        if (!owner || !normalizedSessionId || disposed) {
            sessionMediaLoadState.value = 'idle'
            return null
        }
        sessionMediaLoadState.value = 'loading'

        try {
            const media = parseTalosSessionMedia(
                await requestSessionMedia(owner, normalizedSessionId, mediaKind),
            )
            if (disposed
                || revision !== mediaRevision
                || currentOwner() !== owner
                || sessionMediaSessionId.value !== normalizedSessionId) return null

            sessionMedia.value = [...media.data]
            sessionMediaLoadState.value = 'loaded'
            return media
        } catch (cause) {
            if (disposed
                || revision !== mediaRevision
                || currentOwner() !== owner
                || sessionMediaSessionId.value !== normalizedSessionId) return null

            sessionMediaLoadState.value = 'error'
            sessionMediaError.value = errorMessage(cause, 'TALOS could not load chat media.')
            return null
        }
    }

    const stop = watch(
        [dependencies.authenticated, dependencies.ownerKey],
        () => {
            requestRevision += 1
            removalRevision += 1
            mediaRevision += 1
            resetList()
            resetMedia()
            if (currentOwner() && dependencies.autoLoadLibrary !== false) {
                void load()
            }
        },
        { immediate: true },
    )

    function dispose() {
        if (disposed) return
        disposed = true
        requestRevision += 1
        removalRevision += 1
        mediaRevision += 1
        stop()
        resetList()
        resetMedia()
    }

    if (getCurrentScope()) onScopeDispose(dispose)

    return {
        items,
        loadState,
        loadingMore,
        error,
        kind,
        origin,
        search,
        nextCursor,
        selectedIds,
        viewMode,
        removing,
        sessionMedia,
        sessionMediaSessionId,
        sessionMediaLoadState,
        sessionMediaError,
        load,
        loadMore,
        setFilters,
        setViewMode,
        toggleSelected,
        clearSelection,
        remove,
        removeSelected,
        loadSessionMedia,
        dispose,
    }
}

// @vitest-environment jsdom

import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTalosLibrary } from './useTalosLibrary'

function rawItem(id: string, overrides: Record<string, unknown> = {}) {
    return {
        id,
        source_type: 'file',
        source_id: `source-${id}`,
        kind: 'file',
        origin: 'uploaded',
        title: `Item ${id}`,
        mime_type: 'text/plain',
        byte_size: 12,
        checksum: 'a'.repeat(64),
        source_url: null,
        content_url: `/api/talos/files/source-${id}/content`,
        trust_boundary: 'untrusted_upload',
        occurred_at: '2026-07-28T14:00:00.000000Z',
        metadata: {},
        chat_count: 0,
        backlinks: [],
        can_attach: true,
        ...overrides,
    }
}

function page(items: unknown[], nextCursor: string | null = null) {
    return {
        data: items,
        meta: {
            count: items.length,
            has_more: nextCursor !== null,
            next_cursor: nextCursor,
        },
    }
}

function media(items: unknown[]) {
    return {
        data: items,
        meta: { count: items.length, has_more: false },
    }
}

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
    })

    return { promise, resolve, reject }
}

beforeEach(() => {
    localStorage.clear()
})

describe('useTalosLibrary', () => {
    it('loads only for an authenticated owner and persists the per-device view mode', async () => {
        localStorage.setItem('talos.library.view.v1', 'grid')
        const authenticated = ref(false)
        const ownerKey = ref<string | null>(null)
        const fetchPage = vi.fn(async () => page([rawItem('item-a')]))
        const library = useTalosLibrary({ authenticated, ownerKey, fetchPage })

        expect(library.viewMode.value).toBe('grid')
        expect(fetchPage).not.toHaveBeenCalled()

        authenticated.value = true
        ownerKey.value = 'owner-a'
        await nextTick()
        await nextTick()

        expect(fetchPage).toHaveBeenCalledWith('owner-a', {
            kind: null,
            origin: null,
            search: null,
            limit: 40,
            cursor: null,
        })
        expect(library.items.value.map((item) => item.id)).toEqual(['item-a'])
        expect(library.loadState.value).toBe('loaded')

        library.setViewMode('list')
        expect(localStorage.getItem('talos.library.view.v1')).toBe('list')
    })

    it('drops a late page after owner change and keeps the new owner authoritative', async () => {
        const authenticated = ref(true)
        const ownerKey = ref<string | null>('owner-a')
        const first = deferred<unknown>()
        const second = deferred<unknown>()
        const fetchPage = vi.fn((owner: string) => owner === 'owner-a' ? first.promise : second.promise)
        const library = useTalosLibrary({ authenticated, ownerKey, fetchPage })
        await nextTick()

        ownerKey.value = 'owner-b'
        await nextTick()
        first.resolve(page([rawItem('stale')]))
        await nextTick()
        await nextTick()
        expect(library.items.value).toEqual([])

        second.resolve(page([rawItem('current')]))
        await nextTick()
        await nextTick()
        expect(library.items.value.map((item) => item.id)).toEqual(['current'])
    })

    it('appends cursor pages without duplicates and resets pagination when filters change', async () => {
        const authenticated = ref(true)
        const ownerKey = ref<string | null>('owner-a')
        const fetchPage = vi.fn()
            .mockResolvedValueOnce(page([rawItem('one'), rawItem('two')], 'cursor-2'))
            .mockResolvedValueOnce(page([rawItem('two'), rawItem('three')]))
            .mockResolvedValueOnce(page([rawItem('image', { kind: 'image', mime_type: 'image/png' })]))
        const library = useTalosLibrary({ authenticated, ownerKey, fetchPage })
        await nextTick()
        await nextTick()

        await library.loadMore()
        expect(library.items.value.map((item) => item.id)).toEqual(['one', 'two', 'three'])

        await library.setFilters({ kind: 'image' })
        expect(fetchPage).toHaveBeenLastCalledWith('owner-a', {
            kind: 'image',
            origin: null,
            search: null,
            limit: 40,
            cursor: null,
        })
        expect(library.items.value.map((item) => item.id)).toEqual(['image'])
        expect(library.nextCursor.value).toBeNull()
    })

    it('releases superseded pagination state when a full reload wins', async () => {
        const authenticated = ref(true)
        const ownerKey = ref<string | null>('owner-a')
        const pagination = deferred<unknown>()
        const fetchPage = vi.fn()
            .mockResolvedValueOnce(page([rawItem('one')], 'cursor-2'))
            .mockImplementationOnce(() => pagination.promise)
            .mockResolvedValueOnce(page([rawItem('refreshed')]))
        const library = useTalosLibrary({ authenticated, ownerKey, fetchPage })
        await nextTick()
        await nextTick()

        const stalePagination = library.loadMore()
        expect(library.loadingMore.value).toBe(true)

        await library.load()
        expect(library.loadingMore.value).toBe(false)
        expect(library.items.value.map((item) => item.id)).toEqual(['refreshed'])

        pagination.resolve(page([rawItem('stale')]))
        await stalePagination
        expect(library.items.value.map((item) => item.id)).toEqual(['refreshed'])
        expect(library.loadingMore.value).toBe(false)
    })

    it('removes selected items exactly once and reconciles selection and visible state', async () => {
        const authenticated = ref(true)
        const ownerKey = ref<string | null>('owner-a')
        const removeItems = vi.fn(async () => ({ data: { removed_count: 2 } }))
        const library = useTalosLibrary({
            authenticated,
            ownerKey,
            fetchPage: async () => page([rawItem('one'), rawItem('two')]),
            removeItems,
        })
        await nextTick()
        await nextTick()

        library.toggleSelected('one')
        library.toggleSelected('two')
        expect(await library.removeSelected()).toBe(2)

        expect(removeItems).toHaveBeenCalledTimes(1)
        expect(removeItems).toHaveBeenCalledWith('owner-a', ['one', 'two'])
        expect(library.items.value).toEqual([])
        expect(library.selectedIds.value).toEqual([])
    })

    it('keeps removal authoritative across an unrelated list reload', async () => {
        const authenticated = ref(true)
        const ownerKey = ref<string | null>('owner-a')
        const pendingRemoval = deferred<unknown>()
        const fetchPage = vi.fn(async () => page([rawItem('one')]))
        const library = useTalosLibrary({
            authenticated,
            ownerKey,
            fetchPage,
            removeItems: vi.fn(() => pendingRemoval.promise),
        })
        await nextTick()
        await nextTick()

        library.toggleSelected('one')
        const removal = library.removeSelected()
        expect(library.removing.value).toBe(true)

        await library.load()
        pendingRemoval.resolve({ data: { removed_count: 1 } })

        await expect(removal).resolves.toBe(1)
        expect(library.items.value).toEqual([])
        expect(library.selectedIds.value).toEqual([])
        expect(library.removing.value).toBe(false)
    })

    it('fences session media by owner and active session', async () => {
        const authenticated = ref(true)
        const ownerKey = ref<string | null>('owner-a')
        const first = deferred<unknown>()
        const second = deferred<unknown>()
        const fetchSessionMedia = vi.fn((_owner: string, sessionId: string) => (
            sessionId === 'session-a' ? first.promise : second.promise
        ))
        const library = useTalosLibrary({
            authenticated,
            ownerKey,
            fetchPage: async () => page([]),
            fetchSessionMedia,
        })
        await nextTick()
        await nextTick()

        const firstLoad = library.loadSessionMedia('session-a')
        const secondLoad = library.loadSessionMedia('session-b')
        first.resolve(media([rawItem('stale')]))
        await firstLoad
        expect(library.sessionMedia.value).toEqual([])

        second.resolve(media([rawItem('current')]))
        await secondLoad
        expect(library.sessionMedia.value.map((item) => item.id)).toEqual(['current'])
        expect(library.sessionMediaSessionId.value).toBe('session-b')
    })

    it('supports a session-media-only consumer without loading the global Library', async () => {
        const authenticated = ref(true)
        const ownerKey = ref<string | null>('owner-a')
        const fetchPage = vi.fn(async () => page([rawItem('global')]))
        const fetchSessionMedia = vi.fn(async () => media([rawItem('session')]))
        const library = useTalosLibrary({
            authenticated,
            ownerKey,
            autoLoadLibrary: false,
            fetchPage,
            fetchSessionMedia,
        })
        await nextTick()
        await nextTick()

        expect(fetchPage).not.toHaveBeenCalled()
        await library.loadSessionMedia('session-a')
        expect(fetchSessionMedia).toHaveBeenCalledWith('owner-a', 'session-a', null)
        expect(library.sessionMedia.value.map((item) => item.id)).toEqual(['session'])
    })
})

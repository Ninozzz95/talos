import { beforeEach, describe, expect, it, vi } from 'vitest'
import { talosFetch } from '../lib/api'
import type { TalosBrowserSession } from '../lib/talosTypes'
import { useTalosBrowse } from './useTalosBrowse'

vi.mock('../lib/api', () => ({
    talosFetch: vi.fn(),
}))

const talosFetchMock = vi.mocked(talosFetch)

function browserSession(talosSessionId: string): TalosBrowserSession {
    return {
        id: `browser-${talosSessionId}`,
        talos_session_id: talosSessionId,
        status: 'ready',
        mode: 'read_only',
        capabilities: ['navigate', 'screenshot', 'snapshot'],
        current_url: null,
        current_title: null,
        last_screenshot_artifact_id: null,
        last_snapshot_artifact_id: null,
        expires_at: null,
        created_at: '2026-07-10T12:00:00Z',
        updated_at: '2026-07-10T12:00:00Z',
    }
}

describe('useTalosBrowse chat isolation', () => {
    beforeEach(() => {
        talosFetchMock.mockReset()
    })

    it('clears every browser-owned state value when the active chat changes', () => {
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')
        browse.sessions.value = [browserSession('chat-a')]
        browse.activeSession.value = browserSession('chat-a')
        browse.events.value = [{ id: 'event-a', type: 'screenshot.captured', created_at: '2026-07-10T12:00:00Z' }]
        browse.latestScreenshot.value = '/api/talos/browser/artifacts/a/preview'
        browse.latestSnapshot.value = {
            snapshot: { untrusted: true, nodes: [] },
        }

        browse.bindTalosSession('chat-b')

        expect(browse.boundTalosSessionId.value).toBe('chat-b')
        expect(browse.sessions.value).toEqual([])
        expect(browse.activeSession.value).toBeNull()
        expect(browse.events.value).toEqual([])
        expect(browse.latestScreenshot.value).toBeNull()
        expect(browse.latestSnapshot.value).toBeNull()
        expect(browse.browserMode.value).toMatchObject({ enabled: false, session_id: null, status: 'disconnected' })
    })

    it('lists and creates browser sessions only inside the bound chat', async () => {
        const created = browserSession('chat-b')
        talosFetchMock.mockImplementation(async (url, options) => {
            if (url === '/api/talos/browser/sessions?talos_session_id=chat-b') return { data: [] } as never
            if (url === '/api/talos/browser/sessions' && options?.method === 'POST') return { data: created } as never
            if (url === `/api/talos/browser/sessions/${created.id}/events`) return { data: [] } as never
            throw new Error(`Unhandled test request: ${url}`)
        })
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-b')

        await browse.enableBrowse()

        expect(talosFetchMock).toHaveBeenCalledWith('/api/talos/browser/sessions', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ talos_session_id: 'chat-b' }),
        }))
        expect(browse.activeSession.value?.talos_session_id).toBe('chat-b')
        expect(browse.browserMode.value).toMatchObject({ enabled: true, session_id: created.id, status: 'ready' })
    })

    it('does not create a browser session in a new chat when an old-chat restart resolves late', async () => {
        let resolveClose: ((value: { data: TalosBrowserSession }) => void) | null = null
        const oldSession = browserSession('chat-a')
        const closedSession = { ...oldSession, status: 'closed' }
        talosFetchMock.mockImplementation(async (url, options) => {
            if (url === `/api/talos/browser/sessions/${oldSession.id}` && options?.method === 'DELETE') {
                return await new Promise<{ data: TalosBrowserSession }>((resolve) => {
                    resolveClose = resolve
                }) as never
            }
            throw new Error(`Unexpected test request: ${url}`)
        })
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')
        browse.activeSession.value = oldSession
        browse.sessions.value = [oldSession]

        const restarting = browse.restartSession()
        await vi.waitFor(() => expect(resolveClose).not.toBeNull())
        browse.bindTalosSession('chat-b')
        resolveClose?.({ data: closedSession })

        await expect(restarting).resolves.toBeNull()
        expect(browse.boundTalosSessionId.value).toBe('chat-b')
        expect(browse.activeSession.value).toBeNull()
        expect(talosFetchMock.mock.calls.some(([url, options]) => url === '/api/talos/browser/sessions' && options?.method === 'POST')).toBe(false)
    })

    it('maps an explicitly closed worker session to a stopped, retryable Browse state', async () => {
        const active = {
            ...browserSession('chat-a'),
            status: 'active',
            current_url: 'https://example.com/current',
            current_title: 'Current page',
        }
        const closed = { ...active, status: 'closed' }
        talosFetchMock.mockImplementation(async (url, options) => {
            if (url === `/api/talos/browser/sessions/${active.id}` && options?.method === 'DELETE') return { data: closed } as never
            if (url === `/api/talos/browser/sessions/${active.id}` && !options?.method) return { data: active } as never
            if (url === `/api/talos/browser/sessions/${active.id}/events`) return { data: [] } as never
            throw new Error(`Unexpected test request: ${url}`)
        })
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')
        browse.sessions.value = [active]
        browse.activeSession.value = active

        await browse.enableBrowse()
        await browse.closeSession()

        expect(talosFetchMock).toHaveBeenCalledWith(`/api/talos/browser/sessions/${active.id}`, expect.objectContaining({ method: 'DELETE' }))
        expect(browse.activeSession.value).toMatchObject({ status: 'closed', current_url: 'https://example.com/current' })
        expect(browse.browserMode.value).toMatchObject({ enabled: true, session_id: active.id, status: 'stopped' })
    })
})

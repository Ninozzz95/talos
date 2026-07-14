import { beforeEach, describe, expect, it, vi } from 'vitest'
import { talosFetch } from '../lib/api'
import type { TalosMessage, TalosSession } from '../lib/talosTypes'
import { useTalosSessions } from './useTalosSessions'

vi.mock('../lib/api', async (importOriginal) => ({
    ...await importOriginal<typeof import('../lib/api')>(),
    talosFetch: vi.fn(),
}))

const talosFetchMock = vi.mocked(talosFetch)

function session(title: string): TalosSession {
    return {
        id: 'session-1',
        title,
        mode: 'verified_execution',
        persistence_mode: 'persistent',
        active_model_profile_id: null,
        metadata: { surface: 'chat' },
        created_at: '2026-07-14T03:30:00Z',
        updated_at: '2026-07-14T03:30:00Z',
    }
}

describe('useTalosSessions creation concurrency', () => {
    beforeEach(() => {
        talosFetchMock.mockReset()
    })

    it('coalesces a Browse bootstrap and first prompt into one chat and promotes its title', async () => {
        let releaseCreate: ((value: { data: TalosSession }) => void) | null = null
        const pendingCreate = new Promise<{ data: TalosSession }>((resolve) => {
            releaseCreate = resolve
        })
        talosFetchMock.mockImplementation(async (url, options) => {
            if (url === '/api/talos/sessions' && options?.method === 'POST') return await pendingCreate as never
            if (url === '/api/talos/sessions/session-1' && options?.method === 'PATCH') {
                const body = JSON.parse(String(options.body)) as { title: string }
                return { data: session(body.title) } as never
            }
            throw new Error(`Unhandled test request: ${url}`)
        })
        const sessions = useTalosSessions('chat')

        const browseBootstrap = sessions.createSession('New chat', 'persistent')
        const firstPrompt = sessions.createSession('Inspect fixture page', 'persistent')
        await vi.waitFor(() => expect(talosFetchMock).toHaveBeenCalled())
        releaseCreate?.({ data: session('New chat') })

        const [created, promoted] = await Promise.all([browseBootstrap, firstPrompt])

        expect(created.id).toBe('session-1')
        expect(promoted).toMatchObject({ id: 'session-1', title: 'Inspect fixture page' })
        expect(sessions.activeSession.value).toMatchObject({ id: 'session-1', title: 'Inspect fixture page' })
        expect(talosFetchMock.mock.calls.filter(([url, options]) => (
            url === '/api/talos/sessions' && options?.method === 'POST'
        ))).toHaveLength(1)
        expect(talosFetchMock).toHaveBeenCalledWith('/api/talos/sessions/session-1', expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ title: 'Inspect fixture page' }),
        }))
    })

    it('accepts a server-persisted message into the active thread exactly once', () => {
        const sessions = useTalosSessions('chat')
        sessions.activeSession.value = session('Screenshot chat')
        const assistant: TalosMessage = {
            id: 'assistant-1',
            session_id: 'session-1',
            role: 'assistant',
            content: 'Screenshot captured.',
            run_id: 'run-1',
            metadata: { browser_activities: [] },
            created_at: '2026-07-14T10:00:01Z',
        }

        const acceptPersistedMessage = (sessions as unknown as {
            acceptPersistedMessage: (message: TalosMessage) => void
        }).acceptPersistedMessage
        acceptPersistedMessage(assistant)
        acceptPersistedMessage({ ...assistant, content: 'Screenshot captured and verified.' })

        expect(sessions.messages.value).toEqual([{ ...assistant, content: 'Screenshot captured and verified.' }])
    })
})

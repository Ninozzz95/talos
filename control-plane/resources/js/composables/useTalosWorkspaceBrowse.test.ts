import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { talosFetch } from '../lib/api'
import { useTalosWorkspaceBrowse } from './useTalosWorkspaceBrowse'
import type { TalosBrowserSession, TalosBrowserTask } from '../lib/talosTypes'

vi.mock('../lib/api', () => ({
    talosFetch: vi.fn(),
}))

const talosFetchMock = vi.mocked(talosFetch)

describe('useTalosWorkspaceBrowse async chat isolation', () => {
    it('BREG-021 reloads durable task cards while Browse remains disabled', async () => {
        const persistedTask: TalosBrowserTask = {
            id: 'task-history', talos_session_id: 'chat-a', origin_message_id: 'message-history',
            browser_session_id: 'browser-history', runtime_id: 'runtime-history', active_tab_id: 'tab-history',
            goal: 'Persist this Browser history.', status: 'completed', autonomy_profile: 'assist', budget: {}, state_version: 4,
            requested_at: '2026-07-16T08:00:00Z', started_at: '2026-07-16T08:00:01Z',
            completed_at: '2026-07-16T08:00:04Z', failed_at: null, cancelled_at: null, reconciled_at: null,
            created_at: '2026-07-16T08:00:00Z', updated_at: '2026-07-16T08:00:04Z',
        }
        talosFetchMock.mockReset()
        talosFetchMock.mockImplementation(async (url) => {
            if (url === '/api/talos/browser/tasks?talos_session_id=chat-a') {
                return { data: [persistedTask] } as never
            }
            throw new Error(`A disabled historical read must not start Browser: ${url}`)
        })

        const workspace = useTalosWorkspaceBrowse(
            false,
            ref<string | null>(null),
            ref<string | null>('chat-a'),
            async () => 'chat-a',
            {},
            { taskActivity: ref(false), taskPollingIntervalMs: 5 },
        )

        await vi.waitFor(() => expect(workspace.browserTasks.value).toEqual([persistedTask]))
        expect(workspace.browseModeEnabled.value).toBe(false)
        expect(workspace.browserMode.value.enabled).toBe(false)
        expect(talosFetchMock).toHaveBeenCalledTimes(1)
    })

    it('forwards an exact Browser task cancellation target and exposes its command state', async () => {
        const activeTalosSessionId = ref<string | null>(null)
        const workspace = useTalosWorkspaceBrowse(
            false,
            ref<string | null>(null),
            activeTalosSessionId,
            async () => 'chat-a',
        )
        activeTalosSessionId.value = 'chat-a'
        const primary: TalosBrowserTask = {
            id: 'task-primary', talos_session_id: 'chat-a', origin_message_id: 'message-primary',
            browser_session_id: 'browser-primary', runtime_id: 'runtime-primary', active_tab_id: 'tab-primary',
            goal: 'Keep browsing.', status: 'running', autonomy_profile: 'assist', budget: {}, state_version: 2,
            requested_at: '2026-07-16T08:00:00Z', started_at: '2026-07-16T08:00:01Z',
            completed_at: null, failed_at: null, cancelled_at: null, reconciled_at: null,
            created_at: '2026-07-16T08:00:00Z', updated_at: '2026-07-16T08:00:01Z',
        }
        const selected: TalosBrowserTask = {
            ...primary,
            id: 'task-selected',
            origin_message_id: 'message-selected',
            browser_session_id: 'browser-selected',
        }
        talosFetchMock.mockReset()
        talosFetchMock.mockResolvedValue({
            data: { task: { ...selected, status: 'cancelled', state_version: 3, cancelled_at: '2026-07-16T08:00:02Z' } },
        } as never)
        workspace.browserTasks.value = [primary, selected]

        await workspace.cancelBrowserTask(selected.id)

        expect(talosFetchMock).toHaveBeenCalledWith(
            `/api/talos/browser/tasks/${selected.id}/cancel`,
            expect.objectContaining({ method: 'POST' }),
        )
        expect(workspace.browserTaskCommandTargetId.value).toBe(selected.id)
        expect(workspace.browserTasks.value.find((task) => task.id === primary.id)?.status).toBe('running')
        expect(workspace.browserTasks.value.find((task) => task.id === selected.id)?.status).toBe('cancelled')
    })

    it('polls a running browser task while a Browse chat is sending and keeps the terminal projection after settlement', async () => {
        const session: TalosBrowserSession = {
            id: 'browser-chat-a', talos_session_id: 'chat-a', status: 'ready', mode: 'read_only',
            capabilities: ['navigate'], current_url: null, current_title: null,
            last_screenshot_artifact_id: null, last_snapshot_artifact_id: null,
            created_at: '2026-07-16T08:00:00Z', updated_at: '2026-07-16T08:00:00Z',
        }
        const task = (status: TalosBrowserTask['status']): TalosBrowserTask => ({
            id: 'task-chat-a', talos_session_id: 'chat-a', origin_message_id: 'message-1',
            browser_session_id: session.id, runtime_id: session.id, active_tab_id: 'tab-chat-a',
            goal: 'Inspect a page.', status,
            autonomy_profile: 'assist', budget: {}, state_version: status === 'completed' ? 4 : 3,
            requested_at: '2026-07-16T08:00:00Z', started_at: '2026-07-16T08:00:01Z',
            completed_at: status === 'completed' ? '2026-07-16T08:00:04Z' : null,
            failed_at: null, cancelled_at: null, reconciled_at: null,
            created_at: '2026-07-16T08:00:00Z', updated_at: '2026-07-16T08:00:04Z',
        })
        let taskReads = 0
        talosFetchMock.mockReset()
        talosFetchMock.mockImplementation(async (url) => {
            if (url === '/api/talos/browser/sessions?talos_session_id=chat-a') return { data: [session] } as never
            if (url === `/api/talos/browser/sessions/${session.id}`) return { data: session } as never
            if (url === `/api/talos/browser/sessions/${session.id}/events`) return { data: [] } as never
            if (url === '/api/talos/browser/tasks?talos_session_id=chat-a') {
                taskReads += 1
                return { data: [task(taskReads >= 3 ? 'completed' : 'running')] } as never
            }
            throw new Error(`Unexpected request: ${url}`)
        })
        const sending = ref(false)
        const workspace = useTalosWorkspaceBrowse(
            false,
            ref<string | null>(null),
            ref('chat-a'),
            async () => 'chat-a',
            {},
            { taskActivity: sending, taskPollingIntervalMs: 5 },
        )

        await workspace.handleEnableBrowse()
        await vi.waitFor(() => expect(workspace.activeBrowserTask.value?.status).toBe('running'))
        sending.value = true
        await vi.waitFor(() => expect(taskReads).toBeGreaterThanOrEqual(3))
        sending.value = false
        await vi.waitFor(() => expect(workspace.activeBrowserTask.value?.status).toBe('completed'))

        expect(workspace.activeBrowserTask.value?.state_version).toBe(4)
        expect(workspace.browserTasks.value).toEqual([
            expect.objectContaining({ id: 'task-chat-a', status: 'completed' }),
        ])
    })

    it('does not re-enable Browse when an old chat request resolves after a chat switch', async () => {
        let resolveOldList: ((value: { data: [] }) => void) | null = null
        talosFetchMock.mockReset()
        talosFetchMock.mockImplementation(async (url) => {
            if (url === '/api/talos/browser/sessions?talos_session_id=chat-a') {
                return await new Promise<{ data: [] }>((resolve) => {
                    resolveOldList = resolve
                }) as never
            }
            throw new Error(`Unexpected request: ${url}`)
        })
        const activeTalosSessionId = ref<string | null>('chat-a')
        const workspace = useTalosWorkspaceBrowse(
            false,
            ref<string | null>(null),
            activeTalosSessionId,
            async () => activeTalosSessionId.value ?? 'chat-a',
        )

        const enabling = workspace.handleEnableBrowse()
        await vi.waitFor(() => expect(resolveOldList).not.toBeNull())
        activeTalosSessionId.value = 'chat-b'
        resolveOldList?.({ data: [] })
        await enabling

        expect(workspace.browseModeEnabled.value).toBe(false)
        expect(workspace.browserMode.value).toMatchObject({ enabled: false, session_id: null, status: 'disconnected' })
    })

    it('restores a persisted per-chat Browse preference after reload without creating another browser session', async () => {
        const session: TalosBrowserSession = {
            id: 'browser-chat-a',
            talos_session_id: 'chat-a',
            status: 'ready',
            mode: 'read_only',
            capabilities: ['navigate', 'screenshot', 'snapshot'],
            current_url: 'https://example.com/current',
            current_title: 'Current page',
            last_screenshot_artifact_id: null,
            last_snapshot_artifact_id: null,
            created_at: '2026-07-10T12:00:00Z',
            updated_at: '2026-07-10T12:00:00Z',
        }
        const persistEnabled = vi.fn(async () => undefined)
        talosFetchMock.mockReset()
        talosFetchMock.mockImplementation(async (url) => {
            if (url === '/api/talos/browser/sessions?talos_session_id=chat-a') return { data: [session] } as never
            if (url === `/api/talos/browser/sessions/${session.id}`) return { data: session } as never
            if (url === `/api/talos/browser/sessions/${session.id}/events`) return { data: [] } as never
            throw new Error(`Unexpected request: ${url}`)
        })
        const activeTalosSessionId = ref<string | null>('chat-a')
        const workspace = useTalosWorkspaceBrowse(
            false,
            ref<string | null>(null),
            activeTalosSessionId,
            async () => 'chat-a',
            {
                shouldRestore: (sessionId) => sessionId === 'chat-a',
                persistEnabled,
            },
        )

        await workspace.initializeBrowse()

        expect(workspace.browseModeEnabled.value).toBe(true)
        expect(workspace.activeBrowserSession.value?.id).toBe(session.id)
        expect(talosFetchMock.mock.calls.some(([url, options]) => url === '/api/talos/browser/sessions' && options?.method === 'POST')).toBe(false)

        await workspace.toggleBrowseMode()
        expect(persistEnabled).toHaveBeenCalledWith('chat-a', false)
    })

    it('creates a chat and Browser session for a forced Browse deep link', async () => {
        const activeTalosSessionId = ref<string | null>(null)
        const ensureTalosSessionId = vi.fn(async () => {
            activeTalosSessionId.value = 'chat-created'
            return 'chat-created'
        })
        const session: TalosBrowserSession = {
            id: 'browser-created',
            talos_session_id: 'chat-created',
            status: 'ready',
            mode: 'read_only',
            capabilities: ['navigate', 'screenshot', 'snapshot'],
            current_url: null,
            current_title: null,
            last_screenshot_artifact_id: null,
            last_snapshot_artifact_id: null,
            created_at: '2026-07-10T12:00:00Z',
            updated_at: '2026-07-10T12:00:00Z',
        }
        talosFetchMock.mockReset()
        talosFetchMock.mockImplementation(async (url, options) => {
            if (url === '/api/talos/browser/sessions?talos_session_id=chat-created') return { data: [] } as never
            if (url === '/api/talos/browser/sessions' && options?.method === 'POST') return { data: session } as never
            if (url === `/api/talos/browser/sessions/${session.id}/events`) return { data: [] } as never
            throw new Error(`Unexpected request: ${url}`)
        })
        const workspace = useTalosWorkspaceBrowse(
            true,
            ref<string | null>(null),
            activeTalosSessionId,
            ensureTalosSessionId,
        )

        await workspace.initializeBrowse()

        expect(ensureTalosSessionId).toHaveBeenCalledOnce()
        expect(workspace.browseModeEnabled.value).toBe(true)
        expect(workspace.activeBrowserSession.value?.id).toBe(session.id)
    })

    it('shows the current page and stops the worker without disguising it as a failure', async () => {
        const session: TalosBrowserSession = {
            id: 'browser-current-page',
            talos_session_id: 'chat-a',
            status: 'active',
            mode: 'read_only',
            capabilities: ['navigate', 'screenshot', 'snapshot'],
            current_url: 'https://example.com/products/42',
            current_title: 'Product 42',
            last_screenshot_artifact_id: null,
            last_snapshot_artifact_id: null,
            created_at: '2026-07-10T12:00:00Z',
            updated_at: '2026-07-10T12:00:00Z',
        }
        const closed = { ...session, status: 'closed' }
        talosFetchMock.mockReset()
        talosFetchMock.mockImplementation(async (url, options) => {
            if (url === '/api/talos/browser/sessions?talos_session_id=chat-a') return { data: [session] } as never
            if (url === `/api/talos/browser/sessions/${session.id}` && options?.method === 'DELETE') return { data: closed } as never
            if (url === `/api/talos/browser/sessions/${session.id}`) return { data: session } as never
            if (url === `/api/talos/browser/sessions/${session.id}/events`) return { data: [] } as never
            throw new Error(`Unexpected request: ${url}`)
        })
        const activeTalosSessionId = ref<string | null>('chat-a')
        const workspace = useTalosWorkspaceBrowse(
            false,
            ref<string | null>(null),
            activeTalosSessionId,
            async () => 'chat-a',
        )

        await workspace.handleEnableBrowse()
        expect(workspace.browserCurrentPage.value).toEqual({
            host: 'example.com',
            title: 'Product 42',
            url: 'https://example.com/products/42',
        })

        await workspace.handleStopBrowse()

        expect(workspace.browseModeEnabled.value).toBe(true)
        expect(workspace.browserMode.value.status).toBe('stopped')
        expect(workspace.browserCurrentPage.value?.title).toBe('Product 42')
    })

    it('drops chat activities from the stopped browser session when retry creates a new session', async () => {
        const oldSession: TalosBrowserSession = {
            id: 'browser-old',
            talos_session_id: 'chat-a',
            status: 'active',
            mode: 'read_only',
            capabilities: ['navigate', 'screenshot', 'snapshot'],
            current_url: null,
            current_title: null,
            last_screenshot_artifact_id: null,
            last_snapshot_artifact_id: null,
            created_at: '2026-07-10T12:00:00Z',
            updated_at: '2026-07-10T12:00:00Z',
        }
        const newSession = { ...oldSession, id: 'browser-new' }
        talosFetchMock.mockReset()
        talosFetchMock.mockImplementation(async (url, options) => {
            if (url === '/api/talos/browser/sessions?talos_session_id=chat-a') return { data: [oldSession] } as never
            if (url === `/api/talos/browser/sessions/${oldSession.id}` && options?.method === 'DELETE') {
                return { data: { ...oldSession, status: 'closed' } } as never
            }
            if (url === '/api/talos/browser/sessions' && options?.method === 'POST') return { data: newSession } as never
            if (url === `/api/talos/browser/sessions/${oldSession.id}`) return { data: oldSession } as never
            if (url === `/api/talos/browser/sessions/${newSession.id}/events`) return { data: [] } as never
            if (url === `/api/talos/browser/sessions/${oldSession.id}/events`) return { data: [] } as never
            throw new Error(`Unexpected request: ${url}`)
        })
        const workspace = useTalosWorkspaceBrowse(false, ref<string | null>(null), ref('chat-a'), async () => 'chat-a')

        await workspace.handleEnableBrowse()
        workspace.recordBrowserActivities([{
            id: 'activity-old', operation: 'read', status: 'succeeded', label: 'Old read',
            run_id: null, browser_session_id: oldSession.id, artifact_ids: [], occurred_at: oldSession.updated_at,
        }])
        expect(workspace.visibleBrowserActivities.value.map((activity) => activity.id)).toContain('activity-old')

        await workspace.handleRestartBrowse()

        workspace.recordBrowserActivities([{
            id: 'activity-new', operation: 'read', status: 'succeeded', label: 'New read',
            run_id: null, browser_session_id: newSession.id, artifact_ids: [], occurred_at: newSession.updated_at,
        }])
        expect(workspace.activeBrowserSession.value?.id).toBe(newSession.id)
        expect(workspace.visibleBrowserActivities.value.map((activity) => activity.id)).toEqual(expect.arrayContaining(['activity-new']))
        expect(workspace.visibleBrowserActivities.value.map((activity) => activity.id)).not.toContain('activity-old')
    })
})

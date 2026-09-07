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
            if (url === `/api/talos/browser/sessions/${newSession.id}`) return { data: newSession } as never
            if (url === `/api/talos/browser/sessions/${newSession.id}/events`) return { data: [] } as never
            if (url === `/api/talos/browser/sessions/${oldSession.id}/events`) return { data: [] } as never
            throw new Error(`Unexpected request: ${url}`)
        })
        const workspace = useTalosWorkspaceBrowse(false, ref<string | null>(null), ref('chat-a'), async () => 'chat-a')

        await workspace.handleEnableBrowse()
        await workspace.recordBrowserActivities([{
            id: 'activity-old', operation: 'read', status: 'succeeded', label: 'Old read',
            run_id: null, browser_session_id: oldSession.id, artifact_ids: [], occurred_at: oldSession.updated_at,
        }])
        expect(workspace.visibleBrowserActivities.value.map((activity) => activity.id)).toContain('activity-old')

        await workspace.handleRestartBrowse()

        await workspace.recordBrowserActivities([{
            id: 'activity-new', operation: 'read', status: 'succeeded', label: 'New read',
            run_id: null, browser_session_id: newSession.id, artifact_ids: [], occurred_at: newSession.updated_at,
        }])
        expect(workspace.activeBrowserSession.value?.id).toBe(newSession.id)
        expect(workspace.visibleBrowserActivities.value.map((activity) => activity.id)).toEqual(expect.arrayContaining(['activity-new']))
        expect(workspace.visibleBrowserActivities.value.map((activity) => activity.id)).not.toContain('activity-old')
    })

    it('STAGE2A-009 routes recoverable tasks to recovery and stopped sessions to an existing fresh replacement', async () => {
        const recoverySession: TalosBrowserSession = {
            id: 'browser-recovery', talos_session_id: 'chat-a', status: 'recovery_required', mode: 'read_only',
            capabilities: ['navigate', 'screenshot', 'snapshot', 'interact'], state_version: 7,
            current_url: 'https://example.com/recovery', current_title: 'Recovery page',
            last_screenshot_artifact_id: 'screen-7', last_snapshot_artifact_id: 'snapshot-7',
            created_at: '2026-07-22T12:00:00Z', updated_at: '2026-07-22T12:00:00Z',
        }
        const task: TalosBrowserTask = {
            id: 'task-recovery', talos_session_id: 'chat-a', origin_message_id: 'message-recovery',
            browser_session_id: recoverySession.id, runtime_id: 'runtime-recovery', active_tab_id: 'tab-recovery',
            goal: 'Recover without redispatch.', status: 'running', autonomy_profile: 'assist', budget: {}, state_version: 3,
            requested_at: '2026-07-22T12:00:00Z', started_at: '2026-07-22T12:00:01Z',
            completed_at: null, failed_at: null, cancelled_at: null, reconciled_at: null,
            created_at: '2026-07-22T12:00:00Z', updated_at: '2026-07-22T12:00:01Z',
        }
        const recovered = { ...task, status: 'recovering' as const, state_version: 4, reconciled_at: '2026-07-22T12:00:02Z' }
        talosFetchMock.mockReset()
        talosFetchMock.mockImplementation(async (url, options) => {
            if (url === '/api/talos/browser/sessions?talos_session_id=chat-a') return { data: [recoverySession] } as never
            if (url === `/api/talos/browser/sessions/${recoverySession.id}`) return { data: recoverySession } as never
            if (url === `/api/talos/browser/sessions/${recoverySession.id}/events`) return { data: [] } as never
            if (url === `/api/talos/browser/tasks/${task.id}/recover` && options?.method === 'POST') return { data: {
                decision: {
                    strategy: 'reconcile', reason_code: 'browser_recovery_evidence_reconcile',
                    remediation: 'Capture missing evidence.', task_id: task.id, resulting_task_id: null,
                },
                task: recovered,
                resulting_task: null,
            } } as never
            throw new Error(`Unexpected recovery request: ${url}`)
        })
        const workspace = useTalosWorkspaceBrowse(false, ref<string | null>(null), ref('chat-a'), async () => 'chat-a')

        await workspace.handleEnableBrowse()
        workspace.browserTasks.value = [task]
        expect(workspace.browserRecoveryAction.value).toBe('recover_task')

        await workspace.handleRecoverBrowse()

        expect(talosFetchMock).toHaveBeenCalledWith(`/api/talos/browser/tasks/${task.id}/recover`, expect.objectContaining({ method: 'POST' }))
        expect(workspace.browserTasks.value[0]?.status).toBe('recovering')
        expect(talosFetchMock.mock.calls.some(([url, options]) => url === '/api/talos/browser/sessions' && options?.method === 'POST')).toBe(false)

        const closed = { ...recoverySession, status: 'closed', updated_at: '2026-07-22T12:00:03Z' }
        const replacement = {
            ...recoverySession,
            id: 'browser-replacement',
            status: 'ready',
            state_version: 0,
            last_screenshot_artifact_id: null,
            last_snapshot_artifact_id: null,
            updated_at: '2026-07-22T12:00:04Z',
        }
        workspace.activeBrowserSession.value = closed
        workspace.browserMode.value = { enabled: true, session_id: closed.id, status: 'stopped', capabilities: closed.capabilities }
        workspace.browserTasks.value = []
        talosFetchMock.mockReset()
        talosFetchMock.mockImplementation(async (url, options) => {
            if (url === '/api/talos/browser/sessions?talos_session_id=chat-a') return { data: [closed, replacement] } as never
            if (url === `/api/talos/browser/sessions/${replacement.id}`) return { data: replacement } as never
            if (url === `/api/talos/browser/sessions/${replacement.id}/events`) return { data: [] } as never
            if (url === '/api/talos/browser/sessions' && options?.method === 'POST') throw new Error('Existing replacement must be selected.')
            throw new Error(`Unexpected replacement request: ${url}`)
        })

        expect(workspace.browserRecoveryAction.value).toBe('start_fresh')
        await workspace.handleRecoverBrowse()

        expect(workspace.activeBrowserSession.value?.id).toBe(replacement.id)
        expect(talosFetchMock.mock.calls.some(([url, options]) => url === '/api/talos/browser/sessions' && options?.method === 'POST')).toBe(false)
    })

    it('STAGE2B-015 forwards the active semantic frame and exact ref interaction once', async () => {
        const active: TalosBrowserSession = {
            id: 'browser-ref', talos_session_id: 'chat-a', status: 'active', mode: 'read_only',
            capabilities: ['navigate', 'screenshot', 'snapshot', 'interact'], state_version: 7,
            viewport: { width: 1280, height: 800 },
            current_url: 'https://example.com/start', current_title: 'Start page',
            last_screenshot_artifact_id: 'screen-7', last_snapshot_artifact_id: 'snapshot-7',
            created_at: '2026-07-22T12:00:00Z', updated_at: '2026-07-22T12:00:00Z',
        }
        const updated = {
            ...active,
            state_version: 8,
            last_screenshot_artifact_id: 'screen-8',
            last_snapshot_artifact_id: 'snapshot-8',
        }
        let executed = false
        talosFetchMock.mockReset()
        talosFetchMock.mockImplementation(async (url, options) => {
            if (url === '/api/talos/browser/sessions?talos_session_id=chat-a') return { data: [active] } as never
            if (url === `/api/talos/browser/sessions/${active.id}`) return { data: active } as never
            if (url === `/api/talos/browser/sessions/${active.id}/events`) return { data: [] } as never
            if (url === `/api/talos/browser/sessions/${active.id}/interaction-targets`) {
                return { data: workspaceRefFrame(executed ? updated : active, executed ? 'e2' : 'e1') } as never
            }
            if (url === `/api/talos/browser/sessions/${active.id}/interactions/ref` && options?.method === 'POST') {
                executed = true
                return { data: workspaceRefExecution(updated) } as never
            }
            throw new Error(`Unexpected semantic interaction request: ${url}`)
        })
        const workspace = useTalosWorkspaceBrowse(false, ref<string | null>(null), ref('chat-a'), async () => 'chat-a')

        await workspace.handleEnableBrowse()
        expect(workspace.browserRefFrame.value).toEqual(workspaceRefFrame(active, 'e1'))

        const frame = workspace.browserRefFrame.value!
        await workspace.interactWithBrowserRef({
            browserSessionId: active.id,
            artifact: frame.screenshot,
            snapshotId: frame.snapshot_id,
            ref: frame.targets[0].ref,
            clickCount: 1,
        })

        expect(workspace.browserRefFrame.value).toEqual(workspaceRefFrame(updated, 'e2'))
        expect(workspace.browserRefTargetsLoading.value).toBe(false)
        expect(workspace.browserRefTargetsError.value).toBeNull()
        const calls = talosFetchMock.mock.calls.filter(([url]) => String(url).endsWith('/interactions/ref'))
        expect(calls).toHaveLength(1)
        expect(JSON.parse(String(calls[0]?.[1]?.body))).toMatchObject({
            schema_version: 'talos_browser_hmi_ref_v2',
            artifact_id: 'screen-7',
            state_version: 7,
            snapshot_id: `hmi_ref_${'d'.repeat(64)}`,
            ref: 'e1',
        })
    })
})

describe('HJ9-042 browser session reconciliation after chat tool activity', () => {
    const reconciliationSession: TalosBrowserSession = {
        id: 'browser-hj9',
        talos_session_id: 'chat-a',
        status: 'active',
        mode: 'read_only',
        capabilities: ['navigate', 'screenshot', 'snapshot'],
        current_url: 'https://example.com/start',
        current_title: 'Start page',
        last_screenshot_artifact_id: null,
        last_snapshot_artifact_id: null,
        created_at: '2026-07-20T10:00:00Z',
        updated_at: '2026-07-20T10:00:00Z',
    }

    function screenshotActivity(browserSessionId: string) {
        return {
            id: 'activity-chat-screenshot',
            operation: 'screenshot',
            status: 'succeeded',
            label: 'Screenshot',
            run_id: 'run-hj9',
            browser_session_id: browserSessionId,
            artifact_ids: ['artifact-shot-1'],
            occurred_at: '2026-07-20T10:00:05Z',
        }
    }

    it('HJREG-003 refreshes active Browser session after an owned chat screenshot activity', async () => {
        const refreshedSession: TalosBrowserSession = {
            ...reconciliationSession,
            capabilities: ['navigate', 'screenshot', 'snapshot', 'interact'],
            last_screenshot_artifact_id: 'artifact-shot-1',
            updated_at: '2026-07-20T10:00:06Z',
        }
        let sessionReads = 0
        let releaseRefresh: (() => void) | null = null
        talosFetchMock.mockReset()
        talosFetchMock.mockImplementation(async (url) => {
            if (url === '/api/talos/browser/sessions?talos_session_id=chat-a') return { data: [reconciliationSession] } as never
            if (url === `/api/talos/browser/sessions/${reconciliationSession.id}`) {
                sessionReads += 1
                if (sessionReads === 1) return { data: reconciliationSession } as never
                return await new Promise((resolve) => {
                    releaseRefresh = () => resolve({ data: refreshedSession })
                }) as never
            }
            if (url === `/api/talos/browser/sessions/${reconciliationSession.id}/events`) return { data: [] } as never
            throw new Error(`Unexpected request: ${url}`)
        })
        const workspace = useTalosWorkspaceBrowse(false, ref<string | null>(null), ref('chat-a'), async () => 'chat-a')

        await workspace.handleEnableBrowse()
        expect(workspace.activeBrowserSession.value?.last_screenshot_artifact_id).toBeNull()

        const pending = workspace.recordBrowserActivities([screenshotActivity(reconciliationSession.id)])
        expect(pending).toBeInstanceOf(Promise)
        let settled = false
        void Promise.resolve(pending).then(() => { settled = true })

        await vi.waitFor(() => expect(sessionReads).toBe(2))
        await Promise.resolve()
        await Promise.resolve()
        expect(settled).toBe(false)
        expect(workspace.visibleBrowserActivities.value.map((activity) => activity.id)).toContain('activity-chat-screenshot')

        releaseRefresh?.()
        await pending

        expect(workspace.activeBrowserSession.value?.last_screenshot_artifact_id).toBe('artifact-shot-1')
        expect(workspace.activeBrowserSession.value?.capabilities).toContain('interact')
        expect(sessionReads).toBe(2)
    })

    it('rejects foreign and superseded chat activity refreshes', async () => {
        let staleReads = 0
        let releaseStale: (() => void) | null = null
        talosFetchMock.mockReset()
        talosFetchMock.mockImplementation(async (url) => {
            if (url === '/api/talos/browser/sessions?talos_session_id=chat-a') return { data: [reconciliationSession] } as never
            if (url === `/api/talos/browser/sessions/${reconciliationSession.id}`) {
                staleReads += 1
                if (staleReads === 1) return { data: reconciliationSession } as never
                return await new Promise((resolve) => {
                    releaseStale = () => resolve({ data: { ...reconciliationSession, current_url: 'https://stale.example/late' } })
                }) as never
            }
            if (url === `/api/talos/browser/sessions/${reconciliationSession.id}/events`) return { data: [] } as never
            throw new Error(`Unexpected request: ${url}`)
        })
        const activeTalosSessionId = ref<string | null>('chat-a')
        const workspace = useTalosWorkspaceBrowse(false, ref<string | null>(null), activeTalosSessionId, async () => activeTalosSessionId.value ?? 'chat-a')

        await workspace.handleEnableBrowse()
        const requestsAfterEnable = talosFetchMock.mock.calls.length

        await workspace.recordBrowserActivities([screenshotActivity('browser-foreign')])
        expect(talosFetchMock.mock.calls.length).toBe(requestsAfterEnable)
        expect(workspace.visibleBrowserActivities.value).toEqual([])

        const superseded = workspace.recordBrowserActivities([screenshotActivity(reconciliationSession.id)])
        await vi.waitFor(() => expect(releaseStale).not.toBeNull())
        activeTalosSessionId.value = 'chat-b'
        releaseStale?.()
        await expect(superseded).resolves.toBeUndefined()

        expect(workspace.activeBrowserSession.value).toBeNull()
        expect(workspace.visibleBrowserActivities.value).toEqual([])
    })

    it('records nothing and issues no request for an ordinary chat without browser activity', async () => {
        talosFetchMock.mockReset()
        talosFetchMock.mockImplementation(async (url) => {
            if (url === '/api/talos/browser/sessions?talos_session_id=chat-a') return { data: [reconciliationSession] } as never
            if (url === `/api/talos/browser/sessions/${reconciliationSession.id}`) return { data: reconciliationSession } as never
            if (url === `/api/talos/browser/sessions/${reconciliationSession.id}/events`) return { data: [] } as never
            throw new Error(`Unexpected request: ${url}`)
        })
        const workspace = useTalosWorkspaceBrowse(false, ref<string | null>(null), ref('chat-a'), async () => 'chat-a')

        await workspace.handleEnableBrowse()
        const requestsAfterEnable = talosFetchMock.mock.calls.length

        await workspace.recordBrowserActivities(undefined)
        await workspace.recordBrowserActivities([])
        await workspace.recordBrowserActivities([{
            id: 'activity-session-start',
            operation: 'session_start',
            status: 'succeeded',
            label: 'Session started',
            run_id: null,
            browser_session_id: reconciliationSession.id,
            artifact_ids: [],
            occurred_at: '2026-07-20T10:00:01Z',
        }])

        expect(talosFetchMock.mock.calls.length).toBe(requestsAfterEnable)
        expect(workspace.visibleBrowserActivities.value.map((activity) => activity.id)).toEqual(['activity-session-start'])
    })
})

function workspaceRefFrame(session: TalosBrowserSession, ref: string) {
    return {
        schema_version: 'talos_browser_hmi_ref_targets_v2' as const,
        browser_session_id: session.id,
        state_version: session.state_version ?? 0,
        frame_sha256: `sha256:${'a'.repeat(64)}`,
        snapshot_id: `hmi_ref_${'d'.repeat(64)}`,
        screenshot: {
            id: session.last_screenshot_artifact_id ?? '',
            browser_session_id: session.id,
            type: 'screenshot',
            mime: 'image/png',
            sha256: 'a'.repeat(64),
            state_version: session.state_version,
            metadata: { width: 1280, height: 800 },
        },
        targets: [{ ref, role: 'button', name: ref === 'e1' ? 'Continue' : 'Receipt', destination: null }],
    }
}

function workspaceRefExecution(session: TalosBrowserSession) {
    return {
        interaction: { status: 'executed' as const, command_id: 'command-ref-1' },
        session,
        screenshot: {
            ...workspaceRefFrame(session, 'e2').screenshot,
            preview_url: `/api/talos/browser/artifacts/${session.last_screenshot_artifact_id}/preview`,
        },
        snapshot: {
            id: session.last_snapshot_artifact_id ?? 'snapshot-8',
            browser_session_id: session.id,
            type: 'snapshot',
            mime: 'application/json',
            sha256: 'b'.repeat(64),
            state_version: session.state_version,
            metadata: {},
        },
    }
}

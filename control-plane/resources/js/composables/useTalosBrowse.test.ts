import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TalosApiError, talosFetch } from '../lib/api'
import type { TalosBrowserArtifact, TalosBrowserSession, TalosBrowserTask } from '../lib/talosTypes'
import { useTalosBrowse } from './useTalosBrowse'

vi.mock('../lib/api', async (importOriginal) => ({
    ...await importOriginal<typeof import('../lib/api')>(),
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
        state_version: 0,
        viewport: { width: 1280, height: 800 },
        current_url: null,
        current_title: null,
        last_screenshot_artifact_id: null,
        last_snapshot_artifact_id: null,
        expires_at: null,
        created_at: '2026-07-10T12:00:00Z',
        updated_at: '2026-07-10T12:00:00Z',
    }
}

function browserTask(talosSessionId: string, status: TalosBrowserTask['status'] = 'running'): TalosBrowserTask {
    return {
        id: `task-${talosSessionId}`,
        talos_session_id: talosSessionId,
        origin_message_id: 'message-1',
        browser_session_id: `browser-${talosSessionId}`,
        goal: 'Inspect the requested page.',
        status,
        autonomy_profile: 'assist',
        budget: { actions: 12 },
        state_version: status === 'cancelled' ? 4 : 3,
        requested_at: '2026-07-16T08:00:00Z',
        started_at: '2026-07-16T08:00:01Z',
        completed_at: null,
        failed_at: null,
        cancelled_at: status === 'cancelled' ? '2026-07-16T08:00:02Z' : null,
        reconciled_at: null,
        created_at: '2026-07-16T08:00:00Z',
        updated_at: '2026-07-16T08:00:02Z',
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
        browse.browserTasks.value = [browserTask('chat-a')]

        browse.bindTalosSession('chat-b')

        expect(browse.boundTalosSessionId.value).toBe('chat-b')
        expect(browse.sessions.value).toEqual([])
        expect(browse.activeSession.value).toBeNull()
        expect(browse.events.value).toEqual([])
        expect(browse.latestScreenshot.value).toBeNull()
        expect(browse.latestSnapshot.value).toBeNull()
        expect(browse.browserTasks.value).toEqual([])
        expect(browse.activeBrowserTask.value).toBeNull()
        expect(browse.browserMode.value).toMatchObject({ enabled: false, session_id: null, status: 'disconnected' })
    })

    it('loads the latest durable task after reload and clears it on chat change', async () => {
        const running = browserTask('chat-a')
        talosFetchMock.mockResolvedValue({ data: [running] } as never)
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')

        await browse.loadBrowserTasks()

        expect(talosFetchMock).toHaveBeenCalledWith(
            '/api/talos/browser/tasks?talos_session_id=chat-a',
            { headers: { 'X-Talos-Session-Id': 'chat-a' } },
        )
        expect(browse.activeBrowserTask.value).toEqual(running)

        browse.bindTalosSession('chat-b')
        expect(browse.browserTasks.value).toEqual([])
        expect(browse.activeBrowserTask.value).toBeNull()
    })

    it('cancels the active task with its current version and a stable command id across retry', async () => {
        const running = browserTask('chat-a')
        const cancelled = browserTask('chat-a', 'cancelled')
        const cancellationBodies: Array<Record<string, unknown>> = []
        talosFetchMock.mockImplementation(async (url, options) => {
            if (url === '/api/talos/browser/tasks?talos_session_id=chat-a') return { data: [running] } as never
            if (url === `/api/talos/browser/tasks/${running.id}/cancel`) {
                cancellationBodies.push(JSON.parse(String(options?.body)) as Record<string, unknown>)
                if (cancellationBodies.length === 1) throw new TalosApiError('Connection interrupted.')
                return { data: { task: cancelled } } as never
            }
            throw new Error(`Unexpected test request: ${url}`)
        })
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')
        await browse.loadBrowserTasks()

        await expect(browse.cancelActiveBrowserTask()).rejects.toThrow('Connection interrupted.')
        await expect(browse.cancelActiveBrowserTask()).resolves.toEqual(cancelled)

        expect(cancellationBodies).toHaveLength(2)
        expect(cancellationBodies[0]).toMatchObject({
            expected_state_version: running.state_version,
            reason: 'The user stopped this Browser task.',
        })
        expect(cancellationBodies[0]?.command_id).toMatch(/^[0-9a-f-]{36}$/)
        expect(cancellationBodies[1]?.command_id).toBe(cancellationBodies[0]?.command_id)
        expect(browse.activeBrowserTask.value?.status).toBe('cancelled')
    })

    it('BREG-020 cancels the exact non-primary task selected by its card', async () => {
        const primary = browserTask('chat-a')
        const selected = {
            ...browserTask('chat-a'),
            id: 'task-chat-a-selected',
            browser_session_id: 'browser-chat-a-selected',
        }
        const cancelled = {
            ...selected,
            status: 'cancelled' as const,
            state_version: selected.state_version + 1,
            cancelled_at: '2026-07-16T08:00:03Z',
        }
        const requestedUrls: string[] = []
        talosFetchMock.mockImplementation(async (url) => {
            requestedUrls.push(url)
            if (url === '/api/talos/browser/tasks?talos_session_id=chat-a') {
                return { data: [primary, selected] } as never
            }
            if (url === `/api/talos/browser/tasks/${selected.id}/cancel`) {
                return { data: { task: cancelled } } as never
            }
            throw new Error(`Unexpected test request: ${url}`)
        })
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')
        await browse.loadBrowserTasks()

        expect(browse.activeBrowserTask.value?.id).toBe(primary.id)
        await expect(browse.cancelBrowserTask(selected.id)).resolves.toEqual(cancelled)

        expect(requestedUrls).toContain(`/api/talos/browser/tasks/${selected.id}/cancel`)
        expect(requestedUrls).not.toContain(`/api/talos/browser/tasks/${primary.id}/cancel`)
        expect(browse.browserTaskCommandTargetId.value).toBe(selected.id)
        expect(browse.browserTasks.value.find((task) => task.id === primary.id)?.status).toBe('running')
        expect(browse.browserTasks.value.find((task) => task.id === selected.id)?.status).toBe('cancelled')

        const requestCount = requestedUrls.length
        await expect(browse.cancelBrowserTask('missing-task')).resolves.toBeNull()
        await expect(browse.cancelBrowserTask(selected.id)).resolves.toBeNull()
        browse.browserTasks.value.push({
            ...primary,
            id: 'task-foreign-session',
            talos_session_id: 'chat-b',
        })
        await expect(browse.cancelBrowserTask('task-foreign-session')).resolves.toBeNull()
        expect(requestedUrls).toHaveLength(requestCount)
    })

    it('BREG-020 rejects a cancellation response projected from another same-chat task', async () => {
        const selected = browserTask('chat-a')
        const other = { ...browserTask('chat-a'), id: 'task-chat-a-other' }
        talosFetchMock.mockImplementation(async (url) => {
            if (url === '/api/talos/browser/tasks?talos_session_id=chat-a') {
                return { data: [selected, other] } as never
            }
            if (url === `/api/talos/browser/tasks/${selected.id}/cancel`) {
                return {
                    data: {
                        task: { ...other, status: 'cancelled', state_version: other.state_version + 1 },
                    },
                } as never
            }
            throw new Error(`Unexpected test request: ${url}`)
        })
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')
        await browse.loadBrowserTasks()

        await expect(browse.cancelBrowserTask(selected.id)).rejects.toThrow('another Browser task')

        expect(browse.browserTasks.value.find((task) => task.id === selected.id)?.status).toBe('running')
        expect(browse.browserTasks.value.find((task) => task.id === other.id)?.status).toBe('running')
        expect(browse.browserTaskCommandTargetId.value).toBe(selected.id)
    })

    it('refreshes after a cancellation conflict without exposing an internal code', async () => {
        const running = browserTask('chat-a')
        const cancelled = browserTask('chat-a', 'cancelled')
        let listCount = 0
        talosFetchMock.mockImplementation(async (url) => {
            if (url === '/api/talos/browser/tasks?talos_session_id=chat-a') {
                listCount += 1
                return { data: [listCount === 1 ? running : cancelled] } as never
            }
            if (url === `/api/talos/browser/tasks/${running.id}/cancel`) {
                throw new TalosApiError('TALOS_BROWSER_TASK_TRANSITION_INVALID', {
                    status: 409,
                    details: { code: 'TALOS_BROWSER_TASK_TRANSITION_INVALID' },
                })
            }
            throw new Error(`Unexpected test request: ${url}`)
        })
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')
        await browse.loadBrowserTasks()

        await expect(browse.cancelActiveBrowserTask()).resolves.toBeNull()

        expect(browse.activeBrowserTask.value?.status).toBe('cancelled')
        expect(browse.browserTaskError.value).toBe('The Browser task changed before cancellation. TALOS refreshed its current state.')
        expect(browse.browserTaskError.value).not.toContain('TALOS_BROWSER_')
    })

    it('does not claim that a cancellation conflict was refreshed when the refresh failed', async () => {
        const running = browserTask('chat-a')
        let listCount = 0
        talosFetchMock.mockImplementation(async (url) => {
            if (url === '/api/talos/browser/tasks?talos_session_id=chat-a') {
                listCount += 1
                if (listCount === 1) return { data: [running] } as never
                throw new TalosApiError('Connection unavailable.')
            }
            if (url === `/api/talos/browser/tasks/${running.id}/cancel`) {
                throw new TalosApiError('Conflict', {
                    status: 409,
                    details: { code: 'TALOS_BROWSER_TASK_VERSION_CONFLICT' },
                })
            }
            throw new Error(`Unexpected test request: ${url}`)
        })
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')
        await browse.loadBrowserTasks()

        await expect(browse.cancelActiveBrowserTask()).resolves.toBeNull()

        expect(browse.browserTaskError.value).toBe('The Browser task changed before cancellation, but TALOS could not refresh it. Check the connection and try again.')
        expect(browse.browserTaskError.value).not.toContain('TALOS_BROWSER_')
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

    it('coalesces concurrent enable requests into one browser session creation', async () => {
        const created = browserSession('chat-a')
        talosFetchMock.mockImplementation(async (url, options) => {
            if (url === '/api/talos/browser/sessions?talos_session_id=chat-a') return { data: [] } as never
            if (url === '/api/talos/browser/sessions' && options?.method === 'POST') return { data: created } as never
            if (url === `/api/talos/browser/sessions/${created.id}/events`) return { data: [] } as never
            throw new Error(`Unhandled test request: ${url}`)
        })
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')

        const [first, second] = await Promise.all([
            browse.enableBrowse(),
            browse.enableBrowse(),
        ])

        expect(first).toEqual(created)
        expect(second).toEqual(created)
        expect(talosFetchMock.mock.calls.filter(([url, options]) => (
            url === '/api/talos/browser/sessions' && options?.method === 'POST'
        ))).toHaveLength(1)
    })

    it('keeps Browse unavailable with an actionable setup fault when the worker protocol is incompatible', async () => {
        talosFetchMock.mockImplementation(async (url, options) => {
            if (url === '/api/talos/browser/sessions?talos_session_id=chat-a') return { data: [] } as never
            if (url === '/api/talos/browser/sessions' && options?.method === 'POST') {
                throw new TalosApiError('Browser worker protocol is incompatible with this TALOS control plane.', {
                    status: 502,
                    details: { code: 'TALOS_BROWSER_WORKER_PROTOCOL_MISMATCH', message: 'Browser worker protocol is incompatible with this TALOS control plane.', details: [] },
                })
            }
            throw new Error(`Unhandled test request: ${url}`)
        })
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')

        await expect(browse.enableBrowse()).rejects.toBeInstanceOf(TalosApiError)

        expect(browse.browserMode.value).toMatchObject({ enabled: false, session_id: null, status: 'disconnected' })
        expect(browse.browseSetupFault.value).toMatch(/incompatible/i)
        expect(browse.browseSetupFault.value).toMatch(/update/i)
    })

    it('classifies every handshake incompatibility code as a non-retryable setup fault', async () => {
        const codes = [
            'TALOS_BROWSER_WORKER_PROTOCOL_MISMATCH',
            'TALOS_BROWSER_WORKER_ADAPTER_MISMATCH',
            'TALOS_BROWSER_WORKER_CAPABILITY_MISMATCH',
            'TALOS_BROWSER_WORKER_AUTHENTICATION_MISMATCH',
            'TALOS_BROWSER_WORKER_HANDSHAKE_INVALID',
        ]
        for (const code of codes) {
            talosFetchMock.mockReset()
            talosFetchMock.mockImplementation(async (url, options) => {
                if (url === '/api/talos/browser/sessions?talos_session_id=chat-a') return { data: [] } as never
                if (url === '/api/talos/browser/sessions' && options?.method === 'POST') {
                    throw new TalosApiError('Browser worker is incompatible.', {
                        status: 502,
                        details: { code, message: 'Browser worker is incompatible.', details: [] },
                    })
                }
                throw new Error(`Unhandled test request: ${url}`)
            })
            const browse = useTalosBrowse()
            browse.bindTalosSession('chat-a')

            await expect(browse.enableBrowse()).rejects.toBeInstanceOf(TalosApiError)

            expect(browse.browserMode.value.enabled, code).toBe(false)
            expect(browse.browseSetupFault.value, code).not.toBeNull()
        }
    })

    it('keeps the retryable failed state without a setup fault when the worker is temporarily unavailable', async () => {
        talosFetchMock.mockImplementation(async (url, options) => {
            if (url === '/api/talos/browser/sessions?talos_session_id=chat-a') return { data: [] } as never
            if (url === '/api/talos/browser/sessions' && options?.method === 'POST') {
                throw new TalosApiError('Browser worker is temporarily unavailable.', {
                    status: 503,
                    details: { code: 'TALOS_BROWSER_WORKER_UNAVAILABLE', message: 'Browser worker is temporarily unavailable.', details: [] },
                })
            }
            throw new Error(`Unhandled test request: ${url}`)
        })
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')

        await expect(browse.enableBrowse()).rejects.toBeInstanceOf(TalosApiError)

        expect(browse.browserMode.value).toMatchObject({ enabled: true, status: 'failed' })
        expect(browse.browseSetupFault.value).toBeNull()
    })

    it('clears a prior setup fault when Browse is enabled again after the worker is fixed', async () => {
        let attempt = 0
        const created = browserSession('chat-a')
        talosFetchMock.mockImplementation(async (url, options) => {
            if (url === '/api/talos/browser/sessions?talos_session_id=chat-a') return { data: [] } as never
            if (url === '/api/talos/browser/sessions' && options?.method === 'POST') {
                attempt += 1
                if (attempt === 1) {
                    throw new TalosApiError('Browser worker protocol is incompatible with this TALOS control plane.', {
                        status: 502,
                        details: { code: 'TALOS_BROWSER_WORKER_PROTOCOL_MISMATCH', message: 'incompatible', details: [] },
                    })
                }
                return { data: created } as never
            }
            if (url === `/api/talos/browser/sessions/${created.id}/events`) return { data: [] } as never
            throw new Error(`Unhandled test request: ${url}`)
        })
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')

        await expect(browse.enableBrowse()).rejects.toBeInstanceOf(TalosApiError)
        expect(browse.browseSetupFault.value).not.toBeNull()

        await browse.enableBrowse()

        expect(browse.browserMode.value).toMatchObject({ enabled: true, status: 'ready' })
        expect(browse.browseSetupFault.value).toBeNull()
    })

    it('does not re-enable Browse when a pending session creation resolves after the user disables it', async () => {
        const created = browserSession('chat-a')
        let resolveCreate: ((value: { data: TalosBrowserSession }) => void) | null = null
        talosFetchMock.mockImplementation(async (url, options) => {
            if (url === '/api/talos/browser/sessions?talos_session_id=chat-a') return { data: [] } as never
            if (url === '/api/talos/browser/sessions' && options?.method === 'POST') {
                return await new Promise<{ data: TalosBrowserSession }>((resolve) => {
                    resolveCreate = resolve
                }) as never
            }
            if (url === `/api/talos/browser/sessions/${created.id}/events`) return { data: [] } as never
            throw new Error(`Unhandled test request: ${url}`)
        })
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')

        const enabling = browse.enableBrowse()
        await vi.waitFor(() => expect(resolveCreate).not.toBeNull())
        browse.disableBrowse()
        resolveCreate?.({ data: created })

        await expect(enabling).resolves.toBeNull()
        expect(browse.activeSession.value).toBeNull()
        expect(browse.browserMode.value).toMatchObject({
            enabled: false,
            session_id: null,
            status: 'disconnected',
        })
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

    it('restores a persisted recovery-required browser state after reload', async () => {
        const recovering = { ...browserSession('chat-a'), status: 'recovery_required' }
        talosFetchMock.mockImplementation(async (url, options) => {
            if (url === '/api/talos/browser/sessions?talos_session_id=chat-a') return { data: [recovering] } as never
            if (url === `/api/talos/browser/sessions/${recovering.id}`) return { data: recovering } as never
            if (url === `/api/talos/browser/sessions/${recovering.id}/events`) return { data: [] } as never
            if (url === '/api/talos/browser/sessions' && options?.method === 'POST') throw new Error('Recovery state must not be bypassed by creating a new browser session.')
            throw new Error(`Unexpected test request: ${url}`)
        })
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')

        await browse.enableBrowse()

        expect(browse.browserMode.value).toMatchObject({
            enabled: true,
            session_id: recovering.id,
            status: 'recovery_required',
        })
        expect(talosFetchMock.mock.calls.some(([url, options]) => url === '/api/talos/browser/sessions' && options?.method === 'POST')).toBe(false)
    })

    it('replaces a persisted session that reconciliation marks failed after a worker restart', async () => {
        const stale = browserSession('chat-a')
        const invalidated = { ...stale, status: 'failed' }
        const replacement = {
            ...browserSession('chat-a'),
            id: 'browser-chat-a-replacement',
            capabilities: ['navigate', 'screenshot', 'snapshot', 'interact'],
        }
        talosFetchMock.mockImplementation(async (url, options) => {
            if (url === '/api/talos/browser/sessions?talos_session_id=chat-a') return { data: [stale] } as never
            if (url === `/api/talos/browser/sessions/${stale.id}`) return { data: invalidated } as never
            if (url === `/api/talos/browser/sessions/${stale.id}/events`) return { data: [] } as never
            if (url === '/api/talos/browser/sessions' && options?.method === 'POST') return { data: replacement } as never
            if (url === `/api/talos/browser/sessions/${replacement.id}/events`) return { data: [] } as never
            throw new Error(`Unexpected test request: ${url}`)
        })
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')

        await browse.enableBrowse()

        expect(browse.activeSession.value).toEqual(replacement)
        expect(browse.browserMode.value).toMatchObject({
            enabled: true,
            session_id: replacement.id,
            status: 'ready',
            capabilities: ['navigate', 'screenshot', 'snapshot', 'interact'],
        })
        expect(talosFetchMock.mock.calls.filter(([url, options]) => (
            url === '/api/talos/browser/sessions' && options?.method === 'POST'
        ))).toHaveLength(1)
    })

    it('never fetches raw snapshot preview when the server-side development gate is false', async () => {
        const active = {
            ...browserSession('chat-a'),
            last_screenshot_artifact_id: 'screen-1',
            last_snapshot_artifact_id: 'snapshot-1',
        }
        talosFetchMock.mockImplementation(async (url) => {
            if (url === `/api/talos/browser/sessions/${active.id}`) return { data: active } as never
            if (url === `/api/talos/browser/sessions/${active.id}/events`) return { data: [] } as never
            throw new Error(`Raw evidence fetch escaped the gate: ${url}`)
        })
        const browse = useTalosBrowse({ devBrowserEvidence: false })
        browse.bindTalosSession('chat-a')

        await browse.selectSession(active.id)

        expect(browse.latestScreenshot.value).toContain('/api/talos/browser/artifacts/screen-1/preview')
        expect(browse.latestSnapshot.value).toBeNull()
        expect(talosFetchMock.mock.calls.some(([url]) => String(url).includes('snapshot-1'))).toBe(false)
    })

    it('rebuilds screenshot evidence from persisted HMI events after a reload', async () => {
        const active = {
            ...browserSession('chat-a'),
            status: 'active',
            state_version: 8,
            capabilities: ['screenshot', 'interact'],
            last_screenshot_artifact_id: 'screen-8',
        }
        talosFetchMock.mockImplementation(async (url) => {
            if (url === `/api/talos/browser/sessions/${active.id}`) return { data: active } as never
            if (url === `/api/talos/browser/sessions/${active.id}/events`) return { data: [{
                id: 'event-hmi-8',
                type: 'hmi.evidence.persisted',
                actor: 'system',
                created_at: '2026-07-13T12:00:00Z',
                payload: {
                    operation: 'screenshot',
                    screenshot_artifact_id: 'screen-8',
                    snapshot_artifact_id: 'snapshot-8',
                    artifact_ids: ['screen-8', 'snapshot-8'],
                },
            }] } as never
            throw new Error(`Unexpected test request: ${url}`)
        })
        const browse = useTalosBrowse({ devBrowserEvidence: false })
        browse.bindTalosSession('chat-a')

        await browse.selectSession(active.id)

        expect(browse.browserActivities.value).toEqual([
            expect.objectContaining({
                operation: 'screenshot',
                artifact_ids: ['screen-8'],
                browser_session_id: active.id,
            }),
        ])
    })

    it('executes one pointer request and refreshes the persisted browser frame', async () => {
        const active = {
            ...browserSession('chat-a'),
            status: 'active',
            state_version: 7,
            capabilities: ['navigate', 'screenshot', 'snapshot', 'interact'],
            last_screenshot_artifact_id: 'screen-7',
        }
        const updated = { ...active, state_version: 8, last_screenshot_artifact_id: 'screen-8' }
        talosFetchMock.mockImplementation(async (url, options) => {
            if (url === `/api/talos/browser/sessions/${active.id}/interactions/pointer` && options?.method === 'POST') {
                return { data: interactionPayload(updated) } as never
            }
            if (url === `/api/talos/browser/sessions/${active.id}/events`) return { data: [] } as never
            throw new Error(`Unexpected test request: ${url}`)
        })
        const browse = useTalosBrowse({ devBrowserEvidence: false })
        browse.bindTalosSession('chat-a')
        browse.activeSession.value = active
        browse.sessions.value = [active]

        const result = await browse.interactWithScreenshot(pointerFrame(active))

        expect(result).toMatchObject({ status: 'executed', screenshot: { id: 'screen-8' } })
        expect(browse.activeSession.value).toMatchObject({ state_version: 8, last_screenshot_artifact_id: 'screen-8' })
        expect(browse.latestScreenshot.value).toContain('/api/talos/browser/artifacts/screen-8/preview')
        expect(browse.browserActivities.value).toEqual(expect.arrayContaining([
            expect.objectContaining({
                operation: 'screenshot',
                status: 'succeeded',
                artifact_ids: ['screen-8'],
                browser_session_id: active.id,
            }),
        ]))
        const pointerCalls = talosFetchMock.mock.calls.filter(([url]) => String(url).includes('/interactions/pointer'))
        expect(pointerCalls).toHaveLength(1)
        const pointerBody = JSON.parse(String(pointerCalls[0]?.[1]?.body)) as Record<string, unknown>
        expect(pointerBody).toMatchObject({
            schema_version: 'talos_browser_hmi_pointer_v2',
            interaction_id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
        })
    })

    it('returns a typed confirmation challenge and executes it only through the confirm endpoint', async () => {
        const active = {
            ...browserSession('chat-a'),
            status: 'active',
            state_version: 7,
            capabilities: ['interact'],
            last_screenshot_artifact_id: 'screen-7',
        }
        const updated = { ...active, state_version: 8, last_screenshot_artifact_id: 'screen-8' }
        const challenge = {
            approval_id: 'approval-1',
            request_hash: `sha256:${'c'.repeat(64)}`,
            expires_at: '2026-07-13T21:00:00Z',
            action: { category: 'sensitive', label: 'Buy now', origin: 'https://example.com', consequence: 'May submit a purchase.' },
        }
        talosFetchMock.mockImplementation(async (url, options) => {
            if (String(url).endsWith('/interactions/pointer')) {
                throw new TalosApiError('Confirm this browser action.', {
                    status: 428,
                    details: { code: 'TALOS_BROWSER_HMI_CONFIRMATION_REQUIRED', details: challenge },
                })
            }
            if (url === '/api/talos/browser/interactions/approval-1/confirm' && options?.method === 'POST') {
                return { data: interactionPayload(updated, 'approval-1') } as never
            }
            if (url === `/api/talos/browser/sessions/${active.id}/events`) return { data: [] } as never
            throw new Error(`Unexpected test request: ${url}`)
        })
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')
        browse.activeSession.value = active
        browse.sessions.value = [active]

        const requested = await browse.interactWithScreenshot(pointerFrame(active))
        expect(requested).toEqual({ status: 'confirmation_required', challenge })
        expect(browse.pendingInteractionApproval.value).toEqual(challenge)
        expect(browse.browserMode.value.status).toBe('awaiting_approval')

        const confirmed = await browse.confirmScreenshotInteraction('approve')
        expect(confirmed).toMatchObject({ status: 'executed', approval_id: 'approval-1' })
        expect(browse.pendingInteractionApproval.value).toBeNull()
        expect(talosFetchMock).toHaveBeenCalledWith('/api/talos/browser/interactions/approval-1/confirm', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ decision: 'approve', request_hash: challenge.request_hash }),
        }))
    })

    it('does not replay a stale pointer and blocks a duplicate while one request is pending', async () => {
        const active = {
            ...browserSession('chat-a'),
            status: 'active',
            state_version: 7,
            capabilities: ['interact'],
            last_screenshot_artifact_id: 'screen-7',
        }
        let rejectPointer: ((error: Error) => void) | null = null
        talosFetchMock.mockImplementation(async (url) => {
            if (String(url).endsWith('/interactions/pointer')) {
                return await new Promise((_, reject) => { rejectPointer = reject }) as never
            }
            if (url === `/api/talos/browser/sessions/${active.id}`) return { data: active } as never
            if (url === `/api/talos/browser/sessions/${active.id}/events`) return { data: [] } as never
            throw new Error(`Unexpected test request: ${url}`)
        })
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')
        browse.activeSession.value = active
        browse.sessions.value = [active]

        const first = browse.interactWithScreenshot(pointerFrame(active))
        await vi.waitFor(() => expect(browse.interactionPending.value).toBe(true))
        await expect(browse.interactWithScreenshot(pointerFrame(active))).rejects.toThrow('already in progress')
        rejectPointer?.(new TalosApiError('Stale frame', {
            status: 409,
            details: { code: 'TALOS_BROWSER_FRAME_STALE', details: {} },
        }))

        await expect(first).resolves.toEqual({ status: 'stale' })
        expect(browse.interactionPending.value).toBe(false)
        expect(talosFetchMock.mock.calls.filter(([url]) => String(url).includes('/interactions/pointer'))).toHaveLength(1)
    })

    it('BREG-022 captures and promotes a fresh physical frame after stale HMI rejection without replaying the pointer', async () => {
        const active = {
            ...browserSession('chat-a'),
            status: 'active',
            state_version: 7,
            capabilities: ['interact', 'screenshot'],
            last_screenshot_artifact_id: 'screen-7',
        }
        const updated = { ...active, last_screenshot_artifact_id: 'screen-8' }
        let captured = false
        talosFetchMock.mockImplementation(async (url, options) => {
            if (String(url).endsWith('/interactions/pointer') && options?.method === 'POST') {
                throw new TalosApiError('Stale frame', {
                    status: 409,
                    details: { code: 'TALOS_BROWSER_FRAME_STALE', details: {} },
                })
            }
            if (String(url).endsWith('/screenshot') && options?.method === 'POST') {
                captured = true
                return {
                    data: {
                        id: 'screen-8',
                        browser_session_id: active.id,
                        type: 'screenshot',
                        mime: 'image/png',
                        sha256: 'b'.repeat(64),
                        state_version: 7,
                        metadata: { width: 1280, height: 800 },
                    },
                } as never
            }
            if (url === `/api/talos/browser/sessions/${active.id}`) {
                return { data: captured ? updated : active } as never
            }
            if (url === `/api/talos/browser/sessions/${active.id}/events`) {
                return { data: captured ? [{
                    id: 'event-screen-8',
                    type: 'screenshot.captured',
                    actor: 'worker',
                    created_at: '2026-07-18T16:30:00Z',
                    payload: {
                        operation: 'screenshot',
                        artifact_id: 'screen-8',
                        artifact_ids: ['screen-8'],
                        state_version: 7,
                    },
                }] : [] } as never
            }
            throw new Error(`Unexpected test request: ${url}`)
        })
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')
        browse.activeSession.value = active
        browse.sessions.value = [active]

        await expect(browse.interactWithScreenshot(pointerFrame(active))).resolves.toEqual({ status: 'stale' })

        expect(captured).toBe(true)
        expect(browse.activeSession.value).toMatchObject({ last_screenshot_artifact_id: 'screen-8' })
        expect(browse.latestScreenshot.value).toContain('/api/talos/browser/artifacts/screen-8/preview')
        expect(browse.interactionError.value).toBe('The page changed before the action. Review the refreshed frame and try again.')
        expect(talosFetchMock.mock.calls.filter(([url]) => String(url).includes('/interactions/pointer'))).toHaveLength(1)
        expect(talosFetchMock.mock.calls.filter(([url, options]) => String(url).endsWith('/screenshot') && options?.method === 'POST')).toHaveLength(1)
    })

    it('surfaces an actionable error when stale-frame refresh also fails', async () => {
        const active = {
            ...browserSession('chat-a'),
            status: 'active',
            state_version: 7,
            capabilities: ['interact'],
            last_screenshot_artifact_id: 'screen-7',
        }
        talosFetchMock.mockImplementation(async (url) => {
            if (String(url).endsWith('/interactions/pointer')) {
                throw new TalosApiError('Stale frame', {
                    status: 409,
                    details: { code: 'TALOS_BROWSER_FRAME_STALE', details: {} },
                })
            }
            if (String(url).endsWith('/screenshot')) {
                throw new TalosApiError('Current frame capture unavailable.', { status: 503 })
            }
            throw new Error(`Unexpected test request: ${url}`)
        })
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')
        browse.activeSession.value = active
        browse.sessions.value = [active]

        await expect(browse.interactWithScreenshot(pointerFrame(active))).resolves.toEqual({ status: 'stale' })
        expect(browse.interactionError.value).toContain('Frame changed')
        expect(browse.interactionError.value).toContain('Current frame capture unavailable')
        expect(browse.activeSession.value?.last_screenshot_artifact_id).toBe('screen-7')
    })

    it('exposes recovery_required as an explicit browser mode state', async () => {
        const active = {
            ...browserSession('chat-a'),
            status: 'active',
            state_version: 7,
            capabilities: ['interact'],
            last_screenshot_artifact_id: 'screen-7',
        }
        talosFetchMock.mockRejectedValue(new TalosApiError('Browser recovery is required.', {
            status: 503,
            details: { code: 'TALOS_BROWSER_HMI_RECOVERY_REQUIRED', details: {} },
        }))
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')
        browse.activeSession.value = active
        browse.sessions.value = [active]

        await expect(browse.interactWithScreenshot(pointerFrame(active))).resolves.toEqual({ status: 'recovery_required' })
        expect(browse.browserMode.value.status).toBe('recovery_required')
        expect(browse.interactionError.value).toBe('Browser recovery is required.')
    })
})

function pointerFrame(session: TalosBrowserSession) {
    return {
        browserSessionId: session.id,
        artifact: {
            id: session.last_screenshot_artifact_id ?? 'screen-7',
            browser_session_id: session.id,
            type: 'screenshot',
            mime: 'image/png',
            sha256: 'a'.repeat(64),
            state_version: session.state_version ?? 7,
            metadata: { width: 1280, height: 800 },
        } satisfies TalosBrowserArtifact,
        normalizedX: 0.25,
        normalizedY: 0.5,
        clickCount: 1 as const,
    }
}

function interactionPayload(session: TalosBrowserSession, approvalId: string | null = null) {
    return {
        interaction: {
            status: 'executed' as const,
            command_id: 'command-1',
            ...(approvalId ? { approval_id: approvalId } : {}),
        },
        session,
        screenshot: {
            id: session.last_screenshot_artifact_id ?? 'screen-8',
            browser_session_id: session.id,
            type: 'screenshot',
            mime: 'image/png',
            sha256: 'b'.repeat(64),
            state_version: session.state_version,
            metadata: { width: 1280, height: 800 },
            preview_url: `/api/talos/browser/artifacts/${session.last_screenshot_artifact_id}/preview`,
        },
        snapshot: {
            id: 'snapshot-8',
            browser_session_id: session.id,
            type: 'snapshot',
            mime: 'application/json',
            sha256: 'c'.repeat(64),
            state_version: session.state_version,
            metadata: {},
        },
    }
}

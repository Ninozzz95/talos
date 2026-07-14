import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TalosApiError, talosFetch } from '../lib/api'
import type { TalosBrowserArtifact, TalosBrowserSession } from '../lib/talosTypes'
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
            if (url === `/api/talos/browser/sessions/${active.id}`) {
                throw new TalosApiError('Browser refresh unavailable.', { status: 503 })
            }
            throw new Error(`Unexpected test request: ${url}`)
        })
        const browse = useTalosBrowse()
        browse.bindTalosSession('chat-a')
        browse.activeSession.value = active
        browse.sessions.value = [active]

        await expect(browse.interactWithScreenshot(pointerFrame(active))).resolves.toEqual({ status: 'stale' })
        expect(browse.interactionError.value).toContain('Frame changed')
        expect(browse.interactionError.value).toContain('Browser refresh unavailable')
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

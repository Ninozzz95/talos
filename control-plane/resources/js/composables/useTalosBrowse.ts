import { computed, ref } from 'vue'
import { talosFetch } from '../lib/api'
import type {
    TalosBrowserActivity,
    TalosBrowserArtifact,
    TalosBrowserEvent,
    TalosBrowserMode,
    TalosBrowserSession,
    TalosBrowserSnapshotPreview,
} from '../lib/talosTypes'

type ApiEnvelope<T> = { data: T }

function idPath(id: string) {
    return encodeURIComponent(id)
}

function scopedHeaders(talosSessionId: string) {
    return { 'X-Talos-Session-Id': talosSessionId }
}

function artifactPreviewUrl(artifactId: string, talosSessionId: string) {
    const query = new URLSearchParams({ talos_session_id: talosSessionId }).toString()
    return `/api/talos/browser/artifacts/${idPath(artifactId)}/preview?${query}`
}

export function useTalosBrowse() {
    const boundTalosSessionId = ref<string | null>(null)
    const sessions = ref<TalosBrowserSession[]>([])
    const activeSession = ref<TalosBrowserSession | null>(null)
    const events = ref<TalosBrowserEvent[]>([])
    const latestScreenshot = ref<string | null>(null)
    const latestSnapshot = ref<TalosBrowserSnapshotPreview | null>(null)
    const browserMode = ref<TalosBrowserMode>({
        enabled: false,
        session_id: null,
        status: 'disconnected',
        capabilities: [],
    })
    const loadingCollection = ref(false)
    const loadingSession = ref(false)
    const mutating = ref(false)
    const collectionError = ref<string | null>(null)
    const sessionError = ref<string | null>(null)
    const mutationError = ref<string | null>(null)
    let scopeRevision = 0

    function setMutationError(error: unknown, fallback: string) {
        mutationError.value = error instanceof Error ? error.message : fallback
    }

    function sessionStatus(session: TalosBrowserSession | null): TalosBrowserMode['status'] {
        if (!session) return 'disconnected'
        if (session.status === 'active') return 'active'
        if (session.status === 'ready') return 'ready'
        if (session.status === 'closed') return 'stopped'
        if (['expired', 'failed'].includes(session.status)) return 'failed'
        return 'starting'
    }

    function setBrowserMode(enabled: boolean, session: TalosBrowserSession | null = activeSession.value) {
        browserMode.value = {
            enabled,
            session_id: enabled ? session?.id ?? null : null,
            status: enabled ? sessionStatus(session) : 'disconnected',
            capabilities: enabled ? [...(session?.capabilities ?? [])] : [],
        }
    }

    function resetScopedState() {
        sessions.value = []
        activeSession.value = null
        events.value = []
        latestScreenshot.value = null
        latestSnapshot.value = null
        collectionError.value = null
        sessionError.value = null
        mutationError.value = null
        loadingCollection.value = false
        loadingSession.value = false
        mutating.value = false
        setBrowserMode(false, null)
    }

    function bindTalosSession(talosSessionId: string | null) {
        const normalizedId = talosSessionId?.trim() || null
        if (boundTalosSessionId.value === normalizedId) return

        scopeRevision += 1
        boundTalosSessionId.value = normalizedId
        resetScopedState()
    }

    function requiredTalosSessionId() {
        if (!boundTalosSessionId.value) {
            throw new Error('Start or select a chat before enabling Browse.')
        }

        return boundTalosSessionId.value
    }

    function scopeIsCurrent(talosSessionId: string, revision: number) {
        return boundTalosSessionId.value === talosSessionId && scopeRevision === revision
    }

    function assertScopedSession(session: TalosBrowserSession, talosSessionId: string) {
        if (session.talos_session_id !== talosSessionId) {
            throw new Error('TALOS rejected browser state from another chat session.')
        }
    }

    async function loadEvents(session: TalosBrowserSession, revision: number) {
        const response = await talosFetch<ApiEnvelope<TalosBrowserEvent[]>>(`/api/talos/browser/sessions/${idPath(session.id)}/events`, { headers: scopedHeaders(session.talos_session_id ?? '') })
        if (scopeIsCurrent(session.talos_session_id ?? '', revision)) events.value = response.data
    }

    async function loadPreview(session: TalosBrowserSession, revision: number) {
        const screenshot = session.last_screenshot_artifact_id
            ? artifactPreviewUrl(session.last_screenshot_artifact_id, session.talos_session_id ?? '')
            : null
        const snapshot = session.last_snapshot_artifact_id
            ? (await talosFetch<ApiEnvelope<TalosBrowserSnapshotPreview>>(artifactPreviewUrl(session.last_snapshot_artifact_id, session.talos_session_id ?? ''), { headers: scopedHeaders(session.talos_session_id ?? '') })).data
            : null

        if (!scopeIsCurrent(session.talos_session_id ?? '', revision)) return
        latestScreenshot.value = screenshot
        latestSnapshot.value = snapshot
    }

    async function selectSession(id: string) {
        const talosSessionId = requiredTalosSessionId()
        const revision = scopeRevision
        loadingSession.value = true
        sessionError.value = null
        try {
            const response = await talosFetch<ApiEnvelope<TalosBrowserSession>>(`/api/talos/browser/sessions/${idPath(id)}`, { headers: scopedHeaders(talosSessionId) })
            assertScopedSession(response.data, talosSessionId)
            if (!scopeIsCurrent(talosSessionId, revision)) return null
            activeSession.value = response.data
            sessions.value = [response.data, ...sessions.value.filter((session) => session.id !== response.data.id)]
            await Promise.all([loadEvents(response.data, revision), loadPreview(response.data, revision)])
            if (browserMode.value.enabled) setBrowserMode(true, response.data)
            return response.data
        } catch (error) {
            if (scopeIsCurrent(talosSessionId, revision)) {
                sessionError.value = error instanceof Error ? error.message : 'TALOS could not load the browser session.'
            }
            throw error
        } finally {
            if (scopeIsCurrent(talosSessionId, revision)) loadingSession.value = false
        }
    }

    async function loadSessions() {
        const talosSessionId = requiredTalosSessionId()
        const revision = scopeRevision
        loadingCollection.value = true
        collectionError.value = null
        try {
            const query = new URLSearchParams({ talos_session_id: talosSessionId }).toString()
            const response = await talosFetch<ApiEnvelope<TalosBrowserSession[]>>(`/api/talos/browser/sessions?${query}`, { headers: scopedHeaders(talosSessionId) })
            response.data.forEach((session) => assertScopedSession(session, talosSessionId))
            if (!scopeIsCurrent(talosSessionId, revision)) return []
            sessions.value = response.data
            if (activeSession.value && response.data.some((session) => session.id === activeSession.value?.id)) {
                await selectSession(activeSession.value.id)
            }
            return response.data
        } catch (error) {
            if (scopeIsCurrent(talosSessionId, revision)) {
                collectionError.value = error instanceof Error ? error.message : 'TALOS could not load browser sessions.'
            }
            throw error
        } finally {
            if (scopeIsCurrent(talosSessionId, revision)) loadingCollection.value = false
        }
    }

    async function refreshActive(session: TalosBrowserSession, talosSessionId: string, revision: number) {
        assertScopedSession(session, talosSessionId)
        if (!scopeIsCurrent(talosSessionId, revision)) return
        activeSession.value = session
        sessions.value = [session, ...sessions.value.filter((item) => item.id !== session.id)]
        await Promise.all([loadEvents(session, revision), loadPreview(session, revision)])
        if (browserMode.value.enabled) setBrowserMode(true, session)
    }

    async function createSession() {
        const talosSessionId = requiredTalosSessionId()
        const revision = scopeRevision
        mutating.value = true
        mutationError.value = null
        browserMode.value = { ...browserMode.value, enabled: true, status: 'starting' }
        try {
            const response = await talosFetch<ApiEnvelope<TalosBrowserSession>>('/api/talos/browser/sessions', {
                method: 'POST',
                body: JSON.stringify({ talos_session_id: talosSessionId }),
                headers: scopedHeaders(talosSessionId),
            })
            assertScopedSession(response.data, talosSessionId)
            if (!scopeIsCurrent(talosSessionId, revision)) return response.data
            await refreshActive(response.data, talosSessionId, revision)
            setBrowserMode(true, response.data)
            return response.data
        } catch (error) {
            if (scopeIsCurrent(talosSessionId, revision)) {
                setMutationError(error, 'TALOS could not start a browser session.')
                browserMode.value = { ...browserMode.value, enabled: true, status: 'failed' }
            }
            throw error
        } finally {
            if (scopeIsCurrent(talosSessionId, revision)) mutating.value = false
        }
    }

    async function enableBrowse() {
        const talosSessionId = requiredTalosSessionId()
        const revision = scopeRevision
        browserMode.value = { ...browserMode.value, enabled: true, status: 'starting' }
        if (sessions.value.length === 0) await loadSessions()
        if (!scopeIsCurrent(talosSessionId, revision)) return null
        const existing = activeSession.value ?? sessions.value.find((session) => ['ready', 'active'].includes(session.status)) ?? null
        if (existing && ['ready', 'active'].includes(existing.status)) {
            const selected = activeSession.value ?? await selectSession(existing.id)
            if (selected) setBrowserMode(true, selected)
            return selected
        }

        return createSession()
    }

    function disableBrowse() {
        setBrowserMode(false)
    }

    async function restartSession() {
        const talosSessionId = requiredTalosSessionId()
        const revision = scopeRevision
        if (activeSession.value && !['closed', 'expired'].includes(activeSession.value.status)) {
            await closeSession()
        }
        if (!scopeIsCurrent(talosSessionId, revision)) return null
        activeSession.value = null
        return createSession()
    }

    async function navigate(url: string) {
        const session = activeSession.value
        if (!session) return
        const talosSessionId = requiredTalosSessionId()
        const revision = scopeRevision
        mutating.value = true
        mutationError.value = null
        try {
            const response = await talosFetch<ApiEnvelope<TalosBrowserSession>>(`/api/talos/browser/sessions/${idPath(session.id)}/navigate`, { method: 'POST', body: JSON.stringify({ url }), headers: scopedHeaders(talosSessionId) })
            await refreshActive(response.data, talosSessionId, revision)
        } catch (error) {
            if (scopeIsCurrent(talosSessionId, revision)) setMutationError(error, 'TALOS could not navigate this browser session.')
            throw error
        } finally {
            if (scopeIsCurrent(talosSessionId, revision)) mutating.value = false
        }
    }

    async function captureScreenshot() {
        const session = activeSession.value
        if (!session) return
        const talosSessionId = requiredTalosSessionId()
        const revision = scopeRevision
        mutating.value = true
        mutationError.value = null
        try {
            const response = await talosFetch<ApiEnvelope<TalosBrowserArtifact>>(`/api/talos/browser/sessions/${idPath(session.id)}/screenshot`, { method: 'POST', body: JSON.stringify({}), headers: scopedHeaders(talosSessionId) })
            if (scopeIsCurrent(talosSessionId, revision)) latestScreenshot.value = artifactPreviewUrl(response.data.id, talosSessionId)
            await selectSession(session.id)
        } catch (error) {
            if (scopeIsCurrent(talosSessionId, revision)) setMutationError(error, 'TALOS could not capture a screenshot.')
            throw error
        } finally {
            if (scopeIsCurrent(talosSessionId, revision)) mutating.value = false
        }
    }

    async function captureSnapshot() {
        const session = activeSession.value
        if (!session) return
        const talosSessionId = requiredTalosSessionId()
        const revision = scopeRevision
        mutating.value = true
        mutationError.value = null
        try {
            const response = await talosFetch<ApiEnvelope<TalosBrowserArtifact>>(`/api/talos/browser/sessions/${idPath(session.id)}/snapshot`, { method: 'POST', body: JSON.stringify({}), headers: scopedHeaders(talosSessionId) })
            const preview = await talosFetch<ApiEnvelope<TalosBrowserSnapshotPreview>>(artifactPreviewUrl(response.data.id, talosSessionId), { headers: scopedHeaders(talosSessionId) })
            if (scopeIsCurrent(talosSessionId, revision)) latestSnapshot.value = preview.data
            await selectSession(session.id)
        } catch (error) {
            if (scopeIsCurrent(talosSessionId, revision)) setMutationError(error, 'TALOS could not capture a page structure snapshot.')
            throw error
        } finally {
            if (scopeIsCurrent(talosSessionId, revision)) mutating.value = false
        }
    }

    async function closeSession() {
        const session = activeSession.value
        if (!session) return
        const talosSessionId = requiredTalosSessionId()
        const revision = scopeRevision
        mutating.value = true
        mutationError.value = null
        try {
            const response = await talosFetch<ApiEnvelope<TalosBrowserSession>>(`/api/talos/browser/sessions/${idPath(session.id)}`, { method: 'DELETE', headers: scopedHeaders(talosSessionId) })
            await refreshActive(response.data, talosSessionId, revision)
            if (scopeIsCurrent(talosSessionId, revision)) setBrowserMode(true, response.data)
        } catch (error) {
            if (scopeIsCurrent(talosSessionId, revision)) setMutationError(error, 'TALOS could not close this browser session.')
            throw error
        } finally {
            if (scopeIsCurrent(talosSessionId, revision)) mutating.value = false
        }
    }

    const browserActivities = computed<TalosBrowserActivity[]>(() => events.value.map((event) => {
        const type = event.type ?? event.event_type ?? 'browser.event'
        const payload = event.payload ?? {}
        const persistedOperation = typeof payload.operation === 'string'
            && ['navigate', 'snapshot', 'screenshot', 'read'].includes(payload.operation)
            ? payload.operation
            : null
        const operation = persistedOperation ?? (type.includes('screenshot') ? 'screenshot'
            : type.includes('snapshot') ? 'snapshot'
                : type.includes('navigat') ? 'navigate'
                    : type.includes('read') ? 'read'
                        : 'session_start')
        const status = type.includes('failed') || event.severity === 'error' ? 'failed' : type.includes('denied') ? 'denied' : 'succeeded'
        const artifactIds = typeof payload.artifact_id === 'string' ? [payload.artifact_id] : []

        return {
            id: event.id,
            operation,
            status,
            label: type.replaceAll('.', ' '),
            run_id: typeof payload.run_id === 'string' ? payload.run_id : null,
            browser_session_id: activeSession.value?.id ?? browserMode.value.session_id ?? '',
            artifact_ids: artifactIds,
            occurred_at: event.created_at,
        }
    }))

    return {
        boundTalosSessionId,
        sessions,
        activeSession,
        events,
        browserMode,
        browserActivities,
        latestScreenshot,
        latestSnapshot,
        loadingCollection,
        loadingSession,
        mutating,
        collectionError,
        sessionError,
        mutationError,
        bindTalosSession,
        loadSessions,
        selectSession,
        createSession,
        enableBrowse,
        disableBrowse,
        restartSession,
        navigate,
        captureScreenshot,
        captureSnapshot,
        closeSession,
    }
}

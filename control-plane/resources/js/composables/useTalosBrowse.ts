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

function idPath(id: string) {
    return encodeURIComponent(id)
}

function setMutationError(error: unknown, fallback: string) {
    mutationError.value = error instanceof Error ? error.message : fallback
}

function sessionStatus(session: TalosBrowserSession | null): TalosBrowserMode['status'] {
    if (!session) return 'disconnected'
    if (session.status === 'active') return 'active'
    if (session.status === 'ready') return 'ready'
    if (['closed', 'expired', 'failed'].includes(session.status)) return 'failed'
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

async function loadEvents(id: string) {
    const response = await talosFetch<ApiEnvelope<TalosBrowserEvent[]>>(`/api/talos/browser/sessions/${idPath(id)}/events`)
    events.value = response.data
}

async function loadPreview(session: TalosBrowserSession) {
    const screenshot = session.last_screenshot_artifact_id
        ? `/api/talos/browser/artifacts/${idPath(session.last_screenshot_artifact_id)}/preview`
        : null
    const snapshot = session.last_snapshot_artifact_id
        ? (await talosFetch<ApiEnvelope<TalosBrowserSnapshotPreview>>(`/api/talos/browser/artifacts/${idPath(session.last_snapshot_artifact_id)}/preview`)).data
        : null

    latestScreenshot.value = screenshot
    latestSnapshot.value = snapshot
}

async function selectSession(id: string) {
    loadingSession.value = true
    sessionError.value = null
    try {
        const response = await talosFetch<ApiEnvelope<TalosBrowserSession>>(`/api/talos/browser/sessions/${idPath(id)}`)
        activeSession.value = response.data
        sessions.value = [response.data, ...sessions.value.filter((session) => session.id !== response.data.id)]
        await Promise.all([loadEvents(response.data.id), loadPreview(response.data)])
        if (browserMode.value.enabled) setBrowserMode(true, response.data)
        return response.data
    } catch (error) {
        sessionError.value = error instanceof Error ? error.message : 'TALOS could not load the browser session.'
        throw error
    } finally {
        loadingSession.value = false
    }
}

async function loadSessions() {
    loadingCollection.value = true
    collectionError.value = null
    try {
        const response = await talosFetch<ApiEnvelope<TalosBrowserSession[]>>('/api/talos/browser/sessions')
        sessions.value = response.data
        if (activeSession.value && response.data.some((session) => session.id === activeSession.value?.id)) {
            await selectSession(activeSession.value.id)
        }
        return response.data
    } catch (error) {
        collectionError.value = error instanceof Error ? error.message : 'TALOS could not load browser sessions.'
        throw error
    } finally {
        loadingCollection.value = false
    }
}

async function refreshActive(session: TalosBrowserSession) {
    activeSession.value = session
    sessions.value = [session, ...sessions.value.filter((item) => item.id !== session.id)]
    await Promise.all([loadEvents(session.id), loadPreview(session)])
    if (browserMode.value.enabled) setBrowserMode(true, session)
}

async function createSession() {
    mutating.value = true
    mutationError.value = null
    browserMode.value = { ...browserMode.value, enabled: true, status: 'starting' }
    try {
        const response = await talosFetch<ApiEnvelope<TalosBrowserSession>>('/api/talos/browser/sessions', { method: 'POST', body: JSON.stringify({}) })
        await refreshActive(response.data)
        setBrowserMode(true, response.data)
        return response.data
    } catch (error) {
        setMutationError(error, 'TALOS could not start a browser session.')
        browserMode.value = { ...browserMode.value, enabled: true, status: 'failed' }
        throw error
    } finally {
        mutating.value = false
    }
}

async function enableBrowse() {
    browserMode.value = { ...browserMode.value, enabled: true, status: 'starting' }
    const existing = activeSession.value ?? sessions.value.find((session) => ['ready', 'active'].includes(session.status)) ?? null
    if (existing && ['ready', 'active'].includes(existing.status)) {
        if (!activeSession.value) await selectSession(existing.id)
        setBrowserMode(true, activeSession.value ?? existing)
        return activeSession.value ?? existing
    }

    return createSession()
}

function disableBrowse() {
    setBrowserMode(false)
}

async function restartSession() {
    if (activeSession.value && !['closed', 'expired'].includes(activeSession.value.status)) {
        await closeSession()
    }
    activeSession.value = null
    return createSession()
}

async function navigate(url: string) {
    if (!activeSession.value) return
    mutating.value = true
    mutationError.value = null
    try {
        const response = await talosFetch<ApiEnvelope<TalosBrowserSession>>(`/api/talos/browser/sessions/${idPath(activeSession.value.id)}/navigate`, { method: 'POST', body: JSON.stringify({ url }) })
        await refreshActive(response.data)
    } catch (error) {
        setMutationError(error, 'TALOS could not navigate this browser session.')
        throw error
    } finally {
        mutating.value = false
    }
}

async function captureScreenshot() {
    if (!activeSession.value) return
    mutating.value = true
    mutationError.value = null
    try {
        const response = await talosFetch<ApiEnvelope<TalosBrowserArtifact>>(`/api/talos/browser/sessions/${idPath(activeSession.value.id)}/screenshot`, { method: 'POST', body: JSON.stringify({}) })
        latestScreenshot.value = `/api/talos/browser/artifacts/${idPath(response.data.id)}/preview`
        await selectSession(activeSession.value.id)
    } catch (error) {
        setMutationError(error, 'TALOS could not capture a screenshot.')
        throw error
    } finally {
        mutating.value = false
    }
}

async function captureSnapshot() {
    if (!activeSession.value) return
    mutating.value = true
    mutationError.value = null
    try {
        const response = await talosFetch<ApiEnvelope<TalosBrowserArtifact>>(`/api/talos/browser/sessions/${idPath(activeSession.value.id)}/snapshot`, { method: 'POST', body: JSON.stringify({}) })
        const preview = await talosFetch<ApiEnvelope<TalosBrowserSnapshotPreview>>(`/api/talos/browser/artifacts/${idPath(response.data.id)}/preview`)
        latestSnapshot.value = preview.data
        await selectSession(activeSession.value.id)
    } catch (error) {
        setMutationError(error, 'TALOS could not capture a page structure snapshot.')
        throw error
    } finally {
        mutating.value = false
    }
}

async function closeSession() {
    if (!activeSession.value) return
    mutating.value = true
    mutationError.value = null
    try {
        const response = await talosFetch<ApiEnvelope<TalosBrowserSession>>(`/api/talos/browser/sessions/${idPath(activeSession.value.id)}`, { method: 'DELETE' })
        await refreshActive(response.data)
        setBrowserMode(true, response.data)
    } catch (error) {
        setMutationError(error, 'TALOS could not close this browser session.')
        throw error
    } finally {
        mutating.value = false
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

export function useTalosBrowse() {
    return {
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

import { ref } from 'vue'
import { talosFetch } from '../lib/api'
import type { TalosBrowserArtifact, TalosBrowserEvent, TalosBrowserSession, TalosBrowserSnapshotPreview } from '../lib/talosTypes'

type ApiEnvelope<T> = { data: T }

const sessions = ref<TalosBrowserSession[]>([])
const activeSession = ref<TalosBrowserSession | null>(null)
const events = ref<TalosBrowserEvent[]>([])
const latestScreenshot = ref<string | null>(null)
const latestSnapshot = ref<TalosBrowserSnapshotPreview | null>(null)
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
        if (activeSession.value && response.data.some((session) => session.id === activeSession.value?.id)) await selectSession(activeSession.value.id)
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
}

async function createSession() {
    mutating.value = true; mutationError.value = null
    try {
        const response = await talosFetch<ApiEnvelope<TalosBrowserSession>>('/api/talos/browser/sessions', { method: 'POST', body: JSON.stringify({}) })
        await refreshActive(response.data)
        return response.data
    } catch (error) { setMutationError(error, 'TALOS could not start a browser session.'); throw error } finally { mutating.value = false }
}

async function navigate(url: string) {
    if (!activeSession.value) return
    mutating.value = true; mutationError.value = null
    try {
        const response = await talosFetch<ApiEnvelope<TalosBrowserSession>>(`/api/talos/browser/sessions/${idPath(activeSession.value.id)}/navigate`, { method: 'POST', body: JSON.stringify({ url }) })
        await refreshActive(response.data)
    } catch (error) { setMutationError(error, 'TALOS could not navigate this browser session.'); throw error } finally { mutating.value = false }
}

async function captureScreenshot() {
    if (!activeSession.value) return
    mutating.value = true; mutationError.value = null
    try {
        const response = await talosFetch<ApiEnvelope<TalosBrowserArtifact>>(`/api/talos/browser/sessions/${idPath(activeSession.value.id)}/screenshot`, { method: 'POST', body: JSON.stringify({}) })
        latestScreenshot.value = `/api/talos/browser/artifacts/${idPath(response.data.id)}/preview`
        await selectSession(activeSession.value.id)
    } catch (error) { setMutationError(error, 'TALOS could not capture a screenshot.'); throw error } finally { mutating.value = false }
}

async function captureSnapshot() {
    if (!activeSession.value) return
    mutating.value = true; mutationError.value = null
    try {
        const response = await talosFetch<ApiEnvelope<TalosBrowserArtifact>>(`/api/talos/browser/sessions/${idPath(activeSession.value.id)}/snapshot`, { method: 'POST', body: JSON.stringify({}) })
        const preview = await talosFetch<ApiEnvelope<TalosBrowserSnapshotPreview>>(`/api/talos/browser/artifacts/${idPath(response.data.id)}/preview`)
        latestSnapshot.value = preview.data
        await selectSession(activeSession.value.id)
    } catch (error) { setMutationError(error, 'TALOS could not capture a snapshot.'); throw error } finally { mutating.value = false }
}

async function closeSession() {
    if (!activeSession.value) return
    mutating.value = true; mutationError.value = null
    try {
        const response = await talosFetch<ApiEnvelope<TalosBrowserSession>>(`/api/talos/browser/sessions/${idPath(activeSession.value.id)}`, { method: 'DELETE' })
        await refreshActive(response.data)
    } catch (error) { setMutationError(error, 'TALOS could not close this browser session.'); throw error } finally { mutating.value = false }
}

export function useTalosBrowse() {
    return { sessions, activeSession, events, latestScreenshot, latestSnapshot, loadingCollection, loadingSession, mutating, collectionError, sessionError, mutationError, loadSessions, selectSession, createSession, navigate, captureScreenshot, captureSnapshot, closeSession }
}

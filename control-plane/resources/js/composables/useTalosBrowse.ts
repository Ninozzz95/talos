import { computed, ref } from 'vue'
import { TalosApiError, talosFetch } from '../lib/api'
import type {
    TalosBrowserActivity,
    TalosBrowserArtifact,
    TalosBrowserEvent,
    TalosBrowserHmiChallenge,
    TalosBrowserHmiExecution,
    TalosBrowserMode,
    TalosBrowserPointerFrame,
    TalosBrowserSession,
    TalosBrowserSnapshotPreview,
    TalosBrowserTask,
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

function browserInteractionId() {
    const interactionId = globalThis.crypto?.randomUUID?.()
    if (!interactionId) throw new Error('Secure browser interaction identity is unavailable.')
    return interactionId
}

export function useTalosBrowse(options: { devBrowserEvidence?: boolean } = {}) {
    const boundTalosSessionId = ref<string | null>(null)
    const sessions = ref<TalosBrowserSession[]>([])
    const activeSession = ref<TalosBrowserSession | null>(null)
    const events = ref<TalosBrowserEvent[]>([])
    const latestScreenshot = ref<string | null>(null)
    const latestSnapshot = ref<TalosBrowserSnapshotPreview | null>(null)
    const browserTasks = ref<TalosBrowserTask[]>([])
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
    const interactionPending = ref(false)
    const interactionError = ref<string | null>(null)
    const pendingInteractionApproval = ref<TalosBrowserHmiChallenge | null>(null)
    const browserTaskBusy = ref(false)
    const browserTaskError = ref<string | null>(null)
    const browserTaskCommandTargetId = ref<string | null>(null)
    let scopeRevision = 0
    let taskLoadRevision = 0
    let browseIntentRevision = 0
    let cancellationCommand: {
        taskId: string
        stateVersion: number
        commandId: string
    } | null = null
    let enableOperation: {
        talosSessionId: string
        revision: number
        intentRevision: number
        promise: Promise<TalosBrowserSession | null>
    } | null = null

    function setMutationError(error: unknown, fallback: string) {
        mutationError.value = error instanceof Error ? error.message : fallback
    }

    function sessionStatus(session: TalosBrowserSession | null): TalosBrowserMode['status'] {
        if (!session) return 'disconnected'
        if (session.status === 'recovery_required') return 'recovery_required'
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
        taskLoadRevision += 1
        sessions.value = []
        activeSession.value = null
        events.value = []
        latestScreenshot.value = null
        latestSnapshot.value = null
        browserTasks.value = []
        collectionError.value = null
        sessionError.value = null
        mutationError.value = null
        interactionPending.value = false
        interactionError.value = null
        pendingInteractionApproval.value = null
        browserTaskBusy.value = false
        browserTaskError.value = null
        browserTaskCommandTargetId.value = null
        cancellationCommand = null
        loadingCollection.value = false
        loadingSession.value = false
        mutating.value = false
        setBrowserMode(false, null)
    }

    function bindTalosSession(talosSessionId: string | null) {
        const normalizedId = talosSessionId?.trim() || null
        if (boundTalosSessionId.value === normalizedId) return

        scopeRevision += 1
        browseIntentRevision += 1
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

    function browseIntentIsCurrent(talosSessionId: string, revision: number, intentRevision: number) {
        return scopeIsCurrent(talosSessionId, revision) && browseIntentRevision === intentRevision
    }

    function assertScopedSession(session: TalosBrowserSession, talosSessionId: string) {
        if (session.talos_session_id !== talosSessionId) {
            throw new Error('TALOS rejected browser state from another chat session.')
        }
    }

    function assertScopedTask(task: TalosBrowserTask, talosSessionId: string) {
        if (task.talos_session_id !== talosSessionId) {
            throw new Error('TALOS rejected Browser task state from another chat session.')
        }
    }

    const activeBrowserTask = computed<TalosBrowserTask | null>(() => {
        const nonTerminal = browserTasks.value.find((task) => !['completed', 'failed', 'cancelled'].includes(task.status))
        return nonTerminal ?? browserTasks.value[0] ?? null
    })

    async function loadBrowserTasks(options: { quiet?: boolean } = {}) {
        const talosSessionId = requiredTalosSessionId()
        const revision = scopeRevision
        const loadRevision = ++taskLoadRevision
        if (!options.quiet) browserTaskError.value = null
        try {
            const query = new URLSearchParams({ talos_session_id: talosSessionId }).toString()
            const response = await talosFetch<ApiEnvelope<TalosBrowserTask[]>>(`/api/talos/browser/tasks?${query}`, {
                headers: scopedHeaders(talosSessionId),
            })
            response.data.forEach((task) => assertScopedTask(task, talosSessionId))
            if (!scopeIsCurrent(talosSessionId, revision) || loadRevision !== taskLoadRevision) return []
            browserTasks.value = response.data
            if (cancellationCommand && !response.data.some((task) => (
                task.id === cancellationCommand?.taskId
                && task.state_version === cancellationCommand.stateVersion
                && !['completed', 'failed', 'cancelled'].includes(task.status)
            ))) {
                cancellationCommand = null
            }
            return response.data
        } catch (error) {
            if (scopeIsCurrent(talosSessionId, revision) && loadRevision === taskLoadRevision && !options.quiet) {
                browserTaskError.value = 'TALOS could not refresh the Browser task. Check the connection and try again.'
            }
            throw error
        }
    }

    function cancellationCommandFor(task: TalosBrowserTask) {
        if (cancellationCommand
            && cancellationCommand.taskId === task.id
            && cancellationCommand.stateVersion === task.state_version) {
            return cancellationCommand.commandId
        }

        const commandId = browserInteractionId()
        cancellationCommand = { taskId: task.id, stateVersion: task.state_version, commandId }
        return commandId
    }

    async function cancelBrowserTask(taskId: string) {
        const normalizedTaskId = taskId.trim()
        if (!normalizedTaskId || browserTaskBusy.value) return null
        const task = browserTasks.value.find((candidate) => candidate.id === normalizedTaskId) ?? null
        if (!task || ['completed', 'failed', 'cancelled'].includes(task.status)) return null
        const talosSessionId = requiredTalosSessionId()
        if (task.talos_session_id !== talosSessionId) return null
        const revision = scopeRevision
        const commandId = cancellationCommandFor(task)
        browserTaskCommandTargetId.value = task.id
        browserTaskBusy.value = true
        browserTaskError.value = null
        try {
            const response = await talosFetch<ApiEnvelope<{ task: TalosBrowserTask }>>(`/api/talos/browser/tasks/${idPath(task.id)}/cancel`, {
                method: 'POST',
                body: JSON.stringify({
                    expected_state_version: task.state_version,
                    command_id: commandId,
                    reason: 'The user stopped this Browser task.',
                }),
                headers: scopedHeaders(talosSessionId),
            })
            assertScopedTask(response.data.task, talosSessionId)
            if (response.data.task.id !== task.id) {
                throw new Error('TALOS rejected cancellation state for another Browser task.')
            }
            if (!scopeIsCurrent(talosSessionId, revision)) return response.data.task
            browserTasks.value = [
                response.data.task,
                ...browserTasks.value.filter((candidate) => candidate.id !== response.data.task.id),
            ]
            cancellationCommand = null
            return response.data.task
        } catch (error) {
            const code = interactionErrorCode(error)
            if (scopeIsCurrent(talosSessionId, revision) && (error instanceof TalosApiError && error.status === 409
                || code === 'TALOS_BROWSER_TASK_TRANSITION_INVALID'
                || code === 'TALOS_BROWSER_TASK_VERSION_CONFLICT')) {
                let refreshed = false
                try {
                    await loadBrowserTasks({ quiet: true })
                    refreshed = true
                } catch {
                    // The cancellation fault remains actionable even if refresh is unavailable.
                }
                if (scopeIsCurrent(talosSessionId, revision)) {
                    cancellationCommand = null
                    browserTaskError.value = refreshed
                        ? 'The Browser task changed before cancellation. TALOS refreshed its current state.'
                        : 'The Browser task changed before cancellation, but TALOS could not refresh it. Check the connection and try again.'
                }
                return null
            }
            if (scopeIsCurrent(talosSessionId, revision)) {
                browserTaskError.value = 'TALOS could not cancel the Browser task. Check the connection and try again.'
            }
            throw error
        } finally {
            if (scopeIsCurrent(talosSessionId, revision)) browserTaskBusy.value = false
        }
    }

    async function cancelActiveBrowserTask() {
        const task = activeBrowserTask.value
        return task ? cancelBrowserTask(task.id) : null
    }

    async function loadEvents(session: TalosBrowserSession, revision: number) {
        const response = await talosFetch<ApiEnvelope<TalosBrowserEvent[]>>(`/api/talos/browser/sessions/${idPath(session.id)}/events`, { headers: scopedHeaders(session.talos_session_id ?? '') })
        if (scopeIsCurrent(session.talos_session_id ?? '', revision)) events.value = response.data
    }

    async function loadPreview(session: TalosBrowserSession, revision: number) {
        const screenshot = session.last_screenshot_artifact_id
            ? artifactPreviewUrl(session.last_screenshot_artifact_id, session.talos_session_id ?? '')
            : null
        const snapshot = options.devBrowserEvidence === true && session.last_snapshot_artifact_id
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

    async function createSession(activationGuard: () => boolean = () => true) {
        const talosSessionId = requiredTalosSessionId()
        const revision = scopeRevision
        if (activationGuard()) {
            mutating.value = true
            mutationError.value = null
            browserMode.value = { ...browserMode.value, enabled: true, status: 'starting' }
        }
        try {
            const response = await talosFetch<ApiEnvelope<TalosBrowserSession>>('/api/talos/browser/sessions', {
                method: 'POST',
                body: JSON.stringify({ talos_session_id: talosSessionId }),
                headers: scopedHeaders(talosSessionId),
            })
            assertScopedSession(response.data, talosSessionId)
            if (!scopeIsCurrent(talosSessionId, revision) || !activationGuard()) return response.data
            await refreshActive(response.data, talosSessionId, revision)
            if (!activationGuard()) return response.data
            setBrowserMode(true, response.data)
            return response.data
        } catch (error) {
            if (scopeIsCurrent(talosSessionId, revision) && activationGuard()) {
                setMutationError(error, 'TALOS could not start a browser session.')
                browserMode.value = { ...browserMode.value, enabled: true, status: 'failed' }
            }
            throw error
        } finally {
            if (scopeIsCurrent(talosSessionId, revision) && activationGuard()) mutating.value = false
        }
    }

    async function performEnableBrowse(talosSessionId: string, revision: number, intentRevision: number) {
        if (!browseIntentIsCurrent(talosSessionId, revision, intentRevision)) return null
        browserMode.value = { ...browserMode.value, enabled: true, status: 'starting' }
        if (sessions.value.length === 0) await loadSessions()
        if (!browseIntentIsCurrent(talosSessionId, revision, intentRevision)) return null
        const resumableStatuses = ['ready', 'active', 'recovery_required']
        const existing = activeSession.value ?? sessions.value.find((session) => resumableStatuses.includes(session.status)) ?? null
        if (existing && resumableStatuses.includes(existing.status)) {
            const selected = await selectSession(existing.id)
            if (!browseIntentIsCurrent(talosSessionId, revision, intentRevision)) return null
            if (selected && resumableStatuses.includes(selected.status)) {
                setBrowserMode(true, selected)
                return selected
            }
        }

        const created = await createSession(() => browseIntentIsCurrent(talosSessionId, revision, intentRevision))
        return browseIntentIsCurrent(talosSessionId, revision, intentRevision) ? created : null
    }

    function enableBrowse() {
        const talosSessionId = requiredTalosSessionId()
        const revision = scopeRevision
        if (enableOperation
            && enableOperation.talosSessionId === talosSessionId
            && enableOperation.revision === revision
            && enableOperation.intentRevision === browseIntentRevision) {
            return enableOperation.promise
        }

        const intentRevision = ++browseIntentRevision
        let promise: Promise<TalosBrowserSession | null>
        promise = performEnableBrowse(talosSessionId, revision, intentRevision).finally(() => {
            if (enableOperation?.promise === promise) enableOperation = null
        })
        enableOperation = { talosSessionId, revision, intentRevision, promise }

        return promise
    }

    function disableBrowse() {
        browseIntentRevision += 1
        mutating.value = false
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
        if (options.devBrowserEvidence !== true) {
            throw new Error('Raw browser evidence is disabled outside the explicit development gate.')
        }
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

    function interactionErrorCode(error: unknown) {
        if (!(error instanceof TalosApiError) || !error.details || typeof error.details !== 'object' || Array.isArray(error.details)) return null
        const code = (error.details as { code?: unknown }).code
        return typeof code === 'string' ? code : null
    }

    function confirmationChallenge(error: unknown): TalosBrowserHmiChallenge | null {
        if (!(error instanceof TalosApiError) || error.status !== 428 || !error.details || typeof error.details !== 'object' || Array.isArray(error.details)) return null
        const envelope = error.details as { code?: unknown; details?: unknown }
        if (envelope.code !== 'TALOS_BROWSER_HMI_CONFIRMATION_REQUIRED'
            || !envelope.details
            || typeof envelope.details !== 'object'
            || Array.isArray(envelope.details)) return null
        const details = envelope.details as Record<string, unknown>
        const action = details.action
        if (typeof details.approval_id !== 'string'
            || typeof details.request_hash !== 'string'
            || !/^sha256:[a-f0-9]{64}$/.test(details.request_hash)
            || typeof details.expires_at !== 'string'
            || !action
            || typeof action !== 'object'
            || Array.isArray(action)) return null
        const typedAction = action as Record<string, unknown>
        if (!['category', 'label', 'origin', 'consequence'].every((field) => typeof typedAction[field] === 'string')) return null

        return details as unknown as TalosBrowserHmiChallenge
    }

    function assertInteractiveFrame(frame: TalosBrowserPointerFrame) {
        const session = activeSession.value
        const artifactHash = frame.artifact.sha256?.replace(/^sha256:/, '') ?? ''
        if (!session
            || session.id !== frame.browserSessionId
            || session.last_screenshot_artifact_id !== frame.artifact.id
            || session.state_version !== frame.artifact.state_version
            || !session.capabilities.includes('interact')
            || !/^[a-f0-9]{64}$/.test(artifactHash)
            || !Number.isFinite(frame.normalizedX)
            || frame.normalizedX < 0
            || frame.normalizedX > 1
            || !Number.isFinite(frame.normalizedY)
            || frame.normalizedY < 0
            || frame.normalizedY > 1
            || ![1, 2].includes(frame.clickCount)) {
            throw new Error('The selected browser frame is not current or interactive.')
        }

        return { session, artifactHash }
    }

    async function applyInteraction(execution: TalosBrowserHmiExecution, talosSessionId: string, revision: number) {
        assertScopedSession(execution.session, talosSessionId)
        if (!scopeIsCurrent(talosSessionId, revision)) return
        browserMode.value = { ...browserMode.value, enabled: true }
        await refreshActive(execution.session, talosSessionId, revision)
        if (scopeIsCurrent(talosSessionId, revision)) {
            recordInteractionFrame(execution)
            latestScreenshot.value = execution.screenshot.preview_url
                ? `${execution.screenshot.preview_url}?${new URLSearchParams({ talos_session_id: talosSessionId })}`
                : artifactPreviewUrl(execution.screenshot.id, talosSessionId)
            setBrowserMode(true, execution.session)
        }
    }

    function recordInteractionFrame(execution: TalosBrowserHmiExecution) {
        const artifactId = execution.screenshot.id
        const alreadyPresent = events.value.some((event) => {
            const payload = event.payload ?? {}
            const operation = typeof payload.operation === 'string' ? payload.operation : ''
            const eventType = event.type ?? event.event_type ?? ''
            if (operation !== 'screenshot' && !eventType.includes('screenshot')) return false
            if (payload.screenshot_artifact_id === artifactId || payload.artifact_id === artifactId) return true

            return Array.isArray(payload.artifact_ids) && payload.artifact_ids.includes(artifactId)
        })
        if (alreadyPresent) return

        events.value = [...events.value, {
            id: `hmi-frame-${artifactId}`,
            type: 'hmi.evidence.persisted',
            actor: 'system',
            payload: {
                operation: 'screenshot',
                screenshot_artifact_id: artifactId,
                artifact_ids: [artifactId],
            },
            created_at: execution.screenshot.created_at ?? new Date().toISOString(),
        }]
    }

    async function refreshAfterStale(sessionId: string) {
        try {
            await selectSession(sessionId)
            interactionError.value = 'The page changed before the action. Review the refreshed frame and try again.'
            return true
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'Browser refresh failed.'
            interactionError.value = `Frame changed, but TALOS could not refresh the current browser capture. ${detail}`
            return false
        }
    }

    async function interactWithScreenshot(frame: TalosBrowserPointerFrame) {
        if (interactionPending.value) throw new Error('A browser interaction is already in progress.')
        const { session, artifactHash } = assertInteractiveFrame(frame)
        const talosSessionId = requiredTalosSessionId()
        const revision = scopeRevision
        interactionPending.value = true
        interactionError.value = null
        pendingInteractionApproval.value = null
        try {
            const response = await talosFetch<ApiEnvelope<TalosBrowserHmiExecution>>(`/api/talos/browser/sessions/${idPath(session.id)}/interactions/pointer`, {
                method: 'POST',
                body: JSON.stringify({
                    schema_version: 'talos_browser_hmi_pointer_v2',
                    interaction_id: browserInteractionId(),
                    artifact_id: frame.artifact.id,
                    artifact_sha256: `sha256:${artifactHash}`,
                    state_version: frame.artifact.state_version,
                    normalized_x: frame.normalizedX,
                    normalized_y: frame.normalizedY,
                    button: 'left',
                    click_count: frame.clickCount,
                }),
                headers: scopedHeaders(talosSessionId),
            })
            await applyInteraction(response.data, talosSessionId, revision)

            return { status: 'executed' as const, ...response.data.interaction, screenshot: response.data.screenshot, snapshot: response.data.snapshot }
        } catch (error) {
            const challenge = confirmationChallenge(error)
            if (challenge && scopeIsCurrent(talosSessionId, revision)) {
                pendingInteractionApproval.value = challenge
                browserMode.value = { ...browserMode.value, enabled: true, status: 'awaiting_approval' }
                return { status: 'confirmation_required' as const, challenge }
            }
            const code = interactionErrorCode(error)
            if (code === 'TALOS_BROWSER_FRAME_STALE' || code === 'TALOS_BROWSER_TARGET_STALE' || code === 'TALOS_BROWSER_STALE_STATE') {
                await refreshAfterStale(session.id)
                return { status: 'stale' as const }
            }
            if (code === 'TALOS_BROWSER_HMI_RECOVERY_REQUIRED') {
                interactionError.value = error instanceof Error ? error.message : 'Browser recovery is required.'
                browserMode.value = { ...browserMode.value, enabled: true, status: 'recovery_required' }
                return { status: 'recovery_required' as const }
            }
            interactionError.value = error instanceof Error ? error.message : 'TALOS could not execute the browser interaction.'
            throw error
        } finally {
            if (scopeIsCurrent(talosSessionId, revision)) interactionPending.value = false
        }
    }

    async function confirmScreenshotInteraction(decision: 'approve' | 'reject') {
        if (interactionPending.value) throw new Error('A browser interaction is already in progress.')
        const approval = pendingInteractionApproval.value
        const session = activeSession.value
        if (!approval || !session) throw new Error('No browser interaction is awaiting confirmation.')
        const talosSessionId = requiredTalosSessionId()
        const revision = scopeRevision
        interactionPending.value = true
        interactionError.value = null
        try {
            const response = await talosFetch<ApiEnvelope<TalosBrowserHmiExecution | { interaction: { status: 'rejected'; approval_id: string } }>>(`/api/talos/browser/interactions/${idPath(approval.approval_id)}/confirm`, {
                method: 'POST',
                body: JSON.stringify({ decision, request_hash: approval.request_hash }),
                headers: scopedHeaders(talosSessionId),
            })
            pendingInteractionApproval.value = null
            if (response.data.interaction.status === 'rejected') {
                setBrowserMode(true, session)
                return response.data.interaction
            }
            await applyInteraction(response.data, talosSessionId, revision)

            return { status: 'executed' as const, ...response.data.interaction, screenshot: response.data.screenshot, snapshot: response.data.snapshot }
        } catch (error) {
            const code = interactionErrorCode(error)
            if (['TALOS_BROWSER_FRAME_STALE', 'TALOS_BROWSER_TARGET_STALE', 'TALOS_BROWSER_STALE_STATE', 'TALOS_BROWSER_HMI_APPROVAL_EXPIRED', 'TALOS_BROWSER_HMI_APPROVAL_CONSUMED'].includes(code ?? '')) {
                pendingInteractionApproval.value = null
                await refreshAfterStale(session.id)
                return { status: 'stale' as const }
            }
            if (code === 'TALOS_BROWSER_HMI_RECOVERY_REQUIRED') {
                pendingInteractionApproval.value = null
                interactionError.value = error instanceof Error ? error.message : 'Browser recovery is required.'
                browserMode.value = { ...browserMode.value, enabled: true, status: 'recovery_required' }
                return { status: 'recovery_required' as const }
            }
            interactionError.value = error instanceof Error ? error.message : 'TALOS could not confirm the browser interaction.'
            throw error
        } finally {
            if (scopeIsCurrent(talosSessionId, revision)) interactionPending.value = false
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
        const artifactIds = operation === 'screenshot' && typeof payload.screenshot_artifact_id === 'string'
            ? [payload.screenshot_artifact_id]
            : Array.isArray(payload.artifact_ids)
            ? payload.artifact_ids.filter((artifactId): artifactId is string => typeof artifactId === 'string')
            : typeof payload.artifact_id === 'string' ? [payload.artifact_id] : []

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
        browserTasks,
        activeBrowserTask,
        browserTaskBusy,
        browserTaskError,
        browserTaskCommandTargetId,
        loadingCollection,
        loadingSession,
        mutating,
        collectionError,
        sessionError,
        mutationError,
        interactionPending,
        interactionError,
        pendingInteractionApproval,
        bindTalosSession,
        loadBrowserTasks,
        cancelBrowserTask,
        cancelActiveBrowserTask,
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
        interactWithScreenshot,
        confirmScreenshotInteraction,
    }
}

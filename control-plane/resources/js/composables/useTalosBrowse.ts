import { computed, ref } from 'vue'
import { TalosApiError, talosFetch } from '../lib/api'
import type {
    TalosBrowserActivity,
    TalosBrowserArtifact,
    TalosBrowserEvent,
    TalosBrowserFrameExecution,
    TalosBrowserHmiChallenge,
    TalosBrowserHmiExecution,
    TalosBrowserMode,
    TalosBrowserPointerFrame,
    TalosBrowserRefFrame,
    TalosBrowserRefInteraction,
    TalosBrowserRefTarget,
    TalosBrowserRecoveryExecution,
    TalosBrowserScrollFrame,
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

async function browserRecoveryCommandId(
    talosSessionId: string,
    taskId: string,
    browserSessionId: string,
    browserStateVersion: number,
) {
    const subtle = globalThis.crypto?.subtle
    if (!subtle) throw new Error('Secure browser recovery identity is unavailable.')
    const binding = JSON.stringify([
        'talos_browser_recovery_command_v1',
        talosSessionId,
        taskId,
        browserSessionId,
        browserStateVersion,
    ])
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(binding))
    const hex = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')

    return `talos_ui_recovery_${hex}`
}

// A worker handshake incompatibility is a setup/configuration fault (RFC 9110
// 426 semantics): Browse must stay unavailable with an actionable message rather
// than a retryable transient failure.
const SETUP_INCOMPATIBILITY_CODES = new Set([
    'TALOS_BROWSER_WORKER_PROTOCOL_MISMATCH',
    'TALOS_BROWSER_WORKER_ADAPTER_MISMATCH',
    'TALOS_BROWSER_WORKER_CAPABILITY_MISMATCH',
    'TALOS_BROWSER_WORKER_AUTHENTICATION_MISMATCH',
    'TALOS_BROWSER_WORKER_HANDSHAKE_INVALID',
])

const BROWSE_SETUP_FAULT_MESSAGE = 'Browse is unavailable because the browser worker is incompatible with this TALOS version. Update the browser worker to a compatible protocol, then enable Browse again.'
const REF_TARGETS_UNAVAILABLE_MESSAGE = 'Semantic page controls are temporarily unavailable. You can still interact directly with the screenshot.'

type PendingInteractionApprovalBinding = {
    browserSessionId: string
    artifactId: string
    stateVersion: number
}

function recordValue(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
}

function projectRefFrame(value: unknown, session: TalosBrowserSession): TalosBrowserRefFrame {
    const frame = recordValue(value)
    const screenshot = recordValue(frame?.screenshot)
    const stateVersion = session.state_version
    const screenshotHash = typeof screenshot?.sha256 === 'string'
        ? screenshot.sha256.replace(/^sha256:/, '')
        : ''
    if (!frame
        || frame.schema_version !== 'talos_browser_hmi_ref_targets_v2'
        || frame.browser_session_id !== session.id
        || !Number.isInteger(frame.state_version)
        || frame.state_version !== stateVersion
        || typeof frame.frame_sha256 !== 'string'
        || !/^sha256:[a-f0-9]{64}$/.test(frame.frame_sha256)
        || frame.frame_sha256 !== `sha256:${screenshotHash}`
        || typeof frame.snapshot_id !== 'string'
        || !/^hmi_ref_[a-f0-9]{64}$/.test(frame.snapshot_id)
        || !screenshot
        || screenshot.id !== session.last_screenshot_artifact_id
        || screenshot.browser_session_id !== session.id
        || screenshot.type !== 'screenshot'
        || screenshot.state_version !== stateVersion
        || !Array.isArray(frame.targets)
        || frame.targets.length > 250) {
        throw new Error('TALOS returned semantic controls for a different browser frame.')
    }

    const refs = new Set<string>()
    const targets = frame.targets.map((value): TalosBrowserRefTarget => {
        const target = recordValue(value)
        const destination = target?.destination
        if (!target
            || typeof target.ref !== 'string'
            || !/^e[1-9][0-9]*$/.test(target.ref)
            || refs.has(target.ref)
            || typeof target.role !== 'string'
            || target.role.trim() === ''
            || target.role.length > 128
            || typeof target.name !== 'string'
            || target.name.trim() === ''
            || target.name.length > 1_024
            || !(destination === null || (typeof destination === 'string' && destination.length <= 4_096))) {
            throw new Error('TALOS returned an invalid semantic page control.')
        }
        refs.add(target.ref)

        return {
            ref: target.ref,
            role: target.role,
            name: target.name,
            destination: destination as string | null,
        }
    })
    const metadata = recordValue(screenshot.metadata)
    const width = Number(metadata?.width)
    const height = Number(metadata?.height)
    const projectedScreenshot: TalosBrowserArtifact = {
        id: screenshot.id as string,
        browser_session_id: screenshot.browser_session_id as string,
        type: 'screenshot',
        mime: typeof screenshot.mime === 'string' || screenshot.mime === null ? screenshot.mime : null,
        sha256: screenshotHash,
        state_version: screenshot.state_version as number,
        metadata: {
            ...(Number.isFinite(width) && width > 0 ? { width } : {}),
            ...(Number.isFinite(height) && height > 0 ? { height } : {}),
        },
        ...(typeof screenshot.preview_url === 'string' ? { preview_url: screenshot.preview_url } : {}),
        ...(typeof screenshot.created_at === 'string' ? { created_at: screenshot.created_at } : {}),
    }

    return {
        schema_version: 'talos_browser_hmi_ref_targets_v2',
        browser_session_id: session.id,
        state_version: stateVersion,
        frame_sha256: frame.frame_sha256,
        snapshot_id: frame.snapshot_id,
        screenshot: projectedScreenshot,
        targets,
    }
}

export function useTalosBrowse(options: { devBrowserEvidence?: boolean } = {}) {
    const boundTalosSessionId = ref<string | null>(null)
    const sessions = ref<TalosBrowserSession[]>([])
    const activeSession = ref<TalosBrowserSession | null>(null)
    const events = ref<TalosBrowserEvent[]>([])
    const latestScreenshot = ref<string | null>(null)
    const latestSnapshot = ref<TalosBrowserSnapshotPreview | null>(null)
    const latestRefFrame = ref<TalosBrowserRefFrame | null>(null)
    const refTargetsLoading = ref(false)
    const refTargetsError = ref<string | null>(null)
    const browserTasks = ref<TalosBrowserTask[]>([])
    const browserMode = ref<TalosBrowserMode>({
        enabled: false,
        session_id: null,
        status: 'disconnected',
        capabilities: [],
    })
    const browseSetupFault = ref<string | null>(null)
    const loadingCollection = ref(false)
    const loadingSession = ref(false)
    const mutating = ref(false)
    const collectionError = ref<string | null>(null)
    const sessionError = ref<string | null>(null)
    const mutationError = ref<string | null>(null)
    const interactionPending = ref(false)
    const interactionError = ref<string | null>(null)
    const pendingInteractionApproval = ref<TalosBrowserHmiChallenge | null>(null)
    const pendingInteractionApprovalBinding = ref<PendingInteractionApprovalBinding | null>(null)
    const browserTaskBusy = ref(false)
    const browserTaskError = ref<string | null>(null)
    const browserTaskCommandTargetId = ref<string | null>(null)
    let scopeRevision = 0
    let taskLoadRevision = 0
    let refTargetLoadRevision = 0
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

    function clearPendingInteractionApproval() {
        pendingInteractionApproval.value = null
        pendingInteractionApprovalBinding.value = null
    }

    function approvalBindingMatchesSession(
        binding: PendingInteractionApprovalBinding,
        session: TalosBrowserSession,
    ) {
        return session.id === binding.browserSessionId
            && session.last_screenshot_artifact_id === binding.artifactId
            && session.state_version === binding.stateVersion
    }

    function bindPendingInteractionApproval(
        challenge: TalosBrowserHmiChallenge,
        session: TalosBrowserSession,
        artifact: TalosBrowserArtifact,
    ) {
        const active = activeSession.value
        if (!active
            || active.id !== session.id
            || active.last_screenshot_artifact_id !== artifact.id
            || active.state_version !== artifact.state_version) return false

        pendingInteractionApproval.value = challenge
        pendingInteractionApprovalBinding.value = {
            browserSessionId: session.id,
            artifactId: artifact.id,
            stateVersion: artifact.state_version,
        }
        return true
    }

    function invalidatePendingApprovalForSession(session: TalosBrowserSession) {
        const binding = pendingInteractionApprovalBinding.value
        if (binding && !approvalBindingMatchesSession(binding, session)) clearPendingInteractionApproval()
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
        refTargetLoadRevision += 1
        sessions.value = []
        activeSession.value = null
        events.value = []
        latestScreenshot.value = null
        latestSnapshot.value = null
        latestRefFrame.value = null
        refTargetsLoading.value = false
        refTargetsError.value = null
        browserTasks.value = []
        collectionError.value = null
        sessionError.value = null
        mutationError.value = null
        interactionPending.value = false
        interactionError.value = null
        clearPendingInteractionApproval()
        browserTaskBusy.value = false
        browserTaskError.value = null
        browserTaskCommandTargetId.value = null
        cancellationCommand = null
        loadingCollection.value = false
        loadingSession.value = false
        mutating.value = false
        browseSetupFault.value = null
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
    const recoverableBrowserTask = computed<TalosBrowserTask | null>(() => {
        const browserSessionId = activeSession.value?.id
        if (!browserSessionId) return null

        return browserTasks.value.find((task) => (
            task.browser_session_id === browserSessionId
            && ['running', 'recovering'].includes(task.status)
        )) ?? null
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

    function assertRecoveryExecution(
        execution: TalosBrowserRecoveryExecution,
        requestedTask: TalosBrowserTask,
        talosSessionId: string,
    ) {
        assertScopedTask(execution.task, talosSessionId)
        if (execution.task.id !== requestedTask.id
            || execution.decision.task_id !== requestedTask.id
            || !['resume', 'reconcile', 'fork', 'wait_for_user', 'fail'].includes(execution.decision.strategy)
            || typeof execution.decision.reason_code !== 'string'
            || execution.decision.reason_code.trim() === ''
            || typeof execution.decision.remediation !== 'string'
            || execution.decision.remediation.trim() === '') {
            throw new Error('TALOS returned an invalid Browser recovery decision.')
        }
        if (execution.resulting_task) {
            assertScopedTask(execution.resulting_task, talosSessionId)
            if (execution.decision.resulting_task_id !== execution.resulting_task.id) {
                throw new Error('TALOS returned a mismatched resulting Browser task.')
            }
        } else if (execution.decision.resulting_task_id !== null
            && execution.decision.resulting_task_id !== execution.task.id) {
            throw new Error('TALOS omitted the resulting Browser task projection.')
        }
    }

    async function recoverBrowserTask(taskId: string) {
        const normalizedTaskId = taskId.trim()
        if (!normalizedTaskId || browserTaskBusy.value) return null
        const task = browserTasks.value.find((candidate) => candidate.id === normalizedTaskId) ?? null
        const session = activeSession.value
        if (!task
            || !session
            || !['running', 'recovering'].includes(task.status)
            || task.browser_session_id !== session.id) return null
        const talosSessionId = requiredTalosSessionId()
        if (task.talos_session_id !== talosSessionId) return null
        const revision = scopeRevision
        browserTaskCommandTargetId.value = task.id
        browserTaskBusy.value = true
        browserTaskError.value = null
        try {
            const commandId = await browserRecoveryCommandId(
                talosSessionId,
                task.id,
                session.id,
                session.state_version ?? 0,
            )
            const response = await talosFetch<ApiEnvelope<TalosBrowserRecoveryExecution>>(`/api/talos/browser/tasks/${idPath(task.id)}/recover`, {
                method: 'POST',
                body: JSON.stringify({ command_id: commandId }),
                headers: scopedHeaders(talosSessionId),
            })
            assertRecoveryExecution(response.data, task, talosSessionId)
            if (!scopeIsCurrent(talosSessionId, revision)) return response.data

            const projections = [response.data.resulting_task, response.data.task]
                .filter((candidate): candidate is TalosBrowserTask => candidate !== null)
            const projectedIds = new Set(projections.map((candidate) => candidate.id))
            browserTasks.value = [
                ...projections,
                ...browserTasks.value.filter((candidate) => !projectedIds.has(candidate.id)),
            ]

            const resultingBrowserSessionId = response.data.resulting_task?.browser_session_id ?? null
            if (resultingBrowserSessionId && resultingBrowserSessionId !== activeSession.value?.id) {
                try {
                    const listed = await loadSessions()
                    if (listed.some((candidate) => candidate.id === resultingBrowserSessionId)) {
                        await selectSession(resultingBrowserSessionId)
                    }
                } catch {
                    if (scopeIsCurrent(talosSessionId, revision)) {
                        browserTaskError.value = 'Browser recovery was accepted, but TALOS could not refresh its resulting session.'
                    }
                }
            }

            return response.data
        } catch (error) {
            if (scopeIsCurrent(talosSessionId, revision) && browserTaskError.value === null) {
                browserTaskError.value = error instanceof Error
                    ? `TALOS could not recover the Browser task. ${error.message}`
                    : 'TALOS could not recover the Browser task. Check the connection and try again.'
            }
            throw error
        } finally {
            if (scopeIsCurrent(talosSessionId, revision)) browserTaskBusy.value = false
        }
    }

    async function recoverActiveBrowserTask() {
        const task = recoverableBrowserTask.value
        return task ? recoverBrowserTask(task.id) : null
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

    async function loadRefTargets(session: TalosBrowserSession, revision: number) {
        const loadRevision = ++refTargetLoadRevision
        const talosSessionId = session.talos_session_id ?? ''
        const interactive = typeof session.last_screenshot_artifact_id === 'string'
            && Number.isInteger(session.state_version)
            && ['ready', 'active'].includes(session.status)
            && session.capabilities.includes('interact')
        if (!interactive) {
            if (scopeIsCurrent(talosSessionId, revision) && activeSession.value?.id === session.id) {
                latestRefFrame.value = null
                refTargetsLoading.value = false
                refTargetsError.value = null
            }
            return null
        }

        if (scopeIsCurrent(talosSessionId, revision) && activeSession.value?.id === session.id) {
            latestRefFrame.value = null
            refTargetsLoading.value = true
            refTargetsError.value = null
        }
        try {
            const response = await talosFetch<ApiEnvelope<unknown>>(`/api/talos/browser/sessions/${idPath(session.id)}/interaction-targets`, {
                headers: scopedHeaders(talosSessionId),
            })
            const frame = projectRefFrame(response.data, session)
            if (scopeIsCurrent(talosSessionId, revision)
                && refTargetLoadRevision === loadRevision
                && activeSession.value?.id === session.id
                && activeSession.value.last_screenshot_artifact_id === session.last_screenshot_artifact_id
                && activeSession.value.state_version === session.state_version) {
                latestRefFrame.value = frame
                refTargetsError.value = null
            }
            return frame
        } catch (error) {
            if (scopeIsCurrent(talosSessionId, revision)
                && refTargetLoadRevision === loadRevision
                && activeSession.value?.id === session.id) {
                latestRefFrame.value = null
                const code = interactionErrorCode(error)
                refTargetsError.value = code === 'TALOS_BROWSER_WORKER_UNAVAILABLE'
                    || (error instanceof TalosApiError && error.status === 503)
                    ? REF_TARGETS_UNAVAILABLE_MESSAGE
                    : 'Semantic page controls are unavailable for this frame. You can still interact directly with the screenshot.'
            }
            return null
        } finally {
            if (scopeIsCurrent(talosSessionId, revision) && refTargetLoadRevision === loadRevision) {
                refTargetsLoading.value = false
            }
        }
    }

    async function selectSession(id: string) {
        const talosSessionId = requiredTalosSessionId()
        const revision = scopeRevision
        if (activeSession.value?.id !== id) clearPendingInteractionApproval()
        loadingSession.value = true
        sessionError.value = null
        try {
            const response = await talosFetch<ApiEnvelope<TalosBrowserSession>>(`/api/talos/browser/sessions/${idPath(id)}`, { headers: scopedHeaders(talosSessionId) })
            assertScopedSession(response.data, talosSessionId)
            if (!scopeIsCurrent(talosSessionId, revision)) return null
            invalidatePendingApprovalForSession(response.data)
            activeSession.value = response.data
            sessions.value = [response.data, ...sessions.value.filter((session) => session.id !== response.data.id)]
            await Promise.all([
                loadEvents(response.data, revision),
                loadPreview(response.data, revision),
                loadRefTargets(response.data, revision),
            ])
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
        invalidatePendingApprovalForSession(session)
        activeSession.value = session
        sessions.value = [session, ...sessions.value.filter((item) => item.id !== session.id)]
        await Promise.all([
            loadEvents(session, revision),
            loadPreview(session, revision),
            loadRefTargets(session, revision),
        ])
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
                const code = interactionErrorCode(error)
                if (code !== null && SETUP_INCOMPATIBILITY_CODES.has(code)) {
                    browseSetupFault.value = BROWSE_SETUP_FAULT_MESSAGE
                    mutationError.value = null
                    setBrowserMode(false, null)
                } else {
                    setMutationError(error, 'TALOS could not start a browser session.')
                    browserMode.value = { ...browserMode.value, enabled: true, status: 'failed' }
                }
            }
            throw error
        } finally {
            if (scopeIsCurrent(talosSessionId, revision) && activationGuard()) mutating.value = false
        }
    }

    async function performEnableBrowse(talosSessionId: string, revision: number, intentRevision: number) {
        if (!browseIntentIsCurrent(talosSessionId, revision, intentRevision)) return null
        browseSetupFault.value = null
        browserMode.value = { ...browserMode.value, enabled: true, status: 'starting' }
        if (sessions.value.length === 0) await loadSessions()
        if (!browseIntentIsCurrent(talosSessionId, revision, intentRevision)) return null
        const resumableStatuses = ['ready', 'active', 'recovery_required']
        const activeCandidate = activeSession.value && resumableStatuses.includes(activeSession.value.status)
            ? activeSession.value
            : null
        const existing = activeCandidate ?? sessions.value.find((session) => resumableStatuses.includes(session.status)) ?? null
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
        browseSetupFault.value = null
        setBrowserMode(false)
    }

    async function startFreshSession() {
        const talosSessionId = requiredTalosSessionId()
        const revision = scopeRevision
        const previousSessionId = activeSession.value?.id ?? null
        if (activeSession.value && !['closed', 'expired'].includes(activeSession.value.status)) {
            await closeSession()
        }
        if (!scopeIsCurrent(talosSessionId, revision)) return null
        activeSession.value = null
        const listed = await loadSessions()
        if (!scopeIsCurrent(talosSessionId, revision)) return null
        const replacement = listed.find((session) => (
            session.id !== previousSessionId
            && ['ready', 'active'].includes(session.status)
        )) ?? null
        if (replacement) return selectSession(replacement.id)

        return createSession()
    }

    async function restartSession() {
        return startFreshSession()
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
            return response.data
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

    function assertCurrentFrame(frame: Pick<TalosBrowserPointerFrame, 'browserSessionId' | 'artifact'>) {
        const session = activeSession.value
        const artifactHash = frame.artifact.sha256?.replace(/^sha256:/, '') ?? ''
        if (!session
            || session.id !== frame.browserSessionId
            || session.last_screenshot_artifact_id !== frame.artifact.id
            || session.state_version !== frame.artifact.state_version
            || !session.capabilities.includes('interact')
            || !/^[a-f0-9]{64}$/.test(artifactHash)) {
            throw new Error('The selected browser frame is not current or interactive.')
        }

        return { session, artifactHash }
    }

    function assertInteractiveFrame(frame: TalosBrowserPointerFrame) {
        const current = assertCurrentFrame(frame)
        if (!Number.isFinite(frame.normalizedX)
            || frame.normalizedX < 0
            || frame.normalizedX > 1
            || !Number.isFinite(frame.normalizedY)
            || frame.normalizedY < 0
            || frame.normalizedY > 1
            || ![1, 2].includes(frame.clickCount)) {
            throw new Error('The selected browser frame is not current or interactive.')
        }

        return current
    }

    function assertRefInteraction(interaction: TalosBrowserRefInteraction) {
        const current = assertCurrentFrame(interaction)
        const frame = latestRefFrame.value
        if (!frame
            || frame.browser_session_id !== interaction.browserSessionId
            || frame.screenshot.id !== interaction.artifact.id
            || frame.screenshot.state_version !== interaction.artifact.state_version
            || frame.frame_sha256 !== `sha256:${current.artifactHash}`
            || frame.snapshot_id !== interaction.snapshotId
            || !frame.targets.some((target) => target.ref === interaction.ref)
            || ![1, 2].includes(interaction.clickCount)) {
            throw new Error('The selected semantic page control is not bound to the current browser frame.')
        }

        return current
    }

    async function applyFrameExecution(execution: TalosBrowserFrameExecution, talosSessionId: string, revision: number) {
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

    function recordInteractionFrame(execution: TalosBrowserFrameExecution) {
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
            if (activeSession.value?.id !== sessionId) throw new Error('The stale Browser session is no longer active.')
            const screenshot = await captureScreenshot()
            if (!screenshot
                || activeSession.value?.id !== sessionId
                || activeSession.value.last_screenshot_artifact_id !== screenshot.id
                || activeSession.value.state_version !== screenshot.state_version) {
                throw new Error('TALOS did not promote the captured frame to the active Browser session.')
            }
            interactionError.value = 'The page changed before the action. Review the refreshed frame and try again.'
            return true
        } catch (error) {
            const detail = error instanceof Error ? error.message : 'Browser refresh failed.'
            interactionError.value = `Frame changed, but TALOS could not refresh the current browser capture. ${detail}`
            return false
        }
    }

    async function scrollScreenshot(frame: TalosBrowserScrollFrame) {
        if (interactionPending.value) throw new Error('A browser interaction is already in progress.')
        const { session, artifactHash } = assertCurrentFrame(frame)
        if (!Number.isFinite(frame.deltaY)
            || frame.deltaY === 0
            || Math.abs(frame.deltaY) > 10_000) {
            throw new Error('The browser scroll distance is invalid.')
        }
        const talosSessionId = requiredTalosSessionId()
        const revision = scopeRevision
        interactionPending.value = true
        interactionError.value = null
        clearPendingInteractionApproval()
        try {
            const response = await talosFetch<ApiEnvelope<TalosBrowserFrameExecution>>(`/api/talos/browser/sessions/${idPath(session.id)}/interactions/scroll`, {
                method: 'POST',
                body: JSON.stringify({
                    artifact_id: frame.artifact.id,
                    artifact_sha256: `sha256:${artifactHash}`,
                    state_version: frame.artifact.state_version,
                    delta_y: frame.deltaY,
                }),
                headers: scopedHeaders(talosSessionId),
            })
            await applyFrameExecution(response.data, talosSessionId, revision)

            return {
                status: 'executed' as const,
                screenshot: response.data.screenshot,
                snapshot: response.data.snapshot,
            }
        } catch (error) {
            const code = interactionErrorCode(error)
            if (code === 'TALOS_BROWSER_FRAME_STALE' || code === 'TALOS_BROWSER_TARGET_STALE' || code === 'TALOS_BROWSER_STALE_STATE') {
                await refreshAfterStale(session.id)
                return { status: 'stale' as const }
            }
            if (code === 'TALOS_BROWSER_WORKER_UNAVAILABLE'
                || (error instanceof TalosApiError && error.status === 503)) {
                interactionError.value = 'The Browser worker is temporarily unavailable. The current frame is unchanged; try scrolling again.'
                return { status: 'unavailable' as const }
            }
            if (code === 'TALOS_BROWSER_HMI_SCROLL_COMMIT_FAILED'
                || code === 'TALOS_BROWSER_HMI_RECOVERY_REQUIRED') {
                interactionError.value = error instanceof Error
                    ? error.message
                    : 'The browser scrolled, but its current evidence could not be committed. Recovery is required.'
                const recoveringSession = { ...session, status: 'recovery_required' }
                activeSession.value = recoveringSession
                sessions.value = [
                    recoveringSession,
                    ...sessions.value.filter((candidate) => candidate.id !== session.id),
                ]
                browserMode.value = { ...browserMode.value, enabled: true, status: 'recovery_required' }
                return { status: 'recovery_required' as const }
            }
            interactionError.value = error instanceof Error ? error.message : 'TALOS could not scroll the browser frame.'
            throw error
        } finally {
            if (scopeIsCurrent(talosSessionId, revision)) interactionPending.value = false
        }
    }

    async function interactWithScreenshot(frame: TalosBrowserPointerFrame) {
        if (interactionPending.value) throw new Error('A browser interaction is already in progress.')
        const { session, artifactHash } = assertInteractiveFrame(frame)
        const talosSessionId = requiredTalosSessionId()
        const revision = scopeRevision
        interactionPending.value = true
        interactionError.value = null
        clearPendingInteractionApproval()
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
            await applyFrameExecution(response.data, talosSessionId, revision)

            return { status: 'executed' as const, ...response.data.interaction, screenshot: response.data.screenshot, snapshot: response.data.snapshot }
        } catch (error) {
            const challenge = confirmationChallenge(error)
            if (challenge
                && scopeIsCurrent(talosSessionId, revision)
                && bindPendingInteractionApproval(challenge, session, frame.artifact)) {
                browserMode.value = { ...browserMode.value, enabled: true, status: 'awaiting_approval' }
                return { status: 'confirmation_required' as const, challenge }
            }
            if (challenge) return { status: 'stale' as const }
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

    async function interactWithRef(interaction: TalosBrowserRefInteraction) {
        if (interactionPending.value) throw new Error('A browser interaction is already in progress.')
        const { session, artifactHash } = assertRefInteraction(interaction)
        const talosSessionId = requiredTalosSessionId()
        const revision = scopeRevision
        interactionPending.value = true
        interactionError.value = null
        clearPendingInteractionApproval()
        try {
            const response = await talosFetch<ApiEnvelope<TalosBrowserHmiExecution>>(`/api/talos/browser/sessions/${idPath(session.id)}/interactions/ref`, {
                method: 'POST',
                body: JSON.stringify({
                    schema_version: 'talos_browser_hmi_ref_v2',
                    interaction_id: browserInteractionId(),
                    artifact_id: interaction.artifact.id,
                    artifact_sha256: `sha256:${artifactHash}`,
                    state_version: interaction.artifact.state_version,
                    snapshot_id: interaction.snapshotId,
                    ref: interaction.ref,
                    button: 'left',
                    click_count: interaction.clickCount,
                }),
                headers: scopedHeaders(talosSessionId),
            })
            await applyFrameExecution(response.data, talosSessionId, revision)

            return { status: 'executed' as const, ...response.data.interaction, screenshot: response.data.screenshot, snapshot: response.data.snapshot }
        } catch (error) {
            const challenge = confirmationChallenge(error)
            if (challenge
                && scopeIsCurrent(talosSessionId, revision)
                && bindPendingInteractionApproval(challenge, session, interaction.artifact)) {
                browserMode.value = { ...browserMode.value, enabled: true, status: 'awaiting_approval' }
                return { status: 'confirmation_required' as const, challenge }
            }
            if (challenge) return { status: 'stale' as const }
            const code = interactionErrorCode(error)
            if (code === 'TALOS_BROWSER_FRAME_STALE' || code === 'TALOS_BROWSER_TARGET_STALE' || code === 'TALOS_BROWSER_STALE_STATE') {
                latestRefFrame.value = null
                await refreshAfterStale(session.id)
                return { status: 'stale' as const }
            }
            if (code === 'TALOS_BROWSER_WORKER_UNAVAILABLE'
                || (error instanceof TalosApiError && error.status === 503)) {
                latestRefFrame.value = null
                refTargetsError.value = REF_TARGETS_UNAVAILABLE_MESSAGE
                interactionError.value = REF_TARGETS_UNAVAILABLE_MESSAGE
                return { status: 'unavailable' as const }
            }
            if (code === 'TALOS_BROWSER_HMI_RECOVERY_REQUIRED') {
                latestRefFrame.value = null
                interactionError.value = error instanceof Error ? error.message : 'Browser recovery is required.'
                browserMode.value = { ...browserMode.value, enabled: true, status: 'recovery_required' }
                return { status: 'recovery_required' as const }
            }
            interactionError.value = error instanceof Error ? error.message : 'TALOS could not execute the semantic browser interaction.'
            throw error
        } finally {
            if (scopeIsCurrent(talosSessionId, revision)) interactionPending.value = false
        }
    }

    async function confirmScreenshotInteraction(decision: 'approve' | 'reject') {
        if (interactionPending.value) throw new Error('A browser interaction is already in progress.')
        const approval = pendingInteractionApproval.value
        const binding = pendingInteractionApprovalBinding.value
        const session = activeSession.value
        if (!approval || !binding || !session || !approvalBindingMatchesSession(binding, session)) {
            clearPendingInteractionApproval()
            throw new Error('No browser interaction is awaiting confirmation.')
        }
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
            clearPendingInteractionApproval()
            if (response.data.interaction.status === 'rejected') {
                setBrowserMode(true, session)
                return response.data.interaction
            }
            await applyFrameExecution(response.data, talosSessionId, revision)

            return { status: 'executed' as const, ...response.data.interaction, screenshot: response.data.screenshot, snapshot: response.data.snapshot }
        } catch (error) {
            const code = interactionErrorCode(error)
            if (['TALOS_BROWSER_FRAME_STALE', 'TALOS_BROWSER_TARGET_STALE', 'TALOS_BROWSER_STALE_STATE', 'TALOS_BROWSER_HMI_APPROVAL_EXPIRED', 'TALOS_BROWSER_HMI_APPROVAL_CONSUMED'].includes(code ?? '')) {
                clearPendingInteractionApproval()
                await refreshAfterStale(session.id)
                return { status: 'stale' as const }
            }
            if (code === 'TALOS_BROWSER_HMI_RECOVERY_REQUIRED') {
                clearPendingInteractionApproval()
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
        browseSetupFault,
        browserActivities,
        latestScreenshot,
        latestSnapshot,
        latestRefFrame,
        refTargetsLoading,
        refTargetsError,
        browserTasks,
        activeBrowserTask,
        recoverableBrowserTask,
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
        recoverBrowserTask,
        recoverActiveBrowserTask,
        loadSessions,
        selectSession,
        createSession,
        enableBrowse,
        disableBrowse,
        startFreshSession,
        restartSession,
        navigate,
        captureScreenshot,
        captureSnapshot,
        closeSession,
        scrollScreenshot,
        interactWithScreenshot,
        interactWithRef,
        confirmScreenshotInteraction,
    }
}

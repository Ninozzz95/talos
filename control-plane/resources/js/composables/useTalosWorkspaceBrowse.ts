import { computed, ref, watch, type Ref } from 'vue'
import { useTalosBrowse } from './useTalosBrowse'
import type {
    TalosBrowserActivity,
    TalosBrowserCurrentPage,
    TalosBrowserPointerFrame,
    TalosBrowserRefInteraction,
    TalosBrowserRecoveryAction,
    TalosBrowserScrollFrame,
} from '../lib/talosTypes'

type TalosBrowsePersistence = {
    shouldRestore?: (talosSessionId: string) => boolean
    persistEnabled?: (talosSessionId: string, enabled: boolean) => Promise<void>
}

export function useTalosWorkspaceBrowse(
    initiallyEnabled: boolean,
    uiError: Ref<string | null>,
    activeTalosSessionId: Ref<string | null>,
    ensureTalosSessionId: () => Promise<string>,
    persistence: TalosBrowsePersistence = {},
    options: {
        devBrowserEvidence?: boolean
        taskActivity?: Readonly<Ref<boolean>>
        taskPollingIntervalMs?: number
    } = {},
) {
    const enabled = ref(initiallyEnabled)
    const browse = useTalosBrowse({ devBrowserEvidence: options.devBrowserEvidence === true })
    const chatActivities = ref<TalosBrowserActivity[]>([])
    let workspaceScopeRevision = 0
    const isBrowseSurface = computed(() => enabled.value)
    const browserContextEligible = computed(() => Boolean(
        enabled.value
        && browse.activeSession.value
        && ['ready', 'active'].includes(browse.activeSession.value.status)
        && browse.activeSession.value.last_snapshot_artifact_id
        && browse.latestSnapshot.value?.snapshot,
    ))
    const browserContext = computed(() => {
        if (!browserContextEligible.value || !browse.activeSession.value) return null
        try {
            const url = new URL(browse.activeSession.value.current_url ?? browse.latestSnapshot.value?.snapshot?.url ?? '')
            return { host: url.host, title: browse.activeSession.value.current_title || browse.latestSnapshot.value?.snapshot?.title || 'Captured page' }
        } catch {
            return { host: 'Captured page', title: browse.activeSession.value.current_title || 'Browser evidence' }
        }
    })
    const browserCurrentPage = computed<TalosBrowserCurrentPage | null>(() => {
        const session = browse.activeSession.value
        const url = session?.current_url?.trim()
        if (!session || !url) return null

        try {
            const parsed = new URL(url)
            return {
                host: parsed.host,
                title: session.current_title?.trim() || parsed.host,
                url,
            }
        } catch {
            return {
                host: 'Current page',
                title: session.current_title?.trim() || 'Current page',
                url,
            }
        }
    })
    const visibleActivities = computed(() => {
        const activeBrowserSessionId = browse.activeSession.value?.id ?? null
        const activities = new Map<string, TalosBrowserActivity>()
        for (const activity of [...browse.browserActivities.value, ...chatActivities.value]) {
            if (!activeBrowserSessionId || activity.browser_session_id !== activeBrowserSessionId) continue
            activities.set(activity.id, activity)
        }
        return [...activities.values()]
    })
    const browserRecoveryAction = computed<TalosBrowserRecoveryAction>(() => {
        const status = browse.browserMode.value.status
        if (status === 'recovery_required' && browse.recoverableBrowserTask.value) return 'recover_task'
        if (['recovery_required', 'stopped', 'failed'].includes(status)) return 'start_fresh'
        return 'restart'
    })

    watch(activeTalosSessionId, (nextSessionId) => {
        workspaceScopeRevision += 1
        browse.bindTalosSession(nextSessionId)
        chatActivities.value = []
        enabled.value = false
    }, { flush: 'sync' })

    async function ensureBoundChat() {
        const talosSessionId = activeTalosSessionId.value ?? await ensureTalosSessionId()
        browse.bindTalosSession(talosSessionId)
        return talosSessionId
    }

    async function currentOperationScope() {
        const talosSessionId = await ensureBoundChat()
        return { talosSessionId, revision: workspaceScopeRevision }
    }

    function operationScopeIsCurrent(scope: { talosSessionId: string; revision: number }) {
        return activeTalosSessionId.value === scope.talosSessionId
            && workspaceScopeRevision === scope.revision
    }

    function shouldRestore(talosSessionId: string) {
        return persistence.shouldRestore?.(talosSessionId) === true
    }

    async function rememberEnabled(talosSessionId: string, value: boolean) {
        if (!persistence.persistEnabled || shouldRestore(talosSessionId) === value) return

        try {
            await persistence.persistEnabled(talosSessionId, value)
        } catch (error) {
            uiError.value = error instanceof Error
                ? `Browse is ${value ? 'active' : 'disabled'}, but its preference was not saved. ${error.message}`
                : 'TALOS could not save the Browse preference for this chat.'
        }
    }

    async function toggle() {
        if (enabled.value) {
            const talosSessionId = activeTalosSessionId.value
            enabled.value = false
            browse.disableBrowse()
            if (talosSessionId) await rememberEnabled(talosSessionId, false)
            return
        }
        uiError.value = null
        let scope: { talosSessionId: string; revision: number } | null = null
        try {
            scope = await currentOperationScope()
            await browse.enableBrowse()
            if (!operationScopeIsCurrent(scope)) return
            enabled.value = true
            await rememberEnabled(scope.talosSessionId, true)
        } catch (error) {
            if (scope && !operationScopeIsCurrent(scope)) return
            enabled.value = false
            uiError.value = error instanceof Error ? error.message : 'TALOS could not enable Browse.'
        }
    }
    async function enable() {
        if (!enabled.value) await toggle()
    }
    async function disable() {
        const talosSessionId = activeTalosSessionId.value
        enabled.value = false
        browse.disableBrowse()
        if (talosSessionId) await rememberEnabled(talosSessionId, false)
    }
    async function restart() {
        let scope: { talosSessionId: string; revision: number } | null = null
        try {
            scope = await currentOperationScope()
            chatActivities.value = []
            await browse.restartSession()
            if (!operationScopeIsCurrent(scope)) return
            enabled.value = true
            await rememberEnabled(scope.talosSessionId, true)
        } catch (error) {
            if (scope && !operationScopeIsCurrent(scope)) return
            uiError.value = error instanceof Error ? error.message : 'TALOS could not restart Browse.'
        }
    }
    async function recover() {
        let scope: { talosSessionId: string; revision: number } | null = null
        try {
            scope = await currentOperationScope()
            const action = browserRecoveryAction.value
            if (action === 'recover_task') {
                await browse.recoverActiveBrowserTask()
            } else if (action === 'start_fresh') {
                chatActivities.value = []
                await browse.startFreshSession()
            } else {
                return
            }
            if (!operationScopeIsCurrent(scope)) return
            enabled.value = true
            await rememberEnabled(scope.talosSessionId, true)
        } catch (error) {
            if (scope && !operationScopeIsCurrent(scope)) return
            uiError.value = error instanceof Error ? error.message : 'TALOS could not recover Browse.'
        }
    }
    async function stop() {
        let scope: { talosSessionId: string; revision: number } | null = null
        try {
            scope = await currentOperationScope()
            if (!browse.activeSession.value || !['ready', 'active'].includes(browse.activeSession.value.status)) return
            await browse.closeSession()
            if (!operationScopeIsCurrent(scope)) return
            enabled.value = true
            await rememberEnabled(scope.talosSessionId, true)
        } catch (error) {
            if (scope && !operationScopeIsCurrent(scope)) return
            uiError.value = error instanceof Error ? error.message : 'TALOS could not stop Browse.'
        }
    }
    async function screenshot() {
        let scope: { talosSessionId: string; revision: number } | null = null
        try {
            scope = await currentOperationScope()
            if (!browse.activeSession.value) await browse.enableBrowse()
            if (!operationScopeIsCurrent(scope)) return
            enabled.value = true
            await browse.captureScreenshot()
            await rememberEnabled(scope.talosSessionId, true)
        } catch (error) {
            if (scope && !operationScopeIsCurrent(scope)) return
            uiError.value = error instanceof Error ? error.message : 'TALOS could not capture a browser screenshot.'
        }
    }
    async function snapshot() {
        let scope: { talosSessionId: string; revision: number } | null = null
        try {
            scope = await currentOperationScope()
            if (!browse.activeSession.value) await browse.enableBrowse()
            if (!operationScopeIsCurrent(scope)) return
            enabled.value = true
            await browse.captureSnapshot()
            await rememberEnabled(scope.talosSessionId, true)
        } catch (error) {
            if (scope && !operationScopeIsCurrent(scope)) return
            uiError.value = error instanceof Error ? error.message : 'TALOS could not capture browser structure.'
        }
    }
    async function open(url: string | null) {
        let scope: { talosSessionId: string; revision: number } | null = null
        try {
            scope = await currentOperationScope()
            if (!enabled.value) await browse.enableBrowse()
            if (!operationScopeIsCurrent(scope)) return
            enabled.value = true
            if (url) await browse.navigate(url)
            await rememberEnabled(scope.talosSessionId, true)
        } catch (error) {
            if (scope && !operationScopeIsCurrent(scope)) return
            uiError.value = error instanceof Error ? error.message : 'TALOS could not open the requested browser URL.'
        }
    }
    const stateRelevantOperations = new Set(['navigate', 'snapshot', 'screenshot', 'read'])
    const committedHmiOperations = new Set(['click', 'upload'])

    function activityIsStateRelevant(activity: TalosBrowserActivity) {
        if (stateRelevantOperations.has(activity.operation)) return true
        return committedHmiOperations.has(activity.operation) && activity.status === 'succeeded'
    }

    async function recordActivities(value: unknown): Promise<void> {
        if (!Array.isArray(value)) return
        const activeBrowserSessionId = browse.activeSession.value?.id ?? null
        if (!activeBrowserSessionId) return
        const activities = new Map(chatActivities.value.map((activity) => [activity.id, activity]))
        const accepted: TalosBrowserActivity[] = []
        for (const activity of value) {
            if (activity
                && typeof activity === 'object'
                && typeof (activity as Record<string, unknown>).id === 'string'
                && (activity as Record<string, unknown>).browser_session_id === activeBrowserSessionId) {
                const candidate = activity as TalosBrowserActivity
                if (!activities.has(candidate.id)) accepted.push(candidate)
                activities.set(candidate.id, candidate)
            }
        }
        chatActivities.value = [...activities.values()]
        if (!accepted.some(activityIsStateRelevant)) return

        const scope = { talosSessionId: activeTalosSessionId.value, revision: workspaceScopeRevision }
        const scopeStillCurrent = () => activeTalosSessionId.value === scope.talosSessionId
            && workspaceScopeRevision === scope.revision
        try {
            await browse.selectSession(activeBrowserSessionId)
        } catch (error) {
            if (!scopeStillCurrent()) return
            throw new Error(error instanceof Error
                ? `Browser evidence was saved, but TALOS could not refresh the Browser session. ${error.message}`
                : 'Browser evidence was saved, but TALOS could not refresh the Browser session.')
        }
    }
    async function restoreForActiveSession(force = false) {
        let scope: { talosSessionId: string; revision: number } | null = null
        try {
            let talosSessionId = activeTalosSessionId.value
            if (!talosSessionId && force) {
                talosSessionId = await ensureTalosSessionId()
            }
            if (!talosSessionId || (!force && !shouldRestore(talosSessionId))) return
            browse.bindTalosSession(talosSessionId)
            scope = await currentOperationScope()
            await browse.enableBrowse()
            if (!operationScopeIsCurrent(scope)) return
            enabled.value = true
        } catch (error) {
            if (scope && !operationScopeIsCurrent(scope)) return
            enabled.value = false
            uiError.value = error instanceof Error ? error.message : 'TALOS could not load Browse state.'
        }
    }

    async function initialize() {
        await restoreForActiveSession(initiallyEnabled)
        if (!enabled.value || typeof window === 'undefined') return

        const requestedUrl = new URLSearchParams(window.location.search).get('open')
        if (requestedUrl) await browse.navigate(requestedUrl)
        if (initiallyEnabled && activeTalosSessionId.value) {
            await rememberEnabled(activeTalosSessionId.value, true)
        }
        window.history.replaceState({}, '', '/')
    }

    async function interactWithBrowserFrame(frame: TalosBrowserPointerFrame) {
        return browse.interactWithScreenshot(frame)
    }

    async function scrollBrowserFrame(frame: TalosBrowserScrollFrame) {
        return browse.scrollScreenshot(frame)
    }

    async function interactWithBrowserRef(interaction: TalosBrowserRefInteraction) {
        return browse.interactWithRef(interaction)
    }

    async function confirmBrowserFrameInteraction(decision: 'approve' | 'reject') {
        return browse.confirmScreenshotInteraction(decision)
    }

    async function cancelBrowserTask(taskId: string) {
        return browse.cancelBrowserTask(taskId)
    }

    async function cancelActiveBrowserTask() {
        return browse.cancelActiveBrowserTask()
    }

    if (options.taskActivity) {
        const pollingInterval = Math.max(5, options.taskPollingIntervalMs ?? 750)
        watch(
            [options.taskActivity, enabled, activeTalosSessionId],
            ([requestActive, browseEnabled, talosSessionId], _previous, onCleanup) => {
                if (!talosSessionId) return
                browse.bindTalosSession(talosSessionId)

                let disposed = false
                let timer: ReturnType<typeof setTimeout> | null = null
                const poll = async () => {
                    try {
                        await browse.loadBrowserTasks({ quiet: true })
                    } catch {
                        // Session and chat errors remain independent from the compact task monitor.
                    }
                    if (!disposed && browseEnabled && requestActive) {
                        timer = setTimeout(() => void poll(), pollingInterval)
                    }
                }

                void poll()
                onCleanup(() => {
                    disposed = true
                    if (timer !== null) clearTimeout(timer)
                })
            },
            { immediate: true, flush: 'post' },
        )
    }

    return {
        browseModeEnabled: enabled,
        isBrowseSurface,
        activeBrowserSession: browse.activeSession,
        browserMode: browse.browserMode,
        browseSetupFault: browse.browseSetupFault,
        browserCurrentPage,
        browserContext,
        visibleBrowserActivities: visibleActivities,
        latestBrowserScreenshot: browse.latestScreenshot,
        latestBrowserSnapshot: browse.latestSnapshot,
        browserRefFrame: browse.latestRefFrame,
        browserRefTargetsLoading: browse.refTargetsLoading,
        browserRefTargetsError: browse.refTargetsError,
        browserTasks: browse.browserTasks,
        activeBrowserTask: browse.activeBrowserTask,
        browserRecoveryAction,
        browserTaskBusy: browse.browserTaskBusy,
        browserTaskError: browse.browserTaskError,
        browserTaskCommandTargetId: browse.browserTaskCommandTargetId,
        browserInteractionPending: browse.interactionPending,
        browserInteractionError: browse.interactionError,
        pendingBrowserInteractionApproval: browse.pendingInteractionApproval,
        toggleBrowseMode: toggle,
        handleEnableBrowse: enable,
        handleDisableBrowse: disable,
        handleStopBrowse: stop,
        handleRestartBrowse: restart,
        handleRecoverBrowse: recover,
        handleCaptureScreenshot: screenshot,
        handleCaptureSnapshot: snapshot,
        openBrowse: open,
        recordBrowserActivities: recordActivities,
        restoreBrowseForActiveSession: restoreForActiveSession,
        initializeBrowse: initialize,
        interactWithBrowserFrame,
        interactWithBrowserRef,
        scrollBrowserFrame,
        confirmBrowserFrameInteraction,
        cancelBrowserTask,
        cancelActiveBrowserTask,
    }
}

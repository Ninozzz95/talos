import { computed, ref, watch, type Ref } from 'vue'
import { useTalosBrowse } from './useTalosBrowse'
import type { TalosBrowserActivity, TalosBrowserCurrentPage, TalosBrowserPointerFrame } from '../lib/talosTypes'

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
    options: { devBrowserEvidence?: boolean } = {},
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
    function recordActivities(value: unknown) {
        if (!Array.isArray(value)) return
        const activeBrowserSessionId = browse.activeSession.value?.id ?? null
        if (!activeBrowserSessionId) return
        const activities = new Map(chatActivities.value.map((activity) => [activity.id, activity]))
        for (const activity of value) {
            if (activity
                && typeof activity === 'object'
                && typeof (activity as Record<string, unknown>).id === 'string'
                && (activity as Record<string, unknown>).browser_session_id === activeBrowserSessionId) {
                activities.set((activity as TalosBrowserActivity).id, activity as TalosBrowserActivity)
            }
        }
        chatActivities.value = [...activities.values()]
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

    async function confirmBrowserFrameInteraction(decision: 'approve' | 'reject') {
        return browse.confirmScreenshotInteraction(decision)
    }

    return {
        browseModeEnabled: enabled,
        isBrowseSurface,
        activeBrowserSession: browse.activeSession,
        browserMode: browse.browserMode,
        browserCurrentPage,
        browserContext,
        visibleBrowserActivities: visibleActivities,
        latestBrowserScreenshot: browse.latestScreenshot,
        latestBrowserSnapshot: browse.latestSnapshot,
        browserInteractionPending: browse.interactionPending,
        browserInteractionError: browse.interactionError,
        pendingBrowserInteractionApproval: browse.pendingInteractionApproval,
        toggleBrowseMode: toggle,
        handleEnableBrowse: enable,
        handleDisableBrowse: disable,
        handleStopBrowse: stop,
        handleRestartBrowse: restart,
        handleCaptureScreenshot: screenshot,
        handleCaptureSnapshot: snapshot,
        openBrowse: open,
        recordBrowserActivities: recordActivities,
        restoreBrowseForActiveSession: restoreForActiveSession,
        initializeBrowse: initialize,
        interactWithBrowserFrame,
        confirmBrowserFrameInteraction,
    }
}

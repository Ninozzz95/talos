import { computed, ref, type Ref } from 'vue'
import { useTalosBrowse } from './useTalosBrowse'
import type { TalosBrowserActivity } from '../lib/talosTypes'

export function useTalosWorkspaceBrowse(initiallyEnabled: boolean, uiError: Ref<string | null>) {
    const enabled = ref(initiallyEnabled)
    const browse = useTalosBrowse()
    const chatActivities = ref<TalosBrowserActivity[]>([])
    const isBrowseSurface = computed(() => enabled.value)
    const browserContextEligible = computed(() => Boolean(
        enabled.value
        && browse.activeSession.value
        && ['ready', 'active'].includes(browse.activeSession.value.status)
        && browse.activeSession.value.last_snapshot_artifact_id
        && browse.latestSnapshot.value,
    ))
    const browserContext = computed(() => {
        if (!browserContextEligible.value || !browse.activeSession.value) return null
        try {
            const url = new URL(browse.activeSession.value.current_url ?? browse.latestSnapshot.value?.snapshot.url ?? '')
            return { host: url.host, title: browse.activeSession.value.current_title || browse.latestSnapshot.value?.snapshot.title || 'Captured page' }
        } catch {
            return { host: 'Captured page', title: browse.activeSession.value.current_title || 'Browser evidence' }
        }
    })
    const visibleActivities = computed(() => {
        const activities = new Map<string, TalosBrowserActivity>()
        for (const activity of [...browse.browserActivities.value, ...chatActivities.value]) activities.set(activity.id, activity)
        return [...activities.values()]
    })

    async function toggle() {
        if (enabled.value) {
            enabled.value = false
            browse.disableBrowse()
            return
        }
        uiError.value = null
        try {
            await browse.enableBrowse()
            enabled.value = true
        } catch (error) {
            enabled.value = true
            uiError.value = error instanceof Error ? error.message : 'TALOS could not enable Browse.'
        }
    }
    async function enable() {
        if (!enabled.value) await toggle()
    }
    function disable() {
        enabled.value = false
        browse.disableBrowse()
    }
    async function restart() {
        try {
            await browse.restartSession()
            enabled.value = true
        } catch (error) {
            uiError.value = error instanceof Error ? error.message : 'TALOS could not restart Browse.'
        }
    }
    async function screenshot() {
        try {
            await browse.captureScreenshot()
        } catch (error) {
            uiError.value = error instanceof Error ? error.message : 'TALOS could not capture a browser screenshot.'
        }
    }
    async function snapshot() {
        try {
            await browse.captureSnapshot()
        } catch (error) {
            uiError.value = error instanceof Error ? error.message : 'TALOS could not capture browser structure.'
        }
    }
    async function open(url: string | null) {
        try {
            if (!enabled.value) await browse.enableBrowse()
            enabled.value = true
            if (url) await browse.navigate(url)
        } catch (error) {
            uiError.value = error instanceof Error ? error.message : 'TALOS could not open the requested browser URL.'
        }
    }
    function recordActivities(value: unknown) {
        if (!Array.isArray(value)) return
        const activities = new Map(chatActivities.value.map((activity) => [activity.id, activity]))
        for (const activity of value) {
            if (activity && typeof activity === 'object' && typeof (activity as Record<string, unknown>).id === 'string') {
                activities.set((activity as TalosBrowserActivity).id, activity as TalosBrowserActivity)
            }
        }
        chatActivities.value = [...activities.values()]
    }
    async function initialize() {
        try {
            await browse.loadSessions()
            if (!initiallyEnabled) return
            await browse.enableBrowse()
            enabled.value = true
            const requestedUrl = new URLSearchParams(window.location.search).get('open')
            if (requestedUrl) await browse.navigate(requestedUrl)
            window.history.replaceState({}, '', '/')
        } catch (error) {
            if (initiallyEnabled) enabled.value = true
            uiError.value = error instanceof Error ? error.message : 'TALOS could not load Browse state.'
        }
    }

    return {
        browseModeEnabled: enabled,
        isBrowseSurface,
        activeBrowserSession: browse.activeSession,
        browserMode: browse.browserMode,
        browserContext,
        visibleBrowserActivities: visibleActivities,
        toggleBrowseMode: toggle,
        handleEnableBrowse: enable,
        handleDisableBrowse: disable,
        handleRestartBrowse: restart,
        handleCaptureScreenshot: screenshot,
        handleCaptureSnapshot: snapshot,
        openBrowse: open,
        recordBrowserActivities: recordActivities,
        initializeBrowse: initialize,
    }
}

import { computed, getCurrentScope, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import {
    TALOS_WINDOW_LAYOUT_V1_KEY,
    TALOS_WINDOW_LAYOUT_V2_KEY,
    createTalosWindowManagerState,
    projectTalosWindowLayout,
    readTalosWindowLayout,
    reduceTalosWindowState,
    type TalosPersistedWindowLayoutV2,
    type TalosWindowArea,
    type TalosWindowBounds,
    type TalosWindowBreakpoint,
} from '../lib/talosWindowManager'
import {
    TALOS_WINDOW_IDS,
    type TalosWindowId,
    type TalosWindowPosition,
    type TalosWindowSize,
} from '../lib/talosWindowRegistry'

export type UseTalosWindowManagerOptions = {
    area?: MaybeRefOrGetter<TalosWindowArea>
    breakpoint?: MaybeRefOrGetter<TalosWindowBreakpoint>
}

function viewportBreakpoint(width: number): TalosWindowBreakpoint {
    if (width < 1024) return 'mobile'
    if (width < 1280) return 'tablet'
    return 'desktop'
}

function browserArea(): TalosWindowArea {
    const width = typeof window === 'undefined' ? 1440 : window.innerWidth
    const height = typeof window === 'undefined' ? 900 : window.innerHeight
    return { left: 0, top: 56, right: width, bottom: Math.max(57, height - 176) }
}

function readBrowserLayout(area: TalosWindowArea): TalosPersistedWindowLayoutV2 {
    if (typeof window === 'undefined') {
        return readTalosWindowLayout(null, null, area)
    }
    return readTalosWindowLayout(
        window.localStorage.getItem(TALOS_WINDOW_LAYOUT_V2_KEY),
        window.localStorage.getItem(TALOS_WINDOW_LAYOUT_V1_KEY),
        area,
    )
}

export function useTalosWindowManager(
    initialOpen: TalosWindowId[] = [],
    options: UseTalosWindowManagerOptions = {},
) {
    const fallbackArea = ref(browserArea())
    const fallbackBreakpoint = ref<TalosWindowBreakpoint>(viewportBreakpoint(fallbackArea.value.right))
    const currentArea = () => toValue(options.area ?? fallbackArea)
    const currentBreakpoint = () => toValue(options.breakpoint ?? fallbackBreakpoint)
    let persistedLayout = readBrowserLayout(currentArea())
    const state = ref(createTalosWindowManagerState(initialOpen, currentBreakpoint(), currentArea(), persistedLayout))
    let returnFocusSequence = 0

    if ((!options.area || !options.breakpoint) && typeof window !== 'undefined') {
        const handleResize = () => {
            fallbackArea.value = browserArea()
            fallbackBreakpoint.value = viewportBreakpoint(window.innerWidth)
        }
        window.addEventListener('resize', handleResize)
        if (getCurrentScope()) onScopeDispose(() => window.removeEventListener('resize', handleResize))
    }

    function dispatch(action: Parameters<typeof reduceTalosWindowState>[1]) {
        state.value = reduceTalosWindowState(state.value, action)
    }

    watch(
        [currentArea, currentBreakpoint],
        ([area, breakpoint]) => {
            if (breakpoint !== state.value.breakpoint) {
                persistedLayout = projectTalosWindowLayout(state.value, persistedLayout)
                const visibleIds = TALOS_WINDOW_IDS.filter((id) => state.value.windows[id].visibility === 'open')
                const activeId = state.value.activeWindowId
                const orderedVisibleIds = activeId && visibleIds.includes(activeId)
                    ? [activeId, ...visibleIds.filter((id) => id !== activeId)]
                    : visibleIds
                let nextState = createTalosWindowManagerState(orderedVisibleIds, breakpoint, area, persistedLayout)
                if (activeId && nextState.windows[activeId].visibility === 'open') {
                    nextState = reduceTalosWindowState(nextState, { type: 'focus', id: activeId })
                }
                state.value = nextState
                return
            }
            dispatch({ type: 'reconcile-area', area })
        },
        { deep: true },
    )

    const openWindowIds = computed(() => TALOS_WINDOW_IDS.filter((id) => state.value.windows[id].visibility !== 'closed'))
    const visibleWindowIds = computed(() => TALOS_WINDOW_IDS.filter((id) => state.value.windows[id].visibility === 'open'))
    const minimizedWindowIds = computed(() => TALOS_WINDOW_IDS.filter((id) => state.value.windows[id].visibility === 'minimized'))
    const dockedWindowIds = computed(() => TALOS_WINDOW_IDS.filter((id) => state.value.windows[id].visibility === 'open' && state.value.windows[id].presentation === 'docked'))
    const fullscreenWindowIds = computed(() => TALOS_WINDOW_IDS.filter((id) => state.value.windows[id].visibility === 'open' && state.value.windows[id].presentation === 'maximized'))
    const activeWindowId = computed(() => state.value.activeWindowId)
    const windowPositions = computed(() => Object.fromEntries(TALOS_WINDOW_IDS.map((id) => [id, {
        x: state.value.windows[id].bounds.x,
        y: state.value.windows[id].bounds.y,
    }])) as Record<TalosWindowId, TalosWindowPosition>)
    const windowSizes = computed(() => Object.fromEntries(TALOS_WINDOW_IDS.map((id) => [id, {
        width: state.value.windows[id].bounds.width,
        height: state.value.windows[id].bounds.height,
    }])) as Record<TalosWindowId, TalosWindowSize>)
    const windowZIndexes = computed(() => Object.fromEntries(TALOS_WINDOW_IDS.map((id) => [id, state.value.windows[id].zIndex])) as Record<TalosWindowId, number>)

    function captureReturnFocusId(windowId: TalosWindowId) {
        if (typeof document === 'undefined' || !(document.activeElement instanceof HTMLElement)) return null
        const target = document.activeElement
        if (target === document.body || target === document.documentElement) return null
        if (!target.id) {
            let candidate = ''
            do {
                returnFocusSequence += 1
                candidate = `talos-window-return-${windowId}-${returnFocusSequence}`
            } while (document.getElementById(candidate))
            target.id = candidate
        }
        return target.id
    }

    function restoreFocus(id: string | null) {
        if (!id || typeof document === 'undefined') return
        void Promise.resolve().then(() => document.getElementById(id)?.focus())
    }

    function openWindow(id: TalosWindowId) {
        dispatch({ type: 'open', id, returnFocusId: captureReturnFocusId(id) })
    }

    function closeWindow(id: TalosWindowId) {
        const returnFocusId = state.value.windows[id].returnFocusId
        dispatch({ type: 'close', id })
        restoreFocus(returnFocusId)
    }

    function minimizeWindow(id: TalosWindowId) {
        const returnFocusId = state.value.windows[id].returnFocusId
        dispatch({ type: 'minimize', id })
        restoreFocus(returnFocusId)
    }

    function toggleDock(id: TalosWindowId) {
        dispatch({ type: 'toggle-dock', id })
        saveWindowLayout()
    }

    function toggleFullscreenWindow(id: TalosWindowId) {
        if (state.value.windows[id].visibility === 'closed') openWindow(id)
        dispatch({ type: 'toggle-maximize', id })
        saveWindowLayout()
    }

    function exitFullscreenWindow(id: TalosWindowId) {
        if (state.value.windows[id].presentation === 'maximized') {
            dispatch({ type: 'toggle-maximize', id })
            saveWindowLayout()
        }
    }

    function focusWindow(id: TalosWindowId) {
        dispatch({ type: 'focus', id })
    }

    function setWindowPosition(id: TalosWindowId, position: TalosWindowPosition) {
        dispatch({ type: 'move', id, position })
    }

    function setWindowSize(id: TalosWindowId, size: TalosWindowSize) {
        dispatch({ type: 'resize', id, size })
    }

    function setWindowBounds(id: TalosWindowId, bounds: TalosWindowBounds) {
        dispatch({ type: 'set-bounds', id, bounds })
    }

    function resetWindowSize(id: TalosWindowId) {
        dispatch({ type: 'reset', id })
    }

    function restoreWindow(id: TalosWindowId) {
        dispatch({ type: 'restore', id })
    }

    function snapWindow(id: TalosWindowId, side: 'left' | 'right') {
        dispatch({ type: 'snap', id, side })
        saveWindowLayout()
    }

    function reconcileWindowArea(area: TalosWindowArea) {
        dispatch({ type: 'reconcile-area', area })
    }

    function saveWindowLayout() {
        persistedLayout = projectTalosWindowLayout(state.value, persistedLayout)
        if (typeof window === 'undefined') return
        window.localStorage.setItem(TALOS_WINDOW_LAYOUT_V2_KEY, JSON.stringify(persistedLayout))
        window.localStorage.removeItem(TALOS_WINDOW_LAYOUT_V1_KEY)
    }

    return {
        state,
        openWindowIds,
        visibleWindowIds,
        minimizedWindowIds,
        dockedWindowIds,
        fullscreenWindowIds,
        activeWindowId,
        windowPositions,
        windowSizes,
        windowZIndexes,
        openWindow,
        closeWindow,
        minimizeWindow,
        toggleDock,
        toggleFullscreenWindow,
        exitFullscreenWindow,
        focusWindow,
        setWindowPosition,
        setWindowSize,
        setWindowBounds,
        resetWindowSize,
        restoreWindow,
        snapWindow,
        reconcileWindowArea,
        saveWindowLayout,
    }
}

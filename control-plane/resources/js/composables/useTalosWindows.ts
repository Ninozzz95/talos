import { computed, ref } from 'vue'

export type TalosWindowId =
    | 'runtime'
    | 'search'
    | 'brain'
    | 'calendar'
    | 'compare'
    | 'model_lab'
    | 'research'
    | 'gallery'
    | 'library'
    | 'notes'
    | 'tasks'
    | 'settings'
    | 'theme'
    | 'doctor'
    | 'tools'

export type TalosWindowPosition = {
    x: number
    y: number
}

export function useTalosWindows(initialOpen: TalosWindowId[] = []) {
    const openWindowIds = ref<TalosWindowId[]>([...initialOpen])
    const minimizedWindowIds = ref<TalosWindowId[]>([])
    const dockedWindowIds = ref<TalosWindowId[]>([])
    const activeWindowId = ref<TalosWindowId | null>(initialOpen[0] ?? null)
    const windowPositions = ref<Partial<Record<TalosWindowId, TalosWindowPosition>>>({})
    const windowZIndexes = ref<Partial<Record<TalosWindowId, number>>>({})
    let nextZIndex = 1

    const visibleWindowIds = computed(() => openWindowIds.value.filter((id) => !minimizedWindowIds.value.includes(id)))

    function openWindow(id: TalosWindowId) {
        if (!openWindowIds.value.includes(id)) {
            openWindowIds.value.push(id)
        }

        minimizedWindowIds.value = minimizedWindowIds.value.filter((item) => item !== id)
        focusWindow(id)
    }

    function closeWindow(id: TalosWindowId) {
        openWindowIds.value = openWindowIds.value.filter((item) => item !== id)
        minimizedWindowIds.value = minimizedWindowIds.value.filter((item) => item !== id)
        dockedWindowIds.value = dockedWindowIds.value.filter((item) => item !== id)

        if (activeWindowId.value === id) {
            activeWindowId.value = visibleWindowIds.value[0] ?? null
        }
    }

    function minimizeWindow(id: TalosWindowId) {
        if (!minimizedWindowIds.value.includes(id)) {
            minimizedWindowIds.value.push(id)
        }

        if (activeWindowId.value === id) {
            activeWindowId.value = visibleWindowIds.value.find((item) => item !== id) ?? null
        }
    }

    function toggleDock(id: TalosWindowId) {
        dockedWindowIds.value = dockedWindowIds.value.includes(id)
            ? dockedWindowIds.value.filter((item) => item !== id)
            : [...dockedWindowIds.value, id]
        focusWindow(id)
    }

    function focusWindow(id: TalosWindowId) {
        activeWindowId.value = id
        windowZIndexes.value = {
            ...windowZIndexes.value,
            [id]: nextZIndex,
        }
        nextZIndex += 1
    }

    function setWindowPosition(id: TalosWindowId, position: TalosWindowPosition) {
        windowPositions.value = {
            ...windowPositions.value,
            [id]: position,
        }
    }

    return {
        openWindowIds,
        visibleWindowIds,
        minimizedWindowIds,
        dockedWindowIds,
        activeWindowId,
        windowPositions,
        windowZIndexes,
        openWindow,
        closeWindow,
        minimizeWindow,
        toggleDock,
        focusWindow,
        setWindowPosition,
    }
}

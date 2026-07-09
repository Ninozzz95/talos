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

export type TalosWindowSize = {
    width: number
    height: number
}

export type TalosWindowLayout = TalosWindowPosition & TalosWindowSize & {
    zIndex: number
    docked: boolean
    minimized: boolean
}

export const TALOS_WINDOW_MIN_SIZES: Record<TalosWindowId, TalosWindowSize> = {
    runtime: { width: 840, height: 560 },
    search: { width: 760, height: 520 },
    brain: { width: 720, height: 520 },
    calendar: { width: 860, height: 620 },
    compare: { width: 760, height: 520 },
    model_lab: { width: 720, height: 520 },
    research: { width: 760, height: 520 },
    gallery: { width: 760, height: 520 },
    library: { width: 760, height: 520 },
    notes: { width: 420, height: 360 },
    tasks: { width: 520, height: 420 },
    settings: { width: 760, height: 520 },
    theme: { width: 560, height: 340 },
    doctor: { width: 760, height: 520 },
    tools: { width: 720, height: 520 },
}

export const TALOS_WINDOW_DEFAULT_SIZES: Record<TalosWindowId, TalosWindowSize> = {
    runtime: { width: 900, height: 580 },
    search: { width: 820, height: 540 },
    brain: { width: 760, height: 540 },
    calendar: { width: 900, height: 640 },
    compare: { width: 820, height: 540 },
    model_lab: { width: 760, height: 540 },
    research: { width: 820, height: 540 },
    gallery: { width: 820, height: 540 },
    library: { width: 820, height: 540 },
    notes: { width: 520, height: 420 },
    tasks: { width: 620, height: 460 },
    settings: { width: 820, height: 560 },
    theme: { width: 760, height: 360 },
    doctor: { width: 820, height: 560 },
    tools: { width: 780, height: 540 },
}

const WINDOW_LAYOUT_STORAGE_KEY = 'talos.windowLayout.v1'

type StoredWindowLayout = {
    positions?: Partial<Record<TalosWindowId, TalosWindowPosition>>
    sizes?: Partial<Record<TalosWindowId, TalosWindowSize>>
}

function isWindowId(value: string): value is TalosWindowId {
    return Object.prototype.hasOwnProperty.call(TALOS_WINDOW_DEFAULT_SIZES, value)
}

function numberValue(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readStoredWindowLayout(): StoredWindowLayout {
    if (typeof window === 'undefined') {
        return {}
    }

    try {
        const parsed = JSON.parse(window.localStorage.getItem(WINDOW_LAYOUT_STORAGE_KEY) ?? '{}') as StoredWindowLayout
        const positions: Partial<Record<TalosWindowId, TalosWindowPosition>> = {}
        const sizes: Partial<Record<TalosWindowId, TalosWindowSize>> = {}

        for (const [id, position] of Object.entries(parsed.positions ?? {})) {
            if (!isWindowId(id) || !position) {
                continue
            }

            const x = numberValue((position as TalosWindowPosition).x)
            const y = numberValue((position as TalosWindowPosition).y)

            if (x !== null && y !== null) {
                positions[id] = { x, y }
            }
        }

        for (const [id, size] of Object.entries(parsed.sizes ?? {})) {
            if (!isWindowId(id) || !size) {
                continue
            }

            const width = numberValue((size as TalosWindowSize).width)
            const height = numberValue((size as TalosWindowSize).height)

            if (width !== null && height !== null) {
                sizes[id] = { width, height }
            }
        }

        return { positions, sizes }
    } catch {
        return {}
    }
}

export function useTalosWindows(initialOpen: TalosWindowId[] = []) {
    const storedLayout = readStoredWindowLayout()
    const openWindowIds = ref<TalosWindowId[]>([...initialOpen])
    const minimizedWindowIds = ref<TalosWindowId[]>([])
    const dockedWindowIds = ref<TalosWindowId[]>([])
    const activeWindowId = ref<TalosWindowId | null>(initialOpen[0] ?? null)
    const windowPositions = ref<Partial<Record<TalosWindowId, TalosWindowPosition>>>(storedLayout.positions ?? {})
    const windowSizes = ref<Partial<Record<TalosWindowId, TalosWindowSize>>>(storedLayout.sizes ?? {})
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

    function setWindowSize(id: TalosWindowId, size: TalosWindowSize) {
        windowSizes.value = {
            ...windowSizes.value,
            [id]: size,
        }
    }

    function resetWindowSize(id: TalosWindowId) {
        const nextSizes = { ...windowSizes.value }
        delete nextSizes[id]
        windowSizes.value = nextSizes
    }

    function saveWindowLayout() {
        if (typeof window === 'undefined') {
            return
        }

        window.localStorage.setItem(WINDOW_LAYOUT_STORAGE_KEY, JSON.stringify({
            positions: windowPositions.value,
            sizes: windowSizes.value,
        }))
    }

    return {
        openWindowIds,
        visibleWindowIds,
        minimizedWindowIds,
        dockedWindowIds,
        activeWindowId,
        windowPositions,
        windowSizes,
        windowZIndexes,
        openWindow,
        closeWindow,
        minimizeWindow,
        toggleDock,
        focusWindow,
        setWindowPosition,
        setWindowSize,
        resetWindowSize,
        saveWindowLayout,
    }
}

import {
    TALOS_WINDOW_DEFAULT_SIZES,
    TALOS_WINDOW_IDS,
    TALOS_WINDOW_MIN_SIZES,
    isTalosWindowId,
    type TalosWindowId,
    type TalosWindowPosition,
    type TalosWindowSize,
} from './talosWindowRegistry'

export const TALOS_WINDOW_LAYOUT_V1_KEY = 'talos.windowLayout.v1'
export const TALOS_WINDOW_LAYOUT_V2_KEY = 'talos.windowLayout.v2'

export type TalosWindowBreakpoint = 'desktop' | 'tablet' | 'mobile'
export type TalosWindowVisibility = 'closed' | 'open' | 'minimized'
export type TalosWindowPresentation = 'floating' | 'docked' | 'maximized' | 'mobile-sheet'
export type TalosPersistedWindowPresentation = Exclude<TalosWindowPresentation, 'mobile-sheet'>

export type TalosWindowArea = {
    left: number
    top: number
    right: number
    bottom: number
}

export type TalosWindowBounds = TalosWindowPosition & TalosWindowSize

export type TalosWindowLaunchOrigin = {
    x: number
    y: number
    source: 'sidebar' | 'command' | 'dock' | 'default'
}

export type TalosManagedWindowState = {
    id: TalosWindowId
    visibility: TalosWindowVisibility
    presentation: TalosWindowPresentation
    previousPresentation: TalosPersistedWindowPresentation
    bounds: TalosWindowBounds
    restoreBounds: TalosWindowBounds | null
    zIndex: number
    launchOrigin: TalosWindowLaunchOrigin | null
    returnFocusId: string | null
}

export type TalosWindowManagerState = {
    schemaVersion: 2
    breakpoint: TalosWindowBreakpoint
    area: TalosWindowArea
    activeWindowId: TalosWindowId | null
    windows: Record<TalosWindowId, TalosManagedWindowState>
}

export type TalosPersistedWindowState = {
    bounds: TalosWindowBounds
    presentation: TalosPersistedWindowPresentation
    restore_bounds?: TalosWindowBounds | null
}

export type TalosPersistedWindowBucket = {
    windows: Partial<Record<TalosWindowId, TalosPersistedWindowState>>
    active_window_id?: TalosWindowId | null
}

export type TalosPersistedWindowLayoutV2 = {
    schema_version: 2
    layouts: {
        desktop: TalosPersistedWindowBucket
        tablet: TalosPersistedWindowBucket
    }
}

export type TalosWindowAction =
    | { type: 'open'; id: TalosWindowId; launchOrigin?: TalosWindowLaunchOrigin; returnFocusId?: string | null }
    | { type: 'close'; id: TalosWindowId }
    | { type: 'minimize'; id: TalosWindowId }
    | { type: 'restore'; id: TalosWindowId }
    | { type: 'focus'; id: TalosWindowId }
    | { type: 'move'; id: TalosWindowId; position: TalosWindowPosition }
    | { type: 'resize'; id: TalosWindowId; size: TalosWindowSize }
    | { type: 'set-bounds'; id: TalosWindowId; bounds: TalosWindowBounds }
    | { type: 'toggle-maximize'; id: TalosWindowId }
    | { type: 'toggle-dock'; id: TalosWindowId }
    | { type: 'snap'; id: TalosWindowId; side: 'left' | 'right' }
    | { type: 'reset'; id: TalosWindowId }
    | { type: 'reconcile-area'; area: TalosWindowArea }
    | { type: 'set-breakpoint'; breakpoint: TalosWindowBreakpoint; area: TalosWindowArea }

function emptyPersistedLayout(): TalosPersistedWindowLayoutV2 {
    return {
        schema_version: 2,
        layouts: {
            desktop: { windows: {} },
            tablet: { windows: {} },
        },
    }
}

function finite(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

function isSheetBreakpoint(breakpoint: TalosWindowBreakpoint) {
    return breakpoint !== 'desktop'
}

function validArea(area: TalosWindowArea): TalosWindowArea {
    const left = finite(area.left) ? area.left : 0
    const top = finite(area.top) ? area.top : 0
    const right = finite(area.right) && area.right > left ? area.right : left + 1
    const bottom = finite(area.bottom) && area.bottom > top ? area.bottom : top + 1
    return { left, top, right, bottom }
}

function fullAreaBounds(area: TalosWindowArea): TalosWindowBounds {
    const normalized = validArea(area)
    return {
        x: normalized.left,
        y: normalized.top,
        width: normalized.right - normalized.left,
        height: normalized.bottom - normalized.top,
    }
}

function clampBounds(id: TalosWindowId, bounds: TalosWindowBounds, area: TalosWindowArea): TalosWindowBounds {
    const normalized = validArea(area)
    const availableWidth = normalized.right - normalized.left
    const availableHeight = normalized.bottom - normalized.top
    const minimum = TALOS_WINDOW_MIN_SIZES[id]
    const minimumWidth = Math.min(minimum.width, availableWidth)
    const minimumHeight = Math.min(minimum.height, availableHeight)
    const width = Math.min(Math.max(bounds.width, minimumWidth), availableWidth)
    const height = Math.min(Math.max(bounds.height, minimumHeight), availableHeight)
    const x = Math.min(Math.max(bounds.x, normalized.left), normalized.right - width)
    const y = Math.min(Math.max(bounds.y, normalized.top), normalized.bottom - height)

    return {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
    }
}

function defaultBounds(id: TalosWindowId, index: number, area: TalosWindowArea): TalosWindowBounds {
    const cascadeIndex = index % 4
    return clampBounds(id, {
        x: area.left + 104 + (cascadeIndex * 24),
        y: area.top + 24 + (cascadeIndex * 24),
        ...TALOS_WINDOW_DEFAULT_SIZES[id],
    }, area)
}

function dockBounds(id: TalosWindowId, area: TalosWindowArea): TalosWindowBounds {
    const availableWidth = area.right - area.left
    const width = Math.min(Math.max(TALOS_WINDOW_MIN_SIZES[id].width, 420), availableWidth)
    return clampBounds(id, {
        x: area.right - width,
        y: area.top,
        width,
        height: area.bottom - area.top,
    }, area)
}

function copyWindows(windows: Record<TalosWindowId, TalosManagedWindowState>) {
    return Object.fromEntries(TALOS_WINDOW_IDS.map((id) => [id, { ...windows[id] }])) as Record<TalosWindowId, TalosManagedWindowState>
}

function fallbackActiveWindow(windows: Record<TalosWindowId, TalosManagedWindowState>) {
    return TALOS_WINDOW_IDS
        .filter((id) => windows[id].visibility === 'open')
        .sort((left, right) => windows[right].zIndex - windows[left].zIndex)[0] ?? null
}

function focusWindow(state: TalosWindowManagerState, id: TalosWindowId): TalosWindowManagerState {
    if (state.windows[id].visibility !== 'open') return state
    const windows = copyWindows(state.windows)
    const ordered = TALOS_WINDOW_IDS
        .filter((windowId) => windows[windowId].visibility === 'open' && windowId !== id)
        .sort((left, right) => windows[left].zIndex - windows[right].zIndex)
    ordered.push(id)
    ordered.forEach((windowId, index) => {
        windows[windowId].zIndex = index + 1
    })
    for (const windowId of TALOS_WINDOW_IDS) {
        if (windows[windowId].visibility !== 'open') windows[windowId].zIndex = 0
    }
    return { ...state, windows, activeWindowId: id }
}

export function createTalosWindowManagerState(
    initialOpen: TalosWindowId[] = [],
    breakpoint: TalosWindowBreakpoint = 'desktop',
    area: TalosWindowArea,
    persistedLayout: TalosPersistedWindowLayoutV2 = emptyPersistedLayout(),
): TalosWindowManagerState {
    const normalizedArea = validArea(area)
    const sheetBreakpoint = isSheetBreakpoint(breakpoint)
    const bucket = breakpoint === 'mobile' ? null : persistedLayout.layouts[breakpoint]
    const initialSet = new Set(initialOpen)
    const windows = Object.fromEntries(TALOS_WINDOW_IDS.map((id, index) => {
        const persisted = bucket?.windows[id]
        const presentation = sheetBreakpoint
            ? 'mobile-sheet'
            : persisted?.presentation ?? 'floating'
        const bounds = sheetBreakpoint
            ? fullAreaBounds(normalizedArea)
            : persisted?.bounds ?? defaultBounds(id, index, normalizedArea)
        return [id, {
            id,
            visibility: initialSet.has(id) ? 'open' : 'closed',
            presentation,
            previousPresentation: 'floating',
            bounds: presentation === 'maximized'
                ? fullAreaBounds(normalizedArea)
                : presentation === 'docked'
                    ? dockBounds(id, normalizedArea)
                    : clampBounds(id, bounds, normalizedArea),
            restoreBounds: persisted?.restore_bounds ? clampBounds(id, persisted.restore_bounds, normalizedArea) : null,
            zIndex: initialSet.has(id) ? index + 1 : 0,
            launchOrigin: null,
            returnFocusId: null,
        } satisfies TalosManagedWindowState]
    })) as Record<TalosWindowId, TalosManagedWindowState>

    let state: TalosWindowManagerState = {
        schemaVersion: 2,
        breakpoint,
        area: normalizedArea,
        activeWindowId: null,
        windows,
    }
    if (sheetBreakpoint && initialOpen.length > 1) {
        for (const id of initialOpen.slice(1)) windows[id].visibility = 'closed'
    }
    const preferred = initialOpen[0] ?? bucket?.active_window_id ?? fallbackActiveWindow(windows)
    if (preferred && windows[preferred].visibility === 'open') state = focusWindow(state, preferred)
    return state
}

export function reduceTalosWindowState(state: TalosWindowManagerState, action: TalosWindowAction): TalosWindowManagerState {
    if (action.type === 'focus') return focusWindow(state, action.id)

    if (action.type === 'open') {
        const windows = copyWindows(state.windows)
        if (isSheetBreakpoint(state.breakpoint)) {
            for (const id of TALOS_WINDOW_IDS) {
                if (id !== action.id && windows[id].visibility === 'open') windows[id].visibility = 'closed'
            }
        }
        const target = windows[action.id]
        target.visibility = 'open'
        target.presentation = isSheetBreakpoint(state.breakpoint)
            ? 'mobile-sheet'
            : target.presentation === 'mobile-sheet' ? target.previousPresentation : target.presentation
        target.bounds = target.presentation === 'mobile-sheet' || target.presentation === 'maximized'
            ? fullAreaBounds(state.area)
            : target.presentation === 'docked'
                ? dockBounds(action.id, state.area)
                : clampBounds(action.id, target.bounds, state.area)
        target.launchOrigin = action.launchOrigin ?? target.launchOrigin
        if ('returnFocusId' in action) target.returnFocusId = action.returnFocusId ?? null
        return focusWindow({ ...state, windows }, action.id)
    }

    if (action.type === 'close' || action.type === 'minimize') {
        const windows = copyWindows(state.windows)
        windows[action.id].visibility = action.type === 'close' ? 'closed' : 'minimized'
        windows[action.id].zIndex = 0
        const activeWindowId = state.activeWindowId === action.id ? fallbackActiveWindow(windows) : state.activeWindowId
        return activeWindowId ? focusWindow({ ...state, windows, activeWindowId }, activeWindowId) : { ...state, windows, activeWindowId: null }
    }

    if (action.type === 'restore') {
        const windows = copyWindows(state.windows)
        const target = windows[action.id]
        target.visibility = 'open'
        if (isSheetBreakpoint(state.breakpoint)) {
            for (const id of TALOS_WINDOW_IDS) {
                if (id !== action.id && windows[id].visibility === 'open') windows[id].visibility = 'closed'
            }
            target.presentation = 'mobile-sheet'
            target.bounds = fullAreaBounds(state.area)
        }
        return focusWindow({ ...state, windows }, action.id)
    }

    if (action.type === 'move' || action.type === 'resize' || action.type === 'set-bounds') {
        const target = state.windows[action.id]
        if (target.visibility !== 'open' || target.presentation !== 'floating') return state
        const windows = copyWindows(state.windows)
        const bounds = action.type === 'set-bounds'
            ? action.bounds
            : {
                ...target.bounds,
                ...(action.type === 'move' ? action.position : action.size),
            }
        windows[action.id].bounds = clampBounds(action.id, bounds, state.area)
        return { ...state, windows }
    }

    if (action.type === 'toggle-maximize') {
        const target = state.windows[action.id]
        if (target.visibility !== 'open' || isSheetBreakpoint(state.breakpoint)) return state
        const windows = copyWindows(state.windows)
        const next = windows[action.id]
        if (target.presentation === 'maximized') {
            next.presentation = target.previousPresentation
            next.bounds = target.restoreBounds ?? defaultBounds(action.id, TALOS_WINDOW_IDS.indexOf(action.id), state.area)
            next.restoreBounds = null
        } else {
            next.restoreBounds = { ...target.bounds }
            next.previousPresentation = target.presentation === 'mobile-sheet' ? 'floating' : target.presentation
            next.presentation = 'maximized'
            next.bounds = fullAreaBounds(state.area)
        }
        return focusWindow({ ...state, windows }, action.id)
    }

    if (action.type === 'toggle-dock') {
        const target = state.windows[action.id]
        if (target.visibility !== 'open' || isSheetBreakpoint(state.breakpoint)) return state
        const windows = copyWindows(state.windows)
        const next = windows[action.id]
        if (target.presentation === 'docked') {
            next.presentation = target.previousPresentation === 'docked' ? 'floating' : target.previousPresentation
            next.bounds = target.restoreBounds ?? defaultBounds(action.id, TALOS_WINDOW_IDS.indexOf(action.id), state.area)
            next.restoreBounds = null
        } else {
            next.restoreBounds = { ...target.bounds }
            next.previousPresentation = target.presentation === 'mobile-sheet' ? 'floating' : target.presentation
            next.presentation = 'docked'
            next.bounds = dockBounds(action.id, state.area)
        }
        return focusWindow({ ...state, windows }, action.id)
    }

    if (action.type === 'snap') {
        const target = state.windows[action.id]
        if (target.visibility !== 'open' || isSheetBreakpoint(state.breakpoint)) return state
        const windows = copyWindows(state.windows)
        const next = windows[action.id]
        if (!next.restoreBounds) next.restoreBounds = { ...target.bounds }
        next.previousPresentation = 'floating'
        next.presentation = 'floating'
        const width = Math.round((state.area.right - state.area.left) / 2)
        next.bounds = clampBounds(action.id, {
            x: action.side === 'left' ? state.area.left : state.area.right - width,
            y: state.area.top,
            width,
            height: state.area.bottom - state.area.top,
        }, state.area)
        return focusWindow({ ...state, windows }, action.id)
    }

    if (action.type === 'reset') {
        const windows = copyWindows(state.windows)
        const target = windows[action.id]
        target.presentation = isSheetBreakpoint(state.breakpoint) ? 'mobile-sheet' : 'floating'
        target.previousPresentation = 'floating'
        target.restoreBounds = null
        target.bounds = isSheetBreakpoint(state.breakpoint)
            ? fullAreaBounds(state.area)
            : defaultBounds(action.id, TALOS_WINDOW_IDS.indexOf(action.id), state.area)
        return { ...state, windows }
    }

    if (action.type === 'reconcile-area') {
        const area = validArea(action.area)
        const windows = copyWindows(state.windows)
        for (const id of TALOS_WINDOW_IDS) {
            const target = windows[id]
            if (target.presentation === 'mobile-sheet' || target.presentation === 'maximized') target.bounds = fullAreaBounds(area)
            else if (target.presentation === 'docked') target.bounds = dockBounds(id, area)
            else target.bounds = clampBounds(id, target.bounds, area)
            if (target.restoreBounds) target.restoreBounds = clampBounds(id, target.restoreBounds, area)
        }
        return { ...state, area, windows }
    }

    if (action.type === 'set-breakpoint') {
        const area = validArea(action.area)
        const windows = copyWindows(state.windows)
        if (isSheetBreakpoint(action.breakpoint)) {
            const active = state.activeWindowId ?? fallbackActiveWindow(windows)
            for (const id of TALOS_WINDOW_IDS) {
                if (windows[id].visibility === 'open' && id !== active) windows[id].visibility = 'closed'
                if (id === active && windows[id].visibility === 'open') {
                    windows[id].previousPresentation = windows[id].presentation === 'mobile-sheet' ? 'floating' : windows[id].presentation
                    windows[id].presentation = 'mobile-sheet'
                    windows[id].bounds = fullAreaBounds(area)
                }
            }
        } else {
            for (const id of TALOS_WINDOW_IDS) {
                if (windows[id].presentation === 'mobile-sheet') windows[id].presentation = windows[id].previousPresentation
                windows[id].bounds = clampBounds(id, windows[id].bounds, area)
            }
        }
        return { ...state, breakpoint: action.breakpoint, area, windows }
    }

    return state
}

function parseBounds(value: unknown): TalosWindowBounds | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    if (!finite(record.x) || !finite(record.y) || !finite(record.width) || !finite(record.height)) return null
    if (record.width <= 0 || record.height <= 0) return null
    return { x: record.x, y: record.y, width: record.width, height: record.height }
}

function parsePresentation(value: unknown): TalosPersistedWindowPresentation | null {
    return value === 'floating' || value === 'docked' || value === 'maximized' ? value : null
}

function sanitizeBucket(value: unknown): TalosPersistedWindowBucket {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { windows: {} }
    const record = value as Record<string, unknown>
    const sourceWindows = record.windows && typeof record.windows === 'object' && !Array.isArray(record.windows)
        ? record.windows as Record<string, unknown>
        : {}
    const windows: Partial<Record<TalosWindowId, TalosPersistedWindowState>> = {}
    for (const [id, rawState] of Object.entries(sourceWindows)) {
        if (!isTalosWindowId(id) || !rawState || typeof rawState !== 'object' || Array.isArray(rawState)) continue
        const stateRecord = rawState as Record<string, unknown>
        const bounds = parseBounds(stateRecord.bounds)
        const presentation = parsePresentation(stateRecord.presentation)
        if (!bounds || !presentation) continue
        const restoreBounds = stateRecord.restore_bounds === null ? null : parseBounds(stateRecord.restore_bounds)
        windows[id] = {
            bounds,
            presentation,
            ...(restoreBounds ? { restore_bounds: restoreBounds } : {}),
        }
    }
    const activeWindowId = typeof record.active_window_id === 'string' && isTalosWindowId(record.active_window_id)
        ? record.active_window_id
        : null
    return {
        windows,
        ...(activeWindowId ? { active_window_id: activeWindowId } : {}),
    }
}

function isPersistedBucketEnvelope(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const windows = (value as Record<string, unknown>).windows
    return Boolean(windows && typeof windows === 'object' && !Array.isArray(windows))
}

function migrateV1(raw: string | null): TalosPersistedWindowLayoutV2 {
    const empty = emptyPersistedLayout()
    if (!raw) return empty
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>
        const positions = parsed.positions && typeof parsed.positions === 'object' && !Array.isArray(parsed.positions)
            ? parsed.positions as Record<string, unknown>
            : {}
        const sizes = parsed.sizes && typeof parsed.sizes === 'object' && !Array.isArray(parsed.sizes)
            ? parsed.sizes as Record<string, unknown>
            : {}
        for (const id of TALOS_WINDOW_IDS) {
            const position = positions[id]
            const size = sizes[id]
            if (!position || !size || typeof position !== 'object' || typeof size !== 'object' || Array.isArray(position) || Array.isArray(size)) continue
            const positionRecord = position as Record<string, unknown>
            const sizeRecord = size as Record<string, unknown>
            const bounds = parseBounds({ x: positionRecord.x, y: positionRecord.y, width: sizeRecord.width, height: sizeRecord.height })
            if (!bounds) continue
            empty.layouts.desktop.windows[id] = { bounds, presentation: 'floating' }
        }
        return empty
    } catch {
        return empty
    }
}

export function readTalosWindowLayout(
    rawV2: string | null,
    rawV1: string | null,
    _area: TalosWindowArea,
): TalosPersistedWindowLayoutV2 {
    if (rawV2) {
        try {
            const parsed = JSON.parse(rawV2) as Record<string, unknown>
            if (parsed.schema_version === 2 && parsed.layouts && typeof parsed.layouts === 'object' && !Array.isArray(parsed.layouts)) {
                const layouts = parsed.layouts as Record<string, unknown>
                if (!isPersistedBucketEnvelope(layouts.desktop) && !isPersistedBucketEnvelope(layouts.tablet)) {
                    return migrateV1(rawV1)
                }
                return {
                    schema_version: 2,
                    layouts: {
                        desktop: sanitizeBucket(layouts.desktop),
                        tablet: sanitizeBucket(layouts.tablet),
                    },
                }
            }
        } catch {
            // Fall through to the read-only V1 migration path.
        }
    }
    return migrateV1(rawV1)
}

export function projectTalosWindowLayout(
    state: TalosWindowManagerState,
    existing: TalosPersistedWindowLayoutV2 = emptyPersistedLayout(),
): TalosPersistedWindowLayoutV2 {
    if (isSheetBreakpoint(state.breakpoint)) return existing
    const windows = Object.fromEntries(TALOS_WINDOW_IDS.map((id) => {
        const target = state.windows[id]
        const presentation: TalosPersistedWindowPresentation = target.presentation === 'mobile-sheet' ? target.previousPresentation : target.presentation
        return [id, {
            bounds: { ...target.bounds },
            presentation,
            ...(target.restoreBounds ? { restore_bounds: { ...target.restoreBounds } } : {}),
        } satisfies TalosPersistedWindowState]
    })) as Record<TalosWindowId, TalosPersistedWindowState>
    return {
        schema_version: 2,
        layouts: {
            ...existing.layouts,
            [state.breakpoint]: {
                windows,
                ...(state.activeWindowId ? { active_window_id: state.activeWindowId } : {}),
            },
        },
    }
}

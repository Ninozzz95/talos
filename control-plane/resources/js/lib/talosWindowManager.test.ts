import { describe, expect, it } from 'vitest'
import {
    TALOS_WINDOW_LAYOUT_V1_KEY,
    TALOS_WINDOW_LAYOUT_V2_KEY,
    createTalosWindowManagerState,
    projectTalosWindowLayout,
    readTalosWindowLayout,
    reduceTalosWindowState,
    type TalosWindowArea,
} from './talosWindowManager'

const area: TalosWindowArea = { left: 240, top: 56, right: 1440, bottom: 720 }

describe('TALOS pure window manager', () => {
    it('runs the open, focus, minimize, restore, and close lifecycle deterministically', () => {
        let state = createTalosWindowManagerState(['runtime'], 'desktop', area)
        expect(state.windows.runtime.visibility).toBe('open')

        state = reduceTalosWindowState(state, { type: 'open', id: 'notes', returnFocusId: 'rail-notes' })
        expect(state.activeWindowId).toBe('notes')
        expect(state.windows.notes.returnFocusId).toBe('rail-notes')

        state = reduceTalosWindowState(state, { type: 'focus', id: 'runtime' })
        expect(state.activeWindowId).toBe('runtime')
        expect(state.windows.runtime.zIndex).toBeGreaterThan(state.windows.notes.zIndex)

        state = reduceTalosWindowState(state, { type: 'minimize', id: 'runtime' })
        expect(state.windows.runtime.visibility).toBe('minimized')
        expect(state.activeWindowId).toBe('notes')

        state = reduceTalosWindowState(state, { type: 'restore', id: 'runtime' })
        expect(state.windows.runtime.visibility).toBe('open')
        expect(state.activeWindowId).toBe('runtime')

        state = reduceTalosWindowState(state, { type: 'close', id: 'runtime' })
        expect(state.windows.runtime.visibility).toBe('closed')
        expect(state.activeWindowId).toBe('notes')
    })

    it('clamps move and resize transitions and ignores them outside floating presentation', () => {
        let state = createTalosWindowManagerState(['notes'], 'desktop', area)
        state = reduceTalosWindowState(state, { type: 'move', id: 'notes', position: { x: -500, y: 900 } })
        expect(state.windows.notes.bounds.x).toBe(area.left)
        expect(state.windows.notes.bounds.y + state.windows.notes.bounds.height).toBeLessThanOrEqual(area.bottom)

        state = reduceTalosWindowState(state, { type: 'resize', id: 'notes', size: { width: 5000, height: 5000 } })
        expect(state.windows.notes.bounds.width).toBe(area.right - area.left)
        expect(state.windows.notes.bounds.height).toBe(area.bottom - area.top)

        state = reduceTalosWindowState(state, { type: 'toggle-maximize', id: 'notes' })
        const maximized = state.windows.notes.bounds
        state = reduceTalosWindowState(state, { type: 'move', id: 'notes', position: { x: 400, y: 200 } })
        expect(state.windows.notes.bounds).toEqual(maximized)
    })

    it('applies resize position and size as one clamped bounds transition', () => {
        let state = createTalosWindowManagerState(['notes'], 'desktop', area)
        state = reduceTalosWindowState(state, {
            type: 'set-bounds',
            id: 'notes',
            bounds: { x: -400, y: 900, width: 900, height: 900 },
        })

        expect(state.windows.notes.bounds.x).toBe(area.left)
        expect(state.windows.notes.bounds.y).toBe(area.top)
        expect(state.windows.notes.bounds.width).toBe(900)
        expect(state.windows.notes.bounds.height).toBe(area.bottom - area.top)
    })

    it('restores prior bounds after maximize and dock and supports left/right snap', () => {
        let state = createTalosWindowManagerState(['tasks'], 'desktop', area)
        const original = state.windows.tasks.bounds

        state = reduceTalosWindowState(state, { type: 'toggle-maximize', id: 'tasks' })
        expect(state.windows.tasks.presentation).toBe('maximized')
        expect(state.windows.tasks.bounds).toEqual({ x: area.left, y: area.top, width: 1200, height: 664 })
        state = reduceTalosWindowState(state, { type: 'toggle-maximize', id: 'tasks' })
        expect(state.windows.tasks.bounds).toEqual(original)

        state = reduceTalosWindowState(state, { type: 'toggle-dock', id: 'tasks' })
        expect(state.windows.tasks.presentation).toBe('docked')
        state = reduceTalosWindowState(state, { type: 'toggle-dock', id: 'tasks' })
        expect(state.windows.tasks.presentation).toBe('floating')
        expect(state.windows.tasks.bounds).toEqual(original)

        state = reduceTalosWindowState(state, { type: 'snap', id: 'tasks', side: 'left' })
        expect(state.windows.tasks.bounds).toEqual({ x: 240, y: 56, width: 600, height: 664 })
        state = reduceTalosWindowState(state, { type: 'snap', id: 'tasks', side: 'right' })
        expect(state.windows.tasks.bounds).toEqual({ x: 840, y: 56, width: 600, height: 664 })
    })

    it('clamps snap before persistence so minimum-size windows reload without shifting', () => {
        const compactArea = { left: 16, top: 24, right: 1012, bottom: 524 }
        let state = createTalosWindowManagerState(['theme'], 'desktop', compactArea)
        state = reduceTalosWindowState(state, { type: 'snap', id: 'theme', side: 'right' })
        const snapped = state.windows.theme.bounds

        expect(snapped).toEqual({ x: 452, y: 24, width: 560, height: 500 })
        const reloaded = createTalosWindowManagerState(['theme'], 'desktop', compactArea, projectTalosWindowLayout(state))
        expect(reloaded.windows.theme.bounds).toEqual(snapped)
    })

    it('normalizes z-order to a bounded sequence after repeated focus', () => {
        let state = createTalosWindowManagerState(['runtime', 'notes', 'tasks'], 'desktop', area)
        for (let index = 0; index < 100; index += 1) {
            state = reduceTalosWindowState(state, { type: 'focus', id: index % 2 === 0 ? 'notes' : 'runtime' })
        }

        const zIndexes = Object.values(state.windows).filter((windowState) => windowState.visibility === 'open').map((windowState) => windowState.zIndex)
        expect(Math.max(...zIndexes)).toBe(3)
        expect(new Set(zIndexes).size).toBe(3)
    })

    it('keeps exactly one active mobile sheet and does not reuse desktop coordinates', () => {
        let state = createTalosWindowManagerState(['runtime'], 'mobile', { left: 0, top: 96, right: 375, bottom: 620 })
        expect(state.windows.runtime.presentation).toBe('mobile-sheet')
        state = reduceTalosWindowState(state, { type: 'open', id: 'theme' })

        expect(state.windows.runtime.visibility).toBe('closed')
        expect(state.windows.theme.visibility).toBe('open')
        expect(state.windows.theme.presentation).toBe('mobile-sheet')
        expect(state.windows.theme.bounds).toEqual({ x: 0, y: 96, width: 375, height: 524 })
    })

    it('uses the same single-sheet contract at the tablet breakpoint', () => {
        let state = createTalosWindowManagerState(['runtime', 'notes'], 'tablet', { left: 236, top: 64, right: 1100, bottom: 640 })

        expect(state.windows.runtime.visibility).toBe('open')
        expect(state.windows.notes.visibility).toBe('closed')
        expect(state.windows.runtime.presentation).toBe('mobile-sheet')
        state = reduceTalosWindowState(state, { type: 'open', id: 'theme' })
        expect(state.windows.runtime.visibility).toBe('closed')
        expect(state.windows.theme.presentation).toBe('mobile-sheet')
    })

    it('reconciles every visible window when the usable area changes', () => {
        let state = createTalosWindowManagerState(['runtime', 'notes'], 'desktop', area)
        state = reduceTalosWindowState(state, {
            type: 'reconcile-area',
            area: { left: 72, top: 48, right: 1024, bottom: 560 },
        })

        for (const id of ['runtime', 'notes'] as const) {
            const bounds = state.windows[id].bounds
            expect(bounds.x).toBeGreaterThanOrEqual(72)
            expect(bounds.y).toBeGreaterThanOrEqual(48)
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(1024)
            expect(bounds.y + bounds.height).toBeLessThanOrEqual(560)
        }
    })
})

describe('TALOS window persistence V2', () => {
    it('uses stable V1/V2 keys and rejects corrupt persisted data', () => {
        expect(TALOS_WINDOW_LAYOUT_V1_KEY).toBe('talos.windowLayout.v1')
        expect(TALOS_WINDOW_LAYOUT_V2_KEY).toBe('talos.windowLayout.v2')
        expect(readTalosWindowLayout('{broken', null, area)).toEqual({ schema_version: 2, layouts: { desktop: { windows: {} }, tablet: { windows: {} } } })
    })

    it('migrates only known finite V1 geometry into the desktop bucket', () => {
        const layout = readTalosWindowLayout(null, JSON.stringify({
            positions: {
                notes: { x: 300, y: 100 },
                unknown: { x: 1, y: 1 },
                tasks: { x: 'bad', y: 12 },
            },
            sizes: {
                notes: { width: 600, height: 440 },
                tasks: { width: -1, height: 420 },
            },
        }), area)

        expect(layout.layouts.desktop.windows.notes?.bounds).toEqual({ x: 300, y: 100, width: 600, height: 440 })
        expect(layout.layouts.desktop.windows.tasks).toBeUndefined()
        expect(layout.layouts.tablet.windows).toEqual({})
    })

    it('falls back to valid V1 geometry when both V2 buckets are malformed', () => {
        const layout = readTalosWindowLayout(JSON.stringify({
            schema_version: 2,
            layouts: { desktop: 'broken', tablet: null },
        }), JSON.stringify({
            positions: { notes: { x: 320, y: 120 } },
            sizes: { notes: { width: 600, height: 440 } },
        }), area)

        expect(layout.layouts.desktop.windows.notes?.bounds).toEqual({ x: 320, y: 120, width: 600, height: 440 })
    })

    it('keeps desktop and tablet buckets separate and clamps stale geometry only when materialized', () => {
        const layout = readTalosWindowLayout(JSON.stringify({
            schema_version: 2,
            layouts: {
                desktop: { windows: { notes: { bounds: { x: 1200, y: 900, width: 900, height: 900 }, presentation: 'floating' } } },
                tablet: { windows: { tasks: { bounds: { x: 40, y: 80, width: 500, height: 400 }, presentation: 'floating' } } },
            },
        }), null, area)

        expect(layout.layouts.desktop.windows.notes?.bounds).toEqual({ x: 1200, y: 900, width: 900, height: 900 })
        expect(layout.layouts.desktop.windows.tasks).toBeUndefined()
        expect(layout.layouts.tablet.windows.tasks?.bounds).toEqual({ x: 40, y: 80, width: 500, height: 400 })
        expect(layout.layouts.tablet.windows.notes).toBeUndefined()

        const desktopState = createTalosWindowManagerState(['notes'], 'desktop', area, layout)
        const tabletState = createTalosWindowManagerState(['tasks'], 'tablet', area, layout)
        expect(desktopState.windows.notes.bounds.x).toBeLessThan(1200)
        expect(tabletState.windows.tasks.presentation).toBe('mobile-sheet')
        expect(tabletState.windows.tasks.previousPresentation).toBe('floating')
        expect(tabletState.windows.tasks.bounds).toEqual({ x: 240, y: 56, width: 1200, height: 664 })
    })

    it('does not clamp desktop or tablet buckets through the mobile viewport during startup', () => {
        const desktopBounds = { x: 420, y: 96, width: 700, height: 500 }
        const tabletBounds = { x: 120, y: 72, width: 680, height: 480 }
        const layout = readTalosWindowLayout(JSON.stringify({
            schema_version: 2,
            layouts: {
                desktop: { windows: { notes: { bounds: desktopBounds, presentation: 'floating' } } },
                tablet: { windows: { notes: { bounds: tabletBounds, presentation: 'floating' } } },
            },
        }), null, { left: 0, top: 96, right: 375, bottom: 620 })

        expect(layout.layouts.desktop.windows.notes?.bounds).toEqual(desktopBounds)
        expect(layout.layouts.tablet.windows.notes?.bounds).toEqual(tabletBounds)
        const desktopState = createTalosWindowManagerState(['notes'], 'desktop', area, layout)
        expect(desktopState.windows.notes.bounds).toEqual(desktopBounds)
    })

    it('projects only desktop/tablet layout fields and never persists transient focus authority', () => {
        let state = createTalosWindowManagerState(['notes'], 'desktop', area)
        state = reduceTalosWindowState(state, { type: 'open', id: 'tasks', returnFocusId: 'rail-tasks' })
        const projected = projectTalosWindowLayout(state)
        const serialized = JSON.stringify(projected)

        expect(projected.layouts.desktop.windows.tasks?.presentation).toBe('floating')
        expect(serialized).not.toContain('returnFocusId')
        expect(serialized).not.toContain('launchOrigin')
        expect(serialized).not.toContain('visibility')
    })

    it('restores persisted maximized state to floating bounds', () => {
        const layout = readTalosWindowLayout(JSON.stringify({
            schema_version: 2,
            layouts: {
                desktop: { windows: { notes: {
                    bounds: { x: 240, y: 56, width: 1200, height: 664 },
                    presentation: 'maximized',
                    restore_bounds: { x: 320, y: 100, width: 640, height: 480 },
                } } },
                tablet: { windows: {} },
            },
        }), null, area)
        let state = createTalosWindowManagerState(['notes'], 'desktop', area, layout)

        state = reduceTalosWindowState(state, { type: 'toggle-maximize', id: 'notes' })
        expect(state.windows.notes.presentation).toBe('floating')
        expect(state.windows.notes.bounds).toEqual({ x: 320, y: 100, width: 640, height: 480 })
    })
})

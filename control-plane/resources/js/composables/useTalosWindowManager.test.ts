// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { useTalosWindowManager } from './useTalosWindowManager'
import { TALOS_WINDOW_LAYOUT_V1_KEY, TALOS_WINDOW_LAYOUT_V2_KEY, type TalosWindowArea } from '../lib/talosWindowManager'

const initialArea: TalosWindowArea = { left: 220, top: 56, right: 1440, bottom: 720 }

describe('useTalosWindowManager', () => {
    beforeEach(() => {
        localStorage.clear()
        document.body.replaceChildren()
    })

    it('migrates V1 reads, writes only V2, and preserves the legacy projection API', () => {
        localStorage.setItem(TALOS_WINDOW_LAYOUT_V1_KEY, JSON.stringify({
            positions: { notes: { x: 320, y: 120 } },
            sizes: { notes: { width: 600, height: 440 } },
        }))
        const manager = useTalosWindowManager(['notes'], {
            area: ref(initialArea),
            breakpoint: ref('desktop'),
        })

        expect(manager.visibleWindowIds.value).toEqual(['notes'])
        expect(manager.windowPositions.value.notes).toEqual({ x: 320, y: 120 })
        expect(manager.windowSizes.value.notes).toEqual({ width: 600, height: 440 })

        manager.openWindow('tasks')
        manager.toggleDock('tasks')
        expect(manager.dockedWindowIds.value).toEqual(['tasks'])
        manager.minimizeWindow('notes')
        expect(manager.minimizedWindowIds.value).toEqual(['notes'])
        manager.openWindow('notes')
        expect(manager.minimizedWindowIds.value).toEqual([])

        manager.saveWindowLayout()
        const stored = JSON.parse(localStorage.getItem(TALOS_WINDOW_LAYOUT_V2_KEY) ?? '{}')
        expect(stored.schema_version).toBe(2)
        expect(stored.layouts.desktop.windows.notes.bounds).toEqual(manager.state.value.windows.notes.bounds)
        expect(localStorage.getItem(TALOS_WINDOW_LAYOUT_V1_KEY)).toBeNull()
    })

    it('reconciles geometry when the supplied usable area changes', async () => {
        const area = ref(initialArea)
        const manager = useTalosWindowManager(['runtime'], { area, breakpoint: ref('desktop') })
        area.value = { left: 72, top: 48, right: 900, bottom: 520 }
        await nextTick()

        const bounds = manager.state.value.windows.runtime.bounds
        expect(bounds.x).toBeGreaterThanOrEqual(72)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(900)
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(520)
    })

    it('returns focus to the captured launcher after close', async () => {
        const launcher = document.createElement('button')
        launcher.id = 'open-theme-control'
        document.body.append(launcher)
        launcher.focus()
        const manager = useTalosWindowManager([], { area: ref(initialArea), breakpoint: ref('desktop') })

        manager.openWindow('theme')
        const other = document.createElement('button')
        document.body.append(other)
        other.focus()
        manager.closeWindow('theme')
        await nextTick()

        expect(document.activeElement).toBe(launcher)
    })

    it('closes a minimized window idempotently without deleting its persisted geometry', () => {
        const manager = useTalosWindowManager(['theme'], { area: ref(initialArea), breakpoint: ref('desktop') })
        const expectedBounds = { x: 410, y: 130, width: 610, height: 430 }
        manager.setWindowBounds('theme', expectedBounds)
        manager.saveWindowLayout()
        manager.minimizeWindow('theme')

        manager.closeWindow('theme')
        manager.closeWindow('theme')

        expect(manager.state.value.windows.theme.visibility).toBe('closed')
        expect(manager.state.value.windows.theme.bounds).toEqual(expectedBounds)
        expect(JSON.parse(localStorage.getItem(TALOS_WINDOW_LAYOUT_V2_KEY) ?? '{}').layouts.desktop.windows.theme.bounds).toEqual(expectedBounds)
    })

    it.each(['close', 'minimize'] as const)('assigns a stable focus target when the launcher has no id and restores it after %s', async (action) => {
        const launcher = document.createElement('button')
        launcher.textContent = 'Theme launcher'
        document.body.append(launcher)
        launcher.focus()
        const manager = useTalosWindowManager([], { area: ref(initialArea), breakpoint: ref('desktop') })

        manager.openWindow('theme')
        expect(launcher.id).toMatch(/^talos-window-return-theme-/)
        const windowControl = document.createElement('button')
        document.body.append(windowControl)
        windowControl.focus()

        manager[action === 'close' ? 'closeWindow' : 'minimizeWindow']('theme')
        await nextTick()

        expect(document.activeElement).toBe(launcher)
    })

    it('switches to a single sheet below the desktop breakpoint', async () => {
        const breakpoint = ref<'desktop' | 'tablet' | 'mobile'>('desktop')
        const area = ref(initialArea)
        const manager = useTalosWindowManager(['runtime', 'notes'], { area, breakpoint })
        manager.focusWindow('notes')
        breakpoint.value = 'mobile'
        area.value = { left: 0, top: 96, right: 375, bottom: 620 }
        await nextTick()

        expect(manager.visibleWindowIds.value).toEqual(['notes'])
        expect(manager.state.value.windows.notes.presentation).toBe('mobile-sheet')
        expect(manager.state.value.windows.notes.bounds).toEqual({ x: 0, y: 96, width: 375, height: 524 })
    })

    it('persists dock, fullscreen, and snap transitions without an extra manual save', () => {
        const manager = useTalosWindowManager(['theme'], { area: ref(initialArea), breakpoint: ref('desktop') })

        manager.toggleDock('theme')
        expect(JSON.parse(localStorage.getItem(TALOS_WINDOW_LAYOUT_V2_KEY) ?? '{}').layouts.desktop.windows.theme.presentation).toBe('docked')
        manager.toggleDock('theme')
        manager.toggleFullscreenWindow('theme')
        expect(JSON.parse(localStorage.getItem(TALOS_WINDOW_LAYOUT_V2_KEY) ?? '{}').layouts.desktop.windows.theme.presentation).toBe('maximized')
        manager.toggleFullscreenWindow('theme')
        manager.snapWindow('theme', 'right')
        expect(JSON.parse(localStorage.getItem(TALOS_WINDOW_LAYOUT_V2_KEY) ?? '{}').layouts.desktop.windows.theme.bounds.x).toBeGreaterThan(initialArea.left)
    })

    it('exposes named tile state and persists exact restore geometry', () => {
        const maximizeArea = ref({ left: 220, top: 56, right: 1440, bottom: 900 })
        const fullscreenArea = ref({ left: 0, top: 0, right: 1440, bottom: 900 })
        const manager = useTalosWindowManager(['theme'], {
            area: ref(initialArea),
            maximizeArea,
            fullscreenArea,
            breakpoint: ref('desktop'),
        })
        const original = manager.state.value.windows.theme.bounds

        manager.tileWindow('theme', 'fullscreen-workspace')
        expect(manager.viewportFullscreenWindowIds.value).toEqual(['theme'])
        expect(manager.windowTileTargets.value.theme).toBe('fullscreen-workspace')
        expect(manager.state.value.windows.theme.bounds).toEqual({ x: 0, y: 0, width: 1440, height: 900 })
        manager.untileWindow('theme')
        expect(manager.state.value.windows.theme.bounds).toEqual(original)
        expect(manager.windowTileTargets.value.theme).toBe('none')
    })

    it('clears a stale return-focus target when reopening without a connected launcher', () => {
        const launcher = document.createElement('button')
        document.body.append(launcher)
        launcher.focus()
        const manager = useTalosWindowManager([], { area: ref(initialArea), breakpoint: ref('desktop') })
        manager.openWindow('theme')
        manager.closeWindow('theme')
        launcher.remove()
        document.body.focus()

        manager.openWindow('theme')
        expect(manager.state.value.windows.theme.returnFocusId).toBeNull()
    })
})

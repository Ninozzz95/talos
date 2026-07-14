// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import {
    useTalosWindowInteractions,
    type TalosInteractFactory,
    type TalosInteractListenerMap,
} from './useTalosWindowInteractions'

type Registered = {
    drag?: TalosInteractListenerMap
    resize?: TalosInteractListenerMap
    unset: ReturnType<typeof vi.fn>
}

function harness(options: { tiled?: boolean; tileTarget?: 'none' | 'left-half' | 'right-half' } = {}) {
    const registrations = new Map<Element, Registered>()
    const interactFactory: TalosInteractFactory = (element) => {
        const registered: Registered = { unset: vi.fn() }
        registrations.set(element, registered)
        const api = {
            draggable(config: { listeners: TalosInteractListenerMap }) {
                registered.drag = config.listeners
                return api
            },
            resizable(config: { listeners: TalosInteractListenerMap }) {
                registered.resize = config.listeners
                return api
            },
            unset: registered.unset,
        }
        return api
    }
    const bounds = { x: 100, y: 80, width: 500, height: 400 }
    const restoreBounds = { x: 180, y: 120, width: 620, height: 460 }
    const setBounds = vi.fn()
    const saveLayout = vi.fn()
    const focus = vi.fn()
    const tile = vi.fn()
    const untile = vi.fn()
    const interactionChanged = vi.fn()
    const tileTarget = options.tileTarget ?? (options.tiled ? 'left-half' : 'none')
    const scope = effectScope()
    const interactions = scope.run(() => useTalosWindowInteractions({
        isDocked: () => false,
        isFullscreen: () => false,
        tileTargetFor: () => tileTarget,
        boundsFor: () => bounds,
        restoreBoundsFor: () => tileTarget !== 'none' ? restoreBounds : null,
        stageRect: () => ({ left: 0, top: 0, right: 1200, bottom: 800 }),
        tileAreas: () => ({
            tile: { left: 0, top: 56, right: 1200, bottom: 620 },
            maximize: { left: 0, top: 56, right: 1200, bottom: 800 },
            fullscreen: { left: 0, top: 0, right: 1200, bottom: 800 },
        }),
        focus,
        setBounds,
        tile,
        untile,
        saveLayout,
        onInteractionChange: interactionChanged,
        interactFactory,
    }))!
    const frame = document.createElement('div')
    document.body.append(frame)
    interactions.bindWindowFrame('notes', frame)
    const registered = registrations.get(frame)!

    return { interactions, frame, registered, bounds, setBounds, saveLayout, focus, tile, untile, interactionChanged, scope }
}

afterEach(() => document.body.replaceChildren())

describe('useTalosWindowInteractions upstream adapter', () => {
    it('binds one upstream draggable/resizable instance and tears it down', () => {
        const { interactions, frame, registered, scope } = harness()
        expect(registered.drag).toBeTruthy()
        expect(registered.resize).toBeTruthy()

        interactions.bindWindowFrame('notes', null)
        expect(registered.unset).toHaveBeenCalledTimes(1)
        interactions.bindWindowFrame('notes', frame)
        scope.stop()
    })

    it('moves through canonical bounds, previews a side tile, and commits once on end', () => {
        const { interactions, registered, bounds, setBounds, tile, saveLayout, focus, scope } = harness()
        registered.drag?.start({ clientX: 300, clientY: 100, dx: 0, dy: 0 })
        registered.drag?.move({ clientX: 8, clientY: 400, dx: 50, dy: 45 })

        expect(focus).toHaveBeenCalledWith('notes')
        expect(setBounds).toHaveBeenLastCalledWith('notes', { x: 150, y: 125, width: 500, height: 400 })
        expect(interactions.previewTarget.value).toBe('left-half')
        expect(interactions.previewBounds.value).toEqual({ x: 0, y: 56, width: 600, height: 564 })

        registered.drag?.end({ clientX: 8, clientY: 400, dx: 0, dy: 0 })
        expect(tile).toHaveBeenCalledWith('notes', 'left-half', bounds)
        expect(saveLayout).not.toHaveBeenCalled()
        expect(interactions.previewTarget.value).toBe('none')
        expect(interactions.interactingWindowId.value).toBeNull()
        scope.stop()
    })

    it('uses the physical pointer for edge targeting when an upstream modifier adjusts action coordinates', () => {
        const { interactions, registered, bounds, tile, scope } = harness()
        registered.drag?.start({ clientX: 300, clientY: 100, dx: 0, dy: 0 })
        document.dispatchEvent(new PointerEvent('pointermove', {
            clientX: 8,
            clientY: 400,
            bubbles: true,
        }))

        registered.drag?.move({ clientX: 300, clientY: 400, dx: -292, dy: 300 })
        expect(interactions.previewTarget.value).toBe('left-half')
        registered.drag?.end({ clientX: 300, clientY: 400, dx: 0, dy: 0 })
        expect(tile).toHaveBeenCalledWith('notes', 'left-half', bounds)
        scope.stop()
    })

    it('restores a tiled window under the pointer before free movement', () => {
        const { registered, untile, setBounds, scope } = harness({ tiled: true })
        registered.drag?.start({ clientX: 250, clientY: 100, dx: 0, dy: 0 })

        expect(untile).toHaveBeenCalledWith('notes', {
            x: 64,
            y: 80,
            width: 620,
            height: 460,
        })
        registered.drag?.move({ clientX: 280, clientY: 130, dx: 30, dy: 30 })
        expect(setBounds).toHaveBeenLastCalledWith('notes', { x: 94, y: 110, width: 620, height: 460 })
        scope.stop()
    })

    it('maps upstream resize deltas atomically and persists once without a tile target', () => {
        const { registered, setBounds, saveLayout, scope } = harness()
        registered.resize?.start({ clientX: 100, clientY: 100, dx: 0, dy: 0 })
        registered.resize?.move({
            clientX: 140,
            clientY: 130,
            dx: 0,
            dy: 0,
            deltaRect: { left: 40, top: 30, width: -40, height: -30 },
        })
        expect(setBounds).toHaveBeenLastCalledWith('notes', { x: 140, y: 110, width: 460, height: 370 })
        registered.resize?.end({ clientX: 140, clientY: 130, dx: 0, dy: 0 })
        expect(saveLayout).toHaveBeenCalledTimes(1)
        scope.stop()
    })

    it('resizes a side-snapped pane through its shared divider and exposes the active resize lifecycle', () => {
        const { interactions, registered, setBounds, saveLayout, interactionChanged, scope } = harness({ tileTarget: 'left-half' })
        registered.resize?.start({ clientX: 600, clientY: 300, dx: 0, dy: 0 })
        expect(interactions.interactingWindowKind.value).toBe('resize')
        expect(interactionChanged).toHaveBeenLastCalledWith({ id: 'notes', kind: 'resize', active: true })

        registered.resize?.move({
            clientX: 720,
            clientY: 300,
            dx: 0,
            dy: 0,
            deltaRect: { left: 0, top: 0, width: 120, height: 0 },
        })
        expect(setBounds).toHaveBeenLastCalledWith('notes', { x: 100, y: 80, width: 620, height: 400 })

        registered.resize?.end({ clientX: 720, clientY: 300, dx: 0, dy: 0 })
        expect(interactions.interactingWindowKind.value).toBeNull()
        expect(interactionChanged).toHaveBeenLastCalledWith({ id: 'notes', kind: 'resize', active: false })
        expect(saveLayout).toHaveBeenCalledTimes(1)
        scope.stop()
    })

    it('cancels the active upstream interaction on Escape and clears preview state', () => {
        const { interactions, registered, saveLayout, scope } = harness()
        const stop = vi.fn()
        registered.drag?.start({ clientX: 300, clientY: 100, dx: 0, dy: 0, interaction: { stop } })
        registered.drag?.move({ clientX: 8, clientY: 400, dx: 10, dy: 10, interaction: { stop } })
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

        expect(stop).toHaveBeenCalledTimes(1)
        expect(saveLayout).toHaveBeenCalledTimes(1)
        expect(interactions.previewTarget.value).toBe('none')
        expect(interactions.interactingWindowId.value).toBeNull()
        scope.stop()
    })
})

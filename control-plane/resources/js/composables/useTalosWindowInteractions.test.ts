// @vitest-environment jsdom

import { effectScope } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useTalosWindowInteractions } from './useTalosWindowInteractions'

function dispatchPointer(target: EventTarget, type: string, init: PointerEventInit) {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, button: 0, ...init }))
}

function harness() {
    const setPosition = vi.fn()
    const setBounds = vi.fn()
    const saveLayout = vi.fn()
    const focus = vi.fn()
    const scope = effectScope()
    const interactions = scope.run(() => useTalosWindowInteractions({
        isDocked: () => false,
        isFullscreen: () => false,
        positionFor: () => ({ x: 100, y: 80 }),
        sizeFor: () => ({ width: 500, height: 400 }),
        focus,
        setPosition,
        setBounds,
        saveLayout,
    }))!
    const target = document.createElement('div')
    target.setPointerCapture = vi.fn()
    target.releasePointerCapture = vi.fn()
    target.hasPointerCapture = vi.fn(() => true)
    document.body.append(target)

    return { interactions, target, setPosition, setBounds, saveLayout, focus, scope }
}

describe('useTalosWindowInteractions', () => {
    it('owns drag pointer lifecycle and persists once when the pointer finishes', () => {
        const { interactions, target, setPosition, saveLayout, focus, scope } = harness()
        target.addEventListener('pointerdown', (event) => interactions.startWindowDrag('notes', event))

        dispatchPointer(target, 'pointerdown', { clientX: 20, clientY: 30 })
        dispatchPointer(window, 'pointermove', { clientX: 70, clientY: 75 })
        dispatchPointer(window, 'pointerup', { clientX: 70, clientY: 75 })

        expect(focus).toHaveBeenCalledWith('notes')
        expect(setPosition).toHaveBeenCalledWith('notes', { x: 150, y: 125 })
        expect(saveLayout).toHaveBeenCalledTimes(1)
        expect(interactions.interactingWindowId.value).toBeNull()
        scope.stop()
    })

    it('emits atomic bounds for edge resize and consumes cancellation', () => {
        const { interactions, target, setBounds, saveLayout, scope } = harness()
        target.addEventListener('pointerdown', (event) => interactions.startWindowResize('notes', 'top-left', event))

        dispatchPointer(target, 'pointerdown', { clientX: 100, clientY: 100 })
        dispatchPointer(window, 'pointermove', { clientX: 140, clientY: 130 })
        expect(setBounds).toHaveBeenLastCalledWith('notes', { x: 140, y: 110, width: 460, height: 370 })

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        dispatchPointer(window, 'pointermove', { clientX: 300, clientY: 300 })
        expect(setBounds).toHaveBeenCalledTimes(1)
        expect(saveLayout).toHaveBeenCalledTimes(1)
        scope.stop()
    })
})

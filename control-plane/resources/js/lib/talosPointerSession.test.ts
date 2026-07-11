// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindTalosPointerSession } from './talosPointerSession'

function pointerEvent(type: string, pointerId = 7) {
    const event = new Event(type) as PointerEvent
    Object.defineProperty(event, 'pointerId', { value: pointerId })
    return event
}

afterEach(() => document.body.replaceChildren())

describe('bindTalosPointerSession', () => {
    it('captures the pointer, forwards moves, and completes exactly once on pointerup', () => {
        const target = document.createElement('div')
        target.setPointerCapture = vi.fn()
        target.releasePointerCapture = vi.fn()
        target.hasPointerCapture = vi.fn(() => true)
        document.body.append(target)
        const onMove = vi.fn()
        const onFinish = vi.fn()

        bindTalosPointerSession({ target, pointerId: 7, onMove, onFinish })
        window.dispatchEvent(pointerEvent('pointermove'))
        window.dispatchEvent(pointerEvent('pointerup'))
        window.dispatchEvent(pointerEvent('pointerup'))

        expect(target.setPointerCapture).toHaveBeenCalledWith(7)
        expect(onMove).toHaveBeenCalledTimes(1)
        expect(onFinish).toHaveBeenCalledTimes(1)
        expect(onFinish).toHaveBeenCalledWith('pointerup')
        expect(target.releasePointerCapture).toHaveBeenCalledWith(7)
    })

    it.each([
        ['pointercancel', () => window.dispatchEvent(pointerEvent('pointercancel'))],
        ['lostpointercapture', (target: HTMLElement) => target.dispatchEvent(pointerEvent('lostpointercapture'))],
        ['blur', () => window.dispatchEvent(new Event('blur'))],
        ['escape', () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))],
    ])('cancels on %s and removes all listeners', (reason, cancel) => {
        const target = document.createElement('div')
        target.setPointerCapture = vi.fn()
        target.releasePointerCapture = vi.fn()
        target.hasPointerCapture = vi.fn(() => false)
        document.body.append(target)
        const onMove = vi.fn()
        const onFinish = vi.fn()

        bindTalosPointerSession({ target, pointerId: 7, onMove, onFinish })
        cancel(target)
        window.dispatchEvent(pointerEvent('pointermove'))

        expect(onFinish).toHaveBeenCalledTimes(1)
        expect(onFinish).toHaveBeenCalledWith(reason)
        expect(onMove).not.toHaveBeenCalled()
    })

    it('consumes Escape before the workspace close shortcut while a pointer session is active', () => {
        const target = document.createElement('div')
        target.setPointerCapture = vi.fn()
        target.releasePointerCapture = vi.fn()
        target.hasPointerCapture = vi.fn(() => false)
        document.body.append(target)
        const escapedToWorkspace = vi.fn()
        window.addEventListener('keydown', escapedToWorkspace)

        bindTalosPointerSession({ target, pointerId: 7, onMove: vi.fn(), onFinish: vi.fn() })
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

        expect(escapedToWorkspace).not.toHaveBeenCalled()
        window.removeEventListener('keydown', escapedToWorkspace)
    })
})

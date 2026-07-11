// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTalosChatViewport } from './useTalosChatViewport'

type ObserverCallback = ResizeObserverCallback

class ResizeObserverMock {
    static instances: ResizeObserverMock[] = []
    callback: ObserverCallback
    disconnect = vi.fn()
    observe = vi.fn()

    constructor(callback: ObserverCallback) {
        this.callback = callback
        ResizeObserverMock.instances.push(this)
    }
}

afterEach(() => {
    ResizeObserverMock.instances = []
    document.body.replaceChildren()
    vi.unstubAllGlobals()
})

describe('useTalosChatViewport composer geometry', () => {
    it('publishes one measured height and disconnects the previous observer on replacement', () => {
        vi.stubGlobal('ResizeObserver', ResizeObserverMock)
        const workspace = document.createElement('main')
        workspace.className = 'talos-workspace'
        const first = document.createElement('div')
        const second = document.createElement('div')
        workspace.append(first, second)
        document.body.append(workspace)
        vi.spyOn(first, 'getBoundingClientRect').mockReturnValue({ height: 180 } as DOMRect)
        let secondBorderBoxHeight = 96
        vi.spyOn(second, 'getBoundingClientRect').mockImplementation(() => ({ height: secondBorderBoxHeight }) as DOMRect)

        const viewport = useTalosChatViewport()
        viewport.registerComposer(first)
        expect(viewport.composerHeight.value).toBe(180)
        expect(workspace.style.getPropertyValue('--talos-composer-height')).toBe('180px')
        expect(ResizeObserverMock.instances).toHaveLength(1)

        viewport.registerComposer(second)
        expect(ResizeObserverMock.instances[0]?.disconnect).toHaveBeenCalledOnce()
        expect(ResizeObserverMock.instances).toHaveLength(2)
        expect(viewport.composerHeight.value).toBe(96)

        secondBorderBoxHeight = 120
        ResizeObserverMock.instances[1]?.callback([{ contentRect: { height: 80 } } as ResizeObserverEntry], ResizeObserverMock.instances[1] as unknown as ResizeObserver)
        expect(viewport.composerHeight.value).toBe(120)
        expect(workspace.style.getPropertyValue('--talos-composer-height')).toBe('120px')
    })
})

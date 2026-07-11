// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { talosBackgroundPerformanceProfile, useTalosProceduralCanvas } from './useTalosProceduralCanvas'

const mounted: Array<ReturnType<typeof createApp>> = []
const originalResizeObserver = globalThis.ResizeObserver
const originalRequestAnimationFrame = window.requestAnimationFrame
const originalCancelAnimationFrame = window.cancelAnimationFrame
const originalGetContext = HTMLCanvasElement.prototype.getContext
const originalGetBoundingClientRect = HTMLCanvasElement.prototype.getBoundingClientRect
const originalGetComputedStyle = window.getComputedStyle

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    vi.restoreAllMocks()
    vi.useRealTimers()
    document.body.replaceChildren()
    globalThis.ResizeObserver = originalResizeObserver
    window.requestAnimationFrame = originalRequestAnimationFrame
    window.cancelAnimationFrame = originalCancelAnimationFrame
    HTMLCanvasElement.prototype.getContext = originalGetContext
    HTMLCanvasElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
    window.getComputedStyle = originalGetComputedStyle
})

function mockCanvasContext() {
    return {
        save() {},
        restore() {},
        clearRect() {},
        fillRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        arc() {},
        fill() {},
        set globalAlpha(_value: number) {},
        set strokeStyle(_value: string) {},
        set fillStyle(_value: string) {},
        set lineWidth(_value: number) {},
        set shadowBlur(_value: number) {},
        set shadowColor(_value: string) {},
        set lineCap(_value: CanvasLineCap) {},
        set globalCompositeOperation(_value: GlobalCompositeOperation) {},
    } as unknown as CanvasRenderingContext2D
}

function mountProceduralCanvas() {
    const effect = ref<'dag-flow' | 'none'>('dag-flow')
    const motion = ref<'normal'>('normal')
    const backgroundMotionEnabled = ref(true)
    const simpleAnimation = ref(false)
    let performanceState: ReturnType<typeof useTalosProceduralCanvas>['performanceState'] | null = null

    const app = createApp(defineComponent({
        setup() {
            const canvas = ref<HTMLCanvasElement | null>(null)
            performanceState = useTalosProceduralCanvas(canvas, effect, motion, backgroundMotionEnabled, simpleAnimation).performanceState
            return () => h('canvas', { ref: canvas })
        },
    }))

    const container = document.createElement('div')
    document.body.append(container)
    mounted.push(app)
    app.mount(container)

    return {
        backgroundMotionEnabled,
        effect,
        canvas: () => container.querySelector('canvas') as HTMLCanvasElement | null,
        performanceState: () => performanceState,
    }
}

describe('talosBackgroundPerformanceProfile', () => {
    it('freezes the procedural canvas when resolved background motion is disabled', () => {
        const profile = talosBackgroundPerformanceProfile({
            effect: 'dag-flow',
            motion: 'cinematic',
            backgroundMotionEnabled: false,
            hidden: false,
            viewportWidth: 1440,
            viewportHeight: 900,
        })

        expect(profile.mode).toBe('static')
        expect(profile.fpsCap).toBe(0)
    })
})

describe('useTalosProceduralCanvas', () => {
    it('recovers from a zero-sized observer record after the canvas is mounted', async () => {
        vi.useFakeTimers()

        let resizeCallback: ResizeObserverCallback | null = null
        let measureCount = 0
        globalThis.ResizeObserver = class ResizeObserver {
            constructor(callback: ResizeObserverCallback) {
                resizeCallback = callback
            }
            observe() {}
            disconnect() {}
            unobserve() {}
        }
        HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCanvasContext())
        window.getComputedStyle = vi.fn(() => ({
            getPropertyValue: (name: string) => name === '--talos-accent' ? '#c98b32' : '#6ad4d4',
        })) as typeof window.getComputedStyle
        HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => {
            measureCount += 1
            const width = measureCount === 1 ? 0 : 640
            const height = measureCount === 1 ? 0 : 360
            return {
                width,
                height,
                top: 0,
                right: width,
                bottom: height,
                left: 0,
                x: 0,
                y: 0,
                toJSON() {
                    return {}
                },
            } as DOMRect
        })
        window.cancelAnimationFrame = vi.fn()
        const rafCallbacks: FrameRequestCallback[] = []
        window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
            rafCallbacks.push(callback)
            return rafCallbacks.length
        })

        const mountedCanvas = mountProceduralCanvas()
        await nextTick()
        const canvas = mountedCanvas.canvas() as HTMLCanvasElement
        expect(canvas.width).toBe(1)

        resizeCallback?.([{
            target: canvas,
            contentRect: {
                width: 0,
                height: 0,
            } as DOMRectReadOnly,
        } as ResizeObserverEntry], {} as ResizeObserver)
        vi.advanceTimersByTime(120)
        await nextTick()

        expect(canvas.width).toBe(640)
        expect(canvas.height).toBe(360)
        expect(measureCount).toBe(2)
    })

    it('attaches an observer and resizes a canvas mounted after the effect is enabled', async () => {
        vi.useFakeTimers()

        let resizeCallback: ResizeObserverCallback | null = null
        let observedCanvas: HTMLCanvasElement | null = null
        let layout = { width: 640, height: 360 }
        globalThis.ResizeObserver = class ResizeObserver {
            constructor(callback: ResizeObserverCallback) {
                resizeCallback = callback
            }
            observe(element: Element) {
                observedCanvas = element as HTMLCanvasElement
            }
            disconnect() {}
            unobserve() {}
        }
        HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCanvasContext())
        window.getComputedStyle = vi.fn(() => ({
            getPropertyValue: (name: string) => name === '--talos-accent' ? '#c98b32' : '#6ad4d4',
        })) as typeof window.getComputedStyle
        HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => ({
            width: layout.width,
            height: layout.height,
            top: 0,
            right: layout.width,
            bottom: layout.height,
            left: 0,
            x: 0,
            y: 0,
            toJSON() { return {} },
        } as DOMRect))
        window.cancelAnimationFrame = vi.fn()
        window.requestAnimationFrame = vi.fn(() => 1)

        const effect = ref<'dag-flow' | 'none'>('none')
        const motion = ref<'normal'>('normal')
        const backgroundMotionEnabled = ref(true)
        const simpleAnimation = ref(false)
        const canvas = ref<HTMLCanvasElement | null>(null)
        const app = createApp(defineComponent({
            setup() {
                useTalosProceduralCanvas(canvas, effect, motion, backgroundMotionEnabled, simpleAnimation)
                return () => effect.value === 'none' ? null : h('canvas', { ref: canvas })
            },
        }))
        const container = document.createElement('div')
        document.body.append(container)
        mounted.push(app)
        app.mount(container)
        await nextTick()

        expect(canvas.value).toBeNull()

        effect.value = 'dag-flow'
        await nextTick()

        expect(observedCanvas).toBe(canvas.value)
        expect(canvas.value?.width).toBe(640)
        expect(canvas.value?.height).toBe(360)

        layout = { width: 800, height: 450 }
        resizeCallback?.([{
            target: canvas.value,
            contentRect: {
                width: 800,
                height: 450,
            } as DOMRectReadOnly,
        } as ResizeObserverEntry], {} as ResizeObserver)
        vi.advanceTimersByTime(120)
        await nextTick()

        expect(canvas.value?.width).toBe(800)
        expect(canvas.value?.height).toBe(450)
    })

    it('clears stale resize records and keeps exactly one observer across canvas identity changes', async () => {
        vi.useFakeTimers()

        const observers: Array<{
            callback: ResizeObserverCallback
            observedCanvas: Element | null
            active: boolean
            observe: ReturnType<typeof vi.fn>
            disconnect: ReturnType<typeof vi.fn>
        }> = []
        globalThis.ResizeObserver = class ResizeObserver {
            private readonly record: typeof observers[number]

            constructor(callback: ResizeObserverCallback) {
                this.record = {
                    callback,
                    observedCanvas: null,
                    active: false,
                    observe: vi.fn((element: Element) => {
                        this.record.observedCanvas = element
                        this.record.active = true
                    }),
                    disconnect: vi.fn(() => {
                        this.record.active = false
                    }),
                }
                observers.push(this.record)
            }

            observe(element: Element) {
                this.record.observe(element)
            }

            disconnect() {
                this.record.disconnect()
            }

            unobserve() {}
        }
        HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCanvasContext())
        window.getComputedStyle = vi.fn(() => ({
            getPropertyValue: (name: string) => name === '--talos-accent' ? '#c98b32' : '#6ad4d4',
        })) as typeof window.getComputedStyle
        HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => ({
            width: 320,
            height: 200,
            top: 0,
            right: 320,
            bottom: 200,
            left: 0,
            x: 0,
            y: 0,
            toJSON() { return {} },
        } as DOMRect))
        window.cancelAnimationFrame = vi.fn()
        window.requestAnimationFrame = vi.fn(() => 1)

        const showCanvas = ref(true)
        const effect = ref<'dag-flow'>('dag-flow')
        const motion = ref<'normal'>('normal')
        const backgroundMotionEnabled = ref(true)
        const simpleAnimation = ref(false)
        const canvas = ref<HTMLCanvasElement | null>(null)
        let subject: ReturnType<typeof useTalosProceduralCanvas>
        const app = createApp(defineComponent({
            setup() {
                subject = useTalosProceduralCanvas(canvas, effect, motion, backgroundMotionEnabled, simpleAnimation)
                return () => showCanvas.value ? h('canvas', { ref: canvas }) : null
            },
        }))
        const container = document.createElement('div')
        document.body.append(container)
        mounted.push(app)
        app.mount(container)
        await nextTick()

        const oldCanvas = canvas.value as HTMLCanvasElement
        const oldObserver = observers[0]
        expect(observers).toHaveLength(1)
        expect(observers.filter((observer) => observer.active)).toHaveLength(1)

        oldObserver.callback([{
            target: oldCanvas,
            contentRect: { width: 1_024, height: 768 } as DOMRectReadOnly,
        } as ResizeObserverEntry], {} as ResizeObserver)

        showCanvas.value = false
        await nextTick()

        expect(canvas.value).toBeNull()
        expect(oldObserver.disconnect).toHaveBeenCalledTimes(1)
        expect(observers.filter((observer) => observer.active)).toHaveLength(0)

        showCanvas.value = true
        await nextTick()

        const replacementCanvas = canvas.value as HTMLCanvasElement
        const replacementObserver = observers[1]
        expect(replacementCanvas).not.toBe(oldCanvas)
        expect(observers).toHaveLength(2)
        expect(observers.filter((observer) => observer.active)).toHaveLength(1)
        expect(replacementObserver.observe).toHaveBeenCalledWith(replacementCanvas)
        expect(replacementCanvas.width).toBe(320)
        expect(replacementCanvas.height).toBe(200)

        oldObserver.callback([{
            target: oldCanvas,
            contentRect: { width: 1_280, height: 900 } as DOMRectReadOnly,
        } as ResizeObserverEntry], {} as ResizeObserver)
        vi.advanceTimersByTime(120)
        await nextTick()

        expect(replacementCanvas.width).toBe(320)
        expect(replacementCanvas.height).toBe(200)
        expect(subject.performanceState.value.resizeCount).toBe(0)
    })

    it('caches canvas measurements across animation frames and remeasures once per resize path', async () => {
        vi.useFakeTimers()

        let measureCount = 0
        let rafCallback: FrameRequestCallback | null = null
        globalThis.ResizeObserver = class ResizeObserver {
            constructor(_callback: ResizeObserverCallback) {}
            observe() {}
            disconnect() {}
            unobserve() {}
        }
        HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCanvasContext())
        window.getComputedStyle = vi.fn(() => ({
            getPropertyValue: (name: string) => name === '--talos-accent' ? '#c98b32' : '#6ad4d4',
        })) as typeof window.getComputedStyle
        HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => {
            measureCount += 1
            return {
                width: 320,
                height: 200,
                top: 0,
                right: 320,
                bottom: 200,
                left: 0,
                x: 0,
                y: 0,
                toJSON() {
                    return {}
                },
            } as DOMRect
        })
        window.cancelAnimationFrame = vi.fn()
        window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
            rafCallback = callback
            return 1
        })

        mountProceduralCanvas()
        await nextTick()

        const initialMeasureCount = measureCount
        const initialStyleReadCount = vi.mocked(window.getComputedStyle).mock.calls.length
        expect(initialMeasureCount).toBeGreaterThan(0)
        expect(initialStyleReadCount).toBeGreaterThan(0)

        vi.advanceTimersByTime(40)
        rafCallback?.(16)
        await nextTick()

        expect(measureCount).toBe(initialMeasureCount)
        expect(vi.mocked(window.getComputedStyle)).toHaveBeenCalledTimes(initialStyleReadCount)

        window.dispatchEvent(new Event('resize'))
        vi.advanceTimersByTime(120)
        await nextTick()

        expect(measureCount).toBe(initialMeasureCount + 1)

        vi.advanceTimersByTime(40)
        rafCallback?.(32)
        await nextTick()

        expect(measureCount).toBe(initialMeasureCount + 1)
    })

    it('marks every procedural draw while throttling reactive frame telemetry', async () => {
        vi.useFakeTimers()

        let rafCallback: FrameRequestCallback | null = null
        globalThis.ResizeObserver = class ResizeObserver {
            constructor(_callback: ResizeObserverCallback) {}
            observe() {}
            disconnect() {}
            unobserve() {}
        }
        HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCanvasContext())
        window.getComputedStyle = vi.fn(() => ({
            getPropertyValue: (name: string) => name === '--talos-accent' ? '#c98b32' : '#6ad4d4',
        })) as typeof window.getComputedStyle
        HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => ({
            width: 320,
            height: 200,
            top: 0,
            right: 320,
            bottom: 200,
            left: 0,
            x: 0,
            y: 0,
            toJSON() { return {} },
        } as DOMRect))
        window.cancelAnimationFrame = vi.fn()
        window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
            rafCallback = callback
            return 1
        })
        const mark = vi.spyOn(performance, 'mark').mockImplementation(() => undefined as unknown as PerformanceMark)

        const subject = mountProceduralCanvas()
        await nextTick()

        const initialMarkCount = mark.mock.calls.filter(([name]) => name === 'talos-background-frame').length
        const initialStateFrameCount = subject.performanceState()?.value.frameCount
        expect(initialMarkCount).toBeGreaterThan(0)

        vi.advanceTimersByTime(40)
        rafCallback?.(16)
        await nextTick()

        expect(mark.mock.calls.filter(([name]) => name === 'talos-background-frame')).toHaveLength(initialMarkCount + 1)
        expect(subject.performanceState()?.value.frameCount).toBe(initialStateFrameCount)
    })

    it('restarts exactly one animation loop when runtime motion is re-enabled', async () => {
        vi.useFakeTimers()

        globalThis.ResizeObserver = class ResizeObserver {
            constructor(_callback: ResizeObserverCallback) {}
            observe() {}
            disconnect() {}
            unobserve() {}
        }
        HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCanvasContext())
        window.getComputedStyle = vi.fn(() => ({
            getPropertyValue: (name: string) => name === '--talos-accent' ? '#c98b32' : '#6ad4d4',
        })) as typeof window.getComputedStyle
        HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => ({
            width: 320,
            height: 200,
            top: 0,
            right: 320,
            bottom: 200,
            left: 0,
            x: 0,
            y: 0,
            toJSON() { return {} },
        } as DOMRect))
        window.cancelAnimationFrame = vi.fn()
        const rafCallbacks: FrameRequestCallback[] = []
        window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
            rafCallbacks.push(callback)
            return rafCallbacks.length
        })

        const subject = mountProceduralCanvas()
        await nextTick()
        vi.advanceTimersByTime(40)
        const staleCallback = rafCallbacks[0]

        subject.backgroundMotionEnabled.value = false
        await nextTick()
        subject.effect.value = 'none'
        await nextTick()
        subject.effect.value = 'dag-flow'
        await nextTick()

        const requestsBeforeRestart = vi.mocked(window.requestAnimationFrame).mock.calls.length
        subject.backgroundMotionEnabled.value = true
        await nextTick()
        staleCallback?.(16)
        vi.advanceTimersByTime(40)

        expect(vi.mocked(window.requestAnimationFrame)).toHaveBeenCalledTimes(requestsBeforeRestart + 1)

        rafCallbacks.at(-1)?.(32)
        vi.advanceTimersByTime(40)
        expect(vi.mocked(window.requestAnimationFrame)).toHaveBeenCalledTimes(requestsBeforeRestart + 2)
    })
})

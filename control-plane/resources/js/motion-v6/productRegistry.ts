import type { MotionFrameScheduler } from './clock'
import { createDomComplexRendererPlatform, type ComplexRendererOptions, type ComplexRendererPlatform } from './renderers/complexRenderer'
import { createDomSimpleRendererPlatform, type SimpleRendererPlatform } from './renderers/simpleRenderer'
import { createSceneRegistry, type SceneRegistry } from './sceneRegistry'
import { createTalosComplexSceneRegistrations } from './scenes/complex'
import { createTalosSimpleSceneRegistrations, createTalosStaticSceneRegistrations } from './scenes/simple'

export type TalosProductSceneRegistryOptions = Readonly<{
    simplePlatform: SimpleRendererPlatform
    complexPlatform: ComplexRendererPlatform
    complexOptions?: ComplexRendererOptions
}>

export function createTalosProductSceneRegistry(options: TalosProductSceneRegistryOptions): SceneRegistry {
    return createSceneRegistry([
        ...createTalosComplexSceneRegistrations(options.complexPlatform, options.complexOptions),
        ...createTalosSimpleSceneRegistrations(options.simplePlatform),
        ...createTalosStaticSceneRegistrations(options.simplePlatform),
    ])
}

type BrowserFrameWindow = Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'>
type BrowserPerformance = Pick<Performance, 'now'>

export function createBrowserMotionFrameScheduler(
    browserWindow: BrowserFrameWindow,
    performanceClock: BrowserPerformance,
): MotionFrameScheduler {
    return Object.freeze({
        now: () => performanceClock.now(),
        requestFrame: (callback: () => void) => browserWindow.requestAnimationFrame(callback),
        cancelFrame: (handle: unknown) => browserWindow.cancelAnimationFrame(handle as number),
    })
}

export function createTalosBrowserProductSceneRegistry(
    documentLike: Pick<Document, 'createElement'> = document,
    browserWindow: BrowserFrameWindow = window,
    performanceClock: BrowserPerformance = performance,
    complexOptions: ComplexRendererOptions = {},
): SceneRegistry {
    const scheduler = createBrowserMotionFrameScheduler(browserWindow, performanceClock)
    return createTalosProductSceneRegistry({
        simplePlatform: createDomSimpleRendererPlatform(documentLike),
        complexPlatform: createDomComplexRendererPlatform(scheduler, documentLike),
        complexOptions,
    })
}

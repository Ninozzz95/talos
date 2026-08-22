// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
    listener: null as null | ((event: { canGoBack: boolean }) => void),
    addBehavior: 'resolve' as 'resolve' | 'reject' | 'pending',
    removeBehavior: 'resolve' as 'resolve' | 'reject',
    exitBehavior: 'resolve' as 'resolve' | 'reject',
    addCalls: 0,
    removeCalls: 0,
    exitCalls: 0,
    pendingResolvers: [] as Array<() => void>,
}))

vi.mock('@capacitor/app', () => ({
    App: {
        addListener: vi.fn((_event: string, cb: (event: { canGoBack: boolean }) => void) => {
            mock.addCalls += 1
            mock.listener = cb
            const handle = {
                remove: vi.fn(() => {
                    mock.removeCalls += 1
                    return mock.removeBehavior === 'reject' ? Promise.reject(new Error('remove failed')) : Promise.resolve()
                }),
            }
            if (mock.addBehavior === 'reject') return Promise.reject(new Error('registration failed'))
            if (mock.addBehavior === 'pending') return new Promise((resolve) => { mock.pendingResolvers.push(() => resolve(handle)) })
            return Promise.resolve(handle)
        }),
        exitApp: vi.fn(() => {
            mock.exitCalls += 1
            return mock.exitBehavior === 'reject' ? Promise.reject(new Error('exit failed')) : Promise.resolve()
        }),
    },
}))

import {
    NativeLifecycleError,
    registerNativeAppLifecycle,
    type RegisterNativeAppLifecycleOptions,
} from '@/services/nativeAppLifecycle'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
    mock.listener = null
    mock.addBehavior = 'resolve'
    mock.removeBehavior = 'resolve'
    mock.exitBehavior = 'resolve'
    mock.addCalls = 0
    mock.removeCalls = 0
    mock.exitCalls = 0
    mock.pendingResolvers = []
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('registerNativeAppLifecycle', () => {
    it('ready resolves after the single native listener is registered', async () => {
        const controller = registerNativeAppLifecycle({ onBack: () => 'handled', onError: vi.fn() })
        await expect(controller.ready).resolves.toBeUndefined()
        expect(mock.addCalls).toBe(1)
    })

    it('android back closes the topmost drawer or dialog before navigating', async () => {
        const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})
        const controller = registerNativeAppLifecycle({ onBack: () => 'handled', onError: vi.fn() })
        await controller.ready
        mock.listener!({ canGoBack: true })
        await flush()
        expect(backSpy).not.toHaveBeenCalled()
        expect(mock.exitCalls).toBe(0)
    })

    it('registration rejection is surfaced once without a live listener', async () => {
        mock.addBehavior = 'reject'
        const onError = vi.fn()
        const onBack = vi.fn(() => 'handled' as const)
        const controller = registerNativeAppLifecycle({ onBack, onError })
        await expect(controller.ready).rejects.toBeInstanceOf(NativeLifecycleError)
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError.mock.calls[0][0].code).toBe('NATIVE_BACK_REGISTRATION_FAILED')
        mock.listener?.({ canGoBack: true })
        await flush()
        expect(onBack).not.toHaveBeenCalled()
    })

    it('dispose before ready removes the late handle exactly once', async () => {
        mock.addBehavior = 'pending'
        const controller = registerNativeAppLifecycle({ onBack: () => 'handled', onError: vi.fn() })
        const disposePromise = controller.dispose()
        mock.pendingResolvers[0]()
        await disposePromise
        expect(mock.removeCalls).toBe(1)
    })

    it('concurrent dispose calls share one asynchronous removal', async () => {
        const controller = registerNativeAppLifecycle({ onBack: () => 'handled', onError: vi.fn() })
        await controller.ready
        await Promise.all([controller.dispose(), controller.dispose(), controller.dispose()])
        expect(mock.removeCalls).toBe(1)
    })

    it('handled history and exit dispositions have explicit non-overlapping effects', async () => {
        const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})

        const handled = registerNativeAppLifecycle({ onBack: () => 'handled', onError: vi.fn() })
        await handled.ready
        mock.listener!({ canGoBack: true })
        await flush()
        expect(backSpy).not.toHaveBeenCalled()
        expect(mock.exitCalls).toBe(0)
        await handled.dispose()

        const history = registerNativeAppLifecycle({ onBack: () => 'history', onError: vi.fn() })
        await history.ready
        mock.listener!({ canGoBack: true })
        await flush()
        expect(backSpy).toHaveBeenCalledTimes(1)
        expect(mock.exitCalls).toBe(0)
        await history.dispose()

        const exit = registerNativeAppLifecycle({ onBack: () => 'exit', onError: vi.fn() })
        await exit.ready
        mock.listener!({ canGoBack: true })
        await flush()
        expect(mock.exitCalls).toBe(1)
        expect(backSpy).toHaveBeenCalledTimes(1)
        await exit.dispose()
    })

    it('history at the root fails closed and never exits implicitly', async () => {
        const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {})
        const onError = vi.fn()
        const controller = registerNativeAppLifecycle({ onBack: () => 'history', onError })
        await controller.ready
        mock.listener!({ canGoBack: false })
        await flush()
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError.mock.calls[0][0].code).toBe('NATIVE_BACK_HISTORY_UNAVAILABLE')
        expect(backSpy).not.toHaveBeenCalled()
        expect(mock.exitCalls).toBe(0)
    })

    it('onback rejection is reported once as NATIVE_BACK_HANDLER_FAILED', async () => {
        const onError = vi.fn()
        const controller = registerNativeAppLifecycle({ onBack: () => Promise.reject(new Error('boom')), onError })
        await controller.ready
        mock.listener!({ canGoBack: true })
        await flush()
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError.mock.calls[0][0].code).toBe('NATIVE_BACK_HANDLER_FAILED')
    })

    it('exitapp rejection is reported as NATIVE_BACK_EXIT_FAILED without retry', async () => {
        mock.exitBehavior = 'reject'
        const onError = vi.fn()
        const controller = registerNativeAppLifecycle({ onBack: () => 'exit', onError })
        await controller.ready
        mock.listener!({ canGoBack: true })
        await flush()
        expect(mock.exitCalls).toBe(1)
        expect(onError.mock.calls[0][0].code).toBe('NATIVE_BACK_EXIT_FAILED')
    })

    it('remove rejection is NATIVE_BACK_REMOVE_FAILED and repeated dispose shares the same outcome', async () => {
        mock.removeBehavior = 'reject'
        const onError = vi.fn()
        const controller = registerNativeAppLifecycle({ onBack: () => 'handled', onError })
        await controller.ready
        await controller.dispose()
        await controller.dispose()
        expect(mock.removeCalls).toBe(1)
        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError.mock.calls[0][0].code).toBe('NATIVE_BACK_REMOVE_FAILED')
    })

    it('dispose after registration failure resolves without a live listener', async () => {
        mock.addBehavior = 'reject'
        const controller = registerNativeAppLifecycle({ onBack: () => 'handled', onError: vi.fn() })
        await controller.ready.catch(() => undefined)
        await expect(controller.dispose()).resolves.toBeUndefined()
        expect(mock.removeCalls).toBe(0)
    })

    it('concurrent back events are processed one at a time in fifo order', async () => {
        const order: number[] = []
        let active = 0
        let peak = 0
        let seq = 0
        const onBack = () => {
            active += 1
            peak = Math.max(peak, active)
            const id = (seq += 1)
            order.push(id)
            return new Promise<'handled'>((resolve) => setTimeout(() => { active -= 1; resolve('handled') }, 5))
        }
        const controller = registerNativeAppLifecycle({ onBack, onError: vi.fn() })
        await controller.ready
        mock.listener!({ canGoBack: true })
        mock.listener!({ canGoBack: true })
        mock.listener!({ canGoBack: true })
        await new Promise((resolve) => setTimeout(resolve, 40))
        expect(order).toEqual([1, 2, 3])
        expect(peak).toBe(1)
    })

    it('late callbacks after dispose have no effect', async () => {
        const onBack = vi.fn(() => 'handled' as const)
        const controller = registerNativeAppLifecycle({ onBack, onError: vi.fn() })
        await controller.ready
        await controller.dispose()
        mock.listener!({ canGoBack: true })
        await flush()
        expect(onBack).not.toHaveBeenCalled()
    })

    it('onError is required and typed as NativeLifecycleError', () => {
        const options: RegisterNativeAppLifecycleOptions = {
            onBack: () => 'handled',
            onError: (error) => {
                const code: NativeLifecycleError['code'] = error.code
                expect(typeof code).toBe('string')
            },
        }
        // @ts-expect-error onError is mandatory; omitting it must not type-check.
        const invalid: RegisterNativeAppLifecycleOptions = { onBack: () => 'handled' }
        expect(options.onBack({ canGoBack: false })).toBe('handled')
        expect(invalid).toBeDefined()
    })
})

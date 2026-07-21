// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const toastMock = vi.hoisted(() => ({
    info: vi.fn(() => 'id-info'),
    success: vi.fn(() => 'id-success'),
    warning: vi.fn(() => 'id-warning'),
    error: vi.fn(() => 'id-error'),
}))

vi.mock('vue-sonner', () => ({ toast: toastMock }))

import { useTalosToast } from './useTalosToast'
import TalosSonnerToastContent from '../components/ui/sonner/TalosSonnerToastContent.vue'

beforeEach(() => {
    Object.values(toastMock).forEach((mock) => mock.mockClear())
})

// The vue-sonner runtime is loaded lazily on first toast, so dispatch is
// fire-and-forget; flush the dynamic-import microtask before asserting.
async function flush() {
    await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('useTalosToast', () => {
    it('maps every TALOS tone to the corresponding native Sonner method', async () => {
        const toast = useTalosToast()
        toast.info('i')
        toast.success('s')
        toast.warning('w')
        toast.error('e')
        await flush()

        expect(toastMock.info).toHaveBeenCalledWith(TalosSonnerToastContent, expect.objectContaining({ componentProps: { message: 'i', tone: 'info' } }))
        expect(toastMock.success).toHaveBeenCalledWith(TalosSonnerToastContent, expect.objectContaining({ componentProps: { message: 's', tone: 'success' } }))
        expect(toastMock.warning).toHaveBeenCalledWith(TalosSonnerToastContent, expect.objectContaining({ componentProps: { message: 'w', tone: 'warning' } }))
        expect(toastMock.error).toHaveBeenCalledWith(TalosSonnerToastContent, expect.objectContaining({ componentProps: { message: 'e', tone: 'error' } }))
    })

    it('reuses a stable id so repeated feedback updates one toast', async () => {
        const toast = useTalosToast()
        toast.info('first', { id: 'command-feedback' })
        toast.info('second', { id: 'command-feedback' })
        await flush()

        expect(toastMock.info).toHaveBeenCalledTimes(2)
        expect(toastMock.info).toHaveBeenNthCalledWith(1, TalosSonnerToastContent, expect.objectContaining({ id: 'command-feedback', componentProps: { message: 'first', tone: 'info' } }))
        expect(toastMock.info).toHaveBeenNthCalledWith(2, TalosSonnerToastContent, expect.objectContaining({ id: 'command-feedback', componentProps: { message: 'second', tone: 'info' } }))
    })

    it('forwards a deterministic native action label and callback', async () => {
        const toast = useTalosToast()
        const onClick = vi.fn()
        toast.error('failed', { action: { label: 'Retry', onClick } })
        await flush()

        const options = toastMock.error.mock.calls[0][1]
        expect(options.action).toEqual({ label: 'Retry', onClick })
        options.action.onClick()
        expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('passes accessible content component props without replacing native action handling', async () => {
        const toast = useTalosToast()
        const onClick = vi.fn()
        toast.warning('careful', { id: 'x', action: { label: 'Undo', onClick } })
        await flush()

        const [component, options] = toastMock.warning.mock.calls[0]
        expect(component).toBe(TalosSonnerToastContent)
        expect(options.componentProps).toEqual({ message: 'careful', tone: 'warning' })
        expect(options.action.label).toBe('Undo')
        expect(options.componentProps.action).toBeUndefined()
    })
})

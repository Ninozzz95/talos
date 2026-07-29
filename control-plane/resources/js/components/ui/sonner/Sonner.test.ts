// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { toast } from 'vue-sonner'
import { Toaster } from './index'
import { useTalosToast } from '../../../composables/useTalosToast'

let app: ReturnType<typeof createApp> | undefined

afterEach(() => {
    toast.dismiss()
    app?.unmount()
    app = undefined
    document.body.replaceChildren()
})

async function flush() {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('TALOS Sonner wrapper', () => {
    it('renders the native notifications region with TALOS close, role, atomicity, tokens and motion intent', async () => {
        const container = document.createElement('div')
        document.body.append(container)
        app = createApp(defineComponent({ setup: () => () => h(Toaster, { closeButton: true }) }))
        app.mount(container)

        useTalosToast().error('Boom')
        await flush()

        const region = document.querySelector('section[aria-label], ol[data-sonner-toaster], [data-sonner-toaster]')
        expect(region, 'native Sonner region should mount').toBeTruthy()

        const content = document.querySelector('[data-motion-intent]')
        expect(content, 'content adapter should render inside the toast').toBeTruthy()
        expect(content?.getAttribute('data-motion-intent')).toBe('error-attention')
        expect(content?.getAttribute('role')).toBe('alert')
        expect(content?.getAttribute('aria-atomic')).toBe('true')
        expect(content?.classList.contains('talos-motion-feedback')).toBe(true)
        expect(content?.textContent).toContain('Boom')

        const closeButton = document.querySelector('[data-close-button], button[aria-label="Close toast"], button[data-button][data-close-button]')
        expect(closeButton, 'native close control should be present').toBeTruthy()
    })

    it('keeps top notifications below the workspace header by default', async () => {
        const container = document.createElement('div')
        document.body.append(container)
        app = createApp(defineComponent({
            setup: () => () => h(Toaster, { position: 'top-right' }),
        }))
        app.mount(container)
        await flush()

        const region = document.querySelector<HTMLElement>(
            '[data-sonner-toaster][data-y-position="top"][data-x-position="right"]',
        )
        expect(region).not.toBeNull()
        expect(region?.style.getPropertyValue('--offset-top')).toBe('4.5rem')
        expect(region?.style.getPropertyValue('--offset-right')).toBe('1rem')
        expect(region?.style.getPropertyValue('--mobile-offset-top')).toBe('4.5rem')
        expect(region?.style.getPropertyValue('--mobile-offset-right')).toBe('1rem')
    })
})

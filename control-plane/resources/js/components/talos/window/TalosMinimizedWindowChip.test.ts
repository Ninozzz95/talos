// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import TalosMinimizedWindowChip from './TalosMinimizedWindowChip.vue'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountChip(closeFault: { code: 'TALOS_WINDOW_CLOSE_FAILED'; message: string } | null = null) {
    const events: string[] = []
    const mountPoint = document.createElement('div')
    document.body.append(mountPoint)
    const app = createApp(defineComponent({
        setup() {
            return () => h(TalosMinimizedWindowChip, {
                id: 'theme',
                title: 'Theme',
                closeFault,
                onRestore: () => events.push('restore'),
                onClose: () => events.push('close'),
                onRetryClose: () => events.push('retry-close'),
            })
        },
    }))
    apps.push(app)
    app.mount(mountPoint)

    return { events, mountPoint }
}

describe('TalosMinimizedWindowChip', () => {
    it('renders distinct native Restore and Close actions with stable accessible names', () => {
        const mounted = mountChip()
        const group = mounted.mountPoint.querySelector('[role="group"]')
        const restore = mounted.mountPoint.querySelector<HTMLButtonElement>('[data-testid="talos-restore-window-theme"]')
        const close = mounted.mountPoint.querySelector<HTMLButtonElement>('[data-testid="talos-close-minimized-window-theme"]')

        expect(group?.getAttribute('aria-label')).toBe('Theme minimized window controls')
        expect(restore?.tagName).toBe('BUTTON')
        expect(restore?.getAttribute('aria-label')).toBe('Restore Theme')
        expect(close?.tagName).toBe('BUTTON')
        expect(close?.getAttribute('aria-label')).toBe('Close minimized Theme')

        restore?.click()
        close?.click()
        expect(mounted.events).toEqual(['restore', 'close'])
    })

    it('reports a controlled close fault and provides an explicit retry action', async () => {
        const mounted = mountChip({
            code: 'TALOS_WINDOW_CLOSE_FAILED',
            message: 'TALOS could not close this window. Retry the action.',
        })
        await nextTick()

        const alert = mounted.mountPoint.querySelector('[role="alert"]')
        const retry = mounted.mountPoint.querySelector<HTMLButtonElement>('[data-testid="talos-retry-close-minimized-window-theme"]')
        expect(alert?.textContent).toContain('TALOS could not close this window. Retry the action.')
        expect(alert?.getAttribute('data-window-action-fault')).toBe('TALOS_WINDOW_CLOSE_FAILED')
        expect(retry?.getAttribute('aria-label')).toBe('Retry closing Theme')

        retry?.click()
        expect(mounted.events).toEqual(['retry-close'])
    })
})

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import TalosMobileToolSheet from './TalosMobileToolSheet.vue'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

describe('TalosMobileToolSheet', () => {
    it('owns a trapped, internally scrolling sheet without desktop window controls', async () => {
        const close = vi.fn()
        const launcher = document.createElement('button')
        launcher.textContent = 'Launcher'
        document.body.append(launcher)
        launcher.focus()
        const host = document.createElement('div')
        document.body.append(host)
        const app = createApp(defineComponent({
            setup: () => () => h(TalosMobileToolSheet, {
                id: 'theme',
                title: 'Theme',
                description: 'Appearance controls.',
                onClose: close,
            }, { default: () => h('button', { type: 'button' }, 'Inside action') }),
        }))
        apps.push(app)
        app.mount(host)
        await nextTick()

        const sheet = host.querySelector<HTMLElement>('[role="dialog"]')
        expect(sheet?.getAttribute('aria-modal')).toBe('true')
        expect(sheet?.querySelector('[data-testid="talos-mobile-sheet-body"]')).toBeTruthy()
        expect(sheet?.textContent).toContain('Theme')
        expect(sheet?.textContent).not.toContain('Dock')
        expect(sheet?.textContent).not.toContain('Fullscreen')
        expect(document.activeElement).toBe(sheet?.querySelector('[aria-label="Back to chat"]'))

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        expect(close).toHaveBeenCalledWith('theme')
    })

    it('cycles Tab focus within the sheet and restores the launcher on unmount', async () => {
        const launcher = document.createElement('button')
        launcher.id = 'sheet-launcher'
        document.body.append(launcher)
        launcher.focus()
        const host = document.createElement('div')
        document.body.append(host)
        const app = createApp(TalosMobileToolSheet, { id: 'notes', title: 'Notes' })
        apps.push(app)
        app.mount(host)
        await nextTick()

        const buttons = host.querySelectorAll<HTMLButtonElement>('button')
        buttons[buttons.length - 1]?.focus()
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
        expect(document.activeElement).toBe(buttons[0])

        app.unmount()
        apps.splice(apps.indexOf(app), 1)
        expect(document.activeElement).toBe(launcher)
    })
})

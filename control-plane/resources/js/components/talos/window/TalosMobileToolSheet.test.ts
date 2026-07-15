// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import TalosMobileToolSheet from './TalosMobileToolSheet.vue'
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from '../../ui/dialog'

const apps: Array<ReturnType<typeof createApp>> = []

function createPortalRoot() {
    const portalRoot = document.createElement('div')
    portalRoot.id = 'talos-portal-root'
    document.body.append(portalRoot)
    return portalRoot
}

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

describe('TalosMobileToolSheet', () => {
    it('selects the real upstream Drawer or fullscreen Dialog through an explicit presentation contract', async () => {
        createPortalRoot()
        const drawerHost = document.createElement('div')
        document.body.append(drawerHost)
        const drawer = createApp(TalosMobileToolSheet, {
            id: 'theme',
            title: 'Theme',
            presentation: 'drawer',
        })
        apps.push(drawer)
        drawer.mount(drawerHost)
        await nextTick()
        expect(document.querySelector('[data-testid="talos-mobile-tool-sheet"][data-window-presentation="drawer"]')).toBeTruthy()
        expect(document.querySelector('[data-talos-surface="talos-mobile-tool-drawer"]')).toBeTruthy()
        expect(document.querySelector('[data-talos-upstream="shadcn-vue-reka-drawer"]')).toBeTruthy()

        drawer.unmount()
        apps.splice(apps.indexOf(drawer), 1)
        drawerHost.remove()

        const dialogHost = document.createElement('div')
        document.body.append(dialogHost)
        const dialog = createApp(TalosMobileToolSheet, {
            id: 'notes',
            title: 'Notes',
            presentation: 'fullscreen',
        })
        apps.push(dialog)
        dialog.mount(dialogHost)
        await nextTick()
        const fullscreen = document.querySelector<HTMLElement>('[data-testid="talos-mobile-tool-sheet"][data-window-presentation="fullscreen"]')
        expect(fullscreen).toBeTruthy()
        expect(fullscreen?.classList.contains('flex')).toBe(true)
        expect(fullscreen?.classList.contains('flex-col')).toBe(true)
        expect(document.querySelector('[data-talos-surface="talos-mobile-tool-fullscreen"]')).toBeTruthy()
        expect(document.querySelector('[data-talos-upstream="shadcn-vue-dialog"]')).toBeTruthy()
    })

    it('keeps the active surface stable when Appearance changes the preference for the next window', async () => {
        createPortalRoot()
        const presentation = ref<'drawer' | 'fullscreen'>('drawer')
        const host = document.createElement('div')
        document.body.append(host)
        const app = createApp(defineComponent({
            setup: () => () => h(TalosMobileToolSheet, {
                id: 'settings',
                title: 'Settings',
                presentation: presentation.value,
            }, { default: () => h('div', 'Unsaved Appearance state') }),
        }))
        apps.push(app)
        app.mount(host)
        await nextTick()

        presentation.value = 'fullscreen'
        await nextTick()

        expect(document.querySelector('[data-testid="talos-mobile-tool-sheet"]')?.getAttribute('data-window-presentation')).toBe('drawer')
        expect(document.querySelector('[data-talos-surface="talos-mobile-tool-drawer"]')?.textContent).toContain('Unsaved Appearance state')
        expect(document.querySelector('[data-talos-surface="talos-mobile-tool-fullscreen"]')).toBeNull()
    })

    it('owns a trapped, internally scrolling sheet without desktop window controls', async () => {
        createPortalRoot()
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
        await nextTick()

        const sheet = document.querySelector<HTMLElement>('[role="dialog"]')
        expect(sheet?.getAttribute('aria-modal')).toBe('true')
        expect(sheet?.querySelector('[data-testid="talos-mobile-sheet-body"]')).toBeTruthy()
        expect(sheet?.textContent).toContain('Theme')
        expect(sheet?.textContent).not.toContain('Dock')
        expect(sheet?.textContent).not.toContain('Fullscreen')
        expect(document.activeElement).toBe(sheet?.querySelector('[aria-label="Back to chat"]'))

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        expect(close).not.toHaveBeenCalled()
        await nextTick()
        sheet?.dispatchEvent(new Event('transitionend'))
        await nextTick()
        expect(close).toHaveBeenCalledWith('theme')
    })

    it('keeps the upstream modal mounted until its leave lifecycle completes', async () => {
        createPortalRoot()
        const close = vi.fn()
        const host = document.createElement('div')
        document.body.append(host)
        const app = createApp(TalosMobileToolSheet, {
            id: 'theme',
            title: 'Theme',
            onClose: close,
        })
        apps.push(app)
        app.mount(host)
        await nextTick()

        const sheet = document.querySelector<HTMLElement>('[data-testid="talos-mobile-tool-sheet"]')
        const closeButton = sheet?.querySelector<HTMLButtonElement>('[aria-label="Close Theme"]')
        closeButton?.click()

        expect(close).not.toHaveBeenCalled()
        expect(sheet?.getAttribute('data-state')).toBe('open')

        await nextTick()
        expect(sheet?.getAttribute('data-state')).toBe('closed')
        sheet?.dispatchEvent(new CustomEvent('after-leave'))

        expect(close).not.toHaveBeenCalled()

        sheet?.dispatchEvent(new Event('transitionend'))

        await nextTick()

        expect(close).toHaveBeenCalledTimes(1)
        expect(close).toHaveBeenCalledWith('theme')

        sheet?.dispatchEvent(new CustomEvent('after-leave'))
        expect(close).toHaveBeenCalledTimes(1)
    })

    it('cycles Tab focus within the sheet and restores the launcher on unmount', async () => {
        createPortalRoot()
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

        const buttons = document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')
        buttons[buttons.length - 1]?.focus()
        buttons[buttons.length - 1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
        expect(document.activeElement).toBe(buttons[0])

        app.unmount()
        apps.splice(apps.indexOf(app), 1)
        await nextTick()
        expect(document.activeElement).toBe(launcher)
        expect(launcher.hasAttribute('aria-hidden')).toBe(false)
        expect(launcher.hasAttribute('data-aria-hidden')).toBe(false)
    })

    it('restores the nearest stable rail control when an Advanced launcher is removed', async () => {
        createPortalRoot()
        const advanced = document.createElement('button')
        advanced.setAttribute('aria-label', 'Advanced')
        document.body.append(advanced)
        const transientLauncher = document.createElement('button')
        transientLauncher.setAttribute('aria-label', 'Knowledge')
        document.body.append(transientLauncher)
        transientLauncher.focus()
        const host = document.createElement('div')
        document.body.append(host)
        const app = createApp(TalosMobileToolSheet, {
            id: 'search',
            title: 'Knowledge',
            returnFocusLabels: ['Knowledge', 'Advanced'],
        })
        apps.push(app)
        app.mount(host)
        await nextTick()
        await nextTick()

        app.unmount()
        apps.splice(apps.indexOf(app), 1)
        transientLauncher.remove()
        await Promise.resolve()

        expect(document.activeElement).toBe(advanced)
    })

    it('restores launcher focus after repeated component lifecycles', async () => {
        createPortalRoot()
        const launcher = document.createElement('button')
        launcher.setAttribute('aria-label', 'Advanced')
        document.body.append(launcher)

        for (const id of ['runtime', 'search', 'brain']) {
            launcher.focus()
            const host = document.createElement('div')
            document.body.append(host)
            const app = createApp(TalosMobileToolSheet, {
                id,
                title: id,
                returnFocusLabels: ['Advanced'],
            })
            apps.push(app)
            app.mount(host)
            await nextTick()
            await nextTick()

            expect(document.querySelector('[data-testid="talos-mobile-tool-sheet"]')).toBeTruthy()

            app.unmount()
            apps.splice(apps.indexOf(app), 1)
            host.remove()
            await nextTick()

            expect(document.activeElement).toBe(launcher)
        }
    })

    it('leaves Escape to an open nested portal dialog before closing the sheet', async () => {
        const close = vi.fn()
        createPortalRoot()

        const host = document.createElement('div')
        document.body.append(host)
        const app = createApp(defineComponent({
            setup: () => () => h(TalosMobileToolSheet, {
                id: 'runtime',
                title: 'Runtime',
                onClose: close,
            }, {
                default: () => h(Dialog, { open: true, modal: true }, {
                    default: () => h(DialogContent, { showClose: false }, {
                        default: () => [
                            h(DialogTitle, {}, () => 'Nested confirmation'),
                            h('button', { type: 'button' }, 'Confirm'),
                        ],
                    }),
                }),
            }),
        }))
        apps.push(app)
        app.mount(host)
        await nextTick()

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

        expect(close).not.toHaveBeenCalled()
    })
})

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import TalosMobileRail from './TalosMobileRail.vue'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountRail() {
    const opened: string[] = []
    const focusChat = vi.fn()
    const openNavigation = vi.fn()
    const shell = document.createElement('div')
    shell.className = 'talos-shell'
    const portalRoot = document.createElement('div')
    portalRoot.id = 'talos-portal-root'
    const mountPoint = document.createElement('div')
    shell.append(portalRoot, mountPoint)
    document.body.append(shell)

    const app = createApp(defineComponent({
        setup() {
            return () => h(TalosMobileRail, {
                creatingSession: false,
                visibility: {},
                activeIds: [],
                navigationOpen: false,
                onOpenWindow: (id: string) => opened.push(id),
                onFocusChat: focusChat,
                onOpenNavigation: openNavigation,
            })
        },
    }))

    apps.push(app)
    app.mount(mountPoint)

    return { mountPoint, portalRoot, opened, focusChat, openNavigation }
}

describe('TalosMobileRail guide placement', () => {
    it('keeps Chat as a quick command and moves the navigation hamburger to the workspace header (v7 R1)', () => {
        const mounted = mountRail()

        const chat = mounted.mountPoint.querySelector<HTMLButtonElement>('[aria-label="Chat"]')
        expect(chat).not.toBeNull()
        expect(mounted.mountPoint.querySelector('[aria-label="Open navigation menu"]')).toBeNull()
        expect(mounted.mountPoint.querySelector('[aria-label="Open chat history"]')).toBeNull()

        chat?.click()
        expect(mounted.focusChat).toHaveBeenCalledOnce()
        expect(mounted.openNavigation).not.toHaveBeenCalled()
    })

    it('keeps Advanced out of the quick rail so it remains inside the complete sidebar', async () => {
        const mounted = mountRail()

        expect(mounted.mountPoint.querySelector('.talos-advanced-rail-popover')).toBeNull()
        expect(mounted.portalRoot.querySelector('.talos-advanced-rail-popover')).toBeNull()
        expect(mounted.mountPoint.querySelector('button[aria-label="Advanced"]')).toBeNull()
    })

    it('keeps contextual information out of mobile navigation', () => {
        const mounted = mountRail()

        expect(mounted.mountPoint.querySelectorAll('[data-guide-id]')).toHaveLength(0)
        expect(mounted.mountPoint.querySelector('button button')).toBeNull()
    })

    it('keeps the module command available after guide actions leave the rail', () => {
        const mounted = mountRail()

        mounted.mountPoint.querySelector<HTMLButtonElement>('button[aria-label="Cockpit"]')?.click()
        expect(mounted.opened).toEqual(['runtime'])
    })
})

// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import TalosMobileRail from './TalosMobileRail.vue'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountRail() {
    const opened: string[] = []
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
                advancedExpanded: true,
                activeIds: [],
                historyOpen: false,
                onOpenWindow: (id: string) => opened.push(id),
            })
        },
    }))

    apps.push(app)
    app.mount(mountPoint)

    return { mountPoint, portalRoot, opened }
}

describe('TalosMobileRail guide actions', () => {
    it('renders a separate canonical Info action for every mobile module entry', () => {
        const mounted = mountRail()

        expect(mounted.mountPoint.querySelectorAll('[data-guide-available="true"]')).toHaveLength(17)
        expect(mounted.mountPoint.querySelector('button button')).toBeNull()
        expect(mounted.mountPoint.querySelector('[aria-label="Information about Runtime"]')).not.toBeNull()
        expect(mounted.mountPoint.querySelector('[aria-label="Information about Doctor"]')).not.toBeNull()
    })

    it('opens information without emitting the mobile module command', async () => {
        const mounted = mountRail()
        mounted.mountPoint.querySelector<HTMLButtonElement>('[aria-label="Information about Runtime"]')?.click()
        await nextTick()
        await nextTick()

        expect(mounted.opened).toEqual([])
        expect(mounted.portalRoot.textContent).toContain('Inspect persisted runs, events and execution evidence.')

        mounted.mountPoint.querySelector<HTMLButtonElement>('button[aria-label="Runtime"]')?.click()
        expect(mounted.opened).toEqual(['runtime'])
    })
})

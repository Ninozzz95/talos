// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import TalosLeftRail from './TalosLeftRail.vue'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountRail(collapsed: boolean) {
    const opened: string[] = []
    const shell = document.createElement('div')
    shell.className = 'talos-shell'
    const portalRoot = document.createElement('div')
    portalRoot.id = 'talos-portal-root'
    const mountPoint = document.createElement('div')
    shell.append(portalRoot, mountPoint)
    document.body.append(shell)

    const visibility = {
        brand_name: true,
        search: true,
        models: true,
        cookbook: true,
        deep_research: true,
        gallery: true,
        library: true,
        runtime: true,
        calendar: true,
        compare: true,
        browse: true,
        tasks: true,
        notes: true,
        brain: true,
        tools: true,
        doctor: true,
        settings_button: true,
        settings: true,
        theme: true,
        chats: true,
        new_chat: true,
    }

    const app = createApp(defineComponent({
        setup() {
            return () => h(TalosLeftRail, {
                activeIds: [],
                theme: 'forge',
                collapsed,
                width: 280,
                visibility,
                sessions: [],
                advancedExpanded: true,
                onOpen: (id: string) => opened.push(id),
            })
        },
    }))

    apps.push(app)
    app.mount(mountPoint)

    return { mountPoint, portalRoot, opened }
}

describe('TalosLeftRail guide actions', () => {
    it.each([false, true])('renders the exhaustive guide inventory when collapsed=%s', (collapsed) => {
        const mounted = mountRail(collapsed)
        expect(mounted.mountPoint.querySelectorAll('[data-guide-available="true"]')).toHaveLength(17)
        expect(mounted.mountPoint.querySelector('button button')).toBeNull()
        expect(mounted.mountPoint.querySelector('[aria-label="Information about Advanced"]')).not.toBeNull()
        expect(mounted.mountPoint.querySelector('[aria-label="Information about Browse"]')).not.toBeNull()
        expect(mounted.mountPoint.querySelector('[aria-label="Information about Theme"]')).not.toBeNull()
    })

    it('opens information without emitting the module open command', async () => {
        const mounted = mountRail(false)
        const info = mounted.mountPoint.querySelector<HTMLButtonElement>('[aria-label="Information about Runtime"]')
        info?.click()
        await nextTick()
        await nextTick()

        expect(mounted.opened).toEqual([])
        expect(mounted.portalRoot.textContent).toContain('Inspect persisted runs, events and execution evidence.')

        mounted.mountPoint.querySelector<HTMLButtonElement>('button[aria-label="Runtime"]')?.click()
        expect(mounted.opened).toEqual(['runtime'])
    })
})

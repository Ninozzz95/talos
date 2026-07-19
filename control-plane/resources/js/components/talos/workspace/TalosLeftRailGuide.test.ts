// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
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

describe('TalosLeftRail guide placement', () => {
    it('ports the collapsed Advanced menu outside the scroll container', async () => {
        const mounted = mountRail(true)

        expect(mounted.mountPoint.querySelector('.talos-advanced-rail-popover')).toBeNull()

        mounted.mountPoint.querySelector<HTMLButtonElement>('button[aria-label="Workbench"]')?.click()
        await nextTick()
        await vi.waitFor(() => {
            expect(mounted.portalRoot.querySelector('.talos-advanced-rail-popover')).not.toBeNull()
        })

        expect(mounted.mountPoint.querySelector('.talos-advanced-rail-popover')).toBeNull()
        expect(mounted.portalRoot.querySelector('.talos-advanced-rail-popover')).not.toBeNull()
    })

    it.each([false, true])('keeps contextual information out of navigation when collapsed=%s', (collapsed) => {
        const mounted = mountRail(collapsed)

        expect(mounted.mountPoint.querySelectorAll('[data-guide-id]')).toHaveLength(0)
        expect(mounted.mountPoint.querySelector('button button')).toBeNull()
    })

    it('keeps the module command available after guide actions leave the rail', () => {
        const mounted = mountRail(false)

        mounted.mountPoint.querySelector<HTMLButtonElement>('button[aria-label="Cockpit"]')?.click()
        expect(mounted.opened).toEqual(['runtime'])
    })
})

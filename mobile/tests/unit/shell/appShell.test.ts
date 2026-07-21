import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { asyncRouteComponent, TALOS_MOBILE_ROUTES } from '@/lib/mobileRoutes'
import App from '@/App.vue'

function makeRouter(): Router {
    return createRouter({
        history: createMemoryHistory(),
        routes: TALOS_MOBILE_ROUTES.map((r) => ({ path: r.path, name: r.name, component: asyncRouteComponent(r) })),
    })
}

describe('App shell (rail + chat base + station sheets)', () => {
    beforeEach(() => {
        // Skip the native lifecycle listener in jsdom via the fail-closed switch.
        window.__TALOS_M1_DISABLE__ = ['lifecycle']
    })
    afterEach(() => {
        window.__TALOS_M1_DISABLE__ = undefined
    })

    it('renders the rail and the persistent chat base at /, with no sheet open', async () => {
        const router = makeRouter()
        router.push('/')
        await router.isReady()
        const w = mount(App, { global: { plugins: [router] } })
        await flushPromises()

        expect(w.find('[data-testid="talos-mobile-rail"]').exists()).toBe(true)
        expect(w.text()).toContain('What claim should we benchmark?') // chat base welcome
        expect(w.find('[data-testid="talos-mobile-tool-sheet"]').exists()).toBe(false)
        // bottom-nav is gone
        expect(w.find('[data-testid="ui-fallback"]').exists()).toBe(false)
    })

    it('opens a station in a tool-sheet over the persistent chat base, and closes back to chat', async () => {
        const router = makeRouter()
        router.push('/')
        await router.isReady()
        const w = mount(App, { global: { plugins: [router] } })
        await flushPromises()

        router.push('/research')
        await flushPromises()

        const sheet = w.find('[data-testid="talos-mobile-tool-sheet"]')
        expect(sheet.exists()).toBe(true)
        expect(w.text()).toContain('Deep Research V3')
        // chat base still mounted behind the sheet
        expect(w.text()).toContain('What claim should we benchmark?')

        await w.get('[aria-label="Back to chat"]').trigger('click')
        await flushPromises()
        expect(w.find('[data-testid="talos-mobile-tool-sheet"]').exists()).toBe(false)
        expect(router.currentRoute.value.name).toBe('chat')
    })
})

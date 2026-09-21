// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import TalosTabletSidebar from '@/components/shell/TalosTabletSidebar.vue'

// F6 sidebar refactor (24/8): owner, after a technical tour of the real
// Claude app — one physical sidebar slot, contextual content, never two
// panels side by side.
//
// ChatsScreen/HarnessScreen are STUBBED here, not really mounted: ChatsScreen
// alone needs @/stores/chatController mocked to render at all (see
// chatsScreen.test.ts's own vi.mock of it) — pulling that whole chain into a
// test about THIS component's own job (which child shows, what label it
// carries) would test someone else's internals twice and couple this file to
// their setup. Their real behaviour is already covered by chatsScreen.test.ts
// and harnessScreen.test.ts.
const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', name: 'qualsiasi', component: { template: '<div />' } }],
})

afterEach(() => {
    document.body.innerHTML = ''
})

function mountSidebar(props: Record<string, unknown> = {}) {
    return mount(TalosTabletSidebar, {
        attachTo: document.body,
        global: {
            plugins: [router],
            stubs: {
                ChatsScreen: { template: '<div data-testid="stub-chats-screen" />' },
                HarnessScreen: { template: '<div data-testid="stub-harness-screen" />' },
                TalosMobileNotificationBell: true,
                TalosMobileDownloadCenterTrigger: true,
            },
        },
        props: { width: 320, ...props },
    })
}

describe('TalosTabletSidebar (F6 sidebar refactor) — one rail, contextual content', () => {
    it('defaults to the chat variant when none is given (no regression)', async () => {
        const w = mountSidebar()
        await flushPromises()
        expect(w.get('[data-testid="talos-tablet-sidebar"]').attributes('data-talos-tablet-sidebar-variant')).toBe('chat')
        expect(w.find('[data-testid="stub-chats-screen"]').exists()).toBe(true)
        expect(w.find('[data-testid="stub-harness-screen"]').exists()).toBe(false)
    })

    it('shows the Harness session list instead of chats when variant is harness', async () => {
        const w = mountSidebar({ variant: 'harness' })
        await flushPromises()
        expect(w.get('[data-testid="talos-tablet-sidebar"]').attributes('data-talos-tablet-sidebar-variant')).toBe('harness')
        expect(w.find('[data-testid="stub-harness-screen"]').exists()).toBe(true)
        // Never both at once — that duplication is exactly what the owner
        // rejected in the mockup's own sessions panel earlier this session.
        expect(w.find('[data-testid="stub-chats-screen"]').exists()).toBe(false)
    })

    it('labels the panel with what is actually on screen, not a stale "chats" label', async () => {
        const chat = mountSidebar({ variant: 'chat' })
        await flushPromises()
        expect(chat.get('[data-testid="talos-tablet-sidebar"]').attributes('aria-label')).toBe('Chats panel')

        const harness = mountSidebar({ variant: 'harness' })
        await flushPromises()
        expect(harness.get('[data-testid="talos-tablet-sidebar"]').attributes('aria-label')).toBe('Code panel')
    })

    it('the brand header (hamburger + wordmark) stays put in both variants', async () => {
        const w = mountSidebar({ variant: 'harness' })
        await flushPromises()
        expect(w.text()).toContain('TALOS')
        await w.get('[data-testid="talos-tablet-menu"]').trigger('click')
        // defineEmits declares `openMenu` (camelCase) — that literal string is
        // what emit() calls at runtime, regardless of the @open-menu kebab
        // alias App.vue's template uses to listen for it.
        expect(w.emitted('openMenu')).toHaveLength(1)
    })

    it('HARNESS-TABLET-RAIL-COLLAPSE-01 hides only the Harness list and leaves two reachable controls', async () => {
        const w = mountSidebar({ variant: 'harness', collapsed: true, width: 72 })
        await flushPromises()

        const rail = w.get('[data-testid="talos-tablet-sidebar"]')
        expect(rail.attributes('data-talos-tablet-sidebar-collapsed')).toBe('true')
        expect(rail.attributes('style')).toContain('width: 72px')
        expect(w.find('[data-testid="stub-harness-screen"]').exists()).toBe(false)
        expect(w.find('[data-testid="stub-chats-screen"]').exists()).toBe(false)
        expect(w.find('[data-testid="talos-tablet-menu"]').exists()).toBe(true)
        expect(w.get('[data-testid="talos-tablet-harness-toggle"]').attributes('aria-label')).toBe('Expand Code sessions')

        await w.get('[data-testid="talos-tablet-harness-toggle"]').trigger('click')
        expect(w.emitted('toggleCollapsed')).toEqual([[]])
    })

    it('HARNESS-TABLET-RAIL-COLLAPSE-01 exposes collapse while expanded', async () => {
        const w = mountSidebar({ variant: 'harness', collapsed: false })
        await flushPromises()

        expect(w.find('[data-testid="stub-harness-screen"]').exists()).toBe(true)
        expect(w.get('[data-testid="talos-tablet-harness-toggle"]').attributes('aria-label')).toBe('Collapse Code sessions')
    })

    it('HARNESS-TABLET-RAIL-COLLAPSE-01 never collapses the chat rail', async () => {
        const w = mountSidebar({ variant: 'chat', collapsed: true })
        await flushPromises()

        expect(w.get('[data-testid="talos-tablet-sidebar"]').attributes('data-talos-tablet-sidebar-collapsed')).toBe('false')
        expect(w.find('[data-testid="stub-chats-screen"]').exists()).toBe(true)
        expect(w.find('[data-testid="talos-tablet-harness-toggle"]').exists()).toBe(false)
    })
})

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// Harness UI (24/8): the list, native — same router-mock convention as
// chatsScreen.test.ts (a real push call asserted on its argument, not on
// navigation actually happening — that belongs to harnessSessionScreen.test.ts).
const mockState = vi.hoisted(() => ({ routerPush: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mockState.routerPush }) }))

import HarnessScreen from '@/screens/HarnessScreen.vue'

beforeEach(() => {
    mockState.routerPush.mockReset()
})

function mountScreen() {
    return mount(HarnessScreen)
}

describe('HarnessScreen (24/8) — demo session list, real structure over fake data', () => {
    it('renders the five demo sessions, copied verbatim from the static mockup, grouped as it groups them', () => {
        const w = mountScreen()
        expect(w.findAll('[data-testid="talos-harness-row"]')).toHaveLength(5)
        expect(w.text()).toContain('Refactor auth flow')
        expect(w.text()).toContain('Investigate flaky tests')
    })

    it('shows the demo-data honesty notice', () => {
        const w = mountScreen()
        expect(w.find('[data-testid="talos-harness-demo-notice"]').exists()).toBe(true)
    })

    it('pushes a real router navigation to harness-session with the row\'s id — never a window.location', async () => {
        const w = mountScreen()
        await w.get('[data-harness-session-id="refactor-auth-flow"]').trigger('click')
        expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'harness-session', params: { id: 'refactor-auth-flow' } })
    })

    // F6 sidebar refactor (24/8): TalosTabletSidebar.vue mounts this screen
    // `embedded` in place of the chat rail when the station is Harness — the
    // forwarding to TalosMobileScreen is the only new behaviour here (its own
    // header/background handling is covered by TalosMobileScreen.test.ts).
    it('embedded: forwards the prop, same five rows, still real navigation', async () => {
        const w = mount(HarnessScreen, { props: { embedded: true } })
        expect(w.findAll('h1')).toHaveLength(0)
        expect(w.findAll('[data-testid="talos-harness-row"]')).toHaveLength(5)
        await w.get('[data-harness-session-id="refactor-auth-flow"]').trigger('click')
        expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'harness-session', params: { id: 'refactor-auth-flow' } })
    })
})

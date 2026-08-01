// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import TalosMobileSettingsCenter from '@/components/talos/settings/TalosMobileSettingsCenter.vue'

if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined
}

const panelStubs = {
    TalosMobileSettingsModelsPanel: { template: '<div data-panel="models">Models panel</div>' },
    TalosMobileSettingsAiDefaultsPanel: { template: '<div data-panel="ai_defaults">AI defaults panel</div>' },
    TalosMobileSettingsAppearancePanel: { template: '<div data-panel="appearance">Appearance panel</div>' },
    TalosMobileSettingsLanguagePanel: { template: '<div data-testid="talos-settings-language">Language panel</div>' },
    TalosMobileSettingsAccountPanel: { template: '<div data-panel="account">Account panel</div>' },
    TalosMobileSettingsAgentToolsPanel: { template: '<div data-testid="talos-settings-agent-tools">Agent Tools panel</div>' },
}

function mountCenter() {
    return mount(TalosMobileSettingsCenter, { attachTo: document.body, global: { stubs: panelStubs } })
}

async function activateTab(wrapper: ReturnType<typeof mountCenter>, id: string): Promise<void> {
    const tab = wrapper.get(`[data-settings-tab="${id}"]`)
    ;(tab.element as HTMLElement).focus()
    tab.element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
    tab.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

afterEach(() => {
    document.body.replaceChildren()
})

describe('TalosMobileSettingsCenter', () => {
    it('renders one labelled tablist, thirteen tabs, and the selected tabpanel', () => {
        const wrapper = mountCenter()
        const tablist = wrapper.get('[role="tablist"]')
        expect(tablist.attributes('aria-label')).toBe('TALOS settings categories')
        expect(wrapper.findAll('[role="tab"]')).toHaveLength(13)
        expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toContain('Models')
        expect(wrapper.get('[role="tabpanel"]').attributes('data-settings-panel')).toBe('models')
        expect(wrapper.get('[role="tabpanel"]').classes()).toContain('talos-motion-tab-panel')
    })

    it('moves selection with ArrowDown, Home, and End', async () => {
        const wrapper = mountCenter()
        await nextTick()
        await new Promise((resolve) => setTimeout(resolve, 0))
        await nextTick()
        // Claude-style order: the Account card is the FIRST tab, then the
        // grouped categories (Intelligence: Models, AI Defaults, Agent Tools…).
        const first = wrapper.get('[role="tab"]')
        expect(first.text()).toContain('Account')
        ;(first.element as HTMLElement).focus()
        first.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
        await nextTick()
        await new Promise((resolve) => setTimeout(resolve, 0))
        await nextTick()
        expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toContain('Models')

        wrapper.get('[role="tab"][aria-selected="true"]').element.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))
        await nextTick()
        await new Promise((resolve) => setTimeout(resolve, 0))
        await nextTick()
        expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toContain('Privacy and permissions')

        wrapper.get('[role="tab"][aria-selected="true"]').element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }))
        await nextTick()
        await new Promise((resolve) => setTimeout(resolve, 0))
        await nextTick()
        expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toContain('Account')
    })

    it('keeps every remaining runtime-dependent category visible and explicitly gated', async () => {
        const wrapper = mountCenter()
        // F2-T6: 'account' left this list — it is now a real local panel.
        // 'search' left this list on 2026-08-01. It had been announcing "not
        // installed in this build" for as long as web search had been working,
        // while the configuration that made it work lived under AI Defaults —
        // so the one entry named Search was the one that said no.
        const gated = ['integrations', 'email', 'reminders', 'system']

        for (const id of gated) {
            await activateTab(wrapper, id)
            const panel = wrapper.get(`[data-capability="${id}"]`)
            expect(panel.attributes('data-capability-state')).toBe('gated')
            expect(panel.text()).toContain('Not available yet')
            expect(panel.findAll('button:not([disabled])')).toHaveLength(0)
        }
    })

    /**
     * The repair for the defect above, asserted at the far end: the Search
     * entry now renders the real thing. If this ever goes back to a capability
     * placeholder, the app is once again denying the existence of a feature it
     * ships.
     */
    it('renders Search as a real settings surface, with the source picker inside it', async () => {
        const wrapper = mountCenter()

        await activateTab(wrapper, 'search')

        expect(wrapper.find('[data-capability="search"]').exists()).toBe(false)
        expect(wrapper.get('[data-testid="talos-settings-search"]').exists()).toBe(true)
        expect(wrapper.get('[data-testid="talos-search-source"]').exists()).toBe(true)
        expect(wrapper.get('[data-testid="talos-search-permission-pointer"]').exists()).toBe(true)
    })

    it('renders Browser as a real settings surface instead of a gated placeholder', async () => {
        const wrapper = mountCenter()

        await activateTab(wrapper, 'browser')

        expect(wrapper.find('[data-capability="browser"]').exists()).toBe(false)
        expect(wrapper.get('[aria-label="Browser interaction policy"]').exists()).toBe(true)
    })

    it('renders Language as a real local settings surface', async () => {
        const wrapper = mountCenter()

        await activateTab(wrapper, 'language')

        expect(wrapper.find('[data-capability="language"]').exists()).toBe(false)
        expect(wrapper.get('[data-testid="talos-settings-language"]').exists()).toBe(true)
    })

    it('AGENT-TOOLS-08 renders Agent Tools as a real local settings surface', async () => {
        const wrapper = mountCenter()

        await activateTab(wrapper, 'agent_tools')

        expect(wrapper.find('[data-capability="agent_tools"]').exists()).toBe(false)
        expect(wrapper.get('[data-testid="talos-settings-agent-tools"]').exists()).toBe(true)
    })

    it('uses a phone list-detail flow; the sheet header drives a single contextual Back', async () => {
        const { useTalosSheetNav } = await import('@/composables/useTalosSheetNav')
        const nav = useTalosSheetNav()
        const wrapper = mountCenter()
        const categories = wrapper.get<HTMLElement>('[data-testid="settings-category-pane"]')
        const detail = wrapper.get<HTMLElement>('[data-testid="settings-detail-pane"]')
        categories.element.style.setProperty('--talos-motion-duration-tab-change', '150ms')
        detail.element.style.setProperty('--talos-motion-duration-tab-change', '150ms')
        await activateTab(wrapper, 'appearance')

        expect(categories.classes()).toContain('hidden')
        expect(detail.classes()).not.toContain('hidden')
        expect(detail.attributes('tabindex')).toBe('-1')
        expect(detail.attributes('data-talos-motion-intent')).toBe('tab-change')
        expect(document.activeElement).toBe(detail.element)
        expect(wrapper.get('[data-settings-panel="appearance"]').attributes('data-state')).toBe('active')

        // Owner 2026-07-24: no in-body "Categories" back — the sheet header
        // shows the subsection title and owns the single Back.
        expect(wrapper.find('[aria-label="Back to settings categories"]').exists()).toBe(false)
        expect(nav.subView.value?.title).toBe('Appearance')

        nav.subView.value!.back()
        await nextTick()
        await new Promise((resolve) => setTimeout(resolve, 0))
        await nextTick()
        const selected = wrapper.get<HTMLElement>('[data-settings-tab="appearance"]')
        expect(categories.classes()).not.toContain('hidden')
        expect(detail.classes()).toContain('hidden')
        expect(categories.attributes('data-talos-motion-intent')).toBe('tab-change')
        expect(selected.attributes('aria-selected')).toBe('true')
        expect(document.activeElement).toBe(selected.element)
        expect(nav.subView.value).toBeNull()
    })
})

// SF-critic M1: at the md breakpoint (side-by-side) opening a category must NOT
// push a sheet sub-view (no spurious contextual Back / wrong header on tablet).
describe('TalosMobileSettingsCenter md breakpoint', () => {
    it('TABLET-SETTINGS-SCROLL-01 makes the category rail a bounded structural flex column', () => {
        const wrapper = mountCenter()
        const categories = wrapper.get('[data-testid="settings-category-pane"]')

        expect(categories.classes()).toContain('md:flex')
        expect(categories.classes()).toContain('md:flex-col')
        expect(categories.classes()).toContain('md:overflow-hidden')
        expect(categories.classes()).not.toContain('md:block')
        wrapper.unmount()
    })

    it('TABLET-SETTINGS-SCROLL-02 gives exactly the inner tablist bounded vertical scrolling', () => {
        const wrapper = mountCenter()
        const categories = wrapper.get('[data-testid="settings-category-pane"]')
        const tablist = wrapper.get('[role="tablist"]')

        expect(categories.classes()).not.toContain('md:overflow-y-auto')
        expect(categories.classes()).not.toContain('md:overscroll-contain')
        expect(tablist.classes()).toContain('md:min-h-0')
        expect(tablist.classes()).toContain('md:flex-1')
        expect(tablist.classes()).toContain('md:overflow-y-auto')
        expect(tablist.classes()).toContain('md:overscroll-contain')
        wrapper.unmount()
    })

    it('TABLET-SETTINGS-04 owns the full list-detail height and reuses the shell rail width', () => {
        const wrapper = mountCenter()
        const scaffold = wrapper.get('[data-testid="settings-list-detail"]')
        const categories = wrapper.get('[data-testid="settings-category-pane"]')

        expect(scaffold.classes()).toContain('md:h-full')
        expect(scaffold.classes()).toContain('md:rounded-none')
        expect(categories.classes()).toContain('md:w-[var(--talos-tablet-sidebar-width)]')
        wrapper.unmount()
    })

    it('does not set a sheet sub-view when the md layout is side-by-side', async () => {
        const listeners: Array<(e: { matches: boolean }) => void> = []
        vi.stubGlobal('matchMedia', vi.fn((q: string) => ({
            matches: q.includes('768'),
            addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
            removeEventListener: () => {},
        })))
        const { useTalosSheetNav } = await import('@/composables/useTalosSheetNav')
        const nav = useTalosSheetNav()
        nav.clear()
        const wrapper = mount(TalosMobileSettingsCenter, { attachTo: document.body, global: { stubs: panelStubs } })
        // `mobilePane` intentionally starts on categories. Both side-by-side
        // panes therefore need an md display override over the phone `hidden`.
        expect(wrapper.get('[data-testid="settings-category-pane"]').classes()).toContain('md:flex')
        expect(wrapper.get('[data-testid="settings-detail-pane"]').classes()).toContain('hidden')
        expect(wrapper.get('[data-testid="settings-detail-pane"]').classes()).toContain('md:block')
        await activateTab(wrapper, 'account')
        expect(nav.subView.value).toBeNull()
        wrapper.unmount()
        vi.unstubAllGlobals()
    })
})

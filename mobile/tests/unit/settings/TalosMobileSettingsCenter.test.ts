import { afterEach, describe, expect, it } from 'vitest'
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
    TalosMobileSettingsAccountPanel: { template: '<div data-panel="account">Account panel</div>' },
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
    it('renders one labelled tablist, eleven tabs, and the selected tabpanel', () => {
        const wrapper = mountCenter()
        const tablist = wrapper.get('[role="tablist"]')
        expect(tablist.attributes('aria-label')).toBe('TALOS settings categories')
        expect(wrapper.findAll('[role="tab"]')).toHaveLength(11)
        expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toContain('Models')
        expect(wrapper.get('[role="tabpanel"]').attributes('data-settings-panel')).toBe('models')
    })

    it('moves selection with ArrowDown, Home, and End', async () => {
        const wrapper = mountCenter()
        await nextTick()
        await new Promise((resolve) => setTimeout(resolve, 0))
        await nextTick()
        const models = wrapper.get('[role="tab"]')
        ;(models.element as HTMLElement).focus()
        models.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
        await nextTick()
        await new Promise((resolve) => setTimeout(resolve, 0))
        await nextTick()
        expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toContain('AI Defaults')

        wrapper.get('[role="tab"][aria-selected="true"]').element.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))
        await nextTick()
        await new Promise((resolve) => setTimeout(resolve, 0))
        await nextTick()
        expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toContain('System')

        wrapper.get('[role="tab"][aria-selected="true"]').element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }))
        await nextTick()
        await new Promise((resolve) => setTimeout(resolve, 0))
        await nextTick()
        expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toContain('Models')
    })

    it('keeps every remaining runtime-dependent category visible and explicitly gated', async () => {
        const wrapper = mountCenter()
        // F2-T6: 'account' left this list — it is now a real local panel.
        const gated = ['search', 'integrations', 'email', 'reminders', 'agent_tools', 'system']

        for (const id of gated) {
            await activateTab(wrapper, id)
            const panel = wrapper.get(`[data-capability="${id}"]`)
            expect(panel.attributes('data-capability-state')).toBe('gated')
            expect(panel.text()).toContain('Not available yet')
            expect(panel.findAll('button:not([disabled])')).toHaveLength(0)
        }
    })

    it('renders Browser as a real settings surface instead of a gated placeholder', async () => {
        const wrapper = mountCenter()

        await activateTab(wrapper, 'browser')

        expect(wrapper.find('[data-capability="browser"]').exists()).toBe(false)
        expect(wrapper.get('[aria-label="Browser interaction policy"]').exists()).toBe(true)
    })

    it('uses a phone list-detail flow; the sheet header drives a single contextual Back', async () => {
        const { useTalosSheetNav } = await import('@/composables/useTalosSheetNav')
        const nav = useTalosSheetNav()
        const wrapper = mountCenter()
        await activateTab(wrapper, 'appearance')

        expect(wrapper.get('[data-testid="settings-category-pane"]').classes()).toContain('hidden')
        expect(wrapper.get('[data-testid="settings-detail-pane"]').classes()).not.toContain('hidden')
        expect(wrapper.get('[data-settings-panel="appearance"]').attributes('data-state')).toBe('active')

        // Owner 2026-07-24: no in-body "Categories" back — the sheet header
        // shows the subsection title and owns the single Back.
        expect(wrapper.find('[aria-label="Back to settings categories"]').exists()).toBe(false)
        expect(nav.subView.value?.title).toBe('Appearance')

        nav.subView.value!.back()
        await wrapper.vm.$nextTick()
        expect(wrapper.get('[data-testid="settings-category-pane"]').classes()).not.toContain('hidden')
        expect(wrapper.get('[data-testid="settings-detail-pane"]').classes()).toContain('hidden')
        expect(wrapper.get('[data-settings-tab="appearance"]').attributes('aria-selected')).toBe('true')
        expect(nav.subView.value).toBeNull()
    })
})

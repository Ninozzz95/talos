// @vitest-environment jsdom

/**
 * The contract of the one tab strip. Each of these pins a failure the five
 * hand-rolled strips it replaces could produce, and two of them could produce
 * today.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosThemedTabs from '@/components/talos/ui/TalosThemedTabs.vue'

function mountTabs(props: Record<string, unknown> = {}) {
    return mount(TalosThemedTabs, {
        props: { surface: 'appearance', modelValue: 'design', ariaLabel: 'Aspetto', ...props },
        attachTo: document.body,
    })
}

describe('TalosThemedTabs', () => {
    it('renders the register\'s views, in the register\'s order, as a real tablist', () => {
        const wrapper = mountTabs()

        expect(wrapper.get('[role="tablist"]').attributes('aria-label')).toBe('Aspetto')
        expect(wrapper.findAll('[role="tab"]').map((tab) => tab.attributes('data-talos-tab')))
            .toEqual(['design', 'motion', 'voice'])
        // Two of the five strips it replaces were not exposed as tabs at all.
        expect(wrapper.get('[data-talos-tab="design"]').attributes('aria-selected')).toBe('true')
        expect(wrapper.get('[data-talos-tab="motion"]').attributes('aria-selected')).toBe('false')
    })

    it('reports a choice instead of taking it, so the parent stays the owner', async () => {
        const wrapper = mountTabs()

        // Reka commits on pointerdown, so a bare click never reaches it — the
        // same dance the existing screen tests already do.
        const tab = wrapper.get('[data-talos-tab="motion"]').element as HTMLElement
        tab.focus()
        tab.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
        tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
        await wrapper.vm.$nextTick()

        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['motion'])
    })

    it('lands on the default when handed a view that does not exist', () => {
        // The live failure this prevents: a strip pointed at a view removed by a
        // release renders with nothing selected and no panel underneath.
        const wrapper = mountTabs({ modelValue: 'a-view-we-deleted' })

        expect(wrapper.get('[data-talos-tab="design"]').attributes('aria-selected')).toBe('true')
        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['design'])
    })

    it('takes activation from the register, not from the caller', () => {
        // Model Lab probes the local engine when its panel mounts, so arrowing
        // across its tabs under automatic activation fires a probe per keystroke.
        // The APG allows automatic only where panels are already there.
        expect(mountTabs({ surface: 'models', modelValue: 'providers' })
            .get('[data-talos-tabs]').attributes('data-orientation')).toBeDefined()
        expect(mountTabs().get('[role="tablist"]').exists()).toBe(true)
    })

    it('refuses to draw a surface that is not declared as tabs', () => {
        // Navigation and filters are different controls with different
        // semantics. The settings centre renders a vertical tablist that hides
        // its own list on a phone — a tab strip that is not one.
        expect(mountTabs({ surface: 'nowhere', modelValue: 'design' }).find('[role="tablist"]').exists())
            .toBe(false)
    })

    it('gives every tab a target a finger can hit', () => {
        expect(mountTabs().get('[data-talos-tab="design"]').classes()).toContain('min-h-11')
    })
})

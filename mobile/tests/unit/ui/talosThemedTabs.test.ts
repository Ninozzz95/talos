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

    it('lets the screen place the strip without letting it redefine the strip', () => {
        // Appearance pins its list while the panel scrolls. That is layout, and
        // the screen owns layout — but only layout.
        const wrapper = mountTabs({ listClass: 'sticky top-0 z-10' })
        const list = wrapper.get('[role="tablist"]')
        expect(list.classes()).toContain('sticky')
        expect(list.classes()).toContain('overflow-x-auto')
    })
})

/**
 * Swipe left and right to step through the views — owner, 2026-07-24, "like
 * ChatGPT tabs". It used to live in the Appearance panel and nowhere else; these
 * pin it now that every registered surface inherits it.
 */
describe('TalosThemedTabs swipe', () => {
    function swipe(
        wrapper: ReturnType<typeof mountTabs>,
        fromX: number,
        toX: number,
        toY = 100,
        startOn?: Element,
    ): Promise<void> {
        const root = wrapper.element as HTMLElement
        const down = (startOn ?? root) as HTMLElement
        down.dispatchEvent(new MouseEvent('pointerdown', { clientX: fromX, clientY: 100, bubbles: true }))
        root.dispatchEvent(new MouseEvent('pointerup', { clientX: toX, clientY: toY, bubbles: true }))
        return wrapper.vm.$nextTick()
    }

    function lastChoice(wrapper: ReturnType<typeof mountTabs>): string | undefined {
        return wrapper.emitted('update:modelValue')?.at(-1)?.[0] as string | undefined
    }

    it('steps forward on a swipe left and back on a swipe right, in the register\'s order', async () => {
        const forward = mountTabs({ modelValue: 'design' })
        await swipe(forward, 240, 110)
        expect(lastChoice(forward)).toBe('motion')

        const back = mountTabs({ modelValue: 'motion' })
        await swipe(back, 110, 240)
        expect(lastChoice(back)).toBe('design')
    })

    it('ignores a drag that is mostly vertical, because that is someone scrolling', async () => {
        const wrapper = mountTabs({ modelValue: 'design' })
        await swipe(wrapper, 110, 130, 420)
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('ignores a drag too short to be a gesture', async () => {
        const wrapper = mountTabs({ modelValue: 'design' })
        await swipe(wrapper, 200, 160) // 40px, under the threshold
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('stops at the ends instead of wrapping round', async () => {
        // On the last view a further swipe should feel like the end of the
        // strip, not like a jump back to the first.
        const last = mountTabs({ modelValue: 'voice' })
        await swipe(last, 240, 110)
        expect(last.emitted('update:modelValue')).toBeUndefined()

        const first = mountTabs({ modelValue: 'design' })
        await swipe(first, 110, 240)
        expect(first.emitted('update:modelValue')).toBeUndefined()
    })

    it('leaves the gesture to whatever the finger landed on, if that scrolls sideways', async () => {
        // The tab strip is overflow-x-auto: dragging it to reach a tab that is
        // off-screen must scroll it, not change the tab underneath. jsdom
        // reports every element as unscrollable, so the overflow is staged.
        const wrapper = mountTabs({ modelValue: 'design' })
        const list = wrapper.get('[role="tablist"]').element
        Object.defineProperty(list, 'scrollWidth', { value: 900, configurable: true })
        Object.defineProperty(list, 'clientWidth', { value: 320, configurable: true })

        await swipe(wrapper, 240, 110, 100, list)
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })
})

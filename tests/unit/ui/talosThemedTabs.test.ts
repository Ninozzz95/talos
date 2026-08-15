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

    it('does not reinterpret the routed Model Lab as a tab surface', () => {
        const retired = mountTabs({ surface: 'models', modelValue: 'providers' })
        expect(retired.find('[data-talos-tabs]').exists()).toBe(false)
        expect(mountTabs().get('[role="tablist"]').exists()).toBe(true)
    })

    it('refuses to draw a surface that is not declared as tabs', () => {
        // Navigation and filters are different controls with different
        // semantics. The settings centre renders a vertical tablist that hides
        // its own list on a phone — a tab strip that is not one.
        expect(mountTabs({ surface: 'nowhere', modelValue: 'design' }).find('[role="tablist"]').exists())
            .toBe(false)
    })

    it('gives every tab a target a finger can hit, and something to feel when it does', () => {
        // Class checks, because jsdom has no layout and no cascade — the honest
        // limit of what a unit test can say about a tap target. The Doctor's
        // hand-drawn tabs had the press dip; a shared strip that replaces five
        // must not be worse than any of them.
        const tab = mountTabs().get('[data-talos-tab="design"]')
        expect(tab.classes()).toContain('min-h-touch')
        expect(tab.classes()).toContain('active:scale-[0.97]')
        expect(tab.classes()).toContain('motion-reduce:active:scale-100')
    })

    it('stamps the surface id on the strip, not the surface object', () => {
        // Found on the device: `<script setup>` lets a binding shadow a prop of
        // the same name in the template, so this hook read "[object Object]"
        // everywhere — and the end-to-end selector written against it could
        // never have matched a thing.
        expect(mountTabs().get('[data-talos-tabs]').attributes('data-talos-tabs')).toBe('appearance')
    })

    it('points the arriving panel the way you came from', async () => {
        // Owner 2026-08-02, on the device: the change was "uno scatto di un
        // frame". Half of that was the motion engine's magnitude; this is the
        // other half — with no direction, swiping left and swiping right looked
        // identical, which reads as nothing happening once the movement is big
        // enough to see.
        const wrapper = mountTabs({ modelValue: 'design' })
        const panels = (): HTMLElement =>
            wrapper.get('[role="tablist"]').element.nextElementSibling as HTMLElement

        await wrapper.setProps({ modelValue: 'motion' })
        expect(panels().style.getPropertyValue('--talos-tab-direction')).toBe('1')

        await wrapper.setProps({ modelValue: 'design' })
        expect(panels().style.getPropertyValue('--talos-tab-direction')).toBe('-1')
    })

    it('tells the browser the panels pan vertically only, or there is no swipe at all', () => {
        // Measured on a OnePlus 13 (Android 16): without this, Chrome hands the
        // drag to the compositor after the first move and fires `pointercancel`
        // — pointerup never arrives, so the swipe was dead on the device. It is
        // on the panels and NOT on the strip, because the strip is
        // overflow-x-auto and touch-action cannot be widened by a descendant.
        const wrapper = mountTabs()
        const panels = wrapper.get('[role="tablist"]').element.nextElementSibling
        expect(panels?.className).toContain('touch-pan-y')
        expect(wrapper.get('[role="tablist"]').classes()).not.toContain('touch-pan-y')
    })

    it('lets the strip grow with the bleed a screen gives it', () => {
        // `w-full` pinned the list to the parent's content width, so Appearance's
        // `-mx-4` shifted it left instead of widening it and the sticky bar
        // stopped 16px short of the right edge — visible on the device as
        // content sliding through the gap.
        expect(mountTabs().get('[role="tablist"]').classes()).not.toContain('w-full')
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

    /**
     * Owner 2026-08-02: "quando scorro molto lentamente la schermata deve
     * seguire il tocco del dito". Direct manipulation, not a gesture merely
     * detected at the end.
     */
    describe('following the finger', () => {
        function panels(wrapper: ReturnType<typeof mountTabs>): HTMLElement {
            return wrapper.get('[role="tablist"]').element.nextElementSibling as HTMLElement
        }

        async function drag(
            wrapper: ReturnType<typeof mountTabs>,
            steps: Array<[number, number]>,
        ): Promise<void> {
            const root = wrapper.element as HTMLElement
            const [firstX, firstY] = steps[0]!
            root.dispatchEvent(new MouseEvent('pointerdown', { clientX: firstX, clientY: firstY, bubbles: true }))
            for (const [x, y] of steps.slice(1)) {
                root.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }))
            }
            await wrapper.vm.$nextTick()
        }

        it('moves the panel with the pointer, one pixel for one pixel', async () => {
            const wrapper = mountTabs({ modelValue: 'motion' })
            await drag(wrapper, [[300, 200], [280, 202], [220, 204]])

            expect(panels(wrapper).style.transform).toBe('translate3d(-80px, 0, 0)')
            // Nothing is chosen until the finger comes off.
            expect(wrapper.emitted('update:modelValue')).toBeUndefined()
        })

        it('does not stir for the first few pixels, so a scroll never nudges it sideways', async () => {
            const wrapper = mountTabs({ modelValue: 'motion' })
            await drag(wrapper, [[300, 200], [295, 201]])

            expect(panels(wrapper).style.transform).toBe('')
        })

        it('resists past the ends, because there is nothing to drag in from', async () => {
            // Following the finger 1:1 into nothing reads as a bug; resistance
            // reads as an edge.
            const wrapper = mountTabs({ modelValue: 'design' })
            await drag(wrapper, [[300, 200], [340, 202], [400, 204]])

            // Anchored on `translate3d(` — a lazier extraction swallows the
            // "3d" and reports 33200px, which is how this test first "passed".
            const moved = Number(/translate3d\((-?[\d.]+)px/.exec(panels(wrapper).style.transform)?.[1])
            expect(moved).toBeGreaterThan(0)
            expect(moved).toBeLessThan(100 * 0.5)
        })

        it('lets go of a mostly-vertical drag instead of dragging the panel with it', async () => {
            const wrapper = mountTabs({ modelValue: 'motion' })
            await drag(wrapper, [[300, 200], [292, 260], [288, 400]])

            expect(panels(wrapper).style.transform).toBe('')
        })

        it('springs back, visibly, when the drag was not far enough', async () => {
            const wrapper = mountTabs({ modelValue: 'motion' })
            await drag(wrapper, [[300, 200], [270, 202]])
            expect(panels(wrapper).style.transform).toBe('translate3d(-30px, 0, 0)')

            const root = wrapper.element as HTMLElement
            root.dispatchEvent(new MouseEvent('pointerup', { clientX: 270, clientY: 202, bubbles: true }))
            await wrapper.vm.$nextTick()

            expect(panels(wrapper).style.transform).toBe('')
            expect(panels(wrapper).style.transition).toContain('transform')
            expect(wrapper.emitted('update:modelValue')).toBeUndefined()
        })

        it('hands over to the entering panel without a second motion arguing with it', async () => {
            const wrapper = mountTabs({ modelValue: 'design' })
            await drag(wrapper, [[300, 200], [200, 202], [140, 204]])

            const root = wrapper.element as HTMLElement
            root.dispatchEvent(new MouseEvent('pointerup', { clientX: 140, clientY: 204, bubbles: true }))
            await wrapper.vm.$nextTick()

            expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['motion'])
            expect(panels(wrapper).style.transform).toBe('')
            // No spring-back transition: the panel underneath is being replaced
            // at this instant and the incoming one plays its own entrance.
            expect(panels(wrapper).style.transition).toBe('')
        })

        it('keeps the panel still for someone who asked for less movement, and still changes tab', async () => {
            const original = window.matchMedia
            window.matchMedia = ((query: string) => ({
                matches: query.includes('reduce'),
                addEventListener: () => {},
                removeEventListener: () => {},
            })) as unknown as typeof window.matchMedia

            const wrapper = mountTabs({ modelValue: 'design' })
            await drag(wrapper, [[300, 200], [200, 202], [140, 204]])
            expect(panels(wrapper).style.transform).toBe('')

            const root = wrapper.element as HTMLElement
            root.dispatchEvent(new MouseEvent('pointerup', { clientX: 140, clientY: 204, bubbles: true }))
            await wrapper.vm.$nextTick()
            expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['motion'])

            window.matchMedia = original
            wrapper.unmount()
        })
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

    it('leaves the edges of the screen to Android, which owns Back there', async () => {
        // Gesture navigation reserves a band down each side, 20dp by default and
        // wider on high back sensitivity. Competing for it would mean stealing
        // Back to change a tab — a bad trade in any app, and a worse one in this
        // app. jsdom reports innerWidth 1024, so 10px in is inside the band.
        const fromLeft = mountTabs({ modelValue: 'design' })
        await swipe(fromLeft, 10, 300)
        expect(fromLeft.emitted('update:modelValue')).toBeUndefined()

        const fromRight = mountTabs({ modelValue: 'design' })
        await swipe(fromRight, window.innerWidth - 8, 300)
        expect(fromRight.emitted('update:modelValue')).toBeUndefined()

        // …and a swipe that starts anywhere else still works, so the guard is
        // not simply switching the gesture off.
        const inland = mountTabs({ modelValue: 'design' })
        await swipe(inland, 400, 200)
        expect(lastChoice(inland)).toBe('motion')
    })

    it('leaves the gesture to whatever the finger landed on, if that scrolls sideways', async () => {
        // The tab strip is overflow-x-auto: dragging it to reach a tab that is
        // off-screen must scroll it, not change the tab underneath. jsdom
        // reports every element as unscrollable, so the overflow is staged.
        const wrapper = mountTabs({ modelValue: 'design' })
        const list = wrapper.get('[role="tablist"]').element as HTMLElement
        Object.defineProperty(list, 'scrollWidth', { value: 900, configurable: true })
        Object.defineProperty(list, 'clientWidth', { value: 320, configurable: true })
        // jsdom applies no Tailwind, so the overflow the class would give it is
        // staged too. The guard reads the computed value, not the class.
        list.style.overflowX = 'auto'

        await swipe(wrapper, 240, 110, 100, list)
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('is not stopped by something that merely overflows, which is not a scroller', async () => {
        // Found on the device: a bordered box whose text ran 10px past its
        // padding was read as "a horizontal scroller", and the swipe died
        // anywhere near it. Overflowing is not scrolling.
        const wrapper = mountTabs({ modelValue: 'design' })
        const list = wrapper.get('[role="tablist"]').element as HTMLElement
        Object.defineProperty(list, 'scrollWidth', { value: 338, configurable: true })
        Object.defineProperty(list, 'clientWidth', { value: 328, configurable: true })
        list.style.overflowX = 'visible'

        await swipe(wrapper, 240, 110, 100, list)
        expect(lastChoice(wrapper)).toBe('motion')
    })
})

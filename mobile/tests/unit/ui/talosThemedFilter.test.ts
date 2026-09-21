// @vitest-environment jsdom

/**
 * The contract of the one filter. Each of these pins something the five
 * hand-rolled versions it replaces get wrong today: they are `role="group"`
 * holding buttons that carry `aria-pressed`, which announces a row of
 * independent toggles rather than one choice among several.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosThemedFilter from '@/components/talos/ui/TalosThemedFilter.vue'

const OPTIONS = [
    { value: 'all', label: 'All' },
    { value: 'images', label: 'Images' },
    { value: 'docs', label: 'Documents' },
]

function mountFilter(props: Record<string, unknown> = {}) {
    return mount(TalosThemedFilter, {
        props: { modelValue: 'all', options: OPTIONS, groupLabel: 'Filter by type', ...props },
        attachTo: document.body,
    })
}

describe('TalosThemedFilter', () => {
    it('announces one choice among several, not a row of pressed buttons', () => {
        const wrapper = mountFilter()

        expect(wrapper.get('[role="radiogroup"]').attributes('aria-label')).toBe('Filter by type')
        expect(wrapper.findAll('[role="radio"]')).toHaveLength(3)
        expect(wrapper.get('[data-talos-filter-option="all"]').attributes('aria-checked')).toBe('true')
        expect(wrapper.get('[data-talos-filter-option="images"]').attributes('aria-checked')).toBe('false')
        // aria-pressed on several buttons at once is legal, so it can never say
        // that choosing one un-chooses the rest.
        expect(wrapper.findAll('[aria-pressed]')).toHaveLength(0)
        wrapper.unmount()
    })

    it('is one tab stop, so the options do not stand between you and the next control', async () => {
        const wrapper = mountFilter({ modelValue: 'images' })

        const stops = wrapper.findAll('[role="radio"]').filter((radio) => radio.attributes('tabindex') === '0')
        expect(stops).toHaveLength(1)
        expect(stops[0]!.attributes('data-talos-filter-option')).toBe('images')
        wrapper.unmount()
    })

    it('keeps a way in when the stored value is not on offer any more', () => {
        // A filter whose options changed under it would otherwise have no tab
        // stop at all — a control a keyboard simply cannot enter.
        const wrapper = mountFilter({ modelValue: 'a-filter-we-removed' })

        const stops = wrapper.findAll('[role="radio"]').filter((radio) => radio.attributes('tabindex') === '0')
        expect(stops).toHaveLength(1)
        expect(stops[0]!.attributes('data-talos-filter-option')).toBe('all')
        wrapper.unmount()
    })

    it('moves and chooses with the arrows, wrapping at both ends', async () => {
        const wrapper = mountFilter()
        // Driven like a real parent: the control is controlled, so a caller
        // that never honours the choice would leave the walk standing still —
        // and a test that never honours it is testing a frozen component.
        const press = async (key: string): Promise<string> => {
            const current = wrapper.props('modelValue') as string
            await wrapper.get(`[data-talos-filter-option="${current}"]`).trigger('keydown', { key })
            const chosen = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as string
            await wrapper.setProps({ modelValue: chosen })
            return chosen
        }

        expect(await press('ArrowRight')).toBe('images')
        expect(await press('ArrowRight')).toBe('docs')
        // Wraps rather than stopping: a filter is a ring, unlike the tab strip
        // where the ends are meant to feel like ends.
        expect(await press('ArrowRight')).toBe('all')
        expect(await press('ArrowLeft')).toBe('docs')
        expect(await press('Home')).toBe('all')
        expect(await press('End')).toBe('docs')
        wrapper.unmount()
    })

    it('reports a choice instead of taking it, so the parent stays the owner', async () => {
        const wrapper = mountFilter()

        await wrapper.get('[data-talos-filter-option="docs"]').trigger('click')

        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['docs'])
        // Controlled: nothing moved until the parent said so.
        expect(wrapper.get('[data-talos-filter-option="all"]').attributes('aria-checked')).toBe('true')
        wrapper.unmount()
    })

    it('never re-reports the choice already made', async () => {
        const wrapper = mountFilter()
        await wrapper.get('[data-talos-filter-option="all"]').trigger('click')
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
        wrapper.unmount()
    })

    it('leaves a disabled option out of the walk, and out of reach', async () => {
        const wrapper = mountFilter({
            options: [{ value: 'all', label: 'All' }, { value: 'off', label: 'Off', disabled: true }, { value: 'docs', label: 'Documents' }],
        })

        expect(wrapper.get('[data-talos-filter-option="off"]').attributes('disabled')).toBeDefined()
        await wrapper.get('[data-talos-filter-option="all"]').trigger('keydown', { key: 'ArrowRight' })
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['docs'])
        wrapper.unmount()
    })

    it('speaks the name the caller gives it when the visible one is an abbreviation', () => {
        const wrapper = mountFilter({
            options: [{ value: 'md', label: 'MD', ariaLabel: 'Markdown documents' }, { value: 'all', label: 'All' }],
        })

        expect(wrapper.get('[data-talos-filter-option="md"]').attributes('aria-label')).toBe('Markdown documents')
        wrapper.unmount()
    })

    it('lets the caller own the look without owning the semantics', () => {
        const wrapper = mountFilter({ optionClass: (selected: boolean) => selected ? 'is-chosen' : 'is-plain' })

        expect(wrapper.get('[data-talos-filter-option="all"]').classes()).toContain('is-chosen')
        expect(wrapper.get('[data-talos-filter-option="docs"]').classes()).toContain('is-plain')
        wrapper.unmount()
    })
})

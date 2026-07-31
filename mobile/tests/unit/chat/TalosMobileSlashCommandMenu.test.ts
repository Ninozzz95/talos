// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import TalosMobileSlashCommandMenu from '@/components/chat/TalosMobileSlashCommandMenu.vue'
import { TALOS_MOBILE_COMMANDS } from '@/lib/mobileCommandRegistry'

let wrapper: VueWrapper | null = null

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
})

function mountMenu(query = '', activeIndex = 0): VueWrapper {
    wrapper = mount(TalosMobileSlashCommandMenu, {
        attachTo: document.body,
        props: {
            commands: [...TALOS_MOBILE_COMMANDS],
            query,
            activeIndex,
        },
    })
    return wrapper
}

describe('TalosMobileSlashCommandMenu', () => {
    it('renders a named flat listbox where every row is executable', () => {
        const view = mountMenu('', 1)
        const listbox = view.get('[role="listbox"]')
        const options = listbox.findAll('[role="option"]')

        expect(listbox.attributes('aria-label')).toBe('Composer slash commands')
        expect(options).toHaveLength(9)
        expect(options[1]?.attributes('aria-selected')).toBe('true')
        expect(options.every((option) => option.find('[role="option"]').exists() === false)).toBe(true)

        const browse = view.get('[data-command-id="open_browse"]')
        expect(browse.attributes('aria-disabled')).toBe('false')
        expect(browse.text()).toContain('/browse')
        expect(browse.text()).toContain('manual local browsing')

        const context = view.get('[data-command-id="open_context_vault"]')
        expect(context.attributes('aria-disabled')).toBe('false')
        expect(context.text()).toContain('/context')
    })

    it('emits every offered command, because none of them is decorative any more', async () => {
        const view = mountMenu()

        await view.get('[data-command-id="open_browse"]').trigger('click')
        expect(view.emitted('selected')).toEqual([['open_browse']])

        // `/file` was greyed out while attaching files worked; it runs now.
        await view.get('[data-command-id="attach_file"]').trigger('click')
        expect(view.emitted('selected')).toEqual([['open_browse'], ['attach_file']])

        await view.get('[data-command-id="open_model_center"]').trigger('click')
        expect(view.emitted('selected')).toEqual([['open_browse'], ['attach_file'], ['open_model_center']])
    })

    it('filters without replacing the registry availability state', () => {
        const view = mountMenu('/bro')
        const options = view.findAll('[role="option"]')

        expect(options).toHaveLength(1)
        expect(options[0]?.attributes('data-command-id')).toBe('open_browse')
        expect(options[0]?.attributes('aria-disabled')).toBe('false')
    })
})

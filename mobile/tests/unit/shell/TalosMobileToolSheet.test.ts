import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileToolSheet from '@/components/shell/TalosMobileToolSheet.vue'

describe('TalosMobileToolSheet (station sheet over chat)', () => {
    it('renders a labelled modal dialog with back-to-chat, close, and slot body', () => {
        const w = mount(TalosMobileToolSheet, {
            props: { title: 'Runtime cockpit' },
            slots: { default: '<p data-testid="sheet-content">runs</p>' },
        })
        const dialog = w.get('[data-testid="talos-mobile-tool-sheet"]')
        expect(dialog.attributes('role')).toBe('dialog')
        expect(dialog.attributes('aria-modal')).toBe('true')
        expect(dialog.attributes('aria-label')).toBe('Runtime cockpit')
        expect(w.find('[aria-label="Back to chat"]').exists()).toBe(true)
        // SF-critic F3 #7: fullscreen keeps ONE honest dismissal (Back);
        // the X exists only in the drawer presentation.
        expect(w.find('[aria-label="Close Runtime cockpit"]').exists()).toBe(false)
        expect(w.get('[data-testid="sheet-content"]').text()).toBe('runs')
        expect(w.text()).toContain('Runtime cockpit')
    })

    it('emits close from back-to-chat, and from X in drawer presentation', async () => {
        const w = mount(TalosMobileToolSheet, { props: { title: 'Library', presentation: 'drawer' } })
        await w.get('[aria-label="Back to chat"]').trigger('click')
        await w.get('[aria-label="Close Library"]').trigger('click')
        expect(w.emitted('close')).toHaveLength(2)
    })

    it('emits close when the backdrop is clicked', async () => {
        const w = mount(TalosMobileToolSheet, { props: { title: 'Library' } })
        await w.get('[data-testid="talos-mobile-sheet-backdrop"]').trigger('click')
        expect(w.emitted('close')).toHaveLength(1)
    })
})

// F3-T2 (owner #4/#8): the sheet honours the presentation preference —
// fullscreen covers the viewport; drawer keeps ONE consistent tall height.
describe('presentation modes (F3-T2)', () => {
    it('fullscreen covers the whole viewport with no rounded drawer chrome', () => {
        const wrapper = mount(TalosMobileToolSheet, {
            props: { title: 'Settings', presentation: 'fullscreen' },
        })
        const sheet = wrapper.get('[data-testid="talos-mobile-tool-sheet"]')
        expect(sheet.classes()).toContain('h-[100dvh]')
        expect(sheet.classes()).not.toContain('rounded-t-2xl')
        expect(sheet.attributes('data-presentation')).toBe('fullscreen')
    })

    it('drawer keeps a FIXED tall height so every station drawer matches', () => {
        const wrapper = mount(TalosMobileToolSheet, {
            props: { title: 'Settings', presentation: 'drawer' },
        })
        const sheet = wrapper.get('[data-testid="talos-mobile-tool-sheet"]')
        expect(sheet.classes()).toContain('h-[88dvh]')
        expect(sheet.attributes('data-presentation')).toBe('drawer')
    })

    it('defaults to fullscreen when no presentation is passed', () => {
        const wrapper = mount(TalosMobileToolSheet, { props: { title: 'Settings' } })
        expect(wrapper.get('[data-testid="talos-mobile-tool-sheet"]').attributes('data-presentation')).toBe('fullscreen')
    })
})

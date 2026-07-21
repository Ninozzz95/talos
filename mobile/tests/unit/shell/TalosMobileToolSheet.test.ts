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
        expect(w.find('[aria-label="Close Runtime cockpit"]').exists()).toBe(true)
        expect(w.get('[data-testid="sheet-content"]').text()).toBe('runs')
        expect(w.text()).toContain('Runtime cockpit')
    })

    it('emits close from back-to-chat and from the close button', async () => {
        const w = mount(TalosMobileToolSheet, { props: { title: 'Library' } })
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

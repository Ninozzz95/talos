// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TalosAdaptiveSurface from '@/components/shell/TalosAdaptiveSurface.vue'

describe('TalosAdaptiveSurface', () => {
    it('applies the persisted presentation preference to the next module', async () => {
        const wrapper = mount(TalosAdaptiveSurface, {
            props: { presentation: 'drawer', title: 'Runs' },
            slots: { default: '<p data-testid="surface-body">Body</p>' },
        })

        const surface = wrapper.get('[data-testid="adaptive-surface"]')
        expect(surface.attributes('data-presentation')).toBe('drawer')
        expect(surface.attributes('role')).toBe('dialog')
        expect(surface.attributes('aria-label')).toBe('Runs')
        expect(wrapper.get('[data-testid="surface-title"]').text()).toBe('Runs')
        expect(wrapper.get('[data-testid="surface-body"]').exists()).toBe(true)

        await wrapper.setProps({ presentation: 'fullscreen' })
        expect(wrapper.get('[data-testid="adaptive-surface"]').attributes('data-presentation')).toBe('fullscreen')
    })

    it('dismiss emits the dismiss event', async () => {
        const wrapper = mount(TalosAdaptiveSurface, { props: { presentation: 'drawer', title: 'Context' } })
        await wrapper.get('[data-testid="surface-dismiss"]').trigger('click')
        expect(wrapper.emitted('dismiss')).toHaveLength(1)
    })
})

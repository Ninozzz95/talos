import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosComposerModelPicker from '@/components/composer/TalosComposerModelPicker.vue'
import { TALOS_MOBILE_MODEL_PROFILES, TALOS_MOBILE_ROUTING_PROFILES } from '@/lib/talosModels'

const base = {
    modelProfiles: [...TALOS_MOBILE_MODEL_PROFILES],
    modelRoutingProfiles: [...TALOS_MOBILE_ROUTING_PROFILES],
    selectedModelProfileId: 'opus',
    selectedModelRoutingProfileId: '',
}

describe('TalosComposerModelPicker (themed listbox, never a native select)', () => {
    it('renders a listbox with Auto and Models sections and no native <select>', () => {
        const w = mount(TalosComposerModelPicker, { props: base })
        expect(w.find('select').exists()).toBe(false)
        expect(w.get('[role="listbox"]')).toBeTruthy()
        expect(w.text()).toContain('Auto')
        expect(w.text()).toContain('Models')
        expect(w.text()).toContain('Claude Opus')
        expect(w.text()).toContain('Auto · Balanced')
    })

    it('marks the selected model profile with aria-selected', () => {
        const w = mount(TalosComposerModelPicker, { props: base })
        expect(w.get('[data-model-profile-id="opus"]').attributes('aria-selected')).toBe('true')
        expect(w.get('[data-model-profile-id="sonnet"]').attributes('aria-selected')).toBe('false')
    })

    it('emits selectModelProfile on a model click', async () => {
        const w = mount(TalosComposerModelPicker, { props: base })
        await w.get('[data-model-profile-id="sonnet"]').trigger('click')
        expect(w.emitted('selectModelProfile')?.[0]).toEqual(['sonnet'])
    })

    it('emits selectModelRoutingProfile on an Auto click', async () => {
        const w = mount(TalosComposerModelPicker, { props: base })
        await w.get('[data-routing-profile-id="auto-balanced"]').trigger('click')
        expect(w.emitted('selectModelRoutingProfile')?.[0]).toEqual(['auto-balanced'])
    })

    it('shows the empty state pointing to Model Lab when no models', () => {
        const w = mount(TalosComposerModelPicker, { props: { ...base, modelProfiles: [] } })
        expect(w.text()).toContain('No composer models yet')
    })

    it('disables a failed/disabled profile row (not callable)', () => {
        const w = mount(TalosComposerModelPicker, {
            props: { ...base, modelProfiles: [{ ...TALOS_MOBILE_MODEL_PROFILES[0], id: 'dead', status: 'disabled' as const }] },
        })
        expect(w.get('[data-model-profile-id="dead"]').attributes('disabled')).toBeDefined()
    })
})

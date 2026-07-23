import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const settings = vi.hoisted(() => ({
    setTone: vi.fn(async () => {}),
    state: {
        tone: { preset: 'balanced' },
        ai_defaults: {
            utility_model_mode: 'same_as_chat',
            research_model_mode: 'same_as_chat',
            vision_enabled: true,
        },
    },
    setAiDefaults: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/stores/settings', () => ({ useSettingsStore: () => settings }))

import TalosMobileSettingsAiDefaultsPanel from '@/components/talos/settings/TalosMobileSettingsAiDefaultsPanel.vue'

beforeEach(() => {
    vi.clearAllMocks()
})
describe('local-first Settings panels', () => {
    it('persists utility, research, and vision defaults', async () => {
        const wrapper = mount(TalosMobileSettingsAiDefaultsPanel, {
            global: { stubs: { TalosThemedSelect: true } },
        })
        const selects = wrapper.findAllComponents({ name: 'TalosThemedSelect' })
        selects.find((select) => select.props('ariaLabel') === 'Utility model mode')?.vm.$emit('update:modelValue', 'default_profile')
        selects.find((select) => select.props('ariaLabel') === 'Research model mode')?.vm.$emit('update:modelValue', 'default_profile')
        await wrapper.get('[aria-label="Vision routing preference"]').setValue(false)

        expect(settings.setAiDefaults).toHaveBeenCalledWith({ utility_model_mode: 'default_profile' })
        expect(settings.setAiDefaults).toHaveBeenCalledWith({ research_model_mode: 'default_profile' })
        expect(settings.setAiDefaults).toHaveBeenCalledWith({ vision_enabled: false })
    })

})

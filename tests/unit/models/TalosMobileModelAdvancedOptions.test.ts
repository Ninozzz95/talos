// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

const state = vi.hoisted(() => ({ controller: null as unknown }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => state.controller }))

import TalosMobileModelAdvancedOptions from '@/components/talos/models/TalosMobileModelAdvancedOptions.vue'

function controller() {
    return {
        modelLabPreferences: ref({
            schema_version: 1,
            manual_models: [{
                id: 'manual-existing',
                provider: 'ollama',
                model: 'gemma3:4b',
                display_name: 'Gemma local',
                input_modalities: ['text'],
                output_modalities: ['text'],
                supported_parameters: ['think'],
            }],
            model_overrides: {},
            provider_runtime: {},
            probe_results: {},
        }),
        saveManualModel: vi.fn().mockResolvedValue(undefined),
        removeManualModel: vi.fn().mockResolvedValue(undefined),
    }
}

beforeEach(() => { state.controller = controller() })

describe('TalosMobileModelAdvancedOptions', () => {
    it('creates a manual provider-backed model with explicitly declared capabilities', async () => {
        const target = controller()
        state.controller = target
        const wrapper = mount(TalosMobileModelAdvancedOptions)
        const provider = wrapper.findComponent({ name: 'TalosThemedSelect' })
        provider.vm.$emit('update:modelValue', 'openai')
        await wrapper.get('[aria-label="Manual model ID"]').setValue('custom-chat')
        await wrapper.get('[aria-label="Manual model display name"]').setValue('Custom Chat')
        await wrapper.get('[aria-label="Declare reasoning support"]').setValue(true)
        await wrapper.get('form').trigger('submit')

        expect(target.saveManualModel).toHaveBeenCalledWith(expect.objectContaining({
            id: expect.any(String),
            provider: 'openai',
            model: 'custom-chat',
            display_name: 'Custom Chat',
            input_modalities: ['text'],
            output_modalities: ['text'],
            supported_parameters: ['reasoning_effort'],
        }))
    })

    it('rejects incomplete declarations locally and removes an existing manual model explicitly', async () => {
        const target = controller()
        state.controller = target
        const wrapper = mount(TalosMobileModelAdvancedOptions)

        await wrapper.get('form').trigger('submit')
        expect(target.saveManualModel).not.toHaveBeenCalled()
        expect(wrapper.get('[role="alert"]').text()).toMatch(/model id/i)

        await wrapper.get('[aria-label="Remove Gemma local manual model"]').trigger('click')
        expect(target.removeManualModel).toHaveBeenCalledWith('manual-existing')
    })
})

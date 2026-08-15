// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

const state = vi.hoisted(() => ({ controller: null as unknown }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => state.controller }))

import TalosMobileModelCatalog from '@/components/talos/models/TalosMobileModelCatalog.vue'

function profile(index: number) {
    const provider = index % 2 === 0 ? 'anthropic' : 'openrouter'
    return {
        id: `${provider}:model-${index}`,
        provider,
        model: `model-${index}`,
        display_name: index === 17 ? 'Needle Reasoner' : `Model ${index}`,
        status: index === 3 ? 'failed' : 'untested',
        has_secret: true,
        effort_levels: index % 3 === 0 ? ['low', 'medium', 'high'] : [],
        supports_thinking: index % 3 === 0,
        show_in_composer: index !== 5,
        capabilities: {
            provenance: 'observed',
            chat_compatibility: 'supported',
            context_length: 128000,
            input_modalities: ['text'],
            output_modalities: ['text'],
            supported_parameters: [],
        },
        probe_ok: index === 2 ? true : null,
    }
}

function controller(count = 500) {
    return {
        profiles: ref(Array.from({ length: count }, (_, index) => profile(index))),
        selectedModelId: ref('anthropic:model-0'),
        selectModel: vi.fn().mockResolvedValue(undefined),
        setModelVisibility: vi.fn().mockResolvedValue(undefined),
        setModelDisplayName: vi.fn().mockResolvedValue(undefined),
        probeModel: vi.fn().mockResolvedValue({ ok: true }),
    }
}

beforeEach(() => { state.controller = controller() })

describe('TalosMobileModelCatalog', () => {
    it('mounts forty of five hundred, advances by forty, and resets for every filter', async () => {
        const wrapper = mount(TalosMobileModelCatalog)
        expect(wrapper.findAll('[data-model-card]')).toHaveLength(40)
        expect(wrapper.get('[role="status"]').text()).toContain('40 of 500 models')

        await wrapper.get('[data-testid="talos-model-catalog-load-more"]').trigger('click')
        expect(wrapper.findAll('[data-model-card]')).toHaveLength(80)
        expect(wrapper.get('[role="status"]').text()).toContain('80 of 500 models')

        await wrapper.get('[aria-label="Search model catalog"]').setValue('Needle Reasoner')
        expect(wrapper.findAll('[data-model-card]')).toHaveLength(1)
        expect(wrapper.get('[role="status"]').text()).toContain('1 of 500 models')
        expect(wrapper.text()).toContain('Needle Reasoner')

        await wrapper.get('[aria-label="Search model catalog"]').setValue('')
        expect(wrapper.findAll('[data-model-card]')).toHaveLength(40)
        const filter = wrapper.findComponent({ name: 'TalosThemedSelect' })
        filter.vm.$emit('update:modelValue', 'openrouter')
        await wrapper.vm.$nextTick()
        expect(wrapper.findAll('[data-model-card]')).toHaveLength(40)
        expect(wrapper.get('[role="status"]').text()).toContain('40 of 500 models')
    }, 15_000)

    it('connects selection, composer visibility, probe, and display-name controls', async () => {
        const target = controller(2)
        state.controller = target
        const wrapper = mount(TalosMobileModelCatalog)
        const card = wrapper.get('[data-model-id="anthropic:model-0"]')

        await card.get('[aria-label="Use Model 0 as default model"]').trigger('click')
        await card.get('[aria-label="Show Model 0 in composer"]').trigger('click')
        await card.get('[aria-label="Test Model 0 completion"]').trigger('click')
        await card.get('[aria-label="Display name for Model 0"]').setValue('Primary Claude')
        await card.get('[aria-label="Save display name for Model 0"]').trigger('click')

        expect(target.selectModel).toHaveBeenCalledWith('anthropic:model-0')
        expect(target.setModelVisibility).toHaveBeenCalledWith('anthropic:model-0', false)
        expect(target.probeModel).toHaveBeenCalledWith('anthropic:model-0')
        expect(target.setModelDisplayName).toHaveBeenCalledWith('anthropic:model-0', 'Primary Claude')
    })

    it('exposes observed or declared provenance and never turns a failed probe into a healthy claim', () => {
        const target = controller(4)
        target.profiles.value[1]!.capabilities.provenance = 'declared'
        state.controller = target
        const wrapper = mount(TalosMobileModelCatalog)

        expect(wrapper.get('[data-model-id="openrouter:model-1"]').text()).toContain('Declared capabilities')
        expect(wrapper.get('[data-model-id="openrouter:model-3"]').text()).toContain('Probe failed')
    })
})

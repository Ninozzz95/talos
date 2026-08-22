// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileProviderIcon from '@/components/models/TalosMobileProviderIcon.vue'
import anthropicLogo from '@/assets/providers/anthropic.svg'
import deepseekLogo from '@/assets/providers/deepseek.svg'
import geminiLogo from '@/assets/providers/gemini.svg'
import ollamaLogo from '@/assets/providers/ollama.svg'
import openaiLogo from '@/assets/providers/openai.svg'
import openrouterLogo from '@/assets/providers/openrouter.svg'

const expectedLogos = {
    anthropic: anthropicLogo,
    deepseek: deepseekLogo,
    gemini: geminiLogo,
    ollama: ollamaLogo,
    openai: openaiLogo,
    openrouter: openrouterLogo,
} as const

describe('TalosMobileProviderIcon', () => {
    it('uses the canonical local provider mark and accessible provider name', () => {
        const wrapper = mount(TalosMobileProviderIcon, {
            props: { provider: 'openai' },
        })

        const identity = wrapper.get('[role="img"]')
        expect(identity.attributes('aria-label')).toBe('OpenAI')
        expect(identity.attributes('title')).toBe('OpenAI')

        const mark = wrapper.get('img')
        expect(mark.attributes('src')).toBe(openaiLogo)
        expect(mark.attributes('aria-hidden')).toBe('true')
        expect(wrapper.find('[data-provider-fallback]').exists()).toBe(false)
    })

    it('renders a controlled fallback for unknown provider input', () => {
        const wrapper = mount(TalosMobileProviderIcon, {
            props: { provider: 'unsupported-provider' },
        })

        expect(wrapper.get('[role="img"]').attributes('aria-label')).toBe('Unknown provider')
        expect(wrapper.find('img').exists()).toBe(false)
        expect(wrapper.get('[data-provider-fallback]').exists()).toBe(true)
    })

    it.each(Object.entries(expectedLogos))('binds %s to its checked-in local mark', (provider, expectedAsset) => {
        const wrapper = mount(TalosMobileProviderIcon, { props: { provider } })
        expect(wrapper.get('img').attributes('src')).toBe(expectedAsset)
    })
})

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const state = vi.hoisted(() => ({ controller: null as unknown }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => state.controller }))

import TalosMobileProviderRuntimePanel from '@/components/talos/models/TalosMobileProviderRuntimePanel.vue'

function controller() {
    return {
        catalogs: reactive(Object.fromEntries(['openai', 'deepseek', 'anthropic', 'gemini', 'openrouter', 'ollama'].map((provider) => [provider, {
            status: provider === 'anthropic' ? 'ready' : 'idle',
            models: provider === 'anthropic' ? [{ id: 'claude-live' }] : [],
            error: null,
            updatedAt: null,
            configured: provider === 'anthropic',
        }]))),
        endpoints: reactive({
            openai: 'https://models.example.test/v1',
            deepseek: null,
            anthropic: null,
            gemini: null,
            openrouter: null,
            ollama: null,
        }),
        modelLabPreferences: ref({
            schema_version: 1,
            manual_models: [],
            model_overrides: {},
            provider_runtime: { openai: { timeout_seconds: 45 } },
            probe_results: {},
        }),
        secrets: reactive({ openai: true, deepseek: false, anthropic: true, gemini: false, openrouter: false, ollama: false }),
        saveKey: vi.fn().mockResolvedValue(undefined),
        removeKey: vi.fn().mockResolvedValue(undefined),
        saveEndpoint: vi.fn().mockResolvedValue(undefined),
        removeEndpoint: vi.fn().mockResolvedValue(undefined),
        setProviderTimeout: vi.fn().mockResolvedValue(undefined),
        refreshProvider: vi.fn().mockResolvedValue(null),
    }
}

beforeEach(() => { state.controller = controller() })

describe('TalosMobileProviderRuntimePanel', () => {
    it('renders all six provider runtimes and keeps credentials masked', () => {
        const wrapper = mount(TalosMobileProviderRuntimePanel)
        expect(wrapper.findAll('[data-provider-runtime]')).toHaveLength(6)
        expect(wrapper.get('[aria-label="Anthropic API key"]').attributes('type')).toBe('password')
        expect(wrapper.text()).toContain('1 model available')
        expect(wrapper.html()).not.toContain('sentinel-secret')
    })

    it('saves a key, custom OpenAI-compatible endpoint, and native timeout without reload', async () => {
        const target = controller()
        state.controller = target
        const wrapper = mount(TalosMobileProviderRuntimePanel)

        await wrapper.get('[aria-label="DeepSeek API key"]').setValue('sk-deepseek')
        await wrapper.get('[aria-label="Save DeepSeek key"]').trigger('click')
        await wrapper.get('[aria-label="OpenAI custom endpoint"]').setValue('https://gateway.example.test/v1')
        await wrapper.get('[aria-label="OpenAI timeout seconds"]').setValue('42')
        await wrapper.get('[aria-label="Save OpenAI runtime options"]').trigger('click')

        expect(target.saveKey).toHaveBeenCalledWith('deepseek', 'sk-deepseek')
        expect(target.saveEndpoint).toHaveBeenCalledWith('openai', 'https://gateway.example.test/v1')
        expect(target.setProviderTimeout).toHaveBeenCalledWith('openai', 42)
    })

    it('resets a remote custom endpoint and retries discovery through explicit controls', async () => {
        const target = controller()
        state.controller = target
        const wrapper = mount(TalosMobileProviderRuntimePanel)

        await wrapper.get('[aria-label="Reset OpenAI endpoint"]').trigger('click')
        await wrapper.get('[aria-label="Refresh Anthropic models"]').trigger('click')

        expect(target.removeEndpoint).toHaveBeenCalledWith('openai')
        expect(target.refreshProvider).toHaveBeenCalledWith('anthropic')
    })
})

// Owner 2026-07-24 — providers are collapsible accordions, DEFAULT COLLAPSED
// to declutter; the header shows status, tap expands to configure.
describe('collapsible provider accordions', () => {
    it('renders every provider collapsed by default', async () => {
        const wrapper = mount(TalosMobileProviderRuntimePanel, { attachTo: document.body })
        await flushPromises()
        for (const id of ['openai', 'deepseek', 'openrouter']) {
            const header = wrapper.get(`[data-provider="${id}"] button[aria-controls="provider-${id}-body"]`)
            expect(header.attributes('aria-expanded')).toBe('false')
        }
        wrapper.unmount()
    })

    it('toggles a provider open and closed on header tap', async () => {
        const wrapper = mount(TalosMobileProviderRuntimePanel, { attachTo: document.body })
        await flushPromises()
        const header = wrapper.get('[data-provider="openrouter"] button[aria-controls="provider-openrouter-body"]')
        expect(header.attributes('aria-expanded')).toBe('false')
        await header.trigger('click')
        expect(header.attributes('aria-expanded')).toBe('true')
        await header.trigger('click')
        expect(header.attributes('aria-expanded')).toBe('false')
        wrapper.unmount()
    })
})

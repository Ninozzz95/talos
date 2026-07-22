import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const mockState = vi.hoisted(() => ({ controller: null as unknown }))
const routeState = vi.hoisted(() => ({ query: {} as Record<string, unknown> }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))
vi.mock('vue-router', () => ({ useRoute: () => routeState }))

import SettingsScreen from '@/screens/SettingsScreen.vue'

function makeController(opts: { secret?: boolean } = {}) {
    const secret = opts.secret === true
    return {
        profiles: ref([
            {
                id: 'claude-opus', provider: 'anthropic', model: 'claude-opus-4-8', display_name: 'Claude Opus 4.8',
                status: secret ? 'healthy' : 'untested', has_secret: secret, effort_levels: ['low', 'high'],
                supports_thinking: true, show_in_composer: true, capabilities: null, probe_ok: null,
            },
        ]),
        selectedModelId: ref('claude-opus'),
        catalogs: reactive({
            openai: { status: 'idle', models: [], error: null, updatedAt: null, configured: false },
            deepseek: { status: 'idle', models: [], error: null, updatedAt: null, configured: false },
            anthropic: { status: 'ready', models: [{ id: 'claude-opus-4-8' }], error: null, updatedAt: '2026-07-22T00:00:00.000Z', configured: secret },
            gemini: { status: 'idle', models: [], error: null, updatedAt: null, configured: false },
            openrouter: { status: 'idle', models: [], error: null, updatedAt: null, configured: false },
            ollama: { status: 'idle', models: [], error: null, updatedAt: null, configured: false },
        }),
        endpoints: reactive({ openai: null, deepseek: null, anthropic: null, gemini: null, openrouter: null, ollama: null }),
        modelLabPreferences: ref({ schema_version: 1, manual_models: [], model_overrides: {}, provider_runtime: {}, probe_results: {} }),
        secrets: reactive({ anthropic: secret, openai: false, deepseek: false, gemini: false, openrouter: false, ollama: false }),
        selectModel: vi.fn(),
        saveKey: vi.fn().mockResolvedValue(undefined),
        removeKey: vi.fn().mockResolvedValue(undefined),
        saveEndpoint: vi.fn().mockResolvedValue(undefined),
        removeEndpoint: vi.fn().mockResolvedValue(undefined),
        setProviderTimeout: vi.fn().mockResolvedValue(undefined),
        refreshProvider: vi.fn().mockResolvedValue(null),
        setModelVisibility: vi.fn().mockResolvedValue(undefined),
        setModelDisplayName: vi.fn().mockResolvedValue(undefined),
        probeModel: vi.fn().mockResolvedValue({ ok: true }),
        saveManualModel: vi.fn().mockResolvedValue(undefined),
        removeManualModel: vi.fn().mockResolvedValue(undefined),
        init: vi.fn().mockResolvedValue(undefined),
    }
}

beforeEach(() => {
    mockState.controller = makeController()
    routeState.query = {}
})

describe('SettingsScreen (functional)', () => {
    it('renders the provider keys section with a password field per remote provider', () => {
        const wrapper = mount(SettingsScreen)
        expect(wrapper.get('[data-testid="mobile-screen-title"]').text()).toBe('Settings Center')
        expect(wrapper.find('[data-testid="settings-provider-keys"]').exists()).toBe(true)
        const anthropicKey = wrapper.find('[aria-label="Anthropic API key"]')
        expect(anthropicKey.exists()).toBe(true)
        expect(anthropicKey.attributes('type')).toBe('password')
    })

    it('saves an entered key to the keystore via the controller', async () => {
        const controller = makeController()
        mockState.controller = controller
        const wrapper = mount(SettingsScreen)
        await wrapper.get('[aria-label="Anthropic API key"]').setValue('sk-ant-xyz')
        await wrapper.get('[aria-label="Save Anthropic key"]').trigger('click')
        expect(controller.saveKey).toHaveBeenCalledWith('anthropic', 'sk-ant-xyz')
    })

    it('shows a "Key saved" badge and a remove control when the provider has a key', () => {
        mockState.controller = makeController({ secret: true })
        const wrapper = mount(SettingsScreen)
        expect(wrapper.find('[data-testid="key-present"]').exists()).toBe(true)
        expect(wrapper.find('[aria-label="Remove Anthropic key"]').exists()).toBe(true)
    })

    it('pluralizes the discovered model count', async () => {
        const controller = makeController()
        mockState.controller = controller
        const wrapper = mount(SettingsScreen)

        expect(wrapper.text()).toContain('1 model available')
        expect(wrapper.text()).not.toContain('1 models available')

        controller.catalogs.anthropic.models.push({ id: 'claude-sonnet-4-6' })
        await wrapper.vm.$nextTick()
        expect(wrapper.text()).toContain('2 models available')
    })

    it('selects the default model through the controller', async () => {
        const controller = makeController({ secret: true })
        mockState.controller = controller
        const wrapper = mount(SettingsScreen)
        expect(wrapper.find('[data-model-id]').exists()).toBe(false)
        const select = wrapper.findAllComponents({ name: 'TalosThemedSelect' })
            .find((candidate) => candidate.props('ariaLabel') === 'Default chat model')
        expect(select).toBeDefined()
        select?.vm.$emit('update:modelValue', 'claude-opus')
        await wrapper.vm.$nextTick()
        expect(controller.selectModel).toHaveBeenCalledWith('claude-opus')
    })

    it('keeps hidden or unsupported models discoverable but disabled in the Model Lab picker', () => {
        const controller = makeController({ secret: true })
        controller.profiles.value.push({
            id: 'gemini:gemini-embed', provider: 'gemini', model: 'gemini-embed', display_name: 'Gemini Embed',
            status: 'disabled', has_secret: true, effort_levels: [], supports_thinking: false,
            show_in_composer: false, capabilities: null, probe_ok: null,
        })
        mockState.controller = controller
        const wrapper = mount(SettingsScreen)
        const select = wrapper.findAllComponents({ name: 'TalosThemedSelect' })
            .find((candidate) => candidate.props('ariaLabel') === 'Default chat model')

        expect(select?.props('items')).toContainEqual({
            value: 'gemini:gemini-embed',
            label: 'Google Gemini - Gemini Embed',
            disabled: true,
        })
    })

    it('shows provider discovery errors and retries without reloading Settings', async () => {
        const controller = makeController()
        controller.catalogs.gemini.status = 'error'
        controller.catalogs.gemini.error = 'Gemini model discovery failed.'
        mockState.controller = controller
        const wrapper = mount(SettingsScreen)

        expect(wrapper.text()).toContain('Gemini model discovery failed.')
        await wrapper.get('[aria-label="Refresh Google Gemini models"]').trigger('click')
        expect(controller.refreshProvider).toHaveBeenCalledWith('gemini')
    })

    it('persists an explicit Ollama endpoint through the controller', async () => {
        const controller = makeController()
        mockState.controller = controller
        const wrapper = mount(SettingsScreen)

        await wrapper.get('[aria-label="Ollama endpoint"]').setValue('http://10.0.0.4:11434')
        await wrapper.get('[aria-label="Save Ollama Local runtime options"]').trigger('click')
        expect(controller.setProviderTimeout).toHaveBeenCalledWith('ollama', 60)
        expect(controller.saveEndpoint).toHaveBeenCalledWith('ollama', 'http://10.0.0.4:11434')
    })

    it('opens the Models detail pane from the composer deep link', async () => {
        routeState.query = { tab: 'models' }
        const wrapper = mount(SettingsScreen)

        expect(wrapper.get('[data-testid="settings-detail-pane"]').classes()).not.toContain('hidden')
        expect(wrapper.get('[data-settings-panel="models"]').text()).toContain('Providers')
    })

    it('uses APG tabs and loads the heavy Catalog only when selected', async () => {
        routeState.query = { tab: 'models' }
        const wrapper = mount(SettingsScreen)
        const tablist = wrapper.get('[aria-label="Model Lab sections"]')
        const tabs = tablist.findAll('[role="tab"]')

        expect(tabs.map((tab) => tab.text())).toEqual(['Providers', 'Catalog'])
        expect(wrapper.find('[aria-label="Search model catalog"]').exists()).toBe(false)

        await tabs[1]!.trigger('mousedown', { button: 0, ctrlKey: false })
        await vi.dynamicImportSettled()
        await flushPromises()

        expect(tabs[1]!.attributes('data-state')).toBe('active')
        expect(wrapper.get('[aria-label="Search model catalog"]').exists()).toBe(true)
    })

    it('opens a functional Browser panel from the exact settings deep link', () => {
        routeState.query = { tab: 'browser' }
        const wrapper = mount(SettingsScreen)

        const panel = wrapper.get('[data-settings-panel="browser"]')
        expect(panel.text()).toContain('Confirm sensitive only')
        expect(panel.text()).toContain('Trusted node not paired')
        expect(panel.text()).not.toContain('Not available yet')
    })
})

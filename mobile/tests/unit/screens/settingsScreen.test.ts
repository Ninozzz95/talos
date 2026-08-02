// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const mockState = vi.hoisted(() => ({ controller: null as unknown }))
const routeState = vi.hoisted(() => ({ query: {} as Record<string, unknown> }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))
// The router is recorded, not stubbed away: whether the screen REPLACES or
// PUSHES is the difference between the back gesture leaving Settings and it
// walking out one category at a time.
const routerCalls = vi.hoisted(() => ({ replace: vi.fn(() => Promise.resolve()), push: vi.fn(() => Promise.resolve()) }))
vi.mock('vue-router', () => ({ useRoute: () => routeState, useRouter: () => routerCalls }))

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
    vi.clearAllMocks()
    mockState.controller = makeController()
    routeState.query = {}
    // A real `replace` changes the address. A stub that only records the call
    // lets the screen write the same query over and over and still look right.
    routerCalls.replace.mockImplementation((to: { query?: Record<string, unknown> }) => {
        routeState.query = { ...(to.query ?? {}) }
        return Promise.resolve()
    })
    // Model Lab reopens on the section you left, and jsdom keeps one
    // localStorage for the whole file. Without this, the Catalog test decides
    // which section the tests after it open on. It happens not to bite in the
    // current order, which is exactly why it is worth removing.
    localStorage.clear()
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

        expect(tabs.map((tab) => tab.text())).toEqual(['Providers', 'Catalog', 'Local'])
        // The strip renders the names from the register; the icons come from
        // the screen through a slot that cannot touch the name. Both, or the
        // migration quietly cost the panel its icons.
        expect(tabs.map((tab) => tab.find('svg').exists())).toEqual([true, true, true])
        expect(wrapper.find('[aria-label="Search model catalog"]').exists()).toBe(false)
        expect(wrapper.get('[data-model-lab-section="providers"]').classes())
            .toContain('talos-motion-tab-panel')

        await tabs[1]!.trigger('mousedown', { button: 0, ctrlKey: false })
        await vi.dynamicImportSettled()
        await flushPromises()

        expect(tabs[1]!.attributes('data-state')).toBe('active')
        expect(wrapper.get('[data-model-lab-section="catalog"]').classes())
            .toContain('talos-motion-tab-panel')
        expect(wrapper.get('[aria-label="Search model catalog"]').exists()).toBe(true)
    })

    /**
     * The download centre lives HERE, as a section, rather than as a station of
     * its own — owner 2026-07-31, on economising the surfaces that already
     * exist. The Model Lab is where someone decides which model answers them,
     * and a second destination would split one question across two places.
     *
     * This is the seam: the component is proved on its own, and this is what
     * says it is actually reachable.
     */
    it('carries the on-device download centre as its third section', async () => {
        routeState.query = { tab: 'models' }
        const wrapper = mount(SettingsScreen)
        const tabs = wrapper.get('[aria-label="Model Lab sections"]').findAll('[role="tab"]')

        await tabs[2]!.trigger('mousedown', { button: 0, ctrlKey: false })
        await vi.dynamicImportSettled()
        await flushPromises()

        expect(tabs[2]!.attributes('data-state')).toBe('active')
        expect(wrapper.get('[data-model-lab-section="on-device"]').classes())
            .toContain('talos-motion-tab-panel')
        expect(wrapper.get('[data-testid="talos-models-section"]').exists()).toBe(true)
    })

    it('reopens Model Lab on the section you left, not always on Providers', async () => {
        // Someone watching a download had to walk back to the on-device section
        // after every visit. The proof is a second, independent mount.
        routeState.query = { tab: 'models' }
        const first = mount(SettingsScreen)
        await first.get('[aria-label="Model Lab sections"]').findAll('[role="tab"]')[2]!
            .trigger('mousedown', { button: 0, ctrlKey: false })
        await vi.dynamicImportSettled()
        await flushPromises()
        first.unmount()

        const second = mount(SettingsScreen)
        await vi.dynamicImportSettled()
        await flushPromises()
        expect(second.get('[data-model-lab-section="on-device"]').attributes('data-state')).toBe('active')
        expect(second.find('[data-model-lab-section="providers"]').attributes('data-state')).not.toBe('active')
    })

    /**
     * `?tab=` used to be one-way: it could open a category, and nothing wrote
     * back. So the address bar started lying the moment anyone touched the
     * list, and a deep link copied out of it reopened somewhere else.
     */
    it('writes the open category back into the address, and clears it on the way out', async () => {
        const wrapper = mount(SettingsScreen)
        await wrapper.get('[data-settings-tab="appearance"]').trigger('click')
        await flushPromises()

        expect(routerCalls.replace).toHaveBeenCalledWith({ query: { tab: 'appearance' } })
        // Never push: a history entry per category tap turns Android's back
        // gesture into a walk through thirteen settings pages.
        expect(routerCalls.push).not.toHaveBeenCalled()

        routeState.query = { tab: 'appearance' }
        const { useTalosSheetNav } = await import('@/composables/useTalosSheetNav')
        useTalosSheetNav().subView.value!.back()
        await flushPromises()

        expect(routerCalls.replace).toHaveBeenLastCalledWith({ query: {} })
    })

    it('leaves the address alone when the deep link already says where we are', async () => {
        routeState.query = { tab: 'models' }
        mount(SettingsScreen)
        await flushPromises()

        expect(routerCalls.replace).not.toHaveBeenCalled()
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

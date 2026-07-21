import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { mount } from '@vue/test-utils'

const mockState = vi.hoisted(() => ({ controller: null as unknown }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))

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
        secrets: reactive({ anthropic: secret, openai: false, deepseek: false, gemini: false, openrouter: false, ollama: false }),
        selectModel: vi.fn(),
        saveKey: vi.fn().mockResolvedValue(undefined),
        removeKey: vi.fn().mockResolvedValue(undefined),
        init: vi.fn().mockResolvedValue(undefined),
    }
}

beforeEach(() => {
    mockState.controller = makeController()
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

    it('selects the default model through the controller', async () => {
        const controller = makeController({ secret: true })
        mockState.controller = controller
        const wrapper = mount(SettingsScreen)
        await wrapper.get('[data-model-id="claude-opus"]').trigger('click')
        expect(controller.selectModel).toHaveBeenCalledWith('claude-opus')
    })
})

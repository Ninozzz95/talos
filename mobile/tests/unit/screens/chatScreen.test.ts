import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { mount } from '@vue/test-utils'

const mockState = vi.hoisted(() => ({ controller: null as unknown }))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))

import ChatScreen from '@/screens/ChatScreen.vue'

interface FakeMessage { id: string; role: 'user' | 'assistant' | 'system'; content: string; created_at: string; state: string }

function makeController(messages: FakeMessage[] = []) {
    return {
        profiles: ref([]),
        selectedModelId: ref(null),
        effort: ref('high'),
        thinking: ref(false),
        canSend: ref(false),
        sendDisabledReason: ref(''),
        chat: { messages: reactive(messages), state: reactive({ sending: false }) },
        selectModel: vi.fn(),
        selectEffort: vi.fn(),
        setThinking: vi.fn(),
        init: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue(undefined),
    }
}

beforeEach(() => {
    mockState.controller = makeController()
})

describe('ChatScreen (functional, local-first)', () => {
    it('shows the TALOS brand hero + welcome and docks the composer when empty', () => {
        const wrapper = mount(ChatScreen)
        expect(wrapper.find('[data-testid="talos-empty-brand"]').exists()).toBe(true)
        expect(wrapper.find('.talos-short-logo-mark').exists()).toBe(true)
        expect(wrapper.find('.talos-orbitron-brand').text()).toBe('TALOS')
        expect(wrapper.find('h1').text()).toBe('What claim should we benchmark?')
        expect(wrapper.find('[data-testid="talos-mobile-composer"]').exists()).toBe(true)
    })

    it('replaces the hero with the message thread once the conversation starts', () => {
        mockState.controller = makeController([
            { id: '1', role: 'user', content: 'benchmark this', created_at: '', state: 'persisted' },
            { id: '2', role: 'assistant', content: 'On it.', created_at: '', state: 'persisted' },
        ])
        const wrapper = mount(ChatScreen)
        expect(wrapper.find('[data-testid="talos-empty-brand"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-mobile-message-list"]').exists()).toBe(true)
        expect(wrapper.text()).toContain('benchmark this')
        expect(wrapper.text()).toContain('On it.')
    })

    it('wires the composer send (Enter) through to the controller with the typed prompt', async () => {
        const controller = makeController()
        controller.canSend = ref(true)
        mockState.controller = controller
        const wrapper = mount(ChatScreen)
        const textarea = wrapper.get('[aria-label="Message TALOS"]')
        await textarea.setValue('hello world')
        await textarea.trigger('keydown', { key: 'Enter' })
        expect(controller.send).toHaveBeenCalledWith('hello world')
    })
})

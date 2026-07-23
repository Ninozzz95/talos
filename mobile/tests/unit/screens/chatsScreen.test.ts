import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

// F3-T3 (owner #12, "Claude pattern"): a dedicated chat-list PAGE — search,
// tap-to-open (back to chat), per-row rename/delete, New chat on top.
const mockState = vi.hoisted(() => ({
    controller: null as unknown,
    routerPush: vi.fn(),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mockState.routerPush }) }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))

import ChatsScreen from '@/screens/ChatsScreen.vue'

function makeController() {
    return {
        chat: {
            sessions: reactive([
                { id: 's1', title: 'Pancake recipe', updated_at: '2026-07-23T08:00:00.000Z' },
                { id: 's2', title: 'Streaming design', updated_at: '2026-07-23T09:00:00.000Z' },
            ]),
            activeSession: ref<{ id: string } | null>({ id: 's2' }),
        },
        newSession: vi.fn().mockResolvedValue(undefined),
        selectSession: vi.fn().mockResolvedValue(undefined),
        renameSession: vi.fn().mockResolvedValue(undefined),
        deleteSession: vi.fn().mockResolvedValue(undefined),
    }
}

beforeEach(() => {
    mockState.routerPush.mockReset()
    mockState.controller = makeController()
})

describe('ChatsScreen (F3-T3)', () => {
    it('lists every session with the active one marked', () => {
        const wrapper = mount(ChatsScreen)
        const rows = wrapper.findAll('[data-testid="talos-chats-row"]')
        expect(rows).toHaveLength(2)
        expect(wrapper.text()).toContain('Pancake recipe')
        expect(wrapper.get('[data-testid="talos-chats-row"][data-active="true"]').text()).toContain('Streaming design')
    })

    it('filters locally through the search field', async () => {
        const wrapper = mount(ChatsScreen)
        await wrapper.get('[data-testid="talos-chats-search"]').setValue('pancake')
        expect(wrapper.findAll('[data-testid="talos-chats-row"]')).toHaveLength(1)
        expect(wrapper.text()).toContain('Pancake recipe')
    })

    it('opens a chat on tap and returns to the chat route', async () => {
        const wrapper = mount(ChatsScreen)
        await wrapper.findAll('[data-testid="talos-chats-open"]')[0].trigger('click')
        await flushPromises()
        const controller = mockState.controller as ReturnType<typeof makeController>
        expect(controller.selectSession).toHaveBeenCalledWith('s1')
        expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'chat' })
    })

    it('starts a new chat from the top action', async () => {
        const wrapper = mount(ChatsScreen)
        await wrapper.get('[data-testid="talos-chats-new"]').trigger('click')
        await flushPromises()
        const controller = mockState.controller as ReturnType<typeof makeController>
        expect(controller.newSession).toHaveBeenCalledOnce()
        expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'chat' })
    })
})

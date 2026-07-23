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
    const sessions = reactive([
        { id: 's1', title: 'Pancake recipe', updated_at: '2026-07-23T08:00:00.000Z', metadata: {} as Record<string, unknown> },
        { id: 's2', title: 'Streaming design', updated_at: '2026-07-23T09:00:00.000Z', metadata: {} as Record<string, unknown> },
    ])
    return {
        chat: {
            sessions,
            activeSession: ref<{ id: string } | null>({ id: 's2' }),
            setSessionArchived: vi.fn().mockImplementation(async (id: string, archived: boolean) => {
                const session = sessions.find((candidate) => candidate.id === id)
                if (session) session.metadata = { ...session.metadata, archived }
            }),
            setSessionOrder: vi.fn().mockResolvedValue(undefined),
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
        // F4-#23 ordering: most recent first — s2 (09:00) precedes s1 (08:00).
        const rows = wrapper.findAll('[data-testid="talos-chats-open"]')
        expect(rows[0].text()).toContain('Streaming design')
        await rows[1].trigger('click')
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

    // F4-#23 — swipe tray: Archive moves a chat into the collapsible Archived
    // section; Unarchive brings it back; delete stays behind its dialog.
    it('archives a chat from the row tray into the Archived section and restores it', async () => {
        const wrapper = mount(ChatsScreen)
        await wrapper.get('[aria-label="Archive chat Pancake recipe"]').trigger('click')
        await flushPromises()
        const controller = mockState.controller as ReturnType<typeof makeController>
        expect(controller.chat.setSessionArchived).toHaveBeenCalledWith('s1', true)
        expect(wrapper.findAll('[data-testid="talos-chats-row"]')).toHaveLength(1)

        const toggle = wrapper.get('[data-testid="talos-chats-archived-toggle"]')
        expect(toggle.text()).toContain('Archived (1)')
        await toggle.trigger('click')
        const archivedRow = wrapper.get('[data-testid="talos-chats-archived-row"]')
        expect(archivedRow.text()).toContain('Pancake recipe')

        await wrapper.get('[aria-label="Unarchive chat Pancake recipe"]').trigger('click')
        await flushPromises()
        expect(controller.chat.setSessionArchived).toHaveBeenCalledWith('s1', false)
        expect(wrapper.findAll('[data-testid="talos-chats-row"]')).toHaveLength(2)
        expect(wrapper.find('[data-testid="talos-chats-archived-toggle"]').exists()).toBe(false)
    })

    it('lists manually ordered sessions by sort_index after the fresh ones', () => {
        const controller = mockState.controller as ReturnType<typeof makeController>
        controller.chat.sessions.push(
            { id: 's3', title: 'Pinned last', updated_at: '2026-07-23T12:00:00.000Z', metadata: { sort_index: 1 } },
            { id: 's4', title: 'Pinned first', updated_at: '2026-07-23T01:00:00.000Z', metadata: { sort_index: 0 } },
        )
        const wrapper = mount(ChatsScreen)
        const titles = wrapper.findAll('[data-testid="talos-chats-row"]').map((row) => row.text())
        expect(titles[0]).toContain('Streaming design')
        expect(titles[1]).toContain('Pancake recipe')
        expect(titles[2]).toContain('Pinned first')
        expect(titles[3]).toContain('Pinned last')
    })

    // F4-#22 — the owner could not rename/delete on device and got NO feedback.
    // Contract: happy paths close the dialog; failures KEEP it open and show
    // the real error, never a silent no-op.
    it('renames a chat from its row and closes the dialog', async () => {
        const wrapper = mount(ChatsScreen, { attachTo: document.body })
        await wrapper.get('[aria-label="Rename Pancake recipe"]').trigger('click')
        await flushPromises()
        const input = document.body.querySelector<HTMLInputElement>('[aria-label="Chat name"]')
        expect(input).not.toBeNull()
        input!.value = 'Crêpes'
        input!.dispatchEvent(new Event('input'))
        await flushPromises()
        const save = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Save'))
        save!.click()
        await flushPromises()
        const controller = mockState.controller as ReturnType<typeof makeController>
        expect(controller.renameSession).toHaveBeenCalledWith('s1', 'Crêpes')
        expect(document.body.querySelector('[aria-label="Chat name"]')).toBeNull()
        wrapper.unmount()
    })

    it('keeps the rename dialog open and surfaces the real error when the rename fails', async () => {
        const controller = mockState.controller as ReturnType<typeof makeController>
        controller.renameSession.mockRejectedValueOnce(new Error('TALOS_CHAT_RENAME_UNVERIFIED'))
        const wrapper = mount(ChatsScreen, { attachTo: document.body })
        await wrapper.get('[aria-label="Rename Pancake recipe"]').trigger('click')
        await flushPromises()
        const save = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Save'))
        save!.click()
        await flushPromises()
        expect(document.body.querySelector('[aria-label="Chat name"]')).not.toBeNull()
        const alert = document.body.querySelector('[role="alert"]')
        expect(alert?.textContent).toContain('TALOS_CHAT_RENAME_UNVERIFIED')
        wrapper.unmount()
    })

    it('keeps the delete dialog open and surfaces the real error when the delete fails', async () => {
        const controller = mockState.controller as ReturnType<typeof makeController>
        controller.deleteSession.mockRejectedValueOnce(new Error('TALOS_CHAT_DELETE_UNVERIFIED'))
        const wrapper = mount(ChatsScreen, { attachTo: document.body })
        await wrapper.get('[aria-label="Delete Pancake recipe"]').trigger('click')
        await flushPromises()
        // Confirm inside the dialog — the swipe tray also has a Delete button.
        const dialog = document.body.querySelector('[role="dialog"]')
        const confirm = [...dialog!.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Delete')
        confirm!.click()
        await flushPromises()
        const alert = document.body.querySelector('[role="alert"]')
        expect(alert?.textContent).toContain('TALOS_CHAT_DELETE_UNVERIFIED')
        wrapper.unmount()
    })
})

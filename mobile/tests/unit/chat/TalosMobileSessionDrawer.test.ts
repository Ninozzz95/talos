import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { TalosLocalChatSession } from '@/repositories/chatRepository'
import TalosMobileSessionDrawer from '@/components/chat/TalosMobileSessionDrawer.vue'

const sessions: TalosLocalChatSession[] = [
    {
        id: 'chat-2',
        title: 'Release review',
        surface: 'chat',
        mode: 'verified_execution',
        persistence_mode: 'persistent',
        active_model_profile_id: 'anthropic:claude-live',
        metadata: {},
        created_at: '2026-07-22T10:01:00.000Z',
        updated_at: '2026-07-22T10:03:00.000Z',
    },
    {
        id: 'chat-1',
        title: 'Architecture notes',
        surface: 'chat',
        mode: 'verified_execution',
        persistence_mode: 'persistent',
        active_model_profile_id: null,
        metadata: {},
        created_at: '2026-07-22T10:00:00.000Z',
        updated_at: '2026-07-22T10:02:00.000Z',
    },
]

afterEach(() => {
    document.body.innerHTML = ''
})

async function mountOpen() {
    const wrapper = mount(TalosMobileSessionDrawer, {
        attachTo: document.body,
        props: {
            open: true,
            sessions,
            activeSessionId: 'chat-2',
            busy: false,
        },
    })
    await flushPromises()
    return wrapper
}

describe('TalosMobileSessionDrawer', () => {
    it('renders durable sessions, marks the active one, and selects from the drawer', async () => {
        const wrapper = await mountOpen()
        const drawer = document.body.querySelector('[data-testid="talos-mobile-session-drawer"]')
        expect(drawer).not.toBeNull()
        expect(drawer?.textContent).toContain('Release review')
        expect(drawer?.textContent).toContain('Architecture notes')
        expect(document.body.querySelector('[aria-label="Open chat Release review"]')?.getAttribute('aria-current')).toBe('page')

        const target = document.body.querySelector<HTMLButtonElement>('[aria-label="Open chat Architecture notes"]')
        target?.click()
        await flushPromises()
        expect(wrapper.emitted('select')).toEqual([['chat-1']])
        expect(wrapper.emitted('update:open')).toContainEqual([false])
    })

    it('renames a session through a labelled dialog and emits a trimmed title', async () => {
        const wrapper = await mountOpen()
        document.body.querySelector<HTMLButtonElement>('[aria-label="Rename Release review"]')?.click()
        await flushPromises()

        const input = document.body.querySelector<HTMLInputElement>('[aria-label="Chat name"]')
        expect(input).not.toBeNull()
        input!.value = '  Final review  '
        input!.dispatchEvent(new Event('input', { bubbles: true }))
        document.body.querySelector<HTMLButtonElement>('[data-testid="talos-session-rename-submit"]')?.click()
        await flushPromises()

        expect(wrapper.emitted('rename')).toEqual([['chat-2', 'Final review']])
    })

    it('requires explicit confirmation before deleting a session', async () => {
        const wrapper = await mountOpen()
        document.body.querySelector<HTMLButtonElement>('[aria-label="Delete Release review"]')?.click()
        await flushPromises()
        expect(wrapper.emitted('delete')).toBeUndefined()

        document.body.querySelector<HTMLButtonElement>('[data-testid="talos-session-delete-confirm"]')?.click()
        await flushPromises()
        expect(wrapper.emitted('delete')).toEqual([['chat-2']])
    })

    it('shows the empty state and exposes a new-chat command', async () => {
        const wrapper = mount(TalosMobileSessionDrawer, {
            attachTo: document.body,
            props: { open: true, sessions: [], activeSessionId: null, busy: false },
        })
        await flushPromises()
        expect(document.body.textContent).toContain('No chats yet.')
        document.body.querySelector<HTMLButtonElement>('[data-testid="talos-session-new-chat"]')?.click()
        await flushPromises()
        expect(wrapper.emitted('newChat')).toHaveLength(1)
    })
})

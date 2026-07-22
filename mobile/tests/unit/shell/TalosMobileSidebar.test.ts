import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { TalosLocalChatSession } from '@/repositories/chatRepository'
import TalosMobileSidebar from '@/components/shell/TalosMobileSidebar.vue'

// F1-T3 — full-width hamburger sidebar (D5/D6), chat-first Claude pattern:
// [New chat] -> Recents (sessions) -> Tools -> Settings pinned bottom.
const sessions: TalosLocalChatSession[] = [
    {
        id: 'chat-2', title: 'Release review', surface: 'chat', mode: 'verified_execution',
        persistence_mode: 'persistent', active_model_profile_id: null, metadata: {},
        created_at: '2026-07-22T10:01:00.000Z', updated_at: '2026-07-22T10:03:00.000Z',
    },
    {
        id: 'chat-1', title: 'Architecture notes', surface: 'chat', mode: 'verified_execution',
        persistence_mode: 'persistent', active_model_profile_id: null, metadata: {},
        created_at: '2026-07-22T10:00:00.000Z', updated_at: '2026-07-22T10:02:00.000Z',
    },
]

afterEach(() => {
    document.body.innerHTML = ''
})

function mountSidebar(props: Record<string, unknown> = {}) {
    return mount(TalosMobileSidebar, {
        attachTo: document.body,
        props: {
            open: true,
            sessions,
            activeSessionId: 'chat-2',
            busy: false,
            creatingSession: false,
            ...props,
        },
    })
}

describe('TalosMobileSidebar (F1-T3)', () => {
    it('opens as a full-width dialog with the chat-first section order', async () => {
        mountSidebar()
        await flushPromises()
        const sidebar = document.querySelector('[data-testid="talos-mobile-sidebar"]') as HTMLElement
        expect(sidebar).toBeTruthy()
        const html = sidebar.innerHTML
        const newChat = html.indexOf('data-testid="talos-sidebar-new-chat"')
        const recents = html.indexOf('data-testid="talos-sidebar-recents"')
        const tools = html.indexOf('data-testid="talos-sidebar-tools"')
        const settings = html.indexOf('data-testid="talos-sidebar-settings"')
        expect(newChat).toBeGreaterThanOrEqual(0)
        expect(recents).toBeGreaterThan(newChat)
        expect(tools).toBeGreaterThan(recents)
        expect(settings).toBeGreaterThan(tools)
    })

    it('lists the sessions in Recents and forwards select', async () => {
        const wrapper = mountSidebar()
        await flushPromises()
        const row = document.querySelector('[aria-label="Open chat Architecture notes"]') as HTMLElement
        expect(row).toBeTruthy()
        row.click()
        await flushPromises()
        expect(wrapper.emitted('select')).toEqual([['chat-1']])
    })

    it('exposes the four tool destinations and settings, forwarding navigation', async () => {
        const wrapper = mountSidebar()
        await flushPromises()
        for (const label of ['Research', 'Cockpit', 'Library', 'Model Lab']) {
            expect(document.querySelector(`[data-testid="talos-mobile-sidebar"] [aria-label="Open ${label}"]`), label).toBeTruthy()
        }
        ;(document.querySelector('[aria-label="Open Research"]') as HTMLElement).click()
        ;(document.querySelector('[aria-label="Open Settings"]') as HTMLElement).click()
        await flushPromises()
        expect(wrapper.emitted('navigate')).toEqual([['research']])
        expect(wrapper.emitted('openSettings')).toHaveLength(1)
    })

    it('emits newChat from the top action and closes via update:open', async () => {
        const wrapper = mountSidebar()
        await flushPromises()
        ;(document.querySelector('[data-testid="talos-sidebar-new-chat"]') as HTMLElement).click()
        await flushPromises()
        expect(wrapper.emitted('newChat')).toHaveLength(1)
        const close = document.querySelector('[aria-label="Close menu"]') as HTMLElement
        expect(close).toBeTruthy()
        close.click()
        await flushPromises()
        expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    })

    it('completes the rename dialog flow and emits rename (session-drawer parity)', async () => {
        const wrapper = mountSidebar()
        await flushPromises()
        ;(document.querySelector('[aria-label="Rename Release review"]') as HTMLElement).click()
        await flushPromises()
        const input = document.querySelector('[aria-label="Chat name"]') as HTMLInputElement
        expect(input).toBeTruthy()
        input.value = 'Release retro'
        input.dispatchEvent(new Event('input'))
        await flushPromises()
        ;(document.querySelector('[data-testid="talos-session-rename-submit"]') as HTMLElement).click()
        await flushPromises()
        expect(wrapper.emitted('rename')).toEqual([['chat-2', 'Release retro']])
    })

    it('completes the delete confirmation flow and emits delete (session-drawer parity)', async () => {
        const wrapper = mountSidebar()
        await flushPromises()
        ;(document.querySelector('[aria-label="Delete Release review"]') as HTMLElement).click()
        await flushPromises()
        ;(document.querySelector('[data-testid="talos-session-delete-confirm"]') as HTMLElement).click()
        await flushPromises()
        expect(wrapper.emitted('delete')).toEqual([['chat-2']])
    })
})

// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

// R1-5: the streaming/typing tail reads the chat store directly.
vi.mock('@/stores/chatController', () => ({
    // The streaming reply now also reads which tools are running.
    useChatController: () => ({
        chat: {
            state: { sending: true, streamingText: null, streamingSessionId: 's1' },
            // The live reply belongs to a conversation now; without an active
            // session it renders nowhere.
            activeSession: { value: { id: 's1', title: 'A' } },
        },
        toolActivity: { value: [] as Array<{ name: string; detail: string | null }> },
    }),
}))

import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'
import { talosRelativeTime } from '@/lib/relativeTime'

// F2-T2 — calm thread per the frozen refinement-brief: relative timestamps,
// friendly model attribution, same-sender grouping, 3-dot typing indicator.
function msg(overrides: Partial<TalosMobileMessageView>): TalosMobileMessageView {
    return {
        id: 'id', role: 'user', content: 'x', state: 'persisted',
        created_at: '2026-07-22T12:00:00.000Z', model_profile_id: null,
        run_id: null, metadata: {},
        ...overrides,
    } as TalosMobileMessageView
}

describe('talosRelativeTime (F2-T2)', () => {
    const now = new Date('2026-07-22T12:10:00.000Z')
    it('formats the refinement-brief ladder', () => {
        expect(talosRelativeTime('2026-07-22T12:09:40.000Z', now)).toBe('just now')
        expect(talosRelativeTime('2026-07-22T12:08:00.000Z', now)).toBe('2m ago')
        expect(talosRelativeTime('2026-07-22T09:10:00.000Z', now)).toBe('3h ago')
        expect(talosRelativeTime('2026-07-20T12:10:00.000Z', now)).toBe('2d ago')
    })
    it('falls closed to an empty string on garbage input', () => {
        expect(talosRelativeTime('not-a-date', now)).toBe('')
    })
})

describe('TalosMobileMessageList calm thread (F2-T2)', () => {
    it('shows relative time and the FRIENDLY model label in the meta row', async () => {
        const wrapper = mount(TalosMobileMessageList, {
            props: {
                messages: [msg({ id: 'a1', role: 'assistant', content: 'Done.', model_profile_id: 'anthropic:claude-live' })],
                sending: false,
                modelLabels: { 'anthropic:claude-live': 'Claude Live' },
            },
        })
        await vi.dynamicImportSettled()
        await flushPromises()
        const meta = wrapper.get('.talos-message-meta')
        expect(meta.text()).toContain('TALOS')
        expect(meta.text()).toContain('Claude Live')
        expect(meta.text()).not.toContain('anthropic:claude-live')
        expect(meta.text()).toMatch(/just now|m ago|h ago|d ago/)
        wrapper.unmount()
    })

    it('groups consecutive same-sender messages: grouped articles marked, meta only on the last', async () => {
        const wrapper = mount(TalosMobileMessageList, {
            props: {
                messages: [
                    msg({ id: 'u1', role: 'user', content: 'first' }),
                    msg({ id: 'u2', role: 'user', content: 'second' }),
                    msg({ id: 'a1', role: 'assistant', content: 'reply' }),
                ],
                sending: false,
            },
        })
        await vi.dynamicImportSettled()
        await flushPromises()
        const articles = wrapper.findAll('article')
        expect(articles[0].attributes('data-grouped')).toBeUndefined()
        expect(articles[1].attributes('data-grouped')).toBe('true')
        expect(articles[2].attributes('data-grouped')).toBeUndefined()
        // meta row only where the group ends (u2 and a1, not u1)
        expect(articles[0].find('.talos-message-meta').exists()).toBe(false)
        expect(articles[1].find('.talos-message-meta').exists()).toBe(true)
        expect(articles[2].find('.talos-message-meta').exists()).toBe(true)
        wrapper.unmount()
    })

    it('never attributes a model to USER messages — attribution is assistant-only', async () => {
        // F2 capture finding: "You Gemini Live" is semantically wrong — the
        // human did not answer with a model.
        const wrapper = mount(TalosMobileMessageList, {
            props: {
                messages: [msg({ id: 'u1', role: 'user', content: 'hi', model_profile_id: 'gemini:gemini-live' })],
                sending: false,
                modelLabels: { 'gemini:gemini-live': 'Gemini Live' },
            },
        })
        await vi.dynamicImportSettled()
        await flushPromises()
        const meta = wrapper.get('.talos-message-meta')
        expect(meta.text()).toContain('You')
        expect(meta.text()).not.toContain('Gemini Live')
        wrapper.unmount()
    })

    it('renders the boot-logo line loader (F4-#24): a sweep crossing 3 filling nodes', async () => {
        const wrapper = mount(TalosMobileMessageList, { props: { messages: [], sending: true } })
        await vi.dynamicImportSettled()
        await flushPromises()
        const typing = wrapper.get('[data-testid="talos-mobile-typing"]')
        expect(typing.find('.talos-line-loader-sweep').exists()).toBe(true)
        expect(typing.findAll('.talos-line-loader-node')).toHaveLength(3)
        expect(typing.findAll('.talos-typing-dot')).toHaveLength(0)
        expect(typing.attributes('role')).toBe('status')
        expect(typing.text()).toContain('Processing')
        wrapper.unmount()
    })
})

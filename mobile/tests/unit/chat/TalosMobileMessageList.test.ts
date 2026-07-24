// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const writeText = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/services/clipboard', () => ({ writeTalosClipboardText: writeText }))

// R1-5: the streaming/typing tail reads the chat store directly.
vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({ chat: { state: { sending: true, streamingText: null } } }),
}))

import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'

const messages: TalosMobileMessageView[] = [
    {
        id: 'user-1', role: 'user', content: 'Explain this', state: 'persisted',
        created_at: '2026-07-22T12:00:00.000Z', model_profile_id: 'deepseek:deepseek-chat',
        run_id: null, metadata: {},
        attachments: [{
            id: 'binding-1',
            vault_file_id: 'vault-1',
            grant_id: 'grant-1',
            display_name: 'architecture.pdf',
            media_type: 'application/pdf',
            size_bytes: 4096,
            permissions: ['browser.upload', 'model.read'],
            grant_status: 'active',
        }],
    },
    {
        id: 'assistant-1', role: 'assistant', content: '## Answer\n\nSafe.', state: 'persisted',
        created_at: '2026-07-22T12:00:01.000Z', model_profile_id: 'deepseek:deepseek-chat',
        run_id: 'run-1', metadata: {},
        browserActivities: [{
            id: 'tool-1', operation: 'navigate', status: 'succeeded',
            occurred_at: '2026-07-22T12:00:01.000Z', failure_code: null,
            evidence: {
                contract: 'talos.mobile.browser.evidence.v1', source: 'manual_local',
                activity: {
                    id: 'activity-1', operation: 'navigate', status: 'succeeded',
                    label: 'Opened page in isolated browser', run_id: 'run-1',
                    browser_session_id: 'manual-1', artifact_ids: [],
                    occurred_at: '2026-07-22T12:00:01.000Z',
                },
                artifacts: [], snapshot: null, retry: null,
            },
        }],
    },
    {
        id: 'system-1', role: 'system', content: 'Rate limit.', state: 'failed',
        created_at: '2026-07-22T12:00:02.000Z', model_profile_id: 'deepseek:deepseek-chat',
        run_id: null, metadata: { chat_error: {
            layer: 'provider', code: 'PROVIDER_HTTP_429', message: 'Rate limit.', retryable: true,
        } },
    },
]

afterEach(() => {
    document.body.innerHTML = ''
    writeText.mockClear()
})

describe('TalosMobileMessageList', () => {
    it('renders role/state/metadata and safe assistant Markdown without page overflow classes', async () => {
        const wrapper = mount(TalosMobileMessageList, {
            attachTo: document.body,
            props: { messages, sending: false },
        })
        await vi.waitFor(() => {
            expect(wrapper.find('[data-message-id="assistant-1"] h2').exists()).toBe(true)
            // Both async chunks (content + browser activity) must land before
            // the assertions - their resolution order is not guaranteed.
            expect(wrapper.find('[data-testid="talos-mobile-browser-activity"]').exists()).toBe(true)
        })

        expect(wrapper.get('[data-message-id="user-1"]').attributes('data-message-kind')).toBe('user')
        expect(wrapper.get('[data-message-id="assistant-1"] h2').text()).toBe('Answer')
        expect(wrapper.get('[data-message-id="assistant-1"]').text()).toContain('deepseek:deepseek-chat')
        expect(wrapper.get('[data-message-id="assistant-1"] [data-testid="talos-mobile-browser-activity"]')
            .text()).toContain('Page navigation succeeded')
        const attachment = wrapper.get('[data-message-id="user-1"] [data-message-attachment-id="binding-1"]')
        expect(attachment.text()).toContain('architecture.pdf')
        expect(attachment.text()).toContain('4 KB')
        expect(attachment.attributes('title')).toBe('application/pdf')
        expect(wrapper.html()).not.toContain('talos-vault')
        expect(wrapper.html()).not.toContain('vault-1')
        expect(wrapper.html()).not.toContain('grant-1')
        expect(wrapper.get('[data-testid="talos-mobile-controlled-fault"]').attributes('data-fault-code')).toBe('PROVIDER_HTTP_429')
        expect(wrapper.get('[data-testid="talos-mobile-message-list"]').classes()).toContain('min-w-0')
        expect(wrapper.get('[data-testid="talos-mobile-message-list"]').classes()).toContain('overflow-x-hidden')
    })

    it('copies a message and forwards reuse/resend/retry actions', async () => {
        const wrapper = mount(TalosMobileMessageList, {
            attachTo: document.body,
            props: { messages: messages.slice(0, 2), sending: false },
        })
        await flushPromises()

        await wrapper.get('[data-message-id="user-1"] [aria-label="Copy message"]').trigger('click')
        await wrapper.get('[data-message-id="user-1"] [aria-label="Resend message"]').trigger('click')
        await wrapper.get('[data-message-id="assistant-1"] [aria-label="Retry assistant response"]').trigger('click')
        await flushPromises()
        expect(writeText).toHaveBeenCalledWith('Explain this')
        expect(wrapper.emitted('resend')).toEqual([['user-1']])
        expect(wrapper.emitted('retry')).toEqual([['assistant-1']])
        expect(wrapper.get('[role="status"][data-testid="talos-mobile-message-action-status"]').text()).toBe('Message copied.')
    })

    it('uses the neutral Processing status with no mojibake while a turn is running', () => {
        const wrapper = mount(TalosMobileMessageList, { props: { messages: [messages[0]!], sending: true } })
        expect(wrapper.get('[data-testid="talos-mobile-typing"]').text()).toBe('Processing')
        expect(wrapper.text()).not.toContain('â')
    })
})

// R2-11 — ONE row-action grammar (competitor pattern: long-press a message
// opens its actions, same gesture as the chat rows). The hold clicks the SAME
// overflow trigger — no second menu implementation.
describe('message long-press opens the overflow menu (R2-11)', () => {
    it('a 500ms stationary hold opens the message overflow', async () => {
        const wrapper = mount(TalosMobileMessageList, {
            props: { messages, sending: false },
            attachTo: document.body,
        })
        // The overflow menu is an async chunk — let it land before holding.
        await vi.waitFor(() => {
            if (!document.body.querySelector('[aria-label="More message actions"]')) throw new Error('overflow trigger not mounted yet')
        })
        vi.useFakeTimers()
        try {
            const article = wrapper.findAll('article')[0].element
            article.dispatchEvent(new MouseEvent('pointerdown', { clientX: 50, clientY: 50, bubbles: true }))
            await vi.advanceTimersByTimeAsync(600)
            article.dispatchEvent(new MouseEvent('pointerup', { clientX: 50, clientY: 50, bubbles: true }))
        } finally {
            vi.useRealTimers()
        }
        await flushPromises()
        expect(document.body.querySelector('[aria-label="Reuse prompt"]')).not.toBeNull()
        wrapper.unmount()
    })

    it('a moved finger never opens the overflow (scroll stays scroll)', async () => {
        const wrapper = mount(TalosMobileMessageList, {
            props: { messages, sending: false },
            attachTo: document.body,
        })
        await flushPromises()
        vi.useFakeTimers()
        try {
            const article = wrapper.findAll('article')[0].element
            article.dispatchEvent(new MouseEvent('pointerdown', { clientX: 50, clientY: 50, bubbles: true }))
            article.dispatchEvent(new MouseEvent('pointermove', { clientX: 50, clientY: 90, bubbles: true }))
            await vi.advanceTimersByTimeAsync(700)
        } finally {
            vi.useRealTimers()
        }
        expect(document.body.querySelector('[aria-label="Reuse prompt"]')).toBeNull()
        wrapper.unmount()
    })
})

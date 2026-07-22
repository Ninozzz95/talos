// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileMessageActions from '@/components/chat/TalosMobileMessageActions.vue'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'

function message(role: 'user' | 'assistant'): TalosMobileMessageView {
    return {
        id: `${role}-1`, role, content: 'content', state: 'persisted',
        created_at: '2026-07-22T12:00:00.000Z', model_profile_id: null,
        run_id: null, metadata: {},
    }
}

afterEach(() => { document.body.innerHTML = '' })

describe('TalosMobileMessageActions', () => {
    it('exposes direct copy/resend plus a Reka overflow reuse action for user messages', async () => {
        const wrapper = mount(TalosMobileMessageActions, {
            attachTo: document.body,
            props: { message: message('user'), busy: false, canRetry: false },
        })

        expect(wrapper.find('[aria-label="Copy message"]').exists()).toBe(true)
        expect(wrapper.find('[aria-label="Resend message"]').exists()).toBe(true)
        expect(wrapper.find('[aria-label="Retry assistant response"]').exists()).toBe(false)
        await wrapper.get('[aria-label="Copy message"]').trigger('click')
        await wrapper.get('[aria-label="Resend message"]').trigger('click')
        expect(wrapper.emitted('copy')).toEqual([[expect.objectContaining({ id: 'user-1' })]])
        expect(wrapper.emitted('resend')).toEqual([[expect.objectContaining({ id: 'user-1' })]])

        await vi.waitFor(() => {
            expect(wrapper.find('[aria-label="More message actions"]').exists()).toBe(true)
        })
        await wrapper.get('[aria-label="More message actions"]').trigger('click')
        await flushPromises()
        const reuse = document.body.querySelector<HTMLElement>('[role="menuitem"][aria-label="Reuse prompt"]')
        expect(reuse).not.toBeNull()
        reuse!.click()
        await flushPromises()
        expect(wrapper.emitted('reuse')).toEqual([[expect.objectContaining({ id: 'user-1' })]])
    })

    it('exposes copy and retry only for assistant messages and honours busy state', () => {
        const wrapper = mount(TalosMobileMessageActions, {
            props: { message: message('assistant'), busy: true, canRetry: true },
        })
        expect(wrapper.find('[aria-label="Copy message"]').exists()).toBe(true)
        expect(wrapper.get('[aria-label="Retry assistant response"]').attributes('disabled')).toBeDefined()
        expect(wrapper.find('[aria-label="Resend message"]').exists()).toBe(false)
        expect(wrapper.find('[aria-label="More message actions"]').exists()).toBe(false)
    })
})

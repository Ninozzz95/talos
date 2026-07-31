// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileStatusMessage from '@/components/chat/TalosMobileStatusMessage.vue'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'

function message(metadata: Record<string, unknown> = {}): TalosMobileMessageView {
    return {
        id: 'system-1',
        role: 'system',
        content: 'Provider failed.',
        created_at: '2026-07-22T12:00:00.000Z',
        state: 'failed',
        model_profile_id: 'deepseek:deepseek-chat',
        run_id: null,
        metadata,
    }
}

describe('TalosMobileStatusMessage', () => {
    it('renders an actionable controlled fault from persisted metadata', () => {
        const wrapper = mount(TalosMobileStatusMessage, {
            props: {
                message: message({ chat_error: {
                    layer: 'provider',
                    code: 'PROVIDER_HTTP_429',
                    message: 'Rate limit exceeded.',
                    next_action: 'Wait, then retry.',
                    retryable: true,
                    status: 429,
                    provider: 'deepseek',
                    model: 'deepseek-chat',
                } }),
            },
        })

        const alert = wrapper.get('[data-testid="talos-mobile-controlled-fault"]')
        expect(alert.attributes('role')).toBe('alert')
        expect(alert.attributes('data-fault-code')).toBe('PROVIDER_HTTP_429')
        expect(alert.text()).toContain('Provider failure')
        expect(alert.text()).toContain('Wait, then retry.')
        expect(alert.text()).toContain('deepseek / deepseek-chat')
        expect(alert.text()).toContain('HTTP 429')
        expect(alert.text()).toContain('Retry available')
    })

    it('renders malformed or ordinary system rows as a neutral status notice', () => {
        const wrapper = mount(TalosMobileStatusMessage, { props: { message: message() } })
        expect(wrapper.get('[role="status"]').text()).toContain('Provider failed.')
        expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })
})

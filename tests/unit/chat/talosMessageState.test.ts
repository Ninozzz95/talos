import { describe, expect, it } from 'vitest'
import { talosMobileControlledFault } from '@/lib/talosMessageState'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'

function message(metadata: Record<string, unknown>): TalosMobileMessageView {
    return {
        id: 'message-1',
        role: 'system',
        content: 'Provider failed.',
        created_at: '2026-07-22T12:00:00.000Z',
        state: 'failed',
        model_profile_id: 'deepseek:deepseek-chat',
        run_id: null,
        metadata,
    }
}

describe('talosMobileControlledFault', () => {
    it('parses a canonical persisted provider fault', () => {
        expect(talosMobileControlledFault(message({
            chat_error: {
                layer: 'provider',
                code: 'PROVIDER_HTTP_429',
                message: 'Rate limit exceeded.',
                next_action: 'Wait, then retry.',
                retryable: true,
                status: 429,
                provider: 'deepseek',
                model: 'deepseek-chat',
            },
        }))).toEqual({
            layer: 'provider',
            code: 'PROVIDER_HTTP_429',
            message: 'Rate limit exceeded.',
            nextAction: 'Wait, then retry.',
            retryable: true,
            status: 429,
            provider: 'deepseek',
            model: 'deepseek-chat',
        })
    })

    it('normalizes known layer aliases and rejects malformed metadata', () => {
        const fault = talosMobileControlledFault(message({
            chat_error: { layer: 'transport', code: 'OFFLINE', message: 'No network.' },
        }))
        expect(fault?.layer).toBe('network')
        expect(talosMobileControlledFault(message({ chat_error: { code: 'MISSING_LAYER' } }))).toBeNull()
        expect(talosMobileControlledFault(message({ chat_error: [] }))).toBeNull()
    })
})

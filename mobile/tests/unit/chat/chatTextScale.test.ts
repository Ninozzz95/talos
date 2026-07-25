// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'

/**
 * Review 2026-07-25: "chat text size" shipped BROKEN TWICE — first as a
 * preference nothing read, then with plumbing whose children re-declared an
 * absolute size. Both passed review because nothing asserted a rendered size.
 * This is that missing guard.
 */
function message(id: string) {
    return {
        id,
        role: 'assistant' as const,
        content: 'hello world',
        created_at: '2026-07-25T10:00:00.000Z',
        status: 'persisted' as const,
        model_profile_id: null,
        metadata: {},
        attachments: [],
    }
}

function mountList(textScale: 'compact' | 'balanced' | 'expanded') {
    return mount(TalosMobileMessageList, {
        props: { messages: [message('m1')], sending: false, textScale },
        global: { stubs: { teleport: true } },
    })
}

describe('chat text size actually renders', () => {
    it('produces three DISTINCT font sizes on the thread root', () => {
        const sizes = (['compact', 'balanced', 'expanded'] as const).map((scale) => {
            const root = mountList(scale).get('[data-testid="talos-mobile-message-list"]')
            return (root.attributes('style') ?? '').match(/font-size:\s*([^;]+)/)?.[1]?.trim()
        })
        expect(sizes.every(Boolean)).toBe(true)
        expect(new Set(sizes).size).toBe(3)
    })

    it('leaves no absolute font size between the root and the message text', () => {
        const html = mountList('expanded').html()
        // A Tailwind text-* utility on the bubble/content would override the
        // inherited size — that is exactly how this broke the second time.
        expect(html).not.toMatch(/class="[^"]*\btext-sm\b[^"]*"[^>]*data-message-kind/)
    })
})

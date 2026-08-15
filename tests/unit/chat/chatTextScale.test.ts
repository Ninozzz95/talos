// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'

import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
// Resolve the two async component graphs before this environment starts and
// tears down many shallow mounts in parallel with the wider chat suite.
import '@/components/chat/TalosMobileMessageContent.vue'
import '@/components/chat/TalosMobileStreamingReply.vue'
import {
    TALOS_CHAT_BUBBLE_SCALE_OPTIONS,
    TALOS_CHAT_TEXT_SCALE_REM,
    sanitizeTalosChatLayout,
} from '@/lib/talosChatLayout'
import type { TalosChatBubbleScale } from '@/lib/talosTypes'

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

async function mountList(textScale: TalosChatBubbleScale) {
    const wrapper = shallowMount(TalosMobileMessageList, {
        props: { messages: [message('m1')], sending: false, textScale },
        // This suite owns only the inherited font-size contract. Loading the
        // Markdown/browser/streaming chunks here adds no proof and can leave an
        // unobserved import alive while a parallel Vitest environment tears
        // down.
        global: {
            stubs: {
                teleport: true,
                TalosMobileMessageContent: true,
                TalosMobileBrowserActivity: true,
                TalosMobileStreamingReply: true,
            },
        },
    })
    await flushPromises()
    return wrapper
}

describe('chat text size actually renders', () => {
    const scales = TALOS_CHAT_BUBBLE_SCALE_OPTIONS.map((option) => option.value)

    it('offers an EXTRA SMALL step below small (owner, 2026-07-26)', () => {
        expect(scales).toEqual(['xcompact', 'compact', 'balanced', 'expanded'])
        // Strictly ordered: a "smaller" option that is not smaller is a lie.
        const rem = scales.map((scale) => TALOS_CHAT_TEXT_SCALE_REM[scale])
        expect(rem).toEqual([...rem].sort((left, right) => left - right))
        expect(new Set(rem).size).toBe(rem.length)
    })

    it('produces a DISTINCT font size per step on the thread root', async () => {
        const wrappers = await Promise.all(scales.map((scale) => mountList(scale)))
        const sizes = wrappers.map((wrapper) => {
            const root = wrapper.get('[data-testid="talos-mobile-message-list"]')
            return (root.attributes('style') ?? '').match(/font-size:\s*([^;]+)/)?.[1]?.trim()
        })
        expect(sizes.every(Boolean)).toBe(true)
        expect(new Set(sizes).size).toBe(scales.length)
        wrappers.forEach((wrapper) => wrapper.unmount())
    })

    it('keeps every chat step independent from the interface ui scale', async () => {
        for (const scale of scales) {
            const wrapper = await mountList(scale)
            const root = wrapper.get('[data-testid="talos-mobile-message-list"]')
            const style = root.attributes('style') ?? ''
            expect(style).not.toContain('--talos-ui-scale')
            expect(style).toContain(`font-size: ${TALOS_CHAT_TEXT_SCALE_REM[scale]}rem`)
            wrapper.unmount()
        }
    })

    it('keeps an unknown or dropped stored value on the default, never on nothing', () => {
        expect(sanitizeTalosChatLayout({ bubble_scale: 'xcompact' }).bubble_scale).toBe('xcompact')
        expect(sanitizeTalosChatLayout({ bubble_scale: 'microscopic' }).bubble_scale).toBe('balanced')
    })

    it('leaves no absolute font size between the root and the message text', async () => {
        const wrapper = await mountList('expanded')
        const html = wrapper.html()
        // A Tailwind text-* utility on the bubble/content would override the
        // inherited size — that is exactly how this broke the second time.
        expect(html).not.toMatch(/class="[^"]*\btext-sm\b[^"]*"[^>]*data-message-kind/)
        wrapper.unmount()
    })
})

import { describe, expect, it } from 'vitest'
import { talosMessageReasoning } from '@/lib/chat/messageReasoning'

describe('talosMessageReasoning', () => {
    it('returns the exact non-empty provider text without parsing or rewriting it', () => {
        const reasoning = '  **Generating images concisely**\n\nKeep the prompt concrete.  '
        expect(talosMessageReasoning({ reasoning })).toBe(reasoning)
    })

    it.each([
        {},
        { reasoning: '' },
        { reasoning: ' \n\t ' },
        { reasoning: null },
        { reasoning: 12 },
        { reasoning: ['not', 'text'] },
        { reasoning: { text: 'not a canonical provider string' } },
    ])('fails closed for absent, empty, or non-text metadata: %j', (metadata) => {
        expect(talosMessageReasoning(metadata)).toBeNull()
    })
})

import { describe, expect, it } from 'vitest'
import { adaptTurnsForTextOnlyModel } from '@/lib/chat/visionFallback'
import type { ChatTurn } from '@/stores/chat'

/**
 * Owner 2026-07-27: he switched a live conversation from Opus 5 to DeepSeek and
 * every further message died with
 *
 *   "deepseek-v4-flash does not declare image input support."
 *
 * The guard fired on ANY image anywhere in the history, so one photo sent an
 * hour earlier poisoned the conversation for good — including messages that had
 * nothing to do with it. You cannot un-send an image, and a past picture must
 * not be a life sentence for the chat.
 *
 * The distinction that matters is WHERE the image is. In the message being sent
 * now, refusing is right: the user just attached something this model cannot
 * see and deserves to be told before paying for a reply about nothing. Further
 * back, the honest thing is to drop it and say so, so the conversation
 * continues and the model does not silently believe it saw something.
 */
function imageTurn(role: 'user' | 'assistant', text: string): ChatTurn {
    return {
        role,
        content: text,
        parts: [
            { type: 'text', text },
            {
                type: 'image',
                attachmentId: 'a1',
                name: 'gatto.jpg',
                mediaType: 'image/jpeg',
                base64: 'AAAA',
                sha256: 'a'.repeat(64),
            },
        ],
    } as ChatTurn
}

describe('a conversation that outlived the model that could see', () => {
    it('drops an image from the history and says one was there', () => {
        const turns: ChatTurn[] = [
            imageTurn('user', 'guarda questa foto'),
            { role: 'assistant', content: 'È un gatto nero.' },
            { role: 'user', content: 'e adesso?' },
        ]

        const adapted = adaptTurnsForTextOnlyModel(turns)

        expect(adapted.dropped).toBe(1)
        const first = adapted.turns[0]!
        expect(first.parts?.some((part) => part.type === 'image')).toBe(false)
        // The model must know something was removed, or it will answer as if it
        // had seen the picture.
        expect(JSON.stringify(first)).toMatch(/image/i)
    })

    it('leaves a conversation without images exactly as it was', () => {
        const turns: ChatTurn[] = [
            { role: 'user', content: 'ciao' },
            { role: 'assistant', content: 'ciao!' },
        ]
        const adapted = adaptTurnsForTextOnlyModel(turns)
        expect(adapted.dropped).toBe(0)
        expect(adapted.turns).toEqual(turns)
    })

    it('keeps the text that travelled with the image', () => {
        const adapted = adaptTurnsForTextOnlyModel([imageTurn('user', 'che ne pensi?')])
        expect(JSON.stringify(adapted.turns)).toContain('che ne pensi?')
    })

    it('counts every image it removed, however many turns carried them', () => {
        const adapted = adaptTurnsForTextOnlyModel([
            imageTurn('user', 'una'),
            { role: 'assistant', content: 'ok' },
            imageTurn('user', 'due'),
        ])
        expect(adapted.dropped).toBe(2)
    })
})

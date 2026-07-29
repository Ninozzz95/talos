import { describe, expect, it, vi } from 'vitest'
import { runTalosAgentLoop } from '@/lib/tools/agentLoop'
import type { TalosToolCall } from '@/stores/chat'

/**
 * Owner 2026-07-27, from a real conversation he pasted:
 *
 *   "non riesco ad aprirne il contenuto: il sistema di lettura della libreria
 *    funziona con testo estratto dai documenti, e per questa immagine non c'è
 *    nessun estratto testuale"
 *
 * The Library can find an image and cannot look at it. The bitter part is that
 * TALOS already knows how to show a model an image — it does it for message
 * attachments — but a tool result is a STRING, so `library_read` could only
 * hand back the extracted text an image does not have.
 *
 * The fix does not go inside the tool result. Anthropic accepts image blocks in
 * a `tool_result`; OpenAI only in the Responses API, which is not the one TALOS
 * speaks; Gemini and Ollama not at all. What every provider does accept is an
 * image on a USER turn — the path attachments already use — so the image is
 * handed over as a part after the results, where all four adapters translate it
 * without a single new wire format. It also means the image appears in the
 * conversation, so the user can see what the model was given.
 */
function call(id: string, name = 'library_read'): TalosToolCall {
    return { id, name, arguments: { id: 'file-1' } } as TalosToolCall
}

const IMAGE = {
    type: 'image' as const,
    attachmentId: 'file-1',
    name: 'gatto.jpg',
    mediaType: 'image/jpeg' as const,
    base64: 'AAAA',
    sha256: 'a'.repeat(64),
}

const BINDING = {
    id: 'binding-file-1',
    vault_file_id: 'file-1',
    grant_id: 'grant-file-1',
}

describe('a tool that hands back something to look at', () => {
    it('puts the image on a user turn, after the tool results', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [call('a')] })
            .mockResolvedValue({ text: 'È un gatto nero.' })

        await runTalosAgentLoop([{ role: 'user', content: 'che immagine è?' }], {
            complete,
            execute: async () => ({
                ok: true,
                content: 'name: gatto.jpg — the image itself follows.',
                images: [IMAGE],
            }),
        })

        const turns = complete.mock.calls[1]![0] as Array<{ role: string; parts?: unknown[] }>
        const withImage = turns.find((turn) => turn.parts?.length)
        expect(withImage?.role).toBe('user')
        expect(withImage?.parts).toEqual([IMAGE])
        // And it comes AFTER the tool result it belongs to, or the model reads
        // the picture before being told what it is.
        expect(turns.indexOf(withImage!)).toBeGreaterThan(
            turns.findIndex((turn) => turn.role === 'tool'),
        )
    })

    it('adds nothing at all when no tool handed one back', async () => {
        // An empty user turn between rounds is a turn the model has to account
        // for, and on some providers an empty content is a 400.
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [call('a')] })
            .mockResolvedValue({ text: 'fatto' })

        await runTalosAgentLoop([{ role: 'user', content: 'ciao' }], {
            complete,
            execute: async () => ({ ok: true, content: 'plain text' }),
        })

        const turns = complete.mock.calls[1]![0] as Array<{ role: string; parts?: unknown[] }>
        expect(turns.some((turn) => turn.parts?.length)).toBe(false)
    })

    it('IMAGE-DUR-05 gathers images and durable message bindings in tool-call order', async () => {
        const second = { ...IMAGE, attachmentId: 'file-2', name: 'cane.jpg' }
        const secondBinding = {
            id: 'binding-file-2',
            vault_file_id: 'file-2',
            grant_id: 'grant-file-2',
        }
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [call('a'), call('b')] })
            .mockResolvedValue({ text: 'due animali' })

        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'guarda' }], {
            complete,
            execute: async (entry) => ({
                ok: true,
                content: 'ok',
                images: [entry.id === 'a' ? IMAGE : second],
                messageAttachments: [entry.id === 'a' ? BINDING : secondBinding],
            }),
        })

        const turns = complete.mock.calls[1]![0] as Array<{ role: string; parts?: unknown[] }>
        const withImage = turns.find((turn) => turn.parts?.length)
        expect(withImage?.parts).toEqual([IMAGE, second])
        expect(outcome.messageAttachments).toEqual([BINDING, secondBinding])
    })
})

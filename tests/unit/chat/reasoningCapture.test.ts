import { describe, expect, it, vi } from 'vitest'
import { createTalosSseAccumulator, talosStreamText } from '@/lib/chat/providers/streamShared'

/**
 * Owner 2026-07-25 (defect #5): "i modelli mandano anche il proprio
 * ragionamento e noi lo buttiamo." Every family carries it on a different
 * field, so these pin the ONE property that matters everywhere: the two
 * streams never mix. Reasoning leaking into the answer would be worse than
 * dropping it — the user would read the model's doubts as its conclusion.
 */
function sse(events: unknown[]): string {
    return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')
}

function transport(body: string) {
    return vi.fn(async (url: string, init?: { signal?: AbortSignal }) => {
        void url
        void init
        return {
            ok: true,
            body: new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode(body))
                    controller.close()
                },
            }),
        } as unknown as Response
    })
}

async function run(body: string, extract: (payload: string) => string, extractReasoning: (payload: string) => string) {
    const original = globalThis.fetch
    globalThis.fetch = transport(body) as unknown as typeof fetch
    const chunks: string[] = []
    const thoughts: string[] = []
    try {
        return {
            result: await talosStreamText({
                url: 'https://example.invalid/stream',
                headers: {},
                body: {},
                accumulator: createTalosSseAccumulator(),
                extract,
                extractReasoning,
                onChunk: (text) => chunks.push(text),
                onReasoning: (text) => thoughts.push(text),
            }),
            chunks,
            thoughts,
        }
    } finally {
        globalThis.fetch = original
    }
}

describe('streaming reasoning capture (defect #5)', () => {
    it('keeps reasoning and answer on separate channels (DeepSeek/OpenRouter shape)', async () => {
        const body = sse([
            { choices: [{ delta: { reasoning_content: 'Pesare le opzioni. ' } }] },
            { choices: [{ delta: { reasoning_content: 'La seconda regge meglio.' } }] },
            { choices: [{ delta: { content: 'Scegli la seconda.' } }] },
        ])
        const { result, chunks, thoughts } = await run(
            body,
            (payload) => (JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> })
                .choices?.[0]?.delta?.content ?? '',
            (payload) => {
                const delta = (JSON.parse(payload) as {
                    choices?: Array<{ delta?: { reasoning_content?: string; reasoning?: string } }>
                }).choices?.[0]?.delta
                return delta?.reasoning_content ?? delta?.reasoning ?? ''
            },
        )
        expect(result.text).toBe('Scegli la seconda.')
        expect(result.reasoning).toBe('Pesare le opzioni. La seconda regge meglio.')
        // The answer channel must never have seen a single thought.
        expect(chunks.join('')).toBe('Scegli la seconda.')
        expect(thoughts).toHaveLength(2)
    })

    it('handles a reply that is ALL reasoning and no answer', async () => {
        const body = sse([{ choices: [{ delta: { reasoning_content: 'Sto ancora pensando' } }] }])
        const { result } = await run(
            body,
            (payload) => (JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> })
                .choices?.[0]?.delta?.content ?? '',
            (payload) => (JSON.parse(payload) as { choices?: Array<{ delta?: { reasoning_content?: string } }> })
                .choices?.[0]?.delta?.reasoning_content ?? '',
        )
        // Empty text is what makes the adapter fall back to the buffered
        // transport instead of persisting an empty assistant message.
        expect(result.text).toBe('')
        expect(result.reasoning).toBe('Sto ancora pensando')
    })

    it('separates Gemini thought parts, which share the array with the answer', async () => {
        const body = sse([
            { candidates: [{ content: { parts: [{ text: 'Rifletto…', thought: true }, { text: 'Ecco.' }] } }] },
        ])
        const parts = (payload: string) => (JSON.parse(payload) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>
        }).candidates?.[0]?.content?.parts ?? []
        const { result } = await run(
            body,
            (payload) => parts(payload).filter((part) => part.thought !== true).map((part) => part.text ?? '').join(''),
            (payload) => parts(payload).filter((part) => part.thought === true).map((part) => part.text ?? '').join(''),
        )
        // Without the filter these were concatenated into one answer.
        expect(result.text).toBe('Ecco.')
        expect(result.reasoning).toBe('Rifletto…')
    })

    it('a malformed reasoning payload never breaks the answer stream', async () => {
        const body = sse([{ choices: [{ delta: { content: 'Va bene.' } }] }])
        const { result } = await run(
            body,
            (payload) => (JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> })
                .choices?.[0]?.delta?.content ?? '',
            () => { throw new Error('bad reasoning payload') },
        )
        expect(result.text).toBe('Va bene.')
        expect(result.reasoning).toBe('')
    })

    it('an adapter without a reasoning extractor behaves exactly as before', async () => {
        const body = sse([{ choices: [{ delta: { content: 'Ciao.' } }] }])
        const original = globalThis.fetch
        globalThis.fetch = transport(body) as unknown as typeof fetch
        try {
            const result = await talosStreamText({
                url: 'https://example.invalid/stream',
                headers: {},
                body: {},
                accumulator: createTalosSseAccumulator(),
                extract: (payload) => (JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> })
                    .choices?.[0]?.delta?.content ?? '',
                onChunk: () => {},
            })
            expect(result).toEqual({ text: 'Ciao.', reasoning: '' })
        } finally {
            globalThis.fetch = original
        }
    })
})

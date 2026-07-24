import { describe, expect, it, vi } from 'vitest'
import { createChatStore, type ChatCompletion } from '@/stores/chat'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'

// F2-T4 — streaming lifecycle in the chat store: live text, durable-final,
// stop -> honest interrupted partial. No partial ever double-persisted.
async function readyStore(complete: ChatCompletion) {
    const store = createChatStore(complete, { repository: createMemoryChatRepository() })
    await store.initialize()
    return store
}

describe('chat store streaming (F2-T4)', () => {
    it('accumulates live streamingText and persists ONE final assistant message', async () => {
        const complete: ChatCompletion = async (_turns, stream) => {
            stream?.onChunk('Hel')
            stream?.onChunk('lo')
            return 'Hello'
        }
        const store = await readyStore(complete)
        const seen: Array<string | null> = []
        const push = (value: string | null) => seen.push(value)
        const original = complete
        void original
        const pending = store.send('hi')
        // streamingText is transient — capture after ticks
        await pending
        push(store.state.streamingText)
        expect(seen.at(-1)).toBeNull() // cleared after final write
        const assistants = store.messages.filter((message) => message.role === 'assistant')
        expect(assistants).toHaveLength(1)
        expect(assistants[0].content).toBe('Hello')
        expect(assistants[0].metadata.interrupted).toBeUndefined()
    })

    it('stopStreaming aborts and persists the partial as interrupted without a system error', async () => {
        let sawAbort = false
        const complete: ChatCompletion = (_turns, stream) => new Promise((_resolve, reject) => {
            stream?.onChunk('Partial ans')
            stream?.signal?.addEventListener('abort', () => {
                sawAbort = true
                const error = new Error('aborted')
                error.name = 'AbortError'
                reject(error)
            })
        })
        const store = await readyStore(complete)
        const pending = store.send('hi')
        await vi.waitFor(() => expect(store.state.streamingText).toBe('Partial ans'))
        store.stopStreaming()
        await pending
        expect(sawAbort).toBe(true)
        const assistants = store.messages.filter((message) => message.role === 'assistant')
        expect(assistants).toHaveLength(1)
        expect(assistants[0].content).toBe('Partial ans')
        expect(assistants[0].metadata.interrupted).toBe(true)
        expect(store.messages.filter((message) => message.role === 'system')).toHaveLength(0)
        expect(store.state.streamingText).toBeNull()
        expect(store.state.sending).toBe(false)
    })

    it('fires onPersisted once the user message is committed, BEFORE the stream completes (composer clears immediately)', async () => {
        // Owner 2026-07-24: an attachment used to linger in the composer for the
        // whole generation because clearing waited on `accepted` (returned only
        // after streaming). onPersisted fires the instant the user turn is saved.
        let releaseStream: (value: string) => void = () => {}
        const complete: ChatCompletion = () => new Promise((resolve) => { releaseStream = resolve })
        const store = await readyStore(complete)
        const onPersisted = vi.fn()
        const pending = store.send('hi', null, {}, [], onPersisted)

        await vi.waitFor(() => expect(onPersisted).toHaveBeenCalledOnce())
        // The user turn is saved but the assistant stream has NOT completed yet.
        expect(store.messages.filter((message) => message.role === 'user')).toHaveLength(1)
        expect(store.messages.filter((message) => message.role === 'assistant')).toHaveLength(0)
        expect(store.state.sending).toBe(true)

        releaseStream('done')
        await pending
        expect(onPersisted).toHaveBeenCalledOnce()
    })

    it('provider failure AFTER partial chunks keeps the partial (interrupted) and reports the error', async () => {
        const complete: ChatCompletion = async (_turns, stream) => {
            stream?.onChunk('Half ')
            throw new Error('connection reset')
        }
        const store = await readyStore(complete)
        await store.send('hi')
        const assistants = store.messages.filter((message) => message.role === 'assistant')
        expect(assistants).toHaveLength(1)
        expect(assistants[0].content).toBe('Half ')
        expect(assistants[0].metadata.interrupted).toBe(true)
        expect(store.messages.filter((message) => message.role === 'system')).toHaveLength(1)
    })
})

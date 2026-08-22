import { describe, expect, it, vi } from 'vitest'
import {
    createChatStore as createLocalizedChatStore,
    type ChatCompletion,
    type ChatStoreOptions,
} from '@/stores/chat'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { talosTestT } from '../../helpers/talosTestI18n'

function createChatStore(
    complete: ChatCompletion,
    options: Omit<ChatStoreOptions, 'translate'>,
) {
    return createLocalizedChatStore(complete, {
        ...options,
        translate: talosTestT('en'),
    })
}

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
            return { text: 'Hello', finishReason: 'stop' }
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

    it('P1-CTX-ISO-07 stop aborts after one attempt and persists the visible partial', async () => {
        let sawAbort = false
        const complete: ChatCompletion = vi.fn((_turns, stream) => new Promise((_resolve, reject) => {
            stream?.onChunk('Partial ans')
            stream?.signal?.addEventListener('abort', () => {
                sawAbort = true
                const error = new Error('aborted')
                error.name = 'AbortError'
                reject(error)
            })
        }))
        const store = await readyStore(complete)
        const pending = store.send('hi')
        await vi.waitFor(() => expect(store.state.streamingText).toBe('Partial ans'))
        store.stopStreaming()
        await pending
        expect(sawAbort).toBe(true)
        expect(complete).toHaveBeenCalledOnce()
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

    it('P1-CTX-ISO-07 a visible partial failure is never retried', async () => {
        const complete: ChatCompletion = vi.fn(async (_turns, stream) => {
            stream?.onChunk('Half ')
            throw new Error('connection reset')
        })
        const store = await readyStore(complete)
        await store.send('hi')
        expect(complete).toHaveBeenCalledOnce()
        const assistants = store.messages.filter((message) => message.role === 'assistant')
        expect(assistants).toHaveLength(1)
        expect(assistants[0].content).toBe('Half ')
        expect(assistants[0].metadata.interrupted).toBe(true)
        expect(store.messages.filter((message) => message.role === 'system')).toHaveLength(1)
    })

    it('IMAGE-DUR-02/03 persists assistant images across reload without replaying them as future model input', async () => {
        const repository = createMemoryChatRepository()
        await repository.initialize()
        await repository.createVaultFile({
            id: 'generated-image',
            display_name: 'astronaut.png',
            media_type: 'image/png',
            size_bytes: 3,
            private_uri: 'talos-vault/files/generated-image.png',
            status: 'available',
            trust: 'untrusted',
            sha256: 'c'.repeat(64),
            extracted_text: null,
            failure_code: null,
            metadata: { origin: 'generated', origin_session_id: 'chat-image' },
            created_at: '2026-07-29T01:00:00.000Z',
        })
        await repository.createFileAuthorityGrant({
            id: 'generated-image-grant',
            vault_file_id: 'generated-image',
            permissions: ['model.read', 'browser.upload'],
            label: 'astronaut.png',
            created_at: '2026-07-29T01:00:00.000Z',
        })
        const resolveMessageParts = vi.fn().mockResolvedValue([{
            type: 'image' as const,
            attachmentId: 'generated-image-binding',
            name: 'astronaut.png',
            mediaType: 'image/png' as const,
            base64: 'AQID',
            sha256: 'c'.repeat(64),
        }])
        const firstComplete: ChatCompletion = vi.fn().mockResolvedValue({
            text: 'Ecco la tua immagine.',
            attachments: [{
                id: 'generated-image-binding',
                vault_file_id: 'generated-image',
                grant_id: 'generated-image-grant',
            }],
        })
        const first = createChatStore(firstComplete, { repository, resolveMessageParts })
        await first.initialize()
        await first.send('Disegna un astronauta')

        expect(first.messages.find((message) => message.role === 'assistant')?.attachments)
            .toEqual([expect.objectContaining({
                vault_file_id: 'generated-image',
                display_name: 'astronaut.png',
            })])

        const followUpComplete: ChatCompletion = vi.fn().mockResolvedValue({ text: 'Risposta testuale.' })
        const reloaded = createChatStore(followUpComplete, { repository, resolveMessageParts })
        await reloaded.initialize()
        expect(reloaded.messages.find((message) => message.role === 'assistant')?.attachments)
            .toEqual([expect.objectContaining({ vault_file_id: 'generated-image' })])

        resolveMessageParts.mockClear()
        await reloaded.send('Ora dimmi solo ciao')
        const turns = vi.mocked(followUpComplete).mock.calls[0]![0]
        expect(turns.find((turn) => turn.role === 'assistant')?.parts).toBeUndefined()
        expect(resolveMessageParts).not.toHaveBeenCalled()
    })
})

/**
 * Defect #5 (owner decision): the reasoning is PERSISTED with the message, so
 * it survives the session and reaches the export. The first version of this
 * feature had no store test at all — which is how a fallback ended up pairing
 * one generation's trace with another generation's answer.
 */
describe('reasoning persistence (defect #5)', () => {
    it('persists the streamed reasoning beside the answer, not inside it', async () => {
        const complete: ChatCompletion = async (_turns, stream) => {
            stream?.onReasoning?.('Prima valuto. ')
            stream?.onReasoning?.('Poi decido.')
            stream?.onChunk('Decisione presa.')
            return { text: 'Decisione presa.' }
        }
        const store = await readyStore(complete)
        await store.send('hi')
        const assistant = store.messages.filter((message) => message.role === 'assistant').at(-1)!
        expect(assistant.content).toBe('Decisione presa.')
        expect(assistant.metadata.reasoning).toBe('Prima valuto. Poi decido.')
        expect(assistant.reasoning).toBe('Prima valuto. Poi decido.')
        expect(store.state.streamingReasoning).toBeNull()
    })

    it('projects the same typed reasoning again after the persisted chat reloads', async () => {
        const repository = createMemoryChatRepository()
        const complete: ChatCompletion = async (_turns, stream) => {
            stream?.onReasoning?.('Controllo il dato persistito.')
            stream?.onChunk('Dato confermato.')
            return { text: 'Dato confermato.' }
        }
        const first = createChatStore(complete, { repository })
        await first.initialize()
        await first.send('controlla')

        const reloaded = createChatStore(complete, { repository })
        await reloaded.initialize()
        const assistant = reloaded.messages.find((message) => message.role === 'assistant')
        expect(assistant?.metadata.reasoning).toBe('Controllo il dato persistito.')
        expect(assistant?.reasoning).toBe('Controllo il dato persistito.')
    })

    it('a transport that abandons the stream must not pair the old trace with the new answer', async () => {
        const complete: ChatCompletion = async (_turns, stream) => {
            stream?.onReasoning?.('Ragionamento del tentativo fallito')
            // The buffered fallback fires this before re-asking.
            stream?.onReasoningReset?.()
            stream?.onChunk('Risposta del secondo tentativo.')
            return { text: 'Risposta del secondo tentativo.' }
        }
        const store = await readyStore(complete)
        await store.send('hi')
        const assistant = store.messages.filter((message) => message.role === 'assistant').at(-1)!
        // Persisting the first attempt's reasoning under the second attempt's
        // answer is a lie the export would carry.
        expect(assistant.metadata.reasoning).toBeUndefined()
        expect(assistant.content).toBe('Risposta del secondo tentativo.')
    })

    it('Stop during the thinking phase keeps the trace instead of discarding it', async () => {
        const complete: ChatCompletion = (_turns, stream) => new Promise((_resolve, reject) => {
            stream?.onReasoning?.('Stavo ancora pensando')
            stream?.signal?.addEventListener('abort', () => {
                const error = new Error('aborted')
                error.name = 'AbortError'
                reject(error)
            })
        })
        const store = await readyStore(complete)
        const pending = store.send('hi')
        await vi.waitFor(() => expect(store.state.streamingReasoning).toBe('Stavo ancora pensando'))
        store.stopStreaming()
        await pending
        const assistant = store.messages.filter((message) => message.role === 'assistant').at(-1)
        expect(assistant?.metadata.interrupted).toBe(true)
        expect(assistant?.metadata.reasoning).toBe('Stavo ancora pensando')
    })
})

import { describe, expect, it, vi } from 'vitest'
import { createChatStore, type ChatTurn } from '@/stores/chat'

let counter = 0
const makeId = (): string => `id-${(counter += 1)}`

describe('createChatStore', () => {
    it('appends the user message then the assistant reply and toggles sending', async () => {
        counter = 0
        let resolveReply: (v: string) => void = () => {}
        const complete = vi.fn(() => new Promise<string>((resolve) => { resolveReply = resolve }))
        const store = createChatStore(complete, makeId)

        const pending = store.send('Hello')
        expect(store.messages).toHaveLength(1)
        expect(store.messages[0]).toMatchObject({ role: 'user', content: 'Hello', state: 'persisted' })
        expect(store.state.sending).toBe(true)

        resolveReply('Hi there')
        await pending
        expect(store.messages).toHaveLength(2)
        expect(store.messages[1]).toMatchObject({ role: 'assistant', content: 'Hi there', state: 'persisted' })
        expect(store.state.sending).toBe(false)
        expect(store.state.lastError).toBeNull()
    })

    it('passes the full prior conversation as turns to the completion', async () => {
        counter = 0
        const complete = vi.fn<(t: ChatTurn[]) => Promise<string>>()
            .mockResolvedValueOnce('A1')
            .mockResolvedValueOnce('A2')
        const store = createChatStore(complete, makeId)
        await store.send('Q1')
        await store.send('Q2')
        expect(complete).toHaveBeenLastCalledWith([
            { role: 'user', content: 'Q1' },
            { role: 'assistant', content: 'A1' },
            { role: 'user', content: 'Q2' },
        ])
    })

    it('records a failed system message and lastError when the completion throws', async () => {
        counter = 0
        const complete = vi.fn().mockRejectedValue(new Error('invalid x-api-key'))
        const store = createChatStore(complete, makeId)
        await store.send('hi')
        expect(store.state.sending).toBe(false)
        expect(store.state.lastError).toBe('invalid x-api-key')
        const last = store.messages[store.messages.length - 1]
        expect(last).toMatchObject({ role: 'system', state: 'failed' })
        expect(last.content).toContain('invalid x-api-key')
    })

    it('ignores empty input and concurrent sends while one is in flight', async () => {
        counter = 0
        let resolveReply: (v: string) => void = () => {}
        const complete = vi.fn(() => new Promise<string>((resolve) => { resolveReply = resolve }))
        const store = createChatStore(complete, makeId)

        await store.send('   ')
        expect(store.messages).toHaveLength(0)
        expect(complete).not.toHaveBeenCalled()

        const first = store.send('one')
        await store.send('two') // should be ignored — one is in flight
        expect(complete).toHaveBeenCalledTimes(1)
        resolveReply('done')
        await first
    })

    it('reset clears the conversation and error', async () => {
        counter = 0
        const store = createChatStore(vi.fn().mockResolvedValue('x'), makeId)
        await store.send('hi')
        store.reset()
        expect(store.messages).toHaveLength(0)
        expect(store.state.lastError).toBeNull()
    })
})

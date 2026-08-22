import { describe, expect, it } from 'vitest'
import {
    createChatStore as createLocalizedChatStore,
    type ChatCompletion,
    type ChatStoreOptions,
    type ChatTurn,
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

/**
 * Debt A1 (architecture review): the completion contract was `Promise<string>`,
 * `ChatTurn.role` admitted only user/assistant, and `finishReason` was discarded —
 * so tool calling could not be added without rewriting the send path. The DB
 * already had `role: 'tool'` while the runtime collapsed it to 'system'.
 *
 * Web research (2025 agent-loop practice): drive the loop on `finishReason`,
 * carry tool calls and their results as durable turns, and bound the rounds.
 */
describe('A1 — completion contract supports tools', () => {
    it('carries a tool role, tool calls and tool_call_id on a turn', () => {
        const turn: ChatTurn = {
            role: 'tool',
            content: '{"temp":21}',
            toolCallId: 'call_1',
        }
        const assistant: ChatTurn = {
            role: 'assistant',
            content: '',
            toolCalls: [{ id: 'call_1', name: 'get_weather', arguments: '{"city":"Rome"}' }],
        }
        expect(turn.toolCallId).toBe('call_1')
        expect(assistant.toolCalls?.[0]?.name).toBe('get_weather')
    })

    it('a completion returns a RESULT (text + finishReason), not a bare string', async () => {
        const repository = createMemoryChatRepository()
        const complete: ChatCompletion = async () => ({ text: 'done', finishReason: 'stop' })
        const chat = createChatStore(complete, { repository })
        await chat.initialize()

        const accepted = await chat.send('hi', null)

        expect(accepted).toBe(true)
        const assistant = chat.messages.find((message) => message.role === 'assistant')
        expect(assistant?.content).toBe('done')
    })

    it('keeps tool turns visible instead of collapsing them into system messages', async () => {
        const repository = createMemoryChatRepository()
        const session = await repository.createSession({
            id: 'session-tool', title: 'Tool chat', created_at: '2026-07-25T10:00:00.000Z',
        })
        await repository.appendMessage({
            id: 'm-tool', session_id: session.id, role: 'tool', content: 'tool output',
            status: 'persisted', model_profile_id: null, created_at: '2026-07-25T10:00:01.000Z',
        })
        const chat = createChatStore(async () => ({ text: '', finishReason: 'stop' }), { repository })
        await chat.initialize()
        await chat.selectSession(session.id)

        expect(chat.messages.find((message) => message.id === 'm-tool')?.role).toBe('tool')
    })
})

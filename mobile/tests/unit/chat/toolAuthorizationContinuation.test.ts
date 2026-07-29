import { describe, expect, it, vi } from 'vitest'
import { createTalosChatSendIdentity } from '@/lib/chat/sendSnapshot'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import {
    createChatStore,
    type ChatCompletion,
    type TalosChatContinuationInput,
} from '@/stores/chat'
import { talosTestT } from '../../helpers/talosTestI18n'

function clock(): () => string {
    let tick = 0
    return () => `2026-07-29T12:00:${String(tick++).padStart(2, '0')}.000Z`
}

function ids(): () => string {
    let sequence = 0
    return () => `continuation-${++sequence}`
}

function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    const promise = new Promise<T>((settle) => { resolve = settle })
    return { promise, resolve }
}

describe('durable owner-bound chat continuation', () => {
    it('TOOL-AUTH-17 resumes on the captured session/model without a synthetic user turn', async () => {
        const now = clock()
        const repository = createMemoryChatRepository({ now })
        const complete = vi.fn<ChatCompletion<{ snapshot: string }>>(async (
            turns,
            _stream,
            _tools,
            invocation,
        ) => {
            expect(turns).toEqual([])
            expect(invocation).toMatchObject({
                identity: {
                    modelProfileId: 'anthropic:captured',
                },
                runtime: { snapshot: 'captured' },
                continuation: {
                    checkpoint_id: 'checkpoint-1',
                    checkpoint: { phase: 'before_model' },
                },
            })
            return { text: 'Continued on the owner.' }
        })
        const store = createChatStore(complete, {
            repository,
            translate: talosTestT('en'),
            makeId: ids(),
            now,
        })
        await store.initialize()
        const owner = await store.createSession('Owner', 'anthropic:captured')
        const current = await store.createSession('Current', 'openai:current')
        const input: TalosChatContinuationInput<{ snapshot: string }> = {
            identity: createTalosChatSendIdentity({
                sendId: 'send-owner',
                sessionId: owner.id,
                sessionTitle: owner.title,
                surface: owner.surface,
                modelProfileId: 'anthropic:captured',
                acceptedAt: '2026-07-29T12:00:00.000Z',
            }),
            runtime: { snapshot: 'captured' },
            checkpoint_id: 'checkpoint-1',
            checkpoint: { phase: 'before_model' },
        }

        await expect(store.continueFromCheckpoint(input)).resolves.toBe(true)

        expect(store.activeSession.value?.id).toBe(current.id)
        expect(store.messages).toEqual([])
        const ownerMessages = await repository.listMessages(owner.id)
        expect(ownerMessages).toEqual([
            expect.objectContaining({
                role: 'assistant',
                content: 'Continued on the owner.',
                model_profile_id: 'anthropic:captured',
                metadata: expect.objectContaining({
                    tool_authorization_checkpoint_id: 'checkpoint-1',
                }),
            }),
        ])
        expect(ownerMessages.some((message) => message.role === 'user')).toBe(false)
        expect(complete).toHaveBeenCalledTimes(1)
    })

    it('TOOL-AUTH-16 reconciles an already persisted receipt without another provider call', async () => {
        const now = clock()
        const makeId = ids()
        const repository = createMemoryChatRepository({ now })
        const complete = vi.fn<ChatCompletion<{ snapshot: string }>>()
        const store = createChatStore(complete, {
            repository,
            translate: talosTestT('en'),
            makeId,
            now,
        })
        await store.initialize()
        const owner = await store.createSession('Owner', 'anthropic:captured')
        await repository.appendMessage({
            id: makeId(),
            session_id: owner.id,
            role: 'assistant',
            content: 'Already complete.',
            state: 'persisted',
            model_profile_id: 'anthropic:captured',
            metadata: { tool_authorization_checkpoint_id: 'checkpoint-existing' },
            attachments: [],
            created_at: now(),
        })

        await expect(store.continueFromCheckpoint({
            identity: createTalosChatSendIdentity({
                sendId: 'send-owner',
                sessionId: owner.id,
                sessionTitle: owner.title,
                surface: owner.surface,
                modelProfileId: 'anthropic:captured',
                acceptedAt: '2026-07-29T12:00:00.000Z',
            }),
            runtime: { snapshot: 'captured' },
            checkpoint_id: 'checkpoint-existing',
            checkpoint: { phase: 'before_model' },
        })).resolves.toBe(true)

        expect(complete).not.toHaveBeenCalled()
    })

    it('TOOL-AUTH-02 queues a ready continuation behind an active send and then releases it', async () => {
        const now = clock()
        const repository = createMemoryChatRepository({ now })
        const first = deferred<{ text: string }>()
        const complete = vi.fn<ChatCompletion<{ snapshot: string }>>(async (
            _turns,
            _stream,
            _tools,
            invocation,
        ) => invocation?.continuation
            ? { text: 'Continuation done.' }
            : first.promise)
        const store = createChatStore(complete, {
            repository,
            translate: talosTestT('en'),
            makeId: ids(),
            now,
            captureSendRuntime: () => ({ snapshot: 'foreground' }),
        })
        await store.initialize()
        const owner = await store.createSession('Owner', 'anthropic:captured')
        const foreground = store.send('Normal message', 'anthropic:captured')
        await vi.waitFor(() => {
            expect(store.state.sending).toBe(true)
            expect(complete).toHaveBeenCalledTimes(1)
        })

        const continuation = store.continueFromCheckpoint({
            identity: createTalosChatSendIdentity({
                sendId: 'send-owner',
                sessionId: owner.id,
                sessionTitle: owner.title,
                surface: owner.surface,
                modelProfileId: 'anthropic:captured',
                acceptedAt: '2026-07-29T12:00:00.000Z',
            }),
            runtime: { snapshot: 'captured' },
            checkpoint_id: 'checkpoint-queued',
            checkpoint: { phase: 'before_model' },
        })
        await Promise.resolve()
        expect(complete).toHaveBeenCalledTimes(1)

        first.resolve({ text: 'Normal done.' })
        await expect(foreground).resolves.toBe(true)
        await expect(continuation).resolves.toBe(true)
        expect(complete).toHaveBeenCalledTimes(2)
        expect(store.state.sending).toBe(false)
    })
})

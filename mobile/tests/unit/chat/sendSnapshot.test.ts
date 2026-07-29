import { describe, expect, it } from 'vitest'
import {
    createTalosChatSendIdentity,
    type TalosChatSendPreparation,
    type TalosChatSendPreparationContext,
} from '@/lib/chat/sendSnapshot'

describe('Talos immutable chat-send identity', () => {
    it('P1-CTX-ISO-01 copies and freezes the accepted session/model identity', () => {
        const source = {
            sendId: 'send-1',
            sessionId: 'chat-owner',
            sessionTitle: 'Owner chat',
            surface: 'chat' as const,
            modelProfileId: 'anthropic:claude-live',
            acceptedAt: '2026-07-29T10:00:00.000Z',
        }

        const identity = createTalosChatSendIdentity(source)
        source.sessionId = 'chat-destination'

        expect(identity).toEqual({
            sendId: 'send-1',
            sessionId: 'chat-owner',
            sessionTitle: 'Owner chat',
            surface: 'chat',
            modelProfileId: 'anthropic:claude-live',
            acceptedAt: '2026-07-29T10:00:00.000Z',
        })
        expect(Object.isFrozen(identity)).toBe(true)
        expect(Reflect.set(identity, 'sessionId', 'chat-mutated')).toBe(false)
        expect(identity.sessionId).toBe('chat-owner')
    })

    it('P1-CTX-ISO-02 keeps preparation metadata and runtime explicitly send-scoped', () => {
        type Runtime = Readonly<{ provider: 'anthropic'; selectedIds: readonly string[] }>
        const identity = createTalosChatSendIdentity({
            sendId: 'send-2',
            sessionId: 'chat-owner',
            sessionTitle: 'Owner chat',
            surface: 'browse',
            modelProfileId: 'anthropic:claude-live',
            acceptedAt: '2026-07-29T10:00:01.000Z',
        })
        const runtime: Runtime = Object.freeze({
            provider: 'anthropic',
            selectedIds: Object.freeze(['library-a']),
        })
        const context: TalosChatSendPreparationContext<Runtime> = {
            identity,
            text: 'Use the source',
            metadata: Object.freeze({ command_id: 'send' }),
            attachments: Object.freeze([]),
            signal: new AbortController().signal,
            runtime,
        }
        const prepared: TalosChatSendPreparation<Runtime> = {
            runtime: context.runtime,
            metadata: Object.freeze({ used_library: ['library-a'] }),
        }

        expect(prepared.runtime).toBe(runtime)
        expect(prepared.metadata).toEqual({ used_library: ['library-a'] })
        expect(context.identity.sessionId).toBe('chat-owner')
    })
})

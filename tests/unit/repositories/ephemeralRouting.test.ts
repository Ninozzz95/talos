import { describe, expect, it, vi } from 'vitest'
import { createTalosEphemeralRoutingRepository } from '@/repositories/ephemeralRoutingRepository'

/**
 * F-14, the temporary chat. Owner request; industry research first.
 *
 * The 2026 verdict on "incognito" is blunt: it mostly means "we still have it,
 * we just do not show it to you" — ChatGPT and Claude retain temporary
 * conversations for a stated window, and a court ordered OpenAI to preserve all
 * of them. What the mode buys is privacy from whoever picks up your phone.
 *
 * TALOS is local-first, so the LOCAL half can be true here: never written to
 * disk rather than hidden from a list. That is what this router exists for.
 *
 * It routes rather than flags. A flag has to be checked at every write site,
 * and the day someone adds write site number nine it is forgotten. Routing
 * means an ephemeral write has no disk in front of it at all.
 *
 * And it FAILS CLOSED: a method with no routing rule throws instead of falling
 * through to disk. Method thirty-nine breaks a test the day it is added, rather
 * than silently writing down a chat the user asked to be temporary.
 */
function repo(name: string) {
    const messages: Array<{ id: string; session_id: string }> = []
    return {
        name,
        initialize: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
        listSessions: vi.fn(async () => [{ id: `${name}-session` }]),
        getActiveSessionId: vi.fn(async () => null),
        createSession: vi.fn(async (input: { id: string }) => ({ id: input.id, from: name })),
        selectSession: vi.fn(async () => {}),
        deleteSession: vi.fn(async () => null),
        listMessages: vi.fn(async () => messages),
        appendMessage: vi.fn(async (input: { id: string; session_id: string }) => {
            messages.push(input)
            return { ...input, from: name }
        }),
        listMessageAttachments: vi.fn(async () => [{ from: name }]),
        listVaultFiles: vi.fn(async () => [{ from: name }]),
        listMemories: vi.fn(async () => [{ from: name }]),
    } as never
}

function router(ephemeralSessionId: string | null = 'temp-1') {
    const durable = repo('durable')
    const ephemeral = repo('ephemeral')
    const routed = createTalosEphemeralRoutingRepository({
        durable: durable as never,
        ephemeral: ephemeral as never,
        isEphemeral: (sessionId: string) => sessionId === ephemeralSessionId,
    })
    return { routed, durable: durable as never, ephemeral: ephemeral as never }
}

describe('routing a temporary chat away from the disk', () => {
    it('sends a temporary message to memory and never to the disk', async () => {
        const { routed, durable, ephemeral } = router()

        await routed.appendMessage({ id: 'm1', session_id: 'temp-1', role: 'user' } as never)

        expect(ephemeral.appendMessage).toHaveBeenCalledOnce()
        expect(durable.appendMessage).not.toHaveBeenCalled()
    })

    it('leaves an ordinary chat exactly where it was', async () => {
        const { routed, durable, ephemeral } = router()

        await routed.appendMessage({ id: 'm1', session_id: 'kept-1', role: 'user' } as never)

        expect(durable.appendMessage).toHaveBeenCalledOnce()
        expect(ephemeral.appendMessage).not.toHaveBeenCalled()
    })

    it('routes by the session id carried inside the input, not only by argument order', async () => {
        const { routed, durable, ephemeral } = router()

        await routed.createSession({ id: 'temp-1', title: 'x' } as never)
        await routed.createSession({ id: 'kept-1', title: 'y' } as never)

        expect(ephemeral.createSession).toHaveBeenCalledOnce()
        expect(durable.createSession).toHaveBeenCalledOnce()
    })

    /**
     * Some methods are given a MESSAGE id, and a message id does not say which
     * session it belongs to. The router remembers what it sent to memory, so
     * the answer comes from what actually happened rather than from a guess.
     */
    it('follows a message it wrote to memory when asked about it later', async () => {
        const { routed, durable, ephemeral } = router()
        await routed.appendMessage({ id: 'm-temp', session_id: 'temp-1', role: 'user' } as never)
        await routed.appendMessage({ id: 'm-kept', session_id: 'kept-1', role: 'user' } as never)

        await routed.listMessageAttachments('m-temp')
        await routed.listMessageAttachments('m-kept')

        expect(ephemeral.listMessageAttachments).toHaveBeenCalledExactlyOnceWith('m-temp')
        expect(durable.listMessageAttachments).toHaveBeenCalledExactlyOnceWith('m-kept')
    })

    /**
     * The temporary chat must not appear in the history: that is the whole
     * point. It exists as the chat you are in, and nowhere else.
     */
    it('keeps the temporary chat out of the session list', async () => {
        const { routed, durable, ephemeral } = router()

        const sessions = await routed.listSessions()

        expect(durable.listSessions).toHaveBeenCalledOnce()
        expect(ephemeral.listSessions).not.toHaveBeenCalled()
        expect(sessions).toEqual([{ id: 'durable-session' }])
    })

    it('leaves everything that is not a chat on the disk', async () => {
        const { routed, durable, ephemeral } = router()

        await routed.listVaultFiles()
        await routed.listMemories()

        expect(durable.listVaultFiles).toHaveBeenCalledOnce()
        expect(durable.listMemories).toHaveBeenCalledOnce()
        expect(ephemeral.listVaultFiles).not.toHaveBeenCalled()
    })

    it('starts and stops both, because both are real', async () => {
        const { routed, durable, ephemeral } = router()

        await routed.initialize()
        await routed.close()

        expect(ephemeral.initialize).toHaveBeenCalledOnce()
        expect(durable.initialize).toHaveBeenCalledOnce()
        expect(ephemeral.close).toHaveBeenCalledOnce()
        expect(durable.close).toHaveBeenCalledOnce()
    })

    /**
     * The rule that makes this safe to maintain. Without it, a method added to
     * the repository interface next year quietly writes a temporary chat to
     * disk, and nobody finds out until someone reads their own history and sees
     * a conversation they were told would not be kept.
     */
    it('refuses a method it has no rule for, instead of guessing the disk', async () => {
        const { routed } = router()

        await expect((routed as never as Record<string, () => Promise<unknown>>)
            .aMethodAddedNextYear()).rejects.toThrow('TALOS_EPHEMERAL_ROUTE_MISSING')
    })
})

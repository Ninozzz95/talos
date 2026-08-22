import { describe, expect, it, vi } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createChatStore as createLocalizedChatStore, type ChatCompletion } from '@/stores/chat'
import { talosTestT } from '../../helpers/talosTestI18n'

/**
 * Owner 2026-07-31, approved: «una chat entra nella cronologia solo quando ha
 * dentro qualcosa».
 *
 * His list had six «Nuova chat» in it, and every one of them was a chat he had
 * opened and not used. That is what ChatGPT and Claude do too — a new
 * conversation is not in the sidebar until you send something — but the reason
 * to do it here is stronger than tidiness. Every empty chat left behind had to
 * be CLEANED UP by whoever left it, and that cleanup is precisely what threw
 * him out of incognito on video: deleting the blank chat made the durable side
 * nominate a replacement.
 *
 * A chat that was never in the history needs no cleaning up. The whole
 * manoeuvre stops existing.
 */
function harness() {
    let tick = 0
    const now = (): string => `2026-07-31T12:00:${String(tick++).padStart(2, '0')}.000Z`
    let sequence = 0
    const makeId = (): string => `local-${++sequence}`
    const repository = createMemoryChatRepository({ now })
    const complete: ChatCompletion = async () => ({ text: 'detto', finishReason: 'stop' })
    const store = createLocalizedChatStore(vi.fn(complete), {
        repository, makeId, now, translate: talosTestT('en'),
    })
    return { store, repository }
}

describe('what the history holds', () => {
    it('does not hold a chat you opened and did not use', async () => {
        const { store } = harness()
        await store.initialize()

        await store.createSession('Nuova chat')

        expect(store.history).toHaveLength(0)
        // …and it is still THERE. The history is a view, not the truth: every
        // lookup that has to find a chat still finds this one.
        expect(store.sessions).toHaveLength(1)
    })

    /** …and you are still IN it. The history is not where you are. */
    it('still puts you in the chat it did not list', async () => {
        const { store } = harness()
        await store.initialize()

        const created = await store.createSession('Nuova chat')

        expect(store.activeSession.value?.id).toBe(created.id)
    })

    it('holds it from the moment there is something in it', async () => {
        const { store } = harness()
        await store.initialize()
        const created = await store.createSession('Nuova chat')

        await store.send('ciao', null)

        expect(store.history.map((session) => session.id)).toEqual([created.id])
    })

    /** Once, not twice — it is inserted when it arrives and bumped after. */
    it('holds it exactly once after a second message', async () => {
        const { store } = harness()
        await store.initialize()
        await store.createSession('Nuova chat')

        await store.send('ciao', null)
        await store.send('ancora', null)

        expect(store.history).toHaveLength(1)
    })

    /**
     * Found by an adversarial review, 2026-07-31, and it was mine.
     *
     * A write-back into the list handed over a session object that carried no
     * `has_messages` at all — the repository only reports it from
     * `listSessions` — and the filter read "not asked" as "show it". So an
     * untouched chat popped into the history the moment its per-chat Library
     * setting was changed, from the menu or by the model's own policy tool.
     * Which is the six-blank-chats symptom the feature exists to remove.
     */
    it('does not re-enter the history when its Library setting is changed', async () => {
        const { store } = harness()
        await store.initialize()
        const empty = await store.createSession('Nuova chat')

        await store.setSessionLibraryContextPolicy(empty.id, { mode: 'off' } as never, 0)

        expect(store.history).toHaveLength(0)
    })

    /**
     * The defining property of an empty chat is now the same as a temporary
     * one's: absent from the list. So the rule that keeps you where you are has
     * to cover both, or every message would move you.
     */
    it('does not lose the chat you are in when the list is refreshed', async () => {
        const { store } = harness()
        await store.initialize()
        await store.createSession('Vecchia')
        await store.send('ciao', null)
        const empty = await store.createSession('Nuova chat')

        // Any ordinary action re-reads the history. Renaming another chat is
        // the smallest one that does, and it must not move you.
        await store.renameSession(store.sessions[0]!.id, 'Rinominata')

        expect(store.activeSession.value?.id).toBe(empty.id)
    })
})

describe('the repository, which decides what history means', () => {
    /**
     * It REPORTS emptiness rather than hiding it. Hiding was the first attempt
     * and it was wrong: `listSessions` is also how the app finds the chat to
     * restore at boot, and how a delete nominates a replacement. Filtering
     * there changed all of them at once, and 29 tests said so.
     */
    it('says a session with no messages has nothing in it', async () => {
        const { repository } = harness()
        await repository.initialize()
        await repository.createSession({
            id: 'empty', title: 'Nuova chat', created_at: '2026-07-31T12:00:00.000Z',
        } as never)

        const listed = await repository.listSessions()

        expect(listed.map((s) => s.id)).toEqual(['empty'])
        expect(listed[0]?.has_messages).toBe(false)
    })

    it('says it has something in it as soon as a message lands', async () => {
        const { repository } = harness()
        await repository.initialize()
        await repository.createSession({
            id: 'used', title: 'Nuova chat', created_at: '2026-07-31T12:00:00.000Z',
        } as never)
        await repository.appendMessage({
            id: 'm1', session_id: 'used', role: 'user', content: 'ciao',
            created_at: '2026-07-31T12:00:01.000Z',
        } as never)

        expect((await repository.listSessions())[0]?.has_messages).toBe(true)
    })
})

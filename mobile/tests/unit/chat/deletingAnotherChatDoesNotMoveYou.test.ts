import { describe, expect, it, vi } from 'vitest'
import { createTalosEphemeralRoutingRepository } from '@/repositories/ephemeralRoutingRepository'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { talosIsEphemeralSessionId } from '@/lib/chat/ephemeralSession'
import { createChatStore as createLocalizedChatStore } from '@/stores/chat'
import { talosTestT } from '../../helpers/talosTestI18n'

/**
 * Owner 2026-07-31, on video: he pressed «Modalità incognito», the incognito
 * chat appeared for a single frame, and the app then threw him back into the
 * conversation he had open before.
 *
 * The cause is one line, and it is not about incognito at all. Deleting a chat
 * makes the durable side nominate a replacement whenever the row IT considered
 * active is the one that went — and while you are in a temporary chat, the
 * durable side still considers the previous one active, because a temporary
 * chat is never written there. The store obeyed that nomination unconditionally
 * and re-pointed the screen at a chat the user had not asked for, along with
 * its messages.
 *
 * The rule this pins is the general one: deleting a chat you are NOT in must
 * not move you. Incognito is simply the case where the two disagree.
 */
function harness() {
    let tick = 0
    const now = (): string => `2026-07-31T09:42:${String(tick++).padStart(2, '0')}.000Z`
    let sequence = 0
    const makeId = (): string => `local-${++sequence}`
    const disk = createMemoryChatRepository({ now })
    const memory = createMemoryChatRepository({ now })
    const repository = createTalosEphemeralRoutingRepository({
        durable: disk, ephemeral: memory, isEphemeral: talosIsEphemeralSessionId,
    })
    const store = createLocalizedChatStore(
        vi.fn().mockResolvedValue({ text: 'unused', finishReason: 'stop' }),
        { repository, makeId, now, translate: talosTestT('en') },
    )
    return { store, repository }
}

describe('deleting a chat you are not in', () => {
    /** The video, step for step. */
    it('leaves you in the incognito chat you just entered', async () => {
        const { store, repository } = harness()
        await store.initialize()

        const kept = await store.createSession('Sei capace di generazione immagini?')
        await repository.appendMessage({
            id: 'm1', session_id: kept.id, role: 'assistant', content: 'ecco la foto',
            created_at: '2026-07-31T09:00:00.000Z',
        } as never)
        const empty = await store.createSession('Nuova chat')

        const incognito = await store.createSession('Modalità incognito', null, { ephemeral: true })
        expect(store.activeSession.value?.id).toBe(incognito.id)

        // What the switch does next: the blank chat it replaced is cleaned up.
        await store.deleteSession(empty.id)

        expect(store.activeSession.value?.id).toBe(incognito.id)
    })

    /**
     * The visible half of the same defect, and the reason it read as "premo e
     * torno indietro": the other chat's messages were loaded onto the screen.
     */
    it('does not pull another conversation onto the screen', async () => {
        const { store, repository } = harness()
        await store.initialize()

        const kept = await store.createSession('Sei capace di generazione immagini?')
        await repository.appendMessage({
            id: 'm1', session_id: kept.id, role: 'assistant', content: 'ecco la foto',
            created_at: '2026-07-31T09:00:00.000Z',
        } as never)
        const empty = await store.createSession('Nuova chat')
        await store.createSession('Modalità incognito', null, { ephemeral: true })

        await store.deleteSession(empty.id)

        expect(store.messages).toHaveLength(0)
    })

    /** An ordinary chat, same rule: deleting a neighbour is not navigation. */
    it('leaves you in an ordinary chat too', async () => {
        const { store } = harness()
        await store.initialize()

        const other = await store.createSession('Altra')
        const here = await store.createSession('Questa')
        expect(store.activeSession.value?.id).toBe(here.id)

        await store.deleteSession(other.id)

        expect(store.activeSession.value?.id).toBe(here.id)
    })

    /**
     * And the case that must keep working: deleting the chat you ARE in has to
     * take you somewhere, because staying is not an option.
     */
    it('still moves you when the chat deleted is the one on screen', async () => {
        const { store } = harness()
        await store.initialize()

        const other = await store.createSession('Altra')
        const here = await store.createSession('Questa')

        await store.deleteSession(here.id)

        expect(store.activeSession.value?.id).toBe(other.id)
        expect(store.sessions.map((session) => session.id)).not.toContain(here.id)
    })
})

/**
 * Where a delete LANDS you — both found by an adversarial review, 2026-07-31.
 *
 * The repository nominates the most recently updated survivor, which is the
 * right answer only while every chat is visible. Since a chat enters the
 * history when it has something in it, the nominee can be a chat the history
 * cannot show: the header names a conversation that appears in no list and
 * cannot be selected, deleted or archived.
 *
 * And deleting the incognito chat you are IN nominated through the memory side
 * while the lookup read the durable list, so the answer was always "nowhere" —
 * an empty screen, with the stored active chat still pointing somewhere else.
 */
describe('where a delete puts you', () => {
    it('does not land you in a chat the history cannot show', async () => {
        const { store } = harness()
        await store.initialize()
        const kept = await store.createSession('Vecchia')
        await store.send('ciao', null)
        const doomed = await store.createSession('Da cancellare')
        await store.send('anche qui', null)
        // Opened, never used — the most recent row, so the natural nominee.
        await store.createSession('Nuova chat')
        await store.selectSession(doomed.id)

        await store.deleteSession(doomed.id)

        expect(store.activeSession.value?.id).toBe(kept.id)
        expect(store.history.map((session) => session.id)).toContain(kept.id)
    })

    it('leaves you somewhere real after deleting the incognito chat you are in', async () => {
        const { store } = harness()
        await store.initialize()
        const kept = await store.createSession('Vecchia')
        await store.send('ciao', null)
        const incognito = await store.createSession('Incognito', null, { ephemeral: true })

        await store.deleteSession(incognito.id)

        expect(store.activeSession.value?.id).toBe(kept.id)
    })
})

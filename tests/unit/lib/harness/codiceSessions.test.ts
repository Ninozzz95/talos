import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import type { TalosChatRepository } from '@/repositories/chatRepository'

// The real singleton wraps a lazy SQLite connection (native, unavailable
// under Vitest) — swapped for the SAME in-memory repository the app itself
// uses for ephemeral/temporary chats: a full real implementation of the
// interface, not a hand-rolled partial mock.
const repo = vi.hoisted(() => ({ current: null as TalosChatRepository | null }))
vi.mock('@/repositories/productionChatRepositorySingleton', () => ({
    get productionChatRepository() { return repo.current },
}))

import { createCodiceSession, findCodiceSession, listCodiceSessions } from '@/lib/harness/codiceSessions'

beforeEach(() => {
    repo.current = createMemoryChatRepository()
})

describe('codiceSessions (28/8) — real, local-first sessions, tagged not stored separately', () => {
    it('createCodiceSession tags the row metadata.codice=true, derived title trimmed and collapsed', async () => {
        const created = await createCodiceSession('  fix   the   thing  ')
        expect(created.title).toBe('fix the thing')
        expect(created.metadata.codice).toBe(true)
    })

    it('listCodiceSessions returns only codice-tagged rows, never a plain chat session', async () => {
        await repo.current?.createSession({
            id: 'plain-chat', title: 'A real chat', active_model_profile_id: null, created_at: new Date().toISOString(),
        })
        const codeSession = await createCodiceSession('a code task')

        const list = await listCodiceSessions()

        expect(list.map((s) => s.id)).toEqual([codeSession.id])
        expect(list.map((s) => s.id)).not.toContain('plain-chat')
    })

    it('listCodiceSessions orders most-recently-updated first', async () => {
        // Explicit, distinct timestamps rather than two back-to-back
        // `createCodiceSession` calls: this tests `listCodiceSessions`'s OWN
        // sort, decoupled from whether two real-clock calls in the same
        // synchronous test tick happen to land in different milliseconds.
        await repo.current?.createSession({
            id: 'older', title: 'older task', active_model_profile_id: null,
            created_at: '2026-01-01T00:00:00.000Z', metadata: { codice: true },
        })
        await repo.current?.createSession({
            id: 'newer', title: 'newer task', active_model_profile_id: null,
            created_at: '2026-01-02T00:00:00.000Z', metadata: { codice: true },
        })

        const list = await listCodiceSessions()
        expect(list.map((session: { id: string }) => session.id)).toEqual(['newer', 'older'])
    })

    it('findCodiceSession resolves an id from the codice-tagged set', async () => {
        const created = await createCodiceSession('find me')
        expect((await findCodiceSession(created.id))?.id).toBe(created.id)
    })

    it('findCodiceSession — verso contrario: an unknown id, an empty id, and a REAL plain-chat id all resolve to null', async () => {
        const plainChat = await repo.current?.createSession({
            id: 'a-real-chat-not-code', title: 'Just a chat', active_model_profile_id: null, created_at: new Date().toISOString(),
        })
        expect(await findCodiceSession('not-a-real-id')).toBeNull()
        expect(await findCodiceSession('')).toBeNull()
        expect(await findCodiceSession(plainChat?.id ?? '')).toBeNull()
    })
})

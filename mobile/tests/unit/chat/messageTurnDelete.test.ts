import { describe, expect, it } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createSqliteChatRepository } from '@/repositories/sqliteChatRepository'
import { TALOS_CHAT_DATABASE_UPGRADES } from '@/persistence/chatDatabaseSchema'
import type { TalosChatRepository } from '@/repositories/chatRepository'
import { createSqlJsConnection } from '../repositories/sqlJsConnection'

/**
 * Owner 2026-09-13 — «Elimina» toglie la COPPIA domanda-risposta, e cio' che il
 * giro ha creato resta. Stesso banco di messageEdit.test.ts, sui due motori: un
 * comportamento che vale solo in memoria e' un comportamento che i test vedono e
 * il telefono no.
 */
const now = '2026-09-13T20:00:00.000Z'
async function seed(repo: TalosChatRepository, id = 's1', count = 6) {
    await repo.initialize()
    await repo.createSession({ id, title: id, active_model_profile_id: null, created_at: now })
    for (let i = 0; i < count; i++) await repo.appendMessage({
        id: id + '-m' + i, session_id: id, role: i % 2 ? 'assistant' : 'user',
        content: 'testo ' + i, state: 'persisted', created_at: now, metadata: {},
    })
}
async function sqlite() {
    const connection = await createSqlJsConnection()
    for (const upgrade of TALOS_CHAT_DATABASE_UPGRADES) for (const statement of upgrade.statements) await connection.execute(statement)
    return createSqliteChatRepository({ platform: 'web', connect: async () => connection, persist: async () => {}, close: async () => connection.close() })
}
const ids = async (repo: TalosChatRepository, id = 's1') => (await repo.listMessages(id)).map(m => m.id)

describe.each(['memoria', 'sqlite'] as const)('Elimina della coppia (%s)', engine => {
    async function repository() { return engine === 'memoria' ? createMemoryChatRepository() : await sqlite() }

    it('premuto sulla RISPOSTA, toglie anche la domanda che la precede', async () => {
        const repo = await repository()
        try {
            await seed(repo)
            expect(await repo.deleteMessageTurn('s1', 's1-m3')).toEqual(['s1-m2', 's1-m3'])
            expect(await ids(repo)).toEqual(['s1-m0', 's1-m1', 's1-m4', 's1-m5'])
        } finally { await repo.close() }
    })

    it('premuto sulla DOMANDA, toglie la risposta che la segue e si ferma alla domanda dopo', async () => {
        const repo = await repository()
        try {
            await seed(repo)
            expect(await repo.deleteMessageTurn('s1', 's1-m2')).toEqual(['s1-m2', 's1-m3'])
            expect(await ids(repo)).toEqual(['s1-m0', 's1-m1', 's1-m4', 's1-m5'])
        } finally { await repo.close() }
    })

    it("l'ultima coppia si toglie fino in fondo", async () => {
        const repo = await repository()
        try {
            await seed(repo)
            expect(await repo.deleteMessageTurn('s1', 's1-m5')).toEqual(['s1-m4', 's1-m5'])
            expect(await ids(repo)).toEqual(['s1-m0', 's1-m1', 's1-m2', 's1-m3'])
        } finally { await repo.close() }
    })

    /** ⛔ Il verso contrario: le altre coppie e le altre chat restano intatte. */
    it("non tocca le altre coppie ne' un'altra chat", async () => {
        const repo = await repository()
        try {
            await seed(repo)
            await seed(repo, 's2')
            await repo.deleteMessageTurn('s1', 's1-m1')
            expect(await ids(repo)).toEqual(['s1-m2', 's1-m3', 's1-m4', 's1-m5'])
            expect(await ids(repo, 's2')).toHaveLength(6)
        } finally { await repo.close() }
    })

    it("porta via le attivita' della coppia tolta e lascia quelle delle altre", async () => {
        const repo = await repository()
        try {
            await seed(repo)
            await repo.appendToolActivity({ id: 'via', session_id: 's1', message_id: 's1-m3', operation: 'test', status: 'succeeded', payload: {}, evidence: {}, created_at: now })
            await repo.appendToolActivity({ id: 'resta', session_id: 's1', message_id: 's1-m1', operation: 'test', status: 'succeeded', payload: {}, evidence: {}, created_at: now })
            await repo.deleteMessageTurn('s1', 's1-m3')
            expect((await repo.listSessionToolActivities('s1')).map(a => a.id)).toEqual(['resta'])
        } finally { await repo.close() }
    })

    /** ⛔ Una guardia che non riesce a valutare deve NEGARE: un id sconosciuto lancia e non tocca niente. */
    it('rifiuta un messaggio che non esiste senza alterare i dati', async () => {
        const repo = await repository()
        try {
            await seed(repo)
            const before = await ids(repo)
            await expect(repo.deleteMessageTurn('s1', 'non-esiste')).rejects.toThrow('TALOS_CHAT_MESSAGE_NOT_FOUND')
            expect(await ids(repo)).toEqual(before)
        } finally { await repo.close() }
    })
})

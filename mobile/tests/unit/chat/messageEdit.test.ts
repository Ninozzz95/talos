import { describe, expect, it, vi } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createSqliteChatRepository } from '@/repositories/sqliteChatRepository'
import { createLazyChatRepository } from '@/repositories/lazyChatRepository'
import { createTalosEphemeralRoutingRepository } from '@/repositories/ephemeralRoutingRepository'
import { TALOS_CHAT_DATABASE_UPGRADES } from '@/persistence/chatDatabaseSchema'
import type { TalosChatRepository } from '@/repositories/chatRepository'
import { createSqlJsConnection } from '../repositories/sqlJsConnection'
import { createChatStore } from '@/stores/chat'
import { createTalosMobileComposerDraftController } from '@/composables/useTalosMobileComposerDraft'
import { talosTestT } from '../../helpers/talosTestI18n'

const now = '2026-09-12T16:00:00.000Z'
async function seed(repo: TalosChatRepository, id = 's1', count = 4) {
    await repo.initialize()
    await repo.createSession({ id, title: id, active_model_profile_id: null, created_at: now })
    for (let i = 0; i < count; i++) await repo.appendMessage({
        id: `${id}-m${i}`, session_id: id, role: i % 2 ? 'assistant' : 'user',
        content: `testo ${i}`, state: 'persisted', created_at: now, metadata: { original: i },
    })
}

async function sqlite() {
    const connection = await createSqlJsConnection()
    for (const upgrade of TALOS_CHAT_DATABASE_UPGRADES) for (const statement of upgrade.statements) await connection.execute(statement)
    return { connection, repo: createSqliteChatRepository({ platform: 'web', connect: async () => connection, persist: async () => {}, close: async () => connection.close() }) }
}

describe.each(['memoria', 'sqlite'] as const)('Modifica atomica (%s)', engine => {
    async function repository() { return engine === 'memoria' ? createMemoryChatRepository() : (await sqlite()).repo }
    it('rimuove dal messaggio scelto, preserva prima/altra chat e riapre la bozza anche dopo ricaricamento', async () => {
        const repo = await repository()
        try {
            await seed(repo)
            const before = await repo.listMessages('s1')
            await seed(repo, 's2')
            await repo.appendToolActivity({ id: 'tool-after', session_id: 's1', message_id: 's1-m3', operation: 'test', status: 'succeeded', payload: {}, evidence: {}, created_at: now })
            await repo.saveComposerDraft('s1', 'vecchia bozza')
            expect(await repo.rewindUserMessage('s1', 's1-m2', 's1-m3')).toBe('testo 2')
            expect(await repo.listMessages('s1')).toEqual(before.slice(0, 2))
            expect(await repo.listMessages('s2')).toHaveLength(4)
            expect(await repo.listSessionToolActivities('s1')).toEqual([])
            expect(await repo.loadComposerDraft('s1')).toBe('testo 2')
            await repo.selectSession('s1')
            expect(await repo.loadComposerDraft('s1')).toBe('testo 2')
        } finally { await repo.close() }
    })
    it('rifiuta assistente, altra sessione e coda cambiata senza alterare dati o bozza', async () => {
        const repo = await repository()
        try {
            await seed(repo)
            const before = await repo.listMessages('s1')
            await repo.saveComposerDraft('s1', 'intatta')
            await expect(repo.rewindUserMessage('s1', 's1-m1', 's1-m3')).rejects.toThrow()
            await expect(repo.rewindUserMessage('s1', 'altro-id', 's1-m3')).rejects.toThrow()
            await expect(repo.rewindUserMessage('s1', 's1-m2', 'vecchia-coda')).rejects.toThrow('TALOS_CHAT_EDIT_STALE')
            expect(await repo.listMessages('s1')).toEqual(before)
            expect(await repo.loadComposerDraft('s1')).toBe('intatta')
        } finally { await repo.close() }
    })
})

it('SQLite annulla anche il salvataggio bozza se la cancellazione fallisce', async () => {
    const { repo, connection } = await sqlite()
    try {
        await seed(repo)
        await repo.saveComposerDraft('s1', 'intatta')
        const run = connection.run.bind(connection)
        vi.spyOn(connection, 'run').mockImplementation(async (sql, args) => {
            if (sql.startsWith('DELETE FROM talos_chat_messages')) throw new Error('disco non disponibile')
            return run(sql, args)
        })
        await expect(repo.rewindUserMessage('s1', 's1-m2', 's1-m3')).rejects.toThrow()
        expect(await repo.loadComposerDraft('s1')).toBe('intatta')
        expect(await repo.listMessages('s1')).toHaveLength(4)
    } finally { await repo.close() }
})

it('il controller della bozza già montato riceve quel testo; nessun invio automatico, cronologia integra al reinvio', async () => {
    const repository = createMemoryChatRepository()
    await seed(repository)
    const complete = vi.fn(async () => ({ text: 'nuova risposta' }))
    const chat = createChatStore(complete, { repository, translate: talosTestT('it') })
    await chat.initialize()
    const draft = createTalosMobileComposerDraftController({ load: id => chat.loadComposerDraft(id), save: (id, text) => chat.saveComposerDraft(text, id), translate: talosTestT('it') })
    await draft.activateScope('s1')
    draft.updatePrompt('bozza precedente in attesa di debounce')
    await chat.editUserMessage('s1', 's1-m2', 's1-m3')
    expect(draft.prompt.value).toBe('testo 2')
    expect(chat.messages.map(m => m.id)).toEqual(['s1-m0', 's1-m1'])
    expect(complete).not.toHaveBeenCalled()
    await draft.flush()
    expect(await repository.loadComposerDraft('s1')).toBe('testo 2')
    expect(await chat.send('testo modificato')).toBe(true)
    expect(chat.messages.map(m => m.content)).toEqual(['testo 0', 'testo 1', 'testo modificato', 'nuova risposta'])
    await draft.dispose()
})

it('la paginazione conserva anche i turni precedenti non caricati', async () => {
    const repository = createMemoryChatRepository()
    await seed(repository, 's1', 126)
    const chat = createChatStore(vi.fn(), { repository, translate: talosTestT('it') })
    await chat.initialize()
    expect(chat.state.hasOlderMessages).toBe(true)
    await chat.editUserMessage('s1', 's1-m120', 's1-m125')
    expect(await repository.listMessages('s1')).toHaveLength(120)
    while (chat.state.hasOlderMessages) await chat.loadOlderMessages()
    expect(chat.messages).toHaveLength(120)
    expect(chat.messages[0]?.id).toBe('s1-m0')
})

it('la rotta temporanea conserva taglio e bozza in RAM; il proxy pigro inoltra la primitiva', async () => {
    const durable = createMemoryChatRepository()
    const ephemeral = createMemoryChatRepository()
    const routed = createTalosEphemeralRoutingRepository({ durable, ephemeral, isEphemeral: id => id === 'temp' })
    await seed(routed, 'temp')
    await routed.rewindUserMessage('temp', 'temp-m2', 'temp-m3')
    expect(await routed.loadComposerDraft('temp')).toBe('testo 2')
    expect(await durable.loadComposerDraft('temp')).toBe('')
    const lazy = createLazyChatRepository(async () => routed)
    await lazy.rewindUserMessage('temp', 'temp-m0', 'temp-m1')
    expect(await routed.listMessages('temp')).toHaveLength(0)
})

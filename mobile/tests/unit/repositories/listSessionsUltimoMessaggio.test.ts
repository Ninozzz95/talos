import { describe, expect, it } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createSqliteChatRepository } from '@/repositories/sqliteChatRepository'
import { TALOS_CHAT_DATABASE_UPGRADES } from '@/persistence/chatDatabaseSchema'
import type { AppendChatMessageInput, TalosChatRepository } from '@/repositories/chatRepository'
import type { TalosSqlConnection, TalosSqliteRuntime } from '@/persistence/sqliteTypes'
import { createSqlJsConnection } from './sqlJsConnection'

/**
 * ⭐ B3 / F4-B — l'elenco delle chat porta l'ULTIMO messaggio di ogni chat.
 *
 * Serve a `statoChat` (`lib/chat/statoChat.ts`) per dire «fallita» o
 * «interrotta» nella riga, dai fatti che il telefono ha già sul disco
 * (ricognizione B3, sezione D). Il riassunto è minimo: ruolo, stato, se la
 * risposta è stata interrotta e il modello che l'ha scritta — mai il testo.
 *
 * ⛔ Una sola query per tutto l'elenco: una chiamata per sessione (N+1) su
 * cento chat sono cento viaggi sul ponte nativo a ogni apertura dell'elenco.
 */

async function sqliteConnessa(): Promise<{ repository: TalosChatRepository, conta: () => number, connection: TalosSqlConnection }> {
    const connection = await createSqlJsConnection()
    for (const upgrade of TALOS_CHAT_DATABASE_UPGRADES) {
        for (const statement of upgrade.statements) await connection.execute(statement)
    }
    let interrogazioni = 0
    // Si contano le letture che passano dal ponte: la stessa porta che sul
    // telefono attraversa Capacitor.
    const contata: TalosSqlConnection = {
        ...connection,
        query: async (statement, values) => {
            interrogazioni += 1
            return connection.query(statement, values)
        },
    }
    const runtime: TalosSqliteRuntime = {
        platform: 'web',
        connect: async () => contata,
        persist: async () => undefined,
        close: async () => undefined,
    }
    const repository = createSqliteChatRepository(runtime)
    await repository.initialize()
    return { repository, conta: () => interrogazioni, connection }
}

async function memoria(): Promise<{ repository: TalosChatRepository }> {
    const repository = createMemoryChatRepository()
    await repository.initialize()
    return { repository }
}

const IMPLEMENTAZIONI: ReadonlyArray<readonly [string, () => Promise<{ repository: TalosChatRepository }>]> = [
    ['sqlite', sqliteConnessa],
    ['memoria', memoria],
]

let progressivo = 0
function messaggio(sessionId: string, parti: Partial<AppendChatMessageInput> & Pick<AppendChatMessageInput, 'role'>): AppendChatMessageInput {
    progressivo += 1
    return {
        id: `m-${sessionId}-${progressivo}`,
        session_id: sessionId,
        content: `testo ${progressivo}`,
        state: 'persisted',
        created_at: `2026-09-24T10:00:${String(progressivo % 60).padStart(2, '0')}.000Z`,
        ...parti,
    }
}

async function nuovaSessione(repository: TalosChatRepository, id: string, alle = '2026-09-24T09:00:00.000Z') {
    return repository.createSession({ id, title: id, active_model_profile_id: null, created_at: alle })
}

function perId<T extends { id: string }>(elenco: readonly T[]): Record<string, T> {
    return Object.fromEntries(elenco.map((voce) => [voce.id, voce]))
}

describe.each(IMPLEMENTAZIONI)('listSessions con l\'ultimo messaggio (%s)', (_nome, crea) => {
    it('LAST-MSG-01 una chat senza messaggi dice null, non un messaggio inventato', async () => {
        const { repository } = await crea()
        await nuovaSessione(repository, 'vuota')

        const [sessione] = await repository.listSessions()
        expect(sessione!.last_message).toBeNull()
    })

    it('LAST-MSG-02 utente senza risposta: l\'ultimo è il messaggio dell\'utente', async () => {
        const { repository } = await crea()
        await nuovaSessione(repository, 'orfana')
        await repository.appendMessage(messaggio('orfana', { role: 'user' }))

        const [sessione] = await repository.listSessions()
        expect(sessione!.last_message).toEqual({ role: 'user', state: 'persisted', interrupted: false, model_profile_id: null, created_at: expect.any(String) })
    })

    it('LAST-MSG-03 risposta interrotta: porta interrupted e il modello che la scriveva', async () => {
        const { repository } = await crea()
        await nuovaSessione(repository, 'fermata')
        await repository.appendMessage(messaggio('fermata', { role: 'user' }))
        await repository.appendMessage(messaggio('fermata', {
            role: 'assistant', model_profile_id: 'glm-5.3-flash', metadata: { interrupted: true, reasoning: 'x' },
        }))

        const [sessione] = await repository.listSessions()
        expect(sessione!.last_message).toEqual({
            role: 'assistant', state: 'persisted', interrupted: true, model_profile_id: 'glm-5.3-flash', created_at: expect.any(String),
        })
    })

    it('LAST-MSG-04 riquadro d\'errore: system in stato failed', async () => {
        const { repository } = await crea()
        await nuovaSessione(repository, 'rotta')
        await repository.appendMessage(messaggio('rotta', { role: 'user' }))
        await repository.appendMessage(messaggio('rotta', { role: 'system', state: 'failed', model_profile_id: 'm' }))

        const [sessione] = await repository.listSessions()
        expect(sessione!.last_message).toEqual({ role: 'system', state: 'failed', interrupted: false, model_profile_id: 'm', created_at: expect.any(String) })
    })

    it('LAST-MSG-05 l\'ULTIMO per posizione, non il primo, e ogni chat il suo', async () => {
        const { repository } = await crea()
        await nuovaSessione(repository, 'a', '2026-09-24T09:00:00.000Z')
        await nuovaSessione(repository, 'b', '2026-09-24T09:00:01.000Z')
        // «a»: un errore vecchio, poi una risposta buona — la chat è guarita.
        await repository.appendMessage(messaggio('a', { role: 'user' }))
        await repository.appendMessage(messaggio('a', { role: 'system', state: 'failed' }))
        await repository.appendMessage(messaggio('a', { role: 'user' }))
        await repository.appendMessage(messaggio('a', { role: 'assistant', model_profile_id: 'buono' }))
        // «b»: una risposta buona, poi una domanda rimasta senza risposta.
        await repository.appendMessage(messaggio('b', { role: 'user' }))
        await repository.appendMessage(messaggio('b', { role: 'assistant' }))
        await repository.appendMessage(messaggio('b', { role: 'user' }))

        const sessioni = perId(await repository.listSessions())
        expect(sessioni.a!.last_message).toEqual({ role: 'assistant', state: 'persisted', interrupted: false, model_profile_id: 'buono', created_at: expect.any(String) })
        expect(sessioni.b!.last_message?.role).toBe('user')
    })

    // A3-84 seconda parte (owner 25/09 10:20, «nuova risposta finché non la apri»): l'ora dell'ultimo messaggio, per
    // sapere se una risposta è arrivata DOPO l'ultima volta che hai aperto la chat. `updated_at` della sessione non
    // basta: cambia anche con una rinomina, e la rinomina non è una risposta.
    it("LAST-MSG-10 porta l'ora dell'ultimo messaggio, quella scritta sul messaggio", async () => {
        const { repository } = await crea()
        await nuovaSessione(repository, 'orario')
        await repository.appendMessage(messaggio('orario', { role: 'user', created_at: '2026-09-25T08:00:00.000Z' }))
        await repository.appendMessage(messaggio('orario', { role: 'assistant', created_at: '2026-09-25T08:00:07.000Z' }))

        const [sessione] = await repository.listSessions()
        expect(sessione!.last_message?.created_at).toBe('2026-09-25T08:00:07.000Z')
    })

    it('LAST-MSG-06 interrupted è vero SOLO per il vero booleano (un "true" scritto male non conta)', async () => {
        const { repository } = await crea()
        await nuovaSessione(repository, 'strana')
        await repository.appendMessage(messaggio('strana', { role: 'assistant', metadata: { interrupted: 'true' } }))

        const [sessione] = await repository.listSessions()
        expect(sessione!.last_message?.interrupted).toBe(false)
    })

    it('LAST-MSG-10 un «interrupted» ANNIDATO (es. dentro un attrezzo) non rende interrotta la risposta', async () => {
        const { repository } = await crea()
        await nuovaSessione(repository, 'annidata')
        await repository.appendMessage(messaggio('annidata', {
            role: 'assistant', metadata: { tool_calls: [{ name: 'web', interrupted: true }] },
        }))

        const [sessione] = await repository.listSessions()
        expect(sessione!.last_message?.interrupted).toBe(false)
    })

    it('LAST-MSG-07 i campi di prima restano: has_messages e has_draft come sempre', async () => {
        const { repository } = await crea()
        await nuovaSessione(repository, 'piena')
        await repository.appendMessage(messaggio('piena', { role: 'user' }))

        const [sessione] = await repository.listSessions()
        expect(sessione!.has_messages).toBe(true)
        expect(sessione!.has_draft).toBe(false)
    })
})

describe('listSessions con l\'ultimo messaggio (solo sqlite)', () => {
    it('LAST-MSG-08 UNA sola query per tutto l\'elenco, qualunque sia il numero di chat', async () => {
        const { repository, conta } = await sqliteConnessa()
        for (const id of ['uno', 'due', 'tre', 'quattro', 'cinque']) {
            await nuovaSessione(repository, id)
            await repository.appendMessage(messaggio(id, { role: 'user' }))
            await repository.appendMessage(messaggio(id, { role: 'assistant' }))
        }

        const prima = conta()
        const sessioni = await repository.listSessions()
        expect(sessioni).toHaveLength(5)
        expect(sessioni.every((sessione) => sessione.last_message?.role === 'assistant')).toBe(true)
        expect(conta() - prima).toBe(1)
    })

    it('LAST-MSG-09 metadati illeggibili sul disco: la riga resta, interrupted è falso', async () => {
        const { repository, connection } = await sqliteConnessa()
        await nuovaSessione(repository, 'corrotta')
        await repository.appendMessage(messaggio('corrotta', { role: 'assistant', id: 'rotto' }))
        await connection.run(`UPDATE talos_chat_messages SET metadata_json = '{non json' WHERE id = 'rotto'`)

        const [sessione] = await repository.listSessions()
        expect(sessione!.id).toBe('corrotta')
        expect(sessione!.last_message).toEqual({ role: 'assistant', state: 'persisted', interrupted: false, model_profile_id: null, created_at: expect.any(String) })
    })
})

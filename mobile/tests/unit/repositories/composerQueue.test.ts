import { describe, expect, it } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createSqliteChatRepository } from '@/repositories/sqliteChatRepository'
import { createLazyChatRepository } from '@/repositories/lazyChatRepository'
import { createTalosEphemeralRoutingRepository } from '@/repositories/ephemeralRoutingRepository'
import { talosIsEphemeralSessionId } from '@/lib/chat/ephemeralSession'
import { TALOS_CHAT_DATABASE_UPGRADES } from '@/persistence/chatDatabaseSchema'
import type { TalosChatRepository } from '@/repositories/chatRepository'
import type { TalosSqliteRuntime } from '@/persistence/sqliteTypes'
import { createSqlJsConnection } from './sqlJsConnection'

/**
 * B3 / F2 — la coda dei messaggi di ogni chat, salvata accanto alla bozza.
 *
 * Il repository la tratta come JSON OPACO: la forma la valida `codaDelGiro.ts`
 * (`normalizzaStatoCoda`), qui si salva e si rilegge senza interpretare. Le sole
 * due cose che il repository sa sono quelle che valgono per la bozza: un valore
 * vuoto non si salva (cancella la riga) e un valore illeggibile non fa cadere
 * l'app (torna `null`, e la coda riparte vuota).
 *
 * Si esercita il repository VERO (SQLite su sql.js, lo stesso motore dei test del
 * contratto) e il doppio in memoria, che è anche il lato delle chat temporanee.
 */

async function sqliteConnessa() {
    const connection = await createSqlJsConnection()
    for (const upgrade of TALOS_CHAT_DATABASE_UPGRADES) {
        for (const statement of upgrade.statements) await connection.execute(statement)
    }
    const runtime: TalosSqliteRuntime = {
        platform: 'web',
        connect: async () => connection,
        persist: async () => undefined,
        close: async () => undefined,
    }
    const repository = createSqliteChatRepository(runtime)
    await repository.initialize()
    return { repository, connection }
}

async function memoria() {
    const repository = createMemoryChatRepository()
    await repository.initialize()
    return { repository }
}

const IMPLEMENTAZIONI: ReadonlyArray<readonly [string, () => Promise<{ repository: TalosChatRepository }>]> = [
    ['sqlite', sqliteConnessa],
    ['memoria', memoria],
]

async function nuovaSessione(repository: TalosChatRepository, id: string) {
    return repository.createSession({ id, title: id, active_model_profile_id: null, created_at: '2026-09-24T10:00:00.000Z' })
}

const CODA = {
    voci: [
        { id: 'q-1', testo: 'Poi guarda anche il README', creataAlle: '2026-09-24T10:00:01.000Z' },
        { id: 'q-2', testo: 'E riassumi in tre righe', creataAlle: '2026-09-24T10:00:02.000Z' },
    ],
    inPausa: true,
}

describe.each(IMPLEMENTAZIONI)('coda del compositore (%s)', (_nome, crea) => {
    it('QUEUE-REPO-01 salva e rilegge la coda com\'era, e senza nulla salvato risponde null', async () => {
        const { repository } = await crea()
        await nuovaSessione(repository, 'session-a')

        expect(await repository.loadComposerQueue('session-a')).toBeNull()
        await repository.saveComposerQueue('session-a', CODA)
        expect(await repository.loadComposerQueue('session-a')).toEqual(CODA)

        // Anche l'ambito «new» (chat non ancora creata), come la bozza.
        await repository.saveComposerQueue('new', CODA)
        expect(await repository.loadComposerQueue('new')).toEqual(CODA)
    })

    it('QUEUE-REPO-02 la coda sparisce con la sessione cancellata', async () => {
        const { repository } = await crea()
        await nuovaSessione(repository, 'session-a')
        await nuovaSessione(repository, 'session-b')
        await repository.saveComposerQueue('session-a', CODA)

        await repository.deleteSession('session-a')

        expect(await repository.loadComposerQueue('session-a')).toBeNull()
    })

    it('QUEUE-REPO-04 salvare una coda senza voci (o null) cancella la riga invece di salvarla vuota', async () => {
        const { repository } = await crea()
        await nuovaSessione(repository, 'session-a')

        await repository.saveComposerQueue('session-a', CODA)
        await repository.saveComposerQueue('session-a', { voci: [], inPausa: false })
        expect(await repository.loadComposerQueue('session-a')).toBeNull()

        await repository.saveComposerQueue('session-a', CODA)
        await repository.saveComposerQueue('session-a', null)
        expect(await repository.loadComposerQueue('session-a')).toBeNull()
    })

    it('QUEUE-REPO-05 due sessioni non si mescolano', async () => {
        const { repository } = await crea()
        await nuovaSessione(repository, 'session-a')
        await nuovaSessione(repository, 'session-b')
        const altra = { voci: [{ id: 'q-9', testo: 'solo per b', creataAlle: '2026-09-24T10:00:03.000Z' }], inPausa: false }

        await repository.saveComposerQueue('session-a', CODA)
        await repository.saveComposerQueue('session-b', altra)
        await repository.saveComposerQueue('session-a', null)

        expect(await repository.loadComposerQueue('session-a')).toBeNull()
        expect(await repository.loadComposerQueue('session-b')).toEqual(altra)
    })

    it('QUEUE-REPO-07 il valore riletto è una copia: cambiarlo non cambia quello salvato', async () => {
        const { repository } = await crea()
        await nuovaSessione(repository, 'session-a')
        await repository.saveComposerQueue('session-a', CODA)

        const letta = await repository.loadComposerQueue('session-a') as { voci: unknown[] }
        letta.voci.length = 0

        expect(await repository.loadComposerQueue('session-a')).toEqual(CODA)
    })

    it('QUEUE-REPO-11 l\'elenco restituisce tutte le code salvate, in una lettura sola', async () => {
        const { repository } = await crea()
        await nuovaSessione(repository, 'session-a')
        await nuovaSessione(repository, 'session-b')
        await nuovaSessione(repository, 'session-c')
        const altra = { voci: [{ id: 'q-9', testo: 'solo per b', creataAlle: '2026-09-24T10:00:03.000Z' }], inPausa: false }

        expect(await repository.listComposerQueues()).toEqual([])
        await repository.saveComposerQueue('session-b', altra)
        await repository.saveComposerQueue('session-a', CODA)
        // Una bozza di testo NON è una coda: non entra nell'elenco.
        await repository.saveComposerDraft('session-c', 'solo bozza')

        expect(await repository.listComposerQueues()).toEqual([
            { scopeId: 'session-a', value: CODA },
            { scopeId: 'session-b', value: altra },
        ])
    })

    it('QUEUE-REPO-12 al contrario: una coda svuotata o di una sessione cancellata non compare più', async () => {
        const { repository } = await crea()
        await nuovaSessione(repository, 'session-a')
        await nuovaSessione(repository, 'session-b')
        await nuovaSessione(repository, 'session-c')
        await repository.saveComposerQueue('session-a', CODA)
        await repository.saveComposerQueue('session-b', CODA)
        await repository.saveComposerQueue('session-c', CODA)

        await repository.saveComposerQueue('session-a', { voci: [], inPausa: true })
        await repository.deleteSession('session-b')

        expect(await repository.listComposerQueues()).toEqual([{ scopeId: 'session-c', value: CODA }])
    })

    it('QUEUE-REPO-08 un ambito non valido è rifiutato come per la bozza', async () => {
        const { repository } = await crea()
        await expect(repository.saveComposerQueue('', CODA)).rejects.toThrow('TALOS_COMPOSER_DRAFT_SCOPE_INVALID')
        await expect(repository.loadComposerQueue('a b')).rejects.toThrow('TALOS_COMPOSER_DRAFT_SCOPE_INVALID')
    })
})

describe('coda del compositore sul disco vero', () => {
    it('QUEUE-REPO-03 un JSON corrotto nella tabella torna null, mai un\'eccezione', async () => {
        const { repository, connection } = await sqliteConnessa()
        try {
            await nuovaSessione(repository, 'session-a')
            await connection.run(
                'INSERT INTO talos_chat_state (key, value_json, updated_at) VALUES (?, ?, ?)',
                ['composer_queue:session-a', '{"voci": [ troncato', '2026-09-24T10:00:00.000Z'],
            )

            await expect(repository.loadComposerQueue('session-a')).resolves.toBeNull()
        } finally {
            connection.close()
        }
    })

    it('QUEUE-REPO-13 l\'elenco scarta in silenzio le righe illeggibili e tiene le buone', async () => {
        const { repository, connection } = await sqliteConnessa()
        try {
            await nuovaSessione(repository, 'session-a')
            await nuovaSessione(repository, 'session-b')
            await repository.saveComposerQueue('session-b', CODA)
            await connection.run(
                'INSERT INTO talos_chat_state (key, value_json, updated_at) VALUES (?, ?, ?)',
                ['composer_queue:session-a', '{"voci": [ troncato', '2026-09-24T10:00:00.000Z'],
            )
            // Un `null` scritto da fuori è «nessuna coda», non una voce dell'elenco.
            await connection.run(
                'INSERT INTO talos_chat_state (key, value_json, updated_at) VALUES (?, ?, ?)',
                ['composer_queue:new', 'null', '2026-09-24T10:00:00.000Z'],
            )

            await expect(repository.listComposerQueues()).resolves.toEqual([{ scopeId: 'session-b', value: CODA }])
        } finally {
            connection.close()
        }
    })

    it('QUEUE-REPO-09 la riga sta sotto la chiave composer_queue:<scopeId>, accanto alla bozza', async () => {
        const { repository, connection } = await sqliteConnessa()
        try {
            await nuovaSessione(repository, 'session-a')
            await repository.saveComposerQueue('session-a', CODA)

            const rows = await connection.query(
                "SELECT key, value_json FROM talos_chat_state WHERE key LIKE 'composer_queue:%'",
            )
            expect(rows).toEqual([{ key: 'composer_queue:session-a', value_json: JSON.stringify(CODA) }])
        } finally {
            connection.close()
        }
    })
})

describe('coda del compositore e chat temporanea', () => {
    /**
     * Comportamento reale della bozza, verificato qui e non supposto: nel router
     * `loadComposerDraft`/`saveComposerDraft` sono `'session-arg'`, quindi la bozza
     * di una chat temporanea (`tmp-…`) va nel repository in MEMORIA e non tocca
     * il disco. La coda fa lo stesso, con la stessa regola.
     */
    it('QUEUE-REPO-06 la coda di una chat temporanea non tocca il disco, esattamente come la bozza', async () => {
        const { repository: durable, connection } = await sqliteConnessa()
        const ephemeral = createMemoryChatRepository()
        await ephemeral.initialize()
        const routed = createTalosEphemeralRoutingRepository({ durable, ephemeral, isEphemeral: talosIsEphemeralSessionId })
        try {
            await routed.createSession({ id: 'tmp-1', title: 't', active_model_profile_id: null, created_at: '2026-09-24T10:00:00.000Z' })
            await routed.createSession({ id: 'kept-1', title: 'k', active_model_profile_id: null, created_at: '2026-09-24T10:00:00.000Z' })

            await routed.saveComposerDraft('tmp-1', 'bozza temporanea')
            await routed.saveComposerQueue('tmp-1', CODA)
            await routed.saveComposerQueue('kept-1', CODA)

            // Si rilegge dalla chat temporanea attraverso il router…
            expect(await routed.loadComposerQueue('tmp-1')).toEqual(CODA)
            expect(await ephemeral.loadComposerQueue('tmp-1')).toEqual(CODA)
            // …ma sul disco non c'è: né la bozza né la coda della temporanea.
            const suDisco = await connection.query("SELECT key FROM talos_chat_state WHERE key LIKE '%tmp-1%'")
            expect(suDisco).toEqual([])
            expect(await durable.loadComposerQueue('tmp-1')).toBeNull()
            // La chat normale invece sta sul disco.
            expect(await durable.loadComposerQueue('kept-1')).toEqual(CODA)
            expect(await ephemeral.loadComposerQueue('kept-1')).toBeNull()
        } finally {
            connection.close()
        }
    })

    /**
     * L'elenco è `'durable'` come `listSessions`: una chat temporanea non compare
     * nella cronologia, quindi nemmeno la sua coda compare nell'elenco delle code.
     */
    it('QUEUE-REPO-14 l\'elenco delle code attraverso il router non mostra le chat temporanee', async () => {
        const { repository: durable, connection } = await sqliteConnessa()
        const ephemeral = createMemoryChatRepository()
        await ephemeral.initialize()
        const routed = createTalosEphemeralRoutingRepository({ durable, ephemeral, isEphemeral: talosIsEphemeralSessionId })
        try {
            await routed.createSession({ id: 'tmp-1', title: 't', active_model_profile_id: null, created_at: '2026-09-24T10:00:00.000Z' })
            await routed.createSession({ id: 'kept-1', title: 'k', active_model_profile_id: null, created_at: '2026-09-24T10:00:00.000Z' })
            await routed.saveComposerQueue('tmp-1', CODA)
            await routed.saveComposerQueue('kept-1', CODA)

            expect(await routed.listComposerQueues()).toEqual([{ scopeId: 'kept-1', value: CODA }])
            // Al contrario: la coda temporanea esiste davvero, solo non è nell'elenco.
            expect(await ephemeral.listComposerQueues()).toEqual([{ scopeId: 'tmp-1', value: CODA }])
        } finally {
            connection.close()
        }
    })

    it('QUEUE-REPO-10 il caricatore pigro inoltra salvataggio e lettura al repository concreto', async () => {
        const concreto = createMemoryChatRepository()
        const pigro = createLazyChatRepository(async () => concreto)
        await pigro.initialize()

        await pigro.saveComposerQueue('new', CODA)

        expect(await concreto.loadComposerQueue('new')).toEqual(CODA)
        expect(await pigro.loadComposerQueue('new')).toEqual(CODA)
    })
})

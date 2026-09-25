import { describe, expect, it } from 'vitest'
import {
    createChatStore as createLocalizedChatStore,
    type ChatCompletion,
    type ChatStoreOptions,
} from '@/stores/chat'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { talosTestT } from '../../helpers/talosTestI18n'

/**
 * ⛔ Trovato sul Pad il 24/09/2026 (prova B3): l'elenco delle chat diceva «Non ci sono ancora chat» mentre la chat aperta
 * aveva dodici messaggi. Causa: le sessioni del Codice vivono nello STESSO archivio (`codiceSessions.ts`,
 * `metadata.codice: true`) e `createSession` scrive sempre la sessione attiva (`sqliteChatRepository.ts`,
 * `writeActiveSession`). Creata una sessione del Codice, al riavvio la chat nativa si apriva su QUELLA: ogni messaggio
 * finiva dentro una sessione del Codice, e l'elenco — che le nasconde — non mostrava più la chat.
 * ⇒ La chat nativa non adotta MAI una sessione del Codice come propria: né all'avvio, né dopo una cancellazione.
 */
function createChatStore(complete: ChatCompletion, options: Omit<ChatStoreOptions, 'translate'>) {
    return createLocalizedChatStore(complete, { ...options, translate: talosTestT('en') })
}

const risponde: ChatCompletion = async () => ({ text: 'Ok.', finishReason: 'stop' })

async function sessioneDelCodice(repository: ReturnType<typeof createMemoryChatRepository>, id: string) {
    return repository.createSession({
        id, title: 'Codice', active_model_profile_id: null, created_at: new Date().toISOString(), metadata: { codice: true },
    })
}

describe('la chat nativa e le sessioni del Codice', () => {
    it('CODICE-ATTIVA-01 creata una sessione del Codice, al riavvio la chat nativa riapre la SUA chat', async () => {
        const repository = createMemoryChatRepository()
        const prima = createChatStore(risponde, { repository })
        await prima.initialize()
        await prima.send('Ciao dalla chat')
        const mia = prima.activeSession.value!.id
        await sessioneDelCodice(repository, 'codice-1')

        const dopo = createChatStore(risponde, { repository })
        await dopo.initialize()
        expect(dopo.activeSession.value?.id).toBe(mia)
        await dopo.send('Secondo messaggio')
        expect(await repository.listMessages('codice-1')).toEqual([])
        expect(dopo.history.map((s) => s.id)).toContain(mia)
    })

    it('CODICE-ATTIVA-02 cancellata la chat aperta, non si atterra su una sessione del Codice', async () => {
        const repository = createMemoryChatRepository()
        const store = createChatStore(risponde, { repository })
        await store.initialize()
        await store.send('Una chat da tenere')
        const daTenere = store.activeSession.value!.id
        await store.createSession('Da cancellare')
        await store.send('Una chat da cancellare')
        const daCancellare = store.activeSession.value!.id
        await sessioneDelCodice(repository, 'codice-2')
        await store.selectSession(daCancellare)
        await store.deleteSession(daCancellare)
        expect(store.activeSession.value?.id).toBe(daTenere)
    })

    it('CODICE-ATTIVA-03 al contrario: con solo sessioni del Codice la chat nativa parte vuota, e il primo messaggio fa una chat NUOVA', async () => {
        const repository = createMemoryChatRepository()
        await repository.initialize()
        await sessioneDelCodice(repository, 'codice-3')
        const store = createChatStore(risponde, { repository })
        await store.initialize()
        expect(store.activeSession.value).toBeNull()
        await store.send('Il primo messaggio della chat')
        expect(store.activeSession.value?.id).not.toBe('codice-3')
        expect(await repository.listMessages('codice-3')).toEqual([])
    })
})

/**
 * ⭐ B3-REC (owner 24/09/2026, «sì, devono restare separate»): chi ha usato l'app PRIMA della cura ha chat native
 * finite dentro sessioni del Codice — invisibili sia nella Chat (che nasconde il Codice) sia nel Codice (che quei
 * messaggi non li legge). Il Codice non scrive mai nella tabella dei messaggi (`harnessUiBridge.ts`): ogni messaggio
 * dentro una sessione del Codice viene dalla chat. All'avvio la chat se li riprende in una chat NUOVA; la sessione del
 * Codice resta nel Codice.
 */
async function sessioneDelCodiceDirottata(repository: ReturnType<typeof createMemoryChatRepository>, id: string) {
    await repository.createSession({
        id, title: 'Rifattorizza il parser', active_model_profile_id: null,
        created_at: '2026-09-24T09:00:00.000Z', metadata: { codice: true },
    })
    await repository.appendMessage({
        id: `${id}-u`, session_id: id, role: 'user', content: 'Ciao   dalla\nchat', state: 'persisted',
        created_at: '2026-09-24T10:00:01.000Z',
    })
    await repository.appendMessage({
        id: `${id}-a`, session_id: id, role: 'assistant', content: 'Ciao!', state: 'persisted',
        model_profile_id: 'glm-5.3-flash', created_at: '2026-09-24T10:00:02.000Z',
    })
}

describe('le chat finite dentro il Codice tornano nella Chat', () => {
    it('RECUPERO-01 all\u2019avvio la conversazione ricompare nella Chat, aperta; la sessione del Codice resta nel Codice', async () => {
        const repository = createMemoryChatRepository()
        await repository.initialize()
        await sessioneDelCodiceDirottata(repository, 'codice-r1')

        const store = createChatStore(risponde, { repository })
        await store.initialize()

        const recuperata = store.activeSession.value
        expect(recuperata?.id).not.toBe('codice-r1')
        expect(recuperata?.title).toBe('Ciao dalla chat')
        expect(recuperata?.metadata).toMatchObject({ recuperata_dal_codice: 'codice-r1' })
        expect(recuperata?.metadata?.codice).toBeUndefined()
        expect(recuperata?.active_model_profile_id).toBe('glm-5.3-flash')
        expect(store.messages.map((m) => m.content)).toEqual(['Ciao   dalla\nchat', 'Ciao!'])
        expect(store.history.map((s) => s.id)).toContain(recuperata!.id)
        const codice = (await repository.listSessions()).find((s) => s.id === 'codice-r1')
        expect(codice?.metadata).toEqual({ codice: true })
        expect(codice?.title).toBe('Rifattorizza il parser')
        expect(await repository.listMessages('codice-r1')).toEqual([])
    })

    it('RECUPERO-02 al secondo avvio non succede di nuovo: una chat sola, nessuna chat vuota in più', async () => {
        const repository = createMemoryChatRepository()
        await repository.initialize()
        await sessioneDelCodiceDirottata(repository, 'codice-r2')
        await createChatStore(risponde, { repository }).initialize()
        const dopoIlPrimo = (await repository.listSessions()).map((s) => s.id).sort()

        await createChatStore(risponde, { repository }).initialize()

        expect((await repository.listSessions()).map((s) => s.id).sort()).toEqual(dopoIlPrimo)
        expect(dopoIlPrimo).toHaveLength(2)
    })

    it('RECUPERO-03 una sessione del Codice senza messaggi non si tocca e non genera chat', async () => {
        const repository = createMemoryChatRepository()
        await repository.initialize()
        await sessioneDelCodice(repository, 'codice-r3')

        const store = createChatStore(risponde, { repository })
        await store.initialize()

        expect((await repository.listSessions()).map((s) => s.id)).toEqual(['codice-r3'])
        expect(store.activeSession.value).toBeNull()
    })

    it('RECUPERO-04 se stavi in un\u2019altra chat resti lì: la recuperata compare nell\u2019elenco, non ti sposta', async () => {
        const repository = createMemoryChatRepository()
        await repository.initialize()
        await sessioneDelCodiceDirottata(repository, 'codice-r4')
        const prima = createChatStore(risponde, { repository })
        await prima.initialize()
        await prima.createSession('La mia chat')
        await prima.send('Resto qui')
        const mia = prima.activeSession.value!.id
        // Un'altra sessione del Codice dirottata, trovata al riavvio dopo; nel frattempo sei tornato nella tua chat.
        await sessioneDelCodiceDirottata(repository, 'codice-r4b')
        await repository.selectSession(mia)

        const dopo = createChatStore(risponde, { repository })
        await dopo.initialize()

        expect(dopo.activeSession.value?.id).toBe(mia)
        expect(dopo.history.filter((s) => s.metadata?.recuperata_dal_codice === 'codice-r4b')).toHaveLength(1)
    })

    it('RECUPERO-05 un recupero che fallisce non blocca l\u2019avvio e non tocca i dati', async () => {
        const repository = createMemoryChatRepository()
        await repository.initialize()
        await sessioneDelCodiceDirottata(repository, 'codice-r5')
        const rotta = { ...repository, moveMessagesToNewSession: async () => { throw new Error('disco pieno') } }

        const store = createChatStore(risponde, { repository: rotta })
        await store.initialize()

        expect(store.state.persistenceStatus).not.toBe('error')
        expect((await repository.listMessages('codice-r5')).map((m) => m.id)).toEqual(['codice-r5-u', 'codice-r5-a'])
    })

    it('RECUPERO-06 una sessione che non si lascia recuperare non ferma le altre', async () => {
        const repository = createMemoryChatRepository()
        await repository.initialize()
        await sessioneDelCodiceDirottata(repository, 'codice-r6a')
        await sessioneDelCodiceDirottata(repository, 'codice-r6b')
        const inciampa = {
            ...repository,
            moveMessagesToNewSession: async (...args: Parameters<typeof repository.moveMessagesToNewSession>) => {
                if (args[0] === 'codice-r6a') throw new Error('riga illeggibile')
                return repository.moveMessagesToNewSession(...args)
            },
        }

        const store = createChatStore(risponde, { repository: inciampa })
        await store.initialize()

        expect(store.history.filter((s) => s.metadata?.recuperata_dal_codice === 'codice-r6b')).toHaveLength(1)
        expect((await repository.listMessages('codice-r6a')).map((m) => m.id)).toEqual(['codice-r6a-u', 'codice-r6a-a'])
    })

    it('RECUPERO-07 se la rilettura dell’elenco fallisce dopo il recupero, l’avvio va avanti e la chat c’è al giro dopo', async () => {
        const repository = createMemoryChatRepository()
        await repository.initialize()
        await sessioneDelCodiceDirottata(repository, 'codice-r7')
        let letture = 0
        const rilettura = {
            ...repository,
            listSessions: async () => {
                letture += 1
                if (letture === 2) throw new Error('lettura interrotta')
                return repository.listSessions()
            },
        }

        const store = createChatStore(risponde, { repository: rilettura })
        await store.initialize()

        expect(store.state.persistenceStatus).toBe('ready')
        const dopo = createChatStore(risponde, { repository })
        await dopo.initialize()
        expect(dopo.history.filter((s) => s.metadata?.recuperata_dal_codice === 'codice-r7')).toHaveLength(1)
    })
})

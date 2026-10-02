import { describe, expect, it, vi } from 'vitest'
import {
    createChatStore as createLocalizedChatStore,
    type ChatCompletion,
    type ChatStoreOptions,
    type ChatTurn,
} from '@/stores/chat'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { TALOS_METADATA_COMPATTAZIONE, TALOS_METADATA_COMPATTAZIONE_ANNULLATA } from '@/lib/chat/compattazioneChat'
import { talosTestT } from '../../helpers/talosTestI18n'

/*
 * ⭐⭐ P4-ter passo 2 (02/10/2026) — la compattazione dentro lo store della chat. Decisioni dell'owner: «Da sola, come il
 * desktop», «Nella conversazione», «Locale: subito dopo la risposta» (la coda aspetta), «Una riga nella storia».
 * Lo store decide e salva; il controller fa solo la chiamata al modello (`riassumiConversazione`).
 */

type Riassumi = NonNullable<ChatStoreOptions['riassumiConversazione']>
type Finestra = NonNullable<ChatStoreOptions['finestraPerCompattazione']>

function createChatStore(complete: ChatCompletion, options: Omit<ChatStoreOptions, 'translate'>) {
    return createLocalizedChatStore(complete, { ...options, translate: talosTestT('en') })
}

/** Un modello finto che risponde «risposta N» e registra i turni che riceve. */
function modello() {
    const ricevuti: ChatTurn[][] = []
    let n = 0
    const complete: ChatCompletion = vi.fn(async (turns) => {
        ricevuti.push(turns.map((t) => ({ ...t })))
        n += 1
        return { text: `risposta ${n} ${LUNGA}`, finishReason: 'stop' }
    })
    return { complete, ricevuti }
}

async function pronto(complete: ChatCompletion, extra: Partial<ChatStoreOptions> = {}) {
    const repository = createMemoryChatRepository()
    const riassumi = vi.fn<Riassumi>(async () => ({ ok: true as const, testo: 'RIASSUNTO-FINTO' }))
    const store = createChatStore(complete, { repository, riassumiConversazione: riassumi, ...extra })
    await store.initialize()
    return { store, repository, riassumi }
}

/** Sei domande vere, ognuna con la sua risposta: abbastanza perché ci sia un «mezzo» da riassumere. */
async function conversazione(store: Awaited<ReturnType<typeof pronto>>['store'], domande = 6) {
    for (let i = 0; i < domande; i += 1) await store.send(`domanda ${i}`)
    return store.activeSession.value!.id
}

const testi = (turni: readonly ChatTurn[]) => turni.map((t) => t.content).join(' | ')
/** Una risposta vera è lunga: senza, l'intestazione del riassunto pesa più di ciò che toglie. */
const LUNGA = 'con tutti i dettagli del caso, le alternative considerate e i numeri che servono. '.repeat(20)
type Misura = NonNullable<ChatStoreOptions['misuraRichiesta']>
/** Il «motore» delle prove: conta un token ogni quattro caratteri, come farebbe un tokenizzatore regolare. */
const motoreFinto = vi.fn<Misura>(async ({ turni }) => ({ token: Math.ceil(turni.reduce((n, t) => n + t.content.length, 0) / 4) + 500, misura: 'motore' as const }))

describe('P4-ter passo 2 — la compattazione nello store della chat', () => {
    it('CHAT-COMP-12 «Compatta ora» aggiunge UNA riga di sistema col record e non tocca nessun messaggio', async () => {
        const m = modello()
        const { store, repository, riassumi } = await pronto(m.complete)
        const sessione = await conversazione(store)
        const prima = (await repository.listMessages(sessione)).filter((r) => r.role !== 'system')
        const esito = await store.compattaOra(sessione)
        expect(esito).toMatchObject({ ok: true, compattato: true })
        expect(riassumi).toHaveBeenCalledWith(expect.objectContaining({ sessionId: sessione, motivo: 'manuale' }))
        const dopo = await repository.listMessages(sessione)
        expect(dopo.filter((r) => r.role !== 'system')).toEqual(prima)
        const righe = dopo.filter((r) => r.metadata?.[TALOS_METADATA_COMPATTAZIONE])
        expect(righe).toHaveLength(1)
        expect(righe[0]).toMatchObject({ role: 'system' })
        expect(righe[0]!.content).toMatch(/→/)
        expect(store.state.compattazioneInCorso).toBeNull()
    })

    it('CHAT-COMP-10 dopo la compattazione al modello va la proiezione; la storia su disco resta intera', async () => {
        const m = modello()
        const { store, repository } = await pronto(m.complete)
        const sessione = await conversazione(store)
        await store.compattaOra(sessione)
        await store.send('e adesso?')
        const ultimi = m.ricevuti.at(-1)!
        expect(testi(ultimi)).toContain('RIASSUNTO-FINTO')
        expect(testi(ultimi)).not.toContain('domanda 0')
        expect(ultimi.at(-1)).toMatchObject({ role: 'user', content: 'e adesso?' })
        const suDisco = (await repository.listMessages(sessione)).map((r) => r.content)
        expect(suDisco).toContain('domanda 0')
    })

    it('CHAT-COMP-13 «Annulla» aggiunge la riga che la spegne: l\'invio dopo torna alla storia intera', async () => {
        const m = modello()
        const { store, repository } = await pronto(m.complete)
        const sessione = await conversazione(store)
        const esito = await store.compattaOra(sessione)
        expect(esito.ok && esito.compattato).toBe(true)
        const at = esito.ok && esito.compattato ? esito.at : ''
        await store.annullaCompattazione(sessione, at)
        const righe = await repository.listMessages(sessione)
        expect(righe.at(-1)).toMatchObject({ role: 'system', metadata: { [TALOS_METADATA_COMPATTAZIONE_ANNULLATA]: { at } } })
        await store.send('e adesso?')
        expect(testi(m.ricevuti.at(-1)!)).toContain('domanda 0')
        expect(testi(m.ricevuti.at(-1)!)).not.toContain('RIASSUNTO-FINTO')
    })

    it('CHAT-COMP-11 sopra la soglia: compattazione SUBITO dopo la risposta, mentre l\'invio resta occupato (la coda aspetta)', async () => {
        const m = modello()
        let sopra = false
        const finestra = vi.fn<Finestra>(() => (sopra ? { finestraToken: 1_000, riservaUscita: 0, tettoToken: null, promptTokens: 800 } : null)) // soglia 750, emergenza 900
        let sblocca: () => void = () => undefined
        const riassumi = vi.fn<Riassumi>(() => new Promise((r) => { sblocca = () => r({ ok: true, testo: 'RIASSUNTO-FINTO' }) }))
        const { store, repository } = await pronto(m.complete, { finestraPerCompattazione: finestra, riassumiConversazione: riassumi })
        const sessione = await conversazione(store)
        expect(riassumi).not.toHaveBeenCalled()
        sopra = true
        const invio = store.send('ultima domanda')
        await vi.waitFor(() => expect(riassumi).toHaveBeenCalledWith(expect.objectContaining({ motivo: 'soglia' })))
        // La risposta è già salvata; la compattazione gira; lo store è ancora occupato (la coda non parte).
        expect((await repository.listMessages(sessione)).some((r) => r.content.startsWith('risposta 7'))).toBe(true)
        expect(store.state.compattazioneInCorso).toBe(sessione)
        expect(store.state.sending).toBe(true)
        sblocca()
        await invio
        expect(store.state.compattazioneInCorso).toBeNull()
        expect(store.state.sending).toBe(false)
        expect((await repository.listMessages(sessione)).filter((r) => r.metadata?.[TALOS_METADATA_COMPATTAZIONE])).toHaveLength(1)
    })

    it('CHAT-COMP-14 il modello locale dice «contesto pieno»: una compattazione e UN ritentativo, una sola risposta salvata', async () => {
        let chiamate = 0
        const complete: ChatCompletion = vi.fn(async () => {
            chiamate += 1
            if (chiamate === 7) throw new Error('TALOS_LOCAL_PROMPT_TOO_LONG')
            return { text: `risposta ${chiamate} ${LUNGA}`, finishReason: 'stop' }
        })
        const { store, repository, riassumi } = await pronto(complete)
        const sessione = await conversazione(store)
        await store.send('una domanda lunga')
        expect(riassumi).toHaveBeenCalledWith(expect.objectContaining({ motivo: 'overflow' }))
        expect(chiamate).toBe(8)
        const righe = await repository.listMessages(sessione)
        expect(righe.filter((r) => r.role === 'assistant' && r.content.startsWith('risposta 8 '))).toHaveLength(1)
        expect(righe.some((r) => r.state === 'failed')).toBe(false)
    })

    it('CHAT-COMP-15 riassunto non riuscito o conversazione corta: nessuna riga, e il motivo vero', async () => {
        const m = modello()
        const riassumi = vi.fn<Riassumi>(async () => ({ ok: false as const, motivo: 'vuoto' }))
        const { store, repository } = await pronto(m.complete, { riassumiConversazione: riassumi })
        await store.send('una sola domanda')
        const corta = store.activeSession.value!.id
        expect(await store.compattaOra(corta)).toMatchObject({ ok: true, compattato: false, motivo: 'niente-da-compattare' })
        expect(riassumi).not.toHaveBeenCalled()
        const lunga = await conversazione(store)
        expect(await store.compattaOra(lunga)).toMatchObject({ ok: true, compattato: false, motivo: 'vuoto' })
        expect((await repository.listMessages(lunga)).some((r) => r.metadata?.[TALOS_METADATA_COMPATTAZIONE])).toBe(false)
        expect(store.state.compattazioneInCorso).toBeNull()
    })

    /*
     * ⭐⭐ Owner 02/10: «la compattazione deve essere automatica ed estremamente precisa» ⇒ «Token veri» e «Almeno il 30%».
     */
    it('CHAT-COMP-16 i numeri della riga sono quelli VERI del motore (richiesta intera), non la stima', async () => {
        const m = modello()
        const { store, repository } = await pronto(m.complete, { misuraRichiesta: motoreFinto })
        const sessione = await conversazione(store)
        const esito = await store.compattaOra(sessione)
        expect(esito).toMatchObject({ ok: true, compattato: true })
        const riga = (await repository.listMessages(sessione)).find((r) => r.metadata?.[TALOS_METADATA_COMPATTAZIONE])!
        const dati = riga.metadata[TALOS_METADATA_COMPATTAZIONE] as { record: { tokenPrima: number, tokenDopo: number, misura: string } }
        expect(dati.record.misura).toBe('motore')
        expect(esito.ok && esito.compattato && esito.tokenPrima).toBe(dati.record.tokenPrima)
        // Il motore finto aggiunge 500 token fissi (sistema e attrezzi): ci sono, perché la misura è della richiesta intera.
        expect(dati.record.tokenPrima).toBeGreaterThan(500)
        expect(dati.record.tokenDopo).toBeLessThanOrEqual(dati.record.tokenPrima * 0.7)
    })

    it('CHAT-COMP-17 niente da guadagnare PRIMA: se anche un riassunto vuoto non porta sotto il 70%, il modello non si chiama', async () => {
        const m = modello()
        // Sistema e attrezzi pesano 50.000 token: togliere la storia non cambia quasi niente.
        const pesante = vi.fn<Misura>(async ({ turni }) => ({ token: Math.ceil(turni.reduce((n, t) => n + t.content.length, 0) / 4) + 50_000, misura: 'motore' as const }))
        const { store, repository, riassumi } = await pronto(m.complete, { misuraRichiesta: pesante })
        const sessione = await conversazione(store)
        expect(await store.compattaOra(sessione)).toMatchObject({ ok: true, compattato: false, motivo: 'niente-da-guadagnare' })
        expect(riassumi).not.toHaveBeenCalled()
        expect((await repository.listMessages(sessione)).some((r) => r.metadata?.[TALOS_METADATA_COMPATTAZIONE])).toBe(false)
    })

    it('CHAT-COMP-18 niente da guadagnare DOPO: un riassunto che non alleggerisce di almeno il 30% non si salva', async () => {
        const m = modello()
        const lungo = vi.fn<Riassumi>(async () => ({ ok: true as const, testo: LUNGA.repeat(8) }))
        const { store, repository } = await pronto(m.complete, { misuraRichiesta: motoreFinto, riassumiConversazione: lungo })
        const sessione = await conversazione(store)
        expect(await store.compattaOra(sessione)).toMatchObject({ ok: true, compattato: false, motivo: 'niente-da-guadagnare' })
        expect(lungo).toHaveBeenCalled()
        expect((await repository.listMessages(sessione)).some((r) => r.metadata?.[TALOS_METADATA_COMPATTAZIONE])).toBe(false)
    })
})

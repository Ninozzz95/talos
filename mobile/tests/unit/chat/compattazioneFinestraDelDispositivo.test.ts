import { describe, expect, it, vi } from 'vitest'
import {
    createChatStore as createLocalizedChatStore,
    type ChatCompletion,
    type ChatStoreOptions,
    type ChatTurn,
} from '@/stores/chat'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { TALOS_METADATA_COMPATTAZIONE } from '@/lib/chat/compattazioneChat'
import { TalosMobileProviderError } from '@/lib/chat/providerErrors'
import { talosTestT } from '../../helpers/talosTestI18n'

/*
 * Telefono 0.1.48 — owner 11/11/2026 17:45 «Cura completa nella 0.1.48», giudice v1510/v1515/v1516.
 * Pad, APK 380: «need about 4107 tokens… can safely give this model 2816». La finestra delle prove è QUELLA: 2.816 token,
 * 1.024 di risposta, quindi la richiesta deve stare in 2.816 − 1.024 − 1 = 1.791 (la stessa aritmetica del rifiuto del
 * motore, `localAdapter.ts`, `promptTooLongFailure(plan.promptTokens + MAX_TOKENS + 1, ceiling)`).
 * Il «motore» finto conta un token ogni quattro caratteri più un peso FISSO (sistema e attrezzi), come `planPrompt`.
 */
const FINESTRA = 2_816
const RISERVA = 1_024
const LIMITE = FINESTRA - RISERVA - 1

type Riassumi = NonNullable<ChatStoreOptions['riassumiConversazione']>
type Misura = NonNullable<ChatStoreOptions['misuraRichiesta']>

const contaTurni = (turni: readonly ChatTurn[], fisso: number) => fisso + Math.ceil(turni.reduce((n, t) => n + String(t.content ?? '').length, 0) / 4)

/** Un dispositivo con la finestra del Pad: il modello finto rifiuta come il motore vero quando la richiesta non ci sta. */
function dispositivo({ fisso, risposta }: { fisso: number, risposta: number }) {
    const ricevuti: ChatTurn[][] = []
    const stato = { finestraAccesa: false, n: 0 }
    const complete: ChatCompletion = vi.fn(async (turns) => {
        const token = contaTurni(turns, fisso)
        if (stato.finestraAccesa && token > LIMITE) {
            throw new TalosMobileProviderError({
                provider: 'local', operation: 'complete', message: 'TALOS_LOCAL_PROMPT_TOO_LONG',
                uiMessageKey: 'models.localPromptTooLongMeasured',
                uiMessageParameters: { required: String(token + RISERVA + 1), available: String(FINESTRA) },
            })
        }
        ricevuti.push(turns.map((t) => ({ ...t })))
        stato.n += 1
        return { text: `risposta ${stato.n} ${'r'.repeat(risposta)}`, finishReason: 'stop' }
    })
    const misura = vi.fn<Misura>(async ({ turni }) => ({ token: contaTurni(turni, fisso), misura: 'motore' as const }))
    const finestra = vi.fn(() => (stato.finestraAccesa
        ? { finestraToken: FINESTRA, riservaUscita: RISERVA, tettoToken: null, promptTokens: null }
        : null))
    return { complete, ricevuti, stato, misura, finestra, conta: (turni: readonly ChatTurn[]) => contaTurni(turni, fisso) }
}

async function pronto(d: ReturnType<typeof dispositivo>, riassumi?: Riassumi) {
    const repository = createMemoryChatRepository()
    const riassumiConversazione = riassumi ?? vi.fn<Riassumi>(async () => ({ ok: true as const, testo: 'RIASSUNTO-FINTO' }))
    const store = createLocalizedChatStore(d.complete, {
        repository, translate: talosTestT('en'), riassumiConversazione,
        misuraRichiesta: d.misura, finestraPerCompattazione: d.finestra,
    })
    await store.initialize()
    return { store, repository, riassumi: riassumiConversazione as ReturnType<typeof vi.fn<Riassumi>> }
}

async function scambi(store: Awaited<ReturnType<typeof pronto>>['store'], n: number) {
    for (let i = 0; i < n; i += 1) await store.send(`domanda ${i}`)
    return store.activeSession.value!.id
}

const righeCompattazione = async (repository: ReturnType<typeof createMemoryChatRepository>, sessione: string) =>
    (await repository.listMessages(sessione)).filter((r) => r.metadata?.[TALOS_METADATA_COMPATTAZIONE])

describe('Telefono 0.1.48 — compattazione con la finestra del dispositivo (2.816 token)', () => {
    /*
     * Punto 2, via «prima della risposta» (la quinta risposta del Tester). Oggi: il riassunto si salva ma lascia intera la
     * parte tenuta (sistema e attrezzi 1.450, gli ultimi due scambi, la richiesta tenuta): il ritentativo supera ancora 1.791 e
     * torna l'errore. Dopo: si accorcia la parte tenuta, la risposta parte, la richiesta in corso arriva intera.
     */
    it('FIN-STORE-01 la quinta risposta parte: richiesta sotto la finestra, richiesta in corso intera, una risposta sola', async () => {
        const d = dispositivo({ fisso: 1_450, risposta: 1_600 })
        const { store, repository, riassumi } = await pronto(d)
        const sessione = await scambi(store, 4)
        const primaDelle = (await repository.listMessages(sessione)).map((r) => ({ ...r }))
        d.stato.finestraAccesa = true
        const testo = 'Now write thirty numbered sentences about volcanoes and each one on its own line.'
        await store.send(testo)
        const righe = await repository.listMessages(sessione)
        expect(righe.some((r) => r.state === 'failed')).toBe(false)
        expect(righe.filter((r) => r.role === 'assistant' && r.content.startsWith('risposta 5 '))).toHaveLength(1)
        expect(riassumi).toHaveBeenCalledWith(expect.objectContaining({ motivo: 'overflow' }))
        const inviata = d.ricevuti.at(-1)!
        expect(d.conta(inviata)).toBeLessThanOrEqual(LIMITE)
        expect(inviata.at(-1)).toEqual(expect.objectContaining({ role: 'user', content: testo }))
        // Giudice v1510 (3): la storia salvata resta intera, byte per byte.
        expect(righe.filter((r) => r.role !== 'system').slice(0, primaDelle.length)).toEqual(primaDelle)
        // La riga del riassunto dice cosa si è accorciato.
        const riga = (await righeCompattazione(repository, sessione))[0]!
        expect((riga.metadata[TALOS_METADATA_COMPATTAZIONE] as { accorciati?: { scambi: number } }).accorciati?.scambi).toBeGreaterThan(0)
        expect(riga.content).toMatch(/older exchange/)
    })

    /* Punto 2, via «Compatta ora»: il record che si salva sta nella finestra; quello di oggi no (2.3k contro 1.791). */
    it('FIN-STORE-02 «Compatta ora» su una chat che non entra: il riassunto salvato sta nella finestra', async () => {
        const d = dispositivo({ fisso: 1_000, risposta: 1_600 })
        const { store, repository } = await pronto(d)
        const sessione = await scambi(store, 5)
        d.stato.finestraAccesa = true
        const esito = await store.compattaOra(sessione)
        expect(esito).toMatchObject({ ok: true, compattato: true })
        expect(esito.ok && esito.compattato && esito.tokenDopo).toBeLessThanOrEqual(LIMITE)
        // Il 30% resta (punto 3): sotto il 70% di prima.
        expect(esito.ok && esito.compattato && esito.tokenDopo <= esito.tokenPrima * 0.7).toBe(true)
        await store.send('e adesso?')
        expect(d.conta(d.ricevuti.at(-1)!)).toBeLessThanOrEqual(LIMITE)
        expect((await repository.listMessages(sessione)).some((r) => r.state === 'failed')).toBe(false)
    })

    /* Punto 4 e giudice v1510 (3): «Annulla» riporta la storia intera al modello; niente si è perso sul disco. */
    it('FIN-STORE-03 dopo l\'accorciamento «Annulla» riporta la storia intera', async () => {
        const d = dispositivo({ fisso: 1_000, risposta: 1_600 })
        const { store, repository } = await pronto(d)
        const sessione = await scambi(store, 5)
        const salvate = (await repository.listMessages(sessione)).map((r) => ({ ...r }))
        d.stato.finestraAccesa = true
        const esito = await store.compattaOra(sessione)
        expect(esito.ok && esito.compattato).toBe(true)
        await store.annullaCompattazione(sessione, esito.ok && esito.compattato ? esito.at : '')
        d.stato.finestraAccesa = false
        await store.send('e adesso?')
        const inviata = d.ricevuti.at(-1)!.map((t) => t.content)
        for (let i = 0; i < 5; i += 1) expect(inviata).toContain(`domanda ${i}`)
        expect(inviata.join('|')).not.toContain('RIASSUNTO-FINTO')
        expect((await repository.listMessages(sessione)).filter((r) => r.role !== 'system').slice(0, salvate.length)).toEqual(salvate)
    })

    /* Punto 3: il 30% resta anche con la finestra. Un riassunto lungo che non porta sotto non si salva. */
    it('FIN-STORE-04 il 30% resta: un riassunto che non entra non si salva e la storia resta com\'è', async () => {
        const d = dispositivo({ fisso: 1_000, risposta: 1_600 })
        const lungo = vi.fn<Riassumi>(async () => ({ ok: true as const, testo: 'L'.repeat(40_000) }))
        const { store, repository } = await pronto(d, lungo)
        const sessione = await scambi(store, 5)
        d.stato.finestraAccesa = true
        expect(await store.compattaOra(sessione)).toMatchObject({ ok: true, compattato: false, motivo: 'niente-da-guadagnare' })
        expect(lungo).toHaveBeenCalledTimes(1)
        expect(await righeCompattazione(repository, sessione)).toHaveLength(0)
    })

    /*
     * Giudice v1510 (5): la sola richiesta in corso supera la finestra ⇒ si dice SUBITO, coi numeri e la via d'uscita
     * (accorciare il messaggio o cambiare modello), senza riassunto e senza rotelle lunghe.
     */
    it('FIN-STORE-05 la sola richiesta supera la finestra: errore subito coi numeri, nessun riassunto', async () => {
        const d = dispositivo({ fisso: 1_000, risposta: 1_600 })
        const { store, repository, riassumi } = await pronto(d)
        const sessione = await scambi(store, 3)
        d.stato.finestraAccesa = true
        const enorme = `Leggi questo: ${'z'.repeat(7_000)}`
        await store.send(enorme)
        expect(riassumi).not.toHaveBeenCalled()
        const errore = (await repository.listMessages(sessione)).find((r) => r.state === 'failed')!
        const richiesti = d.conta([{ role: 'user', content: enorme }]) + RISERVA + 1
        expect(errore.content).toContain(String(richiesti))
        expect(errore.content).toContain(String(FINESTRA))
        expect(errore.content).toMatch(/Shorten the message or choose another model/)
        expect(await righeCompattazione(repository, sessione)).toHaveLength(0)
    })

    /* Giudice v1516: «Resume» dopo l'errore della finestra ⇒ la risposta compare UNA volta, 0 doppi. */
    it('FIN-STORE-06 «Resume» dopo l\'errore della finestra: una risposta sola, nessun messaggio doppio', async () => {
        const d = dispositivo({ fisso: 1_450, risposta: 1_600 })
        let primo = true
        const riassumi = vi.fn<Riassumi>(async () => {
            if (primo) { primo = false; return { ok: false as const, motivo: 'errore' } }
            return { ok: true as const, testo: 'RIASSUNTO-FINTO' }
        })
        const { store, repository } = await pronto(d, riassumi)
        const sessione = await scambi(store, 4)
        d.stato.finestraAccesa = true
        await store.send('domanda 4')
        expect((await repository.listMessages(sessione)).filter((r) => r.state === 'failed')).toHaveLength(1)
        expect(await store.resumeTurn()).toBe(true)
        const righe = (await repository.listMessages(sessione)).filter((r) => r.role !== 'system')
        expect(righe.filter((r) => r.role === 'user' && r.content === 'domanda 4')).toHaveLength(1)
        expect(righe.filter((r) => r.role === 'assistant' && r.content.startsWith('risposta 5 '))).toHaveLength(1)
        const contenuti = righe.map((r) => `${r.role}:${r.content}`)
        expect(new Set(contenuti).size).toBe(contenuti.length)
        expect(d.conta(d.ricevuti.at(-1)!)).toBeLessThanOrEqual(LIMITE)
    })

    /*
     * Giudice v1510 (1) e v1515: «un caso al limite che oggi riesce continua a riuscire». Pesi della chat del Tester da 8
     * scambi (APK 380: 4.728 → 2.525/2.595, a mano e in automatico): fisso 1.454, risposte da ~407 token. La finestra qui
     * non conta (la chat ci sta): vale solo il 30%. Un riassunto di ~250 token si salva; una stima fatta col riassunto LUNGO
     * (1.200 parole) lo rifiuterebbe prima di chiederlo.
     */
    it('FIN-STORE-07 il caso da 8 scambi del Tester (4.7k) continua a riuscire, col riassunto chiesto davvero', async () => {
        const d = dispositivo({ fisso: 1_454, risposta: 1_610 })
        const riassumi = vi.fn<Riassumi>(async () => ({ ok: true as const, testo: 'S'.repeat(1_000) }))
        const { store, repository } = await pronto(d, riassumi)
        const sessione = await scambi(store, 8)
        const esito = await store.compattaOra(sessione)
        expect(riassumi).toHaveBeenCalledTimes(1)
        expect(esito).toMatchObject({ ok: true, compattato: true })
        expect(esito.ok && esito.compattato && esito.tokenPrima).toBeGreaterThan(4_600)
        expect(esito.ok && esito.compattato && esito.tokenPrima).toBeLessThan(4_850)
        expect(await righeCompattazione(repository, sessione)).toHaveLength(1)
    })

    /*
     * Giudice v1523 (opzione (a), la regola del PC `compattazione-desktop.mjs:307`, `:345-357`): il riassunto ATTESO pesa almeno
     * 400 token (un quinto del tratto, col tetto della finestra; la mediana dei riassunti veri quando c'è). A 6 scambi (~4.1k, APK 380:
     * «Nothing to gain» dopo 127-132 s) il pavimento più 400 supera il 70%: «niente» SUBITO, senza chiamare il modello.
     */
    it('FIN-STORE-08 il caso da 6 scambi del Tester (4.1k): «niente da guadagnare» in meno di 1 s, 0 chiamate al modello', async () => {
        const d = dispositivo({ fisso: 1_454, risposta: 1_610 })
        const riassumi = vi.fn<Riassumi>(async () => ({ ok: true as const, testo: 'S'.repeat(1_000) }))
        const { store, repository } = await pronto(d, riassumi)
        const sessione = await scambi(store, 6)
        const inizio = performance.now()
        const esito = await store.compattaOra(sessione)
        expect(performance.now() - inizio).toBeLessThan(1_000)
        expect(esito).toEqual({ ok: true, compattato: false, motivo: 'niente-da-guadagnare' })
        expect(riassumi).toHaveBeenCalledTimes(0)
        expect(await righeCompattazione(repository, sessione)).toHaveLength(0)
    })

    /* Giudice v1523: la mediana dei riassunti veri, come il PC (`session-registry.mjs:6756`, `stimaToken` del riassunto). */
    it('FIN-STORE-09 la riga della compattazione tiene il peso del riassunto vero, che diventa la mediana della chat', async () => {
        const d = dispositivo({ fisso: 1_454, risposta: 1_610 })
        const riassumi = vi.fn<Riassumi>(async () => ({ ok: true as const, testo: `  ${'S'.repeat(1_000)}\n` }))
        const { store, repository } = await pronto(d, riassumi)
        const sessione = await scambi(store, 8)
        expect(await store.compattaOra(sessione)).toMatchObject({ ok: true, compattato: true })
        const [riga] = await righeCompattazione(repository, sessione)
        expect((riga!.metadata![TALOS_METADATA_COMPATTAZIONE] as { riassuntoVero?: number }).riassuntoVero).toBe(250)
        const { riassuntiVeriDellaChat } = await import('@/lib/chat/compattazioneChat')
        expect(riassuntiVeriDellaChat(await repository.listMessages(sessione))).toEqual([250])
    })

    /*
     * Giudice v1523, la mediana dentro la decisione (`riassuntoAtteso` del PC: con riassunti veri vale la loro mediana, non il
     * minimo di 400). La stessa chat da 6 scambi di FIN-STORE-08, ma questa chat ha già avuto un riassunto vero da 50 token (fatto a
     * 8 scambi, poi eliminati i due scambi più vecchi: la riga resta, il riassunto non vale più). Atteso 50: il modello si chiama e si salva.
     */
    it('FIN-STORE-10 con un riassunto vero corto nella chat la mediana decide: a 6 scambi il riassunto si fa', async () => {
        const d = dispositivo({ fisso: 1_454, risposta: 1_610 })
        const riassumi = vi.fn<Riassumi>(async () => ({ ok: true as const, testo: 'S'.repeat(200) }))
        const { store, repository } = await pronto(d, riassumi)
        const sessione = await scambi(store, 8)
        expect(await store.compattaOra(sessione)).toMatchObject({ ok: true, compattato: true })
        for (const domanda of ['domanda 0', 'domanda 1']) {
            const riga = (await repository.listMessages(sessione)).find((r) => r.role === 'user' && r.content === domanda)!
            await repository.deleteMessageTurn(sessione, riga.id)
        }
        const { compattazioneAttiva, riassuntiVeriDellaChat } = await import('@/lib/chat/compattazioneChat')
        const righe = await repository.listMessages(sessione)
        expect(compattazioneAttiva(righe)).toBeNull()
        expect(riassuntiVeriDellaChat(righe)).toEqual([50])
        expect(await store.compattaOra(sessione)).toMatchObject({ ok: true, compattato: true })
        expect(riassumi).toHaveBeenCalledTimes(2)
    })

    /*
     * Giudice v1523, sopra la finestra la regola F6 del PC (`compattazione-desktop.mjs:366-370`): una finestra da 1.000 token senza
     * riserva e un peso fisso di 700 (sistema e attrezzi). La chat non entra; anche togliendo tutto ciò che si può, il pavimento
     * resta sopra i 600 e col riassunto atteso (400) arriva alla finestra: nessun riassunto la farà entrare, «niente» senza modello.
     */
    it('FIN-STORE-11 sopra la finestra: se pavimento più riassunto atteso non entrano nella finestra, «niente» senza chiamare il modello', async () => {
        const conta = (turni: readonly ChatTurn[]) => 700 + Math.ceil(turni.reduce((n, t) => n + String(t.content ?? '').length, 0) / 4)
        let n = 0
        let accesa = false
        const complete: ChatCompletion = vi.fn(async () => ({ text: `risposta ${++n} ${'r'.repeat(800)}`, finishReason: 'stop' }))
        const riassumi = vi.fn<Riassumi>(async () => ({ ok: true as const, testo: 'RIASSUNTO-FINTO' }))
        const repository = createMemoryChatRepository()
        const store = createLocalizedChatStore(complete, {
            repository, translate: talosTestT('en'), riassumiConversazione: riassumi,
            misuraRichiesta: vi.fn<Misura>(async ({ turni }) => ({ token: conta(turni), misura: 'motore' as const })),
            finestraPerCompattazione: vi.fn(() => (accesa ? { finestraToken: 1_000, riservaUscita: 0, tettoToken: null, promptTokens: null } : null)),
        })
        await store.initialize()
        const sessione = await scambi(store, 5)
        accesa = true
        expect(await store.compattaOra(sessione)).toEqual({ ok: true, compattato: false, motivo: 'niente-da-guadagnare' })
        expect(riassumi).toHaveBeenCalledTimes(0)
    })
})

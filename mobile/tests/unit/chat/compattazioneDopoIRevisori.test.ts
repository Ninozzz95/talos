import { describe, expect, it, vi } from 'vitest'
import { createChatStore, type ChatCompletion, type ChatStoreOptions, type ChatTurn, type TalosRiassumiInput } from '@/stores/chat'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { TALOS_METADATA_COMPATTAZIONE, turniVersoNucleo } from '@/lib/chat/compattazioneChat'
import { TalosMobileProviderError } from '@/lib/chat/providerErrors'
import { stimaConPezziDelPc } from '@/lib/kernel/compattazione'
import { talosTestT } from '../../helpers/talosTestI18n'

/*
 * Telefono 0.1.48 — il giro dopo i tre revisori (giudice v1535 e v1536, 11/11/2026 20:00-20:04).
 * Il «motore» o il fornitore finto risponde come il controller vero (`chatControllerCompattazione.ts`, `misuraRichiesta`): i token
 * veri della richiesta INTERA e la stima del PC della stessa richiesta (`stima`), da cui k. Il peso fisso è sistema più attrezzi,
 * che la stima del PC conta come il fornitore (sono testo); `rapporto` è la taratura del fornitore (token veri sulla stima).
 * Casi copiati dai rapporti dei revisori A (REV-A-01..03), B (REVB-TARATO2) e C (reperto 1), non i loro file.
 */
type Riassumi = NonNullable<ChatStoreOptions['riassumiConversazione']>
type Misura = NonNullable<ChatStoreOptions['misuraRichiesta']>

const caratteri = (t: readonly ChatTurn[]) => t.reduce((n, x) => n + String(x.content ?? '').length, 0)
const densi = (t: readonly ChatTurn[]) => t.reduce((n, x) => n + (String(x.content ?? '').match(/x/g) ?? []).length, 0)
const stimaDelPc = (t: readonly ChatTurn[], fisso: number) => fisso + stimaConPezziDelPc(turniVersoNucleo(t))

interface Scenario {
    /** Token veri della richiesta (senza la taratura). */
    veri: (t: readonly ChatTurn[]) => number
    fisso: number
    rapporto?: number
    /** Il testo delle risposte, o una funzione del numero della risposta (1, 2, ...). */
    risposta: string | ((n: number) => string)
    n: number
    finestra?: { finestraToken: number, riservaUscita: number } | null
    riassumi?: Riassumi
}

function chat(s: Scenario) {
    const rapporto = s.rapporto ?? 1
    const conta = (t: readonly ChatTurn[]) => Math.round(rapporto * s.veri(t))
    const stato = { accesa: false, k: 0, ricevuti: [] as ChatTurn[][] }
    const limite = s.finestra ? s.finestra.finestraToken - s.finestra.riservaUscita - 1 : Infinity
    const complete: ChatCompletion = vi.fn(async (turns) => {
        const token = conta(turns)
        if (stato.accesa && token > limite) {
            throw new TalosMobileProviderError({
                provider: 'local', operation: 'complete', message: 'TALOS_LOCAL_PROMPT_TOO_LONG',
                uiMessageKey: 'models.localPromptTooLongMeasured',
                uiMessageParameters: { required: String(token + (s.finestra?.riservaUscita ?? 0) + 1), available: String(s.finestra?.finestraToken) },
            })
        }
        stato.ricevuti.push(turns.map((t) => ({ ...t })))
        stato.k += 1
        return { text: `risposta ${stato.k} ${typeof s.risposta === 'string' ? s.risposta : s.risposta(stato.k)}`, finishReason: 'stop' as const }
    })
    const riassumi = vi.fn<Riassumi>(s.riassumi ?? (async () => ({ ok: true as const, testo: 'S'.repeat(1_600) })))
    const misura = vi.fn<Misura>(async ({ turni }) => ({ token: conta(turni), misura: 'fornitore' as const, stima: stimaDelPc(turni, s.fisso) }))
    const repository = createMemoryChatRepository()
    const store = createChatStore(complete, {
        repository, translate: talosTestT('en'), riassumiConversazione: riassumi, misuraRichiesta: misura,
        finestraPerCompattazione: vi.fn(() => (stato.accesa && s.finestra ? { ...s.finestra, tettoToken: null, promptTokens: null } : null)),
    })
    return { store, repository, riassumi, stato, conta, limite }
}

async function avviata(s: Scenario) {
    const c = chat(s)
    await c.store.initialize()
    for (let i = 0; i < s.n; i += 1) await c.store.send(`domanda ${i}`)
    c.stato.accesa = true
    return { ...c, sessione: c.store.activeSession.value!.id }
}

const righeCompattazione = async (c: Awaited<ReturnType<typeof avviata>>) =>
    (await c.repository.listMessages(c.sessione)).filter((r) => r.metadata?.[TALOS_METADATA_COMPATTAZIONE])
const fallite = async (c: Awaited<ReturnType<typeof avviata>>) => (await c.repository.listMessages(c.sessione)).filter((r) => r.state === 'failed').length

/**
 * Un modello che rispetta il tetto chiesto: scrive `naturali` token veri, o meno se il tetto è più piccolo. Il tetto gli arriva in
 * parole (metà dello spazio, `chatControllerCompattazione.ts`), e una parola gli costa un token e mezzo.
 */
const obbediente = (naturali: number, rapporto = 1): Riassumi => async (input: TalosRiassumiInput) => {
    const token = input.spazioDelRiassunto !== undefined ? Math.min(naturali, Math.floor((input.spazioDelRiassunto / 2) * 1.5)) : naturali
    return { ok: true as const, testo: 'S'.repeat(Math.max(1, Math.floor((token / rapporto) * 4))) }
}

describe('Telefono 0.1.48 — dopo i revisori: k della richiesta intera (R1)', () => {
    // Revisore A, REV-A-02/03: un tratto denso (JSON, base64) non gonfia il riassunto, che è prosa. Dove la base salvava, si salva.
    const denso = (perToken: number) => (t: readonly ChatTurn[]) => 1_454 + Math.ceil(densi(t) / perToken) + Math.ceil((caratteri(t) - densi(t)) / 4)
    for (const [n, perToken, x, prima] of [[7, 2, 800, 4_289], [8, 1, 400, 4_694], [10, 1, 400, 5_505]] as const) {
        it(`DR-01 tratto a ${perToken} caratteri per token, ${n} scambi: ${prima} → 2.746 come sulla base`, async () => {
            const c = await avviata({ veri: denso(perToken), fisso: 1_454, risposta: 'x'.repeat(x), n })
            const esito = await c.store.compattaOra(c.sessione)
            expect(esito).toEqual(expect.objectContaining({ ok: true, compattato: true, tokenPrima: prima, tokenDopo: 2_746 }))
            expect(c.riassumi).toHaveBeenCalledTimes(1)
        })
    }

    // Revisore A, REV-A-01, e revisore C, RC-TARATURA: con k della richiesta intera le decisioni non cambiano col rapporto.
    const prosa = (t: readonly ChatTurn[]) => 1_454 + Math.ceil(caratteri(t) / 4)
    for (const rapporto of [0.4, 1, 2.5]) {
        it(`DR-02 fornitore tarato a ${rapporto}: 6 scambi «niente» con 0 chiamate, 8 scambi riassunti`, async () => {
            const sei = await avviata({ veri: prosa, fisso: 1_454, rapporto, risposta: 'r'.repeat(1_610), n: 6, riassumi: async () => ({ ok: true, testo: 'S'.repeat(1_000) }) })
            expect(await sei.store.compattaOra(sei.sessione)).toEqual({ ok: true, compattato: false, motivo: 'niente-da-guadagnare' })
            expect(sei.riassumi).not.toHaveBeenCalled()
            const otto = await avviata({ veri: prosa, fisso: 1_454, rapporto, risposta: 'r'.repeat(1_610), n: 8, riassumi: async () => ({ ok: true, testo: 'S'.repeat(1_000) }) })
            expect(await otto.store.compattaOra(otto.sessione)).toMatchObject({ ok: true, compattato: true })
            expect(otto.riassumi).toHaveBeenCalledTimes(1)
        })
    }

    // Senza la stima della richiesta (un controller vecchio, o la sola stima del telefono) k vale 1, come `kValido(null)` del PC.
    it('DR-03 senza la stima k vale 1: 6 scambi «niente», 8 riassunti', async () => {
        for (const [n, salvato] of [[6, false], [8, true]] as const) {
            const c = chat({ veri: prosa, fisso: 1_454, risposta: 'r'.repeat(1_610), n })
            const senzaStima = vi.fn<Misura>(async ({ turni }) => ({ token: c.conta(turni), misura: 'fornitore' as const }))
            const store = createChatStore(vi.fn<ChatCompletion>(async () => ({ text: `risposta ${'r'.repeat(1_610)}`, finishReason: 'stop' as const })), {
                repository: createMemoryChatRepository(), translate: talosTestT('en'), riassumiConversazione: c.riassumi, misuraRichiesta: senzaStima,
            })
            await store.initialize()
            for (let i = 0; i < n; i += 1) await store.send(`domanda ${i}`)
            const esito = await store.compattaOra(store.activeSession.value!.id)
            expect(esito).toMatchObject({ ok: true, compattato: salvato })
            expect(c.riassumi).toHaveBeenCalledTimes(salvato ? 1 : 0)
        }
    })
})

describe('Telefono 0.1.48 — dopo i revisori: oltre la finestra nelle unità della finestra (punti 7-8, v1536)', () => {
    /*
     * Revisore B, REVB-TARATO2: i 21 scenari segnati (13 «niente» a torto, 2 sulla finestra da 16.000, 6 chiamate sprecate). Il
     * riassunto di B pesa 1.600 caratteri (400 in stima, rapporto × 400 in token veri).
     * - «salva»: il «niente» a torto diventa un riassunto, e l'invio dopo parte;
     * - «pc»: finestra 16.000, risposte da 24.000, 3 scambi: il PC si aspetta 800 (un quinto del tratto, col tetto del 5% della
     *   finestra), 320 o 560 token veri, e il pavimento misurato più l'atteso supera il 70%: «niente» è la regola del PC, senza
     *   chiamate; l'oracolo di B salvava perché il suo riassunto finto pesa la metà dell'atteso;
     * - «sprecata»: o si salva con la chiamata, o «niente» senza chiamare.
     */
    const casiDiB = [
        [0.4, 2_816, 1_024, 300, 12_000, 3, 'salva'], [0.4, 2_816, 1_024, 300, 12_000, 4, 'salva'], [0.4, 2_816, 1_024, 300, 12_000, 6, 'salva'],
        [0.4, 8_000, 512, 300, 16_000, 6, 'salva'], [0.4, 8_000, 512, 300, 24_000, 4, 'salva'], [0.4, 8_000, 512, 300, 24_000, 6, 'salva'],
        [0.4, 8_000, 512, 1_454, 16_000, 6, 'salva'], [0.4, 8_000, 512, 1_454, 24_000, 4, 'salva'], [0.4, 8_000, 512, 1_454, 24_000, 6, 'salva'],
        [0.7, 8_000, 512, 300, 16_000, 4, 'salva'], [0.7, 8_000, 512, 300, 16_000, 6, 'salva'],
        [0.7, 8_000, 512, 1_454, 16_000, 4, 'salva'], [0.7, 8_000, 512, 1_454, 16_000, 6, 'salva'],
        [0.4, 16_000, 0, 300, 24_000, 3, 'pc'], [0.7, 16_000, 0, 300, 24_000, 3, 'pc'],
        [0.7, 2_816, 1_024, 300, 8_000, 3, 'sprecata'], [0.7, 2_816, 1_024, 300, 8_000, 4, 'sprecata'], [0.7, 2_816, 1_024, 300, 8_000, 6, 'sprecata'],
        [0.7, 2_816, 1_024, 1_454, 4_000, 3, 'sprecata'], [0.7, 2_816, 1_024, 1_454, 4_000, 4, 'sprecata'], [0.7, 2_816, 1_024, 1_454, 4_000, 6, 'sprecata'],
    ] as const
    for (const [rapporto, finestraToken, riservaUscita, fisso, risposta, n, atteso] of casiDiB) {
        it(`DR-04 B: rapporto ${rapporto}, finestra ${finestraToken}/${riservaUscita}, fisso ${fisso}, risposte da ${risposta}, ${n} scambi: ${atteso}`, async () => {
            const c = await avviata({
                veri: (t) => fisso + Math.ceil(caratteri(t) / 4), fisso, rapporto, risposta: 'r'.repeat(risposta), n,
                finestra: { finestraToken, riservaUscita }, riassumi: obbediente(Math.round(rapporto * 400), rapporto),
            })
            const esito = await c.store.compattaOra(c.sessione)
            if (atteso === 'salva') {
                expect(esito).toMatchObject({ ok: true, compattato: true })
                expect(c.riassumi).toHaveBeenCalledTimes(1)
                await c.store.send('e adesso?')
                expect(await fallite(c)).toBe(0)
            } else if (atteso === 'pc') {
                expect(esito).toEqual({ ok: true, compattato: false, motivo: 'niente-da-guadagnare' })
                expect(c.riassumi).not.toHaveBeenCalled()
            } else {
                expect(c.riassumi.mock.calls.length).toBe(esito.ok && esito.compattato ? 1 : 0)
            }
        })
    }

    // Revisori B e C: la scansione di B. Nessuna chiamata pagata per niente: chi chiama il modello salva il riassunto.
    it('DR-05 B: 180 scenari a 0,4 e 0,7, nessuna chiamata sprecata con un modello che rispetta il tetto', async () => {
        const sprecate: string[] = []
        for (const rapporto of [0.4, 0.7]) for (const [finestraToken, riservaUscita] of [[2_816, 1_024], [8_000, 512], [16_000, 0]] as const) {
            for (const fisso of [300, 1_454]) for (const risposta of [4_000, 8_000, 12_000, 16_000, 24_000]) for (const n of [3, 4, 6]) {
                const c = await avviata({
                    veri: (t) => fisso + Math.ceil(caratteri(t) / 4), fisso, rapporto, risposta: 'r'.repeat(risposta), n,
                    finestra: { finestraToken, riservaUscita }, riassumi: obbediente(Math.round(rapporto * 400), rapporto),
                })
                let esito: unknown
                try { esito = await c.store.compattaOra(c.sessione) } catch (e) { esito = { errore: String(e) } }
                const salvato = (esito as { compattato?: boolean }).compattato === true
                if (c.riassumi.mock.calls.length > 0 && !salvato) sprecate.push(`${rapporto} ${finestraToken} ${fisso} ${risposta} ${n}`)
            }
        }
        expect(sprecate).toEqual([])
    }, 120_000)

    // Revisore C, reperto 1: il pavimento più il riassunto atteso non entra (1.488 + 400 > 1.791). Lo spazio libero diventa il tetto.
    it('DR-06 C: peso fisso 1.000, finestra 2.816: il riassunto si chiede col tetto dello spazio libero e si salva', async () => {
        const c = await avviata({
            veri: (t) => 1_000 + Math.ceil(caratteri(t) / 4), fisso: 1_000, risposta: 'r'.repeat(1_600), n: 5,
            finestra: { finestraToken: 2_816, riservaUscita: 1_024 }, riassumi: obbediente(400),
        })
        const esito = await c.store.compattaOra(c.sessione)
        const spazio = c.riassumi.mock.calls[0]![0].spazioDelRiassunto!
        expect(spazio).toBeGreaterThanOrEqual(140)
        expect(spazio).toBeLessThan(400)
        expect(esito).toMatchObject({ ok: true, compattato: true })
        expect(esito.ok && esito.compattato && esito.tokenDopo).toBeLessThanOrEqual(1_791)
    })

    it('DR-07 spazio sotto il minimo: «niente» subito, 0 chiamate', async () => {
        const c = await avviata({
            veri: (t) => 1_690 + Math.ceil(caratteri(t) / 4), fisso: 1_690, risposta: 'r'.repeat(1_600), n: 3,
            finestra: { finestraToken: 2_816, riservaUscita: 1_024 }, riassumi: obbediente(400),
        })
        expect(await c.store.compattaOra(c.sessione)).toEqual({ ok: true, compattato: false, motivo: 'niente-da-guadagnare' })
        expect(c.riassumi).not.toHaveBeenCalled()
    })

    // Il pavimento oltre la finestra si accorcia lasciando il posto al riassunto atteso: lo spazio libero ne è almeno il peso.
    it('DR-13 con scambi da togliere, il pavimento lascia al riassunto il posto dell\'atteso (400)', async () => {
        const c = await avviata({
            veri: (t) => 620 + Math.ceil(caratteri(t) / 4), fisso: 620, risposta: 'r'.repeat(1_600), n: 8,
            finestra: { finestraToken: 2_816, riservaUscita: 1_024 }, riassumi: obbediente(400),
        })
        expect(await c.store.compattaOra(c.sessione)).toMatchObject({ ok: true, compattato: true })
        expect(c.riassumi.mock.calls[0]![0].spazioDelRiassunto).toBeGreaterThanOrEqual(400)
    })

    it('DR-08 sotto la finestra la richiesta del riassunto non cambia: nessun tetto', async () => {
        const c = await avviata({ veri: (t) => 1_454 + Math.ceil(caratteri(t) / 4), fisso: 1_454, risposta: 'r'.repeat(1_610), n: 8 })
        expect(await c.store.compattaOra(c.sessione)).toMatchObject({ ok: true, compattato: true })
        expect(c.riassumi.mock.calls[0]![0]).not.toHaveProperty('spazioDelRiassunto')
    })

    // Il quinto punto del Tester (FIN-STORE-01: peso fisso 1.450, risposte da 1.600, finestra del Pad) coi riassunti veri del Pad.
    for (const naturali of [174, 240, 304]) {
        it(`DR-09 Tester, quinto punto: un modello che scriverebbe ${naturali} token rispetta il tetto e la quinta risposta parte`, async () => {
            const c = await avviata({
                veri: (t) => 1_450 + Math.ceil(caratteri(t) / 4), fisso: 1_450, risposta: 'r'.repeat(1_600), n: 4,
                finestra: { finestraToken: 2_816, riservaUscita: 1_024 }, riassumi: obbediente(naturali),
            })
            await c.store.send('Now write thirty numbered sentences about volcanoes and each one on its own line.')
            expect(await fallite(c)).toBe(0)
            expect(c.riassumi).toHaveBeenCalledTimes(1)
            expect(c.conta(c.stato.ricevuti.at(-1)!)).toBeLessThanOrEqual(c.limite)
            expect(await righeCompattazione(c)).toHaveLength(1)
        })
    }

    // Giudice v1598 (b) supera la regola di prima («si scarta, e torna l'errore di oggi»): su contesto pieno il riassunto che sfora il
    // tetto si TAGLIA nel limite, senza una seconda chiamata, e la risposta parte.
    it('DR-10 un riassunto che sfora lo stesso il tetto si taglia nel limite: una chiamata, una riga, e la quinta risposta parte', async () => {
        const c = await avviata({
            veri: (t) => 1_450 + Math.ceil(caratteri(t) / 4), fisso: 1_450, risposta: 'r'.repeat(1_600), n: 4,
            finestra: { finestraToken: 2_816, riservaUscita: 1_024 }, riassumi: async () => ({ ok: true, testo: 'S'.repeat(304 * 4) }),
        })
        await c.store.send('Now write thirty numbered sentences about volcanoes and each one on its own line.')
        expect(c.riassumi).toHaveBeenCalledTimes(1)
        expect(c.riassumi.mock.calls[0]![0].spazioDelRiassunto).toBeLessThan(304)
        expect(await righeCompattazione(c)).toHaveLength(1)
        expect(await fallite(c)).toBe(0)
        expect(c.conta(c.stato.ricevuti.at(-1)!)).toBeLessThanOrEqual(c.limite)
    })

    /*
     * ROSSO del Tester sulla 381 (11/11 23:49): finestra 2.304 col riserva di 1.024, 6 scambi, settima richiesta, «4462 token»
     * (la richiesta 3.437 più la riserva). Nessun riassunto, e a schermo l'errore del fornitore («Start a new chat…»). Misurato
     * sulla copia: con sistema e attrezzi da 1.100 il messaggio da solo entra (limite 1.279), ma il pavimento (sistema, attrezzi,
     * messaggio, cornice e indice) pesa 1.200 e lo spazio per il riassunto è 79, sotto il minimo di 115 (il 5% della finestra):
     * «niente», e torna l'errore del fornitore. Su «contesto pieno» il riassunto si chiede nello spazio che c'è; se non c'è
     * nemmeno quello (sistema e attrezzi da 1.201: il pavimento supera il limite), la chat lo dice coi numeri e con l'azione giusta.
     * Le risposte sono lunghe quanto serve perché la settima richiesta pesi ESATTAMENTE 3.437 token: 3.437 + 1.024 + 1 = 4.462.
     */
    const DOMANDA_DEL_TESTER = 'Now write thirty numbered sentences about volcanoes and each one on its own line.'
    const lunghezzaPer4462 = (fisso: number) => Math.floor(((3_437 - fisso) * 4 - 202) / 6)
    const pienoA2304 = (fisso: number, riassumi: Riassumi = obbediente(400), veri?: (t: readonly ChatTurn[]) => number) => avviata({
        veri: veri ?? ((t) => fisso + Math.ceil(caratteri(t) / 4)), fisso, risposta: 'r'.repeat(lunghezzaPer4462(fisso)), n: 6,
        finestra: { finestraToken: 2_304, riservaUscita: 1_024 }, riassumi,
    })
    const ultimoErrore = async (c: Awaited<ReturnType<typeof avviata>>) =>
        ((await c.repository.listMessages(c.sessione)).filter((r) => r.state === 'failed').at(-1)?.metadata?.chat_error ?? null) as { code?: string, message?: string } | null
    const servono = async (c: Awaited<ReturnType<typeof avviata>>) => {
        const turni = (await c.repository.listMessages(c.sessione)).filter((r) => r.role === 'user' || r.role === 'assistant')
            .map((r) => ({ role: r.role, content: r.content }) as ChatTurn)
        return c.conta([...turni, { role: 'user', content: DOMANDA_DEL_TESTER }]) + 1_024 + 1
    }

    it('DR-19 Tester 381, il caso esatto: servono 4.462 e il dispositivo ne dà 2.304; il riassunto si chiede nello spazio che c\'è e la risposta parte', async () => {
        const c = await pienoA2304(1_100)
        expect(await servono(c)).toBe(4_462)
        await c.store.send(DOMANDA_DEL_TESTER)
        expect(c.riassumi).toHaveBeenCalledTimes(1)
        expect(c.riassumi.mock.calls[0]![0]).toMatchObject({ motivo: 'overflow' })
        expect(c.riassumi.mock.calls[0]![0].spazioDelRiassunto).toBeLessThan(115)
        expect(await ultimoErrore(c)).toBeNull()
        expect(await righeCompattazione(c)).toHaveLength(1)
        expect(c.conta(c.stato.ricevuti.at(-1)!)).toBeLessThanOrEqual(c.limite)
    })

    it('DR-19b Tester 381 con sistema e attrezzi da 1.201: nessun riassunto ci sta, e la chat lo dice coi numeri invece dell\'errore del fornitore', async () => {
        const c = await pienoA2304(1_201)
        expect(await servono(c)).toBe(4_462)
        await c.store.send(DOMANDA_DEL_TESTER)
        expect(c.riassumi).not.toHaveBeenCalled()
        const errore = await ultimoErrore(c)
        expect(errore?.code).not.toBe('PROVIDER_CHAT_FAILED')
        expect(errore?.message).toMatch(/^This chat no longer fits this model on this device, even with the shortest summary: it needs about 2374 tokens and the model can take 2304 here\. Start a new chat \(your message fits there\), or turn off tools you do not need\.$/)
    })

    it('DR-20 Tester 381, il contrario: con sistema e attrezzi da 900 lo spazio c\'è, il riassunto si fa e la risposta parte', async () => {
        const c = await pienoA2304(900)
        await c.store.send('Now write thirty numbered sentences about volcanoes and each one on its own line.')
        expect(c.riassumi).toHaveBeenCalledTimes(1)
        expect(await fallite(c)).toBe(0)
        expect(await righeCompattazione(c)).toHaveLength(1)
    })

    /*
     * Revisore A, ripasso v1589 (giudice v1598). (a) Su contesto pieno il 70% di prima restava il bersaglio anche oltre la finestra:
     * lo spazio scendeva sotto zero quando il limite aveva posto, e 76 messaggi su 2.880 dicevano «servono 2.040-2.290, il modello
     * ne riceve 2.304». Il caso del suo elenco: sistema e attrezzi 800, risposte da 600 caratteri, 3 scambi. (a bis) L'ultima via
     * solo con un tetto di almeno 24 parole (48·k token). (b) Il modello piccolo che sfora il tetto (P1) non riporta l'errore del
     * fornitore: il riassunto si taglia a fine frase o riga. (c) Sotto il messaggio coi numeri nessun «Check the selected model».
     */
    const a2304 = (fisso: number, risposta: number, n: number, riassumi: Riassumi = obbediente(400)) => avviata({
        veri: (t) => fisso + Math.ceil(caratteri(t) / 4), fisso, risposta: 'r'.repeat(risposta), n,
        finestra: { finestraToken: 2_304, riservaUscita: 1_024 }, riassumi,
    })
    /** Il modello piccolo disobbediente con frasi vere: 12 frasi di 12 parole, ~150 token dove il tetto ne dà 79. */
    const FRASI = Array.from({ length: 12 }, (_, i) => `Fact ${i} was kept with all its numbers, names and dates in place.`).join(' ')
    const FRASE_INTERA = /Fact \d+ was kept with all its numbers, names and dates in place\./g
    const riassuntoSalvato = async (c: Awaited<ReturnType<typeof avviata>>) =>
        JSON.stringify((await righeCompattazione(c))[0]?.metadata?.[TALOS_METADATA_COMPATTAZIONE] ?? null)

    it('DR-21 (a) su contesto pieno il bersaglio è il limite: il caso 800/600/3 si riassume, e nessun messaggio dice «servono ≤ disponibili»', async () => {
        const c = await a2304(800, 600, 3)
        await c.store.send(DOMANDA_DEL_TESTER)
        expect(c.riassumi).toHaveBeenCalledTimes(1)
        expect(await fallite(c)).toBe(0)
        expect(await righeCompattazione(c)).toHaveLength(1)
        const incoerenti: string[] = []
        for (let fisso = 700; fisso <= 1_000; fisso += 50) for (let risposta = 200; risposta <= 900; risposta += 100) for (const n of [2, 3, 4, 6, 8]) {
            const s = await a2304(fisso, risposta, n)
            await s.store.send(DOMANDA_DEL_TESTER)
            const m = /needs about (\d+) tokens and the model can take (\d+)/.exec(s.store.state.lastError ?? '')
            if (m && Number(m[1]) <= Number(m[2])) incoerenti.push(`${fisso}/${risposta}/${n}: ${m[0]}`)
        }
        expect(incoerenti).toEqual([])
    })

    it('DR-22 (a bis) l\'ultima via chiede un tetto di almeno 24 parole: sotto, niente chiamata e i numeri esatti', async () => {
        // Misurato sulla copia (k = 1): con 1.131 lo spazio è 48; con 1.132 è 47 e servono 1.232 + 48 + 1.024 + 1 = 2.305.
        const sopra = await pienoA2304(1_131)
        await sopra.store.send(DOMANDA_DEL_TESTER)
        expect(sopra.riassumi).toHaveBeenCalledTimes(1)
        expect(sopra.riassumi.mock.calls[0]![0].spazioDelRiassunto).toBeGreaterThanOrEqual(48)
        const sotto = await pienoA2304(1_132)
        await sotto.store.send(DOMANDA_DEL_TESTER)
        expect(sotto.riassumi).not.toHaveBeenCalled()
        const errore = await ultimoErrore(sotto)
        expect(errore?.code).toBe('CHAT_EXECUTION_FAILED')
        expect(errore?.message).toContain(`it needs about 2305 tokens and the model can take 2304 here`)
    })

    it('DR-22b (a bis) la soglia è 48·k: con risposte che contano il doppio (k ≈ 1,6) lo spazio di ~73 token non basta', async () => {
        const erre = (t: readonly ChatTurn[]) => t.reduce((n, x) => n + (String(x.content ?? '').match(/r/g) ?? []).length, 0)
        const c = await avviata({
            veri: (t) => 1_100 + Math.ceil(caratteri(t) / 4) + Math.ceil(erre(t) / 4), fisso: 1_100, risposta: 'r'.repeat(1_200), n: 6,
            finestra: { finestraToken: 2_304, riservaUscita: 1_024 }, riassumi: obbediente(400),
        })
        await c.store.send(DOMANDA_DEL_TESTER)
        expect(c.riassumi).not.toHaveBeenCalled()
        // Misurato sulla copia: col solo 48 (senza k) qui si chiedeva un riassunto da 45 parole di spazio.
        expect((await ultimoErrore(c))?.message).toContain('it needs about 2309 tokens and the model can take 2304 here')
    })

    it('DR-25 (a) «Compatta ora» oltre la finestra tiene il 70%: il bersaglio al limite vale solo sul contesto pieno', async () => {
        const c = await avviata({
            veri: (t) => 300 + Math.ceil(caratteri(t) / 4), fisso: 300, risposta: 'r'.repeat(1_200), n: 6,
            finestra: { finestraToken: 2_816, riservaUscita: 1_024 }, riassumi: obbediente(400),
        })
        const esito = await c.store.compattaOra(c.sessione) as { compattato?: boolean, tokenPrima?: number, tokenDopo?: number }
        // Tabella prima e dopo (giudice v1598): 2.130 prima, il 70% è 1.491 sotto il limite di 1.791; lo spazio resta 499.
        expect(esito.compattato).toBe(true)
        expect(esito.tokenPrima).toBe(2_130)
        expect(c.riassumi.mock.calls[0]![0].spazioDelRiassunto).toBe(499)
        expect(esito.tokenDopo).toBeLessThanOrEqual(1_491)
    })

    it('DR-23 (b) il modello piccolo sfora il tetto: il riassunto si taglia a fine frase, una chiamata sola, la risposta parte', async () => {
        const c = await pienoA2304(1_100, async () => ({ ok: true as const, testo: FRASI }))
        await c.store.send(DOMANDA_DEL_TESTER)
        expect(c.riassumi).toHaveBeenCalledTimes(1)
        expect(await fallite(c)).toBe(0)
        expect(await righeCompattazione(c)).toHaveLength(1)
        expect(c.conta(c.stato.ricevuti.at(-1)!)).toBeLessThanOrEqual(c.limite)
        const salvato = await riassuntoSalvato(c)
        // Solo frasi intere: ogni «Fact N» che resta ha la sua frase fino al punto, e l'ultima frase non c'è.
        const intere = (salvato.match(FRASE_INTERA) ?? []).length
        expect(intere).toBeGreaterThan(0)
        expect((salvato.match(/Fact \d+/g) ?? []).length).toBe(intere)
        expect(salvato).not.toContain('Fact 11 ')
    })

    it('DR-23b (b) il caso P1 del revisore (120 token senza frasi): al più una chiamata e mai l\'errore del fornitore', async () => {
        const c = await pienoA2304(1_100, async () => ({ ok: true as const, testo: 'S'.repeat(480) }))
        await c.store.send(DOMANDA_DEL_TESTER)
        expect(c.riassumi.mock.calls.length).toBeLessThanOrEqual(1)
        expect((await ultimoErrore(c))?.code).not.toBe('PROVIDER_CHAT_FAILED')
        expect(await fallite(c)).toBe(0)
    })

    const zeta = (t: readonly ChatTurn[]) => t.reduce((n, x) => n + (String(x.content ?? '').match(/Z/g) ?? []).length, 0)
    it('DR-23c (b) se anche tagliato il riassunto non entra (ogni testo con una «Z» costa 200 token in più): i numeri, non il fornitore', async () => {
        const c = await pienoA2304(1_100, async () => ({ ok: true as const, testo: 'Z'.repeat(400) }),
            (t) => 1_100 + Math.ceil((caratteri(t) - zeta(t)) / 4) + zeta(t) + (zeta(t) > 0 ? 200 : 0))
        await c.store.send(DOMANDA_DEL_TESTER)
        expect(c.riassumi).toHaveBeenCalledTimes(1)
        const errore = await ultimoErrore(c)
        expect(errore?.code).toBe('CHAT_EXECUTION_FAILED')
        expect(errore?.message).toMatch(/^This chat no longer fits this model on this device, even with the shortest summary: it needs about (\d+) tokens and the model can take 2304 here\./)
        expect(Number(/needs about (\d+)/.exec(errore?.message ?? '')?.[1])).toBeGreaterThan(2_304)
        expect(await righeCompattazione(c)).toHaveLength(0)
    })

    it('DR-23d (b) frasi dense in testa e leggere in coda: il primo taglio non basta, il secondo giro sì; una chiamata, la risposta parte', async () => {
        const pesanti = Array.from({ length: 30 }, (_, i) => `Fact ${i} ZZZZZZZZZZ kept.`)
        const leggere = Array.from({ length: 30 }, (_, i) => `Note ${i} kept.`)
        const c = await pienoA2304(1_100, async () => ({ ok: true as const, testo: [...pesanti, ...leggere].join(' ') }),
            (t) => 1_100 + Math.ceil((caratteri(t) - zeta(t)) / 4) + zeta(t))
        await c.store.send(DOMANDA_DEL_TESTER)
        expect(c.riassumi).toHaveBeenCalledTimes(1)
        expect(await fallite(c)).toBe(0)
        expect(await righeCompattazione(c)).toHaveLength(1)
        expect(c.conta(c.stato.ricevuti.at(-1)!)).toBeLessThanOrEqual(c.limite)
    })

    it('DR-24 (c) sotto il messaggio coi numeri nessun consiglio generico', async () => {
        const c = await pienoA2304(1_201)
        await c.store.send(DOMANDA_DEL_TESTER)
        const errore = await ultimoErrore(c) as { next_action?: unknown } | null
        expect(errore).not.toBeNull()
        expect(errore?.next_action ?? null).toBeNull()
    })
})

describe('Telefono 0.1.48 — giro di k (giudice v1556): lo spazio in parole conta k', () => {
    /*
     * Revisore A, secondo passaggio, cancello 2: il controller chiede spazio/2 parole (`chatControllerCompattazione.ts`). Una parola di
     * 5 caratteri pesa 1,25 nella stima del PC e k volte tanto in token veri: con k 2,5 sono ~3,1 token, e un modello che RISPETTA il
     * tetto sforava lo spazio. Il modello qui sotto è quello del revisore (`revA2Scenari.test.ts`, REVA_ONESTO): parole «ssss » fino
     * al tetto in parole, mai più del suo riassunto naturale (1.600 caratteri). Casi copiati dalle sue scansioni: B 15 su 360 (r 2,5,
     * finestra del Pad, peso fisso 300), C 28 su 168 (motore a 2,5 volte la stima, cornice 0 o 6, fisso 300 su 2.816 e 1.454 su 4.096).
     */
    const inParole = (caratteriNaturali = 1_600): Riassumi => async (input: TalosRiassumiInput) => ({
        ok: true as const,
        testo: input.spazioDelRiassunto !== undefined
            ? 'ssss '.repeat(Math.max(1, Math.min(Math.ceil(caratteriNaturali / 5), Math.floor(input.spazioDelRiassunto / 2))))
            : 'S'.repeat(caratteriNaturali),
    })

    it('DR-14 B: fornitore tarato a 2,5 sul Pad, 15 scenari: chi chiama il modello salva, e l\'invio dopo parte', async () => {
        const rotti: string[] = []
        for (const risposta of [4_000, 8_000, 12_000, 16_000, 24_000]) for (const n of [3, 4, 6]) {
            const c = await avviata({
                veri: (t) => 300 + Math.ceil(caratteri(t) / 4), fisso: 300, rapporto: 2.5, risposta: 'r'.repeat(risposta), n,
                finestra: { finestraToken: 2_816, riservaUscita: 1_024 }, riassumi: inParole(),
            })
            let esito: unknown
            try { esito = await c.store.compattaOra(c.sessione) } catch (e) { esito = { errore: String(e) } }
            const sprecata = c.riassumi.mock.calls.length > 0 && (esito as { compattato?: boolean }).compattato !== true
            try { await c.store.send('e adesso?') } catch { /* resta nella riga */ }
            const invioFallito = await fallite(c) > 0
            if (sprecata || invioFallito) rotti.push(`${risposta}×${n}${sprecata ? ' sprecata' : ''}${invioFallito ? ' invio fallito' : ''}`)
        }
        expect(rotti).toEqual([])
    }, 120_000)

    it('DR-15 C: motore a 2,5 volte la stima, 28 scenari: nessuna chiamata pagata per un riassunto che poi si scarta', async () => {
        const sprecate: string[] = []
        for (const [fisso, finestraToken] of [[300, 2_816], [1_454, 4_096]] as const) for (const cornice of [0, 6]) for (const n of [4, 5, 6, 7, 8, 10, 14]) {
            const c = await avviata({
                veri: (t) => fisso + Math.round(t.reduce((s, x) => s + 2.5 * Math.ceil(String(x.content ?? '').length / 4) + cornice, 0)),
                fisso, risposta: 'r'.repeat(1_610), n, finestra: { finestraToken, riservaUscita: 1_024 }, riassumi: inParole(),
            })
            const esito = await c.store.compattaOra(c.sessione)
            if (c.riassumi.mock.calls.length > 0 && !(esito.ok && esito.compattato)) sprecate.push(`${fisso}/${finestraToken} cornice ${cornice} ${n} scambi`)
        }
        expect(sprecate).toEqual([])
    }, 120_000)

    /*
     * Ripasso del revisore A (giudice v1565): i due mutanti vivi.
     * - DR-16, sotto 1 il tetto non si allarga: la richiesta costa poco (0,4 token veri per unità di stima) ma il riassunto è prosa
     *   a 1 token per unità (parole «zzzz »). Diviso per il rapporto grezzo, lo spazio crescerebbe fino a 2,5 volte e il riassunto
     *   obbediente sforerebbe; con kValido resta lo spazio vero.
     * - DR-17, k fra 2 e 4: a 3,5 una parola «ssss » costa ~4,4 token veri. Con k fermato a 2 il riassunto obbediente sfora.
     * In tutte e due si chiede anche che almeno un riassunto si salvi, perché la prova passi davvero dalla via del tetto.
     */
    const zeta = (t: readonly ChatTurn[]) => t.reduce((n, x) => n + (String(x.content ?? '').match(/z/g) ?? []).length, 0)
    const scansione = async (s: { veri: (t: readonly ChatTurn[]) => number, rapporto?: number, riassumi: Riassumi, fissi: readonly number[], finestra?: { finestraToken: number, riservaUscita: number } }) => {
        const esiti = { salvati: 0, rotti: [] as string[] }
        for (const fisso of s.fissi) for (const risposta of [1_610, 4_000, 8_000]) for (const n of [3, 4, 6, 8]) {
            const c = await avviata({
                veri: (t) => s.veri(t) + fisso, fisso, ...(s.rapporto ? { rapporto: s.rapporto } : {}), risposta: 'r'.repeat(risposta), n,
                finestra: s.finestra ?? { finestraToken: 2_816, riservaUscita: 1_024 }, riassumi: s.riassumi,
            })
            let esito: unknown
            try { esito = await c.store.compattaOra(c.sessione) } catch (e) { esito = { errore: String(e) } }
            // Solo la via del tetto: le richieste che portano lo spazio (oltre la finestra).
            const spazio = c.riassumi.mock.calls[0]?.[0].spazioDelRiassunto
            if (spazio === undefined) continue
            const salvato = (esito as { compattato?: boolean }).compattato === true
            if (salvato) esiti.salvati += 1
            else esiti.rotti.push(`fisso ${fisso}, risposte ${risposta}, ${n} scambi: ${JSON.stringify(esito)}, spazio ${spazio}`)
        }
        return esiti
    }
    const inParoleZ: Riassumi = async (input: TalosRiassumiInput) => ({
        ok: true as const,
        testo: input.spazioDelRiassunto !== undefined ? 'zzzz '.repeat(Math.max(1, Math.min(320, Math.floor(input.spazioDelRiassunto / 2)))) : 'z'.repeat(1_600),
    })

    it('DR-16 sotto 1 il tetto in parole non si allarga: richiesta a 0,4, riassunto in prosa a 1, nessuna chiamata sprecata oltre la finestra', async () => {
        const esiti = await scansione({
            veri: (t) => Math.round(0.4 * Math.ceil((caratteri(t) - zeta(t)) / 4)) + Math.ceil((zeta(t) * 5) / 16),
            riassumi: inParoleZ, fissi: [120, 300, 600],
        })
        expect(esiti.rotti).toEqual([])
        expect(esiti.salvati).toBeGreaterThan(0)
    }, 120_000)

    it('DR-17 k a 3,5: lo spazio si divide per k intero (non fermato a 2), nessuna chiamata sprecata oltre la finestra', async () => {
        const esiti = await scansione({ veri: (t) => Math.ceil(caratteri(t) / 4), rapporto: 3.5, riassumi: inParole(4_000), fissi: [60, 120, 200],
            finestra: { finestraToken: 8_000, riservaUscita: 512 },
        })
        expect(esiti.rotti).toEqual([])
        expect(esiti.salvati).toBeGreaterThan(0)
    }, 120_000)
})

describe('Telefono 0.1.48 — dopo i revisori: la mediana come il PC (R2) e la rimisura (C8)', () => {
    // R2: un riassunto arrivato e rifiutato entra nella mediana, come `session-registry.mjs:6755-6757`.
    it('DR-11 un riassunto rifiutato pesa nella mediana: il giro dopo dice «niente» senza chiamare il modello', async () => {
        const c = await avviata({
            veri: (t) => 1_454 + Math.ceil(caratteri(t) / 4), fisso: 1_454, risposta: 'r'.repeat(1_610), n: 8,
            riassumi: async () => ({ ok: true, testo: 'L'.repeat(40_000) }),
        })
        expect(await c.store.compattaOra(c.sessione)).toEqual({ ok: true, compattato: false, motivo: 'niente-da-guadagnare' })
        expect(c.riassumi).toHaveBeenCalledTimes(1)
        expect(await c.store.compattaOra(c.sessione)).toEqual({ ok: true, compattato: false, motivo: 'niente-da-guadagnare' })
        expect(c.riassumi).toHaveBeenCalledTimes(1)
    })

    /*
     * Giudice v1575 (ripasso del revisore A, mutante «R2, la mediana riparte da vuoto»): dopo un riavvio la mediana si ricostruisce
     * dalle righe, e il primo riassunto arrivato le si AGGIUNGE. Prima del riavvio un riassunto da 800 si salva; dopo, uno da 50.
     * Con le righe la mediana tiene anche l'800 e il terzo giro dice «niente» senza chiamare; ripartendo da vuoto sarebbe 50 e
     * si pagherebbe un'altra chiamata. Casi trovati con una griglia sulla copia: testa e mutante differiscono solo qui (4 su 60).
     */
    it('DR-18 dopo un riavvio a metà chat la mediana riparte dalle righe, non da vuoto', async () => {
        const conta = (t: readonly ChatTurn[]) => 1_454 + Math.ceil(caratteri(t) / 4)
        const avvia = (repository: ReturnType<typeof createMemoryChatRepository>, riassumi: Riassumi) => {
            let k = 0
            return createChatStore(vi.fn<ChatCompletion>(async () => ({ text: `risposta ${++k} ${'r'.repeat(1_610)}`, finishReason: 'stop' as const })), {
                repository, translate: talosTestT('en'), riassumiConversazione: riassumi,
                misuraRichiesta: vi.fn<Misura>(async ({ turni }) => ({ token: conta(turni), misura: 'fornitore' as const, stima: stimaDelPc(turni, 1_454) })),
            })
        }
        const repository = createMemoryChatRepository()
        const prima = avvia(repository, async () => ({ ok: true, testo: 'S'.repeat(3_200) }))
        await prima.initialize()
        for (let i = 0; i < 8; i += 1) await prima.send(`domanda ${i}`)
        const sessione = prima.activeSession.value!.id
        expect(await prima.compattaOra(sessione)).toMatchObject({ ok: true, compattato: true })

        // Riavvio: uno store nuovo sulle stesse righe, senza niente in memoria.
        const riassumi = vi.fn<Riassumi>(async () => ({ ok: true, testo: 'P'.repeat(200) }))
        const dopo = avvia(repository, riassumi)
        await dopo.initialize()
        await dopo.selectSession(sessione)
        for (let i = 0; i < 4; i += 1) await dopo.send(`dopo ${i}`)
        expect(await dopo.compattaOra(sessione)).toMatchObject({ ok: true, compattato: true })
        expect(riassumi).toHaveBeenCalledTimes(1)
        for (let i = 0; i < 3; i += 1) await dopo.send(`poi ${i}`)
        expect(await dopo.compattaOra(sessione)).toEqual({ ok: true, compattato: false, motivo: 'niente-da-guadagnare' })
        expect(riassumi).toHaveBeenCalledTimes(1)
    })

    /*
     * C8: l'accorciamento stima a quattro caratteri per token, poi rimisura. Qui le domande sono «leggere» (un token ogni venti
     * caratteri, come un testo che il tokenizzatore comprime) e la risposta del terzo scambio è densa (un token a carattere): il
     * primo giro toglie le richieste tenute alla lettera, la stima dice che basta e la misura vera no; i giri dopo stringono finché
     * entra anche togliendo il terzo scambio.
     */
    it('DR-12 la rimisura stringe finché la richiesta sta nel limite (più di un giro)', async () => {
        const conta = (t: readonly ChatTurn[]) => {
            const testo = t.map((x) => String(x.content ?? '')).join('')
            const y = (testo.match(/y/g) ?? []).length
            const x = (testo.match(/x/g) ?? []).length
            return 1_200 + Math.ceil(y / 20) + x + Math.ceil((testo.length - y - x) / 4)
        }
        const c = chat({
            veri: conta, fisso: 1_200, risposta: (k) => (k === 3 ? 'x'.repeat(400) : 'r'.repeat(400)), n: 4,
            finestra: { finestraToken: 2_816, riservaUscita: 1_024 }, riassumi: obbediente(200),
        })
        await c.store.initialize()
        for (let i = 0; i < 4; i += 1) await c.store.send(`domanda ${i} ${'y'.repeat(3_000)}`)
        c.stato.accesa = true
        const esito = await c.store.compattaOra(c.store.activeSession.value!.id)
        expect(esito).toMatchObject({ ok: true, compattato: true })
        expect(esito.ok && esito.compattato && esito.tokenDopo).toBeLessThanOrEqual(c.limite)
    })
})

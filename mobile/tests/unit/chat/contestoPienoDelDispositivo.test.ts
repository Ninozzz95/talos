import { describe, expect, it, vi } from 'vitest'
import { createChatStore, type ChatCompletion, type ChatStoreOptions, type ChatTurn, type TalosRiassumiInput } from '@/stores/chat'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { TALOS_METADATA_COMPATTAZIONE, turniVersoNucleo } from '@/lib/chat/compattazioneChat'
import { TalosMobileProviderError } from '@/lib/chat/providerErrors'
import { stimaConPezziDelPc } from '@/lib/kernel/compattazione'
import { finestraColTettoDelRifiuto } from '@/stores/chatCompattazione'
import { talosTestT } from '../../helpers/talosTestI18n'

/*
 * Telefono 0.1.48 — ROSSO del Tester sulla 382 (giudice v1623): contesto aperto 5.120, tetto sicuro del dispositivo 3.328 e poi
 * 4.096, richieste da 6.416 e 6.432 token: a schermo il testo del FORNITORE («…can safely give this model 3328»), nessun
 * riassunto. Causa misurata: il rifiuto del motore locale nasce col codice `TALOS_LOCAL_PROMPT_TOO_LONG`
 * (`localAdapter.ts`, `promptTooLongFailure`), ma il controller lo rilancia col messaggio GIÀ TRADOTTO
 * (`chatController.ts`, `safeProviderMessage`), e il classificatore del contesto pieno legge solo messaggio e codice: la frase
 * «This conversation and its tools need about… can safely give…» non somiglia a nessun modello ⇒ nessuna compattazione, e
 * l'errore del fornitore a schermo. Le prove di prima lanciavano il rifiuto col codice nudo, cioè come il motore e non come
 * il controller: per questo erano verdi.
 * Qui il dispositivo FINTO risponde come il controller (frase tradotta, chiave e numeri), e il tetto cambia fra la lettura
 * (la finestra che il telefono ricorda) e l'invio.
 */
type Riassumi = NonNullable<ChatStoreOptions['riassumiConversazione']>
const caratteri = (t: readonly ChatTurn[]) => t.reduce((n, x) => n + String(x.content ?? '').length, 0)
const t = talosTestT('en')
const RISERVA = 1_024

/** Il rifiuto come arriva allo store dal controller: la frase già tradotta, la chiave e i numeri. */
function rifiutoDelController(servono: number, tetto: number) {
    const uiMessageParameters = { required: String(servono), available: String(tetto) }
    return new TalosMobileProviderError({
        provider: 'local', operation: 'complete', message: t('models.localPromptTooLongMeasured', uiMessageParameters),
        uiMessageKey: 'models.localPromptTooLongMeasured', uiMessageParameters,
    })
}

const obbediente = (naturali: number): Riassumi => async (input: TalosRiassumiInput) => {
    const token = input.spazioDelRiassunto !== undefined ? Math.min(naturali, Math.floor((input.spazioDelRiassunto / 2) * 1.5)) : naturali
    return { ok: true as const, testo: 'S'.repeat(Math.max(1, Math.floor(token * 4))) }
}

interface Dispositivo { fisso: number, risposta: number, n: number, letto: number, tetti: number[] }
async function dispositivo(s: Dispositivo) {
    const veri = (turni: readonly ChatTurn[]) => s.fisso + Math.ceil(caratteri(turni) / 4)
    const stato = { acceso: false, k: 0, invii: 0, ricevuti: [] as ChatTurn[][] }
    const complete: ChatCompletion = vi.fn(async (turni) => {
        if (stato.acceso) {
            // Il tetto sicuro di QUESTO invio: cambia da un invio all'altro con la stessa memoria.
            const tetto = s.tetti[Math.min(stato.invii, s.tetti.length - 1)]!
            stato.invii += 1
            const servono = veri(turni) + RISERVA + 1
            if (servono > tetto) throw rifiutoDelController(servono, tetto)
        }
        stato.ricevuti.push(turni.map((x) => ({ ...x })))
        stato.k += 1
        return { text: `risposta ${stato.k} ${'r'.repeat(s.risposta)}`, finishReason: 'stop' as const }
    })
    const riassumi = vi.fn<Riassumi>(obbediente(400))
    const repository = createMemoryChatRepository()
    const store = createChatStore(complete, {
        repository, translate: t, riassumiConversazione: riassumi,
        misuraRichiesta: async ({ turni }) => ({ token: veri(turni), misura: 'motore' as const, stima: s.fisso + stimaConPezziDelPc(turniVersoNucleo(turni)) }),
        // La finestra che il telefono ricorda dall'ultimo giro: il contesto aperto, più grande del tetto sicuro di adesso.
        finestraPerCompattazione: vi.fn(() => (stato.acceso ? { finestraToken: s.letto, riservaUscita: RISERVA, tettoToken: null, promptTokens: null } : null)),
    })
    await store.initialize()
    for (let i = 0; i < s.n; i += 1) await store.send(`domanda ${i}`)
    stato.acceso = true
    const sessione = store.activeSession.value!.id
    const righe = async () => repository.listMessages(sessione)
    const errore = async () => ((await righe()).filter((r) => r.state === 'failed').at(-1)?.metadata?.chat_error ?? null) as { code?: string, message?: string } | null
    return { store, riassumi, stato, veri, righe, errore }
}

describe('Telefono 0.1.48 — il rifiuto del dispositivo dopo la 382 (giudice v1623)', () => {
    it('CP-382-01 caso (2) del Tester: letto 5.120, al momento dell\'invio 4.096; il telefono prende 4.096, riassume e riprova UNA volta', async () => {
        const c = await dispositivo({ fisso: 1_000, risposta: 2_400, n: 7, letto: 5_120, tetti: [4_096] })
        await c.store.send('ancora una domanda corta')
        expect(c.riassumi).toHaveBeenCalledTimes(1)
        expect(c.riassumi.mock.calls[0]![0].motivo).toBe('overflow')
        expect(c.stato.invii).toBe(2)
        expect(await c.errore()).toBeNull()
        expect((await c.righe()).filter((r) => r.metadata?.[TALOS_METADATA_COMPATTAZIONE])).toHaveLength(1)
        expect(c.veri(c.stato.ricevuti.at(-1)!) + RISERVA + 1).toBeLessThanOrEqual(4_096)
        expect(c.store.state.lastError ?? '').not.toContain('can safely give')
    })

    it('CP-382-02 caso (1) del Tester: un messaggio da 2.137 token col tetto 3.328: il testo nuovo coi numeri, mai quello del fornitore', async () => {
        const c = await dispositivo({ fisso: 1_000, risposta: 2_400, n: 7, letto: 5_120, tetti: [3_328] })
        await c.store.send('m'.repeat(2_137 * 4))
        expect(c.riassumi).not.toHaveBeenCalled()
        const errore = await c.errore()
        expect(errore?.code).toBe('CHAT_EXECUTION_FAILED')
        expect(errore?.message).toMatch(/^Your message and the tools need about \d+ tokens even without the earlier conversation, and this model can take 3328 here\. /)
        expect(errore?.message).not.toContain('can safely give')
    })

    it('CP-382-03 il dispositivo rifiuta anche il ritentativo (tetto sceso ancora): i numeri del telefono, mai il testo del fornitore, un solo riassunto', async () => {
        const c = await dispositivo({ fisso: 1_000, risposta: 2_400, n: 7, letto: 5_120, tetti: [4_096, 2_304] })
        await c.store.send('ancora una domanda corta')
        expect(c.riassumi).toHaveBeenCalledTimes(1)
        expect(c.stato.invii).toBe(2)
        const errore = await c.errore()
        expect(errore?.code).toBe('CHAT_EXECUTION_FAILED')
        expect(errore?.message).toMatch(/^This chat no longer fits this model on this device, even with the shortest summary: it needs about \d+ tokens and the model can take 2304 here\./)
        expect(errore?.message).not.toContain('can safely give')
    })

    it('CP-382-05 niente da riassumere (un solo scambio) e la richiesta non entra: i numeri del rifiuto detti dal telefono', async () => {
        const c = await dispositivo({ fisso: 1_000, risposta: 8_000, n: 1, letto: 5_120, tetti: [3_328] })
        await c.store.send('una domanda corta')
        expect(c.riassumi).not.toHaveBeenCalled()
        const errore = await c.errore()
        expect(errore?.code).toBe('CHAT_EXECUTION_FAILED')
        // Giudice v1630 (revisore A): nessun riassunto fatto ⇒ mai «col riassunto più breve»; i numeri sono quelli della richiesta rifiutata.
        expect(errore?.message).toMatch(/^This chat needs about \d+ tokens and this model can take 3328 on this device right now, and a summary could not make it fit\./)
        expect(errore?.message).not.toContain('shortest summary')
        expect(errore?.message).not.toContain('can safely give')
    })

    it('CP-382-06 il rifiuto senza misura (chiave senza numeri) fa scattare lo stesso il riassunto, con la finestra letta', async () => {
        // Il motore senza misura: la chiave «senza numeri», un testo diverso; rifiuta una volta sola.
        const veri = (turni: readonly ChatTurn[]) => 1_000 + Math.ceil(caratteri(turni) / 4)
        const errorePrimo = new TalosMobileProviderError({ provider: 'local', operation: 'complete', message: t('models.localPromptTooLong'), uiMessageKey: 'models.localPromptTooLong' })
        let rifiutato = false
        const riassumi = vi.fn<Riassumi>(obbediente(400))
        const repository = createMemoryChatRepository()
        const st = { acceso: false, k: 0, ultimi: [] as ChatTurn[] }
        const comp: ChatCompletion = vi.fn(async (turni) => {
            if (st.acceso && !rifiutato) { rifiutato = true; throw errorePrimo }
            st.ultimi = turni.map((x) => ({ ...x }))
            st.k += 1
            return { text: `risposta ${st.k} ${'r'.repeat(2_400)}`, finishReason: 'stop' as const }
        })
        const s2 = createChatStore(comp, {
            repository, translate: t, riassumiConversazione: riassumi,
            misuraRichiesta: async ({ turni }) => ({ token: veri(turni), misura: 'motore' as const, stima: 1_000 + stimaConPezziDelPc(turniVersoNucleo(turni)) }),
            finestraPerCompattazione: vi.fn(() => (st.acceso ? { finestraToken: 4_096, riservaUscita: RISERVA, tettoToken: null, promptTokens: null } : null)),
        })
        await s2.initialize()
        for (let i = 0; i < 7; i += 1) await s2.send(`domanda ${i}`)
        st.acceso = true
        await s2.send('ancora una domanda corta')
        expect(riassumi).toHaveBeenCalledTimes(1)
        expect(s2.state.lastError).toBeNull()
        expect(veri(st.ultimi) + RISERVA + 1).toBeLessThanOrEqual(4_096)
    })

    it('CP-382-08 rifiuto senza misura anche al ritentativo: la frase del telefono senza numeri, mai «about null tokens»', async () => {
        const veri = (turni: readonly ChatTurn[]) => 1_000 + Math.ceil(caratteri(turni) / 4)
        const st = { acceso: false, k: 0, invii: 0 }
        const comp: ChatCompletion = vi.fn(async () => {
            if (st.acceso) {
                st.invii += 1
                throw new TalosMobileProviderError({ provider: 'local', operation: 'complete', message: t('models.localPromptTooLong'), uiMessageKey: 'models.localPromptTooLong' })
            }
            st.k += 1
            return { text: `risposta ${st.k} ${'r'.repeat(2_400)}`, finishReason: 'stop' as const }
        })
        const repository = createMemoryChatRepository()
        const riassumi = vi.fn<Riassumi>(obbediente(400))
        const s2 = createChatStore(comp, {
            repository, translate: t, riassumiConversazione: riassumi,
            misuraRichiesta: async ({ turni }) => ({ token: veri(turni), misura: 'motore' as const, stima: 1_000 + stimaConPezziDelPc(turniVersoNucleo(turni)) }),
            finestraPerCompattazione: vi.fn(() => (st.acceso ? { finestraToken: 4_096, riservaUscita: RISERVA, tettoToken: null, promptTokens: null } : null)),
        })
        await s2.initialize()
        for (let i = 0; i < 7; i += 1) await s2.send(`domanda ${i}`)
        st.acceso = true
        await s2.send('ancora una domanda corta')
        expect(riassumi).toHaveBeenCalledTimes(1)
        expect(st.invii).toBe(2)
        const righe = await repository.listMessages(s2.activeSession.value!.id)
        const errore = righe.filter((r) => r.state === 'failed').at(-1)?.metadata?.chat_error as { message?: string } | undefined
        // Giudice v1630 (revisore A, RA6-04/RL-04): il rifiuto senza misura non va a schermo com'è: la frase del telefono, senza cifre.
        expect(errore?.message).toBe(t('chat.compaction.deviceTooLong'))
        expect(errore?.message).not.toMatch(/\d/)
        expect(errore?.message).not.toContain('null')
    })

    it('CP-382-09 senza riassunto disponibile: il rifiuto si dice con le frasi del telefono, misurato o no', async () => {
        for (const misurato of [true, false]) {
            const repository = createMemoryChatRepository()
            const comp: ChatCompletion = vi.fn(async () => {
                throw misurato ? rifiutoDelController(7_441, 3_328)
                    : new TalosMobileProviderError({ provider: 'local', operation: 'complete', message: t('models.localPromptTooLong'), uiMessageKey: 'models.localPromptTooLong' })
            })
            const s2 = createChatStore(comp, { repository, translate: t })
            await s2.initialize()
            await s2.send('una domanda')
            const righe = await repository.listMessages(s2.activeSession.value!.id)
            const errore = righe.filter((r) => r.state === 'failed').at(-1)?.metadata?.chat_error as { code?: string, message?: string } | undefined
            expect(errore?.code).toBe('CHAT_EXECUTION_FAILED')
            expect(errore?.message).toBe(misurato
                ? t('chat.compaction.deviceTooLongMeasured', { required: '7441', available: '3328' })
                : t('chat.compaction.deviceTooLong'))
        }
    })

    // Fuori da questo giro, detto nel rapporto: un errore che arriva DOPO lo Stop si salva com'è (catch esterno, solo `AbortError`), come prima.
    it('CP-382-10 Stop durante l\'invio rifiutato: nessun riassunto e nessun ritentativo dopo lo Stop', async () => {
        const repository = createMemoryChatRepository()
        const riassumi = vi.fn<Riassumi>(obbediente(400))
        let store: ReturnType<typeof createChatStore> | null = null
        const comp: ChatCompletion = vi.fn(async () => {
            store!.stopStreaming()
            throw rifiutoDelController(7_441, 3_328)
        })
        const finestra = vi.fn(() => ({ finestraToken: 5_120, riservaUscita: RISERVA, tettoToken: null, promptTokens: null }))
        store = createChatStore(comp, { repository, translate: t, riassumiConversazione: riassumi, finestraPerCompattazione: finestra })
        await store.initialize()
        await store.send('una domanda')
        expect(riassumi).not.toHaveBeenCalled()
        expect(finestra).not.toHaveBeenCalled()
        expect(comp).toHaveBeenCalledTimes(1)
    })

    it('CP-382-07 la finestra col tetto del rifiuto: il minore fra letta e detta; senza lettura vale il tetto; senza tetto resta la letta', () => {
        const letta = { finestraToken: 2_304, riservaUscita: RISERVA, tettoToken: null, promptTokens: 7 }
        expect(finestraColTettoDelRifiuto(letta, 4_096)).toEqual({ ...letta, finestraToken: 2_304 })
        expect(finestraColTettoDelRifiuto({ ...letta, finestraToken: 5_120 }, 4_096)).toEqual({ ...letta, finestraToken: 4_096 })
        expect(finestraColTettoDelRifiuto(null, 3_328)).toEqual({ finestraToken: 3_328, riservaUscita: null, tettoToken: null, promptTokens: null })
        expect(finestraColTettoDelRifiuto({ ...letta, finestraToken: null }, 3_328)).toEqual({ ...letta, finestraToken: 3_328 })
        expect(finestraColTettoDelRifiuto(letta, null)).toBe(letta)
        expect(finestraColTettoDelRifiuto(letta, 0)).toBe(letta)
        expect(finestraColTettoDelRifiuto(letta, Number.NaN)).toBe(letta)
    })

    it('CP-382-04 in italiano lo stesso: la frase tradotta del fornitore non deve decidere niente', async () => {
        const it_ = talosTestT('it')
        const veri = (turni: readonly ChatTurn[]) => 1_000 + Math.ceil(caratteri(turni) / 4)
        const stato = { acceso: false, k: 0 }
        const complete: ChatCompletion = vi.fn(async (turni) => {
            const servono = veri(turni) + RISERVA + 1
            if (stato.acceso && servono > 4_096) {
                const p = { required: String(servono), available: '4096' }
                throw new TalosMobileProviderError({ provider: 'local', operation: 'complete', message: it_('models.localPromptTooLongMeasured', p), uiMessageKey: 'models.localPromptTooLongMeasured', uiMessageParameters: p })
            }
            stato.k += 1
            return { text: `risposta ${stato.k} ${'r'.repeat(2_400)}`, finishReason: 'stop' as const }
        })
        const riassumi = vi.fn<Riassumi>(obbediente(400))
        const store = createChatStore(complete, {
            repository: createMemoryChatRepository(), translate: it_, riassumiConversazione: riassumi,
            misuraRichiesta: async ({ turni }) => ({ token: veri(turni), misura: 'motore' as const, stima: 1_000 + stimaConPezziDelPc(turniVersoNucleo(turni)) }),
            finestraPerCompattazione: vi.fn(() => (stato.acceso ? { finestraToken: 5_120, riservaUscita: RISERVA, tettoToken: null, promptTokens: null } : null)),
        })
        await store.initialize()
        for (let i = 0; i < 7; i += 1) await store.send(`domanda ${i}`)
        stato.acceso = true
        await store.send('ancora una domanda corta')
        expect(riassumi).toHaveBeenCalledTimes(1)
        expect(store.state.lastError).toBeNull()
    })
})

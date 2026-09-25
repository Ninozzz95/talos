/**
 * ⭐ B3 «Giro in corso» (24/09/2026) — la coda dei messaggi dello store della chat, in un pezzo caricato a richiesta.
 *
 * Stava dentro `stores/chat.ts`; spostata qui TALE E QUALE perché il pacchetto d'avvio aveva superato il suo tetto
 * (`scripts/verify-initial-chunk.mjs`: 656.741 contro 644.000 byte). L'ordine della regola dell'owner (14/08): prima
 * peso vero, poi «si sposta ciò che non serve all'avvio in un pezzo caricato a richiesta», mai accorciare un contratto.
 * La coda non serve per disegnare la prima schermata: si carica quando la chat legge le code salvate o se ne usa una.
 * Decisioni e prove: `.claude/b3/LEDGER-B3-2026-09-24.md`.
 */
import {
    CODA_VUOTA,
    accoda,
    metteInPausa,
    modifica,
    normalizzaStatoCoda,
    prossimaDaConsegnare,
    riprende,
    togli,
    type TalosCodaRifiuto,
    type TalosCodaStato,
    type TalosCodaVoce,
} from '@/lib/chat/codaDelGiro'
import type { TalosChatRepository } from '@/repositories/chatRepository'
import type { TalosLibraryTurnOverride } from '@/lib/chat/libraryPolicy'
import type { ChatState, ChatStoreOptions, TalosEnqueueResult, TalosTurnOutcome } from './chat'

/** Ciò che la coda usa dello store: lo stato e poche funzioni, nient'altro. */
export interface TalosCodaDelloStoreContesto {
    readonly state: ChatState
    readonly repository: TalosChatRepository
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly options: ChatStoreOptions<any>
    readonly activeSession: { readonly value: { readonly id: string; readonly active_model_profile_id?: string | null } | null }
    makeId(): string
    now(): string
    stopStreaming(): void
    messaggioDiErrore(error: unknown): string
    /** Una continuazione di permesso in attesa o in corso: viene prima della coda. */
    continuazioniInCorso(): boolean
    /** L'invio dello store: «Riprendi» passa dalla stessa strada, col parametro interno `ripresa`. */
    send(
        text: string,
        modelProfileId?: string | null,
        metadata?: Record<string, unknown>,
        attachments?: readonly never[],
        onPersisted?: () => void,
        turnPolicy?: TalosLibraryTurnOverride | null,
        targetSessionId?: string | null,
        ripresa?: boolean,
    ): Promise<boolean>
}

export function creaCodaDelloStore(ctx: TalosCodaDelloStoreContesto) {
    const { state, repository, options, activeSession, makeId, now, stopStreaming, send } = ctx
/** L'ultima chat che ha finito un giro: la sua coda viene servita per prima. */
let ultimaChatFinita: string | null = null
let consegnaInCorso = false
/**
 * ⭐ B3 «Indirizza» (D-B3-02) — la voce scelta per correggere il giro in corso: parte PRIMA di tutte le altre
 * appena il giro si chiude, anche se la coda è in pausa (è una scelta esplicita, non un automatismo).
 */
let indirizzoPendente: { sessionId: string; voce: TalosCodaVoce } | null = null
/** Il giro con attrezzi di QUESTA chat deve chiudersi al prossimo confine fra attrezzi (Codex `turn/steer`). */
let richiestaPuntoSicuro: string | null = null
/** Lo Stop l'ha chiesto un indirizzo, non la persona: le altre voci NON vanno in pausa. */
let fermatoPerIndirizzo = false

    function queueOf(sessionId: string): TalosCodaStato {
        return state.queues[sessionId] ?? CODA_VUOTA
    }

    /**
     * ⛔ Rischio 3 della ricognizione B3: una coda ritrovata su disco dopo la morte del processo NON parte da sola —
     * non c'è un giro vivo di cui aspettare la fine, e un messaggio che parte a sorpresa all'apertura dell'app non è
     * quello che la persona ha chiesto. Si mostra in pausa e la invia lei.
     */
    async function caricaCodeDalDisco(): Promise<void> {
        let salvate: Array<{ scopeId: string; value: unknown }>
        try {
            salvate = await repository.listComposerQueues()
        } catch (error) {
            console.warn('[chat] code dei messaggi non lette dal disco:', error)
            return
        }
        const code: Record<string, TalosCodaStato> = {}
        for (const { scopeId, value } of salvate) {
            const coda = metteInPausa(normalizzaStatoCoda(value))
            if (coda.voci.length > 0) code[scopeId] = coda
        }
        state.queues = code
    }

    async function impostaCoda(sessionId: string, coda: TalosCodaStato): Promise<void> {
        if (coda.voci.length === 0) {
            const { [sessionId]: _tolta, ...resto } = state.queues
            state.queues = resto
        } else {
            state.queues = { ...state.queues, [sessionId]: coda }
        }
        try {
            await repository.saveComposerQueue(sessionId, coda.voci.length === 0 ? null : coda)
        } catch (error) {
            // La coda resta in memoria: si dice che non è su disco, non la si butta.
            state.lastError = ctx.messaggioDiErrore(error)
        }
    }

    async function enqueue(testo: string, sessionId?: string): Promise<TalosEnqueueResult> {
        const bersaglio = sessionId ?? activeSession.value?.id ?? null
        if (!bersaglio) return { ok: false, rifiuto: 'nessuna-chat' }
        const esito = accoda(queueOf(bersaglio), testo, { id: makeId(), adesso: now() })
        if ('rifiuto' in esito) return { ok: false, rifiuto: esito.rifiuto }
        await impostaCoda(bersaglio, esito.stato)
        const voce = esito.stato.voci[esito.stato.voci.length - 1]
        void consegnaCode()
        return { ok: true, voce }
    }

    async function removeQueued(sessionId: string, id: string): Promise<void> {
        await impostaCoda(sessionId, togli(queueOf(sessionId), id))
    }

    async function editQueued(
        sessionId: string,
        id: string,
        testo: string,
    ): Promise<{ ok: true } | { ok: false; rifiuto: TalosCodaRifiuto }> {
        const esito = modifica(queueOf(sessionId), id, testo)
        if ('rifiuto' in esito) return { ok: false, rifiuto: esito.rifiuto }
        await impostaCoda(sessionId, esito.stato)
        return { ok: true }
    }

    /** «Riprendi la coda»: torna a partire da sola quando l'app è libera. */
    async function resumeQueue(sessionId: string): Promise<void> {
        await impostaCoda(sessionId, riprende(queueOf(sessionId)))
        void consegnaCode()
    }

    /**
     * «Invia ora» su UNA voce, a giro fermo. ⛔ Non toglie la pausa al resto: dopo uno Stop le altre partono solo se
     * le invii tu (desktop `coda-messaggi.js`: «In pausa dallo stop: parte solo se lo invii tu»).
     */
    async function sendQueuedNow(sessionId: string, id: string): Promise<boolean> {
        if (state.sending || !options.deliverQueued) return false
        const coda = queueOf(sessionId)
        const voce = coda.voci.find((v) => v.id === id)
        if (!voce) return false
        await impostaCoda(sessionId, togli(coda, id))
        return consegna(sessionId, voce)
    }

    /**
     * ⭐ B3 «Indirizza» su una voce in coda, SOLO nella chat che sta rispondendo (altrove c'è «Invia ora»).
     *   - `punto-sicuro` (giro con attrezzi): niente si interrompe; il ciclo chiede `consumeSafePointRequest` al
     *     prossimo confine e si chiude pulito; se il giro finisce prima, la voce parte come invio normale (T7).
     *   - `ferma-e-riparti` (senza attrezzi): si ferma ora, il parziale resta `interrupted`, la voce parte subito.
     */
    async function steerQueued(sessionId: string, id: string, modo: 'punto-sicuro' | 'ferma-e-riparti'): Promise<boolean> {
        if (!state.sending || state.sendingSessionId !== sessionId) return false
        const voce = queueOf(sessionId).voci.find((v) => v.id === id)
        if (!voce) return false
        await impostaCoda(sessionId, togli(queueOf(sessionId), id))
        indirizzoPendente = { sessionId, voce }
        if (modo === 'punto-sicuro') {
            richiestaPuntoSicuro = sessionId
        } else {
            fermatoPerIndirizzo = true
            stopStreaming()
        }
        return true
    }

    /** Letta dal ciclo degli attrezzi al confine sicuro: vera UNA volta, e solo per la chat di quel giro. */
    function consumeSafePointRequest(sessionId: string): boolean {
        if (richiestaPuntoSicuro !== sessionId) return false
        richiestaPuntoSicuro = null
        return true
    }

    /** Segna come è finito il giro; dopo uno Stop o un errore la coda di quella chat va in pausa. */
    async function registraEsito(sessionId: string, esito: TalosTurnOutcome): Promise<void> {
        state.turnOutcomes = { ...state.turnOutcomes, [sessionId]: esito }
        ultimaChatFinita = sessionId
        // Il giro è chiuso: un punto sicuro non ancora raggiunto non serve più (la voce parte come invio normale).
        if (richiestaPuntoSicuro === sessionId) richiestaPuntoSicuro = null
        const perIndirizzo = fermatoPerIndirizzo
        fermatoPerIndirizzo = false
        const coda = queueOf(sessionId)
        if (esito !== 'concluso' && !perIndirizzo && coda.voci.length > 0 && !coda.inPausa) {
            await impostaCoda(sessionId, metteInPausa(coda))
        }
    }

    async function consegna(sessionId: string, voce: TalosCodaVoce): Promise<boolean> {
        let consegnata = false
        consegnaInCorso = true
        try {
            consegnata = await options.deliverQueued!(sessionId, voce)
        } catch (error) {
            state.lastError = ctx.messaggioDiErrore(error)
        } finally {
            consegnaInCorso = false
        }
        if (!consegnata) {
            // Mai persa: torna in testa, e la coda si ferma finché non la invii tu.
            const attuale = queueOf(sessionId)
            await impostaCoda(sessionId, metteInPausa({ voci: [voce, ...attuale.voci], inPausa: attuale.inPausa }))
            return false
        }
        void consegnaCode()
        return true
    }

    /**
     * Consegna UNA voce, se è il momento: l'app libera, nessuna continuazione di permesso in attesa, una chat la cui
     * coda non è in pausa. Prima la chat che ha appena finito, poi le altre nell'ordine in cui hanno scritto.
     */
    async function consegnaCode(): Promise<void> {
        if (!options.deliverQueued || consegnaInCorso || state.sending || state.editingMessage) return
        if (ctx.continuazioniInCorso()) return
        if (indirizzoPendente && !(options.permissionPendingFor?.(indirizzoPendente.sessionId) ?? false)) {
            const { sessionId, voce } = indirizzoPendente
            indirizzoPendente = null
            await consegna(sessionId, voce)
            return
        }
        const candidate = Object.keys(state.queues).sort((a, b) => {
            if (a === ultimaChatFinita) return -1
            if (b === ultimaChatFinita) return 1
            return queueOf(a).voci[0].creataAlle.localeCompare(queueOf(b).voci[0].creataAlle)
        })
        for (const sessionId of candidate) {
            const voce = prossimaDaConsegnare(queueOf(sessionId), {
                giroVivoQui: false,
                altraChatInCorso: false,
                permessoInAttesa: options.permissionPendingFor?.(sessionId) ?? false,
            })
            if (!voce) continue
            await impostaCoda(sessionId, togli(queueOf(sessionId), voce.id))
            await consegna(sessionId, voce)
            return
        }
    }

    /**
     * ⭐ B3 «Riprendi» (D-B3-03): rifà la risposta all'ultimo messaggio della persona, se dopo non c'è una risposta
     * completa (solo un parziale interrotto, un errore, o niente perché l'app si è chiusa). Nessun messaggio nuovo.
     */
    async function resumeTurn(
        modelProfileId: string | null = null,
        turnPolicy: TalosLibraryTurnOverride | null = null,
    ): Promise<boolean> {
        const attiva = activeSession.value
        if (!attiva || state.sending || state.editingMessage || state.persistenceStatus !== 'ready') return false
        const storia = await repository.listMessages(attiva.id)
        const indice = storia.map((m) => m.role).lastIndexOf('user')
        if (indice < 0) return false
        const giaRisposto = storia.slice(indice + 1).some((m) => m.role === 'assistant' && !m.metadata?.interrupted)
        if (giaRisposto) return false
        return send(
            storia[indice].content,
            modelProfileId ?? attiva.active_model_profile_id ?? null,
            {},
            [],
            undefined,
            turnPolicy,
            null,
            true,
        )
    }

    return {
        resumeTurn,
        caricaCodeDalDisco,
        enqueue,
        removeQueued,
        editQueued,
        resumeQueue,
        sendQueuedNow,
        steerQueued,
        consumeSafePointRequest,
        registraEsito,
        consegnaCode,
    }
}

export type TalosCodaDelloStore = ReturnType<typeof creaCodaDelloStore>

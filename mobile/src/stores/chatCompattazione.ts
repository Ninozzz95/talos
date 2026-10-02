import type { TalosTranslate } from '@/i18n/contracts'
import type { TalosChatRepository, TalosLocalChatMessage } from '@/repositories/chatRepository'
import type {
    ChatCompletionResult,
    ChatStoreOptions,
    ChatTurn,
    TalosEsitoCompattazioneChat,
    TalosMotivoCompattazioneChat,
    TalosRiassuntoEsito,
} from '@/stores/chat'
import {
    TALOS_METADATA_COMPATTAZIONE,
    TALOS_METADATA_COMPATTAZIONE_ANNULLATA,
    applicaCompattazioneChat,
    compattazioneAttiva,
    decidiCompattazioneChat,
    nucleoVersoTurni,
    tokenDellaRisposta,
    turniVersoNucleo,
} from '@/lib/chat/compattazioneChat'
import {
    costruisciProiezione,
    creaRecord,
    dividiPerCompattazione,
    indiceMeccanico,
    stimaTokenMessaggi,
} from '@/lib/kernel/compattazione'

/*
 * ⭐⭐ P4-ter passo 2 (02/10/2026) — la compattazione dello store della chat, in un modulo che si carica SOLO quando
 * serve: il cancello `verify-initial-chunk.mjs` della build pesa l'avvio al byte (TALOS_INITIAL_CHUNK_BUDGET_EXCEEDED
 * con questo codice dentro `chat.ts`: 661.609 contro 652.700). Lo store tiene solo gli involucri.
 *
 * Decisioni dell'owner (ledger `LEDGER-P4TER-COMPATTATORE-2026-10-02.md`): «Una riga nella storia», «Da sola, come il
 * desktop», «Locale: subito dopo la risposta» (la coda aspetta), «Compatta ora» con conferma (la chiede l'interfaccia).
 */
export interface TalosDipendenzeCompattazioneStore {
    repository: TalosChatRepository
    options: Pick<ChatStoreOptions<unknown>, 'riassumiConversazione' | 'finestraPerCompattazione' | 'resolveMessageParts' | 'misuraRichiesta'>
    state: { compattazioneInCorso: string | null, sending: boolean }
    appendDurable(
        sessionId: string,
        role: 'system',
        content: string,
        messageState: 'persisted',
        modelProfileId: string | null,
        metadata: Record<string, unknown>,
    ): Promise<void>
    translate: TalosTranslate
    now(): string
    /** Il modello scelto per quella chat in questa sessione dell'app, se c'è. */
    modelloScelto(sessionId: string): string | null | undefined
    chatEsiste(sessionId: string): boolean
}

/*
 * ⭐⭐ Owner 02/10/2026: «la compattazione deve essere automatica ed estremamente precisa» ⇒ «Almeno il 30%»: si compatta
 * solo se la richiesta dopo è almeno del 30% più leggera, misurata coi token VERI («Token veri»).
 */
export const GUADAGNO_MINIMO = 0.3

export function creaCompattazioneDelloStore(d: TalosDipendenzeCompattazioneStore) {
    /** La misura della richiesta con questi turni: quella vera del controller, o la stima se non sa misurare. */
    async function misura(sessionId: string, modelProfileId: string | null, turni: readonly ChatTurn[]): Promise<{ token: number, misura: 'motore' | 'fornitore' | 'stimato' }> {
        let vera: { token: number, misura: 'motore' | 'fornitore' } | null = null
        try { vera = (await d.options.misuraRichiesta?.({ sessionId, modelProfileId, turni })) ?? null } catch { vera = null }
        if (vera && Number.isFinite(vera.token) && vera.token > 0) return vera
        return { token: stimaTokenMessaggi(turniVersoNucleo(turni)), misura: 'stimato' }
    }

    /** I turni del modello per una chat, dalla storia intera su disco (la stessa strada di `send`). */
    async function turniDellaStoria(sessionId: string, righe: readonly TalosLocalChatMessage[]): Promise<ChatTurn[]> {
        const conAllegati = new Set(await d.repository.listSessionAttachmentMessageIds(sessionId))
        const { talosTurniDallaStoria } = await import('@/lib/chat/storiaConLeChiamate')
        return talosTurniDallaStoria({ messaggi: righe, conAllegati, pezziDelMessaggio: d.options.resolveMessageParts })
    }

    /**
     * Una compattazione: proiezione attuale ⇒ parti del nucleo ⇒ riassunto dal controller ⇒ record su una riga `system`
     * nel punto in cui succede. Nessun messaggio si tocca: «Annulla» è un'altra riga.
     * ⛔ Mai un errore verso chi chiama per un riassunto fallito: il motivo vero torna nell'esito, e senza riassunto non
     * si scrive niente (stesso principio del Codice, REG-COMP-08/09).
     */
    async function eseguiCompattazione(
        sessionId: string,
        modelProfileId: string | null,
        motivo: TalosMotivoCompattazioneChat,
        signal?: AbortSignal,
    ): Promise<TalosEsitoCompattazioneChat> {
        const riassumi = d.options.riassumiConversazione
        if (!riassumi) return { ok: false, motivo: 'non-disponibile' }
        const righe = await d.repository.listMessages(sessionId)
        const grezzi = await turniDellaStoria(sessionId, righe)
        const attiva = compattazioneAttiva(righe)
        const proiettati = turniVersoNucleo(applicaCompattazioneChat(grezzi, attiva))
        const parti = dividiPerCompattazione(proiettati)
        if (!parti.tagliabile) return { ok: true, compattato: false, motivo: 'niente-da-compattare' }
        const indice = indiceMeccanico(parti.mezzo, { precedente: attiva?.record.indice ?? null })
        const proiezioneCon = (testo: string) => costruisciProiezione({
            testa: parti.testa, richiesteLetterali: parti.richiesteLetterali, riassunto: testo, indice: indice.testo, coda: parti.coda,
        })
        const prima = await misura(sessionId, modelProfileId, nucleoVersoTurni(proiettati))
        const tetto = prima.token * (1 - GUADAGNO_MINIMO)
        // ⛔ PRIMA di pagare il riassunto: se nemmeno un riassunto VUOTO porta sotto il 70%, non c'è niente da guadagnare.
        const pavimento = await misura(sessionId, modelProfileId, nucleoVersoTurni(proiezioneCon('')))
        if (pavimento.token > tetto) return { ok: true, compattato: false, motivo: 'niente-da-guadagnare' }
        d.state.compattazioneInCorso = sessionId
        try {
            let esito: TalosRiassuntoEsito
            try {
                esito = await riassumi({ sessionId, modelProfileId, motivo, turni: nucleoVersoTurni(proiettati), parti, signal })
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') throw error
                esito = { ok: false, motivo: 'errore' }
            }
            if (!esito.ok || !esito.testo.trim()) return { ok: true, compattato: false, motivo: esito.ok ? 'vuoto' : esito.motivo }
            const riassunto = proiezioneCon(esito.testo)
            // ⛔ DOPO, sul riassunto vero: se non alleggerisce di almeno il 30%, non si salva (la storia resta com'è).
            const dopo = await misura(sessionId, modelProfileId, nucleoVersoTurni(riassunto))
            if (dopo.token > tetto) return { ok: true, compattato: false, motivo: 'niente-da-guadagnare' }
            const tokenPrima = prima.token
            const tokenDopo = dopo.token
            const record = creaRecord({
                coveredThrough: grezzi.length, riassunto, tokenPrima, tokenDopo,
                // Il record del nucleo distingue «fornitore» da «stimato»: il conteggio del motore locale è un numero vero.
                misura: prima.misura === 'stimato' ? 'stimato' : 'fornitore',
                at: d.now(), modello: modelProfileId, indice,
            })
            const delModello = righe.filter((r) => r.role === 'user' || r.role === 'assistant' || r.role === 'tool')
            const formato = (n: number) => n.toLocaleString()
            await d.appendDurable(
                sessionId,
                'system',
                // La frase resta leggibile anche dove la riga non ha un disegno suo (esportazione, versioni vecchie).
                d.translate('chat.compaction.summarizedRow', { before: formato(tokenPrima), after: formato(tokenDopo) }),
                'persisted',
                modelProfileId,
                { [TALOS_METADATA_COMPATTAZIONE]: { record: { ...record, misura: prima.misura }, ultimoCoperto: delModello.at(-1)?.id ?? '', righeCoperte: delModello.length, motivo } },
            )
            return { ok: true, compattato: true, at: record.at, tokenPrima, tokenDopo }
        } finally {
            d.state.compattazioneInCorso = null
        }
    }

    /** Il modello di una chat: quello scelto per lei, altrimenti l'ultimo che ha scritto nella sua storia. */
    async function modelloDellaChat(sessionId: string): Promise<string | null> {
        const scelto = d.modelloScelto(sessionId)
        if (scelto) return scelto
        const righe = await d.repository.listMessages(sessionId)
        return [...righe].reverse().find((riga) => riga.model_profile_id)?.model_profile_id ?? null
    }

    /** «Compatta ora» dal menu della chat, dopo la conferma (la conferma la chiede l'interfaccia). */
    async function compattaOra(sessionId: string): Promise<TalosEsitoCompattazioneChat> {
        if (d.state.sending || d.state.compattazioneInCorso) return { ok: false, motivo: 'occupato' }
        if (!d.chatEsiste(sessionId)) return { ok: false, motivo: 'chat-inesistente' }
        return eseguiCompattazione(sessionId, await modelloDellaChat(sessionId), 'manuale')
    }

    /** «Annulla»: una riga che spegne la compattazione `at`; il modello torna alla storia intera. */
    async function annullaCompattazione(sessionId: string, at: string): Promise<void> {
        await d.appendDurable(sessionId, 'system', d.translate('chat.compaction.undoneRow'), 'persisted', await modelloDellaChat(sessionId), {
            [TALOS_METADATA_COMPATTAZIONE_ANNULLATA]: { at },
        })
    }

    /*
     * Sopra la soglia, SUBITO dopo la risposta (owner 02/10: finché la cache del locale è calda), prima di `finishSend()`:
     * lo store resta occupato e la coda B3 aspetta la fine, con la barra visibile.
     * ⛔ Una compattazione che non riesce non trasforma la risposta, già salvata, in un errore.
     */
    async function compattaDopoLaRisposta(
        sessionId: string,
        modelProfileId: string | null,
        reply: ChatCompletionResult,
        signal: AbortSignal,
    ): Promise<void> {
        if (!d.options.riassumiConversazione || !d.options.finestraPerCompattazione || signal.aborted) return
        try {
            const finestra = await d.options.finestraPerCompattazione(modelProfileId, sessionId)
            if (!finestra) return
            const righe = await d.repository.listMessages(sessionId)
            const turni = applicaCompattazioneChat(await turniDellaStoria(sessionId, righe), compattazioneAttiva(righe))
            const decisione = decidiCompattazioneChat({
                turni,
                finestraToken: finestra.finestraToken,
                riservaUscita: finestra.riservaUscita,
                tettoToken: finestra.tettoToken,
                promptTokens: tokenDellaRisposta(reply.usage) ?? finestra.promptTokens,
            })
            if (decisione.scatta) await eseguiCompattazione(sessionId, modelProfileId, decisione.motivo ?? 'soglia', signal)
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') return
        }
    }

    return { eseguiCompattazione, compattaOra, annullaCompattazione, compattaDopoLaRisposta }
}

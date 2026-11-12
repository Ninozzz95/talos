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
    riassuntiVeriDellaChat,
    tokenDellaRisposta,
    turniVersoNucleo,
} from '@/lib/chat/compattazioneChat'
import type { TalosFinestraCompattazione } from '@/stores/chat'
import {
    accorciaPerLaFinestra,
    attesoInTokenVeri,
    calcolaSoglie,
    conRiassuntoVero,
    costruisciProiezione,
    creaRecord,
    dividiPerCompattazione,
    eRichiestaDellaPersona,
    indiceMeccanico,
    kValido,
    medianaRiassunti,
    rapportoDellaRichiesta,
    riassuntoAtteso,
    riassuntoDaChiedere,
    stimaTokenDelPc,
    stimaTokenMessaggi,
    type TalosMessaggioCompattabile,
} from '@/lib/kernel/compattazione'
import { testoAccorciatiPerLaFinestra, type TalosAccorciatiPerLaFinestra } from '@/lib/chat/compattazioneAccorciati'
import { TalosUiError } from '@/i18n/uiErrors'

/**
 * Telefono 0.1.48 (giudice v1598 a): il tetto più piccolo per cui vale la pena chiedere un riassunto di ultima via. Il prompt «a parte»
 * impone cinque sezioni: vuote pesano 10 parole, con una riga ciascuna 24 (misura del revisore A, ripasso v1589).
 */
const PAROLE_MINIME_ULTIMA_VIA = 24

/**
 * Telefono 0.1.48 (giudice v1598 b): `testo` accorciato a non più di `massimo` caratteri, a fine riga o a fine frase (la più tarda
 * delle due); senza nessuna delle due, a fine parola; senza spazi, al carattere.
 */
function tagliaAFineFrase(testo: string, massimo: number): string {
    if (testo.length <= massimo) return testo
    const pezzo = testo.slice(0, Math.max(0, massimo))
    const finePezzo = /[.!?…]$/.test(pezzo) && /\s/.test(testo[pezzo.length] ?? '') ? pezzo.length : -1
    let frase = finePezzo
    for (const m of pezzo.matchAll(/[.!?…](?=\s)/g)) frase = Math.max(frase, (m.index ?? -1) + 1)
    const riga = pezzo.lastIndexOf('\n')
    const fine = Math.max(frase, riga)
    if (fine > 0) return pezzo.slice(0, fine).trimEnd()
    const parola = pezzo.search(/\s\S*$/)
    return (parola > 0 ? pezzo.slice(0, parola) : pezzo).trimEnd()
}

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

/**
 * Telefono 0.1.48 — la richiesta più lunga che il modello accetta: finestra − risposta riservata − 1, la stessa aritmetica del
 * rifiuto del motore locale (`localAdapter.ts`, `promptTooLongFailure(plan.promptTokens + MAX_TOKENS + 1, ceiling)`).
 * `null` se la finestra non si sa: allora non si accorcia niente, come prima.
 */
export function limiteDellaRichiesta(finestra: TalosFinestraCompattazione | null | undefined): number | null {
    const totale = Number(finestra?.finestraToken)
    if (!Number.isFinite(totale) || totale <= 0) return null
    const riserva = Number(finestra?.riservaUscita)
    const limite = totale - (Number.isFinite(riserva) && riserva > 0 ? riserva : 0) - 1
    return limite > 0 ? limite : totale
}

/**
 * Giudice v1623 (ROSSO del Tester sulla 382): il tetto sicuro del dispositivo cambia in pochi minuti, e quello ricordato
 * dall'ultimo giro (`localAdapter.ts`, `FINESTRE_PER_COMPATTAZIONE`) può stare SOPRA quello del rifiuto di adesso (5.120 aperti,
 * 4.096 e poi 3.328 all'invio). Su «contesto pieno» vale il minore: il numero che il dispositivo ha appena detto.
 */
export function finestraColTettoDelRifiuto(finestra: TalosFinestraCompattazione | null, tetto: number | null | undefined): TalosFinestraCompattazione | null {
    if (!(typeof tetto === 'number' && Number.isFinite(tetto) && tetto > 0)) return finestra
    const letta = Number(finestra?.finestraToken)
    return {
        tettoToken: finestra?.tettoToken ?? null,
        riservaUscita: finestra?.riservaUscita ?? null,
        promptTokens: finestra?.promptTokens ?? null,
        finestraToken: Number.isFinite(letta) && letta > 0 ? Math.min(letta, tetto) : tetto,
    }
}

type M = TalosMessaggioCompattabile

export function creaCompattazioneDelloStore(d: TalosDipendenzeCompattazioneStore) {
    /*
     * Giudice v1535 (R2): i riassunti veri ARRIVATI per ogni chat, salvati o rifiutati, come la lista della sessione del PC
     * (`session-registry.mjs:6755-6757`: ogni `esito.ok` col testo, prima di sapere se si salva). In memoria come la voce del PC;
     * finché una chat non ne ha in memoria (avvio, chat riaperta) la lista parte dalle sue righe di compattazione.
     */
    const riassuntiArrivati = new Map<string, number[]>()
    const riassuntiDellaChat = (sessionId: string, righe: readonly TalosLocalChatMessage[]) =>
        riassuntiArrivati.get(sessionId) ?? riassuntiVeriDellaChat(righe)

    /** La misura della richiesta con questi turni: quella vera del controller, o la stima se non sa misurare. */
    async function misura(sessionId: string, modelProfileId: string | null, turni: readonly ChatTurn[]): Promise<{ token: number, misura: 'motore' | 'fornitore' | 'stimato', stima?: number }> {
        let vera: { token: number, misura: 'motore' | 'fornitore', stima?: number } | null = null
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

    /** La finestra del modello di questa chat, se il controller la sa; un errore vale «non si sa». */
    async function finestraDellaChat(sessionId: string, modelProfileId: string | null): Promise<TalosFinestraCompattazione | null> {
        if (!d.options.finestraPerCompattazione) return null
        try { return (await d.options.finestraPerCompattazione(modelProfileId, sessionId)) ?? null } catch { return null }
    }

    /**
     * Telefono 0.1.48 — la proiezione che andrà al modello, accorciata finché sta in `bersaglio` (`null` = non si accorcia).
     * La misura vera (motore o fornitore) si prende sulla lista intera; l'accorciamento stima ciò che toglie a quattro
     * caratteri per token sopra quella misura, poi si RIMISURA davvero: se ancora non sta, si ristringe di quanto manca
     * (al più tre giri, come i quattro passi della coda letterale in `richiestaLocaleNelTetto`).
     */
    async function proiezioneNelBersaglio(sessionId: string, modelProfileId: string | null, messaggi: M[], bersaglio: number | null) {
        const intera = await misura(sessionId, modelProfileId, nucleoVersoTurni(messaggi))
        const nessuno = { messaggi, esitiTolti: 0, scambiTolti: 0, token: intera.token }
        if (bersaglio === null || intera.token <= bersaglio) return nessuno
        const base = stimaTokenMessaggi(messaggi)
        let margine = 0
        let ultimo = nessuno
        for (let giro = 0; giro < 3; giro += 1) {
            const accorciata = accorciaPerLaFinestra(messaggi, {
                bersaglio: bersaglio - margine,
                stima: (lista) => intera.token - (base - stimaTokenMessaggi(lista)),
            })
            const vera = await misura(sessionId, modelProfileId, nucleoVersoTurni(accorciata.messaggi))
            ultimo = { messaggi: accorciata.messaggi, esitiTolti: accorciata.esitiTolti, scambiTolti: accorciata.scambiTolti, token: vera.token }
            if (vera.token <= bersaglio || !accorciata.entra) break
            margine += vera.token - bersaglio
        }
        return ultimo
    }

    /**
     * Una compattazione: proiezione attuale ⇒ parti del nucleo ⇒ riassunto dal controller ⇒ record su una riga `system`
     * nel punto in cui succede. Nessun messaggio si tocca: «Annulla» è un'altra riga.
     * ⛔ Mai un errore verso chi chiama per un riassunto fallito: il motivo vero torna nell'esito, e senza riassunto non
     * si scrive niente (stesso principio del Codice, REG-COMP-08/09).
     *
     * ⭐⭐ Telefono 0.1.48 (owner 11/11/2026 17:45 «Cura completa», giudice v1510): quando la chat NON entra nella finestra
     * del modello si accorcia anche la parte tenuta alla lettera (`accorciaPerLaFinestra`), solo nella proiezione che va al
     * modello (record): righe salvate, schermo, Annulla, ricerca ed esportazione restano interi. Il bersaglio è il minore fra
     * la finestra e il 70% di prima: il 30% dell'owner (02/10) resta. La stima per eccesso (riassunto vuoto, cornice e indice
     * meccanico: giudice v1510 e v1515) si fa DOPO l'accorciamento, sulla stessa proiezione.
     */
    async function eseguiCompattazione(
        sessionId: string,
        modelProfileId: string | null,
        motivo: TalosMotivoCompattazioneChat,
        signal?: AbortSignal,
        tettoDelRifiuto?: number | null,
    ): Promise<TalosEsitoCompattazioneChat> {
        const riassumi = d.options.riassumiConversazione
        if (!riassumi) return { ok: false, motivo: 'non-disponibile' }
        const righe = await d.repository.listMessages(sessionId)
        const grezzi = await turniDellaStoria(sessionId, righe)
        const attiva = compattazioneAttiva(righe)
        const proiettati = turniVersoNucleo(applicaCompattazioneChat(grezzi, attiva))
        const finestra = finestraColTettoDelRifiuto(await finestraDellaChat(sessionId, modelProfileId), motivo === 'overflow' ? tettoDelRifiuto : null)
        const limite = limiteDellaRichiesta(finestra)
        /*
         * Giudice v1510 (5): la sola richiesta in corso (sistema, attrezzi e il messaggio, senza la conversazione di prima)
         * non entra ⇒ nessun riassunto può aiutare: lo si dice SUBITO, coi numeri e la via d'uscita. Solo sulla via della
         * risposta (`overflow`): lì c'è un messaggio che la persona può accorciare.
         */
        if (motivo === 'overflow' && limite !== null) {
            let ultima = proiettati.length
            for (let i = proiettati.length - 1; i >= 0; i -= 1) if (eRichiestaDellaPersona(proiettati[i])) { ultima = i; break }
            let fineTesta = 0
            while (fineTesta < proiettati.length && proiettati[fineTesta]?.role === 'system') fineTesta += 1
            const daSola = await misura(sessionId, modelProfileId, nucleoVersoTurni([...proiettati.slice(0, fineTesta), ...proiettati.slice(ultima)]))
            if (daSola.token > limite) {
                const riserva = Number(finestra?.riservaUscita)
                throw new TalosUiError('TALOS_LOCAL_PROMPT_TOO_LONG', 'chat.compaction.requestTooLong', {
                    required: String(daSola.token + (Number.isFinite(riserva) && riserva > 0 ? riserva : 0) + 1),
                    available: String(finestra?.finestraToken),
                })
            }
        }
        const parti = dividiPerCompattazione(proiettati)
        if (!parti.tagliabile) return { ok: true, compattato: false, motivo: 'niente-da-compattare' }
        const indice = indiceMeccanico(parti.mezzo, { precedente: attiva?.record.indice ?? null })
        const prima = await misura(sessionId, modelProfileId, nucleoVersoTurni(proiettati))
        const tetto = prima.token * (1 - GUADAGNO_MINIMO)
        /*
         * La chat non entra nella finestra ⇒ si accorcia la parte tenuta fino al minore fra la finestra e il 70% di prima.
         * ⛔ Revisore A, ripasso v1589 (giudice v1598 a): su «contesto pieno» il bersaglio è il LIMITE. Lì l'obiettivo è che la risposta
         * parta: col 70% lo spazio scendeva sotto zero anche quando il limite aveva posto (76 messaggi su 2.880 dicevano «servono
         * 2.040-2.290, il modello ne riceve 2.304»). La soglia, l'emergenza e «Compatta ora» tengono il 70%, identiche.
         */
        const bersaglio = limite !== null && prima.token > limite ? (motivo === 'overflow' ? limite : Math.min(limite, Math.floor(tetto))) : null
        const massimo = bersaglio ?? tetto
        const proiezioneCon = (testo: string, entro: number | null = bersaglio) => proiezioneNelBersaglio(sessionId, modelProfileId, costruisciProiezione({
            testa: parti.testa, richiesteLetterali: parti.richiesteLetterali, riassunto: testo, indice: indice.testo, coda: parti.coda,
        }), entro)
        /*
         * ⛔ PRIMA di pagare il riassunto, la regola del PC (giudice v1523, opzione (a); `compattazione-desktop.mjs:307`, `:345-357`) nelle
         * unità della finestra (giudice v1535, R1 e punti 7-8; v1536). Il riassunto ATTESO è quello del PC (la mediana dei riassunti veri
         * della chat, altrimenti un quinto del tratto e mai meno di 400), in unità di stima del PC; lo si porta in token veri con k, il
         * rapporto della richiesta INTERA (`attesoInTokenVeri`), mai col rapporto del tratto tolto. Il pavimento (la proiezione col
         * riassunto VUOTO: cornice e indice meccanico) è MISURATO come prima.
         * - Sotto la finestra: pavimento più atteso deve stare sotto il 70% di prima, se no «niente» senza chiamare il modello.
         * - Oltre la finestra: il pavimento si accorcia lasciando il posto all'atteso; lo spazio che resta nel limite è il tetto della
         *   richiesta del riassunto, e sotto il minimo è «niente» subito (`riassuntoDaChiedere`). Il riassunto vero, dopo, deve stare
         *   nel limite o non si salva.
         */
        const soglie = calcolaSoglie({
            tettoToken: finestra?.tettoToken ?? null, finestraToken: finestra?.finestraToken ?? null, riservaUscita: finestra?.riservaUscita ?? null,
        })
        const misureDelPc = { finestraToken: soglie.finestraToken, soglia: soglie.soglia, mediana: medianaRiassunti(riassuntiDellaChat(sessionId, righe)) }
        const rapporto = rapportoDellaRichiesta(prima.token, prima.stima)
        const atteso = attesoInTokenVeri(riassuntoAtteso(parti.mezzo, misureDelPc), rapporto)
        const pavimento = await proiezioneCon('', bersaglio === null ? null : bersaglio - atteso)
        const decisione = riassuntoDaChiedere({
            pavimento: pavimento.token, atteso, massimo, oltreLaFinestra: bersaglio !== null, finestraToken: soglie.finestraToken, soglia: soglie.soglia,
        })
        /*
         * ⛔ ROSSO del Tester sulla 381 (giudice v1589): finestra 2.304, 6 scambi, settima richiesta, 4.462 token. Misurato: il
         * messaggio da solo entra, ma lo spazio per il riassunto (79) sta sotto il minimo (115): «niente», e a schermo l'errore del
         * fornitore. Il minimo serve a non pagare un riassunto inutile; su «contesto pieno» l'alternativa è che la chat si fermi,
         * quindi lì si chiede il riassunto nello spazio che c'è. Se non c'è nemmeno quello (la parte da tenere supera il limite)
         * nessun riassunto può aiutare: lo si dice coi numeri e con l'azione giusta, mai con l'errore del fornitore.
         * ⛔ Revisore A, ripasso v1589 (giudice v1598 a): l'ultima via solo con almeno `PAROLE_MINIME_ULTIMA_VIA` parole di tetto (48·k
         * token veri): le cinque sezioni del prompt «a parte» con una riga ciascuna pesano 24 parole, e sotto la chiamata è persa.
         */
        const k = kValido(rapporto)
        const minimoUltimaVia = Math.ceil(2 * PAROLE_MINIME_ULTIMA_VIA * k)
        const contestoPieno = motivo === 'overflow' && bersaglio !== null
        const senzaPosto = (occupati: number) => {
            const riserva = Number(finestra?.riservaUscita)
            return new TalosUiError('TALOS_LOCAL_PROMPT_TOO_LONG', 'chat.compaction.noRoomForSummary', {
                required: String(occupati + (Number.isFinite(riserva) && riserva > 0 ? riserva : 0) + 1),
                available: String(finestra?.finestraToken),
            })
        }
        const ultimaVia = !decisione.chiedi && contestoPieno && decisione.spazio !== null && decisione.spazio >= minimoUltimaVia
        if (!decisione.chiedi && !ultimaVia) {
            // I numeri: la parte da tenere più il riassunto più corto che si chiederebbe (sempre oltre la finestra, mai «servono < disponibili»).
            if (contestoPieno) throw senzaPosto(pavimento.token + minimoUltimaVia)
            return { ok: true, compattato: false, motivo: 'niente-da-guadagnare' }
        }
        // Due controlli di «Compatta ora» su due chat possono arrivare insieme qui: il riassunto è uno alla volta.
        if (motivo === 'manuale' && d.state.compattazioneInCorso !== null) return { ok: false, motivo: 'occupato' }
        d.state.compattazioneInCorso = sessionId
        try {
            let esito: TalosRiassuntoEsito
            try {
                esito = await riassumi({
                    sessionId, modelProfileId, motivo, turni: nucleoVersoTurni(proiettati), parti, signal,
                    /*
                     * Giudice v1556 (revisore A, cancello 2): lo spazio è in token veri, il tetto in parole del controller è nelle
                     * unità della stima del PC (metà, una parola ≤ 8 caratteri). Si passa diviso per k: con k 2,5 una parola costa
                     * ~3 token veri e lo spazio intero faceva sforare anche un modello obbediente. Sotto 1 k non allarga (kValido).
                     */
                    ...(decisione.spazio !== null ? { spazioDelRiassunto: Math.max(1, Math.floor(decisione.spazio / k)) } : {}),
                })
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') throw error
                esito = { ok: false, motivo: 'errore' }
            }
            if (!esito.ok || !esito.testo.trim()) return { ok: true, compattato: false, motivo: esito.ok ? 'vuoto' : esito.motivo }
            // Giudice v1535 (R2): il riassunto arrivato entra nella mediana della chat anche se poi non si salva.
            const pesoVero = stimaTokenDelPc(esito.testo.trim())
            riassuntiArrivati.set(sessionId, conRiassuntoVero(riassuntiDellaChat(sessionId, righe), pesoVero))
            let dopo = await proiezioneCon(esito.testo)
            /*
             * ⛔ Revisore A, ripasso v1589 (giudice v1598 b): un modello piccolo può sforare il tetto in parole (P1: 120 token dove ce
             * n'erano 79) e la richiesta tornava all'errore del fornitore. Su «contesto pieno» il riassunto si TAGLIA prima di
             * rimetterlo nella richiesta: a fine frase o a fine riga, rimisurato con lo STESSO contatore della decisione (al più tre
             * giri, come `proiezioneNelBersaglio`). Nessuna seconda chiamata al modello. Se ancora non entra: i numeri, mai il fornitore.
             */
            if (contestoPieno) {
                let testo = esito.testo.trim()
                for (let giro = 0; giro < 3 && dopo.token > massimo; giro += 1) {
                    /*
                     * Il peso vero del riassunto è la misura con lui meno la misura senza (il pavimento), con lo stesso contatore.
                     * Col solo k (il rapporto della richiesta intera) il taglio sbagliava nei due versi: risposte dense (JSON) e
                     * riassunto in prosa ⇒ k alto e taglio corto un giro dopo l'altro (misurato: 1.693, 1.427, 1.325 contro 1.279 con
                     * k 1,63); riassunto più denso della chat ⇒ k basso e taglio fino a zero. Senza un peso contato (il riassunto
                     * non pesa sopra il pavimento) non c'è niente da tagliare: i numeri.
                     */
                    const peso = dopo.token - pavimento.token
                    const tagliato = peso > 0 ? tagliaAFineFrase(testo, Math.floor((testo.length * Math.max(0, peso - (dopo.token - massimo))) / peso)) : ''
                    if (!tagliato || tagliato === testo) break
                    testo = tagliato
                    dopo = await proiezioneCon(testo)
                }
                if (dopo.token > massimo) throw senzaPosto(dopo.token)
            }
            const riassunto = dopo.messaggi
            // ⛔ DOPO, sul riassunto vero: se non alleggerisce di almeno il 30% (e, se la chat non entrava, se non sta nella
            // finestra), non si salva (la storia resta com'è).
            if (dopo.token > massimo) return { ok: true, compattato: false, motivo: 'niente-da-guadagnare' }
            const tokenPrima = prima.token
            const tokenDopo = dopo.token
            const accorciati: TalosAccorciatiPerLaFinestra | null = dopo.esitiTolti > 0 || dopo.scambiTolti > 0
                ? { esiti: dopo.esitiTolti, scambi: dopo.scambiTolti }
                : null
            const record = creaRecord({
                coveredThrough: grezzi.length, riassunto, tokenPrima, tokenDopo,
                // Il record del nucleo distingue «fornitore» da «stimato»: il conteggio del motore locale è un numero vero.
                misura: prima.misura === 'stimato' ? 'stimato' : 'fornitore',
                at: d.now(), modello: modelProfileId, indice,
            })
            const delModello = righe.filter((r) => r.role === 'user' || r.role === 'assistant' || r.role === 'tool')
            const formato = (n: number) => n.toLocaleString()
            const frase = d.translate('chat.compaction.summarizedRow', { before: formato(tokenPrima), after: formato(tokenDopo) })
            const fraseAccorciati = testoAccorciatiPerLaFinestra(d.translate, accorciati)
            await d.appendDurable(
                sessionId,
                'system',
                // La frase resta leggibile anche dove la riga non ha un disegno suo (esportazione, versioni vecchie).
                fraseAccorciati ? `${frase} · ${fraseAccorciati}` : frase,
                'persisted',
                modelProfileId,
                {
                    [TALOS_METADATA_COMPATTAZIONE]: {
                        record: { ...record, misura: prima.misura }, ultimoCoperto: delModello.at(-1)?.id ?? '', righeCoperte: delModello.length, motivo,
                        // Giudice v1523: il peso del riassunto vero (la stima del PC), per la mediana della chat.
                        riassuntoVero: pesoVero,
                        ...(accorciati ? { accorciati } : {}),
                    },
                },
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

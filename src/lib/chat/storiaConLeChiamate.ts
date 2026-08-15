import type { TalosMobileInputPart } from '@/lib/chat/attachmentContracts'
import {
    TALOS_METADATA_AZIONI,
    TALOS_METADATA_CHIAMATE,
    type TalosChiamataAvvenuta,
} from '@/lib/tools/tracciaAzione'
import type { ChatTurn, TalosToolCall } from '@/stores/chat'

/**
 * ⛔⛔⛔ LA STORIA CHE DIMENTICA DI AVER AGITO — e insegna a mentire.
 *
 * ## Il difetto, misurato sul Pad il 2026-08-13
 *
 * Quattro invii di fila, stessa richiesta («manda un whatsapp ad Antonino Rizzo
 * che dice …»), stesso modello, stessa sessione:
 *
 * | ora | `giro tool` | WhatsApp | cosa ha detto TALOS |
 * |---|---|---|---|
 * | 17:59 | ✅ `app_azione` | ✅ aperto | ✅ **inviato davvero** (doppia spunta) |
 * | 18:02 | ⛔ nessuno | ⛔ mai aperto | ⛔ «Messaggio inviato ad Antonino Rizzo» |
 * | 18:03 | ⛔ nessuno | ⛔ mai aperto | ⛔ «Messaggio inviato ad Antonino Rizzo» |
 * | 18:05 | ⛔ nessuno (**dalla chat**) | ⛔ mai aperto | ⛔ uguale |
 *
 * Dichiarava un invio che non era avvenuto. Non è la barra contro la chat — la
 * chat, nella stessa sessione, fa lo stesso: è la **sessione** che si avvelena.
 *
 * ## Perché, e la colpa è nostra
 *
 * La storia si ricostruiva dal disco con **solo ruolo e testo**. `toolCalls`
 * esisteva in `ChatTurn` e non veniva mai rimesso; i turni di ruolo `tool` non
 * sono mai stati salvati. Quindi alla richiesta dopo il modello leggeva:
 *
 * ```
 * user:      manda un whatsapp … occhio aperto
 * assistant: Messaggio inviato ad Antonino Rizzo: "occhio aperto".
 * user:      manda un whatsapp … occhio spento
 * ```
 *
 * La chiamata **non c'è più**. Il modello vede la propria risposta riuscita come
 * puro testo e imita l'unica cosa che gli mostriamo — cioè **siamo noi** a
 * insegnargli, dentro il contesto, che a «manda un WhatsApp» si risponde con una
 * frase. E peggiora con l'uso: più TALOS riesce, più impara a mentire.
 *
 * In letteratura si chiama **tool bypass** — il modello simula l'esito invece di
 * invocare lo strumento (crewAI #3154, openclaw #45049). La cura indicata è
 * anzitutto una: **rendere la storia fedele**.
 *
 * ## Perché il risultato NON si riconsegna
 *
 * Il dato che serve c'è già su disco (`metadata.tool_calls`); l'**esito** no. E
 * riconsegnarlo per sempre sarebbe la malattia opposta di cui avverte la stessa
 * letteratura: una ricerca web di ieri rispedita a ogni messaggio di domani.
 *
 * Quindi si riconsegna la **forma** — «qui c'è stata una chiamata, e questo è il
 * suo posto» — con un esito che dice la verità: *è avvenuta, il contenuto non è
 * stato conservato, se ti serve richiamala*. La lezione sbagliata sparisce senza
 * portarsi dietro il peso.
 */

/**
 * L'esito segnaposto. Dice tre cose e tutte e tre sono vere: la chiamata è
 * avvenuta, il risultato non c'è più, e se serve **si richiama**. L'ultima è la
 * riga che smonta il bypass: senza, «non conservato» inviterebbe a inventare.
 */
export const TALOS_ESITO_NON_CONSERVATO
    = 'This tool ran in an earlier message of this conversation. Its arguments and output were '
    + 'not kept, so the input shown above may be empty. Do not restate or invent what it '
    + 'returned. If you need it now, call the tool again.'

/** Vero se il valore ha la forma di una chiamata conservata senza id. */
function eUnaChiamataAvvenuta(valore: unknown): valore is TalosChiamataAvvenuta {
    if (typeof valore !== 'object' || valore === null) return false
    const record = valore as Record<string, unknown>
    return typeof record.name === 'string' && record.name !== ''
        && typeof record.arguments === 'string'
}

/** Vero se il valore ha la forma di una chiamata salvata. */
function eUnaChiamata(valore: unknown): valore is TalosToolCall {
    if (typeof valore !== 'object' || valore === null) return false
    const record = valore as Record<string, unknown>
    return typeof record.id === 'string' && record.id !== ''
        && typeof record.name === 'string' && record.name !== ''
        && typeof record.arguments === 'string'
}

/**
 * Le chiamate salvate insieme a un messaggio dell'assistente.
 *
 * ⛔ Si valida ogni campo invece di fidarsi: `metadata` è un sacco aperto che
 * viaggia anche nei backup e nelle importazioni, e una chiamata senza `id`
 * produrrebbe un `tool_result` orfano — cioè un 400 al primo messaggio dopo,
 * su una sessione che l'utente aveva già.
 */
export function talosChiamateSalvate(
    metadata: Readonly<Record<string, unknown>> | undefined,
    idMessaggio = 'msg',
): readonly TalosToolCall[] {
    const grezze = metadata?.tool_calls
    if (Array.isArray(grezze) && grezze.length > 0) {
        const buone = grezze.filter(eUnaChiamata)
        // Tutto o niente: metà chiamate riconsegnate sarebbero metà
        // `tool_result`, e un `tool_use` senza il suo risultato è esattamente
        // l'errore che questo controllo esiste per non commettere.
        return buone.length === grezze.length ? buone : []
    }
    /*
     * ⛔ LA SECONDA FORMA, e senza di lei la cura non curava niente.
     *
     * `tool_calls` è l'ULTIMA risposta del modello, e dopo un giro dell'agente
     * riuscito è vuota: la chiamata è avvenuta in un giro precedente. Cioè
     * proprio i turni che AGISCONO — quelli che insegnavano a mentire — non
     * lasciavano traccia in `tool_calls`. Trovato sul Pad: la cura era già
     * installata, il tool non partiva lo stesso, e i test non potevano
     * vederlo perché il dato non arrivava mai fin qui.
     */
    const avvenute = metadata?.[TALOS_METADATA_CHIAMATE]
    if (Array.isArray(avvenute) && avvenute.length > 0) {
        return avvenute
            .filter(eUnaChiamataAvvenuta)
            .map((chiamata, indice) => ({
                id: `${idMessaggio}-${indice}`,
                name: chiamata.name,
                arguments: chiamata.arguments,
            }))
    }
    /*
     * ⛔ LA TERZA FORMA: le sessioni che la persona AVEVA GIÀ.
     *
     * `actions_done` è nato per il chip «✓ Fatto» ed è più povero — niente
     * argomenti, deduplicato, solo le riuscite. Ma è l'unica traccia sul disco
     * delle conversazioni scritte prima di oggi, e senza di lei una sessione
     * già avvelenata resterebbe avvelenata per sempre. L'esito segnaposto dice
     * a chiare lettere che gli argomenti non ci sono, così l'`input` vuoto è
     * spiegato invece di essere una bugia.
     */
    const fatte = metadata?.[TALOS_METADATA_AZIONI]
    if (!Array.isArray(fatte)) return []
    return fatte
        .filter((voce): voce is { tool: string } => typeof voce === 'object' && voce !== null
            && typeof (voce as Record<string, unknown>).tool === 'string'
            && (voce as Record<string, unknown>).tool !== '')
        .map((voce, indice) => ({
            id: `${idMessaggio}-a${indice}`,
            name: voce.tool,
            arguments: '{}',
        }))
}

/**
 * Rimette nella storia i turni di risultato che le chiamate esigono.
 *
 * Il protocollo di Anthropic (e di OpenAI) chiede che a un `tool_use` segua
 * **subito** il `tool_result` con lo stesso id. Qui il turno sintetico si
 * infila immediatamente dopo l'assistente che l'ha chiesto, uno per chiamata e
 * nell'ordine in cui il modello le ha emesse.
 */
export function talosStoriaConLeChiamate(turni: readonly ChatTurn[]): ChatTurn[] {
    return turni.flatMap((turno) => (turno.toolCalls?.length
        ? [
            turno,
            ...turno.toolCalls.map((chiamata): ChatTurn => ({
                role: 'tool',
                content: TALOS_ESITO_NON_CONSERVATO,
                toolCallId: chiamata.id,
                toolName: chiamata.name,
            })),
        ]
        : [turno]))
}

/** Un messaggio come sta sul disco, ridotto a ciò che serve qui. */
export interface TalosMessaggioSalvato {
    readonly id: string
    readonly role: string
    readonly content: string
    readonly metadata?: Readonly<Record<string, unknown>>
}

export interface TalosTurniDallaStoriaInput {
    readonly messaggi: readonly TalosMessaggioSalvato[]
    /** Gli id dei messaggi che hanno allegati da riconsegnare. */
    readonly conAllegati: ReadonlySet<string>
    readonly pezziDelMessaggio?: (id: string) => Promise<readonly TalosMobileInputPart[]>
}

/**
 * La storia che il modello legge, ricostruita dal disco.
 *
 * ⛔ Sta QUI e non nel negozio per una ragione misurata: il grafo d'avvio.
 * Questo giro serve solo quando parte un messaggio — cioè dopo che la persona
 * ha già visto lo schermo — e tenerlo nell'avvio costava byte a chi apre
 * l'app senza scrivere niente. Vedi il commento nel chiamante.
 */
export async function talosTurniDallaStoria(
    input: TalosTurniDallaStoriaInput,
): Promise<ChatTurn[]> {
    const ricostruiti = await Promise.all(input.messaggi
        .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
        .map(async (messaggio) => {
            const turno: ChatTurn = {
                role: messaggio.role as ChatTurn['role'],
                content: messaggio.content,
            }
            const chiamate = talosChiamateSalvate(messaggio.metadata, messaggio.id)
            if (messaggio.role === 'assistant' && chiamate.length > 0) turno.toolCalls = [...chiamate]
            // Assistant attachments are durable visual results. Replaying them on
            // every later request would silently grant ambient model access and
            // repeatedly upload the same generated bytes.
            if (messaggio.role === 'user' && input.conAllegati.has(messaggio.id)) {
                if (!input.pezziDelMessaggio) throw new Error('TALOS_ATTACHMENT_RESOLVER_UNAVAILABLE')
                const pezzi = await input.pezziDelMessaggio(messaggio.id)
                if (pezzi.length > 0) turno.parts = [...pezzi]
            }
            return turno
        }))
    return talosStoriaConLeChiamate(ricostruiti)
}

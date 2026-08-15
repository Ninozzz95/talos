/**
 * `/v1/responses`, l'endpoint dove tool e ragionamento convivono.
 *
 * Su `/v1/chat/completions` i modelli nuovi li rifiutano insieme, e siccome
 * TALOS offre i suoi tool a OGNI messaggio, su quei modelli non funziona
 * niente — owner 2026-08-03, con uno screenshot in cui «Ciaoo» riceve un 400.
 *
 * Tutto quello che c'è qui è stato **misurato** interrogando l'API, non letto:
 * la pagina delle docs risponde 403 al fetch. Il contratto completo, con le
 * risposte verbatim, sta in
 * `docs/superpowers/research/2026-08-03-openai-responses-api-contratto-misurato.md`.
 *
 * Queste funzioni sono pure di proposito: la parte che sbaglia più facilmente
 * in una migrazione di endpoint è la lettura, e una lettura pura si prova senza
 * rete e senza telefono.
 */

export interface TalosOpenAiResponseToolCall {
    readonly name: string
    readonly arguments: string
    /**
     * `call_id`, non `id`.
     *
     * L'elemento ne porta DUE — `id` vale `fc_…` e `call_id` vale `call_…` — e
     * quello che riappaia il risultato alla richiesta è il secondo. Sbagliarlo
     * non dà un errore: dà una conversazione in cui il modello riceve la
     * risposta giusta alla domanda sbagliata.
     */
    readonly id: string
}

export interface TalosOpenAiResponseRead {
    readonly text: string
    readonly toolCalls: readonly TalosOpenAiResponseToolCall[]
    readonly usage: Record<string, number> | null
    /** `completed`, `incomplete`, … — quello che il corpo dichiara. */
    readonly status: string | null
    /**
     * Il riepilogo del ragionamento, quando si chiede `reasoning.summary:"auto"`.
     *
     * NON è la catena di pensiero: è un riassunto che il modello produce
     * apposta. Chiamarlo «ragionamento completo» sarebbe una promessa che l'API
     * non fa — il pensiero grezzo resta cifrato.
     */
    readonly reasoningSummaries: readonly string[]
    /**
     * TUTTI gli elementi di `output`, verbatim e in ordine.
     *
     * Servono per il giro successivo: con `store:false` la conversazione la
     * ricostruiamo noi a ogni richiesta, e gli elementi `reasoning` portano un
     * `encrypted_content` opaco che va **rimandato identico**. Scartarli — che
     * è quello che faceva la prima versione di questo lettore — significa
     * togliere al modello il contesto del proprio ragionamento fra un turno e
     * l'altro del ciclo dei tool.
     *
     * Non si ricostruiscono a mano e non si toccano: si copiano.
     */
    readonly replayItems: readonly unknown[]
}

interface RawItem {
    type?: unknown
    content?: unknown
    call_id?: unknown
    id?: unknown
    name?: unknown
    arguments?: unknown
}

/**
 * Cammina `output[]`, che è un array ETEROGENEO.
 *
 * Non c'è `choices[0].message`: gli elementi sono `reasoning`, `message` e
 * `function_call`, e il testo sta **due livelli sotto**
 * (`output[] → content[] → text`). La scorciatoia `output_text` nel JSON grezzo
 * non esiste — verificato, non supposto.
 *
 * Del ragionamento si prende il RIEPILOGO, non il pensiero: `encrypted_content`
 * è opaco e mostrarlo vorrebbe dire dare una stringa cifrata a chi si aspetta
 * un ragionamento. Ma l'elemento intero si conserva in `replayItems`, perché
 * con `store:false` va rimandato identico al giro dopo.
 */
export function talosReadOpenAiResponse(data: unknown): TalosOpenAiResponseRead {
    const body = (data ?? {}) as { output?: unknown, usage?: unknown, status?: unknown }
    const items: RawItem[] = Array.isArray(body.output) ? body.output as RawItem[] : []

    let text = ''
    const toolCalls: TalosOpenAiResponseToolCall[] = []
    const reasoningSummaries: string[] = []

    for (const item of items) {
        if (item?.type === 'reasoning' && Array.isArray((item as { summary?: unknown }).summary)) {
            for (const part of (item as { summary: Array<{ type?: unknown, text?: unknown }> }).summary) {
                if (part?.type === 'summary_text' && typeof part.text === 'string') {
                    reasoningSummaries.push(part.text)
                }
            }
            continue
        }
        if (item?.type === 'message' && Array.isArray(item.content)) {
            for (const part of item.content as Array<{ type?: unknown, text?: unknown }>) {
                if (part?.type === 'output_text' && typeof part.text === 'string') text += part.text
            }
            continue
        }
        if (item?.type === 'function_call') {
            const id = typeof item.call_id === 'string' && item.call_id.length > 0
                ? item.call_id
                : (typeof item.id === 'string' ? item.id : '')
            toolCalls.push({
                name: typeof item.name === 'string' ? item.name : '',
                arguments: typeof item.arguments === 'string' ? item.arguments : '',
                id,
            })
        }
    }

    return {
        text,
        toolCalls,
        usage: talosOpenAiResponsesUsage(body.usage),
        status: typeof body.status === 'string' ? body.status : null,
        reasoningSummaries,
        // Copia integrale: include i campi opachi che il replay pretende.
        replayItems: items,
    }
}

/**
 * L'uso, rinominato.
 *
 * Qui i campi sono `input_tokens` / `output_tokens`, non `prompt_tokens` /
 * `completion_tokens`: senza questa mappatura la ricevuta del messaggio
 * mostrerebbe zero, cioe' direbbe che il messaggio non e' costato niente.
 *
 * `reasoning_tokens` si porta dietro perche' su questo endpoint e' l'UNICA
 * traccia del ragionamento: il testo del pensiero e' cifrato, quindi il costo
 * e' tutto quello che si puo' onestamente mostrare.
 */
export function talosOpenAiResponsesUsage(raw: unknown): Record<string, number> | null {
    if (!raw || typeof raw !== 'object') return null
    const usage = raw as {
        input_tokens?: unknown
        output_tokens?: unknown
        total_tokens?: unknown
        output_tokens_details?: { reasoning_tokens?: unknown }
    }
    const out: Record<string, number> = {}
    if (typeof usage.input_tokens === 'number') out.prompt_tokens = usage.input_tokens
    if (typeof usage.output_tokens === 'number') out.completion_tokens = usage.output_tokens
    if (typeof usage.total_tokens === 'number') out.total_tokens = usage.total_tokens
    const reasoning = usage.output_tokens_details?.reasoning_tokens
    if (typeof reasoning === 'number') out.reasoning_tokens = reasoning
    return Object.keys(out).length > 0 ? out : null
}

/**
 * Un evento dello streaming, tradotto in cosa deve succedere.
 *
 * I tipi sono ALTRI rispetto a oggi: `chat.completion.chunk` qui non esiste.
 * Misurati sull'API, in ordine:
 *
 *   testo:  response.output_text.delta (×N) → response.completed
 *   tool:   response.function_call_arguments.delta (×N)
 *           → response.output_item.done (con la chiamata INTERA)
 *           → response.completed
 *
 * La chiamata NON va ricomposta dai delta: `output_item.done` la consegna
 * intera, con il suo `call_id`. I delta servono solo a mostrarla mentre si
 * forma, che e' una scelta di interfaccia e non un obbligo.
 */
export type TalosOpenAiStreamEvent =
    | { kind: 'text', delta: string }
    | { kind: 'tool-call', call: TalosOpenAiResponseToolCall }
    | { kind: 'done', usage: Record<string, number> | null }
    | { kind: 'ignore' }

export function talosReadOpenAiResponsesEvent(payload: unknown): TalosOpenAiStreamEvent {
    const event = (payload ?? {}) as { type?: unknown, delta?: unknown, item?: unknown, response?: unknown }
    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
        return { kind: 'text', delta: event.delta }
    }
    if (event.type === 'response.output_item.done') {
        const item = event.item as RawItem | undefined
        if (item?.type === 'function_call') {
            const read = talosReadOpenAiResponse({ output: [item] })
            const call = read.toolCalls[0]
            if (call) return { kind: 'tool-call', call }
        }
        return { kind: 'ignore' }
    }
    if (event.type === 'response.completed') {
        const response = (event.response ?? {}) as { usage?: unknown }
        return { kind: 'done', usage: talosOpenAiResponsesUsage(response.usage) }
    }
    return { kind: 'ignore' }
}

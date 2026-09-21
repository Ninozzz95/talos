/**
 * Client-side Anthropic Messages call, mirroring the desktop request shape
 * (`core/src/AnthropicClient.php`): POST https://api.anthropic.com/v1/messages with
 * `x-api-key` + `anthropic-version` headers and a `{model,max_tokens,system,messages}`
 * body. The device calls the provider directly (CapacitorHttp — bypasses CORS,
 * buffered/non-streaming) with the user's key from the OS keystore.
 *
 * Reasoning effort maps to Anthropic extended thinking (`thinking:{type:'enabled',
 * budget_tokens}`). The desktop ReasoningEffortMap is not in this lane's base, so the
 * budgets below are a documented LOCAL map; `max_tokens` is always kept above the budget.
 */
import { CapacitorHttp } from '@capacitor/core'

export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
export const ANTHROPIC_VERSION = '2023-06-01'
/**
 * Il pavimento di quando il modello NON dichiara un tetto — non il tetto.
 *
 * Era `DEFAULT_MAX_TOKENS = 4096` e nessuno passava mai un valore, quindi il
 * ripiego era il tetto di ogni risposta di Claude. I modelli attuali ne reggono
 * 128.000: una risposta lunga si fermava a un trentaduesimo di quel che poteva,
 * a metà frase, e sembrava un difetto del modello invece che nostro. Il numero
 * lo dichiara `GET /v1/models` nel campo `max_tokens`, e adesso il catalogo lo
 * legge e lo porta fin qui.
 *
 * Resta un pavimento perché un gateway compatibile può non dichiarare niente, e
 * `max_tokens` è obbligatorio nella richiesta: senza un numero non si può
 * chiedere. Questo è dunque una politica nostra, e vale la regola delle
 * politiche — sta scritto perché: 4096 è abbastanza per una risposta intera in
 * quasi ogni caso, e sbagliare per difetto qui costa una risposta troncata,
 * mentre sbagliare per eccesso su un modello che non li regge costa un 400 su
 * ogni messaggio.
 */
const FALLBACK_MAX_TOKENS = 4096

// effort level -> extended-thinking budget tokens (local map).
const THINKING_BUDGET: Readonly<Record<string, number>> = Object.freeze({
    minimal: 2048,
    low: 4096,
    medium: 10240,
    high: 24576,
    xhigh: 32768,
    max: 48000,
})

import { withTalosAnthropicMessageCache, withTalosAnthropicToolCache } from '@/lib/chat/promptCache'

export interface AnthropicChatTurn {
    // The IR carries 'tool'; Anthropic has no such role, so a result becomes a
    // USER message of tool_result blocks and the call an ASSISTANT message of
    // tool_use blocks. Those blocks are now really wired, not approximated.
    role: 'user' | 'assistant' | 'tool'
    content: string
    parts?: import('@/lib/chat/attachmentContracts').TalosMobileInputPart[]
    /** Set on the assistant turn that requested tools. */
    toolCalls?: Array<{ id: string; name: string; arguments: string }>
    /** Set on a tool turn: which call this result answers. */
    toolCallId?: string
    /**
     * ⭐⭐⭐ I BLOCCHI DEL FORNITORE, VERBATIM — e perché non si possono rifare.
     *
     * La ricerca degli attrezzi lato server produce due tipi di blocco che
     * nascono e muoiono dentro Anthropic: `server_tool_use` e
     * `tool_search_tool_result`. La documentazione, alla voce «continuing the
     * conversation», chiede di rimandarli indietro **immutati**.
     *
     * ⛔ «Immutati» è la parola che decide la forma di questo campo. Non si
     * possono ricostruire dai nostri dati — non sono una chiamata nostra, non
     * hanno un nome che conosciamo, e il loro contenuto è di Anthropic. L'unica
     * cosa onesta è tenerli **così come sono arrivati** e rimetterli in fila
     * nello stesso ordine.
     *
     * ⇒ Il tipo è `unknown[]` di proposito: darsi un'interfaccia vorrebbe dire
     * dichiarare di aver capito una forma che il fornitore può cambiare, e la
     * prima volta che la cambia noi la romperemmo riscrivendola.
     *
     * ⛔ Senza questo campo l'apertura a gradi non si può accendere: al secondo
     * giro la conversazione parte monca e il provider risponde 400. Costa
     * ~4.094 token per messaggio tenerla spenta — misurato, vedi
     * `anthropicAdapter`.
     */
    providerBlocks?: readonly unknown[]
}

export interface BuildAnthropicRequestInput {
    model: string
    turns: AnthropicChatTurn[]
    system?: string
    effort?: string
    thinking?: boolean
    /**
     * Which of the two thinking shapes this model takes.
     *
     * There is no single answer. `enabled` + `budget_tokens` is a 400 on Opus
     * 4.7 and later; `adaptive` is a 400 on Sonnet 4.5, Opus 4.5, Haiku 4.5 and
     * earlier. A distributed app cannot ship the list of which is which — it
     * would be wrong the day a model appears that the APK has never heard of —
     * so the caller learns it from the provider and passes it back in.
     */
    thinkingMode?: 'enabled' | 'adaptive'
    maxTokens?: number
    /** Already translated to Anthropic's `input_schema` shape. */
    tools?: unknown[]
}

export interface AnthropicHttpRequest {
    url: string
    headers: Record<string, string>
    body: Record<string, unknown>
}

export class AnthropicChatError extends Error {
    readonly status?: number
    constructor(message: string, status?: number) {
        super(message)
        this.name = 'AnthropicChatError'
        this.status = status
    }
}

/** Arguments travel as a JSON string internally; Anthropic wants the object. */
function safeToolInput(argumentsJson: string): unknown {
    try {
        return JSON.parse(argumentsJson || '{}')
    } catch {
        return {}
    }
}

/** A `tool` turn that may carry the results of a whole round, not just one call. */
type MergedTurn = BuildAnthropicRequestInput['turns'][number] & {
    toolResults?: Array<{ id: string; content: string }>
}

/**
 * Anthropic expects every `tool_result` of one round inside a SINGLE user
 * message. Our IR keeps one turn per call, which mapped to N consecutive user
 * messages: first-party merges them silently, Bedrock and several proxies
 * answer `messages: roles must alternate`. Merge here, at the translation, so
 * the IR stays one-turn-per-call for every other provider.
 */
function mergeToolRuns(turns: BuildAnthropicRequestInput['turns']): MergedTurn[] {
    const merged: MergedTurn[] = []
    for (const turn of senzaTurniVuoti(turns)) {
        const previous = merged[merged.length - 1]
        if (turn.role === 'tool' && previous?.role === 'tool') {
            previous.toolResults = [
                ...(previous.toolResults ?? [{ id: previous.toolCallId ?? '', content: previous.content }]),
                { id: turn.toolCallId ?? '', content: turn.content },
            ]
            continue
        }
        merged.push({ ...turn })
    }
    return rispondiAlleChiamateOrFANE(merged)
}

/**
 * ⛔⛔⛔ UN TURNO ASSISTANT VUOTO AVVELENA LA CHAT — la seconda metà del difetto.
 *
 * ## Misurato sul Pad il 2026-08-14
 *
 * Curate le chiamate orfane, la chat rotta ha risposto (08:09). Ma appena si
 * chiedeva di nuovo un'azione tornava `PROVIDER_CHAT_FAILED`. La sonda ha
 * mostrato il resto: un turno assistant senza testo esce come
 * `{"role":"assistant","content":""}`, e Anthropic rifiuta i messaggi vuoti.
 *
 * ⇒ **Ogni invio fallito ne lascia uno.** Quindi un errore ne genera un altro,
 * e la conversazione peggiora da sola a ogni tentativo: è il motivo per cui una
 * chat rotta non si riprendeva **nemmeno riprovando**.
 *
 * ## Perché si TOGLIE, mentre la chiamata orfana si CONSERVA
 *
 * Non è una scelta diversa, è la stessa: si tiene ciò che è un fatto. Una
 * chiamata orfana dice «il modello ha chiesto qualcosa», ed è vero. Un turno
 * assistant vuoto non dice niente — è il residuo di una risposta che non è mai
 * arrivata. Conservarlo non custodisce una verità, propaga un guasto.
 *
 * ⛔ I turni con `tool_use`, immagini o allegati NON sono vuoti anche se il
 * testo manca: il contenuto è nei blocchi. Si guarda tutto, non solo `content`.
 *
 * ⛔⛔ E i BLOCCHI DEL FORNITORE contano come contenuto — trovato da un test,
 * il 2026-08-17, mentre si rimetteva in piedi l'apertura a gradi.
 *
 * Un turno che porta solo `server_tool_use` e il suo risultato è il caso
 * NORMALE della ricerca lato server: il modello cerca, e in quel giro non ha
 * ancora niente da dire. Senza questa riga quel turno spariva — e con lui i
 * blocchi che l'API pretende indietro immutati, cioè esattamente la cosa che
 * si stava aggiungendo. La cura si sarebbe cancellata da sola, in silenzio, e
 * il sintomo sarebbe stato lo stesso 400 di prima.
 */
function senzaTurniVuoti(turns: BuildAnthropicRequestInput['turns']): BuildAnthropicRequestInput['turns'] {
    return turns.filter((turn) => turn.role !== 'assistant'
        || turn.content.trim() !== ''
        || (turn.toolCalls?.length ?? 0) > 0
        || (turn.providerBlocks?.length ?? 0) > 0
        || (turn.parts?.length ?? 0) > 0)
}

/**
 * ⛔⛔⛔ OGNI `tool_use` DEVE AVERE LA SUA RISPOSTA, o la conversazione è morta.
 *
 * ## Il difetto, misurato sul Pad il 2026-08-14
 *
 * Una richiesta è fallita **dopo** che il modello aveva emesso `tool_use` e
 * **prima** che salvassimo il risultato. Da quel momento quella chat ha
 * risposto `PROVIDER_CHAT_FAILED` a **ogni** messaggio successivo, per sempre:
 * Anthropic esige che ogni `tool_use` sia risposto da un `tool_result` nel
 * messaggio utente subito dopo, e lì non c'era.
 *
 * ⇒ Non è un caso raro e non è colpa di un esperimento: **qualunque**
 * interruzione fra la chiamata e il risultato — un errore del provider, un
 * invio annullato, l'app chiusa nel mezzo — lascia la conversazione
 * inutilizzabile. E non guarisce da sola: più si scrive, più si ripete.
 *
 * ## Perché si risponde invece di CANCELLARE la chiamata
 *
 * Togliere il `tool_use` cancellerebbe dalla storia il fatto che il modello ha
 * chiesto qualcosa — e quel fatto è vero, è successo, ed è la ragione per cui
 * la risposta dopo ha senso. Si conserva la domanda e si dice la verità sul
 * suo esito: **non è stato eseguito**. Il modello legge una storia coerente
 * invece di una amputata.
 *
 * ⛔ La riga è in inglese di proposito: la legge il modello, non la persona.
 */
function rispondiAlleChiamateOrFANE(turns: MergedTurn[]): MergedTurn[] {
    const fuori: MergedTurn[] = []
    for (const [indice, turn] of turns.entries()) {
        fuori.push(turn)
        if (!turn.toolCalls?.length) continue
        const dopo = turns[indice + 1]
        const risposti = new Set((dopo?.role === 'tool'
            ? dopo.toolResults ?? [{ id: dopo.toolCallId ?? '' }]
            : []).map((r) => r.id))
        const orfane = turn.toolCalls.filter((call) => !risposti.has(call.id))
        if (!orfane.length) continue
        fuori.push({
            role: 'tool',
            content: '',
            toolResults: orfane.map((call) => ({
                id: call.id,
                content: 'Not run: the request was interrupted before this tool could run.',
            })),
        })
    }
    return fuori
}

/**
 * TALOS's effort levels in the words `output_config.effort` accepts.
 *
 * `high` is the API default, so an unknown level lands there rather than
 * inventing a value the provider would refuse.
 */
function adaptiveEffort(effort: string | undefined): string {
    return effort === 'low' || effort === 'medium' ? effort : 'high'
}

/**
 * The provider naming the shape it wants, read out of its own 400.
 *
 * Anthropic's message is explicit and stable — `"thinking.type.enabled" is not
 * supported for this model. Use "thinking.type.adaptive"` — so the adapter can
 * learn which shape a model takes instead of carrying a list that goes stale.
 * Null for anything unrelated: retrying an unrelated 400 spends the owner's
 * tokens twice to earn the same refusal, and buries the real cause under a
 * second one.
 */
export function talosAnthropicThinkingFallback(
    message: string,
): 'enabled' | 'adaptive' | null {
    if (!message.includes('thinking.type')) return null
    if (message.includes('thinking.type.enabled')) return 'adaptive'
    if (message.includes('thinking.type.adaptive')) return 'enabled'
    return null
}

export function buildAnthropicRequest(apiKey: string, input: BuildAnthropicRequestInput): AnthropicHttpRequest {
    const budget = input.thinking === true && input.effort && input.effort !== 'off'
        ? THINKING_BUDGET[input.effort] ?? 0
        : 0
    /**
     * Anthropic requires the COMPLETE, signed thinking blocks to be replayed on
     * an assistant turn that precedes a `tool_result`. We cannot: the reasoning
     * channel is a flat string with no block identity and no signature, because
     * `signature_delta` is not captured. Sending the turn without them is a
     * documented 400 — and since every Anthropic model advertises `thinking`
     * and the composer toggle is one tap away, round two of ANY tool-using
     * conversation failed outright.
     *
     * So thinking is dropped for exactly the requests that carry a tool result.
     * The first round still thinks, and the user still sees the reasoning block
     * for it; what is lost is thinking on the follow-up rounds, which is a great
     * deal better than an error where the answer should be. Capturing and
     * replaying signed blocks is the real fix and is written up as a debt.
     */
    /*
     * ⛔⛔ L'ULTIMO turno, non «uno qualunque» — 2026-08-13.
     *
     * `some()` era giusto finché i turni di risultato esistevano SOLO dentro il
     * giro dell'agente: là l'ultimo turno è sempre un risultato, quindi «uno
     * qualunque» e «l'ultimo» coincidevano. Da oggi la storia riconsegna anche
     * le chiamate dei messaggi passati (vedi `storiaConLeChiamate.ts`, la cura
     * del difetto per cui TALOS diceva «Messaggio inviato» senza aver chiamato
     * niente) — e con `some()` una sessione che ha usato un tool **una volta**
     * avrebbe perso il ragionamento **per sempre**, su ogni messaggio futuro.
     *
     * La condizione che l'API chiede davvero è più stretta: i blocchi firmati
     * servono sull'assistente che precede IMMEDIATAMENTE un `tool_result` —
     * cioè quando stiamo rispondendo a dei risultati, e allora l'ultimo turno è
     * un risultato. Su una storia vecchia il modello non li pretende.
     */
    const carriesToolResult = input.turns[input.turns.length - 1]?.role === 'tool'
    const useThinking = budget > 0 && !carriesToolResult
    // Only the budgeted shape needs headroom reserved: in adaptive mode there
    // is no budget to leave room for, and inflating max_tokens would quietly
    // raise the ceiling on every answer.
    const budgeted = useThinking && (input.thinkingMode ?? 'adaptive') === 'enabled'
    /**
     * Il tetto dichiarato dal modello, e il ragionamento non lo sfonda.
     *
     * `Math.max` alza `max_tokens` per far spazio al budget di ragionamento, ed
     * era giusto finché il primo termine era un ripiego basso. Adesso il primo
     * termine può essere il tetto VERO del modello, e alzarlo oltre produrrebbe
     * un 400 su ogni messaggio — quindi il risultato torna sotto il dichiarato
     * quando c'è. Un ragionamento che non ci sta dentro il tetto del modello è
     * un vincolo del modello, non qualcosa da negoziare da qui.
     */
    const declared = input.maxTokens ?? null
    const wanted = Math.max(declared ?? FALLBACK_MAX_TOKENS, budgeted ? budget + 2048 : 0)
    const maxTokens = declared === null ? wanted : Math.min(wanted, declared)

    const body: Record<string, unknown> = {
        model: input.model,
        max_tokens: maxTokens,
        // One round of N tool calls produces N `tool` turns, each of which maps
        // to a separate USER message. api.anthropic.com merges them; Bedrock and
        // several proxies answer `roles must alternate`. Batch a run of tool
        // turns into the single user message the protocol actually describes.
        messages: mergeToolRuns(input.turns).map((turn) => ({
            // Anthropic has no `tool` role: a result is a USER message carrying
            // tool_result blocks, and the call itself is an ASSISTANT message
            // carrying tool_use blocks. Getting this wrong is rejected outright.
            role: turn.role === 'tool' ? 'user' : turn.role,
            content: turn.role === 'tool'
                ? (turn.toolResults ?? [{ id: turn.toolCallId ?? '', content: turn.content }])
                    .map((result) => ({ type: 'tool_result', tool_use_id: result.id, content: result.content }))
                : turn.toolCalls?.length || turn.providerBlocks?.length
                    ? [
                        /*
                         * ⛔ I BLOCCHI DEL FORNITORE VANNO PRIMA DEL TESTO.
                         *
                         * `server_tool_use` e il suo `tool_search_tool_result`
                         * sono ciò che il modello ha fatto PRIMA di parlare: la
                         * ricerca degli attrezzi precede la risposta. Rimetterli
                         * dopo il testo racconterebbe una storia in cui il
                         * modello risponde e poi cerca, e la coerenza di quella
                         * sequenza è ciò che l'API verifica.
                         *
                         * ⛔ E si rimettono COSÌ COME SONO: nessuna
                         * normalizzazione, nessun campo aggiunto. La
                         * documentazione dice «unmodified», e qualunque cosa
                         * facessimo qui sarebbe una modifica.
                         */
                        ...(turn.providerBlocks ?? []),
                        ...(turn.content ? [{ type: 'text', text: turn.content }] : []),
                        ...(turn.toolCalls ?? []).map((call) => ({
                            type: 'tool_use',
                            id: call.id,
                            name: call.name,
                            input: safeToolInput(call.arguments),
                        })),
                    ]
                    : !turn.parts?.length
                ? turn.content
                : [
                    ...(turn.content ? [{ type: 'text', text: turn.content }] : []),
                    ...turn.parts.map((part) => {
                        if (part.type === 'image') {
                            return {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: part.mediaType,
                                    data: part.base64,
                                },
                            }
                        }
                        return {
                            type: 'text',
                            text: part.type === 'document_text'
                                ? `[Untrusted attachment: ${part.name}]\n${part.text}`
                                : part.text,
                        }
                    }),
                ],
        })),
    }
    if (typeof input.system === 'string' && input.system.trim() !== '') {
        body.system = input.system
    }
    if (input.tools?.length) body.tools = withTalosAnthropicToolCache(input.tools)
    // Rolling breakpoint at the end of the conversation: the next round of the
    // agent loop reads everything up to here at 0.1x instead of re-sending it.
    body.messages = withTalosAnthropicMessageCache(body.messages as unknown[])
    if (useThinking) {
        if ((input.thinkingMode ?? 'adaptive') === 'adaptive') {
            // The newer shape: the model decides how much to think, and depth
            // is steered by effort rather than by a token budget.
            body.thinking = { type: 'adaptive' }
            body.output_config = { effort: adaptiveEffort(input.effort) }
        } else {
            body.thinking = { type: 'enabled', budget_tokens: budget }
        }
    }
    /**
     * No `temperature`, ever.
     *
     * Owner 2026-07-27 on claude-opus-5: HTTP 400, "`temperature` is deprecated
     * for this model." The 0.7 that used to be sent here was not his setting —
     * TALOS has no temperature control anywhere — it was a number I picked. The
     * parameter is optional and defaults to 1.0, so omitting it lets every
     * model apply its own default and stops the newest ones refusing the call
     * outright. Keeping a list of models that still accept it would be exactly
     * the static catalogue a distributed app must never ship.
     */

    return {
        url: ANTHROPIC_MESSAGES_URL,
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
        },
        body,
    }
}

function extractErrorMessage(data: unknown): string | null {
    if (data && typeof data === 'object') {
        const error = (data as { error?: unknown }).error
        if (error && typeof error === 'object') {
            const message = (error as { message?: unknown }).message
            if (typeof message === 'string' && message.trim() !== '') return message
        }
    }
    return null
}

export function parseAnthropicResponse(status: number, data: unknown): string {
    if (status < 200 || status >= 300) {
        throw new AnthropicChatError(extractErrorMessage(data) ?? `Anthropic API error (HTTP ${status})`, status)
    }
    const content = (data as { content?: unknown } | null)?.content
    if (!Array.isArray(content)) {
        throw new AnthropicChatError('Malformed Anthropic response: missing content array', status)
    }
    const text = content
        .filter((block): block is { type: string; text: string } =>
            !!block && typeof block === 'object'
            && (block as { type?: unknown }).type === 'text'
            && typeof (block as { text?: unknown }).text === 'string')
        .map((block) => block.text)
        .join('')
    if (text === '') {
        throw new AnthropicChatError('Anthropic response contained no text', status)
    }
    return text
}

export interface HttpTransport {
    post(request: { url: string; headers: Record<string, string>; data: unknown }): Promise<{ status: number; data: unknown }>
}

/** Real transport: CapacitorHttp on device (native, no CORS), fetch fallback on web/dev. */
export const capacitorHttpTransport: HttpTransport = {
    async post({ url, headers, data }) {
        const response = await CapacitorHttp.post({ url, headers, data })
        return { status: response.status, data: response.data }
    },
}

export async function sendAnthropicChat(
    apiKey: string,
    input: BuildAnthropicRequestInput,
    transport: HttpTransport = capacitorHttpTransport,
): Promise<string> {
    const request = buildAnthropicRequest(apiKey, input)
    let response: { status: number; data: unknown }
    try {
        response = await transport.post({ url: request.url, headers: request.headers, data: request.body })
    } catch (error) {
        throw new AnthropicChatError(error instanceof Error ? error.message : 'Network request failed')
    }
    return parseAnthropicResponse(response.status, response.data)
}

import { z } from 'zod'
import type { TalosMobileProviderId } from '@/components/chat/mobileChatTypes'
import type {
    TalosMobileCompletionInput,
    TalosMobileCompletionResult,
    TalosMobileProviderAdapter,
    TalosMobileProviderCatalog,
    TalosMobileProviderCredential,
    TalosMobileProviderModel,
} from '@/lib/chat/providerContracts'
import type { TalosMobileHttpTransport } from '@/lib/chat/httpTransport'
import { createTalosSseAccumulator, talosStreamText } from '@/lib/chat/providers/streamShared'
import { talosTettoDaiCrediti } from '@/lib/chat/tettoDaiCrediti'
import { talosPromptCacheKey } from '@/lib/chat/promptCache'
import { talosModelSupportsToolCalling } from '@/lib/chat/modelToolCapabilities'
import { talosToolsForOpenAiResponses } from '@/lib/tools/registry'
import { talosReadOpenAiResponse, talosReadOpenAiResponsesEvent } from '@/lib/chat/providers/openAiResponses'
import {
    TALOS_OPENAI_REASONING_NONE,
    talosHasReasoningConflict,
    talosOpenAiRejectsToolsWithReasoning,
    talosRememberReasoningConflict,
} from '@/lib/chat/providers/openAiReasoningTools'
import { talosToolsForOpenAi } from '@/lib/tools/registry'
import { createOpenAiToolCallAccumulator, parseOpenAiToolCalls } from '@/lib/tools/wire'
import {
    emptyProviderResponse,
    malformedProviderResponse,
    normalizeHttpEndpoint,
    requireHttpSuccess,
    requireProviderApiKey,
    sendWithProviderRetry,
} from '@/lib/chat/providerErrors'
import { talosNumericUsage } from '@/lib/chat/providers/usage'

const modelSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    canonical_slug: z.string().min(1).optional(),
    context_length: z.number().int().positive().optional(),
    created: z.number().optional(),
    owned_by: z.string().optional(),
    expiration_date: z.string().nullable().optional(),
    architecture: z.object({
        input_modalities: z.array(z.string()).optional(),
        output_modalities: z.array(z.string()).optional(),
    }).optional(),
    supported_parameters: z.array(z.string()).optional(),
}).passthrough()

const listSchema = z.object({ data: z.array(modelSchema) }).passthrough()
const completionSchema = z.object({
    model: z.string().optional(),
    choices: z.array(z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({
            // OpenAI documents content as "required UNLESS tool_calls is
            // specified", and sends a literal null on a tool-calling turn.
            // Demanding a string here rejected every buffered tool response as
            // malformed — before the tool calls were ever read.
            content: z.union([
                z.string(),
                z.array(z.object({ type: z.string().optional(), text: z.string().optional() }).passthrough()),
            ]).nullish(),
            // The reasoning channel, under all three names the field has been
            // given. `streamComplete` has always read these; `complete` did not,
            // and a model that answered there had its reply thrown away as
            // "malformed". Same file, same provider, two strands of knowledge.
            reasoning: z.string().nullish(),
            reasoning_content: z.string().nullish(),
            reasoning_details: z.array(z.object({ text: z.string().optional() }).passthrough()).nullish(),
        }).passthrough(),
    }).passthrough()).min(1),
    usage: z.record(z.string(), z.unknown()).optional(),
}).passthrough()

interface OpenAiCompatibleConfig {
    provider: Extract<TalosMobileProviderId, 'openai' | 'deepseek' | 'openrouter'>
    baseUrl: string
    metadata: 'basic' | 'openrouter'
}

function contentText(content: string | Array<{ text?: string }>): string {
    return typeof content === 'string'
        ? content
        : content.map((part) => part.text ?? '').join('')
}

/**
 * What the model said, wherever it decided to say it.
 *
 * The answer belongs in `content` and usually is. When it is not, it is in the
 * reasoning channel — and which of the three names that channel carries depends
 * on the model, not on the provider: `reasoning` on OpenRouter,
 * `reasoning_content` on DeepSeek-style APIs, `reasoning_details` on the newer
 * OpenRouter models whose content, in several published integrations, was being
 * dropped in silence.
 *
 * Real content always wins: a model that sends both must not have its notes
 * preferred to its answer.
 */
function answerText(message: {
    content?: string | Array<{ text?: string }> | null
    reasoning?: string | null
    reasoning_content?: string | null
    reasoning_details?: Array<{ text?: string }> | null
}): string {
    const said = contentText(message.content ?? '').trim()
    if (said) return said
    const thought = message.reasoning
        ?? message.reasoning_content
        ?? (message.reasoning_details ?? []).map((part) => part.text ?? '').join('')
    return (thought ?? '').trim()
}

function untrustedDocument(name: string, text: string): string {
    return `[Untrusted attachment: ${name}]\n${text}`
}

function openAiTurnContent(turn: TalosMobileCompletionInput['turns'][number]): string | Array<Record<string, unknown>> {
    if (!turn.parts?.length) return turn.content
    const content: Array<Record<string, unknown>> = []
    if (turn.content) content.push({ type: 'text', text: turn.content })
    for (const part of turn.parts) {
        if (part.type === 'image') {
            content.push({
                type: 'image_url',
                image_url: { url: `data:${part.mediaType};base64,${part.base64}` },
            })
        } else if (part.type === 'document_text') {
            content.push({ type: 'text', text: untrustedDocument(part.name, part.text) })
        } else {
            content.push({ type: 'text', text: part.text })
        }
    }
    return content
}

/**
 * `/responses` uses a different multimodal vocabulary from the compatible
 * Chat Completions wire: text is `input_text`, images are `input_image`, and
 * `image_url` is the data URL itself rather than an object containing `url`.
 */
function openAiResponsesTurnContent(
    turn: TalosMobileCompletionInput['turns'][number],
): string | Array<Record<string, unknown>> {
    if (!turn.parts?.length) return turn.content
    const content: Array<Record<string, unknown>> = []
    if (turn.content) content.push({ type: 'input_text', text: turn.content })
    for (const part of turn.parts) {
        if (part.type === 'image') {
            content.push({
                type: 'input_image',
                image_url: `data:${part.mediaType};base64,${part.base64}`,
            })
        } else if (part.type === 'document_text') {
            content.push({ type: 'input_text', text: untrustedDocument(part.name, part.text) })
        } else {
            content.push({ type: 'input_text', text: part.text })
        }
    }
    return content
}

function requestTimeouts(credential: TalosMobileProviderCredential): { connectTimeout: number; readTimeout: number } | Record<string, never> {
    const timeout = credential.timeoutMs
    return Number.isInteger(timeout) && timeout! > 0
        ? { connectTimeout: timeout!, readTimeout: timeout! }
        : {}
}

function compatibleBaseUrl(
    config: OpenAiCompatibleConfig,
    credential: TalosMobileProviderCredential,
    operation: 'list_models' | 'complete',
): string {
    return credential.endpoint
        ? normalizeHttpEndpoint(config.provider, operation, credential.endpoint)
        : config.baseUrl
}

function normalizeModel(config: OpenAiCompatibleConfig, model: z.infer<typeof modelSchema>): TalosMobileProviderModel {
    const outputs = model.architecture?.output_modalities ?? []
    const compatibility = config.metadata === 'openrouter'
        ? (outputs.includes('text') ? 'supported' : 'unsupported')
        : 'unknown'
    return {
        id: model.id,
        provider: config.provider,
        displayName: model.name ?? model.id,
        chatCompatibility: compatibility,
        canonicalSlug: model.canonical_slug ?? null,
        contextLength: model.context_length ?? null,
        inputModalities: [...(model.architecture?.input_modalities ?? [])],
        outputModalities: [...outputs],
        supportedParameters: [...(model.supported_parameters ?? [])],
        createdAt: model.created ?? null,
        expiresAt: model.expiration_date ?? null,
        ownedBy: model.owned_by ?? null,
    }
}

/**
 * Il corpo per `/v1/responses`, che e' un'altra cosa da `messages`.
 *
 * Owner 2026-08-03: su `/v1/chat/completions` i modelli nuovi rifiutano tool e
 * ragionamento insieme, e siccome TALOS offre i suoi tool a ogni messaggio, su
 * quei modelli non funziona niente. Qui convivono — verificato interrogando
 * l'API, non letto.
 *
 * Le tre differenze che romperebbero un porting fatto a memoria:
 * `instructions` al posto del messaggio di sistema, `input` al posto di
 * `messages`, e i tool PIATTI.
 *
 * `store: false` e' deliberato: TALOS non vuole che le conversazioni restino
 * sul server. Il prezzo e' che il contesto lo ricostruiamo noi a ogni
 * richiesta, ed e' il motivo per cui il lettore conserva ogni elemento.
 */
/** Una riga vuota fra due riepiloghi: sono paragrafi, non righe. */
const TALOS_SUMMARY_SEPARATOR = `

`

function responsesCompletionData(
    input: TalosMobileCompletionInput,
    stream: boolean,
): Record<string, unknown> {
    const items: Array<Record<string, unknown>> = []
    for (const turn of input.turns) {
        /**
         * IL CICLO DEI TOOL, che qui non ha un ruolo `tool`.
         *
         * Su chat/completions il risultato e' un messaggio con
         * `role: "tool"` e `tool_call_id`. Qui sono ELEMENTI, non messaggi:
         * `function_call` per la richiesta e `function_call_output` per la
         * risposta, appaiati da `call_id`. Con `store: false` il contesto lo
         * ricostruiamo noi a ogni richiesta, quindi la chiamata originale va
         * RIMESSA accanto al suo risultato — se manca, il modello riceve un
         * esito senza sapere di che domanda fosse.
         */
        if (turn.role === 'tool') {
            items.push({
                type: 'function_call_output',
                call_id: turn.toolCallId ?? '',
                // Stringa, sempre: l'API accetta anche strutture ricche, ma un
                // oggetto grezzo qui diventerebbe `[object Object]`.
                output: typeof turn.content === 'string' ? turn.content : JSON.stringify(turn.content),
            })
            continue
        }
        if (turn.role !== 'user' && turn.role !== 'assistant') continue
        const content = openAiResponsesTurnContent(turn)
        if (typeof content === 'string' ? content !== '' : content.length > 0) {
            items.push({ role: turn.role, content })
        }
        for (const call of turn.toolCalls ?? []) {
            items.push({
                type: 'function_call',
                call_id: call.id,
                name: call.name,
                arguments: call.arguments,
            })
        }
    }

    const data: Record<string, unknown> = {
        model: input.model.id,
        input: items,
        stream,
        store: false,
    }
    if (input.system?.trim()) data.instructions = input.system
    const tools = talosModelSupportsToolCalling(input.model) ? input.tools : undefined
    if (tools?.length) {
        data.tools = talosToolsForOpenAiResponses(tools)
        data.tool_choice = 'auto'
    }
    /**
     * `high` resta `high`, e qui sta il punto della migrazione.
     *
     * Sul vecchio endpoint la stessa richiesta costringeva a scendere a
     * `'none'` per poter offrire i tool. Qui no: la famiglia GPT-5.6 accetta
     * il livello scelto insieme ai tool, quindi la scelta dell'utente arriva
     * al modello come l'ha fatta.
     */
    if (input.effort !== 'off') data.reasoning = { effort: input.effort }
    return data
}

/**
 * ⛔ Esportata per essere PROVABILE: la forma del corpo è ciò che un provider
 * accetta o rifiuta, e una chiamata orfana qui dentro rende una conversazione
 * inutilizzabile per sempre. Un invariante di quel peso deve avere un test che
 * lo guarda direttamente, non attraverso un trasporto finto.
 */
export function compatibleCompletionData(
    config: OpenAiCompatibleConfig,
    input: TalosMobileCompletionInput,
    stream: boolean,
    /**
     * ⛔ Il tetto di risposta, e solo quando il PROVIDER l'ha dichiarato.
     *
     * Non si manda mai di nostra iniziativa: un numero scelto da noi
     * accorcerebbe risposte legittime per proteggere da un problema che
     * riguarda il preventivo. Qui arriva soltanto dal rifiuto — vedi
     * `tettoDaiCrediti.ts`.
     */
    tetto?: number,
): Record<string, unknown> {
    const messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }> = []
    if (input.system?.trim()) messages.push({ role: 'system', content: input.system })
    for (const [indice, turn] of input.turns.entries()) {
        if (turn.role === 'tool') {
            // A tool RESULT is its own role here, tied to the call it answers.
            messages.push({ role: 'tool', content: turn.content, tool_call_id: turn.toolCallId ?? '' } as never)
            continue
        }
        const message: Record<string, unknown> = { role: turn.role, content: openAiTurnContent(turn) }
        if (turn.toolCalls?.length) {
            // The assistant turn that REQUESTED tools has to carry the calls, or
            // the provider rejects the tool results that follow it.
            message.tool_calls = turn.toolCalls.map((call) => ({
                id: call.id,
                type: 'function',
                function: { name: call.name, arguments: call.arguments },
            }))
        }
        messages.push(message as never)
        /*
         * ⛔⛔⛔ E OGNI CHIAMATA DEVE AVERE LA SUA RISPOSTA, o la conversazione
         * è morta — lo stesso difetto misurato su Anthropic il 2026-08-14,
         * qui perché il vincolo è identico: «an assistant message with
         * tool_calls must be followed by tool messages responding to each
         * tool_call_id».
         *
         * Se una richiesta si interrompe fra la chiamata e il risultato — un
         * errore del provider, un invio annullato, l'app chiusa nel mezzo —
         * resta una chiamata orfana. E siccome la storia si rispedisce
         * **intera** a ogni turno, quella chat smette di funzionare **per
         * sempre**, non una volta.
         *
         * ⛔ Si RISPONDE, non si cancella la chiamata: togliere il `tool_calls`
         * cancellerebbe dalla storia il fatto che il modello ha chiesto
         * qualcosa, che è vero ed è la ragione per cui la risposta dopo ha
         * senso. Si conserva la domanda e si dice la verità sul suo esito.
         */
        for (const call of turn.toolCalls ?? []) {
            const risposta = input.turns.slice(indice + 1)
                .find((dopo) => dopo.role !== 'tool' || dopo.toolCallId === call.id)
            if (risposta?.role === 'tool') continue
            messages.push({
                role: 'tool',
                content: 'Not run: the request was interrupted before this tool could run.',
                tool_call_id: call.id,
            } as never)
        }
    }
    const data: Record<string, unknown> = { model: input.model.id, messages, stream }
    if (tetto !== undefined) data.max_tokens = tetto
    const compatibleTools = talosModelSupportsToolCalling(input.model) ? input.tools : undefined
    if (compatibleTools?.length) {
        data.tools = talosToolsForOpenAi(compatibleTools)
        data.tool_choice = 'auto'
    }
    if (config.provider === 'openrouter' && input.effort !== 'off' && input.model.supportedParameters.includes('reasoning')) {
        data.reasoning = { effort: input.effort }
    }
    if (config.provider === 'openai' && input.effort !== 'off' && input.model.supportedParameters.includes('reasoning_effort')) {
        /**
         * `'none'` ESPLICITO quando questo modello ha gia' rifiutato la coppia.
         *
         * Non «non mandarlo»: provato contro l'API vera il 2026-08-03, con il
         * campo OMESSO il rifiuto e' identico — il modello applica un livello
         * suo lato server. Solo un `'none'` scritto lo disarma.
         */
        const conflicted = data.tools !== undefined && talosHasReasoningConflict(input.model.id)
        data.reasoning_effort = conflicted ? TALOS_OPENAI_REASONING_NONE : input.effort
    }
    /**
     * OpenAI caches prefixes over 1,024 tokens on its own; this only tells it
     * WHICH cache to look in, which the docs say raises the hit rate for
     * requests sharing a long prefix. Ours is ~2,099 tokens, almost all of it
     * tool schemas.
     *
     * OpenAI only. DeepSeek and OpenRouter cache without being asked, and this
     * codebase has been bitten three times by sending a parameter a provider
     * did not declare — `temperature`, `thinking.type`, `const` — each time as
     * an HTTP 400 in the owner's face.
     */
    if (config.provider === 'openai') {
        const key = talosPromptCacheKey(
            `${input.system ?? ''}|${(input.tools ?? []).map((tool) => tool.name).join(',')}`,
        )
        if (key) data.prompt_cache_key = key
    }
    return data
}

function createOpenAiCompatibleAdapter(config: OpenAiCompatibleConfig): TalosMobileProviderAdapter {
    return {
        provider: config.provider,
        requiresSecret: true,
        // OpenAI, DeepSeek and OpenRouter each publish a fixed base URL, baked
        // in below. The key is the only thing that is not already known.
        requiresEndpoint: false,
        async listModels(credential: TalosMobileProviderCredential, transport: TalosMobileHttpTransport): Promise<TalosMobileProviderCatalog> {
            const apiKey = requireProviderApiKey(config.provider, 'list_models', credential)
            const baseUrl = compatibleBaseUrl(config, credential, 'list_models')
            const response = await transport.request({
                method: 'GET',
                url: `${baseUrl}/models`,
                headers: { authorization: `Bearer ${apiKey}` },
                ...requestTimeouts(credential),
            })
            requireHttpSuccess({ provider: config.provider, operation: 'list_models', status: response.status, data: response.data })
            const parsed = listSchema.safeParse(response.data)
            if (!parsed.success) throw malformedProviderResponse(config.provider, 'list_models', { received: response.data, issues: parsed.error.issues })
            return {
                provider: config.provider,
                models: parsed.data.data.map((model) => normalizeModel(config, model)),
            }
        },
        async complete(input: TalosMobileCompletionInput, credential: TalosMobileProviderCredential, transport: TalosMobileHttpTransport): Promise<TalosMobileCompletionResult> {
            const apiKey = requireProviderApiKey(config.provider, 'complete', credential)
            const baseUrl = compatibleBaseUrl(config, credential, 'complete')
            /**
             * OpenAI parla un altro endpoint, e la deviazione e' QUI, dentro il
             * ramo che gia' esisteva per provider.
             *
             * Non un adattatore nuovo: duplicherebbe autenticazione, timeout,
             * abort, ricevuta e smistamento dei tool. DeepSeek, OpenRouter e
             * Ollama restano dove sono, e il test di regressione controlla
             * proprio che il loro corpo non cambi.
             */
            if (config.provider === 'openai') {
                // DEBT-MOBILE-016: un 429/408/5xx si ritenta con backoff (onora
                // Retry-After se il fornitore lo manda) invece di lanciare al
                // primo colpo — vedi la doc sopra `sendWithProviderRetry`.
                const response = await sendWithProviderRetry(() => transport.request({
                    method: 'POST',
                    url: `${baseUrl}/responses`,
                    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
                    data: responsesCompletionData(input, false),
                    ...requestTimeouts(credential),
                }))
                requireHttpSuccess({ provider: 'openai', operation: 'complete', status: response.status, data: response.data })
                const read = talosReadOpenAiResponse(response.data)
                // Un turno che chiama un tool ha legittimamente zero testo: la
                // risposta E' la chiamata. Rifiutarlo come vuoto romperebbe il
                // ciclo prima che cominci.
                if (!read.text && read.toolCalls.length === 0) {
                    throw emptyProviderResponse('openai', 'complete', read.status)
                }
                return {
                    text: read.text,
                    model: input.model.id,
                    /**
                     * `tool_calls` quando ce ne sono, e non lo stato.
                     *
                     * Il ciclo a valle riparte guardando QUESTO campo: con
                     * `completed` una chiamata tornerebbe indietro corretta e
                     * non verrebbe eseguita da nessuno — la conversazione si
                     * fermerebbe con una richiesta in mano e nessuno a
                     * rispondere.
                     */
                    finishReason: read.toolCalls.length ? 'tool_calls' : read.status,
                    usage: read.usage,
                    toolCalls: read.toolCalls.map((call) => ({ ...call })),
                    // Il riepilogo, non la catena di pensiero: quella resta
                    // cifrata e non si mostra.
                    reasoning: read.reasoningSummaries.join(TALOS_SUMMARY_SEPARATOR) || undefined,
                }
            }

            const send = async (payload: Record<string, unknown>) => transport.request({
                method: 'POST',
                url: `${baseUrl}/chat/completions`,
                headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
                data: payload,
                ...requestTimeouts(credential),
            })
            /**
             * DEBT-MOBILE-016: tutta la risoluzione qui sotto (il tentativo
             * base, più i due auto-correttivi già esistenti) diventa UN
             * `send()` solo agli occhi di `sendWithProviderRetry` — un 429/
             * 408/5xx la rifà da capo con backoff (Retry-After onorato se
             * c'è); un 400/401/402/404 esce al primo giro come sempre, ed è
             * lì che i due rami sotto continuano a fare il loro lavoro.
             */
            const resolveResponse = async () => {
                let response = await send(compatibleCompletionData(config, input, false))
                /**
                 * Si impara dal rifiuto invece di portarsi dietro un elenco.
                 *
                 * Owner 2026-08-03, con uno screenshot: `gpt-5.6-luna` rispondeva
                 * 400 a «Ciaoo», perche' TALOS offre i suoi tool a ogni messaggio e
                 * quel modello non li accetta insieme al ragionamento. Un elenco
                 * cablato invecchierebbe dentro l'APK e sbaglierebbe sul prossimo
                 * modello; il provider invece lo dice, e lo dice in modo
                 * riconoscibile. Un solo nuovo tentativo, e il modello resta
                 * segnato per il resto della sessione.
                 */
                if (talosOpenAiRejectsToolsWithReasoning(response.status, response.data)) {
                    talosRememberReasoningConflict(input.model.id)
                    response = await send(compatibleCompletionData(config, input, false))
                }
                /*
                 * ⛔⛔ IL RIPIEGO SUL CREDITO ESISTEVA E COPRIVA UNA STRADA SOLA.
                 *
                 * `conRipiegoSulCredito`, scritto il 2026-08-10, vive nel ramo in
                 * STREAMING. Questo ramo — la chiamata secca — non l'ha mai avuto,
                 * e chi passa di qui riceve il 402 in faccia.
                 *
                 * MISURATO sul Pad il 2026-08-13, dal pilota dello schermo:
                 *
                 * > `pilota: chiedi-in-errore TalosMobileProviderError: This request
                 * > requires more credits, or fewer max_tokens. You requested up to
                 * > 65536 tokens, but can only afford 5020`
                 *
                 * — e la corsa moriva a `passi=0 ms=175`, cioe' prima di guardare
                 * lo schermo anche una sola volta. Da fuori sembrava che il modello
                 * non capisse il compito; in realta' non era mai stato interrogato.
                 *
                 * ⇒ Stessa cura, stessa funzione, un solo ritentativo: il rifiuto
                 * porta il numero, e il numero diventa il tetto. Il primo tentativo
                 * non costa token — il 402 e' un controllo di budget e cade prima
                 * della generazione.
                 */
                const tettoDalRifiuto = talosTettoDaiCrediti(JSON.stringify(response.data ?? ''))
                if (tettoDalRifiuto !== null) {
                    response = await send(compatibleCompletionData(config, input, false, tettoDalRifiuto))
                }
                return response
            }
            const response = await sendWithProviderRetry(resolveResponse)
            requireHttpSuccess({ provider: config.provider, operation: 'complete', status: response.status, data: response.data })
            const parsed = completionSchema.safeParse(response.data)
            if (!parsed.success) throw malformedProviderResponse(config.provider, 'complete', { received: response.data, issues: parsed.error.issues })
            const choice = parsed.data.choices[0]!
            const text = answerText(choice.message)
            const toolCalls = parseOpenAiToolCalls(choice.message)
            // A tool-calling turn legitimately has NO text: refusing it as
            // malformed would break the loop before it started.
            //
            // And when there is genuinely nothing — a reasoning model that spent
            // its whole token budget thinking, which is measured behaviour and
            // not a hypothesis — the answer ARRIVED and was well formed. It was
            // empty. Calling that "malformed" sends the reader looking for a
            // broken provider instead of a model that needs more room.
            if (!text && toolCalls.length === 0) {
                throw emptyProviderResponse(config.provider, 'complete', choice.finish_reason ?? null)
            }
            return {
                text,
                model: parsed.data.model ?? input.model.id,
                finishReason: choice.finish_reason ?? null,
                usage: talosNumericUsage(parsed.data.usage),
                ...(toolCalls.length ? { toolCalls } : {}),
            }
        },
        // F2-T4: native fetch SSE (`choices[0].delta.content`). OpenAI blocks
        // browser-origin calls — that surfaces as a pre-first-byte failure and
        // the router transparently retries via the buffered transport.
        async streamComplete(input, credential, handlers) {
            const apiKey = requireProviderApiKey(config.provider, 'complete', credential)
            const baseUrl = compatibleBaseUrl(config, credential, 'complete')

            /**
             * Lo streaming di `/v1/responses`, che ha eventi TUTTI SUOI.
             *
             * `chat.completion.chunk` qui non esiste: il testo arriva in
             * `response.output_text.delta`, la chiamata completa in
             * `response.output_item.done`, l'uso in `response.completed`.
             *
             * La chiamata NON si ricompone dai delta degli argomenti: l'API la
             * consegna intera, con il suo `call_id`, e ricostruirla a mano
             * sarebbe lavoro in piu' e meno affidabile.
             */
            if (config.provider === 'openai') {
                const calls: Array<{ name: string, arguments: string, id: string }> = []
                let usage: Record<string, number> | null = null
                const stream = await talosStreamText({
                    url: `${baseUrl}/responses`,
                    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
                    body: responsesCompletionData(input, true),
                    signal: handlers.signal,
                    accumulator: createTalosSseAccumulator(),
                    extract: (payload) => {
                        const read = talosReadOpenAiResponsesEvent(JSON.parse(payload))
                        if (read.kind === 'tool-call') calls.push({ ...read.call })
                        if (read.kind === 'done') usage = read.usage
                        return read.kind === 'text' ? read.delta : ''
                    },
                    onChunk: handlers.onChunk,
                    onReasoning: handlers.onReasoning,
                })
                if (!stream.text && calls.length === 0) {
                    throw malformedProviderResponse('openai', 'complete', {
                        received: { text: stream.text, calls: calls.length },
                        note: 'stream ended with no text and no tool calls',
                    })
                }
                return {
                    text: stream.text,
                    model: input.model.id,
                    usage,
                    ...(calls.length ? { toolCalls: calls, finishReason: 'tool_calls' } : {}),
                }
            }

            const toolCalls = createOpenAiToolCallAccumulator()
            /*
             * ⛔⛔ IL RIFIUTO PER CREDITI SI IMPARA, non si mostra.
             *
             * Owner 2026-08-10, screenshot: «You requested up to 65536 tokens,
             * but can only afford 65050». Quei 65.536 non li chiedevamo noi —
             * il corpo qui sopra NON ha mai avuto `max_tokens`: e' OpenRouter
             * che, senza il campo, riserva il massimo di output del modello
             * contro il credito.
             *
             * ⇒ Si prova senza tetto (nessuna risposta accorciata per
             * prudenza); se il rifiuto arriva, porta con se' il numero, e si
             * riprova UNA volta con quello. Il primo tentativo non costa token:
             * il 402 e' un controllo di budget e cade prima della generazione.
             */
            const conRipiegoSulCredito = async <T>(giro: (tetto?: number) => Promise<T>): Promise<T> => {
                try {
                    return await giro(undefined)
                }
                catch (errore) {
                    const detto = errore instanceof Error ? errore.message : String(errore)
                    const tetto = talosTettoDaiCrediti(detto)
                    // ⛔ Un solo ritentativo: se anche col tetto dichiarato non
                    // passa, il credito non basta davvero e insistere sarebbe
                    // nascondere alla persona una cosa che deve sapere.
                    if (tetto === null) throw errore
                    return await giro(tetto)
                }
            }
            const stream = await conRipiegoSulCredito(async (tetto) => await talosStreamText({
                url: `${baseUrl}/chat/completions`,
                headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
                body: compatibleCompletionData(config, input, true, tetto),
                signal: handlers.signal,
                accumulator: createTalosSseAccumulator(),
                extract: (payload) => {
                    const event = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string | null } }> }
                    toolCalls.push(event)
                    return event.choices?.[0]?.delta?.content ?? ''
                },
                // Defect #5: DeepSeek streams `reasoning_content`, OpenRouter
                // `reasoning`. Both are the model thinking out loud, and both
                // used to be dropped on the floor.
                extractReasoning: (payload) => {
                    const event = JSON.parse(payload) as {
                        choices?: Array<{ delta?: { reasoning_content?: string | null; reasoning?: string | null } }>
                    }
                    const delta = event.choices?.[0]?.delta
                    // `||`, not `??`: a gateway that mirrors both fields sends an
                    // EMPTY reasoning_content beside a populated reasoning, and
                    // nullish-coalescing would take the empty one.
                    return delta?.reasoning_content || delta?.reasoning || ''
                },
                onChunk: handlers.onChunk,
                onReasoning: handlers.onReasoning,
            }))
            const calls = toolCalls.calls()
            if (!stream.text && calls.length === 0) throw malformedProviderResponse(config.provider, 'complete', { received: { text: stream.text, calls: calls.length }, note: 'stream ended with no text and no tool calls' })
            return {
                text: stream.text,
                model: input.model.id,
                reasoning: stream.reasoning || undefined,
                ...(calls.length ? { toolCalls: calls, finishReason: 'tool_calls' } : {}),
            }
        },
    }
}

export const openAiAdapter = createOpenAiCompatibleAdapter({ provider: 'openai', baseUrl: 'https://api.openai.com/v1', metadata: 'basic' })
export const deepSeekAdapter = createOpenAiCompatibleAdapter({ provider: 'deepseek', baseUrl: 'https://api.deepseek.com', metadata: 'basic' })
export const openRouterAdapter = createOpenAiCompatibleAdapter({ provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', metadata: 'openrouter' })

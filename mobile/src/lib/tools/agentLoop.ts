import type { ChatTurn, TalosToolCall } from '@/stores/chat'
import type { TalosMobileInputPart } from '@/lib/chat/attachmentContracts'
import type { AppendChatAttachmentInput } from '@/repositories/chatRepository'

/**
 * The agent loop: ask, run what the model asked for, tell it what happened,
 * ask again. Bounded, because an unbounded loop is an elegant way to spend the
 * owner's tokens without asking him.
 *
 * The bounds are two, and they answer different failure modes:
 *  - ROUNDS caps "think, call, think, call" ping-pong;
 *  - CALLS caps a single round that asks for forty tools at once.
 * When either is reached the model is TOLD, as a tool result, rather than
 * being cut off mid-thought: a model that knows it has run out of tool budget
 * writes a final answer, while one that is simply silenced leaves the user with
 * whatever half-sentence it had produced.
 */
export const TALOS_AGENT_MAX_ROUNDS = 5
export const TALOS_AGENT_MAX_CALLS = 12

/**
 * How many of a round's calls run at once.
 *
 * Owner 2026-07-26: a research-then-PDF prompt was "incredibilmente lento". The
 * round ran single file — five searches at a second each cost five seconds to
 * produce what one second of concurrency would have. Anthropic, on their own
 * Research product: "Our early agents executed sequential searches, which was
 * painfully slow"; parallelising it "cut research time by up to 90% for complex
 * queries". Independent measurement puts tool EXECUTION at ~50% of the wall
 * clock on deep-research tasks (arXiv 2603.18897).
 *
 * Four, not unbounded. This runs on a phone: Chromium allows 6 sockets per
 * host, and Android's radio charges a promotion for every burst, so ten fetches
 * at once are not faster — only hotter. Four keeps the useful part of the win
 * and leaves headroom for the response stream that is still open.
 */
export const TALOS_AGENT_MAX_PARALLEL = 4

export interface TalosAgentCompletion {
    text: string
    finishReason?: string | null
    reasoning?: string
    toolCalls?: TalosToolCall[]
}

export interface TalosAgentLoopDeps {
    /** One provider round trip. */
    complete(turns: ChatTurn[]): Promise<TalosAgentCompletion>
    /**
     * Resolves every call in a round before any call is allowed to execute.
     * Omit only for legacy callers whose executor owns the complete gate.
     */
    preflight?(call: TalosToolCall): Promise<
        | { status: 'ready' }
        | { status: 'authorization_required'; request: unknown }
    >
    /** Runs one call through the permission gate and the audit trail. */
    execute(call: TalosToolCall): Promise<{
        content: string
        ok: boolean
        /** Anything the model should LOOK at, handed over on a user turn. */
        images?: TalosMobileInputPart[]
        /** Vault bindings to keep on the final assistant message. */
        messageAttachments?: AppendChatAttachmentInput[]
    }>
    /**
     * ⛔ B2 — il piano, chiesto PRIMA che qualsiasi cosa parta.
     *
     * Riceve le chiamate del giro e risponde quali sono ammesse. Chi decide se
     * un piano serva davvero non è il loop: è chi implementa questo gancio, che
     * conosce rischio, reversibilità e la soglia. Qui dentro resta una regola
     * sola, ed è quella che conta — **nessuna chiamata parte prima che la
     * risposta sia arrivata**.
     *
     * `cancelled` non è un errore: è una persona che ha detto no dopo aver
     * letto. Il giro finisce, ogni chiamata riceve la sua riga, e il modello
     * risponde con quello che ha.
     */
    plan?(calls: readonly TalosToolCall[]): Promise<{
        /** Gli id delle chiamate che possono partire, nell'ordine del provider. */
        admitted: readonly string[]
        /** Vero se la persona ha rifiutato il piano invece di ridurlo. */
        cancelled: boolean
    }>
    /** Fired when a round of calls starts, so the UI can show what is running. */
    onToolRound?(calls: TalosToolCall[]): void
    /**
     * Persist this state after tool effects/results exist and before the next
     * provider request. If persistence fails, provider egress must not occur.
     */
    onBeforeModelCheckpoint?(checkpoint: TalosAgentLoopCheckpointV1): void | Promise<void>
    maxRounds?: number
    maxCalls?: number
    /** How many of one round's calls may run at once. */
    maxParallel?: number
}

export interface TalosAgentLoopOutcome extends TalosAgentCompletion {
    /** Every call that actually ran, in order — the record the UI renders. */
    executed: Array<{ call: TalosToolCall; ok: boolean }>
    rounds: number
    /** True when a bound stopped the loop rather than the model finishing. */
    stoppedByLimit: boolean
    /** Durable visual/file results produced by successful tools. */
    messageAttachments: AppendChatAttachmentInput[]
    /** Present when the loop yielded instead of parking a Promise in memory. */
    suspension?: {
        checkpoint: TalosAgentLoopCheckpointV1
        requests: unknown[]
    }
}

export interface TalosAgentLoopCheckpointV1 {
    schema_version: 1
    stage: 'before_tools' | 'before_model'
    turns: ChatTurn[]
    /** The exact provider completion to resume; null once results are durable. */
    completion: TalosAgentCompletion | null
    /** Model prose already shown/persisted, in provider-round order. */
    spoken: string[]
    executed: Array<{ call: TalosToolCall; ok: boolean }>
    rounds: number
    stoppedByLimit: boolean
    messageAttachments: AppendChatAttachmentInput[]
}

/**
 * Run a round's calls together, capped, answering in the order they were asked.
 *
 * A worker pool rather than `Promise.all` in chunks: chunking waits for the
 * slowest member of each batch before starting the next, which throws away most
 * of the win when one page is slow and three are instant.
 */
async function runCallsTogether(
    calls: readonly TalosToolCall[],
    execute: TalosAgentLoopDeps['execute'],
    limit: number,
): Promise<Array<Awaited<ReturnType<TalosAgentLoopDeps['execute']>>>> {
    const outcomes = new Array<Awaited<ReturnType<TalosAgentLoopDeps['execute']>>>(calls.length)
    let next = 0
    async function worker(): Promise<void> {
        for (;;) {
            const index = next++
            const call = calls[index]
            if (!call) return
            try {
                outcomes[index] = await execute(call)
            } catch (cause) {
                // One tool that throws must not lose the round: the other
                // results were already paid for, in time and in tokens. The
                // model is told, and answers with what it has.
                const detail = cause instanceof Error && cause.message ? `: ${cause.message}` : '.'
                outcomes[index] = {
                    ok: false,
                    content: `The tool "${call.name}" could not be run${detail}`,
                }
            }
        }
    }
    await Promise.all(
        Array.from({ length: Math.min(limit, calls.length) }, () => worker()),
    )
    return outcomes
}

interface MutableAgentLoopState {
    turns: ChatTurn[]
    completion: TalosAgentCompletion | null
    spoken: string[]
    executed: TalosAgentLoopOutcome['executed']
    rounds: number
    stoppedByLimit: boolean
    messageAttachments: AppendChatAttachmentInput[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isToolCall(value: unknown): value is TalosToolCall {
    return isRecord(value)
        && typeof value.id === 'string'
        && value.id.length > 0
        && typeof value.name === 'string'
        && value.name.length > 0
        && typeof value.arguments === 'string'
}

function isTurn(value: unknown): value is ChatTurn {
    if (
        !isRecord(value)
        || !['user', 'assistant', 'tool'].includes(typeof value.role === 'string' ? value.role : '')
        || typeof value.content !== 'string'
        || (value.parts !== undefined && !Array.isArray(value.parts))
        || (value.toolCalls !== undefined
            && (!Array.isArray(value.toolCalls) || !value.toolCalls.every(isToolCall)))
        || (value.toolCallId !== undefined && typeof value.toolCallId !== 'string')
        || (value.toolName !== undefined && typeof value.toolName !== 'string')
    ) return false
    if (value.role === 'tool') {
        return typeof value.toolCallId === 'string' && typeof value.toolName === 'string'
    }
    return true
}

function isCompletion(value: unknown): value is TalosAgentCompletion {
    return isRecord(value)
        && typeof value.text === 'string'
        && (value.finishReason === undefined
            || value.finishReason === null
            || typeof value.finishReason === 'string')
        && (value.reasoning === undefined || typeof value.reasoning === 'string')
        && (value.toolCalls === undefined
            || (Array.isArray(value.toolCalls) && value.toolCalls.every(isToolCall)))
}

function isAttachment(value: unknown): value is AppendChatAttachmentInput {
    return isRecord(value)
        && typeof value.id === 'string'
        && typeof value.vault_file_id === 'string'
        && typeof value.grant_id === 'string'
}

function assertCheckpoint(
    value: TalosAgentLoopCheckpointV1,
): asserts value is TalosAgentLoopCheckpointV1 {
    const record = value as unknown
    if (
        !isRecord(record)
        || record.schema_version !== 1
        || !['before_tools', 'before_model'].includes(
            typeof record.stage === 'string' ? record.stage : '',
        )
        || !Array.isArray(record.turns)
        || !record.turns.every(isTurn)
        || (record.completion !== null && !isCompletion(record.completion))
        || !Array.isArray(record.spoken)
        || !record.spoken.every((entry) => typeof entry === 'string')
        || !Array.isArray(record.executed)
        || !record.executed.every((entry) => (
            isRecord(entry) && isToolCall(entry.call) && typeof entry.ok === 'boolean'
        ))
        || !Number.isSafeInteger(record.rounds)
        || (record.rounds as number) < 0
        || typeof record.stoppedByLimit !== 'boolean'
        || !Array.isArray(record.messageAttachments)
        || !record.messageAttachments.every(isAttachment)
        || (record.stage === 'before_tools'
            && (!isCompletion(record.completion) || !record.completion.toolCalls?.length))
        || (record.stage === 'before_model' && record.completion !== null)
    ) {
        throw new Error('TALOS_AGENT_LOOP_CHECKPOINT_INVALID')
    }
}

function checkpointOf(
    state: MutableAgentLoopState,
    stage: TalosAgentLoopCheckpointV1['stage'],
): TalosAgentLoopCheckpointV1 {
    return {
        schema_version: 1,
        stage,
        turns: [...state.turns],
        completion: stage === 'before_tools' ? state.completion : null,
        spoken: [...state.spoken],
        executed: state.executed.map((entry) => ({ ...entry })),
        rounds: state.rounds,
        stoppedByLimit: state.stoppedByLimit,
        messageAttachments: state.messageAttachments.map((entry) => ({ ...entry })),
    }
}

function outcomeOf(
    state: MutableAgentLoopState,
    completion: TalosAgentCompletion,
    suspension?: TalosAgentLoopOutcome['suspension'],
): TalosAgentLoopOutcome {
    return {
        ...completion,
        text: state.spoken.join('\n\n'),
        executed: state.executed,
        rounds: state.rounds,
        stoppedByLimit: state.stoppedByLimit,
        messageAttachments: state.messageAttachments,
        ...(suspension ? { suspension } : {}),
    }
}

async function pendingPreflights(
    calls: readonly TalosToolCall[],
    preflight: NonNullable<TalosAgentLoopDeps['preflight']>,
): Promise<unknown[]> {
    const resolutions = await Promise.all(calls.map((call) => preflight(call)))
    return resolutions.flatMap((resolution) => (
        resolution.status === 'authorization_required' ? [resolution.request] : []
    ))
}

async function persistBeforeModel(
    state: MutableAgentLoopState,
    deps: TalosAgentLoopDeps,
): Promise<void> {
    if (deps.onBeforeModelCheckpoint) {
        await deps.onBeforeModelCheckpoint(checkpointOf(state, 'before_model'))
    }
}

async function continueTalosAgentLoop(
    state: MutableAgentLoopState,
    deps: TalosAgentLoopDeps,
    resumeRequestedRound: boolean,
): Promise<TalosAgentLoopOutcome> {
    const maxRounds = deps.maxRounds ?? TALOS_AGENT_MAX_ROUNDS
    const maxCalls = deps.maxCalls ?? TALOS_AGENT_MAX_CALLS
    const maxParallel = deps.maxParallel ?? TALOS_AGENT_MAX_PARALLEL
    const messageAttachmentIds = new Set(state.messageAttachments.map((entry) => entry.id))
    const say = (text: string) => { if (text) state.spoken.push(text) }

    for (;;) {
        const completion = state.completion
        if (!completion) throw new Error('TALOS_AGENT_LOOP_CHECKPOINT_INVALID')

        if (!completion.toolCalls?.length) {
            say(completion.text)
            return outcomeOf(state, completion)
        }

        if (!resumeRequestedRound && state.rounds >= maxRounds) {
            state.stoppedByLimit = true
            // SF-MAJOR: answer every pending call, then ask exactly once for a
            // final answer. Persist that provider boundary first so a process
            // death cannot rerun a tool.
            say(completion.text)
            state.turns = [
                ...state.turns,
                { role: 'assistant', content: completion.text, toolCalls: completion.toolCalls },
                ...completion.toolCalls.map((call) => ({
                    role: 'tool' as const,
                    content: `Not run: the limit of ${maxRounds} tool rounds for one message was reached. Answer with what you have.`,
                    toolCallId: call.id,
                    toolName: call.name,
                })),
            ]
            state.completion = null
            await persistBeforeModel(state, deps)
            const finalCompletion = await deps.complete(state.turns)
            say(finalCompletion.text)
            return outcomeOf(state, finalCompletion)
        }

        if (!resumeRequestedRound) {
            state.rounds += 1
            say(completion.text)
        }
        resumeRequestedRound = false
        const requested = completion.toolCalls

        // The budget is spent BEFORE anything runs. Deciding it as results
        // arrive would make which calls are refused depend on the network.
        const budget = Math.max(0, maxCalls - state.executed.length)
        const runnable = requested.slice(0, budget)
        if (runnable.length < requested.length) state.stoppedByLimit = true

        // Whole-round barrier: one unresolved sibling means NO sibling runs.
        // This is what makes a durable before-tools checkpoint replayable.
        const requests = deps.preflight
            ? await pendingPreflights(runnable, deps.preflight)
            : []
        if (requests.length) {
            state.completion = completion
            return outcomeOf(state, completion, {
                checkpoint: checkpointOf(state, 'before_tools'),
                requests,
            })
        }

        /*
         * ⛔ Il cancello del piano.
         *
         * Sta DOPO la barriera delle autorizzazioni e PRIMA dell'esecuzione,
         * che è l'unico punto in cui ha senso: prima si sa quali chiamate sono
         * eseguibili, poi si chiede il permesso su quell'elenco. Chiederlo
         * prima significherebbe mostrare un piano che contiene passi che il
         * permesso avrebbe tolto comunque.
         */
        const decisione = deps.plan
            ? await deps.plan(runnable)
            : { admitted: runnable.map((call) => call.id), cancelled: false }
        const ammesse = new Set(decisione.admitted)
        const eseguibili = decisione.cancelled
            ? []
            : runnable.filter((call) => ammesse.has(call.id))

        deps.onToolRound?.(eseguibili)
        const risultati = await runCallsTogether(eseguibili, deps.execute, maxParallel)
        /*
         * I risultati tornano nelle posizioni del giro INTERO, non in quelle
         * degli eseguibili: chi è stato tolto dal piano deve comunque ricevere
         * la sua riga, perché un id senza risposta produce una richiesta non
         * valida per i provider severi.
         */
        const outcomes = new Array<(typeof risultati)[number] | undefined>(runnable.length)
        let scorrimento = 0
        for (let indice = 0; indice < runnable.length; indice += 1) {
            const call = runnable[indice]!
            if (!decisione.cancelled && ammesse.has(call.id)) {
                outcomes[indice] = risultati[scorrimento]
                scorrimento += 1
            } else {
                outcomes[indice] = {
                    ok: false,
                    content: decisione.cancelled
                        ? 'Not run: the user did not approve the plan for this message. Answer with what you have, and do not try again.'
                        : 'Not run: the user removed this step from the plan. Answer with what you have, and do not try it again.',
                }
            }
        }
        const results: ChatTurn[] = requested.map((call, index) => {
            const outcome = outcomes[index]
            if (!outcome) {
                // Every refused call still receives a result: dropping an ID
                // produces an invalid next request for strict providers.
                return {
                    role: 'tool',
                    content: `Not run: the limit of ${maxCalls} tool calls for one message was reached. Answer with what you have.`,
                    toolCallId: call.id,
                    toolName: call.name,
                }
            }
            return {
                role: 'tool',
                content: outcome.content,
                toolCallId: call.id,
                toolName: call.name,
            }
        })

        // Provider order, never completion order.
        const seen: TalosMobileInputPart[] = []
        runnable.forEach((call, index) => {
            const toolOutcome = outcomes[index]!
            state.executed.push({ call, ok: toolOutcome.ok })
            if (toolOutcome.images?.length) seen.push(...toolOutcome.images)
            for (const attachment of toolOutcome.messageAttachments ?? []) {
                if (messageAttachmentIds.has(attachment.id)) continue
                messageAttachmentIds.add(attachment.id)
                state.messageAttachments.push(attachment)
            }
        })

        state.turns = [
            ...state.turns,
            { role: 'assistant', content: completion.text, toolCalls: requested },
            ...results,
            /**
             * Anything a tool handed back to LOOK at, on a user turn. Results
             * come first and an empty visual turn is never emitted.
             */
            ...(seen.length
                ? [{
                    role: 'user' as const,
                    content: 'The images the tools returned, for you to look at.',
                    parts: seen,
                }]
                : []),
        ]
        state.completion = null
        await persistBeforeModel(state, deps)
        state.completion = await deps.complete(state.turns)
    }
}

export async function runTalosAgentLoop(
    initialTurns: ChatTurn[],
    deps: TalosAgentLoopDeps,
): Promise<TalosAgentLoopOutcome> {
    const completion = await deps.complete(initialTurns)
    return continueTalosAgentLoop({
        turns: initialTurns,
        completion,
        spoken: [],
        executed: [],
        rounds: 0,
        stoppedByLimit: false,
        messageAttachments: [],
    }, deps, false)
}

export async function resumeTalosAgentLoop(
    checkpoint: TalosAgentLoopCheckpointV1,
    deps: TalosAgentLoopDeps,
): Promise<TalosAgentLoopOutcome> {
    assertCheckpoint(checkpoint)
    const state: MutableAgentLoopState = {
        turns: [...checkpoint.turns],
        completion: checkpoint.completion,
        spoken: [...checkpoint.spoken],
        executed: checkpoint.executed.map((entry) => ({ ...entry })),
        rounds: checkpoint.rounds,
        stoppedByLimit: checkpoint.stoppedByLimit,
        messageAttachments: checkpoint.messageAttachments.map((entry) => ({ ...entry })),
    }
    if (checkpoint.stage === 'before_model') {
        state.completion = await deps.complete(state.turns)
    }
    return continueTalosAgentLoop(state, deps, checkpoint.stage === 'before_tools')
}

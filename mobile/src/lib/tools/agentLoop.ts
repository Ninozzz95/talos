import type { ChatTurn, TalosToolCall } from '@/stores/chat'

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
    /** Runs one call through the permission gate and the audit trail. */
    execute(call: TalosToolCall): Promise<{ content: string; ok: boolean }>
    /** Fired when a round of calls starts, so the UI can show what is running. */
    onToolRound?(calls: TalosToolCall[]): void
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
): Promise<Array<{ content: string; ok: boolean }>> {
    const outcomes = new Array<{ content: string; ok: boolean }>(calls.length)
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

export async function runTalosAgentLoop(
    initialTurns: ChatTurn[],
    deps: TalosAgentLoopDeps,
): Promise<TalosAgentLoopOutcome> {
    const maxRounds = deps.maxRounds ?? TALOS_AGENT_MAX_ROUNDS
    const maxCalls = deps.maxCalls ?? TALOS_AGENT_MAX_CALLS
    const maxParallel = deps.maxParallel ?? TALOS_AGENT_MAX_PARALLEL
    const executed: TalosAgentLoopOutcome['executed'] = []
    let turns = initialTurns
    let completion = await deps.complete(turns)
    let rounds = 0
    let stoppedByLimit = false
    /**
     * Every round's prose, in order.
     *
     * Models routinely speak before they call ("Let me look that up…"), and the
     * stream handler is allocated once per send — so the user WATCHES that
     * sentence arrive. Returning only the last completion meant the durable
     * message replaced the stream with strictly less text than had just been on
     * screen. What is persisted must equal what was rendered.
     */
    const spoken: string[] = []
    const say = (text: string) => { if (text) spoken.push(text) }

    while (completion.toolCalls?.length) {
        if (rounds >= maxRounds) {
            stoppedByLimit = true
            // SF-MAJOR: this used to `break` and RETURN the tool-requesting
            // completion, whose text is legitimately empty for a tool-only turn
            // — so the user got a blank assistant bubble and the model never
            // learned why it stopped. Answer every pending call, then ask once
            // more for a final answer, exactly as the call cap does.
            say(completion.text)
            turns = [
                ...turns,
                { role: 'assistant', content: completion.text, toolCalls: completion.toolCalls },
                ...completion.toolCalls.map((call) => ({
                    role: 'tool' as const,
                    content: `Not run: the limit of ${maxRounds} tool rounds for one message was reached. Answer with what you have.`,
                    toolCallId: call.id,
                    toolName: call.name,
                })),
            ]
            completion = await deps.complete(turns)
            break
        }
        rounds += 1
        say(completion.text)
        const requested = completion.toolCalls
        deps.onToolRound?.(requested)

        // The budget is spent BEFORE anything runs. Deciding it as results
        // arrive would make which calls are refused depend on which happened to
        // finish first — a limit that moves with the network is not a limit.
        const budget = Math.max(0, maxCalls - executed.length)
        const runnable = requested.slice(0, budget)
        if (runnable.length < requested.length) stoppedByLimit = true

        const outcomes = await runCallsTogether(runnable, deps.execute, maxParallel)

        const results: ChatTurn[] = requested.map((call, index) => {
            const outcome = outcomes[index]
            if (!outcome) {
                // Answer the refused calls honestly instead of dropping them:
                // an unanswered call id makes the next request invalid for
                // every provider that checks, and silence teaches nothing.
                return {
                    role: 'tool',
                    content: `Not run: the limit of ${maxCalls} tool calls for one message was reached. Answer with what you have.`,
                    toolCallId: call.id,
                    toolName: call.name,
                }
            }
            return { role: 'tool', content: outcome.content, toolCallId: call.id, toolName: call.name }
        })
        // In the order the model asked, never the order the network answered.
        runnable.forEach((call, index) => {
            executed.push({ call, ok: outcomes[index]!.ok })
        })

        turns = [
            ...turns,
            { role: 'assistant', content: completion.text, toolCalls: requested },
            ...results,
        ]
        completion = await deps.complete(turns)
    }

    say(completion.text)
    return {
        ...completion,
        text: spoken.join('\n\n'),
        executed,
        rounds,
        stoppedByLimit,
    }
}

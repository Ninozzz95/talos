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
}

export interface TalosAgentLoopOutcome extends TalosAgentCompletion {
    /** Every call that actually ran, in order — the record the UI renders. */
    executed: Array<{ call: TalosToolCall; ok: boolean }>
    rounds: number
    /** True when a bound stopped the loop rather than the model finishing. */
    stoppedByLimit: boolean
}

export async function runTalosAgentLoop(
    initialTurns: ChatTurn[],
    deps: TalosAgentLoopDeps,
): Promise<TalosAgentLoopOutcome> {
    const maxRounds = deps.maxRounds ?? TALOS_AGENT_MAX_ROUNDS
    const maxCalls = deps.maxCalls ?? TALOS_AGENT_MAX_CALLS
    const executed: TalosAgentLoopOutcome['executed'] = []
    let turns = initialTurns
    let completion = await deps.complete(turns)
    let rounds = 0
    let stoppedByLimit = false

    while (completion.toolCalls?.length) {
        if (rounds >= maxRounds) {
            stoppedByLimit = true
            break
        }
        rounds += 1
        const requested = completion.toolCalls
        deps.onToolRound?.(requested)

        const results: ChatTurn[] = []
        for (const call of requested) {
            if (executed.length >= maxCalls) {
                stoppedByLimit = true
                // Answer the remaining calls honestly instead of dropping them:
                // an unanswered call id makes the next request invalid for
                // every provider that checks, and silence teaches nothing.
                results.push({
                    role: 'tool',
                    content: `Not run: the limit of ${maxCalls} tool calls for one message was reached. Answer with what you have.`,
                    toolCallId: call.id,
                })
                continue
            }
            const result = await deps.execute(call)
            executed.push({ call, ok: result.ok })
            results.push({ role: 'tool', content: result.content, toolCallId: call.id })
        }

        turns = [
            ...turns,
            { role: 'assistant', content: completion.text, toolCalls: requested },
            ...results,
        ]
        completion = await deps.complete(turns)
    }

    return {
        ...completion,
        executed,
        rounds,
        stoppedByLimit,
    }
}

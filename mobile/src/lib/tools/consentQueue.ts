/**
 * One permission question at a time — asked in turn, never dropped.
 *
 * Running a round's tool calls together (2026-07-26, the speed work) created a
 * problem the single-file loop never had: two calls can reach the permission
 * gate at the same moment. The gate answers the second 'busy', which was right
 * when only one call could ever be in flight — two sheets at once is a question
 * nobody can reason about — but with concurrency it turns a legitimate ask into
 * a machine refusal the user never saw.
 *
 * So the asks queue. In practice the queue is usually one deep and then empty:
 * the first "yes" grants the action type for the conversation (D12), and every
 * caller behind it is answered without a sheet at all.
 */
export interface TalosConsentQueue {
    /**
     * Ask, when it is this caller's turn. A caller whose signal aborts while it
     * waits is answered `false` and never puts a sheet on screen — its round has
     * already been abandoned.
     */
    run(ask: () => Promise<boolean>, signal?: AbortSignal): Promise<boolean>
}

export function createTalosConsentQueue(): TalosConsentQueue {
    let asking = false
    const waiting: Array<() => void> = []

    return {
        async run(ask, signal) {
            // An idle queue asks IMMEDIATELY — no microtask of delay between the
            // tool wanting permission and the sheet appearing. Only a caller
            // that finds the gate occupied waits.
            if (asking) await new Promise<void>((resume) => waiting.push(resume))
            asking = true
            try {
                // Checked here rather than on arrival: the wait is exactly when
                // a user stops the send, and its round is then abandoned.
                if (signal?.aborted) return false
                return await ask()
            } finally {
                // In `finally`, so one question that throws does not wedge every
                // question behind it — while still rejecting for its own caller.
                asking = false
                waiting.shift()?.()
            }
        },
    }
}

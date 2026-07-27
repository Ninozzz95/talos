import {
    appendTalosRunStep,
    setTalosRunStatus,
    talosRunResumeIndex,
    type TalosRunJsonValue,
    type TalosRunState,
} from '@/lib/runs/longRunState'

export interface TalosCheckpointPlanStep {
    kind: string
    execute(): Promise<TalosRunJsonValue>
}

export interface TalosCheckpointRunnerDependencies {
    save(state: TalosRunState): Promise<TalosRunState>
    now(): string
    signal?: AbortSignal
}

function failureMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 2048)
    return 'The run failed without a diagnostic message.'
}

/**
 * Execute a serializable plan and durably checkpoint after every completed step.
 *
 * The functions are executor-local; only their JSON outputs enter the state.
 * Re-entry starts at `state.steps.length`, so a completed step is never paid for
 * or executed twice.
 */
export async function runTalosCheckpointPlan(
    initial: TalosRunState,
    plan: readonly TalosCheckpointPlanStep[],
    dependencies: TalosCheckpointRunnerDependencies,
): Promise<TalosRunState> {
    if (initial.status === 'awaiting_approval') {
        throw new Error('TALOS_RUN_APPROVAL_REQUIRED')
    }
    if (initial.steps.length > plan.length) throw new Error('TALOS_RUN_PLAN_INVALID')

    let state = setTalosRunStatus(initial, 'running', dependencies.now())
    state = await dependencies.save(state)
    try {
        for (let index = talosRunResumeIndex(state); index < plan.length; index += 1) {
            if (dependencies.signal?.aborted) {
                state = setTalosRunStatus(state, 'cancelled', dependencies.now())
                return dependencies.save(state)
            }
            const step = plan[index]
            if (!step) throw new Error('TALOS_RUN_PLAN_INVALID')
            const output = await step.execute()
            state = appendTalosRunStep(state, {
                kind: step.kind,
                output,
                at: dependencies.now(),
            })
            state = await dependencies.save(state)
        }
        if (dependencies.signal?.aborted) {
            state = setTalosRunStatus(state, 'cancelled', dependencies.now())
            return dependencies.save(state)
        }
        state = setTalosRunStatus(state, 'done', dependencies.now())
        return dependencies.save(state)
    } catch (error) {
        state = setTalosRunStatus(state, 'failed', dependencies.now(), failureMessage(error))
        await dependencies.save(state)
        throw error
    }
}

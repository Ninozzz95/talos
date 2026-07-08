import { computed, ref } from 'vue'
import { talosFetch } from '../lib/api'
import type {
    TalosRecoveryRequest,
    TalosRecoveryResponse,
    TalosRun,
    TalosRunEvent,
    TalosRunReplay,
} from '../lib/talosTypes'

type ApiEnvelope<T> = {
    data: T
}

export function useTalosRuns() {
    const runs = ref<TalosRun[]>([])
    const runEvents = ref<Record<string, TalosRunEvent[]>>({})
    const runReplays = ref<Record<string, TalosRunReplay>>({})
    const loadingRuns = ref(false)
    const loadingRunId = ref<string | null>(null)
    const loadingEventsRunId = ref<string | null>(null)
    const loadingReplayRunId = ref<string | null>(null)
    const recoveringRunId = ref<string | null>(null)
    const runError = ref<string | null>(null)
    const eventError = ref<string | null>(null)
    const replayError = ref<string | null>(null)
    const recoveryError = ref<string | null>(null)

    const latestRun = computed(() => runs.value[0] ?? null)

    function storeRun(run: TalosRun) {
        runs.value = [
            run,
            ...runs.value.filter((existing) => existing.id !== run.id),
        ]

        return run
    }

    async function loadRuns() {
        loadingRuns.value = true
        runError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosRun[]>>('/api/talos/runs')
            runs.value = response.data
            return response.data
        } catch (error) {
            runError.value = error instanceof Error ? error.message : 'TALOS could not load runs.'
            throw error
        } finally {
            loadingRuns.value = false
        }
    }

    async function loadRun(runId: string) {
        loadingRunId.value = runId
        runError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosRun>>(`/api/talos/runs/${runId}`)
            return storeRun(response.data)
        } catch (error) {
            runError.value = error instanceof Error ? error.message : 'TALOS could not load this run.'
            throw error
        } finally {
            loadingRunId.value = null
        }
    }

    async function loadRunEvents(runId: string) {
        loadingEventsRunId.value = runId
        eventError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosRunEvent[]>>(`/api/talos/runs/${runId}/events`)
            runEvents.value = {
                ...runEvents.value,
                [runId]: response.data,
            }

            return response.data
        } catch (error) {
            eventError.value = error instanceof Error ? error.message : 'TALOS could not load run events.'
            throw error
        } finally {
            loadingEventsRunId.value = null
        }
    }

    async function loadRunReplay(runId: string) {
        loadingReplayRunId.value = runId
        replayError.value = null

        try {
            const response = await talosFetch<TalosRunReplay>(`/api/talos/runs/${runId}/replay`)
            runReplays.value = {
                ...runReplays.value,
                [runId]: response,
            }

            return response
        } catch (error) {
            replayError.value = error instanceof Error ? error.message : 'TALOS could not load trace replay.'
            throw error
        } finally {
            loadingReplayRunId.value = null
        }
    }

    async function recoverRunNode(runId: string, request: TalosRecoveryRequest) {
        recoveringRunId.value = runId
        recoveryError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosRecoveryResponse>>(`/api/talos/runs/${runId}/recover`, {
                method: 'POST',
                body: JSON.stringify(request),
                validationMessage: 'TALOS rejected the recovery request.',
            })
            storeRun(response.data.run)
            runEvents.value = {
                ...runEvents.value,
                [runId]: [
                    ...(runEvents.value[runId] ?? []),
                    ...response.data.events,
                ].sort((left, right) => left.sequence - right.sequence),
            }

            return response.data
        } catch (error) {
            recoveryError.value = error instanceof Error ? error.message : 'TALOS could not submit recovery.'
            throw error
        } finally {
            recoveringRunId.value = null
        }
    }

    function eventsForRun(runId: string | null | undefined) {
        return runId ? runEvents.value[runId] ?? [] : []
    }

    function replayForRun(runId: string | null | undefined) {
        return runId ? runReplays.value[runId] ?? null : null
    }

    return {
        runs,
        latestRun,
        runEvents,
        runReplays,
        loadingRuns,
        loadingRunId,
        loadingEventsRunId,
        loadingReplayRunId,
        recoveringRunId,
        runError,
        eventError,
        replayError,
        recoveryError,
        loadRuns,
        loadRun,
        loadRunEvents,
        loadRunReplay,
        recoverRunNode,
        eventsForRun,
        replayForRun,
    }
}

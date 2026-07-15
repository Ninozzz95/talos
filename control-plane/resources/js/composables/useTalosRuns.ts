import { computed, ref } from 'vue'
import { talosFetch } from '../lib/api'
import type {
    TalosRecoveryRequest,
    TalosRecoveryResponse,
    TalosRun,
    TalosRunArtifact,
    TalosRunEvent,
    TalosRunReplay,
} from '../lib/talosTypes'

type ApiEnvelope<T> = {
    data: T
}

function createRunRequestTracker() {
    const pendingCounts = ref<Record<string, number>>({})
    const activeRunId = ref<string | null>(null)

    function begin(runId: string) {
        pendingCounts.value = {
            ...pendingCounts.value,
            [runId]: (pendingCounts.value[runId] ?? 0) + 1,
        }
        activeRunId.value = runId
    }

    function finish(runId: string) {
        const nextCounts = { ...pendingCounts.value }
        const nextCount = (nextCounts[runId] ?? 1) - 1

        if (nextCount > 0) {
            nextCounts[runId] = nextCount
        } else {
            delete nextCounts[runId]
        }

        pendingCounts.value = nextCounts

        if (activeRunId.value === runId && nextCount <= 0) {
            activeRunId.value = Object.keys(nextCounts).at(-1) ?? null
        }
    }

    function isPending(runId: string | null | undefined) {
        return Boolean(runId && (pendingCounts.value[runId] ?? 0) > 0)
    }

    return {
        activeRunId,
        begin,
        finish,
        isPending,
    }
}

function nextRequestVersion(versions: Map<string, number>, runId: string) {
    const version = (versions.get(runId) ?? 0) + 1
    versions.set(runId, version)

    return version
}

function requestIsCurrent(versions: Map<string, number>, runId: string, version: number) {
    return versions.get(runId) === version
}

function errorForRun(errors: Record<string, string | null>, runId: string | null | undefined) {
    return runId ? errors[runId] ?? null : null
}

export function useTalosRuns() {
    const runs = ref<TalosRun[]>([])
    const runEvents = ref<Record<string, TalosRunEvent[]>>({})
    const runReplays = ref<Record<string, TalosRunReplay>>({})
    const runArtifacts = ref<Record<string, TalosRunArtifact[]>>({})
    const loadingRuns = ref(false)
    const runRequests = createRunRequestTracker()
    const eventRequests = createRunRequestTracker()
    const replayRequests = createRunRequestTracker()
    const artifactRequests = createRunRequestTracker()
    const recoveryRequests = createRunRequestTracker()
    const loadingRunId = runRequests.activeRunId
    const loadingEventsRunId = eventRequests.activeRunId
    const loadingReplayRunId = replayRequests.activeRunId
    const loadingArtifactsRunId = artifactRequests.activeRunId
    const recoveringRunId = recoveryRequests.activeRunId
    const runError = ref<string | null>(null)
    const eventError = ref<string | null>(null)
    const replayError = ref<string | null>(null)
    const artifactError = ref<string | null>(null)
    const recoveryError = ref<string | null>(null)
    const runErrors = ref<Record<string, string | null>>({})
    const eventErrors = ref<Record<string, string | null>>({})
    const replayErrors = ref<Record<string, string | null>>({})
    const artifactErrors = ref<Record<string, string | null>>({})
    const recoveryErrors = ref<Record<string, string | null>>({})
    const runRequestVersions = new Map<string, number>()
    const eventRequestVersions = new Map<string, number>()
    const replayRequestVersions = new Map<string, number>()
    const artifactRequestVersions = new Map<string, number>()
    const recoveryRequestVersions = new Map<string, number>()
    let pendingRunListRequests = 0
    let runListRequestVersion = 0

    const latestRun = computed(() => runs.value[0] ?? null)

    function storeRun(run: TalosRun) {
        runs.value = [
            run,
            ...runs.value.filter((existing) => existing.id !== run.id),
        ]

        return run
    }

    async function loadRuns() {
        const requestVersion = ++runListRequestVersion
        pendingRunListRequests += 1
        loadingRuns.value = true
        runError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosRun[]>>('/api/talos/runs')
            if (requestVersion === runListRequestVersion) {
                runs.value = response.data
            }
            return response.data
        } catch (error) {
            if (requestVersion === runListRequestVersion) {
                runError.value = error instanceof Error ? error.message : 'TALOS could not load runs.'
            }
            throw error
        } finally {
            pendingRunListRequests = Math.max(0, pendingRunListRequests - 1)
            loadingRuns.value = pendingRunListRequests > 0
        }
    }

    async function loadRun(runId: string) {
        const requestVersion = nextRequestVersion(runRequestVersions, runId)
        runRequests.begin(runId)
        runError.value = null
        runErrors.value = { ...runErrors.value, [runId]: null }

        try {
            const response = await talosFetch<ApiEnvelope<TalosRun>>(`/api/talos/runs/${runId}`)
            if (requestIsCurrent(runRequestVersions, runId, requestVersion)) {
                storeRun(response.data)
            }
            return response.data
        } catch (error) {
            if (requestIsCurrent(runRequestVersions, runId, requestVersion)) {
                const message = error instanceof Error ? error.message : 'TALOS could not load this run.'
                runError.value = message
                runErrors.value = { ...runErrors.value, [runId]: message }
            }
            throw error
        } finally {
            runRequests.finish(runId)
        }
    }

    async function loadRunEvents(runId: string) {
        const requestVersion = nextRequestVersion(eventRequestVersions, runId)
        eventRequests.begin(runId)
        eventError.value = null
        eventErrors.value = { ...eventErrors.value, [runId]: null }

        try {
            const response = await talosFetch<ApiEnvelope<TalosRunEvent[]>>(`/api/talos/runs/${runId}/events`)
            if (requestIsCurrent(eventRequestVersions, runId, requestVersion)) {
                runEvents.value = {
                    ...runEvents.value,
                    [runId]: response.data,
                }
            }

            return response.data
        } catch (error) {
            if (requestIsCurrent(eventRequestVersions, runId, requestVersion)) {
                const message = error instanceof Error ? error.message : 'TALOS could not load run events.'
                eventError.value = message
                eventErrors.value = { ...eventErrors.value, [runId]: message }
            }
            throw error
        } finally {
            eventRequests.finish(runId)
        }
    }

    async function loadRunReplay(runId: string) {
        const requestVersion = nextRequestVersion(replayRequestVersions, runId)
        replayRequests.begin(runId)
        replayError.value = null
        replayErrors.value = { ...replayErrors.value, [runId]: null }

        try {
            const response = await talosFetch<TalosRunReplay>(`/api/talos/runs/${runId}/replay`)
            if (requestIsCurrent(replayRequestVersions, runId, requestVersion)) {
                runReplays.value = {
                    ...runReplays.value,
                    [runId]: response,
                }
            }

            return response
        } catch (error) {
            if (requestIsCurrent(replayRequestVersions, runId, requestVersion)) {
                const message = error instanceof Error ? error.message : 'TALOS could not load trace replay.'
                replayError.value = message
                replayErrors.value = { ...replayErrors.value, [runId]: message }
            }
            throw error
        } finally {
            replayRequests.finish(runId)
        }
    }

    async function loadRunArtifacts(runId: string) {
        const requestVersion = nextRequestVersion(artifactRequestVersions, runId)
        artifactRequests.begin(runId)
        artifactError.value = null
        artifactErrors.value = { ...artifactErrors.value, [runId]: null }

        try {
            const response = await talosFetch<ApiEnvelope<TalosRunArtifact[]>>(`/api/talos/runs/${runId}/artifacts`)
            if (requestIsCurrent(artifactRequestVersions, runId, requestVersion)) {
                runArtifacts.value = {
                    ...runArtifacts.value,
                    [runId]: response.data,
                }
            }

            return response.data
        } catch (error) {
            if (requestIsCurrent(artifactRequestVersions, runId, requestVersion)) {
                const message = error instanceof Error ? error.message : 'TALOS could not load run artifacts.'
                artifactError.value = message
                artifactErrors.value = { ...artifactErrors.value, [runId]: message }
            }
            throw error
        } finally {
            artifactRequests.finish(runId)
        }
    }

    async function recoverRunNode(runId: string, request: TalosRecoveryRequest) {
        const requestVersion = nextRequestVersion(recoveryRequestVersions, runId)
        recoveryRequests.begin(runId)
        recoveryError.value = null
        recoveryErrors.value = { ...recoveryErrors.value, [runId]: null }

        try {
            const response = await talosFetch<ApiEnvelope<TalosRecoveryResponse>>(`/api/talos/runs/${runId}/recover`, {
                method: 'POST',
                body: JSON.stringify(request),
                validationMessage: 'TALOS rejected the recovery request.',
            })
            if (requestIsCurrent(recoveryRequestVersions, runId, requestVersion)) {
                storeRun(response.data.run)
                runEvents.value = {
                    ...runEvents.value,
                    [runId]: [
                        ...(runEvents.value[runId] ?? []),
                        ...response.data.events,
                    ].sort((left, right) => left.sequence - right.sequence),
                }
            }

            return response.data
        } catch (error) {
            if (requestIsCurrent(recoveryRequestVersions, runId, requestVersion)) {
                const message = error instanceof Error ? error.message : 'TALOS could not submit recovery.'
                recoveryError.value = message
                recoveryErrors.value = { ...recoveryErrors.value, [runId]: message }
            }
            throw error
        } finally {
            recoveryRequests.finish(runId)
        }
    }

    function eventsForRun(runId: string | null | undefined) {
        return runId ? runEvents.value[runId] ?? [] : []
    }

    function replayForRun(runId: string | null | undefined) {
        return runId ? runReplays.value[runId] ?? null : null
    }

    function artifactsForRun(runId: string | null | undefined) {
        return runId ? runArtifacts.value[runId] ?? [] : []
    }

    function runErrorForRun(runId: string | null | undefined) {
        return errorForRun(runErrors.value, runId)
    }

    function eventErrorForRun(runId: string | null | undefined) {
        return errorForRun(eventErrors.value, runId)
    }

    function replayErrorForRun(runId: string | null | undefined) {
        return errorForRun(replayErrors.value, runId)
    }

    function artifactErrorForRun(runId: string | null | undefined) {
        return errorForRun(artifactErrors.value, runId)
    }

    function recoveryErrorForRun(runId: string | null | undefined) {
        return errorForRun(recoveryErrors.value, runId)
    }

    return {
        runs,
        latestRun,
        runEvents,
        runReplays,
        runArtifacts,
        loadingRuns,
        loadingRunId,
        loadingEventsRunId,
        loadingReplayRunId,
        loadingArtifactsRunId,
        recoveringRunId,
        runError,
        eventError,
        replayError,
        artifactError,
        recoveryError,
        isRunLoading: runRequests.isPending,
        isRunEventsLoading: eventRequests.isPending,
        isRunReplayLoading: replayRequests.isPending,
        isRunArtifactsLoading: artifactRequests.isPending,
        isRunRecovering: recoveryRequests.isPending,
        runErrorForRun,
        eventErrorForRun,
        replayErrorForRun,
        artifactErrorForRun,
        recoveryErrorForRun,
        loadRuns,
        loadRun,
        loadRunEvents,
        loadRunReplay,
        loadRunArtifacts,
        recoverRunNode,
        eventsForRun,
        replayForRun,
        artifactsForRun,
    }
}

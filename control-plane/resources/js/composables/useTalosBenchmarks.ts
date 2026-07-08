import { computed, ref } from 'vue'
import { talosFetch } from '../lib/api'
import type { TalosBenchmarkGroup } from '../lib/talosTypes'

type ApiEnvelope<T> = {
    data: T
}

export type RunBenchmarkComparisonPayload = {
    scenario_path: string
    runs?: number
}

export type BenchmarkComparisonResponse = {
    report_type: 'benchmark_evidence'
    benchmark_group: TalosBenchmarkGroup
    benchmark_results: NonNullable<TalosBenchmarkGroup['results']>
    evidence_summary?: Record<string, unknown>
    scenario?: Record<string, unknown>
    modes?: Record<string, unknown>
    comparison?: Record<string, unknown>
}

export function useTalosBenchmarks() {
    const benchmarkGroups = ref<TalosBenchmarkGroup[]>([])
    const benchmarkGroupsById = ref<Record<string, TalosBenchmarkGroup>>({})
    const loadingBenchmarkGroups = ref(false)
    const loadingBenchmarkGroupId = ref<string | null>(null)
    const runningBenchmarkComparison = ref(false)
    const benchmarkError = ref<string | null>(null)

    const latestBenchmarkGroup = computed(() => benchmarkGroups.value[0] ?? null)

    function storeBenchmarkGroup(group: TalosBenchmarkGroup) {
        benchmarkGroupsById.value = {
            ...benchmarkGroupsById.value,
            [group.id]: group,
        }
        benchmarkGroups.value = [
            group,
            ...benchmarkGroups.value.filter((existing) => existing.id !== group.id),
        ]

        return group
    }

    async function loadBenchmarkGroups() {
        loadingBenchmarkGroups.value = true
        benchmarkError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosBenchmarkGroup[]>>('/api/talos/benchmark-groups')
            benchmarkGroups.value = response.data
            benchmarkGroupsById.value = {
                ...benchmarkGroupsById.value,
                ...Object.fromEntries(response.data.map((group) => [group.id, group])),
            }

            return response.data
        } catch (error) {
            benchmarkError.value = error instanceof Error ? error.message : 'TALOS could not load benchmark groups.'
            throw error
        } finally {
            loadingBenchmarkGroups.value = false
        }
    }

    async function loadBenchmarkGroup(groupId: string) {
        loadingBenchmarkGroupId.value = groupId
        benchmarkError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosBenchmarkGroup>>(`/api/talos/benchmark-groups/${groupId}`)
            return storeBenchmarkGroup(response.data)
        } catch (error) {
            benchmarkError.value = error instanceof Error ? error.message : 'TALOS could not load this benchmark group.'
            throw error
        } finally {
            loadingBenchmarkGroupId.value = null
        }
    }

    async function runBenchmarkComparison(payload: RunBenchmarkComparisonPayload) {
        runningBenchmarkComparison.value = true
        benchmarkError.value = null

        try {
            const response = await talosFetch<BenchmarkComparisonResponse>('/api/benchmarks/compare', {
                method: 'POST',
                body: JSON.stringify(payload),
                validationMessage: 'TALOS rejected the benchmark comparison request.',
            })

            const group = {
                ...response.benchmark_group,
                results: response.benchmark_results,
                results_count: response.benchmark_results.length,
            }
            storeBenchmarkGroup(group)

            return response
        } catch (error) {
            benchmarkError.value = error instanceof Error ? error.message : 'TALOS could not run benchmark comparison.'
            throw error
        } finally {
            runningBenchmarkComparison.value = false
        }
    }

    function benchmarkGroupById(groupId: string | null | undefined) {
        return groupId ? benchmarkGroupsById.value[groupId] ?? null : null
    }

    return {
        benchmarkGroups,
        benchmarkGroupsById,
        latestBenchmarkGroup,
        loadingBenchmarkGroups,
        loadingBenchmarkGroupId,
        runningBenchmarkComparison,
        benchmarkError,
        loadBenchmarkGroups,
        loadBenchmarkGroup,
        runBenchmarkComparison,
        benchmarkGroupById,
    }
}

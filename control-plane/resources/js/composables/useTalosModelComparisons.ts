import { ref } from 'vue'
import { talosFetch } from '../lib/api'
import type { TalosBenchmarkGroup, TalosModelComparison } from '../lib/talosTypes'

type ApiEnvelope<T> = {
    data: T
}

export type CreateTalosModelComparisonPayload = {
    prompt: string
    mode?: 'blind' | 'parallel' | 'shuffle'
    task_type?: 'chat' | 'agent' | 'search' | 'research'
    blind?: boolean
    timeout_seconds?: number
    model_profile_ids: string[]
}

export type TalosModelComparisonVotePayload = {
    lane_id: string
    reason?: string | null
    scorecard?: Record<string, number>
}

export function useTalosModelComparisons() {
    const currentComparison = ref<TalosModelComparison | null>(null)
    const runningComparison = ref(false)
    const votingComparison = ref(false)
    const promotingComparison = ref(false)
    const comparisonError = ref<string | null>(null)

    function storeComparison(comparison: TalosModelComparison) {
        currentComparison.value = comparison

        return comparison
    }

    async function createModelComparison(payload: CreateTalosModelComparisonPayload) {
        runningComparison.value = true
        comparisonError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosModelComparison>>('/api/talos/model-comparisons', {
                method: 'POST',
                body: JSON.stringify(payload),
                validationMessage: 'TALOS rejected the model comparison contract.',
            })

            return storeComparison(response.data)
        } catch (error) {
            comparisonError.value = error instanceof Error ? error.message : 'TALOS could not run this model comparison.'
            throw error
        } finally {
            runningComparison.value = false
        }
    }

    async function voteModelComparison(comparisonId: string, payload: TalosModelComparisonVotePayload) {
        votingComparison.value = true
        comparisonError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosModelComparison>>(`/api/talos/model-comparisons/${comparisonId}/vote`, {
                method: 'POST',
                body: JSON.stringify(payload),
                validationMessage: 'TALOS rejected the comparison vote.',
            })

            return storeComparison(response.data)
        } catch (error) {
            comparisonError.value = error instanceof Error ? error.message : 'TALOS could not record this vote.'
            throw error
        } finally {
            votingComparison.value = false
        }
    }

    async function promoteModelComparison(comparisonId: string) {
        promotingComparison.value = true
        comparisonError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosBenchmarkGroup>>(`/api/talos/model-comparisons/${comparisonId}/benchmark`, {
                method: 'POST',
            })

            if (currentComparison.value?.id === comparisonId) {
                currentComparison.value = {
                    ...currentComparison.value,
                    benchmark_group_id: response.data.id,
                }
            }

            return response.data
        } catch (error) {
            comparisonError.value = error instanceof Error ? error.message : 'TALOS could not promote this comparison to benchmark evidence.'
            throw error
        } finally {
            promotingComparison.value = false
        }
    }

    return {
        currentComparison,
        runningComparison,
        votingComparison,
        promotingComparison,
        comparisonError,
        createModelComparison,
        voteModelComparison,
        promoteModelComparison,
    }
}

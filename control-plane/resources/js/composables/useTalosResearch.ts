import { computed, getCurrentScope, onScopeDispose, ref } from 'vue'
import { talosFetch } from '../lib/api'
import type { TalosResearchReport } from '../lib/talosTypes'

type ApiEnvelope<T> = {
    data: T
}

export type TalosResearchSourceInput = {
    client_id: string
    source_type?: string
    url: string
    title?: string | null
    status: 'planned' | 'fetched' | 'failed' | 'skipped' | string
    excerpt?: string | null
    failure_reason?: string | null
    metadata?: Record<string, unknown> | null
}

export type TalosResearchClaimInput = {
    text: string
    status: 'pending' | 'verified' | 'conflicting' | 'blocked_by_source' | 'rejected' | string
    confidence?: number | null
    source_refs: string[]
    metadata?: Record<string, unknown> | null
}

export type TalosCreateResearchReportInput = {
    title: string
    query: string
    summary?: string | null
    report_markdown?: string | null
    context_set_id?: string | null
    benchmark_group_id?: string | null
    metadata?: Record<string, unknown> | null
    sources: TalosResearchSourceInput[]
    claims: TalosResearchClaimInput[]
}

export type TalosResearchExportPayload = {
    research_report_id: string
    format: 'json' | 'markdown'
    mime_type: string
    export_status: string
    content: string | Record<string, unknown>
    generated_at: string
}

export type TalosResearchJob = {
    id: string
    user_id?: number | null
    run_id?: string | null
    query: string
    status: string
    settings?: Record<string, unknown> | null
    progress?: Record<string, unknown> | null
    failure_code?: string | null
    failure_message?: string | null
    started_at?: string | null
    completed_at?: string | null
    created_at?: string | null
    updated_at?: string | null
}

export type TalosStartResearchJobInput = {
    query: string
    settings?: Record<string, unknown> | null
}

export type TalosResearchExecutionCapability = {
    available: boolean
    mode: 'live' | string
    code: string
    message: string
    fixture_mode?: {
        available: boolean
        mode: 'deterministic_fixture' | string
        test_only: boolean
    }
}

const researchJobTerminalStatuses = new Set(['completed', 'succeeded', 'failed', 'cancelled'])
const researchJobPollIntervalMs = 1000
const researchJobMaxPolls = 60

export function useTalosResearch() {
    const researchReports = ref<TalosResearchReport[]>([])
    const researchReportDetails = ref<Record<string, TalosResearchReport>>({})
    const loadingResearchReports = ref(false)
    const loadingResearchReportId = ref<string | null>(null)
    const creatingResearchReport = ref(false)
    const activeResearchJob = ref<TalosResearchJob | null>(null)
    const researchJobPolling = ref(false)
    const researchJobPollingTimedOut = ref(false)
    const researchExecutionCapability = ref<TalosResearchExecutionCapability | null>(null)
    const loadingResearchExecutionCapability = ref(false)
    let pollingGeneration = 0
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    let resolvePollWait: (() => void) | null = null
    const researchError = ref<string | null>(null)

    const latestResearchReport = computed(() => researchReports.value[0] ?? null)

    function storeResearchReport(report: TalosResearchReport) {
        researchReports.value = [
            report,
            ...researchReports.value.filter((existing) => existing.id !== report.id),
        ]
        researchReportDetails.value = {
            ...researchReportDetails.value,
            [report.id]: report,
        }

        return report
    }

    async function loadResearchReports() {
        loadingResearchReports.value = true
        researchError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosResearchReport[]>>('/api/talos/research-reports')
            researchReports.value = response.data
            return response.data
        } catch (error) {
            researchError.value = error instanceof Error ? error.message : 'TALOS could not load research reports.'
            throw error
        } finally {
            loadingResearchReports.value = false
        }
    }

    async function loadResearchReport(reportId: string) {
        loadingResearchReportId.value = reportId
        researchError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosResearchReport>>(`/api/talos/research-reports/${reportId}`)
            return storeResearchReport(response.data)
        } catch (error) {
            researchError.value = error instanceof Error ? error.message : 'TALOS could not load this research report.'
            throw error
        } finally {
            loadingResearchReportId.value = null
        }
    }

    async function createResearchReport(input: TalosCreateResearchReportInput) {
        creatingResearchReport.value = true
        researchError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosResearchReport>>('/api/talos/research-reports', {
                method: 'POST',
                body: JSON.stringify(input),
                validationMessage: 'TALOS rejected the research report contract.',
            })
            return storeResearchReport(response.data)
        } catch (error) {
            researchError.value = error instanceof Error ? error.message : 'TALOS could not create this research report.'
            throw error
        } finally {
            creatingResearchReport.value = false
        }
    }

    async function loadResearchJob(jobId: string) {
        const response = await talosFetch<ApiEnvelope<TalosResearchJob>>(`/api/talos/research-jobs/${jobId}`)
        activeResearchJob.value = response.data
        return response.data
    }

    async function loadResearchCapability() {
        loadingResearchExecutionCapability.value = true
        researchError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosResearchExecutionCapability>>('/api/talos/research-jobs/capability')
            researchExecutionCapability.value = response.data
            return response.data
        } catch (error) {
            researchError.value = error instanceof Error ? error.message : 'TALOS could not check research execution readiness.'
            throw error
        } finally {
            loadingResearchExecutionCapability.value = false
        }
    }

    function stopResearchJobPolling() {
        pollingGeneration += 1
        if (pollTimer) {
            clearTimeout(pollTimer)
            pollTimer = null
        }
        resolvePollWait?.()
        resolvePollWait = null
        researchJobPolling.value = false
    }

    function waitForResearchPoll() {
        return new Promise<void>((resolve) => {
            resolvePollWait = resolve
            pollTimer = setTimeout(() => {
                pollTimer = null
                resolvePollWait = null
                resolve()
            }, researchJobPollIntervalMs)
        })
    }

    async function startResearchJob(input: TalosStartResearchJobInput) {
        stopResearchJobPolling()
        const generation = pollingGeneration
        researchJobPolling.value = true
        researchJobPollingTimedOut.value = false
        researchError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosResearchJob>>('/api/talos/research-jobs', {
                method: 'POST',
                body: JSON.stringify(input),
                validationMessage: 'TALOS rejected the research job contract.',
            })
            activeResearchJob.value = response.data

            let polls = 0
            while (!researchJobTerminalStatuses.has(activeResearchJob.value?.status ?? '') && generation === pollingGeneration) {
                await waitForResearchPoll()
                if (generation !== pollingGeneration) {
                    break
                }
                await loadResearchJob(response.data.id)
                polls += 1

                if (activeResearchJob.value && researchJobTerminalStatuses.has(activeResearchJob.value.status)) {
                    break
                }

                if (polls >= researchJobMaxPolls) {
                    researchJobPollingTimedOut.value = true
                    break
                }
            }

            return activeResearchJob.value
        } catch (error) {
            researchError.value = error instanceof Error ? error.message : 'TALOS could not start this research job.'
            throw error
        } finally {
            if (generation === pollingGeneration) {
                researchJobPolling.value = false
            }
        }
    }

    async function cancelResearchJob(jobId: string) {
        researchError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosResearchJob>>(`/api/talos/research-jobs/${jobId}/cancel`, {
                method: 'POST',
            })
            activeResearchJob.value = response.data
            stopResearchJobPolling()
            return response.data
        } catch (error) {
            stopResearchJobPolling()
            researchError.value = error instanceof Error ? error.message : 'TALOS could not cancel this research job.'
            throw error
        }
    }

    if (getCurrentScope()) {
        onScopeDispose(stopResearchJobPolling)
    }

    async function exportResearchReport(reportId: string, format: 'json' | 'markdown' = 'markdown') {
        researchError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<TalosResearchExportPayload>>(`/api/talos/research-reports/${reportId}/export?format=${encodeURIComponent(format)}`)

            return response.data
        } catch (error) {
            researchError.value = error instanceof Error ? error.message : 'TALOS could not export this research report.'
            throw error
        }
    }

    async function createFollowUpSession(reportId: string, prompt?: string | null) {
        researchError.value = null

        try {
            const response = await talosFetch<ApiEnvelope<{ id: string; title: string; mode: string; metadata?: Record<string, unknown> }>>(`/api/talos/research-reports/${reportId}/follow-up-session`, {
                method: 'POST',
                body: JSON.stringify({ prompt: prompt ?? null }),
                validationMessage: 'TALOS could not create a follow-up session for this report.',
            })

            return response.data
        } catch (error) {
            researchError.value = error instanceof Error ? error.message : 'TALOS could not create this follow-up session.'
            throw error
        }
    }

    function researchReportById(reportId: string | null | undefined) {
        if (!reportId) {
            return null
        }

        return researchReportDetails.value[reportId]
            ?? researchReports.value.find((report) => report.id === reportId)
            ?? null
    }

    return {
        researchReports,
        researchReportDetails,
        latestResearchReport,
        loadingResearchReports,
        loadingResearchReportId,
        creatingResearchReport,
        activeResearchJob,
        researchJobPolling,
        researchJobPollingTimedOut,
        researchExecutionCapability,
        loadingResearchExecutionCapability,
        researchError,
        loadResearchReports,
        loadResearchReport,
        createResearchReport,
        loadResearchJob,
        startResearchJob,
        cancelResearchJob,
        loadResearchCapability,
        exportResearchReport,
        createFollowUpSession,
        researchReportById,
    }
}

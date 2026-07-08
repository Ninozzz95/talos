import { computed, ref } from 'vue'
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

export function useTalosResearch() {
    const researchReports = ref<TalosResearchReport[]>([])
    const researchReportDetails = ref<Record<string, TalosResearchReport>>({})
    const loadingResearchReports = ref(false)
    const loadingResearchReportId = ref<string | null>(null)
    const creatingResearchReport = ref(false)
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
        researchError,
        loadResearchReports,
        loadResearchReport,
        createResearchReport,
        researchReportById,
    }
}

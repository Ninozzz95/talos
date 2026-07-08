<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, FileSearch, Loader2, Plus, RefreshCw } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import Surface from '../../ui/Surface.vue'
import TalosSourceTable from './TalosSourceTable.vue'
import TalosClaimVerifier from './TalosClaimVerifier.vue'
import { useTalosResearch } from '../../../composables/useTalosResearch'
import type { TalosResearchReport } from '../../../lib/talosTypes'

const {
    researchReports,
    loadingResearchReports,
    loadingResearchReportId,
    creatingResearchReport,
    researchError,
    loadResearchReports,
    loadResearchReport,
    createResearchReport,
    researchReportById,
} = useTalosResearch()

const selectedReportId = ref<string | null>(null)
const title = ref('')
const query = ref('')
const sourceUrl = ref('')
const sourceTitle = ref('')
const claimText = ref('')
const actionError = ref<string | null>(null)

const selectedReport = computed(() => researchReportById(selectedReportId.value))
const visibleError = computed(() => actionError.value || researchError.value)
const canCreate = computed(() => {
    return title.value.trim().length > 0
        && query.value.trim().length > 0
        && sourceUrl.value.trim().startsWith('https://')
        && claimText.value.trim().length > 0
        && !creatingResearchReport.value
})

async function refreshReports() {
    actionError.value = null

    try {
        const reports = await loadResearchReports()
        const nextReportId = selectedReportId.value && reports.some((report) => report.id === selectedReportId.value)
            ? selectedReportId.value
            : reports[0]?.id ?? null
        selectedReportId.value = nextReportId

        if (nextReportId) {
            await loadResearchReport(nextReportId)
        }
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not refresh research reports.'
    }
}

async function selectReport(report: TalosResearchReport) {
    selectedReportId.value = report.id
    actionError.value = null

    try {
        await loadResearchReport(report.id)
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not load selected research report.'
    }
}

async function submitResearchReport() {
    if (!canCreate.value) {
        return
    }

    actionError.value = null

    try {
        const report = await createResearchReport({
            title: title.value.trim(),
            query: query.value.trim(),
            sources: [
                {
                    client_id: 'src-1',
                    url: sourceUrl.value.trim(),
                    title: sourceTitle.value.trim() || null,
                    status: 'planned',
                },
            ],
            claims: [
                {
                    text: claimText.value.trim(),
                    status: 'pending',
                    source_refs: ['src-1'],
                },
            ],
            metadata: {
                source: 'talos_research_workbench',
            },
        })

        selectedReportId.value = report.id
        title.value = ''
        query.value = ''
        sourceUrl.value = ''
        sourceTitle.value = ''
        claimText.value = ''
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not create this research report.'
    }
}

function shortHash(value: string | null | undefined) {
    if (!value) {
        return 'unknown'
    }

    return value.length > 12 ? value.slice(0, 12) : value
}

onMounted(() => {
    void refreshReports()
})
</script>

<template>
    <Surface>
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <FileSearch class="h-4 w-4 text-[var(--talos-accent)]" />
                        Deep research
                    </div>
                    <h3 class="mt-1 text-base font-semibold text-[var(--talos-text)]">Source-backed reports</h3>
                    <p class="mt-1 text-sm leading-6 text-[var(--talos-muted)]">
                        Reports are persisted through `/api/talos/research-reports` and every verified claim must map to a fetched source.
                    </p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                    <Badge :tone="researchReports.length ? 'success' : 'neutral'">{{ researchReports.length }} reports</Badge>
                    <Button type="button" variant="ghost" size="sm" :disabled="loadingResearchReports || creatingResearchReport" @click="refreshReports">
                        <Loader2 v-if="loadingResearchReports" class="h-4 w-4 animate-spin" />
                        <RefreshCw v-else class="h-4 w-4" />
                        Sync
                    </Button>
                </div>
            </div>
        </div>

        <div class="space-y-4 p-4">
            <div v-if="visibleError" class="flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
                <AlertCircle class="mt-1 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                <span>{{ visibleError }}</span>
            </div>

            <div class="grid gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <div class="grid gap-2 md:grid-cols-2">
                    <input
                        v-model="title"
                        class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                        placeholder="Report title"
                        :disabled="creatingResearchReport"
                    >
                    <input
                        v-model="sourceUrl"
                        class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                        placeholder="https://source.example/report"
                        :disabled="creatingResearchReport"
                    >
                </div>
                <input
                    v-model="sourceTitle"
                    class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                    placeholder="Source title"
                    :disabled="creatingResearchReport"
                >
                <textarea
                    v-model="query"
                    class="min-h-[72px] resize-none rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                    placeholder="Research query"
                    :disabled="creatingResearchReport"
                />
                <textarea
                    v-model="claimText"
                    class="min-h-[72px] resize-none rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                    placeholder="Claim verified by src-1"
                    :disabled="creatingResearchReport"
                />
                <Button type="button" size="sm" class="w-full" :disabled="!canCreate" @click="submitResearchReport">
                    <Loader2 v-if="creatingResearchReport" class="h-4 w-4 animate-spin" />
                    <Plus v-else class="h-4 w-4" />
                    Create report
                </Button>
            </div>

            <div v-if="!researchReports.length && !loadingResearchReports" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                No research reports returned by `/api/talos/research-reports`.
            </div>

            <div v-else class="max-h-[180px] divide-y divide-[var(--talos-border)] overflow-y-auto rounded-md border border-[var(--talos-border)]">
                <button
                    v-for="report in researchReports"
                    :key="report.id"
                    type="button"
                    class="grid w-full grid-cols-[minmax(0,1fr)_82px] gap-3 px-3 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--talos-accent)]"
                    :class="selectedReportId === report.id ? 'bg-[var(--talos-panel)]' : 'hover:bg-[var(--talos-active)]'"
                    :disabled="loadingResearchReportId === report.id"
                    @click="selectReport(report)"
                >
                    <span class="min-w-0">
                        <span class="block truncate text-sm font-semibold text-[var(--talos-text)]">{{ report.title }}</span>
                        <span class="mt-1 block truncate font-mono text-[11px] text-[var(--talos-muted)]">
                            run {{ shortHash(report.run_id) }} - {{ report.sources_count ?? report.sources?.length ?? 0 }} sources
                        </span>
                    </span>
                    <span class="flex justify-end">
                        <Badge :tone="report.status === 'succeeded' ? 'success' : report.status === 'blocked' ? 'warning' : 'neutral'">{{ report.status }}</Badge>
                    </span>
                </button>
            </div>

            <div v-if="selectedReport" class="space-y-4">
                <TalosSourceTable :sources="selectedReport.sources ?? []" />
                <TalosClaimVerifier :claims="selectedReport.claims ?? []" />
            </div>
        </div>
    </Surface>
</template>

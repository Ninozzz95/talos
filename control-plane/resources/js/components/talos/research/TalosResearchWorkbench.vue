<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, BookOpen, ChevronDown, FileSearch, Loader2, Play, Plus, RefreshCw } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import Surface from '../../ui/Surface.vue'
import TalosSourceTable from './TalosSourceTable.vue'
import TalosClaimVerifier from './TalosClaimVerifier.vue'
import TalosResearchQueue from './TalosResearchQueue.vue'
import TalosResearchSettingsPanel, { type TalosResearchSettings } from './TalosResearchSettingsPanel.vue'
import TalosClaimSourceGraph from './TalosClaimSourceGraph.vue'
import { useTalosResearch } from '../../../composables/useTalosResearch'
import { useTalosModelProfiles } from '../../../composables/useTalosModelProfiles'
import type { TalosResearchReport } from '../../../lib/talosTypes'

type SubmitMode = 'queued' | 'started'

const emit = defineEmits<{
    'open-library': []
}>()

const {
    researchReports,
    loadingResearchReports,
    loadingResearchReportId,
    creatingResearchReport,
    researchError,
    loadResearchReports,
    loadResearchReport,
    createResearchReport,
    exportResearchReport,
    createFollowUpSession,
    researchReportById,
} = useTalosResearch()

const {
    usableModelProfiles,
    loadModelProfiles,
} = useTalosModelProfiles()

const selectedReportId = ref<string | null>(null)
const title = ref('')
const query = ref('')
const sourceUrl = ref('')
const sourceTitle = ref('')
const claimText = ref('')
const settingsOpen = ref(false)
const actionError = ref<string | null>(null)
const actionMessage = ref('')
const submitMode = ref<SubmitMode | null>(null)
const exportingReportId = ref<string | null>(null)
const creatingFollowUpReportId = ref<string | null>(null)
const historyRef = ref<HTMLElement | null>(null)
const settings = ref<TalosResearchSettings>({
    rounds: 1,
    format: 'briefing',
    search_engine: 'searxng',
    endpoint: 'local',
    model_profile_id: null,
})

const selectedReport = computed(() => researchReportById(selectedReportId.value))
const visibleError = computed(() => actionError.value || researchError.value)
const canCreate = computed(() => {
    return title.value.trim().length > 0
        && query.value.trim().length > 0
        && sourceUrl.value.trim().startsWith('https://')
        && claimText.value.trim().length > 0
        && !creatingResearchReport.value
})
const selectedArtifact = computed(() => selectedReport.value?.artifact ?? null)
const chatWithReportDisabledReason = computed(() => {
    if (!selectedReport.value) {
        return 'Select a report before opening report chat.'
    }

    return null
})
const benchmarkDisabledReason = computed(() => {
    if (!selectedReport.value) {
        return 'Select a report before creating a benchmark scenario.'
    }

    return 'Benchmark scenario requires complete prompt, context, and evaluator evidence.'
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

async function submitResearchReport(mode: SubmitMode) {
    if (!canCreate.value) {
        return
    }

    actionError.value = null
    submitMode.value = mode

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
                    metadata: {
                        source_refs: ['src-1'],
                    },
                },
            ],
            metadata: {
                source: 'talos_research_workbench',
                queue_status: mode,
                rounds: settings.value.rounds,
                format: settings.value.format,
                search_engine: settings.value.search_engine,
                endpoint: settings.value.endpoint,
                model_profile_id: settings.value.model_profile_id,
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
    } finally {
        submitMode.value = null
    }
}

async function exportSelectedReport() {
    const report = selectedReport.value
    if (!report) {
        actionError.value = 'Select a report before exporting.'
        return
    }

    exportingReportId.value = report.id
    actionError.value = null
    actionMessage.value = ''

    try {
        const exported = await exportResearchReport(report.id, 'markdown')
        const content = typeof exported.content === 'string'
            ? exported.content
            : JSON.stringify(exported.content, null, 2)
        const blob = new Blob([content], { type: exported.mime_type })
        const objectUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = objectUrl
        link.download = `talos-research-${report.id}.md`
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(objectUrl)
        actionMessage.value = 'Research report exported.'
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not export this report.'
    } finally {
        exportingReportId.value = null
    }
}

async function openFollowUpSession() {
    const report = selectedReport.value
    if (!report) {
        actionError.value = 'Select a report before creating a follow-up session.'
        return
    }

    creatingFollowUpReportId.value = report.id
    actionError.value = null
    actionMessage.value = ''

    try {
        const session = await createFollowUpSession(report.id, `Continue from ${report.title}.`)
        actionMessage.value = `Follow-up session created: ${session.title}`
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not create a follow-up session.'
    } finally {
        creatingFollowUpReportId.value = null
    }
}

function shortHash(value: string | null | undefined) {
    if (!value) {
        return 'unknown'
    }

    return value.length > 12 ? value.slice(0, 12) : value
}

function scrollToHistory() {
    historyRef.value?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
    historyRef.value?.focus({ preventScroll: true })
}

onMounted(() => {
    void Promise.allSettled([
        refreshReports(),
        loadModelProfiles(),
    ])
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
                    <h3 class="mt-1 text-base font-semibold text-[var(--talos-text)]">Deep Research V3</h3>
                    <p class="mt-1 text-sm leading-6 text-[var(--talos-muted)]">
                        Queue source-backed draft reports without pretending that manual sources were fetched or claims were verified.
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
            <div v-if="actionMessage" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-muted)]">
                {{ actionMessage }}
            </div>

            <section class="grid gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <div class="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(220px,320px)]">
                    <label class="grid gap-1">
                        <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Report title</span>
                        <input
                            v-model="title"
                            class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                            aria-label="Report title"
                            placeholder="AVM evidence review"
                            :disabled="creatingResearchReport"
                        >
                    </label>

                    <div class="flex items-end gap-2">
                        <Button type="button" variant="secondary" size="sm" class="flex-1" @click="settingsOpen = !settingsOpen">
                            <ChevronDown class="h-4 w-4" :class="settingsOpen ? 'rotate-180' : ''" />
                            Research settings
                        </Button>
                        <Button type="button" variant="ghost" size="sm" @click="emit('open-library')">
                            <BookOpen class="h-4 w-4" />
                            Library
                        </Button>
                        <Button type="button" variant="ghost" size="sm" @click="scrollToHistory">
                            History
                        </Button>
                    </div>
                </div>

                <label class="grid gap-1">
                    <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Research query</span>
                    <textarea
                        v-model="query"
                        class="min-h-[148px] resize-y rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-3 text-sm leading-6 text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                        aria-label="Research query"
                        placeholder="Ask for evidence, constraints, and the claims that must remain pending until source fetch exists."
                        :disabled="creatingResearchReport"
                    />
                </label>

                <div class="grid gap-2 md:grid-cols-2">
                    <label class="grid gap-1">
                        <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Primary source URL</span>
                        <input
                            v-model="sourceUrl"
                            class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                            aria-label="Primary source URL"
                            placeholder="https://source.example/report"
                            :disabled="creatingResearchReport"
                        >
                    </label>
                    <label class="grid gap-1">
                        <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Source title</span>
                        <input
                            v-model="sourceTitle"
                            class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                            aria-label="Source title"
                            placeholder="Source title"
                            :disabled="creatingResearchReport"
                        >
                    </label>
                </div>

                <label class="grid gap-1">
                    <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Initial claim</span>
                    <textarea
                        v-model="claimText"
                        class="min-h-[84px] resize-none rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                        aria-label="Initial claim"
                        placeholder="Claim mapped to src-1 and kept pending until fetched evidence exists."
                        :disabled="creatingResearchReport"
                    />
                </label>

                <TalosResearchSettingsPanel
                    v-if="settingsOpen"
                    :settings="settings"
                    :model-profiles="usableModelProfiles"
                    :disabled="creatingResearchReport"
                    @update="settings = $event"
                />

                <div class="grid gap-2 sm:grid-cols-2">
                    <Button type="button" variant="secondary" size="sm" :disabled="!canCreate" @click="submitResearchReport('queued')">
                        <Loader2 v-if="creatingResearchReport && submitMode === 'queued'" class="h-4 w-4 animate-spin" />
                        <Plus v-else class="h-4 w-4" />
                        Queue report
                    </Button>
                    <Button type="button" size="sm" :disabled="!canCreate" @click="submitResearchReport('started')">
                        <Loader2 v-if="creatingResearchReport && submitMode === 'started'" class="h-4 w-4 animate-spin" />
                        <Play v-else class="h-4 w-4" />
                        Start research
                    </Button>
                </div>
            </section>

            <div class="grid gap-4 xl:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
                <div ref="historyRef" tabindex="-1" class="outline-none">
                    <TalosResearchQueue
                        :reports="researchReports"
                        :selected-report-id="selectedReportId"
                        @select="selectReport"
                    />
                </div>

                <section class="space-y-4">
                    <div v-if="loadingResearchReportId && !selectedReport" class="flex items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm text-[var(--talos-muted)]">
                        <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                        Loading research report
                    </div>

                    <div v-else-if="!selectedReport" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                        Queue or select a report to inspect source status, claims, graph evidence, and artifacts.
                    </div>

                    <div v-else class="space-y-4">
                        <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div class="min-w-0">
                                    <div class="flex flex-wrap items-center gap-2">
                                        <h4 class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ selectedReport.title }}</h4>
                                        <Badge :tone="selectedReport.status === 'succeeded' ? 'success' : selectedReport.status === 'blocked' ? 'warning' : 'neutral'">{{ selectedReport.status }}</Badge>
                                        <Badge tone="neutral">run {{ shortHash(selectedReport.run_id) }}</Badge>
                                    </div>
                                    <p class="mt-2 text-sm leading-6 text-[var(--talos-muted)]">{{ selectedReport.summary || selectedReport.query }}</p>
                                    <p v-if="selectedArtifact" class="mt-2 truncate font-mono text-[11px] text-[var(--talos-accent)]">{{ selectedArtifact.uri }}</p>
                                </div>
                                <div class="flex flex-wrap gap-2">
                                    <Button type="button" size="sm" :disabled="Boolean(chatWithReportDisabledReason) || creatingFollowUpReportId === selectedReport.id" @click="openFollowUpSession">
                                        <Loader2 v-if="creatingFollowUpReportId === selectedReport.id" class="h-4 w-4 animate-spin" />
                                        Chat with report
                                    </Button>
                                    <Button type="button" variant="secondary" size="sm" :disabled="exportingReportId === selectedReport.id" @click="exportSelectedReport">
                                        <Loader2 v-if="exportingReportId === selectedReport.id" class="h-4 w-4 animate-spin" />
                                        Export report
                                    </Button>
                                </div>
                            </div>
                            <div class="mt-3 grid gap-2 text-xs leading-5 text-[var(--talos-muted)] md:grid-cols-2">
                                <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2">
                                    {{ chatWithReportDisabledReason || 'Creates a bounded follow-up session with report metadata.' }}
                                </div>
                                <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2">
                                    {{ benchmarkDisabledReason }} Export is available as Markdown/JSON.
                                </div>
                            </div>
                        </div>

                        <TalosClaimSourceGraph
                            :claims="selectedReport.claims ?? []"
                            :sources="selectedReport.sources ?? []"
                        />
                        <TalosSourceTable :sources="selectedReport.sources ?? []" />
                        <TalosClaimVerifier :claims="selectedReport.claims ?? []" />
                    </div>
                </section>
            </div>
        </div>
    </Surface>
</template>

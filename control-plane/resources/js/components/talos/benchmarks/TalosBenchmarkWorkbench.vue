<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, BarChart3, Download, Loader2, Play, RefreshCw, Scale } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import Surface from '../../ui/Surface.vue'
import TalosBenchmarkLane from './TalosBenchmarkLane.vue'
import TalosDiffViewer from './TalosDiffViewer.vue'
import { useTalosBenchmarks } from '../../../composables/useTalosBenchmarks'
import type { TalosBenchmarkGroup, TalosBenchmarkResult } from '../../../lib/talosTypes'

const props = withDefaults(defineProps<{
    compact?: boolean
    compareEndpoint?: string
    groupsEndpoint?: string
    exportEndpoint?: string | null
    defaultRuns?: number
    initialBenchmarkGroupId?: string | null
}>(), {
    compact: false,
    compareEndpoint: '/api/benchmarks/compare',
    groupsEndpoint: '/api/talos/benchmark-groups',
    exportEndpoint: null,
    defaultRuns: 1,
    initialBenchmarkGroupId: null,
})

const {
    benchmarkGroups,
    loadingBenchmarkGroups,
    loadingBenchmarkGroupId,
    runningBenchmarkComparison,
    benchmarkError,
    loadBenchmarkGroups,
    loadBenchmarkGroup,
    runBenchmarkComparison,
    benchmarkGroupById,
} = useTalosBenchmarks()

const scenarioPath = ref('')
const runs = ref(props.defaultRuns)
const selectedGroupId = ref<string | null>(props.initialBenchmarkGroupId)
const actionError = ref<string | null>(null)
const actionMessage = ref('')
const exportingBenchmark = ref(false)

const selectedGroup = computed(() => benchmarkGroupById(selectedGroupId.value))
const visibleError = computed(() => actionError.value || benchmarkError.value)
const canRun = computed(() => {
    return scenarioPath.value.trim().startsWith('benchmark-scenarios/')
        && scenarioPath.value.trim().endsWith('.json')
        && !runningBenchmarkComparison.value
})
const canExport = computed(() => Boolean(props.exportEndpoint && selectedGroup.value))
const selectedResults = computed<TalosBenchmarkResult[]>(() => selectedGroup.value?.results ?? [])
const hasToolAgentLane = computed(() => selectedResults.value.some((result) => result.mode === 'tool_agent'))
const visibleResults = computed(() => {
    const orderedModes = hasToolAgentLane.value
        ? ['avm_on', 'avm_off_direct', 'tool_agent']
        : ['avm_on', 'avm_off_direct']

    return orderedModes.flatMap((mode) => {
        const result = selectedResults.value.find((candidate) => candidate.mode === mode)

        return result ? [result] : []
    })
})

const fairness = computed(() => {
    const group = selectedGroup.value

    if (!group) {
        return [
            ['same prompt', 'no group selected'],
            ['same context', 'no group selected'],
            ['same evaluator', 'no group selected'],
        ]
    }

    return [
        ['same prompt', group.prompt_hash ?? 'unknown'],
        ['same context', group.context_hash ?? 'unknown'],
        ['same evaluator', group.evaluator_version],
    ]
})

function shortHash(value: string | null | undefined) {
    if (!value) {
        return 'unknown'
    }

    return value.length > 12 ? value.slice(0, 12) : value
}

async function refreshGroups() {
    actionError.value = null

    try {
        const groups = await loadBenchmarkGroups()
        const nextGroupId = selectedGroupId.value && groups.some((group) => group.id === selectedGroupId.value)
            ? selectedGroupId.value
            : groups[0]?.id ?? null
        selectedGroupId.value = nextGroupId

        if (nextGroupId) {
            await loadBenchmarkGroup(nextGroupId)
        }
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not refresh benchmark groups.'
    }
}

async function selectGroup(group: TalosBenchmarkGroup) {
    selectedGroupId.value = group.id
    actionError.value = null

    try {
        await loadBenchmarkGroup(group.id)
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not load selected benchmark group.'
    }
}

async function runComparison() {
    if (!canRun.value) {
        actionError.value = 'Benchmark scenario path must be a private benchmark-scenarios/*.json path.'
        return
    }

    actionError.value = null

    try {
        const response = await runBenchmarkComparison({
            scenario_path: scenarioPath.value.trim(),
            runs: Math.max(1, Math.min(50, runs.value || 1)),
        })
        selectedGroupId.value = response.benchmark_group.id
        await loadBenchmarkGroup(response.benchmark_group.id)
        actionMessage.value = 'Benchmark comparison completed.'
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not run the benchmark comparison.'
    }
}

function exportUrl(groupId: string) {
    return props.exportEndpoint?.replace('{id}', encodeURIComponent(groupId)) ?? null
}

async function downloadBenchmarkReport() {
    const group = selectedGroup.value
    const endpoint = group ? exportUrl(group.id) : null

    if (!group || !endpoint) {
        actionError.value = 'Report export requires a selected benchmark group and export endpoint.'
        return
    }

    exportingBenchmark.value = true
    actionError.value = null
    actionMessage.value = ''

    try {
        const response = await fetch(endpoint, {
            headers: { Accept: 'application/json' },
        })

        if (!response.ok) {
            throw new Error(`TALOS export failed with HTTP ${response.status}.`)
        }

        const payload = await response.json()
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
        const objectUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = objectUrl
        link.download = `talos-benchmark-${group.id}.json`
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(objectUrl)
        actionMessage.value = 'Benchmark report exported.'
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not export the benchmark report.'
    } finally {
        exportingBenchmark.value = false
    }
}

onMounted(() => {
    void refreshGroups()
})
</script>

<template>
    <Surface>
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <BarChart3 class="h-4 w-4 text-[var(--talos-accent)]" />
                        Benchmark workbench
                    </div>
                    <h3 class="mt-1 text-base font-semibold text-[var(--talos-text)]">AVM ON/OFF evidence</h3>
                    <p class="mt-1 text-sm leading-6 text-[var(--talos-muted)]">
                        Runs and reads persisted benchmark groups from {{ compareEndpoint }} and {{ groupsEndpoint }}.
                    </p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                    <Badge :tone="benchmarkGroups.length ? 'success' : 'neutral'">{{ benchmarkGroups.length }} groups</Badge>
                    <Button type="button" variant="ghost" size="sm" :disabled="loadingBenchmarkGroups || runningBenchmarkComparison" @click="refreshGroups">
                        <Loader2 v-if="loadingBenchmarkGroups" class="h-4 w-4 animate-spin" />
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

            <div class="grid gap-2 md:grid-cols-[minmax(0,1fr)_86px_104px]">
                <input
                    v-model="scenarioPath"
                    class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                    placeholder="benchmark-scenarios/YYYY/MM/DD/file_x.json"
                    aria-label="Benchmark scenario path"
                    :disabled="runningBenchmarkComparison"
                >
                <input
                    v-model.number="runs"
                    type="number"
                    min="1"
                    max="50"
                    class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                    aria-label="Benchmark runs"
                    :disabled="runningBenchmarkComparison"
                >
                <Button type="button" size="sm" :disabled="!canRun" @click="runComparison">
                    <Loader2 v-if="runningBenchmarkComparison" class="h-4 w-4 animate-spin" />
                    <Play v-else class="h-4 w-4" />
                    Compare
                </Button>
            </div>

            <div v-if="!benchmarkGroups.length && !loadingBenchmarkGroups" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3 text-sm leading-6 text-[var(--talos-muted)]">
                No persisted benchmark groups returned by `/api/talos/benchmark-groups` yet.
            </div>

            <div v-else class="max-h-[180px] divide-y divide-[var(--talos-border)] overflow-y-auto rounded-md border border-[var(--talos-border)]">
                <button
                    v-for="group in benchmarkGroups"
                    :key="group.id"
                    type="button"
                    class="grid w-full grid-cols-[minmax(0,1fr)_72px] gap-3 px-3 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--talos-accent)]"
                    :class="selectedGroupId === group.id ? 'bg-[var(--talos-panel)]' : 'hover:bg-[var(--talos-active)]'"
                    :disabled="loadingBenchmarkGroupId === group.id"
                    @click="selectGroup(group)"
                >
                    <span class="min-w-0">
                        <span class="block truncate text-sm font-semibold text-[var(--talos-text)]">{{ group.name }}</span>
                        <span class="mt-1 block truncate font-mono text-[11px] text-[var(--talos-muted)]">
                            {{ shortHash(group.scenario_hash) }} - {{ shortHash(group.prompt_hash) }} - {{ shortHash(group.context_hash) }}
                        </span>
                    </span>
                    <span class="flex justify-end">
                        <Badge tone="neutral">{{ group.results_count ?? group.results?.length ?? 0 }} lanes</Badge>
                    </span>
                </button>
            </div>

            <section class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)]">
                <div class="flex items-center gap-2 border-b border-[var(--talos-border)] bg-[var(--talos-active)] px-3 py-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                    <Scale class="h-4 w-4 text-[var(--talos-accent)]" />
                    Fairness contract
                </div>
                <div class="grid gap-2 p-3 md:grid-cols-3">
                    <div v-for="[label, value] in fairness" :key="label" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
                        <div class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">{{ label }}</div>
                        <div class="mt-1 truncate font-mono text-xs text-[var(--talos-text)]">{{ shortHash(value) }}</div>
                    </div>
                </div>
            </section>

            <div v-if="visibleResults.length" class="grid gap-3 xl:grid-cols-3">
                <TalosBenchmarkLane v-for="result in visibleResults" :key="result.id" :result="result" />
            </div>

            <TalosDiffViewer :results="visibleResults" />

            <Button type="button" variant="secondary" size="sm" class="w-full" :disabled="!canExport || exportingBenchmark" @click="downloadBenchmarkReport">
                <Loader2 v-if="exportingBenchmark" class="h-4 w-4 animate-spin" />
                <Download v-else class="h-4 w-4" />
                {{ exportEndpoint ? 'Export report' : 'Export report unavailable' }}
            </Button>
        </div>
    </Surface>
</template>

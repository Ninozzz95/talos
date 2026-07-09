<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import {
    AlertCircle,
    Film,
    Loader2,
    Pause,
    Play,
    RefreshCw,
    SkipBack,
    SkipForward,
} from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import type { TalosRun, TalosRunReplay, TalosRunReplayStep } from '../../../lib/talosTypes'

type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral'

const props = defineProps<{
    run: TalosRun | null
    replay: TalosRunReplay | null
    loading: boolean
    error: string | null
}>()

const emit = defineEmits<{
    refresh: []
}>()

const selectedIndex = ref(0)
const playing = ref(false)
const speed = ref('1x')
const selectedStepFilter = ref('all')
let timer: ReturnType<typeof window.setInterval> | null = null

const steps = computed(() => props.replay?.steps ?? [])
const stepFilters = computed(() => {
    const fromReplay = (props.replay?.filters ?? []).map(normalizeFilter)
    const fromSteps = steps.value.map((step) => step.kind).filter(Boolean)
    const unique = Array.from(new Set(['all', ...fromReplay, ...fromSteps]))

    return unique.filter((filter) => typeof filter === 'string' && filter.trim().length > 0)
})
const filteredSteps = computed(() => {
    if (selectedStepFilter.value === 'all') {
        return steps.value
    }

    return steps.value.filter((step) => step.kind === selectedStepFilter.value)
})
const currentStep = computed<TalosRunReplayStep | null>(() => filteredSteps.value[selectedIndex.value] ?? null)
const canStepBackward = computed(() => selectedIndex.value > 0)
const canStepForward = computed(() => selectedIndex.value < filteredSteps.value.length - 1)
const progressLabel = computed(() => filteredSteps.value.length ? `${selectedIndex.value + 1}/${filteredSteps.value.length}` : '0/0')

const delayMs = computed(() => {
    if (speed.value === '2x') {
        return 650
    }

    if (speed.value === '0.5x') {
        return 1800
    }

    return 1100
})

function kindTone(kind: string): BadgeTone {
    if (kind === 'fault') {
        return 'danger'
    }

    if (kind === 'recovery') {
        return 'warning'
    }

    if (kind === 'worker_execution') {
        return 'success'
    }

    return 'neutral'
}

function normalizeFilter(filter: string) {
    if (filter === 'faults') {
        return 'fault'
    }

    return filter
}

function stopPlayback() {
    playing.value = false
    if (timer) {
        window.clearInterval(timer)
        timer = null
    }
}

function stepBackward() {
    if (canStepBackward.value) {
        selectedIndex.value -= 1
    }
}

function stepForward() {
    if (canStepForward.value) {
        selectedIndex.value += 1
        return
    }

    stopPlayback()
}

function togglePlayback() {
    if (!filteredSteps.value.length) {
        return
    }

    if (playing.value) {
        stopPlayback()
        return
    }

    playing.value = true
    timer = window.setInterval(() => {
        stepForward()
    }, delayMs.value)
}

function selectStep(index: number) {
    selectedIndex.value = index
}

function statusCount() {
    return Object.keys(props.replay?.final_node_statuses ?? {}).length
}

watch(() => props.replay?.run_id, () => {
    selectedIndex.value = 0
    selectedStepFilter.value = 'all'
    stopPlayback()
})

watch(selectedStepFilter, () => {
    selectedIndex.value = 0
    stopPlayback()
})

watch(delayMs, () => {
    if (playing.value) {
        stopPlayback()
        togglePlayback()
    }
})

onUnmounted(() => {
    stopPlayback()
})
</script>

<template>
    <div class="overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)]">
        <div class="flex flex-col gap-3 border-b border-[var(--talos-border)] bg-[var(--talos-active)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                <Film class="h-4 w-4 text-[var(--talos-accent)]" />
                Trace replay
            </div>
            <div class="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{{ progressLabel }}</Badge>
                <Badge tone="neutral">{{ statusCount() }} node states</Badge>
                <select
                    v-model="selectedStepFilter"
                    class="h-8 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 text-xs text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                    aria-label="Replay step filter"
                    :disabled="!steps.length || loading"
                >
                    <option v-for="filter in stepFilters" :key="filter" :value="filter">{{ filter }}</option>
                </select>
                <select
                    v-model="speed"
                    class="h-8 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 text-xs text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                    aria-label="Replay speed"
                    :disabled="!steps.length || loading"
                >
                    <option value="0.5x">0.5x</option>
                    <option value="1x">1x</option>
                    <option value="2x">2x</option>
                </select>
                <Button type="button" variant="ghost" size="sm" :disabled="!run || loading" @click="emit('refresh')">
                    <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
                    <RefreshCw v-else class="h-4 w-4" />
                    Replay
                </Button>
            </div>
        </div>

        <div class="space-y-3 p-3">
            <div v-if="error" class="flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
                <AlertCircle class="mt-1 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                <span>{{ error }}</span>
            </div>

            <div v-if="!run" class="text-sm leading-6 text-[var(--talos-muted)]">
                Select a run to request a replay from `/api/talos/runs/{id}/replay`.
            </div>

            <div v-else-if="loading && !replay" class="flex items-center gap-2 text-sm text-[var(--talos-muted)]">
                <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                Loading replay
            </div>

            <div v-else-if="replay && !steps.length" class="text-sm leading-6 text-[var(--talos-muted)]">
                The selected run has no persisted events to replay.
            </div>

            <div v-else-if="replay" class="space-y-3">
                <div class="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="secondary" size="sm" :disabled="!canStepBackward || loading" @click="stepBackward">
                        <SkipBack class="h-4 w-4" />
                        Back
                    </Button>
                    <Button type="button" variant="secondary" size="sm" :disabled="!filteredSteps.length || loading" @click="togglePlayback">
                        <Pause v-if="playing" class="h-4 w-4" />
                        <Play v-else class="h-4 w-4" />
                        {{ playing ? 'Pause' : 'Play' }}
                    </Button>
                    <Button type="button" variant="secondary" size="sm" :disabled="!canStepForward || loading" @click="stepForward">
                        <SkipForward class="h-4 w-4" />
                        Next
                    </Button>
                </div>

                <div v-if="currentStep" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                        <div class="min-w-0">
                            <div class="font-mono text-xs text-[var(--talos-muted)]">#{{ currentStep.sequence }}</div>
                            <div class="mt-1 truncate text-sm font-semibold text-[var(--talos-text)]">{{ currentStep.label }}</div>
                            <div class="mt-1 truncate text-xs text-[var(--talos-muted)]">{{ currentStep.node_id || 'run' }}</div>
                        </div>
                        <div class="flex flex-wrap justify-end gap-2">
                            <Badge :tone="kindTone(currentStep.kind)">{{ currentStep.kind }}</Badge>
                            <Badge v-if="currentStep.status_after" tone="neutral">{{ currentStep.status_after }}</Badge>
                        </div>
                    </div>
                </div>

                <div class="max-h-[220px] divide-y divide-[var(--talos-border)] overflow-y-auto rounded-md border border-[var(--talos-border)]">
                    <button
                        v-for="(step, index) in filteredSteps"
                        :key="step.sequence + '-' + index"
                        type="button"
                        class="grid w-full grid-cols-[56px_minmax(0,1fr)_88px] gap-3 px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--talos-accent)]"
                        :class="selectedIndex === index ? 'bg-[var(--talos-panel)]' : 'hover:bg-[var(--talos-active)]'"
                        @click="selectStep(index)"
                    >
                        <span class="font-mono text-xs font-semibold text-[var(--talos-text)]">#{{ step.sequence }}</span>
                        <span class="min-w-0">
                            <span class="block truncate text-xs font-semibold text-[var(--talos-text)]">{{ step.type }}</span>
                            <span class="mt-1 block truncate text-[11px] text-[var(--talos-muted)]">{{ step.label }}</span>
                        </span>
                        <span class="flex justify-end">
                            <Badge :tone="kindTone(step.kind)">{{ step.kind }}</Badge>
                        </span>
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

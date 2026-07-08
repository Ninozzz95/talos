<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Activity, AlertCircle, Clock3, Loader2, RefreshCw, Route } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import Surface from '../../ui/Surface.vue'
import TalosNodeGraph from './TalosNodeGraph.vue'
import TalosNodeInspector from './TalosNodeInspector.vue'
import TalosRecoveryPanel from './TalosRecoveryPanel.vue'
import TalosTraceReplay from './TalosTraceReplay.vue'
import { useTalosRuns } from '../../../composables/useTalosRuns'
import type {
    NodeStatus,
    RunStatus,
    TalosRecoveryRequest,
    TalosRun,
    TalosRunEvent,
    TalosRunEventSeverity,
    TalosRunNodeStatus,
    TalosRunNodeSummary,
} from '../../../lib/talosTypes'

type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral'
type InspectorSelection = 'run' | 'event' | 'node'

const nodeStatuses = new Set<NodeStatus>([
    'PENDING',
    'VALIDATED',
    'RUNNING',
    'SUCCESS',
    'FAILED',
    'BLOCKED_BY_DEPENDENCY',
    'RETRYING',
    'SKIPPED',
    'PRUNED',
])

const {
    runs,
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
} = useTalosRuns()

const selectedRunId = ref<string | null>(null)
const selectedEventId = ref<string | null>(null)
const selectedNodeId = ref<string | null>(null)
const inspectorSelection = ref<InspectorSelection>('run')
const actionError = ref<string | null>(null)

const selectedRun = computed(() => {
    if (!selectedRunId.value) {
        return null
    }

    return runs.value.find((run) => run.id === selectedRunId.value) ?? null
})

const selectedRunEvents = computed(() => {
    if (!selectedRunId.value) {
        return []
    }

    return [...(runEvents.value[selectedRunId.value] ?? [])].sort((left, right) => {
        if (left.sequence !== right.sequence) {
            return left.sequence - right.sequence
        }

        return new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
    })
})

const selectedRunReplay = computed(() => {
    if (!selectedRunId.value) {
        return null
    }

    return runReplays.value[selectedRunId.value] ?? null
})

const nodeSummaries = computed(() => buildNodeSummaries(selectedRunEvents.value))

const selectedEvent = computed(() => {
    if (!selectedEventId.value) {
        return null
    }

    return selectedRunEvents.value.find((event) => event.id === selectedEventId.value) ?? null
})

const selectedNode = computed(() => {
    if (!selectedNodeId.value) {
        return null
    }

    return nodeSummaries.value.find((node) => node.id === selectedNodeId.value) ?? null
})

const selectedRunLoading = computed(() => {
    return Boolean(selectedRunId.value && (
        loadingRunId.value === selectedRunId.value
        || loadingEventsRunId.value === selectedRunId.value
        || loadingReplayRunId.value === selectedRunId.value
        || recoveringRunId.value === selectedRunId.value
    ))
})

const visibleError = computed(() => actionError.value || runError.value || eventError.value || replayError.value || recoveryError.value)

function isNodeStatus(value: unknown): value is NodeStatus {
    return typeof value === 'string' && nodeStatuses.has(value as NodeStatus)
}

function payloadString(payload: Record<string, unknown>, key: string) {
    const value = payload[key]

    return typeof value === 'string' && value.trim() ? value : null
}

function eventNodeId(event: TalosRunEvent) {
    return event.node_id
        ?? payloadString(event.payload, 'node_id')
        ?? payloadString(event.payload, 'node')
        ?? payloadString(event.payload, 'id')
        ?? null
}

function inferredStatus(event: TalosRunEvent): TalosRunNodeStatus {
    const payloadStatus = event.payload.status ?? event.payload.node_status

    if (isNodeStatus(payloadStatus)) {
        return payloadStatus
    }

    const eventType = event.event_type.toLowerCase()

    if (event.severity === 'error' || eventType.includes('fail')) {
        return 'FAILED'
    }

    if (eventType.includes('blocked')) {
        return 'BLOCKED_BY_DEPENDENCY'
    }

    if (eventType.includes('retry')) {
        return 'RETRYING'
    }

    if (eventType.includes('skip')) {
        return 'SKIPPED'
    }

    if (eventType.includes('success') || eventType.includes('complete')) {
        return 'SUCCESS'
    }

    if (eventType.includes('validat')) {
        return 'VALIDATED'
    }

    if (eventType.includes('run') || eventType.includes('start')) {
        return 'RUNNING'
    }

    return 'UNKNOWN'
}

function buildNodeSummaries(events: TalosRunEvent[]): TalosRunNodeSummary[] {
    const byId = new Map<string, TalosRunNodeSummary>()

    for (const event of events) {
        const nodeId = eventNodeId(event)

        if (!nodeId) {
            continue
        }

        const existing = byId.get(nodeId)
        const status = inferredStatus(event)
        const label = payloadString(event.payload, 'label') ?? payloadString(event.payload, 'name')
        const type = payloadString(event.payload, 'node_type') ?? payloadString(event.payload, 'type')

        if (!existing) {
            byId.set(nodeId, {
                id: nodeId,
                label,
                type,
                status,
                event_count: 1,
                last_event_type: event.event_type,
                last_severity: event.severity,
                last_sequence: event.sequence,
                first_seen_at: event.created_at,
                last_seen_at: event.created_at,
                payload: event.payload,
            })
            continue
        }

        existing.label = existing.label ?? label
        existing.type = existing.type ?? type
        existing.status = status === 'UNKNOWN' ? existing.status : status
        existing.event_count += 1
        existing.last_event_type = event.event_type
        existing.last_severity = event.severity
        existing.last_sequence = event.sequence
        existing.last_seen_at = event.created_at
        existing.payload = event.payload
    }

    return [...byId.values()].sort((left, right) => left.last_sequence - right.last_sequence)
}

function runStatusTone(status: RunStatus): BadgeTone {
    if (status === 'succeeded') {
        return 'success'
    }

    if (status === 'failed' || status === 'cancelled') {
        return 'danger'
    }

    if (status === 'blocked' || status === 'running' || status === 'validating' || status === 'planning') {
        return 'warning'
    }

    return 'neutral'
}

function eventSeverityTone(severity: TalosRunEventSeverity): BadgeTone {
    if (severity === 'error') {
        return 'danger'
    }

    if (severity === 'warning') {
        return 'warning'
    }

    return 'neutral'
}

function formatDate(value: string | null | undefined) {
    if (!value) {
        return 'not recorded'
    }

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
        return value
    }

    return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

function shortHash(value: string | null | undefined) {
    if (!value) {
        return 'none'
    }

    return value.length > 12 ? value.slice(0, 12) : value
}

function eventPayloadCount(event: TalosRunEvent) {
    return Object.keys(event.payload ?? {}).length
}

function clearSelectionToRun() {
    selectedEventId.value = null
    selectedNodeId.value = null
    inspectorSelection.value = 'run'
}

async function loadSelectedRunData(runId: string) {
    const results = await Promise.allSettled([
        loadRun(runId),
        loadRunEvents(runId),
        loadRunReplay(runId),
    ])
    const failure = results.find((result) => result.status === 'rejected')

    if (failure && failure.status === 'rejected') {
        actionError.value = failure.reason instanceof Error
            ? failure.reason.message
            : 'TALOS could not load selected run data.'
    }
}

async function refreshRuns() {
    actionError.value = null

    try {
        const loadedRuns = await loadRuns()
        const currentRunStillExists = selectedRunId.value
            ? loadedRuns.some((run) => run.id === selectedRunId.value)
            : false
        const nextRunId = currentRunStillExists ? selectedRunId.value : loadedRuns[0]?.id ?? null

        selectedRunId.value = nextRunId
        clearSelectionToRun()

        if (nextRunId) {
            await loadSelectedRunData(nextRunId)
        }
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not load runs.'
    }
}

async function selectRun(run: TalosRun) {
    if (selectedRunId.value !== run.id) {
        selectedRunId.value = run.id
        clearSelectionToRun()
    }

    actionError.value = null
    await loadSelectedRunData(run.id)
}

async function refreshSelectedRun() {
    if (!selectedRunId.value) {
        await refreshRuns()
        return
    }

    actionError.value = null
    await loadSelectedRunData(selectedRunId.value)
}

async function refreshSelectedReplay() {
    if (!selectedRunId.value) {
        return
    }

    actionError.value = null

    try {
        await loadRunReplay(selectedRunId.value)
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not load selected run replay.'
    }
}

async function submitRecovery(request: TalosRecoveryRequest) {
    if (!selectedRunId.value) {
        actionError.value = 'Select a run before requesting recovery.'
        return
    }

    actionError.value = null

    try {
        await recoverRunNode(selectedRunId.value, request)
        await Promise.allSettled([
            loadRun(selectedRunId.value),
            loadRunEvents(selectedRunId.value),
            loadRunReplay(selectedRunId.value),
        ])
        inspectorSelection.value = 'event'
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not submit selected recovery.'
    }
}

function selectEvent(event: TalosRunEvent) {
    selectedEventId.value = event.id
    selectedNodeId.value = eventNodeId(event)
    inspectorSelection.value = 'event'
}

function selectNode(node: TalosRunNodeSummary) {
    selectedNodeId.value = node.id
    selectedEventId.value = null
    inspectorSelection.value = 'node'
}

onMounted(() => {
    void refreshRuns()
})
</script>

<template>
    <Surface>
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <Activity class="h-4 w-4 text-[var(--talos-accent)]" />
                        Run timeline
                    </div>
                    <h3 class="mt-1 text-base font-semibold text-[var(--talos-text)]">Persisted execution runs</h3>
                    <p class="mt-1 text-sm leading-6 text-[var(--talos-muted)]">
                        Loads run records and event payloads from the TALOS control-plane run APIs.
                    </p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                    <Badge :tone="runs.length ? 'success' : 'neutral'">{{ runs.length }} runs</Badge>
                    <Button type="button" variant="ghost" size="sm" :disabled="loadingRuns || selectedRunLoading" @click="refreshRuns">
                        <Loader2 v-if="loadingRuns" class="h-4 w-4 animate-spin" />
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

            <div class="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_minmax(280px,360px)]">
                <section class="overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)]">
                    <div class="flex items-center justify-between gap-3 border-b border-[var(--talos-border)] bg-[var(--talos-active)] px-3 py-2">
                        <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                            <Route class="h-4 w-4 text-[var(--talos-accent)]" />
                            Runs
                        </div>
                        <Badge tone="neutral">/api/talos/runs</Badge>
                    </div>

                    <div v-if="loadingRuns && !runs.length" class="flex items-center gap-2 px-3 py-4 text-sm text-[var(--talos-muted)]">
                        <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                        Loading runs
                    </div>

                    <div v-else-if="!runs.length" class="px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                        No execution runs returned by `/api/talos/runs` yet.
                    </div>

                    <div v-else class="max-h-[560px] divide-y divide-[var(--talos-border)] overflow-y-auto">
                        <button
                            v-for="run in runs"
                            :key="run.id"
                            type="button"
                            class="w-full px-3 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--talos-accent)]"
                            :class="selectedRunId === run.id ? 'bg-[var(--talos-panel)]' : 'hover:bg-[var(--talos-active)]'"
                            :disabled="loadingRunId === run.id || loadingEventsRunId === run.id"
                            @click="selectRun(run)"
                        >
                            <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0">
                                    <div class="truncate font-mono text-xs font-semibold text-[var(--talos-text)]">{{ run.id }}</div>
                                    <div class="mt-1 truncate text-xs text-[var(--talos-muted)]">{{ run.mode.replaceAll('_', ' ') }}</div>
                                </div>
                                <Badge :tone="runStatusTone(run.status)">{{ run.status }}</Badge>
                            </div>
                            <div class="mt-3 grid gap-1 text-[11px] text-[var(--talos-muted)]">
                                <span>prompt {{ shortHash(run.prompt_hash) }}</span>
                                <span>updated {{ formatDate(run.updated_at) }}</span>
                            </div>
                        </button>
                    </div>
                </section>

                <section class="space-y-4">
                    <div class="overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)]">
                        <div class="flex items-center justify-between gap-3 border-b border-[var(--talos-border)] bg-[var(--talos-active)] px-3 py-2">
                            <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                                <Clock3 class="h-4 w-4 text-[var(--talos-accent)]" />
                                Events
                            </div>
                            <div class="flex items-center gap-2">
                                <Badge tone="neutral">{{ selectedRunEvents.length }} events</Badge>
                                <Button type="button" variant="ghost" size="sm" :disabled="!selectedRunId || selectedRunLoading" @click="refreshSelectedRun">
                                    <Loader2 v-if="selectedRunLoading" class="h-4 w-4 animate-spin" />
                                    <RefreshCw v-else class="h-4 w-4" />
                                    Reload
                                </Button>
                            </div>
                        </div>

                        <div v-if="selectedRunLoading && !selectedRunEvents.length" class="flex items-center gap-2 px-3 py-4 text-sm text-[var(--talos-muted)]">
                            <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                            Loading run events
                        </div>

                        <div v-else-if="!selectedRun" class="px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                            Select a run to load `/api/talos/runs/{id}/events`.
                        </div>

                        <div v-else-if="!selectedRunEvents.length" class="px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                            No events returned for the selected run.
                        </div>

                        <div v-else class="max-h-[360px] divide-y divide-[var(--talos-border)] overflow-y-auto">
                            <button
                                v-for="event in selectedRunEvents"
                                :key="event.id"
                                type="button"
                                class="grid w-full grid-cols-[72px_minmax(0,1fr)_88px] gap-3 px-3 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--talos-accent)]"
                                :class="selectedEventId === event.id && inspectorSelection === 'event' ? 'bg-[var(--talos-panel)]' : 'hover:bg-[var(--talos-active)]'"
                                @click="selectEvent(event)"
                            >
                                <span class="font-mono text-xs font-semibold text-[var(--talos-text)]">#{{ event.sequence }}</span>
                                <span class="min-w-0">
                                    <span class="block truncate text-sm font-semibold text-[var(--talos-text)]">{{ event.event_type }}</span>
                                    <span class="mt-1 block truncate text-xs text-[var(--talos-muted)]">
                                        {{ event.node_id || 'run' }} - {{ eventPayloadCount(event) }} payload keys - {{ formatDate(event.created_at) }}
                                    </span>
                                </span>
                                <span class="flex justify-end">
                                    <Badge :tone="eventSeverityTone(event.severity)">{{ event.severity }}</Badge>
                                </span>
                            </button>
                        </div>
                    </div>

                    <TalosNodeGraph
                        :nodes="nodeSummaries"
                        :selected-node-id="selectedNodeId"
                        :loading="selectedRunLoading"
                        @select-node="selectNode"
                    />
                </section>

                <section class="space-y-4">
                    <TalosNodeInspector
                        :run="selectedRun"
                        :event="selectedEvent"
                        :node="selectedNode"
                        :selection="inspectorSelection"
                        :loading="selectedRunLoading"
                        :error="visibleError"
                    />

                    <TalosRecoveryPanel
                        :run="selectedRun"
                        :event="selectedEvent"
                        :node="selectedNode"
                        :loading="Boolean(selectedRunId && recoveringRunId === selectedRunId)"
                        :error="recoveryError"
                        @recover="submitRecovery"
                    />
                </section>
            </div>

            <TalosTraceReplay
                :run="selectedRun"
                :replay="selectedRunReplay"
                :loading="Boolean(selectedRunId && loadingReplayRunId === selectedRunId)"
                :error="replayError"
                @refresh="refreshSelectedReplay"
            />
        </div>
    </Surface>
</template>

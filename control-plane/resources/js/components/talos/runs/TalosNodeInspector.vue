<script setup lang="ts">
import { computed } from 'vue'
import { Braces, Loader2 } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import type {
    TalosRun,
    TalosRunEvent,
    TalosRunEventSeverity,
    TalosRunNodeStatus,
    TalosRunNodeSummary,
} from '../../../lib/talosTypes'

type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral'
type InspectorSelection = 'run' | 'event' | 'node'

const props = defineProps<{
    run: TalosRun | null
    event: TalosRunEvent | null
    node: TalosRunNodeSummary | null
    selection: InspectorSelection
    loading?: boolean
    error?: string | null
}>()

const heading = computed(() => {
    if (props.selection === 'event' && props.event) {
        return 'Event payload'
    }

    if (props.selection === 'node' && props.node) {
        return 'Node payload'
    }

    if (props.run) {
        return 'Run payload'
    }

    return 'Inspector'
})

const subtitle = computed(() => {
    if (props.selection === 'event' && props.event) {
        return `#${props.event.sequence} ${props.event.event_type}`
    }

    if (props.selection === 'node' && props.node) {
        return props.node.id
    }

    if (props.run) {
        return props.run.id
    }

    return 'Select a run, event, or node'
})

const payload = computed(() => {
    if (props.selection === 'event' && props.event) {
        return props.event.payload
    }

    if (props.selection === 'node' && props.node) {
        return {
            node: {
                id: props.node.id,
                label: props.node.label,
                type: props.node.type,
                status: props.node.status,
                event_count: props.node.event_count,
                last_event_type: props.node.last_event_type,
                last_sequence: props.node.last_sequence,
                first_seen_at: props.node.first_seen_at,
                last_seen_at: props.node.last_seen_at,
            },
            payload: props.node.payload,
        }
    }

    if (props.run) {
        return {
            id: props.run.id,
            status: props.run.status,
            mode: props.run.mode,
            session_id: props.run.session_id,
            message_id: props.run.message_id,
            context_set_id: props.run.context_set_id,
            benchmark_group_id: props.run.benchmark_group_id,
            model_profile_id: props.run.model_profile_id,
            prompt_hash: props.run.prompt_hash,
            context_hash: props.run.context_hash,
            started_at: props.run.started_at,
            finished_at: props.run.finished_at,
            metadata: props.run.metadata,
        }
    }

    return null
})

const payloadJson = computed(() => {
    return payload.value ? JSON.stringify(payload.value, null, 2) : ''
})

function severityTone(severity: TalosRunEventSeverity): BadgeTone {
    if (severity === 'error') {
        return 'danger'
    }

    if (severity === 'warning') {
        return 'warning'
    }

    return 'neutral'
}

function nodeStatusTone(status: TalosRunNodeStatus): BadgeTone {
    if (status === 'SUCCESS' || status === 'VALIDATED') {
        return 'success'
    }

    if (status === 'FAILED') {
        return 'danger'
    }

    if (status === 'RUNNING' || status === 'RETRYING' || status === 'BLOCKED_BY_DEPENDENCY') {
        return 'warning'
    }

    return 'neutral'
}
</script>

<template>
    <aside class="overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)]">
        <div class="border-b border-[var(--talos-border)] bg-[var(--talos-active)] px-3 py-3">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <Braces class="h-4 w-4 text-[var(--talos-accent)]" />
                        Inspector
                    </div>
                    <h4 class="mt-1 truncate text-sm font-semibold text-[var(--talos-text)]">{{ heading }}</h4>
                    <p class="mt-1 truncate font-mono text-[11px] text-[var(--talos-muted)]">{{ subtitle }}</p>
                </div>
                <Badge v-if="selection === 'event' && event" :tone="severityTone(event.severity)">{{ event.severity }}</Badge>
                <Badge v-else-if="selection === 'node' && node" :tone="nodeStatusTone(node.status)">{{ node.status }}</Badge>
                <Badge v-else-if="run" tone="neutral">{{ run.status }}</Badge>
            </div>
        </div>

        <div v-if="loading" class="flex items-center gap-2 px-3 py-4 text-sm text-[var(--talos-muted)]">
            <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
            Loading selected run events
        </div>

        <div v-else-if="error" class="px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
            {{ error }}
        </div>

        <div v-else-if="!payloadJson" class="px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
            Select a run, event, or node to inspect payload data.
        </div>

        <pre v-else class="max-h-[520px] overflow-auto p-3 text-xs leading-5 text-[var(--talos-text)]"><code>{{ payloadJson }}</code></pre>
    </aside>
</template>

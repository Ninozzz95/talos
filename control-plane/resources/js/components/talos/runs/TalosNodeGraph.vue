<script setup lang="ts">
import { computed } from 'vue'
import { GitBranch, Loader2 } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import TalosGuideInfoButton from '../guide/TalosGuideInfoButton.vue'
import { resolveTalosCollectionState } from '../../../lib/talosCollectionState'
import type { TalosRunNodeStatus, TalosRunNodeSummary } from '../../../lib/talosTypes'

type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral'

const props = withDefaults(defineProps<{
    nodes: TalosRunNodeSummary[]
    selectedNodeId: string | null
    loading?: boolean
    error?: string | null
    requested?: boolean
}>(), {
    loading: false,
    error: null,
    requested: true,
})

const nodesState = computed(() => resolveTalosCollectionState({
    itemCount: props.nodes.length,
    loading: props.loading,
    error: props.error,
    requested: props.requested,
}))

const emit = defineEmits<{
    (event: 'select-node', node: TalosRunNodeSummary): void
}>()

function statusTone(status: TalosRunNodeStatus): BadgeTone {
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

function nodeTitle(node: TalosRunNodeSummary) {
    if (node.label) {
        return node.label
    }

    return node.id
}

function payloadString(node: TalosRunNodeSummary, key: string) {
    const value = node.payload[key]

    return typeof value === 'string' && value.trim() ? value : null
}

function blockedReason(node: TalosRunNodeSummary) {
    if (node.status !== 'BLOCKED_BY_DEPENDENCY') {
        return null
    }

    return payloadString(node, 'reason')
        ?? payloadString(node, 'blocked_reason')
        ?? 'One or more parent dependencies failed before this node could run.'
}

function blockedDependency(node: TalosRunNodeSummary) {
    const dependencyNodeId = payloadString(node, 'dependency_node_id')

    if (dependencyNodeId) {
        return dependencyNodeId
    }

    const blockedBy = node.payload.blocked_by

    return Array.isArray(blockedBy)
        ? blockedBy.filter((item): item is string => typeof item === 'string').join(', ')
        : null
}
</script>

<template>
    <section class="overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)]">
        <div class="flex items-center justify-between gap-3 border-b border-[var(--talos-border)] bg-[var(--talos-active)] px-3 py-2">
            <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                <GitBranch class="h-4 w-4 text-[var(--talos-accent)]" />
                Node graph
                <TalosGuideInfoButton guide-id="runtime.dag" compact side="bottom" />
            </div>
            <Badge tone="neutral">{{ nodes.length }} nodes</Badge>
        </div>

        <div v-if="nodesState === 'loading'" role="status" class="flex items-center gap-2 px-3 py-4 text-sm text-[var(--talos-muted)]">
            <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
            Loading nodes from run events
        </div>

        <div v-else-if="nodesState === 'error'" class="px-3 py-4 text-sm leading-6 text-[var(--talos-warning)]">
            {{ error }}
        </div>

        <div v-else-if="nodesState === 'empty'" class="px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
            No node events were returned for this run.
        </div>

        <div v-else-if="nodesState === 'ready'" class="divide-y divide-[var(--talos-border)]">
            <button
                v-for="node in nodes"
                :key="node.id"
                type="button"
                class="grid w-full grid-cols-[minmax(0,1fr)_104px] gap-3 px-3 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--talos-accent)]"
                :class="selectedNodeId === node.id ? 'bg-[var(--talos-panel)]' : 'hover:bg-[var(--talos-active)]'"
                @click="emit('select-node', node)"
            >
                <span class="min-w-0">
                    <span class="block truncate text-sm font-semibold text-[var(--talos-text)]">{{ nodeTitle(node) }}</span>
                    <span class="mt-1 block truncate font-mono text-[11px] text-[var(--talos-muted)]">{{ node.id }}</span>
                    <span class="mt-1 block truncate text-xs text-[var(--talos-muted)]">
                        {{ node.type || 'node' }} - {{ node.event_count }} events - #{{ node.last_sequence }}
                    </span>
                    <span
                        v-if="blockedReason(node)"
                        class="mt-2 block rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-2 py-1 text-xs leading-5 text-[var(--talos-text)]"
                    >
                        <span class="font-semibold text-[var(--talos-warning)]">Blocked by dependency</span>
                        <span v-if="blockedDependency(node)"> {{ blockedDependency(node) }}.</span>
                        <span class="block">{{ blockedReason(node) }}</span>
                    </span>
                </span>
                <span class="flex min-w-0 flex-col items-end gap-2">
                    <Badge :tone="statusTone(node.status)">{{ node.status }}</Badge>
                    <span class="truncate text-[11px] text-[var(--talos-muted)]">{{ node.last_event_type }}</span>
                </span>
            </button>
        </div>
    </section>
</template>

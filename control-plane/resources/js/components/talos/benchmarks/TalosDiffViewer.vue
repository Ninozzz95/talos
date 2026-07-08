<script setup lang="ts">
import { computed } from 'vue'
import Badge from '../../ui/Badge.vue'
import type { TalosBenchmarkResult } from '../../../lib/talosTypes'

const props = defineProps<{
    results: TalosBenchmarkResult[]
}>()

const rows = computed(() => props.results.map((result) => {
    const raw = result.raw_report ?? {}
    const nodeStatuses = raw.node_statuses && typeof raw.node_statuses === 'object' && !Array.isArray(raw.node_statuses)
        ? raw.node_statuses as Record<string, unknown>
        : {}

    return {
        mode: result.mode,
        label: result.label ?? result.mode,
        stateMatch: raw.state_match,
        violations: raw.contract_violation_count ?? 'unknown',
        nodes: Object.entries(nodeStatuses)
            .map(([nodeId, status]) => `${nodeId}:${String(status)}`)
            .join(' | ') || 'no node statuses',
        notes: typeof raw.notes === 'string' ? raw.notes : 'No notes recorded.',
    }
}))
</script>

<template>
    <section class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)]">
        <div class="border-b border-[var(--talos-border)] bg-[var(--talos-active)] px-3 py-2">
            <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Evidence diff</div>
        </div>

        <div v-if="!rows.length" class="px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
            Select a persisted benchmark group to inspect mode differences.
        </div>

        <div v-else class="divide-y divide-[var(--talos-border)]">
            <article v-for="row in rows" :key="row.mode" class="space-y-2 p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="font-mono text-xs font-semibold text-[var(--talos-text)]">{{ row.mode }}</div>
                    <div class="flex flex-wrap gap-2">
                        <Badge :tone="row.stateMatch === true ? 'success' : row.stateMatch === false ? 'danger' : 'neutral'">
                            state {{ row.stateMatch === true ? 'match' : row.stateMatch === false ? 'mismatch' : 'unknown' }}
                        </Badge>
                        <Badge tone="neutral">violations {{ row.violations }}</Badge>
                    </div>
                </div>
                <p class="font-mono text-[11px] leading-5 text-[var(--talos-muted)]">{{ row.nodes }}</p>
                <p class="text-xs leading-5 text-[var(--talos-muted)]">{{ row.notes }}</p>
            </article>
        </div>
    </section>
</template>

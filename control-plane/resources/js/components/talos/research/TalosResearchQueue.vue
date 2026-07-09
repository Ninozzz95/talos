<script setup lang="ts">
import { Clock3 } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import type { TalosResearchReport } from '../../../lib/talosTypes'

defineProps<{
    reports: TalosResearchReport[]
    selectedReportId: string | null
}>()

const emit = defineEmits<{
    select: [report: TalosResearchReport]
}>()

function queueStatus(report: TalosResearchReport) {
    const value = report.metadata?.queue_status

    return typeof value === 'string' && value.trim() ? value : 'history'
}

function statusTone(status: string) {
    if (status === 'succeeded') {
        return 'success'
    }

    if (status === 'blocked') {
        return 'warning'
    }

    if (status === 'failed') {
        return 'danger'
    }

    return 'neutral'
}
</script>

<template>
    <section class="overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)]">
        <div class="flex items-center justify-between gap-3 border-b border-[var(--talos-border)] bg-[var(--talos-active)] px-3 py-2">
            <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                <Clock3 class="h-4 w-4 text-[var(--talos-accent)]" />
                Research queue
            </div>
            <Badge tone="neutral">{{ reports.length }} reports</Badge>
        </div>

        <div v-if="!reports.length" class="px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
            No research reports returned by the research API yet.
        </div>

        <div v-else class="max-h-[260px] divide-y divide-[var(--talos-border)] overflow-y-auto">
            <button
                v-for="report in reports"
                :key="report.id"
                type="button"
                class="grid w-full grid-cols-[minmax(0,1fr)_92px] gap-3 px-3 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--talos-accent)]"
                :class="selectedReportId === report.id ? 'bg-[var(--talos-panel)]' : 'hover:bg-[var(--talos-active)]'"
                @click="emit('select', report)"
            >
                <span class="min-w-0">
                    <span class="block truncate text-sm font-semibold text-[var(--talos-text)]">{{ report.title }}</span>
                    <span class="mt-1 block truncate font-mono text-[11px] text-[var(--talos-muted)]">
                        queue_status {{ queueStatus(report) }} - {{ report.sources_count ?? report.sources?.length ?? 0 }} sources
                    </span>
                </span>
                <span class="flex flex-col items-end gap-2">
                    <Badge :tone="statusTone(report.status)">{{ report.status }}</Badge>
                    <Badge tone="neutral">{{ queueStatus(report) }}</Badge>
                </span>
            </button>
        </div>
    </section>
</template>

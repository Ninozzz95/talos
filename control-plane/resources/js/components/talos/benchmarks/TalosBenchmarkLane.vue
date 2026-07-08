<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2, GitBranch, ShieldAlert } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import TalosMetricCard from './TalosMetricCard.vue'
import type { TalosBenchmarkResult } from '../../../lib/talosTypes'

type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral'

const props = defineProps<{
    result: TalosBenchmarkResult
}>()

const modeLabel = computed(() => {
    if (props.result.label) {
        return props.result.label
    }

    return props.result.mode.replaceAll('_', ' ')
})

const risk = computed(() => props.result.metrics.enterprise_risk_score ?? 'unknown')
const completion = computed(() => props.result.metrics.task_completion ?? 'unknown')
const replayability = computed(() => props.result.metrics.trace_replayability ?? 'unknown')

function riskTone(value: unknown): BadgeTone {
    if (typeof value !== 'number') {
        return 'neutral'
    }

    if (value <= 20) {
        return 'success'
    }

    if (value <= 60) {
        return 'warning'
    }

    return 'danger'
}
</script>

<template>
    <section class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)]">
        <div class="border-b border-[var(--talos-border)] p-3">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <GitBranch class="h-4 w-4 text-[var(--talos-accent)]" />
                        {{ result.mode }}
                    </div>
                    <h4 class="mt-1 truncate text-sm font-semibold text-[var(--talos-text)]">{{ modeLabel }}</h4>
                </div>
                <Badge :tone="riskTone(risk)">risk {{ risk }}</Badge>
            </div>
        </div>

        <div class="grid gap-2 p-3 sm:grid-cols-3 xl:grid-cols-1">
            <TalosMetricCard label="Task completion" :value="completion" suffix="%" />
            <TalosMetricCard label="Enterprise risk" :value="risk" />
            <TalosMetricCard label="Trace replayability" :value="replayability" suffix="%" />
        </div>

        <div class="space-y-2 border-t border-[var(--talos-border)] p-3 text-xs leading-5 text-[var(--talos-muted)]">
            <div class="flex items-center gap-2">
                <CheckCircle2 class="h-4 w-4 text-[var(--talos-success)]" />
                <span>Evaluator {{ result.evaluator_version }}</span>
            </div>
            <div class="flex items-center gap-2">
                <ShieldAlert class="h-4 w-4 text-[var(--talos-warning)]" />
                <span>{{ result.trace_replayable ? 'Replay evidence attached' : 'No replay trace attached' }}</span>
            </div>
        </div>
    </section>
</template>

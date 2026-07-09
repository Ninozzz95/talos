<script setup lang="ts">
import Badge from '../../ui/Badge.vue'
import Button from '../../ui/Button.vue'
import type { TalosModelComparisonLane } from '../../../lib/talosTypes'

const props = defineProps<{
    lane: TalosModelComparisonLane
    revealed: boolean
    canVote: boolean
    voting: boolean
}>()

const emit = defineEmits<{
    vote: [laneId: string]
}>()

function statusTone(status: string) {
    if (status === 'completed') {
        return 'success'
    }

    if (status === 'failed') {
        return 'warning'
    }

    return 'neutral'
}
</script>

<template>
    <article :data-testid="`talos-comparison-lane-${lane.display_alias.toLowerCase().replace(/\s+/g, '-')}`" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
        <div class="flex items-start justify-between gap-3">
            <div>
                <div class="flex items-center gap-2">
                    <h4 class="text-sm font-semibold text-[var(--talos-text)]">{{ lane.display_alias }}</h4>
                    <Badge :tone="statusTone(lane.status)">{{ lane.status }}</Badge>
                </div>
                <p v-if="revealed && lane.model_profile" class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                    {{ lane.model_profile.display_name }} · {{ lane.model_profile.provider }}/{{ lane.model_profile.model }}
                </p>
                <p v-else class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                    Identity hidden until vote.
                </p>
            </div>
            <Button v-if="canVote" type="button" size="sm" :disabled="voting || lane.status !== 'completed'" :aria-label="`Vote ${lane.display_alias}`" @click="emit('vote', lane.id)">
                Vote {{ lane.display_alias }}
            </Button>
        </div>

        <div class="mt-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
            <span v-if="lane.response_text">{{ lane.response_text }}</span>
            <span v-else class="text-[var(--talos-muted)]">{{ lane.error_message || 'No response text was produced.' }}</span>
        </div>

        <div class="mt-3 grid gap-2 text-[11px] text-[var(--talos-muted)] sm:grid-cols-3">
            <div>Run {{ revealed && lane.run_id ? lane.run_id.slice(0, 12) : 'hidden' }}</div>
            <div>Latency {{ lane.latency_ms ?? 'n/a' }}ms</div>
            <div>Cost {{ lane.cost ?? 'unknown' }}</div>
        </div>
    </article>
</template>

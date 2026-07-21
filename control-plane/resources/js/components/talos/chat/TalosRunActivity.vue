<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2, CircleAlert, Clock3, Loader2, ShieldX } from '@lucide/vue'
import type { TalosMessage } from '../../../lib/talosTypes'
import { talosPersistedRunActivity, type TalosRunActivityStatus } from '../../../lib/talosMessageState'
import Badge from '../../ui/Badge.vue'

const props = withDefaults(defineProps<{
    message: TalosMessage
    developmentMode?: boolean
}>(), {
    developmentMode: false,
})
// Run metadata (status, provider/model, run id) is a development-only affordance;
// the server-owned developmentMode flag gates it out of production entirely.
const activity = computed(() => (props.developmentMode ? talosPersistedRunActivity(props.message) : null))

const labels: Record<TalosRunActivityStatus, string> = {
    queued: 'Run queued',
    running: 'Run in progress',
    succeeded: 'Run succeeded',
    failed: 'Run failed',
    denied: 'Run denied',
}

const tone = computed(() => {
    if (activity.value?.status === 'succeeded') return 'success'
    if (activity.value?.status === 'failed') return 'danger'
    if (activity.value?.status === 'denied') return 'warning'
    return 'neutral'
})

const providerLabel = computed(() => {
    if (!activity.value?.provider && !activity.value?.model) return null
    return [activity.value.provider, activity.value.model].filter(Boolean).join(' / ')
})
</script>

<template>
    <div
        v-if="activity"
        data-talos-run-activity
        :data-run-status="activity.status"
        :role="activity.status === 'failed' || activity.status === 'denied' ? 'alert' : 'status'"
        :aria-live="activity.status === 'failed' || activity.status === 'denied' ? 'assertive' : 'polite'"
        class="mt-3 flex min-w-0 flex-wrap items-center gap-2 border-t border-[var(--talos-border)] pt-2 text-[11px] text-[var(--talos-muted)]"
    >
        <Loader2 v-if="activity.status === 'running'" class="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--talos-accent)]" />
        <Clock3 v-else-if="activity.status === 'queued'" class="h-3.5 w-3.5 shrink-0 text-[var(--talos-accent)]" />
        <CheckCircle2 v-else-if="activity.status === 'succeeded'" class="h-3.5 w-3.5 shrink-0 text-[var(--talos-success)]" />
        <ShieldX v-else-if="activity.status === 'denied'" class="h-3.5 w-3.5 shrink-0 text-[var(--talos-warning)]" />
        <CircleAlert v-else class="h-3.5 w-3.5 shrink-0 text-[var(--talos-danger)]" />
        <Badge :tone="tone">{{ labels[activity.status] }}</Badge>
        <span v-if="providerLabel" class="min-w-0 truncate">{{ providerLabel }}</span>
        <span class="font-mono">{{ activity.id }}</span>
    </div>
</template>

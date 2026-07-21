<script setup lang="ts">
import { computed } from 'vue'
import { Route } from '@lucide/vue'
import type { TalosMessage } from '../../../lib/talosTypes'
import { talosPersistedRunActivity } from '../../../lib/talosMessageState'

const props = defineProps<{ message: TalosMessage }>()

const activity = computed(() => talosPersistedRunActivity(props.message))
// Only replies whose turn resolved through an "Auto" routing profile get the
// receipt; it reads the already-surfaced resolved provider/model.
const routed = computed(() => Boolean(activity.value?.routingProfileId))
const resolvedLabel = computed(() => {
    if (!activity.value) return ''
    return [activity.value.provider, activity.value.model].filter(Boolean).join(' / ')
})
</script>

<template>
    <div
        v-if="routed && resolvedLabel"
        data-testid="talos-auto-receipt"
        class="mt-2 inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-2 py-1 text-[11px] text-[var(--talos-muted)]"
    >
        <Route class="h-3.5 w-3.5 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
        <span class="font-semibold text-[var(--talos-text)]">Auto</span>
        <span aria-hidden="true">→</span>
        <span class="min-w-0 truncate font-mono">{{ resolvedLabel }}</span>
    </div>
</template>

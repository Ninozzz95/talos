<script setup lang="ts">
import { computed } from 'vue'
import { Check, CircleAlert, Loader2 } from '@lucide/vue'
import type { TalosBrowserActivity as TalosBrowserActivityItem } from '../../../lib/talosTypes'

const props = defineProps<{
    activities: TalosBrowserActivityItem[]
}>()

const screenshotEvidence = computed(() => {
    const artifacts = new Map<string, TalosBrowserActivityItem>()
    for (const activity of props.activities) {
        if (activity.operation !== 'screenshot' || activity.status !== 'succeeded') continue
        for (const artifactId of activity.artifact_ids) artifacts.set(artifactId, activity)
    }

    return [...artifacts.entries()].slice(-2).map(([artifactId, activity]) => ({ artifactId, activity }))
})

function artifactPreviewUrl(artifactId: string) {
    return `/api/talos/browser/artifacts/${encodeURIComponent(artifactId)}/preview`
}
</script>

<template>
    <div v-if="activities.length" data-testid="talos-browser-activity" class="mb-4 min-w-0 overflow-hidden rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-xs text-[var(--talos-text)]">
        <div class="mb-1 font-semibold text-[var(--talos-warning)]">Browse activity</div>
        <div v-for="activity in activities.slice(-4)" :key="activity.id" class="flex min-w-0 items-center gap-2 py-1">
            <Loader2 v-if="activity.status === 'running' || activity.status === 'queued'" class="h-3.5 w-3.5 shrink-0 animate-spin" />
            <CircleAlert v-else-if="activity.status === 'failed' || activity.status === 'denied'" class="h-3.5 w-3.5 shrink-0 text-[var(--talos-warning)]" />
            <Check v-else class="h-3.5 w-3.5 shrink-0 text-[var(--talos-success)]" />
            <span class="min-w-0 break-words">{{ activity.label }}</span>
        </div>
        <div
            v-if="screenshotEvidence.length"
            class="mt-2 grid min-w-0 gap-2"
            :class="screenshotEvidence.length === 1 ? 'grid-cols-1' : 'sm:grid-cols-2'"
        >
            <a
                v-for="evidence in screenshotEvidence"
                :key="evidence.artifactId"
                :href="artifactPreviewUrl(evidence.artifactId)"
                target="_blank"
                rel="noopener noreferrer"
                class="block min-w-0 overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                title="Open browser screenshot evidence"
            >
                <img
                    :src="artifactPreviewUrl(evidence.artifactId)"
                    alt="Browser screenshot evidence"
                    class="aspect-[8/5] w-full bg-[var(--talos-panel-soft)] object-contain"
                    loading="lazy"
                >
            </a>
        </div>
    </div>
</template>

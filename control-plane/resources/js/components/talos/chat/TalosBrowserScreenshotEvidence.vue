<script setup lang="ts">
import { computed } from 'vue'
import type { TalosBrowserActivity } from '../../../lib/talosTypes'

const props = withDefaults(defineProps<{
    activities: TalosBrowserActivity[]
    talosSessionId: string | null
    excludedArtifactIds?: string[]
    loadingStrategy?: 'eager' | 'lazy'
}>(), {
    excludedArtifactIds: () => [],
    loadingStrategy: 'lazy',
})

const screenshotEvidence = computed(() => {
    if (!props.talosSessionId) return []

    const excluded = new Set(props.excludedArtifactIds)
    const artifacts = new Map<string, TalosBrowserActivity>()
    for (const activity of props.activities) {
        if (activity.operation !== 'screenshot' || activity.status !== 'succeeded') continue
        for (const artifactId of activity.artifact_ids) {
            if (!excluded.has(artifactId)) artifacts.set(artifactId, activity)
        }
    }

    return [...artifacts.entries()].slice(-2).map(([artifactId, activity]) => ({ artifactId, activity }))
})

function artifactPreviewUrl(artifactId: string) {
    const query = new URLSearchParams({ talos_session_id: props.talosSessionId ?? '' }).toString()
    return `/api/talos/browser/artifacts/${encodeURIComponent(artifactId)}/preview?${query}`
}
</script>

<template>
    <figure v-if="screenshotEvidence.length" data-testid="talos-browser-screenshot-evidence" class="mt-3 min-w-0 max-w-full overflow-hidden">
        <figcaption class="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase text-[var(--talos-muted)]">
            <span>Verified browser capture</span>
            <span>{{ screenshotEvidence.length }} artifact{{ screenshotEvidence.length === 1 ? '' : 's' }}</span>
        </figcaption>
        <div class="grid min-w-0 gap-2" :class="screenshotEvidence.length === 1 ? 'grid-cols-1' : 'sm:grid-cols-2'">
            <a
                v-for="evidence in screenshotEvidence"
                :key="evidence.artifactId"
                :href="artifactPreviewUrl(evidence.artifactId)"
                target="_blank"
                rel="noopener noreferrer"
                class="block min-w-0 overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                title="Open verified browser screenshot"
            >
                <img
                    :src="artifactPreviewUrl(evidence.artifactId)"
                    :data-browser-artifact-id="evidence.artifactId"
                    alt="Browser screenshot evidence"
                    class="aspect-[8/5] w-full bg-[var(--talos-panel-soft)] object-contain"
                    :loading="loadingStrategy"
                >
            </a>
        </div>
    </figure>
</template>

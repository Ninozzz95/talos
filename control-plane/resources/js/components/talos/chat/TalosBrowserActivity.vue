<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, ChevronDown, CircleAlert, Loader2, ScanSearch } from '@lucide/vue'
import TalosBrowserScreenshotEvidence from './TalosBrowserScreenshotEvidence.vue'
import type { TalosBrowserActivity as TalosBrowserActivityItem, TalosBrowserSnapshotPreview } from '../../../lib/talosTypes'

const props = withDefaults(defineProps<{
    activities: TalosBrowserActivityItem[]
    snapshot: TalosBrowserSnapshotPreview | null
    talosSessionId: string | null
    excludedScreenshotArtifactIds?: string[]
}>(), {
    excludedScreenshotArtifactIds: () => [],
})

const snapshotOpen = ref(false)

const visibleSnapshotNodes = computed(() => props.snapshot?.snapshot.nodes.slice(0, 100) ?? [])
</script>

<template>
    <div v-if="activities.length || snapshot" data-testid="talos-browser-activity" class="mb-4 min-w-0 overflow-hidden rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-xs text-[var(--talos-text)]">
        <div class="mb-1 font-semibold text-[var(--talos-warning)]">Browse activity</div>
        <div v-for="activity in activities.slice(-4)" :key="activity.id" class="flex min-w-0 items-center gap-2 py-1">
            <Loader2 v-if="activity.status === 'running' || activity.status === 'queued'" class="h-3.5 w-3.5 shrink-0 animate-spin" />
            <CircleAlert v-else-if="activity.status === 'failed' || activity.status === 'denied'" class="h-3.5 w-3.5 shrink-0 text-[var(--talos-warning)]" />
            <Check v-else class="h-3.5 w-3.5 shrink-0 text-[var(--talos-success)]" />
            <span class="min-w-0 break-words">{{ activity.label }}</span>
        </div>
        <TalosBrowserScreenshotEvidence
            :activities="activities"
            :talos-session-id="talosSessionId"
            :excluded-artifact-ids="excludedScreenshotArtifactIds"
        />
        <div v-if="snapshot" class="mt-2 border-t border-[var(--talos-warning-border)] pt-2">
            <button
                type="button"
                class="flex w-full items-center gap-2 rounded px-1 py-1.5 text-left text-xs font-medium text-[var(--talos-text)] transition hover:bg-[var(--talos-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                :aria-expanded="snapshotOpen"
                aria-label="View captured page structure"
                @click="snapshotOpen = !snapshotOpen"
            >
                <ScanSearch class="h-3.5 w-3.5 shrink-0 text-[var(--talos-accent)]" />
                <span class="min-w-0 flex-1 truncate">Captured page structure</span>
                <span class="text-[10px] text-[var(--talos-muted)]">{{ snapshot.snapshot.nodes.length }} nodes</span>
                <ChevronDown class="h-3.5 w-3.5 shrink-0 transition-transform" :class="snapshotOpen ? 'rotate-180' : ''" />
            </button>
            <section
                v-if="snapshotOpen"
                data-testid="talos-browser-snapshot-viewer"
                class="mt-2 min-w-0 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3"
                aria-label="Captured browser page structure"
            >
                <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                        <div class="break-words font-semibold text-[var(--talos-text)] [overflow-wrap:anywhere]">{{ snapshot.snapshot.title || 'Captured page' }}</div>
                        <div v-if="snapshot.snapshot.url" class="mt-1 break-all text-[11px] text-[var(--talos-muted)]">{{ snapshot.snapshot.url }}</div>
                    </div>
                    <span class="rounded border border-[var(--talos-warning-border)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--talos-warning)]">Untrusted</span>
                </div>
                <div v-if="snapshot.snapshot.text_digest" class="mt-2 break-all font-mono text-[10px] text-[var(--talos-muted)]">{{ snapshot.snapshot.text_digest }}</div>
                <div class="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
                    <div
                        v-for="node in visibleSnapshotNodes"
                        :key="node.ref"
                        class="grid min-w-0 grid-cols-[minmax(72px,auto)_1fr] gap-2 rounded border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-2 py-1.5"
                    >
                        <span class="truncate font-mono text-[10px] uppercase text-[var(--talos-accent)]">{{ node.role }}</span>
                        <span class="min-w-0 break-words text-[11px] text-[var(--talos-text)] [overflow-wrap:anywhere]">{{ node.name || '(unnamed)' }}</span>
                    </div>
                </div>
                <p v-if="snapshot.snapshot.truncated || snapshot.snapshot.nodes.length > visibleSnapshotNodes.length" class="mt-2 text-[10px] text-[var(--talos-muted)]">Preview truncated to the first {{ visibleSnapshotNodes.length }} nodes.</p>
            </section>
        </div>
    </div>
</template>

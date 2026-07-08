<script setup lang="ts">
import { X } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import type { TalosArtifactPreview } from '../../../lib/talosTypes'

defineProps<{
    preview: TalosArtifactPreview | null
}>()

defineEmits<{
    close: []
}>()
</script>

<template>
    <div v-if="preview" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)]">
        <div class="flex items-start justify-between gap-3 border-b border-[var(--talos-border)] p-3">
            <div class="min-w-0">
                <div class="text-sm font-semibold text-[var(--talos-text)]">Artifact preview</div>
                <div class="mt-1 truncate font-mono text-[11px] text-[var(--talos-muted)]">{{ preview.artifact.id }}</div>
            </div>
            <Button type="button" variant="ghost" size="sm" @click="$emit('close')">
                <X class="h-4 w-4" />
            </Button>
        </div>

        <div class="space-y-3 p-3">
            <div class="flex flex-wrap gap-2">
                <Badge :tone="preview.preview_available ? 'success' : 'warning'">
                    {{ preview.preview_available ? 'preview_available' : 'preview unavailable' }}
                </Badge>
                <Badge tone="neutral">{{ preview.preview_type ?? preview.fallback ?? 'download' }}</Badge>
            </div>

            <div v-if="preview.preview_available && preview.report" class="space-y-3">
                <div>
                    <div class="text-sm font-semibold text-[var(--talos-text)]">{{ preview.report.title }}</div>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ preview.report.summary ?? preview.report.query }}</p>
                </div>
                <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
                    <div class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Claims</div>
                    <div class="mt-2 space-y-2">
                        <div v-for="claim in preview.report.claims ?? []" :key="claim.id" class="text-xs leading-5 text-[var(--talos-text)]">
                            {{ claim.text }}
                        </div>
                    </div>
                </div>
            </div>

            <div v-else class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-sm leading-6 text-[var(--talos-muted)]">
                Preview fallback is `download`; TALOS does not dereference arbitrary artifact URIs in the browser.
            </div>
        </div>
    </div>
</template>

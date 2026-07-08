<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, Boxes, Eye, Loader2, RefreshCw } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import Surface from '../../ui/Surface.vue'
import TalosArtifactPreview from './TalosArtifactPreview.vue'
import { useTalosDocuments } from '../../../composables/useTalosDocuments'
import type { TalosArtifactPreview as TalosArtifactPreviewType, TalosRunArtifact } from '../../../lib/talosTypes'

const {
    artifacts,
    loadingArtifacts,
    previewingArtifactId,
    artifactError,
    loadArtifacts,
    previewArtifact,
} = useTalosDocuments()

const selectedPreview = ref<TalosArtifactPreviewType | null>(null)
const actionError = ref<string | null>(null)
const visibleError = computed(() => actionError.value || artifactError.value)

async function refreshArtifacts() {
    actionError.value = null

    try {
        await loadArtifacts()
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not refresh artifacts.'
    }
}

async function openPreview(artifact: TalosRunArtifact) {
    actionError.value = null

    try {
        selectedPreview.value = await previewArtifact(artifact.id)
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not preview this artifact.'
    }
}

function shortHash(value: string | null | undefined) {
    if (!value) {
        return 'unknown'
    }

    return value.length > 12 ? value.slice(0, 12) : value
}

onMounted(() => {
    void refreshArtifacts()
})
</script>

<template>
    <Surface>
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <Boxes class="h-4 w-4 text-[var(--talos-accent)]" />
                        Artifact gallery
                    </div>
                    <h3 class="mt-1 text-base font-semibold text-[var(--talos-text)]">Evidence artifacts</h3>
                </div>
                <Button type="button" variant="ghost" size="sm" :disabled="loadingArtifacts" @click="refreshArtifacts">
                    <Loader2 v-if="loadingArtifacts" class="h-4 w-4 animate-spin" />
                    <RefreshCw v-else class="h-4 w-4" />
                    Sync
                </Button>
            </div>
        </div>

        <div class="space-y-4 p-4">
            <div v-if="visibleError" class="flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
                <AlertCircle class="mt-1 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                <span>{{ visibleError }}</span>
            </div>

            <div v-if="!artifacts.length && !loadingArtifacts" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                No artifacts returned by `/api/talos/artifacts`.
            </div>

            <article
                v-for="artifact in artifacts"
                :key="artifact.id"
                class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3"
            >
                <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ artifact.artifact_type }}</div>
                        <div class="mt-1 truncate font-mono text-[11px] text-[var(--talos-muted)]">{{ artifact.uri }}</div>
                        <div class="mt-2 flex flex-wrap gap-2">
                            <Badge tone="neutral">{{ artifact.mime_type ?? 'mime unknown' }}</Badge>
                            <Badge tone="neutral">run {{ shortHash(artifact.run?.id ?? artifact.run_id) }}</Badge>
                            <Badge tone="neutral">prompt {{ shortHash(artifact.run?.prompt_hash) }}</Badge>
                        </div>
                    </div>
                    <Button type="button" variant="secondary" size="sm" :disabled="previewingArtifactId === artifact.id" @click="openPreview(artifact)">
                        <Loader2 v-if="previewingArtifactId === artifact.id" class="h-4 w-4 animate-spin" />
                        <Eye v-else class="h-4 w-4" />
                        Preview
                    </Button>
                </div>
            </article>

            <TalosArtifactPreview :preview="selectedPreview" @close="selectedPreview = null" />
        </div>
    </Surface>
</template>

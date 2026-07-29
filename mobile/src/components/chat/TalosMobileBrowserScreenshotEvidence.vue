<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TalosMobileBrowserActivityView } from '@/components/chat/mobileChatTypes'
import type { TalosMobileBrowserEvidenceArtifact } from '@/lib/browser/browserContracts'
import TalosMobileBrowserInteractiveFrame from '@/components/chat/TalosMobileBrowserInteractiveFrame.vue'

const props = withDefaults(defineProps<{
    activities: readonly TalosMobileBrowserActivityView[]
    interactionAvailable?: boolean
}>(), {
    interactionAvailable: false,
})

const emit = defineEmits<{
    retry: [artifactId: string]
    openLive: [url: string]
}>()

const frame = ref<InstanceType<typeof TalosMobileBrowserInteractiveFrame> | null>(null)
const artifacts = computed(() => {
    const unique = new Map<string, TalosMobileBrowserEvidenceArtifact>()
    for (const activity of props.activities) {
        for (const artifact of activity.evidence?.artifacts ?? []) {
            if (artifact.type !== 'screenshot' || !artifact.media_type.startsWith('image/') || !artifact.preview_uri) continue
            unique.set(artifact.id, artifact)
        }
    }
    return [...unique.values()].slice(-8)
})
const retryArtifactId = computed(() => {
    for (const activity of [...props.activities].reverse()) {
        const retry = activity.evidence?.retry
        if (retry?.status === 'available' && retry.current_artifact_id) return retry.current_artifact_id
    }
    return null
})
</script>

<template>
    <figure v-if="artifacts.length" class="mt-3 min-w-0 max-w-full overflow-hidden" data-testid="talos-mobile-browser-screenshot-evidence">
        <figcaption class="mb-2 flex items-center justify-between gap-3 text-3xs font-semibold uppercase text-[var(--talos-muted)]">
            <span>{{ $t('browser.integrityVerifiedCapture') }}</span>
            <span>{{ artifacts.length === 1
                ? $t('browser.captureCountOne')
                : $t('browser.captureCountMany', { count: artifacts.length }) }}</span>
        </figcaption>
        <div class="grid min-w-0 gap-2" :class="artifacts.length === 1 ? 'grid-cols-1' : 'sm:grid-cols-2'">
            <button
                v-for="(artifact, index) in artifacts.slice(-2)"
                :key="artifact.id"
                type="button"
                :data-testid="`browser-evidence-open-${artifact.id}`"
                class="group relative block min-w-0 max-w-full overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                :aria-label="$t('browser.inspectCapture', { current: index + 1, total: artifacts.length })"
                @click="frame?.openArtifact(artifact.id)"
            >
                <img
                    :src="artifact.preview_uri ?? undefined"
                    :data-browser-artifact-id="artifact.id"
                    :alt="$t('browser.screenshotPosition', { current: index + 1, total: artifacts.length })"
                    class="aspect-[8/5] w-full max-w-full bg-[var(--talos-panel-soft)] object-contain"
                    loading="lazy"
                >
                <span class="absolute bottom-2 right-2 rounded border border-[var(--talos-border)] bg-[var(--talos-background)]/90 px-2 py-1 text-3xs font-semibold">{{ $t('browser.inspect') }}</span>
            </button>
        </div>
    </figure>

    <TalosMobileBrowserInteractiveFrame
        ref="frame"
        :artifacts="artifacts"
        :interaction-available="interactionAvailable"
        :retry-artifact-id="retryArtifactId"
        @retry="emit('retry', $event)"
        @open-live="emit('openLive', $event)"
    />
</template>

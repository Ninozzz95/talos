<script setup lang="ts">
import { computed, ref } from 'vue'
import TalosBrowserInteractiveFrame, {
    type TalosBrowserInteractiveFrameHandle,
} from './TalosBrowserInteractiveFrame.vue'
import type {
    TalosBrowserActivity,
    TalosBrowserHmiChallenge,
    TalosBrowserPointerFrame,
    TalosBrowserSession,
    TalosMobileWindowPresentation,
} from '../../../lib/talosTypes'

const props = withDefaults(defineProps<{
    activities: TalosBrowserActivity[]
    talosSessionId: string | null
    activeBrowserSession?: TalosBrowserSession | null
    currentFrameActivity?: TalosBrowserActivity | null
    interactionPending?: boolean
    interactionLocked?: boolean
    interactionError?: string | null
    pendingInteractionApproval?: TalosBrowserHmiChallenge | null
    excludedArtifactIds?: string[]
    loadingStrategy?: 'eager' | 'lazy'
    mobile?: boolean
    mobileWindowPresentation?: TalosMobileWindowPresentation
}>(), {
    activeBrowserSession: null,
    currentFrameActivity: null,
    interactionPending: false,
    interactionLocked: false,
    interactionError: null,
    pendingInteractionApproval: null,
    excludedArtifactIds: () => [],
    loadingStrategy: 'lazy',
    mobile: false,
    mobileWindowPresentation: 'drawer',
})

const emit = defineEmits<{
    interact: [frame: TalosBrowserPointerFrame]
    confirm: [decision: 'approve' | 'reject']
}>()

const interactiveFrame = ref<TalosBrowserInteractiveFrameHandle | null>(null)
const screenshotEvidence = computed(() => {
    if (!props.talosSessionId) return []

    const excluded = new Set(props.excludedArtifactIds)
    const evidence = new Map<string, TalosBrowserActivity>()
    for (const activity of props.activities) {
        if (activity.operation !== 'screenshot' || activity.status !== 'succeeded') continue
        for (const artifactId of activity.artifact_ids) {
            if (!excluded.has(artifactId)) evidence.set(artifactId, activity)
        }
    }

    return [...evidence.entries()].slice(-8).map(([artifactId, activity]) => ({ artifactId, activity }))
})
const artifactIds = computed(() => screenshotEvidence.value.map((evidence) => evidence.artifactId))

function artifactPreviewUrl(artifactId: string) {
    const query = new URLSearchParams({ talos_session_id: props.talosSessionId ?? '' }).toString()
    return `/api/talos/browser/artifacts/${encodeURIComponent(artifactId)}/preview?${query}`
}

function openArtifact(artifactId: string) {
    return interactiveFrame.value?.openArtifact(artifactId)
}
</script>

<template>
    <figure v-if="screenshotEvidence.length" data-testid="talos-browser-screenshot-evidence" class="mt-3 min-w-0 max-w-full overflow-hidden">
        <figcaption class="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase text-[var(--talos-muted)]">
            <span>Integrity-verified capture</span>
            <span>{{ screenshotEvidence.length }} artifact{{ screenshotEvidence.length === 1 ? '' : 's' }}</span>
        </figcaption>
        <div class="grid min-w-0 gap-2" :class="screenshotEvidence.length === 1 ? 'grid-cols-1' : 'sm:grid-cols-2'">
            <button
                v-for="evidence in screenshotEvidence.slice(-2)"
                :key="evidence.artifactId"
                type="button"
                :data-testid="`browser-evidence-open-${evidence.artifactId}`"
                class="group relative block min-w-0 overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                :aria-label="`Inspect browser capture ${screenshotEvidence.findIndex((item) => item.artifactId === evidence.artifactId) + 1} of ${screenshotEvidence.length}`"
                @click="openArtifact(evidence.artifactId)"
            >
                <img
                    :src="artifactPreviewUrl(evidence.artifactId)"
                    :data-browser-artifact-id="evidence.artifactId"
                    :alt="`Browser screenshot ${screenshotEvidence.findIndex((item) => item.artifactId === evidence.artifactId) + 1} of ${screenshotEvidence.length}`"
                    class="aspect-[8/5] w-full bg-[var(--talos-panel-soft)] object-contain transition-transform duration-200 group-hover:scale-[1.01]"
                    :loading="loadingStrategy"
                >
                <span class="absolute bottom-2 right-2 rounded border border-[var(--talos-border)] bg-[var(--talos-background)]/90 px-2 py-1 text-[10px] font-semibold text-[var(--talos-text)]">Inspect</span>
            </button>
        </div>
    </figure>

    <TalosBrowserInteractiveFrame
        ref="interactiveFrame"
        :artifact-ids="artifactIds"
        :talos-session-id="talosSessionId"
        :active-browser-session="activeBrowserSession"
        :current-frame-activity="currentFrameActivity"
        :interaction-pending="interactionPending"
        :interaction-locked="interactionLocked"
        :interaction-error="interactionError"
        :pending-interaction-approval="pendingInteractionApproval"
        :mobile="mobile"
        :mobile-window-presentation="mobileWindowPresentation"
        @interact="emit('interact', $event)"
        @confirm="emit('confirm', $event)"
    />
</template>

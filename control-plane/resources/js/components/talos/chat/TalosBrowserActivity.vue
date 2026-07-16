<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import { Check, ChevronDown, CircleAlert, Loader2, ScanSearch, X } from '@lucide/vue'
import { Button } from '../../ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../ui/collapsible'
import TalosToolApprovalCard from './TalosToolApprovalCard.vue'
import type {
    TalosBrowserActivity as TalosBrowserActivityItem,
    TalosBrowserHmiChallenge,
    TalosBrowserPointerFrame,
    TalosBrowserSession,
    TalosBrowserSnapshotPreview,
    TalosBrowserTask,
    TalosMobileWindowPresentation,
    TalosPendingToolApproval,
} from '../../../lib/talosTypes'

const TalosBrowserScreenshotEvidence = defineAsyncComponent(
    () => import('./TalosBrowserScreenshotEvidence.vue'),
)

const props = withDefaults(defineProps<{
    activities: TalosBrowserActivityItem[]
    snapshot: TalosBrowserSnapshotPreview | null
    talosSessionId: string | null
    activeBrowserSession?: TalosBrowserSession | null
    interactionPending?: boolean
    interactionLocked?: boolean
    interactionError?: string | null
    pendingInteractionApproval?: TalosBrowserHmiChallenge | null
    devBrowserEvidence?: boolean
    excludedScreenshotArtifactIds?: string[]
    pendingToolApprovals?: TalosPendingToolApproval[]
    decidingToolApprovalIds?: string[]
    browserTask?: TalosBrowserTask | null
    browserTaskBusy?: boolean
    browserTaskError?: string | null
    browserTaskCommandPending?: boolean
    embedded?: boolean
    mobile?: boolean
    mobileWindowPresentation?: TalosMobileWindowPresentation
}>(), {
    activeBrowserSession: null,
    interactionPending: false,
    interactionLocked: false,
    interactionError: null,
    pendingInteractionApproval: null,
    devBrowserEvidence: false,
    excludedScreenshotArtifactIds: () => [],
    pendingToolApprovals: () => [],
    decidingToolApprovalIds: () => [],
    browserTask: null,
    browserTaskBusy: false,
    browserTaskError: null,
    browserTaskCommandPending: false,
    embedded: false,
    mobile: false,
    mobileWindowPresentation: 'drawer',
})

const emit = defineEmits<{
    interact: [frame: TalosBrowserPointerFrame]
    confirm: [decision: 'approve' | 'reject']
    decideToolApproval: [approval: TalosPendingToolApproval, decision: 'approve' | 'reject']
    cancelTask: [taskId: string]
}>()

const rawEvidenceOpen = ref(false)
const rawSnapshot = computed(() => props.devBrowserEvidence && props.snapshot?.preview_available === true && props.snapshot.snapshot
    ? props.snapshot.snapshot
    : null)
const visibleSnapshotNodes = computed(() => rawSnapshot.value?.nodes.slice(0, 100) ?? [])
const hasScreenshotEvidence = computed(() => Boolean(props.talosSessionId) && props.activities.some((activity) => {
    if (activity.operation !== 'screenshot' || activity.status !== 'succeeded') return false
    const excluded = new Set(props.excludedScreenshotArtifactIds)
    return activity.artifact_ids.some((artifactId) => !excluded.has(artifactId))
}))
const hasRawEvidence = computed(() => props.devBrowserEvidence && (props.activities.length > 0 || Boolean(rawSnapshot.value)))
const operationLabels: Record<string, string> = {
    navigate: 'Page navigation',
    screenshot: 'Screenshot capture',
    snapshot: 'Page structure capture',
    read: 'Page read',
    session_start: 'Browser session',
}
const statusLabels: Record<string, string> = {
    queued: 'queued',
    running: 'running',
    succeeded: 'succeeded',
    failed: 'failed',
    denied: 'denied',
}
const sanitizedActivities = computed(() => props.activities.slice(-4).map((activity) => ({
    id: activity.id,
    status: activity.status,
    label: `${operationLabels[activity.operation] ?? 'Browser operation'} ${statusLabels[activity.status] ?? 'updated'}`,
})))
const showSanitizedStatus = computed(() => !props.devBrowserEvidence && sanitizedActivities.value.length > 0)
const terminalTaskStatuses = new Set(['completed', 'failed', 'cancelled'])
const taskLabels: Record<TalosBrowserTask['status'], string> = {
    created: 'Preparing browser task',
    planning: 'Planning browser task',
    ready: 'Browser task ready',
    running: 'Browsing in progress',
    waiting_user: 'Browser task is waiting for your input',
    recovering: 'Recovering browser task',
    completed: 'Browser task completed',
    failed: 'Browser task stopped because it could not continue',
    cancelled: 'Browser task cancelled',
}
const taskLabel = computed(() => props.browserTask ? taskLabels[props.browserTask.status] : null)
const taskIsActive = computed(() => Boolean(props.browserTask && !terminalTaskStatuses.has(props.browserTask.status)))
const taskIsProgressing = computed(() => Boolean(props.browserTask && ['created', 'planning', 'ready', 'running', 'recovering'].includes(props.browserTask.status)))
const showActivity = computed(() => Boolean(props.browserTask)
    || Boolean(props.browserTaskError)
    || props.pendingToolApprovals.length > 0
    || hasScreenshotEvidence.value
    || hasRawEvidence.value
    || showSanitizedStatus.value)
</script>

<template>
    <div
        v-if="showActivity"
        data-testid="talos-browser-activity"
        :data-presentation="embedded ? 'embedded' : 'standalone'"
        class="min-w-0 overflow-hidden text-xs text-[var(--talos-text)]"
        :class="embedded
            ? 'py-1'
            : 'mb-4 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2'"
    >
        <div v-if="browserTask && taskLabel" class="flex min-w-0 items-center gap-2 py-1">
            <div
                data-testid="talos-browser-task-status"
                role="status"
                aria-live="polite"
                aria-atomic="true"
                class="flex min-w-0 flex-1 items-center gap-2"
            >
                <Loader2 v-if="taskIsProgressing" class="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--talos-accent)]" aria-hidden="true" />
                <CircleAlert v-else-if="browserTask.status === 'failed'" class="h-3.5 w-3.5 shrink-0 text-[var(--talos-warning)]" aria-hidden="true" />
                <X v-else-if="browserTask.status === 'cancelled'" class="h-3.5 w-3.5 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                <Check v-else class="h-3.5 w-3.5 shrink-0 text-[var(--talos-success)]" aria-hidden="true" />
                <span class="min-w-0 flex-1 break-words font-medium">{{ taskLabel }}</span>
            </div>
            <Button
                v-if="taskIsActive"
                type="button"
                variant="outline"
                size="sm"
                data-testid="talos-browser-task-cancel"
                class="h-7 shrink-0 border-[var(--talos-border-strong)] bg-transparent px-2.5 text-xs text-[var(--talos-text)] hover:bg-[var(--talos-panel-soft)]"
                :disabled="browserTaskCommandPending"
                @click="emit('cancelTask', browserTask.id)"
            >
                <Loader2 v-if="browserTaskBusy" class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                <X v-else class="h-3.5 w-3.5" aria-hidden="true" />
                {{ browserTaskBusy ? 'Cancelling' : 'Cancel' }}
            </Button>
        </div>
        <p
            v-if="browserTaskError"
            data-testid="talos-browser-task-error"
            role="alert"
            class="mt-1 break-words rounded border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-2 py-1.5 text-[var(--talos-text)]"
        >
            {{ browserTaskError }}
        </p>
        <div v-if="pendingToolApprovals.length" class="mb-2 space-y-2">
            <TalosToolApprovalCard
                v-for="approval in pendingToolApprovals"
                :key="approval.id"
                :approval="approval"
                :busy="decidingToolApprovalIds.includes(approval.id)"
                @decide="emit('decideToolApproval', approval, $event)"
            />
        </div>
        <div v-if="showSanitizedStatus" data-testid="talos-browser-sanitized-status" class="mb-2 space-y-1">
            <div v-for="activity in sanitizedActivities" :key="activity.id" class="flex min-w-0 items-center gap-2 py-0.5">
                <Loader2 v-if="activity.status === 'running' || activity.status === 'queued'" class="h-3.5 w-3.5 shrink-0 animate-spin" />
                <CircleAlert v-else-if="activity.status === 'failed' || activity.status === 'denied'" class="h-3.5 w-3.5 shrink-0 text-[var(--talos-warning)]" />
                <Check v-else class="h-3.5 w-3.5 shrink-0 text-[var(--talos-success)]" />
                <span class="min-w-0 break-words">{{ activity.label }}</span>
            </div>
        </div>
        <TalosBrowserScreenshotEvidence
            :activities="activities"
            :talos-session-id="talosSessionId"
            :active-browser-session="activeBrowserSession"
            :interaction-pending="interactionPending"
            :interaction-locked="interactionLocked"
            :interaction-error="interactionError"
            :pending-interaction-approval="pendingInteractionApproval"
            :excluded-artifact-ids="excludedScreenshotArtifactIds"
            :mobile="mobile"
            :mobile-window-presentation="mobileWindowPresentation"
            @interact="emit('interact', $event)"
            @confirm="emit('confirm', $event)"
        />

        <Collapsible v-if="hasRawEvidence" v-model:open="rawEvidenceOpen" class="mt-2 border-t border-[var(--talos-border)] pt-2">
            <CollapsibleTrigger as-child>
                <button
                    type="button"
                    data-testid="talos-browser-raw-evidence-trigger"
                    class="flex w-full items-center gap-2 rounded px-1 py-1.5 text-left text-xs font-medium text-[var(--talos-text)] transition hover:bg-[var(--talos-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                    :aria-expanded="rawEvidenceOpen"
                >
                    <ScanSearch class="h-3.5 w-3.5 shrink-0 text-[var(--talos-accent)]" />
                    <span class="min-w-0 flex-1 truncate">Untrusted browser evidence</span>
                    <ChevronDown class="h-3.5 w-3.5 shrink-0 transition-transform" :class="rawEvidenceOpen ? 'rotate-180' : ''" />
                </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div v-if="activities.length" class="mt-2">
                    <div class="mb-1 font-semibold text-[var(--talos-text)]">Browse activity</div>
                    <div v-for="activity in activities.slice(-4)" :key="activity.id" class="flex min-w-0 items-center gap-2 py-1">
                        <Loader2 v-if="activity.status === 'running' || activity.status === 'queued'" class="h-3.5 w-3.5 shrink-0 animate-spin" />
                        <CircleAlert v-else-if="activity.status === 'failed' || activity.status === 'denied'" class="h-3.5 w-3.5 shrink-0 text-[var(--talos-warning)]" />
                        <Check v-else class="h-3.5 w-3.5 shrink-0 text-[var(--talos-success)]" />
                        <span class="min-w-0 break-words">{{ activity.label }}</span>
                    </div>
                </div>
                <section
                    v-if="rawSnapshot"
                    data-testid="talos-browser-snapshot-viewer"
                    class="mt-2 min-w-0 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3"
                    aria-label="Untrusted browser evidence"
                >
                    <div class="flex flex-wrap items-start justify-between gap-2">
                        <div class="min-w-0">
                            <div class="break-words font-semibold text-[var(--talos-text)] [overflow-wrap:anywhere]">{{ rawSnapshot.title || 'Captured page' }}</div>
                            <div v-if="rawSnapshot.url" class="mt-1 break-all text-[11px] text-[var(--talos-muted)]">{{ rawSnapshot.url }}</div>
                        </div>
                        <span class="rounded border border-[var(--talos-warning-border)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--talos-warning)]">Untrusted</span>
                    </div>
                    <div v-if="rawSnapshot.text_digest" class="mt-2 break-all font-mono text-[10px] text-[var(--talos-muted)]">{{ rawSnapshot.text_digest }}</div>
                    <div class="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
                        <div
                            v-for="node in visibleSnapshotNodes"
                            :key="node.ref"
                            class="grid min-w-0 grid-cols-[minmax(72px,auto)_1fr] gap-2 rounded border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 py-1.5"
                        >
                            <span class="truncate font-mono text-[10px] uppercase text-[var(--talos-accent)]">{{ node.role }}</span>
                            <span class="min-w-0 break-words text-[11px] text-[var(--talos-text)] [overflow-wrap:anywhere]">{{ node.name || '(unnamed)' }}</span>
                        </div>
                    </div>
                    <p v-if="rawSnapshot.truncated || rawSnapshot.nodes.length > visibleSnapshotNodes.length" class="mt-2 text-[10px] text-[var(--talos-muted)]">Preview truncated to the first {{ visibleSnapshotNodes.length }} nodes.</p>
                </section>
            </CollapsibleContent>
        </Collapsible>
    </div>
</template>

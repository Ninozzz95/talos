<script setup lang="ts">
import { computed } from 'vue'
import { Globe2 } from '@lucide/vue'
import TalosBrowserActivity from './TalosBrowserActivity.vue'
import type {
    TalosBrowserActivity as TalosBrowserActivityItem,
    TalosBrowserCurrentPage,
    TalosBrowserHmiChallenge,
    TalosBrowserPointerFrame,
    TalosBrowserRefFrame,
    TalosBrowserRefInteraction,
    TalosBrowserScrollFrame,
    TalosBrowserSession,
    TalosBrowserSnapshotPreview,
    TalosBrowserTask,
    TalosMobileWindowPresentation,
    TalosPendingToolApproval,
} from '../../../lib/talosTypes'

const props = withDefaults(defineProps<{
    task: TalosBrowserTask
    activities: TalosBrowserActivityItem[]
    snapshot: TalosBrowserSnapshotPreview | null
    talosSessionId: string | null
    currentPage?: TalosBrowserCurrentPage | null
    activeBrowserSession?: TalosBrowserSession | null
    interactionPending?: boolean
    interactionLocked?: boolean
    interactionError?: string | null
    pendingInteractionApproval?: TalosBrowserHmiChallenge | null
    refFrame?: TalosBrowserRefFrame | null
    refTargetsLoading?: boolean
    refTargetsError?: string | null
    pendingToolApprovals?: TalosPendingToolApproval[]
    decidingToolApprovalIds?: string[]
    browserTaskBusy?: boolean
    browserTaskError?: string | null
    browserTaskCommandPending?: boolean
    devBrowserEvidence?: boolean
    mobile?: boolean
    mobileWindowPresentation?: TalosMobileWindowPresentation
}>(), {
    currentPage: null,
    activeBrowserSession: null,
    interactionPending: false,
    interactionLocked: false,
    interactionError: null,
    pendingInteractionApproval: null,
    refFrame: null,
    refTargetsLoading: false,
    refTargetsError: null,
    pendingToolApprovals: () => [],
    decidingToolApprovalIds: () => [],
    browserTaskBusy: false,
    browserTaskError: null,
    browserTaskCommandPending: false,
    devBrowserEvidence: false,
    mobile: false,
    mobileWindowPresentation: 'drawer',
})

const emit = defineEmits<{
    interact: [frame: TalosBrowserPointerFrame]
    interactRef: [interaction: TalosBrowserRefInteraction]
    scroll: [frame: TalosBrowserScrollFrame]
    confirm: [decision: 'approve' | 'reject']
    decideToolApproval: [approval: TalosPendingToolApproval, decision: 'approve' | 'reject']
    cancelTask: [taskId: string]
}>()

function positiveInteger(value: unknown): number | null {
    return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null
}

function compactTokenCount(value: number): string {
    if (value < 1024) return `${value}`
    const kibibytes = value / 1024
    return Number.isInteger(kibibytes) ? `${kibibytes}K` : `${kibibytes.toFixed(1)}K`
}

const budgetLabels = computed(() => {
    const labels: string[] = []
    const maxDomains = positiveInteger(props.task.budget.max_domains)
    const maxTokens = positiveInteger(props.task.budget.max_tokens)
    if (maxDomains !== null) labels.push(`${maxDomains} domains`)
    if (maxTokens !== null) labels.push(`${compactTokenCount(maxTokens)} tokens`)
    return labels
})
</script>

<template>
    <section
        data-testid="talos-browser-card"
        :data-task-id="task.id"
        class="mt-3 min-w-0 border-t border-[var(--talos-border)] pt-3 text-left"
        aria-label="Browser task"
    >
        <header class="flex min-w-0 items-start gap-2.5">
            <span class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] text-[var(--talos-accent)]">
                <Globe2 class="h-4 w-4" aria-hidden="true" />
            </span>
            <div class="min-w-0 flex-1">
                <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span class="text-xs font-semibold text-[var(--talos-text)]">Browser</span>
                    <span v-if="currentPage" class="min-w-0 truncate text-[11px] text-[var(--talos-muted)]">{{ currentPage.host }}</span>
                    <span class="text-[10px] font-medium uppercase text-[var(--talos-muted)]">1 tab</span>
                </div>
                <div v-if="currentPage" class="mt-0.5 truncate text-sm font-medium text-[var(--talos-text)]" :title="currentPage.title">
                    {{ currentPage.title }}
                </div>
                <p class="mt-1 break-words text-xs leading-5 text-[var(--talos-muted)] [overflow-wrap:anywhere]">{{ task.goal }}</p>
                <div v-if="budgetLabels.length" class="mt-1.5 flex flex-wrap gap-1.5" aria-label="Browser task limits">
                    <span
                        v-for="label in budgetLabels"
                        :key="label"
                        class="rounded border border-[var(--talos-border)] px-1.5 py-0.5 text-[10px] text-[var(--talos-muted)]"
                    >
                        {{ label }}
                    </span>
                </div>
            </div>
        </header>

        <TalosBrowserActivity
            class="mt-2"
            embedded
            :activities="activities"
            :snapshot="snapshot"
            :talos-session-id="talosSessionId"
            :active-browser-session="activeBrowserSession"
            :interaction-pending="interactionPending"
            :interaction-locked="interactionLocked"
            :interaction-error="interactionError"
            :pending-interaction-approval="pendingInteractionApproval"
            :ref-frame="refFrame"
            :ref-targets-loading="refTargetsLoading"
            :ref-targets-error="refTargetsError"
            :pending-tool-approvals="pendingToolApprovals"
            :deciding-tool-approval-ids="decidingToolApprovalIds"
            :browser-task="task"
            :browser-task-busy="browserTaskBusy"
            :browser-task-error="browserTaskError"
            :browser-task-command-pending="browserTaskCommandPending"
            :dev-browser-evidence="devBrowserEvidence"
            :mobile="mobile"
            :mobile-window-presentation="mobileWindowPresentation"
            @interact="emit('interact', $event)"
            @interact-ref="emit('interactRef', $event)"
            @scroll="emit('scroll', $event)"
            @confirm="emit('confirm', $event)"
            @decide-tool-approval="(approval, decision) => emit('decideToolApproval', approval, decision)"
            @cancel-task="emit('cancelTask', $event)"
        />
    </section>
</template>

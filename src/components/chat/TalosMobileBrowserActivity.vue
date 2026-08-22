<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Check, ChevronDown, CircleAlert, Loader2, ScanSearch, X } from '@lucide/vue'
import type { TalosMobileBrowserActivityView } from '@/components/chat/mobileChatTypes'

const TalosMobileBrowserScreenshotEvidence = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileBrowserScreenshotEvidence.vue'),
)

const props = withDefaults(defineProps<{
    activities: readonly TalosMobileBrowserActivityView[]
    showUntrustedEvidence?: boolean
    interactionAvailable?: boolean
}>(), {
    showUntrustedEvidence: false,
    interactionAvailable: false,
})

const emit = defineEmits<{
    retry: [artifactId: string]
    openLive: [url: string]
}>()

const { t } = useTalosI18n()
const rawOpen = ref(false)
const operationLabelKeys: Record<string, string> = {
    navigate: 'browser.operationNavigate',
    screenshot: 'browser.operationScreenshot',
    snapshot: 'browser.operationSnapshot',
    read: 'browser.operationRead',
    session_start: 'browser.operationSessionStart',
    click: 'browser.operationClick',
    scroll: 'browser.operationScroll',
    upload: 'browser.operationUpload',
    wait: 'browser.operationWait',
    tabs: 'browser.operationTabs',
}
const statusLabelKeys: Record<string, string> = {
    pending: 'browser.statusRunning',
    succeeded: 'browser.statusSucceeded',
    failed: 'browser.statusFailed',
    cancelled: 'browser.statusCancelled',
    recovery_required: 'browser.statusRecovery',
}
function operationLabel(operation: string): string {
    return t(operationLabelKeys[operation] ?? 'browser.operationUnknown')
}
function statusLabel(status: string): string {
    return t(statusLabelKeys[status] ?? 'browser.statusUpdated')
}
const validActivities = computed(() => props.activities.filter((activity) => activity.evidence !== null))
const invalidActivities = computed(() => props.activities.filter((activity) => activity.evidence === null))
const snapshots = computed(() => validActivities.value.flatMap((activity) => {
    const snapshot = activity.evidence?.snapshot
    return snapshot ? [{ id: activity.id, snapshot }] : []
}))
const rawAvailable = computed(() => props.showUntrustedEvidence && snapshots.value.length > 0)
</script>

<template>
    <section
        v-if="activities.length"
        data-testid="talos-mobile-browser-activity"
        class="mt-3 min-w-0 max-w-full border-t border-[var(--talos-border)] pt-3 text-xs text-[var(--talos-text)]"
        :aria-label="$t('browser.evidenceSection')"
    >
        <div class="space-y-1" aria-live="polite">
            <div
                v-for="activity in validActivities.slice(-4)"
                :key="activity.id"
                class="flex min-w-0 items-center gap-2 py-0.5"
            >
                <Loader2 v-if="activity.status === 'pending'" class="size-3.5 shrink-0 animate-spin text-[var(--talos-accent)]" aria-hidden="true" />
                <CircleAlert v-else-if="activity.status === 'failed' || activity.status === 'recovery_required'" class="size-3.5 shrink-0 text-[var(--talos-warning)]" aria-hidden="true" />
                <X v-else-if="activity.status === 'cancelled'" class="size-3.5 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                <Check v-else class="size-3.5 shrink-0 text-[var(--talos-success)]" aria-hidden="true" />
                <span class="min-w-0 break-words">
                    {{ operationLabel(activity.evidence?.activity.operation ?? activity.operation) }}
                    {{ statusLabel(activity.status) }}
                </span>
            </div>
        </div>

        <div
            v-for="activity in invalidActivities"
            :key="activity.id"
            role="alert"
            class="mt-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-2.5 py-2 text-[var(--talos-text)]"
        >
            {{ $t('browser.verificationFailed') }}
        </div>

        <TalosMobileBrowserScreenshotEvidence
            :activities="validActivities"
            :interaction-available="interactionAvailable"
            @retry="emit('retry', $event)"
            @open-live="emit('openLive', $event)"
        />

        <div v-if="rawAvailable" class="mt-3 border-t border-[var(--talos-border)] pt-2">
            <button
                type="button"
                data-testid="talos-mobile-browser-raw-trigger"
                class="flex min-h-touch w-full items-center gap-2 rounded-md px-1 text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                :aria-expanded="rawOpen"
                @click="rawOpen = !rawOpen"
            >
                <ScanSearch class="size-3.5 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                <span class="min-w-0 flex-1 truncate">{{ $t('browser.untrustedEvidence') }}</span>
                <ChevronDown class="size-3.5 shrink-0 transition-transform" :class="rawOpen ? 'rotate-180' : ''" aria-hidden="true" />
            </button>
            <div v-if="rawOpen" class="mt-2 max-h-72 space-y-3 overflow-y-auto overscroll-contain pr-1">
                <section
                    v-for="item in snapshots"
                    :key="item.id"
                    class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-2"
                >
                    <div class="font-semibold">{{ item.snapshot.title || $t('browser.capturedPage') }}</div>
                    <div v-if="item.snapshot.url" class="mt-1 break-all text-3xs text-[var(--talos-muted)]">{{ item.snapshot.url }}</div>
                    <div class="mt-2 space-y-1">
                        <div
                            v-for="node in item.snapshot.nodes.slice(0, 100)"
                            :key="node.ref"
                            class="grid min-w-0 grid-cols-[72px_1fr] gap-2 rounded border border-[var(--talos-border)] px-2 py-1"
                        >
                            <span class="truncate font-mono text-3xs uppercase text-[var(--talos-accent)]">{{ node.role }}</span>
                            <span class="min-w-0 break-words [overflow-wrap:anywhere]">{{ node.name || $t('browser.unnamedNode') }}</span>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    </section>
</template>

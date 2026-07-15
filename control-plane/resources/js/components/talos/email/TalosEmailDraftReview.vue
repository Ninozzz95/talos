<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertCircle, Loader2, Send } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import { resolveTalosCollectionState } from '../../../lib/talosCollectionState'
import type { TalosEmailDraft } from '../../../lib/talosTypes'

const props = withDefaults(defineProps<{
    drafts: TalosEmailDraft[]
    sendingDraftId?: string | null
    loading?: boolean
    error?: string | null
    requested?: boolean
}>(), {
    sendingDraftId: null,
    loading: false,
    error: null,
    requested: true,
})

const emit = defineEmits<{
    send: [draft: TalosEmailDraft]
}>()

const selectedDraftId = ref<string | null>(null)
const selectedDraft = computed(() => {
    return props.drafts.find((draft) => draft.id === selectedDraftId.value) ?? props.drafts[0] ?? null
})
const draftsState = computed(() => resolveTalosCollectionState({
    itemCount: props.drafts.length,
    loading: props.loading,
    error: props.error,
    requested: props.requested,
}))
</script>

<template>
    <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)]">
        <div class="border-b border-[var(--talos-border)] p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div class="text-sm font-semibold text-[var(--talos-text)]">Email draft review</div>
                    <div class="mt-1 text-xs text-[var(--talos-muted)]">EMAIL_SEND_DISABLED until HMI confirmation and audit exist.</div>
                </div>
                <Badge tone="warning">send_enabled false</Badge>
            </div>
        </div>

        <div class="space-y-3 p-3">
            <div v-if="draftsState === 'loading'" role="status" class="flex items-center gap-2 text-sm leading-6 text-[var(--talos-muted)]">
                <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                Loading email drafts
            </div>

            <div v-else-if="draftsState === 'error'" class="text-sm leading-6 text-[var(--talos-warning)]">
                Draft review is unavailable until email sync succeeds.
            </div>

            <div v-else-if="draftsState === 'empty'" class="text-sm leading-6 text-[var(--talos-muted)]">
                No drafts returned by `/api/talos/email/drafts`.
            </div>

            <div v-else-if="draftsState === 'ready'" class="grid gap-2">
                <select v-model="selectedDraftId" aria-label="Email draft" class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none">
                    <option v-for="draft in drafts" :key="draft.id" :value="draft.id">{{ draft.subject }}</option>
                </select>

                <div v-if="selectedDraft" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
                    <div class="flex flex-wrap gap-2">
                        <Badge tone="neutral">{{ selectedDraft.status }}</Badge>
                        <Badge :tone="selectedDraft.send_enabled ? 'success' : 'warning'">send_enabled {{ selectedDraft.send_enabled }}</Badge>
                        <Badge tone="neutral">{{ selectedDraft.referenced_message_ids.length }} referenced_message_ids</Badge>
                    </div>
                    <div class="mt-3 text-sm font-semibold text-[var(--talos-text)]">{{ selectedDraft.subject }}</div>
                    <pre class="mt-2 max-h-[180px] overflow-auto whitespace-pre-wrap text-xs leading-5 text-[var(--talos-muted)]">{{ selectedDraft.body }}</pre>
                    <div class="mt-3 flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-xs leading-5 text-[var(--talos-text)]">
                        <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                        <span>Send is disabled by policy in MVP. This button can only exercise the deny endpoint.</span>
                    </div>
                    <Button type="button" variant="secondary" size="sm" class="mt-3 w-full" :disabled="!selectedDraft || sendingDraftId === selectedDraft.id" @click="emit('send', selectedDraft)">
                        <Loader2 v-if="sendingDraftId === selectedDraft.id" class="h-4 w-4 animate-spin" />
                        <Send v-else class="h-4 w-4" />
                        Verify send denial
                    </Button>
                </div>
            </div>
        </div>
    </div>
</template>

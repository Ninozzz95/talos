<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, Inbox, Loader2, MailPlus, RefreshCw, ShieldAlert } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import Surface from '../../ui/Surface.vue'
import TalosEmailDraftReview from './TalosEmailDraftReview.vue'
import { useTalosEmail } from '../../../composables/useTalosEmail'
import type { TalosEmailDraft, TalosEmailMessage } from '../../../lib/talosTypes'

const {
    connectorStatus,
    messages,
    messageContext,
    drafts,
    loadingConnectorStatus,
    loadingMessages,
    loadingDrafts,
    loadingMessageContext,
    creatingDraft,
    sendingDraftId,
    emailError,
    loadConnectorStatus,
    loadMessages,
    loadMessageContext,
    loadDrafts,
    createDraft,
    sendDraft,
} = useTalosEmail()

const selectedMessageIds = ref<string[]>([])
const actionError = ref<string | null>(null)
const visibleError = computed(() => actionError.value || emailError.value)
const canDraft = computed(() => {
    return selectedMessageIds.value.length > 0
        && messageContext.value?.policy.allowed_actions.includes('draft')
        && !creatingDraft.value
})

async function refreshEmail() {
    actionError.value = null

    try {
        await Promise.all([
            loadConnectorStatus(),
            loadMessages(),
            loadDrafts(),
        ])
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not refresh email.'
    }
}

async function toggleMessage(message: TalosEmailMessage) {
    if (selectedMessageIds.value.includes(message.id)) {
        selectedMessageIds.value = selectedMessageIds.value.filter((id) => id !== message.id)
    } else {
        selectedMessageIds.value = [...selectedMessageIds.value, message.id]
    }

    if (selectedMessageIds.value.length) {
        try {
            await loadMessageContext(selectedMessageIds.value)
        } catch (error) {
            actionError.value = error instanceof Error ? error.message : 'TALOS could not load email context.'
        }
    }
}

async function createReplyDraft() {
    if (!canDraft.value) {
        return
    }

    const firstMessage = messages.value.find((message) => selectedMessageIds.value.includes(message.id))
    if (!firstMessage) {
        return
    }

    actionError.value = null

    try {
        await createDraft({
            message_ids: selectedMessageIds.value,
            to: [firstMessage.from],
            subject: firstMessage.subject.startsWith('Re:') ? firstMessage.subject : `Re: ${firstMessage.subject}`,
            body: 'Draft created by TALOS for operator review. No email has been sent.',
            metadata: { source: 'talos_email_triage' },
        })
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not create this draft.'
    }
}

async function handleSend(draft: TalosEmailDraft) {
    try {
        await sendDraft(draft.id)
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'EMAIL_SEND_DISABLED'
    }
}

onMounted(() => {
    void refreshEmail()
})
</script>

<template>
    <Surface>
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <Inbox class="h-4 w-4 text-[var(--talos-accent)]" />
                        Email triage
                    </div>
                    <h3 class="mt-1 text-base font-semibold text-[var(--talos-text)]">Read-only and draft-only</h3>
                    <p class="mt-1 text-sm leading-6 text-[var(--talos-muted)]">Email bodies are untrusted context. `send_enabled` is false in the MVP.</p>
                </div>
                <Button type="button" variant="ghost" size="sm" :disabled="loadingConnectorStatus || loadingMessages || loadingDrafts" @click="refreshEmail">
                    <Loader2 v-if="loadingConnectorStatus || loadingMessages || loadingDrafts" class="h-4 w-4 animate-spin" />
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

            <div class="flex flex-wrap gap-2">
                <Badge :tone="connectorStatus?.status === 'healthy' ? 'success' : 'warning'">{{ connectorStatus?.status ?? 'degraded' }}</Badge>
                <Badge tone="neutral">read_only {{ connectorStatus?.read_only ?? true }}</Badge>
                <Badge tone="warning">send_enabled {{ connectorStatus?.send_enabled ?? false }}</Badge>
            </div>

            <div class="flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-xs leading-5 text-[var(--talos-text)]">
                <ShieldAlert class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                <span>{{ messageContext?.trust_level ?? 'untrusted' }} email context cannot alter tools, recipients, or policy.</span>
            </div>

            <div v-if="!messages.length && !loadingMessages" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                No email messages returned by `/api/talos/email/messages`.
            </div>

            <div v-else class="max-h-[240px] divide-y divide-[var(--talos-border)] overflow-y-auto rounded-md border border-[var(--talos-border)]">
                <button
                    v-for="message in messages"
                    :key="message.id"
                    type="button"
                    class="grid w-full grid-cols-[24px_minmax(0,1fr)_90px] gap-3 px-3 py-3 text-left transition hover:bg-[var(--talos-active)]"
                    :class="selectedMessageIds.includes(message.id) ? 'bg-[var(--talos-panel)]' : 'bg-[var(--talos-panel-soft)]'"
                    :disabled="loadingMessageContext"
                    @click="toggleMessage(message)"
                >
                    <input type="checkbox" :checked="selectedMessageIds.includes(message.id)" class="mt-1" tabindex="-1">
                    <span class="min-w-0">
                        <span class="block truncate text-sm font-semibold text-[var(--talos-text)]">{{ message.subject }}</span>
                        <span class="mt-1 block truncate text-xs text-[var(--talos-muted)]">{{ message.body_preview }}</span>
                    </span>
                    <Badge tone="warning">{{ message.trust_level }}</Badge>
                </button>
            </div>

            <Button type="button" size="sm" class="w-full" :disabled="!canDraft" @click="createReplyDraft">
                <Loader2 v-if="creatingDraft" class="h-4 w-4 animate-spin" />
                <MailPlus v-else class="h-4 w-4" />
                Create draft
            </Button>

            <TalosEmailDraftReview :drafts="drafts" :sending-draft-id="sendingDraftId" @send="handleSend" />
        </div>
    </Surface>
</template>

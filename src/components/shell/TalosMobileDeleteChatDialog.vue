<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Loader2, Trash2, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import { talosCleanupCount } from '@/lib/chat/sessionCleanup'
import type { TalosSessionCleanupPlan } from '@/lib/chat/sessionCleanup'
import { TALOS_DANGER_ACTION_CLASS } from '@/lib/dangerAction'
import { talosDaIntitolare } from '@/stores/chat'

/**
 * "Delete chat?" — with what it takes from the Library, and the choice.
 *
 * Owner 2026-07-26: deleting a chat left its documents behind, silently. ONE
 * implementation for both surfaces that offer the action (the 3-dot menu and the
 * sidebar list), because two dialogs with the same words is how one of them ends
 * up lying.
 *
 * The checkbox appears only when there is something to check. An empty
 * "also delete 0 files" is not a choice, it is noise, and it teaches the user to
 * dismiss the row on the day it does matter.
 */
const props = defineProps<{
    title: string
    plan: TalosSessionCleanupPlan
    /** True while the deletion is running: the dialog stays up and says so. */
    busy: boolean
}>()

const emit = defineEmits<{
    close: []
    confirm: [{ deleteMedia: boolean }]
}>()

const { t } = useTalosI18n()
const deleteMedia = ref(false)
const confirmed = ref(false)
const count = computed(() => talosCleanupCount(props.plan))
const description = computed(() => {
    const parts: string[] = []
    if (props.plan.documents.length) {
        const documentKey = props.plan.documents.length === 1
            ? 'chat.cleanupDocumentOne'
            : 'chat.cleanupDocumentMany'
        parts.push(t(documentKey, { count: props.plan.documents.length }))
    }
    if (props.plan.sources.length) {
        const sourceKey = props.plan.sources.length === 1
            ? 'chat.cleanupSavedPageOne'
            : 'chat.cleanupSavedPageMany'
        parts.push(t(sourceKey, { count: props.plan.sources.length }))
    }
    return parts.length === 2
        ? t('chat.cleanupJoin', { first: parts[0], second: parts[1] })
        : (parts[0] ?? '')
})

/**
 * The spinner shows only while the parent is ACTUALLY working.
 *
 * SF-critic 2026-07-26 (BLOCKER): a latch of its own made this a trap. Every
 * parent refuses the work in some state — no active session, another action in
 * flight, persistence not ready — and then no `busy` edge ever arrives. The
 * dialog spun with Cancel, confirm, Escape and the backdrop all disabled, over
 * an inert shell: the app was unusable until force-killed. Deriving the spinner
 * from `busy` means a parent that does nothing leaves every exit alive.
 */
const running = computed(() => confirmed.value && props.busy)

// Default OFF. A file you asked for can outlive the conversation that produced
// it, and a destructive extra must never be pre-agreed on the user's behalf.
//
// Keyed on the COUNT, not the plan object: the plan is a computed over a
// reactive array, so any refreshVault (a tool saving a document mid-dialog)
// hands over a new object with identical contents. Watching identity silently
// unticked the box the user had ticked, and only the chat went.
watch(count, () => { deleteMedia.value = false })

/**
 * Close once the work the user asked for has ended.
 *
 * Owner 2026-07-26 asked for the progress: deleting a chat AND a dozen files is
 * not instant, and a dialog that vanishes on tap leaves the user watching a list
 * that has not changed yet, with nothing to say whether anything is happening.
 */
watch(() => props.busy, (busy, was) => {
    if (!confirmed.value || busy || !was) return
    confirmed.value = false
    emit('close')
})

function confirm(): void {
    // Refuse while the shell is busy: every parent early-returns in that state,
    // so the deletion would silently not happen and the dialog would then close
    // on the UNRELATED action's edge, as if the chat had gone.
    if (confirmed.value || props.busy) return
    confirmed.value = true
    emit('confirm', { deleteMedia: count.value > 0 && deleteMedia.value })
}

/**
 * ⛔ Il gettone «non ancora intitolata» si traduce qui, non si salva tradotto:
 * il database porta una parola ferma, lo schermo ci mette la lingua di chi legge.
 */
const titoloDaMostrare = computed(() => (talosDaIntitolare(props.title)
    ? t('chat.newChat')
    : props.title))

function close(): void {
    // ALWAYS works. Closing does not abort anything — the deletion, if one is
    // really running, finishes either way — so there is no state in which
    // refusing to close serves the user, and every such state was a trap:
    // whatever a parent does or fails to do, Cancel, Escape and the backdrop
    // still get you out.
    confirmed.value = false
    emit('close')
}
</script>

<template>
    <TalosMobileConfirmDialog
        :title="$t('chat.deleteTitle')"
        :description="$t('chat.deleteDescription', { title: titoloDaMostrare })"
        @close="close"
    >
        <label
            v-if="count > 0"
            class="talos-pressable flex min-h-touch items-start gap-3 rounded-lg px-1 py-2 text-left"
            :class="running ? 'pointer-events-none opacity-60' : ''"
            data-testid="talos-delete-chat-media"
        >
            <input
                v-model="deleteMedia"
                type="checkbox"
                class="mt-0.5 size-4 shrink-0 accent-[var(--talos-danger,#dc5b5b)]"
                :disabled="running"
            >
            <span class="text-sm leading-5">
                {{ $t('chat.deleteGeneratedFiles') }}
                <span class="block text-xs text-[var(--talos-muted)]">{{ $t('chat.cleanupLibrarySuffix', { items: description }) }}</span>
            </span>
        </label>

        <template #footer>
            <Button type="button" variant="ghost" @click="close">
                <X class="size-4" aria-hidden="true" /> {{ $t('common.cancel') }}
            </Button>
            <Button
                type="button"
                variant="destructive"
                :class="TALOS_DANGER_ACTION_CLASS"
                data-testid="talos-session-delete-confirm"
                :disabled="running || props.busy"
                @click="confirm"
            >
                <Loader2 v-if="running" class="size-4 animate-spin" aria-hidden="true" />
                <Trash2 v-else class="size-4" aria-hidden="true" />
                {{ running ? $t('chat.deleting') : $t('common.delete') }}
            </Button>
        </template>
    </TalosMobileConfirmDialog>
</template>

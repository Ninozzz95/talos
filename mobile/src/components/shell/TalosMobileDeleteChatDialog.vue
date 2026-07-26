<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Loader2, Trash2, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import { describeTalosCleanup, talosCleanupCount } from '@/lib/chat/sessionCleanup'
import type { TalosSessionCleanupPlan } from '@/lib/chat/sessionCleanup'

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

const deleteMedia = ref(false)
const running = ref(false)
const count = computed(() => talosCleanupCount(props.plan))
const description = computed(() => describeTalosCleanup(props.plan))

// Default OFF. A file you asked for can outlive the conversation that produced
// it, and a destructive extra must never be pre-agreed on the user's behalf.
watch(() => props.plan, () => { deleteMedia.value = false })

/**
 * The dialog stays up, spinning, until the parent's operation ends.
 *
 * Owner 2026-07-26 asked for the progress: deleting a chat AND a dozen files is
 * not instant, and a dialog that vanishes on tap leaves the user watching a list
 * that has not changed yet, with nothing to say whether anything is happening.
 */
watch(() => props.busy, (busy) => {
    if (!running.value || busy) return
    running.value = false
    emit('close')
})

function confirm(): void {
    if (running.value) return
    running.value = true
    emit('confirm', { deleteMedia: count.value > 0 && deleteMedia.value })
}

function close(): void {
    // A tap outside must not abandon a deletion already in flight.
    if (running.value) return
    emit('close')
}
</script>

<template>
    <TalosMobileConfirmDialog
        title="Delete chat?"
        :description="`This permanently removes &quot;${props.title || 'New chat'}&quot; and its messages.`"
        @close="close"
    >
        <label
            v-if="count > 0"
            class="talos-pressable flex min-h-11 items-start gap-3 rounded-lg px-1 py-2 text-left"
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
                Also delete this chat's files
                <span class="block text-xs text-[var(--talos-muted)]">{{ description }} in the Library</span>
            </span>
        </label>

        <template #footer>
            <Button type="button" variant="ghost" :disabled="running" @click="close">
                <X class="size-4" aria-hidden="true" /> Cancel
            </Button>
            <Button
                type="button"
                variant="destructive"
                data-testid="talos-session-delete-confirm"
                :disabled="running"
                @click="confirm"
            >
                <Loader2 v-if="running" class="size-4 animate-spin" aria-hidden="true" />
                <Trash2 v-else class="size-4" aria-hidden="true" />
                {{ running ? 'Deleting…' : 'Delete' }}
            </Button>
        </template>
    </TalosMobileConfirmDialog>
</template>

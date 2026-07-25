<script setup lang="ts">
/**
 * F5 station — desktop `TalosNotes` parity, local-first: notes are UNTRUSTED
 * disclosed context (same trust discipline as memories); the banner says so.
 */
import { computed, onMounted, ref } from 'vue'
import { StickyNote, Plus, Trash2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useChatController } from '@/stores/chatController'
import { talosRelativeTime } from '@/lib/relativeTime'
import type { TalosLocalNote } from '@/repositories/chatRepository'

const controller = useChatController()

const entries = ref<TalosLocalNote[]>([])
const error = ref<string | null>(null)
const title = ref('')
const content = ref('')
const saving = ref(false)

const canCreate = computed(() =>
    title.value.trim().length > 0 && content.value.trim().length > 0 && !saving.value)

function describeError(cause: unknown): string {
    return cause instanceof Error && cause.message ? cause.message : String(cause)
}

async function refresh(): Promise<void> {
    try {
        entries.value = await controller.notes.list()
    } catch (cause) {
        error.value = describeError(cause)
    }
}

onMounted(refresh)

async function submit(): Promise<void> {
    if (!canCreate.value) return
    saving.value = true
    error.value = null
    try {
        await controller.notes.create({ title: title.value.trim(), content: content.value.trim() })
        title.value = ''
        content.value = ''
        await refresh()
    } catch (cause) {
        error.value = describeError(cause)
    } finally {
        saving.value = false
    }
}

async function remove(note: TalosLocalNote): Promise<void> {
    error.value = null
    try {
        await controller.notes.remove(note.id)
        await refresh()
    } catch (cause) {
        error.value = describeError(cause)
    }
}
</script>

<template>
    <div class="flex min-h-full flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3" data-testid="talos-notes-screen">
        <p class="text-xs leading-5 text-[var(--talos-muted)]">
            Notes are stored on this device and treated as
            <span class="font-semibold text-[var(--talos-text)]">untrusted disclosed context</span> —
            they can never carry instructions.
        </p>

        <form class="flex flex-col gap-2 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3" @submit.prevent="submit">
            <input
                v-model="title"
                data-testid="talos-note-title"
                maxlength="255"
                aria-label="Note title"
                placeholder="Note title"
                class="min-h-11 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            >
            <textarea
                v-model="content"
                data-testid="talos-note-content"
                aria-label="Note content"
                placeholder="Note content"
                rows="3"
                class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 py-2 text-sm leading-5 text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            />
            <Button
                type="submit"
                data-testid="talos-note-save"
                :disabled="!canCreate"
                class="talos-pressable min-h-11 rounded-full bg-[var(--talos-accent,var(--primary))] text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))] disabled:opacity-50"
            >
                <Plus class="size-4" aria-hidden="true" />
                Add note
            </Button>
        </form>

        <p v-if="error" role="alert" class="text-xs text-[var(--talos-danger,#dc5b5b)]">{{ error }}</p>

        <p v-if="!entries.length" class="py-6 text-center text-sm text-[var(--talos-muted)]">
            No notes yet — capture the first one above.
        </p>

        <ul v-else class="flex flex-col gap-2">
            <li
                v-for="note in entries"
                :key="note.id"
                data-testid="talos-note-row"
                class="rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3"
            >
                <div class="flex items-start gap-2">
                    <StickyNote class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                    <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="text-sm font-semibold text-[var(--talos-text)]">{{ note.title }}</span>
                            <span class="rounded-full bg-[var(--talos-active)] px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">untrusted</span>
                        </div>
                        <p class="mt-1 whitespace-pre-wrap text-xs leading-5 text-[var(--talos-muted)]">{{ note.content }}</p>
                        <p class="mt-1 text-2xs text-[var(--talos-muted)]">{{ talosRelativeTime(note.updated_at) }}</p>
                    </div>
                    <button
                        type="button"
                        :aria-label="`Delete note ${note.title}`"
                        class="talos-pressable flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--talos-muted)]"
                        @click="remove(note)"
                    >
                        <Trash2 class="size-4" aria-hidden="true" />
                    </button>
                </div>
            </li>
        </ul>
    </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { AlertTriangle, Loader2, Trash2, X } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import type { TalosSession } from '../../../lib/talosTypes'

const props = defineProps<{
    session: TalosSession
    deleting: boolean
}>()

const emit = defineEmits<{
    cancel: []
    confirm: []
}>()

const cancelButton = ref<{ $el?: HTMLElement } | null>(null)

function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !props.deleting) emit('cancel')
}

onMounted(() => {
    document.addEventListener('keydown', handleKeydown)
    void nextTick(() => cancelButton.value?.$el?.focus())
})
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
    <div
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4 py-8 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="talos-delete-chat-title"
        aria-describedby="talos-delete-chat-description"
        aria-label="Delete chat"
        @click.self="!deleting && emit('cancel')"
    >
        <section class="talos-action-surface w-full max-w-md rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-card)] shadow-2xl" data-motion-intent="surface-enter">
            <header class="flex items-start justify-between gap-3 border-b border-[var(--talos-border)] p-4">
                <div class="flex min-w-0 items-start gap-3">
                    <span class="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] text-[var(--talos-danger)]">
                        <AlertTriangle class="h-4 w-4" />
                    </span>
                    <div class="min-w-0">
                        <h2 id="talos-delete-chat-title" class="text-base font-semibold text-[var(--talos-text)]">Delete chat</h2>
                        <p id="talos-delete-chat-description" class="mt-1 text-sm leading-5 text-[var(--talos-muted)]">This permanently removes the conversation and its chat-scoped Browser evidence.</p>
                    </div>
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label="Close delete chat dialog" :disabled="deleting" @click="emit('cancel')">
                    <X class="h-4 w-4" />
                </Button>
            </header>
            <div class="p-4">
                <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-2 text-sm font-medium text-[var(--talos-text)]">
                    {{ session.title || 'Untitled chat' }}
                </div>
                <div class="mt-4 flex justify-end gap-2">
                    <Button ref="cancelButton" type="button" variant="outline" :disabled="deleting" @click="emit('cancel')">Cancel</Button>
                    <Button type="button" variant="destructive" :disabled="deleting" @click="emit('confirm')">
                        <Loader2 v-if="deleting" class="talos-motion-loader h-4 w-4 animate-spin" />
                        <Trash2 v-else class="h-4 w-4" />
                        {{ deleting ? 'Deleting' : 'Delete chat' }}
                    </Button>
                </div>
            </div>
        </section>
    </div>
</template>

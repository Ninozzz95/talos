<script setup lang="ts">
import { BrainCircuit } from '@lucide/vue'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '../../ui/dialog'
import type { TalosVisibleReasoning } from '../../../lib/talosMessageMetadata'

defineProps<{
    open: boolean
    reasoning: TalosVisibleReasoning
}>()

const emit = defineEmits<{
    'update:open': [value: boolean]
}>()
</script>

<template>
    <Dialog :open="open" @update:open="emit('update:open', $event)">
        <DialogContent
            aria-modal="true"
            class="max-h-[min(88vh,760px)] max-w-2xl overflow-hidden border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-text)]"
        >
            <DialogHeader>
                <DialogTitle class="flex items-center gap-2">
                    <BrainCircuit class="h-4 w-4 text-[var(--talos-accent)]" />
                    Reasoning
                </DialogTitle>
                <DialogDescription class="text-[var(--talos-muted)]">
                    Provider-visible reasoning only. Private continuation state and signatures are never shown.
                </DialogDescription>
            </DialogHeader>
            <div class="flex min-h-0 flex-wrap items-center gap-2 text-xs text-[var(--talos-muted)]">
                <span class="rounded-sm border border-[var(--talos-border)] px-2 py-1">{{ reasoning.source === 'provider' ? 'Provider' : 'AVM summary' }}</span>
                <span v-if="reasoning.provider" class="font-mono">{{ reasoning.provider }}</span>
            </div>
            <pre class="min-h-0 max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-4 font-sans text-sm leading-6 text-[var(--talos-text)]">{{ reasoning.text }}</pre>
        </DialogContent>
    </Dialog>
</template>

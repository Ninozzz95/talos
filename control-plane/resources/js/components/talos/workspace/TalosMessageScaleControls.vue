<script setup lang="ts">
import { Minus, Plus, RotateCcw } from '@lucide/vue'
import {
    TALOS_MESSAGE_SCALE_CONSTRAINT,
    talosScalePercentLabel,
} from '../../../lib/talosUiScale'

const props = defineProps<{
    messageScale: number
    locked: boolean
}>()

const emit = defineEmits<{
    decrease: []
    increase: []
    reset: []
}>()
</script>

<template>
    <div class="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-0.5" aria-label="Message size controls">
        <button type="button" class="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--talos-muted)] hover:bg-[var(--talos-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:cursor-not-allowed disabled:opacity-50" aria-label="Decrease message size" :title="locked ? 'Chat appearance is locked by workspace policy.' : 'Decrease message size'" :disabled="locked || props.messageScale <= TALOS_MESSAGE_SCALE_CONSTRAINT.min" @click="emit('decrease')"><Minus class="h-3.5 w-3.5" aria-hidden="true" /></button>
        <button type="button" class="hidden min-w-16 items-center justify-center px-1 font-mono text-[10px] font-semibold tabular-nums text-[var(--talos-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex" data-testid="talos-message-scale-status" aria-label="Reset message size" :title="locked ? 'Chat appearance is locked by workspace policy.' : 'Reset message size'" :disabled="locked" @click="emit('reset')">{{ talosScalePercentLabel(props.messageScale) }}</button>
        <button type="button" class="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--talos-muted)] hover:bg-[var(--talos-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:cursor-not-allowed disabled:opacity-50" aria-label="Increase message size" :title="locked ? 'Chat appearance is locked by workspace policy.' : 'Increase message size'" :disabled="locked || props.messageScale >= TALOS_MESSAGE_SCALE_CONSTRAINT.max" @click="emit('increase')"><Plus class="h-3.5 w-3.5" aria-hidden="true" /></button>
        <button type="button" class="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--talos-muted)] hover:bg-[var(--talos-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:cursor-not-allowed disabled:opacity-50" aria-label="Reset message size" :title="locked ? 'Chat appearance is locked by workspace policy.' : 'Reset message size'" :disabled="locked" @click="emit('reset')"><RotateCcw class="h-3.5 w-3.5" aria-hidden="true" /></button>
    </div>
</template>

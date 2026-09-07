<script setup lang="ts">
import { computed } from 'vue'
import { Loader2, Mic } from '@lucide/vue'
import Tooltip from '../../ui/Tooltip.vue'
import type { TalosDictationStatus } from '../../../composables/useTalosDictation'

const props = defineProps<{
    status: TalosDictationStatus
    supported: boolean
}>()

const emit = defineEmits<{
    toggle: []
}>()

const label = computed(() => {
    if (props.status === 'requesting') return 'Waiting for microphone permission'
    if (props.status === 'recording') return 'Dictation recording in progress'
    if (props.status === 'transcribing') return 'Transcribing dictation'
    if (props.status === 'error') return 'Retry microphone access'
    return 'Dictate'
})

const tooltip = computed(() => {
    if (props.status === 'requesting') return 'Waiting for microphone permission…'
    if (props.status === 'recording') return 'Recording in progress'
    if (props.status === 'transcribing') return 'Transcribing…'
    if (props.status === 'error') return 'Retry microphone access'
    return 'Dictate'
})

const busy = computed(() => props.status === 'requesting' || props.status === 'recording' || props.status === 'transcribing')
</script>

<template>
    <Tooltip v-if="supported" :content="tooltip">
        <button
            type="button"
            data-testid="talos-composer-dictate"
            :data-dictation-status="status"
            class="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md border px-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:min-h-8"
            :class="status === 'recording' || status === 'error'
                ? 'border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] text-[var(--talos-danger)]'
                : 'border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)]'"
            :aria-label="label"
            :aria-pressed="status === 'recording'"
            :aria-busy="status === 'requesting' || status === 'transcribing'"
            :disabled="busy"
            @click="emit('toggle')"
        >
            <Loader2 v-if="status === 'requesting' || status === 'transcribing'" class="h-4 w-4 animate-spin" />
            <Mic v-else class="h-3.5 w-3.5" :class="status === 'recording' ? 'animate-pulse' : ''" />
        </button>
    </Tooltip>
</template>

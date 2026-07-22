<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Loader2, Mic, RefreshCw, Square, X } from '@lucide/vue'
import type { TalosDictationStatus, TalosResolvedDictationMode } from '../../../composables/useTalosDictation'

const props = withDefaults(defineProps<{
    status: TalosDictationStatus
    error?: string | null
    recordingStartedAt?: number | null
    resolvedMode?: TalosResolvedDictationMode | null
}>(), {
    error: null,
    recordingStartedAt: null,
    resolvedMode: null,
})

const emit = defineEmits<{
    finish: []
    cancel: []
    retry: []
}>()

const nowMs = ref(Date.now())
let elapsedTimer: ReturnType<typeof setInterval> | null = null

function clearElapsedTimer() {
    if (elapsedTimer !== null) clearInterval(elapsedTimer)
    elapsedTimer = null
}

watch([() => props.status, () => props.recordingStartedAt], ([status]) => {
    clearElapsedTimer()
    nowMs.value = Date.now()
    if (status === 'recording') {
        elapsedTimer = setInterval(() => { nowMs.value = Date.now() }, 1_000)
    }
}, { immediate: true })

onBeforeUnmount(clearElapsedTimer)

const elapsedSeconds = computed(() => props.recordingStartedAt === null
    ? 0
    : Math.max(0, Math.floor((nowMs.value - props.recordingStartedAt) / 1_000)))

const elapsedLabel = computed(() => {
    const minutes = Math.floor(elapsedSeconds.value / 60).toString().padStart(2, '0')
    const seconds = (elapsedSeconds.value % 60).toString().padStart(2, '0')
    return `${minutes}:${seconds}`
})

const statusMessage = computed(() => {
    if (props.status === 'requesting') return 'Waiting for browser microphone permission'
    if (props.status === 'recording') return `Recording on this device · ${elapsedLabel.value}`
    if (props.status === 'transcribing' && props.resolvedMode === 'local') return 'Transcribing locally'
    if (props.status === 'transcribing' && props.resolvedMode === 'cloud') return 'Transcribing with cloud speech service'
    if (props.status === 'transcribing') return 'Preparing transcription'
    return props.error ?? 'Microphone needs attention.'
})

const announcementMessage = computed(() => {
    if (props.status === 'recording') return 'Recording on this device'
    return statusMessage.value
})
</script>

<template>
    <div
        data-testid="talos-dictation-status"
        :data-dictation-status="status"
        class="mx-1 mt-1 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border px-2 py-1.5 text-xs"
        :class="status === 'error'
            ? 'border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] text-[var(--talos-text)]'
            : 'border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] text-[var(--talos-text)]'"
    >
        <span class="flex min-w-0 flex-1 items-center gap-2">
            <Loader2 v-if="status === 'requesting' || status === 'transcribing'" class="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--talos-accent)]" aria-hidden="true" />
            <Mic v-else-if="status === 'recording'" class="h-3.5 w-3.5 shrink-0 animate-pulse text-[var(--talos-danger)]" aria-hidden="true" />
            <RefreshCw v-else class="h-3.5 w-3.5 shrink-0 text-[var(--talos-danger)]" aria-hidden="true" />
            <span
                v-if="status === 'error'"
                data-testid="talos-dictation-status-message"
                role="alert"
                class="min-w-0 leading-5"
            >{{ statusMessage }}</span>
            <span
                v-else
                data-testid="talos-dictation-status-message"
                aria-hidden="true"
                class="min-w-0 leading-5"
            >{{ statusMessage }}</span>
            <span
                v-if="status !== 'error'"
                data-testid="talos-dictation-announcement"
                class="sr-only"
                role="status"
                aria-live="polite"
            >{{ announcementMessage }}</span>
        </span>
        <span class="ml-auto flex shrink-0 items-center gap-1">
            <button
                v-if="status === 'recording'"
                type="button"
                aria-label="Finish dictation"
                class="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-[var(--talos-accent-border)] bg-[var(--talos-panel)] px-2.5 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:min-h-8"
                @click="emit('finish')"
            >
                <Square class="h-3 w-3" aria-hidden="true" />Finish
            </button>
            <button
                v-if="status === 'requesting' || status === 'recording' || status === 'transcribing'"
                type="button"
                aria-label="Cancel dictation"
                class="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2.5 text-[var(--talos-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:min-h-8"
                @click="emit('cancel')"
            >
                <X class="h-3.5 w-3.5" aria-hidden="true" />Cancel
            </button>
            <button
                v-if="status === 'error'"
                type="button"
                aria-label="Retry dictation"
                class="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-panel)] px-2.5 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:min-h-8"
                @click="emit('retry')"
            >
                <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />Retry
            </button>
        </span>
    </div>
</template>

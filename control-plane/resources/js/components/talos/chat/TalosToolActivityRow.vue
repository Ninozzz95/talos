<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AlertCircle, CheckCircle2, CircleDashed, XCircle } from '@lucide/vue'
import type { TalosToolActivity } from '../../../lib/talosMessageMetadata'

const props = defineProps<{
    activity: TalosToolActivity
}>()

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

const elapsedSeconds = computed(() => {
    const start = Date.parse(props.activity.started_at)
    const end = props.activity.completed_at
        ? Date.parse(props.activity.completed_at)
        : now.value
    return Math.max(0, Math.floor((end - start) / 1000))
})

function stopTimer() {
    if (timer !== null) {
        clearInterval(timer)
        timer = null
    }
}

function syncTimer() {
    stopTimer()
    now.value = Date.now()
    if (props.activity.status === 'running') {
        timer = setInterval(() => {
            now.value = Date.now()
        }, 1000)
    }
}

onMounted(syncTimer)
watch(() => [props.activity.status, props.activity.started_at, props.activity.completed_at], syncTimer)
onBeforeUnmount(stopTimer)
</script>

<template>
    <div
        data-talos-tool-activity
        :data-tool-status="activity.status"
        class="flex min-h-9 min-w-0 items-center gap-2 border-l-2 border-[var(--talos-border-strong)] px-3 py-1.5 text-xs text-[var(--talos-muted)]"
        :role="activity.status === 'failed' ? 'alert' : 'status'"
    >
        <CircleDashed v-if="activity.status === 'running'" class="h-3.5 w-3.5 shrink-0 text-[var(--talos-accent)]" />
        <CheckCircle2 v-else-if="activity.status === 'succeeded'" class="h-3.5 w-3.5 shrink-0 text-[var(--talos-success)]" />
        <XCircle v-else-if="activity.status === 'cancelled'" class="h-3.5 w-3.5 shrink-0" />
        <AlertCircle v-else class="h-3.5 w-3.5 shrink-0 text-[var(--talos-danger)]" />
        <span class="min-w-0 flex-1 truncate font-medium text-[var(--talos-text)]">{{ activity.name }}</span>
        <span class="shrink-0 font-mono tabular-nums">{{ elapsedSeconds }}s</span>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, CheckSquare, Loader2, Plus, RefreshCw } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import Surface from '../../ui/Surface.vue'
import { useTalosProductivity } from '../../../composables/useTalosProductivity'

const {
    tasks,
    loadingTasks,
    creatingTask,
    productivityError,
    loadTasks,
    createTask,
} = useTalosProductivity()

const title = ref('')
const runId = ref('')
const actionError = ref<string | null>(null)
const visibleError = computed(() => actionError.value || productivityError.value)
const canCreate = computed(() => title.value.trim().length > 0 && !creatingTask.value)

async function refreshTasks() {
    actionError.value = null

    try {
        await loadTasks()
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not refresh tasks.'
    }
}

async function submitTask() {
    if (!canCreate.value) {
        return
    }

    actionError.value = null

    try {
        await createTask({
            title: title.value.trim(),
            run_id: runId.value.trim() || null,
            priority: 'normal',
        })
        title.value = ''
        runId.value = ''
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not create this task.'
    }
}

function shortId(value: string | null | undefined) {
    return value ? value.slice(0, 12) : 'none'
}

onMounted(() => {
    void refreshTasks()
})
</script>

<template>
    <Surface>
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <CheckSquare class="h-4 w-4 text-[var(--talos-accent)]" />
                        Tasks
                    </div>
                    <h3 class="mt-1 text-base font-semibold text-[var(--talos-text)]">Run-linked tasks</h3>
                </div>
                <Button type="button" variant="ghost" size="sm" :disabled="loadingTasks" @click="refreshTasks">
                    <Loader2 v-if="loadingTasks" class="h-4 w-4 animate-spin" />
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

            <div class="grid gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <input v-model="title" class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none" placeholder="Task title">
                <input v-model="runId" class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 font-mono text-xs text-[var(--talos-text)] outline-none" placeholder="Optional run_id">
                <Button type="button" size="sm" :disabled="!canCreate" @click="submitTask">
                    <Loader2 v-if="creatingTask" class="h-4 w-4 animate-spin" />
                    <Plus v-else class="h-4 w-4" />
                    Add task
                </Button>
            </div>

            <div v-if="!tasks.length && !loadingTasks" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                No tasks returned by `/api/talos/tasks`.
            </div>

            <article v-for="task in tasks" :key="task.id" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                        <div class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ task.title }}</div>
                        <div class="mt-1 font-mono text-[11px] text-[var(--talos-muted)]">run_id {{ shortId(task.run_id) }}</div>
                    </div>
                    <Badge tone="neutral">{{ task.status }}</Badge>
                </div>
            </article>
        </div>
    </Surface>
</template>

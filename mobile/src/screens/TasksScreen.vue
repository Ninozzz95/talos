<script setup lang="ts">
/**
 * F5 station — desktop `TalosTasks` parity, local-first: run-linked tasks
 * (title, optional description and run_id) with a todo→doing→done cycle and
 * delete. Fully functional in airplane mode — rows live in the encrypted DB.
 */
import { computed, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { CheckSquare, Plus, Trash2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useChatController } from '@/stores/chatController'
import { talosRelativeTime } from '@/lib/relativeTime'
import type { TalosLocalTask } from '@/repositories/chatRepository'

const controller = useChatController()
const { t } = useTalosI18n()

const entries = ref<TalosLocalTask[]>([])
const error = ref<string | null>(null)
const title = ref('')
const description = ref('')
const runId = ref('')
const saving = ref(false)

const canCreate = computed(() => title.value.trim().length > 0 && !saving.value)
const relativeTimeLabels = computed(() => ({
    justNow: t('chat.justNow'),
    minutesAgo: (count: number) => t('chat.minutesAgo', { count }),
    hoursAgo: (count: number) => t('chat.hoursAgo', { count }),
    daysAgo: (count: number) => t('chat.daysAgo', { count }),
}))
function updatedAt(value: string): string {
    return talosRelativeTime(value, new Date(), relativeTimeLabels.value)
}

function describeError(cause: unknown): string {
    return cause instanceof Error && cause.message ? cause.message : String(cause)
}

async function refresh(): Promise<void> {
    try {
        entries.value = await controller.tasks.list()
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
        await controller.tasks.create({
            title: title.value.trim(),
            description: description.value.trim() || null,
            run_id: runId.value.trim() || null,
            priority: 'normal',
        })
        title.value = ''
        description.value = ''
        runId.value = ''
        await refresh()
    } catch (cause) {
        error.value = describeError(cause)
    } finally {
        saving.value = false
    }
}

const NEXT_STATUS = { todo: 'doing', doing: 'done', done: 'todo' } as const

async function cycleStatus(task: TalosLocalTask): Promise<void> {
    error.value = null
    try {
        await controller.tasks.setStatus(task.id, NEXT_STATUS[task.status])
        await refresh()
    } catch (cause) {
        error.value = describeError(cause)
    }
}

async function remove(task: TalosLocalTask): Promise<void> {
    error.value = null
    try {
        await controller.tasks.remove(task.id)
        await refresh()
    } catch (cause) {
        error.value = describeError(cause)
    }
}

function shortId(value: string | null): string {
    return value ? value.slice(0, 12) : t('tasks.noRun')
}
</script>

<template>
    <div class="flex min-h-full flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3" data-testid="talos-tasks-screen">
        <p class="text-xs leading-5 text-[var(--talos-muted)]">
            {{ t('tasks.intro') }}
        </p>

        <form class="flex flex-col gap-2 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3" @submit.prevent="submit">
            <input
                v-model="title"
                data-testid="talos-task-title"
                maxlength="255"
                :aria-label="t('tasks.title')"
                :placeholder="t('tasks.title')"
                class="min-h-11 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            >
            <textarea
                v-model="description"
                :aria-label="t('tasks.description')"
                :placeholder="t('tasks.descriptionOptional')"
                rows="2"
                class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 py-2 text-sm leading-5 text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            />
            <input
                v-model="runId"
                :aria-label="t('tasks.runIdOptional')"
                :placeholder="t('tasks.runIdPlaceholder')"
                class="min-h-11 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 font-mono text-xs text-[var(--talos-text)] outline-none"
            >
            <Button
                type="submit"
                data-testid="talos-task-save"
                :disabled="!canCreate"
                class="talos-pressable min-h-11 rounded-full bg-[var(--talos-accent,var(--primary))] text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))] disabled:opacity-50"
            >
                <Plus class="size-4" aria-hidden="true" />
                {{ t('tasks.add') }}
            </Button>
        </form>

        <p v-if="error" role="alert" class="text-xs text-[var(--talos-danger,#dc5b5b)]">{{ error }}</p>

        <p v-if="!entries.length" class="py-6 text-center text-sm text-[var(--talos-muted)]">
            {{ t('tasks.empty') }}
        </p>

        <ul v-else class="flex flex-col gap-2">
            <li
                v-for="task in entries"
                :key="task.id"
                data-testid="talos-task-row"
                :data-task-status="task.status"
                class="rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3"
            >
                <div class="flex items-start gap-2">
                    <CheckSquare class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                    <div class="min-w-0 flex-1">
                        <div class="text-sm font-semibold text-[var(--talos-text)]" :class="task.status === 'done' ? 'line-through opacity-60' : ''">
                            {{ task.title }}
                        </div>
                        <p v-if="task.description" class="mt-0.5 line-clamp-2 text-xs leading-5 text-[var(--talos-muted)]">{{ task.description }}</p>
                        <p class="mt-1 font-mono text-2xs text-[var(--talos-muted)]">
                            {{ t('tasks.runIdLabel') }} {{ shortId(task.run_id) }} · {{ updatedAt(task.updated_at) }}
                        </p>
                    </div>
                    <button
                        type="button"
                        :aria-label="t('tasks.cycleNamed', { title: task.title })"
                        class="talos-pressable min-h-11 rounded-full bg-[var(--talos-active)] px-3 text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]"
                        @click="cycleStatus(task)"
                    >
                        {{ t(`tasks.status.${task.status}`) }}
                    </button>
                    <button
                        type="button"
                        :aria-label="t('tasks.deleteNamed', { title: task.title })"
                        class="talos-pressable flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--talos-muted)]"
                        @click="remove(task)"
                    >
                        <Trash2 class="size-4" aria-hidden="true" />
                    </button>
                </div>
            </li>
        </ul>
    </div>
</template>

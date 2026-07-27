<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { Activity, RefreshCw } from '@lucide/vue'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import { useChatController } from '@/stores/chatController'
import { talosRelativeTime } from '@/lib/relativeTime'
import type { TalosRunState, TalosRunStatus } from '@/lib/runs/longRunState'

const controller = useChatController()
const runs = shallowRef<TalosRunState[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const activeCount = computed(() => runs.value.filter(
    (run) => run.status === 'planning' || run.status === 'running',
).length)

function errorMessage(cause: unknown): string {
    return cause instanceof Error && cause.message
        ? cause.message
        : 'TALOS could not read the local run history.'
}

async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
        runs.value = await controller.runs.list()
    } catch (cause) {
        error.value = errorMessage(cause)
    } finally {
        loading.value = false
    }
}

function statusTone(status: TalosRunStatus): string {
    if (status === 'done') return 'text-[var(--talos-success)]'
    if (status === 'failed') return 'text-[var(--talos-danger)]'
    if (status === 'cancelled') return 'text-[var(--talos-muted)]'
    if (status === 'awaiting_approval') return 'text-[var(--talos-warning)]'
    return 'text-[var(--talos-accent)]'
}

onMounted(refresh)
</script>

<template>
    <TalosMobileScreen title="Runtime cockpit" eyebrow="Runtime">
        <template #eyebrow-icon>
            <Activity class="h-4 w-4 text-[var(--talos-accent)]" aria-hidden="true" />
        </template>

        <div class="flex min-h-full flex-col gap-3 pt-3" data-testid="talos-runs-screen">
            <div class="flex items-center justify-between gap-3">
                <p class="text-xs leading-5 text-[var(--talos-muted)]">
                    {{ activeCount }} active · {{ runs.length }} stored on this device
                </p>
                <button
                    type="button"
                    aria-label="Refresh runs"
                    class="talos-pressable flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--talos-muted)] hover:bg-[var(--talos-active)] hover:text-[var(--talos-text)]"
                    :disabled="loading"
                    @click="refresh"
                >
                    <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" aria-hidden="true" />
                </button>
            </div>

            <p v-if="error" role="alert" class="rounded-xl border border-[var(--talos-danger)]/40 bg-[var(--talos-danger)]/10 p-3 text-sm text-[var(--talos-danger)]">
                {{ error }}
            </p>

            <p
                v-else-if="!loading && runs.length === 0"
                class="rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 px-4 py-7 text-center text-sm leading-6 text-[var(--talos-muted)]"
            >
                No runs stored on this device.
            </p>

            <ul v-else class="flex flex-col gap-2" aria-label="Stored runs">
                <li
                    v-for="run in runs"
                    :key="run.id"
                    data-testid="talos-run-row"
                    class="rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/75 p-3"
                >
                    <div class="flex items-start gap-3">
                        <span
                            class="mt-1.5 size-2 shrink-0 rounded-full bg-current"
                            :class="statusTone(run.status)"
                            aria-hidden="true"
                        />
                        <div class="min-w-0 flex-1">
                            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <h2 class="min-w-0 truncate text-sm font-semibold text-[var(--talos-text)]">
                                    {{ run.title }}
                                </h2>
                                <span class="font-mono text-2xs uppercase" :class="statusTone(run.status)">
                                    {{ run.status }}
                                </span>
                            </div>
                            <p class="mt-1 font-mono text-2xs uppercase text-[var(--talos-muted)]">
                                {{ run.kind }} · {{ run.engine }} · {{ run.steps.length }} checkpoints
                            </p>
                            <p class="mt-2 text-xs text-[var(--talos-muted)]">
                                {{ run.spend.searches }} searches · {{ run.spend.pages }} pages ·
                                {{ run.spend.tokens.toLocaleString() }} tokens
                            </p>
                            <p class="mt-1 text-2xs text-[var(--talos-muted)]">
                                Updated {{ talosRelativeTime(run.updatedAt) }}
                            </p>
                            <p v-if="run.failure" class="mt-2 line-clamp-2 text-xs text-[var(--talos-danger)]">
                                {{ run.failure }}
                            </p>
                        </div>
                    </div>
                </li>
            </ul>
        </div>
    </TalosMobileScreen>
</template>

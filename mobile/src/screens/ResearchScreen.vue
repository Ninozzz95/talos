<script setup lang="ts">
/**
 * R-1 — the station where a run can be watched, and killed, and picked up.
 *
 * Deliberately not the finished Deep Research surface: there is no plan to
 * approve, no cost to weigh, no dossier. The spec asks R-1 for "a fake run that
 * sleeps and resumes", and this is the smallest thing that lets a person prove
 * it with their own hands — start one, watch the steps land, kill the app from
 * the task switcher, come back, and find it offering to continue from where it
 * stopped rather than from the beginning.
 *
 * That gesture is the whole phase. Every step below is written to the journal
 * as it finishes, so what survives a kill is not a promise in a comment but a
 * row on disk.
 */
import { computed, onMounted, ref } from 'vue'
import { FileSearch, Play, RotateCcw } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import { useChatController } from '@/stores/chatController'
import type { TalosResearchRun } from '@/lib/research/researchRun'

const controller = useChatController()
const { t } = useTalosI18n()

const question = ref('')
const runs = ref<readonly TalosResearchRun[]>([])
const busy = ref(false)
const error = ref<string | null>(null)

const canStart = computed(() => question.value.trim().length > 0 && !busy.value)

/** Runs whose journal still owes work — the ones a kill left behind. */
const unfinished = ref<readonly TalosResearchRun[]>([])

async function refresh(): Promise<void> {
    try {
        runs.value = await controller.research.list()
        unfinished.value = await controller.research.unfinished()
        error.value = null
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure)
    }
}

onMounted(refresh)

async function start(): Promise<void> {
    if (!canStart.value) return
    busy.value = true
    try {
        // The progress callback repaints WHILE the run is going, so the steps
        // are visibly landing one at a time instead of appearing all at once at
        // the end — which is what would happen if this only refreshed after.
        await controller.research.start(question.value.trim(), (progress) => {
            runs.value = [progress.run, ...runs.value.filter((run) => run.id !== progress.run.id)]
        })
        question.value = ''
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure)
    } finally {
        busy.value = false
        await refresh()
    }
}

async function resume(runId: string): Promise<void> {
    busy.value = true
    try {
        await controller.research.resume(runId, (progress) => {
            runs.value = runs.value.map((run) => (run.id === progress.run.id ? progress.run : run))
        })
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure)
    } finally {
        busy.value = false
        await refresh()
    }
}

function doneCount(run: TalosResearchRun): number {
    return run.steps.filter((step) => step.state === 'done').length
}
</script>

<template>
    <TalosMobileScreen :title="t('stations.deepResearchTitle')" :eyebrow="t('stations.deepResearchEyebrow')">
        <template #eyebrow-icon>
            <FileSearch class="h-4 w-4 text-[var(--talos-accent)]" aria-hidden="true" />
        </template>

        <div class="space-y-4">
            <p class="text-sm leading-6 text-[var(--talos-muted)]">
                {{ t('research.phaseNote') }}
            </p>

            <div class="flex gap-2">
                <input
                    v-model="question"
                    type="text"
                    data-testid="talos-research-question"
                    :placeholder="t('research.questionPlaceholder')"
                    :aria-label="t('research.questionPlaceholder')"
                    class="min-h-11 flex-1 rounded-lg border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                >
                <Button data-testid="talos-research-start" :disabled="!canStart" @click="start()">
                    <Play class="h-4 w-4" aria-hidden="true" />
                    {{ t('research.start') }}
                </Button>
            </div>

            <p
                v-if="error"
                role="alert"
                data-testid="talos-research-error"
                class="text-xs text-[var(--talos-danger,var(--destructive))]"
            >
                {{ error }}
            </p>

            <!-- What a kill left behind. Shown above everything else because it
                 is the one thing the user cannot work out for themselves. -->
            <div
                v-for="run in unfinished"
                :key="`open-${run.id}`"
                data-testid="talos-research-unfinished"
                class="flex flex-wrap items-center gap-2 rounded-md border border-[var(--talos-accent)] bg-[var(--talos-panel-soft)] px-3 py-3 text-sm"
            >
                <span class="flex-1 text-[var(--talos-text)]">
                    {{ t('research.interrupted', { question: run.question, done: doneCount(run), total: run.plan.length }) }}
                </span>
                <Button variant="outline" :disabled="busy" @click="resume(run.id)">
                    <RotateCcw class="h-4 w-4" aria-hidden="true" />
                    {{ t('research.resume') }}
                </Button>
            </div>

            <div
                v-for="run in runs"
                :key="run.id"
                data-testid="talos-research-run"
                class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-3"
            >
                <div class="flex items-baseline justify-between gap-2">
                    <span class="text-sm text-[var(--talos-text)]">{{ run.question }}</span>
                    <span class="font-mono text-2xs text-[var(--talos-muted)]">
                        {{ doneCount(run) }}/{{ run.plan.length }} · {{ run.status }}
                    </span>
                </div>
                <ul class="mt-2 space-y-1">
                    <li
                        v-for="step in run.steps"
                        :key="step.id"
                        class="flex items-center justify-between gap-2 font-mono text-2xs text-[var(--talos-muted)]"
                    >
                        <span class="truncate">{{ step.id }}</span>
                        <span>{{ step.state }}<template v-if="step.attempts > 1"> ×{{ step.attempts }}</template></span>
                    </li>
                </ul>
            </div>
        </div>
    </TalosMobileScreen>
</template>

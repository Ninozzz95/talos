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
import { FileSearch, Play, Plus, RotateCcw, Trash2 } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import { useChatController } from '@/stores/chatController'
import type { TalosResearchBranch, TalosResearchDepth, TalosResearchRun } from '@/lib/research/researchRun'
import {
    TALOS_RESEARCH_DEPTHS,
    talosResearchPlanCost,
    talosResearchPlanFor,
    talosResearchPlanReworded,
    talosResearchPlanTotals,
    talosResearchPlanWith,
    talosResearchPlanWithout,
} from '@/lib/research/researchPlan'

const controller = useChatController()
const { t } = useTalosI18n()

const question = ref('')
const runs = ref<readonly TalosResearchRun[]>([])
const busy = ref(false)
const error = ref<string | null>(null)

const depth = ref<TalosResearchDepth>('quick')
const plan = ref<readonly TalosResearchBranch[]>([])
const addition = ref('')

const totals = computed(() => talosResearchPlanTotals(plan.value))
/**
 * No price is passed yet, and that is the honest state rather than a gap
 * papered over: OpenRouter publishes per-token rates we may read, the other
 * providers publish nothing machine-readable, and neither is wired here. So
 * the panel shows the WORK and says the money is not knowable — which is what
 * `talosResearchPlanCost` answers when it is given nothing.
 */
const cost = computed(() => talosResearchPlanCost(totals.value, null))

const canStart = computed(() => plan.value.length > 0 && !busy.value)

function propose(): void {
    if (question.value.trim().length === 0) return
    plan.value = talosResearchPlanFor(question.value, depth.value)
}

function chooseDepth(next: TalosResearchDepth): void {
    depth.value = next
    if (plan.value.length > 0) propose()
}

function dropBranch(branchId: string): void {
    plan.value = talosResearchPlanWithout(plan.value, branchId)
}

function addBranch(): void {
    if (addition.value.trim().length === 0) return
    plan.value = talosResearchPlanWith(plan.value, addition.value, depth.value)
    addition.value = ''
}

function reword(branchId: string, text: string): void {
    plan.value = talosResearchPlanReworded(plan.value, branchId, text)
}

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
        await controller.research.start({
            question: question.value.trim(),
            depth: depth.value,
            // The plan that RAN is the one the user approved, edits included.
            // Handing the runtime a fresh default here would quietly discard
            // everything they just changed, which is the whole of R-2.
            branches: plan.value,
        }, (progress) => {
            runs.value = [progress.run, ...runs.value.filter((run) => run.id !== progress.run.id)]
        })
        question.value = ''
        plan.value = []
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
                <Button data-testid="talos-research-propose" variant="outline" @click="propose()">
                    {{ t('research.propose') }}
                </Button>
            </div>

            <!-- The three levels are defaults, not cages: whatever they open,
                 the plan below stays editable. -->
            <div class="flex flex-wrap gap-2">
                <Button
                    v-for="profile in Object.values(TALOS_RESEARCH_DEPTHS)"
                    :key="profile.depth"
                    :data-testid="`talos-research-depth-${profile.depth}`"
                    :variant="depth === profile.depth ? 'default' : 'outline'"
                    @click="chooseDepth(profile.depth)"
                >
                    {{ t(`research.depth.${profile.depth}`) }}
                    <span class="font-mono text-2xs opacity-70">{{ profile.sources }} / {{ profile.minutes }}m</span>
                </Button>
            </div>

            <div
                v-if="plan.length > 0"
                data-testid="talos-research-plan"
                class="space-y-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-3"
            >
                <p class="text-xs uppercase tracking-wide text-[var(--talos-muted)]">{{ t('research.planTitle') }}</p>

                <div v-for="branch in plan" :key="branch.id" class="flex items-center gap-2">
                    <input
                        :value="branch.question"
                        type="text"
                        :aria-label="t('research.branchLabel')"
                        class="min-h-11 flex-1 rounded-lg border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                        @change="reword(branch.id, ($event.target as HTMLInputElement).value)"
                    >
                    <span class="font-mono text-2xs text-[var(--talos-muted)]">{{ branch.estimate.pages }}p</span>
                    <Button variant="ghost" :aria-label="t('research.removeBranch')" @click="dropBranch(branch.id)">
                        <Trash2 class="h-4 w-4" aria-hidden="true" />
                    </Button>
                </div>

                <div class="flex items-center gap-2">
                    <input
                        v-model="addition"
                        type="text"
                        data-testid="talos-research-add"
                        :placeholder="t('research.addBranch')"
                        :aria-label="t('research.addBranch')"
                        class="min-h-11 flex-1 rounded-lg border border-dashed border-[var(--talos-border)] bg-transparent px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                        @keyup.enter="addBranch()"
                    >
                    <Button variant="ghost" :aria-label="t('research.addBranch')" @click="addBranch()">
                        <Plus class="h-4 w-4" aria-hidden="true" />
                    </Button>
                </div>

                <!-- The work is always stated. The money only when a published
                     price was obtained - see `talosResearchPlanCost`. -->
                <p data-testid="talos-research-totals" class="font-mono text-2xs text-[var(--talos-muted)]">
                    {{ t('research.totals', {
                        branches: totals.branches,
                        searches: totals.searches,
                        pages: totals.pages,
                        minutes: totals.minutes,
                        tokens: totals.tokens,
                    }) }}
                </p>
                <p data-testid="talos-research-cost" class="font-mono text-2xs text-[var(--talos-muted)]">
                    <template v-if="cost.known">
                        {{ t('research.costKnown', { amount: cost.amount.toFixed(2), currency: cost.currency }) }}
                    </template>
                    <template v-else>
                        {{ t('research.costUnknown') }}
                    </template>
                </p>

                <Button data-testid="talos-research-start" :disabled="!canStart" class="w-full" @click="start()">
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

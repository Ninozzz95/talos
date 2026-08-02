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
import { ChevronDown, ChevronRight, FileSearch, Play, Plus, RotateCcw, Trash2 } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import { useChatController } from '@/stores/chatController'
import { useSettingsStore } from '@/stores/settings'
import type { TalosResearchBranch, TalosResearchDepth, TalosResearchRun } from '@/lib/research/researchRun'
import { talosResearchProgressOf } from '@/lib/research/researchRun'
import type { TalosResearchReportRecord } from '@/lib/research/researchReport'
import { talosResearchVerifiedStanding } from '@/lib/research/researchVerification'
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
const settings = useSettingsStore()
const { t } = useTalosI18n()

/**
 * R7 — the two models, picked by the person paying for them.
 *
 * One writes the report, one checks its citations, and they want opposite
 * things: the writer wants capability, the checker wants to be cheap enough to
 * run once per claim and independent of the writer. Every serious deep-research
 * implementation splits these (GPT Researcher has had them as separate settings
 * — provider included — since users asked for it), and the split is worthless
 * if the app makes the choice.
 *
 * Both default to null, which is a real answer and not an empty field: the
 * writer follows the composer, and the checker is picked automatically with the
 * device first. A stored copy of today's model would quietly stop tracking what
 * the person is actually using.
 */
const everyModel = computed(() => Object.values(controller.catalogs)
    .flatMap((catalog) => catalog.models.map((model) => ({
        value: `${model.provider}:${model.id}`,
        provider: model.provider,
        label: model.displayName || model.id,
    }))))

/** What the report writer will be, resolved the same way the run resolves it. */
const authorValue = computed(() => settings.state.research_models.author)
const judgeValue = computed(() => settings.state.research_models.judge)

/**
 * The writer cannot be offered as its own checker.
 *
 * A model reviewing its own work is up to 50% more likely to pass a criterion it
 * failed, so the run refuses it outright — and an option that will be refused is
 * an option that should never have been on screen.
 */
const judgeChoices = computed(() => everyModel.value.filter((entry) => entry.value !== authorValue.value))

/**
 * Same house, weaker guarantee — said, not blocked.
 *
 * Self-preference is measured to extend to a model's own family, not only to
 * itself, so a checker from the writer's provider is a real but softer
 * independence. That is the user's call to make with the fact in front of them.
 */
const sameHouse = computed(() => {
    const author = everyModel.value.find((entry) => entry.value === authorValue.value)
    const judge = everyModel.value.find((entry) => entry.value === judgeValue.value)
    return !!author && !!judge && author.provider === judge.provider
})

async function chooseAuthor(value: string): Promise<void> {
    await settings.setResearchModels({ author: value === '' ? null : value })
    // Whatever it was, the checker cannot be the writer.
    if (value !== '' && settings.state.research_models.judge === value) {
        await settings.setResearchModels({ judge: null })
    }
}

function chooseJudge(value: string): Promise<void> {
    return settings.setResearchModels({ judge: value === '' ? null : value })
}

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

/**
 * The one refusal this phase can produce on purpose, said in words.
 *
 * Everything else is passed through as it arrived — inventing a friendly
 * sentence for an error nobody has read yet would hide the only clue there is.
 * This one is different: it is OUR refusal, its cause is known, and it has a
 * remedy the user can act on.
 */
function reason(code: string): string {
    if (code === 'TALOS_RESEARCH_NO_SEARCH_SOURCE') return t('research.noSearchSource')
    // The other refusal we own, and the one a user can fix in ten seconds:
    // the model they picked in the composer could not hold the format.
    if (code === 'TALOS_RESEARCH_NO_CLAIMS') return t('research.noClaims')
    if (code === 'TALOS_RESEARCH_AUTHOR_UNAVAILABLE') return t('research.authorUnavailable')
    return code
}

/**
 * R-4 — the report, opened in layers.
 *
 * Five thousand words in a phone column is a wall, so the reader gets the answer
 * first, then the claims, and only opens a claim when they want to see what it
 * actually rests on. The layer that matters is the last one: the exact words
 * from the page, the verdict, and the name of whoever gave it — which is
 * information no other product can show, because it did not keep the passage.
 */
const openRunId = ref<string | null>(null)
const openReport = ref<TalosResearchReportRecord | null>(null)
const reportError = ref(false)
const openClaim = ref<number | null>(null)
const showSources = ref(false)

/** The report file the synthesis wrote, when there is one to read. */
function reportRef(run: TalosResearchRun): string | null {
    const synthesis = run.steps.find((step) => step.kind === 'synthesise' && step.state === 'done')
    return synthesis?.resultRef ?? null
}

async function toggleReport(run: TalosResearchRun): Promise<void> {
    if (openRunId.value === run.id) {
        openRunId.value = null
        openReport.value = null
        return
    }
    const ref_ = reportRef(run)
    if (!ref_) return
    openRunId.value = run.id
    openClaim.value = null
    showSources.value = false
    openReport.value = await controller.research.report(ref_)
    // Said out loud rather than shown as an empty panel: a report that will not
    // parse is a report whose verification cannot be trusted either.
    reportError.value = openReport.value === null
}

const standing = computed(() => (openReport.value ? talosResearchVerifiedStanding(
    openReport.value.claims.map((claim) => ({
        claim: { text: claim.text, sourceIndex: claim.sourceIndex, quote: '', quotePresent: 'yes' as const },
        passage: claim.passage,
        checks: claim.checks,
    })),
) : null))

/**
 * The judge the run had, taken from the record rather than from the claims.
 *
 * Reading it off the verdicts was wrong in a case that really happens: every
 * citation fails the mechanical check, no claim carries a judge, and the panel
 * announced that no independent judge was available — when one was sitting
 * right there. "Nothing needed judging" is not "nobody could judge".
 */
const judge = computed(() => openReport.value?.judge ?? null)

function verdictTone(support: string): string {
    if (support === 'yes') return 'text-[var(--talos-success)]'
    if (support === 'partial') return 'text-[var(--talos-warning)]'
    if (support === 'no') return 'text-[var(--talos-danger,var(--destructive))]'
    return 'text-[var(--talos-muted)]'
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

            <!-- R7 — the two models. Above the plan because they change what
                 the run costs and how much its verdicts are worth, and both of
                 those are decisions to make before spending, not after. -->
            <div
                data-testid="talos-research-models"
                class="space-y-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-3"
            >
                <p class="text-xs uppercase tracking-wide text-[var(--talos-muted)]">{{ t('research.modelsTitle') }}</p>

                <label class="block space-y-1">
                    <span class="text-xs text-[var(--talos-text)]">{{ t('research.authorLabel') }}</span>
                    <select
                        data-testid="talos-research-author"
                        :value="authorValue ?? ''"
                        class="min-h-11 w-full rounded-lg border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                        @change="chooseAuthor(($event.target as HTMLSelectElement).value)"
                    >
                        <option value="">{{ t('research.authorFollowsComposer') }}</option>
                        <option v-for="entry in everyModel" :key="entry.value" :value="entry.value">
                            {{ entry.provider }} · {{ entry.label }}
                        </option>
                    </select>
                </label>

                <label class="block space-y-1">
                    <span class="text-xs text-[var(--talos-text)]">{{ t('research.judgeLabel') }}</span>
                    <select
                        data-testid="talos-research-judge-choice"
                        :value="judgeValue ?? ''"
                        class="min-h-11 w-full rounded-lg border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                        @change="chooseJudge(($event.target as HTMLSelectElement).value)"
                    >
                        <option value="">{{ t('research.judgeAutomatic') }}</option>
                        <option v-for="entry in judgeChoices" :key="entry.value" :value="entry.value">
                            {{ entry.provider }} · {{ entry.label }}
                        </option>
                    </select>
                </label>

                <p class="text-2xs leading-5 text-[var(--talos-muted)]">{{ t('research.modelsNote') }}</p>
                <p
                    v-if="sameHouse"
                    data-testid="talos-research-same-house"
                    class="text-2xs leading-5 text-[var(--talos-warning)]"
                >
                    {{ t('research.sameHouse') }}
                </p>
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
                    {{ t('research.interrupted', {
                        question: run.question,
                        done: talosResearchProgressOf(run).done,
                        total: talosResearchProgressOf(run).total,
                    }) }}
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
                    <span data-testid="talos-research-progress" class="font-mono text-2xs tabular-nums text-[var(--talos-muted)]">
                        {{ talosResearchProgressOf(run).done }}/{{ talosResearchProgressOf(run).total }} · {{ run.status }}
                    </span>
                </div>
                <ul class="mt-2 space-y-1">
                    <li
                        v-for="step in run.steps"
                        :key="step.id"
                        class="font-mono text-2xs text-[var(--talos-muted)]"
                    >
                        <span class="flex items-center justify-between gap-2">
                            <span class="truncate">{{ step.id }}</span>
                            <span>{{ step.state }}<template v-if="step.attempts > 1"> ×{{ step.attempts }}</template></span>
                        </span>
                        <!-- Why it failed, beside the step that failed. "failed"
                             on its own is the same lie as "no models": it names
                             the outcome and hides the cause, and the cause is
                             the only part the user can act on. -->
                        <span
                            v-if="step.error"
                            data-testid="talos-research-step-error"
                            class="block pl-2 text-[var(--talos-danger,var(--destructive))]"
                        >{{ reason(step.error) }}</span>
                    </li>
                </ul>

                <!-- R8/R10 — the report opens in layers. Nothing below is
                     visible until it is asked for, because the answer is what
                     the reader came for and the evidence is what they come back
                     to when they doubt it. -->
                <Button
                    v-if="reportRef(run)"
                    data-testid="talos-research-open-report"
                    variant="ghost"
                    class="mt-2 w-full justify-start"
                    @click="toggleReport(run)"
                >
                    <component :is="openRunId === run.id ? ChevronDown : ChevronRight" class="h-4 w-4" aria-hidden="true" />
                    {{ openRunId === run.id ? t('research.closeReport') : t('research.openReport') }}
                </Button>

                <div v-if="openRunId === run.id" class="mt-2 space-y-3" data-testid="talos-research-report">
                    <p v-if="reportError" class="text-xs text-[var(--talos-danger,var(--destructive))]">
                        {{ t('research.reportUnreadable') }}
                    </p>

                    <template v-if="openReport">
                        <!-- Layer 1: the answer. -->
                        <p class="text-sm leading-6 text-[var(--talos-text)]">{{ openReport.summary }}</p>

                        <p data-testid="talos-research-standing" class="font-mono text-2xs tabular-nums text-[var(--talos-muted)]">
                            {{ t('research.standing', {
                                supported: standing?.supported ?? 0,
                                total: standing?.total ?? 0,
                                partial: standing?.partial ?? 0,
                                unsupported: standing?.unsupported ?? 0,
                                unchecked: standing?.unchecked ?? 0,
                            }) }}
                        </p>
                        <!-- The judge's name sits BESIDE the sentence, never
                             inside it. vue-i18n escapes parameters, so a name
                             holding a path came out as `&#x2F;storage&#x2F;…`
                             on the tablet — the second time this project has
                             paid for interpolating a path into a phrase. -->
                        <p class="text-2xs text-[var(--talos-muted)]">
                            <template v-if="judge">{{ t('research.verifiedByLead') }}</template>
                            <template v-else>{{ t('research.notVerified') }}</template>
                        </p>
                        <p v-if="judge" data-testid="talos-research-judge" class="break-all font-mono text-2xs text-[var(--talos-muted)]">
                            {{ judge }}
                        </p>

                        <!-- Layer 2: the claims, each with its verdict. -->
                        <div
                            v-for="(claim, index) in openReport.claims"
                            :key="`${run.id}-claim-${index}`"
                            data-testid="talos-research-claim"
                            class="rounded-md border border-[var(--talos-border)] px-2 py-2"
                        >
                            <button
                                type="button"
                                class="flex w-full items-start gap-2 text-left"
                                :aria-expanded="openClaim === index"
                                @click="openClaim = openClaim === index ? null : index"
                            >
                                <span class="flex-1 text-sm text-[var(--talos-text)]">{{ claim.text }}</span>
                                <span
                                    class="shrink-0 text-2xs"
                                    :class="verdictTone(claim.checks.claimSupported)"
                                >{{ t(`research.support.${claim.checks.claimSupported}`) }}</span>
                            </button>

                            <!-- Layer 3: the exact words the claim rests on. -->
                            <div v-if="openClaim === index" class="mt-2 space-y-1" data-testid="talos-research-passage">
                                <p
                                    v-if="claim.passage"
                                    class="border-l-2 border-[var(--talos-accent)] pl-2 text-xs italic leading-5 text-[var(--talos-text)]"
                                >{{ claim.passage }}</p>
                                <p v-else class="text-xs text-[var(--talos-danger,var(--destructive))]">
                                    {{ t('research.quoteMissing') }}
                                </p>
                                <p v-if="claim.checks.supportReason" class="text-2xs text-[var(--talos-muted)]">
                                    {{ claim.checks.supportReason }}
                                </p>
                                <a
                                    v-if="openReport.sources[claim.sourceIndex - 1]"
                                    :href="openReport.sources[claim.sourceIndex - 1]!.url"
                                    target="_blank"
                                    rel="noreferrer"
                                    class="block truncate text-2xs text-[var(--talos-accent)]"
                                >{{ openReport.sources[claim.sourceIndex - 1]!.title }}</a>
                                <p class="font-mono text-2xs text-[var(--talos-muted)]">
                                    {{ openReport.sources[claim.sourceIndex - 1]?.obtained === 'snippet'
                                        ? t('research.onlySnippet')
                                        : t('research.pageRead') }}
                                </p>
                            </div>
                        </div>

                        <!-- Layer 4: everything that was read. -->
                        <button
                            type="button"
                            class="flex w-full items-center gap-2 text-left text-xs text-[var(--talos-muted)]"
                            :aria-expanded="showSources"
                            @click="showSources = !showSources"
                        >
                            <component :is="showSources ? ChevronDown : ChevronRight" class="h-3 w-3" aria-hidden="true" />
                            {{ t('research.sourcesTitle', { count: openReport.sources.length }) }}
                        </button>
                        <ul v-if="showSources" class="space-y-1">
                            <li v-for="source in openReport.sources" :key="source.url" class="text-2xs">
                                <a
                                    :href="source.url"
                                    target="_blank"
                                    rel="noreferrer"
                                    class="block truncate text-[var(--talos-accent)]"
                                >{{ source.title }}</a>
                                <span class="font-mono text-[var(--talos-muted)]">
                                    {{ source.publishedAt ?? t('research.noDate') }} ·
                                    {{ source.obtained === 'snippet' ? t('research.onlySnippet') : t('research.pageRead') }}
                                </span>
                            </li>
                        </ul>
                    </template>
                </div>
            </div>
        </div>
    </TalosMobileScreen>
</template>

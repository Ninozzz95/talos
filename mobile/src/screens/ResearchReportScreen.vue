<script setup lang="ts">
/**
 * One research, at its own address.
 *
 * The report used to expand inside a row on the station — five thousand words
 * unfolding under a list. Owner 2026-08-03 asked for the card to lead somewhere,
 * and the competitor research puts "a page of its own" at L1: OpenAI, Gemini and
 * Perplexity all separated the document from the conversation, and only Claude
 * and Grok still answer with a long chat bubble.
 *
 * What leads the page is the BALANCE, not the source count. "12 supported, 3
 * partial, 1 contradicted" says whether the thing holds; "56 sources" says how
 * much was read, which is scale mistaken for support — and the research names
 * that as the single most copied mistake in the category.
 *
 * Below it the page splits in two, both registered surfaces so they inherit the
 * one strip, the swipe and the remembered choice: what it claims, and what it
 * read. Each row leads further in, because the claim and the source are the two
 * places where our evidence work is actually visible.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { talosResearchIsTerminal } from '@/lib/research/researchRun'
import { talosResearchReportRefOf } from '@/lib/research/researchCard'
import { useRoute, useRouter } from 'vue-router'
import { TabsContent } from 'reka-ui'
import { AlertTriangle, ChevronRight, Download, Play, RotateCcw } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import TalosThemedTabs from '@/components/talos/ui/TalosThemedTabs.vue'
import { useChatController } from '@/stores/chatController'
import { useTalosResearchRun } from '@/composables/useTalosResearchRun'
import { talosRememberView, talosRememberedView } from '@/lib/navigation/rememberedView'
import { talosResearchSolidity, type TalosResearchStanding } from '@/lib/research/researchCard'
import { talosResearchVerifiedStanding } from '@/lib/research/researchVerification'
import { talosResearchProgressOf } from '@/lib/research/researchRun'
import { talosResearchRecheckStanding, type TalosResearchRecheck } from '@/lib/research/researchRecheck'
import type { TalosResearchReportRecord } from '@/lib/research/researchReport'
import type { TalosResearchProgress } from '@/services/researchRuntime'

const route = useRoute()
const router = useRouter()
const controller = useChatController()
const { t } = useTalosI18n()

const runId = computed(() => String(route.params.id ?? ''))
const view = useTalosResearchRun(() => runId.value)
const { run, report, loading, missing, reportUnreadable } = view

const section = ref<string>(talosRememberedView('research-report') ?? 'claims')
function chooseSection(next: string): void {
    section.value = next
    talosRememberView('research-report', next)
}

/**
 * Live while it is live.
 *
 * The page has to work for a research that is still being made — that is where
 * "Avvia" now lands — so it subscribes to the registry like the station does,
 * and lets go on the way out without touching the run.
 */
const liveRun = ref<TalosResearchProgress | null>(null)
let unwatch: (() => void) | null = null

watch(runId, (id) => {
    unwatch?.()
    unwatch = null
    liveRun.value = null
    if (!id) return
    unwatch = controller.research.registry.watch(id, (progress) => {
        liveRun.value = progress
        /**
         * The report is loaded once, when the page mounts. A research that
         * FINISHES while you are watching it therefore had a report on disk and
         * a page that had never gone to look.
         *
         * Owner 2026-08-03: a run with Sonnet 5 as author read «conclusa senza
         * scrivere il rapporto». The report was complete — six claims, ten
         * sources, judged — and it appeared the moment the page was reopened
         * from the list. The engine had done its job; only the screen was
         * behind. Watching a thing has to include noticing that it arrived.
         */
        if (!view.report.value && talosResearchReportRefOf(progress.run)) void view.reload()
    })
}, { immediate: true })

onBeforeUnmount(() => unwatch?.())

const isRunning = computed(() => controller.research.registry.isRunning(runId.value))
const current = computed(() => liveRun.value?.run ?? run.value)
const progress = computed(() => (current.value ? talosResearchProgressOf(current.value) : null))

const standing = computed<TalosResearchStanding | null>(() => (report.value
    ? talosResearchVerifiedStanding(report.value.claims.map((claim) => ({
        claim: { text: claim.text, sourceIndex: claim.sourceIndex, quote: '', quotePresent: 'yes' as const },
        passage: claim.passage,
        checks: claim.checks,
    })))
    : null))

const solidity = computed(() => {
    const value = talosResearchSolidity(standing.value)
    return value === null ? null : Math.round(value * 100)
})

/** Which model judged this run — from the record, never inferred from the claims. */
const judge = computed(() => report.value?.judge ?? null)

const steps = computed(() => current.value?.steps ?? [])

const failedSteps = computed(() => current.value?.steps.filter((step) => step.state === 'failed') ?? [])

/**
 * What to say when there is no report — and there is always something to say.
 *
 * Each of these is a different situation for the person, and telling them apart
 * is the difference between "wait" and "do something". The old page said
 * nothing at all for the last two.
 */
const liveLine = computed(() => {
    const status = current.value?.status
    if (isRunning.value) return 'research.cardRunning'
    if (status === 'paused' || status === 'pause_requested') return 'research.pausedHere'
    if (status === 'cancelled') return 'research.cancelledHere'
    if (status === 'failed') return 'research.failedHere'
    if (status === 'done') return 'research.doneNoReport'
    return 'research.stopped'
})

/**
 * WHY a branch failed, not just how many did.
 *
 * The restructure very nearly dropped this: the new panel counted failures and
 * said nothing else, and "2 rami non sono riusciti" is a fact you can do
 * nothing with. Three of these codes are OUR OWN refusals with a remedy the
 * person can act on in seconds — no search source configured, the chosen model
 * could not hold the format, the author model is unreachable — so they are
 * spelled out. Anything else stays raw: inventing a friendly sentence for an
 * error nobody has read yet would hide the only clue there is.
 */
function reason(code: string): string {
    if (code === 'TALOS_RESEARCH_NO_SEARCH_SOURCE') return t('research.noSearchSource')
    if (code === 'TALOS_RESEARCH_NO_CLAIMS') return t('research.noClaims')
    if (code === 'TALOS_RESEARCH_AUTHOR_UNAVAILABLE') return t('research.authorUnavailable')
    // Prefix, not equality: the storage layer's own message is appended, and it
    // is the only clue about WHY the write failed.
    if (code.startsWith('TALOS_RESEARCH_REPORT_NOT_SAVED')) return t('research.reportNotSaved')
    return code
}

/** One line per distinct cause: five branches that died of the same thing are one problem. */
const failureReasons = computed(() => [...new Set(failedSteps.value
    .map((step) => step.error)
    .filter((code): code is string => typeof code === 'string' && code.length > 0))]
    .map(reason))

const rechecking = ref(false)
/**
 * R-5, kept through the restructure: the research was paid for once, so asking
 * more of it must not cost again.
 *
 * The re-check compares today's pages against the passages we stored — possible
 * only because we stored them — and the follow-up answers from those same
 * passages instead of searching the web. Both were nearly lost when this moved
 * out of the station and into a page; they are the reason the page is worth
 * more than a rendered document.
 */
const recheck = ref<TalosResearchRecheck | null>(null)
const recheckStanding = computed(() => (recheck.value ? talosResearchRecheckStanding(recheck.value) : null))
const followQuestion = ref('')
const followBusy = ref(false)
const followAnswer = ref<TalosResearchReportRecord | null>(null)
const exported = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)

async function resume(): Promise<void> {
    if (busy.value) return
    busy.value = true
    try {
        await controller.research.resume(runId.value)
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure)
    } finally {
        busy.value = false
    }
}

async function runRecheck(): Promise<void> {
    rechecking.value = true
    recheck.value = null
    try {
        recheck.value = await controller.research.recheck(runId.value)
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure)
    } finally {
        rechecking.value = false
    }
}

async function exportReport(): Promise<void> {
    const fileId = current.value ? (await import('@/lib/research/researchCard'))
        .talosResearchReportRefOf(current.value) : null
    if (!fileId || !current.value) return
    try {
        await controller.research.exportReport(fileId, `${current.value.question}.md`)
        exported.value = true
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure)
    }
}

async function askFollowUp(): Promise<void> {
    const question = followQuestion.value.trim()
    if (question.length === 0 || followBusy.value) return
    followBusy.value = true
    followAnswer.value = null
    try {
        const fileId = await controller.research.followUp(runId.value, question)
        // Read back what was FILED rather than keeping a copy in memory: the
        // answer shown is then literally the one in the Library, verdicts
        // included, and the two cannot disagree.
        followAnswer.value = fileId ? await controller.research.report(fileId) : null
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure)
    } finally {
        followBusy.value = false
    }
}

function openClaim(index: number): void {
    void router.push({ name: 'research-claim', params: { id: runId.value, index: String(index) } })
}

function openSource(index: number): void {
    void router.push({ name: 'research-source', params: { id: runId.value, index: String(index) } })
}
</script>

<template>
    <TalosMobileScreen :title="current?.question ?? t('stations.deepResearchTitle')" data-testid="talos-research-report-screen">
        <div class="flex flex-col gap-4">
            <p v-if="loading" class="text-sm text-[var(--talos-muted)]">{{ t('research.loading') }}</p>

            <p v-else-if="missing" data-testid="talos-research-missing" class="rounded-xl border border-[var(--talos-border)] p-4 text-sm text-[var(--talos-muted)]">
                {{ t('research.missing') }}
            </p>

            <template v-else>
                <!-- The balance first. What a report claims is worth less than
                     whether the claims stood, and every competitor leads with
                     the opposite. -->
                <section v-if="standing" data-testid="talos-research-balance" class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-4">
                    <p class="flex items-baseline gap-2">
                        <span class="text-3xl font-semibold tabular-nums text-[var(--talos-text)]">{{ solidity }}%</span>
                        <span class="text-xs text-[var(--talos-muted)]">{{ t('research.solidity') }}</span>
                    </p>
                    <p data-testid="talos-research-standing" class="mt-2 font-mono text-2xs leading-5 tabular-nums text-[var(--talos-muted)]">
                        {{ t('research.standing', {
                            supported: standing.supported,
                            total: standing.total,
                            partial: standing.partial,
                            unsupported: standing.unsupported,
                            unchecked: standing.unchecked,
                        }) }}
                    </p>
                    <p class="mt-2 text-2xs leading-5 text-[var(--talos-muted)]">
                        <template v-if="judge">{{ t('research.verifiedByLead') }} <span data-testid="talos-research-judge" class="break-all font-mono">{{ judge }}</span></template>
                        <template v-else>{{ t('research.notVerified') }}</template>
                    </p>
                </section>

                <!--
                    Shown whenever there is no finished report, which is not the
                    same as "still has branches left".

                    Owner 2026-08-03: a research that stopped after its branches
                    but before its report drew a COMPLETELY EMPTY page — five
                    sections, every one of them in a `v-else` that did not
                    apply. `done < total` was false because the synthesis had
                    not been recorded as a step yet, so the one thing that could
                    have spoken stayed silent. A page with nothing on it is
                    worse than an error: it gives the person nothing to do and
                    nothing to report.
                -->
                <section v-if="!report" data-testid="talos-research-live" class="rounded-xl border border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] p-3">
                    <p class="font-mono text-2xs tabular-nums text-[var(--talos-text)]">
                        {{ t(liveLine, { done: progress?.done ?? 0, total: progress?.total ?? 0 }) }}
                    </p>
                    <!-- A determinate bar only while the denominator is real.
                         A percentage of a plan that can still grow is theatre —
                         the one thing the competitor research said not to copy. -->
                    <div
                        v-if="progress && progress.total > 0"
                        class="mt-2 h-1 overflow-hidden rounded-full bg-[var(--talos-border)]"
                        role="progressbar"
                        :aria-valuemin="0"
                        :aria-valuemax="progress.total"
                        :aria-valuenow="progress.done"
                        :aria-valuetext="t('research.cardRunning', { done: progress.done, total: progress.total })"
                    >
                        <div
                            class="h-full rounded-full bg-[var(--talos-accent)] transition-[width] duration-500"
                            :style="{ width: `${Math.round((progress.done / progress.total) * 100)}%` }"
                        />
                    </div>
                    <Button v-if="!isRunning && !talosResearchIsTerminal(current?.status ?? 'planning')" data-testid="talos-research-resume" variant="outline" class="mt-2" :disabled="busy" @click="resume()">
                        <Play class="h-4 w-4" aria-hidden="true" />
                        {{ t('research.resume') }}
                    </Button>
                </section>

                <div v-if="failedSteps.length" data-testid="talos-research-failed-steps" class="flex items-start gap-2 rounded-xl border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-xs leading-5 text-[var(--talos-danger)]">
                    <AlertTriangle class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <div class="min-w-0 flex-1">
                        <p>{{ t(failedSteps.length === 1 ? 'research.branchesFailedOne' : 'research.branchesFailedMany', { count: failedSteps.length }) }}</p>
                        <!-- The reason, kept from the station this page replaced:
                             a count you can do nothing with is not a diagnosis. -->
                        <p
                            v-for="text in failureReasons"
                            :key="text"
                            data-testid="talos-research-step-error"
                            class="mt-1 break-words"
                        >{{ text }}</p>
                    </div>
                </div>

                <!--
                    The steps, openable, and shown by default when there is no
                    report to read instead.

                    The visual research of 2026-08-03 puts this at the centre of
                    the chosen direction: the plan and the record stay openable,
                    and on an error only the broken step expands — the way
                    GitHub Actions does it. It is also the thing that would have
                    told us, hours earlier, that a report had been written and
                    its reference lost: «conclusa senza scrivere il rapporto»
                    was all the page could say, and a person cannot report that.
                -->
                <details v-if="steps.length" data-testid="talos-research-activity" class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)]" :open="!report">
                    <summary class="talos-pressable min-h-11 cursor-pointer list-none px-3 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                        {{ t('research.activity') }}
                    </summary>
                    <ul class="flex flex-col gap-1 px-3 pb-3">
                        <li
                            v-for="step in steps"
                            :key="step.id"
                            data-testid="talos-research-activity-step"
                            class="flex items-baseline justify-between gap-3 font-mono text-2xs tabular-nums"
                        >
                            <span class="min-w-0 flex-1 truncate text-[var(--talos-text)]">{{ step.id }}</span>
                            <span :class="step.state === 'failed' ? 'text-[var(--talos-danger)]' : 'text-[var(--talos-muted)]'">
                                {{ t(`research.stepState.${step.state}`) }}
                            </span>
                            <!-- Whether the step left something behind is the
                                 difference between "it ran" and "it produced". -->
                            <span class="shrink-0 text-[var(--talos-muted)]">{{ step.resultRef ? '●' : '—' }}</span>
                        </li>
                    </ul>
                </details>

                <p v-if="reportUnreadable" data-testid="talos-research-unreadable" class="rounded-xl border border-[var(--talos-border)] p-3 text-sm text-[var(--talos-muted)]">
                    {{ t('research.reportUnreadable') }}
                </p>

                <template v-else-if="report">
                    <p class="text-sm leading-6 text-[var(--talos-text)]">{{ report.summary }}</p>

                    <TalosThemedTabs
                        surface="research-report"
                        :model-value="section"
                        :aria-label="t('research.reportSections')"
                        @update:model-value="chooseSection"
                    >
                        <TabsContent value="claims" data-research-section="claims" class="talos-motion-tab-panel flex flex-col gap-2 pt-3 outline-none">
                            <button
                                v-for="(claim, index) in report.claims"
                                :key="index"
                                type="button"
                                data-testid="talos-research-claim"
                                :data-claim-index="index"
                                class="talos-pressable flex items-start gap-2 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-left"
                                @click="openClaim(index)"
                            >
                                <span class="min-w-0 flex-1">
                                    <span class="block text-sm leading-5 text-[var(--talos-text)]">{{ claim.text }}</span>
                                    <span class="mt-1 block text-2xs text-[var(--talos-muted)]">{{ t(`research.support.${claim.checks.claimSupported}`) }}</span>
                                </span>
                                <ChevronRight class="mt-0.5 size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                            </button>
                        </TabsContent>

                        <TabsContent value="sources" data-research-section="sources" class="talos-motion-tab-panel flex flex-col gap-2 pt-3 outline-none">
                            <button
                                v-for="(source, index) in report.sources"
                                :key="index"
                                type="button"
                                data-testid="talos-research-source"
                                :data-source-index="index"
                                class="talos-pressable flex items-start gap-2 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-left"
                                @click="openSource(index)"
                            >
                                <span class="min-w-0 flex-1">
                                    <span class="block truncate text-sm text-[var(--talos-text)]">{{ source.title || source.url }}</span>
                                    <span class="mt-1 block font-mono text-2xs text-[var(--talos-muted)]">
                                        {{ source.publishedAt ?? t('research.noDate') }} ·
                                        {{ source.obtained === 'snippet' ? t('research.onlySnippet') : t('research.pageRead') }}
                                    </span>
                                </span>
                                <ChevronRight class="mt-0.5 size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                            </button>
                        </TabsContent>
                    </TalosThemedTabs>

                    <div class="flex flex-wrap gap-2">
                        <Button data-testid="talos-research-recheck" variant="outline" :disabled="rechecking" @click="runRecheck()">
                            <RotateCcw class="h-4 w-4" aria-hidden="true" />
                            {{ rechecking ? t('research.rechecking') : t('research.recheck') }}
                        </Button>
                        <Button data-testid="talos-research-export" variant="outline" @click="exportReport()">
                            <Download class="h-4 w-4" aria-hidden="true" />
                            {{ exported ? t('research.exported') : t('research.export') }}
                        </Button>
                    </div>

                    <div v-if="recheckStanding" data-testid="talos-research-recheck-result" class="space-y-1 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
                        <p class="font-mono text-2xs tabular-nums text-[var(--talos-muted)]">
                            {{ t('research.recheckLine', {
                                total: recheckStanding.total,
                                intact: recheckStanding.intact,
                                changed: recheckStanding.changed,
                                unreachable: recheckStanding.unreachable,
                            }) }}
                        </p>
                        <!-- The point of keeping the passages: a page that has
                             gone can still be read here. -->
                        <p class="text-2xs leading-5 text-[var(--talos-muted)]">{{ t('research.recheckStillReadable') }}</p>
                    </div>

                    <!-- Ask more of a research already paid for, answered from
                         the passages on disk rather than from the web. -->
                    <div class="space-y-2 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
                        <label class="block">
                            <span class="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ t('research.followUpTitle') }}</span>
                            <input
                                v-model="followQuestion"
                                type="text"
                                data-testid="talos-research-followup"
                                :placeholder="t('research.followUpPlaceholder')"
                                :aria-label="t('research.followUpTitle')"
                                class="min-h-11 w-full rounded-lg border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none"
                                @keyup.enter="askFollowUp()"
                            >
                        </label>
                        <Button data-testid="talos-research-followup-send" variant="outline" :disabled="followBusy" @click="askFollowUp()">
                            {{ followBusy ? t('research.followUpAsking') : t('research.followUpSend') }}
                        </Button>
                        <p v-if="followAnswer" data-testid="talos-research-followup-answer" class="space-y-1 text-sm leading-6 text-[var(--talos-text)]">
                            {{ followAnswer.summary }}
                            <span v-for="(claim, at) in followAnswer.claims" :key="at" class="mt-1 block text-2xs text-[var(--talos-muted)]">
                                {{ t(`research.support.${claim.checks.claimSupported}`) }}
                            </span>
                        </p>
                        <!-- Said where the money is: the answer costs nothing
                             new because it never leaves the passages on disk. -->
                        <p class="text-2xs leading-5 text-[var(--talos-muted)]">{{ t('research.followUpNote') }}</p>
                    </div>
                </template>

                <p v-if="error" role="alert" data-testid="talos-research-report-error" class="rounded-xl border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm text-[var(--talos-danger)]">
                    {{ error }}
                </p>
            </template>
        </div>
    </TalosMobileScreen>
</template>

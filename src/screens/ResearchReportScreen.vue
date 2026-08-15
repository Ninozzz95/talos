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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { talosResearchIsResting, talosResearchIsTerminal } from '@/lib/research/researchRun'
import { talosResearchReportRefOf } from '@/lib/research/researchCard'
import {
    talosResearchDuration,
    talosResearchElapsedSeconds,
    talosResearchOutline,
} from '@/lib/research/researchOutline'
import { talosResearchNarration, talosResearchStepTitle } from '@/lib/research/researchNarration'
import { talosPublishedOn } from '@/lib/publishedDate'
import { useRoute, useRouter } from 'vue-router'
import { TabsContent } from 'reka-ui'
import { AlertTriangle, ChevronRight, Download, MessageSquare, Pause, Play, RotateCcw } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import TalosThemedTabs from '@/components/talos/ui/TalosThemedTabs.vue'
import { useChatController } from '@/stores/chatController'
import { useTalosResearchRun } from '@/composables/useTalosResearchRun'
import { talosRememberView, talosRememberedView } from '@/lib/navigation/rememberedView'
import { talosResearchSolidity, type TalosResearchStanding } from '@/lib/research/researchCard'
import { talosResearchVerifiedStanding } from '@/lib/research/researchVerification'
import { talosResearchRecheckStanding, type TalosResearchRecheck } from '@/lib/research/researchRecheck'
import type { TalosResearchReportRecord } from '@/lib/research/researchReport'
import type { TalosResearchProgress } from '@/services/researchRuntime'

const route = useRoute()
const router = useRouter()
const controller = useChatController()
const { t, locale } = useTalosI18n()

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

/**
 * Everything the page says about a run in flight — all of it local, none of it
 * waiting for anything.
 *
 * Owner 2026-08-03, on the page this replaces: «non c'è un titolo hero, non c'è
 * un progresso di quello che si sta facendo … dei termini molto tecnici. Deve
 * essere production ready». The diagnosis was exact. The page said HOW MUCH —
 * `0/2`, `RACCOLGO`, `b1:search` — and never WHAT, which is the half a person
 * actually wants; and the material for that half was already on the run,
 * unused. The plan is approved before a penny is spent, so every branch carries
 * the question it went to answer, and the sentence writes itself from it.
 *
 * The visual research of the same day found that none of the five competitors
 * documents the first half-second of a run at all. Nothing here touches disk or
 * network, so ours cannot be late.
 */
const heading = computed(() => current.value?.title ?? current.value?.question ?? '')
/** Renaming keeps the question asked. Showing it is how that promise stays true. */
const renamed = computed(() => Boolean(current.value?.title))
const outline = computed(() => (current.value ? talosResearchOutline(current.value) : []))
const sectionsDone = computed(() => outline.value.filter((entry) => entry.state === 'done').length)
const ended = computed(() => talosResearchIsTerminal(current.value?.status ?? 'planning'))
const resting = computed(() => talosResearchIsResting(current.value?.status ?? 'planning'))
const say = computed(() => (current.value
    ? talosResearchNarration(current.value, isRunning.value)
    : { key: 'research.say.planning', params: {} }))

/**
 * The clock ticks from a timestamp on the RUN, not from a timer started when
 * this screen mounted: a research outlives every screen that watches it, and a
 * duration owned by a component would restart each time somebody looked.
 */
const nowIso = ref(new Date().toISOString())
let clock: ReturnType<typeof setInterval> | null = null
function stopClock(): void {
    if (clock === null) return
    clearInterval(clock)
    clock = null
}
// A finished research has a duration that cannot change, so a timer for it is a
// wake-up per second on a phone that buys nothing. It stops the moment the run
// ends under you, not only when the page closes.
onMounted(() => { if (!ended.value) clock = setInterval(() => { nowIso.value = new Date().toISOString() }, 1000) })
watch(ended, (over) => { if (over) stopClock() })
onBeforeUnmount(stopClock)

const elapsed = computed(() => (current.value
    ? talosResearchDuration(talosResearchElapsedSeconds(current.value, nowIso.value))
    : null))

const balance = computed(() => standing.value
    ?? { total: 0, supported: 0, partial: 0, unsupported: 0, unchecked: 0 })

const failedSteps = computed(() => current.value?.steps.filter((step) => step.state === 'failed') ?? [])

/**
 * The record, in names instead of identifiers.
 *
 * It stays — it is what ended an hours-long hunt on 2026-08-03, when the page
 * could only say «conclusa senza scrivere il rapporto» and the record showed
 * the synthesis had in fact produced one. But it printed `b1:search` and a `●`,
 * which are useful to exactly one reader, and he wrote them. Owner, same day:
 * closed, at the bottom, in words.
 */
const record = computed(() => steps.value.map((step) => ({
    id: step.id,
    state: step.state,
    saved: Boolean(step.resultRef),
    title: current.value ? talosResearchStepTitle(current.value, step) : null,
})))

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
    /*
     * Il prompt piu' lungo del contesto NON e' «non ha tenuto il formato».
     *
     * Misurato il 2026-08-04: con l'autore locale il passo falliva, e la frase
     * qui sotto dava la colpa al formato mandando a cambiare modello — mentre
     * il motore aveva rifiutato 11009 token in un contesto da 4096, e nessun
     * modello piu' capace avrebbe cambiato niente. Il rimedio vero e' un'altra
     * cosa, quindi e' un'altra frase.
     */
    if (code.startsWith('TALOS_LOCAL_PROMPT_TOO_LONG')) return t('research.promptTooLong')
    if (code.startsWith('TALOS_RESEARCH_NO_CLAIMS')) {
        // Il rifiuto porta con se' cosa e' arrivato: se c'e', si mostra, perche'
        // «non ha risposto niente» e «ha risposto un'altra cosa» mandano a fare
        // due cose diverse.
        const detto = code.slice('TALOS_RESEARCH_NO_CLAIMS:'.length).trim()
        return detto.length > 0
            ? `${t('research.noClaims')} ${t('research.modelSaid', { detail: detto })}`
            : t('research.noClaims')
    }
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

/**
 * Stopping it from the page it is running on.
 *
 * The station has had this in its row menu since the CRUD block; the page it
 * leads to had only Resume, so a research you were watching could be started
 * and followed from here but only stopped by going back. Pausing asks nothing
 * first — it takes nothing away — which is the same rule the station follows.
 */
async function pause(): Promise<void> {
    if (busy.value) return
    busy.value = true
    try {
        await controller.research.pause(runId.value)
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

/**
 * Leave for a chat about this research — an actual one.
 *
 * Owner 2026-08-03: «deve partire fisicamente una chat … esattamente come una
 * chat nuova, non deve essere nella pagina della ricerca». The navigation is
 * the point as much as the session is: the report page is not where a
 * conversation belongs, so this ends by leaving it.
 */
const openingChat = ref(false)
async function openChat(): Promise<void> {
    if (openingChat.value) return
    openingChat.value = true
    try {
        await controller.research.openChat(runId.value)
        await router.push({ name: 'chat' })
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure)
    } finally {
        openingChat.value = false
    }
}

/**
 * Esportare: prima la domanda «a chi lo stai dando».
 *
 * Owner 2026-08-03: «quando clicchi per generare il pdf appare un popup che ti
 * fa scegliere il "tono" del pdf tra 3 template».
 *
 * I tre sono documenti diversi per FORMA, non tre tavolozze — vedi
 * `researchPdf.ts` per il perche' proprio quei tre. Il .md resta in fondo,
 * sottovoce: e' quello che serve a chi vuole il testo per aprirlo altrove, e
 * toglierlo per fare posto alla novita' sarebbe una perdita travestita da
 * riordino.
 */
const exportOpen = ref(false)
const exportBusy = ref<string | null>(null)

const EXPORT_CHOICES = [
    { id: 'report', label: 'research.pdfToneReport', why: 'research.pdfToneReportWhy' },
    { id: 'brief', label: 'research.pdfToneBrief', why: 'research.pdfToneBriefWhy' },
    { id: 'dossier', label: 'research.pdfToneDossier', why: 'research.pdfToneDossierWhy' },
    { id: 'md', label: 'research.pdfMarkdown', why: 'research.pdfMarkdownWhy' },
] as const

async function reportFileId(): Promise<string | null> {
    return current.value
        ? (await import('@/lib/research/researchCard')).talosResearchReportRefOf(current.value)
        : null
}

/** Il nome del file: quello che si legge nella cartella Download fra un mese. */
function exportName(extension: string): string {
    const run = current.value
    return `${run?.title?.trim() || run?.question || 'ricerca'}.${extension}`
}

async function exportAs(choice: string): Promise<void> {
    if (exportBusy.value) return
    const fileId = await reportFileId()
    if (!fileId || !current.value) return
    exportBusy.value = choice
    error.value = null
    try {
        if (choice === 'md') await controller.research.exportReport(fileId, exportName('md'))
        else await controller.research.exportReportPdf(fileId, choice, exportName('pdf'))
        exported.value = true
        exportOpen.value = false
    } catch (failure) {
        // Detto per nome: un PDF che non si e' fatto e un popup che si chiude
        // da solo sono la stessa cosa vista da fuori.
        error.value = t('research.pdfFailed', {
            detail: failure instanceof Error ? failure.message : String(failure),
        })
    } finally {
        exportBusy.value = null
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
    <!-- The station name, not the question: inside the sheet this header hides
         and the question becomes the body's own <h1>, so passing it here would
         print the same title twice on the one surface that does show it. -->
    <TalosMobileScreen :title="t('stations.deepResearchTitle')" data-testid="talos-research-report-screen">
        <div class="flex flex-col gap-4">
            <p v-if="loading" class="text-sm text-[var(--talos-muted)]">{{ t('research.loading') }}</p>

            <p v-else-if="missing" data-testid="talos-research-missing" class="rounded-xl border border-[var(--talos-border)] p-4 text-sm text-[var(--talos-muted)]">
                {{ t('research.missing') }}
            </p>

            <template v-else>
                <!--
                    The question, first and large.

                    Owner 2026-08-03: «non c'è un titolo hero». True — the
                    question lived only in the sheet chrome, truncated, while
                    the page opened on a status badge in monospaced capitals. A
                    research IS a question being answered, so the question is
                    this document's title and belongs where a title goes.
                -->
                <header data-testid="talos-research-hero" class="pt-4">
                    <h1 class="talos-title text-xl font-semibold leading-7 text-[var(--talos-text)]">{{ heading }}</h1>
                    <p v-if="renamed" data-testid="talos-research-asked-question" class="mt-1 text-2xs leading-5 text-[var(--talos-muted)]">
                        {{ t('research.askedQuestion', { question: current?.question ?? '' }) }}
                    </p>

                    <!--
                        What it is doing, in a sentence, named after the branch
                        it is on. `role="status"` announces it without moving
                        the focus — the visual research asks for exactly this
                        and for nothing more theatrical.
                    -->
                    <p
                        data-testid="talos-research-say"
                        role="status"
                        class="mt-3 text-sm leading-6 text-[var(--talos-text)]"
                    >{{ t(say.key, say.params) }}</p>

                    <p data-testid="talos-research-meta" class="mt-1 flex flex-wrap items-baseline gap-x-2 text-2xs leading-5 text-[var(--talos-muted)]">
                        <span v-if="elapsed" data-testid="talos-research-elapsed">
                            {{ ended ? t('research.endedAfter', { elapsed }) : t('research.runningSince', { elapsed }) }}
                        </span>
                        <!-- The separator is its own element so the flex gap
                             falls on BOTH sides of it. Glued to the text it
                             read «1 min 14 s  ·2 di 2 sezioni» on the tablet. -->
                        <span v-if="elapsed && outline.length" aria-hidden="true">·</span>
                        <span v-if="outline.length">{{ t('research.sectionsDone', { done: sectionsDone, total: outline.length }) }}</span>
                    </p>

                    <!-- One control, and only the one that applies. While it is
                         draining towards a checkpoint neither does: the pause
                         has been asked for and there is nothing left to press. -->
                    <Button v-if="isRunning && !resting" data-testid="talos-research-pause" variant="outline" class="mt-3" :disabled="busy" @click="pause()">
                        <Pause class="h-4 w-4" aria-hidden="true" />
                        {{ t('research.actionPause') }}
                    </Button>
                    <Button v-else-if="!isRunning && !ended" data-testid="talos-research-resume" variant="outline" class="mt-3" :disabled="busy" @click="resume()">
                        <Play class="h-4 w-4" aria-hidden="true" />
                        {{ t('research.resume') }}
                    </Button>
                </header>

                <!--
                    What a report claims is worth less than whether the claims
                    stood, and every competitor leads with the opposite: the
                    number of sources, which is scale mistaken for support.
                -->
                <section v-if="report" data-testid="talos-research-balance" class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-4">
                    <p class="flex items-baseline gap-2">
                        <span class="text-3xl font-semibold tabular-nums text-[var(--talos-text)]">{{ solidity === null ? '—' : `${solidity}%` }}</span>
                        <span class="text-xs text-[var(--talos-muted)]">{{ t('research.solidity') }}</span>
                    </p>
                    <p data-testid="talos-research-standing" class="mt-2 text-2xs leading-5 tabular-nums text-[var(--talos-muted)]">
                        {{ t('research.standing', {
                            supported: balance.supported,
                            total: balance.total,
                            partial: balance.partial,
                            unsupported: balance.unsupported,
                            unchecked: balance.unchecked,
                        }) }}
                    </p>
                    <p class="mt-2 text-2xs leading-5 text-[var(--talos-muted)]">
                        <template v-if="judge">{{ t('research.verifiedByLead') }} <span data-testid="talos-research-judge" class="break-all font-mono">{{ judge }}</span></template>
                        <template v-else>{{ t('research.notVerified') }}</template>
                    </p>
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
                    The document, before it exists: one section per approved
                    branch, each saying where it is. This is the answer to the
                    question the visual research found NOBODY answering — what to
                    draw in the first half-second — and it costs nothing, because
                    the plan was agreed before any money was spent.
                -->
                <section v-if="!report && outline.length" data-testid="talos-research-outline" class="flex flex-col gap-2">
                    <h2 class="text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ t('research.expectedSections') }}</h2>
                    <div
                        v-for="(entry, index) in outline"
                        :key="entry.id"
                        data-testid="talos-research-outline-section"
                        class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3"
                    >
                        <p class="flex items-baseline gap-2">
                            <span class="text-2xs tabular-nums text-[var(--talos-muted)]">{{ index + 1 }}</span>
                            <span class="min-w-0 flex-1 text-sm leading-5 text-[var(--talos-text)]">{{ entry.question }}</span>
                        </p>
                        <p
                            class="mt-1 text-2xs"
                            :class="entry.state === 'failed' ? 'text-[var(--talos-danger)]' : 'text-[var(--talos-muted)]'"
                        >{{ t(`research.sectionState.${entry.state}`) }}</p>
                    </div>
                </section>

                <!-- The one number that says what this product is for, promised
                     before it can be shown. A page that reveals it only at the
                     end teaches the reader to look for something else meanwhile. -->
                <p v-if="!report" data-testid="talos-research-balance-empty" class="text-2xs leading-5 text-[var(--talos-muted)]">
                    {{ t('research.balanceEmpty') }}
                </p>

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
                                    <span class="mt-1 block text-2xs text-[var(--talos-muted)]">
                                        {{ source.publishedAt ? talosPublishedOn(source.publishedAt, locale) : t('research.noDate') }} ·
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
                        <Button data-testid="talos-research-export" variant="outline" @click="exportOpen = true">
                            <Download class="h-4 w-4" aria-hidden="true" />
                            {{ exported ? t('research.exported') : t('research.export') }}
                        </Button>
                        <!-- Leaves this page on purpose: a conversation does not
                             belong inside a report. -->
                        <Button data-testid="talos-research-open-chat" variant="outline" :disabled="openingChat" @click="openChat()">
                            <MessageSquare class="h-4 w-4" aria-hidden="true" />
                            {{ openingChat ? t('research.openingChat') : t('research.openChat') }}
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
                                class="min-h-touch w-full rounded-lg border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none"
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

                <!--
                    The record, closed and last.

                    It stays, and for a reason worth stating: on 2026-08-03 the
                    page could only say «conclusa senza scrivere il rapporto»
                    while the record showed the synthesis had produced one, and
                    that line is what ended an hours-long hunt. But it is
                    evidence, not content — owner, same day: closed, at the
                    bottom, and in words rather than `b1:search`.

                    The visual research puts the same shape at the centre of the
                    chosen direction: plan and record openable, never dominant,
                    the way GitHub Actions keeps a workflow's log.
                -->
                <details v-if="record.length" data-testid="talos-research-activity" class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)]">
                    <summary class="talos-pressable min-h-touch cursor-pointer list-none px-3 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                        {{ t('research.howItWasBuilt') }}
                    </summary>
                    <ul class="flex flex-col gap-2 px-3 pb-3">
                        <li
                            v-for="entry in record"
                            :key="entry.id"
                            data-testid="talos-research-activity-step"
                            class="flex items-baseline justify-between gap-3 text-2xs leading-5"
                        >
                            <span class="min-w-0 flex-1 text-[var(--talos-text)]">{{ entry.title ? t(entry.title.key, entry.title.params) : entry.id }}</span>
                            <!-- Whether the step left something behind is the
                                 difference between "it ran" and "it produced". -->
                            <span class="shrink-0" :class="entry.state === 'failed' ? 'text-[var(--talos-danger)]' : 'text-[var(--talos-muted)]'">
                                {{ t(`research.stepState.${entry.state}`) }}<template v-if="entry.saved"> · {{ t('research.stepSaved') }}</template>
                            </span>
                        </li>
                    </ul>
                </details>

                <p v-if="error" role="alert" data-testid="talos-research-report-error" class="rounded-xl border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm text-[var(--talos-danger)]">
                    {{ error }}
                </p>
            </template>
        </div>

        <!-- Owner 2026-08-03: il popup che chiede il TONO. Quattro righe, ognuna
             con una frase che dice a chi serve: un elenco di nomi senza il
             «per chi» costringe ad aprirli tutti e tre per capire. -->
        <TalosMobileConfirmDialog
            v-if="exportOpen"
            :title="t('research.pdfTitle')"
            :description="t('research.pdfBody')"
            @close="exportOpen = false"
        >
            <div class="flex flex-col gap-2">
                <button
                    v-for="choice in EXPORT_CHOICES"
                    :key="choice.id"
                    type="button"
                    :data-testid="`talos-research-export-${choice.id}`"
                    :disabled="exportBusy !== null"
                    class="talos-pressable flex flex-col gap-0.5 rounded-xl border border-[var(--talos-border)] p-3 text-left disabled:opacity-60"
                    :class="choice.id === 'md' ? 'border-dashed' : ''"
                    @click="exportAs(choice.id)"
                >
                    <span class="text-sm font-medium text-[var(--talos-text)]">
                        {{ exportBusy === choice.id ? t('research.pdfBuilding') : t(choice.label) }}
                    </span>
                    <span class="text-2xs leading-4 text-[var(--talos-muted)]">{{ t(choice.why) }}</span>
                </button>
            </div>
            <template #footer>
                <Button variant="ghost" :disabled="exportBusy !== null" @click="exportOpen = false">
                    {{ t('common.cancel') }}
                </Button>
            </template>
        </TalosMobileConfirmDialog>
    </TalosMobileScreen>
</template>

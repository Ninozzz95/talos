<script setup lang="ts">
/**
 * Starting a research: the question, who writes it, who checks it, how deep,
 * and the plan you are allowed to change before anything is spent.
 *
 * This used to sit at the top of the station, so arriving at Deep Research
 * meant meeting a form before you had said you wanted one. Owner 2026-08-03:
 * the station reads like the chat list, and this is what the button on it
 * opens. Same controls, same rules, one decision per screen instead of all of
 * them at once.
 *
 * The competitor research (2026-08-03) puts a reviewable plan at L1 — ChatGPT
 * proposes one and Gemini offers "Edit plan" — and warns against making it look
 * like a technical form. So the question leads, and everything else is a
 * consequence of it.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Play, Plus, Trash2 } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import TalosThemedSelect, { type TalosThemedSelectItem } from '@/components/talos/ui/TalosThemedSelect.vue'
import { useChatController } from '@/stores/chatController'
import { useSettingsStore } from '@/stores/settings'
import type { TalosResearchBranch, TalosResearchDepth } from '@/lib/research/researchRun'
import {
    TALOS_RESEARCH_DEPTHS,
    talosResearchPlanCost,
    talosResearchPlanFor,
    talosResearchPlanReworded,
    talosResearchPlanTotals,
    talosResearchPlanWith,
    talosResearchPlanWithout,
    talosResearchSynthesisLoad,
} from '@/lib/research/researchPlan'

const controller = useChatController()
const settings = useSettingsStore()
const router = useRouter()
const { t } = useTalosI18n()

/**
 * R7 — the two models, picked by the person paying for them.
 *
 * One writes the report, one checks its citations, and they want opposite
 * things: the writer wants capability, the checker wants to be cheap enough to
 * run once per claim and independent of the writer. Both default to null, which
 * is a real answer and not an empty field: the writer follows the composer, and
 * the checker is picked automatically with the device first.
 */
const everyModel = computed(() => Object.values(controller.catalogs)
    .flatMap((catalog) => catalog.models.map((model) => ({
        value: `${model.provider}:${model.id}`,
        provider: model.provider,
        label: model.displayName || model.id,
    }))))

const authorValue = computed(() => settings.state.research_models.author)
const judgeValue = computed(() => settings.state.research_models.judge)

/**
 * The writer cannot be offered as its own checker. A model reviewing its own
 * work is up to 50% more likely to pass a criterion it failed, so the run
 * refuses it — and an option that will be refused should never be on screen.
 */
const judgeChoices = computed(() => everyModel.value.filter((entry) => entry.value !== authorValue.value))

function labelled(entry: { value: string; label: string; provider: string }): TalosThemedSelectItem {
    return { value: entry.value, label: `${entry.provider} · ${entry.label}` }
}
const authorItems = computed<TalosThemedSelectItem[]>(() => everyModel.value.map(labelled))
const judgeItems = computed<TalosThemedSelectItem[]>(() => judgeChoices.value.map(labelled))

/** Same house, weaker guarantee — said, not blocked. */
/**
 * L'autore gira sul dispositivo.
 *
 * Cambia due cose visibili, e vanno dette PRIMA di avviare: il piano si stringe
 * (vedi `talosResearchPlanFor`) e la scrittura richiede minuti invece di
 * secondi. Owner 2026-08-04, sull'avviso: dev'essere da prodotto — quindi dice
 * cosa si guadagna, quanto costa in numeri veri, e cosa fare.
 */
const localAuthor = computed(() => {
    const author = everyModel.value.find((entry) => entry.value === authorValue.value)
    return author?.provider === 'local'
})

/** I token che l'autore dovra' leggere in una volta, dal piano vero. */
const authorLoad = computed(() => talosResearchSynthesisLoad(plan.value))

/** Quante fonti apre davvero una profondita', con l'autore che c'e' adesso. */
function sourcesFor(profile: { depth: TalosResearchDepth, sources: number }): number {
    if (!localAuthor.value) return profile.sources
    return talosResearchPlanFor('x', profile.depth, true)
        .reduce((sum, branch) => sum + branch.estimate.pages, 0)
}

const sameHouse = computed(() => {
    const author = everyModel.value.find((entry) => entry.value === authorValue.value)
    const judge = everyModel.value.find((entry) => entry.value === judgeValue.value)
    return !!author && !!judge && author.provider === judge.provider
})

async function chooseAuthor(value: string): Promise<void> {
    await settings.setResearchModels({ author: value === '' ? null : value })
    if (value !== '' && settings.state.research_models.judge === value) {
        await settings.setResearchModels({ judge: null })
    }
}

function chooseJudge(value: string): Promise<void> {
    return settings.setResearchModels({ judge: value === '' ? null : value })
}

const question = ref('')
const depth = ref<TalosResearchDepth>('quick')
const plan = ref<readonly TalosResearchBranch[]>([])
const addition = ref('')
const busy = ref(false)
const error = ref<string | null>(null)

const totals = computed(() => talosResearchPlanTotals(plan.value))
/**
 * No price is passed yet, and that is the honest state rather than a gap papered
 * over: OpenRouter publishes per-token rates we may read, the other providers
 * publish nothing machine-readable, and neither is wired here.
 */
const cost = computed(() => talosResearchPlanCost(totals.value, null))

function propose(): void {
    if (question.value.trim().length === 0) return
    plan.value = talosResearchPlanFor(question.value, depth.value, localAuthor.value)
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

/**
 * Starts, then goes STRAIGHT to the research's own page.
 *
 * Not back to the list: you have just asked a question and the answer is being
 * made, so the place to be is the thing being made. The run keeps going whether
 * or not you stay — that is what the registry is for.
 */
async function start(): Promise<void> {
    // The button is only rendered once there is a plan, but a second tap while
    // the first is in flight would start the same research twice.
    if (plan.value.length === 0 || busy.value) return
    busy.value = true
    try {
        const { id } = await controller.research.start({
            question: question.value.trim(),
            depth: depth.value,
            // The plan that RUNS is the one approved here, edits included.
            branches: plan.value,
        })
        await router.replace({ name: 'research-report', params: { id } })
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure)
    } finally {
        busy.value = false
    }
}
</script>

<template>
    <TalosMobileScreen :title="t('research.newTitle')" data-testid="talos-research-new-screen">
        <div class="flex flex-col gap-4">
            <p class="text-xs leading-5 text-[var(--talos-muted)]">{{ t('research.phaseNote') }}</p>

            <label class="block">
                <span class="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                    {{ t('research.questionLabel') }}
                </span>
                <textarea
                    v-model="question"
                    rows="3"
                    data-testid="talos-research-question"
                    :placeholder="t('research.questionPlaceholder')"
                    :aria-label="t('research.questionPlaceholder')"
                    class="w-full rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                />
            </label>

            <!--
                One live action at a time, and it is always this one first.

                Found by walking the tablet on 2026-08-03: with a question typed
                and both models chosen, «Avvia» sat there in full accent colour
                and DISABLED, because `canStart` wants a plan and the plan only
                exists after «Pianifica». Nothing on the screen said so. Tapping
                the obvious primary button and having nothing whatsoever happen
                is, from the outside, indistinguishable from the app being
                broken — and it is very probably part of what owner 2026-08-03
                reported as «non riesco a fare partire una deep research».

                So the accent moves rather than the explanation being added: a
                dead control is worse than an absent one, and this screen's own
                promise is «one decision per screen instead of all of them at
                once».
            -->
            <Button
                data-testid="talos-research-propose"
                :variant="plan.length > 0 ? 'outline' : 'default'"
                class="w-full"
                @click="propose()"
            >
                {{ plan.length > 0 ? t('research.proposeAgain') : t('research.propose') }}
            </Button>

            <div data-testid="talos-research-models" class="space-y-2 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
                <p class="text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ t('research.modelsTitle') }}</p>

                <div class="space-y-1">
                    <span class="block text-xs text-[var(--talos-text)]">{{ t('research.authorLabel') }}</span>
                    <TalosThemedSelect
                        data-testid="talos-research-author"
                        :model-value="authorValue ?? ''"
                        :items="authorItems"
                        :none-label="t('research.authorFollowsComposer')"
                        :aria-label="t('research.authorLabel')"
                        @update:model-value="chooseAuthor"
                    />
                </div>

                <div class="space-y-1">
                    <span class="block text-xs text-[var(--talos-text)]">{{ t('research.judgeLabel') }}</span>
                    <TalosThemedSelect
                        data-testid="talos-research-judge-choice"
                        :model-value="judgeValue ?? ''"
                        :items="judgeItems"
                        :none-label="t('research.judgeAutomatic')"
                        :aria-label="t('research.judgeLabel')"
                        @update:model-value="chooseJudge"
                    />
                </div>

                <p class="text-2xs leading-5 text-[var(--talos-muted)]">{{ t('research.modelsNote') }}</p>
                <!-- Detto PRIMA di avviare, non dopo mezz'ora di attesa. Non e'
                     un allarme: e' il patto: niente esce dal telefono, in
                     cambio ci vuole tempo — con i numeri veri di questo piano. -->
                <div v-if="localAuthor" data-testid="talos-research-local-author" class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
                    <p class="text-sm font-medium text-[var(--talos-text)]">{{ t('research.localAuthorTitle') }}</p>
                    <p class="mt-1 text-2xs leading-5 text-[var(--talos-muted)]">
                        {{ t('research.localAuthorBody', { depth: t(`research.depth.${depth}`), tokens: authorLoad.toLocaleString() }) }}
                    </p>
                    <p class="mt-1 text-2xs leading-5 text-[var(--talos-muted)]">{{ t('research.localAuthorAdvice') }}</p>
                </div>

                <p v-if="sameHouse" data-testid="talos-research-same-house" class="text-2xs leading-5 text-[var(--talos-warning)]">
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
                    <!-- Il numero e' quello che SUCCEDERA', non quello del
                         listino. Con un autore sul dispositivo il piano si
                         stringe, e una linguetta che continua a promettere 80
                         fonti mentre il piano sotto ne fa 6 e' una
                         contraddizione visibile nella stessa schermata. -->
                    <span class="font-mono text-2xs opacity-70">{{ sourcesFor(profile) }} / {{ profile.minutes }}m</span>
                </Button>
            </div>

            <div v-if="plan.length > 0" data-testid="talos-research-plan" class="space-y-2 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
                <p class="text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ t('research.planTitle') }}</p>

                <div v-for="branch in plan" :key="branch.id" class="flex items-center gap-2">
                    <input
                        :value="branch.question"
                        type="text"
                        :aria-label="t('research.branchLabel')"
                        class="min-h-touch flex-1 rounded-lg border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
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
                        class="min-h-touch flex-1 rounded-lg border border-dashed border-[var(--talos-border)] bg-transparent px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                        @keyup.enter="addBranch()"
                    >
                    <Button variant="ghost" :aria-label="t('research.addBranch')" @click="addBranch()">
                        <Plus class="h-4 w-4" aria-hidden="true" />
                    </Button>
                </div>

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
                    <template v-else>{{ t('research.costUnknown') }}</template>
                </p>
            </div>

            <p v-if="error" role="alert" data-testid="talos-research-new-error" class="rounded-xl border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm text-[var(--talos-danger)]">
                {{ error }}
            </p>

            <!-- Only once there is something to start. Before that the plan
                 button above carries the accent, so the screen never shows a
                 primary action that does nothing when pressed. -->
            <Button v-if="plan.length > 0" data-testid="talos-research-start" :disabled="busy" class="w-full" @click="start()">
                <Play class="h-4 w-4" aria-hidden="true" />
                {{ busy ? t('research.starting') : t('research.start') }}
            </Button>
        </div>
    </TalosMobileScreen>
</template>

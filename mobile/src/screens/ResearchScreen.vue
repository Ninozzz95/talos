<script setup lang="ts">
/**
 * The research station: what you have asked, and how well the answers held.
 *
 * It used to be a form with a list of expandable rows under it — you arrived at
 * a station and the first thing it showed you was a text field, a model picker
 * and a plan editor, before you had said you wanted a new one. Owner
 * 2026-08-03: it should read like the chat list. So it does: a list you can
 * search and filter, a grid if you prefer one, a sentence when it is empty, and
 * one button to start something new.
 *
 * The card leads with the QUESTION and, once the report has been read, with the
 * evidence balance — never with the source count. The competitor research
 * (2026-08-03) found all five products lead with volume, "56 siti", and none of
 * them says whether the claims stood. Its own conclusion: the win is not more
 * citations, it is a better account of the relation between claim and evidence.
 *
 * The balance arrives late on purpose. Reading every report to paint a list
 * would make the list wait on the disk; instead the rows appear at once and
 * fill in behind, which is the only version that stays fast when there are
 * fifty of them.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, LayoutGrid, List, Plus, Search } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import TalosThemedFilter from '@/components/talos/ui/TalosThemedFilter.vue'
import { useChatController } from '@/stores/chatController'
import { useSettingsStore } from '@/stores/settings'
import type { TalosResearchRun } from '@/lib/research/researchRun'
import type { TalosResearchProgress } from '@/services/researchRuntime'
import {
    talosResearchCardOf,
    talosResearchFilterCards,
    talosResearchNeedsAttention,
    talosResearchReportRefOf,
    talosResearchSolidity,
    type TalosResearchBucket,
    type TalosResearchStanding,
} from '@/lib/research/researchCard'
import { talosResearchVerifiedStanding } from '@/lib/research/researchVerification'

const controller = useChatController()
const settings = useSettingsStore()
const router = useRouter()
const { t } = useTalosI18n()

const runs = ref<readonly TalosResearchRun[]>([])
const error = ref<string | null>(null)
const query = ref('')
const bucket = ref<TalosResearchBucket | 'all'>('all')
/** Filled behind the first paint — see the note at the top. */
const standings = ref(new Map<string, TalosResearchStanding>())

/**
 * Grid or list, remembered where the Library remembers its own.
 *
 * Same setting deliberately: the two stations are the same kind of place, and a
 * person who wants tiles wants tiles. A second preference would be a second
 * thing to keep in step.
 */
const layout = computed(() => settings.state.shell.library_view)
function chooseLayout(next: 'grid' | 'list'): void {
    void settings.setShell({ library_view: next })
}

const cards = computed(() => runs.value.map((run) => talosResearchCardOf(run, {
    isRunning: controller.research.registry.isRunning(run.id),
    standing: standings.value.get(run.id) ?? null,
})))

const shown = computed(() => talosResearchFilterCards(cards.value, bucket.value, query.value))

const BUCKETS: ReadonlyArray<TalosResearchBucket | 'all'> = ['all', 'running', 'paused', 'unfinished', 'done', 'failed']
const filterOptions = computed(() => BUCKETS.map((id) => ({
    value: id,
    label: t(`research.buckets.${id}`),
    testId: `talos-research-filter-${id}`,
})))

function chooseBucket(value: string): void {
    const found = BUCKETS.find((entry) => entry === value)
    if (found) bucket.value = found
}

function filterOptionClass(selected: boolean): string {
    const base = 'talos-pressable min-h-11 shrink-0 rounded-full px-3 text-sm transition-colors'
    return selected
        ? `${base} bg-[var(--talos-accent)] text-[var(--talos-accent-contrast,var(--primary-foreground))]`
        : `${base} border border-[var(--talos-border)] text-[var(--talos-muted)]`
}

async function refresh(): Promise<void> {
    try {
        runs.value = await controller.research.list()
        error.value = null
        void fillStandings()
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure)
    }
}

/**
 * Read the reports behind the list, one at a time, after it is on screen.
 *
 * A failure here costs a balance, never a row: a report that will not parse is
 * a card without a verdict, which is honest, rather than a station that will
 * not open.
 */
async function fillStandings(): Promise<void> {
    for (const run of runs.value) {
        if (standings.value.has(run.id)) continue
        const ref_ = talosResearchReportRefOf(run)
        if (!ref_) continue
        const report = await controller.research.report(ref_).catch(() => null)
        if (!report) continue
        const standing = talosResearchVerifiedStanding(report.claims.map((claim) => ({
            claim: { text: claim.text, sourceIndex: claim.sourceIndex, quote: '', quotePresent: 'yes' as const },
            passage: claim.passage,
            checks: claim.checks,
        })))
        // A new Map so the computed above actually notices.
        standings.value = new Map(standings.value).set(run.id, standing)
    }
}

/** Watchers on the runs in flight, dropped on the way out — never the runs themselves. */
const watching = new Map<string, () => void>()

function absorb(progress: TalosResearchProgress): void {
    runs.value = [progress.run, ...runs.value.filter((run) => run.id !== progress.run.id)]
}

function followRunning(): void {
    for (const runId of controller.research.registry.running()) {
        if (watching.has(runId)) continue
        watching.set(runId, controller.research.registry.watch(runId, absorb))
    }
}

onMounted(async () => {
    await refresh()
    followRunning()
})

onBeforeUnmount(() => {
    for (const stop of watching.values()) stop()
    watching.clear()
})

function open(id: string): void {
    void router.push({ name: 'research-report', params: { id } })
}

function startNew(): void {
    void router.push({ name: 'research-new' })
}

function solidityPercent(standing: TalosResearchStanding | null): number | null {
    const value = talosResearchSolidity(standing)
    return value === null ? null : Math.round(value * 100)
}

function when(iso: string): string {
    // Date only: a research is a thing you did on a day, and the minute it
    // started is noise in a list you are scanning.
    return new Date(iso).toLocaleDateString()
}
</script>

<template>
    <TalosMobileScreen :title="t('stations.deepResearchTitle')" data-testid="talos-research-screen">
        <div class="flex min-h-full flex-col gap-3">
            <label class="relative block">
                <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--talos-muted)]" aria-hidden="true" />
                <input
                    v-model="query"
                    type="search"
                    inputmode="search"
                    data-testid="talos-research-search"
                    :placeholder="t('research.searchPlaceholder')"
                    :aria-label="t('research.searchPlaceholder')"
                    class="min-h-12 w-full rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-9 pr-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                >
            </label>

            <div class="flex items-center gap-2">
                <TalosThemedFilter
                    class="min-w-0 flex-1"
                    group-class="flex gap-1 overflow-x-auto"
                    :model-value="bucket"
                    :options="filterOptions"
                    :group-label="t('research.filterLabel')"
                    :option-class="filterOptionClass"
                    @update:model-value="chooseBucket"
                />
                <!-- Two states, immediate effect, no Save: a switch by the rule,
                     drawn as the pair of icons every gallery uses. -->
                <button
                    type="button"
                    data-testid="talos-research-layout"
                    :aria-label="t(layout === 'grid' ? 'research.showAsList' : 'research.showAsGrid')"
                    class="talos-pressable inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--talos-border)] text-[var(--talos-muted)]"
                    @click="chooseLayout(layout === 'grid' ? 'list' : 'grid')"
                >
                    <List v-if="layout === 'grid'" class="size-4" aria-hidden="true" />
                    <LayoutGrid v-else class="size-4" aria-hidden="true" />
                </button>
            </div>

            <p v-if="error" role="alert" data-testid="talos-research-error" class="rounded-xl border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm text-[var(--talos-danger)]">
                {{ error }}
            </p>

            <!-- The empty state says what the station is FOR in one line. A
                 station that opens on an explanation nobody asked for is a
                 station people learn to scroll past. -->
            <div v-if="shown.length === 0" data-testid="talos-research-empty" class="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                <p class="text-sm text-[var(--talos-text)]">
                    {{ runs.length === 0 ? t('research.emptyTitle') : t('research.noMatches') }}
                </p>
                <p v-if="runs.length === 0" class="max-w-xs text-xs leading-5 text-[var(--talos-muted)]">
                    {{ t('research.emptyBody') }}
                </p>
            </div>

            <ul
                v-else
                data-testid="talos-research-list"
                :data-layout="layout"
                class="min-w-0"
                :class="layout === 'grid' ? 'grid grid-cols-2 gap-2 sm:grid-cols-3' : 'flex flex-col gap-2'"
            >
                <li v-for="card in shown" :key="card.id" class="min-w-0">
                    <button
                        type="button"
                        data-testid="talos-research-card"
                        :data-research-id="card.id"
                        :data-bucket="card.bucket"
                        class="talos-pressable flex h-full w-full flex-col gap-2 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-left"
                        @click="open(card.id)"
                    >
                        <span class="flex items-start gap-2">
                            <span class="min-w-0 flex-1 text-sm font-semibold leading-5 text-[var(--talos-text)]" :class="layout === 'grid' ? 'line-clamp-3' : 'line-clamp-2'">
                                {{ card.question }}
                            </span>
                            <AlertTriangle
                                v-if="talosResearchNeedsAttention(card)"
                                data-testid="talos-research-attention"
                                class="mt-0.5 size-4 shrink-0 text-[var(--talos-danger)]"
                                :aria-label="t('research.needsAttention')"
                            />
                        </span>

                        <!-- Running: what is happening. Finished: how it held.
                             Never the number of sources, which is scale and not
                             support. -->
                        <span v-if="card.bucket === 'running'" data-testid="talos-research-card-progress" class="font-mono text-2xs tabular-nums text-[var(--talos-accent)]">
                            {{ t('research.cardRunning', { done: card.done, total: card.total }) }}
                        </span>
                        <!-- `total > 0`, not merely "there is a standing": a
                             report that produced no claims has a standing of
                             all zeros, and a percentage of nothing rendered as
                             a bare "%" — seen on the device. -->
                        <span v-else-if="card.standing && card.standing.total > 0" data-testid="talos-research-card-standing" class="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-2xs tabular-nums text-[var(--talos-muted)]">
                            <span class="text-[var(--talos-text)]">{{ solidityPercent(card.standing) }}%</span>
                            <span>{{ t('research.cardStanding', {
                                supported: card.standing.supported,
                                partial: card.standing.partial,
                                unsupported: card.standing.unsupported,
                                unchecked: card.standing.unchecked,
                            }) }}</span>
                        </span>
                        <span v-else data-testid="talos-research-card-state" class="font-mono text-2xs text-[var(--talos-muted)]">
                            {{ t(`research.buckets.${card.bucket}`) }}
                        </span>

                        <span class="font-mono text-2xs text-[var(--talos-muted)]">{{ when(card.startedAt) }}</span>
                    </button>
                </li>
            </ul>
        </div>

        <button
            type="button"
            data-testid="talos-research-new-fab"
            :aria-label="t('research.newTitle')"
            class="talos-pressable fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-5 z-20 inline-flex size-14 items-center justify-center rounded-full bg-[var(--talos-accent)] text-[var(--talos-accent-contrast,var(--primary-foreground))] shadow-lg"
            @click="startNew"
        >
            <Plus class="size-6" aria-hidden="true" />
        </button>
    </TalosMobileScreen>
</template>

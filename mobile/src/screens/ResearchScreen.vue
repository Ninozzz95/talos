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
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, Check, CheckSquare, LayoutGrid, List, Loader2, Plus, Search, Trash2, X } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import TalosThemedFilter from '@/components/talos/ui/TalosThemedFilter.vue'
import { talosSortChipClass } from '@/lib/sortChip'
import TalosRowActions, { type TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import { Button } from '@/components/ui/button'
import { talosLightImpact } from '@/services/haptics'
import { useTalosBulkSelection } from '@/composables/useTalosBulkSelection'
import { useTalosDeferredBusy } from '@/composables/useTalosDeferredBusy'
import { useChatController } from '@/stores/chatController'
import { useSettingsStore } from '@/stores/settings'
import { talosResearchIsResting, talosResearchIsTerminal, type TalosResearchRun } from '@/lib/research/researchRun'
import type { TalosResearchProgress } from '@/services/researchRuntime'
import {
    talosResearchActionsFor,
    talosResearchCardOf,
    talosResearchFilterCards,
    talosResearchNeedsAttention,
    talosResearchReportRefOf,
    talosResearchSolidity,
    type TalosResearchAction,
    type TalosResearchBucket,
    type TalosResearchCard,
    type TalosResearchStanding,
} from '@/lib/research/researchCard'
import { talosResearchVerifiedStanding } from '@/lib/research/researchVerification'
import { TALOS_DANGER_ACTION_CLASS } from '@/lib/dangerAction'

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

const BUCKETS: ReadonlyArray<TalosResearchBucket | 'all'> = ['all', 'running', 'paused', 'unfinished', 'done', 'cancelled', 'failed']
const filterOptions = computed(() => BUCKETS.map((id) => ({
    value: id,
    label: t(`research.buckets.${id}`),
    testId: `talos-research-filter-${id}`,
})))

function chooseBucket(value: string): void {
    const found = BUCKETS.find((entry) => entry === value)
    if (found) bucket.value = found
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

/**
 * Runs the person asked to stop, until the answer arrives.
 *
 * Seen on the tablet 2026-08-03: a pause asked while the REPORT was being
 * written let that step finish — which is drain-then-checkpoint working, since
 * the call was already sent and already paid for — and the research completed.
 * Correct, and completely silent: the tap simply vanished. A stop that quietly
 * does nothing is worse than one that refuses, because the person will tap it
 * again on the next research and trust it less every time.
 */
const asked = new Set<string>()

function absorb(progress: TalosResearchProgress): void {
    const run = progress.run
    runs.value = [run, ...runs.value.filter((entry) => entry.id !== run.id)]

    if (!asked.has(run.id)) return
    if (talosResearchIsResting(run.status)) {
        // It stopped. The card says so; nothing to add.
        asked.delete(run.id)
    } else if (talosResearchIsTerminal(run.status)) {
        asked.delete(run.id)
        notice.value = run.status === 'done'
            ? t('research.finishedInstead')
            : null
    }
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

/**
 * The actions of a row, and the two questions they ask before doing anything.
 *
 * `busy` keeps one action at a time and only draws a wait that turns out to be
 * real — see the composable for why the two are separate. Errors are said out
 * loud rather than swallowed: an action that silently did nothing is worse than
 * one that failed, because the person will try it again.
 */
const busy = useTalosDeferredBusy()
const actionError = ref<string | null>(null)
const notice = ref<string | null>(null)

const renameTarget = ref<TalosResearchCard | null>(null)
const renameValue = ref('')
const renameField = ref<HTMLInputElement | null>(null)
const deleteTarget = ref<TalosResearchCard | null>(null)
const cancelTarget = ref<TalosResearchCard | null>(null)

const ACTION_LABEL: Record<TalosResearchAction, string> = {
    open: 'research.actionOpen',
    rename: 'research.actionRename',
    pause: 'research.actionPause',
    resume: 'research.actionResume',
    cancel: 'research.actionCancel',
    delete: 'research.actionDelete',
}

function menuFor(card: TalosResearchCard): TalosRowAction[] {
    return talosResearchActionsFor(card).map((action) => ({
        id: action,
        label: t(ACTION_LABEL[action]),
        danger: action === 'delete',
        testId: `talos-research-action-${action}`,
    }))
}

async function act(card: TalosResearchCard, action: string): Promise<void> {
    actionError.value = null
    notice.value = null
    switch (action) {
        case 'open': open(card.id); return
        case 'rename':
            renameTarget.value = card
            renameValue.value = card.renamed ? card.question : ''
            await nextTick()
            renameField.value?.focus()
            return
        // The two destructive ones ASK first. Pausing does not: it takes
        // nothing away, and a confirmation there would be friction guarding
        // nothing.
        case 'cancel': cancelTarget.value = card; return
        case 'delete': deleteTarget.value = card; return
        case 'pause':
            asked.add(card.id)
            await guarded(card.id, () => controller.research.pause(card.id), false)
            return
        case 'resume': await guarded(card.id, async () => {
            await controller.research.resume(card.id)
            followRunning()
        }, false); return
    }
}

/**
 * `reread` is false for the actions the LIVE registry already reports.
 *
 * The tablet showed why: tapping Pause on a running research changed nothing on
 * screen. The registry had reported `pause_requested` — the interval between
 * being asked and being able to comply — and the card had it for an instant,
 * before this function re-read the list from the journal and put back the
 * `collecting` the disk still held. The journal is right; it simply has not
 * heard yet, because the driver is the only writer and it is mid-step.
 */
async function guarded(key: string, work: () => Promise<unknown>, reread = true): Promise<void> {
    try {
        await busy.run(key, work)
        if (reread) await refresh()
    } catch (failure) {
        actionError.value = failure instanceof Error ? failure.message : String(failure)
    }
}

async function submitRename(): Promise<void> {
    const target = renameTarget.value
    if (!target) return
    const title = renameValue.value.trim()
    // Blank is not a title; it puts the question back, which is also what the
    // "Put the question back" button does. Either way the person chose it.
    await guarded(target.id, () => controller.research.rename(target.id, title.length === 0 ? null : title))
    renameTarget.value = null
}

async function confirmCancel(): Promise<void> {
    const target = cancelTarget.value
    if (!target) return
    await guarded(target.id, () => controller.research.cancel(target.id), false)
    cancelTarget.value = null
}

async function confirmDelete(): Promise<void> {
    const target = deleteTarget.value
    if (!target) return
    try {
        const removed = await busy.run(target.id, () => controller.research.remove(target.id))
        // Say what went. A delete that also took eighteen dossiers and said
        // nothing is a delete the person cannot check.
        if (removed) {
            notice.value = removed.length > 0
                ? t('research.deletedSources', { count: removed.length })
                : t('research.deletedAlone')
        }
        standings.value = new Map([...standings.value].filter(([id]) => id !== target.id))
        await refresh()
    } catch (failure) {
        actionError.value = failure instanceof Error ? failure.message : String(failure)
    }
    deleteTarget.value = null
}

/**
 * Selezionarne piu' di una, poi eliminarle.
 *
 * Il gesto del tieni-premuto era stato LIBERATO per questa funzione e poi non
 * costruita: tenere premuta una ricerca non faceva niente. La ricerca sulle
 * azioni di riga (2026-08-03) dice esattamente questo — il menu ⋮ e' la via
 * primaria per agire su UNA, e il tieni-premuto e' la SELEZIONE — quindi qui il
 * gesto non apre un secondo menu: accende il modo.
 *
 * Il modo e' lo stesso delle Chat e della Libreria, dalla stessa composable:
 * «2 selezionate» deve voler dire la stessa cosa ovunque, e chi ha imparato a
 * uscire da una selezione in un posto non deve reimpararlo qui.
 */
const bulk = useTalosBulkSelection()
const bulkDeleteOpen = ref(false)

/**
 * Una ricerca IN CORSO non si elimina — non e' una scelta di questa schermata,
 * e' `talosResearchActionsFor` che non offre `delete` mentre gira, perche' il
 * driver sta ancora scrivendo su quella voce del giornale.
 *
 * Quindi non si puo' nemmeno selezionare. L'alternativa — lasciarla spuntare e
 * poi saltarla in silenzio — direbbe alla persona che ha eliminato cinque cose
 * mentre ne sono andate quattro.
 */
function selectable(card: TalosResearchCard): boolean {
    return card.bucket !== 'running'
}

const selectableIds = computed(() => shown.value.filter(selectable).map((card) => card.id))

function tapCard(card: TalosResearchCard): void {
    // Nel modo selezione un tocco SPUNTA. Aprire la ricerca da qui sarebbe
    // un'altra azione travestita dallo stesso gesto.
    if (!bulk.active.value) { open(card.id); return }
    if (selectable(card)) bulk.toggle(card.id)
}

/**
 * Il tieni-premuto: 500 ms senza muovere il dito, come nelle Chat.
 *
 * Lo stesso `HOLD_SLOP_PX` esiste perche' senza tolleranza uno scorrimento
 * lento della lista accende la selezione, e senza il `touch-action: pan-y` sul
 * `li` la WebView manda `pointercancel` e il gesto non finisce mai — misurato
 * su questo telefono, non supposto.
 */
const HOLD_MS = 500
const HOLD_SLOP_PX = 10
let holdTimer: ReturnType<typeof setTimeout> | null = null
let holdOrigin: { x: number, y: number } | null = null
let suppressNextClick = false

function clearHold(): void {
    if (holdTimer !== null) clearTimeout(holdTimer)
    holdTimer = null
    holdOrigin = null
}

function onCardPointerDown(card: TalosResearchCard, event: PointerEvent): void {
    /**
     * Un gesto nuovo azzera la soppressione del gesto precedente.
     *
     * Visto sul OnePlus Pad 3 (2026-08-04): dopo un tieni-premuto il tocco
     * DOPO non spuntava niente. Il tieni-premuto alza la bandiera per mangiarsi
     * il proprio click — quello che chiude la pressione, che aprirebbe la
     * ricerca nell'istante in cui si accende la selezione — ma quel click a
     * volte non arriva mai, e la bandiera resta alzata ad aspettarlo: se la
     * mangia il tocco successivo, che era legittimo.
     *
     * Sta PRIMA dell'uscita anticipata di proposito: nel modo selezione il
     * gesto non fa altro, ma la bandiera va comunque abbassata.
     */
    suppressNextClick = false
    if (bulk.active.value) return
    clearHold()
    holdOrigin = { x: event.clientX, y: event.clientY }
    holdTimer = setTimeout(() => {
        void talosLightImpact()
        suppressNextClick = true
        // Se quella tenuta non si puo' eliminare il modo si accende comunque,
        // vuoto: il gesto resta scopribile, e la riga dice da se' perche' non
        // si spunta invece di ignorare il dito.
        bulk.enter(selectable(card) ? card.id : undefined)
        clearHold()
    }, HOLD_MS)
}

function onCardPointerMove(event: PointerEvent): void {
    if (!holdOrigin) return
    if (Math.abs(event.clientX - holdOrigin.x) > HOLD_SLOP_PX
        || Math.abs(event.clientY - holdOrigin.y) > HOLD_SLOP_PX) clearHold()
}

function onCardPointerEnd(): void {
    clearHold()
}

function onCardClickCapture(event: Event): void {
    // Il click che chiude il tieni-premuto arriverebbe sulla carta e aprirebbe
    // la ricerca nell'istante in cui la selezione si accende.
    if (!suppressNextClick) return
    suppressNextClick = false
    event.stopPropagation()
    event.preventDefault()
}

async function confirmBulkDelete(): Promise<void> {
    const ids = bulk.ids.value
    if (ids.length === 0) return
    actionError.value = null
    notice.value = null
    let sources = 0
    const stubborn: string[] = []
    for (const id of ids) {
        try {
            const removed = await controller.research.remove(id)
            sources += removed?.length ?? 0
        } catch {
            // Una che si rifiuta non deve fermare il resto del gruppo.
            stubborn.push(id)
        }
    }
    const done = ids.length - stubborn.length
    // Si dice quante sono andate E quante no: un'eliminazione di gruppo che
    // tace sui rifiuti e' un'eliminazione che la persona non puo' verificare.
    const parts: string[] = []
    if (done > 0) {
        parts.push(sources > 0
            ? t('research.bulkDeletedSources', { count: done, sources })
            : t('research.bulkDeleted', { count: done }))
    }
    if (stubborn.length > 0) parts.push(t('research.bulkDeleteFailed', { count: stubborn.length }))
    notice.value = parts.length > 0 ? parts.join(' ') : null
    standings.value = new Map([...standings.value].filter(([id]) => !ids.includes(id) || stubborn.includes(id)))
    bulkDeleteOpen.value = false
    await refresh()
    // Quello che e' sopravvissuto resta spuntato; il resto non deve restare un
    // conteggio di righe che non esistono piu'.
    bulk.reconcile(runs.value.map((run) => run.id))
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
                    :option-class="talosSortChipClass"
                    @update:model-value="chooseBucket"
                />
                <!-- Two states, immediate effect, no Save: a switch by the rule,
                     drawn as the pair of icons every gallery uses. -->
                <!-- Owner sulle Chat, chiesto due volte: se nella selezione si
                     entra solo tenendo premuto, non la trova nessuno. Sta dove
                     un comando di selezione si cerca, e sparisce mentre il modo
                     e' acceso perche' la barra sotto possiede gia' l'uscita. -->
                <button
                    v-if="!bulk.active.value && selectableIds.length > 0"
                    type="button"
                    data-testid="talos-research-select-header"
                    :aria-label="t('research.selectResearches')"
                    class="talos-pressable inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--talos-border)] text-[var(--talos-muted)]"
                    @click="bulk.enter()"
                >
                    <CheckSquare class="size-4" aria-hidden="true" />
                </button>
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

            <!-- La barra della selezione: mentre il modo e' acceso la schermata
                 ha UN significato solo. -->
            <div
                v-if="bulk.active.value"
                data-testid="talos-research-selection-bar"
                class="flex items-center gap-1 rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] py-1 pl-1 pr-2"
            >
                <Button type="button" size="icon" variant="ghost" class="min-h-touch min-w-touch rounded-full" :aria-label="t('research.cancelSelection')" data-testid="talos-research-selection-exit" @click="bulk.exit()">
                    <X class="size-4" aria-hidden="true" />
                </Button>
                <span class="text-sm font-medium">{{ bulk.count.value === 1 ? t('research.selectedOne') : t('research.selected', { count: bulk.count.value }) }}</span>
                <Button type="button" variant="ghost" size="sm" class="ml-auto" data-testid="talos-research-select-all" @click="bulk.selectAll(selectableIds)">
                    {{ bulk.allSelected(selectableIds) ? t('common.none') : t('library.all') }}
                </Button>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    class="min-h-touch min-w-touch rounded-full text-[var(--talos-danger)]"
                    data-testid="talos-research-bulk-delete"
                    :aria-label="t('research.deleteSelected')"
                    :disabled="bulk.count.value === 0"
                    @click="bulkDeleteOpen = true"
                >
                    <Trash2 class="size-4" aria-hidden="true" />
                </Button>
            </div>

            <!-- Said without stealing the focus: a status message is heard,
                 never jumped to. -->
            <p v-if="notice" role="status" data-testid="talos-research-notice" class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-xs text-[var(--talos-muted)]">
                {{ notice }}
            </p>
            <p v-if="actionError" role="alert" data-testid="talos-research-action-error" class="rounded-xl border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm text-[var(--talos-danger)]">
                {{ actionError }}
            </p>

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
                <li
                    v-for="card in shown"
                    :key="card.id"
                    class="talos-holdable relative min-w-0 rounded-xl border bg-[var(--talos-panel)]"
                    :class="[
                        busy.visible.value === card.id ? 'opacity-60' : '',
                        bulk.isSelected(card.id) ? 'border-[var(--talos-accent)]' : 'border-[var(--talos-border)]',
                    ]"
                    :style="{ touchAction: 'pan-y' }"
                    @pointerdown="onCardPointerDown(card, $event)"
                    @pointermove="onCardPointerMove($event)"
                    @pointerup="onCardPointerEnd()"
                    @pointercancel="onCardPointerEnd()"
                    @click.capture="onCardClickCapture($event)"
                    @contextmenu.prevent
                >
                    <!-- The overflow button sits OUTSIDE the opening button.
                         Nesting them would make one hit area swallow the other,
                         and the research is explicit that the two must not
                         overlap: the text opens the research, the dots act on it. -->
                    <!-- Nel modo selezione il menu di riga sarebbe una seconda
                         via, contraddittoria: «Apri» porta via a meta'
                         selezione e il suo Elimina non riconcilia il
                         conteggio. Al suo posto la spunta. -->
                    <div v-if="!bulk.active.value" class="absolute right-1 top-1 z-10">
                        <TalosRowActions
                            :test-id="`talos-research-menu-${card.id}`"
                            :label="t('research.actionsFor', { title: card.question })"
                            :items="menuFor(card)"
                            @select="(action) => act(card, action)"
                        />
                    </div>
                    <button
                        type="button"
                        data-testid="talos-research-card"
                        :data-research-id="card.id"
                        :data-bucket="card.bucket"
                        :disabled="busy.pending.value === card.id"
                        class="talos-pressable flex h-full w-full flex-col gap-2 rounded-xl p-3 pr-12 text-left"
                        :aria-pressed="bulk.active.value && selectable(card) ? bulk.isSelected(card.id) : undefined"
                        @click="tapCard(card)"
                    >
                        <!-- Una in corso non si elimina, quindi non si spunta —
                             e lo DICE, invece di lasciare un cerchio che non
                             risponde al dito. -->
                        <span
                            v-if="bulk.active.value"
                            data-testid="talos-research-card-tick"
                            class="flex items-center gap-1.5 text-2xs text-[var(--talos-muted)]"
                        >
                            <span
                                v-if="selectable(card)"
                                class="flex size-5 shrink-0 items-center justify-center rounded-full border-2"
                                :class="bulk.isSelected(card.id) ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)] text-[var(--talos-accent-contrast,#000)]' : 'border-[var(--talos-border)]'"
                                aria-hidden="true"
                            >
                                <Check v-if="bulk.isSelected(card.id)" class="size-3.5" />
                            </span>
                            <template v-else>
                                <Loader2 class="size-3.5 animate-spin" aria-hidden="true" />
                                {{ t('research.runningNotSelectable') }}
                            </template>
                        </span>
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
                        <!-- Still working, but on its way to stopping. Saying
                             "in corso" here would make the tap look ignored;
                             saying "in pausa" would be a lie while a paid-for
                             step is still in flight. -->
                        <span v-if="card.status === 'pause_requested'" data-testid="talos-research-card-pausing" class="font-mono text-2xs tabular-nums text-[var(--talos-warning)]">
                            {{ t('research.pausing', { done: card.done, total: card.total }) }}
                        </span>
                        <span v-else-if="card.bucket === 'running'" data-testid="talos-research-card-progress" class="font-mono text-2xs tabular-nums text-[var(--talos-accent)]">
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

                        <span class="flex items-center gap-2 font-mono text-2xs text-[var(--talos-muted)]">
                            {{ when(card.startedAt) }}
                            <!-- Progress for a row lives ON the row, and appears
                                 only once the wait is real. See the composable. -->
                            <span v-if="busy.visible.value === card.id" class="inline-flex items-center gap-1 text-[var(--talos-accent)]">
                                <Loader2 class="size-3 animate-spin" aria-hidden="true" />
                                {{ t('research.working') }}
                            </span>
                        </span>
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

        <TalosMobileConfirmDialog
            v-if="renameTarget"
            :title="t('research.renameTitle')"
            :description="t('research.renameHint')"
            @close="renameTarget = null"
        >
            <label class="block text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]" for="talos-research-rename-field">
                {{ t('research.renameLabel') }}
            </label>
            <input
                id="talos-research-rename-field"
                ref="renameField"
                v-model="renameValue"
                type="text"
                maxlength="120"
                data-testid="talos-research-rename-field"
                :placeholder="renameTarget.originalQuestion"
                class="min-h-touch w-full rounded-lg border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                @keyup.enter="submitRename()"
            >
            <template #footer>
                <Button variant="ghost" @click="renameTarget = null">{{ t('common.cancel') }}</Button>
                <Button data-testid="talos-research-rename-save" @click="submitRename()">{{ t('common.save') }}</Button>
            </template>
        </TalosMobileConfirmDialog>

        <!-- Names the research and says what goes with it. "Are you sure?" gives
             a person nothing they can weigh. -->
        <!-- Chiede come quella singola, e per la stessa ragione: porta via
             anche i dossier delle fonti. -->
        <TalosMobileConfirmDialog
            v-if="bulkDeleteOpen"
            :title="t('research.bulkDeleteTitle', { count: bulk.count.value })"
            :description="t('research.bulkDeleteBody')"
            @close="bulkDeleteOpen = false"
        >
            <template #footer>
                <Button variant="ghost" @click="bulkDeleteOpen = false">{{ t('common.cancel') }}</Button>
                <Button variant="destructive" :class="TALOS_DANGER_ACTION_CLASS" data-testid="talos-research-bulk-delete-confirm" @click="confirmBulkDelete()">
                    {{ t('research.deleteConfirm') }}
                </Button>
            </template>
        </TalosMobileConfirmDialog>

        <TalosMobileConfirmDialog
            v-if="deleteTarget"
            :title="t('research.deleteTitle', { title: deleteTarget.question })"
            :description="deleteTarget.bucket === 'done' ? t('research.deleteBodyWithSources') : t('research.deleteBody')"
            @close="deleteTarget = null"
        >
            <template #footer>
                <Button variant="ghost" @click="deleteTarget = null">{{ t('common.cancel') }}</Button>
                <Button variant="destructive" :class="TALOS_DANGER_ACTION_CLASS" data-testid="talos-research-delete-confirm" @click="confirmDelete()">
                    {{ t('research.deleteConfirm') }}
                </Button>
            </template>
        </TalosMobileConfirmDialog>

        <!-- Cancelling is confirmed because it cannot be undone. Pausing is not,
             because it takes nothing away, and a confirmation there would be
             friction guarding nothing. -->
        <TalosMobileConfirmDialog
            v-if="cancelTarget"
            :title="t('research.cancelTitle', { title: cancelTarget.question })"
            :description="t('research.cancelBody')"
            @close="cancelTarget = null"
        >
            <template #footer>
                <Button variant="ghost" @click="cancelTarget = null">{{ t('research.cancelKeep') }}</Button>
                <Button variant="destructive" :class="TALOS_DANGER_ACTION_CLASS" data-testid="talos-research-cancel-confirm" @click="confirmCancel()">
                    {{ t('research.cancelConfirm') }}
                </Button>
            </template>
        </TalosMobileConfirmDialog>
    </TalosMobileScreen>
</template>

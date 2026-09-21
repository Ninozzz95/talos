<script setup lang="ts">
/**
 * F5 station — le attività, con la GRAMMATICA del resto dell'app.
 *
 * ## Cosa c'era, e perché non bastava
 *
 * Una lista sola, un campo di ricerca, un FAB. Nessun filtro, nessuna vista a
 * griglia, nessuna selezione multipla, nessun menu di riga — e la **priorità
 * non si vedeva**, benché sia un campo che si può impostare dalla chat e dalla
 * pagina. Visto sul Pad il 2026-08-07: un'attività messa a priorità alta da
 * GPT-5.6 Luna arrivava nella stazione indistinguibile da tutte le altre.
 *
 * Owner, lo stesso giorno: «linguaggio ui di attività uguale al resto, quindi
 * filtri griglia lista crud visivo hold to select etc».
 *
 * ## Perché si copia invece di inventare
 *
 * Perché due liste della stessa app che rispondono in modo diverso allo stesso
 * dito sono un difetto, non una varietà. Il tieni-premuto accende la SELEZIONE
 * e il ⋮ è la via primaria per agire su una riga sola — è la conclusione della
 * ricerca sulle azioni di riga del 2026-08-03, ed è già così nelle chat e nella
 * Ricerca. Le costanti del gesto sono le stesse: 500 ms, 10 px di tolleranza.
 */
import { computed, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import {
    CalendarClock, Check, CheckSquare, LayoutGrid, List, Plus, Search, Trash2, X,
} from '@lucide/vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import TalosRowActions, { type TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import { useChatController } from '@/stores/chatController'
import { useTalosBulkSelection } from '@/composables/useTalosBulkSelection'
import { talosLightImpact } from '@/services/haptics'
import { talosRelativeTime } from '@/lib/relativeTime'
import type { TalosLocalTask } from '@/repositories/chatRepository'
import { talosNextRunAt, talosParseSchedule } from '@/lib/tasks/schedule'

/**
 * Quando ripartirà, in una riga sola — o `null` se non è pianificata.
 *
 * Senza questo, una pianificazione salvata è INVISIBILE: si accende
 * l'interruttore, si salva, e l'elenco mostra una riga identica a tutte le
 * altre. Chi l'ha scritta non ha modo di sapere se ha funzionato se non
 * aspettando l'ora — cioè scoprendolo nel modo più lento possibile.
 */
function prossimaEsecuzione(task: TalosLocalTask): string | null {
    const schedule = talosParseSchedule(task.schedule_json)
    if (!schedule) return null
    const quando = talosNextRunAt(
        schedule,
        Date.now(),
        task.last_run_at ? Date.parse(task.last_run_at) : null,
    )
    if (quando === null) return null
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' })
        .format(new Date(quando))
}

const controller = useChatController()
const router = useRouter()
const { t } = useTalosI18n()

const entries = ref<TalosLocalTask[]>([])
const error = ref<string | null>(null)
const query = ref('')

/**
 * I filtri sono le linguette che la lista HA, non quelle che potrebbe avere.
 *
 * Tre stati e basta, perché tre sono gli stati di un'attività. Aggiungere
 * «urgenti» o «pianificate» qui sembrerebbe generoso e produrrebbe una fila di
 * pillole che nessuno legge: la priorità si vede sulla riga, e la pianificazione
 * pure.
 */
const FILTRI = ['all', 'todo', 'doing', 'done'] as const
type TalosTaskFilter = typeof FILTRI[number]
const filtro = ref<TalosTaskFilter>('all')

/**
 * Griglia o lista, come la Libreria. La griglia è la predefinita là perché i
 * file sono oggetti da riconoscere a colpo d'occhio; qui la predefinita è la
 * LISTA, perché un'attività si legge — è una frase, non una miniatura.
 */
const vista = ref<'list' | 'grid'>('list')

const shown = computed(() => {
    const termine = query.value.trim().toLowerCase()
    return entries.value.filter((task) => {
        if (filtro.value !== 'all' && task.status !== filtro.value) return false
        if (termine.length === 0) return true
        return (task.title ?? '').toLowerCase().includes(termine)
            || (task.description ?? '').toLowerCase().includes(termine)
    })
})

/** Quante ce ne sono per ogni linguetta: una pillola che non dice quante ne trova costringe a toccarla per scoprirlo. */
const conteggi = computed(() => ({
    all: entries.value.length,
    todo: entries.value.filter((task) => task.status === 'todo').length,
    doing: entries.value.filter((task) => task.status === 'doing').length,
    done: entries.value.filter((task) => task.status === 'done').length,
}))

const bulk = useTalosBulkSelection()
const bulkDeleteOpen = ref(false)
const visibleIds = computed(() => shown.value.map((task) => task.id))

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
        /*
         * ⛔ La selezione può solo significare ciò che è sullo schermo.
         *
         * Se un'attività sparisce — cancellata qui, o dalla chat mentre la
         * stazione è aperta — deve uscire anche dal conteggio, altrimenti «3
         * selezionate» parla di una che non c'è più e l'Elimina agisce su un
         * insieme che nessuno può vedere.
         */
        bulk.reconcile(entries.value.map((task) => task.id))
    } catch (cause) {
        error.value = describeError(cause)
    }
}

onMounted(refresh)

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

/** Le selezionate, in una passata sola: N cancellazioni in fila sono N ridisegni. */
async function removeSelected(): Promise<void> {
    error.value = null
    bulkDeleteOpen.value = false
    const ids = bulk.ids.value
    try {
        for (const id of ids) await controller.tasks.remove(id)
    } catch (cause) {
        error.value = describeError(cause)
    } finally {
        bulk.exit()
        await refresh()
    }
}

/** Voce → pagina → dettaglio, sempre nello stesso verso. */
function open(item: TalosLocalTask): void {
    void router.push({ name: 'task-item', params: { id: item.id } })
}

function startNew(): void {
    void router.push({ name: 'task-new' })
}

// Tieni-premuto: 500 ms senza muovere il dito. Accende la SELEZIONE — il menu
// di riga sta sotto il ⋮, che è visibile e non va scoperto. Stesse costanti
// delle chat e della Ricerca: un gesto che dura diversamente da schermata a
// schermata è un gesto che non si impara.
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

function onRowPointerDown(task: TalosLocalTask, event: PointerEvent): void {
    // Un gesto nuovo azzera la soppressione del precedente: la bandiera alzata
    // dal tieni-premuto aspetta un click che a volte non arriva mai, e senza
    // questa riga se lo mangia il tocco dopo.
    suppressNextClick = false
    if (bulk.active.value) return
    clearHold()
    holdOrigin = { x: event.clientX, y: event.clientY }
    holdTimer = setTimeout(() => {
        void talosLightImpact()
        suppressNextClick = true
        // La riga tenuta parte già spuntata: il dito era lì sopra, e un secondo
        // tocco per riprenderla sarebbe un passo per niente.
        bulk.enter(task.id)
        clearHold()
    }, HOLD_MS)
}

function onRowPointerMove(event: PointerEvent): void {
    if (!holdOrigin) return
    if (Math.abs(event.clientX - holdOrigin.x) > HOLD_SLOP_PX
        || Math.abs(event.clientY - holdOrigin.y) > HOLD_SLOP_PX) clearHold()
}

function onRowPointerEnd(): void {
    clearHold()
}

function onRowClickCapture(event: MouseEvent): void {
    // Il click che chiude il tieni-premuto fa parte del gesto.
    if (suppressNextClick) {
        suppressNextClick = false
        event.preventDefault()
        event.stopPropagation()
    }
}

/** In selezione un tocco SCEGLIE. Aprire da qui porterebbe via a metà scelta. */
function onRowClick(task: TalosLocalTask): void {
    if (bulk.active.value) bulk.toggle(task.id)
    else open(task)
}

function menuFor(task: TalosLocalTask): TalosRowAction[] {
    return [
        { id: 'open', label: t('common.open'), testId: 'talos-tasks-action-open' },
        {
            id: 'cycle',
            label: task.status === 'done' ? t('tasks.reopen') : t('tasks.markDone'),
            testId: 'talos-tasks-action-cycle',
        },
        { id: 'select', label: t('common.select'), testId: 'talos-tasks-action-select' },
        { id: 'delete', label: t('common.delete'), danger: true, testId: 'talos-tasks-action-delete' },
    ]
}

function act(task: TalosLocalTask, action: string): void {
    if (action === 'open') open(task)
    else if (action === 'cycle') void cycleStatus(task)
    else if (action === 'select') bulk.enter(task.id)
    else void remove(task)
}

function shortId(value: string | null): string {
    return value ? value.slice(0, 12) : t('tasks.noRun')
}

/**
 * ⛔ La priorità si VEDE, ed è il buco che ha aperto questo lavoro.
 *
 * È un campo che si imposta dalla pagina e dalla chat — MISURATO sul Pad il
 * 2026-08-07, con GPT-5.6 Luna che mette un'attività a «alta» — e nella
 * stazione non compariva da nessuna parte. Un campo che si può scrivere e non
 * si può leggere è peggio di un campo che non esiste: chi lo imposta crede di
 * aver fatto qualcosa.
 *
 * `normal` NON si mostra: è il valore che hanno quasi tutte, e una pillola su
 * ogni riga sarebbe rumore che insegna a non guardare le pillole.
 */
function priorityClass(priority: string): string {
    if (priority === 'high') return 'bg-[var(--talos-danger,#dc5b5b)]/15 text-[var(--talos-danger,#dc5b5b)]'
    return 'bg-[var(--talos-active)] text-[var(--talos-muted)]'
}
</script>

<template>
    <div
        class="flex min-h-full flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
        data-testid="talos-tasks-screen"
        @click.capture="onRowClickCapture"
    >
        <!-- Ricerca e vista sulla stessa riga: sono i due modi di restringere
             ciò che si guarda, e separarli farebbe scorrere per trovarne uno. -->
        <div class="flex items-center gap-2">
            <label class="relative block min-w-0 flex-1">
                <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--talos-muted)]" aria-hidden="true" />
                <input
                    v-model="query"
                    type="search"
                    inputmode="search"
                    data-testid="talos-tasks-search"
                    :placeholder="t('tasks.searchPlaceholder')"
                    :aria-label="t('tasks.searchPlaceholder')"
                    class="min-h-12 w-full rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-9 pr-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                >
            </label>
            <button
                type="button"
                data-testid="talos-tasks-view-toggle"
                :aria-label="vista === 'list' ? t('tasks.viewGrid') : t('tasks.viewList')"
                class="talos-pressable flex min-h-12 min-w-12 items-center justify-center rounded-full border border-[var(--talos-border)] text-[var(--talos-muted)]"
                @click="vista = vista === 'list' ? 'grid' : 'list'"
            >
                <LayoutGrid v-if="vista === 'list'" class="size-4" aria-hidden="true" />
                <List v-else class="size-4" aria-hidden="true" />
            </button>
        </div>

        <!-- Le linguette, col numero. Restano vive durante la selezione: la
             selezione può solo significare ciò che è sullo schermo, e
             `reconcile` la tiene onesta a ogni ricarica. -->
        <div class="flex flex-wrap gap-2" data-testid="talos-tasks-filters">
            <button
                v-for="voce in FILTRI"
                :key="voce"
                type="button"
                :data-testid="`talos-tasks-filter-${voce}`"
                :aria-pressed="filtro === voce"
                class="talos-pressable min-h-12 rounded-full px-3 text-sm transition-colors"
                :class="filtro === voce
                    ? 'bg-[var(--talos-accent)] text-[var(--talos-accent-contrast,var(--primary-foreground))]'
                    : 'border border-[var(--talos-border)] text-[var(--talos-muted)]'"
                @click="filtro = voce"
            >
                {{ voce === 'all' ? t('tasks.filterAll') : t(`tasks.status.${voce}`) }}
                <span class="ml-1 opacity-70">{{ conteggi[voce] }}</span>
            </button>
        </div>

        <div
            v-if="bulk.active.value"
            data-testid="talos-tasks-selection-bar"
            class="flex items-center gap-1 rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] py-1 pl-1 pr-2"
        >
            <Button type="button" size="icon" variant="ghost" class="min-h-touch min-w-touch rounded-full" :aria-label="t('tasks.cancelSelection')" @click="bulk.exit()">
                <X class="size-4" aria-hidden="true" />
            </Button>
            <span class="text-sm font-medium">
                {{ bulk.count.value === 1 ? t('tasks.selectedOne') : t('tasks.selected', { count: bulk.count.value }) }}
            </span>
            <Button type="button" variant="ghost" size="sm" class="ml-auto" @click="bulk.selectAll(visibleIds)">
                {{ bulk.allSelected(visibleIds) ? t('common.none') : t('library.all') }}
            </Button>
            <Button
                type="button"
                size="icon"
                variant="ghost"
                class="min-h-touch min-w-touch rounded-full text-[var(--talos-danger,#dc5b5b)]"
                data-testid="talos-tasks-bulk-delete"
                :aria-label="t('tasks.deleteSelected')"
                :disabled="bulk.count.value === 0"
                @click="bulkDeleteOpen = true"
            ><Trash2 class="size-4" aria-hidden="true" /></Button>
        </div>

        <p v-else class="text-xs leading-5 text-[var(--talos-muted)]">
            {{ t('tasks.intro') }}
        </p>

        <p v-if="error" role="alert" class="text-xs text-[var(--talos-danger,#dc5b5b)]">{{ error }}</p>

        <!-- «Nessuna» e «nessuna di quel tipo» sono frasi diverse, e dire la
             prima quando vale la seconda manda a creare un'attività che c'è già,
             solo in un'altra linguetta. -->
        <p v-if="!shown.length" class="py-6 text-center text-sm text-[var(--talos-muted)]">
            {{ entries.length === 0 ? t('tasks.empty') : t('tasks.emptyFiltered') }}
        </p>

        <ul
            v-else
            data-testid="talos-tasks-list"
            :data-view="vista"
            :class="vista === 'grid' ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-2'"
        >
            <li
                v-for="task in shown"
                :key="task.id"
                data-testid="talos-task-row"
                :data-task-status="task.status"
                :data-task-priority="task.priority"
                :data-selected="bulk.isSelected(task.id) ? 'true' : 'false'"
                class="rounded-2xl border bg-[var(--talos-panel)]/70 p-3 transition-colors"
                :class="bulk.isSelected(task.id)
                    ? 'border-[var(--talos-accent)]'
                    : 'border-[var(--talos-border)]'"
            >
                <div class="flex items-start gap-2">
                    <span
                        v-if="bulk.active.value"
                        class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2"
                        :class="bulk.isSelected(task.id)
                            ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)] text-[var(--talos-accent-contrast,#000)]'
                            : 'border-[var(--talos-border)]'"
                        aria-hidden="true"
                    >
                        <Check v-if="bulk.isSelected(task.id)" class="size-3.5" />
                    </span>
                    <CheckSquare v-else class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />

                    <!-- Il blocco di testo apre la pagina (o sceglie, in
                         selezione). Non tutta la riga: accanto ci sono dei
                         bottoni, e un bottone dentro un bottone non è HTML
                         valido — il tocco finirebbe a quello sbagliato. -->
                    <button
                        type="button"
                        data-testid="talos-task-open"
                        class="talos-pressable talos-holdable min-w-0 flex-1 text-left"
                        @pointerdown="onRowPointerDown(task, $event)"
                        @pointermove="onRowPointerMove"
                        @pointerup="onRowPointerEnd"
                        @pointercancel="onRowPointerEnd"
                        @click="onRowClick(task)"
                    >
                        <div class="text-sm font-semibold text-[var(--talos-text)]" :class="task.status === 'done' ? 'line-through opacity-60' : ''">
                            {{ task.title }}
                        </div>
                        <p v-if="task.description" class="mt-0.5 line-clamp-2 text-xs leading-5 text-[var(--talos-muted)]">{{ task.description }}</p>

                        <div class="mt-1 flex flex-wrap items-center gap-1">
                            <!-- `normal` non si mostra: è il valore che hanno
                                 quasi tutte, e una pillola su ogni riga sarebbe
                                 rumore che insegna a non guardare le pillole. -->
                            <span
                                v-if="task.priority !== 'normal'"
                                data-testid="talos-task-priority"
                                class="rounded-full px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide"
                                :class="priorityClass(task.priority)"
                            >{{ t(`tasks.priority.${task.priority}`) }}</span>

                            <template v-for="quando in [prossimaEsecuzione(task)]" :key="quando ?? 'mai'">
                                <span
                                    v-if="quando"
                                    data-testid="talos-task-next-run"
                                    class="inline-flex items-center gap-1 rounded-full bg-[var(--talos-active)] px-2 py-0.5 text-2xs text-[var(--talos-muted)]"
                                >
                                    <CalendarClock class="size-3 shrink-0" aria-hidden="true" />
                                    <!--
                                        L'etichetta passa da `t()`, la data NO.
                                        `escapeParameter` è acceso su tutta l'app —
                                        ed è giusto — ma riscrive anche le barre di
                                        una data `07/08/26`, che sul tablet si
                                        leggeva `07&#x2F;08&#x2F;26`.
                                    -->
                                    {{ t('tasks.schedule.nextRunLabel') }} {{ quando }}
                                </span>
                            </template>
                        </div>

                        <p v-if="vista === 'list'" class="mt-1 font-mono text-2xs text-[var(--talos-muted)]">
                            {{ t('tasks.runIdLabel') }} {{ shortId(task.run_id) }} · {{ updatedAt(task.updated_at) }}
                        </p>
                    </button>

                    <button
                        v-if="!bulk.active.value"
                        type="button"
                        :aria-label="t('tasks.cycleNamed', { title: task.title })"
                        class="talos-pressable min-h-touch shrink-0 rounded-full bg-[var(--talos-active)] px-3 text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]"
                        @click="cycleStatus(task)"
                    >
                        {{ t(`tasks.status.${task.status}`) }}
                    </button>

                    <!-- ⋮ è la via PRIMARIA per agire su una riga sola; il
                         tieni-premuto è la selezione. Sono i due ruoli decisi
                         dalla ricerca sulle azioni di riga, ed è così anche
                         nelle chat e nella Ricerca. -->
                    <TalosRowActions
                        v-if="!bulk.active.value"
                        :items="menuFor(task)"
                        :label="t('tasks.actionsNamed', { title: task.title })"
                        test-id="talos-tasks-row-actions"
                        @select="act(task, $event)"
                    />
                </div>
            </li>
        </ul>

        <TalosMobileConfirmDialog
            v-if="bulkDeleteOpen"
            :title="t('tasks.deleteSelected')"
            :description="bulk.count.value === 1
                ? t('tasks.deleteSelectedDescriptionOne')
                : t('tasks.deleteSelectedDescriptionMany', { count: bulk.count.value })"
            @close="bulkDeleteOpen = false"
        >
            <div class="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" @click="bulkDeleteOpen = false">{{ t('common.cancel') }}</Button>
                <Button
                    type="button"
                    data-testid="talos-tasks-bulk-delete-confirm"
                    class="bg-[var(--talos-danger,#dc5b5b)] text-white"
                    @click="removeSelected"
                >{{ t('common.delete') }}</Button>
            </div>
        </TalosMobileConfirmDialog>

        <!--
            Il FAB al posto del modulo sempre aperto.

            Visto sul tablet il 2026-08-06: il modulo occupava un terzo dello
            schermo sopra l'elenco, e sapeva creare MENO della pagina — non
            conosceva la pianificazione. Due porte per la stessa cosa, con
            poteri diversi.

            Una porta sola, e va dove ci sono tutti i campi. È la stessa
            grammatica delle Note e della Ricerca: FAB → pagina.
        -->
        <button
            v-if="!bulk.active.value"
            type="button"
            data-testid="talos-tasks-new-fab"
            :aria-label="t('tasks.add')"
            class="talos-pressable fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-5 z-20 inline-flex size-14 items-center justify-center rounded-full bg-[var(--talos-accent)] text-[var(--talos-accent-contrast,var(--primary-foreground))] shadow-lg"
            @click="startNew"
        >
            <Plus class="size-6" aria-hidden="true" />
        </button>
    </div>
</template>

<script setup lang="ts">
/**
 * Le Attività, nella forma del mockup «Talos Calm Finale» (owner 12/09/2026).
 *
 * La pagina si legge dall'alto in un ordine solo: **che posto è** (titolo e una
 * riga che dice a cosa serve), **come lo restringo** (ricerca e densità),
 * **cosa sto guardando** (i filtri col loro conteggio), **quante sono e in che
 * ordine**, e poi le attività. È lo stesso ordine delle Note, e deve esserlo:
 * due elenchi della stessa app che rispondono in modo diverso allo stesso dito
 * sono un difetto, non una varietà.
 *
 * ## Le regole dell'owner che il mockup NON cambia
 *
 * - La scheda e la riga APRONO l'attività (2026-08-04: «ogni scheda apre una
 *   pagina dedicata, il pulsante indietro va alla precedente, dev'essere
 *   lineare»).
 * - L'anteprima anticipa, non contiene.
 * - Due assenze diverse, due frasi diverse — «non ce ne sono» e «il filtro le
 *   nasconde» — e solo la seconda si può annullare. Più un terzo stato, «non lo
 *   so ancora», finché il deposito non ha risposto.
 * - Il modulo di creazione NON sta nell'elenco: è una pagina.
 * - Mai più di due azioni affiancate su un'attività (owner 10/09/2026): la
 *   casella e i tre puntini.
 * - Le colonne le decide la LARGHEZZA MINIMA LEGGIBILE, mai un numero (owner
 *   2026-08-06, dopo due correzioni sul tablet). Il mockup fissa tre colonne;
 *   qui vince l'owner, e il `clamp()` arriva comunque agli stessi numeri sulle
 *   due viewport che contano.
 * - Il tieni-premuto accende la SELEZIONE (500 ms, 10 px), il ⋯ è la via
 *   primaria per agire su una riga sola. Stesse costanti delle chat e della
 *   Ricerca: un gesto che dura diversamente da schermata a schermata è un gesto
 *   che non si impara.
 *
 * ## ⛔ I due punti in cui questa schermata si stacca da com'era
 *
 * 1. **Il FAB non c'è più.** «Nuova attività» è il pulsante primario del
 *    titolo, come nel mockup e come nelle Note: un cerchio che galleggia sopra
 *    l'ultima riga la copre, e su un elenco lungo copre proprio quella che si
 *    stava per toccare. Sul telefono resta un quadrato «+» con lo stesso nome
 *    accessibile, perché lì la riga del titolo è tutta la larghezza che c'è.
 * 2. **La casella non gira più su tre stati.** Faceva da fare → in corso →
 *    completata → da fare, e un controllo che gira non ha un verso: per tornare
 *    dov'era si tocca due volte. Adesso completa, e basta (owner 12/09/2026);
 *    «in corso» vive nel menu e nella pagina, dove vivono le decisioni.
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTalosI18n } from '@/i18n'
import { LayoutGrid, List, Plus, Search, SlidersHorizontal, Trash2, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import TalosMobileTaskCard from '@/components/talos/tasks/TalosMobileTaskCard.vue'
import TalosMobileTaskRow from '@/components/talos/tasks/TalosMobileTaskRow.vue'
import { useChatController } from '@/stores/chatController'
import { useTalosBulkSelection } from '@/composables/useTalosBulkSelection'
import { useTalosTabletLayout } from '@/composables/useTalosTabletLayout'
import { talosLightImpact } from '@/services/haptics'
import { talosNotify } from '@/stores/notificationCentre'
import { talosSfasamento } from '@/composables/useTalosCalmMotion'
import { useTalosSlidingIndicator } from '@/composables/useTalosSlidingIndicator'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'
import { talosTaskRowActions, type TalosTaskActionId } from '@/components/talos/tasks/taskActions'
import { exportTalosTaskText } from '@/components/talos/tasks/taskExport'
import {
    talosTaskChecklist,
    talosTaskMatchesFilter,
    talosTaskScheduleSummary,
    talosTaskSorted,
    talosTaskState,
    type TalosTaskFilter,
    type TalosTaskSort,
} from '@/components/talos/tasks/taskShape'
import type { TalosLocalTask } from '@/repositories/chatRepository'

const controller = useChatController()
const router = useRouter()
const { t, locale } = useTalosI18n()
const { isTablet } = useTalosTabletLayout()

const entries = ref<TalosLocalTask[]>([])
const error = ref<string | null>(null)
const query = ref('')

/**
 * ⛔ LO STATO VUOTO LAMPEGGIAVA nelle Note, e qui sarebbe lampeggiato uguale.
 *
 * `entries` parte da un array vuoto, e leggerlo come «non ce n'è nessuna» è
 * falso finché `controller.tasks.list()` non ha risposto: la verità è **«non
 * lo so ancora»**, e sono tre stati, non due. Uno schermo che afferma «non ci
 * sono attività» mentre ce ne sono sei non è un difetto estetico — è una
 * risposta sbagliata a una domanda appena fatta.
 *
 * Il segnale si alza nel `finally`: anche una lista che FALLISCE è una
 * risposta, e lasciarlo a falso terrebbe la pagina muta per sempre, con
 * l'errore scritto sopra un vuoto senza via d'uscita.
 */
const caricato = ref(false)

/**
 * ⛔ Filtro, ordinamento e densità vivono nella PAGINA, non nelle preferenze.
 *
 * Una ricerca lasciata accesa da ieri è il difetto opposto a quello che risolve:
 * si riapre la stazione e metà delle attività non c'è, senza che niente dica
 * perché. Il mockup li conserva perché è una demo che vive in un browser solo.
 *
 * 🔜 Debito dichiarato: se l'owner li vuole persistenti servono due chiavi in
 * `settings.shell`, che questo giro di lavoro non poteva toccare — è lo stesso
 * debito già scritto nelle Note.
 */
const filtro = ref<TalosTaskFilter>('all')
/**
 * ⛔ «Priorità» è l'ordinamento di SERIE, come nel mockup — ed è la scelta
 * giusta qui e non altrove: la domanda che si fa a un elenco di attività è «cosa
 * conta di più», non «cosa ho toccato per ultimo» (che è invece la domanda
 * giusta per le note).
 */
const ordine = ref<TalosTaskSort>('priority')
/**
 * ⛔ Le SCHEDE sono la densità di serie, e prima era la lista.
 *
 * Il file diceva «un'attività si legge, è una frase, non una miniatura», e per
 * la riga di prima era vero: titolo, due righe e un `run_id`. La scheda del
 * mockup non è una miniatura — porta lo stato, la barra dei punti spuntati,
 * quando riparte e la priorità, cioè tutto quello per cui si apriva la pagina.
 * Vince il mockup, che è la verità visiva approvata; la lista resta a un tocco.
 */
const vista = ref<'grid' | 'list'>('grid')

/** Le cinque linguette, con dentro il conto di quante ne trova ciascuna. */
const filtri = computed(() => ([
    { id: 'all' as const, label: t('tasks.filterAll') },
    { id: 'todo' as const, label: t('tasks.filterTodo') },
    { id: 'doing' as const, label: t('tasks.filterDoing') },
    { id: 'scheduled' as const, label: t('tasks.filterScheduled') },
    { id: 'done' as const, label: t('tasks.filterDone') },
].map((voce) => ({
    ...voce,
    // ⛔ I conteggi guardano TUTTE le attività, non quelle già ristrette dalla
    // ricerca: servono a decidere se vale la pena cambiare filtro, e un
    // «In corso 0» calcolato dentro una ricerca direbbe che non ce ne sono
    // mentre ce ne sono — solo, non per quella parola.
    count: entries.value.filter((task) => talosTaskMatchesFilter(task, voce.id)).length,
}))))

/** Filtra su cio' che una persona ricorda: le parole che ha scritto lei. */
const shown = computed(() => {
    const needle = query.value.trim().toLocaleLowerCase(locale.value)
    const tenute = entries.value.filter((task) => (
        talosTaskMatchesFilter(task, filtro.value)
        && (needle.length === 0
            || task.title.toLocaleLowerCase(locale.value).includes(needle)
            || String(task.description ?? '').toLocaleLowerCase(locale.value).includes(needle))
    ))
    return talosTaskSorted(tenute, ordine.value, locale.value)
})

/** Il filtro è l'unica assenza che si può annullare: la ricerca conta come filtro. */
const filtrando = computed(() => query.value.trim().length > 0 || filtro.value !== 'all')

const bulk = useTalosBulkSelection()
const bulkDeleteOpen = ref(false)
const visibleIds = computed(() => shown.value.map((task) => task.id))

const etichetteRicorrenza = computed(() => ({
    none: t('tasks.scheduleNone'),
    paused: t('tasks.state.paused'),
    everyMinutes: (minutes: number) => t('tasks.scheduleEvery', { minutes }),
    daily: t('tasks.scheduleDaily'),
    weekly: t('tasks.scheduleWeekly'),
}))

function ricorrenza(task: TalosLocalTask): string {
    return talosTaskScheduleSummary(task, etichetteRicorrenza.value, locale.value)
}

function statoEtichetta(task: TalosLocalTask): string {
    return t(`tasks.state.${talosTaskState(task)}`)
}

function avanzamento(task: TalosLocalTask): string {
    const punti = talosTaskChecklist(task.description)
    return t('tasks.checkState', {
        done: punti.filter((punto) => punto.done).length,
        total: punti.length,
    })
}

function azioni(task: TalosLocalTask) {
    return talosTaskRowActions(task, {
        open: t('common.open'),
        edit: t('tasks.edit'),
        markDoing: t('tasks.markDoing'),
        markTodo: t('tasks.reopen'),
        pause: t('tasks.pause'),
        resume: t('tasks.resume'),
        exportText: t('tasks.exportText'),
        select: t('common.select'),
        remove: t('common.delete'),
        removeNamed: t('tasks.deleteNamed', { title: task.title }),
    })
}

function describeError(cause: unknown): string {
    return cause instanceof Error && cause.message ? cause.message : String(cause)
}

async function refresh(): Promise<void> {
    try {
        entries.value = await controller.tasks.list()
        error.value = null
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
    } finally {
        caricato.value = true
    }
}

onMounted(refresh)

/** La casella COMPLETA, in un tocco, e lo stesso tocco riapre. */
async function alternaCompletata(task: TalosLocalTask): Promise<void> {
    error.value = null
    try {
        await controller.tasks.setStatus(task.id, task.status === 'done' ? 'todo' : 'done')
        await refresh()
    } catch (cause) {
        error.value = describeError(cause)
    }
}

/** «In corso» è una decisione, e si prende dal menu o dalla pagina. */
async function alternaInCorso(task: TalosLocalTask): Promise<void> {
    error.value = null
    try {
        await controller.tasks.setStatus(task.id, task.status === 'doing' ? 'todo' : 'doing')
        await refresh()
    } catch (cause) {
        error.value = describeError(cause)
    }
}

/**
 * U-17 — fermare la ricorrenza senza cancellarla.
 *
 * ⛔ Non tocca `schedule_json`: l'istruzione, i giorni e l'ora restano scritti,
 * ed è tutta la differenza fra «fermala fino a lunedì» e «non deve più
 * ripetersi». Chi riprende ritrova esattamente quello che aveva impostato.
 */
async function alternaPausa(task: TalosLocalTask): Promise<void> {
    error.value = null
    try {
        await controller.tasks.update(task.id, { paused: !task.paused })
        await refresh()
    } catch (cause) {
        error.value = describeError(cause)
    }
}

async function esporta(task: TalosLocalTask): Promise<void> {
    try {
        const esito = await exportTalosTaskText(task, t('tasks.exportText'))
        // Condiviso o annullato, la persona ha appena visto il foglio di
        // Android: dirle una seconda volta cos'è successo sarebbe rumore. Il
        // ripiego invece va detto, perché è successo qualcosa di DIVERSO da
        // quello che il pulsante prometteva.
        if (esito !== 'copied') return
        talosNotify({
            key: `task:exported:${task.id}`,
            channel: 'jobs',
            weight: 'notable',
            title: t('tasks.exportCopied'),
            body: task.title,
            at: Date.now(),
        })
    } catch {
        error.value = t('tasks.exportFailed')
    }
}

const pendingDelete = ref<TalosLocalTask | null>(null)
const deleting = ref(false)

async function confermaEliminazione(): Promise<void> {
    const bersaglio = pendingDelete.value
    if (!bersaglio || deleting.value) return
    deleting.value = true
    try {
        await controller.tasks.remove(bersaglio.id)
        pendingDelete.value = null
        await refresh()
    } catch (cause) {
        error.value = describeError(cause)
    } finally {
        deleting.value = false
    }
}

/** Le selezionate, in una passata sola: N cancellazioni in fila sono N ridisegni. */
async function eliminaSelezionate(): Promise<void> {
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
function apri(task: TalosLocalTask): void {
    void router.push({ name: 'task-item', params: { id: task.id } })
}

/** La creazione è una PAGINA, non un modulo qui: vedi la nota nel modello. */
function nuova(): void {
    void router.push({ name: 'task-new' })
}

function azzeraFiltri(): void {
    query.value = ''
    filtro.value = 'all'
}

/**
 * Una sola porta per tutte le azioni, da qualunque densità arrivi.
 *
 * Scheda e riga emettono lo stesso identificativo: se ognuna sapesse cosa fare
 * da sé, prima o poi «Elimina» chiederebbe conferma da una parte e non
 * dall'altra.
 */
function esegui(task: TalosLocalTask, azione: string): void {
    switch (azione as TalosTaskActionId) {
        case 'open': apri(task); break
        case 'edit': void router.push({ name: 'task-edit', params: { id: task.id } }); break
        case 'doing': void alternaInCorso(task); break
        case 'pause': void alternaPausa(task); break
        case 'export': void esporta(task); break
        case 'select': bulk.enter(task.id); break
        // ⛔ Mai senza conferma da un ELENCO: qui l'attività è un titolo e due
        // righe, e decidere di cancellarla è decidere su un testo che non si è
        // riletto. Nella pagina, dove c'è tutta, la conferma è in linea.
        case 'delete': pendingDelete.value = task; break
    }
}

/* ═══ Tieni-premuto: 500 ms senza muovere il dito ═════════════════════════════
 * Accende la SELEZIONE — il menu di riga sta sotto il ⋯, che è visibile e non
 * va scoperto. Sono i due ruoli decisi dalla ricerca sulle azioni di riga, ed è
 * così anche nelle chat e nella Ricerca.
 */
const HOLD_MS = 500
const HOLD_SLOP_PX = 10
let holdTimer: ReturnType<typeof setTimeout> | null = null
let holdOrigin: { x: number, y: number } | null = null
let sopprimiProssimoClick = false

function fermaHold(): void {
    if (holdTimer !== null) clearTimeout(holdTimer)
    holdTimer = null
    holdOrigin = null
}

function premuta(task: TalosLocalTask, event: PointerEvent): void {
    // Un gesto nuovo azzera la soppressione del precedente: la bandiera alzata
    // dal tieni-premuto aspetta un click che a volte non arriva mai, e senza
    // questa riga se lo mangia il tocco dopo.
    sopprimiProssimoClick = false
    if (bulk.active.value) return
    fermaHold()
    holdOrigin = { x: event.clientX, y: event.clientY }
    holdTimer = setTimeout(() => {
        void talosLightImpact()
        sopprimiProssimoClick = true
        // La riga tenuta parte già spuntata: il dito era lì sopra, e un secondo
        // tocco per riprenderla sarebbe un passo per niente.
        bulk.enter(task.id)
        fermaHold()
    }, HOLD_MS)
}

function mossa(event: PointerEvent): void {
    if (!holdOrigin) return
    if (Math.abs(event.clientX - holdOrigin.x) > HOLD_SLOP_PX
        || Math.abs(event.clientY - holdOrigin.y) > HOLD_SLOP_PX) fermaHold()
}

function clickInCattura(event: MouseEvent): void {
    // Il click che chiude il tieni-premuto fa parte del gesto.
    if (sopprimiProssimoClick) {
        sopprimiProssimoClick = false
        event.preventDefault()
        event.stopPropagation()
    }
}

/** In selezione un tocco SCEGLIE. Aprire da qui porterebbe via a metà scelta. */
function tocco(task: TalosLocalTask): void {
    if (bulk.active.value) bulk.toggle(task.id)
    else apri(task)
}

/* ═══ U-14 — il movimento del mockup, in questa stazione ══════════════════════
 *
 * Cinque cose, e nessuna è decorativa: ognuna risponde a una domanda che senza
 * movimento resta senza risposta.
 *
 *   1. il filo sotto la scelta attiva SCIVOLA     -> da dove sono arrivato
 *   2. le schede si riordinano invece di saltare  -> dov'è finita quella che
 *      stavo guardando quando ho cambiato ordine o filtro
 *   3. un'attività nuova ENTRA, a scaglioni       -> quale è comparsa adesso
 *   4. l'onda parte dal dito                      -> ti ho sentito
 *   5. la casella rimbalza e il segno si disegna  -> l'ho appena spuntata io
 *
 * Tutte passano dai token del motore e dalle sue categorie: nessuna durata è
 * scritta qui dentro. Inventario e numeri misurati in
 * `.claude/MOTION-MOCKUP-2026-09-11.md`.
 */
const gruppoVista = ref<HTMLElement | null>(null)
const gruppoFiltri = ref<HTMLElement | null>(null)
useTalosSlidingIndicator(gruppoVista, vista)
useTalosSlidingIndicator(gruppoFiltri, filtro)

/** L'onda al tocco, condivisa da filtri, selettore di vista, schede e righe. */
const onda = useTalosTouchWave()

/**
 * L'entrata di un'attività, come attributi da applicare alla scheda o alla riga.
 *
 * Torna un oggetto vuoto oltre il tetto (16 voci, il numero del mockup): senza
 * l'attributo d'intento l'elemento non ha nessuna animazione addosso, che è
 * esattamente ciò che serve dalla diciassettesima in poi.
 *
 * ⛔ Il ritardo è un `calc()` sul token del motore, non un numero: quando
 * l'utente spegne «Movimento interfaccia» il token va a `0ms` e il `calc()` si
 * annulla da sé. Un numero scritto qui resterebbe lì anche a movimento spento,
 * e la lista comparirebbe a scaglioni senza animarsi — il peggiore dei due
 * mondi.
 */
function entrata(indice: number): Record<string, unknown> {
    const stile = talosSfasamento(indice)
    if (!stile) return {}
    return { 'data-talos-motion-intent': 'message-insert', style: stile }
}
</script>

<template>
    <div
        class="flex min-h-full flex-col px-[var(--talos-space-page)] pb-[max(var(--talos-space-page),env(safe-area-inset-bottom))] pt-[var(--talos-space-section)]"
        data-testid="talos-tasks-screen"
        @click.capture="clickInCattura"
    >
        <!-- Che posto è questo. Il titolo, una riga che dice a cosa serve, e il
             pulsante che comincia: è il primo pezzo del mockup, e serve perché
             una stazione aperta dal menu deve dire da sola dove si è finiti. -->
        <header class="flex items-start justify-between gap-[var(--talos-space-section)]">
            <div class="min-w-0">
                <h1 class="text-3xl font-semibold leading-[1.15] tracking-[-0.03em] text-[var(--talos-text)]">
                    {{ t('navigation.tasks') }}
                </h1>
                <p class="mt-[var(--talos-space-inline)] text-sm leading-6 text-[var(--talos-muted)]">
                    {{ t('tasks.subtitle') }}
                </p>
            </div>
            <Button
                type="button"
                data-testid="talos-tasks-new"
                :aria-label="t('tasks.add')"
                :class="[
                    'talos-pressable talos-wave-host shrink-0 rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] text-[var(--talos-accent-text)] hover:bg-[var(--talos-accent-hover)]',
                    isTablet ? 'min-h-touch gap-2 px-5 text-sm font-medium' : 'size-14 p-0',
                ]"
                @click="nuova"
                @pointerdown="onda.onPointerDown"
            >
                <Plus :class="isTablet ? 'size-4' : 'size-6'" aria-hidden="true" />
                <span v-if="isTablet">{{ t('tasks.add') }}</span>
            </Button>
        </header>

        <!-- Ricerca e densità sulla stessa riga: sono le due cose che si fanno
             prima di guardare. Il campo sta FUORI da ogni catena `v-if` — deve
             restare visibile anche quando la lista è vuota, perché è con la
             lista vuota che si cancella il filtro. -->
        <div class="mt-[var(--talos-space-section)] flex items-stretch gap-[var(--talos-space-card)]">
            <label class="relative min-w-0 flex-1">
                <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--talos-muted)]" aria-hidden="true" />
                <input
                    v-model="query"
                    type="search"
                    inputmode="search"
                    data-testid="talos-tasks-search"
                    :placeholder="t('tasks.searchPlaceholder')"
                    :aria-label="t('tasks.searchPlaceholder')"
                    class="min-h-touch w-full rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-9 pr-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                >
            </label>

            <!-- Un radiogroup e non due bottoni indipendenti: sono alternative,
                 e dirlo è ciò che le rende comprensibili a chi naviga con lo
                 screen reader. -->
            <div
                ref="gruppoVista"
                role="radiogroup"
                :aria-label="t('tasks.viewLabel')"
                class="flex shrink-0 items-center gap-[2px] rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-panel)] px-[3px]"
            >
                <button
                    v-for="modo in ([['list', t('tasks.viewList'), List], ['grid', t('tasks.viewGrid'), LayoutGrid]] as const)"
                    :key="modo[0]"
                    type="button"
                    role="radio"
                    :aria-checked="vista === modo[0]"
                    :aria-label="modo[1]"
                    :data-testid="`talos-tasks-view-${modo[0]}`"
                    :class="[
                        'talos-pressable talos-wave-host relative flex min-h-touch min-w-touch items-center justify-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] px-[var(--talos-space-control)] text-xs',
                        vista === modo[0]
                            ? 'bg-[var(--talos-secondary)] text-[var(--talos-text)]'
                            : 'text-[var(--talos-muted)]',
                    ]"
                    @click="vista = modo[0]"
                    @pointerdown="onda.onPointerDown"
                >
                    <component :is="modo[2]" class="size-4" aria-hidden="true" />
                    <span v-if="isTablet">{{ modo[1] }}</span>
                    <span
                        v-if="vista === modo[0]"
                        data-talos-indicator
                        aria-hidden="true"
                        class="talos-calm-indicator absolute bottom-[5px] left-1/2 h-[2px] w-4 -translate-x-1/2 rounded-full bg-[var(--talos-accent)]"
                    />
                </button>
            </div>
        </div>

        <!-- Cosa sto guardando, col conto di quante ce ne sono in ciascun
             gruppo: il numero è ciò che fa decidere se cambiare filtro.
             ⛔ I cinque gruppi sono una PARTIZIONE — i numeri fanno il totale,
             e quattro numeri che non tornano sono quattro numeri di cui non ci
             si fida più. «In pausa» non è un sesto gruppo: un'attività in pausa
             resta pianificata, ed è lì che una persona la cerca. -->
        <div
            ref="gruppoFiltri"
            role="radiogroup"
            :aria-label="t('tasks.filterLabel')"
            data-testid="talos-tasks-filters"
            class="mt-[var(--talos-space-card)] flex min-h-touch items-center gap-[var(--talos-space-inline)] overflow-x-auto border-b border-[var(--talos-border)] [scrollbar-width:none]"
        >
            <button
                v-for="voce in filtri"
                :key="voce.id"
                type="button"
                role="radio"
                :aria-checked="filtro === voce.id"
                :tabindex="filtro === voce.id ? 0 : -1"
                :data-testid="`talos-tasks-filter-${voce.id}`"
                :class="[
                    'talos-pressable talos-wave-host relative inline-flex min-h-touch shrink-0 items-center gap-[var(--talos-space-inline)] whitespace-nowrap rounded-[var(--talos-radius-control)] px-[var(--talos-space-control)] text-xs',
                    filtro === voce.id ? 'text-[var(--talos-text)]' : 'text-[var(--talos-muted)]',
                ]"
                @click="filtro = voce.id"
                @pointerdown="onda.onPointerDown"
            >
                <span>{{ voce.label }}</span>
                <small class="text-2xs tabular-nums">{{ voce.count }}</small>
                <span
                    v-if="filtro === voce.id"
                    data-talos-indicator
                    aria-hidden="true"
                    class="talos-calm-indicator absolute bottom-0 left-[var(--talos-space-control)] right-[var(--talos-space-control)] h-[2px] rounded-full bg-[var(--talos-accent)]"
                />
            </button>
        </div>

        <!-- Quante ne sto guardando, e in che ordine. In selezione questa riga
             cede il posto alla barra delle selezionate: sono due domande
             diverse, e la seconda è quella che si sta facendo adesso. -->
        <div
            v-if="bulk.active.value"
            data-testid="talos-tasks-selection-bar"
            class="mt-[var(--talos-space-inline)] flex min-h-touch items-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-panel)] py-1 pl-1 pr-2"
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
                class="min-h-touch min-w-touch rounded-full text-[var(--talos-danger)]"
                data-testid="talos-tasks-bulk-delete"
                :aria-label="t('tasks.deleteSelected')"
                :disabled="bulk.count.value === 0"
                @click="bulkDeleteOpen = true"
            ><Trash2 class="size-4" aria-hidden="true" /></Button>
        </div>

        <div v-else class="flex min-h-touch items-center justify-between gap-[var(--talos-space-inline)] text-xs text-[var(--talos-muted)]">
            <span role="status" aria-live="polite" data-testid="talos-tasks-count">
                {{ caricato ? t('tasks.count', { count: shown.length }) : '' }}
            </span>
            <label class="flex shrink-0 items-center gap-1">
                <SlidersHorizontal class="size-4" aria-hidden="true" />
                <span class="sr-only">{{ t('tasks.sortLabel') }}</span>
                <!-- Un `select` nativo: sul telefono apre la ruota di Android,
                     che è il controllo che la persona conosce già, e non ha
                     bisogno di un pannello nostro per tre voci. -->
                <select
                    v-model="ordine"
                    data-testid="talos-tasks-sort"
                    :aria-label="t('tasks.sortLabel')"
                    class="min-h-touch max-w-36 cursor-pointer border-0 bg-transparent px-1 text-xs text-[var(--talos-muted)] outline-none"
                >
                    <option value="priority">{{ t('tasks.sortPriority') }}</option>
                    <option value="recent">{{ t('tasks.sortRecent') }}</option>
                    <option value="title">{{ t('tasks.sortTitle') }}</option>
                </select>
            </label>
        </div>

        <p v-if="error" role="alert" data-testid="talos-tasks-error" class="py-[var(--talos-space-inline)] text-xs text-[var(--talos-danger)]">
            {{ error }}
        </p>

        <!-- Due assenze diverse, due frasi diverse: «non ce ne sono» manda a
             crearne una, «il filtro le nasconde» manda a togliere il filtro. -->
        <div
            v-if="caricato && shown.length === 0"
            :data-testid="filtrando ? 'talos-tasks-no-matches' : 'talos-tasks-empty'"
            role="status"
            class="flex flex-1 flex-col items-center justify-center gap-[var(--talos-space-inline)] py-[calc(var(--talos-space-page)*2)] text-center"
        >
            <!-- Il disegno del mockup per questa sezione (`pEmptyArt`, chiave
                 `tasks`), e SI TRACCIA: uno spazio bianco fermo si legge come un
                 guasto, un tratto che si disegna dice «qui non c'è ancora
                 niente». Una volta sola, all'arrivo della pagina. -->
            <svg
                class="talos-calm-line-art mb-[var(--talos-space-section)] h-[132px] w-[140px] text-[var(--talos-border-strong)]"
                viewBox="0 0 150 140"
                aria-hidden="true"
            >
                <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <rect data-talos-draw x="39" y="26" width="70" height="88" rx="10" />
                    <path data-talos-draw d="M61 21h27v13H61Z" />
                    <path data-talos-draw class="stroke-[var(--talos-accent-border)]" d="m54 59 6 6 13-15M81 58h14" />
                    <path data-talos-draw d="M54 84h13M81 84h14" />
                </g>
            </svg>
            <h2 class="max-w-[27ch] text-xl font-medium leading-[1.5] tracking-[-0.02em] text-[var(--talos-text)]">
                {{ filtrando ? t('tasks.noMatches') : t('tasks.empty') }}
            </h2>
            <p class="max-w-[38ch] text-sm leading-[1.7] text-[var(--talos-muted)]">
                {{ filtrando ? t('tasks.noMatchesBody') : t('tasks.emptyBody') }}
            </p>
            <!-- Uno stato vuoto è un invito ad agire, e la via d'uscita è
                 quella che RIPARA la situazione in cui si è. -->
            <Button
                type="button"
                :data-testid="filtrando ? 'talos-tasks-clear-filters' : 'talos-tasks-empty-new'"
                class="talos-pressable mt-[var(--talos-space-section)] min-h-touch rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] px-5 text-xs text-[var(--talos-accent-text)]"
                @click="filtrando ? azzeraFiltri() : nuova()"
            >
                {{ filtrando ? t('tasks.clearFilters') : t('tasks.add') }}
            </Button>
        </div>

        <!-- A schede: le colonne le decide la LARGHEZZA MINIMA LEGGIBILE, non un
             numero (owner 2026-08-06). `clamp(10.5rem, 45%, 17rem)` è lo stesso
             delle Note — due elenchi vicini che si impaginano diversamente si
             leggono come due app.
             U-14: `<TransitionGroup>` fa il FLIP da sé quando l'ordine cambia,
             e chi esce va in `position: absolute` o i conti di chi resta
             sbagliano (documentazione Vue, 12/09/2026). -->
        <TransitionGroup
            v-else-if="caricato && vista === 'grid'"
            tag="div"
            role="list"
            data-testid="talos-tasks-list"
            data-view="grid"
            class="mt-[var(--talos-space-card)] grid grid-cols-[repeat(auto-fill,minmax(clamp(10.5rem,45%,17rem),1fr))] items-start gap-[calc(var(--talos-space-section)*1.25)]"
            move-class="talos-calm-move"
            leave-active-class="talos-calm-leave-active"
            leave-to-class="talos-calm-leave-to"
        >
            <TalosMobileTaskCard
                v-for="(task, indice) in shown"
                :key="task.id"
                v-bind="entrata(indice)"
                :task="task"
                :state-label="statoEtichetta(task)"
                :schedule-label="ricorrenza(task)"
                :progress-label="avanzamento(task)"
                :priority-label="t('tasks.priorityHigh')"
                :check-label="t('tasks.completeNamed', { title: task.title })"
                :actions-label="t('tasks.actionsNamed', { title: task.title })"
                :actions="azioni(task)"
                :selecting="bulk.active.value"
                :selected="bulk.isSelected(task.id)"
                @open="tocco(task)"
                @toggle="alternaCompletata(task)"
                @action="(id) => esegui(task, id)"
                @press="(event) => premuta(task, event)"
                @move="mossa"
                @release="fermaHold"
                @wave="onda.onPointerDown"
            />
        </TransitionGroup>

        <TransitionGroup
            v-else-if="caricato"
            tag="div"
            role="list"
            data-testid="talos-tasks-list"
            data-view="list"
            class="mt-[var(--talos-space-card)] flex flex-col"
            move-class="talos-calm-move"
            leave-active-class="talos-calm-leave-active"
            leave-to-class="talos-calm-leave-to"
        >
            <TalosMobileTaskRow
                v-for="(task, indice) in shown"
                :key="task.id"
                v-bind="entrata(indice)"
                :task="task"
                :state-label="statoEtichetta(task)"
                :schedule-label="ricorrenza(task)"
                :check-label="t('tasks.completeNamed', { title: task.title })"
                :actions-label="t('tasks.actionsNamed', { title: task.title })"
                :actions="azioni(task)"
                :selecting="bulk.active.value"
                :selected="bulk.isSelected(task.id)"
                @open="tocco(task)"
                @toggle="alternaCompletata(task)"
                @action="(id) => esegui(task, id)"
                @press="(event) => premuta(task, event)"
                @move="mossa"
                @release="fermaHold"
                @wave="onda.onPointerDown"
            />
        </TransitionGroup>

        <TalosMobileConfirmDialog
            v-if="pendingDelete"
            :title="t('tasks.deleteTitle')"
            :description="t('tasks.deleteDescription', { title: pendingDelete.title })"
            @close="deleting ? undefined : pendingDelete = null"
        >
            <template #footer>
                <Button type="button" variant="outline" :disabled="deleting" class="min-h-12" @click="pendingDelete = null">
                    {{ t('common.cancel') }}
                </Button>
                <Button
                    type="button"
                    data-testid="talos-tasks-delete-confirm"
                    :disabled="deleting"
                    class="min-h-12 bg-[var(--talos-danger)] text-white"
                    @click="confermaEliminazione"
                >
                    {{ t('common.delete') }}
                </Button>
            </template>
        </TalosMobileConfirmDialog>

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
                    class="bg-[var(--talos-danger)] text-white"
                    @click="eliminaSelezionate"
                >{{ t('common.delete') }}</Button>
            </div>
        </TalosMobileConfirmDialog>
    </div>
</template>

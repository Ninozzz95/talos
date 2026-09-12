<script setup lang="ts">
/**
 * Le Note, nella forma del mockup «Talos Calm Finale» (owner 11/09/2026).
 *
 * La pagina si legge dall'alto in un ordine solo: **che posto è** (titolo e una
 * riga che dice cosa ci si mette), **come lo restringo** (ricerca e densità),
 * **cosa sto guardando** (i filtri col loro conteggio), **quante sono e in che
 * ordine**, e poi le note.
 *
 * ## Le regole dell'owner che il mockup NON cambia
 *
 * - La riga e la scheda APRONO la nota (2026-08-04: «ogni scheda apre una
 *   pagina dedicata, il pulsante indietro va alla precedente, dev'essere
 *   lineare»).
 * - L'anteprima anticipa, non contiene: mai il testo intero in elenco.
 * - Due assenze diverse, due frasi diverse — «non ce ne sono» e «il filtro le
 *   nasconde» sono due stati differenti, e solo il secondo si può annullare.
 * - Il modulo di creazione NON sta nell'elenco: è una pagina.
 * - Mai più di due azioni affiancate su una nota (owner 10/09/2026): qui sono
 *   la puntina e i tre puntini, e tutto il resto vive nel menu.
 *
 * ## ⛔ L'unico punto in cui il mockup perde
 *
 * Il mockup fissa le colonne della griglia a 3 (2 sotto i 1100 px). L'owner
 * aveva già deciso il contrario il 2026-08-06, dopo due correzioni sul tablet:
 * le colonne le decide la **larghezza minima leggibile**, non un numero, perché
 * nessuno conosce in anticipo la larghezza di ogni riquadro di ogni
 * dispositivo. Vince l'owner — e il `clamp()` qui sotto arriva comunque agli
 * stessi due numeri del mockup sulle due viewport che contano.
 *
 * ## ⛔ U-12 — l'etichetta «non attendibile» non è più qui
 *
 * Stava su ogni riga e su ogni scheda, e diceva dodici volte una cosa che vale
 * per tutte. Adesso vive una volta sola, nel piede della nota aperta, come
 * «Contenuto fornito dall'utente». **La disciplina non cambia**: le note
 * restano `trust_level: 'untrusted'` e continuano a entrare nel prompt come
 * contesto dichiarato che non può impartire istruzioni. È cambiato solo quante
 * volte lo scriviamo addosso a chi le sta leggendo.
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTalosI18n } from '@/i18n'
import { LayoutGrid, List, Plus, Search, SlidersHorizontal } from '@lucide/vue'
import TalosMobileNoteTile from '@/components/talos/notes/TalosMobileNoteTile.vue'
import TalosMobileNoteRow from '@/components/talos/notes/TalosMobileNoteRow.vue'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/stores/settings'
import { useChatController } from '@/stores/chatController'
import { useTalosTabletLayout } from '@/composables/useTalosTabletLayout'
import { talosNotify } from '@/stores/notificationCentre'
import { talosNoteChecklist, talosNoteDate } from '@/components/talos/notes/noteShape'
import { exportTalosNoteText } from '@/components/talos/notes/noteExport'
import type { TalosNoteActionId } from '@/components/talos/notes/noteActions'
import { talosSfasamento } from '@/composables/useTalosCalmMotion'
import { useTalosSlidingIndicator } from '@/composables/useTalosSlidingIndicator'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'
import type { TalosLocalNote } from '@/repositories/chatRepository'

const controller = useChatController()
const { t, locale } = useTalosI18n()
const settings = useSettingsStore()
const router = useRouter()
const { isTablet } = useTalosTabletLayout()

/**
 * Lista o schede, e la scelta si RICORDA.
 *
 * Owner 2026-08-05: le note vanno viste «sia in lista che in card». Passa dalla
 * stessa preferenza della Libreria, con lo stesso nome e lo stesso predefinito,
 * perche' due idee di «vista» che si comportano quasi uguale sono il modo in cui
 * due schermate della stessa app iniziano a sembrare due app.
 *
 * Ricordata e non tenuta in un `ref`: il precedente e' documentato nel registro
 * delle viste — la Libreria «non sopravviveva a una riapertura», e nessuno se ne
 * accorgeva perche' riaprire e ritrovare il predefinito sembra normale.
 */
const viewMode = computed({
    get: () => settings.state.shell.notes_view,
    set: (value: 'grid' | 'list') => { void settings.setShell({ notes_view: value }) },
})

const entries = ref<TalosLocalNote[]>([])
const error = ref<string | null>(null)
const query = ref('')

type TalosNotesFilter = 'all' | 'pinned' | 'checklist'
type TalosNotesSort = 'recent' | 'title'

/**
 * ⛔ Filtro e ordinamento vivono nella pagina, non nelle preferenze.
 *
 * La densità si ricorda perché è un modo di vedere; questi due sono un modo di
 * CERCARE, e una ricerca lasciata accesa da ieri è il difetto opposto — si
 * riapre la stazione e metà delle note non c'è, senza che niente dica perché.
 * Il mockup li conserva perché è una demo che vive in un browser solo.
 *
 * 🔜 Debito dichiarato: se l'owner li vuole persistenti servono due chiavi in
 * `settings.shell`, che questo giro di lavoro non poteva toccare.
 */
const filter = ref<TalosNotesFilter>('all')
const sort = ref<TalosNotesSort>('recent')

function matchesFilter(note: TalosLocalNote, value: TalosNotesFilter): boolean {
    if (value === 'all') return true
    if (value === 'pinned') return note.pinned
    return talosNoteChecklist(note.content).length > 0
}

/**
 * I conteggi guardano TUTTE le note, non quelle già ristrette dalla ricerca.
 *
 * È la stessa scelta del mockup, e la ragione è che i numeri servono a decidere
 * se vale la pena cambiare filtro: un «In evidenza 0» calcolato dentro una
 * ricerca in corso direbbe che non ce ne sono, mentre ce ne sono — solo, non
 * per quella parola.
 */
const filters = computed(() => ([
    { id: 'all' as const, label: t('notes.filterAll') },
    { id: 'pinned' as const, label: t('notes.filterPinned') },
    { id: 'checklist' as const, label: t('notes.filterChecklist') },
].map((choice) => ({
    ...choice,
    count: entries.value.filter((note) => matchesFilter(note, choice.id)).length,
}))))

/**
 * Filtra su cio' che una persona ricorda — le parole che ha scritto lei — non
 * su un identificativo.
 */
const shown = computed(() => {
    const needle = query.value.trim().toLocaleLowerCase()
    const kept = entries.value.filter((note) => (
        matchesFilter(note, filter.value)
        && (needle.length === 0
            || note.title.toLocaleLowerCase().includes(needle)
            || note.content.toLocaleLowerCase().includes(needle))
    ))
    // Le note in evidenza restano in cima in ENTRAMBI gli ordinamenti: il pin
    // è una decisione, e un ordinamento non revoca una decisione. Dentro i due
    // gruppi decide l'ordinamento scelto; `recent` è già l'ordine in cui il
    // deposito le ha restituite, quindi non si tocca.
    if (sort.value === 'title') {
        return [...kept].sort((left, right) => (
            Number(right.pinned) - Number(left.pinned)
            || left.title.localeCompare(right.title, locale.value)
        ))
    }
    return kept
})

/**
 * ⛔ LO STATO VUOTO LAMPEGGIAVA, e diceva una cosa falsa.
 *
 * Visto sul Pad il 12/09/2026: entrando in Note con TRE note salvate, il primo
 * fotogramma mostrava «0 appunti», «Un posto per la prossima idea» e il
 * pulsante per crearne una — e solo dopo arrivavano le note.
 *
 * La causa non e' il movimento, e' una premessa sbagliata: `entries` parte da
 * un array vuoto, e `shown.length === 0` veniva letto come «non ce n'e'
 * nessuna». Ma prima che `controller.notes.list()` abbia risposto la verita' e'
 * **«non lo so ancora»**, e sono tre stati, non due. Uno schermo che afferma
 * «non ce ne sono» mentre ce ne sono tre non e' un difetto estetico: e' una
 * risposta sbagliata a una domanda che la persona ha appena fatto.
 *
 * ⇒ Finche' la risposta non c'e', non si mostra ne' lo stato vuoto ne' il
 * conteggio. Dopo, i due stati vuoti di sempre — «non ce n'e'» e «il filtro le
 * nasconde», che restano due frasi diverse.
 *
 * ⛔ E NON si mette uno scheletro animato al suo posto: la lista locale
 * risponde in pochi millisecondi, e un'animazione di caricamento che appare e
 * sparisce in un fotogramma e' lo stesso lampo con un vestito diverso.
 */
const caricato = ref(false)

const countLabel = computed(() => t('notes.count', { count: shown.value.length }))
/** Il filtro è l'unica assenza che si può annullare: la ricerca conta come filtro. */
const filtering = computed(() => query.value.trim().length > 0 || filter.value !== 'all')

function updatedAt(note: TalosLocalNote): string {
    return talosNoteDate(note.updated_at, locale.value)
}

function describeError(cause: unknown): string {
    return cause instanceof Error && cause.message ? cause.message : String(cause)
}

async function refresh(): Promise<void> {
    try {
        entries.value = await controller.notes.list()
        error.value = null
    } catch (cause) {
        error.value = describeError(cause)
    } finally {
        // Nel `finally` e non nel ramo felice: anche una lista che FALLISCE e'
        // una risposta. Lasciando `caricato` a falso dopo un errore, la pagina
        // resterebbe muta per sempre — con l'errore scritto sopra e sotto il
        // vuoto, che e' il solo posto dove la via d'uscita e' scritta.
        caricato.value = true
    }
}

onMounted(refresh)

/** Voce → pagina → dettaglio, sempre nello stesso verso. */
function open(note: TalosLocalNote): void {
    void router.push({ name: 'note-item', params: { id: note.id } })
}

/** La creazione è una PAGINA, non un modulo qui: vedi la nota nel modello. */
function startNew(): void {
    void router.push({ name: 'note-new' })
}

function clearFilters(): void {
    query.value = ''
    filter.value = 'all'
}

async function togglePin(note: TalosLocalNote): Promise<void> {
    try {
        await controller.notes.update({ id: note.id, pinned: !note.pinned })
        await refresh()
    } catch (cause) {
        error.value = describeError(cause)
    }
}

async function exportNote(note: TalosLocalNote): Promise<void> {
    try {
        const outcome = await exportTalosNoteText(note, t('notes.exportText'))
        // Condiviso o annullato, la persona ha appena visto il foglio di
        // Android: dirle una seconda volta cos'è successo sarebbe rumore. Il
        // ripiego invece va detto, perché è successo qualcosa di DIVERSO da
        // quello che il pulsante prometteva.
        if (outcome !== 'copied') return
        talosNotify({
            key: `note:exported:${note.id}`,
            channel: 'jobs',
            weight: 'notable',
            title: t('notes.exportCopied'),
            body: note.title,
            at: Date.now(),
        })
    } catch {
        error.value = t('notes.exportFailed')
    }
}

const pendingDelete = ref<TalosLocalNote | null>(null)
const deleting = ref(false)

async function confirmDelete(): Promise<void> {
    const target = pendingDelete.value
    if (!target || deleting.value) return
    deleting.value = true
    try {
        await controller.notes.remove(target.id)
        pendingDelete.value = null
        await refresh()
    } catch (cause) {
        error.value = describeError(cause)
    } finally {
        deleting.value = false
    }
}

/**
 * Una sola porta per tutte le azioni di una nota, da qualunque densità arrivi.
 *
 * Scheda e riga emettono lo stesso identificativo: se ognuna sapesse cosa fare
 * da sé, prima o poi «Elimina» chiederebbe conferma da una parte e non
 * dall'altra.
 */
function runAction(note: TalosLocalNote, action: TalosNoteActionId): void {
    switch (action) {
        case 'open': open(note); break
        case 'edit': void router.push({ name: 'note-edit', params: { id: note.id } }); break
        case 'pin': void togglePin(note); break
        case 'export': void exportNote(note); break
        // ⛔ Mai senza conferma da un elenco: qui la nota è un titolo e due
        // righe, e decidere di cancellarla è decidere su un testo che non si è
        // riletto. Nella pagina della nota, dove c'è tutta, la conferma è in
        // linea; qui deve fermare.
        case 'delete': pendingDelete.value = note; break
    }
}

/* ═══ U-14 — il movimento del mockup, in questa stazione ═══════════════════
 *
 * Quattro cose, e nessuna e' decorativa: ognuna risponde a una domanda che
 * senza movimento resta senza risposta.
 *
 *   1. il filo sotto la scelta attiva SCIVOLA  -> da dove sono arrivato
 *   2. le schede si riordinano invece di saltare (FLIP) -> dov'e' finita quella
 *      che stavo guardando quando ho cambiato vista
 *   3. una nota nuova ENTRA                    -> quale e' comparsa adesso
 *   4. l'onda parte dal dito                   -> ti ho sentito
 *
 * Tutte e quattro passano dai token del motore e dalle sue categorie: nessuna
 * durata e' scritta qui dentro. Inventario e numeri misurati in
 * `.claude/MOTION-MOCKUP-2026-09-11.md`.
 */

/**
 * I due gruppi con un filo sotto la voce attiva.
 *
 * Nel mockup entrambi sono nell'elenco dei gruppi con indicatore
 * (`.p-view-switch` e `.p-filter-strip`, `app.js:1901`), e questo conta: sono
 * due strisce vicine, e se una scivolasse e l'altra no si leggerebbero come
 * due grammatiche diverse nella stessa schermata.
 */
const gruppoVista = ref<HTMLElement | null>(null)
const gruppoFiltri = ref<HTMLElement | null>(null)
useTalosSlidingIndicator(gruppoVista, viewMode)
useTalosSlidingIndicator(gruppoFiltri, filter)

/** L'onda al tocco, condivisa da filtri e selettore di vista. */
const onda = useTalosTouchWave()

/**
 * L'entrata di una nota, come attributi da applicare alla riga o alla scheda.
 *
 * Torna un oggetto vuoto oltre il tetto: senza l'attributo d'intento
 * l'elemento non ha nessuna animazione addosso, che e' esattamente cio' che
 * serve dalla diciassettesima nota in poi.
 *
 * ⛔ Il ritardo e' un `calc()` sul token del motore, non un numero: quando
 * l'utente spegne «Movimento interfaccia» il token va a `0ms` e il `calc()` si
 * annulla da se'. Un numero scritto qui resterebbe li' anche a movimento
 * spento, e la lista comparirebbe a scaglioni senza animarsi — il peggiore dei
 * due mondi.
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
        data-testid="talos-notes-screen"
    >
        <!-- Che posto è questo. Il titolo e una riga sola che dice cosa ci si
             mette: è il primo pezzo del mockup, e serve perché una stazione
             aperta dal menu deve dire da sola dove si è finiti. -->
        <header class="flex items-start justify-between gap-[var(--talos-space-section)]">
            <div class="min-w-0">
                <h1 class="text-3xl font-semibold leading-[1.15] tracking-[-0.03em] text-[var(--talos-text)]">
                    {{ t('navigation.notes') }}
                </h1>
                <p class="mt-[var(--talos-space-inline)] text-sm leading-6 text-[var(--talos-muted)]">
                    {{ t('notes.subtitle') }}
                </p>
            </div>
            <!-- Sul tablet il pulsante dice cosa fa; sul telefono, dove la riga
                 del titolo è tutta la larghezza che c'è, resta il quadrato in
                 accento col nome accessibile intatto. Stesso mockup, due
                 larghezze. -->
            <Button
                type="button"
                data-testid="talos-notes-new"
                :aria-label="t('notes.add')"
                :class="[
                    'talos-pressable shrink-0 rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] text-[var(--talos-accent-text)] hover:bg-[var(--talos-accent-hover)]',
                    isTablet ? 'min-h-touch gap-2 px-5 text-sm font-medium' : 'size-14 p-0',
                ]"
                @click="startNew"
            >
                <Plus :class="isTablet ? 'size-4' : 'size-6'" aria-hidden="true" />
                <span v-if="isTablet">{{ t('notes.add') }}</span>
            </Button>
        </header>

        <!-- Ricerca e densità, sulla stessa riga: sono le due cose che si fanno
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
                    data-testid="talos-notes-search"
                    :placeholder="t('notes.searchPlaceholder')"
                    :aria-label="t('notes.searchPlaceholder')"
                    class="min-h-touch w-full rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-9 pr-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                >
            </label>

            <!-- Un radiogroup e non due bottoni indipendenti: sono
                 alternative, e dirlo è ciò che le rende comprensibili a chi
                 naviga con lo screen reader. -->
            <div
                ref="gruppoVista"
                role="radiogroup"
                :aria-label="t('notes.viewLabel')"
                class="flex shrink-0 items-center gap-[2px] rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-panel)] px-[3px]"
            >
                <button
                    v-for="mode in ([['list', t('notes.viewList'), List], ['grid', t('notes.viewGrid'), LayoutGrid]] as const)"
                    :key="mode[0]"
                    type="button"
                    role="radio"
                    :aria-checked="viewMode === mode[0]"
                    :aria-label="mode[1]"
                    :data-testid="`talos-notes-view-${mode[0]}`"
                    :class="[
                        'talos-pressable talos-wave-host relative flex min-h-touch min-w-touch items-center justify-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] px-[var(--talos-space-control)] text-xs',
                        viewMode === mode[0]
                            ? 'bg-[var(--talos-secondary)] text-[var(--talos-text)]'
                            : 'text-[var(--talos-muted)]',
                    ]"
                    @click="viewMode = mode[0]"
                    @pointerdown="onda.onPointerDown"
                >
                    <component :is="mode[2]" class="size-4" aria-hidden="true" />
                    <span v-if="isTablet">{{ mode[1] }}</span>
                    <!-- Il filo d'accento sotto la scelta attiva: lo stesso
                         segnale dei filtri qui sotto, così le due strisce si
                         leggono come una grammatica sola.
                         U-14: `data-talos-indicator` è ciò che
                         `useTalosSlidingIndicator` cerca dentro il gruppo. Il
                         filo non sparisce e riappare più: SCIVOLA da dov'era. -->
                    <span
                        v-if="viewMode === mode[0]"
                        data-talos-indicator
                        aria-hidden="true"
                        class="talos-calm-indicator absolute bottom-[5px] left-1/2 h-[2px] w-4 -translate-x-1/2 rounded-full bg-[var(--talos-accent)]"
                    />
                </button>
            </div>
        </div>

        <!-- Cosa sto guardando, col conto di quante ce ne sono in ciascun
             gruppo: il numero è ciò che fa decidere se cambiare filtro. -->
        <div
            ref="gruppoFiltri"
            role="radiogroup"
            :aria-label="t('notes.filterLabel')"
            data-testid="talos-notes-filters"
            class="mt-[var(--talos-space-card)] flex min-h-touch items-center gap-[var(--talos-space-inline)] overflow-x-auto border-b border-[var(--talos-border)] [scrollbar-width:none]"
        >
            <button
                v-for="choice in filters"
                :key="choice.id"
                type="button"
                role="radio"
                :aria-checked="filter === choice.id"
                :tabindex="filter === choice.id ? 0 : -1"
                :data-testid="`talos-notes-filter-${choice.id}`"
                :class="[
                    'talos-pressable talos-wave-host relative inline-flex min-h-touch shrink-0 items-center gap-[var(--talos-space-inline)] whitespace-nowrap rounded-[var(--talos-radius-control)] px-[var(--talos-space-control)] text-xs',
                    filter === choice.id ? 'text-[var(--talos-text)]' : 'text-[var(--talos-muted)]',
                ]"
                @click="filter = choice.id"
                @pointerdown="onda.onPointerDown"
            >
                <span>{{ choice.label }}</span>
                <small class="text-2xs tabular-nums">{{ choice.count }}</small>
                <span
                    v-if="filter === choice.id"
                    data-talos-indicator
                    aria-hidden="true"
                    class="talos-calm-indicator absolute bottom-0 left-[var(--talos-space-control)] right-[var(--talos-space-control)] h-[2px] rounded-full bg-[var(--talos-accent)]"
                />
            </button>
        </div>

        <div class="flex min-h-touch items-center justify-between gap-[var(--talos-space-inline)] text-xs text-[var(--talos-muted)]">
            <span role="status" aria-live="polite" data-testid="talos-notes-count">{{ caricato ? countLabel : '' }}</span>
            <label class="flex shrink-0 items-center gap-1">
                <SlidersHorizontal class="size-4" aria-hidden="true" />
                <span class="sr-only">{{ t('notes.sortLabel') }}</span>
                <!-- Un `select` nativo: sul telefono apre la ruota di Android,
                     che è il controllo che la persona conosce già, e non ha
                     bisogno di un pannello nostro per due voci. -->
                <select
                    v-model="sort"
                    data-testid="talos-notes-sort"
                    :aria-label="t('notes.sortLabel')"
                    class="min-h-touch max-w-36 cursor-pointer border-0 bg-transparent px-1 text-xs text-[var(--talos-muted)] outline-none"
                >
                    <option value="recent">{{ t('notes.sortRecent') }}</option>
                    <option value="title">{{ t('notes.sortTitle') }}</option>
                </select>
            </label>
        </div>

        <p v-if="error" role="alert" data-testid="talos-notes-error" class="py-[var(--talos-space-inline)] text-xs text-[var(--talos-danger)]">
            {{ error }}
        </p>

        <!-- Due assenze diverse, due frasi diverse.
             Prima ce n'era una sola e guardava l'elenco NON filtrato: filtrando
             via tutto si otteneva una schermata vuota senza nemmeno una riga di
             testo, e chi guardava non poteva sapere se le note fossero finite o
             se fosse il filtro a nasconderle. -->
        <div
            v-if="caricato && shown.length === 0"
            :data-testid="filtering ? 'talos-notes-no-matches' : 'talos-notes-empty'"
            role="status"
            class="flex flex-1 flex-col items-center justify-center gap-[var(--talos-space-inline)] py-[calc(var(--talos-space-page)*2)] text-center"
        >
            <!-- Il foglio disegnato del mockup. Un disegno al posto di uno
                 spazio bianco: una pagina vuota che non dice niente si legge
                 come un guasto. -->
            <!-- U-14: il disegno SI TRACCIA, una volta sola.
                 Mockup, `.empty-line-art .draw` (components.css:285):
                 `stroke-dashoffset 420 → 0` in 360 ms. È l'unico movimento
                 della pagina che non risponde a un dito, ed è giustificato:
                 uno spazio bianco fermo si legge come un guasto, un tratto che
                 si disegna dice «qui non c'è ancora niente». -->
            <svg
                class="talos-calm-line-art mb-[var(--talos-space-section)] h-[132px] w-[140px] text-[var(--talos-border-strong)]"
                viewBox="0 0 150 140"
                aria-hidden="true"
            >
                <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path data-talos-draw d="M47 20h61v77l-19 20H47Z" />
                    <path data-talos-draw class="stroke-[var(--talos-accent-border)]" d="M89 117V97h19M60 45h33M60 59h28M60 73h18" />
                    <path data-talos-draw d="M36 33h-8v76h49" />
                </g>
            </svg>
            <h2 class="max-w-[27ch] text-xl font-medium leading-[1.5] tracking-[-0.02em] text-[var(--talos-text)]">
                {{ filtering ? t('notes.noMatches') : t('notes.empty') }}
            </h2>
            <p class="max-w-[38ch] text-sm leading-[1.7] text-[var(--talos-muted)]">
                {{ filtering ? t('notes.noMatchesBody') : t('notes.emptyBody') }}
            </p>
            <!-- Uno stato vuoto è un invito ad agire: la via d'uscita è quella
                 che RIPARA la situazione in cui si è — togliere il filtro se è
                 il filtro a nascondere, scrivere la prima nota se non ce ne
                 sono. -->
            <Button
                type="button"
                :data-testid="filtering ? 'talos-notes-clear-filters' : 'talos-notes-empty-new'"
                class="talos-pressable mt-[var(--talos-space-section)] min-h-touch rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] px-5 text-xs text-[var(--talos-accent-text)]"
                @click="filtering ? clearFilters() : startNew()"
            >
                {{ filtering ? t('notes.clearFilters') : t('notes.add') }}
            </Button>
        </div>

        <!-- A schede: le colonne le decide la LARGHEZZA MINIMA LEGGIBILE, non
             un numero (owner 2026-08-06, dopo due correzioni sul tablet).
             `clamp(10.5rem, 45%, 17rem)`: il 45% impedisce che su un riquadro
             stretto entrino tre colonne di schede-scheggia, i due estremi
             impediscono che su uno strettissimo la scheda diventi illeggibile o
             che su uno larghissimo resti una colonna sola. Su telefono e su
             tablet in verticale arriva alle stesse due colonne del mockup,
             senza che nessun numero di colonne sia scritto qui. -->
        <!-- U-14 — LE SCHEDE SI RIORDINANO, NON SALTANO.
             Mockup, `Personality.after` (app.js:283): un FLIP vero, 290 ms,
             `translate` + `scale` con origine in alto a sinistra. Misurato
             passando da schede a lista: `translate(311px,-133.7px)
             scale(0.483,1.12)`.
             In Vue il FLIP è il mestiere della classe `move` di
             `<TransitionGroup>`: si dichiara la transizione, la geometria la
             calcola lui. Il `tag="div"` tiene l'elemento contenitore com'era,
             col suo testid e la sua griglia — i test guardano quello. -->
        <TransitionGroup
            v-else-if="caricato && viewMode === 'grid'"
            tag="div"
            role="list"
            data-testid="talos-notes-grid"
            class="mt-[var(--talos-space-card)] grid grid-cols-[repeat(auto-fill,minmax(clamp(10.5rem,45%,17rem),1fr))] items-start gap-[calc(var(--talos-space-section)*1.25)]"
            move-class="talos-calm-move"
            leave-active-class="talos-calm-leave-active"
            leave-to-class="talos-calm-leave-to"
        >
            <TalosMobileNoteTile
                v-for="(note, indice) in shown"
                :key="note.id"
                v-bind="entrata(indice)"
                :note="note"
                :updated-label="updatedAt(note)"
                @open="open(note)"
                @action="(id) => runAction(note, id)"
            />
        </TransitionGroup>

        <TransitionGroup
            v-else-if="caricato"
            tag="div"
            data-testid="talos-notes-list"
            class="mt-[var(--talos-space-card)] flex flex-col"
            move-class="talos-calm-move"
            leave-active-class="talos-calm-leave-active"
            leave-to-class="talos-calm-leave-to"
        >
            <TalosMobileNoteRow
                v-for="(note, indice) in shown"
                :key="note.id"
                v-bind="entrata(indice)"
                :note="note"
                :updated-label="updatedAt(note)"
                @open="open(note)"
                @action="(id) => runAction(note, id)"
            />
        </TransitionGroup>

        <TalosMobileConfirmDialog
            v-if="pendingDelete"
            :title="t('notes.deleteTitle')"
            :description="t('notes.deleteDescription', { title: pendingDelete.title })"
            @close="deleting ? undefined : pendingDelete = null"
        >
            <template #footer>
                <Button type="button" variant="outline" :disabled="deleting" class="min-h-12" @click="pendingDelete = null">
                    {{ t('common.cancel') }}
                </Button>
                <Button
                    type="button"
                    data-testid="talos-notes-delete-confirm"
                    :disabled="deleting"
                    class="min-h-12 bg-[var(--talos-danger)] text-white"
                    @click="confirmDelete"
                >
                    {{ t('common.delete') }}
                </Button>
            </template>
        </TalosMobileConfirmDialog>
    </div>
</template>

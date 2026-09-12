<script setup lang="ts">
/**
 * La Memoria, nella forma del mockup «Talos Calm Finale» (owner 12/09/2026).
 *
 * La pagina si legge dall'alto in un ordine solo: **che posto è** (il titolo e
 * una riga che dice cosa ci si mette), **come lo restringo** (ricerca e
 * densità), **cosa sto guardando** (i filtri col loro conteggio), **quante sono
 * e in che ordine**, e poi le memorie.
 *
 * ## Le regole dell'owner che il mockup NON cambia
 *
 * - La riga e la scheda APRONO la memoria (2026-08-04: «ogni scheda apre una
 *   pagina dedicata, il pulsante indietro va alla precedente, dev'essere
 *   lineare»).
 * - L'anteprima anticipa, non contiene: mai il testo intero in elenco.
 * - Due assenze diverse, due frasi diverse — «non ce ne sono» e «il filtro le
 *   nasconde» sono due stati differenti, e solo il secondo si può annullare.
 * - Il modulo di creazione NON sta nell'elenco: è una pagina. ⛔ Qui è la
 *   modifica più grossa — prima questa schermata teneva titolo, contenuto, tipo
 *   e ambito in un modulo che si apriva sopra la lista, cioè il difetto già
 *   corretto sulle Note il 2026-08-06.
 * - Mai più di due azioni affiancate su una memoria (owner 10/09/2026): qui c'è
 *   solo il menu dei tre puntini, e tutto vive dentro.
 * - «Nuova memoria» è il pulsante primario del titolo, non un bottone largo in
 *   mezzo alla pagina.
 *
 * ## ⛔ U-18 — i filtri sono per TIPO, più uno che non è un tipo
 *
 * Il mockup filtra per i quattro tipi (`pFilterChoices`, `src/app.js:129`).
 * L'owner ha aggiunto «Da rivedere» il 12/09/2026, e non è una svista di
 * simmetria: il nostro modello ha righe che il MODELLO ha proposto e che
 * nessuno ha approvato (`status` `quarantined`/`rejected`, o `kind: 'rejected'`).
 * Senza quel filtro esisterebbero nell'elenco senza un modo per trovarle, e la
 * loro esistenza si scoprirebbe solo scorrendo.
 *
 * ⇒ Sono DUE assi nella stessa striscia — quattro voci dicono *cos'è* e una
 * dice *in che stato è*. Lo si accetta perché la domanda vera che ci si fa
 * davanti a questa pagina è una sola, «fammi vedere quelle che…», e dividerla
 * in due strisce chiederebbe di sceglierne una prima di sapere cosa si cerca.
 *
 * ## ⛔ Il punto in cui il mockup perde
 *
 * Il mockup fissa le colonne della griglia a un numero. L'owner aveva già
 * deciso il contrario il 2026-08-06, dopo due correzioni sul tablet: le colonne
 * le decide la **larghezza minima leggibile**, perché nessuno conosce in
 * anticipo la larghezza di ogni riquadro di ogni dispositivo. Vince l'owner — e
 * il `clamp()` qui sotto arriva comunque agli stessi due numeri del mockup
 * sulle due viewport che contano.
 *
 * ## ⛔ U-12 — l'etichetta «non attendibile» non è più qui
 *
 * Stava scritta per esteso sopra l'elenco. Adesso vive una volta sola, nella
 * pagina della memoria aperta, come «Contenuto fornito dall'utente». **La
 * disciplina non cambia**: le memorie restano `trust_level: 'untrusted'` e
 * continuano a entrare nel prompt come contesto dichiarato che non può
 * impartire istruzioni. È cambiato solo quante volte lo scriviamo addosso a chi
 * le sta leggendo.
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTalosI18n } from '@/i18n'
import { LayoutGrid, List, Plus, Search, SlidersHorizontal } from '@lucide/vue'
import TalosMobileMemoryCard from '@/components/talos/memory/TalosMobileMemoryCard.vue'
import TalosMobileMemoryRow from '@/components/talos/memory/TalosMobileMemoryRow.vue'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import { Button } from '@/components/ui/button'
import { useChatController } from '@/stores/chatController'
import { useTalosTabletLayout } from '@/composables/useTalosTabletLayout'
import { talosNotify } from '@/stores/notificationCentre'
import {
    TALOS_MEMORY_KINDS,
    talosMemoryDate,
    talosMemoryKindLabelKey,
    talosMemoryStateOf,
    type TalosMemoryKindId,
} from '@/components/talos/memory/memoryShape'
import { exportTalosMemoryText } from '@/components/talos/memory/memoryExport'
import type { TalosMemoryActionId } from '@/components/talos/memory/memoryActions'
import { talosSfasamento } from '@/composables/useTalosCalmMotion'
import { useTalosSlidingIndicator } from '@/composables/useTalosSlidingIndicator'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'
import type { TalosLocalMemory } from '@/repositories/chatRepository'

const controller = useChatController()
const { t, locale } = useTalosI18n()
const router = useRouter()
const { isTablet } = useTalosTabletLayout()

/**
 * ⛔ Lista o schede, e la scelta NON si ricorda ancora.
 *
 * Sulle Note passa dalle preferenze (`settings.shell.notes_view`), perché il
 * precedente è documentato: la Libreria «non sopravviveva a una riapertura», e
 * nessuno se ne accorgeva perché riaprire e ritrovare il predefinito sembra
 * normale.
 *
 * Qui resta un `ref` perché servirebbe una chiave nuova in `settings.shell`, e
 * questo giro di lavoro non ha il permesso di toccare quel file — un'altra
 * sessione ci lavora in parallelo. 🔜 **Debito dichiarato**: `memories_view`
 * accanto a `notes_view` e `library_view`, e queste sei righe diventano il
 * `computed` delle Note, identico.
 */
const viewMode = ref<'grid' | 'list'>('list')

const entries = ref<TalosLocalMemory[]>([])
const error = ref<string | null>(null)
const query = ref('')

/** I quattro tipi, più «tutte» e più lo stato che non è un tipo (U-18). */
type TalosMemoryFilter = 'all' | TalosMemoryKindId | 'review'
type TalosMemorySort = 'recent' | 'title' | 'kind'

/**
 * ⛔ Filtro e ordinamento vivono nella pagina, non nelle preferenze.
 *
 * Sono un modo di CERCARE, e una ricerca lasciata accesa da ieri è il difetto
 * peggiore: si riapre la stazione e metà delle memorie non c'è, senza che
 * niente dica perché. Il mockup li conserva perché è una demo che vive in un
 * browser solo.
 */
const filter = ref<TalosMemoryFilter>('all')
const sort = ref<TalosMemorySort>('recent')

function matchesFilter(memory: TalosLocalMemory, value: TalosMemoryFilter): boolean {
    if (value === 'all') return true
    // ⛔ «Da rivedere» guarda lo STATO, non il tipo: una proposta del modello
    // può avere un tipo perfettamente normale ed essere comunque in attesa di
    // un sì. Le due domande si incrociano — una preferenza in quarantena si
    // conta sia in «Preferenza» sia qui — ed è corretto che sia così: sono due
    // fatti veri sulla stessa riga.
    if (value === 'review') return talosMemoryStateOf(memory) === 'review'
    return memory.kind === value
}

/**
 * I conteggi guardano TUTTE le memorie, non quelle già ristrette dalla ricerca.
 *
 * È la stessa scelta del mockup, e la ragione è che i numeri servono a decidere
 * se vale la pena cambiare filtro: un «Procedura 0» calcolato dentro una
 * ricerca in corso direbbe che non ce ne sono, mentre ce ne sono — solo, non
 * per quella parola.
 */
const filters = computed(() => ([
    { id: 'all' as const, label: t('memory.filterAll') },
    ...TALOS_MEMORY_KINDS.map((kind) => ({ id: kind, label: t(talosMemoryKindLabelKey(kind)) })),
    { id: 'review' as const, label: t('memory.filterReview') },
].map((choice) => ({
    ...choice,
    count: entries.value.filter((memory) => matchesFilter(memory, choice.id)).length,
}))))

/**
 * Filtra su cio' che una persona ricorda — le parole che ha scritto lei — non
 * su un identificativo.
 */
const shown = computed(() => {
    const needle = query.value.trim().toLocaleLowerCase()
    const kept = entries.value.filter((memory) => (
        matchesFilter(memory, filter.value)
        && (needle.length === 0
            || (memory.title ?? '').toLocaleLowerCase().includes(needle)
            || (memory.content ?? '').toLocaleLowerCase().includes(needle))
    ))
    if (sort.value === 'title') {
        return [...kept].sort((left, right) => left.title.localeCompare(right.title, locale.value))
    }
    if (sort.value === 'kind') {
        // Dentro lo stesso tipo decide il titolo, non l'ordine di arrivo:
        // «raggruppate per tipo» senza un secondo criterio è un elenco che
        // cambia ordine da solo a ogni salvataggio.
        return [...kept].sort((left, right) => (
            String(left.kind).localeCompare(String(right.kind))
            || left.title.localeCompare(right.title, locale.value)
        ))
    }
    // `recent` è già l'ordine in cui il deposito le ha restituite
    // (`ORDER BY updated_at DESC`), quindi non si tocca.
    return kept
})

/**
 * ⛔ LO STATO VUOTO LAMPEGGIA, e direbbe una cosa falsa.
 *
 * Il difetto è documentato sulle Note (visto sul Pad il 12/09/2026): entrando
 * con tre righe salvate, il primo fotogramma mostrava «0», lo stato vuoto e il
 * pulsante per crearne una — e solo dopo arrivavano le righe.
 *
 * La causa non è il movimento, è una premessa sbagliata: `entries` parte da un
 * array vuoto, e `shown.length === 0` veniva letto come «non ce n'è nessuna».
 * Ma prima che `controller.memories.list()` abbia risposto la verità è **«non
 * lo so ancora»**, e sono tre stati, non due.
 *
 * ⇒ Finché la risposta non c'è, non si mostra né lo stato vuoto né il
 * conteggio. Dopo, i due stati vuoti di sempre — «non ce n'è» e «il filtro le
 * nasconde», che restano due frasi diverse.
 */
const caricato = ref(false)

const countLabel = computed(() => t('memory.count', { count: shown.value.length }))
/** Il filtro è l'unica assenza che si può annullare: la ricerca conta come filtro. */
const filtering = computed(() => query.value.trim().length > 0 || filter.value !== 'all')

function updatedAt(memory: TalosLocalMemory): string {
    return talosMemoryDate(memory.updated_at, locale.value)
}

function describeError(cause: unknown): string {
    return cause instanceof Error && cause.message ? cause.message : String(cause)
}

async function refresh(): Promise<void> {
    try {
        entries.value = await controller.memories.list()
        error.value = null
    } catch (cause) {
        error.value = describeError(cause)
    } finally {
        // Nel `finally` e non nel ramo felice: anche una lista che FALLISCE è
        // una risposta. Lasciando `caricato` a falso dopo un errore, la pagina
        // resterebbe muta per sempre — con l'errore scritto sopra e sotto il
        // vuoto, che è il solo posto dove la via d'uscita è scritta.
        caricato.value = true
    }
}

onMounted(refresh)

/** Voce → pagina → dettaglio, sempre nello stesso verso. */
function open(memory: TalosLocalMemory): void {
    void router.push({ name: 'memory-item', params: { id: memory.id } })
}

/** La creazione è una PAGINA, non un modulo qui: vedi la nota nel modello. */
function startNew(): void {
    void router.push({ name: 'memory-new' })
}

function clearFilters(): void {
    query.value = ''
    filter.value = 'all'
}

/**
 * Accendere e spegnere: l'unica cosa che cambia è se il modello la rilegge.
 *
 * Su una riga «da rivedere» accenderla vuol dire APPROVARLA — è la stessa
 * transizione, e non ne serve una seconda: quello che la persona sta dicendo,
 * in entrambi i casi, è «sì, portala nelle prossime conversazioni».
 */
async function toggleStatus(memory: TalosLocalMemory): Promise<void> {
    try {
        const attiva = talosMemoryStateOf(memory) === 'active'
        await controller.memories.setStatus(memory.id, attiva ? 'disabled' : 'active')
        await refresh()
    } catch (cause) {
        error.value = describeError(cause)
    }
}

async function exportMemory(memory: TalosLocalMemory): Promise<void> {
    try {
        const outcome = await exportTalosMemoryText(memory, t('memory.exportText'))
        // Condiviso o annullato, la persona ha appena visto il foglio di
        // Android: dirle una seconda volta cos'è successo sarebbe rumore. Il
        // ripiego invece va detto, perché è successo qualcosa di DIVERSO da
        // quello che il pulsante prometteva.
        if (outcome !== 'copied') return
        talosNotify({
            key: `memory:exported:${memory.id}`,
            channel: 'jobs',
            weight: 'notable',
            title: t('memory.exportCopied'),
            body: memory.title,
            at: Date.now(),
        })
    } catch {
        error.value = t('memory.exportFailed')
    }
}

const pendingDelete = ref<TalosLocalMemory | null>(null)
const deleting = ref(false)

async function confirmDelete(): Promise<void> {
    const target = pendingDelete.value
    if (!target || deleting.value) return
    deleting.value = true
    try {
        await controller.memories.remove(target.id)
        pendingDelete.value = null
        await refresh()
    } catch (cause) {
        error.value = describeError(cause)
    } finally {
        deleting.value = false
    }
}

/**
 * Una sola porta per tutte le azioni di una memoria, da qualunque densità arrivi.
 *
 * Scheda e riga emettono lo stesso identificativo: se ognuna sapesse cosa fare
 * da sé, prima o poi «Elimina» chiederebbe conferma da una parte e non
 * dall'altra.
 */
function runAction(memory: TalosLocalMemory, action: TalosMemoryActionId): void {
    switch (action) {
        case 'open': open(memory); break
        case 'edit': void router.push({ name: 'memory-edit', params: { id: memory.id } }); break
        case 'toggle': void toggleStatus(memory); break
        case 'export': void exportMemory(memory); break
        // ⛔ Mai senza conferma da un elenco: qui la memoria è un titolo e due
        // righe, e decidere di cancellarla è decidere su un testo che non si è
        // riletto. Nella pagina della memoria, dove c'è tutta, la conferma è in
        // linea; qui deve fermare.
        case 'delete': pendingDelete.value = memory; break
    }
}

/* ═══ U-14 — il movimento del mockup, in questa stazione ═══════════════════
 *
 * Quattro cose, e nessuna è decorativa: ognuna risponde a una domanda che
 * senza movimento resta senza risposta.
 *
 *   1. il filo sotto la scelta attiva SCIVOLA  -> da dove sono arrivato
 *   2. le schede si riordinano invece di saltare (FLIP) -> dov'è finita quella
 *      che stavo guardando quando ho cambiato vista
 *   3. una memoria nuova ENTRA                 -> quale è comparsa adesso
 *   4. l'onda parte dal dito                   -> ti ho sentito
 *
 * Tutte e quattro passano dai token del motore e dalle sue categorie: nessuna
 * durata è scritta qui dentro. Inventario e numeri misurati in
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
 * L'entrata di una memoria, come attributi da applicare alla riga o alla scheda.
 *
 * Torna un oggetto vuoto oltre il tetto: senza l'attributo d'intento
 * l'elemento non ha nessuna animazione addosso, che è esattamente ciò che
 * serve dalla diciassettesima riga in poi.
 *
 * ⛔ Il ritardo è un `calc()` sul token del motore, non un numero: quando
 * l'utente spegne «Movimento interfaccia» il token va a `0ms` e il `calc()` si
 * annulla da sé.
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
        data-testid="talos-memory-screen"
    >
        <!-- Che posto è questo. Il titolo e una riga sola che dice cosa ci si
             mette: è il primo pezzo del mockup, e serve perché una stazione
             aperta dal menu deve dire da sola dove si è finiti. -->
        <header class="flex items-start justify-between gap-[var(--talos-space-section)]">
            <div class="min-w-0">
                <h1 class="text-3xl font-semibold leading-[1.15] tracking-[-0.03em] text-[var(--talos-text)]">
                    {{ t('navigation.memory') }}
                </h1>
                <p class="mt-[var(--talos-space-inline)] text-sm leading-6 text-[var(--talos-muted)]">
                    {{ t('memory.subtitle') }}
                </p>
            </div>
            <!-- Sul tablet il pulsante dice cosa fa; sul telefono, dove la riga
                 del titolo è tutta la larghezza che c'è, resta il quadrato in
                 accento col nome accessibile intatto. Stesso mockup, due
                 larghezze. -->
            <Button
                type="button"
                data-testid="talos-memory-new"
                :aria-label="t('memory.newMemory')"
                :class="[
                    'talos-pressable shrink-0 rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] text-[var(--talos-accent-text)] hover:bg-[var(--talos-accent-hover)]',
                    isTablet ? 'min-h-touch gap-2 px-5 text-sm font-medium' : 'size-14 p-0',
                ]"
                @click="startNew"
            >
                <Plus :class="isTablet ? 'size-4' : 'size-6'" aria-hidden="true" />
                <span v-if="isTablet">{{ t('memory.newMemory') }}</span>
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
                    data-testid="talos-memory-search"
                    :placeholder="t('memory.searchPlaceholder')"
                    :aria-label="t('memory.searchPlaceholder')"
                    class="min-h-touch w-full rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-9 pr-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                >
            </label>

            <!-- Un radiogroup e non due bottoni indipendenti: sono
                 alternative, e dirlo è ciò che le rende comprensibili a chi
                 naviga con lo screen reader. -->
            <div
                ref="gruppoVista"
                role="radiogroup"
                :aria-label="t('memory.viewLabel')"
                class="flex shrink-0 items-center gap-[2px] rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-panel)] px-[3px]"
            >
                <button
                    v-for="mode in ([['list', t('memory.viewList'), List], ['grid', t('memory.viewGrid'), LayoutGrid]] as const)"
                    :key="mode[0]"
                    type="button"
                    role="radio"
                    :aria-checked="viewMode === mode[0]"
                    :aria-label="mode[1]"
                    :data-testid="`talos-memory-view-${mode[0]}`"
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
                    <!-- U-14: `data-talos-indicator` è ciò che
                         `useTalosSlidingIndicator` cerca dentro il gruppo. Il
                         filo non sparisce e riappare: SCIVOLA da dov'era. -->
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
            :aria-label="t('memory.filterLabel')"
            data-testid="talos-memory-filters"
            class="mt-[var(--talos-space-card)] flex min-h-touch items-center gap-[var(--talos-space-inline)] overflow-x-auto border-b border-[var(--talos-border)] [scrollbar-width:none]"
        >
            <button
                v-for="choice in filters"
                :key="choice.id"
                type="button"
                role="radio"
                :aria-checked="filter === choice.id"
                :tabindex="filter === choice.id ? 0 : -1"
                :data-testid="`talos-memory-filter-${choice.id}`"
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
            <span role="status" aria-live="polite" data-testid="talos-memory-count">{{ caricato ? countLabel : '' }}</span>
            <label class="flex shrink-0 items-center gap-1">
                <SlidersHorizontal class="size-4" aria-hidden="true" />
                <span class="sr-only">{{ t('memory.sortLabel') }}</span>
                <!-- Un `select` nativo: sul telefono apre la ruota di Android,
                     che è il controllo che la persona conosce già, e non ha
                     bisogno di un pannello nostro per tre voci. -->
                <select
                    v-model="sort"
                    data-testid="talos-memory-sort"
                    :aria-label="t('memory.sortLabel')"
                    class="min-h-touch max-w-36 cursor-pointer border-0 bg-transparent px-1 text-xs text-[var(--talos-muted)] outline-none"
                >
                    <option value="recent">{{ t('memory.sortRecent') }}</option>
                    <option value="title">{{ t('memory.sortTitle') }}</option>
                    <option value="kind">{{ t('memory.sortKind') }}</option>
                </select>
            </label>
        </div>

        <p v-if="error" role="alert" data-testid="talos-memory-error" class="py-[var(--talos-space-inline)] text-xs text-[var(--talos-danger)]">
            {{ error }}
        </p>

        <!-- Due assenze diverse, due frasi diverse: «non ce ne sono» e «il
             filtro le nasconde» sono due stati differenti, e solo il secondo si
             può annullare. -->
        <div
            v-if="caricato && shown.length === 0"
            :data-testid="filtering ? 'talos-memory-no-matches' : 'talos-memory-empty'"
            role="status"
            class="flex flex-1 flex-col items-center justify-center gap-[var(--talos-space-inline)] py-[calc(var(--talos-space-page)*2)] text-center"
        >
            <!-- Il disegno del mockup per la Memoria (`pEmptyArt`,
                 `app.js:160`): un libro chiuso con una spunta accanto. U-14: SI
                 TRACCIA, una volta sola — uno spazio bianco fermo si legge come
                 un guasto, un tratto che si disegna dice «qui non c'è ancora
                 niente». -->
            <svg
                class="talos-calm-line-art mb-[var(--talos-space-section)] h-[132px] w-[140px] text-[var(--talos-border-strong)]"
                viewBox="0 0 150 140"
                aria-hidden="true"
            >
                <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path data-talos-draw d="M37 39h76v69H37Z" />
                    <path data-talos-draw d="M45 31h60M53 23h44" />
                    <path data-talos-draw class="stroke-[var(--talos-accent-border)]" d="M58 63h34M58 76h25" />
                    <circle data-talos-draw cx="104" cy="105" r="17" />
                    <path data-talos-draw class="stroke-[var(--talos-accent-border)]" d="m97 104 5 5 9-10" />
                </g>
            </svg>
            <h2 class="max-w-[27ch] text-xl font-medium leading-[1.5] tracking-[-0.02em] text-[var(--talos-text)]">
                {{ filtering ? t('memory.noMatches') : t('memory.empty') }}
            </h2>
            <p class="max-w-[38ch] text-sm leading-[1.7] text-[var(--talos-muted)]">
                {{ filtering ? t('memory.noMatchesBody') : t('memory.emptyBody') }}
            </p>
            <!-- Uno stato vuoto è un invito ad agire: la via d'uscita è quella
                 che RIPARA la situazione in cui si è — togliere il filtro se è
                 il filtro a nascondere, scrivere la prima memoria se non ce ne
                 sono. -->
            <Button
                type="button"
                :data-testid="filtering ? 'talos-memory-clear-filters' : 'talos-memory-empty-new'"
                class="talos-pressable mt-[var(--talos-space-section)] min-h-touch rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] px-5 text-xs text-[var(--talos-accent-text)]"
                @click="filtering ? clearFilters() : startNew()"
            >
                {{ filtering ? t('memory.clearFilters') : t('memory.newMemory') }}
            </Button>
        </div>

        <!-- A schede: le colonne le decide la LARGHEZZA MINIMA LEGGIBILE, non
             un numero (owner 2026-08-06, dopo due correzioni sul tablet).
             U-14 — LE SCHEDE SI RIORDINANO, NON SALTANO: in Vue il FLIP è il
             mestiere della classe `move` di `<TransitionGroup>` (documentazione
             letta il 12/09/2026, https://vuejs.org/guide/built-ins/transition-group
             — si dichiara la transizione, la geometria la calcola lui, e chi
             ESCE va fuori dal flusso o i conti di chi resta sbagliano). -->
        <TransitionGroup
            v-else-if="caricato && viewMode === 'grid'"
            tag="div"
            role="list"
            data-testid="talos-memory-grid"
            class="mt-[var(--talos-space-card)] grid grid-cols-[repeat(auto-fill,minmax(clamp(10.5rem,45%,17rem),1fr))] items-start gap-[calc(var(--talos-space-section)*1.25)]"
            move-class="talos-calm-move"
            leave-active-class="talos-calm-leave-active"
            leave-to-class="talos-calm-leave-to"
        >
            <TalosMobileMemoryCard
                v-for="(memory, indice) in shown"
                :key="memory.id"
                v-bind="entrata(indice)"
                :memory="memory"
                @open="open(memory)"
                @action="(id) => runAction(memory, id)"
            />
        </TransitionGroup>

        <TransitionGroup
            v-else-if="caricato"
            tag="div"
            data-testid="talos-memory-list"
            class="mt-[var(--talos-space-card)] flex flex-col"
            move-class="talos-calm-move"
            leave-active-class="talos-calm-leave-active"
            leave-to-class="talos-calm-leave-to"
        >
            <TalosMobileMemoryRow
                v-for="(memory, indice) in shown"
                :key="memory.id"
                v-bind="entrata(indice)"
                :memory="memory"
                :updated-label="updatedAt(memory)"
                @open="open(memory)"
                @action="(id) => runAction(memory, id)"
            />
        </TransitionGroup>

        <!-- R1-1: la `Dialog` di reka non si disegnava sulla WebView dell'owner
             (prove F5.2) — «Elimina» sembrava un tocco a vuoto. Questa è la
             superficie provata sul dispositivo. -->
        <TalosMobileConfirmDialog
            v-if="pendingDelete"
            :title="t('memory.deleteTitle')"
            :description="t('memory.deleteDescription', { title: pendingDelete.title })"
            @close="deleting ? undefined : pendingDelete = null"
        >
            <template #footer>
                <Button type="button" variant="outline" :disabled="deleting" class="min-h-12" @click="pendingDelete = null">
                    {{ t('common.cancel') }}
                </Button>
                <Button
                    type="button"
                    data-testid="talos-memory-delete-confirm"
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

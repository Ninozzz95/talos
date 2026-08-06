<script setup lang="ts">
/**
 * F5 station — desktop `TalosNotes` parity, local-first: notes are UNTRUSTED
 * disclosed context (same trust discipline as memories); the banner says so.
 */
import { computed, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { ChevronRight, LayoutGrid, List, Search, StickyNote, Plus } from '@lucide/vue'
import TalosMobileNoteTile from '@/components/talos/notes/TalosMobileNoteTile.vue'
import { useSettingsStore } from '@/stores/settings'
import { useRouter } from 'vue-router'
import { useChatController } from '@/stores/chatController'
import { talosRelativeTime } from '@/lib/relativeTime'
import type { TalosLocalNote } from '@/repositories/chatRepository'

const controller = useChatController()
const { t } = useTalosI18n()
const settings = useSettingsStore()

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
const router = useRouter()

/** Voce → pagina → dettaglio, sempre nello stesso verso. */
function open(note: TalosLocalNote): void {
    void router.push({ name: 'note-item', params: { id: note.id } })
}

/**
 * Il campo di ricerca dell'impalcatura che l'owner ha approvato: titolo,
 * ricerca, lista, FAB. Mancava qui, e una lista che cresce senza un modo per
 * restringerla si scorre finche' non ci si arrende.
 *
 * Filtra su cio' che una persona ricorda — le parole che ha scritto lei —
 * non su un identificativo.
 */
const query = ref('')
const shown = computed(() => {
    const termine = query.value.trim().toLowerCase()
    if (termine.length === 0) return entries.value
    return entries.value.filter((note) => ((note.title ?? '').toLowerCase().includes(termine)) || ((note.content ?? '').toLowerCase().includes(termine)))
})
const error = ref<string | null>(null)

/** La creazione è una PAGINA, non un modulo qui: vedi la nota nel modello. */
function startNew(): void {
    void router.push({ name: 'note-new' })
}
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
        entries.value = await controller.notes.list()
    } catch (cause) {
        error.value = describeError(cause)
    }
}

onMounted(refresh)


</script>

<template>
    <div class="flex min-h-full flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3" data-testid="talos-notes-screen">
        <!-- L'impalcatura approvata dall'owner: ricerca, lista, FAB. Mancava
             qui, e una lista che cresce senza un modo per restringerla si
             scorre finche' non ci si arrende.
             Sta FUORI da ogni catena `v-if`: infilarlo in mezzo a un
             `v-if`/`v-else` rompe la coppia, e il campo deve restare visibile
             anche quando la lista e' vuota — e' con la lista vuota che si
             cancella il filtro. -->
        <label class="relative block">
            <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--talos-muted)]" aria-hidden="true" />
            <input
                v-model="query"
                type="search"
                inputmode="search"
                data-testid="talos-notes-search"
                :placeholder="t('notes.searchPlaceholder')"
                :aria-label="t('notes.searchPlaceholder')"
                class="min-h-12 w-full rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-9 pr-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
            >
        </label>

        <!-- Le due densita', con la stessa grammatica della Libreria: un
             radiogroup, non due bottoni indipendenti — sono alternative, e
             dirlo e' cio' che le rende comprensibili a chi naviga con lo
             screen reader. -->
        <div
            role="radiogroup"
            :aria-label="t('notes.viewLabel')"
            class="flex items-center gap-1 self-end rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] p-1"
        >
            <button
                type="button"
                role="radio"
                :aria-checked="viewMode === 'list'"
                :aria-label="t('library.list')"
                data-testid="talos-notes-view-list"
                :class="['talos-pressable flex min-h-touch min-w-touch items-center justify-center rounded-full', viewMode === 'list' ? 'bg-[var(--talos-active)] text-[var(--talos-text)]' : 'text-[var(--talos-muted)]']"
                @click="viewMode = 'list'"
            >
                <List class="size-4" aria-hidden="true" />
            </button>
            <button
                type="button"
                role="radio"
                :aria-checked="viewMode === 'grid'"
                :aria-label="t('library.grid')"
                data-testid="talos-notes-view-grid"
                :class="['talos-pressable flex min-h-touch min-w-touch items-center justify-center rounded-full', viewMode === 'grid' ? 'bg-[var(--talos-active)] text-[var(--talos-text)]' : 'text-[var(--talos-muted)]']"
                @click="viewMode = 'grid'"
            >
                <LayoutGrid class="size-4" aria-hidden="true" />
            </button>
        </div>

        <p class="text-xs leading-5 text-[var(--talos-muted)]">
            {{ t('notes.intro') }}
        </p>

        <!-- Il modulo di creazione NON sta più qui.

             Visto sul tablet il 2026-08-06: titolo, corpo e pulsante restavano
             aperti sopra l'elenco e rubavano un terzo dello schermo in
             permanenza — anche a chi era entrato solo per rileggere una nota. Il
             gesto raro toglieva spazio a quello frequente.

             Adesso è il FAB in fondo alla pagina, che apre `/notes/new`: la
             stessa grammatica della Ricerca, dove ogni voce è una pagina e
             Indietro è lineare. Il commento in cima a questo file parlava di un
             FAB fin dall'inizio; era stato descritto e non fatto. -->

        <p v-if="error" role="alert" class="text-xs text-[var(--talos-danger,#dc5b5b)]">{{ error }}</p>

        <!-- Due assenze diverse, due frasi diverse.
             Prima ce n'era una sola e guardava `entries`, cioe' l'elenco NON
             filtrato: filtrando via tutto si otteneva una schermata vuota senza
             nemmeno una riga di testo, e chi guardava non poteva sapere se le
             note fossero finite o se fosse il filtro a nasconderle. La seconda
             frase dice quale delle due, ed e' l'unica che si puo' annullare. -->
        <p v-if="!entries.length" data-testid="talos-notes-empty" class="py-6 text-center text-sm text-[var(--talos-muted)]">
            {{ t('notes.empty') }}
        </p>
        <p v-else-if="!shown.length" data-testid="talos-notes-no-matches" class="py-6 text-center text-sm text-[var(--talos-muted)]">
            {{ t('notes.noMatches') }}
        </p>
        <!-- A schede: colonne decise dalla LARGHEZZA MINIMA LEGGIBILE, non da
             un numero.

             Corretto due volte sul tablet il 2026-08-06, e le due volte
             insegnano la stessa cosa. Prima `grid-cols-2` fisse: sul riquadro
             largo del tablet le schede diventavano enormi e mezze vuote. Poi le
             soglie della Libreria (`md:4 xl:6`): schede da 116 px, con la
             descrizione tagliata a metà parola e la data sparita del tutto.

             Il punto è che quei conteggi sono giusti per la Libreria e sbagliati
             qui: una scheda di file è una MINIATURA, che a 116 px si legge
             benissimo; una nota è TESTO, e il testo ha una larghezza sotto la
             quale smette di essere leggibile. Copiare il numero invece della
             ragione è ciò che ha prodotto entrambi i difetti.

             `auto-fill` + `minmax` lascia decidere alla griglia quante ne
             stanno, dato che nessuno può conoscere in anticipo la larghezza di
             ogni riquadro di ogni dispositivo — che è la stessa dottrina del
             non-scritto-a-mano, applicata al disegno. -->
        <div
            v-else-if="viewMode === 'grid'"
            role="list"
            data-testid="talos-notes-grid"
            class="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3"
        >
            <TalosMobileNoteTile
                v-for="note in shown"
                :key="note.id"
                :note="note"
                :updated-label="updatedAt(note.updated_at)"
                :untrusted-label="t('notes.untrusted')"
                @open="open(note)"
            />
        </div>

        <ul v-else class="flex flex-col gap-2">
            <li
                v-for="note in shown"
                :key="note.id"
                data-testid="talos-note-row"
                class="rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3"
            >
                <!-- La riga APRE la nota. Owner 2026-08-04: «ogni scheda apre
                     una pagina dedicata». Prima non si apriva affatto: aveva
                     solo il cestino, e il contenuto intero riversato dentro. -->
                <button
                    type="button"
                    data-testid="talos-note-open"
                    class="talos-pressable flex w-full items-start gap-2 text-left"
                    @click="open(note)"
                >
                    <StickyNote class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                    <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="text-sm font-semibold text-[var(--talos-text)]">{{ note.title }}</span>
                            <span class="rounded-full bg-[var(--talos-active)] px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ t('notes.untrusted') }}</span>
                        </div>
                        <!-- Due righe, non tutta la nota: la riga ANTICIPA, la
                             pagina CONTIENE. Prima una nota lunga occupava lo
                             schermo intero e scorrere l'elenco era impossibile. -->
                        <p class="mt-1 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-[var(--talos-muted)]">{{ note.content }}</p>
                        <p class="mt-1 text-2xs text-[var(--talos-muted)]">{{ updatedAt(note.updated_at) }}</p>
                    </div>
                    <ChevronRight class="mt-0.5 size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                </button>
            </li>
        </ul>

        <button
            type="button"
            data-testid="talos-notes-new-fab"
            :aria-label="t('notes.add')"
            class="talos-pressable fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-5 z-20 inline-flex size-14 items-center justify-center rounded-full bg-[var(--talos-accent)] text-[var(--talos-accent-contrast,var(--primary-foreground))] shadow-lg"
            @click="startNew"
        >
            <Plus class="size-6" aria-hidden="true" />
        </button>
    </div>
</template>

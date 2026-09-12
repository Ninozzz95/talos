<script setup lang="ts">
/**
 * U-20 — UN FILE DELLA LIBRERIA COME SCHEDA, nella forma del mockup «Talos Calm
 * Finale».
 *
 * La scheda è `.library-card`: un riquadro d'anteprima in alto (`.library-art`,
 * tutta la larghezza) e sotto il nome con una riga di dettaglio. Prima era un
 * quadrato col nome scritto SOPRA il glifo e quattro pastiglie nere galleggianti
 * — il glifo, la spunta, il badge «Gen», la pastiglia del contesto e i tre
 * puntini, tutti sovrapposti a un'immagine. Il mockup separa le due cose, ed è
 * la ragione per cui funziona: **sopra si guarda, sotto si legge**.
 *
 * ## ⛔ Le regole dell'owner che questa forma non cambia
 *
 * - **La scheda APRE.** Tutto il blocco è un bottone solo; le azioni stanno nei
 *   tre puntini, mai affiancate (owner 10/09/2026: mai più di due azioni
 *   accanto a un oggetto, e oltre due si fa un menu).
 * - **Un menu ⋯ e basta**, fuori dal bottone che apre — un bottone dentro un
 *   bottone non è HTML valido e, su Android, è un bersaglio che a volte prende
 *   l'azione sbagliata.
 * - **Lo stato del contesto resta scritto**, con il suo `data-testid`: è
 *   l'unica cosa che dice se questo file entra nelle risposte, e toglierla per
 *   fare ordine sarebbe togliere l'informazione più importante della pagina.
 * - **La selezione multipla** e l'anello di selezione restano dov'erano: sopra
 *   l'anteprima, perché è lì che il dito guarda quando sta scegliendo.
 *
 * ## ⛔ Perché il badge «Gen» è diventato una parola
 *
 * Era una pastiglia nera sull'angolo dell'immagine. Sopra un'anteprima vera —
 * la prima pagina di un PDF, una foto — ogni pastiglia nera copre proprio quello
 * che si è appena fatto il lavoro di mostrare. Ora è la prima voce della riga di
 * dettaglio, dove convive con l'estensione e la chat di provenienza: le stesse
 * parole della riga in elenco, così le due viste non raccontano cose diverse.
 */
import { computed } from 'vue'
import { Check } from '@lucide/vue'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'
import TalosMobileLibraryArt from '@/components/talos/library/TalosMobileLibraryArt.vue'
import TalosRowActions, { type TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import { talosLibraryFilePresentation } from '@/lib/libraryFilePresentation'
import type { TalosThumbnailState } from '@/composables/useTalosLibraryThumbnails'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

const props = withDefaults(defineProps<{
    file: TalosLocalVaultFile
    thumbnailUrl: string | null
    /** A che punto è l'anteprima: in caricamento, pronta, oppure non ce ne sarà una. */
    thumbnailState?: TalosThumbnailState
    /** Selection mode is on: the tile shows a checkbox instead of its menu. */
    selecting: boolean
    selected: boolean
    generated: boolean
    /** «Generato», già tradotto: il componente non conosce la lingua. */
    generatedLabel: string
    contextLabel: string
    /** La chat da cui il file proviene, quando c'è e non è già un'intestazione. */
    originLabel?: string | null
    actionsLabel: string
    /** Whatever the actions menu accepts; this tile only forwards it. */
    actions: readonly TalosRowAction[]
    tapLabel: string
}>(), {
    thumbnailState: 'none',
    originLabel: null,
})

const emit = defineEmits<{
    tap: []
    action: [action: string, checked?: boolean]
}>()

/**
 * ⛔ L'onda parte DAL DITO, e per saperlo le serve il punto toccato.
 *
 * La classe `talos-wave-host` da sola non basta: dà al bottone le tre
 * proprietà senza cui il cerchio si posiziona rispetto alla pagina o esce dal
 * bordo arrotondato, ma il cerchio lo crea `onPointerDown`, perché la sua
 * POSIZIONE è una cosa che il CSS non sa. Classe senza handler vuol dire una
 * scheda che sembra rispondere al tocco nel codice e non risponde a schermo.
 */
const onda = useTalosTouchWave()

/** L'estensione che si legge sotto la scheda: `HTML`, `MD`, `CSV` — come nel mockup. */
const presentation = computed(() => talosLibraryFilePresentation(
    props.file.display_name,
    props.file.media_type,
))

/**
 * La riga di dettaglio, come nel mockup: `HTML · Presentazione del progetto`.
 *
 * ⛔ Si compone qui e non nel template perché i pezzi sono facoltativi, e una
 * catena di `v-if` con dei `·` sparsi in mezzo produce prima o poi una riga che
 * comincia o finisce con un punto separatore — il difetto che si vede solo
 * quando manca il pezzo di mezzo, cioè quasi mai in prova.
 */
interface PezzoDiDettaglio { text: string; accent: boolean }

const dettaglio = computed<PezzoDiDettaglio[]>(() => {
    const pezzi: PezzoDiDettaglio[] = []
    /*
     * ⛔ «Generato» è un oggetto con un flag, non la stringa sentinella
     * `'generated'` da riconoscere più avanti nel template. Una sentinella
     * dentro una lista di testo libero è una collisione che aspetta: basta una
     * chat chiamata così, e la sua riga uscirebbe colorata d'accento e
     * tradotta. Qui il colore è un dato, non un indovinello sul contenuto.
     */
    if (props.generated) pezzi.push({ text: props.generatedLabel, accent: true })
    pezzi.push({ text: presentation.value.extension, accent: false })
    if (props.originLabel) pezzi.push({ text: props.originLabel, accent: false })
    return pezzi
})
</script>

<template>
    <div
        role="listitem"
        :data-vault-file-id="file.id"
        class="talos-calm-marker relative flex min-w-0 flex-col overflow-hidden rounded-[var(--talos-radius-card)] border bg-[var(--talos-card)] text-left"
        :class="selected
            ? 'border-[var(--talos-accent)]'
            : 'border-[var(--talos-border)]'"
    >
        <!-- La scheda APRE: un bottone solo, e prende tutto ciò che si guarda e
             si legge. L'onda parte dal dito, come su ogni riga dell'app. -->
        <button
            type="button"
            class="talos-pressable talos-pressable-row talos-wave-host flex min-w-0 flex-col text-left focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            :aria-label="tapLabel"
            :aria-pressed="selecting ? selected : undefined"
            @click="emit('tap')"
            @pointerdown="onda.onPointerDown"
        >
            <TalosMobileLibraryArt
                :file="file"
                :thumbnail-url="thumbnailUrl"
                :state="thumbnailState"
                :preview-text="file.extracted_text"
                :alt="''"
            />
            <!-- ⛔ `pr-12`: i tre puntini stanno sopra questo angolo, e senza
                 il posto per loro il nome di un file lungo ci finirebbe
                 sotto — leggibile in prova, illeggibile col nome vero. -->
            <span class="flex min-w-0 flex-col p-[var(--talos-space-card)] pr-12 md:p-[var(--talos-space-page)] md:pr-12">
                <strong class="line-clamp-2 text-sm font-medium leading-[1.6] text-[var(--talos-text)]">
                    {{ file.display_name }}
                </strong>
                <small class="mt-[var(--talos-space-inline)] truncate text-xs text-[var(--talos-muted)]">
                    <template v-for="(pezzo, indice) in dettaglio" :key="pezzo.text">
                        <span v-if="indice > 0"> · </span><span
                            :class="pezzo.accent ? 'text-[var(--talos-accent)]' : ''"
                        >{{ pezzo.text }}</span>
                    </template>
                </small>
                <!-- ⛔ Lo stato del contesto NON è un dettaglio: dice se questo
                     file può entrare in una risposta. Resta scritto, e resta
                     con il nome che i test interrogano. -->
                <small
                    :data-testid="`talos-library-context-state-${file.id}`"
                    class="mt-[var(--talos-space-inline)] truncate text-2xs leading-4 text-[var(--talos-muted)]"
                >
                    {{ $t('library.contextState', { state: contextLabel }) }}
                </small>
            </span>
        </button>

        <!-- I tre puntini: FUORI dal bottone che apre, e in basso a destra della
             riga di dettaglio — dove sta il pollice, e dove non copre niente. -->
        <div v-if="!selecting" class="absolute bottom-1 right-1 z-[2]">
            <TalosRowActions
                :label="actionsLabel"
                :test-id="`talos-library-actions-${file.id}`"
                :items="actions"
                @select="(action, checked) => emit('action', action, checked)"
            />
        </div>

        <!-- La spunta della selezione, sopra l'anteprima: è lì che guarda chi
             sta scegliendo. `talos-calm-marker` le dà la stessa durata di ogni
             altro segno che cambia forma nell'app. -->
        <span
            v-if="selecting"
            class="talos-calm-marker pointer-events-none absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full border-2"
            :class="selected
                ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)] text-[var(--talos-accent-text)]'
                : 'border-white/80 bg-black/35'"
        >
            <Check v-if="selected" class="size-4" aria-hidden="true" />
        </span>
        <span
            v-if="selected"
            class="pointer-events-none absolute inset-0 rounded-[var(--talos-radius-card)] ring-2 ring-inset ring-[var(--talos-accent)]"
            aria-hidden="true"
        />
    </div>
</template>

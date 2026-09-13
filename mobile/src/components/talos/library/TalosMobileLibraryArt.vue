<script setup lang="ts">
/**
 * U-20 — IL RIQUADRO D'ANTEPRIMA DI UNA SCHEDA DELLA LIBRERIA.
 *
 * È il `.library-art` del mockup «Talos Calm Finale»: un rettangolo su fondo
 * tenue, alto 10rem sul tablet e 8rem sul telefono, dentro cui ci finisce **una**
 * di quattro cose. Qui c'è solo il disegno; *quale* delle quattro lo decidono
 * `lib/library/libraryThumbnails.ts` (che anteprima merita il file) e
 * `composables/useTalosLibraryThumbnails.ts` (a che punto è).
 *
 * ## Le quattro cose, in ordine di quanto dicono
 *
 *   1. **l'anteprima vera** — la prima pagina del PDF, o l'immagine ridotta;
 *   2. **l'anteprima tipografica** — il `.mini-document` del mockup: linguetta
 *      in accento, il titolo VERO del documento, e quattro barre che ne danno la
 *      forma. Disegnata in DOM, quindi gratis;
 *   3. **il segno di un link** — la favicon del sito e il titolo della pagina:
 *      per un indirizzo, quelle due cose SONO l'anteprima;
 *   4. **il glifo del formato** — l'ultima spiaggia, e resta esattamente quello
 *      che l'app mostrava prima di questo lavoro.
 *
 * ## ⛔ Lo stato «in caricamento» è disegnato, non sottinteso
 *
 * Fra «sto generando» e «non se ne può fare una» passa la differenza fra
 * aspettare e non aspettare. Senza un terzo stato la scheda mostrerebbe il glifo
 * durante l'attesa e poi lo sostituirebbe con l'immagine: uno sfarfallio su ogni
 * file, a ogni apertura, e nessun modo di sapere quali file una miniatura non ce
 * l'avranno mai.
 *
 * ⛔ Il battito del segnaposto è sotto `motion-safe:`: chi ha chiesto meno
 * movimento vede un rettangolo fermo, che dice la stessa cosa.
 *
 * ## ⛔ `text-3xs`, e non la misura assoluta del mockup
 *
 * Il mockup fissa il titolo del `.mini-document` a una misura assoluta, e la
 * prima stesura di questo file l'aveva copiata alla lettera. Un contratto del
 * progetto l'ha respinta, e aveva ragione: `--text-3xs` vale **esattamente**
 * quel numero, ma moltiplicato per `--talos-ui-scale`. Scritta a mano, era lo
 * stesso carattere per chi ha ingrandito i caratteri di sistema e per chi non
 * l'ha fatto — cioè un pezzo d'interfaccia che smette di obbedire a una
 * preferenza, in silenzio, solo qui dentro.
 *
 * ⛔ E la guardia legge il SORGENTE GREZZO, commenti compresi: scrivere qui la
 * misura nella forma di una classe la farebbe scattare su una frase che spiega
 * perché quella classe non c'è. Restringerla per farla tacere sarebbe renderla
 * cieca a una violazione vera — si riformula il commento, non il cancello.
 *
 * ## ⛔ `object-contain` e non `cover`
 *
 * È la scelta del mockup (`.library-art img{object-fit:contain}`) ed è quella
 * giusta anche coi contenuti veri: la prima pagina di un PDF ritagliata perde
 * proprio il titolo, che sta in alto. Un'immagine larga lascia due bande di
 * fondo, e va bene — meglio uno spazio onesto di un ritaglio che nasconde.
 */
import { computed } from 'vue'
import { Globe } from '@lucide/vue'
import TalosMobileLibraryFileGlyph from '@/components/talos/library/TalosMobileLibraryFileGlyph.vue'
import { talosThumbnailKind, talosTypographicPreview } from '@/lib/library/libraryThumbnails'
import type { TalosThumbnailState } from '@/composables/useTalosLibraryThumbnails'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

const props = withDefaults(defineProps<{
    /** Il file, quando la scheda ne mostra uno. */
    file?: TalosLocalVaultFile | null
    /** L'anteprima generata, se c'è. */
    thumbnailUrl?: string | null
    /** A che punto è l'anteprima di questo file. */
    state?: TalosThumbnailState
    /** Un link salvato: il titolo della pagina e la sua favicon. */
    linkTitle?: string | null
    faviconUrl?: string | null
    /** Il testo da cui ricavare l'anteprima tipografica. */
    previewText?: string | null
    /** Il nome accessibile dell'immagine, quando ce n'è una. */
    alt?: string
}>(), {
    file: null,
    thumbnailUrl: null,
    state: 'none',
    linkTitle: null,
    faviconUrl: null,
    previewText: null,
    alt: '',
})

/**
 * ⛔ CHE ANTEPRIMA MERITA QUESTO FILE LO DECIDE `talosThumbnailKind`, NON
 * L'ORDINE DEI `v-if`.
 *
 * Trovato da un test: un PDF la cui prima pagina non si era potuta rendere
 * finiva disegnato come un `.mini-document`, perché aveva del testo estratto e
 * il ramo tipografico veniva prima del glifo. Plausibile a vedersi, e sbagliato:
 * un PDF non è un foglio di testo, e chi lo guardava avrebbe creduto che TALOS
 * avesse letto il documento in quel modo.
 *
 * Il vero difetto però non era il PDF: era che **il genere dell'anteprima si
 * stava decidendo due volte** — una nel modulo, una nella catena dei rami qui
 * sotto — e la seconda non conosceva la prima. Ora la domanda si fa a chi ha il
 * diritto di rispondere, una volta sola.
 */
const genere = computed(() => (props.file ? talosThumbnailKind(props.file) : 'none'))

const tipografica = computed(() => (
    genere.value === 'typographic' ? talosTypographicPreview(props.previewText) : null
))

/**
 * Cosa si disegna, in una parola sola.
 *
 * ⛔ Una catena `v-if` nel template avrebbe fatto lo stesso, e sarebbe stata la
 * cosa impossibile da provare: qui la decisione è un valore che un test può
 * leggere, e il template è solo il suo disegno.
 */
const cosa = computed<'image' | 'loading' | 'link' | 'typographic' | 'glyph'>(() => {
    if (props.thumbnailUrl) return 'image'
    if (props.state === 'loading') return 'loading'
    if (props.linkTitle) return 'link'
    if (tipografica.value) return 'typographic'
    return 'glyph'
})
</script>

<template>
    <div
        data-talos-library-art
        :data-talos-art="cosa"
        class="flex h-32 items-center justify-center overflow-hidden bg-[var(--talos-panel-soft)] p-[var(--talos-space-card)] md:h-40 md:p-[var(--talos-space-page)]"
    >
        <!-- 1. L'anteprima vera. -->
        <img
            v-if="cosa === 'image'"
            :src="thumbnailUrl!"
            :alt="alt"
            loading="lazy"
            decoding="async"
            class="max-h-full max-w-full object-contain"
        >

        <!-- ⛔ 2. In caricamento: un posto che si riempirà, non un glifo che
             verrà sostituito. Il battito lo vede solo chi non ha chiesto meno
             movimento. -->
        <div
            v-else-if="cosa === 'loading'"
            role="status"
            :aria-label="$t('library.thumbnailLoading')"
            class="h-full w-full rounded-[calc(var(--talos-radius-control)/2)] bg-[var(--talos-secondary)] motion-safe:animate-pulse"
        />

        <!-- 3. Un link: la favicon e il titolo della pagina. -->
        <div
            v-else-if="cosa === 'link'"
            aria-hidden="true"
            class="flex h-full w-28 flex-col rounded-[calc(var(--talos-radius-control)/2)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)]"
        >
            <img
                v-if="faviconUrl"
                :src="faviconUrl"
                alt=""
                loading="lazy"
                class="mb-[var(--talos-space-inline)] size-5 rounded-[3px] object-contain"
            >
            <Globe v-else class="mb-[var(--talos-space-inline)] size-5 text-[var(--talos-accent)]" />
            <b class="line-clamp-4 text-3xs font-semibold leading-[1.35] text-[var(--talos-text)]">
                {{ linkTitle }}
            </b>
        </div>

        <!-- ⛔ 4. Il `.mini-document` del mockup, con dentro il TITOLO VERO del
             file invece del suo nome: il nome sta già scritto sotto la scheda,
             e ripeterlo due volte a mezzo centimetro di distanza non aggiunge
             niente. Le barre sono la FORMA del testo, non il testo: a questa
             larghezza le righe vere non si leggerebbero, e un'anteprima
             illeggibile è rumore che sembra contenuto. -->
        <div
            v-else-if="cosa === 'typographic'"
            aria-hidden="true"
            class="flex h-full w-28 flex-col rounded-[calc(var(--talos-radius-control)/2)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)]"
        >
            <span class="mb-[var(--talos-space-inline)] block h-[3px] w-7 shrink-0 bg-[var(--talos-accent)]" />
            <b class="line-clamp-3 text-3xs font-semibold leading-[1.35] text-[var(--talos-text)]">
                {{ tipografica!.title }}
            </b>
            <span
                v-for="(quota, indice) in tipografica!.lines"
                :key="indice"
                class="mt-2 block h-[3px] shrink-0 bg-[var(--talos-border-strong)]"
                :style="{ width: `${Math.round(quota * 100)}%` }"
            />
        </div>

        <!-- 5. Nessuna anteprima possibile: il glifo del formato, come prima. -->
        <span v-else-if="file" class="size-16">
            <TalosMobileLibraryFileGlyph :file="file" variant="grid" />
        </span>
        <Globe v-else class="size-8 text-[var(--talos-muted)]" aria-hidden="true" />
    </div>
</template>

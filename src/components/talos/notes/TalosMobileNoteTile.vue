<script setup lang="ts">
/**
 * Una nota come SCHEDA, nella forma del mockup «Talos Calm».
 *
 * Owner 2026-08-05: «le note sia in lista che in card, delle card come se
 * fossero dei post, quindi col titolo sopra e la descrizione sotto». Il mockup
 * approvato l'11/09/2026 dice come devono essere fatte quelle card, e questa è
 * quella forma portata sul modello dati vero.
 *
 * ## Le due cose che rendono una scheda un FOGLIO e non un riquadro
 *
 * La **linguetta** in alto a sinistra e l'**angolo ripiegato** in basso a
 * destra. Non sono decorazione: la linguetta è larga 30 px e grigia su una nota
 * qualunque, e diventa 46 px e color accento su una in evidenza — cioè è il
 * segnale del pin, visibile anche quando la puntina è fuori dallo sguardo, e
 * visibile anche a chi quell'accento non lo distingue, perché cambia
 * LARGHEZZA oltre che colore.
 *
 * ## Perché NON il quadrato (deciso il 2026-08-06, resta valido)
 *
 * Le schede della Libreria sono quadrate e sembrava coerente copiarle. Provato
 * sul tablet: sbagliato. Il quadrato lega l'altezza alla larghezza, quindi su
 * una griglia stretta la scheda diventa bassa e amputa il testo. Una scheda di
 * file mostra una MINIATURA, che scala; una nota mostra TESTO, che ha bisogno
 * di righe. Quindi altezza minima e non proporzione fissa.
 *
 * ## Chi apre, chi agisce
 *
 * Il corpo APRE la nota (owner 2026-08-04: «ogni scheda apre una pagina
 * dedicata»). Accanto ci sono due sole azioni dirette — la puntina in alto e i
 * tre puntini in basso — mai di più affiancate: il resto vive nel menu.
 */
import { computed } from 'vue'
import { FileText, ListChecks } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import TalosRowActions from '@/components/talos/ui/TalosRowActions.vue'
import TalosMobileNotePin from '@/components/talos/notes/TalosMobileNotePin.vue'
import TalosMobileNoteProse from '@/components/talos/notes/TalosMobileNoteProse.vue'
import TalosMobileNoteChecklist from '@/components/talos/notes/TalosMobileNoteChecklist.vue'
import {
    talosNoteBlocks,
    talosNoteChecklist,
    talosNoteKind,
} from '@/components/talos/notes/noteShape'
import { talosNoteRowActions, type TalosNoteActionId } from '@/components/talos/notes/noteActions'
import { useTalosNoteRowMenu } from '@/components/talos/notes/useTalosNoteRowMenu'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'
import type { TalosLocalNote } from '@/repositories/chatRepository'

const props = defineProps<{
    note: TalosLocalNote
    /** Già formattata: la scheda non sa che ore sono, e non deve saperlo. */
    updatedLabel: string
}>()

const emit = defineEmits<{ open: []; action: [TalosNoteActionId] }>()

const { t } = useTalosI18n()
const menu = useTalosNoteRowMenu()

const checklist = computed(() => talosNoteChecklist(props.note.content))
const kind = computed(() => talosNoteKind(props.note.content))
const kindLabel = computed(() => ({
    checklist: t('notes.kindChecklist'),
    thought: t('notes.kindThought'),
    note: t('notes.kindNote'),
}[kind.value]))
/** Dieci righe bastano a riempire l'anteprima: oltre, il riquadro taglia. */
const blocks = computed(() => talosNoteBlocks(props.note.content, 10))
const done = computed(() => checklist.value.filter((item) => item.done).length)

/**
 * In fondo alla scheda: quanto manca, se è una checklist; quando è stata
 * toccata, altrimenti. Una checklist si guarda per sapere cosa resta da fare, e
 * la data lì non risponderebbe alla domanda per cui la si è aperta.
 */
const metaLabel = computed(() => (
    checklist.value.length > 0
        ? t('notes.checkProgress', { done: done.value, total: checklist.value.length })
        : props.updatedLabel
))

const actions = computed(() => talosNoteRowActions(props.note, {
    open: t('notes.open'),
    edit: t('notes.edit'),
    pinOn: t('notes.pinOn'),
    pinOff: t('notes.pinOff'),
    exportText: t('notes.exportText'),
    remove: t('common.delete'),
    removeNamed: t('notes.deleteNamed', { title: props.note.title }),
}))

function open(): void {
    // Una pressione lunga ha già aperto il menu: il rilascio non deve anche
    // aprire la nota, o un gesto solo farebbe due cose.
    if (menu.consumeLongPress()) return
    emit('open')
}

/**
 * U-14 — l'onda che parte dal dito, sul corpo della scheda.
 *
 * Il mockup elenca `.p-card-main` e `.p-list-main` fra i bersagli
 * (`app.js:2210`), ed è coerente: sono le due superfici che si TOCCANO per
 * aprire. Categoria Feedback — se l'utente la spegne, il cerchio non nasce.
 */
const onda = useTalosTouchWave()
</script>

<template>
    <article
        :data-testid="`talos-note-tile-${props.note.id}`"
        data-talos-note-tile
        :data-pinned="props.note.pinned"
        role="listitem"
        class="talos-calm-marker relative flex min-h-[15.5rem] min-w-0 flex-col rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] pt-[var(--talos-space-inline)] text-left [overflow-wrap:anywhere]"
        @contextmenu="menu.onContextMenu"
        @pointerdown="menu.onPointerDown"
        @pointerup="menu.onPointerEnd"
        @pointercancel="menu.onPointerEnd"
        @pointerleave="menu.onPointerEnd"
    >
        <!-- La linguetta del foglio. Porta l'informazione «in evidenza» in due
             modi insieme — più larga E d'accento — perché il colore da solo non
             è mai l'unico segnale. -->
        <!-- U-14: la durata non è più scritta a mano.
             Era `duration-150`, cioè un numero che nessuna preferenza poteva
             toccare e che `prefers-reduced-motion` non spegneva. Il mockup dice
             130 ms (`--motion-fast`, section-personalities.css:49) e quello
             resta come valore di serie, ma la durata vera ora è quella del
             motore — `control`, la stessa di ogni micro-interazione. -->
        <span
            aria-hidden="true"
            data-testid="talos-note-tile-tab"
            class="talos-calm-marker absolute left-[calc(var(--talos-space-card)*1.5)] top-0 h-[3px]"
            :class="props.note.pinned ? 'w-[46px] bg-[var(--talos-accent)]' : 'w-[30px] bg-[var(--talos-border-strong)]'"
        />

        <div class="flex min-h-touch items-center justify-between gap-[var(--talos-space-inline)] px-[var(--talos-space-control)]">
            <span class="inline-flex min-w-0 items-center gap-[6px] pl-[6px] text-2xs text-[var(--talos-muted)]">
                <component
                    :is="kind === 'checklist' ? ListChecks : FileText"
                    class="size-4 shrink-0"
                    aria-hidden="true"
                />
                <span class="truncate">{{ kindLabel }}</span>
            </span>
            <TalosMobileNotePin
                :pinned="props.note.pinned"
                :label="t('notes.pinNamed', { title: props.note.title })"
                :hint="props.note.pinned ? t('notes.pinOff') : t('notes.pinOn')"
                :test-id="`talos-note-pin-${props.note.id}`"
                @toggle="emit('action', 'pin')"
            />
        </div>

        <button
            type="button"
            data-testid="talos-note-open"
            class="talos-pressable talos-pressable-row talos-wave-host flex min-w-0 flex-1 flex-col items-stretch gap-[var(--talos-space-card)] rounded-[var(--talos-radius-control)] px-[calc(var(--talos-space-card)*1.5)] py-[var(--talos-space-control)] text-left focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            :aria-label="props.note.title"
            @click="open"
            @pointerdown="onda.onPointerDown"
        >
            <!-- Il titolo SOPRA e il testo SOTTO, che è la richiesta testuale.
                 Tre righe: un titolo tagliato a una sola smette di distinguere
                 due note che cominciano uguale. -->
            <h2 class="line-clamp-3 text-lg font-semibold leading-[1.4] tracking-[-0.02em] text-[var(--talos-text)]">
                {{ props.note.title }}
            </h2>
            <!-- Il riquadro dell'anteprima ha un'altezza sua: è quello che fa
                 allineare le schede della stessa riga invece di farle crescere
                 ognuna quanto il proprio testo. -->
            <div class="min-h-[4rem] max-h-[11.5rem] overflow-hidden">
                <TalosMobileNoteChecklist
                    v-if="checklist.length > 0"
                    :items="checklist"
                    :state-label="t('notes.checkState', { done, total: checklist.length })"
                    :more-label="checklist.length > 4 ? t('notes.checkMore', { count: checklist.length - 4 }) : undefined"
                />
                <TalosMobileNoteProse v-else :blocks="blocks" />
            </div>
        </button>

        <div class="flex min-h-touch items-center justify-between gap-[var(--talos-space-inline)] pl-[calc(var(--talos-space-card)*1.5)] pr-[var(--talos-space-page)] text-2xs text-[var(--talos-muted)]">
            <span class="min-w-0 truncate">{{ metaLabel }}</span>
            <!-- `:ref` con l'oggetto Ref, non la stringa: il menu si apre da questo
                 contenitore, e legare per nome vorrebbe dire esporre una
                 variabile che nel template non compare mai. -->
            <span :ref="menu.menuHost">
                <TalosRowActions
                    :label="t('notes.actionsFor', { title: props.note.title })"
                    :items="actions"
                    :test-id="`talos-note-actions-${props.note.id}`"
                    @select="(id) => emit('action', id as TalosNoteActionId)"
                />
            </span>
        </div>

        <!-- L'angolo ripiegato: il fondo della PAGINA sotto il taglio, e il
             triangolo del risvolto sopra. Vive fuori di un pixel per stare
             esattamente sul bordo, quindi la scheda non può ritagliare. -->
        <span
            aria-hidden="true"
            data-testid="talos-note-tile-fold"
            class="pointer-events-none absolute -bottom-px -right-px size-[22px] bg-[var(--talos-background)] [clip-path:polygon(100%_0,100%_100%,0_100%)]"
        >
            <span
                aria-hidden="true"
                class="absolute inset-0 bg-[var(--talos-border-strong)] [clip-path:polygon(100%_0,0_100%,0_0)]"
            />
        </span>
    </article>
</template>

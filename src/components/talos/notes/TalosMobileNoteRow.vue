<script setup lang="ts">
/**
 * Una nota come RIGA, la densità per chi sta cercando invece di leggere.
 *
 * ## Perché è un componente e non un `v-if` nella schermata
 *
 * È la stessa scelta già fatta per la scheda: riga e scheda mostrano le stesse
 * cose con priorità diverse, e un solo modello fatto di `v-if` sarebbe più
 * difficile da leggere di due, non più facile. Quello che le due condividono
 * davvero — come si riconosce il tipo, che anteprima ne esce, quali azioni ha
 * la nota — sta fuori da entrambe, in `noteShape.ts` e `noteActions.ts`.
 *
 * ## La puntina qui è un SEGNO, non un bottone
 *
 * Nel mockup la riga porta l'icona della puntina accanto al titolo e basta: chi
 * scorre un elenco lungo sta cercando una nota, non riorganizzando le sue
 * preferite, e un bersaglio da 48 px su ogni riga toglierebbe spazio proprio al
 * testo che serve a riconoscerla. Mettere in evidenza da qui si fa dal menu,
 * che c'è.
 *
 * ## L'anteprima tiene i segni del testo
 *
 * `> `, `- [x] `, `## ` restano visibili: in una riga sola sono ciò che
 * distingue a colpo d'occhio una citazione da un elenco da un appunto, e
 * toglierli renderebbe tre note diverse tre paragrafi uguali.
 */
import { computed } from 'vue'
import { FileText, ListChecks, Pin } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import TalosRowActions from '@/components/talos/ui/TalosRowActions.vue'
import { talosNoteKind, talosNotePlainPreview } from '@/components/talos/notes/noteShape'
import { talosNoteRowActions, type TalosNoteActionId } from '@/components/talos/notes/noteActions'
import { useTalosNoteRowMenu } from '@/components/talos/notes/useTalosNoteRowMenu'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'
import type { TalosLocalNote } from '@/repositories/chatRepository'

const props = defineProps<{
    note: TalosLocalNote
    /** Già formattata: la riga non sa che ore sono, e non deve saperlo. */
    updatedLabel: string
}>()

const emit = defineEmits<{ open: []; action: [TalosNoteActionId] }>()

const { t } = useTalosI18n()
const menu = useTalosNoteRowMenu()

const kind = computed(() => talosNoteKind(props.note.content))
const preview = computed(() => talosNotePlainPreview(props.note.content))

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
    if (menu.consumeLongPress()) return
    emit('open')
}

/**
 * U-14 — la pressione di una RIGA è più leggera di quella di un bottone, e
 * l'onda parte dal dito.
 *
 * Misurato sul mockup (`Motion.pulse`, `app.js:2205`): `.row-main`,
 * `.p-card-main` e `.p-list-main` rientrano a **0,992**, tutto il resto a
 * **0,965**. Non è un dettaglio: una riga larga quanto lo schermo che rientra
 * come un bottone piccolo si legge come un errore di disegno.
 */
const onda = useTalosTouchWave()
</script>

<template>
    <article
        data-testid="talos-note-row"
        :data-pinned="props.note.pinned"
        class="flex min-w-0 items-center gap-[var(--talos-space-card)] rounded-[var(--talos-radius-card)] border-b border-[var(--talos-border)] px-[var(--talos-space-card)] py-[var(--talos-space-inline)]"
        @contextmenu="menu.onContextMenu"
        @pointerdown="menu.onPointerDown"
        @pointerup="menu.onPointerEnd"
        @pointercancel="menu.onPointerEnd"
        @pointerleave="menu.onPointerEnd"
    >
        <!-- Il filo d'accento sul fianco del simbolo: è la costola del foglio,
             il residuo minimo della linguetta che sulla scheda è grande. -->
        <span
            aria-hidden="true"
            class="grid size-12 shrink-0 place-items-center rounded-[var(--talos-radius-control)] border-l-2 border-[var(--talos-accent-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)]"
        >
            <component :is="kind === 'checklist' ? ListChecks : FileText" class="size-5" aria-hidden="true" />
        </span>

        <!-- La riga APRE la nota. Owner 2026-08-04: «ogni scheda apre una
             pagina dedicata». Prima non si apriva affatto: aveva solo il
             cestino, e il contenuto intero riversato dentro. -->
        <button
            type="button"
            data-testid="talos-note-open"
            class="talos-pressable talos-pressable-row talos-wave-host flex min-h-touch min-w-0 flex-1 flex-col gap-[5px] rounded-[var(--talos-radius-control)] py-[var(--talos-space-control)] text-left focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            @click="open"
            @pointerdown="onda.onPointerDown"
        >
            <span class="text-md font-semibold leading-[1.5] text-[var(--talos-text)] [overflow-wrap:anywhere]">
                {{ props.note.title }}
                <!-- Il segno dell'evidenza porta il suo nome accessibile: chi
                     non vede l'icona deve sapere lo stesso che la nota è in
                     cima per volontà, non per data. -->
                <Pin
                    v-if="props.note.pinned"
                    data-testid="talos-note-row-pinned"
                    class="ml-[var(--talos-space-inline)] inline size-4 align-middle text-[var(--talos-accent)]"
                    role="img"
                    :aria-label="t('notes.filterPinned')"
                />
            </span>
            <!-- Due righe, non tutta la nota: la riga ANTICIPA, la pagina
                 CONTIENE. Prima una nota lunga occupava lo schermo intero e
                 scorrere l'elenco era impossibile. -->
            <span class="line-clamp-2 text-xs leading-[1.55] text-[var(--talos-muted)] [overflow-wrap:anywhere]">
                {{ preview }}
            </span>
            <span class="text-2xs text-[var(--talos-muted)]">{{ props.updatedLabel }}</span>
        </button>

        <span :ref="menu.menuHost" class="flex shrink-0 items-center">
            <TalosRowActions
                :label="t('notes.actionsFor', { title: props.note.title })"
                :items="actions"
                :test-id="`talos-note-actions-${props.note.id}`"
                @select="(id) => emit('action', id as TalosNoteActionId)"
            />
        </span>
    </article>
</template>

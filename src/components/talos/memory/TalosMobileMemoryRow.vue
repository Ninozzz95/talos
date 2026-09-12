<script setup lang="ts">
/**
 * Una memoria come RIGA, la densità per chi sta cercando invece di leggere.
 *
 * Mockup: `pListRow` per `memories` (`src/app.js:208`) — simbolo del tipo,
 * titolo, anteprima, e sotto una riga sola che dice «Tipo · Globale»; a destra
 * il badge di stato e i tre puntini.
 *
 * ## Perché è un componente e non un `v-if` nella schermata
 *
 * È la stessa scelta già fatta per la scheda: riga e scheda mostrano le stesse
 * cose con priorità diverse, e un solo modello fatto di `v-if` sarebbe più
 * difficile da leggere di due, non più facile. Quello che le due condividono
 * davvero — come si riconosce il tipo, come si legge lo stato, che anteprima ne
 * esce, quali azioni ha la memoria — sta fuori da entrambe, in `memoryShape.ts`
 * e `memoryActions.ts`.
 *
 * ## Il badge di stato resta anche qui
 *
 * Sulla riga delle Note non c'è nessun badge: una nota è o non è in evidenza, e
 * la puntina basta. Una memoria invece può essere **spenta**, e spenta vuol
 * dire che il modello non la legge più: è il fatto più importante della riga, e
 * nasconderlo dietro un'apertura di pagina renderebbe invisibile l'unica cosa
 * che qualcuno potrebbe voler controllare scorrendo. Il mockup fa lo stesso
 * (`pListRow` mostra `pStatus` per `memories`, `tasks` e `researches`).
 */
import { computed } from 'vue'
import { useTalosI18n } from '@/i18n'
import TalosRowActions from '@/components/talos/ui/TalosRowActions.vue'
import TalosMobileMemoryState from '@/components/talos/memory/TalosMobileMemoryState.vue'
import {
    talosMemoryKindIcon,
    talosMemoryKindLabelKey,
    talosMemoryPreview,
    talosMemoryScope,
    talosMemoryStateOf,
} from '@/components/talos/memory/memoryShape'
import { talosMemoryRowActions, type TalosMemoryActionId } from '@/components/talos/memory/memoryActions'
/* Vedi la nota estesa in `TalosMobileMemoryCard.vue`: il tasto destro e la
   pressione lunga vivono in `notes/` e il loro posto è dentro `TalosRowActions`. */
import { useTalosNoteRowMenu } from '@/components/talos/notes/useTalosNoteRowMenu'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'
import type { TalosLocalMemory } from '@/repositories/chatRepository'

const props = defineProps<{
    memory: TalosLocalMemory
    /** Già formattata: la riga non sa che ore sono, e non deve saperlo. */
    updatedLabel: string
}>()

const emit = defineEmits<{ open: []; action: [TalosMemoryActionId] }>()

const { t } = useTalosI18n()
const menu = useTalosNoteRowMenu()

const kindIcon = computed(() => talosMemoryKindIcon(props.memory.kind))
const kindLabel = computed(() => t(talosMemoryKindLabelKey(props.memory.kind)))
const stato = computed(() => talosMemoryStateOf(props.memory))
const preview = computed(() => talosMemoryPreview(props.memory.content))
/** «Globale», «Progetto · id», «Questa chat» — dalla stessa tabella della scheda. */
const scopeLabel = computed(() => {
    const ambito = talosMemoryScope(props.memory)
    return t(ambito.key, ambito.params)
})

const actions = computed(() => talosMemoryRowActions(props.memory, {
    open: t('memory.open'),
    edit: t('memory.edit'),
    activate: t('memory.activate'),
    pause: t('memory.pause'),
    exportText: t('memory.exportText'),
    remove: t('common.delete'),
    removeNamed: t('memory.deleteNamed', { title: props.memory.title }),
}))

function open(): void {
    if (menu.consumeLongPress()) return
    emit('open')
}

/**
 * U-14 — la pressione di una RIGA è più leggera di quella di un bottone.
 *
 * Misurato sul mockup (`Motion.pulse`, `app.js:2205`): `.p-list-main` rientra a
 * **0,992**, un bottone a **0,965**. Una riga larga quanto lo schermo che
 * rientra come un bottone piccolo si legge come un errore di disegno.
 */
const onda = useTalosTouchWave()
</script>

<template>
    <article
        data-testid="talos-memory-row"
        :data-memory-status="props.memory.status"
        :data-memory-state="stato"
        class="flex min-w-0 items-center gap-[var(--talos-space-card)] rounded-[var(--talos-radius-card)] border-b border-[var(--talos-border)] px-[var(--talos-space-card)] py-[var(--talos-space-inline)]"
        @contextmenu="menu.onContextMenu"
        @pointerdown="menu.onPointerDown"
        @pointerup="menu.onPointerEnd"
        @pointercancel="menu.onPointerEnd"
        @pointerleave="menu.onPointerEnd"
    >
        <!-- Il filo d'accento sul fianco del simbolo: lo stesso segno della
             citazione sulla scheda, ridotto alla misura di una riga. -->
        <span
            aria-hidden="true"
            class="grid size-12 shrink-0 place-items-center rounded-[var(--talos-radius-control)] border-l-2 border-[var(--talos-accent-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)]"
        >
            <component :is="kindIcon" class="size-5" aria-hidden="true" />
        </span>

        <!-- La riga APRE la memoria. Owner 2026-08-04: «ogni scheda apre una
             pagina dedicata». Prima la riga aveva due bottoni accanto e il
             blocco di testo era l'unica parte che apriva. -->
        <button
            type="button"
            data-testid="talos-memory-open"
            class="talos-pressable talos-pressable-row talos-wave-host flex min-h-touch min-w-0 flex-1 flex-col gap-[5px] rounded-[var(--talos-radius-control)] py-[var(--talos-space-control)] text-left focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            @click="open"
            @pointerdown="onda.onPointerDown"
        >
            <span class="text-md font-semibold leading-[1.5] text-[var(--talos-text)] [overflow-wrap:anywhere]">
                {{ props.memory.title }}
            </span>
            <!-- Due righe, non tutta la memoria: la riga ANTICIPA, la pagina
                 CONTIENE. -->
            <span class="line-clamp-2 text-xs leading-[1.55] text-[var(--talos-muted)] [overflow-wrap:anywhere]">
                {{ preview }}
            </span>
            <span class="text-2xs text-[var(--talos-muted)]">
                {{ kindLabel }} · {{ scopeLabel }} · {{ props.updatedLabel }}
            </span>
        </button>

        <div class="flex shrink-0 items-center gap-[var(--talos-space-inline)]">
            <TalosMobileMemoryState :state="stato" :test-id="`talos-memory-state-${props.memory.id}`" />
            <span :ref="menu.menuHost" class="flex shrink-0 items-center">
                <TalosRowActions
                    :label="t('memory.actionsFor', { title: props.memory.title })"
                    :items="actions"
                    :test-id="`talos-memory-actions-${props.memory.id}`"
                    @select="(id) => emit('action', id as TalosMemoryActionId)"
                />
            </span>
        </div>
    </article>
</template>

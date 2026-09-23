<script setup lang="ts">
/**
 * Un'attività come RIGA, nella forma del mockup «Talos Calm Finale»
 * (`pListRow`, `app.js:196`).
 *
 * È la stessa attività della scheda, a un'altra densità: casella a sinistra,
 * il corpo che apre, e in coda lo stato coi tre puntini. Non è una vista
 * «ridotta» — è la vista per quando se ne guardano molte, e per questo tiene
 * la cosa che serve a scorrere (titolo, una riga di anteprima, quando riparte)
 * e lascia alla scheda quella che serve a fermarsi (la barra dei punti).
 *
 * ⛔ Le azioni sono le STESSE della scheda, e arrivano già composte da chi ci
 * sta sopra (`taskActions.ts`): se se le costruisse da sé, prima o poi la riga
 * avrebbe una voce che la scheda non ha, e la stessa attività offrirebbe poteri
 * diversi a seconda di come la si sta guardando.
 *
 * ⛔ UNA SOLA RADICE nel template, e il commento sta qui e non lassu':
 * un commento prima dell'`<article>` conta come secondo nodo radice, e in
 * quel caso Vue smette di ereditare gli attributi passati dal chiamante —
 * `data-talos-motion-intent` compreso, cioe' l'entrata scaglionata U-14
 * sparisce in silenzio. `role="listitem"` sull'`<article>` c'e' perche' il
 * contenitore si dichiara `role="list"`: un elenco i cui figli non sono voci,
 * letto ad alta voce, non ha un numero di elementi.
 */
import { computed } from 'vue'
import { CalendarClock, Clock } from '@lucide/vue'
import TalosRowActions, { type TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import TalosMobileTaskCheck from '@/components/talos/tasks/TalosMobileTaskCheck.vue'
import TalosMobileTaskState from '@/components/talos/tasks/TalosMobileTaskState.vue'
import {
    talosTaskIsScheduled,
    talosTaskPreview,
    talosTaskState,
} from '@/components/talos/tasks/taskShape'
import type { TalosLocalTask } from '@/repositories/chatRepository'

const props = defineProps<{
    task: TalosLocalTask
    stateLabel: string
    scheduleLabel: string
    checkLabel: string
    actionsLabel: string
    actions: readonly TalosRowAction[]
    selecting?: boolean
    selected?: boolean
}>()

const emit = defineEmits<{
    (event: 'open'): void
    (event: 'toggle'): void
    (event: 'action', id: string): void
    (event: 'press', value: PointerEvent): void
    (event: 'move', value: PointerEvent): void
    (event: 'release'): void
    (event: 'wave', value: PointerEvent): void
}>()

// In riga l'anteprima sta su UNA riga sola: 190 caratteri è il numero del
// mockup, e oltre quello il testo verrebbe comunque tagliato dal `truncate`
// senza che nessuno sappia quanto ne è rimasto fuori.
const preview = computed(() => talosTaskPreview(props.task.description, 190))
const stato = computed(() => talosTaskState(props.task))
const pianificata = computed(() => talosTaskIsScheduled(props.task))

function press(event: PointerEvent): void {
    emit('press', event)
    emit('wave', event)
}
</script>

<template>
    <article
        role="listitem"
        data-testid="talos-task-row"
        :data-task-status="props.task.status"
        :data-task-priority="props.task.priority"
        :data-task-state="stato"
        :data-task-paused="props.task.paused ? 'true' : 'false'"
        :data-selected="props.selected ? 'true' : 'false'"
        class="mb-[var(--talos-space-inline)] flex min-h-20 items-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-card)] border bg-[var(--talos-panel)] px-[var(--talos-space-inline)]"
        :class="props.selected ? 'border-[var(--talos-accent)]' : 'border-[var(--talos-border)]'"
    >
        <span
            v-if="props.selecting"
            aria-hidden="true"
            class="grid min-h-touch min-w-touch shrink-0 place-items-center"
        >
            <span
                class="talos-calm-marker grid size-5 place-items-center rounded-full border-2"
                :class="props.selected
                    ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)]'
                    : 'border-[var(--talos-border-strong)]'"
            />
        </span>
        <TalosMobileTaskCheck
            v-else
            size="sm"
            :done="props.task.status === 'done'"
            :label="props.checkLabel"
            @toggle="emit('toggle')"
        />

        <button
            type="button"
            data-testid="talos-task-open"
            class="talos-pressable talos-pressable-row talos-wave-host talos-holdable flex min-w-0 flex-1 flex-col items-start gap-[2px] rounded-[var(--talos-radius-control)] py-[var(--talos-space-inline)] text-left"
            @pointerdown="press"
            @pointermove="emit('move', $event)"
            @pointerup="emit('release')"
            @pointercancel="emit('release')"
            @click="emit('open')"
        >
            <span
                class="w-full truncate text-sm font-medium"
                :class="props.task.status === 'done'
                    ? 'text-[var(--talos-muted)] line-through decoration-[var(--talos-border-strong)] decoration-1'
                    : 'text-[var(--talos-text)]'"
            >{{ props.task.title }}</span>
            <span v-if="preview" class="w-full truncate text-xsm leading-[1.6] text-[var(--talos-muted)]">
                {{ preview }}
            </span>
            <!-- Quando riparte sta QUI e non in coda: in riga la coda è già
                 occupata dallo stato e dal menu, e una terza cosa lì la
                 spingerebbe sotto il bordo sul telefono. -->
            <span data-testid="talos-task-schedule" class="inline-flex items-center gap-[var(--talos-space-inline)] text-2xs text-[var(--talos-muted)]">
                <component :is="pianificata ? Clock : CalendarClock" class="size-3 shrink-0" aria-hidden="true" />
                <span>{{ props.scheduleLabel }}</span>
            </span>
        </button>

        <div class="flex shrink-0 items-center gap-[var(--talos-space-inline)]">
            <TalosMobileTaskState :state="stato" :label="props.stateLabel" />
            <TalosRowActions
                v-if="!props.selecting"
                :items="props.actions"
                :label="props.actionsLabel"
                test-id="talos-tasks-row-actions"
                @select="(id) => emit('action', id)"
            />
        </div>
    </article>
</template>

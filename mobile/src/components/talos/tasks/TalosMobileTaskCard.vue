<script setup lang="ts">
/**
 * Un'attività come SCHEDA, nella forma del mockup «Talos Calm Finale»
 * (`pTaskCard`, `app.js:187`).
 *
 * La scheda si legge in quattro pezzi, dall'alto:
 *
 *   1. **cosa posso farci adesso** — la casella che completa, e i tre puntini;
 *   2. **a che punto è** — la pastiglia di stato, accanto alla casella;
 *   3. **di cosa si tratta** — titolo e anteprima, che APRONO la pagina;
 *   4. **quando riparte, e quanto conta** — la riga in basso, staccata da un
 *      filo perché è di un altro genere: non descrive l'attività, la colloca.
 *
 * ## Le regole dell'owner che il mockup non cambia
 *
 * - La scheda APRE l'attività (2026-08-04: «ogni scheda apre una pagina
 *   dedicata, il pulsante indietro va alla precedente, dev'essere lineare»).
 * - L'anteprima anticipa, non contiene: mai la descrizione intera in elenco.
 * - Mai più di due azioni affiancate (owner 10/09/2026): qui sono la casella e
 *   i tre puntini; tutto il resto vive nel menu.
 * - La priorità `normal` NON si mostra — è il valore che hanno quasi tutte, e
 *   una pastiglia su ogni scheda sarebbe rumore che insegna a non guardare le
 *   pastiglie. È anche il mockup, che disegna solo «Priorità alta».
 *
 * ## ⛔ Il bottone dentro il bottone
 *
 * Il corpo che apre è un `<button>`, e accanto ci sono altri bottoni: per
 * questo la scheda NON è tutta cliccabile. Un bottone dentro un bottone non è
 * HTML valido e il tocco finirebbe a quello sbagliato — lo stesso motivo per
 * cui la riga dell'elenco era già fatta così.
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
    talosTaskChecklist,
    talosTaskIsScheduled,
    talosTaskPreview,
    talosTaskState,
} from '@/components/talos/tasks/taskShape'
import type { TalosLocalTask } from '@/repositories/chatRepository'

const props = defineProps<{
    task: TalosLocalTask
    /** «Pianificata», «In pausa»… già tradotta da chi ha l'i18n. */
    stateLabel: string
    /** «Senza pianificazione», «Lun · 09:00»… già composta. */
    scheduleLabel: string
    /** «N di M punti spuntati», già composta. Serve solo se ci sono punti. */
    progressLabel: string
    /** «Priorità alta», già composta. */
    priorityLabel: string
    /** «Completa: {titolo}» e «Azioni per {titolo}». */
    checkLabel: string
    actionsLabel: string
    actions: readonly TalosRowAction[]
    /** Vero quando la selezione multipla è accesa, e quando questa è scelta. */
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

const checklist = computed(() => talosTaskChecklist(props.task.description))
const fatti = computed(() => checklist.value.filter((punto) => punto.done).length)
const preview = computed(() => talosTaskPreview(props.task.description))
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
        class="flex min-h-[13rem] flex-col overflow-hidden rounded-[var(--talos-radius-card)] border bg-[var(--talos-panel)]"
        :class="props.selected ? 'border-[var(--talos-accent)]' : 'border-[var(--talos-border)]'"
    >
        <div class="flex items-center gap-[var(--talos-space-inline)] p-[var(--talos-space-inline)] pb-0">
            <!-- In selezione la casella dice a cosa serve il tocco ADESSO:
                 scegliere, non completare. Due significati sullo stesso
                 quadrato sarebbero due modi di sbagliare. -->
            <span
                v-if="props.selecting"
                aria-hidden="true"
                class="grid min-h-touch min-w-touch shrink-0 place-items-center"
            >
                <span
                    class="talos-calm-marker grid size-[22px] place-items-center rounded-full border-2"
                    :class="props.selected
                        ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)]'
                        : 'border-[var(--talos-border-strong)]'"
                />
            </span>
            <TalosMobileTaskCheck
                v-else
                :done="props.task.status === 'done'"
                :label="props.checkLabel"
                @toggle="emit('toggle')"
            />

            <TalosMobileTaskState :state="stato" :label="props.stateLabel" />

            <TalosRowActions
                v-if="!props.selecting"
                class="ml-auto"
                :items="props.actions"
                :label="props.actionsLabel"
                test-id="talos-tasks-row-actions"
                @select="(id) => emit('action', id)"
            />
        </div>

        <button
            type="button"
            data-testid="talos-task-open"
            class="talos-pressable talos-pressable-row talos-wave-host talos-holdable flex min-w-0 flex-1 flex-col items-start gap-[var(--talos-space-inline)] px-[calc(var(--talos-space-card)*1.5)] pb-[var(--talos-space-card)] pt-[var(--talos-space-inline)] text-left"
            @pointerdown="press"
            @pointermove="emit('move', $event)"
            @pointerup="emit('release')"
            @pointercancel="emit('release')"
            @click="emit('open')"
        >
            <h2
                class="text-xl font-medium leading-[1.35] tracking-[-0.02em] [overflow-wrap:anywhere]"
                :class="props.task.status === 'done'
                    ? 'text-[var(--talos-muted)] line-through decoration-[var(--talos-border-strong)] decoration-1'
                    : 'text-[var(--talos-text)]'"
            >{{ props.task.title }}</h2>
            <!-- L'anteprima NON ripete i punti spuntabili: hanno già la loro
                 barra qui sotto, e ripeterli lascerebbe fuori la frase che dice
                 di cosa si tratta. È il mockup, alla lettera. -->
            <p v-if="preview" class="line-clamp-3 text-sm leading-[1.6] text-[var(--talos-muted)]">
                {{ preview }}
            </p>
        </button>

        <!-- Quanti punti sono fatti: un numero e una barra, perché il numero si
             legge e la barra si vede da lontano. La barra è `progressbar` vero,
             coi suoi tre valori — una barra che non dichiara quanto vale è una
             decorazione per chi ascolta la pagina. -->
        <div
            v-if="checklist.length > 0"
            data-testid="talos-task-progress"
            class="px-[calc(var(--talos-space-card)*1.5)] py-[var(--talos-space-inline)] text-2xs text-[var(--talos-muted)]"
        >
            <span>{{ props.progressLabel }}</span>
            <div
                role="progressbar"
                :aria-label="props.progressLabel"
                aria-valuemin="0"
                :aria-valuemax="checklist.length"
                :aria-valuenow="fatti"
                class="mt-[var(--talos-space-inline)] h-[3px] overflow-hidden rounded-[3px] bg-[var(--talos-border)]"
            >
                <span
                    class="talos-task-progress-fill block h-full rounded-[3px] bg-[var(--talos-accent)]"
                    :style="{ width: `${(100 * fatti) / checklist.length}%` }"
                />
            </div>
        </div>

        <!-- Il piede colloca l'attività: quando riparte, e quanto conta. Sopra
             un filo, perché è di un altro genere rispetto al testo. -->
        <div class="mt-auto flex min-h-14 flex-wrap items-center justify-between gap-[var(--talos-space-inline)] border-t border-[var(--talos-border)] px-[calc(var(--talos-space-card)*1.5)] py-[var(--talos-space-inline)] text-2xs text-[var(--talos-muted)]">
            <span data-testid="talos-task-schedule" class="inline-flex items-center gap-[var(--talos-space-inline)]">
                <component :is="pianificata ? Clock : CalendarClock" class="size-3 shrink-0" aria-hidden="true" />
                <span>{{ props.scheduleLabel }}</span>
            </span>
            <span
                v-if="props.task.priority === 'high'"
                data-testid="talos-task-priority"
                class="whitespace-nowrap rounded-[var(--talos-radius-control)] bg-[var(--talos-warning-soft,var(--talos-active))] px-[6px] py-[3px] text-3xs text-[var(--talos-warning,var(--talos-text))]"
            >{{ props.priorityLabel }}</span>
        </div>
    </article>
</template>

<style scoped>
/*
 * U-14 / N11 — LA BARRA DEI PUNTI SI RIEMPIE, non salta.
 *
 * Mockup: `.p-progress-track>span { transition: width var(--motion-time) }`
 * (`section-personalities.css:99`), cioè 220 ms. È l'unico movimento della
 * scheda che risponde a un tocco fatto DA UN'ALTRA PARTE — si spunta un punto
 * nella pagina, si torna, e la barra deve raccontare che è cresciuta.
 *
 * ⛔ La durata la dice il motore, non questo file: `--talos-motion-calm-veil` è
 * la voce U-14 che vale 220 ms alle preferenze di serie, cioè esattamente il
 * numero del mockup, e segue le quattro porte e il cursore «Durata
 * transizioni» come tutto il resto. Un `220ms` scritto qui sarebbe un numero
 * che nessuna preferenza può toccare — il difetto già trovato una volta
 * sull'onda del tocco (SHELL-CSS-02).
 *
 * ⛔ Sta in un blocco `scoped` e non nel foglio globale perché è il disegno di
 * questo componente, e il blocco U-14 di `style.css` non è territorio di questo
 * lavoro.
 */
.talos-task-progress-fill {
    transition: width
        var(--talos-motion-calm-veil, 220ms)
        var(--talos-motion-ease, var(--talos-motion-calm-ease, cubic-bezier(0.22, 0.8, 0.24, 1)));
}

/* Al verso contrario: la larghezza finale è la stessa, ci si arriva e basta. */
@media (prefers-reduced-motion: reduce) {
    .talos-task-progress-fill {
        transition: none;
    }
}
</style>

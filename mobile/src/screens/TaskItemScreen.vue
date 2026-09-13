<script setup lang="ts">
/**
 * Un'attività, per intero, con il suo indirizzo — nella forma del mockup
 * «Talos Calm Finale» (`personalityDetail`, `app.js:236`).
 *
 * Owner 2026-08-04: «ogni scheda apre una pagina dedicata, il pulsante indietro
 * va alla precedente, dev'essere lineare». La pagina non è solo coerenza: la
 * scheda ANTICIPA e la pagina CONTIENE, che è il lavoro che ognuna delle due sa
 * fare bene.
 *
 * ## Cosa c'era, e perché non bastava
 *
 * Un titolo, una pastiglia con dentro `todo · normal` — i valori grezzi del
 * database, in inglese, scritti addosso a chi legge — la descrizione, e un
 * «Elimina». Non si poteva correggere, non si poteva esportare, non si vedeva
 * la pianificazione benché fosse il motivo per cui l'attività esiste, e i punti
 * spuntabili erano testo morto.
 *
 * ## Le quattro cose che questa pagina fa, e nessun'altra può fare
 *
 * 1. **spuntare i punti** — decisione dell'owner, 12/09/2026: nelle note le
 *    caselle sono un segno, qui sono azioni. Spuntare l'ultimo completa
 *    l'attività; togliere una spunta a una completata la riapre;
 * 2. **cambiare stato e priorità** — con due controlli nativi, non con una fila
 *    di bottoni: sono scelte fra alternative, e un `select` è la forma che le
 *    dice. «In corso» si imposta da qui (owner) e dal menu della riga;
 * 3. **fermare e riprendere la ricorrenza** — U-17, senza cancellarla;
 * 4. **portarla fuori** — «Esporta testo», la stessa porta delle note.
 *
 * ## ⛔ Cosa del mockup NON si porta
 *
 * «Simula esecuzione». Nel mockup è un bottone che finge: non esegue niente e
 * lo dichiara nella frase accanto. Qui un bottone con quel nome o non farebbe
 * nulla — ed è la cosa peggiore che un bottone possa fare — o farebbe partire
 * un'esecuzione vera, che è una funzione diversa e non è questa.
 *
 * ## Perché la conferma dell'eliminazione è in LINEA
 *
 * Perché l'attività è tutta sullo schermo mentre si decide. Dall'ELENCO, dove
 * si vedono due righe, la conferma è invece una finestra vera — stessa regola
 * delle note, stessi due posti.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
    CalendarClock, CheckSquare, Clock, Download, SquarePen, Trash2,
} from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { useChatController } from '@/stores/chatController'
import { Button } from '@/components/ui/button'
import { TALOS_DANGER_ACTION_CLASS } from '@/lib/dangerAction'
import { talosNotify } from '@/stores/notificationCentre'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'
import TalosMobileTaskCheck from '@/components/talos/tasks/TalosMobileTaskCheck.vue'
import TalosMobileTaskChecklist from '@/components/talos/tasks/TalosMobileTaskChecklist.vue'
import TalosMobileTaskState from '@/components/talos/tasks/TalosMobileTaskState.vue'
import { exportTalosTaskText } from '@/components/talos/tasks/taskExport'
import {
    talosTaskChecklist,
    talosTaskIsScheduled,
    talosTaskScheduleSummary,
    talosTaskState,
    talosTaskToggleCheck,
} from '@/components/talos/tasks/taskShape'
import { talosParseSchedule } from '@/lib/tasks/schedule'
import type { TalosLocalTask, TalosTaskPriority, TalosTaskStatus } from '@/repositories/chatRepository'

const route = useRoute()
const router = useRouter()
const { t, locale } = useTalosI18n()
const controller = useChatController()

const item = ref<TalosLocalTask | null>(null)
const loading = ref(true)
const salvando = ref(false)
const confirming = ref(false)
const error = ref<string | null>(null)

const id = computed(() => String(route.params.id ?? ''))

const checklist = computed(() => talosTaskChecklist(item.value?.description))
const fatti = computed(() => checklist.value.filter((punto) => punto.done).length)
const pianificata = computed(() => (item.value ? talosTaskIsScheduled(item.value) : false))
const schedule = computed(() => (item.value ? talosParseSchedule(item.value.schedule_json) : null))

const ricorrenza = computed(() => (item.value
    ? talosTaskScheduleSummary(item.value, {
        none: t('tasks.scheduleNone'),
        paused: t('tasks.state.paused'),
        everyMinutes: (minutes: number) => t('tasks.scheduleEvery', { minutes }),
        daily: t('tasks.scheduleDaily'),
        weekly: t('tasks.scheduleWeekly'),
    }, locale.value)
    : ''))

const stato = computed(() => (item.value ? talosTaskState(item.value) : 'todo'))

function describeError(cause: unknown): string {
    return cause instanceof Error && cause.message ? cause.message : String(cause)
}

/**
 * ⛔ Si rilegge dal deposito, non si modifica la copia in mano.
 *
 * È la sola riga che sa com'è andata davvero: `updated_at` si muove, e una
 * scrittura che fallisce a metà lascerebbe lo schermo a raccontare un
 * cambiamento che non c'è stato.
 */
async function load(): Promise<void> {
    try {
        const tutte = await controller.tasks.list()
        item.value = tutte.find((entry) => entry.id === id.value) ?? null
    } catch (cause) {
        error.value = describeError(cause)
    }
}

onMounted(async () => {
    // `finally`: anche una lista che FALLISCE è una risposta. Lasciando
    // `loading` a vero dopo un errore la pagina resterebbe su «Carico…» per
    // sempre, con l'errore che nessuno vedrebbe mai.
    try {
        await load()
    } finally {
        loading.value = false
    }
})

/** La casella in testa: completa in un tocco, e riapre con lo stesso tocco. */
async function alternaCompletata(): Promise<void> {
    const corrente = item.value
    if (!corrente) return
    await cambiaStato(corrente.status === 'done' ? 'todo' : 'done')
}

async function cambiaStato(status: TalosTaskStatus): Promise<void> {
    const corrente = item.value
    if (!corrente || corrente.status === status) return
    error.value = null
    try {
        item.value = await controller.tasks.setStatus(corrente.id, status)
    } catch (cause) {
        error.value = describeError(cause)
    }
}

async function cambiaPriorita(priority: TalosTaskPriority): Promise<void> {
    const corrente = item.value
    if (!corrente || corrente.priority === priority) return
    error.value = null
    try {
        item.value = await controller.tasks.update(corrente.id, { priority })
    } catch (cause) {
        error.value = describeError(cause)
    }
}

/**
 * U-17 — ferma la ricorrenza, senza cancellarla.
 *
 * ⛔ NON tocca `schedule_json`: istruzione, giorni e ora restano scritti. È la
 * differenza fra «fermala fino a lunedì» e «non deve più ripetersi», e finché
 * ce n'era una sola la prima costava la seconda.
 */
async function alternaPausa(): Promise<void> {
    const corrente = item.value
    if (!corrente) return
    error.value = null
    try {
        item.value = await controller.tasks.update(corrente.id, { paused: !corrente.paused })
    } catch (cause) {
        error.value = describeError(cause)
    }
}

/**
 * Un punto spuntato, e cosa ne consegue.
 *
 * ⛔ La riga si riscrive dentro `talosTaskToggleCheck`, che tocca solo i
 * quattro caratteri del riquadro: rimontare la riga da capo normalizzerebbe il
 * rientro di chi l'ha scritta, e una spunta non è il momento per riformattare
 * il testo di qualcun altro. `null` vuol dire «quella riga non è una casella» —
 * succede se la descrizione è cambiata sotto — e allora non si scrive niente.
 *
 * ⛔ Lo STATO segue i punti, come nel mockup (`app.js:346`): spuntato l'ultimo
 * l'attività è completata, e togliendo una spunta a una completata torna da
 * fare. È la sola cosa che rende le caselle un'azione invece che un segno — se
 * spuntare tutto lasciasse l'attività aperta, chi ha finito dovrebbe dirlo due
 * volte.
 */
async function alternaPunto(index: number): Promise<void> {
    const corrente = item.value
    if (!corrente || salvando.value) return
    const descrizione = talosTaskToggleCheck(corrente.description, index)
    if (descrizione === null) return
    salvando.value = true
    error.value = null
    try {
        const aggiornata = await controller.tasks.update(corrente.id, { description: descrizione })
        item.value = aggiornata
        const punti = talosTaskChecklist(descrizione)
        if (punti.length > 0 && punti.every((punto) => punto.done)) {
            if (aggiornata.status !== 'done') await cambiaStato('done')
        } else if (aggiornata.status === 'done') {
            await cambiaStato('todo')
        }
    } catch (cause) {
        error.value = describeError(cause)
    } finally {
        salvando.value = false
    }
}

async function esporta(): Promise<void> {
    const corrente = item.value
    if (!corrente) return
    try {
        const esito = await exportTalosTaskText(corrente, t('tasks.exportText'))
        // Il foglio di Android l'ha già visto: ridirglielo sarebbe rumore. Il
        // ripiego invece va detto, perché è successo qualcosa di diverso da
        // quello che il pulsante prometteva.
        if (esito !== 'copied') return
        talosNotify({
            key: `task:exported:${corrente.id}`,
            channel: 'jobs',
            weight: 'notable',
            title: t('tasks.exportCopied'),
            body: corrente.title,
            at: Date.now(),
        })
    } catch {
        error.value = t('tasks.exportFailed')
    }
}

/**
 * Dopo aver cancellato si torna all'elenco, non si resta su una pagina vuota.
 *
 * `replace` e non `push`: l'attività non c'è più, e lasciarla nella cronologia
 * vuol dire che Indietro riporta a una pagina che non può esistere.
 */
async function elimina(): Promise<void> {
    const corrente = item.value
    if (!corrente) return
    try {
        await controller.tasks.remove(corrente.id)
        await router.replace({ name: 'tasks' })
    } catch (cause) {
        error.value = describeError(cause)
    }
}

function modifica(): void {
    void router.push({ name: 'task-edit', params: { id: id.value } })
}

/**
 * U-14 — l'onda che parte dal dito, sulle azioni di questa pagina.
 *
 * Nel mockup la ricevono tutti i bottoni da un punto solo (`Motion.enhance`,
 * `app.js:2228`); qui si mette a mano, perché l'app non ha ancora una
 * direttiva globale — debito già scritto nell'inventario del movimento.
 */
const onda = useTalosTouchWave()
</script>

<template>
    <div
        data-testid="talos-task-item"
        class="mx-auto flex w-full max-w-[46rem] flex-col px-[var(--talos-space-page)] pb-[max(var(--talos-space-page),env(safe-area-inset-bottom))] pt-[var(--talos-space-section)]"
    >
        <p v-if="loading" data-testid="talos-task-item-loading" class="py-6 text-center text-sm text-[var(--talos-muted)]">
            {{ t('common.loading') }}
        </p>

        <!-- L'attività può essere stata cancellata da un'altra parte, o
             l'indirizzo copiato a mano. Si dice, invece di mostrare una pagina
             vuota che sembra un guasto. -->
        <p
            v-else-if="!item"
            data-testid="talos-task-item-missing"
            class="py-6 text-center text-sm text-[var(--talos-muted)]"
        >
            {{ t('tasks.itemMissing') }}
        </p>

        <template v-else>
            <!-- Dove sono, e quando riparte. Il nome della stazione è un bottone
                 vero: è la via di ritorno che si vede, oltre a Indietro. -->
            <div class="mb-[var(--talos-space-section)] flex min-h-touch flex-wrap items-center gap-[var(--talos-space-inline)] text-xs text-[var(--talos-muted)]">
                <CheckSquare class="size-4 shrink-0" aria-hidden="true" />
                <button
                    type="button"
                    data-testid="talos-task-item-back"
                    class="talos-pressable talos-wave-host min-h-touch max-w-[80%] rounded-[var(--talos-radius-control)] text-left leading-[1.5] text-[var(--talos-text)]"
                    @click="router.push({ name: 'tasks' })"
                    @pointerdown="onda.onPointerDown"
                >
                    {{ t('navigation.tasks') }}
                </button>
                <span class="ml-auto text-2xs">{{ ricorrenza }}</span>
            </div>

            <article
                class="overflow-hidden rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-card,var(--talos-panel))]"
                :data-task-state="stato"
            >
                <header class="flex flex-wrap items-start gap-[var(--talos-space-card)] p-[calc(var(--talos-space-page)*1.5)]">
                    <TalosMobileTaskCheck
                        :done="item.status === 'done'"
                        :label="t('tasks.completeNamed', { title: item.title })"
                        test-id="talos-task-item-check"
                        @toggle="alternaCompletata"
                    />
                    <div class="min-w-0 flex-1">
                        <TalosMobileTaskState :state="stato" :label="t(`tasks.state.${stato}`)" test-id="talos-task-item-state" />
                        <h1
                            class="mt-[var(--talos-space-control)] text-2xl font-medium leading-[1.35] tracking-[-0.025em] [overflow-wrap:anywhere]"
                            :class="item.status === 'done'
                                ? 'text-[var(--talos-muted)] line-through decoration-[var(--talos-border-strong)] decoration-1'
                                : 'text-[var(--talos-text)]'"
                        >{{ item.title }}</h1>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        data-testid="talos-task-item-edit"
                        class="talos-pressable talos-wave-host ml-auto min-h-touch rounded-[var(--talos-radius-control)] text-xs"
                        @click="modifica"
                        @pointerdown="onda.onPointerDown"
                    >
                        <SquarePen class="size-4" aria-hidden="true" />
                        {{ t('tasks.edit') }}
                    </Button>
                </header>

                <!-- Il corpo: le caselle se ce ne sono, altrimenti la
                     descrizione. `whitespace-pre-line` perché gli a capo che una
                     persona ha scritto sono parte di quello che ha scritto. -->
                <div class="px-[calc(var(--talos-space-page)*1.5)] pb-[calc(var(--talos-space-page)*1.5)]">
                    <TalosMobileTaskChecklist
                        v-if="checklist.length > 0"
                        :description="item.description ?? ''"
                        :busy="salvando"
                        :state-label="t('tasks.checkState', { done: fatti, total: checklist.length })"
                        @toggle="alternaPunto"
                    />
                    <p
                        v-else
                        data-testid="talos-task-item-description"
                        class="whitespace-pre-line text-sm leading-[1.8] text-[var(--talos-text)]"
                    >{{ item.description || t('tasks.noDescription') }}</p>
                </div>

                <!-- Le proprietà: due scelte fra alternative e un fatto.
                     ⛔ Due `select` nativi e non sei bottoni: sono scelte fra
                     alternative, e sul telefono aprono la ruota di Android, che
                     è il controllo che la persona conosce già. È anche il
                     mockup, che per la priorità fa esattamente questo. -->
                <div class="grid grid-cols-1 gap-[var(--talos-space-section)] border-t border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-section)] sm:grid-cols-2">
                    <label class="flex flex-col gap-[var(--talos-space-control)]">
                        <span class="text-xs text-[var(--talos-muted)]">{{ t('tasks.propertyStatus') }}</span>
                        <select
                            :value="item.status"
                            data-testid="talos-task-item-status"
                            :aria-label="t('tasks.propertyStatus')"
                            class="min-h-touch rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                            @change="cambiaStato(($event.target as HTMLSelectElement).value as TalosTaskStatus)"
                        >
                            <option value="todo">{{ t('tasks.state.todo') }}</option>
                            <option value="doing">{{ t('tasks.state.doing') }}</option>
                            <option value="done">{{ t('tasks.state.done') }}</option>
                        </select>
                    </label>

                    <label class="flex flex-col gap-[var(--talos-space-control)]">
                        <span class="text-xs text-[var(--talos-muted)]">{{ t('tasks.propertyPriority') }}</span>
                        <select
                            :value="item.priority"
                            data-testid="talos-task-item-priority"
                            :aria-label="t('tasks.propertyPriority')"
                            class="min-h-touch rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                            @change="cambiaPriorita(($event.target as HTMLSelectElement).value as TalosTaskPriority)"
                        >
                            <option value="low">{{ t('tasks.priorityLow') }}</option>
                            <option value="normal">{{ t('tasks.priorityNormal') }}</option>
                            <option value="high">{{ t('tasks.priorityHighShort') }}</option>
                        </select>
                    </label>

                    <div class="flex flex-col gap-[var(--talos-space-control)]">
                        <span class="text-xs text-[var(--talos-muted)]">{{ t('tasks.propertyRecurrence') }}</span>
                        <strong class="flex items-center gap-[var(--talos-space-inline)] text-sm font-medium leading-[1.7] text-[var(--talos-text)]">
                            <component :is="pianificata ? Clock : CalendarClock" class="size-4 shrink-0" aria-hidden="true" />
                            <span data-testid="talos-task-item-recurrence">{{ ricorrenza }}</span>
                        </strong>
                        <small class="text-2xs leading-[1.7] text-[var(--talos-muted)]">
                            {{ pianificata ? t('tasks.recurrenceRuns') : t('tasks.recurrenceSetWithEdit') }}
                        </small>
                    </div>
                </div>

                <!-- L'istruzione: cosa TALOS farà quando parte. Si mostra solo
                     se c'è una ricorrenza, perché senza non verrebbe mai
                     eseguita e leggerla sarebbe una promessa che nessuno
                     mantiene. -->
                <div v-if="pianificata" class="border-t border-[var(--talos-border)] p-[var(--talos-space-section)] text-sm">
                    <span class="mb-[var(--talos-space-control)] block text-xs text-[var(--talos-muted)]">
                        {{ t('tasks.instructionLabel') }}
                    </span>
                    <p data-testid="talos-task-item-instruction" class="leading-[1.8] text-[var(--talos-text)]">
                        {{ item.instruction || t('tasks.instructionNone') }}
                    </p>
                    <small class="mt-[var(--talos-space-card)] block text-xs text-[var(--talos-muted)]">
                        {{ schedule?.onlyIfChanged === false ? t('tasks.notifyAlways') : t('tasks.notifyOnlyIfChanged') }}
                    </small>
                </div>

                <!-- Il piede: una frase che dice a che punto è la ricorrenza, e
                     l'unico bottone che la cambia. ⛔ «Simula esecuzione» del
                     mockup non c'è: era una demo, e un bottone che finge è
                     peggio di un bottone che manca. -->
                <div class="flex flex-wrap items-center justify-between gap-[var(--talos-space-inline)] border-t border-[var(--talos-border)] px-[var(--talos-space-section)] py-[var(--talos-space-control)] text-2xs text-[var(--talos-muted)]">
                    <span data-testid="talos-task-item-foot">
                        {{ item.paused && pianificata
                            ? t('tasks.pausedFoot')
                            : pianificata ? t('tasks.scheduledFoot') : t('tasks.localFoot') }}
                    </span>
                    <Button
                        v-if="pianificata"
                        type="button"
                        variant="outline"
                        data-testid="talos-task-item-pause"
                        class="talos-pressable talos-wave-host min-h-touch rounded-[var(--talos-radius-control)] text-xs"
                        @click="alternaPausa"
                        @pointerdown="onda.onPointerDown"
                    >
                        {{ item.paused ? t('tasks.resume') : t('tasks.pause') }}
                    </Button>
                </div>
            </article>

            <p v-if="error" role="alert" data-testid="talos-task-item-error" class="mt-[var(--talos-space-card)] text-xs text-[var(--talos-danger)]">
                {{ error }}
            </p>

            <!-- Due azioni, mai di più affiancate: quella che porta l'attività
                 fuori e quella che la toglie di mezzo, agli estremi opposti
                 della riga perché non si tocchi l'una per l'altra. -->
            <div v-if="!confirming" class="mt-[var(--talos-space-section)] flex flex-wrap items-center justify-between gap-[var(--talos-space-inline)]">
                <Button
                    type="button"
                    variant="outline"
                    data-testid="talos-task-item-export"
                    class="talos-pressable talos-wave-host min-h-touch rounded-[var(--talos-radius-control)] text-xs"
                    @click="esporta"
                    @pointerdown="onda.onPointerDown"
                >
                    <Download class="size-4" aria-hidden="true" />
                    {{ t('tasks.exportText') }}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    data-testid="talos-task-item-delete"
                    class="talos-pressable talos-wave-host min-h-touch text-xs text-[var(--talos-muted)]"
                    @click="confirming = true"
                    @pointerdown="onda.onPointerDown"
                >
                    <Trash2 class="size-4" aria-hidden="true" />
                    {{ t('common.delete') }}
                </Button>
            </div>
            <!-- Mentre si decide, la riga dice UNA cosa sola: la domanda e le
                 due risposte. Lasciarci anche «Esporta» vorrebbe dire tre
                 bottoni in fila su una domanda che ne ammette due. -->
            <div v-else class="mt-[var(--talos-space-section)] flex flex-wrap items-center justify-between gap-[var(--talos-space-inline)]">
                <p class="min-w-0 text-xs text-[var(--talos-text)]">{{ t('tasks.deleteTitle') }}</p>
                <div class="flex items-center gap-[var(--talos-space-inline)]">
                    <Button type="button" variant="ghost" class="min-h-touch text-xs" @click="confirming = false">
                        {{ t('common.cancel') }}
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        data-testid="talos-task-item-delete-confirm"
                        :class="['min-h-touch text-xs', TALOS_DANGER_ACTION_CLASS]"
                        @click="elimina"
                    >
                        {{ t('common.delete') }}
                    </Button>
                </div>
            </div>
        </template>
    </div>
</template>

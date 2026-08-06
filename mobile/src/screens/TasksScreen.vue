<script setup lang="ts">
/**
 * F5 station — desktop `TalosTasks` parity, local-first: run-linked tasks
 * (title, optional description and run_id) with a todo→doing→done cycle and
 * delete. Fully functional in airplane mode — rows live in the encrypted DB.
 */
import { computed, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Search, CalendarClock, CheckSquare, Plus, Trash2 } from '@lucide/vue'
import { useRouter } from 'vue-router'
import { useChatController } from '@/stores/chatController'
import { talosRelativeTime } from '@/lib/relativeTime'
import type { TalosLocalTask } from '@/repositories/chatRepository'
import { talosNextRunAt, talosParseSchedule } from '@/lib/tasks/schedule'

/**
 * Quando ripartirà, in una riga sola — o `null` se non è pianificata.
 *
 * Senza questo, una pianificazione salvata è INVISIBILE: si accende
 * l'interruttore, si salva, e l'elenco mostra una riga identica a tutte le
 * altre. Chi l'ha scritta non ha modo di sapere se ha funzionato se non
 * aspettando l'ora — cioè scoprendolo nel modo più lento possibile.
 */
function prossimaEsecuzione(task: TalosLocalTask): string | null {
    const schedule = talosParseSchedule(task.schedule_json)
    if (!schedule) return null
    const quando = talosNextRunAt(
        schedule,
        Date.now(),
        task.last_run_at ? Date.parse(task.last_run_at) : null,
    )
    if (quando === null) return null
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' })
        .format(new Date(quando))
}

const controller = useChatController()
const router = useRouter()

/** Voce → pagina → dettaglio, sempre nello stesso verso. */
function open(item: TalosLocalTask): void {
    void router.push({ name: 'task-item', params: { id: item.id } })
}
const { t } = useTalosI18n()

const entries = ref<TalosLocalTask[]>([])

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
    return entries.value.filter((task) => ((task.title ?? '').toLowerCase().includes(termine)))
})
const error = ref<string | null>(null)

/** Il FAB porta alla pagina, che è l'unico posto dove si crea un'attività. */
function startNew(): void {
    void router.push({ name: 'task-new' })
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
        entries.value = await controller.tasks.list()
    } catch (cause) {
        error.value = describeError(cause)
    }
}

onMounted(refresh)


const NEXT_STATUS = { todo: 'doing', doing: 'done', done: 'todo' } as const

async function cycleStatus(task: TalosLocalTask): Promise<void> {
    error.value = null
    try {
        await controller.tasks.setStatus(task.id, NEXT_STATUS[task.status])
        await refresh()
    } catch (cause) {
        error.value = describeError(cause)
    }
}

async function remove(task: TalosLocalTask): Promise<void> {
    error.value = null
    try {
        await controller.tasks.remove(task.id)
        await refresh()
    } catch (cause) {
        error.value = describeError(cause)
    }
}

function shortId(value: string | null): string {
    return value ? value.slice(0, 12) : t('tasks.noRun')
}
</script>

<template>
    <div class="flex min-h-full flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3" data-testid="talos-tasks-screen">
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
                data-testid="talos-tasks-search"
                :placeholder="t('tasks.searchPlaceholder')"
                :aria-label="t('tasks.searchPlaceholder')"
                class="min-h-12 w-full rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] pl-9 pr-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
            >
        </label>

        <p class="text-xs leading-5 text-[var(--talos-muted)]">
            {{ t('tasks.intro') }}
        </p>


        <p v-if="error" role="alert" class="text-xs text-[var(--talos-danger,#dc5b5b)]">{{ error }}</p>

        <p v-if="!entries.length" class="py-6 text-center text-sm text-[var(--talos-muted)]">
            {{ t('tasks.empty') }}
        </p>
<ul v-else class="flex flex-col gap-2">
            <li
                v-for="task in shown"
                :key="task.id"
                data-testid="talos-task-row"
                :data-task-status="task.status"
                class="rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3"
            >
                <div class="flex items-start gap-2">
                    <CheckSquare class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                    <!-- Il blocco di testo APRE la pagina. Non tutta la riga:
                         accanto ci sono gia' dei bottoni, e un bottone dentro
                         un bottone non e' HTML valido — il tocco finirebbe a
                         quello sbagliato. -->
                    <button
                        type="button"
                        data-testid="talos-task-open"
                        class="talos-pressable min-w-0 flex-1 text-left"
                        @click="open(task)"
                    >
                        <div class="text-sm font-semibold text-[var(--talos-text)]" :class="task.status === 'done' ? 'line-through opacity-60' : ''">
                            {{ task.title }}
                        </div>
                        <p v-if="task.description" class="mt-0.5 line-clamp-2 text-xs leading-5 text-[var(--talos-muted)]">{{ task.description }}</p>
                        <p class="mt-1 font-mono text-2xs text-[var(--talos-muted)]">
                            {{ t('tasks.runIdLabel') }} {{ shortId(task.run_id) }} · {{ updatedAt(task.updated_at) }}
                        </p>
                        <!-- La riga esiste solo per le attività pianificate:
                             una pillola vuota su tutte le altre sarebbe rumore
                             su una lista che di solito è di promemoria. -->
                        <template v-for="quando in [prossimaEsecuzione(task)]" :key="quando ?? 'mai'">
                            <p
                                v-if="quando"
                                data-testid="talos-task-next-run"
                                class="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--talos-active)] px-2 py-0.5 text-2xs text-[var(--talos-muted)]"
                            >
                                <CalendarClock class="size-3 shrink-0" aria-hidden="true" />
                                <!--
                                    L'etichetta passa da `t()`, la data NO.
                                    `escapeParameter` è acceso su tutta l'app —
                                    ed è giusto, protegge da un parametro ostile
                                    — ma riscrive anche le barre di una data
                                    `07/08/26`, che sul tablet si leggeva
                                    `07&#x2F;08&#x2F;26`. Una data formattata da
                                    `Intl` non è un parametro ostile: non deve
                                    attraversare l'escape.
                                -->
                                {{ t('tasks.schedule.nextRunLabel') }} {{ quando }}
                            </p>
                        </template>
                    </button>
                    <button
                        type="button"
                        :aria-label="t('tasks.cycleNamed', { title: task.title })"
                        class="talos-pressable min-h-touch rounded-full bg-[var(--talos-active)] px-3 text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]"
                        @click="cycleStatus(task)"
                    >
                        {{ t(`tasks.status.${task.status}`) }}
                    </button>
                    <button
                        type="button"
                        :aria-label="t('tasks.deleteNamed', { title: task.title })"
                        class="talos-pressable flex min-h-touch min-w-touch items-center justify-center rounded-full text-[var(--talos-muted)]"
                        @click="remove(task)"
                    >
                        <Trash2 class="size-4" aria-hidden="true" />
                    </button>
                </div>
            </li>
        </ul>

        <!--
            Il FAB al posto del modulo sempre aperto.

            Visto sul tablet il 2026-08-06: il modulo occupava un terzo dello
            schermo sopra l'elenco, e sapeva creare MENO della pagina — non
            conosceva la pianificazione. Due porte per la stessa cosa, con
            poteri diversi: chi passava da qui non poteva far ripetere niente e
            non aveva modo di sapere perché.

            Una porta sola, e va dove ci sono tutti i campi. È la stessa
            grammatica delle Note e della Ricerca: FAB → pagina.
        -->
        <button
            type="button"
            data-testid="talos-tasks-new-fab"
            :aria-label="t('tasks.add')"
            class="talos-pressable fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-5 z-20 inline-flex size-14 items-center justify-center rounded-full bg-[var(--talos-accent)] text-[var(--talos-accent-contrast,var(--primary-foreground))] shadow-lg"
            @click="startNew"
        >
            <Plus class="size-6" aria-hidden="true" />
        </button>
    </div>
</template>

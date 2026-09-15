<script setup lang="ts">
/**
 * La pianificazione di un'attività, in una sezione che compare solo se serve.
 *
 * ## La forma, e perché non è un modulo lungo
 *
 * Un'attività su tre è un promemoria che non si ripete. Mostrare a tutte l'ora,
 * i giorni, l'intervallo e la condizione significherebbe far leggere sei campi a
 * chi ne voleva zero — e la pagina di creazione è quella che deve costare meno
 * di tutte. Perciò c'è UN interruttore, e il resto esiste solo dopo che è stato
 * acceso.
 *
 * Dentro, i campi cambiano col genere scelto: «ogni giorno» chiede solo l'ora,
 * «a giorni scelti» chiede anche i giorni, «a intervalli» non chiede l'ora
 * perché non guarda l'orologio. Mostrarli tutti e disabilitarne metà sarebbe la
 * stessa informazione detta peggio.
 *
 * ## La riga che conta più di tutte
 *
 * «Prossima esecuzione: …», calcolata mentre si scrive. È l'unica cosa che
 * risponde alla domanda vera — *quando succederà?* — e senza di lei si salva
 * una pianificazione fidandosi. Le combinazioni che non partono mai (l'unico
 * giorno scelto è passato, la data è vecchia) sono invisibili finché qualcuno
 * non aspetta invano: qui si vedono prima di premere Salva.
 *
 * ## Il minimo di quindici minuti non è nostro
 *
 * È di `WorkManager`, che non risveglia un'app più spesso. Chiedere cinque
 * minuti non farebbe girare più spesso: farebbe MENTIRE l'interfaccia, perché
 * Android arrotonda in silenzio a quindici. Meglio dirlo dove si sceglie.
 */
import { computed } from 'vue'
import { useTalosI18n } from '@/i18n'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import {
    TALOS_TASK_MIN_INTERVAL_MINUTES,
    talosIsValidSchedule,
    talosNextRunAt,
    type TalosTaskSchedule,
    type TalosTaskScheduleKind,
} from '@/lib/tasks/schedule'

const { t } = useTalosI18n()

const enabled = defineModel<boolean>('enabled', { required: true })
const instruction = defineModel<string>('instruction', { required: true })
const schedule = defineModel<TalosTaskSchedule>('schedule', { required: true })

const generi = computed<{ value: TalosTaskScheduleKind, label: string }[]>(() => [
    { value: 'once', label: t('tasks.schedule.kindOnce') },
    { value: 'daily', label: t('tasks.schedule.kindDaily') },
    { value: 'weekly', label: t('tasks.schedule.kindWeekly') },
    { value: 'interval', label: t('tasks.schedule.kindInterval') },
])

/**
 * Le iniziali dei giorni vengono dalla lingua del dispositivo, non da un elenco
 * scritto a mano: un elenco italiano comparirebbe identico a chi usa l'app in
 * inglese, ed è il genere di svista che nessun test coglie.
 */
const giorni = computed(() => {
    const formato = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
    return Array.from({ length: 7 }, (_, indice) => ({
        valore: indice,
        // 2026-08-09 è una domenica: da lì scorrono i sette giorni in ordine.
        etichetta: formato.format(new Date(2026, 7, 9 + indice)),
    }))
})

function alternaGiorno(giorno: number): void {
    const attuali = new Set(schedule.value.days ?? [])
    if (attuali.has(giorno)) attuali.delete(giorno)
    else attuali.add(giorno)
    schedule.value = { ...schedule.value, days: [...attuali].sort((a, b) => a - b) }
}

function cambia<K extends keyof TalosTaskSchedule>(campo: K, valore: TalosTaskSchedule[K]): void {
    schedule.value = { ...schedule.value, [campo]: valore }
}

const prossima = computed(() => {
    if (!enabled.value) return null
    return talosNextRunAt(schedule.value, Date.now())
})

const completa = computed(() => talosIsValidSchedule(schedule.value))

const quando = computed(() => {
    if (!completa.value) return t('tasks.schedule.incomplete')
    if (prossima.value === null) return t('tasks.schedule.neverRuns')
    // Etichetta e data restano SEPARATE: `escapeParameter` è acceso su tutta
    // l'app e riscriverebbe le barre di una data breve in `&#x2F;`. Qui il
    // formato lungo non ne ha, ma affidarsi a questo significherebbe rompersi
    // nella prima lingua che le usa.
    const formattata = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
        .format(new Date(prossima.value))
    return `${t('tasks.schedule.nextRunLabel')} ${formattata}`
})
</script>

<template>
    <section class="flex flex-col gap-3" data-testid="talos-task-schedule">
        <label class="talos-pressable flex min-h-touch items-center justify-between gap-3 rounded-xl border border-[var(--talos-border)] px-3">
            <span class="flex min-w-0 flex-col">
                <span class="text-sm text-[var(--talos-text)]">{{ t('tasks.schedule.enable') }}</span>
                <span class="text-xs text-[var(--talos-muted)]">{{ t('tasks.schedule.hint') }}</span>
            </span>
            <input
                v-model="enabled"
                type="checkbox"
                data-testid="talos-task-schedule-enable"
                class="size-5 shrink-0 accent-[var(--talos-accent)]"
            >
        </label>

        <template v-if="enabled">
            <textarea
                v-model="instruction"
                data-testid="talos-task-instruction"
                rows="3"
                :aria-label="t('tasks.schedule.instruction')"
                :placeholder="t('tasks.schedule.instructionPlaceholder')"
                class="min-h-[5rem] rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 py-2 text-sm leading-5 text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            />

            <label class="flex flex-col gap-1">
                <span class="text-xs text-[var(--talos-muted)]">{{ t('tasks.schedule.kind') }}</span>
                <TalosThemedSelect
                    :model-value="schedule.kind"
                    :items="generi"
                    :aria-label="t('tasks.schedule.kind')"
                    data-testid="talos-task-schedule-kind"
                    @update:model-value="cambia('kind', $event as TalosTaskScheduleKind)"
                />
            </label>

            <!-- L'ora serve a tutti tranne che agli intervalli, che non guardano
                 l'orologio: chiederla lì sarebbe un campo che non fa niente. -->
            <label v-if="schedule.kind !== 'interval'" class="flex flex-col gap-1">
                <span class="text-xs text-[var(--talos-muted)]">{{ t('tasks.schedule.at') }}</span>
                <input
                    :value="schedule.at ?? ''"
                    type="time"
                    data-testid="talos-task-schedule-at"
                    class="min-h-touch rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                    @input="cambia('at', ($event.target as HTMLInputElement).value)"
                >
            </label>

            <label v-if="schedule.kind === 'once'" class="flex flex-col gap-1">
                <span class="text-xs text-[var(--talos-muted)]">{{ t('tasks.schedule.date') }}</span>
                <input
                    :value="schedule.date ?? ''"
                    type="date"
                    data-testid="talos-task-schedule-date"
                    class="min-h-touch rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                    @input="cambia('date', ($event.target as HTMLInputElement).value)"
                >
            </label>

            <fieldset v-if="schedule.kind === 'weekly'" class="flex flex-col gap-1">
                <legend class="text-xs text-[var(--talos-muted)]">{{ t('tasks.schedule.days') }}</legend>
                <div class="flex flex-wrap gap-2">
                    <button
                        v-for="giorno in giorni"
                        :key="giorno.valore"
                        type="button"
                        :data-testid="`talos-task-schedule-day-${giorno.valore}`"
                        :aria-pressed="(schedule.days ?? []).includes(giorno.valore)"
                        class="talos-pressable min-h-touch rounded-full border px-3 text-xs"
                        :class="(schedule.days ?? []).includes(giorno.valore)
                            ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)] text-[var(--talos-accent-contrast,var(--primary-foreground))]'
                            : 'border-[var(--talos-border)] text-[var(--talos-text)]'"
                        @click="alternaGiorno(giorno.valore)"
                    >
                        {{ giorno.etichetta }}
                    </button>
                </div>
            </fieldset>

            <label v-if="schedule.kind === 'interval'" class="flex flex-col gap-1">
                <span class="text-xs text-[var(--talos-muted)]">{{ t('tasks.schedule.everyMinutes') }}</span>
                <input
                    :value="schedule.everyMinutes ?? TALOS_TASK_MIN_INTERVAL_MINUTES"
                    type="number"
                    :min="TALOS_TASK_MIN_INTERVAL_MINUTES"
                    step="5"
                    data-testid="talos-task-schedule-every"
                    class="min-h-touch rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                    @input="cambia('everyMinutes', Number(($event.target as HTMLInputElement).value))"
                >
                <span class="text-xs text-[var(--talos-muted)]">
                    {{ t('tasks.schedule.minInterval', { minutes: TALOS_TASK_MIN_INTERVAL_MINUTES }) }}
                </span>
            </label>

            <label class="talos-pressable flex min-h-touch items-center justify-between gap-3 rounded-xl border border-[var(--talos-border)] px-3">
                <span class="flex min-w-0 flex-col">
                    <span class="text-sm text-[var(--talos-text)]">{{ t('tasks.schedule.onlyIfChanged') }}</span>
                    <span class="text-xs text-[var(--talos-muted)]">{{ t('tasks.schedule.onlyIfChangedHint') }}</span>
                </span>
                <input
                    :checked="schedule.onlyIfChanged === true"
                    type="checkbox"
                    data-testid="talos-task-schedule-only-if-changed"
                    class="size-5 shrink-0 accent-[var(--talos-accent)]"
                    @change="cambia('onlyIfChanged', ($event.target as HTMLInputElement).checked)"
                >
            </label>

            <!--
                La riga che risponde alla domanda vera: quando succederà. Vive
                accanto ai campi e cambia mentre si scrive, perché una
                pianificazione che non parte mai è invisibile finché qualcuno non
                aspetta invano.
            -->
            <p
                data-testid="talos-task-schedule-next"
                class="text-xs"
                :class="completa && prossima !== null ? 'text-[var(--talos-muted)]' : 'text-[var(--talos-danger,#dc5b5b)]'"
            >
                {{ quando }}
            </p>
        </template>
    </section>
</template>

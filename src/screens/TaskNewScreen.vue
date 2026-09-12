<script setup lang="ts">
/**
 * Il modulo di un'attività — lo stesso per scriverne una nuova e per
 * correggerne una che c'è.
 *
 * ## ⛔ U-13 — perché «Modifica» apre QUESTA pagina, non un editor suo
 *
 * Perché sono la stessa cosa: due campi, una pianificazione e un salvataggio.
 * Due schermate per lo stesso gesto divergono — una prende un `maxlength`,
 * l'altra no; una sa impostare la ricorrenza, l'altra no — e chi ha imparato a
 * scrivere un'attività dovrebbe imparare una seconda volta per correggerla.
 * Cambiano tre cose e sono tutte parole: il titolo della cornice, il verbo del
 * pulsante, e dove si torna dopo. È esattamente la scelta già fatta per le note
 * (`NoteNewScreen.vue`, U-11), e copiarla è il punto.
 *
 * ## ⛔ Prima, correggere un'attività non si poteva affatto
 *
 * Non c'era una rotta, non c'era un pulsante, e l'unico modo di cambiare un
 * refuso nel titolo era cancellare e rifare — cioè cambiare identità
 * all'attività, e perdere con lei lo storico, la pianificazione e il legame con
 * l'esecuzione che l'aveva generata. Il metodo `update` del deposito esisteva
 * da sempre; mancava la porta.
 *
 * ## La priorità NON si chiede qui
 *
 * Nasce `normal` e la si cambia dalla pagina dell'attività, dove c'è il suo
 * controllo: chiederla al momento della scrittura costringe a giudicare una
 * cosa che non si è ancora finita di descrivere, e nella pratica produce
 * «alta» su tutto. In correzione il valore resta quello che era — questo
 * modulo non lo tocca, e `update` lascia stare i campi che non riceve.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTalosI18n } from '@/i18n'
import { Plus } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import { useChatController } from '@/stores/chatController'
import { talosNotify } from '@/stores/notificationCentre'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'
import TalosTaskScheduleFields from '@/components/talos/tasks/TalosTaskScheduleFields.vue'
import {
    TALOS_TASK_MIN_INTERVAL_MINUTES,
    talosIsValidSchedule,
    talosParseSchedule,
    talosSerializeSchedule,
    type TalosTaskSchedule,
} from '@/lib/tasks/schedule'

const controller = useChatController()
const router = useRouter()
const route = useRoute()
const { t } = useTalosI18n()

/** Il modo lo decide la ROTTA, non una prop: l'indirizzo è già la verità. */
const idInCorrezione = computed(() => (
    route.name === 'task-edit' ? String(route.params.id ?? '') : ''
))
const correggendo = computed(() => idInCorrezione.value.length > 0)

const title = ref('')
const description = ref('')
const saving = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)

/**
 * La pianificazione nasce SPENTA e con dei valori già dentro.
 *
 * Spenta perché un'attività su tre è un promemoria che non si ripete, e non deve
 * pagare sei campi per esistere. Già riempita perché nel momento in cui qualcuno
 * accende l'interruttore, «ogni giorno alle 9» è la cosa che vuole nove volte su
 * dieci — e trovare un modulo vuoto da compilare è il modo di far chiudere la
 * pagina.
 */
const scheduleOn = ref(false)
const instruction = ref('')
const schedule = ref<TalosTaskSchedule>({
    kind: 'daily',
    at: '09:00',
    days: [1, 2, 3, 4, 5],
    everyMinutes: TALOS_TASK_MIN_INTERVAL_MINUTES * 4,
})

/**
 * Con la pianificazione accesa servono ANCHE l'istruzione e una ricorrenza
 * eseguibile. Senza istruzione l'attività partirebbe e non saprebbe cosa fare;
 * con una ricorrenza a metà non partirebbe mai, e nell'elenco sembrerebbe attiva.
 */
const canSave = computed(() => {
    if (title.value.trim().length === 0 || saving.value || loading.value) return false
    if (!scheduleOn.value) return true
    return instruction.value.trim().length > 0 && talosIsValidSchedule(schedule.value)
})

onMounted(async () => {
    if (!correggendo.value) return
    loading.value = true
    try {
        const tutte = await controller.tasks.list()
        const trovata = tutte.find((entry) => entry.id === idInCorrezione.value)
        // Se non c'è, non si apre un modulo vuoto che al salvataggio
        // fallirebbe: si torna all'elenco, che è l'unico posto onesto.
        if (!trovata) {
            await router.replace({ name: 'tasks' })
            return
        }
        title.value = trovata.title
        description.value = trovata.description ?? ''
        instruction.value = trovata.instruction ?? ''
        const salvata = talosParseSchedule(trovata.schedule_json)
        if (salvata) {
            scheduleOn.value = true
            // ⛔ Si parte dai valori di serie e si sovrascrive con quelli
            // salvati: una ricorrenza `daily` non porta con sé i giorni della
            // settimana, e lasciare `days` vuoto farebbe apparire il modulo
            // «A giorni scelti» come se nessun giorno fosse mai stato scelto.
            schedule.value = { ...schedule.value, ...salvata }
        }
    } catch (cause) {
        error.value = cause instanceof Error && cause.message ? cause.message : String(cause)
    } finally {
        loading.value = false
    }
})

async function submit(): Promise<void> {
    if (!canSave.value) return
    saving.value = true
    error.value = null
    try {
        // Spenta significa NON pianificata, non «pianificata e ferma»: chi
        // riaccende l'interruttore più tardi ricomincia da quello che decide
        // allora, non da un residuo dimenticato qui. ⛔ «Pianificata e ferma»
        // esiste, ed è un'altra cosa: è la PAUSA (U-17), che si mette dalla
        // pagina dell'attività e lascia tutto scritto.
        const schedule_json = scheduleOn.value ? talosSerializeSchedule(schedule.value) : null
        const istruzione = scheduleOn.value ? instruction.value.trim() : null
        // Vuota e assente sono la stessa cosa: una descrizione fatta di spazi
        // occuperebbe la riga del dettaglio senza dire niente.
        const descrizione = description.value.trim() || null

        if (correggendo.value) {
            await controller.tasks.update(idInCorrezione.value, {
                title: title.value.trim(),
                description: descrizione,
                schedule_json,
                instruction: istruzione,
            })
            // Si torna all'ATTIVITÀ, non all'elenco: è quella che si stava
            // guardando, ed è lì che si verifica di aver corretto la cosa
            // giusta. `replace` perché il modulo non deve restare nella
            // cronologia: Indietro dall'attività va all'elenco, non di nuovo qui.
            await router.replace({ name: 'task-item', params: { id: idInCorrezione.value } })
            return
        }

        await controller.tasks.create({
            title: title.value.trim(),
            description: descrizione,
            run_id: null,
            priority: 'normal',
            schedule_json,
            instruction: istruzione,
        })
        /*
         * Peso `log`: nel registro sì, in faccia no.
         *
         * Chi ha appena premuto «Crea» sta guardando lo schermo, e la conferma
         * ce l'ha già — la pagina si chiude e l'attività compare nell'elenco.
         * Un avviso in cima direbbe una cosa che si sta vedendo, e la ricerca
         * sulle notifiche è netta: un avviso che non aggiunge niente insegna a
         * ignorare anche quelli che aggiungono. Resta però nel centro
         * notifiche, perché «cosa è successo oggi» deve poter essere riletto.
         */
        talosNotify({
            // La chiave porta il TITOLO: il registro collassa per chiave, e con
            // una chiave sola due creazioni diverse diventerebbero una riga
            // con «×2» — cioè un registro che non dice cosa è stato creato.
            key: `task:created:${title.value.trim()}`,
            channel: 'jobs',
            weight: 'log',
            // Written by the person: a trace in the feed, never a badge. Same
            // rule as NoteNewScreen (12/09/2026): notifications answer to what the
            // model did, not to what you just typed yourself.
            origin: 'person',
            title: t('tasks.add'),
            body: title.value.trim(),
            at: Date.now(),
        })
        await router.replace({ name: 'tasks' })
    } catch (cause) {
        error.value = cause instanceof Error && cause.message ? cause.message : String(cause)
    } finally {
        saving.value = false
    }
}

/** Annullare vuol dire tornare da dove si è arrivati, qualunque sia. */
function annulla(): void {
    router.back()
}

/** U-14 — l'onda che parte dal dito, sulle azioni di questa pagina. */
const onda = useTalosTouchWave()
</script>

<template>
    <TalosMobileScreen
        :title="correggendo ? t('tasks.editTitle') : t('tasks.add')"
        data-testid="talos-task-new-screen"
    >
        <form
            class="mx-auto flex w-full max-w-[46rem] flex-col gap-[var(--talos-space-section)] px-[var(--talos-space-page)] pt-[var(--talos-space-section)]"
            :data-editing="correggendo"
            @submit.prevent="submit"
        >
            <!-- Etichette VISIBILI, come nel mockup e come nelle note: un campo
                 senza etichetta si capisce finché è vuoto, e diventa un
                 rettangolo di testo senza nome appena qualcuno ci scrive
                 dentro. -->
            <label class="flex flex-col gap-[var(--talos-space-inline)]">
                <span class="text-sm font-medium text-[var(--talos-text)]">{{ t('tasks.fieldTitle') }}</span>
                <input
                    v-model="title"
                    data-testid="talos-task-title"
                    maxlength="255"
                    :aria-label="t('tasks.title')"
                    class="min-h-touch rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                >
            </label>

            <label class="flex flex-col gap-[var(--talos-space-inline)]">
                <span class="text-sm font-medium text-[var(--talos-text)]">{{ t('tasks.fieldDescription') }}</span>
                <textarea
                    v-model="description"
                    data-testid="talos-task-description"
                    :aria-label="t('tasks.descriptionOptional')"
                    :placeholder="t('tasks.descriptionPlaceholder')"
                    rows="7"
                    class="min-h-[11rem] rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                />
            </label>

            <TalosTaskScheduleFields
                v-model:enabled="scheduleOn"
                v-model:instruction="instruction"
                v-model:schedule="schedule"
            />

            <p v-if="error" role="alert" data-testid="talos-task-new-error" class="text-xs text-[var(--talos-danger)]">
                {{ error }}
            </p>

            <!-- Due soli bottoni, e il verbo dice esattamente cosa succede. -->
            <div class="flex flex-wrap items-center justify-end gap-[var(--talos-space-card)] pb-[max(var(--talos-space-page),env(safe-area-inset-bottom))]">
                <Button
                    type="button"
                    variant="outline"
                    data-testid="talos-task-cancel"
                    class="talos-pressable talos-wave-host min-h-touch flex-1 rounded-[var(--talos-radius-control)] text-sm"
                    @click="annulla"
                    @pointerdown="onda.onPointerDown"
                >
                    {{ t('common.cancel') }}
                </Button>
                <Button
                    type="submit"
                    data-testid="talos-task-save"
                    :disabled="!canSave"
                    class="talos-pressable talos-wave-host min-h-touch flex-1 rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] text-sm text-[var(--talos-accent-text)] disabled:opacity-50"
                    @pointerdown="onda.onPointerDown"
                >
                    <Plus v-if="!correggendo" class="size-4" aria-hidden="true" />
                    {{ correggendo ? t('tasks.save') : t('tasks.add') }}
                </Button>
            </div>
        </form>
    </TalosMobileScreen>
</template>

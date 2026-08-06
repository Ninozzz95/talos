<script setup lang="ts">
/**
 * Un'attività nuova, su una pagina sua.
 *
 * Nasce col FAB a ventaglio, insieme alla pagina della memoria: le cinque voci
 * devono portare tutte allo stesso genere di posto, e queste due erano le uniche
 * che una pagina di creazione non ce l'avevano.
 *
 * La priorità NON si chiede qui. Nasce `normal` come già fa la stazione, e la si
 * cambia dopo se serve: chiederla al momento della scrittura costringe a
 * giudicare una cosa che non si è ancora finita di descrivere, e nella pratica
 * produce «alta» su tutto.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTalosI18n } from '@/i18n'
import { Plus } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import { useChatController } from '@/stores/chatController'
import { talosNotify } from '@/stores/notificationCentre'

const controller = useChatController()
const router = useRouter()
const { t } = useTalosI18n()

const title = ref('')
const description = ref('')
const saving = ref(false)
const error = ref<string | null>(null)

const canCreate = computed(() => title.value.trim().length > 0 && !saving.value)

async function submit(): Promise<void> {
    if (!canCreate.value) return
    saving.value = true
    error.value = null
    try {
        await controller.tasks.create({
            title: title.value.trim(),
            // Vuota e assente sono la stessa cosa: una descrizione fatta di
            // spazi occuperebbe la riga del dettaglio senza dire niente.
            description: description.value.trim() || null,
            run_id: null,
            priority: 'normal',
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
</script>

<template>
    <TalosMobileScreen :title="t('tasks.add')" data-testid="talos-task-new-screen">
        <form class="flex flex-col gap-3 px-4 pt-3" @submit.prevent="submit">
            <input
                v-model="title"
                data-testid="talos-task-title"
                maxlength="255"
                :aria-label="t('tasks.title')"
                :placeholder="t('tasks.title')"
                class="min-h-touch rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            >
            <textarea
                v-model="description"
                data-testid="talos-task-description"
                :aria-label="t('tasks.descriptionOptional')"
                :placeholder="t('tasks.descriptionOptional')"
                rows="6"
                class="min-h-[9rem] rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 py-2 text-sm leading-5 text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            />

            <p v-if="error" role="alert" data-testid="talos-task-new-error" class="text-xs text-[var(--talos-danger,#dc5b5b)]">
                {{ error }}
            </p>

            <Button
                type="submit"
                data-testid="talos-task-save"
                :disabled="!canCreate"
                class="talos-pressable min-h-touch rounded-full bg-[var(--talos-accent,var(--primary))] text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))] disabled:opacity-50"
            >
                <Plus class="size-4" aria-hidden="true" />
                {{ t('tasks.add') }}
            </Button>
        </form>
    </TalosMobileScreen>
</template>

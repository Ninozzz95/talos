<script setup lang="ts">
/**
 * Una nota nuova, su una pagina sua.
 *
 * ## Perché non più un modulo dentro l'elenco
 *
 * Visto sul tablet il 2026-08-06: la schermata Note teneva titolo, corpo e
 * pulsante **sempre aperti sopra la lista**, e su un riquadro alto occupavano un
 * terzo dello schermo — permanentemente, anche per chi era entrato solo per
 * rileggere una nota. Il gesto raro rubava spazio a quello frequente.
 *
 * Il commento in cima a quella schermata parlava di un FAB fin dall'inizio.
 * Semplicemente non esisteva: era stato descritto e non fatto.
 *
 * ## Perché una pagina e non una finestra
 *
 * Perché è la grammatica dell'app: ogni voce è una PAGINA e Indietro è lineare
 * ([[navigation-linear-page-mapping]]). La Ricerca fa già esattamente questo —
 * `/research/new` con la sua schermata — e copiare quella forma vuol dire che
 * chi ha imparato a creare una ricerca sa già creare una nota.
 *
 * Una pagina ha anche un vantaggio che una finestra non ha: il corpo di una nota
 * può essere lungo, e qui ha tutta l'altezza dello schermo invece di tre righe.
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
const content = ref('')
const saving = ref(false)
const error = ref<string | null>(null)

const canCreate = computed(() =>
    title.value.trim().length > 0 && content.value.trim().length > 0 && !saving.value)

async function submit(): Promise<void> {
    if (!canCreate.value) return
    saving.value = true
    error.value = null
    try {
        await controller.notes.create({ title: title.value.trim(), content: content.value.trim() })
        // Peso `log`, come memoria e attività: le tre creazioni a mano lasciano
        // la stessa traccia, e nessuna delle tre interrompe chi la sta facendo.
        talosNotify({
            // La chiave porta il TITOLO: il registro collassa per chiave, e con
            // una chiave sola due creazioni diverse diventerebbero una riga
            // con «×2» — cioè un registro che non dice cosa è stato creato.
            key: `note:created:${title.value.trim()}`,
            channel: 'jobs',
            weight: 'log',
            title: t('notes.add'),
            body: title.value.trim(),
            at: Date.now(),
        })
        // Indietro all'elenco, che è dove la nota appena scritta si vede. Un
        // `push` lascerebbe la pagina di creazione nella cronologia, e Indietro
        // dall'elenco tornerebbe su un modulo vuoto.
        await router.replace({ name: 'notes' })
    } catch (cause) {
        error.value = cause instanceof Error && cause.message ? cause.message : String(cause)
    } finally {
        saving.value = false
    }
}
</script>

<template>
    <TalosMobileScreen :title="t('notes.add')" data-testid="talos-note-new-screen">
        <form class="flex flex-col gap-3 px-4 pt-3" @submit.prevent="submit">
            <input
                v-model="title"
                data-testid="talos-note-title"
                maxlength="255"
                :aria-label="t('notes.title')"
                :placeholder="t('notes.title')"
                class="min-h-touch rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            >
            <!-- Alto quanto lo schermo lo permette: il corpo di una nota è la
                 cosa che si sta scrivendo, e tre righe erano il limite imposto
                 dal fatto di stare sopra un elenco. -->
            <textarea
                v-model="content"
                data-testid="talos-note-content"
                :aria-label="t('notes.content')"
                :placeholder="t('notes.content')"
                rows="12"
                class="min-h-[16rem] rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 py-2 text-sm leading-5 text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            />

            <p v-if="error" role="alert" data-testid="talos-note-new-error" class="text-xs text-[var(--talos-danger,#dc5b5b)]">
                {{ error }}
            </p>

            <Button
                type="submit"
                data-testid="talos-note-save"
                :disabled="!canCreate"
                class="talos-pressable min-h-touch rounded-full bg-[var(--talos-accent,var(--primary))] text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))] disabled:opacity-50"
            >
                <Plus class="size-4" aria-hidden="true" />
                {{ t('notes.add') }}
            </Button>
        </form>
    </TalosMobileScreen>
</template>

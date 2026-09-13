<script setup lang="ts">
/**
 * Il modulo di una nota — lo stesso per scriverne una nuova e per correggerne
 * una che c'è.
 *
 * ## ⛔ U-11 — perché «Modifica» apre QUESTA pagina, non un editor suo
 *
 * Perché sono la stessa cosa: due campi e un salvataggio. Due schermate per lo
 * stesso gesto divergono — una prende un `maxlength`, l'altra no; una impedisce
 * di salvare una nota vuota, l'altra la lascia passare — e chi ha imparato a
 * scrivere una nota dovrebbe imparare una seconda volta per correggerla.
 * Cambiano tre cose e sono tutte parole: il titolo della cornice, il verbo del
 * pulsante, e dove si torna dopo.
 *
 * ## Perché non più un modulo dentro l'elenco
 *
 * Visto sul tablet il 2026-08-06: la schermata Note teneva titolo, corpo e
 * pulsante **sempre aperti sopra la lista**, e su un riquadro alto occupavano un
 * terzo dello schermo — permanentemente, anche per chi era entrato solo per
 * rileggere una nota. Il gesto raro rubava spazio a quello frequente.
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
 *
 * ## ⛔ Perché NON c'è un `<h1>` come nel mockup
 *
 * Il mockup ha «Nuova nota» in grande sopra il modulo. Qui la cornice del
 * foglio lo dice già — è la decisione scritta in `App.vue`: «le pagine di
 * creazione dicono cosa STANNO creando… la cornice è l'unica cosa che
 * distingue una nota nuova dall'elenco che sta dietro». Ripeterlo darebbe due
 * titoli identici a due centimetri di distanza. Vince la regola dell'owner.
 */
import { computed, onMounted, ref } from 'vue'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'
import { useRoute, useRouter } from 'vue-router'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import { useChatController } from '@/stores/chatController'
import { talosNotify } from '@/stores/notificationCentre'

const controller = useChatController()
const router = useRouter()
const route = useRoute()
const { t } = useTalosI18n()

/** Il modo lo decide la ROTTA, non una prop: l'indirizzo è già la verità. */
const editingId = computed(() => (
    route.name === 'note-edit' ? String(route.params.id ?? '') : ''
))
const editing = computed(() => editingId.value.length > 0)

const title = ref('')
const content = ref('')
const saving = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)

const canSave = computed(() =>
    title.value.trim().length > 0 && content.value.trim().length > 0 && !saving.value && !loading.value)

onMounted(async () => {
    if (!editing.value) return
    loading.value = true
    try {
        const all = await controller.notes.list()
        const found = all.find((entry) => entry.id === editingId.value)
        // Se non c'è, non si apre un modulo vuoto che al salvataggio
        // fallirebbe: si torna all'elenco, che è l'unico posto onesto.
        if (!found) {
            await router.replace({ name: 'notes' })
            return
        }
        title.value = found.title
        content.value = found.content
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
        if (editing.value) {
            await controller.notes.update({
                id: editingId.value,
                title: title.value.trim(),
                content: content.value.trim(),
            })
            // Si torna alla NOTA, non all'elenco: è quella che si stava
            // leggendo, ed è lì che si verifica di aver corretto la cosa
            // giusta. `replace` perché il modulo non deve restare nella
            // cronologia: Indietro dalla nota va all'elenco, non di nuovo qui.
            await router.replace({ name: 'note-item', params: { id: editingId.value } })
            return
        }

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
            /*
             * ⛔ L'ha scritta la PERSONA, con le sue mani, un istante fa.
             *
             * Owner 2026-09-11 sul Pad: tre note create dalla stazione, e il
             * campanello diceva **3**. Il peso `log` non bastava — non
             * interrompeva nessuno ma restava «non letta», e il numero conta
             * le non lette. `origin: 'person'` fa nascere la riga già letta:
             * la traccia c'è e si rilegge, il richiamo no.
             *
             * ⛔ AL CONTRARIO: la stessa nota creata dall'attrezzo del modello
             * (`notes.create`, annunciata da `toolset.ts`) NON porta questo
             * campo, ed è giusto — quella è una cosa che TALOS ha fatto al
             * posto tuo mentre guardavi altrove, ed è esattamente ciò che un
             * campanello serve a dire.
             */
            origin: 'person',
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

/** Annullare vuol dire tornare da dove si è arrivati, qualunque sia. */
function cancel(): void {
    router.back()
}

/**
 * U-14 — l'onda che parte dal dito.
 *
 * Nel mockup la ricevono TUTTI i bottoni: `Motion.enhance` (`app.js:2228`)
 * marca `button,.row-main,summary` a ogni render. Qui la si mette a mano, sulle
 * azioni di questa pagina, perché l'app non ha ancora un punto unico dove
 * applicarla a tutti — una direttiva globale registrata in `main.ts`, che
 * questo giro di lavoro non poteva toccare. Debito scritto nell'inventario.
 */
const onda = useTalosTouchWave()
</script>

<template>
    <TalosMobileScreen
        :title="editing ? t('notes.editTitle') : t('notes.add')"
        data-testid="talos-note-new-screen"
    >
        <form
            class="mx-auto flex w-full max-w-[46rem] flex-col gap-[var(--talos-space-section)] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)]/60 p-[var(--talos-space-page)]"
            :data-editing="editing"
            @submit.prevent="submit"
        >
            <!-- Etichette VISIBILI, come nel mockup: un campo senza etichetta si
                 capisce finché è vuoto, e diventa un rettangolo di testo senza
                 nome appena qualcuno ci scrive dentro. -->
            <label class="flex flex-col gap-[var(--talos-space-inline)]">
                <span class="text-sm font-medium text-[var(--talos-text)]">{{ t('notes.fieldTitle') }}</span>
                <input
                    v-model="title"
                    data-testid="talos-note-title"
                    maxlength="255"
                    :aria-label="t('notes.title')"
                    class="min-h-touch rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                >
            </label>

            <!-- Alto quanto lo schermo lo permette: il corpo di una nota è la
                 cosa che si sta scrivendo, e tre righe erano il limite imposto
                 dal fatto di stare sopra un elenco. -->
            <label class="flex flex-col gap-[var(--talos-space-inline)]">
                <span class="text-sm font-medium text-[var(--talos-text)]">{{ t('notes.fieldContent') }}</span>
                <textarea
                    v-model="content"
                    data-testid="talos-note-content"
                    :aria-label="t('notes.content')"
                    rows="12"
                    class="min-h-[16rem] rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                />
            </label>

            <p v-if="error" role="alert" data-testid="talos-note-new-error" class="text-xs text-[var(--talos-danger)]">
                {{ error }}
            </p>

            <!-- Due soli bottoni, e il verbo dice esattamente cosa succede. -->
            <div class="flex flex-wrap items-center justify-end gap-[var(--talos-space-card)]">
                <Button
                    type="button"
                    variant="outline"
                    data-testid="talos-note-cancel"
                    class="talos-pressable talos-wave-host min-h-touch flex-1 rounded-[var(--talos-radius-control)] text-sm"
                    @click="cancel"
                    @pointerdown="onda.onPointerDown"
                >
                    {{ t('common.cancel') }}
                </Button>
                <Button
                    type="submit"
                    data-testid="talos-note-save"
                    :disabled="!canSave"
                    class="talos-pressable talos-wave-host min-h-touch flex-1 rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] text-sm text-[var(--talos-accent-text)] disabled:opacity-50"
                    @pointerdown="onda.onPointerDown"
                >
                    {{ t('notes.save') }}
                </Button>
            </div>
        </form>
    </TalosMobileScreen>
</template>

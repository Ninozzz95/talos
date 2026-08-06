<script setup lang="ts">
/**
 * Una memoria nuova, su una pagina sua.
 *
 * Nasce col FAB a ventaglio: le cinque voci devono portare tutte allo stesso
 * genere di posto, e memoria e attività erano le due che una pagina di creazione
 * non ce l'avevano. Tre voci che aprono una pagina e due che aprono un elenco
 * sarebbero cinque voci che si comportano in due modi.
 *
 * Rispecchia `NoteNewScreen`, che a sua volta rispecchia `ResearchNewScreen`:
 * chi ha imparato a creare una ricerca sa già creare tutto il resto.
 *
 * ## Perché il genere si sceglie qui
 *
 * Perché una memoria NON è una nota: il modello la rilegge da sola in ogni
 * conversazione futura, e il genere decide come la userà. Chiederlo al momento
 * della scrittura è l'unico momento in cui chi scrive sa ancora perché lo sta
 * facendo.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTalosI18n } from '@/i18n'
import { Plus } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import { useChatController } from '@/stores/chatController'
import { talosNotify } from '@/stores/notificationCentre'

type Genere = 'preference' | 'project_fact' | 'procedure' | 'policy_note'

const controller = useChatController()
const router = useRouter()
const { t } = useTalosI18n()

const title = ref('')
const content = ref('')
const kind = ref<Genere>('preference')
const saving = ref(false)
const error = ref<string | null>(null)

const kinds = computed(() => ([
    { value: 'preference', label: t('memory.preference') },
    { value: 'project_fact', label: t('memory.projectFact') },
    { value: 'procedure', label: t('memory.procedure') },
    { value: 'policy_note', label: t('memory.policyNote') },
]))

const canCreate = computed(() =>
    title.value.trim().length > 0 && content.value.trim().length > 0 && !saving.value)

async function submit(): Promise<void> {
    if (!canCreate.value) return
    saving.value = true
    error.value = null
    try {
        await controller.memories.create({
            title: title.value.trim(),
            content: content.value.trim(),
            kind: kind.value,
            // Globale: una memoria scritta a mano vale sempre. Legarla a una
            // sessione la farebbe sparire con quella, ed è l'opposto del motivo
            // per cui qualcuno la scrive.
            scope_type: 'global',
            scope_id: null,
        })
        // Peso `log`, come l'attività: nel registro sì, in faccia no — chi ha
        // appena premuto «Salva» la conferma ce l'ha davanti agli occhi.
        talosNotify({
            // La chiave porta il TITOLO: il registro collassa per chiave, e con
            // una chiave sola due creazioni diverse diventerebbero una riga
            // con «×2» — cioè un registro che non dice cosa è stato creato.
            key: `memory:created:${title.value.trim()}`,
            channel: 'jobs',
            weight: 'log',
            title: t('memory.newMemory'),
            body: title.value.trim(),
            at: Date.now(),
        })
        await router.replace({ name: 'memory' })
    } catch (cause) {
        error.value = cause instanceof Error && cause.message ? cause.message : String(cause)
    } finally {
        saving.value = false
    }
}
</script>

<template>
    <TalosMobileScreen :title="t('memory.newMemory')" data-testid="talos-memory-new-screen">
        <form class="flex flex-col gap-3 px-4 pt-3" @submit.prevent="submit">
            <input
                v-model="title"
                data-testid="talos-memory-title"
                maxlength="255"
                :aria-label="t('memory.memoryTitle')"
                :placeholder="t('memory.memoryTitle')"
                class="min-h-touch rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            >
            <textarea
                v-model="content"
                data-testid="talos-memory-content"
                :aria-label="t('memory.content')"
                :placeholder="t('memory.content')"
                rows="8"
                class="min-h-[12rem] rounded-xl border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 py-2 text-sm leading-5 text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            />
            <TalosThemedSelect
                v-model="kind"
                :items="kinds"
                :label="t('memory.kind')"
                data-testid="talos-memory-kind"
            />

            <p v-if="error" role="alert" data-testid="talos-memory-new-error" class="text-xs text-[var(--talos-danger,#dc5b5b)]">
                {{ error }}
            </p>

            <Button
                type="submit"
                data-testid="talos-memory-save"
                :disabled="!canCreate"
                class="talos-pressable min-h-touch rounded-full bg-[var(--talos-accent,var(--primary))] text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))] disabled:opacity-50"
            >
                <Plus class="size-4" aria-hidden="true" />
                {{ t('memory.newMemory') }}
            </Button>
        </form>
    </TalosMobileScreen>
</template>

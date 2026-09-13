<script setup lang="ts">
/**
 * Il modulo di una memoria — lo stesso per scriverne una nuova e per
 * correggerne una che c'è.
 *
 * Mockup: `entityForm('memories')` (`src/app.js:1003`) — Titolo, Contenuto,
 * «Tipo di memoria», e in fondo Annulla / Salva memoria.
 *
 * ## ⛔ U-19 — perché «Modifica» apre QUESTA pagina, non un editor suo
 *
 * Perché sono la stessa cosa: due campi, un tipo e un salvataggio. Due
 * schermate per lo stesso gesto divergono — una prende un `maxlength`, l'altra
 * no; una impedisce di salvare una memoria vuota, l'altra la lascia passare — e
 * chi ha imparato a scriverne una dovrebbe imparare una seconda volta per
 * correggerla. Cambiano tre cose e sono tutte parole: il titolo della cornice,
 * il verbo del pulsante, e dove si torna dopo. È la stessa decisione già presa
 * per le Note l'11/09/2026 (`NoteNewScreen.vue`).
 *
 * ## ⛔ Perché la correzione passa da `update` e non da `create`
 *
 * Perché `upsertMemory` rimette `status = 'active'` a ogni scrittura: usarlo per
 * una correzione risveglierebbe una memoria che l'utente aveva **spento**,
 * perché qualcuno ne ha corretto una virgola. Lo stato è una decisione
 * dell'utente, e una modifica al testo non la revoca. Il deposito ha
 * `updateMemory` apposta (`chatRepository.ts:620`), e la facciata lo espone
 * come `memories.update`.
 *
 * ## ⛔ E la PROVENIENZA non si tocca
 *
 * `content_origin` resta quella d'origine (A8). Una memoria annotata dal
 * modello dopo aver letto una pagina web viene da quella pagina anche dopo che
 * una persona le ha sistemato il titolo: correggere il testo non ne cambia la
 * storia, e fingere di sì vorrebbe dire regalare fiducia con un gesto di
 * editing. `updateMemory` infatti tocca solo `title`, `content` e `kind`.
 *
 * ## Perché il tipo si sceglie qui
 *
 * Perché una memoria NON è una nota: il modello la rilegge da sola in ogni
 * conversazione futura, e il tipo decide come la userà. Chiederlo al momento
 * della scrittura è l'unico momento in cui chi scrive sa ancora perché lo sta
 * facendo.
 *
 * ## ⛔ Perché NON c'è un `<h1>` come nel mockup
 *
 * Il mockup ha «Nuova memoria» in grande sopra il modulo. Qui la cornice del
 * foglio lo dice già — è la decisione scritta in `App.vue`: «le pagine di
 * creazione dicono cosa STANNO creando… la cornice è l'unica cosa che
 * distingue una memoria nuova dall'elenco che sta dietro». Ripeterlo darebbe
 * due titoli identici a due centimetri di distanza. Vince la regola dell'owner.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import type { TalosThemedSelectItem } from '@/components/talos/ui/TalosThemedSelect.vue'
import { useChatController } from '@/stores/chatController'
import { talosNotify } from '@/stores/notificationCentre'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'
import {
    TALOS_MEMORY_KINDS,
    talosMemoryKindLabelKey,
    talosMemoryKindOf,
    type TalosMemoryKindId,
} from '@/components/talos/memory/memoryShape'

const controller = useChatController()
const router = useRouter()
const route = useRoute()
const { t } = useTalosI18n()

/** Il modo lo decide la ROTTA, non una prop: l'indirizzo è già la verità. */
const editingId = computed(() => (
    route.name === 'memory-edit' ? String(route.params.id ?? '') : ''
))
const editing = computed(() => editingId.value.length > 0)

const title = ref('')
const content = ref('')
const kind = ref<TalosMemoryKindId>('preference')
/**
 * ⛔ La memoria aperta aveva un tipo che i quattro non contengono.
 *
 * Succede su una riga proposta dal modello e mai approvata (`kind: 'rejected'`).
 * Il selettore cade su «Preferenza» perché deve mostrare qualcosa, e questo
 * flag serve a DIRLO: salvare senza avvisare cambierebbe di nascosto la natura
 * della riga, e chi ha aperto la pagina per correggere una parola si
 * ritroverebbe una preferenza che non ha scelto.
 */
const kindWasMissing = ref(false)
const saving = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)

const kinds = computed<TalosThemedSelectItem[]>(() => TALOS_MEMORY_KINDS.map((id) => ({
    value: id,
    label: t(talosMemoryKindLabelKey(id)),
})))

/**
 * Il selettore condiviso parla stringhe nude, e il campo è un'unione stretta.
 *
 * Invece di riportare la stringa dentro l'unione con un cast — che lascerebbe
 * passare qualunque valore — la scelta si cerca nella lista da cui è arrivata:
 * se non c'è, non cambia niente.
 */
function chooseKind(value: string): void {
    const trovato = talosMemoryKindOf(value)
    if (trovato) {
        kind.value = trovato
        kindWasMissing.value = false
    }
}

const canSave = computed(() =>
    title.value.trim().length > 0
    && content.value.trim().length > 0
    && !saving.value
    && !loading.value)

onMounted(async () => {
    if (!editing.value) return
    loading.value = true
    try {
        const all = await controller.memories.list()
        const found = all.find((entry) => entry.id === editingId.value)
        // Se non c'è, non si apre un modulo vuoto che al salvataggio
        // fallirebbe: si torna all'elenco, che è l'unico posto onesto.
        if (!found) {
            await router.replace({ name: 'memory' })
            return
        }
        title.value = found.title
        content.value = found.content
        const tipo = talosMemoryKindOf(found.kind)
        kind.value = tipo ?? 'preference'
        kindWasMissing.value = tipo === null
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
            await controller.memories.update({
                id: editingId.value,
                title: title.value.trim(),
                content: content.value.trim(),
                kind: kind.value,
            })
            // Si torna alla MEMORIA, non all'elenco: è quella che si stava
            // leggendo, ed è lì che si verifica di aver corretto la cosa
            // giusta. `replace` perché il modulo non deve restare nella
            // cronologia: Indietro dalla memoria va all'elenco, non di nuovo qui.
            await router.replace({ name: 'memory-item', params: { id: editingId.value } })
            return
        }

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
        // Peso `log`, come la nota e l'attività: nel registro sì, in faccia no —
        // chi ha appena premuto «Salva» la conferma ce l'ha davanti agli occhi.
        talosNotify({
            // La chiave porta il TITOLO: il registro collassa per chiave, e con
            // una chiave sola due creazioni diverse diventerebbero una riga
            // con «×2» — cioè un registro che non dice cosa è stato creato.
            key: `memory:created:${title.value.trim()}`,
            channel: 'jobs',
            weight: 'log',
            // Written by the person: a trace in the feed, never a badge. Same
            // rule as NoteNewScreen (12/09/2026): notifications answer to what the
            // model did, not to what you just typed yourself.
            origin: 'person',
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

/** Annullare vuol dire tornare da dove si è arrivati, qualunque sia. */
function cancel(): void {
    router.back()
}

/** U-14 — l'onda che parte dal dito, sulle azioni di questa pagina. */
const onda = useTalosTouchWave()
</script>

<template>
    <TalosMobileScreen
        :title="editing ? t('memory.editTitle') : t('memory.newMemory')"
        data-testid="talos-memory-new-screen"
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
                <span class="text-sm font-medium text-[var(--talos-text)]">{{ t('memory.fieldTitle') }}</span>
                <input
                    v-model="title"
                    data-testid="talos-memory-title"
                    maxlength="255"
                    :aria-label="t('memory.memoryTitle')"
                    class="min-h-touch rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 text-sm text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                >
            </label>

            <label class="flex flex-col gap-[var(--talos-space-inline)]">
                <span class="text-sm font-medium text-[var(--talos-text)]">{{ t('memory.fieldContent') }}</span>
                <textarea
                    v-model="content"
                    data-testid="talos-memory-content"
                    :aria-label="t('memory.memoryContent')"
                    :placeholder="t('memory.content')"
                    rows="8"
                    class="min-h-[12rem] rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-background)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                />
            </label>

            <label class="flex flex-col gap-[var(--talos-space-inline)]">
                <span class="text-sm font-medium text-[var(--talos-text)]">{{ t('memory.kind') }}</span>
                <TalosThemedSelect
                    data-testid="talos-memory-kind"
                    :model-value="kind"
                    :items="kinds"
                    :aria-label="t('memory.kind')"
                    @update:model-value="chooseKind"
                />
            </label>

            <!-- Una riga proposta dal modello non ha uno dei quattro tipi.
                 Dirlo è l'unico modo perché chi salva sappia cosa sta
                 scegliendo al posto suo. -->
            <p
                v-if="kindWasMissing"
                data-testid="talos-memory-kind-missing"
                class="text-xs leading-5 text-[var(--talos-muted)]"
            >
                {{ t('memory.kindMissing') }}
            </p>

            <p v-if="error" role="alert" data-testid="talos-memory-new-error" class="text-xs text-[var(--talos-danger)]">
                {{ error }}
            </p>

            <!-- Due soli bottoni, e il verbo dice esattamente cosa succede. -->
            <div class="flex flex-wrap items-center justify-end gap-[var(--talos-space-card)]">
                <Button
                    type="button"
                    variant="outline"
                    data-testid="talos-memory-cancel"
                    class="talos-pressable talos-wave-host min-h-touch flex-1 rounded-[var(--talos-radius-control)] text-sm"
                    @click="cancel"
                    @pointerdown="onda.onPointerDown"
                >
                    {{ t('common.cancel') }}
                </Button>
                <Button
                    type="submit"
                    data-testid="talos-memory-save"
                    :disabled="!canSave"
                    class="talos-pressable talos-wave-host min-h-touch flex-1 rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] text-sm text-[var(--talos-accent-text)] disabled:opacity-50"
                    @pointerdown="onda.onPointerDown"
                >
                    {{ t('memory.save') }}
                </Button>
            </div>
        </form>
    </TalosMobileScreen>
</template>

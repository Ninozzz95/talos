<script setup lang="ts">
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import TalosMobileComposerModelPicker from '@/components/chat/TalosMobileComposerModelPicker.vue'
import TalosMobileEffortPicker from '@/components/chat/TalosMobileEffortPicker.vue'
import { Check } from '@lucide/vue'
import { computed } from 'vue'
import type { FiloRagionamento } from '@/lib/chat/pillolaRagionamento'
import type { TalosMobileEffortLevel } from '@/lib/mobileEffort'
import type {
    TalosMobileModelProfileView,
    TalosMobileRoutingProfileView,
} from '@/components/chat/mobileChatTypes'

/**
 * F4-#26 — dedicated "Model & reasoning" bottom drawer: the model catalog and
 * the reasoning controls (effort + extended thinking) in one organized sheet,
 * the same pattern as the "+" Add-to-chat drawer. Reuses the proven picker
 * components — this surface only re-homes them.
 *
 * ⭐⭐⭐ 2/9 — sezione "esecutore" opzionale (picker Planner, FASE K, piano
 * §15.6): additiva, mai passata da ChatScreen.vue (`executorModelProfiles`
 * assente → `showExecutorModel` resta falso → zero cambio per la chat
 * regolare). Riusa lo STESSO `TalosMobileComposerModelPicker` del catalogo
 * principale — stessa UX di ricerca, un secondo elenco invece di un
 * controllo nuovo da imparare.
 *
 * ⭐ Owner 27-28/10/2026, mockup del compositore approvato (versioni 6 e 7): il foglio torna «Modello e ragionamento».
 *   · I fornitori sono SCHEDE a pillola (`schede` del selettore); l'elenco mostra la scheda attiva.
 *   · Il ragionamento è il PIEDE fisso in fondo (`TalosMobileEffortPicker`, una riga): si vede sempre insieme ai modelli. Così si
 *     risolve anche l'anomalia 4 di Marco che aveva portato al J3 (24/10: il ragionamento finiva sotto l'elenco, fuori dallo
 *     schermo). Livelli, «Auto» e nota A9 restano quelli del J3 (`statoPillolaRagionamento`); la pillola nel compositore non c'è più:
 *     il chip unico dice «modello livello». Divergenza voluta dall'owner dal desktop, che tiene la pillola (annotata dal Desktop).
 *   · Altezza fissa (`alto` del foglio): cambiando scheda il foglio non salta.
 */
const props = withDefaults(defineProps<{
    modelProfiles: TalosMobileModelProfileView[]
    routingProfiles: TalosMobileRoutingProfileView[]
    selectedModelProfileId: string | null
    selectedRoutingProfileId: string | null
    thinking: boolean
    /** Il livello scelto nel lessico del telefono; `null` = nessuna scelta («Auto»). */
    selectedEffort?: string | null
    /** La mappa del filo (A9) quando chi monta il foglio ce l'ha. */
    reasoningWire?: FiloRagionamento | null
    /** Vero nella Chat: il ragionamento esteso è un comando a sé e segue il livello; nel Codice il livello basta. */
    thinkingSeparate?: boolean
    loadingModels?: boolean
    loadingRoutes?: boolean
    refreshingModels?: boolean
    discoveryProblems?: ReadonlyArray<{ message: string, detail?: string | null }>
    showExecutorModel?: boolean
    executorModelProfiles?: TalosMobileModelProfileView[]
    selectedExecutorModelProfileId?: string | null
    /**
     * ⛔ D-RM4-3 (Pad 20/10/2026): il Laboratorio modelli è del TELEFONO; il Codice di un PC non lo offre. Vero se manca: un booleano
     * assente Vue lo legge `false`, e senza il valore di serie chi monta il foglio senza dirlo perderebbe il Laboratorio.
     */
    showModelLab?: boolean
    /** Il modello che il Codice sta aprendo (22/10/2026): lo dice la sua riga del selettore. */
    openingModelProfileId?: string | null
    /** D-0147-UI-2: lo stato del piano ChatGPT per la riga del selettore principale (sul telefono); mai per quello dell'esecutore. */
    pianoChatgpt?: 'attivo' | 'limite' | null
}>(), { showModelLab: true, openingModelProfileId: null, pianoChatgpt: null, selectedEffort: null, reasoningWire: null, thinkingSeparate: true })

const emit = defineEmits<{
    close: []
    selectModelProfile: [profileId: string]
    selectModelRoutingProfile: [routingProfileId: string]
    selectThinking: [enabled: boolean]
    selectEffort: [level: TalosMobileEffortLevel]
    refreshModels: []
    openModelLab: []
    selectExecutorModelProfile: [profileId: string | null]
}>()

const profilo = computed(() => props.modelProfiles.find((p) => p.id === props.selectedModelProfileId) ?? null)
const supportsThinking = computed(() => profilo.value?.thinking_toggle ?? profilo.value?.supports_thinking ?? false)
</script>

<template>
    <TalosMobileComposerSheet :title="$t('chat.modelAndReasoning')" testid="talos-model-drawer" alto @close="emit('close')">
        <TalosMobileComposerModelPicker
            dentro-al-foglio
            schede
            :model-profiles="modelProfiles"
            :show-model-lab="showModelLab"
            :routing-profiles="routingProfiles"
            :selected-model-profile-id="selectedModelProfileId"
            :opening-model-profile-id="openingModelProfileId"
            :piano-chatgpt="pianoChatgpt"
            :selected-routing-profile-id="selectedRoutingProfileId"
            :loading-models="loadingModels"
            :loading-routes="loadingRoutes"
            :refreshing-models="refreshingModels"
            :discovery-problems="discoveryProblems"
            @select-model-profile="emit('selectModelProfile', $event)"
            @select-model-routing-profile="emit('selectModelRoutingProfile', $event)"
            @request-close="emit('close')"
            @refresh-models="emit('refreshModels')"
            @open-model-lab="emit('openModelLab')"
        />

        <div v-if="showExecutorModel" data-testid="talos-executor-model-section" class="border-t border-[var(--talos-border)] pt-3">
            <p class="px-1 pb-2 text-xs font-medium uppercase tracking-wide text-[var(--talos-muted)]">
                {{ $t('chat.executorModel') }}
            </p>
            <p class="px-1 pb-2 text-xs text-[var(--talos-muted)]">
                {{ $t('chat.executorModelHint') }}
            </p>
            <button
                type="button"
                data-testid="talos-executor-model-automatic"
                class="talos-pressable mb-2 flex min-h-touch w-full items-center justify-between rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)]"
                :aria-pressed="selectedExecutorModelProfileId === null"
                @click="emit('selectExecutorModelProfile', null)"
            >
                <span>{{ $t('chat.executorModelAutomatic') }}</span>
                <Check v-if="selectedExecutorModelProfileId === null" class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
            </button>
            <TalosMobileComposerModelPicker
                dentro-al-foglio
                :model-profiles="executorModelProfiles ?? []"
                :selected-model-profile-id="selectedExecutorModelProfileId"
                :loading-models="loadingModels"
                :refreshing-models="refreshingModels"
                :models-section-label="$t('chat.executorModelListLabel')"
                @select-model-profile="emit('selectExecutorModelProfile', $event)"
                @request-close="emit('close')"
                @refresh-models="emit('refreshModels')"
            />
        </div>

        <!-- IL PIEDE: il ragionamento, una fascia fissa del foglio FUORI dalla parte che scorre (owner 28/10/2026: da sticky dentro il
             corpo, sul telefono la lista passava sotto di lui), sempre visibile insieme ai modelli -->
        <template #piede>
            <div data-testid="talos-model-sheet-foot" class="talos-model-sheet-foot">
                <TalosMobileEffortPicker
                    :profile="profilo"
                    :selected-effort="selectedEffort"
                    :wire="reasoningWire"
                    :thinking="thinking"
                    :supports-thinking="supportsThinking"
                    :thinking-separate="thinkingSeparate"
                    @select-effort="emit('selectEffort', $event)"
                    @select-thinking="emit('selectThinking', $event)"
                />
            </div>
        </template>
    </TalosMobileComposerSheet>
</template>

<style scoped>
/* una fascia del foglio sotto la parte che scorre: il filo e l'ombra dicono che la lista continua sopra */
.talos-model-sheet-foot {
    padding: 0.25rem 1rem 0;
    border-top: 1px solid var(--talos-border); background: var(--talos-window-bg);
    box-shadow: 0 -0.75rem 1rem -0.75rem rgb(0 0 0 / 0.35);
}
</style>

<script setup lang="ts">
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import TalosMobileComposerModelPicker from '@/components/chat/TalosMobileComposerModelPicker.vue'
import TalosThemedSwitch from '@/components/talos/ui/TalosThemedSwitch.vue'
import { useSettingsStore } from '@/stores/settings'
import { Check } from '@lucide/vue'
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
 * ⭐ J3 (24/10/2026, owner; anomalia 4 di Marco: il ragionamento finiva sotto l'elenco dei modelli, fuori dallo schermo): il foglio
 * è solo «Modello», SENZA cursore del ragionamento — il livello sta nella pillola sua del compositore (`TalosMobileReasoningPill`),
 * come il desktop (`c6d1cbff2`, «Model» senza cursore). Per i modelli che un livello non lo ricevono (la pillola non c'è) restano
 * qui la riga che lo dice (`reasoningNote`, A9 `effortNotSent`) e «Ragionamento esteso», come il desktop vi tiene «Mostra
 * ragionamento».
 */
withDefaults(defineProps<{
    modelProfiles: TalosMobileModelProfileView[]
    routingProfiles: TalosMobileRoutingProfileView[]
    selectedModelProfileId: string | null
    selectedRoutingProfileId: string | null
    thinking: boolean
    /** «Ragionamento esteso» qui: solo per un modello senza la pillola del ragionamento. */
    showThinking?: boolean
    /** La riga A9 per un modello senza la pillola; vuota = niente. */
    reasoningNote?: string
    /** J3-bis: «Mostra ragionamento» (sola vista) qui, per un modello senza la pillola (decisione 3 dell'owner). */
    showReasoningSwitch?: boolean
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
}>(), { showModelLab: true, openingModelProfileId: null, showThinking: false, reasoningNote: '', showReasoningSwitch: false })

const emit = defineEmits<{
    close: []
    selectModelProfile: [profileId: string]
    selectModelRoutingProfile: [routingProfileId: string]
    selectThinking: [enabled: boolean]
    refreshModels: []
    openModelLab: []
    selectExecutorModelProfile: [profileId: string | null]
}>()

const settings = useSettingsStore()
</script>

<template>
    <TalosMobileComposerSheet :title="$t('chat.modelSheetTitle')" testid="talos-model-drawer" @close="emit('close')">
        <TalosMobileComposerModelPicker
            :model-profiles="modelProfiles"
            :show-model-lab="showModelLab"
            :routing-profiles="routingProfiles"
            :selected-model-profile-id="selectedModelProfileId"
            :opening-model-profile-id="openingModelProfileId"
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

        <div
            v-if="reasoningNote || showThinking || showReasoningSwitch"
            data-testid="talos-model-sheet-reasoning"
            class="space-y-2 border-t border-[var(--talos-border)] pt-3"
        >
            <p v-if="reasoningNote" data-testid="talos-model-sheet-reasoning-note" class="px-1 text-2xs leading-4 text-[var(--talos-muted)]">
                {{ reasoningNote }}
            </p>
            <div
                v-if="showThinking"
                class="flex min-h-touch items-center justify-between gap-3 px-1 text-sm text-[var(--talos-text)]"
            >
                <span class="min-w-0">{{ $t('chat.extendedThinking') }}</span>
                <TalosThemedSwitch
                    test-id="talos-mobile-thinking-toggle"
                    :model-value="thinking"
                    :aria-label="$t('chat.extendedThinking')"
                    @update:model-value="emit('selectThinking', $event)"
                />
            </div>
            <div
                v-if="showReasoningSwitch"
                class="flex min-h-touch items-center justify-between gap-3 px-1 text-sm text-[var(--talos-text)]"
            >
                <span class="min-w-0">{{ $t('chat.showReasoning') }}</span>
                <TalosThemedSwitch
                    test-id="talos-model-sheet-show-reasoning"
                    :model-value="settings.state.shell.show_reasoning !== false"
                    :aria-label="$t('chat.showReasoning')"
                    @update:model-value="void settings.setShell({ show_reasoning: $event })"
                />
            </div>
        </div>

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
    </TalosMobileComposerSheet>
</template>

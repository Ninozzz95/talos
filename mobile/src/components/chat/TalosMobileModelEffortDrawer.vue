<script setup lang="ts">
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import TalosMobileComposerModelPicker from '@/components/chat/TalosMobileComposerModelPicker.vue'
import TalosMobileEffortPicker from '@/components/chat/TalosMobileEffortPicker.vue'
import { Check } from '@lucide/vue'
import type {
    TalosMobileModelProfileView,
    TalosMobileRoutingProfileView,
} from '@/components/chat/mobileChatTypes'
import type { TalosMobileEffortLevel } from '@/lib/mobileEffort'

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
 */
defineProps<{
    modelProfiles: TalosMobileModelProfileView[]
    routingProfiles: TalosMobileRoutingProfileView[]
    selectedModelProfileId: string | null
    selectedRoutingProfileId: string | null
    selectedEffort: string
    thinking: boolean
    supportsThinking: boolean
    effortLevels: string[]
    loadingModels?: boolean
    loadingRoutes?: boolean
    refreshingModels?: boolean
    discoveryProblems?: ReadonlyArray<{ message: string, detail?: string | null }>
    showExecutorModel?: boolean
    executorModelProfiles?: TalosMobileModelProfileView[]
    selectedExecutorModelProfileId?: string | null
}>()

const emit = defineEmits<{
    close: []
    selectModelProfile: [profileId: string]
    selectModelRoutingProfile: [routingProfileId: string]
    selectEffort: [level: TalosMobileEffortLevel]
    selectThinking: [enabled: boolean]
    refreshModels: []
    openModelLab: []
    selectExecutorModelProfile: [profileId: string | null]
}>()
</script>

<template>
    <TalosMobileComposerSheet :title="$t('chat.modelAndReasoning')" testid="talos-model-drawer" @close="emit('close')">
        <TalosMobileComposerModelPicker
            :model-profiles="modelProfiles"
            :routing-profiles="routingProfiles"
            :selected-model-profile-id="selectedModelProfileId"
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

        <div v-if="effortLevels.length || supportsThinking" class="border-t border-[var(--talos-border)] pt-3">
            <TalosMobileEffortPicker
                :effort-levels="effortLevels"
                :selected-effort="selectedEffort"
                :supports-thinking="supportsThinking"
                :thinking="thinking"
                @select-effort="emit('selectEffort', $event)"
                @select-thinking="emit('selectThinking', $event)"
                @request-close="emit('close')"
            />
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

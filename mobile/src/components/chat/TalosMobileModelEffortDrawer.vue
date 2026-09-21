<script setup lang="ts">
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import TalosMobileComposerModelPicker from '@/components/chat/TalosMobileComposerModelPicker.vue'
import TalosMobileEffortPicker from '@/components/chat/TalosMobileEffortPicker.vue'
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
}>()

const emit = defineEmits<{
    close: []
    selectModelProfile: [profileId: string]
    selectModelRoutingProfile: [routingProfileId: string]
    selectEffort: [level: TalosMobileEffortLevel]
    selectThinking: [enabled: boolean]
    refreshModels: []
    openModelLab: []
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
    </TalosMobileComposerSheet>
</template>

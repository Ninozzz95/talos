<script setup lang="ts">
import { computed } from 'vue'
import { Loader2 } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Select from '../../ui/Select.vue'
import TalosPromptEnhancerPopover from '../chat/TalosPromptEnhancerPopover.vue'
import TalosSlimComposer from '../chat/TalosSlimComposer.vue'
import type { TalosPromptEnhancementResult } from '../../../composables/useTalosPromptEnhancement'
import type { TalosCommand, TalosContextSet, TalosModelProfile, TalosModelRoutingProfile } from '../../../lib/talosTypes'

const props = defineProps<{
    prompt: string
    commands: TalosCommand[]
    canSend: boolean
    sending: boolean
    statusText: string
    modelLabel: string
    contextLabel: string
    temporaryMode: boolean
    sendDisabledReason: string
    enhancerDisabledReason: string
    modelPopoverOpen: boolean
    contextPopoverOpen: boolean
    modelProfiles: TalosModelProfile[]
    modelRoutingProfiles: TalosModelRoutingProfile[]
    contextSets: TalosContextSet[]
    selectedModelProfileId: string
    selectedModelRoutingProfileId: string
    selectedContextSetId: string
    selectedContextSet: TalosContextSet | null
    loadingModelProfiles: boolean
    loadingModelRoutingProfiles: boolean
    loadingContextSets: boolean
    promptEnhancementResult: TalosPromptEnhancementResult | null
    enhancingPrompt: boolean
    promptEnhancementError: string | null
    visibility: Record<string, boolean>
}>()

const emit = defineEmits<{
    updatePrompt: [prompt: string]
    send: []
    openModel: []
    openContext: []
    openSettings: []
    toggleTemporary: []
    enhance: []
    slashCommand: [id: TalosCommand['id']]
    selectModelProfile: [profileId: string]
    selectModelRoutingProfile: [profileId: string]
    selectContextSet: [contextSetId: string]
    refreshModelAndContext: []
    openModelLab: []
    openLibrary: []
    replacePromptWithEnhanced: []
    insertEnhancedPromptBelow: []
    clearPromptEnhancement: []
}>()

const composerPrompt = computed({
    get: () => props.prompt,
    set: (value: string) => emit('updatePrompt', value),
})
</script>

<template>
    <div class="pointer-events-none fixed inset-x-0 bottom-7 z-40 px-4 lg:left-[var(--talos-rail-width)] lg:px-6">
        <div class="relative">
            <div
                v-if="modelPopoverOpen"
                data-testid="talos-model-popover"
                class="talos-composer-popover talos-model-popover pointer-events-auto absolute bottom-full left-1/2 mb-3 w-full max-w-[420px] -translate-x-1/2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] p-3 shadow-xl"
            >
                <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Model profile</div>
                <label class="sr-only" for="talos-workspace-model-profile">Server-side model profile</label>
                <Select
                    id="talos-workspace-model-profile"
                    :model-value="selectedModelProfileId"
                    class="mt-2"
                    :disabled="loadingModelProfiles || !modelProfiles.length"
                    aria-label="Server-side model profile"
                    @update:model-value="(value) => emit('selectModelProfile', String(value))"
                >
                    <option value="">{{ loadingModelProfiles ? 'Loading profiles' : 'Choose profile' }}</option>
                    <option
                        v-for="profile in modelProfiles"
                        :key="profile.id"
                        :value="profile.id"
                        :disabled="profile.status === 'disabled' || !profile.has_secret"
                    >
                        {{ profile.display_name }} - {{ profile.model }} - {{ profile.status }}
                    </option>
                </Select>
                <div class="mt-3 text-xs font-semibold uppercase text-[var(--talos-muted)]">Routing profile</div>
                <label class="sr-only" for="talos-workspace-model-routing-profile">Model routing profile</label>
                <Select
                    id="talos-workspace-model-routing-profile"
                    :model-value="selectedModelRoutingProfileId"
                    class="mt-2"
                    :disabled="loadingModelRoutingProfiles || !modelRoutingProfiles.length"
                    aria-label="Model routing profile"
                    @update:model-value="(value) => emit('selectModelRoutingProfile', String(value))"
                >
                    <option value="">{{ loadingModelRoutingProfiles ? 'Loading routes' : 'No routing profile' }}</option>
                    <option
                        v-for="profile in modelRoutingProfiles"
                        :key="profile.id"
                        :value="profile.id"
                        :disabled="profile.status !== 'enabled' || profile.lanes.length === 0"
                    >
                        {{ profile.name }} - {{ profile.lanes.length }} lanes - {{ profile.status }}
                    </option>
                </Select>
                <div class="mt-3 flex justify-between gap-2">
                    <Button size="sm" variant="ghost" @click="emit('refreshModelAndContext')">Refresh</Button>
                    <Button size="sm" @click="emit('openModelLab')">Model Lab</Button>
                </div>
            </div>

            <div
                v-if="contextPopoverOpen"
                data-testid="talos-context-popover"
                class="talos-composer-popover talos-context-popover pointer-events-auto absolute bottom-full left-1/2 mb-3 w-full max-w-[420px] -translate-x-1/2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] p-3 shadow-xl"
            >
                <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Grounding context</div>
                <label class="sr-only" for="talos-workspace-context-set">Grounding context set</label>
                <Select
                    id="talos-workspace-context-set"
                    :model-value="selectedContextSetId"
                    class="mt-2"
                    :disabled="loadingContextSets || !contextSets.length"
                    aria-label="Grounding context set"
                    @update:model-value="(value) => emit('selectContextSet', String(value))"
                >
                    <option value="">{{ loadingContextSets ? 'Loading context' : 'No grounding context' }}</option>
                    <option
                        v-for="contextSet in contextSets"
                        :key="contextSet.id"
                        :value="contextSet.id"
                        :disabled="contextSet.status !== 'available' && contextSet.status !== 'draft'"
                    >
                        {{ contextSet.name }} - {{ contextSet.status }} - {{ contextSet.sources_count ?? contextSet.sources?.length ?? 0 }} sources
                    </option>
                </Select>
                <p v-if="selectedContextSet" class="mt-2 text-xs leading-5 text-[var(--talos-muted)]">
                    Uploaded content is injected server-side as untrusted data.
                </p>
                <div class="mt-3 flex justify-between gap-2">
                    <Button size="sm" variant="ghost" @click="emit('refreshModelAndContext')">Refresh</Button>
                    <Button size="sm" @click="emit('openLibrary')">Library</Button>
                </div>
            </div>

            <div
                v-if="promptEnhancementResult"
                data-testid="talos-enhancement-popover"
                class="talos-composer-popover pointer-events-auto absolute bottom-full left-1/2 mb-3 w-full max-w-[560px] -translate-x-1/2"
            >
                <TalosPromptEnhancerPopover
                    :result="promptEnhancementResult"
                    @replace="emit('replacePromptWithEnhanced')"
                    @insert="emit('insertEnhancedPromptBelow')"
                    @cancel="emit('clearPromptEnhancement')"
                />
            </div>

            <div
                v-else-if="enhancingPrompt || promptEnhancementError"
                data-testid="talos-enhancement-status-popover"
                class="talos-composer-popover pointer-events-auto absolute bottom-full left-1/2 mb-3 w-full max-w-[560px] -translate-x-1/2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] p-3 text-sm text-[var(--talos-text)] shadow-xl"
            >
                <div v-if="enhancingPrompt" class="flex items-center gap-2 text-[var(--talos-muted)]">
                    <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                    Enhancing prompt
                </div>
                <div v-else class="flex items-start justify-between gap-3">
                    <span>{{ promptEnhancementError }}</span>
                    <Button size="sm" variant="ghost" @click="emit('clearPromptEnhancement')">Cancel</Button>
                </div>
            </div>

            <TalosSlimComposer
                v-model:prompt="composerPrompt"
                :commands="commands"
                :can-send="canSend"
                :sending="sending"
                :status-text="statusText"
                :model-label="modelLabel"
                :context-label="contextLabel"
                :temporary-mode="temporaryMode"
                :send-disabled-reason="sendDisabledReason"
                :enhancer-disabled-reason="enhancerDisabledReason"
                :visibility="visibility"
                @send="emit('send')"
                @open-model="emit('openModel')"
                @open-context="emit('openContext')"
                @open-settings="emit('openSettings')"
                @toggle-temporary="emit('toggleTemporary')"
                @enhance="emit('enhance')"
                @slash-command="emit('slashCommand', $event)"
            />
        </div>
    </div>
</template>

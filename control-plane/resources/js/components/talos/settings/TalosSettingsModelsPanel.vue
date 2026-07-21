<script setup lang="ts">
import { computed } from 'vue'
import Button from '../../ui/Button.vue'
import TalosThemedSelect from '../ui/TalosThemedSelect.vue'
import TalosProviderIcon from '../models/TalosProviderIcon.vue'
import { talosModelProfileIsCallable } from '../../../lib/talosProviders'
import type { TalosContextSet, TalosModelProfile } from '../../../lib/talosTypes'

const props = defineProps<{
    modelProfiles: TalosModelProfile[]
    contextSets: TalosContextSet[]
    selectedModelProfileId: string
    selectedContextSetId: string
    activeModelProfile: TalosModelProfile | null
    activeContextSet: TalosContextSet | null
    loadingSettings: boolean
}>()

const emit = defineEmits<{
    selectModel: [id: string]
    selectContext: [id: string]
    openModule: [id: string]
}>()

const modelProfileOptions = computed(() => props.modelProfiles.map((profile) => ({
    value: profile.id,
    label: `${profile.display_name} - ${profile.model} - ${profile.status}`,
    disabled: !talosModelProfileIsCallable(profile),
})))
const contextSetOptions = computed(() => props.contextSets.map((contextSet) => ({
    value: contextSet.id,
    label: `${contextSet.name} - ${contextSet.status}`,
    disabled: contextSet.status !== 'available' && contextSet.status !== 'draft',
})))
</script>

<template>
    <div class="grid gap-3 md:grid-cols-2">
        <label class="block">
            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Default model</span>
            <TalosThemedSelect
                class="mt-2"
                :model-value="selectedModelProfileId"
                :items="modelProfileOptions"
                none-label="Choose profile"
                aria-label="Default model profile"
                :disabled="loadingSettings || !modelProfiles.length"
                @update:model-value="(value) => emit('selectModel', value)"
            />
        </label>
        <label class="block">
            <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Default context</span>
            <TalosThemedSelect
                class="mt-2"
                :model-value="selectedContextSetId"
                :items="contextSetOptions"
                none-label="No grounding context"
                aria-label="Default grounding context"
                :disabled="loadingSettings || !contextSets.length"
                @update:model-value="(value) => emit('selectContext', value)"
            />
        </label>
    </div>
    <div class="grid gap-3 md:grid-cols-2">
        <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
            <div class="flex items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
                <TalosProviderIcon v-if="activeModelProfile" :provider="activeModelProfile.provider" class="h-7 w-7" />
                <span>Active model</span>
            </div>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                {{ activeModelProfile ? `${activeModelProfile.display_name} - ${activeModelProfile.model}` : 'No default model selected.' }}
            </p>
            <Button class="mt-3" size="sm" variant="secondary" @click="emit('openModule', 'model_lab')">Open Model Lab</Button>
        </div>
        <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
            <div class="text-sm font-semibold text-[var(--talos-text)]">Active context</div>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                {{ activeContextSet ? `${activeContextSet.name} - ${activeContextSet.status}` : 'No grounding context selected.' }}
            </p>
            <Button class="mt-3" size="sm" variant="secondary" @click="emit('openModule', 'library')">Open Library</Button>
        </div>
    </div>
</template>

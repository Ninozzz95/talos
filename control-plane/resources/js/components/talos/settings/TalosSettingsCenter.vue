<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Loader2, Save } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Card from '../../ui/Card.vue'
import Select from '../../ui/Select.vue'
import type { TalosContextSet, TalosModelProfile } from '../../../lib/talosTypes'
import { useTalosSettings } from '../../../composables/useTalosSettings'

const props = defineProps<{
    modelProfiles: TalosModelProfile[]
    contextSets: TalosContextSet[]
    selectedModelProfileId: string
    selectedContextSetId: string
}>()

const emit = defineEmits<{
    selectModel: [id: string]
    selectContext: [id: string]
    saved: []
}>()

const {
    settings,
    loadingSettings,
    savingSettings,
    settingsError,
    settingsSavedMessage,
    loadSettings,
    updateSettings,
} = useTalosSettings()

const selectedTheme = computed(() => {
    const theme = settings.value?.preferences?.theme
    return theme === 'light' ? 'light' : 'dark'
})

async function saveWorkspaceDefaults() {
    const nextSettings = await updateSettings({
        default_model_profile_id: props.selectedModelProfileId || null,
        default_context_set_id: props.selectedContextSetId || null,
        preferences: {
            ...(settings.value?.preferences ?? {}),
            theme: selectedTheme.value,
        },
    })

    if (nextSettings.default_model_profile_id) {
        emit('selectModel', nextSettings.default_model_profile_id)
    }

    if (nextSettings.default_context_set_id) {
        emit('selectContext', nextSettings.default_context_set_id)
    }

    emit('saved')
}

onMounted(async () => {
    const loaded = await loadSettings().catch(() => null)
    if (loaded?.default_model_profile_id) {
        emit('selectModel', loaded.default_model_profile_id)
    }
    if (loaded?.default_context_set_id) {
        emit('selectContext', loaded.default_context_set_id)
    }
})
</script>

<template>
    <div class="space-y-3">
        <Card>
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h3 class="text-base font-semibold text-[var(--talos-text)]">Settings Center</h3>
                    <p class="mt-1 text-sm leading-6 text-[var(--talos-muted)]">
                        Workspace preferences from /api/talos/settings.
                    </p>
                </div>
                <Button size="sm" :disabled="savingSettings" @click="saveWorkspaceDefaults">
                    <Loader2 v-if="savingSettings" class="h-4 w-4 animate-spin" />
                    <Save v-else class="h-4 w-4" />
                    Save settings
                </Button>
            </div>

            <div v-if="settingsError" class="mt-3 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                {{ settingsError }}
            </div>
            <div v-if="settingsSavedMessage" class="mt-3 rounded-md border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] px-3 py-2 text-sm text-[var(--talos-text)]">
                {{ settingsSavedMessage }}
            </div>

            <div class="mt-4 grid gap-3 md:grid-cols-2">
                <label class="block">
                    <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Default model</span>
                    <Select
                        class="mt-2"
                        :model-value="selectedModelProfileId"
                        aria-label="Default model profile"
                        :disabled="loadingSettings || !modelProfiles.length"
                        @update:model-value="(value) => emit('selectModel', String(value))"
                    >
                        <option value="">Choose profile</option>
                        <option
                            v-for="profile in modelProfiles"
                            :key="profile.id"
                            :value="profile.id"
                            :disabled="profile.status === 'disabled' || !profile.has_secret"
                        >
                            {{ profile.display_name }} - {{ profile.model }} - {{ profile.status }}
                        </option>
                    </Select>
                </label>
                <label class="block">
                    <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Default context</span>
                    <Select
                        class="mt-2"
                        :model-value="selectedContextSetId"
                        aria-label="Default grounding context"
                        :disabled="loadingSettings || !contextSets.length"
                        @update:model-value="(value) => emit('selectContext', String(value))"
                    >
                        <option value="">No grounding context</option>
                        <option
                            v-for="contextSet in contextSets"
                            :key="contextSet.id"
                            :value="contextSet.id"
                            :disabled="contextSet.status !== 'available' && contextSet.status !== 'draft'"
                        >
                            {{ contextSet.name }} - {{ contextSet.status }}
                        </option>
                    </Select>
                </label>
            </div>
        </Card>

        <Card>
            <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Security boundary</div>
            <p class="mt-2 text-sm leading-6 text-[var(--talos-muted)]">
                Provider secrets stay in server-side model profiles. This surface stores only safe workspace defaults and UI preferences.
            </p>
        </Card>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Button from '../../ui/Button.vue'
import TalosThemedSelect from '../ui/TalosThemedSelect.vue'
import TalosProviderIcon from '../models/TalosProviderIcon.vue'
import { talosModelProfileIsCallable } from '../../../lib/talosProviders'
import type {
    TalosContextSet,
    TalosModelProfile,
    TalosPromptCacheMode,
    TalosPromptCachePreferences,
} from '../../../lib/talosTypes'

const props = defineProps<{
    modelProfiles: TalosModelProfile[]
    contextSets: TalosContextSet[]
    selectedModelProfileId: string
    selectedContextSetId: string
    activeModelProfile: TalosModelProfile | null
    activeContextSet: TalosContextSet | null
    promptCache: TalosPromptCachePreferences
    loadingSettings: boolean
}>()

const emit = defineEmits<{
    selectModel: [id: string]
    selectContext: [id: string]
    updatePromptCache: [value: TalosPromptCachePreferences]
    openModule: [id: string]
}>()

const CACHE_MODE_LABELS: Readonly<Record<TalosPromptCacheMode, string>> = Object.freeze({
    provider_default: 'Provider default',
    automatic: 'Automatic',
    explicit: 'Explicit stable prefix',
    disabled: 'Disabled',
})

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
const cacheCapability = computed(() => props.activeModelProfile?.prompt_cache_capability ?? null)
const cacheSupported = computed(() => (
    cacheCapability.value?.supported === true
    && cacheCapability.value.modes.length > 0
))
const cacheModeOptions = computed(() => (
    cacheCapability.value?.modes.map((mode) => ({
        value: mode,
        label: CACHE_MODE_LABELS[mode],
    })) ?? []
))
const effectiveCacheMode = computed<TalosPromptCacheMode>(() => {
    const modes = cacheCapability.value?.modes ?? []
    if (modes.includes(props.promptCache.mode)) {
        return props.promptCache.mode
    }

    return modes.includes('provider_default') ? 'provider_default' : (modes[0] ?? 'provider_default')
})
const cacheTtlOptions = computed(() => (
    cacheCapability.value?.ttls.map((ttl) => ({
        value: ttl,
        label: ttl,
    })) ?? []
))
const effectiveCacheTtl = computed(() => (
    props.promptCache.ttl && cacheCapability.value?.ttls.includes(props.promptCache.ttl)
        ? props.promptCache.ttl
        : ''
))
const cacheTtlDisabled = computed(() => (
    props.loadingSettings
    || !cacheSupported.value
    || cacheTtlOptions.value.length === 0
    || effectiveCacheMode.value === 'provider_default'
    || effectiveCacheMode.value === 'disabled'
))
const savedCacheModeUnsupported = computed(() => (
    cacheSupported.value
    && !cacheCapability.value?.modes.includes(props.promptCache.mode)
))

function updateCacheMode(value: string) {
    const capability = cacheCapability.value
    if (!capability?.supported || !capability.modes.includes(value as TalosPromptCacheMode)) {
        return
    }

    const mode = value as TalosPromptCacheMode
    const ttl = mode === 'provider_default' || mode === 'disabled'
        ? null
        : (props.promptCache.ttl && capability.ttls.includes(props.promptCache.ttl) ? props.promptCache.ttl : null)
    emit('updatePromptCache', { mode, ttl })
}

function updateCacheTtl(value: string) {
    const capability = cacheCapability.value
    const ttl = value === '' ? null : value
    if (
        !capability?.supported
        || (ttl !== null && !capability.ttls.includes(ttl as Exclude<TalosPromptCachePreferences['ttl'], null>))
    ) {
        return
    }

    emit('updatePromptCache', {
        mode: effectiveCacheMode.value,
        ttl: ttl as TalosPromptCachePreferences['ttl'],
    })
}
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
    <section
        data-testid="talos-prompt-cache-settings"
        class="border-y border-[var(--talos-border)] py-3"
        aria-labelledby="talos-prompt-cache-heading"
    >
        <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
                <h4 id="talos-prompt-cache-heading" class="text-sm font-semibold text-[var(--talos-text)]">Prompt cache</h4>
                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                    Provider-backed reuse for stable prompt prefixes.
                </p>
            </div>
            <span
                v-if="cacheCapability?.minimum_input_tokens"
                class="text-xs text-[var(--talos-muted)]"
            >
                Minimum {{ cacheCapability.minimum_input_tokens.toLocaleString() }} input tokens
            </span>
        </div>

        <p
            v-if="!activeModelProfile"
            class="mt-3 text-xs text-[var(--talos-muted)]"
            role="status"
        >
            Select a model to inspect cache support.
        </p>
        <p
            v-else-if="!cacheSupported"
            class="mt-3 text-xs text-[var(--talos-muted)]"
            role="status"
        >
            Unavailable for this model.
        </p>
        <div v-else class="mt-3 grid gap-3 md:grid-cols-2">
            <label class="block">
                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Mode</span>
                <TalosThemedSelect
                    class="mt-2"
                    :model-value="effectiveCacheMode"
                    :items="cacheModeOptions"
                    aria-label="Prompt cache mode"
                    :disabled="loadingSettings"
                    @update:model-value="updateCacheMode"
                />
            </label>
            <label class="block">
                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Retention</span>
                <TalosThemedSelect
                    class="mt-2"
                    :model-value="effectiveCacheTtl"
                    :items="cacheTtlOptions"
                    none-label="Provider default TTL"
                    aria-label="Prompt cache TTL"
                    :disabled="cacheTtlDisabled"
                    @update:model-value="updateCacheTtl"
                />
            </label>
        </div>
        <p
            v-if="savedCacheModeUnsupported"
            class="mt-2 text-xs text-[var(--talos-warning)]"
            role="status"
        >
            The saved policy is not supported by this model and will use the provider default.
        </p>
    </section>
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

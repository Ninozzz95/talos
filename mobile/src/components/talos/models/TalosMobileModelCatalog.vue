<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useTalosI18n } from '@/i18n'
import { talosTranslatableErrorMessage } from '@/i18n/uiErrors'
import { CheckCircle2, CircleAlert, Eye, EyeOff, Gauge, Search, Sparkles } from '@lucide/vue'
import TalosMobileProviderIcon from '@/components/models/TalosMobileProviderIcon.vue'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import { TALOS_MOBILE_PROVIDERS, talosMobileProviderById } from '@/lib/mobileProviders'
import { useChatController } from '@/stores/chatController'

const controller = useChatController()
const { t, locale } = useTalosI18n()
const search = ref('')
const providerFilter = ref('')
const busyProfile = ref<string | null>(null)
const error = ref('')
const displayDrafts = reactive<Record<string, string>>({})
const providerItems = TALOS_MOBILE_PROVIDERS
    .filter((provider) => provider.id !== 'unknown' && provider.configurable)
    .map((provider) => ({ value: provider.id, label: provider.label }))

watch(() => controller.profiles.value, (profiles) => {
    for (const profile of profiles) {
        if (!(profile.id in displayDrafts)) displayDrafts[profile.id] = profile.display_name
    }
}, { immediate: true, deep: true })

const filteredProfiles = computed(() => {
    const needle = search.value.trim().toLocaleLowerCase()
    return controller.profiles.value.filter((profile) => {
        if (providerFilter.value && profile.provider !== providerFilter.value) return false
        if (!needle) return true
        return [profile.display_name, profile.model, profile.provider]
            .some((value) => value.toLocaleLowerCase().includes(needle))
    })
})

function capabilityList(profile: (typeof controller.profiles.value)[number], key: string): string[] {
    const value = profile.capabilities?.[key]
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function contextLabel(profile: (typeof controller.profiles.value)[number]): string | null {
    const value = profile.capabilities?.context_length
    return typeof value === 'number' && Number.isFinite(value)
        ? t('models.context', { value: value.toLocaleString(locale.value) })
        : null
}

function statusLabel(profile: (typeof controller.profiles.value)[number]): string {
    if (profile.status === 'healthy') return t('models.probePassed')
    if (profile.status === 'failed') return t('models.probeFailed')
    if (profile.status === 'disabled') return t('models.notChatCompatible')
    return t('models.notTested')
}

function modalityLabel(modality: string): string {
    const known: Record<string, string> = {
        text: 'chat.modalityText',
        image: 'chat.modalityImage',
        audio: 'chat.modalityAudio',
        video: 'chat.modalityVideo',
        file: 'chat.modalityFile',
    }
    return known[modality] ? t(known[modality]) : modality
}

async function run(profileId: string, action: () => Promise<unknown>): Promise<void> {
    if (busyProfile.value) return
    busyProfile.value = profileId
    error.value = ''
    try {
        await action()
    } catch (cause) {
        error.value = talosTranslatableErrorMessage(cause, t)
            ?? (cause instanceof Error ? cause.message : t('models.operationFailed'))
    } finally {
        busyProfile.value = null
    }
}

async function saveDisplayName(profileId: string): Promise<void> {
    await run(profileId, () => controller.setModelDisplayName(profileId, displayDrafts[profileId] ?? ''))
}
</script>

<template>
    <div class="min-w-0 space-y-[var(--talos-space-section)]">
        <div class="grid min-w-0 gap-[var(--talos-space-inline)] sm:grid-cols-[minmax(0,1fr)_13rem]">
            <label class="relative min-w-0">
                <span class="sr-only">{{ $t('models.searchCatalog') }}</span>
                <Search class="pointer-events-none absolute left-[var(--talos-space-control)] top-1/2 size-[var(--talos-icon-size)] -translate-y-1/2 text-[var(--talos-muted)]" aria-hidden="true" />
                <input v-model="search" type="search" :aria-label="$t('models.searchCatalog')" :placeholder="$t('models.searchModels')" class="h-[var(--talos-touch-target)] w-full rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-input)] pl-[calc(var(--talos-icon-size)+var(--talos-space-control)*2)] pr-[var(--talos-space-control)] text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]">
            </label>
            <TalosThemedSelect v-model="providerFilter" :items="providerItems" :aria-label="$t('models.filterProvider')" :none-label="$t('models.allProviders')" />
        </div>

        <div class="flex items-center justify-between gap-[var(--talos-space-section)] text-xs text-[var(--talos-muted)]">
            <span role="status">{{ $t('models.catalogCount', { shown: filteredProfiles.length, total: controller.profiles.value.length }) }}</span>
            <span>{{ $t('models.metadataSeparation') }}</span>
        </div>

        <p v-if="error" role="alert" class="rounded-[var(--talos-radius-control)] border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-[var(--talos-space-control)] text-sm text-[var(--talos-text)]">{{ error }}</p>

        <div v-if="filteredProfiles.length" class="grid min-w-0 gap-[var(--talos-space-section)] lg:grid-cols-2">
            <article
                v-for="profile in filteredProfiles"
                :key="profile.id"
                data-model-card
                :data-model-id="profile.id"
                class="min-w-0 overflow-hidden rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)]"
            >
                <header class="flex min-w-0 items-start gap-[var(--talos-space-inline)]">
                    <TalosMobileProviderIcon :provider="profile.provider" class="mt-[calc(var(--talos-space-inline)/2)] size-[calc(var(--talos-icon-size)*1.75)] shrink-0" />
                    <div class="min-w-0 flex-1">
                        <h5 class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ profile.display_name }}</h5>
                        <p class="truncate font-mono text-2xs text-[var(--talos-muted)]">{{ profile.model }}</p>
                    </div>
                    <span class="shrink-0 rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-inline)] py-[calc(var(--talos-space-inline)/2)] text-3xs font-semibold uppercase text-[var(--talos-muted)]">
                        {{ talosMobileProviderById(profile.provider).shortLabel }}
                    </span>
                </header>

                <div class="mt-[var(--talos-space-section)] flex flex-wrap gap-[var(--talos-space-inline)] text-3xs font-medium text-[var(--talos-muted)]">
                    <span class="rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-inline)] py-[calc(var(--talos-space-inline)/2)]">
                        {{ profile.capabilities?.provenance === 'declared' ? $t('models.declaredCapabilities') : $t('models.observedMetadata') }}
                    </span>
                    <span v-if="contextLabel(profile)" class="rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-inline)] py-[calc(var(--talos-space-inline)/2)]">{{ contextLabel(profile) }}</span>
                    <span v-for="modality in capabilityList(profile, 'input_modalities')" :key="`in-${modality}`" class="rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-inline)] py-[calc(var(--talos-space-inline)/2)]">{{ $t('models.modalityInput', { modality: modalityLabel(modality) }) }}</span>
                    <span v-if="profile.supports_thinking" class="rounded-[var(--talos-radius-control)] border border-[var(--talos-accent-border)] px-[var(--talos-space-inline)] py-[calc(var(--talos-space-inline)/2)] text-[var(--talos-accent)]">{{ $t('models.reasoning') }}</span>
                </div>

                <div class="mt-[var(--talos-space-section)] flex items-center gap-[var(--talos-space-inline)] text-xs" :class="profile.status === 'failed' ? 'text-[var(--talos-danger)]' : 'text-[var(--talos-muted)]'">
                    <CheckCircle2 v-if="profile.status === 'healthy'" class="size-[var(--talos-icon-size)] text-[var(--talos-success)]" aria-hidden="true" />
                    <CircleAlert v-else class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                    {{ statusLabel(profile) }}
                </div>

                <div class="mt-[var(--talos-space-section)] grid grid-cols-2 gap-[var(--talos-space-inline)]">
                    <button type="button" :aria-label="$t('models.useAsDefault', { name: profile.display_name })" :aria-pressed="controller.selectedModelId.value === profile.id" :disabled="profile.status === 'disabled' || busyProfile === profile.id" class="inline-flex min-h-[var(--talos-touch-target)] items-center justify-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] border px-[var(--talos-space-inline)] text-xs font-semibold disabled:opacity-50" :class="controller.selectedModelId.value === profile.id ? 'border-[var(--talos-accent)] bg-[var(--talos-active)] text-[var(--talos-text)]' : 'border-[var(--talos-border)] text-[var(--talos-muted)]'" @click="run(profile.id, () => controller.selectModel(profile.id))">
                        <Sparkles class="size-[var(--talos-icon-size)]" aria-hidden="true" /> {{ controller.selectedModelId.value === profile.id ? $t('models.default') : $t('models.useModel') }}
                    </button>
                    <button type="button" role="switch" :aria-checked="profile.show_in_composer" :aria-label="$t('models.showInComposer', { name: profile.display_name })" :disabled="profile.status === 'disabled' || busyProfile === profile.id" class="inline-flex min-h-[var(--talos-touch-target)] items-center justify-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-inline)] text-xs font-semibold text-[var(--talos-muted)] disabled:opacity-50" @click="run(profile.id, () => controller.setModelVisibility(profile.id, !profile.show_in_composer))">
                        <Eye v-if="profile.show_in_composer" class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                        <EyeOff v-else class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                        {{ profile.show_in_composer ? $t('models.inComposer') : $t('models.hidden') }}
                    </button>
                    <button type="button" :aria-label="$t('models.testCompletionFor', { name: profile.display_name })" :disabled="profile.status === 'disabled' || busyProfile === profile.id" class="col-span-2 inline-flex min-h-[var(--talos-touch-target)] items-center justify-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-inline)] text-xs font-semibold text-[var(--talos-text)] disabled:opacity-50" @click="run(profile.id, () => controller.probeModel(profile.id))">
                        <Gauge class="size-[var(--talos-icon-size)]" aria-hidden="true" /> {{ busyProfile === profile.id ? $t('models.testing') : $t('models.testCompletion') }}
                    </button>
                </div>

                <details class="mt-[var(--talos-space-section)] border-t border-[var(--talos-border)] pt-[var(--talos-space-inline)]">
                    <summary class="cursor-pointer text-xs font-medium text-[var(--talos-muted)]">{{ $t('models.displayName') }}</summary>
                    <div class="mt-[var(--talos-space-inline)] flex min-w-0 gap-[var(--talos-space-inline)]">
                        <input v-model="displayDrafts[profile.id]" type="text" maxlength="255" :aria-label="$t('models.displayNameFor', { name: profile.display_name })" class="h-[var(--talos-touch-target)] min-w-0 flex-1 rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-input)] px-[var(--talos-space-inline)] text-sm text-[var(--talos-text)]">
                        <button type="button" :aria-label="$t('models.saveDisplayNameFor', { name: profile.display_name })" :disabled="busyProfile === profile.id" class="h-[var(--talos-touch-target)] rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] px-[var(--talos-space-control)] text-xs font-semibold text-[var(--talos-accent-text)] disabled:opacity-50" @click="saveDisplayName(profile.id)">{{ $t('common.save') }}</button>
                    </div>
                </details>
            </article>
        </div>
        <p v-else class="rounded-[var(--talos-radius-card)] border border-dashed border-[var(--talos-border)] p-[var(--talos-space-page)] text-center text-sm text-[var(--talos-muted)]">
            {{ $t('models.noMatches') }}
        </p>
    </div>
</template>

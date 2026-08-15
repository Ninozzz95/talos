<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTalosI18n } from '@/i18n'
import { talosTranslatableErrorMessage } from '@/i18n/uiErrors'
import { Search } from '@lucide/vue'
import TalosMobileCatalogProfileRow from '@/components/talos/models/TalosMobileCatalogProfileRow.vue'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import { TALOS_MOBILE_PROVIDERS } from '@/lib/mobileProviders'
import {
    talosInitialModelLimit,
    talosNextModelLimit,
    talosVisibleModelProfiles,
} from '@/lib/models/progressiveModelList'
import { useChatController } from '@/stores/chatController'

const controller = useChatController()
const { t } = useTalosI18n()
const search = ref('')
const providerFilter = ref('')
const visibleLimit = ref(talosInitialModelLimit())
const busyProfile = ref<string | null>(null)
const error = ref('')
const providerItems = TALOS_MOBILE_PROVIDERS
    .filter((provider) => provider.id !== 'unknown' && provider.configurable)
    .map((provider) => ({ value: provider.id, label: provider.label }))

const filteredProfiles = computed(() => {
    const needle = search.value.trim().toLocaleLowerCase()
    return controller.profiles.value.filter((profile) => {
        if (providerFilter.value && profile.provider !== providerFilter.value) return false
        if (!needle) return true
        return [profile.display_name, profile.model, profile.provider]
            .some((value) => value.toLocaleLowerCase().includes(needle))
    })
})

const visibleProfiles = computed(() => talosVisibleModelProfiles(filteredProfiles.value, visibleLimit.value))
const canLoadMore = computed(() => visibleProfiles.value.length < filteredProfiles.value.length)

watch([search, providerFilter], () => {
    visibleLimit.value = talosInitialModelLimit()
})

function loadMore(): void {
    visibleLimit.value = talosNextModelLimit(visibleLimit.value, filteredProfiles.value.length)
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

async function saveDisplayName(profileId: string, displayName: string): Promise<void> {
    await run(profileId, () => controller.setModelDisplayName(profileId, displayName))
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
            <span role="status">{{ $t('models.catalogCount', { shown: visibleProfiles.length, total: controller.profiles.value.length }) }}</span>
            <span>{{ $t('models.metadataSeparation') }}</span>
        </div>

        <p v-if="error" role="alert" class="rounded-[var(--talos-radius-control)] border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-[var(--talos-space-control)] text-sm text-[var(--talos-text)]">{{ error }}</p>

        <div v-if="filteredProfiles.length" class="grid min-w-0 gap-[var(--talos-space-section)] lg:grid-cols-2">
            <TalosMobileCatalogProfileRow
                v-for="profile in visibleProfiles"
                :key="profile.id"
                :profile="profile"
                :selected="controller.selectedModelId.value === profile.id"
                :busy="busyProfile === profile.id"
                @select="(profileId) => run(profileId, () => controller.selectModel(profileId))"
                @toggle-visibility="(profileId, visible) => run(profileId, () => controller.setModelVisibility(profileId, visible))"
                @probe="(profileId) => run(profileId, () => controller.probeModel(profileId))"
                @save-display-name="saveDisplayName"
            />
        </div>
        <button
            v-if="canLoadMore"
            type="button"
            data-testid="talos-model-catalog-load-more"
            class="flex min-h-touch w-full items-center justify-center rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-panel)] px-[var(--talos-space-control)] text-sm font-semibold text-[var(--talos-text)]"
            @click="loadMore"
        >
            {{ $t('common.loadMore') }}
        </button>
        <p v-if="!filteredProfiles.length" class="rounded-[var(--talos-radius-card)] border border-dashed border-[var(--talos-border)] p-[var(--talos-space-page)] text-center text-sm text-[var(--talos-muted)]">
            {{ $t('models.noMatches') }}
        </p>
    </div>
</template>
